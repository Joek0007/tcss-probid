// ============================================================
// checkouts_db.js (build ia) — PER-ROW tool checkout / custody persistence
// ------------------------------------------------------------
// Replaces the fragile whole-array app_state 'toolCheckouts' blob
// (last-writer-wins) with per-row reads/writes against the real table:
//   tool_checkouts   (+ typed columns added Oct 2026)
// Writes are optimistic-concurrency guarded (updated_at), so two people acting
// on the SAME checkout no longer silently clobber — the stale writer is told to
// reload. Different checkouts touched at once never collide (separate rows).
//
// Mirrors tools_db.js exactly in shape and guarantees. Real fields -> real
// columns; jsonb (legacy_extra) holds only genuine history-detail extras that
// have no column, which does NOT reintroduce cross-record clobber because each
// checkout is still its own row.
//
// GATED by _checkoutsPerRow(): dormant until a session opts in via
//   localStorage 'checkouts_perrow'==='1'  OR  URL '?coperrow=1'
// so this file is safe to deploy with the live app unchanged. The after-hours
// cutover flips the default on (__CHECKOUTS_PERROW_DEFAULT) and drops
// 'toolCheckouts'/'checkoutLog'/'toolLoans' from the blob sync.
// ============================================================
(function(){
  'use strict';

  window._checkoutsPerRow = function _checkoutsPerRow(){
    try {
      if (/[?&]coperrow=1\b/.test(location.search)) return true;
      if (/[?&]coperrow=0\b/.test(location.search)) return false;   // emergency off
      if (localStorage.getItem('checkouts_perrow') === '1') return true;
      if (localStorage.getItem('checkouts_perrow') === '0') return false;
    } catch(e){}
    return !!window.__CHECKOUTS_PERROW_DEFAULT;   // cutover flips this to true
  };

  var _isUuid = function(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
  var _now  = function(){ return new Date().toISOString(); };
  function _ts(v){ if(v==null||v==='') return null; try{ var d=new Date(v); return isNaN(d.getTime())?null:d.toISOString(); }catch(e){ return null; } }
  function _tsFromMs(ms){ if(!ms) return null; try{ var d=new Date(ms); return isNaN(d.getTime())?null:d.toISOString(); }catch(e){ return null; } }
  function _dateOnly(v){ return v ? String(v).split('T')[0] : ''; }

  // legacy app tool id (string) -> real tools.id uuid, via the in-memory tools
  // (ToolsDB.load has already populated DB.tools with _uuid). A checkout whose
  // tool can't be resolved is NOT written (tool_id is a NOT NULL FK) — we never
  // create a dangling custody row.
  function _resolveToolUuid(appToolId){
    if (!appToolId) return null;
    if (_isUuid(appToolId)) return appToolId;
    var t = (window.DB && DB.tools || []).find(function(x){ return x && String(x.id)===String(appToolId); });
    return (t && t._uuid) ? t._uuid : null;
  }

  var _STATUS_APP2DB = function(co){
    switch(co.status){
      case 'checked_out':   return 'checked_out';
      case 'pending_verify':return 'pending_verification';
      case 'as_is_released':return 'reissued_assumed_responsibility';
      case 'verified':      return co.discrepancyNote ? 'closed_with_discrepancy' : 'closed_verified';
      default:              return 'checked_out';
    }
  };
  var _STATUS_DB2APP = function(s){
    switch(s){
      case 'checked_out':                      return 'checked_out';
      case 'pending_verification':             return 'pending_verify';
      case 'reissued_assumed_responsibility':  return 'as_is_released';
      case 'closed_verified':
      case 'closed_with_discrepancy':          return 'verified';
      default:                                 return 'checked_out';
    }
  };
  function _checkoutType(co){
    if (co.isPersonalBorrow) return 'personal_share';
    if (co.transferMode || co.transferredFrom || co.takenAsIs || co.isGroupSplit) return 'field_transfer';
    return 'office_checkout';
  }

  // Fields with no dedicated column — genuine history detail — ride in legacy_extra.
  var _EXTRA_KEYS = ['returnedAt','itemInspection','asIsReleasedTo','asIsReleasedAt','asIsReleasedBy',
    'asIsNote','transferredTo','transferExpiredNote','isPersonalBorrow','ownerName','borrowRequestId'];
  function _extra(co){
    var e={};
    _EXTRA_KEYS.forEach(function(k){ if(co[k]!=null && co[k]!=='') e[k]=co[k]; });
    if (co.transferDispute && co.transferDispute.from) e.transferDisputeFrom = co.transferDispute.from;
    if (co.pendingTransfer && co.pendingTransfer.byUser) e.pendingByUser = co.pendingTransfer.byUser;
    return Object.keys(e).length ? e : null;
  }

  function _coRow(co){
    var pt = co.pendingTransfer || null;
    return {
      tool_id:                 _resolveToolUuid(co.toolId),
      checked_out_to_id:       _isUuid(co.checkedOutToId) ? co.checkedOutToId : null,
      checkout_type:           _checkoutType(co),
      to_name:                 co.toName || null,
      job_id:                  _isUuid(co.jobId) ? co.jobId : null,
      job_name:                co.jobName || null,
      job_purpose:             co.jobPurpose || null,
      checkout_date:           co.date || null,
      expected_return_date:    co.expectedReturn || null,
      status:                  _STATUS_APP2DB(co),
      groups_included:         co.groupsIncluded || null,
      notes:                   co.notes || null,
      // return / verify
      return_submitted_at:     _ts(co.returnSubmittedAt),
      return_submitted_by_name:co.returnSubmittedBy || null,
      return_dropoff_location: co.dropoffLocation || null,
      verify_type:             co.verifyType || null,
      verified_at:             _ts(co.verifiedAt),
      verified_by_name:        co.verifiedBy || null,
      discrepancy_note:        co.discrepancyNote || null,
      return_condition:        co.returnCondition || null,
      return_condition_note:   co.returnConditionNote || null,
      return_photo_url:        co.returnPhotoUrl || null,
      // transfer trail (on the RECEIVING record)
      transferred_from_name:   co.transferredFrom || null,
      transfer_mode:           co.transferMode || null,
      accepted_by_name:        co.acceptedBy || null,
      accepted_at:             _ts(co.acceptedAt),
      brokered_by_name:        co.brokeredBy || null,
      brokered_at:             _ts(co.brokeredAt),
      approved_by_name:        co.approvedBy || null,
      accept_condition:        co.acceptCondition || null,
      transfer_prior_id:       co.transferPriorCoId || null,
      // pending transfer snapshot (on the SENDER's active record)
      transfer_pending:        !!pt,
      transfer_initiated_at:   pt ? _ts(pt.at) : _ts(co.transferInitiatedAt),
      transfer_to_name:        pt ? (pt.to||null) : null,
      transfer_by_name:        pt ? (pt.by||null) : null,
      transfer_note:           pt ? (pt.note||null) : null,
      transfer_travel:         pt ? (pt.travel||null) : null,
      transfer_stay:           pt ? (pt.stay||null) : null,
      transfer_expires_at:     pt ? _tsFromMs(pt.expiresAt) : null,
      // dispute
      transfer_dispute_by:     co.transferDispute ? (co.transferDispute.by||null) : null,
      transfer_dispute_reason: co.transferDispute ? (co.transferDispute.reason||null) : null,
      transfer_dispute_at:     co.transferDispute ? _ts(co.transferDispute.at) : null,
      // as-is
      taken_as_is:             !!co.takenAsIs,
      as_is_from_name:         co.asIsFrom || null,
      as_is_ack_by:            co.asIsAckBy || null,
      as_is_approved_by:       co.asIsApprovedBy || null,
      as_is_prior_id:          co.asIsPriorCoId || null,
      // split (stays-behind parts)
      is_group_split:          !!co.isGroupSplit,
      split_from_tool_id:      co.splitFromToolId ? _resolveToolUuid(co.splitFromToolId) : null,
      // lifecycle
      is_active:               (co.is_active !== false),
      legacy_id:               (co.id!=null ? String(co.id) : null),
      legacy_extra:            _extra(co)
    };
  }

  function _coFromRow(row, toolByUuid){
    var co = {
      _uuid: row.id, _rev: row.updated_at,
      id: row.legacy_id || row.id,
      toolId: (toolByUuid && toolByUuid[row.tool_id]) || row.tool_id,
      toName: row.to_name||'',
      jobId: row.job_id||'',
      jobName: row.job_name||'',
      jobPurpose: row.job_purpose||'',
      date: _dateOnly(row.checkout_date),
      expectedReturn: _dateOnly(row.expected_return_date),
      status: _STATUS_DB2APP(row.status),
      groupsIncluded: row.groups_included||[],
      notes: row.notes||'',
      returnedAt: null,
      returnSubmittedAt: _dateOnly(row.return_submitted_at),
      returnSubmittedBy: row.return_submitted_by_name||'',
      dropoffLocation: row.return_dropoff_location||'',
      verifyType: row.verify_type||'',
      verifiedAt: _dateOnly(row.verified_at),
      verifiedBy: row.verified_by_name||'',
      discrepancyNote: row.discrepancy_note||'',
      returnCondition: row.return_condition||'',
      returnConditionNote: row.return_condition_note||'',
      returnPhotoUrl: row.return_photo_url||''
    };
    if (row.transferred_from_name) co.transferredFrom = row.transferred_from_name;
    if (row.transfer_mode)         co.transferMode    = row.transfer_mode;
    if (row.accepted_by_name)      co.acceptedBy      = row.accepted_by_name;
    if (row.accepted_at)           co.acceptedAt      = _dateOnly(row.accepted_at);
    if (row.brokered_by_name)      co.brokeredBy      = row.brokered_by_name;
    if (row.brokered_at)           co.brokeredAt      = _dateOnly(row.brokered_at);
    if (row.approved_by_name)      co.approvedBy      = row.approved_by_name;
    if (row.accept_condition)      co.acceptCondition = row.accept_condition;
    if (row.transfer_prior_id)     co.transferPriorCoId = row.transfer_prior_id;
    if (row.taken_as_is)           co.takenAsIs       = true;
    if (row.as_is_from_name)       co.asIsFrom        = row.as_is_from_name;
    if (row.as_is_ack_by)          co.asIsAckBy       = row.as_is_ack_by;
    if (row.as_is_approved_by)     co.asIsApprovedBy  = row.as_is_approved_by;
    if (row.as_is_prior_id)        co.asIsPriorCoId   = row.as_is_prior_id;
    if (row.is_group_split){
      co.isGroupSplit = true;
      co.splitFromToolId = (toolByUuid && toolByUuid[row.split_from_tool_id]) || row.split_from_tool_id || '';
    }
    if (row.transfer_pending){
      co.pendingTransfer = {
        to: row.transfer_to_name||'', by: row.transfer_by_name||'', byUser:'',
        at: _dateOnly(row.transfer_initiated_at),
        travel: row.transfer_travel||[], stay: row.transfer_stay||[],
        note: row.transfer_note||'',
        expiresAt: row.transfer_expires_at ? Date.parse(row.transfer_expires_at) : 0
      };
    }
    if (row.transfer_dispute_by || row.transfer_dispute_reason){
      co.transferDispute = { by: row.transfer_dispute_by||'', reason: row.transfer_dispute_reason||'', at: _dateOnly(row.transfer_dispute_at), from:'' };
    }
    if (row.legacy_extra){
      var ex = row.legacy_extra;
      _EXTRA_KEYS.forEach(function(k){ if(ex[k]!=null) co[k]=ex[k]; });
      if (ex.transferDisputeFrom && co.transferDispute) co.transferDispute.from = ex.transferDisputeFrom;
      if (ex.pendingByUser && co.pendingTransfer) co.pendingTransfer.byUser = ex.pendingByUser;
    }
    // closed records carry a returnedAt; derive if not stored
    if (co.returnedAt==null){
      if (row.status==='closed_verified' || row.status==='closed_with_discrepancy' || row.status==='reissued_assumed_responsibility')
        co.returnedAt = _dateOnly(row.verified_at) || _dateOnly(row.return_submitted_at) || _dateOnly(row.updated_at) || '';
    }
    return co;
  }

  function _toolByUuid(){
    var m={}; (window.DB && DB.tools || []).forEach(function(t){ if(t && t._uuid) m[t._uuid]=t.id; }); return m;
  }

  // Load all active checkout/custody records into the app's shape.
  async function load(){
    var sb = window._sb; if(!sb) return [];
    var r = await sb.from('tool_checkouts').select('*').eq('is_active', true);
    if (r.error) throw r.error;
    var map = _toolByUuid();
    return (r.data||[]).map(function(row){ return _coFromRow(row, map); });
  }

  // Save one checkout (insert or optimistic update).
  // Returns {ok:true,id} | {conflict:true} | {error}.
  async function save(co){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var row = _coRow(co);
    if (!row.tool_id) return {error:'could not resolve tool for checkout (toolId='+co.toolId+')'};
    var uuid = co._uuid || (_isUuid(co.id) ? co.id : null);
    if (uuid){
      var q = sb.from('tool_checkouts').update(Object.assign({}, row, {updated_at:_now()})).eq('id', uuid);
      if (co._rev) q = q.eq('updated_at', co._rev);   // optimistic guard
      var u = await q.select();
      if (u.error) return {error:u.error.message};
      if (!u.data || !u.data.length) return {conflict:true};
      co._uuid = u.data[0].id; co._rev = u.data[0].updated_at;
      return {ok:true, id:co._uuid};
    } else {
      var nid = (window.crypto&&crypto.randomUUID)?crypto.randomUUID():(''+Date.now()+Math.random());
      var ins = await sb.from('tool_checkouts').insert(Object.assign({id:nid}, row)).select();
      if (ins.error) return {error:ins.error.message};
      co._uuid = nid; if(ins.data&&ins.data[0]) co._rev = ins.data[0].updated_at;
      return {ok:true, id:nid};
    }
  }

  // Soft-delete (remove from the app). Closing a custody is NOT this — a closed
  // record stays is_active=true with a closed status for history. This is for
  // genuine removal / self-test teardown.
  async function retire(uuid){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var r = await sb.from('tool_checkouts').update({is_active:false,updated_at:_now()}).eq('id', uuid).select('id');
    return r.error ? {error:r.error.message} : {ok:true};
  }

  // Idempotent migration of the app_state 'toolCheckouts' blob into the table.
  // Currently a clean slate (0 rows); safe to re-run (matches by legacy_id).
  async function migrateFromBlob(blobCheckouts){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var list = blobCheckouts || (window.DB && DB.toolCheckouts) || [];
    var report = [];
    for (var k=0;k<list.length;k++){
      var co = list[k];
      var clone = Object.assign({}, co);
      if (co.id!=null){
        var ex = await sb.from('tool_checkouts').select('id,updated_at').eq('legacy_id', String(co.id)).eq('is_active',true).maybeSingle();
        if (ex.data && ex.data.id){ clone._uuid = ex.data.id; clone._rev = ex.data.updated_at; }
        else { delete clone._uuid; delete clone._rev; }
      } else { delete clone._uuid; delete clone._rev; }
      var res = await save(clone);
      report.push({ id:co.id, toName:co.toName, result:res });
    }
    return report;
  }

  window.CheckoutsDB = {
    load:load, save:save, retire:retire, migrateFromBlob:migrateFromBlob,
    _coFromRow:_coFromRow, _coRow:_coRow, _resolveToolUuid:_resolveToolUuid
  };
})();
