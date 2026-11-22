// r109 — per-quote toggle: show equipment (rental + delivery) as its OWN line on the client
// Pricing Summary ("Equipment Rental & Delivery"), or fold it into "Equipment & Materials".
// Presentation only: the two rows always sum to the same materialSell, so Subtotal/Total never move.
// Legacy quotes (no equipSeparateLine) must render exactly as before (folded/combined).
const fs = require('fs');
const core = fs.readFileSync(__dirname + '/../js/core.js',    'utf8');
const rep  = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const auth = fs.readFileSync(__dirname + '/../js/auth.js',    'utf8');
const q    = fs.readFileSync(__dirname + '/../js/quotes.js',  'utf8');
const html = fs.readFileSync(__dirname + '/../index.html',    'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r109 equipment summary-line toggle (presentation only) ──');

// ---- editor control (core.js) ----
ok('core.js has getEquipSeparateLine (reads #qq-eq-sepline === "1")',
   /function getEquipSeparateLine\(\)[\s\S]{0,140}qq-eq-sepline[\s\S]{0,60}value === '1'/.test(core));
ok('core.js has setEquipSeparateLine + refreshEquipLineUI',
   /function setEquipSeparateLine\(on\)/.test(core) && /function refreshEquipLineUI\(\)/.test(core));
ok('setEquipSeparateLine writes the hidden input and marks dirty',
   /function setEquipSeparateLine\(on\)[\s\S]{0,200}qq-eq-sepline[\s\S]{0,160}setQQDirty/.test(core));
ok('refreshEquipLineUI toggles the two pill buttons by state',
   /eqline-combined-btn[\s\S]{0,120}classList\.toggle\('active', !on\)/.test(core) &&
   /eqline-separate-btn[\s\S]{0,120}classList\.toggle\('active', on\)/.test(core));

// ---- UI (index.html) ----
ok('equipment card has the #qq-eq-sepline hidden input (default off)', /<input type="hidden" id="qq-eq-sepline" value="0">/.test(html));
ok('two presentation buttons call setEquipSeparateLine(false|true)',
   /id="eqline-combined-btn"[^>]*onclick="setEquipSeparateLine\(false\)"/.test(html) &&
   /id="eqline-separate-btn"[^>]*onclick="setEquipSeparateLine\(true\)"/.test(html));

// ---- plumbing (reports.js) ----
ok('getQData emits equipSeparateLine', /equipSeparateLine: \(typeof getEquipSeparateLine==='function'\)/.test(rep));
ok('editQuote hydrates qq-eq-sepline + refreshes', /setV\('qq-eq-sepline', q\.equipSeparateLine \? '1' : '0'\)[\s\S]{0,120}refreshEquipLineUI/.test(rep));
ok('clearQQ resets qq-eq-sepline to off', /qq-eq-sepline'\); if \(_esEl\) _esEl\.value = '0'/.test(rep));
ok('qqFieldIds round-trips qq-eq-sepline in the local draft', /'eq-delivery','qq-eq-sepline'\];/.test(rep));

// ---- sync (auth.js) ----
ok('_quoteExtras carries equipSeparateLine', /equipSeparateLine: !!q\.equipSeparateLine/.test(auth));
ok('_applyQuoteExtras restores it (legacy -> false)', /target\.equipSeparateLine = !!x\.equipSeparateLine/.test(auth));

// ---- client proposal (quotes.js) ----
ok('Pricing Summary carves equipment out only when toggled + equipment>0',
   /if \(q\.equipSeparateLine && _eq > 0\) \{/.test(q));
ok('separate mode renders a dedicated Equipment Rental & Delivery row', /Equipment Rental &amp; Delivery<\/td>/.test(q));
ok('separate mode shows the remaining Materials row', /<td>Materials<\/td>/.test(q));
ok('folded (default) mode keeps the single Equipment & Materials row', /<td>Equipment &amp; Materials<\/td>/.test(q));
ok('equipment line uses q.equipmentCost (rental + delivery already folded in)', /var _eq = parseFloat\(q\.equipmentCost\)\|\|0;/.test(q));

// ================= TEETH =================
// The two carved rows always sum back to the single folded line (_mat = materialSell), so the
// Subtotal is identical whether equipment is folded or broken out. Replicate the exact render math.
(function(){
  function rows(materialSell, equipmentCost, separate){
    var _mat = materialSell;
    var _eq = equipmentCost;
    if (separate && _eq > 0) {
      var _matOnly = _mat - _eq;
      var out = [];
      if (_matOnly > 0) out.push({label:'Materials', amt:_matOnly});
      out.push({label:'Equipment Rental & Delivery', amt:_eq});
      return out;
    }
    return _mat > 0 ? [{label:'Equipment & Materials', amt:_mat}] : [];
  }
  function sum(rs){ return rs.reduce(function(s,r){ return s + r.amt; }, 0); }

  // No-margin example: materials $1,000 + equip $1,230 => materialSell $2,230.
  var folded   = rows(2230, 1230, false);
  var separate = rows(2230, 1230, true);
  ok('TEETH: folded = one line of $2,230', folded.length===1 && folded[0].amt===2230);
  ok('TEETH: separate = Materials $1,000 + Equipment $1,230', separate.length===2 && separate[0].amt===1000 && separate[1].amt===1230);
  ok('TEETH: both presentations sum to the SAME subtotal ($2,230)', sum(folded) === sum(separate) && sum(separate) === 2230);

  // Margin-mode example: materialSell grossed to $3,767.31, equipment cost raw $1,230.
  var fM = rows(3767.31, 1230, false), sM = rows(3767.31, 1230, true);
  ok('TEETH: margin mode still reconciles (equipment at cost, materials absorbs its margin)',
     Math.abs(sum(fM) - sum(sM)) < 1e-9 && Math.abs(sum(sM) - 3767.31) < 1e-9);

  // Equipment-only quote (no line items): materialSell === equipmentCost => no negative Materials row.
  var eqOnly = rows(900, 900, true);
  ok('TEETH: equipment-only quote shows just the equipment line (no negative Materials)',
     eqOnly.length===1 && eqOnly[0].label==='Equipment Rental & Delivery' && eqOnly[0].amt===900);

  // Toggle OFF or no equipment => never a separate line.
  ok('TEETH: no equipment => folded single line regardless of toggle',
     rows(1000, 0, true).length===1 && rows(1000,0,true)[0].label==='Equipment & Materials');
  ok('TEETH: legacy/undefined toggle falls through to folded', rows(2230, 1230, undefined).length===1);
})();

console.log((fail===0?'✅':'❌')+' equipment summary-line toggle: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
