// SYNC CONVERGENCE REGRESSION NET — models TWO clients sharing one cloud, using the REAL sync
// helpers from auth.js (_tsMs/_lwwMerge/_recHash/_officeDirty/_officeMarkSynced). This encodes the
// failure class that has bitten for months — a stale session re-pushing old data over another's
// edit — so it can never silently come back. It FAILS on the pre-r32 "push everything" behavior and
// PASSES with changed-only push. This is the first brick of the automated safety net: heartbeat
// entities (customers, contacts, quotes, work orders, invoices) will each get a block like this.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _tsMs(');
const end   = src.indexOf('var WO_EXPENSE_WINDOW_DAYS');
if (start < 0 || end < 0) { console.log('✗ could not locate sync helpers in auth.js'); process.exit(1); }
const HELPERS = src.slice(start, end);

// A fresh, independent client (its own _officeSnap + helper set), so two clients don't share state.
function makeClient(name){
  var _tsMs, _lwwMerge, _recHash, _officeSnap, _officeMarkSynced, _officeDirty;   // filled by eval
  eval(HELPERS);
  return {
    name: name,
    db: [],                               // this client's in-memory records (quotes)
    lww: _lwwMerge,
    dirty: function(r){ return _officeDirty('quotes', r); },
    mark:  function(r){ return _officeMarkSynced('quotes', r); },
    // pull: cloud rows win by LWW; snapshot the CLOUD baseline (so a newer local edit stays dirty)
    pull: function(cloud){
      var rows = Object.keys(cloud).map(function(k){ return JSON.parse(JSON.stringify(cloud[k])); });
      rows.forEach(this.mark);
      this.db = this.lww(rows, this.db, []);
    },
    // push (the sweep): only records changed since last confirmed in sync; mark synced on success
    push: function(cloud){
      var pushed = [];
      this.db.forEach(function(rec){
        if (this.dirty(rec)) { cloud[rec.id] = JSON.parse(JSON.stringify(rec)); this.mark(rec); pushed.push(rec.id); }
      }.bind(this));
      return pushed;
    },
    get: function(id){ return this.db.find(function(r){ return r.id===id; }); }
  };
}

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }

// ── THE CLOBBER SCENARIO (the months-long bug) ─────────────────────────────────────────────
// Cloud seeded with a quote. Two clients both pull it. Client A fixes the job name and pushes.
// Client B has been sitting open (stale) and never touched it. B's background sweep must NOT
// re-push its stale copy over A's fix.
(function(){
  var cloud = { q1: { id:'q1', jn:'Aegis Cooling)', updatedAt:'2026-10-29T10:00:00Z' } };
  var A = makeClient('A'), B = makeClient('B');
  A.pull(cloud); B.pull(cloud);                               // both now hold "Aegis Cooling)"

  // A fixes the name and pushes
  A.get('q1').jn = 'Aegis Cooling';
  A.get('q1').updatedAt = '2026-10-29T10:05:00Z';
  A.push(cloud);
  ok('A: cloud holds the fix after A pushes', cloud.q1.jn, 'Aegis Cooling');

  // B (stale, untouched q1) runs its sweep — must push NOTHING for q1
  var bPushed = B.push(cloud);
  ok('B stale sweep does NOT re-push q1', bPushed.indexOf('q1'), -1);
  ok('cloud STILL holds A\'s fix (no clobber)', cloud.q1.jn, 'Aegis Cooling');

  // and when B finally pulls, it converges to the fix (no fight)
  B.pull(cloud);
  ok('B converges to the fix after pulling', B.get('q1').jn, 'Aegis Cooling');
})();

// ── NEGATIVE CONTROL: a REAL edit on B still pushes (we are not over-skipping) ─────────────
(function(){
  var cloud = { q1: { id:'q1', jn:'Start', updatedAt:'2026-10-29T10:00:00Z' } };
  var B = makeClient('B'); B.pull(cloud);
  B.get('q1').jn = 'B real edit';
  B.get('q1').updatedAt = '2026-10-29T10:10:00Z';
  var pushed = B.push(cloud);
  ok('B real edit DOES push', pushed.indexOf('q1')>=0, true);
  ok('cloud reflects B\'s real edit', cloud.q1.jn, 'B real edit');
})();

// ── OFFLINE EDIT SURVIVES: A edits offline (newer), cloud changed by someone else meanwhile ──
// On A's reconnect pull, LWW keeps A's newer edit AND it stays dirty so it still pushes.
(function(){
  var cloud = { q1: { id:'q1', jn:'orig', updatedAt:'2026-10-29T10:00:00Z' } };
  var A = makeClient('A'); A.pull(cloud);
  A.get('q1').jn = 'A offline edit'; A.get('q1').updatedAt = '2026-10-29T10:20:00Z';  // newer, not pushed
  A.pull(cloud);                                   // a pull happens before A pushed
  ok('offline edit survives the pull', A.get('q1').jn, 'A offline edit');
  var pushed = A.push(cloud);
  ok('offline edit still pushes after survive', pushed.indexOf('q1')>=0, true);
  ok('cloud gets the offline edit', cloud.q1.jn, 'A offline edit');
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
