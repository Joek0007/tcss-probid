// TCSS ProBid V9 — Request for Quote (RFQ) Module  (r150, Phase 1: RFQ core)
// RFQ → Compare → PO. One `rfqs` table (jsonb) per the spec. This file owns the RFQ list page and the
// create/edit editor (an injected overlay, like the PO email/packing-slip dialogs). Sync map/push live
// here; the boot pull in auth.js calls _mapRFQRow. Vendor pricing / compare / convert are later phases.
// Globals used (all defined elsewhere): DB, _sb, _currentUser, escHtml, showToast, saveDB, auditLog,
// hasPermission, allocNumber, _maxNum, _poCatalogMatch (catalog lookup, reused from purchaseorders.js).

var _rfqCurrentId = null;
var _rfqItems = [];        // [{id,desc,partNum,qty,uom,woPartId}]
var _rfqVendorSel = [];    // [vendorId,...]
var RFQ_STATUSES = ['Draft','Sent','Quoting','Quoted','Awarded','Converted','Closed'];

function _rfqById(id){ return (DB.rfqs||[]).find(function(r){ return r.id===id; }); }
function _rfqCanManage(){ return (typeof hasPermission==='function') ? hasPermission('rfq.manage') : true; }
function _rfqVendorEmail(vid){ var v=(DB.vendors||[]).find(function(x){return x.id===vid;}); return v?(v.email||''):''; }
function _rfqVendorName(vid){ var v=(DB.vendors||[]).find(function(x){return x.id===vid;}); return v?(v.name||''):''; }

function _rfqStatusBadge(s){
  var map={Draft:'#78909c',Sent:'#1565c0',Quoting:'#0277bd',Quoted:'#00897b',Awarded:'#2e7d32',Converted:'#6a1b9a',Closed:'#546e7a'};
  var c=map[s]||'#78909c';
  return '<span style="display:inline-block;padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;color:#fff;background:'+c+'">'+escHtml(s||'Draft')+'</span>';
}

// ---- LIST PAGE ----
function renderRFQList(){
  var el=document.getElementById('page-rfq'); if(!el) return;
  var list=(DB.rfqs||[]).slice().sort(function(a,b){ return String(b.createdAt||'').localeCompare(String(a.createdAt||'')); });
  var openCount=list.filter(function(r){ return r.status!=='Closed' && r.status!=='Converted'; }).length;
  var awaiting=list.filter(function(r){ return r.status==='Sent' || r.status==='Quoting'; }).length;
  var canManage=_rfqCanManage();
  var rows=list.map(function(r){
    var vcount=(r.vendors||[]).length;
    var vnames=(r.vendors||[]).map(function(v){return v.name;}).filter(Boolean).slice(0,2).join(', ')+(vcount>2?' +'+(vcount-2):'');
    var itemCount=(r.items||[]).length;
    return '<tr style="border-bottom:1px solid #eef2f6;cursor:pointer" onclick="openRFQ(\''+escHtml(r.id)+'\')">'+
      '<td style="padding:10px 12px;font-weight:700;color:#1565c0">'+escHtml(r.rfqNumber||'(draft)')+'</td>'+
      '<td style="padding:10px 12px">'+escHtml(r.title||r.jobName||'—')+'<div style="font-size:11px;color:#90a4ae">'+itemCount+' item'+(itemCount===1?'':'s')+'</div></td>'+
      '<td style="padding:10px 12px;font-size:13px">'+(vcount?escHtml(vnames):'<span style="color:#b0bec5">none yet</span>')+'</td>'+
      '<td style="padding:10px 12px">'+_rfqStatusBadge(r.status)+'</td>'+
      '<td style="padding:10px 12px;font-size:12px;color:#78909c">'+escHtml(String(r.createdAt||'').split('T')[0])+'</td>'+
      '<td style="padding:10px 12px;text-align:right"><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openRFQ(\''+escHtml(r.id)+'\')">Open</button></td>'+
    '</tr>';
  }).join('');
  el.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">'+
      '<h2 style="margin:0;display:flex;align-items:center;gap:8px">📝 Request for Quote</h2>'+
      (canManage?'<button class="btn btn-primary" onclick="openNewRFQ()">+ New RFQ</button>':'')+
    '</div>'+
    '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+
      '<div style="background:#e3f2fd;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;color:#1565c0">'+openCount+' Open</div>'+
      '<div style="background:#fff3e0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;color:#e65100">'+awaiting+' Awaiting Quotes</div>'+
    '</div>'+
    (list.length
      ? '<div style="overflow-x:auto;border:1px solid #eef2f6;border-radius:10px"><table style="width:100%;border-collapse:collapse;background:#fff">'+
        '<thead><tr style="background:#f8fafc;text-align:left">'+
          '<th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#90a4ae">RFQ #</th>'+
          '<th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#90a4ae">Title / Job</th>'+
          '<th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#90a4ae">Vendors</th>'+
          '<th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#90a4ae">Status</th>'+
          '<th style="padding:10px 12px;font-size:11px;text-transform:uppercase;color:#90a4ae">Created</th>'+
          '<th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'
      : '<div style="text-align:center;padding:48px 20px;color:#90a4ae"><div style="font-size:40px;margin-bottom:10px">📝</div>'+
        'No requests for quote yet.'+(canManage?'<br><br><button class="btn btn-primary" onclick="openNewRFQ()">+ Create your first RFQ</button>':'')+'</div>');
}

