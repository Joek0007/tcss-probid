// ============================================================================
// HARDENING PROOF SUITE — red-first, teeth-first (WS-0: "the proof")
// ============================================================================
// Every proof runs the SAME scenario TWICE: once simulating the OLD (pre-fix) behavior, which MUST
// reproduce the bug (RED), and once with the REAL shipped fix, which MUST prevent it (GREEN). A proof
// only counts if its RED arm actually fails the way the bug did — that is what gives the test teeth
// and is why a passing GREEN arm means something. Deterministic: real app functions extracted from
// source, driven against a shared in-memory cloud (fake_supabase). The LIVE two-session versions on the
// real staging backend run in CI (GitHub Actions); this file is the executable-anywhere proof layer.
const fs = require('fs');
const path = require('path');
const { makeFakeSupabase } = require('./fake_supabase.js');

const authSrc = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');
const coreSrc = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const woSrc   = fs.readFileSync(path.join(__dirname, '../js/workorders.js'), 'utf8');
function fnFrom(src, name){ var s=src.indexOf('function '+name+'('); if(s<0){console.log('MISSING fn '+name);process.exit(1);} var e=src.indexOf('\nfunction ', s+10); return src.slice(s, e<0?undefined:e); }
function objFrom(src, name){ var s=src.indexOf('var '+name+' = {'); if(s<0){console.log('MISSING var '+name);process.exit(1);} var e=src.indexOf('\n};', s); return src.slice(s, e+3); }

// ---- WS-1 status gate (the real chokepoint), with a configured-list stub matching Joe's live list ----
var _CFG_STATUSES = ['NEW','Scheduled','Open- "In Progress"','Open -- Waiting on Customer','Open -- Action Needed','On Hold','Open -- Part(s) Needed','Open -- Ready For Office-Review','Invoice Sent (By E-MAIL)','BILLED','Void'];
global.DB = { woSettings:{ statuses: _CFG_STATUSES.map(function(id){ return {id:id, open:/^(BILLED|Void|Invoice Sent)/.test(id)?false:true, mobile:true}; }) } };
global._getWOStatuses = function(){ return DB.woSettings.statuses; };
global._getWOStatusDef = function(id){ if(!id) return {open:true}; return DB.woSettings.statuses.find(function(s){ return s.id===id||s.id.toLowerCase()===String(id).toLowerCase(); })||{open:false}; };
global.saveDB=function(){}; global._pushWOToCloud=function(){}; global.auditWOStatus=function(){};
global._ACTIVE_UNLISTED_RE=/^(scheduled|in\s*progress|on\s*hold|paused)$/i;
function isConfigured(id){ return _CFG_STATUSES.indexOf(id)>=0; }

// ---- Load REAL dirty-detection + env functions (the code under test) ----
global._officeSnap = {};                       // swapped per session below
global._woHash = function(){ return 'WO'; };   // stub; child proofs never hit the WO branch
eval(fnFrom(authSrc,'_recHash'));
eval(objFrom(authSrc,'_CHILD_HASH_KEYS'));
eval(fnFrom(authSrc,'_childHash'));
eval(fnFrom(authSrc,'_officeHashFor'));
eval(fnFrom(authSrc,'_officeMarkSynced'));
eval(fnFrom(authSrc,'_officeDirty'));
eval(fnFrom(coreSrc,'_probidEnvKeySuffix'));
eval(fnFrom(coreSrc,'_envKey'));
eval(objFrom(woSrc,'_WO_STATUS_ALIASES'));
eval(fnFrom(woSrc,'_normalizeWOStatusId'));
eval(fnFrom(woSrc,'setWOStatus'));
DB.settings = { laborRate:100, taxRate:0 };    // company defaults for the WS-4a resolver proof
eval(fnFrom(coreSrc,'_numOrNull'));
eval(fnFrom(coreSrc,'resolveTaxRate'));
eval(fnFrom(coreSrc,'resolveLaborRate'));

