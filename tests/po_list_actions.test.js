// r101 — PO list Receive button. Keeps the SAME footprint on every row so the Actions column stays in
// line (fixing the original "big empty gap" which was a reserved INVISIBLE button). A PO that's ready to
// receive (Sent / Partially Received) shows a solid DARK-GREEN clickable Receive; every other row shows a
// light GREEN-OUTLINE placeholder that's inert (holds the line, not clickable).
const fs = require('fs');
const po = fs.readFileSync(__dirname + '/../js/purchaseorders.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r101 PO-list Receive (dark-green active / green-outline placeholder, aligned) ──');

// no more INVISIBLE reserved button (that was the empty-gap bug)
ok('no visibility:hidden reserved button', po.indexOf('visibility:hidden')<0);

// active Receive = solid dark green (btn-success), clickable, only for Sent / Partially Received
ok('receivable PO → solid dark-green clickable Receive',
   /\['Sent','Partially Received'\]\.includes\(po\.status\)/.test(po) &&
   /\? '<button class="btn btn-success btn-sm po-recv" onclick="openReceiving/.test(po));

// every other row → green-outline placeholder, inert (not clickable), same class footprint
ok('non-receivable PO → green-outline placeholder button (po-recv-ph)',
   /: '<button class="btn btn-sm po-recv po-recv-ph"[^>]*>Receive<\/button>'/.test(po));
ok('placeholder is inert (no onclick, aria-hidden, pointer-events:none via CSS)',
   /po-recv-ph"[^>]*aria-hidden="true"/.test(po) && /\.po-recv-ph\{[^}]*pointer-events:none/.test(html));

// identical footprint keeps the columns aligned
ok('both states share .po-recv with a fixed min-width', /\.po-recv\{[^}]*min-width:104px/.test(po)===false && /\.po-recv\{[^}]*min-width:104px/.test(html));

// placeholder styled as a light green outline (white bg, green text + border)
ok('placeholder = green outline (not dark fill)', /\.po-recv-ph\{[^}]*color:#2e7d32;border:1\.5px solid #66bb6a/.test(html));

// buttons right-aligned, header right-aligned (back in line)
ok('action group right-aligned (flex-end)', /justify-content:flex-end;align-items:center">'\+\s*'<button class="btn btn-outline btn-sm" onclick="openPO/.test(po));
ok('Actions header right-aligned', /Status<\/div><div style="text-align:right">Actions<\/div>/.test(po));

// handlers intact
ok('Open / Receive / Print / Delete handlers intact', /onclick="openPO/.test(po) && /onclick="openReceiving/.test(po) && /onclick="printPOById/.test(po) && /onclick="deletePO/.test(po));

console.log((fail===0?'✅':'❌')+' PO-list Receive: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
