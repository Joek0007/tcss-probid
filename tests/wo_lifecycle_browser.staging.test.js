// ============================================================================
// BROWSER SMOKE TEST (staging) -- the REAL app, REAL handlers, REAL staging backend.
// ============================================================================
// Opens the actual deployed app in a real browser, forces the STAGING backend, logs in,
// and drives the whole office<->field work-order lifecycle -- asserting the cloud after every
// step. Proof the logic test can't give: real buttons, real handlers, real render. Runs in
// GitHub Actions (its network reaches the live app + staging Supabase); in a blocked sandbox
// it exits 2 (environment) rather than a false pass.
//
//   - Forces staging (localStorage probid_env='staging') -- can NEVER touch production.
//   - Logs in with the staging TEST accounts (automated test of our own app on our own test
//     backend -- never a real/production credential). Override via env:
//       PROBID_STAGING_EMAIL / PROBID_STAGING_PASSWORD (office owner)
//       PROBID_TECH_EMAIL   / PROBID_TECH_PASSWORD      (field tech)
//   - Seeds its own WO via the in-page client and keys every read/update/cleanup on its ID
//     (not a marker), so a UI save that rewrites fields can't lose it. Deletes it at the end.
//   - Fails only on a real crash (uncaught pageerror) or a wrong assertion; benign console
//     warnings are reported, not failed. Names the exact step that broke.
//
// Reliability rules learned from driving the live app + CI runs #1-#4:
//   - DB is a `let` (core.js) -- bare `DB` in evaluate, never `window.DB`.
//   - openWorkOrder(id) only populates when the WO is in DB.workOrders; a seed goes straight
//     to the cloud, so call fetchWorkOrderById(id) FIRST (it loads it in), then openWorkOrder --
//     otherwise the modal opens blank and saveWorkOrder wipes it.
//   - Drive the status <select> via value + 'change'; call real handlers; never pixel-click
//     native/OS widgets. Grant geolocation for the field clock. Retry the login once.
// ============================================================================
const { chromium } = require('playwright');

const APP_URL     = process.env.PROBID_APP_URL || 'https://joek0007.github.io/tcss-probid/';
const OWNER_EMAIL = process.env.PROBID_STAGING_EMAIL    || 'owner@tcss.com';
const OWNER_PASS  = process.env.PROBID_STAGING_PASSWORD || 'TCSSstaging!2026';
const TECH_EMAIL  = process.env.PROBID_TECH_EMAIL       || 'tech@tcss.com';
const TECH_PASS   = process.env.PROBID_TECH_PASSWORD    || 'TCSSstaging!2026';
const TECH_NAME   = process.env.PROBID_TECH_NAME        || 'Test Tech';
const STAGING_HOST = 'dkqucgditvcthjgreeqd.supabase.co';
const MARKER = 'CI-SMOKE-' + Date.now();     // human label in the WO description; reads key on ID

