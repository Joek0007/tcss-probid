// r100 — PO list action area: removed the INVISIBLE reserved "Receive" button that left a big empty
// gap on every PO that can't be received. Receive now renders only for Sent / Partially Received;
// buttons group tightly and left-align after the Status column.
const fs = require('fs');
const po = fs.readFileSync(__dirname + '/../js/purchaseorders.js', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r100 PO-list action layout (no reserved blank Receive slot) ──');

// slice the PO list action div
const s = po.indexOf("justify-content:flex-start;align-items:center");
const e = po.indexOf("'</div>'+", s);
const cell = po.slice(s-60, e+40);

ok('no invisible/visibility:hidden Receive placeholder left anywhere', po.indexOf('visibility:hidden')<0);
ok('no aria-hidden reserved button', po.indexOf('aria-hidden="true"')<0 || po.indexOf('📥 Receive</button>')>=0 && po.indexOf('aria-hidden')<0);
ok('Receive renders ONLY for Sent / Partially Received, with an EMPTY else (no reserved button)',
   /\['Sent','Partially Received'\]\.includes\(po\.status\)/.test(po) && /openReceiving/.test(po) && /:\s*''\)\+/.test(po));
ok('buttons left-aligned (flex-start), not floating right', cell.indexOf('justify-content:flex-start')>=0);
ok('Open / Print / Delete still present with handlers', /onclick="openPO/.test(cell) && /onclick="printPOById/.test(cell) && /onclick="deletePO/.test(po));
ok('Actions header no longer right-aligned', po.indexOf('text-align:right">Actions<')<0);

console.log((fail===0?'✅':'❌')+' PO-list actions: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
