// WS-2 (r74) — environment storage isolation. Loads the REAL _probidEnvKeySuffix + _envKey from
// core.js and proves prod keeps the bare key ('tcssv8') while staging gets its own ('tcssv8_staging'),
// across all three env signals (URL ?env, sticky localStorage flag, host/path), with explicit ?env=prod
// always winning. This is what stops staging/test data from living in — and pushing from — prod's store.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
function fn(name){
  var s = src.indexOf('function '+name+'(');
  if (s<0){ console.log('✗ missing '+name); process.exit(1); }
  var e = src.indexOf('\nfunction ', s+10);
  return src.slice(s, e<0?undefined:e);
}

// ---- stubbable browser globals ----
var _ls = {};
global.localStorage = {
  getItem:function(k){ return (k in _ls)?_ls[k]:null; },
  setItem:function(k,v){ _ls[k]=String(v); },
  removeItem:function(k){ delete _ls[k]; }
};
global.location = { search:'', hostname:'joek0007.github.io', pathname:'/tcss-probid/' };
global.URLSearchParams = URLSearchParams;

eval(fn('_probidEnvKeySuffix'));
eval(fn('_envKey'));

function reset(){ _ls={}; location.search=''; location.hostname='joek0007.github.io'; location.pathname='/tcss-probid/'; }

let pass=0, fail=0;
function ok(n,g,w){ if(g===w){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

console.log('\nprod keeps the bare key (no live user disturbed):');
reset();                                   ok('no signal → prod key', _envKey('tcssv8'), 'tcssv8');
reset(); _ls['probid_env']='prod';         ok('stored prod → prod key', _envKey('tcssv8'), 'tcssv8');

console.log('\nstaging gets its own store:');
reset(); _ls['probid_env']='staging';      ok('stored staging → staging key', _envKey('tcssv8'), 'tcssv8_staging');
reset(); location.search='?env=staging';   ok('URL ?env=staging → staging key', _envKey('tcssv8'), 'tcssv8_staging');
reset(); location.hostname='tcss-probid-staging.example.com'; ok('host contains staging → staging key', _envKey('tcssv8'), 'tcssv8_staging');

console.log('\nexplicit prod always wins; isolation holds across keys:');
reset(); _ls['probid_env']='staging'; location.search='?env=prod'; ok('?env=prod overrides sticky staging', _envKey('tcssv8'), 'tcssv8');
reset(); _ls['probid_env']='staging';      ok('offline queue isolated too', _envKey('wt_offline_queue'), 'wt_offline_queue_staging');
reset();                                   ok('offline queue bare on prod', _envKey('wt_offline_queue'), 'wt_offline_queue');
reset(); _ls['probid_env']='staging';      ok('pendingPush isolated', _envKey('probid_pendingPush'), 'probid_pendingPush_staging');

console.log('\nsuffix helper direct:');
reset(); _ls['probid_env']='staging';      ok('suffix = _staging', _probidEnvKeySuffix(), '_staging');
reset();                                   ok('suffix = "" on prod', _probidEnvKeySuffix(), '');

console.log('\n'+(fail===0?('ALL '+pass+' PASSED'):(fail+' FAILED, '+pass+' passed')));
process.exit(fail===0?0:1);
