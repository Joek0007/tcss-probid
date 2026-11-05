// WS-3a (r75) — changed-only push for WO children. Loads the REAL _CHILD_HASH_KEYS, _childHash,
// _officeHashFor, _officeMarkSynced, _officeDirty from auth.js and proves:
//   1. a cloud-PULLED row and the same row after a LOCAL save hash IDENTICALLY (no permanent-dirty
//      trap — the reason _woHash/_childHash exist: null vs undefined vs '' all collapse);
//   2. an unchanged child (seeded from the pull) is SKIPPED by the sweep (the stale-clobber fix);
//   3. a real content edit flips dirty→push;
//   4. local-only flags (_synced, *IsHtml) never dirty a row;
//   5. a brand-new local row (never seeded) pushes.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
function fn(name){ var s=src.indexOf('function '+name+'('); if(s<0){console.log('✗ missing '+name);process.exit(1);} var e=src.indexOf('\nfunction ', s+10); return src.slice(s, e<0?undefined:e); }
function objBlock(name){ var s=src.indexOf('var '+name+' = {'); if(s<0){console.log('✗ missing '+name);process.exit(1);} var e=src.indexOf('\n};', s); return src.slice(s, e+3); }

global._officeSnap = { quotes:{}, customers:{}, contacts:{}, work_orders:{}, invoices:{}, wo_parts:{}, wo_labor:{}, wo_expenses:{}, wo_checklist:{}, time_entries:{}, app_work_days:{} };
global._woHash = function(){ return 'WO'; };           // stub — child tests never hit the work_orders branch
eval(fn('_recHash'));
eval(objBlock('_CHILD_HASH_KEYS'));
eval(fn('_childHash'));
eval(fn('_officeHashFor'));
eval(fn('_officeMarkSynced'));
eval(fn('_officeDirty'));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// A WO part as the PULL mapper produces it (nulls for absent optional fields, _synced:true).
var pulledPart = { id:'wop-1', woId:'wo-9', name:'Cat6 cable', partNum:null, qty:2, unit:null, unitCost:45, status:'requested', notes:null, requestedBy:'Lisa', itemId:null, source:null, fromLocation:null, createdAt:'2026-11-05T00:00:00Z', _synced:true };
// The SAME logical part as a local save shape produces it (optional fields undefined, no _synced).
var localPart  = { id:'wop-1', woId:'wo-9', name:'Cat6 cable', qty:2, unitCost:45, status:'requested', requestedBy:'Lisa', createdAt:'2026-11-05T00:00:00Z' };

console.log('\n1. permanent-dirty trap avoided (pull-shape vs local-shape hash identically):');
ok('pulled part hash === local part hash', _childHash('wo_parts', pulledPart), _childHash('wo_parts', localPart));

console.log('\n2. unchanged child is skipped after pull-seed (the stale-clobber fix):');
_officeMarkSynced('wo_parts', pulledPart);                 // seed from the pull
ok('seeded pulled row → not dirty', _officeDirty('wo_parts', pulledPart), false);
ok('same row via local shape → not dirty', _officeDirty('wo_parts', localPart), false);

console.log('\n3. a real content edit flips to dirty (pushes):');
var edited = Object.assign({}, localPart, { status:'ordered' });
ok('status change → dirty', _officeDirty('wo_parts', edited), true);
var editedQty = Object.assign({}, localPart, { qty:5 });
ok('qty change → dirty', _officeDirty('wo_parts', editedQty), true);

console.log('\n4. local-only flags never dirty a row:');
var flagged = Object.assign({}, localPart, { _synced:false, _rev:7, descriptionIsHtml:true });
ok('toggling _synced/_rev/html flags → not dirty', _officeDirty('wo_parts', flagged), false);

console.log('\n5. brand-new local row (never seeded) pushes:');
ok('unseeded new part → dirty', _officeDirty('wo_parts', { id:'wop-NEW', woId:'wo-9', name:'Jack', qty:1 }), true);

console.log('\n6. same discipline holds for labor / expenses / checklist:');
var pulledChk = { id:'wc-1', woId:'wo-9', item:'Test circuit', completed:false, completedBy:null, completedAt:null, createdAt:'x', _synced:true };
var localChk  = { id:'wc-1', woId:'wo-9', item:'Test circuit', completed:false, createdAt:'x' };
ok('checklist pull-shape === local-shape', _childHash('wo_checklist', pulledChk), _childHash('wo_checklist', localChk));
_officeMarkSynced('wo_checklist', pulledChk);
ok('checklist unchanged → not dirty', _officeDirty('wo_checklist', localChk), false);
ok('checklist toggle completed → dirty', _officeDirty('wo_checklist', Object.assign({}, localChk, {completed:true})), true);

