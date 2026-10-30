// QUOTE LIFECYCLE net — two devices + one cloud, REAL sync helpers from auth.js. Certifies the quote
// paths for "data-loss / revert proof": create, edit (no stale clobber), delete (no resurrect),
// offline-edit survives, AND the reload case (r34): a freshly-loaded session whose in-memory
// snapshot is empty must NOT push office records until its first pull rebuilds the snapshot —
// otherwise it re-clobbers from stale localStorage (the job-name-paren-comes-back bug).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _tsMs(');
const end   = src.indexOf('var WO_EXPENSE_WINDOW_DAYS');
if (start < 0 || end < 0) { console.log('✗ could not locate sync helpers in auth.js'); process.exit(1); }
const HELPERS = src.slice(start, end);

function makeClient(name){
  var _tsMs,_lwwMerge,_recHash,_officeSnap,_officeMarkSynced,_officeDirty,_quoteExtras,_applyQuoteExtras;
  eval(HELPERS);
  return {
    name:name, db:[], tomb:{}, ready:false,     // ready=false until first pull (mirrors _officeSnapReady, r34)
    lww:_lwwMerge, dirty:function(r){return _officeDirty('quotes',r);}, mark:function(r){return _officeMarkSynced('quotes',r);},
    extras:_quoteExtras, applyExtras:_applyQuoteExtras,
    get:function(id){return this.db.find(function(r){return r&&r.id===id;});},
    push:function(cloud){
      var self=this;
      if(!this.ready) return;                    // r34 GATE: no office push before the first pull rebuilt the snapshot
      Object.keys(this.tomb).forEach(function(id){ cloud.deleted[id]=true; });
      this.db.forEach(function(q){
        if(!self.dirty(q)) return;
        if(cloud.deleted[q.id]) return;          // guard: never resurrect a tombstoned row
        cloud.rows[q.id]={ id:q.id,num:q.num,jn:q.jn,status:q.status,items:JSON.parse(JSON.stringify(q.items||[])),updated_at:q.updatedAt,quote_extras:self.extras(q) };
        cloud.deleted[q.id]=false;
        self.mark(q);
      });
    },
    pull:function(cloud){
      var self=this;
      var rows=Object.keys(cloud.rows).filter(function(id){return !cloud.deleted[id];}).map(function(id){
        var r=cloud.rows[id];
        var o={ id:r.id,num:r.num,jn:r.jn,status:r.status,items:JSON.parse(JSON.stringify(r.items||[])),updatedAt:r.updated_at };
        self.applyExtras(o,r); return o;
      });
      rows.forEach(this.mark);
      var cloudIds={}; rows.forEach(function(r){cloudIds[r.id]=1;});
      var localOnly=this.db.filter(function(q){ return q&&q.id&&!cloudIds[q.id]&&!cloud.deleted[q.id]&&!self.tomb[q.id]&&!q._synced; });
      this.db=this.lww(rows,this.db,localOnly);
      Object.keys(cloud.deleted).forEach(function(id){ if(cloud.deleted[id]){ self.tomb[id]=true; self.db=self.db.filter(function(q){return q.id!==id;}); } });
      this.ready=true;                           // snapshot rebuilt → sweep may now run
    },
    del:function(id){ this.tomb[id]=true; this.db=this.db.filter(function(q){return q.id!==id;}); }
  };
}

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }
function freshCloud(){ return { rows:{}, deleted:{} }; }
function loaded(id){ return { id:id,num:'Q-1',jn:'Katalyst HQ',status:'approved',updatedAt:'2026-10-30T10:00:00Z',
  items:[{_id:1,desc:'Camera',qty:6,mc:150,lh:1}], equipmentRows:[{_id:1,name:'NVR',qty:1,cost:900}], equipmentCost:900,
  perDiem:{men:2,days:3,rate:60}, perDiemCost:360, discountType:'pct', discountValue:10,
  execSummary:'<p>Custom summary</p>', svcContract:{tier:'gold',label:'Gold',annual:1200}, wonDate:'2026-10-30' }; }

