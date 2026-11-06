// Phase 1 proposal e-signature — static-invariant guard on portal.html (node/CI-safe; the full
// functional proof runs in the browser against a stubbed Supabase, see scratch portal_test.js and
// the staging browser job). These assertions lock the invariants that make the signed approval
// correct and resilient:
//   • the quote is flipped to Won FIRST (business record survives even if the signature write fails)
//   • the signature record is gated by approval_token and carries the PNG + consent + total-at-time
//   • the approve button is gated on name + consent + a signature
//   • an expired proposal can never be approved
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../portal.html', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── Phase 1 portal e-signature invariants ──');

// Capture UI present
ok('draw/type signature tabs present', /id="tab-draw"/.test(src) && /id="tab-type"/.test(src));
ok('signature canvas present', /id="sig-pad"/.test(src));
ok('consent checkbox present', /id="consent"/.test(src));
ok('initSignature wired into loadPortal', /show\('state-proposal'\);\s*\n\s*initSignature\(\);/.test(src));

// Gate logic requires name + consent + a signature; expired blocks
ok('approve gate checks consent', /_updateApproveGate[\s\S]{0,400}consent\s*&&\s*_sigReady\(\)/.test(src));
ok('approve gate honors expiry', /_updateApproveGate[\s\S]{0,200}window\._portalExpired/.test(src));
ok('approveQuote bails on expired', /function approveQuote[\s\S]{0,200}window\._portalExpired\)\s*return/.test(src));

// Quote-FIRST write, then the signature record (resilience)
const qUpd = src.indexOf("from('quotes').update");
const aIns = src.indexOf("from('quote_approvals').insert");
ok('quote update + approval insert both present', qUpd > -1 && aIns > -1);
ok('quote is flipped BEFORE the signature record is written', qUpd > -1 && aIns > -1 && qUpd < aIns);

// Quote update carries the approval + the captured context
ok('quote update sets status Won + approved', /status:\s*'Won'[\s\S]{0,200}approval_status:\s*'approved'|approval_status:\s*'approved'[\s\S]{0,200}status:\s*'Won'/.test(src));
ok('quote update stamps method/device/total-at-time', /approval_method:\s*method[\s\S]{0,200}approval_total_at_time:\s*totalAtTime/.test(src));

// Signature record is token-gated and complete
ok('approval row carries approval_token (RLS gate)', /insert\(\{[\s\S]{0,300}approval_token:\s*_quoteData\.approval_token/.test(src));
ok('approval row carries the signature PNG', /signature_png:\s*png/.test(src));
ok('approval row records consent + consent_text', /consent:\s*true,\s*consent_text:\s*CONSENT_TEXT/.test(src));
ok('approval row records total_at_time', /total_at_time:\s*totalAtTime/.test(src));

// Signature-insert failure must NOT fail the approval (best-effort)
ok('signature insert is best-effort (try/catch, logged)', /signature record insert failed[\s\S]{0,0}|\[portal\] signature record insert/.test(src) && /try\s*\{[\s\S]{0,400}quote_approvals'\)\.insert/.test(src));

// Change-request path also audited
ok('change request writes an audit row', /action:\s*'changes_requested'/.test(src));

// device label is a pure helper we can exercise
const m = src.match(/function _deviceLabel\(\)\{[\s\S]*?return br \+ ' on ' \+ os;\s*\}/);
ok('_deviceLabel is sliceable', !!m);
if (m){
  let navigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604' };
  let _deviceLabel; eval(m[0].replace('function _deviceLabel', '_deviceLabel = function'));
  ok('_deviceLabel maps iPhone Safari', _deviceLabel() === 'Safari on iPhone');
}

console.log((fail===0?'✅':'❌')+' portal e-signature invariants: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
