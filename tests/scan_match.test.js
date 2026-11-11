// Test: tolerant barcode→record matching (fix hg, 2026-11-11)
// Mirrors the exact match predicates added to lookupBarcode (tools.js) and onScanInput
// (inventory.js). A scanned Code128 tag off Joe's real stickers ("TCSS -011") must find the
// record whose stored tag is "TCSS -011" even when spacing / case / dashes drift, while NOT
// matching a different tag and NOT breaking exact numeric (UPC) matches.

var pass = 0, fail = 0;
function ok(name, cond){ if (cond){ pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name); } }

// ---- the exact normalizer used in both modules ----
var _norm = function(s){ return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''); };

// ---- TOOLS: lookupBarcode predicate ----
function toolMatch(tools, scanned){
  var tag=(scanned||'').trim();
  var want=_norm(tag);
  return tools.find(function(t){
    return (t.tag||'').toLowerCase()===tag.toLowerCase()||
           t.id===tag||
           (want && _norm(t.tag)===want)||
           (want && _norm(t.id)===want);
  }) || null;
}

// ---- INVENTORY: onScanInput predicate ----
function invMatch(items, scanned){
  var val=(scanned||'').trim();
  var w=_norm(val);
  return items.find(function(i){
    return (i.barcode&&i.barcode===val) || (i.tag&&i.tag===val) || (i.name||'').toLowerCase()===val.toLowerCase()
        || (w && i.barcode && _norm(i.barcode)===w) || (w && i.tag && _norm(i.tag)===w);
  }) || null;
}

// Tools fixture mirrors the live data (tag has a space: "TCSS -011").
var TOOLS = [
  { id:'uuid-a', tag:'TCSS -001', name:'Fluke Network Tester' },
  { id:'uuid-b', tag:'TCSS -011', name:'Impact Drill' },
  { id:'uuid-c', tag:'TCSS -014', name:'Ladder' }
];

// A scan of the real "TCSS -011" sticker, plus plausible format drifts — all must hit TCSS -011.
ok('exact "TCSS -011" → drill',            toolMatch(TOOLS,'TCSS -011')   && toolMatch(TOOLS,'TCSS -011').id==='uuid-b');
ok('no-space "TCSS-011" → drill',          toolMatch(TOOLS,'TCSS-011')    && toolMatch(TOOLS,'TCSS-011').id==='uuid-b');
ok('lowercase "tcss -011" → drill',        toolMatch(TOOLS,'tcss -011')   && toolMatch(TOOLS,'tcss -011').id==='uuid-b');
ok('no-dash "TCSS 011" → drill',           toolMatch(TOOLS,'TCSS 011')    && toolMatch(TOOLS,'TCSS 011').id==='uuid-b');
ok('trailing space "TCSS -011 " → drill',  toolMatch(TOOLS,'TCSS -011 ')  && toolMatch(TOOLS,'TCSS -011 ').id==='uuid-b');
ok('smushed "TCSS011" → drill',            toolMatch(TOOLS,'TCSS011')     && toolMatch(TOOLS,'TCSS011').id==='uuid-b');
ok('different tag "TCSS -014" → ladder (not drill)', toolMatch(TOOLS,'TCSS -014') && toolMatch(TOOLS,'TCSS -014').id==='uuid-c');
ok('unknown "TCSS -099" → no match',       toolMatch(TOOLS,'TCSS -099')===null);

// Inventory fixture: one TCSS-tagged item, one real UPC barcode.
var INV = [
  { id:'inv-1', tag:'TCSS -050', barcode:'', name:'Cat6 Spool' },
  { id:'inv-2', tag:'', barcode:'0048812011234', name:'Connector Box' }
];
ok('inv tag drift "tcss050" → Cat6 spool',   invMatch(INV,'tcss050')         && invMatch(INV,'tcss050').id==='inv-1');
ok('inv exact UPC → connector box',          invMatch(INV,'0048812011234')   && invMatch(INV,'0048812011234').id==='inv-2');
ok('inv unknown UPC → no match (triggers link flow)', invMatch(INV,'9999999999999')===null);

console.log('\n'+(fail===0 ? 'ALL PASS' : fail+' FAILED')+' ('+pass+' passed)');
process.exit(fail===0 ? 0 : 1);
