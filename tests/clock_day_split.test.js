// r49 — clock day split across midnight + 24h runaway cap. Loads the REAL _splitClockDay (+ its helper
// _computeClockDayTotals, _localDateStr) from field.js and checks: a normal same-day shift is unchanged;
// an overnight shift splits at LOCAL midnight into two days whose parts sum to the whole; a forgotten
// clock-out is capped at 24h and flagged; allocations sum EXACTLY (no lost/created minutes).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/field.js', 'utf8');
// the three pure fns (_computeClockDayTotals, _localDateStr, _splitClockDay) are contiguous, just before
// the async _doArriveBackActual — grab them as one block.
var _s = src.indexOf('function _computeClockDayTotals(');
var _e = src.indexOf('async function _doArriveBackActual(');
if (_s<0 || _e<0) { console.log('✗ cannot slice clock helpers'); process.exit(1); }
eval(src.slice(_s, _e));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }
function near(n,g,w,tol){ if(Math.abs(g-w)<=(tol||1)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+g+' want ~'+w);} }

// ---- 1) Normal same-day shift: 8:00a → 4:30p, started at base, 30m lunch → ONE segment ----
(function(){
  var t0=new Date(2026,9,20,8,0,0), end=new Date(2026,9,20,16,30,0); // Oct 20 local
  var st={ homebaseStart:t0, travelOutStart:new Date(2026,9,20,8,30,0), onsiteStart:new Date(2026,9,20,9,0,0),
           travelOutMins:30, travelBackMins:0, onsiteMins:0, lunchMins:30, breakMins:0 };
  var r=_splitClockDay(t0,end,st);
  ok('normal day → 1 segment', r.segments.length, 1);
  ok('normal day not auto-stopped', r.autoStopped, false);
  ok('normal day date', r.segments[0].date, '2026-10-20');
  // span 8h30m - 30m lunch = 480m paid
  near('normal day paid=480', r.segments[0].totalPaidMins, 480, 1);
})();

// ---- 2) Overnight shift: 10:00p Oct 20 → 2:00a Oct 21, no lunch → TWO segments, 2h + 2h ----
(function(){
  var t0=new Date(2026,9,20,22,0,0), end=new Date(2026,9,21,2,0,0);
  var st={ homebaseStart:t0, onsiteStart:t0, travelOutMins:0, travelBackMins:0, onsiteMins:0, lunchMins:0, breakMins:0 };
  var r=_splitClockDay(t0,end,st);
  ok('overnight → 2 segments', r.segments.length, 2);
  ok('crossesMidnight flag', r.crossesMidnight, true);
  ok('seg1 date = start day', r.segments[0].date, '2026-10-20');
  ok('seg2 date = next day', r.segments[1].date, '2026-10-21');
  near('seg1 paid ~120', r.segments[0].totalPaidMins, 120, 1);
  near('seg2 paid ~120', r.segments[1].totalPaidMins, 120, 1);
  ok('parts sum to whole (240)', r.segments[0].totalPaidMins + r.segments[1].totalPaidMins, 240);
})();

// ---- 3) Runaway (Dawn): started Oct 12 15:23, "closed" Oct 30 → capped at 24h, flagged ----
(function(){
  var t0=new Date(2026,9,12,15,23,0), end=new Date(2026,9,30,19,12,0); // ~18 days later
  var st={ homebaseStart:t0, onsiteStart:new Date(2026,9,12,16,0,0), travelOutMins:0, travelBackMins:25, onsiteMins:0, lunchMins:54, breakMins:0 };
  var r=_splitClockDay(t0,end,st);
  ok('runaway auto-stopped', r.autoStopped, true);
  var sum=r.segments.reduce(function(s,x){return s+x.totalPaidMins;},0);
  // capped span = 24h = 1440m, minus 54m lunch = 1386m paid
  near('runaway capped paid=1386 (24h - 54m lunch)', sum, 1386, 2);
  ok('runaway spans 2 calendar days', r.segments.length, 2);
  ok('seg1 is the start day', r.segments[0].date, '2026-10-12');
  ok('every segment flagged long/auto', r.segments.every(function(s){return s.longDayFlagged;}), true);
})();

// ---- 4) Allocation is EXACT: component sums across segments == whole ----
(function(){
  var t0=new Date(2026,9,20,20,0,0), end=new Date(2026,9,21,7,0,0); // 11h overnight
  var st={ homebaseStart:t0, travelOutStart:new Date(2026,9,20,20,15,0), onsiteStart:new Date(2026,9,20,21,0,0),
           travelOutMins:45, travelBackMins:20, onsiteMins:0, lunchMins:30, breakMins:15 };
  var full=_computeClockDayTotals(st,end);
  var r=_splitClockDay(t0,end,st);
  function s(k){ return r.segments.reduce(function(a,x){return a+x[k];},0); }
  ok('paid sum exact',   s('totalPaidMins'), full.totalPaidMins);
  ok('office sum exact',  s('officeMins'),   full.officeMins);
  ok('travel sum exact',  s('travelMins'),   full.travelMins);
  ok('onsite sum exact',  s('onsiteMins'),   full.onsiteMins);
  ok('lunch sum exact',   s('lunchMins'),    full.lunchMins);
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
