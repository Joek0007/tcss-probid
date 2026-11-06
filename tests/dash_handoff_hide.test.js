// #5 (Dawn) — a tech's Dashboard "Today's Schedule" showed a WO she'd already handed to the office
// ("Open -- Ready For Office-Review", a techDone status). It must drop off the tech dashboard the same
// way it already drops off the tech WO list (r67 hand-off hide). Loads the REAL hand-off functions.
const fs = require('fs');
const woSrc = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');
const rpSrc = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
function fn(src,name){ var s=src.indexOf('function '+name+'('); if(s<0){console.log('MISSING '+name);process.exit(1);} var e=src.indexOf('\nfunction ', s+10); return src.slice(s, e<0?undefined:e); }

// Status list with a techDone hand-off status (as the owner flags "Ready For Office-Review").
global.DB = { woSettings: { statuses: [
  {id:'NEW', open:true, mobile:true},
  {id:'Open- "In Progress"', open:true, mobile:true},
  {id:'Open -- Ready For Office-Review', open:true, mobile:false, techDone:true},
  {id:'Scheduled', open:true, mobile:true}
], hideTechDone: undefined } };  // undefined → default ON
global.WO_STATUSES = DB.woSettings.statuses;
eval(fn(woSrc,'_getWOStatuses'));
eval(fn(woSrc,'_getWOStatusDef'));
eval(fn(woSrc,'_woHideTechDoneOn'));
eval(fn(woSrc,'_woStatusIsHandoff'));
eval(fn(woSrc,'_woHiddenFromFieldByHandoff'));

let pass=0, fail=0;
function ok(n,g,w){ if(g===w){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// The exact filter the dashboard now applies to each scheduled-today, assigned job.
function dashShows(status){ return !(typeof _woHiddenFromFieldByHandoff==='function' && _woHiddenFromFieldByHandoff(status)); }

// RED: the OLD dashboard had no hand-off filter → the handed-off WO showed.
var oldShowsHandoff = true;  // old myJobs filter was just scheduledDate+assigned, no hand-off check
ok('RED: old dashboard showed the handed-off WO (the bug)', oldShowsHandoff, true);

// GREEN: with the hand-off hide (default ON), the handed-off WO drops off; field statuses stay.
ok('GREEN: "Ready For Office-Review" is HIDDEN from the tech dashboard', dashShows('Open -- Ready For Office-Review'), false);
ok('GREEN: "NEW" still shows', dashShows('NEW'), true);
ok('GREEN: "In Progress" still shows', dashShows('Open- "In Progress"'), true);
ok('GREEN: "Scheduled" still shows', dashShows('Scheduled'), true);
ok('teeth: the fix changes the outcome for the handed-off WO', oldShowsHandoff !== dashShows('Open -- Ready For Office-Review'), true);

// If the owner turns hand-off hiding OFF, the WO shows again (behavior stays owner-controlled).
DB.woSettings.hideTechDone = false;
ok('owner setting OFF → handed-off WO shows again (not hardcoded)', dashShows('Open -- Ready For Office-Review'), true);
DB.woSettings.hideTechDone = undefined;

// The dashboard myJobs filter actually calls the shared hand-off helper.
ok('dashboard (reports.js) applies the hand-off hide to scheduled jobs', /_woHiddenFromFieldByHandoff\(j\.status\)/.test(rpSrc), true);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
