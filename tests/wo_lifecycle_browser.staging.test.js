// ============================================================================
// BROWSER SMOKE TEST (staging) — the REAL app, REAL handlers, REAL staging backend.
// ============================================================================
// Opens the actual deployed app in a real browser, forces the STAGING backend, logs in,
// and drives the whole office↔field work-order lifecycle — asserting the cloud after every
// step. This is the proof the logic test can't give: real buttons, real handlers, real
// render. Runs in GitHub Actions on every push (GitHub's network reaches the live app +
// staging Supabase). It will NOT run in a sandbox whose egress blocks those hosts — there
// it exits 2 (environment) rather than a false pass.
//
//   • Forces staging (localStorage probid_env='staging') — can NEVER touch production.
//   • Logs in with the staging TEST accounts (automated test of our own app on our own
//     test backend — never a real/production credential). Override via env:
//       PROBID_STAGING_EMAIL / PROBID_STAGING_PASSWORD (office owner)
//       PROBID_TECH_EMAIL   / PROBID_TECH_PASSWORD      (field tech)
//   • Seeds its own work order via the in-page client, drives it through the UI, and
//     DELETES it at the end (keyed by a per-run marker) — leaves no litter on staging.
//   • Fails only on a real crash (uncaught pageerror) or a wrong assertion; benign console
//     warnings are reported, not failed. Names the exact step that broke.
//
// Reliable-interaction rules (learned from driving the live app): drive the status <select>
// via value + 'change', call the app's real handlers (saveWorkOrder/doStartTravel/…) rather
// than pixel-clicking native/OS widgets, and assert persistence against the cloud.
// ============================================================================
const { chromium } = require('playwright');

const APP_URL   = process.env.PROBID_APP_URL || 'https://joek0007.github.io/tcss-probid/';
const OWNER_EMAIL = process.env.PROBID_STAGING_EMAIL    || 'owner@tcss.com';
const OWNER_PASS  = process.env.PROBID_STAGING_PASSWORD || 'TCSSstaging!2026';
const TECH_EMAIL  = process.env.PROBID_TECH_EMAIL       || 'tech@tcss.com';
const TECH_PASS   = process.env.PROBID_TECH_PASSWORD    || 'TCSSstaging!2026';
const TECH_NAME   = process.env.PROBID_TECH_NAME        || 'Test Tech';
const STAGING_HOST = 'dkqucgditvcthjgreeqd.supabase.co';
const MARKER = 'CI-SMOKE-' + Date.now();     // unique per run; used to find + clean up our WO

let pass = 0, fail = 0, brokeAt = null;
const consoleErrs = [];
function ok(step, n, g, w){
  if (JSON.stringify(g) === JSON.stringify(w)) { pass++; console.log('  ✓ ['+step+'] '+n); }
  else { fail++; if(!brokeAt) brokeAt = step; console.log('  ✗ ['+step+'] '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w)); }
}

// force staging + wire error capture on a fresh page; returns the page
async function newAppPage(context){
  const page = await context.newPage();
  page.on('pageerror', e => ok('crash', 'uncaught page error: '+String(e).split('\n')[0], true, false));
  page.on('console', m => { if (m.type()==='error') consoleErrs.push(m.text().slice(0,160)); });
  await page.addInitScript(() => { try { localStorage.setItem('probid_env','staging'); } catch(e){} });
  return page;
}
async function login(page, email, password){
  await page.goto(APP_URL, { waitUntil:'domcontentloaded', timeout:45000 });
  await page.waitForFunction(() => typeof window.doSignIn === 'function' && document.getElementById('auth-email'), { timeout:30000 });
  await page.fill('#auth-email', email);
  await page.fill('#auth-password', password);
  await page.evaluate(() => window.doSignIn());
  return page.waitForFunction(() => {
    var err = document.getElementById('auth-error');
    if (err && err.style.display !== 'none' && (err.textContent||'').trim()) return 'ERR:'+err.textContent.trim();
    return (window._currentUser && window._currentUser.id) ? true : null;
  }, { timeout:30000 }).then(h => h.jsonValue()).catch(() => 'TIMEOUT');
}
// read one WO from the cloud by our marker (via the in-page authed client)
function cloudWO(page){
  return page.evaluate(async (marker) => {
    try { var r = await window._sb.from('work_orders').select('id,wo_number,status,assigned_techs').ilike('description', marker+'%').order('created_at',{ascending:false}).limit(1);
      return r.data && r.data[0] ? r.data[0] : null; } catch(e){ return {err:String(e)}; }
  }, MARKER);
}