var pulledExp = { id:'we-1', woId:'wo-9', category:'Materials', description:'wire', amount:30, paymentType:'card', date:'2026-11-01', loggedBy:'Lisa', receiptUrl:null, receiptDocId:null, _synced:true };
var localExp  = { id:'we-1', woId:'wo-9', category:'Materials', description:'wire', amount:30, paymentType:'card', date:'2026-11-01', loggedBy:'Lisa' };
ok('expense pull-shape === local-shape', _childHash('wo_expenses', pulledExp), _childHash('wo_expenses', localExp));
_officeMarkSynced('wo_expenses', pulledExp);
ok('expense unchanged → not dirty', _officeDirty('wo_expenses', localExp), false);
ok('expense amount edit → dirty', _officeDirty('wo_expenses', Object.assign({}, localExp, {amount:45})), true);

console.log('\n7. WS-3a-ii payroll tables (time_entries, app_work_days):');
// time_entries: pull-shape vs local-edit-shape hash identically; substantive edit dirties; audit-blob-only does NOT (documented tradeoff — avoids churning 19k payroll rows).
var pulledTE = { id:'te-1', techName:'Lisa', date:'2026-11-05', entryType:'regular', startTime:'08:00', endTime:'16:00', totalHours:8, totalMins:480, isPaid:false, woId:'wo-9', jobId:null, woLabel:null, notes:null, gpsReason:null, isManual:false, userId:null, teamMemberId:null, clockIn:null, clockOut:null, breakMinutes:0, gpsLat:null, gpsLng:null, isApproved:false, approvedBy:null, deleted:false, deletedBy:null, deletedAt:null, auditTrail:[{a:1}], lastEditedAt:'t1', createdAt:'c', _synced:true };
var localTE  = { id:'te-1', techName:'Lisa', date:'2026-11-05', entryType:'regular', startTime:'08:00', endTime:'16:00', totalHours:8, totalMins:480, woId:'wo-9', isManual:false, isApproved:false, breakMinutes:0, createdAt:'c' };
ok('time_entry pull-shape === local-shape', _childHash('time_entries', pulledTE), _childHash('time_entries', localTE));
_officeMarkSynced('time_entries', pulledTE);
ok('time_entry unchanged → not dirty', _officeDirty('time_entries', localTE), false);
ok('time_entry hours edit → dirty', _officeDirty('time_entries', Object.assign({}, localTE, {totalHours:9, totalMins:540})), true);
ok('time_entry approval → dirty', _officeDirty('time_entries', Object.assign({}, localTE, {isApproved:true})), true);
ok('time_entry soft-delete → dirty', _officeDirty('time_entries', Object.assign({}, localTE, {deleted:true})), true);
ok('time_entry audit-blob-only change → NOT dirty (no churn)', _officeDirty('time_entries', Object.assign({}, localTE, {auditTrail:[{a:1},{b:2}], lastEditedAt:'t2'})), false);

var pulledWD = { id:'wd-1', techName:'Lisa', techId:'tm-3', date:'2026-11-05', totalPaidMins:480, onsiteMins:400, travelMins:60, breakMins:0, lunchMins:30, officeMins:20, ptoMins:0, vacationMins:0, holidayMins:0, jobName:'Acme', jobId:'wo-9', dayType:'work', approved:false, approvedBy:null, lunchFlagged:false, hasManualEntries:false, autoStopped:false, corrected:false, workNote:'', noteLocked:false, dayLocked:false, payrollUnlocked:false, corrections:null, events:[{e:1}], lockAudit:null };
var localWD  = { id:'wd-1', techName:'Lisa', techId:'tm-3', date:'2026-11-05', totalPaidMins:480, onsiteMins:400, travelMins:60, lunchMins:30, officeMins:20, jobName:'Acme', jobId:'wo-9', dayType:'work' };
ok('work_day pull-shape === local-shape', _childHash('app_work_days', pulledWD), _childHash('app_work_days', localWD));
_officeMarkSynced('app_work_days', pulledWD);
ok('work_day unchanged → not dirty', _officeDirty('app_work_days', localWD), false);
ok('work_day minutes correction → dirty', _officeDirty('app_work_days', Object.assign({}, localWD, {totalPaidMins:500})), true);
ok('work_day lock → dirty', _officeDirty('app_work_days', Object.assign({}, localWD, {dayLocked:true})), true);
ok('work_day corrected flag → dirty', _officeDirty('app_work_days', Object.assign({}, localWD, {corrected:true})), true);

console.log('\n'+(fail===0?('ALL '+pass+' PASSED'):(fail+' FAILED, '+pass+' passed')));
process.exit(fail===0?0:1);
