// r106 — three Quotes-page fixes:
//  1) Tax rate accepts quarter points (.25/.50/.75) and shows TWO decimals (6.00% / 6.25% /
//     6.50% / 6.75%) on the proposal — was rounding to tenths. Margin pct() is left unchanged.
//  2) The Save/Total action bar is FIXED to the viewport bottom (always visible while scrolling).
//  (The discount $/% dropdown is working-as-intended; no code change — explained to the user.)
const fs = require('fs');
const core = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
const q    = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r106 tax precision + fixed action bar ──');

// ---- tax input allows two decimals ----
ok('tax input step is 0.01 (not .1)', /id="qq-tx"[^>]*step="0\.01"/.test(html) && !/id="qq-tx"[^>]*step="\.1"/.test(html));

// ---- a dedicated 2-decimal tax formatter; margin pct() untouched ----
ok('pctTax(n) formats to two decimals', /function pctTax\(n\) \{ return \(isFinite\(n\) \? Number\(n\)\.toFixed\(2\) : '0\.00'\) \+ '%'/.test(core));
ok('margin pct() left as one decimal (not globally changed)', /function pct\(n\) \{ return \(isFinite\(n\) \? n\.toFixed\(1\) : '0\.0'\) \+ '%'/.test(core));
ok('proposal pricing summary shows tax via pctTax', /Tax \(' \+ pctTax\(q\.taxRate\|\|0\)/.test(q));
ok('invoice tax lines use pctTax too', (q.match(/pctTax\(/g)||[]).length >= 3);

// TEETH: run the REAL pctTax from source — quarter-point rates read exactly as entered
(function(){
  var m = core.match(/function pctTax\(n\)\s*\{[\s\S]*?\}/);
  var pctTax = new Function('return (' + m[0] + ')')();
  ok('TEETH: pctTax(6)    === "6.00%"', pctTax(6)    === '6.00%');
  ok('TEETH: pctTax(6.25) === "6.25%"', pctTax(6.25) === '6.25%');
  ok('TEETH: pctTax(6.5)  === "6.50%"', pctTax(6.5)  === '6.50%');
  ok('TEETH: pctTax(6.75) === "6.75%"', pctTax(6.75) === '6.75%');
  ok('TEETH: non-finite is safe', pctTax(NaN) === '0.00%' && pctTax(undefined) === '0.00%');
  // the old bug: pct() rounded 6.25 -> "6.2%"/"6.3%"; pctTax keeps it exact
  var m2 = core.match(/function pct\(n\)\s*\{[\s\S]*?\}/);
  var pct = new Function('return (' + m2[0] + ')')();
  ok('TEETH: margin pct still one decimal (pct(35)==="35.0%")', pct(35) === '35.0%');
})();

// ---- action bar fixed to the viewport ----
ok('qq-sticky-bar is position:fixed (not sticky)',
   /\.qq-sticky-bar\{position:fixed;/.test(html) && !/\.qq-sticky-bar\{position:sticky/.test(html));
ok('fixed bar clears the sidebar via left:calc(var(--sidebar) + 20px)',
   /\.qq-sticky-bar\{position:fixed;left:calc\(var\(--sidebar\) \+ 20px\)/.test(html));
ok('the quote page reserves bottom space so content is not hidden behind the bar',
   /#page-qq\{padding-bottom:96px\}/.test(html));
ok('mobile keeps the bar above the bottom nav + safe area',
   /\.qq-sticky-bar\{left:14px;right:14px;bottom:calc\(72px \+ env\(safe-area-inset-bottom,0px\)\)\}/.test(html));

// ---- r107 discount $/% dropdown clarity ----
ok('discount type options read "$ off" / "% off" (not bare $ / %)',
   /<option value="amt">\$ off<\/option>/.test(html) && /<option value="pct">% off<\/option>/.test(html));
ok('discount type dropdown widened to fit the labels', /id="qq-disc-type"[^>]*width:78px/.test(html));
ok('discount values still map to amt/pct (behavior unchanged)',
   /value="amt"/.test(html) && /value="pct"/.test(html));

console.log((fail===0?'✅':'❌')+' tax + footer: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
