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
  if (typeof _ensureVehicleIssueRollup==='function') _ensureVehicleIssueRollup();
  var rollup = DB.vehicleRollup || null;
  var issR = DB.vehicleIssueRollup || {};

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
  // Open reported-issue counts (nav badge + summary tile)
  var totalOpenIssues = Object.keys(issR).reduce(function(s,k){ return s+(+((issR[k]&&issR[k].cnt)||0)); }, 0);
  setS('vs-issues', totalOpenIssues);
  var navB = document.getElementById('veh-nav-badge');
  if (navB){ if (totalOpenIssues>0){ navB.style.display='inline-block'; navB.textContent = totalOpenIssues>99?'99+':String(totalOpenIssues); } else navB.style.display='none'; }

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
    var openIss = issR && issR[v.id] ? (+issR[v.id].cnt||0) : 0;
    var issBadge = openIss>0 ? ' <span style="background:#ffebee;color:#c62828;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700" title="Open reported issues">⚠️ '+openIss+'</span>' : '';
    return '<div class="cust-card">'+
      '<div><div class="cust-card-name" onclick="openVehicleProfile(\''+v.id+'\')">'+title+
        ' <span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">'+escHtml(_vehStatusLabel(v.status))+'</span>'+issBadge+'</div>'+
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
var _vpId=null, _vpTab='overview', _vpWorkOrders=null, _vpDocs=null, _vpIssues=null, _vpWODocs=null;
function openVehicleProfile(id){
  var v=(DB.vehicles||[]).find(function(x){ return x.id===id; });
  if(!v) return;
  _vpId=id; _vpTab='overview'; _vpWorkOrders=null; _vpDocs=null; _vpIssues=null; _vpWODocs=null;
  var nm=document.getElementById('vp-name'); if(nm) nm.textContent=(v.number||v.name||'Vehicle');
  var av=document.getElementById('vp-avatar'); if(av) av.textContent='🚚';
  var mt=document.getElementById('vp-meta'); if(mt) mt.textContent=[v.year,v.make,v.model].filter(Boolean).join(' ')+(v.plate?(' · '+v.plate):'');
  var ov=document.getElementById('vehicle-profile-overlay'); if(ov){ ov.style.display='block'; document.body.style.overflow='hidden'; }
  _loadVPWorkOrders(v);
  _loadVPIssues(v);   // populate the Issues tab badge up front
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
  else if (tab==='issues'){ c.innerHTML=renderVPIssues(); }
  else if (tab==='photos'){ if(_vpDocs===null) _loadVPDocs(v); c.innerHTML=renderVPPhotos(); }
  else if (tab==='documents'){ if(_vpDocs===null) _loadVPDocs(v); c.innerHTML=renderVPDocuments(); }
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
    // PERF: expenses for this vehicle's WOs may be outside the sync window — load them on
    // demand so the Parts/Expense cost tile is exact, then refresh the overview.
    if (typeof ensureWOExpensesForIds === 'function') {
      var _ids = rows.map(function(w){ return w && w.id; }).filter(Boolean);
      ensureWOExpensesForIds(_ids).then(function(){ if (_vpId===forId) _applyVP(forId); });
    }
  }).catch(function(){ if(_vpId!==forId) return; _vpWorkOrders=mem(); _applyVP(forId); });
}
function _applyVP(forId){
  if (_vpId!==forId) return;
  var el=document.getElementById('vp-wo-count'); if(el) el.textContent='🔨 '+(_vpWorkOrders?_vpWorkOrders.length:'…');
  if (_vpTab==='overview'){ var c=document.getElementById('vp-content'); var v=(DB.vehicles||[]).find(function(x){return x.id===_vpId;}); if(c&&v) c.innerHTML=renderVPOverview(v); }
  else if (_vpTab==='workorders'){ var c2=document.getElementById('vp-content'); if(c2) c2.innerHTML=renderVPWorkOrders(); }
  else if (_vpTab==='documents'){ var c3=document.getElementById('vp-content'); if(c3) c3.innerHTML=renderVPDocuments(); } // WO receipts appear once WOs load
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

// ============================================================
// VEHICLE ATTACHMENTS (photos + documents) & FIELD-REPORTED ISSUES
// Files live in the private `job-photos` storage bucket and are rendered with
// data-sp="<path>" so the app's signed-URL layer (core.js hydrateSignedMedia)
// serves them. Rows live in asset_documents / asset_issues.
// ============================================================

var VEH_DOC_TYPES = [['registration','Registration'],['insurance','Insurance'],['receipt','Receipt'],['purchase','Purchase'],['inspection','Inspection'],['other','Other']];
function _vehDocTypeLabel(t){ for(var i=0;i<VEH_DOC_TYPES.length;i++){ if(VEH_DOC_TYPES[i][0]===t) return VEH_DOC_TYPES[i][1]; } return t?(t.charAt(0).toUpperCase()+t.slice(1)):'Other'; }
function _vehCanManage(){ return (typeof hasPermission!=='function') || hasPermission('vehicles.manage'); }

function _mapAssetDocRow(d){ return { id:d.id, assetId:d.asset_id, name:d.name, fileName:d.file_name, fileType:d.file_type, fileSize:d.file_size, path:d.file_path, url:d.url, docType:d.doc_type||'other', uploadedBy:d.uploaded_by, uploadedAt:d.uploaded_at, deleted:!!d.deleted }; }
function _mapAssetIssueRow(r){ return { id:r.id, assetId:r.asset_id, title:r.title, description:r.description, severity:r.severity||'normal', status:r.status||'open', photoPath:r.photo_path, photoUrl:r.photo_url, reportedBy:r.reported_by, reporterName:r.reporter_name, woId:r.wo_id, acknowledgedAt:r.acknowledged_at, acknowledgedBy:r.acknowledged_by, resolvedAt:r.resolved_at, resolvedBy:r.resolved_by, resolutionNote:r.resolution_note, createdAt:r.created_at }; }

// ---- Open-issue rollup (nav badge + list badges) ----
var _vehIssRollupLoaded=false, _vehIssRollupBusy=false;
function _ensureVehicleIssueRollup(force){
  if (force){ _vehIssRollupLoaded=false; }
  if (_vehIssRollupLoaded || _vehIssRollupBusy) return;
  if (typeof _sb==='undefined' || !_sb) return;
  _vehIssRollupBusy=true;
  _sb.rpc('vehicle_open_issue_rollup').then(function(rr){
    _vehIssRollupBusy=false;
    if (rr && !rr.error && Array.isArray(rr.data)){
      var m={}; rr.data.forEach(function(x){ if(x&&x.asset_id) m[x.asset_id]={cnt:+x.cnt||0}; });
      DB.vehicleIssueRollup=m; _vehIssRollupLoaded=true;
      _updateVehNavBadge();
      if (document.getElementById('veh-tbl')) { try{ renderVehicles(); }catch(e){} }
    }
  }).catch(function(){ _vehIssRollupBusy=false; });
}
function _updateVehNavBadge(){
  var issR=DB.vehicleIssueRollup||{};
  var total=Object.keys(issR).reduce(function(s,k){ return s+(+((issR[k]&&issR[k].cnt)||0)); },0);
  var navB=document.getElementById('veh-nav-badge');
  if (navB){ if(total>0){ navB.style.display='inline-block'; navB.textContent=total>99?'99+':String(total); } else navB.style.display='none'; }
  var tile=document.getElementById('vs-issues'); if(tile) tile.textContent=total;
}
function openFirstVehicleWithIssue(){
  var issR=DB.vehicleIssueRollup||{};
  var id=Object.keys(issR).find(function(k){ return (issR[k]&&issR[k].cnt)>0; });
  if(id) openVehicleProfile(id); else if(typeof showToast==='function') showToast('No open vehicle issues 🎉','success',2000);
}

// ---- Load-on-demand: docs + issues for the open vehicle ----
function _loadVPDocs(v){
  var forId=v.id; _vpDocs=null;
  if(typeof _sb==='undefined'||!_sb){ _vpDocs=[]; return; }
  _sb.from('asset_documents').select('*').eq('asset_id',forId).eq('deleted',false).order('uploaded_at',{ascending:false}).then(function(r){
    if(_vpId!==forId) return;
    _vpDocs=((r&&r.data)||[]).map(_mapAssetDocRow);
    if(_vpTab==='photos'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPPhotos(); }
    else if(_vpTab==='documents'){ var c2=document.getElementById('vp-content'); if(c2) c2.innerHTML=renderVPDocuments(); }
  }).catch(function(){ if(_vpId===forId) _vpDocs=[]; });
}
function _loadVPIssues(v){
  var forId=v.id; _vpIssues=null;
  if(typeof _sb==='undefined'||!_sb){ _vpIssues=[]; return; }
  _sb.from('asset_issues').select('*').eq('asset_id',forId).order('created_at',{ascending:false}).then(function(r){
    if(_vpId!==forId) return;
    _vpIssues=((r&&r.data)||[]).map(_mapAssetIssueRow);
    _applyVPIssueBadge();
    if(_vpTab==='issues'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPIssues(); }
  }).catch(function(){ if(_vpId===forId) _vpIssues=[]; });
}
function _applyVPIssueBadge(){
  var b=document.getElementById('vp-issue-badge'); if(!b) return;
  var open=(_vpIssues||[]).filter(function(i){ return i.status!=='resolved'; }).length;
  if(open>0){ b.style.display='inline-block'; b.textContent=String(open); } else b.style.display='none';
}

// ---- Upload helper (mirrors uploadWODocument) ----
async function uploadAssetDocument(file, assetId, name, docType){
  if(!file||!assetId) return null;
  if(typeof _sb==='undefined'||!_sb||!_currentUser){ showToast('Not logged in','error'); return null; }
  docType=docType||'other';
  file=await compressImage(file);
  var safe=(file.name||'file').replace(/[^a-zA-Z0-9._-]/g,'_');
  var path='asset-docs/'+assetId+'/'+Date.now()+'-'+safe;
  try{
    var up=await _sb.storage.from('job-photos').upload(path,file,{cacheControl:'3600',upsert:false});
    if(up.error) throw up.error;
    var pu=_sb.storage.from('job-photos').getPublicUrl(path);
    var url=(pu&&pu.data)?pu.data.publicUrl:'';
    var doc={ id:'adoc-'+Date.now()+'-'+Math.random().toString(36).slice(2,5), assetId:assetId,
      name:name||file.name, fileName:file.name, fileType:file.type||'application/octet-stream',
      fileSize:file.size, path:path, url:url, docType:docType,
      uploadedBy:_currentUser.full_name, uploadedAt:new Date().toISOString(), deleted:false };
    await _sb.from('asset_documents').insert({ id:doc.id, asset_id:assetId, name:doc.name, file_name:doc.fileName,
      file_type:doc.fileType, file_size:doc.fileSize, file_path:path, url:url, doc_type:docType,
      uploaded_by:_currentUser.full_name, uploaded_at:doc.uploadedAt });
    if(_vpId===assetId){ if(!_vpDocs) _vpDocs=[]; _vpDocs.unshift(doc); }
    if(typeof auditLog==='function') auditLog('doc_uploaded','asset',assetId,{note:doc.name+' ('+docType+') uploaded by '+_currentUser.full_name});
    return doc;
  }catch(e){ console.error('[Asset doc upload]', e&&e.message); showToast('Upload failed: '+(e&&e.message||''),'error'); return null; }
}

function _vDocCard(d, canDelete){
  var isImg=(d.fileType||'').indexOf('image/')===0;
  var icon=isImg?'🖼':((d.fileType==='application/pdf')?'📄':'📎');
  var kb=d.fileSize?((d.fileSize/1024).toFixed(0)+'KB'):'';
  return '<div style="background:#fff;border:1px solid #e0e7ef;border-radius:8px;overflow:hidden">'+
    (isImg
      ? '<img data-sp="'+escHtml(d.path||'')+'" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" style="width:100%;height:110px;object-fit:cover;display:block;background:#eef2f7">'
      : '<div style="height:80px;background:#f0f4f8;display:flex;align-items:center;justify-content:center;font-size:30px">'+icon+'</div>')+
    '<div style="padding:8px 10px">'+
      '<div style="font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">'+escHtml(_vehDocTypeLabel(d.docType))+'</div>'+
      '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escHtml(d.name||'')+'">'+escHtml(d.name||'')+'</div>'+
      '<div style="font-size:10px;color:#90a4ae;margin-bottom:6px">'+escHtml(d.uploadedBy||'')+' · '+escHtml(kb)+'</div>'+
      '<div style="display:flex;gap:5px">'+
        '<a data-sp="'+escHtml(d.path||'')+'" href="#" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:4px;background:#1565c0;color:#fff;border-radius:4px;font-size:11px;font-weight:700;text-decoration:none">⬇ Open</a>'+
        (canDelete?'<button onclick="delAssetDoc(\''+d.id+'\')" style="padding:4px 8px;background:#ffebee;color:#c62828;border:none;border-radius:4px;font-size:11px;cursor:pointer">✕</button>':'')+
      '</div>'+
    '</div></div>';
}

// ---- Photos tab ----
function renderVPPhotos(){
  var canManage=_vehCanManage();
  var html='';
  if(canManage){
    html+='<div style="background:#f0f4f8;border-radius:8px;padding:12px 14px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:13px;margin-bottom:8px">📷 Add Vehicle Photo</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'+
        '<div style="flex:1;min-width:150px"><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Caption (optional)</label>'+
          '<input id="vphoto-label" placeholder="e.g. Front, Damage, Odometer..." style="width:100%;padding:7px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#1565c0">📷 Camera<input type="file" id="vphoto-cam" accept="image/*" capture="environment" style="display:none" onchange="_vDocFileSelected(this,\'vphoto-name\',\'vphoto-file\')"></label>'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#f3e5f5;border:1px solid #ce93d8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#6a1b9a">📁 Browse<input type="file" id="vphoto-file" accept="image/*" style="display:none" onchange="_vDocFileSelected(this,\'vphoto-name\',\'vphoto-cam\')"></label>'+
        '<span id="vphoto-name" style="font-size:11px;color:#2e7d32;font-style:italic;align-self:center"></span>'+
        '<button class="btn btn-primary btn-sm" onclick="submitVehiclePhoto()" style="padding:7px 14px">⬆ Upload</button>'+
      '</div></div>';
  }
  if(_vpDocs===null) return html+'<div style="color:#90a4ae;padding:20px;text-align:center">Loading photos…</div>';
  var photos=(_vpDocs||[]).filter(function(d){ return d.docType==='photo'; });
  if(!photos.length) return html+'<div style="color:#90a4ae;font-size:13px;padding:8px 0">No photos yet.'+(canManage?' Use the button above.':'')+'</div>';
  return html+'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">'+photos.map(function(d){ return _vDocCard(d, canManage); }).join('')+'</div>';
}

// ---- Documents tab (vehicle docs + surfaced WO receipts) ----
function renderVPDocuments(){
  var canManage=_vehCanManage();
  var html='';
  if(canManage){
    var opts=VEH_DOC_TYPES.map(function(t){ return '<option value="'+t[0]+'">'+t[1]+'</option>'; }).join('');
    html+='<div style="background:#f0f4f8;border-radius:8px;padding:12px 14px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:13px;margin-bottom:8px">📎 Add Document / Receipt</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'+
        '<div style="min-width:120px"><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Type</label>'+
          '<select id="vdoc-type" style="width:100%;padding:7px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box">'+opts+'</select></div>'+
        '<div style="flex:1;min-width:150px"><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Label (optional)</label>'+
          '<input id="vdoc-label" placeholder="e.g. 2026 Registration" style="width:100%;padding:7px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#1565c0">📷 Camera<input type="file" id="vdoc-cam" accept="image/*" capture="environment" style="display:none" onchange="_vDocFileSelected(this,\'vdoc-name\',\'vdoc-file\')"></label>'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#f3e5f5;border:1px solid #ce93d8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#6a1b9a">📁 Browse<input type="file" id="vdoc-file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" style="display:none" onchange="_vDocFileSelected(this,\'vdoc-name\',\'vdoc-cam\')"></label>'+
        '<span id="vdoc-name" style="font-size:11px;color:#2e7d32;font-style:italic;align-self:center"></span>'+
        '<button class="btn btn-primary btn-sm" onclick="submitVehicleDoc()" style="padding:7px 14px">⬆ Upload</button>'+
      '</div>'+
      '<div style="font-size:11px;color:#90a4ae;margin-top:6px">Photo, PDF, Word, Excel. Tap Camera on mobile.</div>'+
    '</div>';
  }
  if(_vpDocs===null){ html+='<div style="color:#90a4ae;padding:20px;text-align:center">Loading documents…</div>'; return html; }
  var docs=(_vpDocs||[]).filter(function(d){ return d.docType!=='photo'; });
  if(docs.length){
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'+docs.map(function(d){ return _vDocCard(d, canManage); }).join('')+'</div>';
  } else {
    html+='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No vehicle documents yet.</div>';
  }
  // Surface receipts/documents attached to this vehicle's work orders
  var ids={}; (_vpWorkOrders||[]).forEach(function(w){ if(w&&w.id) ids[w.id]=1; });
  var woDocs=(DB.woDocuments||[]).filter(function(d){ return d && !d.deleted && ids[d.woId]; });
  html+='<div style="border-top:1.5px solid #e0e7ef;margin:18px 0 12px"></div>';
  html+='<div style="font-size:11px;font-weight:700;color:#6a1b9a;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">🔨 From this vehicle\'s work orders</div>';
  if(woDocs.length){
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'+woDocs.map(function(d){
      var isImg=(d.fileType||'').indexOf('image/')===0;
      var icon=isImg?'🖼':((d.fileType==='application/pdf')?'📄':'📎');
      return '<div style="background:#fff;border:1px solid #e0e7ef;border-radius:8px;overflow:hidden">'+
        (isImg?'<img data-sp="'+escHtml(d.path||'')+'" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" style="width:100%;height:100px;object-fit:cover;display:block;background:#eef2f7">':'<div style="height:70px;background:#f0f4f8;display:flex;align-items:center;justify-content:center;font-size:26px">'+icon+'</div>')+
        '<div style="padding:8px 10px"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escHtml(d.name||'')+'">'+escHtml(d.name||'')+'</div>'+
        '<div style="font-size:10px;color:#90a4ae;margin-bottom:6px">'+escHtml(d.uploadedBy||'')+'</div>'+
        '<a data-sp="'+escHtml(d.path||'')+'" href="#" target="_blank" rel="noopener" style="display:block;text-align:center;padding:4px;background:#1565c0;color:#fff;border-radius:4px;font-size:11px;font-weight:700;text-decoration:none">⬇ Open</a></div></div>';
    }).join('')+'</div>';
  } else {
    html+='<div style="color:#90a4ae;font-size:13px;padding:4px 0">'+(_vpWorkOrders===null?'Loading work-order documents…':'No documents on this vehicle\'s work orders.')+'</div>';
  }
  return html;
}

