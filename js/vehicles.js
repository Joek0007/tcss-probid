// ============================================================
// VEHICLES / FLEET ASSETS MODULE
// A first-class fleet-vehicle record. Work orders attach to a vehicle (via
// wo.vehicleId) instead of a customer for internal vehicle work. Mirrors the
// Customers module (list + modal + profile overlay) and the load-on-demand +
// rollup patterns used for invoices/work orders.
// ============================================================

var _vehPage = 1, _vehSearchTimer = null;

function _vehSearch(){
  if (_vehSearchTimer) clearTimeout(_vehSearchTimer);
  _vehSearchTimer = setTimeout(function(){ _vehPage = 1; renderVehicles(); }, 200);
}
function _vehGoPage(n){ _vehPage = n; renderVehicles(); var t=document.getElementById('veh-tbl'); if(t&&t.scrollIntoView) t.scrollIntoView({block:'start'}); }
function setVehSort(){ _vehPage = 1; renderVehicles(); }

var VEH_STATUS_COLORS = { active:'#2e7d32', in_shop:'#e65100', sold:'#546e7a', inactive:'#90a4ae' };
function _vehStatusColor(s){ return VEH_STATUS_COLORS[(s||'').toLowerCase()] || '#546e7a'; }
function _vehStatusLabel(s){ s=(s||'').toLowerCase(); return s==='in_shop'?'In Shop':(s?s.charAt(0).toUpperCase()+s.slice(1):'—'); }

// Per-vehicle WO count for the list card (load-on-demand: WOs aren't all in memory).
var _vehRollupLoaded=false, _vehRollupBusy=false;
function _ensureVehicleRollup(force){
  if (force) _vehRollupLoaded=false;
  if (_vehRollupLoaded || _vehRollupBusy) return;
  if (typeof _sb==='undefined' || !_sb) return;
  _vehRollupBusy=true;
  _sb.rpc('vehicle_wo_rollup').then(function(rr){
    _vehRollupBusy=false;
    if (rr && !rr.error && Array.isArray(rr.data)){
      var m={}; rr.data.forEach(function(x){ if(x&&x.vehicle_id) m[x.vehicle_id]={cnt:+x.cnt||0}; });
      DB.vehicleRollup=m; _vehRollupLoaded=true;
      if (document.getElementById('veh-tbl')) { try{ renderVehicles(); }catch(e){} }
    }
  }).catch(function(){ _vehRollupBusy=false; });
}

