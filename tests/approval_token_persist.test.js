// r86 APPROVAL-TOKEN PERSISTENCE — red-then-green reproduction of the Q-2071 bug:
// a proposal "Approve Proposal" link whose token was minted into the email but never written to
// the cloud, so the customer's click found no quote ("Proposal Not Found"). The real handlers mint
// the token as a side effect of a successful in-app Mailgun send only; r86 persists it the moment a
// link is generated (openEmailQuoteModal / copyPortalLink), via _ensureApprovalToken, so the portal
// ALWAYS resolves — including when the proposal is copied out and sent from Outlook.
//
// This slices the REAL token helpers out of js/quotes.js and runs them against the fake Supabase
// client, then performs the EXACT portal lookup (select * where approval_token = token).
const fs = require('fs');
const { makeFakeSupabase } = require('./fake_supabase.js');

const src = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
const start = src.indexOf('function _generateToken(');
const end   = src.indexOf('async function copyPortalLink(');
if (start < 0 || end < 0) { console.log('✗ could not locate token helpers in quotes.js'); process.exit(1); }
const BLOCK = src.slice(start, end);

let pass = 0, fail = 0;
function ok(n, got, want){ if (JSON.stringify(got)===JSON.stringify(want)){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n+'\n      got '+JSON.stringify(got)+'  want '+JSON.stringify(want)); } }
function okTruthy(n, got){ if (got){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n+'  (expected truthy, got '+JSON.stringify(got)+')'); } }

// The EXACT query portal.html runs on load. Fake client resolves synchronously via its thenable.
function portalFind(sb, tok){
  var out = { data:null, error:null };
  sb.from('quotes').select('*, quote_line_items(*)').eq('approval_token', tok).single().then(function(r){ out = r; }, function(e){ out = { data:null, error:e }; });
  return out.data;
}

console.log('── r86 approval-token persistence (portal link always resolves) ──');

// Harness globals the sliced helpers close over.
var _sb, _currentUser, DB, _saveDBCalls;
function saveDB(){ _saveDBCalls++; }
eval(BLOCK);   // defines _generateToken, _ensureApprovalToken, _persistApprovalTokenCloud

function freshWorld(savedToken){
  _saveDBCalls = 0;
  _currentUser = { id:'user-joe' };
  // Cloud starts with the Q-2071 row carrying NO token (exactly the live state we observed).
  _sb = makeFakeSupabase({ quotes: [ { id:'q2071', quote_number:'Q-2071', approval_token:null, status:'Sent' } ] });
  // Local saved quote (what DB.quotes holds in the app).
  DB = { quotes: [ { id:'q2071', num:'Q-2071', approvalToken: (savedToken||null) } ] };
}

// 1) RED — reproduce the bug: token minted on an ephemeral object but NOT persisted (old path).
(function(){
  freshWorld();
  var ephemeral = { id:'q2071', num:'Q-2071' };
  ephemeral.approvalToken = _generateToken();          // mimics buildEmailBodyHTML minting into the link
  var hit = portalFind(_sb, ephemeral.approvalToken);  // customer clicks
  ok('RED: un-persisted token → portal finds NO quote (the Q-2071 404)', hit, null);
})();

// 2) GREEN — _ensureApprovalToken persists it; the same click now resolves.
(function(){
  freshWorld();
  var q = { id:'q2071', num:'Q-2071' };
  var tok = _ensureApprovalToken(q);
  okTruthy('GREEN: a token was produced', !!tok && tok === q.approvalToken);
  var hit = portalFind(_sb, tok);
  okTruthy('GREEN: portal lookup by the link token now FINDS the quote', !!hit);
  ok('GREEN: it is the right quote', hit && hit.quote_number, 'Q-2071');
  ok('GREEN: cloud row token == the link token', hit && hit.approval_token, tok);
  ok('GREEN: token mirrored onto the local saved quote (so sync carries it)', DB.quotes[0].approvalToken, tok);
  okTruthy('GREEN: saveDB was called to persist the local mirror', _saveDBCalls >= 1);
})();

// 3) STABLE/IDEMPOTENT — a re-send reuses the same token (never breaks a link already emailed).
(function(){
  freshWorld();
  var q1 = { id:'q2071', num:'Q-2071' };
  var t1 = _ensureApprovalToken(q1);
  var q2 = { id:'q2071', num:'Q-2071' };               // fresh form object, no token (getQData case)
  var t2 = _ensureApprovalToken(q2);
  ok('STABLE: second generation reuses the first token', t2, t1);
  okTruthy('STABLE: portal still resolves after a re-send', !!portalFind(_sb, t2));
  ok('STABLE: cloud still carries exactly one token value', _sb._rows('quotes')[0].approval_token, t1);
})();

// 4) REUSE EXISTING — saved quote already had a token; we persist THAT one, not a new one.
(function(){
  freshWorld('T-already-on-saved');
  var q = { id:'q2071', num:'Q-2071' };
  var tok = _ensureApprovalToken(q);
  ok('REUSE: keeps the quote\'s existing token', tok, 'T-already-on-saved');
  ok('REUSE: cloud row got the existing token written to it', _sb._rows('quotes')[0].approval_token, 'T-already-on-saved');
  okTruthy('REUSE: portal resolves by the existing token', !!portalFind(_sb, 'T-already-on-saved'));
})();

// 5) MATCH BY NUMBER — ephemeral quote lacks id but has num; still persisted to the right row.
(function(){
  freshWorld();
  var q = { num:'Q-2071' };                            // no id (older form object)
  var tok = _ensureApprovalToken(q);
  okTruthy('BY-NUM: token produced for an id-less form quote', !!tok);
  ok('BY-NUM: persisted to the matching row via its saved id', _sb._rows('quotes')[0].approval_token, tok);
  okTruthy('BY-NUM: portal resolves', !!portalFind(_sb, tok));
})();

// 6) OFFLINE / logged-out — no crash, token still assigned locally for when sync runs later.
(function(){
  freshWorld();
  _currentUser = null;                                 // not signed in → no cloud write
  var q = { id:'q2071', num:'Q-2071' };
  var tok;
  var threw = false;
  try { tok = _ensureApprovalToken(q); } catch(e){ threw = true; }
  ok('OFFLINE: did not throw', threw, false);
  okTruthy('OFFLINE: token still assigned locally (sync pushes it later)', !!tok && DB.quotes[0].approvalToken === tok);
  ok('OFFLINE: no cloud write attempted while logged out', _sb._rows('quotes')[0].approval_token, null);
})();

console.log((fail===0 ? '✅' : '❌') + ' approval-token persistence: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
