// r104 — proposal "Material + Labor" itemization. A per-quote presentation style
// ('combined' default | 'split' columns | 'summary' band) + a Show-install-hours toggle.
// It must change ONLY how line items read on the proposal, never the math or the totals, and
// legacy quotes (no itemStyle) must render exactly as before ('combined').
const fs = require('fs');
const q = fs.readFileSync(__dirname + '/../js/quotes.js',  'utf8');
const c = fs.readFileSync(__dirname + '/../js/core.js',    'utf8');
const r = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const a = fs.readFileSync(__dirname + '/../js/auth.js',    'utf8');

let pass=0, fail=0;
function ok(n,cond){ if(cond){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r104 material+labor itemization (presentation only) ──');

// ---- rendering wired in quotes.js ----
ok('quotes.js defines splitItemsSectionHTML(style)', /function splitItemsSectionHTML\(style\)/.test(q));
ok('quotes.js defines itemsSectionHTML()', /function itemsSectionHTML\(\)/.test(q));
ok('buildPrintHTML renders the items section via itemsSectionHTML()',
   /\/\/ EQUIPMENT & MATERIALS \+ LABOR[\s\S]{0,200}itemsSectionHTML\(\) \+/.test(q));
ok('default/lump-sum keep combined (backward compatible)',
   /var isLump = !!\(q\.lumpSum && q\.lumpSum\.enabled\);/.test(q) && /var style = isLump \? 'combined' : \(q\.itemStyle \|\| 'combined'\);/.test(q));
ok('split view adds a dedicated Install Labor column', /<th style="text-align:right">Install Labor<\/th>/.test(q));
ok('summary style renders the materials-vs-labor band',
   /if \(style === 'summary'\) \{/.test(q) && q.indexOf('Professional Installation')>=0 && /var band = /.test(q) && /return band \+ table;/.test(q));
ok('labor cells honor the Show-install-hours toggle', /var showHrs = !!q\.showLaborHours;/.test(q) && /showHrs && labor > 0/.test(q));
ok('split math reuses the same unitSell formula (no new pricing)',
   /_isMarkup \? mc\*\(1\+margin\) : \(margin < 1 \? mc\/\(1-margin\) : mc\)/.test(q));

// ---- editor controls in core.js ----
ok('core.js has getItemStyle / getShowLaborHours', /function getItemStyle\(\)/.test(c) && /function getShowLaborHours\(\)/.test(c));
ok('core.js has setItemStyle / toggleShowHours / refreshItemStyleUI',
   /function setItemStyle\(style\)/.test(c) && /function toggleShowHours\(\)/.test(c) && /function refreshItemStyleUI\(\)/.test(c));
ok('hours control is hidden while style is combined',
   /hoursRow\.style\.display = \(style === 'combined'\) \? 'none' : ''/.test(c));
ok('getItemStyle only accepts split|summary else combined',
   /\(v === 'split' \|\| v === 'summary'\) \? v : 'combined'/.test(c));

// ---- getQData / editQuote / draft / clear in reports.js ----
ok('getQData emits itemStyle + showLaborHours', /itemStyle: \(typeof getItemStyle==='function'\)/.test(r) && /showLaborHours: \(typeof getShowLaborHours==='function'\)/.test(r));
ok('editQuote hydrates the style + hours then refreshes the UI',
   /setV\('qq-item-style'[\s\S]{0,160}setV\('qq-show-hours'[\s\S]{0,120}refreshItemStyleUI/.test(r));
ok('qqFieldIds round-trips the two hidden inputs in the local draft',
   /'qq-item-style','qq-show-hours'/.test(r));
ok('clearQQ resets a fresh quote to combined / hours-off',
   /_isEl\.value = 'combined'[\s\S]{0,160}refreshItemStyleUI/.test(r));

// ---- sync bundle in auth.js ----
ok('_quoteExtras carries itemStyle (default combined) + showLaborHours',
   /itemStyle: \(q\.itemStyle === 'split' \|\| q\.itemStyle === 'summary'\) \? q\.itemStyle : 'combined'/.test(a) && /showLaborHours: !!q\.showLaborHours/.test(a));
ok('_applyQuoteExtras restores them (legacy -> combined)',
   /target\.itemStyle = \(x\.itemStyle === 'split' \|\| x\.itemStyle === 'summary'\) \? x\.itemStyle : 'combined'/.test(a) && /target\.showLaborHours = !!x\.showLaborHours/.test(a));

// ================= TEETH =================
// Replicate BOTH the current combined line-total math and the new split math and prove they are
// the same money — the split only relabels where the dollars sit, it never changes the total.
function unitSellOf(mc, margin, isMarkup){
  if(mc<=0) return 0;
  return isMarkup ? mc*(1+margin) : (margin<1 ? mc/(1-margin) : mc);
}
function combinedLine(it, margin, rate, isMarkup){            // current itemsTableHTML math
  return unitSellOf(it.mc,margin,isMarkup)*it.qty + it.qty*it.lh*rate;
}
function splitLine(it, margin, rate, isMarkup){               // new split math
  var matSell = unitSellOf(it.mc,margin,isMarkup)*it.qty;
  var labor   = it.qty*it.lh*rate;
  return {mat:matSell, lab:labor, line:matSell+labor};
}
var ITEMS = [
  {qty:12, mc:200, lh:1.35},   // material + labor
  {qty:1,  mc:900, lh:2.4},    // material + labor
  {qty:1,  mc:0,   lh:9.6}     // labor-only (programming) — mat should be 0
];
var MARGIN=0.35, RATE=100, MARKUP=false;

var combTot=0, matTot=0, labTot=0, allEqual=true;
ITEMS.forEach(function(it){
  var comb = combinedLine(it,MARGIN,RATE,MARKUP);
  var sp   = splitLine(it,MARGIN,RATE,MARKUP);
  if(Math.abs(comb - sp.line) > 1e-9) allEqual=false;
  combTot+=comb; matTot+=sp.mat; labTot+=sp.lab;
});
ok('TEETH: every split line (material+labor) equals the combined line total', allEqual);
ok('TEETH: materials + labor subtotals reconstruct the same grand total',
   Math.abs((matTot+labTot) - combTot) < 1e-9);
ok('TEETH: the labor-only item carries $0 material, all labor',
   splitLine(ITEMS[2],MARGIN,RATE,MARKUP).mat===0 && splitLine(ITEMS[2],MARGIN,RATE,MARKUP).lab===960);
ok('TEETH: material sell honors the margin (not raw cost)',
   Math.abs(splitLine(ITEMS[0],MARGIN,RATE,MARKUP).mat - (200/0.65*12)) < 1e-6);

// summary band percentage math
var labPct = Math.round(labTot/(matTot+labTot)*100);
ok('TEETH: summary split % = labor / (materials+labor)', labPct === Math.round(labTot/combTot*100) && labPct>0 && labPct<100);

// legacy resolver: an undefined style falls back to combined
function resolve(v){ return (v==='split'||v==='summary') ? v : 'combined'; }
ok('TEETH: legacy/undefined itemStyle resolves to combined', resolve(undefined)==='combined' && resolve('split')==='split' && resolve('x')==='combined');

// ---- r105 mutual exclusion with Lump Sum ----
ok('setItemStyle switches lump sum OFF when a Material+Labor style is chosen',
   /if \(style === 'split' \|\| style === 'summary'\) \{[\s\S]{0,220}lumpsum-toggle[\s\S]{0,140}lump\.checked = false/.test(c));
ok('toggleLumpSum snaps the style back to combined when lump sum turns ON',
   /if \(on\) \{[\s\S]{0,200}qq-item-style[\s\S]{0,90}= 'combined'/.test(c));

// TEETH: the mutual-exclusion state machine
(function(){
  var st = {lump:false, style:'combined'};
  function setStyle(s){ st.style = (s==='split'||s==='summary')?s:'combined'; if(st.style==='split'||st.style==='summary'){ if(st.lump) st.lump=false; } }
  function setLump(on){ st.lump=!!on; if(on) st.style='combined'; }
  setLump(true);
  ok('TEETH: turning lump ON forces style=combined', st.lump===true && st.style==='combined');
  setStyle('split');
  ok('TEETH: choosing split turns lump OFF', st.lump===false && st.style==='split');
  setLump(true);
  setStyle('summary');
  ok('TEETH: choosing summary turns lump OFF', st.lump===false && st.style==='summary');
  setLump(true); setStyle('combined');
  ok('TEETH: Combined coexists with lump (does not turn it off)', st.lump===true && st.style==='combined');
})();

console.log((fail===0?'✅':'❌')+' itemization style: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
