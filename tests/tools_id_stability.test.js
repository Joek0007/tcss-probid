// Test: tools_db.js id-stability fix (hf, 2026-11-11)
// Runs the REAL ToolsDB.saveTool / _toolFromRow against a mock _sb.
// Asserts:
//   A) a brand-new tool (_new:true) is inserted with legacy_id = null, so on reload its
//      app-id == its uuid (stable — no churn that orphans a just-created checkout).
//   B) a blob-migration tool (no _new) KEEPS its legacy_id (existing custody still links).
//   C) _toolFromRow returns id == uuid when legacy_id is null.
const fs = require('fs');
const path = require('path');

// ---- minimal browser-ish globals the IIFE touches ----
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null };
globalThis.crypto = { randomUUID: () => '11111111-2222-4333-8444-555555555555' };
globalThis._currentUser = { id: 'user-uuid-1' };
globalThis.DB = { tools: [] };

// Records every insert so we can inspect the row actually sent to the DB.
const inserts = [];
function queryBuilder(table){
  // Fully chainable + thenable mock. Any chain `.insert/.update/.select/.eq/.in/.maybeSingle`
  // returns the same builder; awaiting it resolves to {data,error} based on what was done.
  const b = {
    _table: table, _insed: null, _single: false,
    insert(obj){ if (table==='tools') inserts.push(obj); b._insed = obj; return b; },
    update(){ return b; },
    select(){ return b; },
    eq(){ return b; },
    in(){ return b; },
    maybeSingle(){ b._single = true; return b; },
    then(resolve, reject){
      let data;
      if (b._insed) data = [{ id: b._insed.id, updated_at: '2026-11-11T00:00:00Z' }];
      else if (b._single) data = null;
      else data = [];
      return Promise.resolve({ data: data, error: null }).then(resolve, reject);
    }
  };
  return b;
}
globalThis._sb = { from: (t) => queryBuilder(t) };

// ---- load the real module ----
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'tools_db.js'), 'utf8'));
const ToolsDB = globalThis.ToolsDB;

let pass = 0, fail = 0;
function ok(name, cond){ if (cond){ pass++; console.log('  ✓ '+name); } else { fail++; console.log('  ✗ '+name); } }

(async function(){
  // ---- A) brand-new tool ----
  inserts.length = 0;
  const fresh = { id: '1794366449033', _new: true, name: 'New Drill', tag: 'TCSS -009', cat: 'Power Tools' };
  const resA = await ToolsDB.saveTool(fresh);
  const rowA = inserts[0];                 // the full insert obj: {id:<uuid>, ...row}
  const isUuid = (v)=> typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  ok('A1 new tool insert captured', !!rowA);
  ok('A2 legacy_id is NULL for a new tool', rowA && rowA.legacy_id === null);
  ok('A3 saveTool returns ok with a uuid id', resA && resA.ok && isUuid(resA.id) && resA.id === rowA.id);
  ok('A4 tool.id adopted the uuid (not the temp Date.now id)', fresh.id === resA.id && fresh.id !== '1794366449033');
  // what reload would produce (_toolFromRow: id = legacy_id || row.id):
  const reloadedA = ToolsDB._toolFromRow(Object.assign({ updated_at: 'x' }, rowA), []);
  ok('A5 reloaded id == uuid (no churn off the uuid)', reloadedA.id === resA.id);

  // ---- B) blob-migration tool (no _new) keeps legacy_id ----
  inserts.length = 0;
  const legacy = { id: '1791232931584', name: 'Old Fluke', tag: 'TCSS -001', cat: 'Test Equipment' };
  await ToolsDB.saveTool(legacy);
  const rowB = inserts[0];
  ok('B1 migration insert captured', !!rowB);
  ok('B2 legacy_id PRESERVED for a migrated tool', rowB && rowB.legacy_id === '1791232931584');
  const reloadedB = ToolsDB._toolFromRow(Object.assign({ id: 'uuid-b', updated_at: 'x' }, rowB), []);
  ok('B3 reloaded migrated id == legacy (custody still links)', reloadedB.id === '1791232931584');

  // ---- C) _toolFromRow stability with null legacy_id ----
  const rowC = { id: 'abc-uuid', legacy_id: null, name: 'X', asset_tag: 'T', category: 'Other', updated_at: 'x' };
  const tC = ToolsDB._toolFromRow(rowC, []);
  ok('C1 null legacy_id → id == uuid', tC.id === 'abc-uuid' && tC._uuid === 'abc-uuid');

  console.log('\n'+(fail===0 ? 'ALL PASS' : fail+' FAILED')+' ('+pass+' passed)');
  process.exit(fail===0 ? 0 : 1);
})();
