// ============================================================
// tools_db.js  (build hc) — PER-ROW tools persistence
// ------------------------------------------------------------
// Replaces the fragile whole-array app_state 'tools' blob (last-writer-wins)
// with per-row reads/writes against the real tables:
//   tools, tool_linked_groups
// Writes are optimistic-concurrency guarded (updated_at), so two people editing
// the SAME tool no longer silently clobber — the stale writer is told to reload.
// Different tools edited at once never collide (separate rows).
//
// GATED by _toolsPerRow(): dormant until a session opts in via
//   localStorage 'tools_perrow'==='1'  OR  URL '?perrow=1'
// so this file is safe to deploy with the live app unchanged. The after-hours
// cutover flips the default on (see _toolsPerRow) and drops 'tools' from the
// blob sync.
// ============================================================
(function(){
  'use strict';

  window._toolsPerRow = function _toolsPerRow(){
    try {
      if (/[?&]perrow=1\b/.test(location.search)) return true;
      if (localStorage.getItem('tools_perrow') === '1') return true;
    } catch(e){}
    return !!window.__TOOLS_PERROW_DEFAULT;   // cutover flips this to true
  };

  var _isUuid = function(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
  var _MODE_APP2DB = { required:'required_with_parent', optional:'optional_with_parent' };
  var _MODE_DB2APP = { required_with_parent:'required', optional_with_parent:'optional', independent_optional:'optional' };
  var _uid = function(){ return (window._currentUser && _currentUser.id) || null; };
  var _now = function(){ return new Date().toISOString(); };

  function _toolRow(t){
    return {
      name: t.name || 'Tool',
      asset_tag: t.tag || null,
      category: t.cat || 'Other',
      home_location: t.location || null,
      assigned_tech: t.assignedTech || null,
      unit_cost: (t.cost!=null && t.cost!=='') ? Number(t.cost) : null,
      serial_number: t.serial || null,
      purchase_date: t.purchaseDate || null,
      photo_url: t.photoUrl || null,
      owner_type: (t.ownerType==='personal' ? 'personal' : 'company'),
      personal_owner_id: _isUuid(t.ownerId) ? t.ownerId : null,
      share_return_photo: t.requireReturnPhoto ? 'required' : 'never',
      notes: t.notes || null,
      is_vehicle_permanent: !!t.isVehiclePermanent,
      is_shareable: !!t.isShareable,
      current_status: t._currentStatus || 'available',
      is_active: (t.is_active !== false),
      legacy_id: (t.id!=null ? String(t.id) : null),
      legacy_extra: (function(){
        var e={};
        if (t.ownerId && !_isUuid(t.ownerId)) e.ownerId = t.ownerId;
        if (t.personalShareRequests) e.personalShareRequests = t.personalShareRequests;
        if (t.requireReturnPhoto!=null) e.requireReturnPhoto = t.requireReturnPhoto;
        return Object.keys(e).length ? e : null;
      })(),
      created_by: _uid()
    };
  }
  function _groupRow(g, parentUuid, idx){
    var mode = _MODE_APP2DB[g.mode] || (['required_with_parent','optional_with_parent','independent_optional'].indexOf(g.mode)>=0 ? g.mode : 'optional_with_parent');
    return {
      parent_tool_id: parentUuid,
      label: g.label || 'Item',
      description: g.description || null,
      tracking_mode: mode,
      asset_tag: g.tag || null,
      photo_url: g.photoUrl || null,
      sort_order: idx,
      current_status: 'available',
      is_active: (g.is_active !== false),
      legacy_id: (g.id!=null ? String(g.id) : null),
      legacy_extra: null
    };
  }
  function _toolFromRow(row, groups){
    // App-facing `id` stays the LEGACY string id when present, so existing
    // checkouts/custody records (which reference the old ids) still link. The real
    // table UUID is tracked as `_uuid` for all DB writes. Tools created after cutover
    // have no legacy_id, so their id == uuid (and any new checkouts reference that).
    var t = {
      _uuid: row.id, _rev: row.updated_at, id: row.legacy_id || row.id,
      name: row.name, tag: row.asset_tag||'', cat: row.category,
      location: row.home_location||'', assignedTech: row.assigned_tech||'',
      cost: row.unit_cost||0, serial: row.serial_number||'',
      purchaseDate: row.purchase_date||'', photoUrl: row.photo_url||'',
      ownerType: row.owner_type, ownerId: row.personal_owner_id||'',
      requireReturnPhoto: (row.share_return_photo==='required'),
      notes: row.notes||'', _currentStatus: row.current_status,
      linkedGroups: (groups||[]).map(function(g){ return {
        _uuid: g.id, id: g.id, label: g.label, description: g.description||'',
        mode: (_MODE_DB2APP[g.tracking_mode] || 'optional'),
        tag: g.asset_tag||'', photoUrl: g.photo_url||''
      }; })
    };
    if (row.legacy_extra) Object.assign(t, row.legacy_extra);
    return t;
  }

  // Load all active tools (+ their active linked groups) into the app's shape.
  async function load(){
    var sb = window._sb; if(!sb) return [];
    var tr = await sb.from('tools').select('*').eq('is_active', true);
    if (tr.error) throw tr.error;
    var tools = tr.data || [];
    var ids = tools.map(function(t){ return t.id; });
    var groups = [];
    if (ids.length){
      var gr = await sb.from('tool_linked_groups').select('*').in('parent_tool_id', ids).eq('is_active', true);
      if (gr.error) throw gr.error;
      groups = gr.data || [];
    }
    return tools.map(function(row){
      return _toolFromRow(row, groups.filter(function(g){ return g.parent_tool_id===row.id; }).sort(function(a,b){ return a.sort_order-b.sort_order; }));
    });
  }

  // Save one tool (insert or optimistic update) + sync its linked groups.
  // Returns {ok:true, id} | {conflict:true} | {error}.
  async function saveTool(t){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var row = _toolRow(t);
    var toolUuid = t._uuid || (_isUuid(t.id) ? t.id : null);
    if (toolUuid){
      var q = sb.from('tools').update(Object.assign({}, row, {updated_at:_now()})).eq('id', toolUuid);
      if (t._rev) q = q.eq('updated_at', t._rev);   // optimistic guard
      var r = await q.select();
      if (r.error) return {error:r.error.message};
      if (!r.data || !r.data.length) return {conflict:true};
      toolUuid = r.data[0].id; t._rev = r.data[0].updated_at;
    } else {
      toolUuid = (window.crypto&&crypto.randomUUID)?crypto.randomUUID():(''+Date.now()+Math.random());
      var ins = await sb.from('tools').insert(Object.assign({id:toolUuid}, row)).select();
      if (ins.error) return {error:ins.error.message};
      t._uuid = toolUuid; t.id = toolUuid; if(ins.data&&ins.data[0]) t._rev = ins.data[0].updated_at;
    }
    // sync linked groups: upsert provided (by legacy_id/uuid), retire the ones no longer present
    var groups = t.linkedGroups || [];
    var keepUuids = [];
    for (var i=0;i<groups.length;i++){
      var g = groups[i], gRow = _groupRow(g, toolUuid, i);
      var gUuid = g._uuid || (_isUuid(g.id) ? g.id : null);
      if (!gUuid && g.id!=null){
        var found = await sb.from('tool_linked_groups').select('id').eq('parent_tool_id',toolUuid).eq('legacy_id',String(g.id)).eq('is_active',true).maybeSingle();
        if (found.data && found.data.id) gUuid = found.data.id;
      }
      if (gUuid){ await sb.from('tool_linked_groups').update(Object.assign({},gRow,{updated_at:_now()})).eq('id',gUuid); keepUuids.push(gUuid); }
      else { var nid=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(''+Date.now()+i); await sb.from('tool_linked_groups').insert(Object.assign({id:nid}, gRow)); keepUuids.push(nid); }
    }
    // retire groups removed in this edit
    var existing = await sb.from('tool_linked_groups').select('id').eq('parent_tool_id',toolUuid).eq('is_active',true);
    if (existing.data){
      for (var j=0;j<existing.data.length;j++){ if (keepUuids.indexOf(existing.data[j].id)<0) await sb.from('tool_linked_groups').update({is_active:false,updated_at:_now()}).eq('id',existing.data[j].id); }
    }
    return {ok:true, id:toolUuid};
  }

  // Soft-delete (retire) a tool + its groups (hard delete is RLS-blocked by design).
  async function retireTool(toolUuid){
    var sb = window._sb; if(!sb) return {error:'offline'};
    await sb.from('tool_linked_groups').update({is_active:false,updated_at:_now()}).eq('parent_tool_id', toolUuid);
    var r = await sb.from('tools').update({is_active:false,updated_at:_now()}).eq('id', toolUuid).select('id');
    return r.error ? {error:r.error.message} : {ok:true};
  }

  // Idempotent one-time migration of the app_state 'tools' blob into the tables.
  // Safe to re-run (matches by legacy_id). Returns a per-tool report.
  async function migrateFromBlob(blobTools){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var list = blobTools || (window.DB && DB.tools) || [];
    var report = [];
    for (var k=0;k<list.length;k++){
      var t = list[k];
      var ex = await sb.from('tools').select('id').eq('legacy_id', String(t.id)).eq('is_active',true).maybeSingle();
      var clone = Object.assign({}, t);
      if (ex.data && ex.data.id){ clone._uuid = ex.data.id; delete clone._rev; }
      else { delete clone._uuid; }
      var res = await saveTool(clone);
      report.push({ name:t.name, result:res });
    }
    return report;
  }

  window.ToolsDB = { load:load, saveTool:saveTool, retireTool:retireTool, migrateFromBlob:migrateFromBlob, _toolFromRow:_toolFromRow, _toolRow:_toolRow };
})();
