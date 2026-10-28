// r21: the office live dashboard badge must reflect each person's LATEST time_event (correct by
// timestamp), not the session.status cache (last-writer-wins, lags after conflicting offline edits).
// Drives the REAL _dashLiveStatusFor from reports.js.
const { chromium } = require('playwright');
const fs = require('fs');
const REPORTS = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('https://tcss-test.local/', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' }));
  await page.goto('https://tcss-test.local/');
  await page.addScriptTag({ content: `
    window.getTodayISO = function(){ return '2026-10-28'; };
    window.escHtml = function(s){ return String(s==null?'':s); };
    window.DB = { team:[], workDays:[] };
    window._sb = null;
  `});
  await page.addScriptTag({ content: REPORTS });
  if (errs.length){ console.log('LOAD ERRORS:\n  '+errs.join('\n  ')); await browser.close(); process.exit(1); }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

  const r = await page.evaluate(() => {
    var member = { name:'Dawn', userId:'u1' };
    // Session cache says on_break (stale, last-writer-wins). Latest event says back to work.
    window._liveSessions = [{ user_id:'u1', user_name:'Dawn', status:'on_break', job_name:'Job A', clock_in_at:'2026-10-28T10:00:00Z' }];
    window._liveLatestEvent = { u1: { user_id:'u1', event_type:'break_end', timestamp:'2026-10-28T10:20:00Z' } };
    var a = _dashLiveStatusFor(member);
    // Latest event is day_end → not live.
    window._liveLatestEvent = { u1: { user_id:'u1', event_type:'day_end', timestamp:'2026-10-28T17:00:00Z' } };
    var b = _dashLiveStatusFor(member);
    // No event for the user → fall back to the session cache.
    window._liveLatestEvent = {};
    var c = _dashLiveStatusFor(member);
    return { a: a && a.key, b: b, c: c && c.key };
  });
  ok('dash -> latest event (break_end) beats stale on_break cache', r.a, 'onsite');
  ok('dash -> latest event day_end => not live (null)', r.b, null);
  ok('dash -> no event falls back to session cache (break)', r.c, 'break');

  await browser.close();
  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
