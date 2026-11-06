// #6 (Dawn) — the tech Time Clock job list was "all jacked up": _woToJob names a job after the WO
// DESCRIPTION, falling back to the WO number only when the description is blank, so rows showed either a
// bare "WO-1474" or a description with no number. _fieldJobLabel / _fieldJobTitleHtml now make every
// row + picker option read the same way: WO number first, then the description when there is a real one.
// Loads the REAL helpers from field.js.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/field.js', 'utf8');
function fn(name){ var s=src.indexOf('function '+name+'('); if(s<0){console.log('MISSING '+name);process.exit(1);} var e=src.indexOf('\nfunction ', s+10); return src.slice(s, e<0?undefined:e); }
global.escHtml = function(s){ return String(s==null?'':s); };   // identity escaper for the assertions
eval(fn('_fieldJobLabel'));
eval(fn('_fieldJobTitleHtml'));

let pass=0, fail=0;
function ok(n,g,w){ if(g===w){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }
function okTrue(n,g){ ok(n, !!g, true); }

// WO WITH a description → "WO# · description"
var withDesc = { woNumber:'WO-1005', name:'Test Cable in Front Lobby' };
ok('label: number + description', _fieldJobLabel(withDesc), 'WO-1005 · Test Cable in Front Lobby');
okTrue('titleHtml shows the WO number', _fieldJobTitleHtml(withDesc).indexOf('WO-1005')>=0);
okTrue('titleHtml shows the description', _fieldJobTitleHtml(withDesc).indexOf('Test Cable in Front Lobby')>=0);

// WO with NO description (name fell back to the number) → just the number, NOT "WO-1474 · WO-1474"
var noDesc = { woNumber:'WO-1474', name:'WO-1474' };
ok('label: no description → just the number (no dup)', _fieldJobLabel(noDesc), 'WO-1474');
ok('titleHtml: no description → number only', _fieldJobTitleHtml(noDesc), '<span style="color:#1565c0">WO-1474</span>');

// description present but equals '' (truly blank)
ok('label: blank name → just the number', _fieldJobLabel({woNumber:'WO-9', name:''}), 'WO-9');

// edge: no number but a description (shouldn't happen for WOs, but be safe)
ok('label: no number, has description → description', _fieldJobLabel({woNumber:'', name:'Loose job'}), 'Loose job');

// edge: nothing at all
ok('label: empty → "Work Order"', _fieldJobLabel({woNumber:'', name:''}), 'Work Order');
ok('titleHtml: empty → "Work Order"', _fieldJobTitleHtml({woNumber:'', name:''}).indexOf('Work Order')>=0, true);

// teeth: the two screenshot cases that looked inconsistent now BOTH start with their WO number
okTrue('teeth: a described WO and a bare-number WO now both lead with WO#',
  _fieldJobLabel(withDesc).startsWith('WO-1005') && _fieldJobLabel(noDesc).startsWith('WO-1474'));

// the list + all three pickers use the shared helpers (no drift)
ok('job list uses _fieldJobTitleHtml', /field-my-jobs[\s\S]{0,600}_fieldJobTitleHtml\(j\)/.test(src), true);
ok('clock-in picker uses _fieldJobLabel', /opt\.textContent=_fieldJobLabel\(j\)/.test(src), true);
ok('next-job + office pickers use _fieldJobLabel', (src.match(/_fieldJobLabel\(j\)\+\(j\.customer/g)||[]).length >= 2, true);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