function renderVehicles(){
  if (!DB.vehicles) DB.vehicles = [];
  if (typeof _ensureVehicleRollup==='function') _ensureVehicleRollup();
  var rollup = DB.vehicleRollup || null;

  var search = ((document.getElementById('veh-search')||{}).value||'').trim().toLowerCase();
  var fStatus = (document.getElementById('veh-filter')||{}).value||'';

  // New Vehicle button permission (owner/manager/back_office)
  var newBtn = document.querySelector('#page-vehicles .btn-primary');
  if (newBtn) newBtn.style.display = (typeof hasPermission==='function' && !hasPermission('wo.create')) ? '' : '';

  var list = (DB.vehicles||[]).filter(function(v){ return v && !v.deleted && v.isActive !== false; });

  if (search) list = list.filter(function(v){
    return [v.number,v.name,v.make,v.model,v.plate,v.vin,v.assignedTech,v.type].some(function(x){ return (x||'').toString().toLowerCase().includes(search); });
  });
  if (fStatus) list = list.filter(function(v){ return (v.status||'').toLowerCase()===fStatus; });

  list.sort(function(a,b){ return (a.number||a.name||'').localeCompare(b.number||b.name||'', undefined, {numeric:true, sensitivity:'base'}); });

  // Summary tiles
  var setS=function(id,val){ var el=document.getElementById(id); if(el) el.textContent=val; };
  var all=(DB.vehicles||[]).filter(function(v){ return v && !v.deleted && v.isActive!==false; });
  setS('vs-total', all.length);
  setS('vs-active', all.filter(function(v){ return (v.status||'').toLowerCase()==='active'; }).length);
  setS('vs-shop', all.filter(function(v){ return (v.status||'').toLowerCase()==='in_shop'; }).length);

  var el = document.getElementById('veh-tbl');
  if (!el) return;
  if (!list.length){
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#90a4ae"><div style="font-size:32px;margin-bottom:8px">🚚</div><div>'+(search||fStatus?'No vehicles match.':'No vehicles yet. Click + New Vehicle to add one.')+'</div></div>';
    return;
  }

  var LP = (typeof LIST_PAGE_SIZE!=='undefined') ? LIST_PAGE_SIZE : 100;
  var total=list.length, pages=Math.max(1,Math.ceil(total/LP));
  if(_vehPage>pages)_vehPage=pages; if(_vehPage<1)_vehPage=1;
  var start=(_vehPage-1)*LP, pageItems=list.slice(start,start+LP);

  var rows = pageItems.map(function(v){
    var sc=_vehStatusColor(v.status);
    var woCnt = rollup && rollup[v.id] ? rollup[v.id].cnt : (v._woct!=null?v._woct:'…');
    var title = escHtml(v.number || v.name || 'Vehicle');
    var sub = [v.year, v.make, v.model].filter(Boolean).map(escHtml).join(' ');
    if (v.type) sub = escHtml(v.type) + (sub?' · '+sub:'');
    var meta = [];
    if (v.assignedTech) meta.push('👤 '+escHtml(v.assignedTech));
    if (v.plate) meta.push('🔖 '+escHtml(v.plate));
    if (v.odometer!=null && v.odometer!=='') meta.push('⏱ '+escHtml(Number(v.odometer).toLocaleString())+' mi');
    return '<div class="cust-card">'+
      '<div><div class="cust-card-name" onclick="openVehicleProfile(\''+v.id+'\')">'+title+
        ' <span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">'+escHtml(_vehStatusLabel(v.status))+'</span></div>'+
        (sub?'<div class="cust-card-sub">'+sub+'</div>':'')+
        (meta.length?'<div class="cust-card-sub" style="margin-top:2px">'+meta.join(' &nbsp; ')+'</div>':'')+'</div>'+
      '<div style="text-align:center"><span class="cust-bubble tot" title="Work orders" onclick="openVehicleProfile(\''+v.id+'\')">🔨 '+woCnt+'</span></div>'+
      '<div class="cust-actions">'+
        '<button class="btn btn-primary btn-sm" onclick="openVehicleProfile(\''+v.id+'\')">Open</button>'+
        '<button class="btn btn-outline btn-sm" onclick="editVehicle(\''+v.id+'\')" title="Edit">✏</button>'+
        ((typeof hasPermission!=='function' || hasPermission('cust.delete')) ? '<button class="btn btn-danger btn-sm" onclick="delVehicle(\''+v.id+'\')" title="Retire">✕</button>' : '')+
      '</div>'+
    '</div>';
  }).join('');

  var pager = (typeof _listPager==='function') ? _listPager(_vehPage, pages, total, start, pageItems.length, '_vehGoPage') : '';
  el.innerHTML = '<div class="cust-col-header"><span>Vehicle</span><span style="text-align:center">Work Orders</span><span>Actions</span></div>' + rows + pager;
}

// ---- New / Edit / Save ----
function _vehFieldIds(){ return ['m-vnumber','m-vname','m-vtype','m-vmake','m-vmodel','m-vyear','m-vcolor','m-vvin','m-vplate','m-vstatus','m-vtech','m-vbase','m-vodo','m-vpdate','m-vpcost','m-vreg','m-vins','m-vnotes','m-vid']; }