// 1) CREATE a fully-loaded quote → propagates intact (A pulls first, as every session does on load)
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push(loaded('q1')); A.push(cloud); B.pull(cloud);
  var b=B.get('q1');
  ok('CREATE: equipment', (b.equipmentRows||[]).length, 1);
  ok('CREATE: per-diem', b.perDiem, {men:2,days:3,rate:60});
  ok('CREATE: % discount', b.discountType, 'pct');
  ok('CREATE: exec override', b.execSummary, '<p>Custom summary</p>');
  ok('CREATE: svc contract', b.svcContract&&b.svcContract.tier, 'gold');
  ok('CREATE: line items', (b.items||[]).length, 1);
  ok('CREATE: wonDate', b.wonDate, '2026-10-30');
})();

// 2) EDIT on A → stale B must not clobber
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push({id:'q1',num:'Q-1',jn:'Old',status:'sent',updatedAt:'2026-10-30T10:00:00Z',items:[{_id:1,desc:'C',qty:1,mc:100,lh:1}],equipmentRows:[],discountType:'amt',discountValue:0}); A.push(cloud);
  B.pull(cloud);
  var a=A.get('q1'); a.jn='New'; a.equipmentRows=[{_id:9,name:'Switch',qty:1,cost:300}]; a.items.push({_id:2,desc:'Mount',qty:2,mc:20,lh:0}); a.updatedAt='2026-10-30T10:05:00Z';
  A.push(cloud); B.push(cloud);
  ok('EDIT: cloud keeps new name', cloud.rows.q1.jn, 'New');
  ok('EDIT: cloud keeps equipment', (cloud.rows.q1.quote_extras.equipmentRows||[]).length, 1);
  B.pull(cloud);
  ok('EDIT: B converges', B.get('q1').jn, 'New');
})();

// 3) DELETE → stale B must not resurrect; incl. the dirty-conflict case the guard covers
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud); A.db.push({id:'q1',num:'Q-1',jn:'Live',status:'draft',updatedAt:'2026-10-30T10:00:00Z',items:[]}); A.push(cloud);
  B.pull(cloud);
  var b=B.get('q1'); b.jn='B editing'; b.updatedAt='2026-10-30T10:03:00Z';   // B dirty
  A.del('q1'); A.push(cloud);
  B.push(cloud);
  ok('DELETE: dirty stale B cannot resurrect', !!cloud.deleted.q1, true);
  B.pull(cloud);
  ok('DELETE: B drops q1', B.get('q1'), undefined);
})();

// 4) OFFLINE edit survives a pull and still pushes
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud); A.db.push({id:'q1',num:'Q-1',jn:'orig',status:'sent',updatedAt:'2026-10-30T10:00:00Z',items:[]}); A.push(cloud);
  var a=A.get('q1'); a.jn='offline edit'; a.updatedAt='2026-10-30T10:20:00Z';
  A.pull(cloud);
  ok('OFFLINE: A keeps its edit', A.get('q1').jn, 'offline edit');
  A.push(cloud);
  ok('OFFLINE: cloud gets it', cloud.rows.q1.jn, 'offline edit');
})();

// 5) ★ RELOAD (r34): a freshly-loaded session with STALE localStorage must NOT clobber before it pulls.
//    A fixed the name to "Aegis Cooling" in the cloud. B reloads — its db has the OLD "Aegis Cooling)"
//    from localStorage and ready=false (hasn't pulled). B's load-time sweep must push NOTHING.
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud); A.db.push({id:'q1',num:'Q-1',jn:'Aegis Cooling',status:'sent',updatedAt:'2026-10-30T10:30:00Z',items:[]}); A.push(cloud);
  ok('RELOAD: cloud starts good', cloud.rows.q1.jn, 'Aegis Cooling');
  var B=makeClient('B');                                  // fresh reload
  B.db.push({id:'q1',num:'Q-1',jn:'Aegis Cooling)',status:'sent',updatedAt:'2026-10-30T10:00:00Z',items:[]});  // stale from localStorage
  B.push(cloud);                                          // load-time sweep BEFORE pull (ready=false) → must be a no-op
  ok('RELOAD: stale fresh-load sweep does NOT clobber', cloud.rows.q1.jn, 'Aegis Cooling');
  B.pull(cloud);
  ok('RELOAD: B converges to good name', B.get('q1').jn, 'Aegis Cooling');
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
