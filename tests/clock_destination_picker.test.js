// #2 LIVE-HANDLER harness for the OFFICE↔WO destination picker. Drives the REAL field.js handlers
// (doStartDay / doWorkAtOffice / doStartTravel / doArriveOnSite / doReturnToOffice / doArriveAtOffice /
// doLeaveOnSite / doArriveBack) in a real DOM against the fake Supabase, and asserts the WIRING:
//   • the new states transition correctly (office is a first-class clocked state; full two-way switching),
//   • the event timeline records office_start / return_office in order,
//   • day-end attaches a per-DESTINATION `segments` breakdown to the workDay and writes one clock-sourced
//     time_entries row per destination leg (office + each WO),
//   • those clock rows stay EXCLUDED from payroll aggregation (zero movement), and
//   • a mid-office refresh restores to the office state.
// The minute MATH is proven separately (hardening_proof PROOF 7, controlled timestamps); here wall-clock
// gaps are ~0ms, so we assert STRUCTURE (segment count + destinations + row types), not minute values.
const { chromium } = require('playwright');
const fs = require('fs');

const FAKE   = fs.readFileSync(__dirname + '/fake_supabase.js', 'utf8');
const FIELD  = fs.readFileSync(__dirname + '/../js/field.js', 'utf8');
const WORKTR = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));

  const DOM = `
    <select id="clock-job-select"><option value="">—</option><option value="A">WO-A</option><option value="B">WO-B</option></select>
    <select id="clock-office-job-select"><option value="">—</option><option value="A">WO-A</option><option value="B">WO-B</option></select>
    <select id="clock-next-job-select"><option value="">—</option><option value="A">WO-A</option><option value="B">WO-B</option></select>
    <div id="clock-timer-display"></div><div id="clock-timer-label"></div>
    <div id="geo-alert"></div><div id="ds-travel"></div><div id="ds-worked"></div><div id="ds-break"></div><div id="ds-lunch"></div>
  `;
  await page.route('https://tcss-test.local/', route =>
    route.fulfill({ contentType:'text/html', body:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+DOM+'</body></html>' }));
  await page.goto('https://tcss-test.local/');

  await page.addScriptTag({ content: `
    window.showToast=function(){}; window.saveDB=function(){};
    window.getTodayISO=function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    window.showEodReminder=function(){}; window.hideEodReminder=function(){};
    window.formatMinutes=function(m){ return (m||0)+'m'; };
    window.checkFieldLogBeforeClockOut=null;
    window.hasPermission=function(){ return true; };
    window.autoPromoteWOStatus=function(){};
    window.loadTimesheets=function(){};
    window._pushTimeEntryToSupabase=function(){};
    window._getMyAssignedJobs=function(){ return [{id:'A',name:'WO-A'},{id:'B',name:'WO-B'}]; };
    window._currentUser={ id:'u-joe', full_name:'Joe Kucinski', role:'owner' };
    window.DB={ settings:{}, workDays:[], timeEntries:[], team:[{name:'Joe Kucinski', active:true}], jobs:[] };
  `});
  await page.addScriptTag({ content: FAKE });
  await page.addScriptTag({ content: `window._sb = window.makeFakeSupabase({clock_sessions:[], time_events:[]});` });
  await page.addScriptTag({ content: FIELD });
  await page.addScriptTag({ content: WORKTR });
  await page.addScriptTag({ content: `
    window.updateClockUI=function(){}; window.onClockStateChange=function(){};
    window.scheduleEodReminder=function(){}; window.showLunchFlagModal=async function(){ return true; };
    window.checkGeofence=function(){ return {reason:'ok'}; }; window.setJobAnchor=function(){};
    window.getGPS=function(cb){ window.__lastGps=cb(35.70,-79.81,10); };
  `});

  if (pageErrors.length){ console.log('LOAD ERRORS:\n  '+pageErrors.join('\n  ')); await browser.close(); process.exit(1); }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }
  function okTrue(n,g){ ok(n,!!g,true); }
  async function run(js){ return page.evaluate(async (code)=>{ window.__lastGps=null; const fn=eval('(async()=>{'+code+'})'); await fn(); if(window.__lastGps){ try{ await window.__lastGps; }catch(e){} } return 1; }, js); }
  async function snap(){ return page.evaluate(()=>({
    status: window._clockState.status, returnTo: window._clockState.returnTo, jobId: window._clockState.jobId,
    events: window._sb._rows('time_events').map(r=>r.event_type),
    sessions: window._sb._rows('clock_sessions').map(r=>({job_id:r.job_id,status:r.status})),
    workDays: (window.DB.workDays||[]).map(d=>({segs:(d.segments||[]).map(s=>s.dest), total:d.totalPaidMins})),
    clockRows: (window.DB.timeEntries||[]).filter(e=>e.source==='clock'||(e.isManual===false&&e.clockIn)).map(e=>({type:e.entryType,wo:e.woId})),
  })); }

  // ── 1) OFFICE-ONLY DAY: start at base → Work at Office → End Day (no fake trip) ───────────────
  console.log('\n1) Office-only day (Work at Office → End Day):');
  await run(`window._clockState=Object.assign(window._clockState,{status:'out',sessionId:null,jobId:null,jobName:null,todayEvents:[],returnTo:'base'}); window.DB.workDays=[]; window.DB.timeEntries=[]; await doStartDay();`);
  let s=await page.evaluate(()=>window._clockState.status); ok('startDay → at_homebase', s, 'at_homebase');
  await run(`await doWorkAtOffice();`);
  s=await page.evaluate(()=>window._clockState.status); ok('Work at Office → office state', s, 'office');
  await run(`await doArriveBack();`);
  let o=await snap();
  ok('office-only → ends out', o.status, 'out');
  ok('office-only → events (day_start, office_start, day_end)', o.events, ['day_start','office_start','day_end']);
  ok('office-only → one workDay with a single office segment', o.workDays.length===1 && JSON.stringify(o.workDays[0].segs)===JSON.stringify(['office']), true);
  ok('office-only → day total is a finite number ≥ 0', typeof o.workDays[0].total==='number' && o.workDays[0].total>=0, true);

  // ── 2) BOUNCE DAY: office → WO-A → office → WO-B → end. Full two-way switching. ───────────────
  console.log('\n2) Bounce day office → WO-A → office → WO-B → end:');
  await run(`window._clockState=Object.assign(window._clockState,{status:'out',sessionId:null,jobId:null,jobName:null,todayEvents:[],returnTo:'base',travelOutMins:0,onsiteMins:0,travelBackMins:0,breakMins:0,lunchMins:0,lunchCount:0}); window.DB.workDays=[]; window.DB.timeEntries=[]; window._sb=window.makeFakeSupabase({clock_sessions:[],time_events:[]}); await doStartDay();`);
  await run(`await doWorkAtOffice();`);
  await run(`document.getElementById('clock-office-job-select').value='A'; await doStartTravel();`);
  s=await page.evaluate(()=>window._clockState.status); ok('office → Travel to WO-A → traveling', s, 'traveling');
  await run(`await doArriveOnSite();`);
  s=await page.evaluate(()=>({st:window._clockState.status,job:window._clockState.jobId})); ok('arrived WO-A → onsite', s, {st:'onsite',job:'A'});
  await run(`await doReturnToOffice();`);
  s=await page.evaluate(()=>({st:window._clockState.status,rt:window._clockState.returnTo})); ok('Return to Office → returning(office)', s, {st:'returning',rt:'office'});
  await run(`await doArriveAtOffice();`);
  s=await page.evaluate(()=>window._clockState.status); ok('arrived back at office → office', s, 'office');
  await run(`document.getElementById('clock-office-job-select').value='B'; await doStartTravel();`);
  await run(`await doArriveOnSite();`);
  s=await page.evaluate(()=>({st:window._clockState.status,job:window._clockState.jobId})); ok('onsite WO-B', s, {st:'onsite',job:'B'});
  await run(`await doLeaveOnSite();`);
  await run(`await doArriveBack();`);
  let b=await snap();
  ok('bounce → ends out', b.status, 'out');
  ok('bounce → event timeline in order', b.events,
     ['day_start','office_start','travel_start','clock_in','return_office','office_start','travel_start','clock_in','clock_out','day_end']);
  ok('bounce → session ends job=B (last destination), status out', b.sessions, [{job_id:'B',status:'out'}]);
  // segments: office → A → office → B (4 destination legs on the one same-day workDay)
  ok('bounce → workDay carries 4 destination segments [office,A,office,B]', b.workDays.length===1 && JSON.stringify(b.workDays[0].segs)===JSON.stringify(['office','A','office','B']), true);
  // one clock-sourced itemized row per leg (office, A, office, B)
  ok('bounce → one clock time_entries row per leg', b.clockRows.map(r=>({t:r.type,wo:r.wo})),
     [{t:'office',wo:''},{t:'work',wo:'A'},{t:'office',wo:''},{t:'work',wo:'B'}]);

  // ── 3) PAYROLL EXCLUSION: _rebuildDaySummary must ignore the clock-sourced segment rows ──────
  console.log('\n3) Clock segment rows are excluded from payroll aggregation (zero movement):');
  const excl = await page.evaluate(()=>{
    // every clock-sourced row must be classified as a clock entry (and thus skipped by _rebuildDaySummary)
    var rows=(window.DB.timeEntries||[]).filter(e=>e.source==='clock'||(e.isManual===false&&e.clockIn));
    return { allClock: rows.length>0 && rows.every(e=>_isClockEntry(e)), count: rows.length };
  });
  okTrue('every segment row is a clock entry (_isClockEntry) → skipped by _rebuildDaySummary', excl.allClock);
  ok('segment rows written (4 legs)', excl.count, 4);

  // ── 4) RESTORE mid-office: a refresh while working at the office resumes the office state ─────
  console.log('\n4) Restore mid-office (refresh resumes the office working state):');
  const rt = await page.evaluate(async ()=>{
    window._sb=window.makeFakeSupabase({clock_sessions:[],time_events:[]});
    window._clockState=Object.assign(window._clockState,{status:'out',sessionId:null,jobId:null,jobName:null,todayEvents:[],returnTo:'base'});
    window.getGPS=function(cb){ window.__lastGps=cb(35.70,-79.81,10); };
    await doStartDay(); if(window.__lastGps) await window.__lastGps;
    await doWorkAtOffice(); if(window.__lastGps) await window.__lastGps;
    var before=window._clockState.status;
    window._clockState=Object.assign(window._clockState,{status:'out',sessionId:null,jobId:null,jobName:null,todayEvents:[]}); // simulate reload
    await restoreClockSession();
    return { before, after: window._clockState.status, job: window._clockState.jobId };
  });
  ok('mid-office restore → office', rt.after, 'office');
  ok('mid-office restore → job office', rt.job, 'office');

  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  await browser.close();
  process.exit(fail?1:0);
})();
