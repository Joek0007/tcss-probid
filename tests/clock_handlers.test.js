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

  // Minimal DOM the handlers read directly.
  await page.setContent(`
    <select id="clock-job-select"><option value="">—</option><option value="A">Job A</option><option value="B">Job B</option></select>
    <select id="clock-next-job-select"><option value="">—</option><option value="A">Job A</option><option value="B">Job B</option></select>
    <div id="clock-timer-display"></div><div id="clock-timer-label"></div>
    <div id="geo-alert"></div><div id="ds-travel"></div><div id="ds-worked"></div><div id="ds-break"></div><div id="ds-lunch"></div>
  `);

  // 1) External deps that live in OTHER files (define BEFORE field.js so they exist when called).
  await page.addScriptTag({ content: `
    window.showToast = function(){};
    window.saveDB = function(){};
    window.getTodayISO = function(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    window._findJobOrWO = function(){ return null; };
    window.showEodReminder = function(){};
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

  // ── Failure path: a cloud write that FAILS must be surfaced, not silently lost ─
  const failRun = await page.evaluate(async () => {
    // make the next clock_sessions insert return an error
    const realFrom = window._sb.from.bind(window._sb);
    window._sb.from = function(t){ var q = realFrom(t); if(t==='clock_sessions'){ var ins=q.insert.bind(q); q.insert=function(x){ ins(x); return { select:()=>({ single:()=>Promise.resolve({data:null, error:{message:'boom'}}) }) }; }; } return q; };
    // reset to out, start a fresh travel; capture whether the failure flag path ran
    window._clockState = Object.assign(window._clockState, {status:'out', sessionId:null});
    window.__cloudFailToast=false; var realToast=window.showToast; window.showToast=function(m,t){ if(t==='warning') window.__cloudFailToast=true; };
    document.getElementById('clock-job-select').value='A';
    window.__lastGps=null; await doStartTravel(); if(window.__lastGps) await window.__lastGps;
    window.showToast=realToast; window._sb.from=realFrom;
    return { sessionId: window._clockState.sessionId, warned: window.__cloudFailToast };
  });
  ok('cloud-write failure -> sessionId stays null (not a fake success)', failRun.sessionId, null);
  ok('cloud-write failure -> user warned', failRun.warned, true);

  await browser.close();
  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
