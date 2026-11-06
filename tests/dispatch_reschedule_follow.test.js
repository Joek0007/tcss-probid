// #3 (Dawn) — "schedule a job on a date and it grays out / can't access it again" on desktop.
// ROOT: rescheduleJobFromDetail set the job's new date but re-rendered the board on the OLD date, so a
// job rescheduled to another day matched neither the day's rows (scheduledDate===boardDate) nor the
// backlog pool (it has a date) → it vanished from view. FIX: follow the job — set #dispatch-date to the
// new date before re-rendering (mirrors scheduleJobFromModal). This drives the REAL handler in a DOM and
// proves the board now lands on the new date, AND that under the old (no-follow) behavior the job would
// be absent from the rendered board (red arm).
const { chromium } = require('playwright');
const fs = require('fs');
const DISPATCH = fs.readFileSync(__dirname + '/../js/dispatch.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));

  const DOM = `
    <input id="dispatch-date" value="2026-11-06">
    <input id="dsp-new-date" value="2026-11-20">
    <input id="dsp-new-time" value="09:00">
    <input id="dsp-new-dur" value="4">
    <div id="dispatch-detail-panel" style="display:block"></div>
    <div id="dispatch-pool-jobs"></div>
    <div id="dispatch-board"></div>
  `;
  await page.route('https://d.local/', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><html><head><meta charset=utf-8></head><body>'+DOM+'</body></html>' }));
  await page.goto('https://d.local/');

  await page.addScriptTag({ content: DISPATCH });
  // Stub deps AFTER dispatch.js so our observer renderDispatchBoard overrides the real (DOM-heavy) one
  // (it is a function declaration, so it must be reassigned after load to win).
  await page.addScriptTag({ content: `
    window.DB = { workOrders:[], team:[], jobs:[] };
    window.JOB = { id:'w1', name:'Acme install', woNumber:'WO-1', scheduledDate:'2026-11-06', scheduledTime:'08:00',
                   assignedTechs:['Tim'], status:'Scheduled', estLaborHours:4 };
    window._findJobOrWO = function(id){ return id===window.JOB.id ? window.JOB : null; };
    window._saveJobToWO = function(){};
    window.saveDB = function(){};
    window.closeDispatchDetail = function(){ var p=document.getElementById('dispatch-detail-panel'); if(p) p.style.display='none'; };
    window.showToast = function(){};
    window.getTodayISO = function(){ return '2026-11-06'; };
    // Capture what the board WOULD show: a job appears on the board only if its date === #dispatch-date.
    window.__renderCount = 0; window.__lastBoardHasJob = null;
    window.renderDispatchBoard = function(){
      window.__renderCount++;
      var boardDate = (document.getElementById('dispatch-date')||{}).value;
      window.__lastBoardHasJob = (window.JOB.scheduledDate === boardDate);  // visible on the rendered day?
    };
  `});

  if (errs.length){ console.log('LOAD ERRORS:\n  '+errs.join('\n  ')); await browser.close(); process.exit(1); }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

  const r = await page.evaluate(() => {
    // RED arm — simulate the OLD handler (no date-follow): set the new date, re-render on the OLD board date.
    window.JOB.scheduledDate = '2026-11-06';
    document.getElementById('dispatch-date').value = '2026-11-06';
    (function oldReschedule(){ window.JOB.scheduledDate = document.getElementById('dsp-new-date').value; /* NO dispatch-date follow */ window.renderDispatchBoard(); })();
    var redBoardHasJob = window.__lastBoardHasJob; // false → job vanished (the bug)

    // GREEN arm — reset and run the REAL shipped handler.
    window.JOB.scheduledDate = '2026-11-06';
    document.getElementById('dispatch-date').value = '2026-11-06';
    document.getElementById('dsp-new-date').value = '2026-11-20';
    window.rescheduleJobFromDetail('w1');
    return {
      redBoardHasJob: redBoardHasJob,
      jobNewDate: window.JOB.scheduledDate,
      boardDateAfter: document.getElementById('dispatch-date').value,
      greenBoardHasJob: window.__lastBoardHasJob,
      rendered: window.__renderCount > 0
    };
  });

  ok('RED: old no-follow behavior → job vanishes from the board', r.redBoardHasJob, false);
  ok('GREEN: reschedule moved job to the new date', r.jobNewDate, '2026-11-20');
  ok('GREEN: board FOLLOWED to the new date', r.boardDateAfter, '2026-11-20');
  ok('GREEN: job is now visible on the rendered board (no vanish)', r.greenBoardHasJob, true);
  ok('teeth: red≠green (the fix changes the outcome)', r.redBoardHasJob !== r.greenBoardHasJob, true);

  // static guard: the belt-and-suspenders drag-state reset is present in renderDispatchBoard
  var _rb = DISPATCH.slice(DISPATCH.indexOf('function renderDispatchBoard()'), DISPATCH.indexOf('function pill('));
  ok('renderDispatchBoard clears stuck drag state (opacity + .dragging)', /style\.opacity=''[\s\S]{0,60}remove\('dragging'\)/.test(_rb), true);
  ok('renderDispatchBoard removes any orphan touch ghost', /dispatch-touch-ghost[\s\S]{0,40}remove\(\)/.test(_rb), true);

  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  await browser.close();
  process.exit(fail?1:0);
})();
