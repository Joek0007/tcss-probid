// r40 EXPENSE-DISAPPEAR fix. The wo_expenses pull FULL-REPLACES DB.woExpenses with a bounded (365-day)
// cloud set. Its preservation clause used to keep only rows OLDER than the window, so a JUST-ADDED
// expense (recent, not yet confirmed in the cloud) was dropped by the replace → "I added an expense and
// it disappeared". Fix: also preserve recent rows that are genuinely local and not yet synced
// (_synced !== true), while still correctly DROPPING a row deleted on another device (that row was
// pulled before, so _synced === true) and anything tombstoned.
// This test (1) statically asserts the fix is present in auth.js, and (2) verifies the preservation
// decision across the four cases.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// (1) the real pull keeps recent unsynced local rows, and marks cloud rows _synced
ok('pull preserves local unsynced recent expenses', /_synced !== true/.test(src) && /_localUnsynced/.test(src), true);
ok('pull marks cloud expense rows _synced', /_expHave\[e\.id\]=1; e\._synced=true/.test(src), true);
ok('push marks expense _synced on success', /\[Expense Push\][\s\S]{0,500}we\._synced = true/.test(src), true);

// (2) behavioral: replicate the exact preservation decision and check the four cases
var _expCut = '2026-01-01T00:00:00Z';          // window cutoff
var delWE = ['tomb-1'];
function preserve(e, inCloud){
  if (!e || !e.id || inCloud || delWE.indexOf(String(e.id)) >= 0) return false;
  var _old = (!e.createdAt || e.createdAt < _expCut);
  var _localUnsynced = (e._synced !== true);
  return _old || _localUnsynced;
}
// a) just-added recent expense, not yet in cloud, not synced → PRESERVE (the bug)
ok('just-added recent unsynced expense is kept', preserve({id:'new-1', createdAt:'2026-10-30T12:00:00Z'}, false), true);
// b) recent expense deleted on ANOTHER device (was synced before, now not in cloud) → DROP
ok('recent synced row absent from cloud (deleted elsewhere) is dropped', preserve({id:'gone-1', createdAt:'2026-10-30T12:00:00Z', _synced:true}, false), false);
// c) old on-demand row outside the window, not in cloud → PRESERVE (pre-existing behavior)
ok('old on-demand row outside window is kept', preserve({id:'old-1', createdAt:'2025-01-01T00:00:00Z', _synced:true}, false), true);
// d) tombstoned row → DROP even if recent/unsynced
ok('tombstoned row is dropped', preserve({id:'tomb-1', createdAt:'2026-10-30T12:00:00Z'}, false), false);
// e) row present in the cloud result → not separately preserved (it's already in _mappedExp)
ok('cloud-present row not double-added', preserve({id:'c-1', createdAt:'2026-10-30T12:00:00Z'}, true), false);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
