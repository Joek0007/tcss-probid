// r37 WORK ORDER LIFECYCLE net — two devices + one cloud, REAL sync helpers from auth.js
// (_tsMs, _lwwMerge, _woHash, _officeMarkSynced, _officeDirty). Certifies the WO parent record for
// "data-loss / revert proof", matching the quote net:
//   • offline edit to an EXISTING WO survives a pull (LWW, not cloud-wins)  [WO1]
//   • a stale long-open tab never re-pushes its old WO over a newer edit    [changed-only sweep, WO2]
//   • a fresh reload with stale localStorage pushes NOTHING until it pulls  [ready gate, r34 parity]
//   • the WO-specific PERMANENT-DIRTY trap: re-saving a pulled WO with the local-only
//     descriptionIsHtml/workPerformedIsHtml flags must NOT mark it dirty (hash is over persisted
//     fields only) — otherwise every WO re-pushes every sweep and reintroduces the stale clobber.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _tsMs(');
const end   = src.indexOf('function _quoteExtras(');
if (start < 0 || end < 0) { console.log('✗ could not locate sync helpers in auth.js'); process.exit(1); }
const HELPERS = src.slice(start, end);

// a cloud row holds ONLY the persisted WO fields (what _pushWOToCloud sends), never the local-only flags
function toCloud(wo){
  return { id:wo.id, wo_number:wo.woNumber, customer_id:wo.customerId||null, customer_name:wo.customerName||null,
    description:wo.description||null, work_performed:wo.workPerformed||null, status:wo.status||'New',
    site_address:wo.siteAddr||null, labor_rate:wo.laborRate||null, tax_rate:wo.taxRate||null,
    assigned_techs:wo.assignedTechs||[], updated_at:wo.updatedAt };
}
// cloud row -> in-memory WO (mirrors _mapWORow: persisted fields + updatedAt, NO html flags)
function fromCloud(r){
  return { id:r.id, woNumber:r.wo_number, customerId:r.customer_id, customerName:r.customer_name,
    description:r.description, workPerformed:r.work_performed, status:r.status, siteAddr:r.site_address,
    laborRate:r.labor_rate, taxRate:r.tax_rate, assignedTechs:r.assigned_techs||[], updatedAt:r.updated_at };
}

function makeClient(name){
  var _tsMs,_lwwMerge,_recHash,_WO_HASH_KEYS,_woHash,_officeSnap,_officeSnapReady,_officeMarkSynced,_officeDirty;
  eval(HELPERS);
  return {
    name:name, db:[], tomb:{}, ready:false,
    dirty:function(w){ return _officeDirty('work_orders', w); },
    mark:function(w){ return _officeMarkSynced('work_orders', w); },
    get:function(id){ return this.db.find(function(w){return w&&w.id===id;}); },
    push:function(cloud){                       // mirrors the r37 changed-only, ready-gated WO sweep
      var self=this;
      if(!this.ready) return;                   // ready gate (r34 parity)
      this.db.forEach(function(w){
        if(!w||w.id==null) return;
        if(self.tomb[w.id]) return;
        if(!self.dirty(w)) return;              // unchanged since last sync → skip (no stale clobber)
        if(cloud.deleted[w.id]) return;
        cloud.rows[w.id]=toCloud(w);
        self.mark(w);                           // clean on real success
      });
    },
    pull:function(cloud){                        // mirrors the r37 WO pull: LWW + seed snapshot
      var self=this;
      var cloudWOs = Object.keys(cloud.rows).filter(function(id){return !cloud.deleted[id];})
        .map(function(id){ return fromCloud(cloud.rows[id]); });
      cloudWOs.forEach(function(cw){ cw._synced=true; self.mark(cw); });
      var cloudIds={}; cloudWOs.forEach(function(w){cloudIds[w.id]=1;});
      var localOnly=this.db.filter(function(w){ return w && w.id && !cloudIds[w.id] && !cloud.deleted[w.id] && !self.tomb[w.id] && (w._synced!==true || self.dirty(w)); });
      this.db=_lwwMerge(cloudWOs, this.db, localOnly);
      this.ready=true;
    },
    save:function(id, mut){                       // mirrors saveWorkOrder: new obj, bumped updatedAt, html flags present
      var cur=this.get(id)||{id:id};
      var nw=Object.assign({}, cur);
      mut(nw);
      nw.updatedAt=new Date(Date.parse('2027-01-01T00:00:00Z')+ (makeClient._clk=(makeClient._clk||0)+1)*1000).toISOString();  // monotonic, safely after all seed literals
      delete nw._synced;                          // edited object carries no _synced (like saveWorkOrder's data)
      var i=this.db.findIndex(function(w){return w.id===id;});
      if(i>=0) this.db[i]=nw; else this.db.push(nw);
      return nw;
    },
    del:function(id){ this.tomb[id]=true; this.db=this.db.filter(function(w){return w.id!==id;}); }
  };
}

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }
function freshCloud(){ return { rows:{}, deleted:{} }; }

