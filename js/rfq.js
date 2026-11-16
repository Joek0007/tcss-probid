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
        ((r.convertedPoIds&&r.convertedPoIds.length)?'<div style="font-size:12px;color:#6a1b9a;margin-bottom:10px">🔁 Converted to: <strong>'+r.convertedPoIds.map(function(x){return escHtml(x.poNumber);}).join(', ')+'</strong></div>':'')+
        // Items
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin:6px 0 4px">Items to price</div>'+
        '<div id="rfq-items-wrap"></div>'+
        '<div style="display:flex;gap:10px;margin:8px 0 16px;align-items:center;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="addRFQItem()">+ Add Item</button>'+
          '<span style="font-size:11px;color:#90a4ae">Start typing a <strong>Description</strong> to search your catalog — picking one fills the part #. Not in the catalog? Just type it.</span></div>'+
        '<datalist id="rfq-catalog-list"></datalist>'+
        // Vendors
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin:6px 0 4px">Vendors to ask <span id="rfq-vcount" style="color:#1565c0;margin-left:6px">— none selected</span></div>'+
        '<div id="rfq-vendors-wrap" style="border:1px solid #eef2f6;border-radius:8px;padding:8px;max-height:180px;overflow:auto;margin-bottom:14px"></div>'+
        // Notes
        '<div style="margin-bottom:14px"><label style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;display:block;margin-bottom:4px">Internal notes (not sent)</label>'+
          '<textarea id="rfq-notes" rows="2" style="width:100%;padding:9px;border:1px solid #e0e7ef;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical">'+escHtml(r.notes||'')+'</textarea></div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center">'+
          (!isNew?'<span style="margin-right:auto">'+_rfqStatusBadge(r.status)+'</span>':'')+
          (!isNew?'<button class="btn btn-danger btn-sm" onclick="deleteRFQ(\''+escHtml(_rfqCurrentId)+'\')">🗑 Delete</button>':'')+
          (!isNew?'<button class="btn btn-outline btn-sm" onclick="_rfqAction(\'print\')">🖨 Print RFQ</button>':'')+
          (!isNew && r.status!=='Closed'?'<button class="btn btn-outline btn-sm" onclick="closeRFQ(\''+escHtml(_rfqCurrentId)+'\')">Close RFQ</button>':'')+
          (!isNew && r.status!=='Closed' && r.status!=='Converted'?'<button class="btn btn-success btn-sm" onclick="_rfqAction(\'send\')">📤 Send to Vendors</button>':'')+
          (!isNew && (r.vendors||[]).some(function(v){return v.respondedAt;})?'<button class="btn btn-primary btn-sm" onclick="_rfqAction(\'compare\')">📊 Compare &amp; Award</button>':'')+
          (!isNew && (r.status==='Awarded'||r.status==='Converted')?'<button class="btn btn-success btn-sm" onclick="_rfqAction(\'convert\')">🔁 Convert to PO(s)</button>':'')+
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
    return '<label data-vid="'+escHtml(v.id)+'" style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:13px;cursor:pointer;border-bottom:1px solid #f4f7fa;border-radius:5px;'+(checked?'background:#e8f5e9':'')+'">'+
      '<input type="checkbox" '+(checked?'checked':'')+' onchange="_rfqToggleVendor(\''+escHtml(v.id)+'\',this.checked)" style="width:15px;height:15px">'+
      '<span style="font-weight:600">'+escHtml(v.name||'(unnamed)')+'</span>'+
      (noEmail?'<span style="font-size:11px;color:#c62828">⚠ no email — can’t send</span>':'<span style="font-size:11px;color:#90a4ae">'+escHtml(v.email)+'</span>')+
    '</label>';
  }).join('');
  _rfqUpdateVCount();
}
// Live "N selected" readout + row highlight so a vendor pick that didn't register is obvious BEFORE
// you save/send (the silent-selection gap behind Joe's missing ADI/Graybar).
function _rfqUpdateVCount(){
  var el=document.getElementById('rfq-vcount');
  if(el){ var n=_rfqVendorSel.length; el.textContent = n ? ('— '+n+' selected') : '— none selected'; el.style.color = n ? '#2e7d32' : '#c62828'; }
}
function _rfqToggleVendor(vid,on){
  var i=_rfqVendorSel.indexOf(vid); if(on&&i<0)_rfqVendorSel.push(vid); if(!on&&i>=0)_rfqVendorSel.splice(i,1);
  var row=document.querySelector('#rfq-vendors-wrap label[data-vid="'+(window.CSS&&CSS.escape?CSS.escape(vid):vid)+'"]');
  if(row) row.style.background = on ? '#e8f5e9' : '';
  _rfqUpdateVCount();
}

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
  return id;
}

// Any editor action that works off the SAVED record (send / compare / convert / print) must first
// commit what's currently in the editor — otherwise vendor picks or item edits made since the last
// Save are silently ignored (the bug Joe hit: selected vendors, clicked Send without Save, only the
// previously-saved vendor got the RFQ). Save, then run the action against the freshly-saved id.
async function _rfqAction(kind){
  var id=await saveRFQ();
  if(!id) return;                 // validation failed (e.g. no items) — saveRFQ already toasted why
  if(kind==='send') openRFQSendDialog(id);
  else if(kind==='compare') openRFQCompare(id);
  else if(kind==='convert') convertRFQToPO(id);
  else if(kind==='print') printRFQ(id);
}
window._rfqAction=_rfqAction;

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

// ======================= PHASE 2: SEND TO VENDORS =======================
// Branded, price-less "Request for Quote" email with a blank price/lead-time column for the vendor to
// fill in their reply. Sends per-vendor (each gets their own, so replies come back per vendor to
// dispatch). Stamps vendor.sentAt, flips RFQ status→Sent (DB trigger fires the office bell).
// (r153) Generate an unguessable per-vendor token + the public vendor-quote page link.
function _rfqToken(){
  try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID().replace(/-/g,''); }catch(e){}
  return 'tk'+Date.now().toString(36)+Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,12);
}
function _rfqVendorPageBase(){
  // same folder as the app (…/tcss-probid/vendor-quote.html)
  return (location.origin+location.pathname).replace(/[^/]*$/,'')+'vendor-quote.html';
}
function _rfqVendorLink(rfqId, token){ return _rfqVendorPageBase()+'?r='+encodeURIComponent(rfqId)+'&t='+encodeURIComponent(token); }

