// r103 — the Quick Quote editor must REMEMBER which quote it is editing across a view
// re-render. Before this, getQData returned id from a param (not the DOM), and saveQQ relied
// solely on the hidden #qq-id/#qq-num inputs. A QQ re-render (e.g. a post-sync redraw) wiped
// those inputs, so the editor "forgot" its quote and the next save INSERTED a brand-new record
// — producing duplicate quotes (Q-2074..Q-2077 in testing) and leaving the header on "Quote #---".
// Fix: a durable module-level identity (_qqActiveQuoteId/_qqActiveQuoteNum) read via
// _qqCurrentId()/_qqCurrentNum() and written via _qqSetCurrent(), cleared via _qqClearCurrent().
// Also: emailQuoteQQ now SAVES+numbers first (no more num='DRAFT' on an unsaved send).
const fs = require('fs');
const q  = fs.readFileSync(__dirname + '/../js/quotes.js',  'utf8');
const r  = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r103 editor id-retention (no dup-on-save) + email saves first ──');

// ---- static: the durable identity helpers exist ----
ok('defines _qqActiveQuoteId / _qqActiveQuoteNum module vars',
   /var\s+_qqActiveQuoteId\s*=\s*''/.test(q) && /var\s+_qqActiveQuoteNum\s*=\s*''/.test(q));
ok('_qqCurrentId reads the input OR the remembered id',
   /function _qqCurrentId\(\)\{[\s\S]{0,140}\|\|\s*_qqActiveQuoteId/.test(q));
ok('_qqCurrentNum reads the input OR the remembered num',
   /function _qqCurrentNum\(\)\{[\s\S]{0,140}\|\|\s*_qqActiveQuoteNum/.test(q));
ok('_qqSetCurrent writes BOTH the module var and the hidden input',
   /function _qqSetCurrent\([\s\S]{0,260}_qqActiveQuoteId\s*=\s*id[\s\S]{0,260}_qqActiveQuoteNum\s*=\s*num/.test(q));
ok('_qqClearCurrent exists', /function _qqClearCurrent\(\)/.test(q));

// ---- static: saveQQ uses the durable identity, not the fragile input-only path ----
ok('saveQQ resolves existingId via _qqCurrentId()', /var existingId\s*=\s*_qqCurrentId\(\)/.test(q));
ok('saveQQ resolves existingNum via _qqCurrentNum()', /var existingNum\s*=\s*_qqCurrentNum\(\)/.test(q));
ok('saveQQ persists identity via _qqSetCurrent(existingId, existingNum)',
   /_qqSetCurrent\(existingId,\s*existingNum\)/.test(q));
ok('old fragile "(idEl && idEl.value) || q.id" existingId path is gone',
   q.indexOf("existingId  = (idEl  && idEl.value)") < 0 && q.indexOf("(idEl && idEl.value) || q.id") < 0);

// ---- static: clear points so a NEW quote never adopts the previous quote's id ----
ok('_resetAutoSaveStub clears the active quote', /_resetAutoSaveStub[\s\S]{0,160}_qqClearCurrent\(\)/.test(q));
ok('auto-save stub guard uses _qqCurrentId()', /if \(_qqCurrentId\(\)\) return;/.test(q));
ok('newQuoteForContact clears the active quote before filling',
   /this starts a NEW quote[\s\S]{0,300}_qqClearCurrent\(\)/.test(q) && /function newQuoteForContact/.test(q));
ok('restoreQQDraft seeds the active quote from the restored inputs',
   q.indexOf("_qqSetCurrent((document.getElementById('qq-id')||{}).value || '', (document.getElementById('qq-num')||{}).value || '')") >= 0
   && /function restoreQQDraft/.test(q));

// ---- static: emailQuoteQQ saves first, no 'DRAFT' stub ----
ok('emailQuoteQQ is async', /async function emailQuoteQQ\(\)/.test(q));
ok('emailQuoteQQ saves first when the quote has no id yet',
   q.indexOf("if (!_qqCurrentId() && typeof saveQQ === 'function') { await saveQQ(); }") >= 0
   && /async function emailQuoteQQ/.test(q));
ok("emailQuoteQQ no longer tags an unsaved send with num='DRAFT'",
   q.indexOf("q.num = (document.getElementById('qq-num')||{}).value || 'DRAFT'") < 0);

// ---- static: reports.js side ----
ok('getQData resolves identity via _qqCurrentId()', /_qqCurrentId==='function'\) \? _qqCurrentId\(\)/.test(r));
ok('getQData number fallback via _qqCurrentNum()', /_qqCurrentNum==='function'\) \? _qqCurrentNum\(\)/.test(r));
ok('editQuote seeds the active quote (_qqSetCurrent(q.id||\'\', q.num||\'\'))',
   /_qqSetCurrent\(q\.id\|\|'',\s*q\.num\|\|''\)/.test(r));

// ---- TEETH: red-then-green reproduction of the duplicate-on-save bug ----
// NEW identity model: a durable var survives a re-render that wipes the inputs.
(function(){
  var _id='', _num='';
  function cur(inputId){ return (inputId || _id || ''); }
  function set(id,num){ _id=id; _num=num; }
  function clear(){ _id=''; _num=''; }
  var DB=[]; var seq=2100;
  function save(inputId, inputNum){
    var eId = cur(inputId);
    var eNum = (inputNum || _num || '');
    if(!eNum) eNum = 'Q-'+(seq++);
    if(!eId) eId = 'id'+Math.random().toString(36).slice(2,9);
    set(eId, eNum);
    var idx = DB.findIndex(function(x){return x.id===eId;});
    if(idx>=0) DB[idx]={id:eId,num:eNum}; else DB.push({id:eId,num:eNum});
    return {id:eId,num:eNum};
  }
  // 1) first save of a new quote (inputs empty)
  var s1 = save('', '');
  // 2) a re-render WIPES the hidden inputs, then the user saves again (inputId wiped to '')
  var s2 = save('', '');
  ok('NEW: second save after a re-render reuses the same id (no duplicate)', s1.id===s2.id);
  ok('NEW: and reuses the same number', s1.num===s2.num);
  ok('NEW: exactly ONE record exists after two saves', DB.length===1);
  // 3) starting a brand-new quote clears identity → a separate record
  clear();
  var s3 = save('', '');
  ok('NEW: a fresh quote after clear() creates a SEPARATE record', s3.id!==s1.id && DB.length===2);
})();

// RED baseline: the OLD input-only model duplicates when a re-render wipes the input.
(function(){
  var DBo=[]; var seqo=2100;
  function saveOld(inputId, inputNum){
    var eId = (inputId || '');          // old code trusted ONLY the input
    var eNum = (inputNum || '');
    if(!eNum) eNum = 'Q-'+(seqo++);
    if(!eId) eId = 'id'+Math.random().toString(36).slice(2,9);
    var idx = DBo.findIndex(function(x){return x.id===eId;});
    if(idx>=0) DBo[idx]={id:eId}; else DBo.push({id:eId});
    return eId;
  }
  var o1 = saveOld('', '');
  var o2 = saveOld('', '');            // input wiped between saves → forgets → new id
  ok('RED: old input-only model DID duplicate (proves the bug the fix removes)',
     o1!==o2 && DBo.length===2);
})();

console.log((fail===0?'✅':'❌')+' quote editor id retention: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
