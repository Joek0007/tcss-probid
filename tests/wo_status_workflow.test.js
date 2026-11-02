// r54 — WO status workflow. Loads the REAL helpers from workorders.js and checks: which statuses each
// role may set (office=all, field tech=mobile-only, none otherwise), closed=locked detection, the
// configured In-Progress id, and auto-promote NEW→In-Progress (only from NEW, never backward).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');
function fn(name){
  var s = src.indexOf('\nfunction '+name+'('); if (s<0) s = src.indexOf('function '+name+'(');
  if (s<0){ console.log('✗ missing '+name); process.exit(1); }
  var e = src.indexOf('\nfunction ', s+10);
  return src.slice(s, e<0?undefined:e);
}

// ---- stubs ----
global.DB = { workOrders:[], woSettings:{ statuses:[
  {id:'NEW',                            open:true,  mobile:true },
  {id:'Open- "In Progress"',            open:true,  mobile:true },
  {id:'Open -- Waiting on Customer',    open:true,  mobile:true },
  {id:'Open -- Ready For Office-Review',open:true,  mobile:true },
  {id:'Open -- Ready For Pricing',      open:true,  mobile:false},
  {id:'BILLED',                         open:false, mobile:false},
  {id:'Void',                           open:false, mobile:false}
]}};
global._getWOStatuses = function(){ return DB.woSettings.statuses; };
global._getWOStatusDef = function(id){ if(!id) return {open:true}; return DB.woSettings.statuses.find(function(s){ return s.id===id || s.id.toLowerCase()===id.toLowerCase(); }) || {open:false}; };
var _perm = {}; global.hasPermission = function(k){ return !!_perm[k]; };
global.saveDB=function(){}; global.showToast=function(){}; global.auditWOStatus=function(){};
global.renderWorkOrders=function(){}; global.getTodayISO=function(){ return '2026-11-01'; };
global._pushWOToCloud=function(){}; global._sb=null; global._currentUser=null;
global.document = { getElementById:function(){ return null; } };

eval(fn('_statusesSettableByUser'));
eval(fn('_isWOLocked'));
eval(fn('_woStatusIsFinished'));
eval(fn('_inProgressStatusId'));
eval(fn('autoPromoteWOStatus'));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }
function setPerm(p){ _perm = p||{}; }

// ---- In-Progress id ----
ok('finds configured In-Progress status', _inProgressStatusId(), 'Open- "In Progress"');

// ---- locked detection ----
ok('BILLED is locked',  _isWOLocked({status:'BILLED'}), true);
ok('Void is locked',    _isWOLocked({status:'Void'}),   true);
ok('NEW not locked',    _isWOLocked({status:'NEW'}),    false);
ok('In-Progress not locked', _isWOLocked({status:'Open- "In Progress"'}), false);
// r55: an orphan/legacy status NOT in the configured list must NOT lock (don't freeze active/legacy WOs
// like "OPEN"/"Invoiced"/"Completed" that aren't in settings). Lock is for configured closed statuses only.
ok('orphan status NOT in list → NOT locked', _isWOLocked({status:'Completed (legacy)'}), false);
ok('orphan "OPEN" (active, not in list) → NOT locked', _isWOLocked({status:'OPEN'}), false);

// ---- settable by role ----
setPerm({ 'wo.change_status':true });
ok('office (change_status) → all 7', _statusesSettableByUser().length, 7);
setPerm({ 'wo.status_field':true });
var fieldSet = _statusesSettableByUser().map(function(s){ return s.id; });
ok('field tech → mobile-only (4)', fieldSet.length, 4);
ok('field set includes In-Progress', fieldSet.indexOf('Open- "In Progress"')>=0, true);
ok('field set includes Ready For Office-Review', fieldSet.indexOf('Open -- Ready For Office-Review')>=0, true);
ok('field set EXCLUDES BILLED', fieldSet.indexOf('BILLED')<0, true);
ok('field set EXCLUDES Ready For Pricing (not mobile)', fieldSet.indexOf('Open -- Ready For Pricing')<0, true);
setPerm({});
ok('no permission → nothing settable', _statusesSettableByUser().length, 0);

// ---- auto-promote NEW → In-Progress ----
setPerm({});
DB.workOrders = [{ id:'wo1', woNumber:'WO-1', status:'NEW' }];
autoPromoteWOStatus('wo1');
ok('NEW promoted to In-Progress', DB.workOrders[0].status, 'Open- "In Progress"');

DB.workOrders = [{ id:'wo2', woNumber:'WO-2', status:'Open -- Ready For Office-Review' }];
autoPromoteWOStatus('wo2');
ok('further-along status NOT moved backward', DB.workOrders[0].status, 'Open -- Ready For Office-Review');

DB.workOrders = [{ id:'wo3', woNumber:'WO-3', status:'BILLED' }];
autoPromoteWOStatus('wo3');
ok('closed status not promoted', DB.workOrders[0].status, 'BILLED');

autoPromoteWOStatus('nope');  // unknown id → no throw
ok('unknown WO id is a safe no-op', true, true);

// ---- r56: finished-status filter for a tech's active list ----
ok('NEW is active (not finished)',        _woStatusIsFinished('NEW'), false);
ok('In-Progress is active',               _woStatusIsFinished('Open- "In Progress"'), false);
ok('legacy "OPEN" stays active',          _woStatusIsFinished('OPEN'), false);
ok('RMA stays active',                    _woStatusIsFinished('*** RMA ***'), false);
ok('BILLED is finished (hidden)',         _woStatusIsFinished('BILLED'), true);
ok('Void is finished',                    _woStatusIsFinished('Void'), true);
ok('legacy Invoiced is finished',         _woStatusIsFinished('Invoiced'), true);
ok('legacy Completed is finished',        _woStatusIsFinished('Completed'), true);
ok('empty status → not finished',         _woStatusIsFinished(''), false);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
