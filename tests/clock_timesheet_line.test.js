// r43 PHASE 1 — "the clock IS the timesheet." Clock-in opens one itemized time_entries day-line
// (in-progress), clock-out closes it, and it's the clickable record the tech opens to add what-they-did.
// HARD GUARANTEE: zero payroll movement — the clock-sourced line is EXCLUDED from both aggregations
// (_rebuildDaySummary → workDay/payroll, and _renderAllEmployeesSummary → review totals), which keep
// reading the clock's authoritative workDay. This test verifies the real detector, the pay-invariance,
// and that the guards are wired in field.js.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/field.js', 'utf8');

// --- real _isClockEntry from field.js ---
var s = src.indexOf('function _isClockEntry(');
var e = src.indexOf('}', s) + 1;
if (s < 0) { console.log('✗ _isClockEntry not found'); process.exit(1); }
eval(src.slice(s, e));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// ---- detector: in-memory, post-sync, and NOT false-positive on manual/team ----
ok('detects in-memory clock entry (source)',        _isClockEntry({source:'clock'}), true);
ok('detects synced clock entry (isManual false + clockIn)', _isClockEntry({isManual:false, clockIn:'2026-10-30T12:00:00Z'}), true);
ok('detects edited+synced clock entry (no source, isManual false, clockIn)', _isClockEntry({isManual:false, clockIn:'2026-10-30T12:00:00Z', notes:'did x'}), true);
ok('NOT a manual entry',                             _isClockEntry({isManual:true, notes:'typed'}), false);
ok('NOT a team-clock entry (isManual true)',         _isClockEntry({isManual:true, teamClock:true, endTime:''}), false);
ok('NOT a plain entry with no markers',              _isClockEntry({isManual:true}), false);
ok('null-safe',                                      _isClockEntry(null), false);

// ---- pay-invariance: replicate the summary rule and prove a clocked day totals ONCE ----
// A clocked day = an authoritative workDay (480 paid: 400 onsite + 80 travel) + a clock-sourced line
// (totalMins 480). The summary sums NON-clock entries, then fills from the workDay when the day has no
// NON-clock entry. Result must be 480, not 960 (no double), and the travel/onsite split preserved.
function summarize(entries, workDays){
  var t = { workMins:0, travelMins:0, officeMins:0 };
  entries.forEach(function(x){
    if (_isClockEntry(x)) return;                 // r43 skip
    var m = x.totalMins||0;
    if (x.entryType==='work') t.workMins+=m; else if (x.entryType==='travel') t.travelMins+=m; else if (x.entryType==='office') t.officeMins+=m;
  });
  workDays.forEach(function(d){
    var hasNonClock = entries.some(function(x){ return x.date===d.date && !_isClockEntry(x); });  // r43 fill rule
    if (!hasNonClock){ t.workMins += d.onsiteMins||0; t.travelMins += d.travelMins||0; }
  });
  return t;
}
var workDay = { date:'2026-10-30', onsiteMins:400, travelMins:80, totalPaidMins:480 };
var clockLine = { date:'2026-10-30', entryType:'work', totalMins:480, source:'clock', isManual:false, clockIn:'x' };
var baseline = summarize([], [workDay]);                 // today: workDay only
var withLine = summarize([clockLine], [workDay]);        // r43: clock line present
ok('baseline total = 480',                baseline.workMins + baseline.travelMins, 480);
ok('with clock line: total STILL 480 (no double)', withLine.workMins + withLine.travelMins, 480);
ok('with clock line: onsite split preserved (400)', withLine.workMins, 400);
ok('with clock line: travel split preserved (80)',  withLine.travelMins, 80);
// and a genuinely manual entry DOES count (suppresses the workDay fill, as before)
var manual = { date:'2026-10-30', entryType:'work', totalMins:300, isManual:true };
ok('manual entry counts, suppresses workDay fill', summarize([manual], [workDay]).workMins, 300);

// ---- static guards wired in field.js ----
ok('_rebuildDaySummary excludes clock entries',        /!e\.deleted && !_isClockEntry\(e\)/.test(src), true);
ok('_rebuildDaySummary guards clock workDay from zeroing', /entries\.length === 0[\s\S]{0,260}hasManualEntries/.test(src), true);
ok('summary fill rule excludes clock entries',         /hasEntries = entries\.some\([\s\S]{0,120}!_isClockEntry\(e\)/.test(src), true);
ok('clock-in opens the line (doStartDay)',             /day_start[\s\S]{0,200}_ensureClockDayEntry\(\)/.test(src), true);
ok('clock-in opens/fills the line (doStartTravel)',    /travel_start[\s\S]{0,120}_ensureClockDayEntry\(\)/.test(src) || /_ensureClockDayEntry\(\);[\s\S]{0,120}logTimeEvent\('travel_start'/.test(src), true);
ok('clock-out closes the line',                        /_closeClockDayEntry\(_capTotal\)/.test(src), true);
ok('edit preserves clock-source marker',               /orig\.isManual\s*=\s*wasClock \? false : true/.test(src), true);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
