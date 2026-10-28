// r27: changed-only (dirty) push. Verifies the REAL _recHash/_officeDirty/_officeMarkSynced/
// _officePendingCount from auth.js against a localStorage + DB shim:
//   - a freshly-snapshotted (known-in-sync) record is NOT dirty  → skipped on push (can't clobber)
//   - any content change (incl. a single line-item edit) marks it dirty → pushed
//   - a record never seen in sync is dirty → pushed
//   - metadata-only churn (updatedAt/createdAt/_internal) does NOT mark dirty
//   - pending count sums dirty quotes+customers+contacts, and is 0 for helper_tech
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _recHash(');
const endMark = 'window._officePendingCount = _officePendingCount; } catch(e){}';
const end = src.indexOf(endMark);
if (start < 0 || end < 0) { console.log('✗ could not locate r27 helpers in auth.js'); process.exit(1); }

// shims the helpers reference
var _store = {};
global.localStorage = {
  getItem: function(k){ return (k in _store) ? _store[k] : null; },
  setItem: function(k,v){ _store[k] = String(v); },
  removeItem: function(k){ delete _store[k]; }
};
global.setTimeout = function(fn){ try{ fn(); }catch(e){} return 0; }; // run debounced saves inline
global.window = {};
var DB = { quotes:[], customers:[], contacts:[] };
global.DB = DB;
var _currentUser = { role:'admin' };
global._currentUser = _currentUser;

eval(src.slice(start, end + endMark.length));   // defines the r27 helpers

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

// 1) A record never snapshotted is dirty (safe default: push)
(function(){
  _store = {}; _syncSnap = null;
  ok('never-seen record → dirty', _officeDirty('quotes', {id:'q1', total:100}), true);
})();

// 2) After marking synced, same content is NOT dirty (→ skipped, can't clobber)
(function(){
  _store = {}; _syncSnap = null;
  var q = {id:'q1', num:'Q-1', total:100, items:[{desc:'a', mc:10}]};
  _officeMarkSynced('quotes', q);
  ok('synced + unchanged → NOT dirty', _officeDirty('quotes', q), false);
})();

// 3) Any content change marks dirty
(function(){
  _store = {}; _syncSnap = null;
  var q = {id:'q1', num:'Q-1', total:100, items:[{desc:'a', mc:10}]};
  _officeMarkSynced('quotes', q);
  q.total = 250;
  ok('content change (total) → dirty', _officeDirty('quotes', q), true);
})();

// 4) A single line-item edit marks dirty (items is part of the hash)
(function(){
  _store = {}; _syncSnap = null;
  var q = {id:'q1', num:'Q-1', total:100, items:[{desc:'a', mc:10}]};
  _officeMarkSynced('quotes', q);
  q.items[0].mc = 99;
  ok('line-item change → dirty', _officeDirty('quotes', q), true);
})();

// 5) Metadata-only churn does NOT mark dirty (updatedAt/createdAt/_internal excluded)
(function(){
  _store = {}; _syncSnap = null;
  var q = {id:'q1', num:'Q-1', total:100, updatedAt:'2026-10-28T10:00:00Z', createdAt:'x', _synced:true};
  _officeMarkSynced('quotes', q);
  q.updatedAt = '2026-10-28T12:00:00Z';   // only metadata moved
  q._synced = false; q._dirtyFlag = 1;    // internal churn
  ok('metadata/_internal churn only → NOT dirty', _officeDirty('quotes', q), false);
})();

// 6) Snapshotting the CLOUD version keeps a newer LOCAL edit dirty (so offline edits still push)
(function(){
  _store = {}; _syncSnap = null;
  var cloud = {id:'q1', num:'Q-1', total:100};
  _officeMarkSynced('quotes', cloud);               // pull-time: snapshot CLOUD content
  var localEdited = {id:'q1', num:'Q-1', total:777}; // LWW kept this newer local edit
  ok('local edit over cloud snapshot → dirty (will push)', _officeDirty('quotes', localEdited), true);
})();

// 7) Pending count sums dirty across the three tables
(function(){
  _store = {}; _syncSnap = null; _currentUser.role='admin';
  var cClean = {id:'c1', name:'Acme'};
  _officeMarkSynced('customers', cClean);
  DB.quotes    = [{id:'q1', total:1}, {id:'q2', total:2}];   // both never-seen → dirty
  DB.customers = [cClean, {id:'c2', name:'New'}];            // c1 clean, c2 dirty
  DB.contacts  = [{id:'ct1', name:'Jo'}];                    // dirty
  ok('pending count = 2 quotes + 1 customer + 1 contact', _officePendingCount(), 4);
})();

// 8) helper_tech never shows office-pending (their push is skipped, so a count would stick)
(function(){
  _store = {}; _syncSnap = null; _currentUser.role='helper_tech';
  DB.quotes = [{id:'q1', total:1}]; DB.customers=[]; DB.contacts=[];
  ok('helper_tech → pending count 0', _officePendingCount(), 0);
  _currentUser.role='admin';
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