// ---- EDITOR (injected overlay) ----
function openNewRFQ(prefill){
  if(!_rfqCanManage()){ showToast('You do not have permission to create RFQs','error'); return; }
  _rfqCurrentId=null;
  _rfqItems=(prefill&&prefill.items)?prefill.items.map(function(i){return Object.assign({},i);}):[];
  _rfqVendorSel=[];
  _openRFQEditor({ title:(prefill&&prefill.title)||'', needBy:'', notes:'', jobId:(prefill&&prefill.jobId)||null, woId:(prefill&&prefill.woId)||null, jobName:(prefill&&prefill.jobName)||'', status:'Draft' });
}
function openRFQ(id){
  var r=_rfqById(id); if(!r){ showToast('RFQ not found','error'); return; }
  _rfqCurrentId=id;
  _rfqItems=(r.items||[]).map(function(i){return Object.assign({},i);});
  _rfqVendorSel=(r.vendors||[]).map(function(v){return v.vendorId;});
  _openRFQEditor(r);
}

function _rfqEnsureIds(){ _rfqItems.forEach(function(it){ if(!it.id) it.id='ri-'+Date.now()+'-'+Math.random().toString(36).slice(2,6); }); }

function _openRFQEditor(r){
  _rfqEnsureIds();
  var modalId='modal-rfq';
  var ex=document.getElementById(modalId); if(ex) ex.remove();
  var isNew=!_rfqCurrentId;
  var div=document.createElement('div');
  div.className='modal-overlay'; div.id=modalId; div.style.display='flex';
  div.innerHTML=
    '<div class="modal-box" style="max-width:860px;width:96%">'+
      '<div class="modal-head"><h3>📝 '+(isNew?'New Request for Quote':('Request for Quote '+escHtml(r.rfqNumber||'')))+'</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'+
          '<div style="flex:2;min-width:220px">'+_rfqField('Title / description','rfq-title',escHtml(r.title||''),'e.g. Fiber & connectors for Eagle Landing')+'</div>'+
          '<div style="flex:1;min-width:140px">'+_rfqField('Need by','rfq-needby',escHtml(r.needBy||''),'',"date")+'</div>'+
        '</div>'+
        (r.jobName?'<div style="font-size:12px;color:#546e7a;margin-bottom:10px">🔗 Linked to: <strong>'+escHtml(r.jobName)+'</strong></div>':'')+
        // Items
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin:6px 0 4px">Items to price</div>'+
        '<div id="rfq-items-wrap"></div>'+
        '<div style="display:flex;gap:8px;margin:8px 0 16px"><button class="btn btn-outline btn-sm" onclick="addRFQItem()">+ Add Item</button>'+
          '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'rfq-catalog-pick\').focus()">+ From Catalog</button>'+
          '<input list="rfq-catalog-list" id="rfq-catalog-pick" placeholder="type a catalog item…" style="flex:1;min-width:160px;padding:7px 9px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px" onchange="addRFQFromCatalog(this)"></div>'+
        '<datalist id="rfq-catalog-list"></datalist>'+
        // Vendors
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin:6px 0 4px">Vendors to ask</div>'+
        '<div id="rfq-vendors-wrap" style="border:1px solid #eef2f6;border-radius:8px;padding:8px;max-height:180px;overflow:auto;margin-bottom:14px"></div>'+
        // Notes
        '<div style="margin-bottom:14px"><label style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;display:block;margin-bottom:4px">Internal notes (not sent)</label>'+
          '<textarea id="rfq-notes" rows="2" style="width:100%;padding:9px;border:1px solid #e0e7ef;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical">'+escHtml(r.notes||'')+'</textarea></div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">'+
          (!isNew?'<span style="margin-right:auto">'+_rfqStatusBadge(r.status)+'</span>':'')+
          (!isNew && r.status!=='Closed'?'<button class="btn btn-outline btn-sm" onclick="closeRFQ(\''+escHtml(_rfqCurrentId)+'\')">Close RFQ</button>':'')+
          '<button class="btn btn-outline" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
          '<button class="btn btn-primary" onclick="saveRFQ()">💾 Save</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
  _renderRFQItems();
  _renderRFQVendorPicker();
  _fillRFQCatalogDatalist();
}

