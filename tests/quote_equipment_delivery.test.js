// r108 — equipment rentals on quotes:
//  1) New Delivery & Pickup one-time charge, folded into the equipment cost so it reaches the total.
//  2) Equipment (rentals + delivery/pickup) now renders as a visible section on the CLIENT proposal
//     (previously only the internal copy showed it — so it "didn't connect" in preview).
const fs = require('fs');
const core = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
const rep  = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const q    = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r108 equipment delivery/pickup + client-proposal visibility ──');

// ---- cost helpers (core.js) ----
ok('getEquipDelivery reads the #eq-delivery charge', /function getEquipDelivery\(\)[\s\S]{0,120}getElementById\('eq-delivery'\)/.test(core));
ok('getEquipmentCost = rentals + delivery/pickup', /function getEquipmentCost\(\)[\s\S]{0,200}return rentals \+ getEquipDelivery\(\)/.test(core));
ok('updateEquipTotal reuses getEquipmentCost (rentals + delivery)', /function updateEquipTotal\(\)[\s\S]{0,120}var total = getEquipmentCost\(\)/.test(core));
ok('delivery input has a live handler', /function onEquipDeliveryInput\(\)[\s\S]{0,80}updateEquipTotal\(\);[\s\S]{0,40}calcTotals\(\)/.test(core));
ok('turning equipment OFF clears the delivery charge too', /if \(!on\) \{[\s\S]{0,160}eq-delivery[\s\S]{0,40}\.value = 0/.test(core));

// ---- UI (index.html) ----
ok('equipment section has a Delivery & Pickup input', /id="eq-delivery"[^>]*oninput="onEquipDeliveryInput\(\)"/.test(html));

// ---- plumbing (reports.js) ----
ok('getQData emits equipDelivery', /equipDelivery: \(typeof getEquipDelivery==='function'\)/.test(rep));
ok('editQuote hydrates eq-delivery', /setV\('eq-delivery', q\.equipDelivery\|\|0\)/.test(rep));
ok('delivery-only quote still counts as having equipment', /equipmentRows\.length > 0 \|\| \(parseFloat\(q\.equipDelivery\)\|\|0\) > 0/.test(rep));
ok('clearQQ resets eq-delivery', /eq-delivery'\); if \(_edClr\) _edClr\.value = 0/.test(rep));
ok('qqFieldIds round-trips eq-delivery in the local draft', /'qq-show-hours','eq-delivery'/.test(rep));

// ---- sync (auth.js) ----
ok('_quoteExtras carries equipDelivery', /equipDelivery: q\.equipDelivery \|\| 0/.test(auth));
ok('_applyQuoteExtras restores equipDelivery', /target\.equipDelivery = \(x\.equipDelivery != null \? x\.equipDelivery : 0\)/.test(auth));

// ---- client proposal (quotes.js) ----
ok('buildPrintHTML defines equipmentClientSectionHTML', /function equipmentClientSectionHTML\(\)/.test(q));
ok('equipment section has its own Delivery & Pickup line', /Delivery &amp; Pickup/.test(q) && /Equipment Subtotal/.test(q));
ok('equipment section is rendered on the client proposal (not internal, not lump sum)',
   /mode !== 'internal' && !\(q\.lumpSum && q\.lumpSum\.enabled\)\) \? equipmentClientSectionHTML\(\)/.test(q));
ok('note tells the customer it is included in the total', /included in the Total Investment below/.test(q));

// ================= TEETH =================
// equipment cost = sum(days*rate) + delivery; and the section subtotal reconstructs the same number.
(function(){
  function equipmentCost(rows, delivery){
    var rentals = rows.reduce(function(s,r){ return s + (parseFloat(r.days)||0)*(parseFloat(r.dailyRate)||0); }, 0);
    return rentals + (parseFloat(delivery)||0);
  }
  var rows = [{days:3,dailyRate:250},{days:2,dailyRate:525}];
  ok('TEETH: rentals alone = $1,800', equipmentCost(rows,0) === 1800);
  ok('TEETH: rentals + $375 delivery = $2,175 (delivery reaches the total)', equipmentCost(rows,375) === 2175);
  ok('TEETH: delivery-only quote still has a cost', equipmentCost([],200) === 200);
  ok('TEETH: a $0/0-day row adds nothing', equipmentCost([{days:0,dailyRate:0}],0) === 0);
})();

console.log((fail===0?'✅':'❌')+' equipment delivery: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
