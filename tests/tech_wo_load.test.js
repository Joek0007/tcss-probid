// r39 FIELD-TECH WO VISIBILITY — regression guard. The bug: the ONLY work_orders pull lived inside the
// `role !== 'helper_tech' && role !== 'lead_tech'` office block, so a field tech loaded NO work orders
// and never saw the WOs they were assigned to. This test encodes the structural invariant that a
// tech-reachable work_orders load exists, so the fix can't be silently removed or re-gated.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

// 1) a tech-scoped WO load exists: a work_orders select filtered by assigned_techs membership
ok('a work_orders load filters by assigned_techs membership (.contains)',
   /\.from\('work_orders'\)\.select\([^)]*\)\.contains\(\s*'assigned_techs'/.test(src));

// 2) it is reachable for helper_tech/lead_tech (guarded by a role === tech condition, NOT only the
//    office block's role !== tech exclusion)
ok('a helper_tech/lead_tech branch loads work orders',
   /role === 'helper_tech'\s*\|\|\s*_currentUser\.role === 'lead_tech'[\s\S]{0,600}from\('work_orders'\)/.test(src)
   || /role === 'lead_tech'\s*\|\|\s*_currentUser\.role === 'helper_tech'[\s\S]{0,600}from\('work_orders'\)/.test(src));

// 3) the tech load still uses the LWW merge (so a tech's own unsynced edit isn't clobbered)
var techBlock = src.slice(src.indexOf('_myWOName'));   // the r39 tech loader
techBlock = techBlock.slice(0, 2000);
ok('tech WO load uses _lwwMerge (no clobber of local edits)', /_lwwMerge\(/.test(techBlock));
ok('tech WO load seeds the changed-only snapshot', /_officeMarkSynced\('work_orders'/.test(techBlock));

// 4) sanity: the office WO pull is still gated OUT for techs (we didn't accidentally remove that) —
//    i.e. the office-only block header still excludes both tech roles.
ok('office block still excludes helper_tech AND lead_tech',
   /role !== 'helper_tech' && _currentUser\.role !== 'lead_tech'/.test(src));

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
