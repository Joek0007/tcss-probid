// r32: changed-only push (in-memory snapshot). Verifies the REAL _recHash/_officeMarkSynced/
// _officeDirty from auth.js. SAFETY INVARIANT under test: a genuinely-changed or never-synced record
// is NEVER skipped (false-clean = data loss); only an untouched, already-in-sync record is skipped.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _recHash(');
const end   = src.indexOf('var WO_EXPENSE_WINDOW_DAYS');
if (start < 0 || end < 0) { console.log('✗ could not locate r32 helpers in auth.js'); process.exit(1); }
eval(src.slice(start, end));   // defines _recHash, _officeSnap, _officeMarkSynced, _officeDirty

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }
function reset(){ _officeSnap.quotes={}; _officeSnap.customers={}; _officeSnap.contacts={}; }

// 1) never-seen → dirty (must push)
reset();
ok('never-seen record → dirty', _officeDirty('quotes',{id:'q1',jn:'A'}), true);

// 2) synced + unchanged → NOT dirty (skip — this is what stops the stale re-push)
reset();
(function(){ var q={id:'q1',num:'Q1',jn:'Aegis Cooling',items:[{desc:'x',mc:1}]}; _officeMarkSynced('quotes',q);
  ok('synced + unchanged → NOT dirty (skip)', _officeDirty('quotes',q), false); })();

// 3) any content change → dirty
reset();
(function(){ var q={id:'q1',jn:'Aegis Cooling)'}; _officeMarkSynced('quotes',q); q.jn='Aegis Cooling';
  ok('job-name change → dirty', _officeDirty('quotes',q), true); })();

// 4) single line-item change → dirty (items is hashed)
reset();
(function(){ var q={id:'q1',jn:'A',items:[{desc:'x',mc:1}]}; _officeMarkSynced('quotes',q); q.items[0].mc=99;
  ok('line-item change → dirty', _officeDirty('quotes',q), true); })();

// 5) metadata-only churn (updatedAt / createdAt / _internal) → NOT dirty
reset();
(function(){ var q={id:'q1',jn:'A',updatedAt:'t1',createdAt:'c',_synced:true}; _officeMarkSynced('quotes',q);
  q.updatedAt='t2'; q._synced=false; q._x=1;
  ok('metadata/_internal churn only → NOT dirty', _officeDirty('quotes',q), false); })();

// 6) THE BUG CASE: cloud snapshot taken on pull, but a NEWER local edit is kept by LWW → must push
reset();
(function(){ var cloud={id:'q1',jn:'Aegis Cooling)'}; _officeMarkSynced('quotes',cloud);   // pull-time: snapshot CLOUD
  var localEdited={id:'q1',jn:'Aegis Cooling'};                                             // LWW kept my newer edit
  ok('cloud snapshot + newer local edit → dirty (offline edit still pushes)', _officeDirty('quotes',localEdited), true); })();

// 7) after a successful push marks the edited value synced → NOT dirty (converged)
reset();
(function(){ var q={id:'q1',jn:'Aegis Cooling)'}; _officeMarkSynced('quotes',q); q.jn='Aegis Cooling';
  ok('edited → dirty before push', _officeDirty('quotes',q), true);
  _officeMarkSynced('quotes',q);  // push succeeded
  ok('after push-success mark → NOT dirty', _officeDirty('quotes',q), false); })();

// 8) no updatedAt field at all (legacy record) still tracked by content → unchanged skips, change pushes
reset();
(function(){ var c={id:'c1',name:'Acme'}; _officeMarkSynced('customers',c);
  ok('legacy (no updatedAt) unchanged → skip', _officeDirty('customers',c), false);
  c.name='Acme Inc'; ok('legacy content change → dirty', _officeDirty('customers',c), true); })();

// 9) per-table isolation
reset();
(function(){ var q={id:'1',jn:'A'}; _officeMarkSynced('quotes',q);
  ok('same id other table → dirty (not cross-counted)', _officeDirty('contacts',{id:'1',name:'A'}), true); })();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
