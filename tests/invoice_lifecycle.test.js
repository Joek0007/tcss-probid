// r38 INVOICE LIFECYCLE net — two devices + one cloud, REAL sync helpers from auth.js
// (_recHash, _officeMarkSynced, _officeDirty, _mergeKeepLocalDirty). Certifies the invoice object
// (the money entity) for "data-loss / revert proof":
//   • INV1  an offline edit to an EXISTING invoice survives the pull (dirty-aware, not cloud-wins)
//   • CROSS a device that did NOT edit takes another device's newer cloud copy (NOT reverted) —
//           the scenario a naive "keep local if differs" merge would break; the dirty check must use
//           the PRE-pull snapshot
//   • INV2  a stale long-open tab never re-pushes its whole stale invoice over a newer edit
//   • RELOAD a fresh session pushes nothing until its first pull rebuilt the snapshot
//   • PAYMENT a status change (unpaid→paid) marks dirty and syncs
// Invoices have NO reliable per-edit updatedAt, which is exactly why the merge is dirty-aware, not LWW.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _tsMs(');
const end   = src.indexOf('function _quoteExtras(');
if (start < 0 || end < 0) { console.log('✗ could not locate sync helpers in auth.js'); process.exit(1); }
const HELPERS = src.slice(start, end);
function clone(o){ return JSON.parse(JSON.stringify(o)); }

function makeClient(name){
  var _tsMs,_lwwMerge,_mergeKeepLocalDirty,_recHash,_WO_HASH_KEYS,_woHash,_officeSnap,_officeSnapReady,_officeMarkSynced,_officeDirty;
  eval(HELPERS);
  return {
    name:name, db:[], tomb:{}, ready:false,
    dirty:function(i){ return _officeDirty('invoices', i); },
    mark:function(i){ return _officeMarkSynced('invoices', i); },
    get:function(id){ return this.db.find(function(i){return i&&i.id===id;}); },
    push:function(cloud){                        // mirrors the r38 changed-only, ready-gated invoice sweep
      var self=this;
      if(!this.ready) return;                    // ready gate
      this.db.forEach(function(i){
        if(!i||i.id==null) return;
        if(self.tomb[i.id]) return;
        if(!self.dirty(i)) return;               // unchanged → skip (no stale whole-invoice revert)
        if(cloud.deleted[i.id]) return;
        cloud.rows[i.id]=clone(i);
        self.mark(i);
      });
    },
    pull:function(cloud){                         // mirrors the r38 dirty-aware invoice pull
      var self=this;
      var cloudInvs = Object.keys(cloud.rows).filter(function(id){return !cloud.deleted[id];})
        .map(function(id){ var d=clone(cloud.rows[id]); d._synced=true; return d; });
      var cloudIds={}; cloudInvs.forEach(function(i){cloudIds[i.id]=1;});
      var localOnly=this.db.filter(function(i){ return i && i.id && !cloudIds[i.id] && !cloud.deleted[i.id] && !self.tomb[i.id] && (i._synced!==true || self.dirty(i)); });
      this.db=_mergeKeepLocalDirty('invoices', cloudInvs, this.db, localOnly);
      this.ready=true;
    },
    save:function(id, mut){                        // mirrors the app: find invoice, mutate in place, NO timestamp
      var cur=this.get(id);
      if(!cur){ cur={id:id}; this.db.push(cur); }
      mut(cur);
      return cur;
    },
    del:function(id){ this.tomb[id]=true; this.db=this.db.filter(function(i){return i.id!==id;}); }
  };
}

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }
function freshCloud(){ return { rows:{}, deleted:{} }; }
function inv(id){ return { id:id, num:'INV-1', status:'unpaid', total:1000, dueDate:'2026-11-30', lineItems:[{d:'Service',amt:1000}], _synced:false }; }

// 1) CREATE → whole invoice propagates
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push(inv('i1')); A.push(cloud); B.pull(cloud);
  var b=B.get('i1');
  ok('CREATE: invoice reaches B', !!b, true);
  ok('CREATE: total', b&&b.total, 1000);
  ok('CREATE: line items', b&&b.lineItems&&b.lineItems.length, 1);
  ok('CREATE: due date', b&&b.dueDate, '2026-11-30');
})();

// 2) ★ INV1 — offline EDIT of an existing invoice survives the pull, then re-pushes
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push(inv('i1')); A.push(cloud); B.pull(cloud);
  // A edits offline (change due date + add a line item) — no push yet
  A.save('i1', function(i){ i.dueDate='2026-12-15'; i.lineItems.push({d:'Parts',amt:250}); i.total=1250; });
  A.pull(cloud);                                   // a pull arrives before A pushed
  ok('INV1: offline edit survives the pull', A.get('i1').total, 1250);
  ok('INV1: added line item survives', A.get('i1').lineItems.length, 2);
  A.push(cloud);
  ok('INV1: cloud now has the edit', cloud.rows.i1.total, 1250);
  B.pull(cloud);
  ok('INV1: B converges', B.get('i1').total, 1250);
})();

// 3) ★ CROSS — a device that did NOT edit must take the other device's newer cloud copy (not revert it)
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push(inv('i1')); A.push(cloud); B.pull(cloud);   // B holds v1, clean
  // A marks it paid and pushes
  A.save('i1', function(i){ i.status='paid'; }); A.push(cloud);
  ok('CROSS: cloud has paid', cloud.rows.i1.status, 'paid');
  // B (never touched it) pulls → MUST take cloud's paid, not keep its stale unpaid
  B.pull(cloud);
  ok('CROSS: untouched B takes cloud update (no revert)', B.get('i1').status, 'paid');
})();

// 4) ★ INV2 — a stale long-open tab B must not re-push its whole stale invoice over A's newer edit
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push(inv('i1')); A.push(cloud); B.pull(cloud);   // B holds v1, clean in snapshot
  A.save('i1', function(i){ i.status='paid'; i.total=1000; }); A.push(cloud);   // cloud = paid
  B.push(cloud);                                   // B's background sweep — must NOT re-push stale unpaid
  ok('INV2: stale B did NOT clobber cloud', cloud.rows.i1.status, 'paid');
  B.pull(cloud);
  ok('INV2: B converges to paid', B.get('i1').status, 'paid');
})();

// 5) RELOAD gate — fresh session with stale localStorage pushes NOTHING before it pulls
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud); A.db.push(inv('i1')); A.save('i1',function(i){i.status='paid';}); A.push(cloud);
  ok('RELOAD: cloud starts paid', cloud.rows.i1.status, 'paid');
  var B=makeClient('B');                            // fresh reload, ready=false
  var stale=inv('i1'); stale.status='unpaid'; B.db.push(stale);   // stale from localStorage
  B.push(cloud);                                    // load-time sweep BEFORE pull → no-op
  ok('RELOAD: stale fresh-load sweep does NOT clobber', cloud.rows.i1.status, 'paid');
  B.pull(cloud);
  ok('RELOAD: B converges to paid', B.get('i1').status, 'paid');
})();

// 6) PAYMENT — a status change marks dirty and syncs; an untouched invoice stays clean
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud); A.db.push(inv('i1')); A.push(cloud);
  var i=A.get('i1');
  ok('PAYMENT: freshly pushed invoice is clean', A.dirty(i), false);
  i.status='partial';                               // record a partial payment
  ok('PAYMENT: status change marks dirty', A.dirty(i), true);
  A.push(cloud);
  ok('PAYMENT: cloud reflects partial', cloud.rows.i1.status, 'partial');
  ok('PAYMENT: clean again after push', A.dirty(A.get('i1')), false);
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
