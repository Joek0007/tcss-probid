// r48 — day lock (payroll-integrity lock: Open → soft-locked → payroll-sealed). Loads the REAL pure
// helpers _dayIsLocked + _applyDayLock from worktracking.js and checks the three-tier model:
//   • soft lock/unlock needs time.correct (canCorrect)
//   • a day whose pay period is processed is SEALED (locked) until deliberately reopened
//   • reopening a sealed day needs payroll.unlock (canUnlockProcessed); every lock/unlock is audited
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');
var s = src.indexOf('function _dayIsLocked(');
var e = src.indexOf('function _applyWorkNote(') > s ? src.length : src.indexOf('function _workNoteHTML(');
if (s < 0) { console.log('✗ _dayIsLocked not found'); process.exit(1); }
eval(src.slice(s, src.indexOf('function _workNoteHTML(')));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

var OFFICE = { name:'Dawn B.', canCorrect:true,  canUnlockProcessed:false }; // time.correct only
var TECHLEAD= { name:'Lead',   canCorrect:false, canUnlockProcessed:false }; // neither
var ADMIN  = { name:'Joe K.',  canCorrect:true,  canUnlockProcessed:true  }; // owner: both

// ---- _dayIsLocked ----
ok('open day not locked', _dayIsLocked({}, false), false);
ok('soft-locked day is locked', _dayIsLocked({dayLocked:true}, false), true);
ok('processed day is sealed/locked', _dayIsLocked({}, true), true);
ok('processed+reopened not locked', _dayIsLocked({payrollUnlocked:true}, true), false);
ok('no wd but processed → locked', _dayIsLocked(null, true), true);
ok('no wd not processed → not locked', _dayIsLocked(null, false), false);

// ---- lock (soft) ----
var d = { id:'wd1', techName:'Lisa L.' };
ok('tech/lead cannot lock', _applyDayLock(d,'lock',TECHLEAD,false).reason, 'no_perm');
ok('office locks', _applyDayLock(d,'lock',OFFICE,false).ok, true);
ok('dayLocked set', d.dayLocked, true);
ok('lock audited', d.lockAudit.length, 1);
ok('audit action lock', d.lockAudit[0].action, 'lock');

// ---- unlock (soft, not processed) ----
ok('lead cannot unlock', _applyDayLock(d,'unlock',TECHLEAD,false).reason, 'no_perm');
ok('office unlocks soft', _applyDayLock(d,'unlock',OFFICE,false).ok, true);
ok('dayLocked cleared', d.dayLocked, false);
ok('unlock audited', d.lockAudit.length, 2);

// ---- processed (sealed) day ----
var p = { id:'wd2', techName:'Lisa L.' };
// office (no payroll.unlock) tries to reopen a processed day → blocked
ok('office cannot reopen sealed', _applyDayLock(p,'unlock',OFFICE,true).reason, 'need_payroll_unlock');
ok('sealed not reopened by office', !!p.payrollUnlocked, false);
// admin with payroll.unlock reopens it
var ra = _applyDayLock(p,'unlock',ADMIN,true);
ok('admin reopens sealed', ra.ok, true);
ok('payrollUnlocked set', p.payrollUnlocked, true);
ok('reopen audit flags afterProcessed', p.lockAudit[p.lockAudit.length-1].afterProcessed, true);
// now it's editable again
ok('reopened day no longer locked', _dayIsLocked(p, true), false);
// re-locking it (office can) seals the edit again
ok('office can re-lock reopened day', _applyDayLock(p,'lock',OFFICE,true).ok, true);
ok('re-locked day locked', _dayIsLocked(p, true), true);

// ---- guards ----
ok('null wd → not_found', _applyDayLock(null,'lock',ADMIN,false).reason, 'not_found');
ok('bad action rejected', _applyDayLock({id:'z'},'frobnicate',ADMIN,false).reason, 'bad_action');

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
