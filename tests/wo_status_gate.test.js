// WS-1 (r73) — the setWOStatus() chokepoint. Loads the REAL alias map + normalizer + gate from
// workorders.js and proves every legacy "ghost" literal maps to a configured status id, configured
// ids pass through unchanged, Scheduled/On Hold resolve to themselves, unknowns are left untouched,
// and setWOStatus assigns + audits + pushes.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');
function fn(name){
  var s = src.indexOf('\nfunction '+name+'('); if (s<0) s = src.indexOf('function '+name+'(');
  if (s<0){ console.log('✗ missing '+name); process.exit(1); }
  var e = src.indexOf('\nfunction ', s+10);
  return src.slice(s, e<0?undefined:e);
}
function varBlock(name){
  var s = src.indexOf('var '+name+' =');
  if (s<0){ console.log('✗ missing var '+name); process.exit(1); }
  var e = src.indexOf('\n};', s); // object literal end
  return src.slice(s, e+3);
}

// ---- stubs: Joe's REAL configured list (post-r73, incl. Scheduled + On Hold) ----
global.DB = { woSettings:{ statuses:[
  {id:'NEW',open:true,mobile:true},
  {id:'Scheduled',open:true,mobile:true},
  {id:'Open- "In Progress"',open:true,mobile:true},
  {id:'Open -- Waiting on Customer',open:true,mobile:true},
  {id:'Open -- Action Needed',open:true,mobile:true},
  {id:'On Hold',open:true,mobile:true},
  {id:'Open -- Part(s) Needed',open:true,mobile:true},
  {id:'Open -- Ready For Office-Review',open:true,mobile:true,techDone:true},
  {id:'Invoice Sent (By E-MAIL)',open:false,mobile:false},
  {id:'BILLED',open:false,mobile:false},
  {id:'Void',open:false,mobile:false}
]}};
global._getWOStatuses = function(){ return DB.woSettings.statuses; };
var _audits = [];
global.auditWOStatus = function(id,num,o,n){ _audits.push([o,n]); };
var _saves = 0, _pushes = [];
global.saveDB = function(){ _saves++; };
global._pushWOToCloud = function(wo){ _pushes.push(wo.status); };

eval(varBlock('_WO_STATUS_ALIASES'));
eval(fn('_normalizeWOStatusId'));
eval(fn('setWOStatus'));

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

console.log('\n_normalizeWOStatusId — ghost → configured:');
ok("'New' → NEW",                 _normalizeWOStatusId('New'),          'NEW');
ok("'new' → NEW",                 _normalizeWOStatusId('new'),          'NEW');
ok("'Open' → In Progress",        _normalizeWOStatusId('Open'),         'Open- "In Progress"');
ok("'In Progress' → configured",  _normalizeWOStatusId('In Progress'),  'Open- "In Progress"');
ok("'Scheduled' → itself",        _normalizeWOStatusId('Scheduled'),    'Scheduled');
ok("'Paused' → On Hold",          _normalizeWOStatusId('Paused'),       'On Hold');
ok("'On Hold' → itself",          _normalizeWOStatusId('On Hold'),      'On Hold');
ok("'Parts Needed' → Part(s)",    _normalizeWOStatusId('Parts Needed'), 'Open -- Part(s) Needed');
ok("'Complete' → Office-Review",  _normalizeWOStatusId('Complete'),     'Open -- Ready For Office-Review');
ok("'Completed' → Office-Review", _normalizeWOStatusId('Completed'),    'Open -- Ready For Office-Review');
ok("'Invoiced' → Invoice Sent",   _normalizeWOStatusId('Invoiced'),     'Invoice Sent (By E-MAIL)');
ok("'Closed' → BILLED",           _normalizeWOStatusId('Closed'),       'BILLED');

console.log('\n_normalizeWOStatusId — configured ids pass through + canonical casing:');
ok('exact configured id passes', _normalizeWOStatusId('Open -- Ready For Office-Review'), 'Open -- Ready For Office-Review');
ok("case-variant 'void' → 'Void'", _normalizeWOStatusId('void'), 'Void');
ok('unknown value left untouched', _normalizeWOStatusId('Closed -- Legacy Import'), 'Closed -- Legacy Import');
ok('empty stays empty', _normalizeWOStatusId(''), '');

console.log('\nsetWOStatus — assign + audit + push:');
var wo = {id:'wo-1', woNumber:'WO-100', status:'NEW'};
var ret = setWOStatus(wo, 'In Progress');
ok('returns normalized id', ret, 'Open- "In Progress"');
ok('writes normalized id to wo.status', wo.status, 'Open- "In Progress"');
ok('audited old→new', _audits[_audits.length-1], ['NEW','Open- "In Progress"']);
ok('pushed normalized id', _pushes[_pushes.length-1], 'Open- "In Progress"');

var wo2 = {id:'wo-2', status:'NEW'};
var p0 = _pushes.length;
setWOStatus(wo2, 'Scheduled', {noPush:true, noSave:true});
ok('noPush suppresses cloud push', _pushes.length, p0);
ok('still assigns under noPush', wo2.status, 'Scheduled');

var wo3 = {id:'wo-3', status:'Open- "In Progress"'};
var a0 = _audits.length;
setWOStatus(wo3, 'Open- "In Progress"');   // same value
ok('no audit when status unchanged', _audits.length, a0);

console.log('\n'+(fail===0?('ALL '+pass+' PASSED'):(fail+' FAILED, '+pass+' passed')));
process.exit(fail===0?0:1);
