// r46/r48 — field-tech work notes. The tech owns the note on their own day; a note-editor (time.editnotes
// = office/manager) can edit any day's note. EVERY change is audited. As of r48, editing a note no longer
// auto-locks anything — "frozen" is the DAY lock (see day_lock.test.js), enforced by the edit gate BEFORE
// _applyWorkNote is called, so this pure function only enforces ownership + records the change.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');
var s = src.indexOf('function _applyWorkNote(');
var e = src.indexOf('function _dayIsLocked(');
if (s < 0 || e < 0) { console.log('✗ _applyWorkNote not found'); process.exit(1); }
eval(src.slice(s, e));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

var LISA  = { name:'Lisa L.',  canEditNotes:false };   // field tech
var TECH2 = { name:'Dawn Tech', canEditNotes:false };  // a different tech
var OFFICE= { name:'Dawn B.',   canEditNotes:true  };  // office/manager (time.editnotes)

// 1) Tech edits their OWN day → saved, audited, role=tech, NO lock side-effect (r48)
var d = { id:'wd1', techName:'Lisa L.' };
var r = _applyWorkNote(d, 'Replaced the compressor contactor, 2 lbs R-410A', LISA);
ok('tech edit own day → ok', r.ok, true);
ok('reason tech_saved', r.reason, 'tech_saved');
ok('note stored', d.workNote.indexOf('compressor')>=0, true);
ok('r48: tech edit does NOT set noteLocked', !!d.noteLocked, false);
ok('one audit row', d.noteAudit.length, 1);
ok('audit role tech', d.noteAudit[0].role, 'tech');

// 2) A DIFFERENT tech cannot edit it
ok('other tech blocked', _applyWorkNote(d, 'hijack', TECH2).reason, 'not_yours');

// 3) OFFICE edits → saved, role office, and (r48) does NOT lock the day
var r3 = _applyWorkNote(d, 'Replaced compressor contactor; verified charge.', OFFICE);
ok('office edit ok', r3.ok, true);
ok('reason office_saved', r3.reason, 'office_saved');
ok('r48: office edit does NOT auto-lock', !!d.noteLocked, false);
ok('audit role office', d.noteAudit[1].role, 'office');

// 4) Tech can STILL edit after an office edit (no auto-lock) — locking is now a separate day action
var r4 = _applyWorkNote(d, 'Added: checked the disconnect too', LISA);
ok('tech still edits after office (no auto-lock)', r4.ok, true);
ok('three audit rows', d.noteAudit.length, 3);
ok('audit keeps prev', d.noteAudit[2].prev.indexOf('verified charge')>=0, true);

// 5) No-op when identical / whitespace trim
ok('identical → nochange', _applyWorkNote(d, d.workNote, OFFICE).reason, 'nochange');
ok('trim → nochange', _applyWorkNote({id:'x',techName:'Lisa L.',workNote:'done'}, '  done  ', LISA).reason, 'nochange');

// 6) null day; empty actor
ok('null wd → not_found', _applyWorkNote(null, 'x', OFFICE).reason, 'not_found');
ok('empty actor blocked', _applyWorkNote({id:'z',techName:'X'}, 'hi', {}).reason, 'not_yours');

// 7) Office can CLEAR a note (empty text), audited
var d7 = { id:'wd7', techName:'Lisa L.', workNote:'oops' };
var r7 = _applyWorkNote(d7, '', OFFICE);
ok('office clear ok', r7.ok, true);
ok('note cleared', d7.workNote, '');
ok('clear audited', d7.noteAudit.length, 1);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