function _rfqEmailHTML(rfq, message, vendorLink){
  var s=DB.settings||{};
  var rows=(rfq.items||[]).map(function(it){
    return '<tr>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px">'+escHtml(it.desc||'')+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">'+escHtml(it.partNum||'')+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">'+(it.qty!=null?it.qty:1)+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">'+escHtml(it.uom||'ea')+'</td>'+
    '</tr>';
  }).join('');
  var replyTo=s.poReplyTo||s.cemail||s.uemail||'';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto;padding:16px">'+
    '<div style="border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:16px">'+
      '<table width="100%"><tr>'+
        '<td style="vertical-align:top"><div style="font-size:20px;font-weight:900"><span style="color:#cc0000">TOTAL </span><span style="color:#1565c0">COMMUNICATIONS</span></div>'+
          '<div style="font-size:11px;color:#546e7a">Systems &amp; Solutions, Inc.</div>'+
          '<div style="font-size:11px;color:#546e7a;margin-top:4px;line-height:1.6">'+(s.caddr?escHtml(s.caddr)+'<br>':'')+(s.cphone?escHtml(s.cphone)+'<br>':'')+(replyTo?escHtml(replyTo):'')+'</div></td>'+
        '<td style="vertical-align:top;text-align:right"><div style="font-size:14px;font-weight:900;color:#1565c0;letter-spacing:1px">REQUEST FOR QUOTE</div><div style="font-size:14px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(rfq.rfqNumber||'')+'</div></td>'+
      '</tr></table>'+
    '</div>'+
    '<div style="font-size:12px;color:#546e7a;margin-bottom:12px">'+
      (rfq.jobName?'<strong>Project:</strong> '+escHtml(rfq.jobName)+' &nbsp;&middot;&nbsp; ':'')+
      (rfq.needBy?'<strong>Needed by:</strong> '+escHtml(rfq.needBy):'')+'</div>'+
    (message?'<div style="background:#f5f8fc;border-left:3px solid #1565c0;padding:12px 14px;border-radius:4px;font-size:14px;white-space:pre-wrap;margin-bottom:12px">'+escHtml(message)+'</div>':'')+
    (vendorLink
      ? '<div style="text-align:center;margin:8px 0 18px"><a href="'+escHtml(vendorLink)+'" style="display:inline-block;background:#1565c0;color:#fff;text-decoration:none;font-weight:800;font-size:16px;padding:14px 28px;border-radius:8px">Enter Your Quote Online →</a>'+
        '<div style="font-size:12px;color:#90a4ae;margin-top:8px">Type your prices &amp; lead times — no login needed. Or just reply to this email with your pricing.</div></div>'
      : '<p style="font-size:14px;line-height:1.5">Please provide your <strong>pricing and availability (lead time)</strong> for the following by replying to this email. Thank you.</p>')+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 6px">Items requested:</p>'+
    '<table width="100%" style="border-collapse:collapse;margin-bottom:12px">'+
      '<thead><tr style="background:#1565c0;color:#fff">'+
        '<th style="padding:8px 10px;text-align:left;font-size:11px">Description</th>'+
        '<th style="padding:8px 10px;text-align:center;font-size:11px">Part #</th>'+
        '<th style="padding:8px 10px;text-align:center;font-size:11px">Qty</th>'+
        '<th style="padding:8px 10px;text-align:center;font-size:11px">Unit</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table>'+
    '<div style="font-size:11px;color:#90a4ae;border-top:1px solid #e0e0e0;padding-top:10px">Total Communications Systems &amp; Solutions, Inc. &middot; '+escHtml(rfq.rfqNumber||'')+(replyTo?' &middot; Reply to '+escHtml(replyTo):'')+'</div>'+
  '</div>';
}

