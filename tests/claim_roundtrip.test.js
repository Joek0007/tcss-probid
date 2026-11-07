// r92 CLAIM round-trip — a Needs Action "Claim" (who's handling it) must survive sync. It rides the
// existing quote_extras jsonb bundle (no schema change), so it round-trips through the ONE place that
// defines that bundle: _quoteExtras (push) / _applyQuoteExtras (pull). This slices those real helpers
// out of js/auth.js and proves claimedBy/claimedAt survive, and that an unclaimed quote stays null.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const s = src.indexOf('function _quoteExtras(q){');
const rt = src.indexOf('return target;', s);
const e = src.indexOf('\n}', rt) + 2;
if (s < 0 || rt < 0) { console.log('✗ could not slice quote_extras helpers'); process.exit(1); }
eval(src.slice(s, e));   // defines _quoteExtras, _applyQuoteExtras

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r92 claim round-trip (rides quote_extras) ──');

var q = { claimedBy:'Dawn Brown', claimedAt:'2026-11-07T10:00:00Z', equipmentRows:[], selectedSystems:[] };
var extras = _quoteExtras(q);
ok('claimedBy packed into quote_extras', extras.claimedBy === 'Dawn Brown');
ok('claimedAt packed into quote_extras', extras.claimedAt === '2026-11-07T10:00:00Z');

var target = {};
_applyQuoteExtras(target, { quote_extras: extras });
ok('claimedBy round-trips on pull', target.claimedBy === 'Dawn Brown');
ok('claimedAt round-trips on pull', target.claimedAt === '2026-11-07T10:00:00Z');

var unclaimed = {};
_applyQuoteExtras(unclaimed, { quote_extras: {} });
ok('unclaimed quote → claimedBy null', unclaimed.claimedBy === null);
ok('unclaimed quote → claimedAt null', unclaimed.claimedAt === null);

// existing extras still round-trip (didn't break the bundle)
var q2 = { equipmentCost: 900, wonDate: '2026-11-07', selectedSystems:['cameras'] };
var x2 = _quoteExtras(q2); var t2 = {}; _applyQuoteExtras(t2, { quote_extras: x2 });
ok('existing extras still round-trip (equipmentCost)', t2.equipmentCost === 900);
ok('existing extras still round-trip (wonDate)', t2.wonDate === '2026-11-07');

console.log((fail===0?'✅':'❌')+' claim round-trip: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
