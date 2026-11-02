// r44 — clock PAID-HOURS math. Rule: paid = whole clocked span (base/office + travel + on-site + paid
// breaks) minus unpaid lunch; base/office time counts as paid. Loads the REAL _computeClockDayTotals
// from field.js and checks it against Lisa's actual test day (which read 5h51m under the old buggy
// formula) plus the other clock-day shapes. office + travel + onsite must always equal totalPaid.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/field.js', 'utf8');
var s = src.indexOf('function _computeClockDayTotals(');
if (s < 0) { console.log('✗ _computeClockDayTotals not found'); process.exit(1); }
var e = src.indexOf('\n}', s) + 2;
eval(src.slice(s, e));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }
function D(hhmm){ return new Date('2026-10-30T'+hhmm+':00'); }

// ── Lisa's actual day (from the recorded punches): base 7:33 → travel/onsite 10:06, 11m break,
//    45m lunch 2:30–3:15, out 3:46. Expected paid = 8h13m span − 45m lunch = 7h28m = 448 min. ──
(function(){
  var st = { homebaseStart:D('07:33'), dayStart:D('10:06'), travelOutStart:D('10:06'), onsiteStart:D('10:06'),
             travelOutMins:0, travelBackMins:0, breakMins:11, lunchMins:45 };
  var r = _computeClockDayTotals(st, D('15:46'));
  ok('LISA: total paid = 448 (7h28m), not 351', r.totalPaidMins, 448);
  ok('LISA: base/office counted = 153', r.officeMins, 153);
  ok('LISA: onsite = 295 (break in, lunch out)', r.onsiteMins, 295);
  ok('LISA: travel = 0', r.travelMins, 0);
  ok('LISA: lunch informational = 45', r.lunchMins, 45);
  ok('LISA: office+travel+onsite === totalPaid', r.officeMins+r.travelMins+r.onsiteMins, r.totalPaidMins);
})();

// ── Field tech straight to travel (NO base phase): no homebaseStart. ──
(function(){
  var st = { dayStart:D('08:00'), travelOutStart:D('08:00'), onsiteStart:D('08:30'),
             travelOutMins:30, travelBackMins:15, breakMins:10, lunchMins:30 };
  var r = _computeClockDayTotals(st, D('16:30'));
  ok('FIELD: total paid = 480 (8:00–16:30 span 510 − 30 lunch)', r.totalPaidMins, 480);
  ok('FIELD: no base time', r.officeMins, 0);
  ok('FIELD: travel = 45', r.travelMins, 45);
  ok('FIELD: onsite = 435', r.onsiteMins, 435);
  ok('FIELD: parts sum to paid', r.officeMins+r.travelMins+r.onsiteMins, r.totalPaidMins);
})();

// ── Office person who starts at base and NEVER travels → whole paid day is base/office. ──
(function(){
  var st = { homebaseStart:D('09:00'), travelOutMins:0, travelBackMins:0, breakMins:0, lunchMins:60 };
  var r = _computeClockDayTotals(st, D('17:00'));
  ok('BASE-ONLY: total paid = 420 (480 span − 60 lunch)', r.totalPaidMins, 420);
  ok('BASE-ONLY: all paid time is office/base', r.officeMins, 420);
  ok('BASE-ONLY: no onsite, no travel', [r.onsiteMins, r.travelMins], [0,0]);
})();

// ── No lunch → nothing subtracted; break is counted once (inside span), never added twice. ──
(function(){
  var st = { homebaseStart:D('07:00'), travelOutStart:D('07:30'), onsiteStart:D('07:30'),
             travelOutMins:30, travelBackMins:0, breakMins:20, lunchMins:0 };
  var r = _computeClockDayTotals(st, D('15:00'));
  ok('NOLUNCH: total paid = 480 (full 7:00–15:00 span, nothing subtracted)', r.totalPaidMins, 480);
  ok('NOLUNCH: break NOT added on top (single-counted)', r.totalPaidMins, 480);
  ok('NOLUNCH: base = 30', r.officeMins, 30);
  ok('NOLUNCH: parts sum to paid', r.officeMins+r.travelMins+r.onsiteMins, r.totalPaidMins);
})();

// ── Robustness: empty/garbage state doesn't throw or go negative. ──
(function(){
  var r = _computeClockDayTotals({}, D('12:00'));
  ok('EMPTY: paid is 0, not negative/NaN', r.totalPaidMins, 0);
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
