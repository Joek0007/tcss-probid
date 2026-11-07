// r89 DURABLE NOTIFICATIONS — proposal approvals / change requests must post to the shared,
// cross-device wt_notifications bell feed (server-side, via the DB trigger), NOT the old
// browser-local, first-run-suppressed check that silently missed Q-2058. This guards that the
// fragile local path stays retired so it can't be reintroduced or double-post.
const fs = require('fs');
const core = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r89 durable notifications (local approval bell retired) ──');

// Isolate the _checkQuoteApprovals function body.
var m = core.match(/function _checkQuoteApprovals\(\)\s*\{[\s\S]*?\n\}/);
ok('_checkQuoteApprovals exists', !!m);
if (m){
  var body = m[0];
  ok('it no longer fires the local addNotification path', !/addNotification\s*\(/.test(body));
  ok('it no longer uses the fragile per-browser "seen" map', !/tcss_approval_seen/.test(body));
  ok('it is neutralized to a no-op (early return)', /\{\s*(\/\/[^\n]*\n\s*)*return;\s*\}/.test(body.replace(/\r/g,'')) || /return;\s*\n\}/.test(body));
  ok('it documents the durable trigger as the source of truth', /wt_notifications|trg_notify_office_bell_on_approval/.test(body));
}

// The durable feed reader/writer must still exist (we rely on it, didn't remove it).
const wt = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');
ok('durable feed reader wtLoadNotifications still present', /function wtLoadNotifications\(\)/.test(wt));
ok('durable feed persists read-state to the cloud', /wt_notifications'\)\.update\(\{\s*read:\s*true\s*\}\)/.test(wt));

console.log((fail===0?'✅':'❌')+' durable notifications: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
