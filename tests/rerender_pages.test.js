// r42 — the post-sync redraw (_rerenderActivePage, r28) must cover the pages users actually sit on,
// including Work Orders and the field/clock page. They were missing, so a sync that pulled a new tag or
// status change didn't appear until a manual reload ("it doesn't refresh/update"). Guard that the map
// includes them and calls the right render functions.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
var s = src.indexOf('function _rerenderActivePage(');
var e = src.indexOf('window._rerenderActivePage', s);
var block = src.slice(s, e);

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

ok('redraw map includes workorders → renderWorkOrders', /workorders:\s*function\(\)\{[^}]*renderWorkOrders\(\)/.test(block));
ok('redraw map includes field → renderFieldPage',       /field:\s*function\(\)\{[^}]*renderFieldPage\(\)/.test(block));
ok('redraw map includes dash → renderDash',             /dash:\s*function\(\)\{[^}]*renderDash\(\)/.test(block));
ok('redraw still guarded against open modals',          /_anyModalVisible/.test(block));
ok('redraw still keyed off the active page id',         /_currentPageId/.test(block));

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
