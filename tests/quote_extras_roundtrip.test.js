// r33 (QUOTES F1): the fields that used to vanish from a quote now travel in `quote_extras`.
// Verifies the REAL _quoteExtras (push) + _applyQuoteExtras (pull) from auth.js round-trip every
// field, and that a legacy row with no quote_extras loads safe defaults (no crash, no garbage).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _quoteExtras(');
const endMark = '  return target;\n}';
const end = src.indexOf(endMark, start);
if (start < 0 || end < 0) { console.log('✗ could not locate _quoteExtras/_applyQuoteExtras in auth.js'); process.exit(1); }
eval(src.slice(start, end + endMark.length));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

// A fully-loaded quote — exactly the content that used to be dropped on a cloud-wins sync.
var q = {
  equipmentRows: [{_id:1, name:'4K Dome Camera', qty:6, cost:220}, {_id:2, name:'NVR 16ch', qty:1, cost:900}],
  equipmentCost: 2220,
  perDiem: { men:3, days:4, rate:68, rooms:2, nights:3, lodgingRate:139, travelDesc:'2 trucks', trips:2, travelRate:0.67 },
  perDiemCost: 1540.25,
  svcContract: { label:'Gold', annual:1200, term:3, includes:['24/7 monitoring','2 PMs/yr'] },
  discountType: 'pct',
  discountValue: 10,
  execSummary: '<p>Custom <b>executive</b> summary for Katalyst.</p>',
  sentDate: '2026-10-20',
  wonDate: '2026-10-28'
};

// push → cloud row → pull
var bundle = _quoteExtras(q);
var restored = _applyQuoteExtras({}, { quote_extras: bundle });

ok('equipmentRows survive', restored.equipmentRows, q.equipmentRows);
ok('equipmentCost survives', restored.equipmentCost, q.equipmentCost);
ok('perDiem detail survives', restored.perDiem, q.perDiem);
ok('perDiemCost survives', restored.perDiemCost, q.perDiemCost);
ok('svcContract survives', restored.svcContract, q.svcContract);
ok('discountType survives (pct, not lost)', restored.discountType, 'pct');
ok('discountValue survives', restored.discountValue, 10);
ok('execSummary override survives', restored.execSummary, q.execSummary);
ok('sentDate survives', restored.sentDate, '2026-10-20');
ok('wonDate survives (won-revenue dates)', restored.wonDate, '2026-10-28');

// legacy row with NO quote_extras → safe defaults, never crashes
var legacy = _applyQuoteExtras({}, { id:'old', quote_number:'Q-1' });
ok('legacy: equipmentRows → []', legacy.equipmentRows, []);
ok('legacy: perDiem → null', legacy.perDiem, null);
ok('legacy: discountType → amt', legacy.discountType, 'amt');
ok('legacy: discountValue → 0', legacy.discountValue, 0);
ok('legacy: execSummary → ""', legacy.execSummary, '');
ok('legacy: wonDate → null', legacy.wonDate, null);

// null/undefined row → no throw
var nullrow = _applyQuoteExtras({}, null);
ok('null row → safe defaults', nullrow.equipmentRows, []);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