// ───────────────────────────────────────────────────────────────────────────
// 0) ★ PERMANENT-DIRTY TRAP (the WO-specific regression): a pulled WO re-saved with ONLY the
//    local-only html flags added must NOT look dirty; changing real content MUST look dirty.
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud);
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'Fix cam',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:00:00Z'});
  A.push(cloud);                                   // ready → pushes, marks clean
  var w=A.get('w1');
  ok('TRAP: freshly pushed WO is clean', A.dirty(w), false);
  w.descriptionIsHtml=true; w.workPerformedIsHtml=true;   // local-only flags added (open/save in rich-text)
  ok('TRAP: adding local-only html flags does NOT dirty', A.dirty(w), false);
  w.laborRate=125; w.taxRate=0;                           // re-affirm same values
  ok('TRAP: re-affirming same field values does NOT dirty', A.dirty(w), false);
  w.description='Fix camera + NVR';                        // a REAL content change
  ok('TRAP: real content change DOES dirty', A.dirty(w), true);
})();

// 1) CREATE offline then sync → propagates with persisted fields
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud);                                   // ready
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'Install',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:5,assignedTechs:['t1'],updatedAt:'2026-10-30T10:00:00Z',_synced:false});
  A.push(cloud); B.pull(cloud);
  var b=B.get('w1');
  ok('CREATE: WO reaches B', !!b, true);
  ok('CREATE: description', b&&b.description, 'Install');
  ok('CREATE: status', b&&b.status, 'New');
  ok('CREATE: assignedTechs', b&&b.assignedTechs, ['t1']);
})();

// 2) ★ WO1 — offline EDIT of an existing WO is NOT clobbered by a pull (LWW), then re-pushes
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud);
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'orig',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:00:00Z',_synced:false});
  A.push(cloud); B.pull(cloud);                    // both have it, cloud has it
  // A goes offline and edits the description + status
  A.save('w1', function(w){ w.woNumber='WO-1'; w.customerName='Acme'; w.description='edited offline'; w.status='Scheduled'; w.siteAddr='1 Main'; w.laborRate=125; w.taxRate=0; w.assignedTechs=[]; });
  // a pull arrives while the edit is still local (cloud is older)
  A.pull(cloud);
  ok('WO1: offline edit survives the pull (not clobbered)', A.get('w1').description, 'edited offline');
  ok('WO1: status edit survives', A.get('w1').status, 'Scheduled');
  // A reconnects → sweep pushes the dirty WO
  A.push(cloud);
  ok('WO1: cloud now has the edit', cloud.rows.w1.description, 'edited offline');
  B.pull(cloud);
  ok('WO1: B converges to the edit', B.get('w1').description, 'edited offline');
})();

// 3) ★ WO2 — a STALE long-open tab B must not re-push its old WO over A's newer edit
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud);
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'v1',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:00:00Z',_synced:false});
  A.push(cloud); B.pull(cloud);                    // B now holds v1, clean in its snapshot
  // A edits + pushes
  A.save('w1', function(w){ w.woNumber='WO-1'; w.customerName='Acme'; w.description='v2-from-A'; w.status='New'; w.siteAddr='1 Main'; w.laborRate=125; w.taxRate=0; w.assignedTechs=[]; });
  A.push(cloud);
  ok('WO2: cloud has A\'s edit', cloud.rows.w1.description, 'v2-from-A');
  // B (untouched, stale) runs its background sweep — must NOT re-push v1
  B.push(cloud);
  ok('WO2: stale B did NOT clobber cloud', cloud.rows.w1.description, 'v2-from-A');
  B.pull(cloud);
  ok('WO2: B converges to A\'s edit', B.get('w1').description, 'v2-from-A');
})();

// 4) RELOAD (r34 parity): a fresh session with STALE localStorage must push NOTHING before it pulls
(function(){
  var cloud=freshCloud(), A=makeClient('A');
  A.pull(cloud);
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'good-name',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:30:00Z',_synced:false});
  A.push(cloud);
  ok('RELOAD: cloud starts good', cloud.rows.w1.description, 'good-name');
  var B=makeClient('B');                            // fresh reload, ready=false
  B.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'STALE-name',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:00:00Z'}); // stale from localStorage
  B.push(cloud);                                    // load-time sweep BEFORE pull (ready=false) → no-op
  ok('RELOAD: stale fresh-load sweep does NOT clobber', cloud.rows.w1.description, 'good-name');
  B.pull(cloud);
  ok('RELOAD: B converges to good name', B.get('w1').description, 'good-name');
})();

// 5) DELETE is not resurrected by a stale tab
(function(){
  var cloud=freshCloud(), A=makeClient('A'), B=makeClient('B');
  A.pull(cloud);
  A.db.push({id:'w1',woNumber:'WO-1',customerName:'Acme',description:'live',status:'New',siteAddr:'1 Main',laborRate:125,taxRate:0,assignedTechs:[],updatedAt:'2026-10-30T10:00:00Z',_synced:false});
  A.push(cloud); B.pull(cloud);
  A.del('w1'); cloud.deleted.w1=true; delete cloud.rows.w1;
  B.push(cloud);                                    // stale B sweep must not re-create
  ok('DELETE: stale B does not resurrect', !!cloud.rows.w1, false);
  B.pull(cloud);
  ok('DELETE: B drops w1', B.get('w1'), undefined);
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