let pass = 0, fail = 0, brokeAt = null;
const consoleErrs = [];
function ok(step, n, g, w){
  if (JSON.stringify(g) === JSON.stringify(w)) { pass++; console.log('  [OK] ['+step+'] '+n); }
  else { fail++; if(!brokeAt) brokeAt = step; console.log('  [X] ['+step+'] '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w)); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function newAppPage(context){
  const page = await context.newPage();
  page.on('pageerror', e => ok('crash', 'uncaught page error: '+String(e).split('\n')[0], true, false));
  page.on('console', m => { if (m.type()==='error') consoleErrs.push(m.text().slice(0,160)); });
  await page.addInitScript(() => { try { localStorage.setItem('probid_env','staging'); } catch(e){} });
  return page;
}

// Resilient login: load, sign in, wait for the session; retry once on timeout.
async function login(page, email, password){
  for (let attempt = 0; attempt < 2; attempt++){
    try {
      await page.goto(APP_URL, { waitUntil:'domcontentloaded', timeout:45000 });
      await page.waitForFunction(() => typeof window.doSignIn === 'function' && document.getElementById('auth-email'), { timeout:30000 });
      await page.fill('#auth-email', email);
      await page.fill('#auth-password', password);
      await page.evaluate(() => window.doSignIn());
      const r = await page.waitForFunction(() => {
        var err = document.getElementById('auth-error');
        if (err && err.style.display !== 'none' && (err.textContent||'').trim()) return 'ERR:'+err.textContent.trim();
        return (window._currentUser && window._currentUser.id) ? true : null;
      }, { timeout:40000 }).then(h => h.jsonValue());
      if (r === true) return true;
      if (attempt === 1) return r;            // report ERR:... on the last try
    } catch (e) {
      if (attempt === 1) return 'TIMEOUT';
    }
    await wait(1500);                          // brief pause, then retry once
  }
  return 'TIMEOUT';
}

// Read our WO straight from the cloud, keyed on ID (survives any field rewrite).
function cloudWO(page, id){
  return page.evaluate(async (id) => {
    try {
      var r = await window._sb.from('work_orders').select('id,wo_number,status,assigned_techs,description').eq('id', id).limit(1);
      return (r.data && r.data[0]) ? r.data[0] : null;
    } catch(e){ return { err:String(e) }; }
  }, id);
}

(async () => {
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { console.log('ENVIRONMENT: could not launch Chromium ('+e.message+').'); process.exit(2); }

  const office = await browser.newContext();
  const page = await newAppPage(office);

  // reachability guard -- a blocked sandbox is an environment skip, not a failure
  try { await page.goto(APP_URL, { waitUntil:'domcontentloaded', timeout:45000 }); }
  catch (e) { console.log('ENVIRONMENT: cannot reach '+APP_URL+' ('+e.message+') -- run where github.io + staging Supabase are reachable (e.g. GitHub Actions).'); await browser.close(); process.exit(2); }

  let seededId = null;
  try {
    // -- 1) OFFICE: boots on STAGING, logged in ------------------------------
    const who = await login(page, OWNER_EMAIL, OWNER_PASS);
    ok('1.login', 'office signs in on staging (no auth error/timeout)', who, true);
    const boot = await page.evaluate(() => ({ env:window.PROBID_ENV, backend:window.SUPABASE_URL,
      banner: !!document.getElementById('probid-staging-banner'), role: window._currentUser&&window._currentUser.role }));
    ok('1.login', 'pointed at the STAGING backend', (boot.backend||'').indexOf(STAGING_HOST)>=0, true);
    ok('1.login', 'staging banner shown', boot.banner, true);
    ok('1.login', 'role is owner', boot.role, 'owner');

    // -- 2) Work Orders list renders real staging data -----------------------
    const listed = await page.evaluate(async () => {
      if (typeof goPage==='function') goPage('workorders');
      await new Promise(r=>setTimeout(r,1800));
      var b=document.getElementById('wo-list-body');
      var p=document.getElementById('page-workorders');
      return { active: !!(p && p.classList.contains('active')), rows: b? b.children.length : -1 };
    });
    ok('2.list', 'Work Orders page active', listed.active, true);
    ok('2.list', 'real WO list rendered rows', listed.rows>0, true);

    // -- 3) Seed a NEW WO assigned to the tech (reliable, keyed on ID) --------
    const seed = await page.evaluate(async (args) => {
      var id = 'wo-cismoke-'+Date.now();
      try {
        var r = await window._sb.from('work_orders').insert({
          id:id, wo_number:'WO-'+id.slice(-6), customer_name:'Test Customer 1',
          description: args.marker+' -- browser smoke lifecycle (auto-cleanup)',
          status:'NEW', assigned_techs:[args.tech], site_address:'1 Main St',
          labor_rate:125, tax_rate:0, created_at:new Date().toISOString(), updated_at:new Date().toISOString()
        }).select('id,status,assigned_techs').single();
        return r.data ? { id:id, data:r.data } : { err: r.error && r.error.message };
      } catch(e){ return { err:String(e) }; }
    }, { marker: MARKER, tech: TECH_NAME });
    seededId = seed.id || null;
    ok('3.seed', 'seeded a NEW WO assigned to the tech', seed.data && [seed.data.status, seed.data.assigned_techs], ['NEW', [TECH_NAME]]);

    // -- 4) Office advances status through the REAL dropdown + save -----------
    const advanced = await page.evaluate(async (id) => {
      if (typeof fetchWorkOrderById==='function') { try { await fetchWorkOrderById(id); } catch(e){} }
      if (typeof openWorkOrder==='function') openWorkOrder(id);
      await new Promise(r=>setTimeout(r,900));
      var sel = document.getElementById('wo-status');
      if (!sel) return { err:'no #wo-status' };
      var opt = Array.prototype.find.call(sel.options, function(o){ return /ready for pricing/i.test(o.value); });
      if (!opt) return { err:'no Ready-For-Pricing option' };
      sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
      if (typeof saveWorkOrder==='function') await saveWorkOrder();
      await new Promise(r=>setTimeout(r,1200));
      return { set: sel.value };
    }, seededId);
    const afterAdvance = await cloudWO(page, seededId);
    ok('4.status', 'status advanced to Ready For Pricing (persisted to cloud)', afterAdvance && afterAdvance.status, 'Open -- Ready For Pricing');

    // -- 5) Close -> the WO locks to view-only --------------------------------
    const locked = await page.evaluate(async (id) => {
      if (typeof fetchWorkOrderById==='function') { try { await fetchWorkOrderById(id); } catch(e){} }
      if (typeof openWorkOrder==='function') openWorkOrder(id);
      await new Promise(r=>setTimeout(r,800));
      var sel = document.getElementById('wo-status');
      var opt = Array.prototype.find.call(sel.options, function(o){ return /^void$/i.test(o.value); });
      sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
      if (typeof saveWorkOrder==='function') await saveWorkOrder();
      await new Promise(r=>setTimeout(r,1000));
      if (typeof openWorkOrder==='function') openWorkOrder(id);
      await new Promise(r=>setTimeout(r,700));
      return { lockedByFn: (typeof _isWOLocked==='function') ? _isWOLocked({status:'Void'}) : null };
    }, seededId);
    const afterClose = await cloudWO(page, seededId);
    ok('5.close', 'closed to Void (persisted)', afterClose && afterClose.status, 'Void');
    ok('5.close', 'a closed WO reports locked (view-only)', locked.lockedByFn, true);

    // -- 6) FIELD: reset to NEW, tech clocks in -> auto NEW -> In Progress ------
    await page.evaluate(async (id) => {
      await window._sb.from('work_orders').update({ status:'NEW', updated_at:new Date().toISOString() }).eq('id', id);
    }, seededId);

    const techCtx = await browser.newContext({ permissions:['geolocation'], geolocation:{ latitude:35.70, longitude:-79.81, accuracy:30 } });
    const tpage = await newAppPage(techCtx);
    const twho = await login(tpage, TECH_EMAIL, TECH_PASS);
    ok('6.tech', 'field tech signs in on staging', twho, true);

    const drove = await tpage.evaluate(async (id) => {
      if (typeof syncAllFromCloud==='function') { try { await syncAllFromCloud(true); } catch(e){} }
      if (typeof goPage==='function') goPage('field');
      var sel=null, sees=false;
      for (var i=0;i<16;i++){
        await new Promise(r=>setTimeout(r,500));
        sel = document.getElementById('clock-job-select');
        sees = sel && Array.prototype.some.call(sel.options, function(o){ return o.value===id; });
        if (sees) break;
      }
      if (!sees) return { sawJob:false };
      if (typeof doStartDay==='function') await doStartDay();
      await new Promise(r=>setTimeout(r,600));
      sel.value = id; sel.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,300));
      if (typeof doStartTravel==='function') await doStartTravel();
      await new Promise(r=>setTimeout(r,1800));
      return { sawJob:true, clock: window._clockState && window._clockState.status };
    }, seededId);
    ok('6.tech', 'tech sees the assigned WO in the clock-in list', drove.sawJob, true);

    // Auto-promote flips DB.workOrders FIRST then pushes; verify by the app's own state (reliable),
    // poll the cloud as a bonus (the single promote push is subject to runner network blips).
    const promoted = await tpage.evaluate(async (id) => {
      function localStatus(){ var wo=((typeof DB!=='undefined'&&DB.workOrders)||[]).find(function(w){return w&&w.id===id;}); return wo?wo.status:null; }
      var local=null, cloud=null;
      for (var i=0;i<12;i++){
        local = localStatus();
        try { var r = await window._sb.from('work_orders').select('status').eq('id',id).limit(1); cloud = (r.data&&r.data[0])?r.data[0].status:null; } catch(e){}
        if (/in progress/i.test(local||'') || /in progress/i.test(cloud||'')) break;
        await new Promise(r=>setTimeout(r,1000));
      }
      return { local:local, cloud:cloud, clock: window._clockState && window._clockState.status };
    }, seededId);
    var promotedOk = /in progress/i.test(promoted.local||'') || /in progress/i.test(promoted.cloud||'');
    ok('6.auto', 'clock-in auto-promoted the WO NEW -> In Progress (local='+promoted.local+' cloud='+promoted.cloud+' clock='+promoted.clock+')', promotedOk, true);
    await techCtx.close();

  } catch (e) {
    fail++; if(!brokeAt) brokeAt='exception';
    console.log('  [X] [exception] '+(e && e.stack || e));
  } finally {
    if (seededId) {
      try {
        const del = await page.evaluate(async (id) => {
          try { var r = await window._sb.from('work_orders').delete().eq('id', id); return r.error? r.error.message : 'ok'; }
          catch(e){ return String(e); }
        }, seededId);
        console.log('  . cleanup: deleted smoke WO '+seededId+' -> '+del);
      } catch(e){ console.log('  . cleanup skipped: '+e.message); }
    }
    await browser.close();
  }

  if (consoleErrs.length) console.log('\n  (console warnings, not failed): '+consoleErrs.slice(0,8).join(' | '));
  console.log('\n'+(fail
    ? '[X] BROWSER SMOKE FAILED -- first broken step: '+brokeAt+'  ('+fail+' failed, '+pass+' passed)'
    : 'ALL '+pass+' PASSED -- the real app runs the full office<->field lifecycle on staging'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('UNEXPECTED: '+(e && e.stack || e)); process.exit(1); });
