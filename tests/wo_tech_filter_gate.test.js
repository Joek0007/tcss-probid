// #4 (Dawn) — on a TECH login the Work Orders quick-filter chips (and the status dropdown) must NOT
// offer office-only statuses (Open -- Ready For Review/Office-Review, Ready For Pricing, Invoice Sent,
// Void, …). They're gated by the status `mobile` flag via _woStatusHiddenFromFieldFilter, which both the
// chip builder and the dropdown share. Loads the REAL functions from source.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');
function fn(name){ var s=src.indexOf('function '+name+'('); if(s<0){console.log('MISSING '+name);process.exit(1);} var e=src.indexOf('\nfunction ', s+10); return src.slice(s, e<0?undefined:e); }

// Minimal globals the two predicates touch.
global._currentUser = null;
global.hasPermission = function(){ return false; };
eval(fn('_woUserIsFieldScoped'));
eval(fn('_woStatusHiddenFromFieldFilter'));

// Representative statuses (ids + mobile flags straight from WO_STATUSES).
var OFFICE_ONLY = [
  {id:'Open -- Ready For Review', mobile:false, techDone:true},  // "Office-Review"
  {id:'Open -- Ready For Pricing', mobile:false},
  {id:'Invoice Sent (By E-MAIL)', mobile:false},
  {id:'Void', mobile:false},
  {id:'BILLED', mobile:false}
];
var FIELD_OK = [
  {id:'NEW', mobile:true},
  {id:'Open- "In Progress"', mobile:true},
  {id:'Scheduled', mobile:true},
  {id:'On Hold', mobile:true}
];

let pass=0, fail=0;
function ok(n,g,w){ if(g===w){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// ---- TECH (helper_tech): office-only hidden, field statuses shown ----
global._currentUser = { role:'helper_tech', full_name:'Dawn' };
OFFICE_ONLY.forEach(function(s){ ok('tech: HIDES office-only "'+s.id+'"', _woStatusHiddenFromFieldFilter(s), true); });
FIELD_OK.forEach(function(s){ ok('tech: SHOWS field "'+s.id+'"', _woStatusHiddenFromFieldFilter(s), false); });

// ---- LEAD TECH: same treatment (the bug the old helper_tech-only dropdown gate missed) ----
global._currentUser = { role:'lead_tech', full_name:'Lead' };
ok('lead tech: HIDES Void', _woStatusHiddenFromFieldFilter({id:'Void',mobile:false}), true);
ok('lead tech: SHOWS In Progress', _woStatusHiddenFromFieldFilter({id:'Open- "In Progress"',mobile:true}), false);

// ---- ASSIGNED-ONLY non-owner (e.g. subcontractor with wo.view_assigned_only) ----
global._currentUser = { role:'subcontractor', full_name:'Sub' };
global.hasPermission = function(p){ return p==='wo.view_assigned_only'; };
ok('assigned-only: HIDES Ready For Pricing', _woStatusHiddenFromFieldFilter({id:'Open -- Ready For Pricing',mobile:false}), true);
global.hasPermission = function(){ return false; };

// ---- OWNER: sees EVERYTHING (never gated) ----
global._currentUser = { role:'owner', full_name:'Joe' };
OFFICE_ONLY.concat(FIELD_OK).forEach(function(s){ ok('owner: shows "'+s.id+'"', _woStatusHiddenFromFieldFilter(s), false); });

// ---- teeth: the gate actually changes the outcome between tech and owner for an office status ----
var _void = {id:'Void',mobile:false};
global._currentUser = {role:'helper_tech'}; var techHides = _woStatusHiddenFromFieldFilter(_void);
global._currentUser = {role:'owner'};        var ownerHides = _woStatusHiddenFromFieldFilter(_void);
ok('teeth: tech hides Void but owner does not', techHides===true && ownerHides===false, true);

// both filter builders use the shared helper (no drift)
ok('chip builder uses the shared gate', /_getWOStatuses\(\)\.forEach[\s\S]{0,160}_woStatusHiddenFromFieldFilter\(s\)/.test(src), true);
ok('status dropdown uses the shared gate', /statusList = statusList\.filter[\s\S]{0,120}_woStatusHiddenFromFieldFilter\(s\)/.test(src), true);

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
