// r36 VERSION-GATE CHOKEPOINT: the gate is enforced on the Supabase CLIENT itself, so EVERY write
// across the whole app (not just the 13 hand-guarded push functions) is suppressed on a stale build,
// while reads always pass through. This loads the REAL _writesBlocked / _WRITE_RPCS /
// _makeBlockedBuilder / _installWriteGate from auth.js and runs them against a fake client that
// records which calls actually reached "the network".
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _writesBlocked(');
const end   = src.indexOf('async function _pushCustomerToCloud');
if (start < 0 || end < 0) { console.log('✗ could not locate version-gate chokepoint in auth.js'); process.exit(1); }
global.window = {};
eval(src.slice(start, end));   // defines _writesBlocked, _WRITE_RPCS, _makeBlockedBuilder, _installWriteGate

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }

// --- a fake Supabase client that logs every real call that reaches it ---
function makeFakeClient(log){
  function qb(table){
    var b = {};
    ['select','insert','update','upsert','delete','eq','in','is','order','limit','range','single','maybeSingle','match'].forEach(function(m){
      b[m] = function(){ log.push('from:'+table+'.'+m); return b; };
    });
    b.then = function(onF){ return Promise.resolve({data:[{id:'real'}], error:null}).then(onF); };
    return b;
  }
  return {
    from: function(table){ return qb(table); },
    rpc: function(fn){ log.push('rpc:'+fn); return Promise.resolve({data:'real', error:null}); }
  };
}

(async function(){
  // ============ 1) NORMAL OPERATION (not blocked): everything passes through untouched ============
  (function(){
    var log=[]; var sb=_installWriteGate(makeFakeClient(log));
    window._appWritesBlocked = false;
    sb.from('quotes').insert({x:1});
    sb.from('quotes').update({x:1});
    sb.from('quotes').upsert({x:1});
    sb.from('quotes').delete();
    sb.from('quotes').select('*');
    sb.rpc('soft_delete_quote', {id:1});   // write rpc, but not blocked → passes
    sb.rpc('customer_wo_rollup', {id:1});   // read rpc
    ok('NORMAL: insert reaches client', log.indexOf('from:quotes.insert')>=0, true);
    ok('NORMAL: update reaches client', log.indexOf('from:quotes.update')>=0, true);
    ok('NORMAL: upsert reaches client', log.indexOf('from:quotes.upsert')>=0, true);
    ok('NORMAL: delete reaches client', log.indexOf('from:quotes.delete')>=0, true);
    ok('NORMAL: select reaches client', log.indexOf('from:quotes.select')>=0, true);
    ok('NORMAL: write rpc reaches client', log.indexOf('rpc:soft_delete_quote')>=0, true);
    ok('NORMAL: read rpc reaches client', log.indexOf('rpc:customer_wo_rollup')>=0, true);
  })();

  // ============ 2) STALE BUILD (blocked): writes suppressed, reads still pass ============
  (function(){
    var log=[]; var sb=_installWriteGate(makeFakeClient(log));
    window._appWritesBlocked = true;
    sb.from('quotes').insert({x:1});
    sb.from('work_orders').update({x:1});
    sb.from('customers').upsert({x:1});
    sb.from('contacts').delete();
    sb.from('quotes').select('*');          // READ must still go through
    sb.rpc('soft_delete_quote', {id:1});    // write rpc suppressed
    sb.rpc('replace_quote_line_items', {}); // write rpc suppressed
    sb.rpc('next_number', {});              // write rpc suppressed (allocates/writes a counter)
    sb.rpc('customer_wo_rollup', {id:1});   // read rpc still passes
    sb.rpc('list_user_profiles', {});       // read rpc still passes
    ok('BLOCKED: insert suppressed',  log.indexOf('from:quotes.insert'),  -1);
    ok('BLOCKED: update suppressed',  log.indexOf('from:work_orders.update'), -1);
    ok('BLOCKED: upsert suppressed',  log.indexOf('from:customers.upsert'), -1);
    ok('BLOCKED: delete suppressed',  log.indexOf('from:contacts.delete'), -1);
    ok('BLOCKED: SELECT still passes', log.indexOf('from:quotes.select')>=0, true);
    ok('BLOCKED: write rpc suppressed', log.indexOf('rpc:soft_delete_quote'), -1);
    ok('BLOCKED: line-items rpc suppressed', log.indexOf('rpc:replace_quote_line_items'), -1);
    ok('BLOCKED: next_number rpc suppressed', log.indexOf('rpc:next_number'), -1);
    ok('BLOCKED: read rpc still passes', log.indexOf('rpc:customer_wo_rollup')>=0, true);
    ok('BLOCKED: read rpc (profiles) still passes', log.indexOf('rpc:list_user_profiles')>=0, true);
  })();

  // ============ 3) a suppressed write is safely chainable AND awaitable (never throws) ============
  (function(){ return; })();
  var log3=[]; var sb3=_installWriteGate(makeFakeClient(log3));
  window._appWritesBlocked = true;
  let threw=false, result=null;
  try {
    // the exact shape real code uses: update(...).eq(...).select().single(), then await
    result = await sb3.from('quotes').update({jn:'x'}).eq('id','q1').select().single();
  } catch(e){ threw = true; }
  ok('CHAIN: update().eq().select().single() does not throw', threw, false);
  ok('CHAIN: awaited result is benign (no error)', result && result.error, null);
  ok('CHAIN: awaited result has null data', result && result.data, null);
  ok('CHAIN: nothing reached the client', log3.length, 0);

  // ============ 4) idempotent install (wrapping twice doesn't double-gate) ============
  (function(){
    var log=[]; var sb=makeFakeClient(log);
    _installWriteGate(sb); _installWriteGate(sb);
    window._appWritesBlocked = false;
    sb.from('quotes').insert({x:1});
    ok('IDEMPOTENT: single passthrough after double install', log.filter(function(x){return x==='from:quotes.insert';}).length, 1);
    ok('IDEMPOTENT: marked gated', sb.__writeGated, true);
  })();

  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
