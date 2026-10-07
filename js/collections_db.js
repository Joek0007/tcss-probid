// ============================================================
// collections_db.js (build ii) — GENERIC per-row store for small blob collections
// ------------------------------------------------------------
// The last whole-array blobs — all currently empty / low-churn — moved off the
// clobber-prone app_state blob onto ONE generic per-row table (app_collections),
// keyed by (collection, item_id). Each item is its own row, so concurrent adds
// and edits to different items never collide.
//
// Covered collections: invTransfers, checkoutLog, toolLoans, absences,
// lunchFlags, timeCorrections, payrollLog, leaveForfeiture.
//
// Wired entirely at the sync layer (auth.js load + push) via a per-collection
// baseline, so deletes propagate without the concurrent-delete trap and NO
// individual write sites need editing.
//
// GATED by _collectionsPerRow(): dormant until cutover. Emergency off: ?colperrow=0
// ============================================================
(function(){
  'use strict';

  window._collectionsPerRow = function _collectionsPerRow(){
    try {
      if (/[?&]colperrow=0\b/.test(location.search)) return false;
      if (localStorage.getItem('collections_perrow') === '0') return false;
      if (/[?&]colperrow=1\b/.test(location.search)) return true;
      if (localStorage.getItem('collections_perrow') === '1') return true;
    } catch(e){}
    return true;   // (cutover) the generic per-row store is now the default for everyone
  };

  var _now = function(){ return new Date().toISOString(); };
  function _genId(){ return (window.crypto&&crypto.randomUUID) ? ('gen-'+crypto.randomUUID()) : ('gen-'+Date.now()+Math.random()); }

  // Load one collection's active items (as the app's objects).
  async function load(collection){
    var sb = window._sb; if(!sb) return [];
    var r = await sb.from('app_collections').select('item_id,data').eq('collection', collection).eq('is_active', true);
    if (r.error) throw r.error;
    return (r.data||[]).map(function(row){ var d = row.data || {}; if (d.id==null) d.id = row.item_id; return d; });
  }

  // Upsert every item currently present; retire only ids this session loaded
  // (baselineIds) and has since removed. Items added by OTHER sessions are never
  // touched (not in baselineIds, not in arr) — so no concurrent-delete clobber.
  // Returns {ok, ids:[current ids]} | {error}.
  async function syncArray(collection, arr, baselineIds){
    var sb = window._sb; if(!sb) return {error:'offline'};
    arr = arr || []; baselineIds = baselineIds || [];
    var curIds = {};
    for (var i=0;i<arr.length;i++){
      var it = arr[i]; if (!it || typeof it!=='object') continue;
      if (it.id==null) it.id = _genId();
      var iid = String(it.id); curIds[iid] = 1;
      var up = await sb.from('app_collections')
        .upsert({ collection:collection, item_id:iid, data:it, is_active:true, updated_at:_now() }, { onConflict:'collection,item_id' });
      if (up.error) return {error:up.error.message};
    }
    for (var j=0;j<baselineIds.length;j++){
      var bid = String(baselineIds[j]);
      if (!curIds[bid]){ await sb.from('app_collections').update({is_active:false, updated_at:_now()}).eq('collection',collection).eq('item_id',bid); }
    }
    return {ok:true, ids:Object.keys(curIds)};
  }

  async function retire(collection, itemId){
    var sb = window._sb; if(!sb) return {error:'offline'};
    var r = await sb.from('app_collections').update({is_active:false, updated_at:_now()}).eq('collection',collection).eq('item_id',String(itemId));
    return r.error ? {error:r.error.message} : {ok:true};
  }

  window.CollectionsDB = { load:load, syncArray:syncArray, retire:retire };
})();
