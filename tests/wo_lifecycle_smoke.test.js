// ============================================================================
// PILOT SMOKE TEST — the office↔field work-order lifecycle, end to end.
// ============================================================================
// This is the ONE test that walks the exact demo happy-path and goes green or
// names the step that broke. It stitches the REAL business-logic functions
// (workorders.js: _statusesSettableByUser, _isWOLocked, _woStatusIsFinished,
// _inProgressStatusId, autoPromoteWOStatus) together with the REAL sync engine
// (auth.js: _lwwMerge + the changed-only/ready-gated sweep) across TWO clients —
// an office device and a tech device — so a break in the HAND-OFF between steps
// is caught, not just each step in isolation.
//
// Scope: claude/PILOT-SCOPE-definition-of-done-2026-11.md
// What it proves: lifecycle logic + the cross-device hand-offs, in ~instant, every
// build. What it does NOT prove: that the on-screen buttons are wired and render
// (that is the browser-on-staging smoke test — the next tool). Honest by design.
// ============================================================================
const fs = require('fs');
const AUTH = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const WORK = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');

// ---- pull the REAL sync helpers (same slice the WO-lifecycle net uses) ----
const hStart = AUTH.indexOf('function _tsMs(');
const hEnd   = AUTH.indexOf('function _quoteExtras(');
if (hStart < 0 || hEnd < 0) { console.log('✗ could not locate sync helpers in auth.js'); process.exit(1); }
const HELPERS = AUTH.slice(hStart, hEnd);

// ---- pull a REAL workorders.js function body by name ----
function woFn(name){
  var s = WORK.indexOf('\nfunction '+name+'('); if (s<0) s = WORK.indexOf('function '+name+'(');
  if (s<0){ console.log('✗ missing '+name+' in workorders.js'); process.exit(1); }
  var e = WORK.indexOf('\nfunction ', s+10);
  return WORK.slice(s, e<0?undefined:e);
}

// ---- cloud row shape (what _pushWOToCloud sends) <-> in-memory WO (what the pull maps) ----
function toCloud(wo){
  return { id:wo.id, wo_number:wo.woNumber, customer_id:wo.customerId||null, customer_name:wo.customerName||null,
    description:wo.description||null, work_performed:wo.workPerformed||null, status:wo.status||'New',
    site_address:wo.siteAddr||null, labor_rate:wo.laborRate||null, tax_rate:wo.taxRate||null,
    assigned_techs:wo.assignedTechs||[], updated_at:wo.updatedAt };
}
function fromCloud(r){
  return { id:r.id, woNumber:r.wo_number, customerId:r.customer_id, customerName:r.customer_name,
    description:r.description, workPerformed:r.work_performed, status:r.status, siteAddr:r.site_address,
    laborRate:r.labor_rate, taxRate:r.tax_rate, assignedTechs:r.assigned_techs||[], updatedAt:r.updated_at };
}

// ---- the status config Joe actually runs (subset, same shape as live woSettings) ----
const STATUSES = [
  {id:'New',                             open:true,  mobile:true },
  {id:'Open- "In Progress"',             open:true,  mobile:true },
  {id:'Open -- Waiting on Customer',     open:true,  mobile:true },
  {id:'Open -- Ready For Office-Review', open:true,  mobile:true },
  {id:'Open -- Ready For Pricing',       open:true,  mobile:false},
  {id:'Open -- Ready For Invoicing',     open:true,  mobile:false},
  {id:'Void',                            open:false, mobile:false},
  {id:'BILLED',                          open:false, mobile:false}
];

// A monotonic clock so each save's updated_at strictly increases → LWW converges deterministically.
var _clk = 0;
function stamp(){ return new Date(Date.parse('2027-01-01T00:00:00Z') + (++_clk)*1000).toISOString(); }

