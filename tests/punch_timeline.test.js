// r45 — clock-punch visibility. The day's actual punches (in/out, travel, break, lunch) are rendered
// from the stored work-day events so a tech sees their own clock in/out on My Hours and the office sees
// any tech's timeline on All Timesheets. Loads the REAL helpers from worktracking.js and checks they
// render the punches and are safe when a day has none.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');
var s = src.indexOf('function _punchTimeStr(');
var e = src.indexOf('function renderDayRow(');
if (s < 0 || e < 0) { console.log('✗ punch helpers not found'); process.exit(1); }
global.escHtml = function(x){ return String(x==null?'':x); };
eval(src.slice(s, e));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// Lisa's real punches (UTC strings, as stored on the work day)
var lisaEvents = [
  {type:'day_start',   time:'2026-10-30T11:33:45Z', label:'Started Day at Base'},
  {type:'travel_start',time:'2026-10-30T14:06:13Z', label:'Started Travel'},
  {type:'clock_in',    time:'2026-10-30T14:06:16Z', label:'Arrived On Site'},
  {type:'break_start', time:'2026-10-30T14:06:29Z', label:'Break Started'},
  {type:'break_end',   time:'2026-10-30T14:17:10Z', label:'Break Ended'},
  {type:'lunch_start', time:'2026-10-30T18:30:28Z', label:'Lunch Started'},
  {type:'lunch_end',   time:'2026-10-30T19:15:05Z', label:'Back from Lunch'},
  {type:'clock_out',   time:'2026-10-30T19:46:15Z', label:'Left Job Site'},
  {type:'day_end',     time:'2026-10-30T19:46:35Z', label:'Arrived Back — Day Complete'}
];

var html = _punchTimelineHTML(lisaEvents);
ok('renders every punch label', ['Started Day at Base','Started Travel','Arrived On Site','Break Started','Break Ended','Lunch Started','Back from Lunch','Left Job Site'].every(function(l){ return html.indexOf(l) >= 0; }), true);
ok('has the Clock punches header', html.indexOf('Clock punches') >= 0, true);
ok('shows a formatted time (contains AM/PM)', /\d{1,2}:\d{2}\s?(AM|PM)/i.test(html), true);

// time formatter handles Date objects and bad input
ok('_punchTimeStr handles Date object', /\d{1,2}:\d{2}/.test(_punchTimeStr(new Date('2026-10-30T14:06:00Z'))), true);
ok('_punchTimeStr handles ISO string', /\d{1,2}:\d{2}/.test(_punchTimeStr('2026-10-30T14:06:00Z')), true);
ok('_punchTimeStr safe on garbage', _punchTimeStr('not-a-date'), '');

// empty / missing events → no output (no crash)
ok('empty events → empty string', _punchTimelineHTML([]), '');
ok('null events → empty string', _punchTimelineHTML(null), '');
ok('_punchDetailsHTML empty when day has no events', _punchDetailsHTML({date:'2026-10-30'}), '');
ok('_punchDetailsHTML renders a <details> when events exist', /<details[\s\S]*Clock punches/.test(_punchDetailsHTML({events:lisaEvents})), true);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
