// r88 OFFICE-SIDE signed-approval view — the Quote Details modal shows the customer's signature +
// audit. This slices the REAL _loadSignedApproval/_saRow out of js/quotes.js and runs them against
// the fake Supabase client with a minimal DOM shim, asserting the panel renders the right content
// and filters to THIS quote only.
const fs = require('fs');
const { makeFakeSupabase } = require('./fake_supabase.js');
const src = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r88 office signed-approval view ──');

// Static wiring: viewQuote appends the panel + kicks off the load; the loader reads the right table.
ok('viewQuote appends the signed-approval panel', /<div id="signed-approval-panel"><\/div>/.test(src));
ok('viewQuote calls _loadSignedApproval(id)', /openModal\('modal-view-quote'\);\s*\n\s*_loadSignedApproval\(id\);/.test(src));
ok('loader reads quote_approvals by quote_id', /from\('quote_approvals'\)\.select\('\*'\)\.eq\('quote_id',\s*quoteId\)/.test(src));

// Functional: run the real render logic.
const start = src.indexOf('function _saRow(');
const end   = src.indexOf('// ---- MODAL HELPERS ----');
if (start < 0 || end < 0) { console.log('✗ could not slice _loadSignedApproval'); process.exit(1); }
const BLOCK = src.slice(start, end);

var panel = { innerHTML:'' };
global.document = { getElementById: function(id){ return id==='signed-approval-panel' ? panel : null; } };
function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n){ return '$'+(parseFloat(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function pct(n){ return (parseFloat(n)||0)+'%'; }
var _currentUser = { id:'u' };
var _sb = makeFakeSupabase({ quote_approvals: [
  { id:'a1', quote_id:'q1', action:'approved', signer_name:'Lietty Betancourt', method:'draw',
    signature_png:'data:image/png;base64,AAAA', consent:true, total_at_time:1203.16, margin_at_time:42.5,
    device:'Safari on iPhone', created_at:'2026-11-06T18:00:00Z' },
  { id:'c1', quote_id:'q1', action:'changes_requested', signer_name:'Lietty', note:'Can you add a 4th camera?',
    created_at:'2026-11-05T12:00:00Z' },
  { id:'x9', quote_id:'OTHER', action:'approved', signer_name:'Someone Else', method:'type',
    created_at:'2026-11-06T00:00:00Z' }
]});
eval(BLOCK);   // defines _saRow, _loadSignedApproval

(async () => {
  // 1) Approved draw signature + audit + change request, scoped to q1
  await _loadSignedApproval('q1');
  var h = panel.innerHTML;
  ok('renders the Signed Approval card', /✅ Signed Approval/.test(h));
  ok('renders the drawn signature image', /<img src="data:image\/png;base64,AAAA"/.test(h));
  ok('shows the signer name', /Lietty Betancourt/.test(h));
  ok('shows method = Drawn signature', /Drawn signature/.test(h));
  ok('shows consent agreed', /Agreed to e-signature/.test(h));
  ok('shows the total at approval', /Total at approval[\s\S]*\$1,203\.16/.test(h));
  ok('shows margin at approval', /Margin at approval[\s\S]*42\.5%/.test(h));
  ok('shows the device', /Safari on iPhone/.test(h));
  ok('renders the change request', /📝 Change Requests[\s\S]*Can you add a 4th camera\?/.test(h));
  ok('does NOT leak another quote\'s approval', !/Someone Else/.test(h));

  // 2) Empty case — a quote with no approvals renders nothing
  panel.innerHTML = 'STALE';
  await _loadSignedApproval('no-such-quote');
  ok('empty approvals → panel cleared (no stale content)', panel.innerHTML === '');

  // 3) Typed signature renders the name, not an <img>
  _sb = makeFakeSupabase({ quote_approvals: [
    { id:'t1', quote_id:'q2', action:'approved', signer_name:'Mario Esteban', method:'type', consent:true,
      total_at_time:500, created_at:'2026-11-06T10:00:00Z' } ]});
  await _loadSignedApproval('q2');
  ok('typed signature shows the name (no image)', /Mario Esteban/.test(panel.innerHTML) && !/<img/.test(panel.innerHTML));
  ok('typed method labeled Typed signature', /Typed signature/.test(panel.innerHTML));

  console.log((fail===0?'✅':'❌')+' office signed-approval view: '+pass+' passed, '+fail+' failed');
  process.exit(fail===0?0:1);
})();