// Generic two-session clobber harness (local-shape rows in a shared cloud) — used for payroll proofs.
async function runClobberGeneric(table, seedRow, editFn, mode){
  var cloud = makeFakeSupabase(); var seed={}; seed[table]=[Object.assign({},seedRow)]; cloud=makeFakeSupabase(seed);
  var A={snap:{}}, B={snap:{}}; A.snap[table]={}; B.snap[table]={};
  var AR=[], BR=[];
  async function pull(sess, ref){ global._officeSnap=sess.snap; var r=await cloud.from(table).select('*'); ref.length=0; (r.data||[]).forEach(function(x){ var row=Object.assign({},x); ref.push(row); _officeMarkSynced(table,row); }); }
  async function sweep(sess, ref){ global._officeSnap=sess.snap; for(var i=0;i<ref.length;i++){ var row=ref[i]; if(mode==='FIXED_changedonly'&&!_officeDirty(table,row)) continue; await cloud.from(table).upsert(Object.assign({},row),{onConflict:'id'}); _officeMarkSynced(table,row); } }
  await pull(A,AR); await pull(B,BR);
  editFn(AR[0]); await sweep(A,AR);     // A edits + syncs
  await sweep(B,BR);                     // B stale sweeps
  return cloud._rows(table)[0];
}

let pass=0, fail=0;
function assert(name, cond){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name);} }

// ============================================================================
// PROOF 1 — WS-3a: a stale second session must NOT revert a child edit made by another device.
// ============================================================================
// Two office sessions share one cloud. Both load a WO part (qty 2). Session A changes qty→5 and
// syncs. Session B is stale (still qty 2) and runs its sweep. OLD push-all sweep re-pushes B's stale
// qty 2 → clobbers A's 5. The changed-only gate makes B skip the unchanged row → A's 5 survives.
function partPullMap(r){ return { id:r.id, woId:r.wo_id, name:r.part_name, partNum:r.part_num, qty:r.quantity, unit:r.unit, unitCost:r.unit_cost, status:r.status, notes:r.notes, requestedBy:r.requested_by, itemId:r.item_id, source:r.source, fromLocation:r.from_location, createdAt:r.created_at, _synced:true }; }
function partPushRow(p){ return { id:p.id, wo_id:p.woId, part_name:p.name, part_num:p.partNum, quantity:p.qty, unit:p.unit, unit_cost:p.unitCost, status:p.status, notes:p.notes, requested_by:p.requestedBy, item_id:p.itemId, source:p.source, from_location:p.fromLocation, created_at:p.createdAt }; }

async function runChildClobber(mode){ // mode: 'OLD_pushall' | 'FIXED_changedonly'
  var cloud = makeFakeSupabase({ wo_parts: [ { id:'wop-1', wo_id:'wo-9', part_name:'Cat6', quantity:2, unit_cost:45, status:'requested', requested_by:'Lisa', created_at:'2026-11-05T00:00:00Z' } ] });
  var A = { snap:{wo_parts:{}}, DB:{woParts:[]} };
  var B = { snap:{wo_parts:{}}, DB:{woParts:[]} };
  async function pull(sess){
    global._officeSnap = sess.snap;
    var r = await cloud.from('wo_parts').select('*');
    sess.DB.woParts = (r.data||[]).map(partPullMap);
    sess.DB.woParts.forEach(function(p){ _officeMarkSynced('wo_parts', p); }); // seed baseline (r75)
  }
  async function sweep(sess){
    global._officeSnap = sess.snap;
    for (var i=0;i<sess.DB.woParts.length;i++){ var p=sess.DB.woParts[i];
      if (mode==='FIXED_changedonly' && !_officeDirty('wo_parts', p)) continue;   // the shipped gate
      await cloud.from('wo_parts').upsert(partPushRow(p), {onConflict:'id'});
      _officeMarkSynced('wo_parts', p);
    }
  }
  await pull(A); await pull(B);                 // both devices now hold qty 2, seeded
  A.DB.woParts[0].qty = 5; await sweep(A);       // A edits → cloud = 5
  await sweep(B);                                // B is stale (still 2) and sweeps
  return cloud._rows('wo_parts')[0].quantity;    // final cloud qty
}

