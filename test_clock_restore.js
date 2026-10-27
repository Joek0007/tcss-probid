// Unit test: extract the REAL _reconstructClockState from worktracking.js and prove it.
const fs=require('fs');
const src=fs.readFile ? fs.readFileSync('/home/claude/tcss-probid/js/worktracking.js','utf8') : '';
const start=src.indexOf('function _reconstructClockState(events){');
const endMarker='\nif (typeof module !== ';
const end=src.indexOf(endMarker, start);
if(start<0||end<0){ console.error('could not extract function'); process.exit(1); }
const fnSrc=src.slice(start,end);
const _reconstructClockState=eval('('+fnSrc+')');

let pass=0, fail=0;
function eq(name, got, want){ const g=JSON.stringify(got), w=JSON.stringify(want);
  if(g===w){ pass++; } else { fail++; console.log('  ✗ '+name+'\n      got : '+g+'\n      want: '+w); } }
function T(iso){ return new Date(iso).getTime(); }

// --- Scenario A: day_start -> travel -> clock_in  (restore should be ONSITE) ---
{
  const ev=[
    {event_type:'day_start',  timestamp:'2026-10-26T12:00:00Z'},
    {event_type:'travel_start',timestamp:'2026-10-26T12:10:00Z', job_id:'A', job_name:'Job A', session_id:'S1'},
    {event_type:'clock_in',   timestamp:'2026-10-26T12:25:00Z', job_id:'A', job_name:'Job A'},
  ];
  const s=_reconstructClockState(ev);
  eq('A.status onsite', s.status, 'onsite');
  eq('A.jobId', s.jobId, 'A');
  eq('A.jobName', s.jobName, 'Job A');
  eq('A.sessionId', s.sessionId, 'S1');
  eq('A.travelOutMins=15', s.travelOutMins, 15);
  eq('A.onsiteStart=clock_in', s.onsiteStart, T('2026-10-26T12:25:00Z'));
  eq('A.dayStart=travel_start(overwrite)', s.dayStart, T('2026-10-26T12:10:00Z'));
  eq('A.events count', s.todayEvents.length, 3);
}

// --- Scenario B: + break 10m + lunch 30m, then clock_out (ONSITE totals & RETURNING) ---
{
  const ev=[
    {event_type:'day_start',   timestamp:'2026-10-26T12:00:00Z'},
    {event_type:'travel_start',timestamp:'2026-10-26T12:10:00Z', job_id:'A', job_name:'Job A', session_id:'S1'},
    {event_type:'clock_in',    timestamp:'2026-10-26T12:25:00Z', job_id:'A', job_name:'Job A'},
    {event_type:'break_start', timestamp:'2026-10-26T12:40:00Z'},
    {event_type:'break_end',   timestamp:'2026-10-26T12:50:00Z'},
    {event_type:'lunch_start', timestamp:'2026-10-26T13:00:00Z'},
    {event_type:'lunch_end',   timestamp:'2026-10-26T13:30:00Z'},
    {event_type:'clock_out',   timestamp:'2026-10-26T14:00:00Z'},
  ];
  const s=_reconstructClockState(ev);
  eq('B.status returning', s.status, 'returning');
  eq('B.breakMins=10', s.breakMins, 10);
  eq('B.lunchMins=30', s.lunchMins, 30);
  eq('B.lunchCount=1', s.lunchCount, 1);
  eq('B.onsiteMins=95 (12:25->14:00)', s.onsiteMins, 95);
  eq('B.travelBackStart=clock_out', s.travelBackStart, T('2026-10-26T14:00:00Z'));
  eq('B.onsiteStart cleared', s.onsiteStart, null);
}

