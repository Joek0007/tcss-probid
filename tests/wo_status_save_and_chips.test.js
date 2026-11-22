// r94 — Dawn's retest: three WO-list/detail fixes.
//  #4b  the "Open- \"In Progress\"" quick-filter chip was dead because its status id contains a double
//       quote that broke the inline onclick="woChipClick('…')" HTML attribute. Chips now use a
//       data-attribute + a delegated click handler, so any id (quotes/apostrophes) filters.
//  #4a  the office hand-off status "Ready For Office-Review" is configured mobile:true (a tech must be
//       able to SET it to hand a job back) + techDone:true. It kept showing as a tech FILTER chip
//       because the chip gate only hid mobile:false. Chips now also hide techDone for field users —
//       but the status DROPDOWN still offers it (techs can still set the hand-off).
//  #5/#3 a status change made on the WO DETAIL dropdown only saved via the modal Save button (lost on
//       an X-close), while the list badge saved instantly — "I can change it on List View" / "does not
//       save any status change". onWOStatusChange now persists immediately via setWOStatus.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r94 WO status-save + quick-filter chips ──');

// ---- #4b: chips no longer inject the status into an inline onclick string ----
ok('#4b chips do NOT build an inline woChipClick() onclick string',
   !/onclick="woChipClick\(\\'/.test(src) && src.indexOf("'<span onclick=\"woChipClick") < 0);
ok('#4b makeChip emits a data-status attribute (escaped)',
   /class="wo-chip" data-status="'\+escHtml\(status\)\+'"/.test(src));
ok('#4b a delegated chip click handler is wired once',
   /chipsEl\.dataset\.wired/.test(src) && /ev\.target\.closest\('\.wo-chip'\)/.test(src) &&
   /woChipClick\(chip\.getAttribute\('data-status'\)/.test(src));

// ---- #4a: chip gate hides techDone for field users; dropdown gate unchanged ----
// slice the two predicates + a stub field-scope flag and prove the behavior with teeth.
const chipFnStart = src.indexOf('function _woStatusHiddenFromFieldFilter');
const chipFnEnd   = src.indexOf('\n}', src.indexOf('function _woStatusHiddenFromFieldChip')) + 2;
let _fieldScoped = true;
function _woUserIsFieldScoped(){ return _fieldScoped; }
eval(src.slice(chipFnStart, chipFnEnd));   // defines _woStatusHiddenFromFieldFilter + _woStatusHiddenFromFieldChip

const handoff = { id:'Open -- Ready For Office-Review', mobile:true,  techDone:true };   // live config
const inprog  = { id:'Open- "In Progress"',            mobile:true,  techDone:null };
const officeO = { id:'Open -- Ready For Pricing',       mobile:false, techDone:null };

_fieldScoped = true;
ok('#4a field user: hand-off status HIDDEN from chips',        _woStatusHiddenFromFieldChip(handoff) === true);
ok('#4a field user: hand-off status NOT hidden by dropdown gate (still settable)',
                                                                _woStatusHiddenFromFieldFilter(handoff) === false);
ok('#4a field user: normal mobile status still shown as chip', _woStatusHiddenFromFieldChip(inprog) === false);
ok('#4a field user: office-only status hidden from chips',     _woStatusHiddenFromFieldChip(officeO) === true);
_fieldScoped = false;
ok('#4a office user: hand-off status shown as chip',           _woStatusHiddenFromFieldChip(handoff) === false);
ok('#4a office user: office-only status shown as chip',        _woStatusHiddenFromFieldChip(officeO) === false);

// the chip render loop uses the CHIP gate, the dropdown builder still uses the FILTER gate
ok('#4a chip loop uses _woStatusHiddenFromFieldChip',          /_woStatusHiddenFromFieldChip\(s\)\) return;/.test(src));
ok('#4a dropdown builder still uses _woStatusHiddenFromFieldFilter',
   /statusList = statusList\.filter\(function\(s\)\{ return !\(typeof _woStatusHiddenFromFieldFilter/.test(src));

// ---- #5/#3: detail status dropdown auto-saves via setWOStatus ----
const oStart = src.indexOf('function onWOStatusChange');
const oEnd   = src.indexOf('\n}', src.indexOf('showToast(\'Status → \'+wo.status', oStart)) + 2;
const oFn    = src.slice(oStart, oEnd);
ok('#5 onWOStatusChange persists via setWOStatus (WS-1 single write path)', /setWOStatus\(wo, status\)/.test(oFn));
ok('#5 only saves for an existing (saved) WO',       /if \(!id\) return;/.test(oFn));
ok('#5 skips a no-op (same status)',                 /status === wo\.status\) return;/.test(oFn));
ok('#5 never saves on a locked/closed WO',           /_isWOLocked.*\) return;/.test(oFn));
ok('#5 defense-in-depth: reverts a status the user may not set',
   /_statusesSettableByUser\(\)\.map/.test(oFn) && /settable\.indexOf\(status\) < 0/.test(oFn));
ok('#5 does NOT blanket-clear _woDirty (would drop other field edits)', !/_woDirty\s*=\s*false/.test(oFn));

console.log((fail===0?'✅':'❌')+' wo status-save + chips: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