// One client = one device. Carries its OWN copy of the real sync helpers + its own db/tombstones,
// exactly like the proven WO-lifecycle net. We point the global DB at whichever device is "acting"
// before driving a real handler on it.
function makeDevice(name){
  var _tsMs,_lwwMerge,_recHash,_WO_HASH_KEYS,_woHash,_officeSnap,_officeSnapReady,_officeMarkSynced,_officeDirty;
  eval(HELPERS);
  return {
    name:name, db:[], tomb:{}, ready:false,
    dirty:function(w){ return _officeDirty('work_orders', w); },
    mark:function(w){ return _officeMarkSynced('work_orders', w); },
    get:function(id){ return this.db.find(function(w){return w&&w.id===id;}); },
    push:function(cloud){
      var self=this; if(!this.ready) return;
      this.db.forEach(function(w){
        if(!w||w.id==null||self.tomb[w.id]) return;
        if(!self.dirty(w)) return;
        if(cloud.deleted[w.id]) return;
        cloud.rows[w.id]=toCloud(w); self.mark(w);
      });
    },
    pull:function(cloud){
      var self=this;
      var cloudWOs = Object.keys(cloud.rows).filter(function(id){return !cloud.deleted[id];})
        .map(function(id){ return fromCloud(cloud.rows[id]); });
      cloudWOs.forEach(function(cw){ cw._synced=true; self.mark(cw); });
      var cloudIds={}; cloudWOs.forEach(function(w){cloudIds[w.id]=1;});
      var localOnly=this.db.filter(function(w){ return w && w.id && !cloudIds[w.id] && !cloud.deleted[w.id] && !self.tomb[w.id] && (w._synced!==true || self.dirty(w)); });
      this.db=_lwwMerge(cloudWOs, this.db, localOnly);
      this.ready=true;
    }
  };
}
function freshCloud(){ return { rows:{}, deleted:{} }; }

// ---- global environment the real workorders.js functions expect ----
var _perm = {};
global.DB = { workOrders:[], woSettings:{ statuses: STATUSES } };
global.WO_STATUSES = STATUSES;
global.hasPermission = function(k){ return !!_perm[k]; };
global.saveDB = function(){};
global.showToast = function(){};
global.auditWOStatus = function(){};
global.getTodayISO = function(){ return '2026-11-01'; };
global.renderWorkOrders = function(){};
global._sb = null; global._currentUser = null;
global.document = { getElementById:function(){ return null; }, createElement:function(){ return {}; } };

// _pushWOToCloud: the immediate push a real save/auto-promote fires. Writes this device's WO to the
// shared cloud and marks it synced on the ACTING device (set via global __acting).
var __cloud = null, __acting = null;
global._pushWOToCloud = function(wo){
  if (!__cloud || !wo) return;
  wo.updatedAt = stamp();                 // a real save bumps updated_at; carry it to the cloud row
  __cloud.rows[wo.id] = toCloud(wo);
  if (__acting) __acting.mark(wo);        // clean on this device so its sweep won't re-push stale
};

// load the REAL functions into this scope
eval(woFn('_getWOStatuses'));
eval(woFn('_getWOStatusDef'));
eval(woFn('_statusesSettableByUser'));
eval(woFn('_isWOLocked'));
eval(woFn('_woStatusIsFinished'));
eval(woFn('_inProgressStatusId'));
eval(woFn('autoPromoteWOStatus'));

// act "as" a device: point the global DB at its data + perms, so real handlers operate on it
function act(device, perms){ __acting = device; DB.workOrders = device.db; _perm = perms||{}; }

let pass=0, fail=0, brokeAt=null;
function ok(step,n,g,w){
  if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ ['+step+'] '+n);}
  else {fail++; if(!brokeAt) brokeAt=step; console.log('  ✗ ['+step+'] '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));}
}

console.log('── PILOT SMOKE: office↔field work-order lifecycle (one demo, end to end) ──');

var cloud = freshCloud();
__cloud = cloud;                 // wire the immediate-push stub to this run's shared cloud
var office = makeDevice('office');
var tech   = makeDevice('tech');
office.pull(cloud);               // both devices start ready (logged in, first sync done)
tech.pull(cloud);

// STEP 1 — OFFICE creates a work order and assigns the tech (dispatch).
act(office, {'wo.change_status':1});
office.db.push({ id:'wo-demo', woNumber:'WO-2001', customerName:'Riverside Mall',
  description:'Camera 4 offline — no image', status:'New', siteAddr:'500 River Rd',
  laborRate:125, taxRate:0, assignedTechs:['PT'], updatedAt:stamp(), _synced:false });
