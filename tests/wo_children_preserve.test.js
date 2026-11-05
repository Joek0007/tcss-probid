// r41 — the full-replace-drop class, fixed for ALL WO child tables + payments. The wo_parts / wo_labor /
// wo_checklist pulls (and invoice_payments) full-replaced their DB arrays with only a tombstone filter,
// so a JUST-ADDED local row not yet confirmed in the cloud was dropped on the next sync — a tech adds a
// part or checks a box, a sync fires, it vanishes. Fix (same as r40 expenses): mark cloud/pushed rows
// _synced and preserve local rows with _synced !== true, while still dropping rows deleted elsewhere
// (those were pulled before, so _synced === true) and tombstoned ids.
const fs = require('fs');
const src  = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const cal  = fs.readFileSync(__dirname + '/../js/calendar.js', 'utf8');

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// (1) each pull preserves local unsynced rows (has a _prevXX preserve loop that checks _synced!==true)
ok('wo_labor pull preserves local unsynced',   /_prevWL[\s\S]{0,400}_synced!==true/.test(src), true);
ok('wo_parts pull preserves local unsynced',   /_prevWP[\s\S]{0,400}_synced!==true/.test(src), true);
ok('wo_checklist pull preserves local unsynced',/_prevWCl[\s\S]{0,400}_synced!==true/.test(src), true);
ok('payments pull preserves local unsynced',   /_prevPmt[\s\S]{0,500}_synced!==true/.test(src), true);

// (2) each immediate push marks _synced on success
ok('part push marks _synced',      /\[WO Part Push\][\s\S]{0,300}wp\._synced = true/.test(src), true);
ok('checklist push marks _synced', /\[WO Checklist Push\][\s\S]{0,300}wc\._synced = true/.test(src), true);
ok('payment marks _synced after confirmed insert', /payment\._synced = true/.test(cal), true);

// (3) each sweep push marks _synced on success
// r75: the sweep still marks _synced, now also seeding the changed-only snapshot (same line).
ok('sweep part marks _synced + seeds',      /wp\._synced = true; _officeMarkSynced\('wo_parts', wp\);/.test(src), true);
ok('sweep labor marks _synced + seeds',     /wl\._synced = true; _officeMarkSynced\('wo_labor', wl\);/.test(src), true);
ok('sweep checklist marks _synced + seeds', /wc\._synced = true; _officeMarkSynced\('wo_checklist', wc\);/.test(src), true);
// r75: and the sweeps are now gated changed-only (skip unchanged rows).
ok('sweep parts gated changed-only',     /_officeDirty\('wo_parts', wp\)/.test(src), true);
ok('sweep labor gated changed-only',     /_officeDirty\('wo_labor', wl\)/.test(src), true);
ok('sweep expenses gated changed-only',  /_officeDirty\('wo_expenses', we\)/.test(src), true);
ok('sweep checklist gated changed-only', /_officeDirty\('wo_checklist', wc\)/.test(src), true);

// (4) behavioral: the shared preservation predicate (no old-window clause — these are unbounded pulls)
function preserve(row, inCloud, tomb){
  if (!row || !row.id || inCloud || (tomb||[]).indexOf(String(row.id)) >= 0) return false;
  return row._synced !== true;
}
ok('just-added local row (no _synced) is kept',           preserve({id:'n1'}, false, []), true);
ok('row deleted elsewhere (was _synced) is dropped',       preserve({id:'g1', _synced:true}, false, []), false);
ok('tombstoned row is dropped',                            preserve({id:'t1'}, false, ['t1']), false);
ok('cloud-present row not double-added',                   preserve({id:'c1'}, true, []), false);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
