// r35 VERSION GATE: a browser on an out-of-date build must not write shared data. Verifies the REAL
// _auBuildNum (index.html, build comparison) and _writesBlocked (auth.js, the push guard), and the
// decision rule: block writes ONLY when a STRICTLY-NEWER build is live (never on equal/older/garbled,
// so a transient bad fetch can't wrongly freeze saving).
const fs = require('fs');

// --- _auBuildNum from index.html ---
var html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
var s1 = html.indexOf('function _auBuildNum(');
var e1 = html.indexOf('}', s1) + 1;
if (s1 < 0) { console.log('✗ _auBuildNum not found'); process.exit(1); }
eval(html.slice(s1, e1));

// --- _writesBlocked from auth.js ---
var auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
var s2 = auth.indexOf('function _writesBlocked(');
var endMark = 'catch(e){ return false; }\n}';
var e2 = auth.indexOf(endMark, s2) + endMark.length;
if (s2 < 0 || e2 < endMark.length) { console.log('✗ _writesBlocked not found'); process.exit(1); }
global.window = {};
eval(auth.slice(s2, e2));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// build number parsing
ok('r34 parses to 34', _auBuildNum('v9 · r34'), 34);
ok('r33 parses to 33', _auBuildNum('v9 · r33'), 33);
ok('single digit r9', _auBuildNum('v9 · r9'), 9);
ok('garbled → 0', _auBuildNum('something weird'), 0);
ok('null → 0', _auBuildNum(null), 0);

// the block decision: block iff live strictly newer
function shouldBlock(live, running){ return _auBuildNum(live) > _auBuildNum(running); }
ok('newer live (r34 > r33) → BLOCK', shouldBlock('v9 · r34','v9 · r33'), true);
ok('same build → do NOT block', shouldBlock('v9 · r34','v9 · r34'), false);
ok('older live (stale fetch) → do NOT block', shouldBlock('v9 · r33','v9 · r34'), false);
ok('garbled live → do NOT block (no false freeze)', shouldBlock('garbage','v9 · r34'), false);

// _writesBlocked reflects the flag
window._appWritesBlocked = undefined;
ok('writes NOT blocked by default', _writesBlocked(), false);
window._appWritesBlocked = true;
ok('writes blocked when flag set', _writesBlocked(), true);
window._appWritesBlocked = false;
ok('writes unblocked when flag false', _writesBlocked(), false);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
