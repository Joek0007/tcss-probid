// r91 NEEDS ACTION queue (Build 2) — the detection that drives the office dashboard card. A signed
// quote with NO work order = "awaiting a work order"; a changes-requested quote = "needs a response";
// once a WO references the quote, it drops off. Slices the REAL _woExistsForQuote/_needsActionItems
// out of js/reports.js (pure functions, no DOM) and runs them.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const start = src.indexOf('function _woExistsForQuote(');
const end   = src.indexOf('function _naMoney(');
if (start < 0 || end < 0) { console.log('✗ could not slice needs-action logic'); process.exit(1); }
eval(src.slice(start, end));   // defines _woExistsForQuote, _needsActionItems

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r91 Needs Action queue detection ──');

var quotes = [
  { id:'q1', num:'Q-2058', cn:'South Pointe', approval:{status:'approved'} },        // signed, no WO → queue
  { id:'q2', num:'Q-2041', cn:'Pinehurst',    approval:{status:'approved'} },        // signed, HAS WO → drop
  { id:'q3', num:'Q-2066', cn:'Westgate',      approval:{status:'changes_requested'} }, // changes → needs response
  { id:'q4', num:'Q-2030', cn:'Draftville',    approval:null },                        // not signed → ignore
  { id:'q5', num:'Q-2039', cn:'Oakmont',       approval:{status:'approved'} },        // signed, WO by number → drop
];
var workOrders = [
  { id:'wo1', quoteId:'q2' },                 // links q2 by id
  { id:'wo2', quoteNumber:'Q-2039' },         // links q5 by number
];

var items = _needsActionItems(quotes, workOrders);
var signedNums = items.signed.map(function(q){return q.num;}).sort();
var changeNums = items.changes.map(function(q){return q.num;}).sort();

ok('signed-and-unconverted only = Q-2058', JSON.stringify(signedNums)===JSON.stringify(['Q-2058']));
ok('a quote with a WO (by id) drops off', signedNums.indexOf('Q-2041')<0);
ok('a quote with a WO (by number) drops off', signedNums.indexOf('Q-2039')<0);
ok('changes-requested surfaces separately = Q-2066', JSON.stringify(changeNums)===JSON.stringify(['Q-2066']));
ok('un-signed (draft) quote is ignored', signedNums.indexOf('Q-2030')<0 && changeNums.indexOf('Q-2030')<0);
ok('_woExistsForQuote matches by id', _woExistsForQuote('q2','Q-2041',workOrders)===true);
ok('_woExistsForQuote matches by number', _woExistsForQuote('q5','Q-2039',workOrders)===true);
ok('_woExistsForQuote false when no WO', _woExistsForQuote('q1','Q-2058',workOrders)===false);

// Empty / safety
var empty = _needsActionItems([], []);
ok('empty inputs → empty queue', empty.signed.length===0 && empty.changes.length===0);
ok('null-safe', (function(){ try { _needsActionItems(null, null); return true; } catch(e){ return false; } })());

console.log((fail===0?'✅':'❌')+' Needs Action queue: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
