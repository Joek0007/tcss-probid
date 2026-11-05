// WS-3b (r77) — windowed/on-demand loading of WO parts/labor/checklist. Static assertions over
// auth.js + workorders.js that the three child pulls are bounded to WO_CHILD_WINDOW_DAYS, that the
// bounded pull still preserves on-demand-loaded OLD rows + local-unsynced rows, and that the
// on-demand loaders set _synced AND seed the r75 changed-only snapshot (so a loaded old row is not
// re-pushed by the sweep).
const fs = require('fs');
const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const wo   = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('\nwindow constant + bounded pulls:');
ok('WO_CHILD_WINDOW_DAYS defined', /var WO_CHILD_WINDOW_DAYS\s*=\s*\d+/.test(auth));
ok('_childCut computed from the window', /_childCut = new Date\(Date\.now\(\) - WO_CHILD_WINDOW_DAYS\*86400000\)/.test(auth));
ok('wo_labor pull bounded', /from\('wo_labor'\)\.select\('\*'\)\.gte\('created_at', _childCut\)/.test(auth));
ok('wo_parts pull bounded', /from\('wo_parts'\)\.select\('\*'\)\.gte\('created_at', _childCut\)/.test(auth));
ok('wo_checklist pull bounded', /from\('wo_checklist'\)\.select\('\*'\)\.gte\('created_at', _childCut\)/.test(auth));

console.log('\nbounded pull preserves old on-demand rows (not just local-unsynced):');
ok('wo_labor preserve keeps old-outside-window', /_prevWL\.forEach[\s\S]{0,160}createdAt<_childCut[\s\S]{0,40}_synced!==true/.test(auth));
ok('wo_parts preserve keeps old-outside-window', /_prevWP\.forEach[\s\S]{0,160}createdAt<_childCut[\s\S]{0,40}_synced!==true/.test(auth));
ok('wo_checklist preserve keeps old-outside-window', /_prevWCl\.forEach[\s\S]{0,160}createdAt<_childCut[\s\S]{0,40}_synced!==true/.test(auth));

console.log('\nper-WO on-demand loader seeds the changed-only snapshot:');
ok('ensureWOChildrenLoaded defined', /async function ensureWOChildrenLoaded\(woId\)/.test(auth));
ok('loader fetches all three tables for the WO', /from\('wo_parts'\)\.select\('\*'\)\.eq\('wo_id', woId\)/.test(auth) && /from\('wo_labor'\)\.select\('\*'\)\.eq\('wo_id', woId\)/.test(auth) && /from\('wo_checklist'\)\.select\('\*'\)\.eq\('wo_id', woId\)/.test(auth));
ok('loader seeds parts snapshot', /_np[\s\S]{0,120}_officeMarkSynced\('wo_parts', _np\)/.test(auth));
ok('loader seeds labor snapshot', /_nl[\s\S]{0,120}_officeMarkSynced\('wo_labor', _nl\)/.test(auth));
ok('loader seeds checklist snapshot', /_nc[\s\S]{0,120}_officeMarkSynced\('wo_checklist', _nc\)/.test(auth));
ok('loader caches per WO', /_ondemandChildWOIds\[woId\] = 1/.test(auth));

console.log('\nset-based vehicle-profile loaders also seed (no churn):');
ok('ensureWOPartsForIds seeds', /DB\.woParts\.push\(_np\); if \(typeof _officeMarkSynced==='function'\) _officeMarkSynced\('wo_parts', _np\)/.test(auth));
ok('ensureWOLaborForIds seeds', /DB\.woLabor\.push\(_nl\); if \(typeof _officeMarkSynced==='function'\) _officeMarkSynced\('wo_labor', _nl\)/.test(auth));

console.log('\ntab render wires the loader (workorders.js):');
ok('labor tab lazy-loads + re-renders', /ensureWOChildrenLoaded\(id\)\.then\(function\(\)\{ if \(_woTab==='labor' && _woCurrentId===id\)[\s\S]{0,90}renderWOLaborTab\(id\)/.test(wo));
ok('parts tab lazy-loads + re-renders', /ensureWOChildrenLoaded\(id\)\.then\(function\(\)\{ if \(_woTab==='parts' && _woCurrentId===id\)[\s\S]{0,90}renderWOPartsTab\(id\)/.test(wo));
ok('checklist tab lazy-loads + re-renders', /ensureWOChildrenLoaded\(id\)\.then\(function\(\)\{ if \(_woTab==='checklist' && _woCurrentId===id\)[\s\S]{0,90}renderWOChecklistTab\(id\)/.test(wo));

console.log('\n'+(fail===0?('ALL '+pass+' PASSED'):(fail+' FAILED, '+pass+' passed')));
process.exit(fail===0?0:1);
