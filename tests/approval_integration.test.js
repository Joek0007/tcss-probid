// LIVE-HANDLER harness for the r13 jobs->Work-Order integration. Drives the REAL
// handlers (crm.confirmConvertJob, quotes.editJob/delJob, core._relinkProjectsToWO)
// against the fake Supabase and asserts:
//   (1) approving a quote creates exactly ONE Work Order and ZERO jobs,
//   (2) the WO carries what the job used to carry (estLaborHours, assigned tech),
//   (3) the WT project links to the WO id (so the access model resolves),
//   (4) the Active-Jobs Edit/Delete buttons route to the WO (no dead-end),
//   (5) the one-time repair re-points a legacy project onto its WO, idempotently.
// These are the exact seams that were "half-pointing at a job" before r13.
const { chromium } = require('playwright');
const fs = require('fs');

const FAKE    = fs.readFileSync(__dirname + '/fake_supabase.js', 'utf8');
const CRM     = fs.readFileSync(__dirname + '/../js/crm.js', 'utf8');
const QUOTES  = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
const WORKORD = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');

// Pull ONLY the real _relinkProjectsToWO function text out of core.js (loading all of
// core.js would run unrelated load-time code). Slice from its signature to its close.
const CORE = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
const relinkStart = CORE.indexOf('function _relinkProjectsToWO(');
const relinkEnd   = CORE.indexOf('\n  return relinked;\n}', relinkStart);
if (relinkStart < 0 || relinkEnd < 0) { console.log('✗ could not locate _relinkProjectsToWO in core.js'); process.exit(1); }
const RELINK = CORE.slice(relinkStart, relinkEnd) + '\n  return relinked;\n}';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e).split('\n')[0]));

  // Minimal DOM the convert-job modal handler reads directly.
  await page.setContent(`
    <input id="ctj-qid" value="q-1">
    <input id="ctj-name" value="Acme Camera Install">
    <input id="ctj-customer" value="Acme Corp">
    <input id="ctj-address" value="100 Main St">
    <select id="ctj-contact"><option value="" selected>—</option></select>
    <input id="ctj-assign" value="Joe Kucinski">
    <input id="ctj-start" value="2026-10-28">
    <textarea id="ctj-notes">Install 8 cameras</textarea>
    <input id="ctj-create-wtp" type="checkbox" checked>
  `);

  // Load-time deps that live in other files — define BEFORE the app code.
  await page.addScriptTag({ content: `
    window.showToast = function(){};
    window.saveDB = function(){};
    window.closeModal = function(){};
    window.renderDash = function(){};
    window.renderJobs = function(){};
    window.openModal = function(){};
    window.hasPermission = function(){ return true; };
    window.getTodayISO = function(){ return '2026-10-27'; };
    window.escHtml = function(s){ return String(s==null?'':s); };
    window.stripHtmlToText = function(s){ return String(s==null?'':s); };
    window._maxNum = function(){ return 0; };
    window.__woSeq = 1000;
    window.allocNumber = async function(kind){ return (++window.__woSeq); };  // WO-1001, ...
    window.__pushedWO = false; window.__pushedJob = false; window.__pushedQuote = false;
    window._pushWOToCloud    = function(){ window.__pushedWO = true; };
    window._pushJobToCloud   = function(){ window.__pushedJob = true; };   // must NEVER be called in r13
    window._pushQuoteToCloud = function(){ window.__pushedQuote = true; };
    window._currentUser = { id:'u-joe', full_name:'Joe Kucinski', role:'owner' };
    window.DB = {
      settings:{}, team:[{name:'Joe Kucinski', active:true}],
      customers:[{ id:'cust-acme', name:'Acme Corp' }],
      contacts:[], quotes:[{
        id:'q-1', num:'Q-2026-900', cn:'Acme Corp', jn:'Acme Camera Install',
        jt:'Installation', notes:'Install 8 cameras', scope:'8 cameras',
        totalLaborHours:12, totalCost:4000, total:9000, achievedMargin:40,
        laborRate:125, taxRate:7, ad:'100 Main St', adCity:'Raleigh', adState:'NC', adZip:'27601',
        items:[{desc:'Camera',qty:8}], status:'approved'
      }],
      jobs:[], workOrders:[], wtProjects:[], deletedIds:{ jobs:[], workOrders:[] }
    };
  `});
  await page.addScriptTag({ content: FAKE });
  await page.addScriptTag({ content: `window._sb = window.makeFakeSupabase({ wt_projects:[] });` });
  await page.addScriptTag({ content: WORKORD });
  await page.addScriptTag({ content: CRM });
  await page.addScriptTag({ content: QUOTES });
  await page.addScriptTag({ content: RELINK });
  // Spy the WO open/delete so the Edit/Delete routing can be observed without the real modals.
  await page.addScriptTag({ content: `
    window.__openedWO = null; window.__deletedWO = null;
    window.openWorkOrder   = function(id){ window.__openedWO = id; };
    window.deleteWorkOrder = function(id){ window.__deletedWO = id; };
    // Re-assert the push spies AFTER the app code (workorders/auth may define real ones).
    window.__pushedWO = false; window.__pushedJob = false; window.__pushedQuote = false;
    window._pushWOToCloud    = function(){ window.__pushedWO = true; };
    window._pushJobToCloud   = function(){ window.__pushedJob = true; };
    window._pushQuoteToCloud = function(){ window.__pushedQuote = true; };
  `});

  if (pageErrors.length) { console.log('LOAD ERRORS:\n  '+pageErrors.join('\n  ')); await browser.close(); process.exit(1); }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

  // ── 1) Approve the quote (the real handler) ─────────────────────────────────
  const r = await page.evaluate(async () => {
    await confirmConvertJob();
    var wo = DB.workOrders[0] || {};
    var asJob = (typeof _woToJob==='function') ? _woToJob(wo) : {};
    return {
      jobCount: DB.jobs.length,
      woCount: DB.workOrders.length,
      woNumber: wo.woNumber,
      estLaborHours: wo.estLaborHours,
      assignedTechs: wo.assignedTechs,
      quoteId: wo.quoteId,
      adapterEst: asJob.estLaborHours,
      projCount: DB.wtProjects.length,
      projJobId: (DB.wtProjects[0]||{}).jobId,
      woId: wo.id,
      pushedWO: window.__pushedWO, pushedJob: window.__pushedJob, pushedQuote: window.__pushedQuote
    };
  });
  ok('approval -> ZERO jobs created (shadow job gone)', r.jobCount, 0);
  ok('approval -> exactly ONE work order', r.woCount, 1);
  ok('approval -> WO numbered WO-1001', r.woNumber, 'WO-1001');
  ok('approval -> WO carries the quote labor estimate (12h, not the hardcoded 4)', r.estLaborHours, 12);
  ok('approval -> lead tech assigned on the WO', r.assignedTechs, ['Joe Kucinski']);
  ok('approval -> WO linked to the quote', r.quoteId, 'q-1');
  ok('adapter -> _woToJob exposes the real 12h estimate', r.adapterEst, 12);
  ok('approval -> one WT project created', r.projCount, 1);
  ok('approval -> project linked to the WORK ORDER id (not a shadow job)', r.projJobId, r.woId);
  ok('approval -> quote pushed to cloud', r.pushedQuote, true);
  ok('approval -> WO pushed to cloud', r.pushedWO, true);
  ok('approval -> NO job ever pushed to cloud', r.pushedJob, false);

  // ── 2) Active-Jobs Edit/Delete route to the WO (no dead-end) ─────────────────
  const btn = await page.evaluate(() => {
    var woId = DB.workOrders[0].id;
    window.__openedWO = null; window.__deletedWO = null;
    editJob(woId);
    delJob(woId);
    return { opened: window.__openedWO, deleted: window.__deletedWO, woId: woId };
  });
  ok('Edit on an Active-Jobs row -> opens the WO', btn.opened, btn.woId);
  ok('Delete on an Active-Jobs row -> deletes the WO', btn.deleted, btn.woId);

  // ── 3) One-time repair re-points a legacy project onto its WO, idempotently ──
  const rep = await page.evaluate(() => {
    DB.workOrders = [{ id:'wo-real-1', woNumber:'WO-500', jobId:'shadow-123' }];  // pre-r13 WO carries the shadow id
    DB.wtProjects = [
      { id:'wtp-legacy', jobId:'shadow-123' },   // legacy quote-approval project -> must be re-pointed
      { id:'wtp-wizard', jobId:'wo-real-1' }      // wizard project already on a real WO -> must be left alone
    ];
    var first  = _relinkProjectsToWO({ push:false });
    var legacyAfter = DB.wtProjects.find(p=>p.id==='wtp-legacy').jobId;
    var wizardAfter = DB.wtProjects.find(p=>p.id==='wtp-wizard').jobId;
    var second = _relinkProjectsToWO({ push:false });  // idempotent: nothing left to do
    return { first, legacyAfter, wizardAfter, second };
  });
  ok('repair -> re-linked exactly 1 legacy project', rep.first, 1);
  ok('repair -> legacy project now points at the WO id', rep.legacyAfter, 'wo-real-1');
  ok('repair -> wizard project left untouched', rep.wizardAfter, 'wo-real-1');
  ok('repair -> idempotent (second run re-links nothing)', rep.second, 0);

  await browser.close();
  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