// --- Scenario C: job change mid-site (TRAVELING to next job, onsite accrued) ---
{
  const ev=[
    {event_type:'day_start',   timestamp:'2026-10-26T12:00:00Z'},
    {event_type:'travel_start',timestamp:'2026-10-26T12:10:00Z', job_id:'A', job_name:'Job A', session_id:'S1'},
    {event_type:'clock_in',    timestamp:'2026-10-26T12:25:00Z', job_id:'A', job_name:'Job A'},
    {event_type:'job_change',  timestamp:'2026-10-26T13:00:00Z', job_id:'B', job_name:'Job B'},
  ];
  const s=_reconstructClockState(ev);
  eq('C.status traveling', s.status, 'traveling');
  eq('C.jobId switched to B', s.jobId, 'B');
  eq('C.onsiteMins=35 (12:25->13:00)', s.onsiteMins, 35);
  eq('C.travelOutStart=job_change', s.travelOutStart, T('2026-10-26T13:00:00Z'));
}

// --- Scenario D: completed day -> OUT (no restore) ---
{
  const ev=[
    {event_type:'day_start',   timestamp:'2026-10-26T12:00:00Z'},
    {event_type:'travel_start',timestamp:'2026-10-26T12:10:00Z', job_id:'A', job_name:'Job A', session_id:'S1'},
    {event_type:'clock_in',    timestamp:'2026-10-26T12:25:00Z'},
    {event_type:'clock_out',   timestamp:'2026-10-26T14:00:00Z'},
    {event_type:'day_end',     timestamp:'2026-10-26T14:30:00Z'},
  ];
  const s=_reconstructClockState(ev);
  eq('D.status out (done)', s.status, 'out');
}

// --- Scenario E: Dawn's REAL data. A stray 2nd day_start mid-shift must now be IGNORED by the
//     hardened replay, so status stays ONSITE from events alone (no session override needed). ---
{
  const ev=[
    {event_type:'day_start',   timestamp:'2026-10-26T23:11:49Z'},
    {event_type:'travel_start',timestamp:'2026-10-26T23:28:30Z', job_id:'wo-1793056001819', job_name:'Change voicemail options — 123 TEST Company', session_id:'ef845a57'},
    {event_type:'clock_in',    timestamp:'2026-10-26T23:33:25Z', job_id:'wo-1793056001819', job_name:'Change voicemail options — 123 TEST Company'},
    {event_type:'day_start',   timestamp:'2026-10-27T00:15:22Z'},
  ];
  const s=_reconstructClockState(ev);
  eq('E.onsiteStart preserved at real clock_in', s.onsiteStart, T('2026-10-26T23:33:25Z'));
  eq('E.travelOutMins=5 (23:28->23:33)', s.travelOutMins, 5);
  eq('E.jobName preserved', s.jobName, 'Change voicemail options — 123 TEST Company');
  // Hardened: stray day_start while onsite is ignored -> status stays ONSITE (was at_homebase).
  eq('E.stray day_start ignored, status ONSITE', s.status, 'onsite');
}

// --- Scenario F: Joe's job change. Travel->onsite at A, then "Go to Next Job" B, then refresh.
//     Events must reconstruct status=TRAVELING to B (NOT revert to onsite at A). ---
{
  const ev=[
    {event_type:'day_start',   timestamp:'2026-10-27T13:00:00Z'},
    {event_type:'travel_start',timestamp:'2026-10-27T13:05:00Z', job_id:'JOB_A', job_name:'Job A', session_id:'S1'},
    {event_type:'clock_in',    timestamp:'2026-10-27T13:20:00Z', job_id:'JOB_A', job_name:'Job A'},
    {event_type:'job_change',  timestamp:'2026-10-27T14:00:00Z', job_id:'JOB_B', job_name:'Job B'},
  ];
  const s=_reconstructClockState(ev);
  eq('F.status TRAVELING (not onsite)', s.status, 'traveling');
  eq('F.jobId=JOB_B', s.jobId, 'JOB_B');
  eq('F.travelOutStart=job_change time', s.travelOutStart, T('2026-10-27T14:00:00Z'));
  eq('F.onsiteStart cleared', s.onsiteStart, null);
  eq('F.onsiteMins=40 (13:20->14:00)', s.onsiteMins, 40);
}

console.log('\n_reconstructClockState: '+pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