function newVehicle(){
  _vehFieldIds().forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var st=document.getElementById('m-vstatus'); if(st) st.value='active';
  var t=document.getElementById('modal-vehicle-title'); if(t) t.textContent='New Vehicle';
  if (typeof openModal==='function') openModal('modal-vehicle');
}
function editVehicle(id){
  var v=(DB.vehicles||[]).find(function(x){ return x.id===id; });
  if(!v) return;
  var set=function(fid,val){ var e=document.getElementById(fid); if(e) e.value=(val==null?'':val); };
  set('m-vnumber',v.number); set('m-vname',v.name); set('m-vtype',v.type); set('m-vmake',v.make);
  set('m-vmodel',v.model); set('m-vyear',v.year); set('m-vcolor',v.color); set('m-vvin',v.vin);
  set('m-vplate',v.plate); set('m-vstatus',v.status||'active'); set('m-vtech',v.assignedTech); set('m-vbase',v.homeBase);
  set('m-vodo',v.odometer); set('m-vpdate',v.purchaseDate); set('m-vpcost',v.purchaseCost);
  set('m-vreg',v.registrationExpires); set('m-vins',v.insuranceExpires); set('m-vnotes',v.notes); set('m-vid',v.id);
  var t=document.getElementById('modal-vehicle-title'); if(t) t.textContent='Edit Vehicle';
  if (typeof openModal==='function') openModal('modal-vehicle');
}
function _buildVehicleData(id){
  var g=function(fid){ var e=document.getElementById(fid); return e?e.value.trim():''; };
  var numOrNull=function(x){ return x===''?null:x; };
  return {
    id: id, number:g('m-vnumber'), name:g('m-vname'), type:g('m-vtype'), make:g('m-vmake'), model:g('m-vmodel'),
    year: g('m-vyear')===''?null:parseInt(g('m-vyear'),10), color:g('m-vcolor'), vin:g('m-vvin'), plate:g('m-vplate'),
    status:g('m-vstatus')||'active', assignedTech:g('m-vtech'), homeBase:g('m-vbase'),
    odometer: g('m-vodo')===''?null:parseFloat(g('m-vodo').replace(/[,]/g,'')),
    purchaseDate: numOrNull(g('m-vpdate')), purchaseCost: g('m-vpcost')===''?null:parseFloat(g('m-vpcost').replace(/[$,]/g,'')),
    registrationExpires: numOrNull(g('m-vreg')), insuranceExpires: numOrNull(g('m-vins')),
    notes:g('m-vnotes'), isActive:true
  };
}
function saveVehicle(){
  var id = (document.getElementById('m-vid')||{}).value || ('veh-'+Date.now());
  var data = _buildVehicleData(id);
  if (!data.number && !data.name){ if(typeof showToast==='function') showToast('Give the vehicle a number or name','error'); return; }
  if (!DB.vehicles) DB.vehicles=[];
  var idx = DB.vehicles.findIndex(function(v){ return v.id===id; });
  var existing = idx>=0 ? DB.vehicles[idx] : null;
  data.createdAt = existing && existing.createdAt ? existing.createdAt : new Date().toISOString();
  if (idx>=0) DB.vehicles[idx]=Object.assign({}, existing, data); else DB.vehicles.push(data);
  if (typeof saveDB==='function') saveDB();
  if (typeof _pushVehicleToCloud==='function') _pushVehicleToCloud(DB.vehicles[idx>=0?idx:DB.vehicles.length-1]);
  if (typeof closeModal==='function') closeModal('modal-vehicle');
  renderVehicles();
  if (typeof showToast==='function') showToast('Vehicle saved ✓','success',2000);
}
function _pushVehicleToCloud(v){
  if (typeof _sb==='undefined' || !_sb || !v) return;
  try {
    _sb.from('assets').upsert({
      id:v.id, number:v.number||null, name:v.name||null, type:v.type||null, make:v.make||null, model:v.model||null,
      year:v.year||null, color:v.color||null, vin:v.vin||null, plate:v.plate||null, status:v.status||'active',
      assigned_tech:v.assignedTech||null, home_base:v.homeBase||null, odometer:(v.odometer===''?null:v.odometer),
      purchase_date:v.purchaseDate||null, purchase_cost:(v.purchaseCost===''?null:v.purchaseCost),
      registration_expires:v.registrationExpires||null, insurance_expires:v.insuranceExpires||null,
      notes:v.notes||null, is_active:v.isActive!==false,
      created_by:(_currentUser&&_currentUser.id)||null, updated_at:new Date().toISOString()
    }).then(function(){}).catch(function(){});
  } catch(e){}
}
function delVehicle(id){
  var v=(DB.vehicles||[]).find(function(x){ return x.id===id; });
  if(!v) return;
  if (typeof confirm==='function' && !confirm('Retire "'+(v.number||v.name||'this vehicle')+'"? It will be hidden from the fleet list.')) return;
  v.isActive=false; v.status='inactive';
  if (typeof saveDB==='function') saveDB();
  if (typeof _sb!=='undefined' && _sb) { try { _sb.from('assets').update({is_active:false, status:'inactive', updated_at:new Date().toISOString()}).eq('id',id).then(function(){}); } catch(e){} }
  renderVehicles();
  if (typeof showToast==='function') showToast('Vehicle retired','success',2000);
}

