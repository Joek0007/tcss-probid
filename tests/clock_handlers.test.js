// LIVE-HANDLER harness: drives the REAL clock button handlers (field.js) against the fake
// Supabase, and asserts (a) the right rows were written, (b) the UI timer started, and (c) a
// close/reopen (restoreClockSession) resumes the SAME state. This is the layer the pure-math
// tests couldn't reach — the two Oct-27 bugs (missing startClockTimer, missing session update)
// lived exactly here.
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

  // The clock offline-queue persists to localStorage, which throws on an opaque origin
  // (what page.setContent gives). Serve the page over a real http origin via a routed URL so
  // localStorage works exactly like it does in a real browser.
  const DOM = `
    <select id="clock-job-select"><option value="">—</option><option value="A">Job A</option><option value="B">Job B</option></select>
    <select id="clock-next-job-select"><option value="">—</option><option value="A">Job A</option><option value="B">Job B</option></select>
    <div id="clock-timer-display"></div><div id="clock-timer-label"></div>
    <div id="geo-alert"></div><div id="ds-travel"></div><div id="ds-worked"></div><div id="ds-break"></div><div id="ds-lunch"></div>
  `;
  await page.route('https://tcss-test.local/', route =>
    route.fulfill({ contentType:'text/html', body:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+DOM+'</body></html>' }));
  await page.goto('https://tcss-test.local/');

  // 1) External deps that live in OTHER files (define BEFORE field.js so they exist when called).
  await page.addScriptTag({ content: `
    window.showToast = function(){};
    window.saveDB = function(){};
    window.getTodayISO = function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    window._findJobOrWO = function(){ return null; };
    window.showEodReminder = function(){};
    window.hideEodReminder = function(){};
    window.formatMinutes = function(m){ return (m||0)+'m'; };
    window.checkFieldLogBeforeClockOut = null; // not a function -> doArriveBack goes straight to _doArriveBackActual
    window.hasPermission = function(){ return true; };
    window._currentUser = { id:'u-joe', full_name:'Joe Kucinski', role:'owner' };
    window.DB = { settings:{}, workDays:[], team:[{name:'Joe Kucinski', active:true}], jobs:[] };
  `});
  // 2) Fake Supabase + the real app code.
  await page.addScriptTag({ content: FAKE });
  await page.addScriptTag({ content: `window._sb = window.makeFakeSupabase({clock_sessions:[], time_events:[]});` });
  await page.addScriptTag({ content: FIELD });
  await page.addScriptTag({ content: WORKTR });
  // 3) After load, neutralise UI + geo + GPS so handlers run headless and we capture completion.
  await page.addScriptTag({ content: `
    window.updateClockUI = function(){};
    window.onClockStateChange = function(){};
    window.scheduleEodReminder = function(){};
    window.showLunchFlagModal = async function(){ return true; };
    window.checkGeofence = function(){ return {reason:'ok'}; };
    window.setJobAnchor = function(){};
    // getGPS: call back immediately with fixed coords; stash the (async) callback's promise so the
    // driver can await the handler's real work (writes happen inside the callback).
    window.getGPS = function(cb){ window.__lastGps = cb(35.70, -79.81, 10); };
  `});

  if (pageErrors.length) { console.log('LOAD ERRORS:\n  '+pageErrors.join('\n  ')); await browser.close(); process.exit(1); }

  // Driver: run a handler and wait for both its promise and the GPS-callback promise.
  async function step(call){
    return page.evaluate(async (js) => {
      window.__lastGps = null;
      const fn = eval('(async()=>{'+js+'})');
      await fn();
      if (window.__lastGps) { try { await window.__lastGps; } catch(e){} }
      // return a serialisable snapshot
      const cs = window._clockState;
      return {
        status: cs.status, jobId: cs.jobId, jobName: cs.jobName, sessionId: cs.sessionId,
        timerRunning: cs.timerInterval!=null,
        sessions: window._sb._rows('clock_sessions').map(r=>({id:r.id,status:r.status,job_id:r.job_id})),
        events: window._sb._rows('time_events').map(r=>r.event_type),
      };
    }, call);
  }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

  // ── Drive a real day ────────────────────────────────────────────────────────
  let s;
  s = await step(`await doStartDay();`);
  ok('startDay -> status at_homebase', s.status, 'at_homebase');
  ok('startDay -> timer running', s.timerRunning, true);
  ok('startDay -> day_start event logged', s.events, ['day_start']);

  s = await step(`document.getElementById('clock-job-select').value='A'; await doStartTravel();`);
  ok('startTravel -> status traveling', s.status, 'traveling');
  ok('startTravel -> job A', s.jobId, 'A');
  ok('startTravel -> session row opened status=traveling job=A', s.sessions, [{id:s.sessionId,status:'traveling',job_id:'A'}]);
  ok('startTravel -> sessionId captured', s.sessionId!=null, true);

  s = await step(`await doArriveOnSite();`);
  ok('arrive -> status onsite', s.status, 'onsite');
  ok('arrive -> timer running', s.timerRunning, true);
  ok('arrive -> session updated status=clocked_in', s.sessions.map(r=>r.status), ['clocked_in']);

  s = await step(`document.getElementById('clock-next-job-select').value='B'; await doNextJob();`);
  ok('nextJob -> status traveling', s.status, 'traveling');
  ok('nextJob -> job B', s.jobId, 'B');
  // THE r5 bug: the session must now carry the NEW job + traveling status.
  ok('nextJob -> SESSION updated to job=B status=traveling', s.sessions.map(r=>({status:r.status,job_id:r.job_id})), [{status:'traveling',job_id:'B'}]);
  ok('nextJob -> job_change event logged', s.events.includes('job_change'), true);

  s = await step(`await doArriveOnSite();`);
  ok('arrive B -> onsite', s.status, 'onsite');
  ok('arrive B -> session still job B, clocked_in', s.sessions.map(r=>({status:r.status,job_id:r.job_id})), [{status:'clocked_in',job_id:'B'}]);

  // ── Close & reopen (restore) must resume the SAME live state ─────────────────
  const rt = await page.evaluate(async () => {
    const before = { status: window._clockState.status, jobId: window._clockState.jobId };
    window._clockState.status = 'out';              // simulate a fresh load
    window._clockState.sessionId = null; window._clockState.jobId=null;
    await restoreClockSession();
    return { before, after: { status: window._clockState.status, jobId: window._clockState.jobId, timerRunning: window._clockState.timerInterval!=null } };
  });
  ok('ROUND-TRIP restore status == live (onsite)', rt.after.status, rt.before.status);
  ok('ROUND-TRIP restore job == live (B)', rt.after.jobId, rt.before.jobId);
  ok('ROUND-TRIP restore restarts timer', rt.after.timerRunning, true);

  // ── OFFLINE → RECONNECT (r17): clock-in with no signal queues locally, then syncs ─────
  // This is Dawn's scenario: no bars at the job site. The shift must advance on-device and
  // reach the backend intact once signal returns — nothing silently lost.
  const off = await page.evaluate(async () => {
    const fresh = window.makeFakeSupabase({clock_sessions:[], time_events:[]});
    window._sb = null;                               // GO OFFLINE (no client)
    try { localStorage.removeItem('probid_clockQueue'); } catch(e){}
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null, jobName:null, breakMins:0, lunchMins:0, onsiteBreakBase:0, todayEvents:[]});
    document.getElementById('clock-job-select').value='A';
    window.__lastGps=null; await doStartTravel();  if(window.__lastGps) await window.__lastGps;
    window.__lastGps=null; await doArriveOnSite();  if(window.__lastGps) await window.__lastGps;
    const snap = {
      midSessionId: window._clockState.sessionId,
      statusOffline: window._clockState.status,
      queuedOffline: JSON.parse(localStorage.getItem('probid_clockQueue')||'[]').length,
      dbWritesWhileOffline: fresh._rows('clock_sessions').length + fresh._rows('time_events').length
    };
    window._sb = fresh;                              // RECONNECT
    await _clockFlush();
    snap.afterFlushQueued = JSON.parse(localStorage.getItem('probid_clockQueue')||'[]').length;
    snap.sessions = fresh._rows('clock_sessions').map(r=>({id:r.id,status:r.status,job_id:r.job_id}));
    snap.events   = fresh._rows('time_events').map(r=>r.event_type);
    return snap;
  });
  ok('offline -> sessionId still assigned on-device (not null)', off.midSessionId!=null, true);
  ok('offline -> local clock advances to onsite', off.statusOffline, 'onsite');
  ok('offline -> NOTHING written to backend yet', off.dbWritesWhileOffline, 0);
  ok('offline -> 4 ops queued locally (session + travel_start + update + clock_in)', off.queuedOffline, 4);
  ok('reconnect -> queue fully drained', off.afterFlushQueued, 0);
  ok('reconnect -> session synced, final status clocked_in', off.sessions, [{id:off.midSessionId,status:'clocked_in',job_id:'A'}]);
  ok('reconnect -> both events synced in order', off.events, ['travel_start','clock_in']);

  // ── DAY-END closes the cloud session; another device does NOT show "traveling" (r18) ──
  const dayend = await page.evaluate(async () => {
    const fresh = window.makeFakeSupabase({clock_sessions:[], time_events:[]});
    window._sb = fresh;
    try { localStorage.removeItem('probid_clockQueue'); } catch(e){}
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null, jobName:null, breakMins:0, lunchMins:0, lunchCount:0, onsiteBreakBase:0, travelOutStart:null, onsiteStart:null, travelBackStart:null, todayEvents:[]});
    document.getElementById('clock-job-select').value='A';
    window.__lastGps=null; await doStartTravel();  if(window.__lastGps) await window.__lastGps;
    const sid = window._clockState.sessionId;
    window.__lastGps=null; await doArriveOnSite();  if(window.__lastGps) await window.__lastGps;
    window.__lastGps=null; await doLeaveOnSite();    if(window.__lastGps) await window.__lastGps;  // -> returning
    window.__lastGps=null; await doArriveBack();     if(window.__lastGps) await window.__lastGps;  // -> end day
    const sessRow = fresh._rows('clock_sessions').find(r=>r.id===sid) || {};
    const statusAfterEnd = window._clockState.status;
    // Simulate the OTHER device restoring from the same backend.
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null, jobName:null, todayEvents:[]});
    await restoreClockSession();
    return { statusAfterEnd:statusAfterEnd, sessionClosed: sessRow.clock_out_at!=null, restoredStatus: window._clockState.status };
  });
  ok('day-end -> local clock goes out', dayend.statusAfterEnd, 'out');
  ok('day-end -> cloud session CLOSED (clock_out_at set)', dayend.sessionClosed, true);
  ok('day-end -> other device restore stays OUT (not "traveling")', dayend.restoredStatus, 'out');

  // ── Restore guard: a stale OPEN session must not beat a day_end in the events (r18) ────
  const guard = await page.evaluate(async () => {
    window._sb = window.makeFakeSupabase({
      clock_sessions:[{id:'s-stale', user_id:'u-joe', status:'returning', clock_in_at:new Date(Date.now()-7200000).toISOString(), clock_out_at:null, job_id:'A', job_name:'Job A'}],
      time_events:[
        {id:'e1', user_id:'u-joe', event_type:'travel_start', timestamp:new Date(Date.now()-3600000).toISOString(), job_id:'A', job_name:'Job A', session_id:'s-stale'},
        {id:'e2', user_id:'u-joe', event_type:'day_end', timestamp:new Date(Date.now()-60000).toISOString()}
      ]
    });
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null});
    await restoreClockSession();
    return { restoredStatus: window._clockState.status };
  });
  ok('restore guard -> day_end beats a stale open session (stays out)', guard.restoredStatus, 'out');

  // ── Guard must NOT over-fire: a genuinely open session with no day_end still resumes (r18) ──
  const resume = await page.evaluate(async () => {
    window._sb = window.makeFakeSupabase({
      clock_sessions:[{id:'s-open', user_id:'u-joe', status:'clocked_in', clock_in_at:new Date().toISOString(), clock_out_at:null, job_id:'A', job_name:'Job A'}],
      time_events:[]
    });
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null});
    await restoreClockSession();
    return { restoredStatus: window._clockState.status };
  });
  ok('restore -> open session, no events, still resumes (onsite)', resume.restoredStatus, 'onsite');

  // ── Clock in with NO work order assigned: Office / General works (r18) ────────────────
  const office = await page.evaluate(async () => {
    const fresh = window.makeFakeSupabase({clock_sessions:[], time_events:[]});
    window._sb = fresh;
    try { localStorage.removeItem('probid_clockQueue'); } catch(e){}
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null, jobId:null, jobName:null, todayEvents:[]});
    var sel=document.getElementById('clock-job-select');
    sel.innerHTML='<option value="">—</option><option value="office">Office / General (no specific work order)</option>';
    sel.value='office';
    window.__lastGps=null; await doStartTravel(); if(window.__lastGps) await window.__lastGps;
    return { status: window._clockState.status, sessions: fresh._rows('clock_sessions').map(r=>({job_id:r.job_id,status:r.status})) };
  });
  ok('clock-in with no WO -> Office/General starts a session', office.status, 'traveling');
  ok('clock-in with no WO -> session job_id = office', office.sessions, [{job_id:'office',status:'traveling'}]);

  await browser.close();
  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
