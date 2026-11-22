// r93 escalation settings — the owner-configurable escalation policy. Joe's locked decision:
// "by default... notify whoever sent the quote out and the owner by default, and somebody has to
// take it off... so that way... somebody can't leave it open and unattended to." That means the
// settings must be FAIL-SAFE / OPT-OUT: when the keys are absent (or someone clears them), the
// policy is ON with sane thresholds — never silently off. These keys ride
// company_settings.settings_json, which the run_quote_escalations() pg_cron job reads, so this
// proves the UI, the save, and the load all exist and default safely.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const core = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r93 escalation settings (fail-safe / opt-out) ──');

// 1) UI controls exist on the alerts card
ok('escalation enable control present',      /id="ms-notif-escalation-enabled"/.test(html));
ok('first-nudge control present',            /id="ms-notif-escalate-first"/.test(html));
ok('manager-escalate control present',       /id="ms-notif-escalate-mgr"/.test(html));
ok('copy frames escalation as unattended-guard', /sits? unattended/i.test(html));
ok('on-by-default is stated to the user',    /On by default/i.test(html));

// 2) SAVE writes the three keys into DB.settings (which _pushSettingsToSupabase → settings_json)
ok('save writes escalationOn',               /escalationOn:\s*\(\(document\.getElementById\('ms-notif-escalation-enabled'\)/.test(core));
ok('save writes escalateFirstHours',         /escalateFirstHours:\s*parseInt\(\(document\.getElementById\('ms-notif-escalate-first'\)/.test(core));
ok('save writes escalateManagerHours',       /escalateManagerHours:\s*parseInt\(\(document\.getElementById\('ms-notif-escalate-mgr'\)/.test(core));

// 3) SAVE is fail-safe: escalation is ON unless the control is explicitly '0' (opt-out, not opt-in)
ok('save escalationOn is opt-OUT (!== \'0\')', /escalationOn:[^\n]*!==\s*'0'/.test(core));
// 3b) SAVE thresholds fall back to 24h / 48h when parse fails
ok('save firstHours falls back to 24',       /escalateFirstHours:[^\n]*\|\|\s*24/.test(core));
ok('save managerHours falls back to 48',     /escalateManagerHours:[^\n]*\|\|\s*48/.test(core));

// 4) LOAD/populate is fail-safe: a company with NO stored keys shows ON / 24 / 48, never off
ok('load defaults escalationOn to ON (!== false)', /escEn\.value\s*=\s*\(s\.escalationOn\s*!==\s*false\)/.test(core));
ok('load defaults firstHours to 24',         /escF\.value\s*=\s*String\(s\.escalateFirstHours\s*\|\|\s*24\)/.test(core));
ok('load defaults managerHours to 48',       /escM\.value\s*=\s*String\(s\.escalateManagerHours\s*\|\|\s*48\)/.test(core));

// 5) the control values offered match what run_quote_escalations expects (hours as ints)
ok('first-nudge offers a 24h option',        /id="ms-notif-escalate-first"[\s\S]{0,260}value="24"/.test(html));
ok('manager-escalate offers a 48h option',   /id="ms-notif-escalate-mgr"[\s\S]{0,200}value="48"/.test(html));

console.log((fail===0?'✅':'❌')+' escalation settings: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