function _vDocFileSelected(input, nameId, otherId){
  var nameEl=document.getElementById(nameId); if(!nameEl) return;
  if(input.files&&input.files[0]){ nameEl.textContent='✓ '+input.files[0].name; var other=document.getElementById(otherId); if(other) other.value=''; }
}
async function submitVehiclePhoto(){
  if(!_vpId){ showToast('Open a vehicle first','error'); return; }
  var cam=document.getElementById('vphoto-cam'), fil=document.getElementById('vphoto-file');
  var el=(cam&&cam.files&&cam.files[0])?cam:((fil&&fil.files&&fil.files[0])?fil:null);
  if(!el){ showToast('Choose a photo first','error'); return; }
  var label=((document.getElementById('vphoto-label')||{}).value||'').trim();
  showToast('Uploading…','info',10000);
  var doc=await uploadAssetDocument(el.files[0], _vpId, label||el.files[0].name, 'photo');
  if(doc){ showToast('Photo added ✓','success'); if(cam)cam.value=''; if(fil)fil.value=''; if(_vpTab==='photos'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPPhotos(); } }
}
async function submitVehicleDoc(){
  if(!_vpId){ showToast('Open a vehicle first','error'); return; }
  var cam=document.getElementById('vdoc-cam'), fil=document.getElementById('vdoc-file');
  var el=(cam&&cam.files&&cam.files[0])?cam:((fil&&fil.files&&fil.files[0])?fil:null);
  if(!el){ showToast('Choose a file first','error'); return; }
  var dtype=((document.getElementById('vdoc-type')||{}).value)||'other';
  var label=((document.getElementById('vdoc-label')||{}).value||'').trim();
  showToast('Uploading…','info',10000);
  var doc=await uploadAssetDocument(el.files[0], _vpId, label||el.files[0].name, dtype);
  if(doc){ showToast('Document added ✓','success'); if(cam)cam.value=''; if(fil)fil.value=''; var lb=document.getElementById('vdoc-label'); if(lb)lb.value=''; if(_vpTab==='documents'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPDocuments(); } }
}
function delAssetDoc(id){
  if(typeof confirm==='function' && !confirm('Remove this file?')) return;
  if(typeof _sb!=='undefined' && _sb){ try{ _sb.from('asset_documents').update({deleted:true}).eq('id',id).then(function(){}); }catch(e){} }
  if(_vpDocs) _vpDocs=_vpDocs.filter(function(d){ return d.id!==id; });
  if(_vpTab==='photos'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPPhotos(); }
  else if(_vpTab==='documents'){ var c2=document.getElementById('vp-content'); if(c2) c2.innerHTML=renderVPDocuments(); }
  if(typeof showToast==='function') showToast('File removed','info');
}