function _rfqField(label,id,val,ph,type){
  return '<label style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;display:block;margin-bottom:4px">'+escHtml(label)+'</label>'+
    '<input type="'+(type||'text')+'" id="'+id+'" value="'+(val||'')+'" placeholder="'+escHtml(ph||'')+'" style="width:100%;padding:9px;border:1px solid #e0e7ef;border-radius:6px;font-size:14px;box-sizing:border-box">';
}

function _renderRFQItems(){
  var w=document.getElementById('rfq-items-wrap'); if(!w) return;
  if(!_rfqItems.length){ w.innerHTML='<div style="font-size:12px;color:#b0bec5;padding:8px 0">No items yet — add what you need priced.</div>'; return; }
  w.innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#90a4ae;font-size:10px;text-transform:uppercase">'+
    '<th style="padding:3px 6px">Description</th><th style="padding:3px 6px;width:120px">Part #</th><th style="padding:3px 6px;width:70px">Qty</th><th style="padding:3px 6px;width:70px">Unit</th><th style="width:30px"></th></tr></thead><tbody>'+
    _rfqItems.map(function(it,idx){
      return '<tr>'+
        '<td style="padding:2px 4px"><input value="'+escHtml(it.desc||'')+'" oninput="_rfqSet('+idx+',\'desc\',this.value)" list="rfq-catalog-list" onchange="rfqCatalogFill('+idx+',this.value)" style="width:100%;padding:6px;border:1px solid #e0e7ef;border-radius:5px;font-size:13px"></td>'+
        '<td style="padding:2px 4px"><input value="'+escHtml(it.partNum||'')+'" oninput="_rfqSet('+idx+',\'partNum\',this.value)" style="width:100%;padding:6px;border:1px solid #e0e7ef;border-radius:5px;font-size:13px"></td>'+
        '<td style="padding:2px 4px"><input type="number" min="0" step="any" value="'+(it.qty!=null?it.qty:1)+'" oninput="_rfqSet('+idx+',\'qty\',this.value)" style="width:100%;padding:6px;border:1px solid #e0e7ef;border-radius:5px;font-size:13px"></td>'+
        '<td style="padding:2px 4px"><input value="'+escHtml(it.uom||'')+'" placeholder="ea" oninput="_rfqSet('+idx+',\'uom\',this.value)" style="width:100%;padding:6px;border:1px solid #e0e7ef;border-radius:5px;font-size:13px"></td>'+
        '<td style="padding:2px 4px;text-align:center"><button class="btn btn-danger btn-sm" title="Remove" onclick="removeRFQItem('+idx+')">✕</button></td>'+
      '</tr>';
    }).join('')+'</tbody></table>';
}
function _rfqSet(idx,field,val){ if(_rfqItems[idx]){ _rfqItems[idx][field]=(field==='qty')?(parseFloat(val)||0):val; } }
function addRFQItem(){ _rfqItems.push({ id:'ri-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), desc:'', partNum:'', qty:1, uom:'' }); _renderRFQItems(); }
function removeRFQItem(idx){ _rfqItems.splice(idx,1); _renderRFQItems(); }

// Catalog type-ahead — reuse the PO catalog matcher (reads DB.catalog)
function _fillRFQCatalogDatalist(){
  var dl=document.getElementById('rfq-catalog-list'); if(!dl) return;
  var cat=(DB.catalog||[]).slice(0,600);
  dl.innerHTML=cat.map(function(c){ var d=(c.desc||c.name||c.item||''); return d?'<option value="'+escHtml(d)+'">':''; }).join('');
}
function rfqCatalogFill(idx,val){
  if(typeof _poCatalogMatch!=='function' || !_rfqItems[idx]) return;
  var m=_poCatalogMatch(val);
  if(m){ if(!_rfqItems[idx].partNum && m.partNum) _rfqItems[idx].partNum=m.partNum; _renderRFQItems(); }
}
function addRFQFromCatalog(input){
  var val=(input.value||'').trim(); if(!val) return;
  var m=(typeof _poCatalogMatch==='function')?_poCatalogMatch(val):null;
  _rfqItems.push({ id:'ri-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), desc:(m&&m.desc)||val, partNum:(m&&m.partNum)||'', qty:1, uom:'' });
  input.value='';
  _renderRFQItems();
}

function _renderRFQVendorPicker(){
  var w=document.getElementById('rfq-vendors-wrap'); if(!w) return;
  var vendors=(DB.vendors||[]).slice().sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });
  if(!vendors.length){ w.innerHTML='<div style="font-size:12px;color:#c62828">No vendors on file — add vendors first.</div>'; return; }
  w.innerHTML=vendors.map(function(v){
    var checked=_rfqVendorSel.indexOf(v.id)>=0;
    var noEmail=!(v.email&&v.email.trim());
    return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;border-bottom:1px solid #f4f7fa">'+
      '<input type="checkbox" '+(checked?'checked':'')+' onchange="_rfqToggleVendor(\''+escHtml(v.id)+'\',this.checked)" style="width:15px;height:15px">'+
      '<span style="font-weight:600">'+escHtml(v.name||'(unnamed)')+'</span>'+
      (noEmail?'<span style="font-size:11px;color:#c62828">⚠ no email — can’t send</span>':'<span style="font-size:11px;color:#90a4ae">'+escHtml(v.email)+'</span>')+
    '</label>';
  }).join('');
}
function _rfqToggleVendor(vid,on){ var i=_rfqVendorSel.indexOf(vid); if(on&&i<0)_rfqVendorSel.push(vid); if(!on&&i>=0)_rfqVendorSel.splice(i,1); }

// ---- SAVE ----
async function saveRFQ(){
  if(!_rfqCanManage()){ showToast('You do not have permission','error'); return; }
  function gv(id){ var el=document.getElementById(id); return el?el.value.trim():''; }
  var title=gv('rfq-title');
  _rfqItems=_rfqItems.filter(function(it){ return (it.desc||'').trim() || (it.partNum||'').trim(); });
  if(!_rfqItems.length){ showToast('Add at least one item to price','error'); return; }
  _rfqEnsureIds();
  var isNew=!_rfqCurrentId;
  var id=_rfqCurrentId||('rfq-'+Date.now()+'-'+Math.random().toString(36).slice(2,6));
  var prior=isNew?null:_rfqById(id);
  var rfqNumber;
  if(isNew){
    var floor=_maxNum(DB.rfqs, function(r){ return r.rfqNumber; }, /RFQ-(\d+)/);
    var n=await allocNumber('rfq', floor);
    rfqNumber='RFQ-'+n;
  } else { rfqNumber=(prior&&prior.rfqNumber)||'RFQ-?'; }
  // snapshot selected vendors (name+email at send-time captured in P2; store identity now)
  var priorVendors=(prior&&prior.vendors)||[];
  var vendors=_rfqVendorSel.map(function(vid){
    var existing=priorVendors.find(function(pv){return pv.vendorId===vid;});
    return existing || { vendorId:vid, name:_rfqVendorName(vid), email:_rfqVendorEmail(vid), status:'invited', sentAt:null };
  });
  var rfq={
    id:id, rfqNumber:rfqNumber, title:title,
    jobId:(prior&&prior.jobId)||null, woId:(prior&&prior.woId)||null, jobName:(prior&&prior.jobName)||'',
    status:(prior&&prior.status)||'Draft',
    needBy:gv('rfq-needby')||null, notes:gv('rfq-notes'),
    items:_rfqItems.map(function(i){return Object.assign({},i);}),
    vendors:vendors,
    prices:(prior&&prior.prices)||{},
    lineAward:(prior&&prior.lineAward)||{},
    awardVendorId:(prior&&prior.awardVendorId)||null,
    convertedPoIds:(prior&&prior.convertedPoIds)||[],
    createdBy:isNew?((_currentUser&&_currentUser.id)||null):(prior&&prior.createdBy),
    createdByName:isNew?((_currentUser&&_currentUser.full_name)||'Unknown'):(prior&&prior.createdByName),
    createdAt:isNew?new Date().toISOString():(prior&&prior.createdAt),
    updatedAt:new Date().toISOString()
  };
  if(!DB.rfqs) DB.rfqs=[];
  if(isNew){ DB.rfqs.unshift(rfq); _rfqCurrentId=id; }
  else { var idx=DB.rfqs.findIndex(function(r){return r.id===id;}); if(idx>=0)DB.rfqs[idx]=rfq; else DB.rfqs.unshift(rfq); }
  _pushRFQToCloud(rfq);
  saveDB();
  if(typeof auditLog==='function') auditLog('rfq_'+(isNew?'create':'update'),'rfq',id,{note:rfqNumber+' — '+(title||(_rfqItems.length+' items'))+', '+vendors.length+' vendor(s)'});
  renderRFQList();
  var m=document.getElementById('modal-rfq'); if(m) m.remove();
  showToast('RFQ '+rfqNumber+' saved ✓','success',3500);
}

async function closeRFQ(id){
  var r=_rfqById(id); if(!r) return;
  if(!confirm('Close RFQ '+(r.rfqNumber||'')+'? It will drop off the open list.')) return;
  r.status='Closed'; r.updatedAt=new Date().toISOString();
  _pushRFQToCloud(r); saveDB();
  if(typeof auditLog==='function') auditLog('rfq_close','rfq',id,{note:(r.rfqNumber||'')+' closed'});
  renderRFQList();
  var m=document.getElementById('modal-rfq'); if(m) m.remove();
  showToast('RFQ '+(r.rfqNumber||'')+' closed','info');
}

// ---- SYNC ----
function _mapRFQRow(r){
  return {
    id:r.id, rfqNumber:r.rfq_number, title:r.title, jobId:r.job_id, woId:r.wo_id, jobName:r.job_name||'',
    status:r.status||'Draft', needBy:r.need_by, notes:r.notes,
    items:Array.isArray(r.items)?r.items:[], vendors:Array.isArray(r.vendors)?r.vendors:[],
    prices:r.prices||{}, lineAward:r.line_award||{}, awardVendorId:r.award_vendor_id,
    convertedPoIds:Array.isArray(r.converted_po_ids)?r.converted_po_ids:[],
    createdBy:r.created_by, createdByName:r.created_by_name, createdAt:r.created_at, updatedAt:r.updated_at,
    _synced:true
  };
}
async function _pushRFQToCloud(rfq){
  if(!_sb||!_currentUser) return;
  try{
    var { error } = await _sb.from('rfqs').upsert({
      id:rfq.id, rfq_number:rfq.rfqNumber||null, title:rfq.title||null,
      job_id:rfq.jobId||null, wo_id:rfq.woId||null, status:rfq.status||'Draft',
      need_by:rfq.needBy||null, notes:rfq.notes||null,
      items:rfq.items||[], vendors:rfq.vendors||[], prices:rfq.prices||{},
      line_award:rfq.lineAward||{}, award_vendor_id:rfq.awardVendorId||null,
      converted_po_ids:rfq.convertedPoIds||[],
      created_by:rfq.createdBy||null, created_by_name:rfq.createdByName||null,
      created_at:rfq.createdAt||new Date().toISOString(), updated_at:rfq.updatedAt||new Date().toISOString()
    });
    if(error){ console.warn('[RFQ push]',error.message); }
    else { rfq._synced=true; }
  }catch(e){ console.warn('[RFQ push]',e&&e.message); }
}

// ---- ENTRY: from a Work Order's parts ----
function createRFQFromWOParts(woId){
  if(!_rfqCanManage()){ showToast('You do not have permission to create RFQs','error'); return; }
  var wo=(DB.workOrders||[]).find(function(w){return w.id===woId;})||{};
  var parts=(DB.woParts||[]).filter(function(p){ return p.woId===woId && p.status!=='received'; });
  if(!parts.length){ showToast('No parts on this work order to request pricing for','info'); return; }
  var items=parts.map(function(p){ return { id:'ri-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), desc:p.name||'', partNum:p.partNum||'', qty:parseFloat(p.qty||1), uom:'', woPartId:p.id }; });
  var jobName=wo.customerName||wo.jobName||wo.title||('WO '+(wo.woNumber||''));
  openNewRFQ({ title:('Parts for '+jobName), items:items, woId:woId, jobId:wo.jobId||null, jobName:jobName });
}

window.renderRFQList=renderRFQList;
window.openNewRFQ=openNewRFQ;
window.openRFQ=openRFQ;
window.addRFQItem=addRFQItem;
window.removeRFQItem=removeRFQItem;
window._rfqSet=_rfqSet;
window.rfqCatalogFill=rfqCatalogFill;
window.addRFQFromCatalog=addRFQFromCatalog;
window._rfqToggleVendor=_rfqToggleVendor;
window.saveRFQ=saveRFQ;
window.closeRFQ=closeRFQ;
window._mapRFQRow=_mapRFQRow;
window._pushRFQToCloud=_pushRFQToCloud;
window.createRFQFromWOParts=createRFQFromWOParts;