office.push(cloud);
ok('1·create', 'WO exists in cloud as New, assigned to PT',
   cloud.rows['wo-demo'] && [cloud.rows['wo-demo'].status, cloud.rows['wo-demo'].assigned_techs], ['New',['PT']]);

// STEP 2 — the TECH's device sees it (the cross-device hand-off; r57 makes this fast live).
tech.pull(cloud);
var t = tech.get('wo-demo');
ok('2·tech-sees', 'assigned WO reached the tech device', !!t, true);
ok('2·tech-sees', 'tech sees it still New',  t && t.status, 'New');
ok('2·tech-sees', 'tech sees the assignment', t && t.assignedTechs, ['PT']);

// STEP 3 — field permissions: the tech may set ONLY mobile statuses, never a closed/office one.
act(tech, {'wo.status_field':1});
var techCanSet = _statusesSettableByUser().map(function(s){return s.id;});
ok('3·perms', 'tech can set the mobile field statuses', techCanSet.length, 4);
ok('3·perms', 'tech CANNOT set BILLED (office-only, closed)', techCanSet.indexOf('BILLED')<0, true);
ok('3·perms', 'tech CANNOT set Ready For Pricing (office-only)', techCanSet.indexOf('Open -- Ready For Pricing')<0, true);

// STEP 4 — the tech CLOCKS IN against the WO → it auto-advances New → In Progress.
autoPromoteWOStatus('wo-demo');
ok('4·clock-in', 'clock-in auto-advanced New → In Progress', tech.get('wo-demo').status, 'Open- "In Progress"');
tech.push(cloud);
ok('4·clock-in', 'the promotion reached the cloud', cloud.rows['wo-demo'].status, 'Open- "In Progress"');

// STEP 5 — tech does the work and marks it ready for the office (a mobile status the tech may set).
var wantReview = 'Open -- Ready For Office-Review';
ok('5·field-done', 'Ready-For-Office-Review IS a status the tech may set', techCanSet.indexOf(wantReview)>=0, true);
var tw = tech.get('wo-demo'); tw.status = wantReview; _pushWOToCloud(tw);
ok('5·field-done', 'tech handed it back to the office (cloud shows Office-Review)', cloud.rows['wo-demo'].status, wantReview);

// STEP 6 — the OFFICE sees the tech's update live and advances it through pricing → invoicing.
office.pull(cloud);
ok('6·office-sees', 'office converged to the tech\'s Office-Review', office.get('wo-demo').status, wantReview);
act(office, {'wo.change_status':1});
var ow = office.get('wo-demo');
ok('6·office-flow', 'WO is NOT locked while active (office can still edit)', _isWOLocked(ow), false);
['Open -- Ready For Pricing','Open -- Ready For Invoicing'].forEach(function(next){
  ok('6·office-flow', 'office may set "'+next+'"', _statusesSettableByUser().some(function(s){return s.id===next;}), true);
  ow.status = next; _pushWOToCloud(ow);
});
ok('6·office-flow', 'cloud reflects Ready For Invoicing', cloud.rows['wo-demo'].status, 'Open -- Ready For Invoicing');

// STEP 7 — the job is billed/closed → it locks to view-only and drops off the tech's active list.
ow.status = 'BILLED'; _pushWOToCloud(ow);
ok('7·close', 'a billed WO is LOCKED (view-only, reopen needs permission)', _isWOLocked(ow), true);
ok('7·close', 'a billed WO counts FINISHED (drops off the tech list)', _woStatusIsFinished('BILLED'), true);
ok('7·close', 'an active WO would NOT be finished', _woStatusIsFinished('Open- "In Progress"'), false);
tech.pull(cloud);
ok('7·close', 'tech device converges to BILLED', tech.get('wo-demo').status, 'BILLED');

console.log('\n'+(fail
  ? '✗ PILOT SMOKE FAILED — first broken step: '+brokeAt+'  ('+fail+' failed, '+pass+' passed)'
  : 'ALL '+pass+' PASSED — the full office↔field lifecycle holds together end to end'));
process.exit(fail?1:0);
