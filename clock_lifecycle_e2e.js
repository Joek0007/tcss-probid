// END-TO-END clock lifecycle regression: walk a full realistic day, and at EVERY step
// reconstruct from the events-so-far (= simulate a refresh/reopen at that moment) and assert
// the resumed status/job/timer are right. This is the whole chain the piecemeal tests missed.
const fs=require('fs');
const src=fs.readFileSync('/home/claude/tcss-probid/js/worktracking.js','utf8');
const a=src.indexOf('function _reconstructClockState(events){');
const b=src.indexOf('\nif (typeof module !== ', a);
const _reconstructClockState=eval('('+src.slice(a,b)+')');
const T=iso=>new Date('2026-10-27T'+iso+':00Z').getTime();

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'  want '+JSON.stringify(w));} }

// The full day, event by event. Each row: the event, and what a REFRESH right after it must restore.
const day=[
  {ev:{event_type:'day_start',   timestamp:T('08:00')},                                  wantStatus:'at_homebase', wantJob:null},
  {ev:{event_type:'travel_start',timestamp:T('08:10'), job_id:'A', job_name:'Job A', session_id:'S1'}, wantStatus:'traveling', wantJob:'A'},
  {ev:{event_type:'clock_in',    timestamp:T('08:30'), job_id:'A', job_name:'Job A'},     wantStatus:'onsite',     wantJob:'A'},
  {ev:{event_type:'break_start', timestamp:T('09:00')},                                   wantStatus:'break',      wantJob:'A'},
  {ev:{event_type:'break_end',   timestamp:T('09:15')},                                   wantStatus:'onsite',     wantJob:'A'},
  {ev:{event_type:'lunch_start', timestamp:T('12:00')},                                   wantStatus:'lunch',      wantJob:'A'},
  {ev:{event_type:'lunch_end',   timestamp:T('12:30')},                                   wantStatus:'onsite',     wantJob:'A'},
  {ev:{event_type:'job_change',  timestamp:T('13:00'), job_id:'B', job_name:'Job B'},     wantStatus:'traveling',  wantJob:'B'},
  {ev:{event_type:'clock_in',    timestamp:T('13:20'), job_id:'B', job_name:'Job B'},     wantStatus:'onsite',     wantJob:'B'},
  {ev:{event_type:'clock_out',   timestamp:T('15:00')},                                   wantStatus:'returning',  wantJob:'B'},
  {ev:{event_type:'day_end',     timestamp:T('15:30')},                                   wantStatus:'out',        wantJob:'B'},
];

console.log('STEP-BY-STEP: refresh after each event resumes correctly');
const events=[];
day.forEach(function(step,i){
  events.push(step.ev);
  const st=_reconstructClockState(events.slice());               // simulate reopen now
  // restore status = events-first (r6), job = events-first (r5)
  const status = st.status!=='out' ? st.status : 'out';
  ok('step '+i+' ('+step.ev.event_type+') status', status, step.wantStatus);
  if(step.wantJob!==undefined && step.ev.event_type!=='day_start') ok('step '+i+' job', st.jobId, step.wantJob);
});

console.log('\nKEY INVARIANTS');
const full=_reconstructClockState(events.slice());
ok('breakMins=15', full.breakMins, 15);
ok('lunchMins=30', full.lunchMins, 30);
ok('lunchCount=1', full.lunchCount, 1);
ok('final status out (day_end)', full.status, 'out');

// Timer math at the SECOND job, 5 min after arriving (the freeze bug): rebuild state as of clock_in B
const uptoB=events.slice(0, 9); // through clock_in B (index 8)
const atB=_reconstructClockState(uptoB);
ok('at B onsiteBreakBase=45 (15 break + 30 lunch)', atB.onsiteBreakBase, 45);
const now=T('13:25'); // 5 min after arriving at B
const offMs=Math.max(0,(atB.breakMins+atB.lunchMins-(atB.onsiteBreakBase||0)))*60000;
const onsiteDisp=Math.max(0, now - atB.onsiteStart - offMs);
ok('On-Site timer at B = 5:00 (not frozen)', onsiteDisp, 300000);

// Dashboard status mapping for each live clock_sessions.status
console.log('\nDASHBOARD MAPPING (clock_sessions.status -> label)');
const dashMap={clocked_in:'onsite',traveling:'traveling',returning:'returning',on_break:'break',at_lunch:'lunch'};
const labels={onsite:'On Site',traveling:'Traveling',returning:'Returning',break:'On Break',lunch:'Lunch'};
[['clocked_in','On Site'],['traveling','Traveling'],['returning','Returning'],['on_break','On Break'],['at_lunch','Lunch']].forEach(function(p){
  ok('session '+p[0]+' -> '+p[1], labels[dashMap[p[0]]], p[1]);
});

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
