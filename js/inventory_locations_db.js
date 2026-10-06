// ============================================================
// inventory_locations_db.js (build ie) — PER-ROW inventory locations
// ------------------------------------------------------------
// Moves the inventory LOCATION DEFINITIONS (shop + trucks) off the fragile
// whole-array app_state 'invLocations' blob (last-writer-wins) onto the per-row
// table public.inventory_locations, with an optimistic-concurrency guard.
// (Item quantities already live safely in the catalog table via an RPC — this is
// only the small list of locations those quantities are keyed to.)
//
// Location ids stay STABLE: the app keeps the legacy string id ('loc-shop',
// 'loc-v1', ...) as `id`, because item.locations{}, bins, reserved stock and par
// levels all reference it. The real table UUID is tracked as `_uuid`.
//
// GATED by _invLocPerRow(): dormant until the cutover flips the default.
//   Emergency off: ?invloc=0  or  localStorage 'invloc_perrow'='0'
// ============================================================
(function(){
  'use strict';

  window._invLocPerRow = function _invLocPerRow(){
    try {
      if (/[?&]invloc=0\b/.test(location.search)) return false;
      if (localStorage.getItem('invloc_perrow') === '0') return false;
      if (/[?&]invloc=1\b/.test(location.search)) return true;
      if (localStorage.getItem('invloc_perrow') === '1') return true;
    } catch(e){}
    return true;   // (cutover) inventory locations are now per-row for everyone
  };

  var _isUuid = function(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
  var _now = function(){ return new Date().toISOString(); };
  var _uid = function(){ return (window._currentUser && _currentUser.id) || null; };

  // Known app fields map to real columns; anything else rides legacy_extra.
  var _CORE = { id:1, name:1, type:1, isDefault:1, assetId:1, sortOrder:1, is_active:1, _uuid:1, _rev:1 };

  function _row(loc, idx){
    var extra = {};
    for (var k in loc){ if (loc.hasOwnProperty(k) && !_CORE[k] && loc[k]!=null) extra[k]=loc[k]; }
    return {
      legacy_id:  (loc.id!=null ? String(loc.id) : null),
      name:       loc.name || 'Location',
      type:       loc.type || null,
      is_default: !!loc.isDefault,
      asset_id:   (loc.assetId!=null ? String(loc.assetId) : null),
      sort_order: (typeof loc.sortOrder==='number' ? loc.sortOrder : (typeof idx==='number' ? idx : null)),
      is_active:  (loc.is_active !== false),
      legacy_extra: Object.keys(extra).length ? extra : null,
      created_by: _uid()
    };
  }

  function _fromRow(r){
    var loc = {
      _uuid: r.id, _rev: r.updated_at,
      id: r.legacy_id || r.id,
      name: r.name, type: r.type || '',
      isDefault: !!r.is_default
    };
    if (r.asset_id) loc.assetId = r.asset_id;
    if (r.sort_order != null) loc.sortOrder = r.sort_order;
    if (r.legacy_extra){ for (var k in r.legacy_extra){ if (r.legacy_extra.hasOwnProperty(k)) loc[k]=r.legacy_extra[k]; } }
    return loc;
  }

  async function load(){
    var sb = window._sb; if(!sb) return [];
    var r = await sb.from('inventory_locations').select('*').eq('is_active', true);
    if (r.error) throw r.error;
    var rows = (r.data||[]).slice().sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
    return rows.map(_fromRow);
  }

  // Insert or optimistic update. Returns {ok,id} | {conflict:true} | {error}.
  async function save(loc, idx){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var row = _row(loc, idx);
    var uuid = loc._uuid || (_isUuid(loc.id) ? loc.id : null);
    if (uuid){
      var q = sb.from('inventory_locations').update(Object.assign({}, row, {updated_at:_now()})).eq('id', uuid);
      if (loc._rev) q = q.eq('updated_at', loc._rev);   // guard
      var u = await q.select();
      if (u.error) return {error:u.error.message};
      if (!u.data || !u.data.length) return {conflict:true};
      loc._uuid = u.data[0].id; loc._rev = u.data[0].updated_at;
      return {ok:true, id:loc._uuid};
    } else {
      var nid = (window.crypto&&crypto.randomUUID)?crypto.randomUUID():(''+Date.now()+Math.random());
      var ins = await sb.from('inventory_locations').insert(Object.assign({id:nid}, row)).select();
      if (ins.error) return {error:ins.error.message};
      loc._uuid = nid; if(ins.data&&ins.data[0]) loc._rev = ins.data[0].updated_at;
      return {ok:true, id:nid};
    }
  }

  async function retire(uuid){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var r = await sb.from('inventory_locations').update({is_active:false,updated_at:_now()}).eq('id', uuid).select('id');
    return r.error ? {error:r.error.message} : {ok:true};
  }

  // Idempotent migration of the blob's 16 locations into the table (match by legacy_id).
  async function migrateFromBlob(blobLocs){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var list = blobLocs || (typeof window.getLocations==='function' ? window.getLocations() : (window.DB && DB.invLocations)) || [];
    var report = [];
    for (var i=0;i<list.length;i++){
      var loc = Object.assign({}, list[i]);
      if (loc.id!=null){
        var ex = await sb.from('inventory_locations').select('id,updated_at').eq('legacy_id', String(loc.id)).eq('is_active',true).maybeSingle();
        if (ex.data && ex.data.id){ loc._uuid = ex.data.id; loc._rev = ex.data.updated_at; }
        else { delete loc._uuid; delete loc._rev; }
      } else { delete loc._uuid; delete loc._rev; }
      var res = await save(loc, i);
      report.push({ id:loc.id, name:loc.name, result:res });
    }
    return report;
  }

  window.InvLocationsDB = { load:load, save:save, retire:retire, migrateFromBlob:migrateFromBlob, _row:_row, _fromRow:_fromRow };
})();