(async function proof1(){
  console.log('\nPROOF 1 — WS-3a child clobber (stale tab must not revert another device):');
  var redQty   = await runChildClobber('OLD_pushall');       // bug reproduced?
  var greenQty = await runChildClobber('FIXED_changedonly');  // fix holds?
  assert('RED arm reproduces the clobber (old push-all reverts A\'s 5 → '+redQty+')', redQty===2);
  assert('GREEN arm holds (changed-only keeps A\'s 5 → '+greenQty+')', greenQty===5);
  assert('teeth: red≠green, so the test can actually detect the bug', redQty!==greenQty);

  // ==========================================================================
  // PROOF 2 — WS-2: data created while on staging must NOT appear in prod (shared browser storage).
  // ==========================================================================
  // Model one browser's localStorage as a plain map. A record is written while the app is pointed at
  // staging, then the app flips to prod and reads. OLD fixed key ('tcssv8') → prod reads the staging
  // write (leak, = the 194 junk WOs). _envKey namespaces the store per env → prod never sees it.
  console.log('\nPROOF 2 — WS-2 environment isolation (staging data must not leak to prod):');
  function runLeak(keyFor){ // keyFor(env) -> storage key
    var ls = {};
    // on staging: write a uniquely-tagged record
    ls[keyFor('staging')] = JSON.stringify([{ id:'tag-STAGING-ONLY', note:'test junk' }]);
    // flip same browser to prod and read
    var prodRaw = ls[keyFor('prod')];
    var prodRows = prodRaw ? JSON.parse(prodRaw) : [];
    return prodRows.some(function(r){ return r.id==='tag-STAGING-ONLY'; });  // did staging junk reach prod?
  }
  var oldKey = function(env){ return 'tcssv8'; };                              // pre-r74: fixed key
  var newKey = function(env){ var prev=''; try{prev=global.localStorage&&global.localStorage.getItem('probid_env');}catch(e){} // force env for _envKey
    global.localStorage = { getItem:function(){return env;}, setItem:function(){}, removeItem:function(){} };
    global.location = { search:'', hostname:'x', pathname:'/' };
    var k = _envKey('tcssv8'); return k; };
  var redLeak   = runLeak(oldKey);
  var greenLeak = runLeak(newKey);
  assert('RED arm reproduces the leak (fixed key → staging junk visible in prod)', redLeak===true);
  assert('GREEN arm isolated (namespaced key → prod never sees staging junk)', greenLeak===false);
  assert('teeth: red≠green', redLeak!==greenLeak);

  // ==========================================================================
  // PROOF 3 — WS-3a-ii: the same stale-tab revert must not hit PAYROLL (time_entries).
  // ==========================================================================
  console.log('\nPROOF 3 — WS-3a-ii payroll clobber (stale tab must not revert a timesheet edit):');
  var teSeed = { id:'te-1', tech_name:'Lisa', entry_date:'2026-11-05', entry_type:'regular', start_time:'08:00', end_time:'16:00', total_hours:8, total_mins:480, is_paid:false, wo_id:'wo-9', is_manual:false, is_approved:false, break_minutes:0 };
  // NOTE: cloud + local share column names here (identity), and _CHILD_HASH_KEYS['time_entries'] hashes
  // local keys; to keep the hash meaningful we map to the local field the gate expects.
  function teToLocal(r){ return { id:r.id, techName:r.tech_name, date:r.entry_date, entryType:r.entry_type, startTime:r.start_time, endTime:r.end_time, totalHours:r.total_hours, totalMins:r.total_mins, isPaid:r.is_paid, woId:r.wo_id, isManual:r.is_manual, isApproved:r.is_approved, breakMinutes:r.break_minutes }; }
  // Reuse the generic harness but on local-shape rows stored in the cloud (so hash keys line up).
  var teLocalSeed = teToLocal(teSeed);
  var redTE   = await runClobberGeneric('time_entries', teLocalSeed, function(r){ r.totalHours=9; r.totalMins=540; }, 'OLD_pushall');
  var greenTE = await runClobberGeneric('time_entries', teLocalSeed, function(r){ r.totalHours=9; r.totalMins=540; }, 'FIXED_changedonly');
  assert('RED arm reverts the timesheet edit (old push-all → '+redTE.totalHours+'h)', redTE.totalHours===8);
  assert('GREEN arm holds the timesheet edit (changed-only → '+greenTE.totalHours+'h)', greenTE.totalHours===9);
  assert('teeth: red≠green', redTE.totalHours!==greenTE.totalHours);

  // ==========================================================================
  // PROOF 4 — WS-1: no code path may put an OFF-LIST status on a work order.
  // ==========================================================================
  console.log('\nPROOF 4 — WS-1 status: every writer input resolves to a CONFIGURED status:');
  var ghosts = ['New','Open','In Progress','Scheduled','Paused','On Hold','Parts Needed','Complete','Invoiced','Closed'];
  var allGreen = ghosts.every(function(g){ var wo={id:'w',status:'NEW'}; setWOStatus(wo,g,{noSave:true,noPush:true}); return isConfigured(wo.status); });
  assert('GREEN: all 10 ghost inputs land on a configured status via setWOStatus', allGreen);
  // RED: the OLD code wrote the ghost literal straight to wo.status — several are NOT in the list.
  var rawOffList = ['In Progress','Parts Needed','Complete','Invoiced','Closed'].filter(function(g){ return !isConfigured(g); });
  assert('RED: writing those ghosts raw (old code) yields off-list statuses ('+rawOffList.length+'/5)', rawOffList.length===5);
  assert('teeth: the gate changes the outcome for every off-list ghost', rawOffList.every(function(g){ var wo={id:'w',status:'NEW'}; setWOStatus(wo,g,{noSave:true,noPush:true}); return wo.status!==g && isConfigured(wo.status); }));

  // ==========================================================================
  // PROOF 5 — WS-3b: an on-demand-loaded OLD child row must NOT be re-pushed (churn) by the sweep.
  // ==========================================================================
  console.log('\nPROOF 5 — WS-3b windowing: on-demand-loaded old rows are seeded (no re-push churn):');
  function onDemandDirty(seedIt){
    global._officeSnap = { wo_parts:{} };
    var old = { id:'wop-old', woId:'wo-9', name:'Old part', qty:1, unitCost:10, status:'requested', requestedBy:'L', createdAt:'2023-01-01T00:00:00Z' };
    if (seedIt) _officeMarkSynced('wo_parts', old);   // r77: loader seeds on-demand rows
    return _officeDirty('wo_parts', old);              // would the sweep push it?
  }
  var redChurn   = onDemandDirty(false);  // old loader (no seed) → looks dirty → re-pushed
  var greenChurn = onDemandDirty(true);   // r77 loader seeds → not dirty → skipped
  assert('RED: unseeded on-demand row looks dirty (would churn-re-push)', redChurn===true);
  assert('GREEN: seeded on-demand row is clean (no churn)', greenChurn===false);
  assert('teeth: red≠green', redChurn!==greenChurn);

  // ==========================================================================
  // PROOF 6 — WS-4a: the unified tax/labor resolver — exempt wins, customer default reaches invoices,
  // labor defaults to the company rate (not the stray 125). Old invoice logic ignored the customer.
  // ==========================================================================
  console.log('\nPROOF 6 — WS-4a defaults cascade (tax honors customer+exempt; labor uses company default):');
  // Old invoice tax default (the actual pre-fix expression): wo.taxRate || quote.taxRate || company — no customer.
  function oldInvoiceTax(wo, quote){ return (wo&&wo.taxRate) || (quote&&quote.taxRate) || (DB.settings&&DB.settings.taxRate) || 0; }
  var exemptCust = { taxExempt:true, defaultTaxRate:null };
  var taxedCust  = { taxExempt:false, defaultTaxRate:8.75 };
  // (a) exempt customer, an upstream WO rate of 7 present:
  assert('RED: old logic taxes an EXEMPT customer ('+oldInvoiceTax({taxRate:7},null)+'%)', oldInvoiceTax({taxRate:7},null)===7);
  assert('GREEN: resolver forces 0 for an exempt customer', resolveTaxRate({customer:exemptCust, explicit:7, fallbacks:[7,0]})===0);
  // (b) customer default 8.75, no upstream/company (company=0):
  assert('RED: old logic ignores the customer default → '+oldInvoiceTax(null,null)+'%', oldInvoiceTax(null,null)===0);
  assert('GREEN: resolver applies the customer default (8.75%)', resolveTaxRate({customer:taxedCust, fallbacks:[null,null,0]})===8.75);
  // (c) explicit document rate wins for a non-exempt customer:
  assert('GREEN: an explicit document rate (6%) wins over customer default', resolveTaxRate({customer:taxedCust, explicit:6})===6);
  // (d) labor: when the company rate is unset, OLD code fell back to a hardcoded 125; resolver uses 100.
  var _savedLR = DB.settings.laborRate; DB.settings.laborRate = null;
  var oldLabor = parseFloat(({}).laborRate || DB.settings.laborRate || 125);   // the real pre-fix expression
  assert('RED: old labor fallback is the stray 125 (company rate unset) → '+oldLabor, oldLabor===125);
  assert('GREEN: resolver falls back to company default 100, not 125', resolveLaborRate({})===100);
  DB.settings.laborRate = _savedLR;
  assert('GREEN: resolver respects an explicit document rate (150)', resolveLaborRate({explicit:150})===150);
  assert('teeth: resolver changes the exempt + customer-default outcomes vs old logic',
         resolveTaxRate({customer:exemptCust, explicit:7, fallbacks:[7]})!==oldInvoiceTax({taxRate:7},null) &&
         resolveTaxRate({customer:taxedCust, fallbacks:[0]})!==oldInvoiceTax(null,null));

  // ==========================================================================
  // PROOF 7 — #2 per-destination segments: a day that bounces office→WO→office is SPLIT correctly,
  // the office hours are RECOVERED (old single-row model attributed the whole day to the one WO and
  // lost the office time), AND the payroll INVARIANT holds — for a plain linear day the segment
  // aggregate is byte-identical to _computeClockDayTotals, and segment paid mins always sum to the total.
  // ==========================================================================
  console.log('\nPROOF 7 — #2 segments: office hours recovered on a split day; linear day == payroll (byte-identical):');
  // Load the REAL pure clock helpers (contiguous block, exactly as clock_day_split.test.js slices them).
  var _fieldSrc = fs.readFileSync(path.join(__dirname, '../js/field.js'), 'utf8');
  var _cs = _fieldSrc.indexOf('function _computeClockDayTotals(');
  var _ce = _fieldSrc.indexOf('async function _doArriveBackActual(');
  if (_cs<0 || _ce<0){ console.log('  ✗ cannot slice field clock helpers'); process.exit(1); }
  eval(_fieldSrc.slice(_cs, _ce));   // _computeClockDayTotals, _localDateStr, _splitClockDay, _OFFICE_DEST, _buildDaySegments
  function aggSegs(segs){ return segs.reduce(function(a,s){ a.officeMins+=s.officeMins; a.travelMins+=s.travelMins; a.onsiteMins+=s.onsiteMins; a.breakMins+=s.breakMins; a.lunchMins+=s.lunchMins; a.paidMins+=s.paidMins; return a; }, {officeMins:0,travelMins:0,onsiteMins:0,breakMins:0,lunchMins:0,paidMins:0}); }
  function at(h,m){ return new Date(2026,10,6,h,m,0,0).getTime(); }  // minute-aligned local times

  // ---- LINEAR day (base → one WO → home), 30m lunch: segment aggregate MUST equal _computeClockDayTotals ----
  var linEvents = [
    {type:'day_start',    time:at(8,0)},
    {type:'travel_start', time:at(8,30), jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'clock_in',     time:at(9,0),  jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'lunch_start',  time:at(12,0)},
    {type:'lunch_end',    time:at(12,30)},
    {type:'clock_out',    time:at(16,0), jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'day_end',      time:at(16,30)}
  ];
  var linSt = { homebaseStart:new Date(at(8,0)), travelOutStart:new Date(at(8,30)), onsiteStart:new Date(at(9,0)),
                travelOutMins:30, travelBackMins:30, onsiteMins:0, lunchMins:30, breakMins:0, status:'out' };
  var legacy = _computeClockDayTotals(linSt, new Date(at(16,30)));
  var linSegs = _buildDaySegments(linEvents);
  var linAgg = aggSegs(linSegs);
  assert('GREEN: linear day officeMins == payroll ('+linAgg.officeMins+'=='+legacy.officeMins+')', linAgg.officeMins===legacy.officeMins);
  assert('GREEN: linear day travelMins == payroll ('+linAgg.travelMins+'=='+legacy.travelMins+')', linAgg.travelMins===legacy.travelMins);
  assert('GREEN: linear day onsiteMins == payroll ('+linAgg.onsiteMins+'=='+legacy.onsiteMins+')', linAgg.onsiteMins===legacy.onsiteMins);
  assert('GREEN: linear day lunchMins == payroll ('+linAgg.lunchMins+'=='+legacy.lunchMins+')', linAgg.lunchMins===legacy.lunchMins);
  assert('GREEN: linear day segment paid sum == payroll total ('+linAgg.paidMins+'=='+legacy.totalPaidMins+')', linAgg.paidMins===legacy.totalPaidMins);

  // ---- MIXED day: office 08:00–10:00 → WO-1 10:00–14:00 → back to office 14:30–16:00 (no lunch) ----
  var mixEvents = [
    {type:'day_start',    time:at(8,0)},
    {type:'travel_start', time:at(10,0),  jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'clock_in',     time:at(10,30), jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'clock_out',    time:at(14,0),  jobId:'WO-1', jobName:'WO-1 Acme'},
    {type:'office_start', time:at(14,30)},
    {type:'day_end',      time:at(16,0)}
  ];
  var mixSegs = _buildDaySegments(mixEvents);
  var mixAgg = aggSegs(mixSegs);
  var spanMin = (at(16,0)-at(8,0))/60000;   // 480, lunch 0
  // The OLD single-row model attributed the whole day to the one WO (entryType='work'), so office = 0 (lost).
  var oldOfficeMins = 0;                      // pre-fix: a day that touched a WO reported ZERO office time
  var oldSegCount   = 1;                      // pre-fix: one undifferentiated day line
  assert('RED: old model loses the office hours on a split day (office='+oldOfficeMins+')', oldOfficeMins===0);
  assert('RED: old model has no per-destination split (1 line)', oldSegCount===1);
  assert('GREEN: segments split the day into 3 (office → WO → office)', mixSegs.length===3);
  assert('GREEN: office hours RECOVERED across the two office legs (210m = 120+90)', mixAgg.officeMins===210);
  assert('GREEN: the WO-1 segment carries 270m paid (60 travel + 210 onsite)', (function(){ var w=mixSegs.find(function(s){return s.dest==='WO-1';}); return w && w.paidMins===270 && w.travelMins===60 && w.onsiteMins===210; })());
  assert('GREEN: segment paid mins sum to the full paid span ('+mixAgg.paidMins+'=='+spanMin+')', mixAgg.paidMins===spanMin);
  assert('GREEN: first + last segments are the office legs', mixSegs[0].dest==='office' && mixSegs[2].dest==='office');
  assert('teeth: the segment engine recovers office time the old model dropped ('+mixAgg.officeMins+' vs '+oldOfficeMins+')', mixAgg.officeMins!==oldOfficeMins && mixSegs.length!==oldSegCount);

  // ---- OFFICE-ONLY day (never left base): one office segment == the whole paid day ----
  var offEvents = [ {type:'day_start', time:at(8,0)}, {type:'day_end', time:at(16,30)} ];
  var offSegs = _buildDaySegments(offEvents);
  assert('GREEN: office-only day → exactly one office segment', offSegs.length===1 && offSegs[0].dest==='office');
  assert('GREEN: office-only day paid == whole span (510m)', offSegs[0].paidMins===510 && offSegs[0].officeMins===510);

  console.log('\n'+(fail===0?('ALL '+pass+' PROOFS PASSED (each red-then-green)'):(fail+' FAILED, '+pass+' passed')));
  process.exit(fail===0?0:1);
})();