(async () => {
  let browser;
  try { browser = await chromium.launch(); }
  catch (e) { console.log('ENVIRONMENT: could not launch Chromium ('+e.message+').'); process.exit(2); }

  const office = await browser.newContext();
  const page = await newAppPage(office);

  // reachability guard — in a blocked sandbox this is an environment skip, not a failure
  try { await page.goto(APP_URL, { waitUntil:'domcontentloaded', timeout:45000 }); }
  catch (e) { console.log('ENVIRONMENT: cannot reach '+APP_URL+' ('+e.message+') — run where github.io + staging Supabase are reachable (e.g. GitHub Actions).'); await browser.close(); process.exit(2); }

  let seededId = null;
  try {
    // ── 1) OFFICE: app boots on STAGING, logged in ──────────────────────────
    const who = await login(page, OWNER_EMAIL, OWNER_PASS);
    ok('1·login', 'office signs in on staging (no auth error/timeout)', who, true);
    const boot = await page.evaluate(() => ({ env:window.PROBID_ENV, backend:window.SUPABASE_URL,
      banner: !!document.getElementById('probid-staging-banner'), role: window._currentUser&&window._currentUser.role }));
    ok('1·login', 'pointed at the STAGING backend', (boot.backend||'').indexOf(STAGING_HOST)>=0, true);
    ok('1·login', 'staging banner shown', boot.banner, true);
    ok('1·login', 'role is owner', boot.role, 'owner');

    // ── 2) Work Orders list renders real staging data ───────────────────────
    const listed = await page.evaluate(async () => {
      if (typeof goPage==='function') goPage('workorders');
      await new Promise(r=>setTimeout(r,1800));
      var b=document.getElementById('wo-list-body');
      return { active: !!(document.getElementById('page-workorders')||{}).classList && document.getElementById('page-workorders').classList.contains('active'),
               rows: b? b.children.length : -1 };
    });
    ok('2·list', 'Work Orders page active', listed.active, true);
    ok('2·list', 'real WO list rendered rows', listed.rows>0, true);

    // ── 3) Seed a work order (reliable), assigned to the tech, status NEW ────
    const seed = await page.evaluate(async (args) => {
      var id = 'wo-cismoke-'+Date.now();
      try {
        var r = await window._sb.from('work_orders').insert({
          id:id, wo_number:'WO-'+id.slice(-6), customer_name:'Test Customer 1',
          description: args.marker+' — browser smoke lifecycle (auto-cleanup)',
          status:'NEW', assigned_techs:[args.tech], site_address:'1 Main St',
          labor_rate:125, tax_rate:0, created_at:new Date().toISOString(), updated_at:new Date().toISOString()
        }).select('id,status,assigned_techs').single();
        return r.data ? {id:id, data:r.data} : {err: r.error && r.error.message};
      } catch(e){ return {err:String(e)}; }
    }, { marker: MARKER, tech: TECH_NAME });
    seededId = seed.id || null;
    ok('3·seed', 'seeded a NEW WO assigned to the tech', seed.data && [seed.data.status, seed.data.assigned_techs], ['NEW', [TECH_NAME]]);

    // ── 4) Office advances status through the REAL dropdown + save ───────────
    const advanced = await page.evaluate(async (id) => {
      await window.syncAllFromCloud(true);                 // pull the seeded WO into memory
      await new Promise(r=>setTimeout(r,1200));
      if (typeof openWorkOrder==='function') openWorkOrder(id);
      await new Promise(r=>setTimeout(r,800));
      var sel = document.getElementById('wo-status');
      if (!sel) return {err:'no #wo-status'};
      var opt = Array.prototype.find.call(sel.options, function(o){ return /ready for pricing/i.test(o.value); });
      if (!opt) return {err:'no Ready-For-Pricing option'};
      sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
      if (typeof saveWorkOrder==='function') await saveWorkOrder();
      await new Promise(r=>setTimeout(r,1200));
      return { set: sel.value };
    }, seededId);
    const afterAdvance = await cloudWO(page);
    ok('4·status', 'status advanced to Ready For Pricing (persisted to cloud)', afterAdvance && afterAdvance.status, 'Open -- Ready For Pricing');

    // ── 5) Close → the WO locks to view-only ────────────────────────────────
    const locked = await page.evaluate(async (id) => {
      var sel = document.getElementById('wo-status');
      var opt = Array.prototype.find.call(sel.options, function(o){ return /^void$/i.test(o.value); });
      sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true}));
      if (typeof saveWorkOrder==='function') await saveWorkOrder();
      await new Promise(r=>setTimeout(r,1000));
      if (typeof openWorkOrder==='function') openWorkOrder(id);   // reopen the now-closed WO
      await new Promise(r=>setTimeout(r,700));
      var lockedByFn = (typeof _isWOLocked==='function') ? _isWOLocked({status:'Void'}) : null;
      return { lockedByFn };
    }, seededId);
    const afterClose = await cloudWO(page);
    ok('5·close', 'closed to Void (persisted)', afterClose && afterClose.status, 'Void');
    ok('5·close', 'a closed WO reports locked (view-only)', locked.lockedByFn, true);

    // ── 6) Re-seed NEW + FIELD: tech clock-in auto-promotes NEW → In Progress ─
    // fresh NEW WO for the field leg (the office one is now Void)
    const field = await (async () => {
      // reset our marker WO back to NEW & assigned, for the field drive
      await page.evaluate(async (args) => {
        await window._sb.from('work_orders').update({ status:'NEW', assigned_techs:[args.tech], updated_at:new Date().toISOString() })
          .ilike('description', args.marker+'%');
      }, { marker: MARKER, tech: TECH_NAME });

      const techCtx = await browser.newContext({ permissions:['geolocation'], geolocation:{ latitude:35.70, longitude:-79.81, accuracy:30 } });
      const tpage = await newAppPage(techCtx);
      const twho = await login(tpage, TECH_EMAIL, TECH_PASS);
      ok('6·tech', 'field tech signs in on staging', twho, true);

      const drove = await tpage.evaluate(async (id) => {
        if (typeof goPage==='function') goPage('field');
        await new Promise(r=>setTimeout(r,1800));
        var sel = document.getElementById('clock-job-select');
        var sees = sel && Array.prototype.some.call(sel.options, function(o){ return o.value===id; });
        if (!sees) return { sawJob:false };
        // Start Day → select job → Start Travel  (auto-promote fires as the clock day opens on the WO)
        if (typeof doStartDay==='function') await doStartDay();
        await new Promise(r=>setTimeout(r,600));
        sel.value = id; sel.dispatchEvent(new Event('change',{bubbles:true}));
        await new Promise(r=>setTimeout(r,300));
        if (typeof doStartTravel==='function') await doStartTravel();
        await new Promise(r=>setTimeout(r,1500));
        return { sawJob:true, clock: window._clockState && window._clockState.status };
      }, seededId);
      ok('6·tech', 'tech sees the assigned WO in the clock-in list', drove.sawJob, true);

      await tpage.waitForTimeout(800);
      const afterClockIn = await cloudWO(tpage);
      ok('6·auto', 'clock-in auto-promoted the WO NEW → In Progress (cloud)', afterClockIn && afterClockIn.status, 'Open- "In Progress"');
      await techCtx.close();
      return true;
    })();

  } catch (e) {
    fail++; if(!brokeAt) brokeAt='exception';
    console.log('  ✗ [exception] '+(e && e.stack || e));
  } finally {
    // ── cleanup: delete our marker WO so staging stays clean ────────────────
    try {
      const del = await page.evaluate(async (marker) => {
        try { var r = await window._sb.from('work_orders').delete().ilike('description', marker+'%'); return r.error? r.error.message : 'ok'; }
        catch(e){ return String(e); }
      }, MARKER);
      console.log('  · cleanup: deleted smoke WO → '+del);
    } catch(e){ console.log('  · cleanup skipped: '+e.message); }
    await browser.close();
  }

  if (consoleErrs.length) console.log('\n  (console warnings, not failed): '+consoleErrs.slice(0,8).join(' | '));
  console.log('\n'+(fail
    ? '✗ BROWSER SMOKE FAILED — first broken step: '+brokeAt+'  ('+fail+' failed, '+pass+' passed)'
    : 'ALL '+pass+' PASSED — the real app runs the full office↔field lifecycle on staging'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('UNEXPECTED: '+(e && e.stack || e)); process.exit(1); });