// ---- Issues tab (office view) ----
var VEH_SEV_COLORS={low:'#546e7a',normal:'#1565c0',high:'#e65100',urgent:'#c62828'};
var VEH_ISS_STATUS={open:['Open','#c62828'],acknowledged:['Acknowledged','#e65100'],in_progress:['In Progress','#1565c0'],resolved:['Resolved','#2e7d32']};
function renderVPIssues(){
  if(_vpIssues===null) return '<div style="color:#90a4ae;padding:20px;text-align:center">Loading issues…</div>';
  var canManage=(typeof hasPermission!=='function')||hasPermission('vehicles.issues.manage')||hasPermission('vehicles.manage');
  var issues=_vpIssues.slice().sort(function(a,b){
    var ar=a.status==='resolved'?1:0, br=b.status==='resolved'?1:0;
    if(ar!==br) return ar-br;
    return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  var head='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div class="cp-section-title" style="margin:0">Reported Issues ('+_vpIssues.filter(function(i){return i.status!=='resolved';}).length+' open)</div>'+
    '<button class="btn btn-outline btn-sm" onclick="openReportVehicleIssue(\''+_vpId+'\')">+ Report Issue</button></div>';
  if(!issues.length) return head+'<div style="color:#90a4ae;padding:20px;text-align:center">No issues reported for this vehicle. 🎉</div>';
  return head+issues.map(function(i){
    var sev=VEH_SEV_COLORS[i.severity]||'#1565c0';
    var st=VEH_ISS_STATUS[i.status]||[i.status,'#546e7a'];
    var isResolved=i.status==='resolved';
    var when=(i.createdAt?String(i.createdAt).slice(0,16).replace('T',' '):'');
    var acts='';
    if(canManage && !isResolved){
      if(i.status==='open') acts+='<button class="btn btn-outline btn-sm" onclick="ackVehicleIssue(\''+i.id+'\')">Acknowledge</button> ';
      if(!i.woId) acts+='<button class="btn btn-outline btn-sm" onclick="convertIssueToWO(\''+i.id+'\')">🔨 Convert to Work Order</button> ';
      acts+='<button class="btn btn-primary btn-sm" onclick="resolveVehicleIssue(\''+i.id+'\')">✓ Resolve</button>';
    }
    var woLink=i.woId?('<a href="#" onclick="closeVehicleProfile();openWorkOrder(\''+escHtml(i.woId)+'\');return false;" style="font-size:11px;color:#1565c0;font-weight:600">🔨 View linked work order</a>'):'';
    return '<div style="background:#fff;border:1px solid #e0e7ef;border-left:4px solid '+sev+';border-radius:8px;padding:12px 14px;margin-bottom:10px'+(isResolved?';opacity:.7':'')+'">'+
      '<div style="display:flex;gap:10px;align-items:flex-start">'+
        (i.photoPath?'<a data-sp="'+escHtml(i.photoPath)+'" href="#" target="_blank" rel="noopener" style="flex-shrink:0"><img data-sp="'+escHtml(i.photoPath)+'" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" style="width:64px;height:64px;object-fit:cover;border-radius:6px;background:#eef2f7"></a>':'')+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:3px">'+
            '<span style="background:'+sev+'20;color:'+sev+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;text-transform:uppercase">'+escHtml(i.severity)+'</span>'+
            '<span style="background:'+st[1]+'20;color:'+st[1]+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">'+escHtml(st[0])+'</span>'+
            (i.title?'<span style="font-weight:700;font-size:13px">'+escHtml(i.title)+'</span>':'')+
          '</div>'+
          '<div style="font-size:13px;color:#37474f;white-space:pre-wrap;margin-bottom:4px">'+escHtml(i.description||'')+'</div>'+
          '<div style="font-size:11px;color:#90a4ae">Reported by '+escHtml(i.reporterName||'Unknown')+' · '+escHtml(when)+
            (i.resolvedBy?(' · Resolved by '+escHtml(i.resolvedBy)+(i.resolutionNote?(' — '+escHtml(i.resolutionNote)):'')):'')+'</div>'+
          (woLink?'<div style="margin-top:4px">'+woLink+'</div>':'')+
          (acts?'<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+acts+'</div>':'')+
        '</div>'+
      '</div></div>';
  }).join('');
}

function _updateOneIssue(id, patch, localPatch){
  if(typeof _sb!=='undefined' && _sb){ try{ _sb.from('asset_issues').update(patch).eq('id',id).then(function(){}); }catch(e){} }
  if(_vpIssues){ var it=_vpIssues.find(function(x){ return x.id===id; }); if(it) Object.assign(it, localPatch||{}); }
  _applyVPIssueBadge();
  _ensureVehicleIssueRollup(true);
  if(_vpTab==='issues'){ var c=document.getElementById('vp-content'); if(c) c.innerHTML=renderVPIssues(); }
}
function ackVehicleIssue(id){
  var who=(_currentUser&&_currentUser.full_name)||'Office';
  _updateOneIssue(id, {status:'acknowledged', acknowledged_at:new Date().toISOString(), acknowledged_by:who, updated_at:new Date().toISOString()},
                      {status:'acknowledged', acknowledgedBy:who});
  if(typeof showToast==='function') showToast('Marked acknowledged','success',1500);
}
function resolveVehicleIssue(id){
  var note='';
  if(typeof prompt==='function'){ note=prompt('Resolution note (optional):','')||''; }
  var who=(_currentUser&&_currentUser.full_name)||'Office';
  _updateOneIssue(id, {status:'resolved', resolved_at:new Date().toISOString(), resolved_by:who, resolution_note:note, updated_at:new Date().toISOString()},
                      {status:'resolved', resolvedBy:who, resolutionNote:note});
  if(typeof showToast==='function') showToast('Issue resolved ✓','success',1500);
}
function convertIssueToWO(id){
  var i=(_vpIssues||[]).find(function(x){ return x.id===id; }); if(!i) return;
  var v=(DB.vehicles||[]).find(function(x){ return x.id===_vpId; });
  var label=v?(v.number||v.name||''):'';
  // mark in-progress and (soft) link is created once the WO is saved by the office
  _updateOneIssue(id, {status:'in_progress', updated_at:new Date().toISOString()}, {status:'in_progress'});
  closeVehicleProfile();
  if(typeof openNewWOForVehicle==='function'){
    openNewWOForVehicle(_vpId||i.assetId, label);
    var text=(i.title?(i.title+' — '):'')+(i.description||'');
    setTimeout(function(){
      var el=document.getElementById('wo-description');
      if(el){ if(el.contentEditable==='true') el.innerText=text; else el.value=text; }
    }, 160);
  }
  if(typeof showToast==='function') showToast('Started a work order from this issue','success',2500);
}

// ---- Field report flow ----
function openReportVehicleIssue(fixedId){
  var sel=document.getElementById('mi-vehicle'); if(!sel) return;
  var list=(DB.vehicles||[]).filter(function(v){ return v && !v.deleted && v.isActive!==false && (v.status||'').toLowerCase()!=='sold'; });
  list.sort(function(a,b){ return (a.number||a.name||'').localeCompare(b.number||b.name||'', undefined,{numeric:true}); });
  sel.innerHTML='<option value="">-- Choose a vehicle --</option>'+list.map(function(v){ return '<option value="'+escHtml(v.id)+'">'+escHtml(v.number||v.name||'Vehicle')+(v.plate?(' · '+escHtml(v.plate)):'')+'</option>'; }).join('');
  if(fixedId){ sel.value=fixedId; }
  var fx=document.getElementById('mi-asset-fixed'); if(fx) fx.value=fixedId||'';
  ['mi-title','mi-desc'].forEach(function(idf){ var e=document.getElementById(idf); if(e) e.value=''; });
  var sev=document.getElementById('mi-severity'); if(sev) sev.value='normal';
  var cam=document.getElementById('mi-photo-cam'); if(cam) cam.value='';
  var fil=document.getElementById('mi-photo-file'); if(fil) fil.value='';
  var nm=document.getElementById('mi-photo-name'); if(nm) nm.textContent='';
  if(typeof openModal==='function') openModal('modal-vehicle-issue');
}
function _miPhotoSelected(input){
  var nm=document.getElementById('mi-photo-name'); if(!nm) return;
  if(input.files&&input.files[0]){ nm.textContent='✓ '+input.files[0].name; var other=input.id==='mi-photo-cam'?document.getElementById('mi-photo-file'):document.getElementById('mi-photo-cam'); if(other) other.value=''; }
}
async function submitVehicleIssue(){
  var assetId=((document.getElementById('mi-vehicle')||{}).value)||'';
  var desc=((document.getElementById('mi-desc')||{}).value||'').trim();
  var title=((document.getElementById('mi-title')||{}).value||'').trim();
  var sev=((document.getElementById('mi-severity')||{}).value)||'normal';
  if(!assetId){ showToast('Pick a vehicle','error'); return; }
  if(!desc){ showToast('Describe the issue','error'); return; }
  if(typeof _sb==='undefined'||!_sb||!_currentUser){ showToast('Not logged in','error'); return; }
  var issueId='iss-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
  var photoPath=null, photoUrl=null;
  var cam=document.getElementById('mi-photo-cam'), fil=document.getElementById('mi-photo-file');
  var pf=(cam&&cam.files&&cam.files[0])?cam.files[0]:((fil&&fil.files&&fil.files[0])?fil.files[0]:null);
  showToast('Sending…','info',10000);
  try{
    if(pf){
      var cf=await compressImage(pf);
      var safe=(cf.name||'photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_');
      var path='asset-issues/'+issueId+'/'+Date.now()+'-'+safe;
      var up=await _sb.storage.from('job-photos').upload(path, cf, {cacheControl:'3600',upsert:false});
      if(!up.error){ photoPath=path; var pu=_sb.storage.from('job-photos').getPublicUrl(path); photoUrl=(pu&&pu.data)?pu.data.publicUrl:null; }
    }
    var row={ id:issueId, asset_id:assetId, title:title||null, description:desc, severity:sev, status:'open',
      photo_path:photoPath, photo_url:photoUrl, reported_by:(_currentUser&&_currentUser.id)||null,
      reporter_name:(_currentUser&&_currentUser.full_name)||'Unknown', created_at:new Date().toISOString(), updated_at:new Date().toISOString() };
    var ins=await _sb.from('asset_issues').insert(row);
    if(ins.error) throw ins.error;
    if(typeof auditLog==='function') auditLog('issue_reported','asset',assetId,{note:(title||desc).slice(0,80)});
    if(typeof addNotification==='function') addNotification('message','Vehicle issue reported', (row.reporter_name)+' reported an issue'+(title?': '+title:''));
    // Email the fleet manager (best-effort, server-side via Mailgun edge fn; no-op if toggle off / not configured)
    if ((DB.settings||{}).vehIssueEmailEnabled) {
      try { _sb.functions.invoke('notify-vehicle-issue', { body:{ id: issueId } }).then(function(){}).catch(function(){}); } catch(e){}
    }
    _ensureVehicleIssueRollup(true);
    if(_vpId===assetId){ _vpIssues=null; var vv=(DB.vehicles||[]).find(function(x){return x.id===assetId;}); if(vv) _loadVPIssues(vv); }
    if(typeof closeModal==='function') closeModal('modal-vehicle-issue');
    showToast('Sent to the office ✓','success',2500);
  }catch(e){ console.error('[Vehicle issue]', e&&e.message); showToast('Could not send: '+(e&&e.message||''),'error'); }
}