function openRFQSendDialog(rfqId){
  var r=_rfqById(rfqId); if(!r){ showToast('RFQ not found','error'); return; }
  _rfqCurrentId=rfqId;
  var withEmail=(r.vendors||[]).filter(function(v){ return v.email && v.email.trim(); });
  var noEmail=(r.vendors||[]).filter(function(v){ return !(v.email && v.email.trim()); });
  if(!withEmail.length){ showToast('None of the selected vendors has an email — add one to the vendor record, or print the RFQ.','error',6000); return; }
  var modalId='modal-rfq-send';
  var ex=document.getElementById(modalId); if(ex) ex.remove();
  var rows=withEmail.map(function(v){
    var sent=v.sentAt?(' · <span style="color:#2e7d32">sent '+escHtml(String(v.sentAt).split('T')[0])+'</span>'):'';
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:13px;cursor:pointer;border-bottom:1px solid #f4f7fa">'+
      '<input type="checkbox" class="rfq-send-v" value="'+escHtml(v.vendorId)+'" '+(v.sentAt?'':'checked')+' style="width:15px;height:15px">'+
      '<span style="font-weight:600">'+escHtml(v.name||'')+'</span><span style="color:#90a4ae">'+escHtml(v.email)+'</span>'+sent+'</label>';
  }).join('');
  var div=document.createElement('div');
  div.className='modal-overlay'; div.id=modalId; div.style.display='flex';
  div.innerHTML=
    '<div class="modal-box" style="max-width:560px">'+
      '<div class="modal-head"><h3>📤 Send RFQ '+escHtml(r.rfqNumber||'')+' to vendors</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin-bottom:4px">Send to (already-sent vendors are unchecked — check to re-send)</div>'+
        '<div style="border:1px solid #eef2f6;border-radius:8px;padding:6px 10px;margin-bottom:6px">'+rows+'</div>'+
        (noEmail.length?'<div style="font-size:11px;color:#c62828;margin-bottom:10px">⚠ No email on file (skipped): '+noEmail.map(function(v){return escHtml(v.name);}).join(', ')+'</div>':'')+
        '<div style="margin-bottom:12px"><label style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;display:block;margin-bottom:4px">Message to vendors (optional)</label>'+
          '<textarea id="rfq-send-msg" rows="3" placeholder="e.g. Please quote your best delivered price and lead time. Thanks!" style="width:100%;padding:9px;border:1px solid #e0e7ef;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical"></textarea></div>'+
        '<div style="font-size:11px;color:#90a4ae;margin-bottom:12px">Each vendor gets their own copy of RFQ '+escHtml(r.rfqNumber||'')+' ('+((r.items||[]).length)+' items). Replies go to '+escHtml((DB.settings||{}).poReplyTo||(DB.settings||{}).cemail||'the office')+'.</div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end">'+
          '<button class="btn btn-outline" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
          '<button class="btn btn-primary" onclick="_rfqSendNow(\''+modalId+'\')">📤 Send</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}

async function _rfqSendNow(modalId){
  var r=_rfqById(_rfqCurrentId); if(!r){ showToast('RFQ not found','error'); return; }
  var checks=Array.prototype.slice.call(document.querySelectorAll('#'+modalId+' .rfq-send-v:checked'));
  var vids=checks.map(function(c){ return c.value; });
  if(!vids.length){ showToast('Pick at least one vendor to send to','error'); return; }
  var msg=(document.getElementById('rfq-send-msg')||{}).value||'';
  var s=DB.settings||{};
  var btn=document.querySelector('#'+modalId+' .btn-primary'); if(btn){ btn.disabled=true; btn.textContent='Sending…'; }
  var textLines=(r.items||[]).map(function(it){ return '• '+(it.qty!=null?it.qty:1)+' '+(it.uom||'ea')+'  '+(it.desc||'')+(it.partNum?'  ['+it.partNum+']':''); }).join('\n');
  var sentOk=0, failed=[];
  for(var i=0;i<vids.length;i++){
    var vid=vids[i];
    var ven=(r.vendors||[]).find(function(v){ return v.vendorId===vid; }); if(!ven||!ven.email) continue;
    if(!ven.token) ven.token=_rfqToken();                     // (r153) per-vendor secret for the quote link
    var vlink=_rfqVendorLink(r.id, ven.token);
    var html=_rfqEmailHTML(r, msg.trim(), vlink);
    var text='Request for Quote '+r.rfqNumber+(r.jobName?(' — '+r.jobName):'')+(r.needBy?('\nNeeded by: '+r.needBy):'')+'\n\n'+(msg.trim()?msg.trim()+'\n\n':'')+'Enter your quote online: '+vlink+'\n\n(Or reply to this email with your pricing.)\n\nItems requested:\n'+textLines+'\n\nThank you.';
    if(s.mgKey){
      try{
        var mgDomain=s.mgDomain||'tcss.com';
        var fd=new FormData();
        fd.append('from', s.mgFrom || ((s.cname||'Purchasing')+' Purchasing <purchasing@'+mgDomain+'>'));
        fd.append('to', ven.email);
        var replyTo=s.poReplyTo||s.cemail||s.uemail||''; if(replyTo) fd.append('h:Reply-To', replyTo);
        fd.append('subject', 'Request for Quote '+r.rfqNumber+(r.jobName?(' — '+r.jobName):''));
        fd.append('text', text);
        fd.append('html', html);
        fd.append('o:tracking','yes'); fd.append('o:tracking-opens','yes');
        fd.append('v:probid_type','rfq'); fd.append('v:probid_id', String(r.id)); fd.append('v:probid_vendor', String(vid));
        var res=await fetch('https://api.mailgun.net/v3/'+mgDomain+'/messages',{method:'POST',headers:{'Authorization':'Basic '+btoa('api:'+s.mgKey)},body:fd});
        if(res.ok){ ven.sentAt=new Date().toISOString(); ven.status='invited'; sentOk++; }
        else { var ed=await res.json().catch(function(){return {};}); failed.push(ven.name+': '+(ed.message||('HTTP '+res.status))); }
      }catch(e){ failed.push(ven.name+': '+(e.message||e)); }
    } else {
      // no provider — stamp as sent so the office can track; office emails manually
      ven.sentAt=new Date().toISOString(); ven.status='invited'; sentOk++;
    }
  }
  if(sentOk>0){
    if(r.status==='Draft') r.status='Sent';   // status change fires the office bell via the DB trigger
    r.updatedAt=new Date().toISOString();
    _pushRFQToCloud(r); saveDB();
    if(typeof auditLog==='function') auditLog('rfq_sent','rfq',r.id,{note:r.rfqNumber+' sent to '+sentOk+' vendor(s)'});
    renderRFQList();
  }
  if(btn){ btn.disabled=false; btn.textContent='📤 Send'; }
  var m=document.getElementById(modalId); if(m) m.remove();
  if(failed.length) showToast('Sent to '+sentOk+'; '+failed.length+' failed: '+failed[0],'error',7000);
  else showToast('RFQ '+r.rfqNumber+' sent to '+sentOk+' vendor'+(sentOk===1?'':'s')+' ✓','success',4000);
}

// ======================= PHASE 4: COMPARE & AWARD + DELETE =======================
function _rfqExt(unit, qty){ var u=parseFloat(unit); if(isNaN(u)) return null; var q=parseFloat(qty); return u*(isNaN(q)?1:q); }
function _rfqVendorPrice(rfq, itemId, vendorId){ return (((rfq.prices||{})[itemId])||{})[vendorId]; }
function _rfqVendorLanded(rfq, vendorId){
  var mat=0, any=false;
  (rfq.items||[]).forEach(function(it){
    var p=_rfqVendorPrice(rfq, it.id, vendorId);
    if(p && p.unit!=null && p.unit!==''){ var e=_rfqExt(p.unit, it.qty); if(e!=null){ mat+=e; any=true; } }
  });
  var v=(rfq.vendors||[]).find(function(x){return x.vendorId===vendorId;})||{};
  var fr=parseFloat(v.freight)||0;
  return { material:mat, freight:fr, landed:mat+fr, any:any };
}
function _rfqLowestVendor(rfq, itemId, vendorIds){
  var best=null, bestV=null;
  vendorIds.forEach(function(vid){ var p=_rfqVendorPrice(rfq,itemId,vid); if(p&&p.unit!=null&&p.unit!==''){ var u=parseFloat(p.unit); if(!isNaN(u)&&(best===null||u<best)){best=u;bestV=vid;} } });
  return bestV;
}

function openRFQCompare(id){
  var r=_rfqById(id); if(!r){ showToast('RFQ not found','error'); return; }
  _rfqCurrentId=id;
  var quoted=(r.vendors||[]).filter(function(v){ return v.respondedAt || _rfqVendorLanded(r, v.vendorId).any; });
  if(!quoted.length){ showToast('No vendor has submitted pricing yet.','info'); return; }
  var vids=quoted.map(function(v){return v.vendorId;});
  var award=Object.assign({}, r.lineAward||{});
  (r.items||[]).forEach(function(it){ if(!award[it.id]){ var lo=_rfqLowestVendor(r,it.id,vids); if(lo) award[it.id]=lo; } });
  window._rfqCmp={ id:id, award:award, vids:vids };
  var canAward=(typeof hasPermission==='function')?hasPermission('rfq.award'):true;

  var head='<tr style="background:#1565c0;color:#fff"><th style="padding:8px 10px;text-align:left;font-size:11px;position:sticky;left:0;background:#1565c0">Item</th>'+
    quoted.map(function(v){ return '<th style="padding:8px 10px;text-align:center;font-size:11px">'+escHtml(v.name||'')+'</th>'; }).join('')+
    '<th style="padding:8px 10px;text-align:center;font-size:11px">Award to</th></tr>';
  var body=(r.items||[]).map(function(it){
    var lo=_rfqLowestVendor(r,it.id,vids);
    var cells=quoted.map(function(v){
      var p=_rfqVendorPrice(r,it.id,v.vendorId);
      if(!p||p.unit==null||p.unit===''){ return '<td style="padding:6px 8px;text-align:center;color:#cfd8dc;border-bottom:1px solid #eef2f6">—</td>'; }
      var ext=_rfqExt(p.unit, it.qty);
      var isLo=(v.vendorId===lo);
      return '<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eef2f6;'+(isLo?'background:#e8f5e9;font-weight:700':'')+'">'+
        '$'+parseFloat(p.unit).toFixed(2)+(ext!=null?'<div style="font-size:10px;color:#90a4ae">ext $'+ext.toFixed(2)+'</div>':'')+
        (p.lead?'<div style="font-size:10px;color:#546e7a">'+escHtml(p.lead)+'</div>':'')+
        (p.note?'<div style="font-size:10px;color:#ef6c00">'+escHtml(p.note)+'</div>':'')+'</td>';
    }).join('');
    var opts=vids.filter(function(vid){ var p=_rfqVendorPrice(r,it.id,vid); return p&&p.unit!=null&&p.unit!==''; })
      .map(function(vid){ var vn=(quoted.find(function(v){return v.vendorId===vid;})||{}).name||''; return '<option value="'+escHtml(vid)+'"'+(award[it.id]===vid?' selected':'')+'>'+escHtml(vn)+'</option>'; }).join('');
    var awardSel='<select onchange="_rfqSetAward(\''+escHtml(it.id)+'\',this.value)" style="padding:5px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px"><option value="">—</option>'+opts+'</select>';
    return '<tr><td style="padding:6px 10px;border-bottom:1px solid #eef2f6;position:sticky;left:0;background:#fff;font-size:12px"><strong>'+escHtml(it.desc||'')+'</strong><div style="color:#90a4ae">Qty '+(it.qty!=null?it.qty:1)+' '+escHtml(it.uom||'ea')+'</div></td>'+cells+'<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eef2f6">'+awardSel+'</td></tr>';
  }).join('');
  // totals
  var landedArr=quoted.map(function(v){ return _rfqVendorLanded(r,v.vendorId); });
  var bestLanded=null; landedArr.forEach(function(l){ if(l.any&&(bestLanded===null||l.landed<bestLanded)) bestLanded=l.landed; });
  var totals='<tr style="background:#f8fafc;font-weight:700"><td style="padding:8px 10px;position:sticky;left:0;background:#f8fafc;font-size:11px">Materials / Freight / <span style="color:#1565c0">LANDED</span></td>'+
    quoted.map(function(v,i){ var l=landedArr[i]; var isBest=(l.any&&l.landed===bestLanded);
      return '<td style="padding:8px 10px;text-align:center;font-size:12px;'+(isBest?'background:#e8f5e9':'')+'">$'+l.material.toFixed(2)+' / $'+l.freight.toFixed(2)+'<div style="color:#1565c0;font-size:14px">$'+l.landed.toFixed(2)+(isBest?' ✓':'')+'</div></td>'; }).join('')+
    '<td></td></tr>';

  var modalId='modal-rfq-compare';
  var ex=document.getElementById(modalId); if(ex) ex.remove();
  var div=document.createElement('div');
  div.className='modal-overlay'; div.id=modalId; div.style.display='flex';
  div.innerHTML=
    '<div class="modal-box" style="max-width:960px;width:97%">'+
      '<div class="modal-head"><h3>📊 Compare &amp; Award — '+escHtml(r.rfqNumber||'')+'</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="font-size:12px;color:#546e7a;margin-bottom:8px">Lowest unit price per line is highlighted. Pick the winning vendor per item (defaults to lowest). Award can be split across vendors.</div>'+
        '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">'+
          quoted.map(function(v){ return '<button class="btn btn-outline btn-sm" onclick="_rfqAwardAllTo(\''+escHtml(v.vendorId)+'\')">Award all → '+escHtml(v.name||'')+'</button>'; }).join('')+
          '<button class="btn btn-outline btn-sm" onclick="_rfqAwardAllLowest()">Award all → lowest</button>'+
        '</div>'+
        '<div style="overflow:auto;border:1px solid #eef2f6;border-radius:8px;max-height:60vh"><table style="width:100%;border-collapse:collapse;min-width:520px"><thead>'+head+'</thead><tbody>'+body+totals+'</tbody></table></div>'+
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'+
          '<button class="btn btn-outline" style="margin-right:auto" onclick="printRFQCompare(\''+escHtml(id)+'\')">🖨 Print Comparison</button>'+
          '<button class="btn btn-outline" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
          (canAward?'<button class="btn btn-success" onclick="saveRFQAward()">✓ Award &amp; Save</button>':'<span style="font-size:12px;color:#90a4ae;align-self:center">You can review but not award (needs the Award RFQs permission).</span>')+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}
function _rfqSetAward(itemId, vendorId){ if(window._rfqCmp){ if(vendorId) window._rfqCmp.award[itemId]=vendorId; else delete window._rfqCmp.award[itemId]; } }
function _rfqAwardAllTo(vendorId){
  var r=_rfqById(_rfqCurrentId); if(!r||!window._rfqCmp) return;
  (r.items||[]).forEach(function(it){ var p=_rfqVendorPrice(r,it.id,vendorId); if(p&&p.unit!=null&&p.unit!==''){ window._rfqCmp.award[it.id]=vendorId; } });
  openRFQCompare(_rfqCurrentId);
}
function _rfqAwardAllLowest(){
  var r=_rfqById(_rfqCurrentId); if(!r||!window._rfqCmp) return;
  (r.items||[]).forEach(function(it){ var lo=_rfqLowestVendor(r,it.id,window._rfqCmp.vids); if(lo) window._rfqCmp.award[it.id]=lo; });
  openRFQCompare(_rfqCurrentId);
}
async function saveRFQAward(){
  if(typeof hasPermission==='function' && !hasPermission('rfq.award')){ showToast('You do not have permission to award RFQs','error'); return; }
  var r=_rfqById(_rfqCurrentId); if(!r||!window._rfqCmp) return;
  r.lineAward=Object.assign({}, window._rfqCmp.award||{});
  var vals=(r.items||[]).map(function(it){return r.lineAward[it.id];}).filter(Boolean);
  r.awardVendorId=(vals.length && vals.every(function(v){return v===vals[0];}))?vals[0]:null;
  r.status='Awarded'; r.updatedAt=new Date().toISOString();
  _pushRFQToCloud(r); saveDB();
  if(typeof auditLog==='function') auditLog('rfq_award','rfq',r.id,{note:(r.rfqNumber||'')+' awarded ('+(r.awardVendorId?'single vendor':'split')+')'});
  renderRFQList();
  var m=document.getElementById('modal-rfq-compare'); if(m) m.remove();
  var m2=document.getElementById('modal-rfq'); if(m2) m2.remove();
  showToast('RFQ '+(r.rfqNumber||'')+' awarded ✓'+(r.awardVendorId?'':' (split)'),'success',4500);
}

async function deleteRFQ(id){
  var canDel=(typeof _canDeleteOfficeRecords==='function')?_canDeleteOfficeRecords():(typeof hasPermission==='function'?hasPermission('rfq.manage'):true);
  if(!canDel){ showToast('You do not have permission to delete RFQs','error'); return; }
  var r=_rfqById(id); if(!r) return;
  if(!confirm('Delete RFQ '+(r.rfqNumber||'')+' permanently? This cannot be undone.')) return;
  try{ if(_sb){ await _sb.from('wt_notifications').delete().eq('ref_id', id); await _sb.from('rfqs').delete().eq('id', id); } }
  catch(e){ console.warn('[RFQ delete]', e&&e.message); }
  if(DB.rfqs) DB.rfqs=DB.rfqs.filter(function(x){return x.id!==id;});
  saveDB();
  if(typeof auditLog==='function') auditLog('rfq_delete','rfq',id,{note:(r.rfqNumber||'')+' deleted'});
  renderRFQList();
  var m=document.getElementById('modal-rfq'); if(m) m.remove();
  showToast('RFQ '+(r.rfqNumber||'')+' deleted','info');
}

// ======================= RFQ PRINT — vendor-facing sheet =======================
// A clean, hand-fillable RFQ a vendor can print, complete (unit price / lead time / notes
// columns left blank) and fax or scan back — the paper counterpart to the online quote link.
function printRFQ(id){
  var r=_rfqById(id)||((window._rfqCmp&&window._rfqCmp.id===id)?_rfqById(window._rfqCmp.id):null);
  if(!r){ showToast('RFQ not found','error'); return; }
  var s=DB.settings||{};
  var rows=(r.items||[]).map(function(it){
    return '<tr>'+
      '<td style="padding:10px 12px;border-bottom:1px solid #e8edf2">'+escHtml(it.desc||'')+'</td>'+
      '<td style="padding:10px 12px;border-bottom:1px solid #e8edf2;text-align:center">'+escHtml(it.partNum||'')+'</td>'+
      '<td style="padding:10px 12px;border-bottom:1px solid #e8edf2;text-align:center">'+(it.qty!=null?it.qty:1)+' '+escHtml(it.uom||'ea')+'</td>'+
      '<td style="padding:10px 12px;border-bottom:1px solid #e8edf2;text-align:right;color:#cfd8dc">$ __________</td>'+
      '<td style="padding:10px 12px;border-bottom:1px solid #e8edf2;text-align:center;color:#cfd8dc">__________</td>'+
    '</tr>';
  }).join('');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RFQ '+escHtml(r.rfqNumber||'')+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1a1a1a;font-size:13px;padding:40px 48px}'+
    '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #1565c0}'+
    '.co-name .red{color:#cc0000;font-size:26px;font-weight:900}.co-name .blue{color:#1565c0;font-size:26px;font-weight:900}'+
    '.rfq-label{font-size:24px;font-weight:900;color:#1565c0;letter-spacing:2px}'+
    '.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px}'+
    '.meta-block label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#90a4ae;display:block;margin-bottom:6px;border-bottom:1px solid #e0e0e0;padding-bottom:4px}'+
    '.meta-block .val{font-size:13px;line-height:1.7}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:18px}'+
    'thead th{background:#1565c0;color:#fff;padding:9px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left}'+
    'thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(5){text-align:center}thead th:nth-child(4){text-align:right}'+
    'tbody tr:nth-child(even){background:#fafafa}'+
    '.footer{border-top:1px solid #e0e0e0;padding-top:14px;font-size:11px;color:#90a4ae;text-align:center}'+
    '@media print{@page{margin:12mm}.no-print{display:none!important}}</style></head><body>'+
    '<div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;cursor:pointer;font-weight:700">🖨 Print</button> <button onclick="window.close()" style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">Close</button></div>'+
    '<div class="header">'+
      '<div><div class="co-name"><span class="red">TOTAL </span><span class="blue">COMMUNICATIONS</span></div>'+
      '<div style="font-size:12px;color:#546e7a;margin-top:2px">Systems &amp; Solutions, Inc.</div>'+
      '<div style="font-size:11px;color:#546e7a;margin-top:4px;line-height:1.7">'+(s.caddr?escHtml(s.caddr)+'<br>':'')+(s.cphone?'📞 '+escHtml(s.cphone)+'<br>':'')+((s.poReplyTo||s.cemail)?'✉️ '+escHtml(s.poReplyTo||s.cemail):'')+'</div></div>'+
      '<div style="text-align:right"><div class="rfq-label">REQUEST FOR QUOTE</div><div style="font-size:14px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(r.rfqNumber||'')+'</div></div>'+
    '</div>'+
    (r.title?'<div style="font-size:14px;font-weight:700;color:#0d1b2a;margin-bottom:16px">Re: '+escHtml(r.title)+'</div>':'')+
    '<div class="meta-grid">'+
      '<div class="meta-block"><label>Vendor</label><div class="val">Company: ______________________________<br>Contact: ______________________________<br>Phone / Email: ______________________________</div></div>'+
      '<div class="meta-block"><label>Quote Details</label><div class="val"><strong>Date:</strong> '+escHtml(new Date().toLocaleDateString('en-US'))+(r.needBy?'<br><strong>Quote Needed By:</strong> '+escHtml(r.needBy):'')+(r.jobName?'<br><strong>Project:</strong> '+escHtml(r.jobName):'')+'</div></div>'+
    '</div>'+
    '<table><thead><tr><th style="width:42%">Description</th><th style="width:14%;text-align:center">Part #</th><th style="width:12%;text-align:center">Qty</th><th style="width:18%;text-align:right">Your Unit Price</th><th style="width:14%;text-align:center">Lead Time</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:20px;font-size:13px">'+
      '<div style="border:1px solid #e8edf2;border-radius:8px;padding:12px 14px">Freight / Shipping: $ ______________</div>'+
      '<div style="border:1px solid #e8edf2;border-radius:8px;padding:12px 14px">Minimum order / notes: ______________</div>'+
    '</div>'+
    (r.notes?'<div style="background:#f8f9fa;border-left:4px solid #1565c0;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;font-size:12px;color:#37474f"><strong>Notes:</strong> '+escHtml(r.notes)+'</div>':'')+
    '<div style="font-size:12px;color:#546e7a;margin-bottom:20px">Please return your pricing by the date above. Questions? Contact us at '+escHtml(s.poReplyTo||s.cemail||'')+'.</div>'+
    '<div class="footer">Total Communications Systems &amp; Solutions, Inc. · Request for Quote '+escHtml(r.rfqNumber||'')+'</div>'+
  '</body></html>';
  var win=window.open('','_blank','width=900,height=700');
  if(win){win.document.write(html);win.document.close();setTimeout(function(){try{win.print();}catch(e){}},500);}
}

// ======================= RFQ PRINT — comparison / award sheet =======================
// Office-internal record of the bid comparison: every quoted vendor side-by-side, lowest unit per
// line highlighted, landed totals, and the awarded vendor per line — the paper trail behind the award.
function printRFQCompare(id){
  var r=_rfqById(id); if(!r){ showToast('RFQ not found','error'); return; }
  var s=DB.settings||{};
  var quoted=(r.vendors||[]).filter(function(v){ return v.respondedAt || _rfqVendorLanded(r, v.vendorId).any; });
  if(!quoted.length){ showToast('No vendor pricing to compare yet.','info'); return; }
  var vids=quoted.map(function(v){return v.vendorId;});
  var award=Object.assign({}, r.lineAward||{});
  (window._rfqCmp&&window._rfqCmp.id===id)?(award=Object.assign({}, window._rfqCmp.award||{})):0;
  var vname=function(vid){ return (quoted.find(function(v){return v.vendorId===vid;})||{}).name||''; };
  var head='<tr><th style="width:34%">Item</th>'+
    quoted.map(function(v){ return '<th style="text-align:center">'+escHtml(v.name||'')+'</th>'; }).join('')+
    '<th style="text-align:center">Awarded To</th></tr>';
  var body=(r.items||[]).map(function(it){
    var lo=_rfqLowestVendor(r,it.id,vids);
    var cells=quoted.map(function(v){
      var p=_rfqVendorPrice(r,it.id,v.vendorId);
      if(!p||p.unit==null||p.unit===''){ return '<td style="text-align:center;color:#cfd8dc;border-bottom:1px solid #eef2f6">—</td>'; }
      var ext=_rfqExt(p.unit, it.qty); var isLo=(v.vendorId===lo);
      return '<td style="text-align:center;border-bottom:1px solid #eef2f6;'+(isLo?'background:#e8f5e9;font-weight:700':'')+'">$'+parseFloat(p.unit).toFixed(2)+
        (ext!=null?'<div style="font-size:10px;color:#90a4ae">ext $'+ext.toFixed(2)+'</div>':'')+
        (p.lead?'<div style="font-size:10px;color:#546e7a">'+escHtml(p.lead)+'</div>':'')+'</td>';
    }).join('');
    var aw=award[it.id]?('<strong style="color:#2e7d32">'+escHtml(vname(award[it.id]))+'</strong>'):'<span style="color:#cfd8dc">—</span>';
    return '<tr><td style="border-bottom:1px solid #eef2f6"><strong>'+escHtml(it.desc||'')+'</strong><div style="color:#90a4ae;font-size:11px">Qty '+(it.qty!=null?it.qty:1)+' '+escHtml(it.uom||'ea')+(it.partNum?' · '+escHtml(it.partNum):'')+'</div></td>'+cells+'<td style="text-align:center;border-bottom:1px solid #eef2f6">'+aw+'</td></tr>';
  }).join('');
  var landedArr=quoted.map(function(v){ return _rfqVendorLanded(r,v.vendorId); });
  var bestLanded=null; landedArr.forEach(function(l){ if(l.any&&(bestLanded===null||l.landed<bestLanded)) bestLanded=l.landed; });
  var totals='<tr style="background:#f1f5f9;font-weight:700"><td>Materials / Freight / LANDED</td>'+
    quoted.map(function(v,i){ var l=landedArr[i]; var isBest=(l.any&&l.landed===bestLanded);
      return '<td style="text-align:center;'+(isBest?'background:#e8f5e9':'')+'">$'+l.material.toFixed(2)+' / $'+l.freight.toFixed(2)+'<div style="color:#1565c0;font-size:14px">$'+l.landed.toFixed(2)+(isBest?' ✓':'')+'</div></td>'; }).join('')+
    '<td></td></tr>';
  // award summary
  var awVals=(r.items||[]).map(function(it){return award[it.id];}).filter(Boolean);
  var single=(awVals.length && awVals.every(function(v){return v===awVals[0];}))?awVals[0]:null;
  var uniqAw={}; awVals.forEach(function(v){uniqAw[v]=1;});
  var awSummary=awVals.length?(single?('Award: all lines → '+vname(single)):('Award: split across '+Object.keys(uniqAw).length+' vendors')):'Not yet awarded';
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>RFQ Compare '+escHtml(r.rfqNumber||'')+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1a1a1a;font-size:12px;padding:34px 40px}'+
    '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;padding-bottom:16px;border-bottom:3px solid #1565c0}'+
    '.co-name .red{color:#cc0000;font-size:22px;font-weight:900}.co-name .blue{color:#1565c0;font-size:22px;font-weight:900}'+
    '.rfq-label{font-size:20px;font-weight:900;color:#1565c0;letter-spacing:1.5px}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}'+
    'thead th{background:#1565c0;color:#fff;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.4px;text-align:left}'+
    'tbody td{padding:7px 10px}'+
    '.footer{border-top:1px solid #e0e0e0;padding-top:12px;font-size:10px;color:#90a4ae;text-align:center;margin-top:8px}'+
    '@media print{@page{margin:10mm;size:landscape}.no-print{display:none!important}}</style></head><body>'+
    '<div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;cursor:pointer;font-weight:700">🖨 Print</button> <button onclick="window.close()" style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">Close</button></div>'+
    '<div class="header">'+
      '<div><div class="co-name"><span class="red">TOTAL </span><span class="blue">COMMUNICATIONS</span></div>'+
      '<div style="font-size:11px;color:#546e7a;margin-top:2px">Systems &amp; Solutions, Inc.</div></div>'+
      '<div style="text-align:right"><div class="rfq-label">RFQ COMPARISON</div><div style="font-size:13px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(r.rfqNumber||'')+'</div>'+
      (r.title?'<div style="font-size:12px;color:#546e7a;margin-top:2px">'+escHtml(r.title)+'</div>':'')+'</div>'+
    '</div>'+
    '<div style="font-size:12px;color:#37474f;margin-bottom:12px">'+(r.jobName?'<strong>Project:</strong> '+escHtml(r.jobName)+' · ':'')+'<strong>'+escHtml(awSummary)+'</strong> · Prepared '+escHtml(new Date().toLocaleDateString('en-US'))+'</div>'+
    '<table><thead>'+head+'</thead><tbody>'+body+totals+'</tbody></table>'+
    '<div style="font-size:11px;color:#90a4ae">Lowest unit price per line and best landed total are highlighted. Landed = materials + vendor freight.</div>'+
    '<div class="footer">Total Communications Systems &amp; Solutions, Inc. · RFQ Comparison '+escHtml(r.rfqNumber||'')+'</div>'+
  '</body></html>';
  var win=window.open('','_blank','width=1000,height=720');
  if(win){win.document.write(html);win.document.close();setTimeout(function(){try{win.print();}catch(e){}},500);}
}

window.printRFQ=printRFQ;
window.printRFQCompare=printRFQCompare;
window.openRFQCompare=openRFQCompare;
window._rfqSetAward=_rfqSetAward;
window._rfqAwardAllTo=_rfqAwardAllTo;
window._rfqAwardAllLowest=_rfqAwardAllLowest;
window.saveRFQAward=saveRFQAward;
// ======================= PHASE 5: CONVERT AWARDED RFQ → PO(s) =======================
// One PO per winning vendor, carrying that vendor's awarded items + awarded unit prices + freight +
// the job/WO link + the WO-part link (so WO parts flip to "Ordered"). Lands in the normal PO flow
// (approval threshold, email, receive, invoice match). Two-way link: rfq.convertedPoIds ↔ po.rfqId.
async function _createPOFromRFQ(rfq, vendorId){
  var vendor=(rfq.vendors||[]).find(function(v){return v.vendorId===vendorId;})||{};
  var vrec=(DB.vendors||[]).find(function(x){return x.id===vendorId;})||{};
  var awardedItems=(rfq.items||[]).filter(function(it){ return (rfq.lineAward||{})[it.id]===vendorId; });
  if(!awardedItems.length) return null;
  var poItems=awardedItems.map(function(it){
    var p=(((rfq.prices||{})[it.id])||{})[vendorId]||{};
    return { id:crypto.randomUUID(), desc:it.desc||'', partNum:it.partNum||'', qtyOrdered:parseFloat(it.qty)||1, qtyReceived:0, unitCost:parseFloat(p.unit)||0, _woPartId:it.woPartId||null };
  });
  var subtotal=poItems.reduce(function(s,li){return s+li.unitCost*li.qtyOrdered;},0);
  var freight=parseFloat(vendor.freight)||0;
  var total=subtotal+freight;
  var floor=(typeof _maxNum==='function')?_maxNum(DB.purchaseOrders, function(p){return p.poNumber;}, /PO-(\d+)/):0;
  var poN=await allocNumber('po', floor);
  var poNumber='PO-'+poN;
  var id=crypto.randomUUID();
  var threshold=parseFloat((DB.settings||{}).poApprovalThreshold)||0;
  var needsApproval=threshold>0 && total>=threshold;
  var canApprove=(typeof hasPermission==='function')?hasPermission('po.approve'):true;
  var approved=true, approvedByName=null, approvedAt=null;
  if(needsApproval){
    if(canApprove){ approved=true; approvedByName=(_currentUser&&_currentUser.full_name)||'Approver'; approvedAt=new Date().toISOString(); }
    else { approved=false; }
  }
  var po={
    id:id, poNumber:poNumber, vendorId:vendorId, vendorName:vendor.name||vrec.name||'',
    jobId:rfq.jobId||null, jobName:rfq.jobName||'', woId:rfq.woId||null,
    status:(needsApproval&&!approved)?'Pending Approval':'Draft',
    date:(new Date()).toISOString().split('T')[0], dateNeeded:rfq.needBy||'',
    shipName:'',shipAddr:'',shipCity:'',shipState:'',shipZip:'',
    notes:'Converted from RFQ '+(rfq.rfqNumber||'')+(vendor.leadTime?(' · Lead: '+vendor.leadTime):'')+(vendor.minNote?(' · '+vendor.minNote):''),
    vendorInvNum:'', vendorInvAmt:0, readyToPay:false,
    subtotal:subtotal, tax:0, freight:freight, total:total,
    approvalRequired:needsApproval, approved:approved, approvedByName:approvedByName, approvedAt:approvedAt,
    rfqId:rfq.id,
    items:poItems,
    createdBy:(_currentUser&&_currentUser.id)||null, createdByName:(_currentUser&&_currentUser.full_name)||'Unknown',
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  if(!DB.purchaseOrders) DB.purchaseOrders=[];
  DB.purchaseOrders.unshift(po);
  poItems.forEach(function(li){ if(!li._woPartId) return; var wp=(DB.woParts||[]).find(function(x){return x.id===li._woPartId;}); if(wp && wp.status!=='received' && wp.status!=='partial'){ wp.status='ordered'; if(typeof _pushWOPartToCloud==='function') _pushWOPartToCloud(wp); } });
  if(typeof _pushPOToCloud==='function') await _pushPOToCloud(po);
  return { poId:id, poNumber:poNumber, vendorId:vendorId, vendorName:po.vendorName, total:total, approval:(needsApproval&&!approved) };
}

function convertRFQToPO(id){
  if(typeof hasPermission==='function' && !hasPermission('rfq.convert')){ showToast('You do not have permission to convert RFQs to POs','error'); return; }
  var r=_rfqById(id); if(!r){ showToast('RFQ not found','error'); return; }
  if(r.status!=='Awarded' && !(r.convertedPoIds&&r.convertedPoIds.length)){ showToast('Award the RFQ first (pick the winning vendors), then convert.','info',5000); return; }
  _rfqCurrentId=id;
  var byVendor={}, unawarded=[];
  (r.items||[]).forEach(function(it){ var vid=(r.lineAward||{})[it.id]; if(vid){ (byVendor[vid]=byVendor[vid]||[]).push(it); } else { unawarded.push(it); } });
  var vids=Object.keys(byVendor);
  if(!vids.length){ showToast('No awarded lines to convert.','info'); return; }
  var rows=vids.map(function(vid){
    var vendor=(r.vendors||[]).find(function(v){return v.vendorId===vid;})||{};
    var items=byVendor[vid];
    var sub=items.reduce(function(s,it){ var p=(((r.prices||{})[it.id])||{})[vid]||{}; return s+(parseFloat(p.unit)||0)*(parseFloat(it.qty)||1); },0);
    var fr=parseFloat(vendor.freight)||0;
    return '<div style="border:1px solid #eef2f6;border-radius:8px;padding:10px 12px;margin-bottom:8px">'+
      '<div style="font-weight:700">'+escHtml(vendor.name||'')+' <span style="font-size:12px;color:#90a4ae;font-weight:400">→ new PO</span></div>'+
      '<div style="font-size:12px;color:#546e7a">'+items.length+' item'+(items.length===1?'':'s')+' · materials $'+sub.toFixed(2)+(fr?' + freight $'+fr.toFixed(2):'')+' = <strong>$'+(sub+fr).toFixed(2)+'</strong></div></div>';
  }).join('');
  var modalId='modal-rfq-convert';
  var ex=document.getElementById(modalId); if(ex) ex.remove();
  var div=document.createElement('div');
  div.className='modal-overlay'; div.id=modalId; div.style.display='flex';
  div.innerHTML=
    '<div class="modal-box" style="max-width:520px">'+
      '<div class="modal-head"><h3>🔁 Convert '+escHtml(r.rfqNumber||'')+' to Purchase Orders</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="font-size:13px;color:#546e7a;margin-bottom:10px">This creates '+vids.length+' purchase order'+(vids.length===1?'':'s')+' — one per awarded vendor — carrying the awarded items, prices, and freight. Nothing is sent to the vendor; the POs land in your Purchase Orders list for review/approval and sending.</div>'+
        rows+
        (unawarded.length?'<div style="font-size:12px;color:#c62828;margin:8px 0">⚠ '+unawarded.length+' item'+(unawarded.length===1?'':'s')+' not awarded to any vendor — they will NOT be ordered: '+unawarded.map(function(it){return escHtml(it.desc||'item');}).join(', ')+'</div>':'')+
        ((r.convertedPoIds&&r.convertedPoIds.length)?'<div style="font-size:12px;color:#e65100;margin:8px 0">⚠ This RFQ was already converted once ('+r.convertedPoIds.map(function(x){return escHtml(x.poNumber);}).join(', ')+'). Converting again creates NEW additional POs.</div>':'')+
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'+
          '<button class="btn btn-outline" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
          '<button class="btn btn-success" onclick="_convertRFQNow(\''+modalId+'\')">🔁 Create '+vids.length+' PO'+(vids.length===1?'':'s')+'</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}

async function _convertRFQNow(modalId){
  if(typeof hasPermission==='function' && !hasPermission('rfq.convert')){ showToast('You do not have permission','error'); return; }
  var r=_rfqById(_rfqCurrentId); if(!r) return;
  var byVendor={};
  (r.items||[]).forEach(function(it){ var vid=(r.lineAward||{})[it.id]; if(vid){ (byVendor[vid]=byVendor[vid]||[]).push(it); } });
  var vids=Object.keys(byVendor);
  var btn=document.querySelector('#'+modalId+' .btn-success'); if(btn){ btn.disabled=true; btn.textContent='Creating…'; }
  var results=[];
  for(var i=0;i<vids.length;i++){ try{ var res=await _createPOFromRFQ(r, vids[i]); if(res) results.push(res); }catch(e){ console.warn('[RFQ convert]', e&&e.message); } }
  r.convertedPoIds=(r.convertedPoIds||[]).concat(results.map(function(x){ return { poId:x.poId, poNumber:x.poNumber, vendorId:x.vendorId, vendorName:x.vendorName }; }));
  r.status='Converted'; r.updatedAt=new Date().toISOString();
  _pushRFQToCloud(r); saveDB();
  if(typeof auditLog==='function') auditLog('rfq_convert','rfq',r.id,{note:(r.rfqNumber||'')+' → '+results.map(function(x){return x.poNumber;}).join(', ')});
  if(typeof renderPOList==='function') renderPOList();
  renderRFQList();
  var m=document.getElementById(modalId); if(m) m.remove();
  var m2=document.getElementById('modal-rfq'); if(m2) m2.remove();
  var anyApproval=results.some(function(x){return x.approval;});
  showToast('Created '+results.length+' PO'+(results.length===1?'':'s')+': '+results.map(function(x){return x.poNumber;}).join(', ')+(anyApproval?' — some need approval before sending':''),'success',6000);
}

window._createPOFromRFQ=_createPOFromRFQ;
window.convertRFQToPO=convertRFQToPO;
window._convertRFQNow=_convertRFQNow;
window.deleteRFQ=deleteRFQ;
window.openRFQSendDialog=openRFQSendDialog;
window._rfqSendNow=_rfqSendNow;
window._rfqEmailHTML=_rfqEmailHTML;
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