// ---- Profile overlay ----
var _vpId=null, _vpTab='overview', _vpWorkOrders=null;
function openVehicleProfile(id){
  var v=(DB.vehicles||[]).find(function(x){ return x.id===id; });
  if(!v) return;
  _vpId=id; _vpTab='overview'; _vpWorkOrders=null;
  var nm=document.getElementById('vp-name'); if(nm) nm.textContent=(v.number||v.name||'Vehicle');
  var av=document.getElementById('vp-avatar'); if(av) av.textContent='🚚';
  var mt=document.getElementById('vp-meta'); if(mt) mt.textContent=[v.year,v.make,v.model].filter(Boolean).join(' ')+(v.plate?(' · '+v.plate):'');
  var ov=document.getElementById('vehicle-profile-overlay'); if(ov){ ov.style.display='block'; document.body.style.overflow='hidden'; }
  _loadVPWorkOrders(v);
  switchVPTab('overview');
}
function closeVehicleProfile(){ var ov=document.getElementById('vehicle-profile-overlay'); if(ov) ov.style.display='none'; document.body.style.overflow=''; }
function switchVPTab(tab){
  _vpTab=tab;
  document.querySelectorAll('#vehicle-profile-overlay .cp-tab').forEach(function(t){ t.classList.remove('active'); });
  var btn=document.getElementById('vpt-'+tab); if(btn) btn.classList.add('active');
  var c=document.getElementById('vp-content'); if(!c) return;
  var v=(DB.vehicles||[]).find(function(x){ return x.id===_vpId; }); if(!v) return;
  if (tab==='overview') c.innerHTML=renderVPOverview(v);
  else if (tab==='workorders') c.innerHTML=renderVPWorkOrders();
}
function _loadVPWorkOrders(v){
  _vpWorkOrders=null;
  var forId=v.id;
  function mem(){ return (DB.workOrders||[]).filter(function(w){ return w && w.vehicleId===forId; }); }
  if (typeof fetchWorkOrdersCloud!=='function'){ _vpWorkOrders=mem(); _applyVP(forId); return; }
  fetchWorkOrdersCloud({ vehicleId: forId, limit: 1000 }).then(function(r){
    if (_vpId!==forId) return;
    var rows=(r&&r.data)||[]; var seen={}; rows.forEach(function(w){ if(w&&w.id) seen[w.id]=1; });
    mem().forEach(function(w){ if(!w.id||!seen[w.id]){ rows.push(w); if(w.id) seen[w.id]=1; } });
    _vpWorkOrders=rows; _applyVP(forId);
  }).catch(function(){ if(_vpId!==forId) return; _vpWorkOrders=mem(); _applyVP(forId); });
}
function _applyVP(forId){
  if (_vpId!==forId) return;
  var el=document.getElementById('vp-wo-count'); if(el) el.textContent='🔨 '+(_vpWorkOrders?_vpWorkOrders.length:'…');
  if (_vpTab==='overview'){ var c=document.getElementById('vp-content'); var v=(DB.vehicles||[]).find(function(x){return x.id===_vpId;}); if(c&&v) c.innerHTML=renderVPOverview(v); }
  else if (_vpTab==='workorders'){ var c2=document.getElementById('vp-content'); if(c2) c2.innerHTML=renderVPWorkOrders(); }
}
function _vpCost(){
  // sum wo_expenses (in memory) for this vehicle's work orders
  if (!_vpWorkOrders) return null;
  var ids={}; _vpWorkOrders.forEach(function(w){ if(w.id) ids[w.id]=1; });
  return (DB.woExpenses||[]).reduce(function(s,e){ return (e && ids[e.woId]) ? s+(Number(e.amount)||0) : s; }, 0);
}
function renderVPOverview(v){
  var row=function(lbl,val){ return val?('<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f0f4f8"><span style="color:#90a4ae;font-size:12px">'+lbl+'</span><span style="font-size:13px;font-weight:600">'+escHtml(String(val))+'</span></div>'):''; };
  var sc=_vehStatusColor(v.status);
  var cost=_vpCost();
  var woN=_vpWorkOrders?_vpWorkOrders.length:'…';
  var html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
  html+='<div><div class="cp-section-title">Vehicle Details</div><div style="background:#f8f9fa;border-radius:10px;padding:14px">'+
    row('Number', v.number)+row('Name', v.name)+row('Type', v.type)+
    row('Make / Model', [v.make,v.model].filter(Boolean).join(' '))+row('Year', v.year)+row('Color', v.color)+
    row('VIN', v.vin)+row('Plate', v.plate)+
    '<div style="display:flex;justify-content:space-between;padding:4px 0"><span style="color:#90a4ae;font-size:12px">Status</span><span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:1px 8px;font-size:11px;font-weight:700">'+escHtml(_vehStatusLabel(v.status))+'</span></div>'+
    '</div>'+
    '<div style="margin-top:12px;display:flex;gap:8px">'+
      '<button class="btn btn-primary btn-sm" onclick="editVehicle(\''+v.id+'\')">✏ Edit</button>'+
      '<button class="btn btn-outline btn-sm" onclick="openNewWOForVehicle(\''+v.id+'\',\''+escHtml((v.number||v.name||'').replace(/\'/g,''))+'\')">+ New Work Order</button>'+
    '</div></div>';
  html+='<div><div class="cp-section-title">Operations</div><div style="background:#f8f9fa;border-radius:10px;padding:14px">'+
    row('Assigned Tech', v.assignedTech)+row('Home Base', v.homeBase)+
    row('Odometer', (v.odometer!=null&&v.odometer!=='')?(Number(v.odometer).toLocaleString()+' mi'):'')+
    row('Purchased', v.purchaseDate)+row('Purchase Cost', (v.purchaseCost!=null&&v.purchaseCost!=='')?('$'+Number(v.purchaseCost).toLocaleString()):'')+
    row('Registration Exp', v.registrationExpires)+row('Insurance Exp', v.insuranceExpires)+
    '</div>'+
    '<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
      '<div style="text-align:center;background:#fff;border:1px solid #e0e7ef;border-radius:8px;padding:10px"><div style="font-weight:800;font-size:16px;color:#1565c0">'+woN+'</div><div style="font-size:10px;color:#90a4ae;text-transform:uppercase">Work Orders</div></div>'+
      '<div style="text-align:center;background:#fff;border:1px solid #e0e7ef;border-radius:8px;padding:10px"><div style="font-weight:800;font-size:16px;color:#2e7d32">'+(cost==null?'…':('$'+Math.round(cost).toLocaleString()))+'</div><div style="font-size:10px;color:#90a4ae;text-transform:uppercase">Parts/Expense</div></div>'+
    '</div></div>';
  html+='</div>';
  if (v.notes) html+='<div style="margin-top:14px"><div class="cp-section-title">Notes</div><div style="background:#fff8e1;border-radius:8px;padding:10px 12px;font-size:13px;color:#546e7a;white-space:pre-wrap">'+escHtml(v.notes)+'</div></div>';
  return html;
}
function renderVPWorkOrders(){
  if (_vpWorkOrders===null) return '<div style="color:#90a4ae;padding:20px;text-align:center">Loading work-order history…</div>';
  var wos=_vpWorkOrders;
  if (!wos.length) return '<div style="color:#90a4ae;padding:20px;text-align:center">No work orders for this vehicle yet.</div>';
  var sorted=wos.slice().sort(function(a,b){ return String(b.createdAt||'').localeCompare(String(a.createdAt||'')); });
  return '<div class="cp-section-title">Work Orders ('+wos.length+')</div>'+
    sorted.map(function(wo){
      var sc=(typeof _getWOStatusDef==='function')?(_getWOStatusDef(wo.status).color||'#546e7a'):'#546e7a';
      var desc=(typeof stripHtmlToText==='function')?stripHtmlToText(wo.description||''):(wo.description||'');
      var when=(wo.dateClosed||wo.dateOpened||(wo.createdAt?String(wo.createdAt).slice(0,10):''));
      return '<div class="cp-quote-row" style="cursor:pointer" onclick="closeVehicleProfile();openWorkOrder(\''+escHtml(String(wo.id||''))+'\')">'+
          '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px">#'+escHtml(String(wo.woNumber||''))+(desc?' <span style="font-weight:400;color:#546e7a">— '+escHtml(desc.substring(0,70))+'</span>':'')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(String(when||''))+(wo.serviceRep?' · '+escHtml(wo.serviceRep):'')+'</div></div>'+
          '<span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">'+escHtml(String(wo.status||''))+'</span>'+
        '</div>';
    }).join('');
}
