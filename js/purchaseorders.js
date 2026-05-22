// ============================================================
// TCSS ProBid V9 — Purchase Orders & Vendors Module
// ============================================================

var _poItems = [];
var _poCurrentId = null;

// ---- VENDORS ----

function renderVendors() {
  if (!DB.vendors) DB.vendors = [];
  var search = ((document.getElementById('vendor-search')||{}).value||'').toLowerCase();
  var list = DB.vendors.filter(function(v){ return v.active !== false; });
  if (search) list = list.filter(function(v){
    return (v.name||'').toLowerCase().includes(search) ||
           (v.contact||'').toLowerCase().includes(search) ||
           (v.email||'').toLowerCase().includes(search);
  });

  var body = document.getElementById('vendor-list-body');
  if (!body) return;

  if (!list.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#90a4ae"><div style="font-size:32px;margin-bottom:8px">🏭</div><div>No vendors yet. Add your first vendor to get started.</div></div>';
    return;
  }

  var header = '<div style="display:grid;grid-template-columns:2fr 1.5fr 1fr 1fr 1fr auto;gap:8px;padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+
    '<div>Vendor</div><div>Contact</div><div>Phone</div><div>Terms</div><div>Account #</div><div>Actions</div></div>';

  var rows = list.map(function(v){
    return '<div style="display:grid;grid-template-columns:2fr 1.5fr 1fr 1fr 1fr auto;gap:8px;padding:12px 16px;border-bottom:1px solid #f5f7fa;align-items:center" onmouseover="this.style.background=\'#f8f9fa\'" onmouseout="this.style.background=\'\'">'+
      '<div>'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(v.name||'')+'</div>'+
        (v.email?'<div style="font-size:11px;color:#546e7a">'+escHtml(v.email)+'</div>':'')+
      '</div>'+
      '<div style="font-size:13px">'+escHtml(v.contact||'—')+'</div>'+
      '<div style="font-size:13px">'+escHtml(v.phone||'—')+'</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(v.terms||'Net 30')+'</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(v.acctNum||'—')+'</div>'+
      '<div style="display:flex;gap:4px">'+
        '<button class="btn btn-outline btn-sm" onclick="editVendor(\''+v.id+'\')">Edit</button>'+
        '<button class="btn btn-primary btn-sm" onclick="newPOForVendor(\''+v.id+'\')">+ PO</button>'+
      '</div>'+
    '</div>';
  }).join('');

  body.innerHTML = header + rows;
}

function openNewVendor() {
  ['v-name','v-contact','v-phone','v-email','v-acct','v-addr','v-city','v-state','v-zip','v-notes','v-id'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var termsEl=document.getElementById('v-terms'); if(termsEl) termsEl.value='Net 30';
  var txEl=document.getElementById('v-taxexempt'); if(txEl) txEl.checked=false;
  document.getElementById('vendor-modal-title').textContent='New Vendor';
  openModal('modal-vendor');
}

function editVendor(id) {
  var v=(DB.vendors||[]).find(function(x){return x.id===id;});
  if(!v) return;
  function sv(eid,val){var el=document.getElementById(eid);if(el)el.value=val||'';}
  sv('v-name',v.name); sv('v-contact',v.contact); sv('v-phone',v.phone);
  sv('v-email',v.email); sv('v-acct',v.acctNum); sv('v-addr',v.address);
  sv('v-city',v.city); sv('v-state',v.state); sv('v-zip',v.zip);
  sv('v-terms',v.terms||'Net 30'); sv('v-notes',v.notes); sv('v-id',v.id);
  var txEl=document.getElementById('v-taxexempt'); if(txEl) txEl.checked=!!v.taxExempt;
  document.getElementById('vendor-modal-title').textContent='Edit Vendor';
  openModal('modal-vendor');
}

function saveVendor() {
  var name=(document.getElementById('v-name')||{}).value||'';
  if(!name.trim()){showToast('Vendor name required','error');return;}
  function gv(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var id=gv('v-id');
  var data={
    id:       id||crypto.randomUUID(),
    name:     name,
    contact:  gv('v-contact'),
    phone:    gv('v-phone'),
    email:    gv('v-email'),
    acctNum:  gv('v-acct'),
    address:  gv('v-addr'),
    city:     gv('v-city'),
    state:    gv('v-state').toUpperCase(),
    zip:      gv('v-zip'),
    terms:    gv('v-terms')||'Net 30',
    notes:    gv('v-notes'),
    taxExempt:!!(document.getElementById('v-taxexempt')||{}).checked,
    active:   true,
    createdAt:id?undefined:new Date().toISOString()
  };
  if(!DB.vendors) DB.vendors=[];
  if(id){var idx=DB.vendors.findIndex(function(v){return v.id===id;});if(idx>=0)DB.vendors[idx]=data;else DB.vendors.push(data);}
  else DB.vendors.push(data);
  // Push to Supabase
  if(_sb&&_currentUser){
    _sb.from('vendors').upsert({
      id:data.id,name:data.name,contact_name:data.contact||null,phone:data.phone||null,
      email:data.email||null,account_num:data.acctNum||null,address:data.address||null,
      city:data.city||null,state:data.state||null,zip:data.zip||null,
      payment_terms:data.terms||'Net 30',tax_exempt:!!data.taxExempt,notes:data.notes||null,
      is_active:true,created_by:_currentUser.id
    }).then(function(r){if(r.error)console.warn('[Vendor Push]',r.error.message);});
  }
  saveDB();
  closeModal('modal-vendor');
  renderVendors();
  showToast('"'+name+'" saved','success');
}

// ---- PURCHASE ORDERS LIST ----

function renderPOList() {
  if(!DB.purchaseOrders) DB.purchaseOrders=[];
  var search=((document.getElementById('po-search')||{}).value||'').toLowerCase();
  var fStatus=(document.getElementById('po-filter-status')||{}).value||'';

  var list=DB.purchaseOrders.slice().sort(function(a,b){return (b.createdAt||'').localeCompare(a.createdAt||'');});
  if(search) list=list.filter(function(p){return (p.poNumber||'').toLowerCase().includes(search)||(p.vendorName||'').toLowerCase().includes(search)||(p.jobName||'').toLowerCase().includes(search);});
  if(fStatus) list=list.filter(function(p){return p.status===fStatus;});

  // Stats bar
  var statsEl=document.getElementById('po-stats-bar');
  if(statsEl){
    var all=DB.purchaseOrders;
    var open=all.filter(function(p){return ['Draft','Sent','Partially Received'].includes(p.status);}).length;
    var needsApproval=all.filter(function(p){return p.status==='Pending Approval';}).length;
    var received=all.filter(function(p){return p.status==='Received'||p.status==='Matched';}).length;
    var readyToPay=all.filter(function(p){return p.status==='Ready to Pay';}).length;
    var totalOpen=all.filter(function(p){return p.status!=='Void';}).reduce(function(s,p){return s+parseFloat(p.total||0);},0);
    statsEl.innerHTML=
      '<div style="background:#e3f2fd;color:#1565c0;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">📦 '+open+' Open</div>'+
      (needsApproval?'<div style="background:#fff3e0;color:#e65100;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;animation:pulse 1s infinite">⏳ '+needsApproval+' Pending Approval</div>':'')+
      (readyToPay?'<div style="background:#e8f5e9;color:#2e7d32;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">✅ '+readyToPay+' Ready to Pay</div>':'')+
      '<div style="background:#f5f5f5;color:#546e7a;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">💰 $'+Math.round(totalOpen).toLocaleString()+' outstanding</div>';
  }

  var body=document.getElementById('po-list-body');
  if(!body) return;

  if(!list.length){
    body.innerHTML='<div style="text-align:center;padding:40px;color:#90a4ae"><div style="font-size:32px;margin-bottom:8px">📦</div><div>No purchase orders yet.</div></div>';
    return;
  }

  var statusColors={
    'Draft':            {bg:'#f5f5f5',    color:'#546e7a'},
    'Pending Approval': {bg:'#fff3e0',    color:'#e65100'},
    'Sent':             {bg:'#e3f2fd',    color:'#1565c0'},
    'Partially Received':{bg:'#e8eaf6',  color:'#3949ab'},
    'Received':         {bg:'#e8f5e9',    color:'#2e7d32'},
    'Matched':          {bg:'#e8f5e9',    color:'#2e7d32'},
    'Ready to Pay':     {bg:'#e8f5e9',    color:'#2e7d32'},
    'Void':             {bg:'#fafafa',    color:'#bdbdbd'}
  };

  var header='<div style="display:grid;grid-template-columns:100px 1.5fr 1.5fr 1fr 100px 120px auto;gap:8px;padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+
    '<div>PO #</div><div>Vendor</div><div>Job / WO</div><div>Date</div><div>Total</div><div>Status</div><div>Actions</div></div>';

  var rows=list.map(function(po){
    var sc=statusColors[po.status]||{bg:'#f5f5f5',color:'#546e7a'};
    return '<div style="display:grid;grid-template-columns:100px 1.5fr 1.5fr 1fr 100px 120px auto;gap:8px;padding:12px 16px;border-bottom:1px solid #f5f7fa;align-items:center" onmouseover="this.style.background=\'#f8f9fa\'" onmouseout="this.style.background=\'\'">'+
      '<div style="font-weight:700;color:#1565c0;font-size:13px">'+escHtml(po.poNumber||'')+'</div>'+
      '<div>'+
        '<div style="font-weight:600;font-size:13px">'+escHtml(po.vendorName||'—')+'</div>'+
        (po.vendorInvNum?'<div style="font-size:10px;color:#546e7a">Inv: '+escHtml(po.vendorInvNum)+'</div>':'')+
      '</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(po.jobName||'—')+'</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(po.date||'—')+'</div>'+
      '<div style="font-weight:700;font-size:13px">$'+parseFloat(po.total||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</div>'+
      '<div><span style="background:'+sc.bg+';color:'+sc.color+';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700">'+escHtml(po.status||'')+'</span></div>'+
      '<div style="display:flex;gap:4px">'+
        '<button class="btn btn-outline btn-sm" onclick="openPO(\''+po.id+'\')">Open</button>'+
        '<button class="btn btn-outline btn-sm" onclick="printPOById(\''+po.id+'\')">🖨</button>'+
        ((_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office'))?'<button class="btn btn-danger btn-sm" onclick="deletePO(\''+po.id+'\')">✕</button>':'')+
      '</div>'+
    '</div>';
  }).join('');

  body.innerHTML=header+rows;
}

// ---- OPEN / NEW PO ----

function openNewPO() {
  _poCurrentId=null;
  _poItems=[];
  document.getElementById('po-modal-title').textContent='New Purchase Order';
  var today=getTodayISO();
  function sv(id,val){var el=document.getElementById(id);if(el)el.value=val||'';}
  sv('po-id',''); sv('po-date',today); sv('po-date-needed',''); sv('po-notes','');
  sv('po-vendor',''); sv('po-job',''); sv('po-job-id-hidden',''); sv('po-wo-id-hidden','');
  sv('po-vendor-inv-num',''); sv('po-vendor-inv-amt','');
  sv('po-ship-name',DB.settings.cname||'TCSS');
  sv('po-ship-addr',DB.settings.caddr||'');
  sv('po-ship-city',''); sv('po-ship-state',''); sv('po-ship-zip','');
  var statusEl=document.getElementById('po-status');if(statusEl)statusEl.value='Draft';
  var rtpEl=document.getElementById('po-ready-to-pay');if(rtpEl)rtpEl.checked=false;
  document.getElementById('po-match-result').innerHTML='';
  document.getElementById('po-match-badge').style.display='none';
  document.getElementById('po-source-chain').innerHTML='';
  _populatePOVendorSelect(null);
  _populatePOJobSelect(null);
  renderPOItems();
  refreshPOTotals();
  openModal('modal-po');
}

function newPOForVendor(vendorId) {
  openNewPO();
  var vSel=document.getElementById('po-vendor');
  if(vSel) vSel.value=vendorId;
}

function openPO(id) {
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===id;});
  if(!po) return;
  _poCurrentId=id;
  _poItems=(po.items||[]).map(function(li,i){return Object.assign({},li,{_eid:i});});
  document.getElementById('po-modal-title').textContent='Purchase Order';

  function sv(eid,val){var el=document.getElementById(eid);if(el)el.value=(val!==undefined&&val!==null)?String(val):'';}
  sv('po-id',po.id);
  sv('po-status',po.status||'Draft');
  sv('po-date',po.date||'');
  sv('po-date-needed',po.dateNeeded||'');
  sv('po-notes',po.notes||'');
  sv('po-ship-name',po.shipName||'');
  sv('po-ship-addr',po.shipAddr||'');
  sv('po-ship-city',po.shipCity||'');
  sv('po-ship-state',po.shipState||'');
  sv('po-ship-zip',po.shipZip||'');
  sv('po-vendor-inv-num',po.vendorInvNum||'');
  sv('po-vendor-inv-amt',po.vendorInvAmt||'');
  sv('po-job-id-hidden',po.jobId||'');
  sv('po-wo-id-hidden',po.woId||'');

  var rtpEl=document.getElementById('po-ready-to-pay');if(rtpEl)rtpEl.checked=!!po.readyToPay;

  _populatePOVendorSelect(po.vendorId);
  _populatePOJobSelect(po.jobId);

  // Source chain
  var chain=[];
  if(po.jobId){var j=(DB.jobs||[]).find(function(x){return x.id===po.jobId;});if(j)chain.push('Job '+escHtml(j.num||''));}
  if(po.woId){var w=(DB.workOrders||[]).find(function(x){return x.id===po.woId;});if(w)chain.push('WO '+escHtml(w.woNumber||''));}
  var chainEl=document.getElementById('po-source-chain');
  if(chainEl) chainEl.innerHTML=chain.length?'📎 Linked: '+chain.join(' → '):'';

  renderPOItems();
  refreshPOTotals();
  checkPOMatch();
  openModal('modal-po');
}

function _populatePOVendorSelect(selectedId) {
  var sel=document.getElementById('po-vendor');
  if(!sel) return;
  sel.innerHTML='<option value="">— Select Vendor —</option>'+
    (DB.vendors||[]).filter(function(v){return v.active!==false;}).map(function(v){
      return '<option value="'+escHtml(v.id)+'"'+(v.id===selectedId?' selected':'')+'>'+escHtml(v.name)+'</option>';
    }).join('');
}

function _populatePOJobSelect(selectedJobId) {
  var sel=document.getElementById('po-job');
  if(!sel) return;
  sel.innerHTML='<option value="">— Not job specific —</option>'+
    (DB.jobs||[]).filter(function(j){return j.status!=='Closed';}).map(function(j){
      return '<option value="'+escHtml(j.id)+'"'+(j.id===selectedJobId?' selected':'')+'>'+
        escHtml(j.num||'')+' — '+escHtml(j.name||'')+' ('+escHtml(j.customer||'')+')</option>';
    }).join('');
}

function onPOVendorChange(vendorId) {
  var v=(DB.vendors||[]).find(function(x){return x.id===vendorId;});
  if(!v) return;
  // Auto-fill ship-to with TCSS address if blank
  var shipName=document.getElementById('po-ship-name');
  if(shipName&&!shipName.value) shipName.value=DB.settings.cname||'TCSS';
}

function onPOJobChange(jobId) {
  var jIdEl=document.getElementById('po-job-id-hidden');if(jIdEl)jIdEl.value=jobId||'';
  var job=(DB.jobs||[]).find(function(j){return j.id===jobId;});
  if(!job) return;
  // Auto-fill ship-to with job site address
  function sv(id,val){var el=document.getElementById(id);if(el&&!el.value)el.value=val||'';}
  sv('po-ship-name',job.name||'');
  sv('po-ship-addr',job.address||'');
  // Link WO if job has one
  var wo=(DB.workOrders||[]).find(function(w){return w.jobId===jobId;});
  var woEl=document.getElementById('po-wo-id-hidden');if(woEl)woEl.value=wo?wo.id:'';
  // Update source chain
  var chain=[];
  chain.push('Job '+escHtml(job.num||''));
  if(wo) chain.push('WO '+escHtml(wo.woNumber||''));
  var chainEl=document.getElementById('po-source-chain');
  if(chainEl) chainEl.innerHTML='📎 Linked: '+chain.join(' → ');
}

// ---- PO LINE ITEMS ----

function renderPOItems() {
  var rows=document.getElementById('po-items-rows');
  if(!rows) return;
  if(!_poItems.length){
    rows.innerHTML='<div style="padding:16px;text-align:center;color:#90a4ae;font-size:13px">No items yet — click + Add Item or + From Catalog</div>';
    return;
  }
  rows.innerHTML=_poItems.map(function(li,i){
    var lineTotal=(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));
    var recColor=parseFloat(li.qtyReceived||0)>0?'#2e7d32':'#90a4ae';
    return '<div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 1fr 80px 36px;gap:4px;padding:8px 12px;border-top:1px solid #f0f4f8;align-items:center">'+
      '<input value="'+escHtml(li.desc||'')+'" oninput="updatePOItem('+i+',\'desc\',this.value)" placeholder="Description..." style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%">'+
      '<input value="'+escHtml(li.partNum||'')+'" oninput="updatePOItem('+i+',\'partNum\',this.value)" placeholder="Part #" style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%">'+
      '<input type="number" value="'+(li.qtyOrdered||1)+'" min="0.01" step="0.01" oninput="updatePOItem('+i+',\'qtyOrdered\',this.value)" style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;text-align:center">'+
      '<input type="number" value="'+(li.qtyReceived||0)+'" min="0" step="0.01" oninput="updatePOItem('+i+',\'qtyReceived\',this.value)" style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;text-align:center;color:'+recColor+'">'+
      '<input type="number" value="'+parseFloat(li.unitCost||0).toFixed(2)+'" min="0" step="0.01" oninput="updatePOItem('+i+',\'unitCost\',this.value)" style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;text-align:right">'+
      '<div class="po-line-total" style="text-align:right;font-size:12px;font-weight:700;color:#1565c0">$'+lineTotal.toFixed(2)+'</div>'+
      '<button onclick="removePOItem('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:18px;padding:0 4px;line-height:1">×</button>'+
    '</div>';
  }).join('');
}

function updatePOItem(idx,field,val) {
  if(!_poItems[idx]) return;
  _poItems[idx][field]=field==='qtyOrdered'||field==='qtyReceived'||field==='unitCost'?parseFloat(val)||0:val;
  var lineTotals=document.querySelectorAll('#po-items-rows .po-line-total');
  if(lineTotals[idx]){
    var lt=(parseFloat(_poItems[idx].unitCost||0))*(parseFloat(_poItems[idx].qtyOrdered||1));
    lineTotals[idx].textContent='$'+lt.toFixed(2);
  }
  refreshPOTotals();
  checkReceivingStatus();
}

function removePOItem(idx) {
  _poItems.splice(idx,1);
  renderPOItems();
  refreshPOTotals();
}

function addPOLineItem() {
  _poItems.push({_eid:_poItems.length,desc:'',partNum:'',qtyOrdered:1,qtyReceived:0,unitCost:0});
  renderPOItems();
  refreshPOTotals();
}

function addPOFromCatalog() {
  var name=prompt('Enter part name to search catalog:','');
  if(!name) return;
  var item=(DB.catalog||[]).find(function(c){return (c.name||c.desc||'').toLowerCase().includes(name.toLowerCase());});
  if(item){
    _poItems.push({_eid:_poItems.length,desc:item.name||item.desc||'',partNum:'',qtyOrdered:1,qtyReceived:0,unitCost:parseFloat(item.mc||0)});
    renderPOItems();
    refreshPOTotals();
    showToast('Added: '+escHtml(item.name||item.desc||''),'success');
  } else {
    if(confirm('No exact match found for "'+name+'". Add as new item?')){
      _poItems.push({_eid:_poItems.length,desc:name,partNum:'',qtyOrdered:1,qtyReceived:0,unitCost:0});
      renderPOItems();
      refreshPOTotals();
    }
  }
}

function refreshPOTotals() {
  var subtotal=_poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0);
  var stEl=document.getElementById('po-subtotal-display');if(stEl)stEl.textContent='$'+subtotal.toFixed(2);
  var totEl=document.getElementById('po-total-display');if(totEl)totEl.textContent='$'+subtotal.toFixed(2);
}

function checkReceivingStatus() {
  if(!_poItems.length) return;
  var allReceived=_poItems.every(function(li){return parseFloat(li.qtyReceived||0)>=parseFloat(li.qtyOrdered||1);});
  var anyReceived=_poItems.some(function(li){return parseFloat(li.qtyReceived||0)>0;});
  var statusEl=document.getElementById('po-status');
  if(statusEl){
    var cur=statusEl.value;
    if(allReceived&&(cur==='Sent'||cur==='Partially Received')) statusEl.value='Received';
    else if(anyReceived&&cur==='Sent') statusEl.value='Partially Received';
  }
}

// ---- THREE-WAY MATCH ----

function checkPOMatch() {
  var vendorAmt=parseFloat((document.getElementById('po-vendor-inv-amt')||{}).value)||0;
  var subtotal=_poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0);
  var received=_poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyReceived||0));},0);
  var resultEl=document.getElementById('po-match-result');
  var badgeEl=document.getElementById('po-match-badge');
  if(!resultEl||!vendorAmt) return;

  var poMatch=Math.abs(subtotal-vendorAmt)<0.02;
  var recMatch=received>0&&Math.abs(received-vendorAmt)<0.02;

  if(poMatch){
    resultEl.innerHTML='<span style="color:#2e7d32;font-weight:700">✅ PO amount matches vendor invoice — ready to approve</span>';
    if(badgeEl){badgeEl.style.display='inline-block';badgeEl.style.background='#e8f5e9';badgeEl.style.color='#2e7d32';badgeEl.style.padding='3px 10px';badgeEl.style.borderRadius='20px';badgeEl.style.fontSize='11px';badgeEl.style.fontWeight='700';badgeEl.textContent='✅ Matched';}
    var statusEl=document.getElementById('po-status');
    if(statusEl&&statusEl.value==='Received') statusEl.value='Matched';
  } else {
    var diff=vendorAmt-subtotal;
    resultEl.innerHTML='<span style="color:#c62828;font-weight:700">⚠️ Discrepancy: Vendor invoice is $'+Math.abs(diff).toFixed(2)+(diff>0?' over':' under')+' PO amount — investigate before approving</span>';
    if(badgeEl){badgeEl.style.display='inline-block';badgeEl.style.background='#ffebee';badgeEl.style.color='#c62828';badgeEl.style.padding='3px 10px';badgeEl.style.borderRadius='20px';badgeEl.style.fontSize='11px';badgeEl.style.fontWeight='700';badgeEl.textContent='⚠️ Mismatch';}
  }
}

function onPOReadyToPay(checked) {
  if(!checked) return;
  // In-app notification to Victoria
  showToast('PO marked Ready to Pay — Victoria has been notified','success',4000);
  var statusEl=document.getElementById('po-status');
  if(statusEl) statusEl.value='Ready to Pay';
}

// ---- SAVE PO ----

function savePO() {
  var vendorId=(document.getElementById('po-vendor')||{}).value||'';
  if(!vendorId){showToast('Select a vendor','error');return;}
  function gv(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var vendor=(DB.vendors||[]).find(function(v){return v.id===vendorId;})||{};
  var isNew=!_poCurrentId;
  var id=_poCurrentId||crypto.randomUUID();
  if(!DB.poSeq) DB.poSeq=1000;
  if(isNew) DB.poSeq++;
  var subtotal=_poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0);
  var jobId=gv('po-job-id-hidden');
  var job=jobId?(DB.jobs||[]).find(function(j){return j.id===jobId;}):null;

  var po={
    id:          id,
    poNumber:    isNew?('PO-'+DB.poSeq):(_poCurrentId&&(DB.purchaseOrders||[]).find(function(p){return p.id===_poCurrentId;})||{}).poNumber||('PO-'+DB.poSeq),
    vendorId:    vendorId,
    vendorName:  vendor.name||'',
    jobId:       jobId||null,
    jobName:     job?job.name:'',
    woId:        gv('po-wo-id-hidden')||null,
    status:      gv('po-status')||'Draft',
    date:        gv('po-date'),
    dateNeeded:  gv('po-date-needed'),
    shipName:    gv('po-ship-name'),
    shipAddr:    gv('po-ship-addr'),
    shipCity:    gv('po-ship-city'),
    shipState:   gv('po-ship-state'),
    shipZip:     gv('po-ship-zip'),
    notes:       gv('po-notes'),
    vendorInvNum:gv('po-vendor-inv-num'),
    vendorInvAmt:parseFloat(gv('po-vendor-inv-amt'))||0,
    readyToPay:  !!(document.getElementById('po-ready-to-pay')||{}).checked,
    subtotal:    subtotal,
    total:       subtotal,
    items:       _poItems.map(function(li){return Object.assign({},li);}),
    createdBy:   isNew?((_currentUser&&_currentUser.id)||null):((DB.purchaseOrders||[]).find(function(p){return p.id===id;})||{}).createdBy,
    createdByName:isNew?((_currentUser&&_currentUser.full_name)||'Unknown'):((DB.purchaseOrders||[]).find(function(p){return p.id===id;})||{}).createdByName,
    createdAt:   isNew?new Date().toISOString():((DB.purchaseOrders||[]).find(function(p){return p.id===id;})||{}).createdAt,
    updatedAt:   new Date().toISOString()
  };

  if(!DB.purchaseOrders) DB.purchaseOrders=[];
  if(isNew){DB.purchaseOrders.unshift(po);_poCurrentId=id;}
  else{var idx=DB.purchaseOrders.findIndex(function(p){return p.id===id;});if(idx>=0)DB.purchaseOrders[idx]=po;else DB.purchaseOrders.unshift(po);}

  // If received items, push to linked WO parts
  if(jobId||po.woId){
    var woId=po.woId||(job&&job.woId);
    if(woId){
      var receivedItems=_poItems.filter(function(li){return parseFloat(li.qtyReceived||0)>0;});
      receivedItems.forEach(function(li){
        if(!DB.woParts) DB.woParts=[];
        var exists=DB.woParts.find(function(p){return p.woId===woId&&p.name===li.desc&&p.poId===po.id;});
        if(!exists){
          DB.woParts.push({id:'wop-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),woId:woId,name:li.desc||'',partNum:li.partNum||'',qty:parseFloat(li.qtyReceived||0),status:'received',requestedBy:'PO '+po.poNumber,poId:po.id,createdAt:new Date().toISOString()});
        }
      });
    }
  }

  // Push to Supabase
  _pushPOToCloud(po);
  saveDB();
  document.getElementById('po-modal-title').textContent='Purchase Order';
  renderPOList();
  showToast('PO '+po.poNumber+' saved ✓','success');
}

async function _pushPOToCloud(po) {
  if(!_sb||!_currentUser) return;
  try {
    var {error:poErr}=await _sb.from('purchase_orders').upsert({
      id:po.id,po_number:po.poNumber,vendor_id:po.vendorId||null,vendor_name:po.vendorName||null,
      job_id:po.jobId||null,wo_id:po.woId||null,status:po.status||'Draft',
      ship_to_name:po.shipName||null,ship_to_address:po.shipAddr||null,
      ship_to_city:po.shipCity||null,ship_to_state:po.shipState||null,ship_to_zip:po.shipZip||null,
      subtotal:po.subtotal||0,total:po.total||0,date_needed:po.dateNeeded||null,
      notes:po.notes||null,vendor_invoice_num:po.vendorInvNum||null,
      vendor_invoice_amount:po.vendorInvAmt||null,ready_to_pay:!!po.readyToPay,
      created_by:po.createdBy||_currentUser.id,created_by_name:po.createdByName||null,
      updated_at:new Date().toISOString()
    });
    if(poErr){console.warn('[PO Push]',poErr.message);return;}
    // Push line items
    await _sb.from('po_line_items').delete().eq('po_id',po.id);
    for(var i=0;i<po.items.length;i++){
      var li=po.items[i];
      await _sb.from('po_line_items').insert({
        id:crypto.randomUUID(),po_id:po.id,description:li.desc||null,
        part_num:li.partNum||null,qty_ordered:li.qtyOrdered||1,
        qty_received:li.qtyReceived||0,unit_cost:li.unitCost||0,
        total_cost:(li.unitCost||0)*(li.qtyOrdered||1),sort_order:i
      });
    }
  } catch(e){console.warn('[PO Push]',e.message);}
}

function deletePO(id) {
  if(!confirm('Delete this purchase order?')) return;
  DB.purchaseOrders=(DB.purchaseOrders||[]).filter(function(p){return p.id!==id;});
  if(_sb&&_currentUser) _sb.from('purchase_orders').delete().eq('id',id).then(function(){});
  saveDB();
  renderPOList();
  showToast('PO deleted','info');
}

// ---- PRINT PO ----

function printPO() {
  if(!_poCurrentId) {savePO(); return;}
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===_poCurrentId;});
  if(!po) return;
  _printPOHTML(po);
}

function printPOById(id) {
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===id;});
  if(!po) return;
  _printPOHTML(po);
}

function _printPOHTML(po) {
  var s=DB.settings||{};
  var vendor=(DB.vendors||[]).find(function(v){return v.id===po.vendorId;})||{};
  var rows=(po.items||[]).map(function(li){
    var lt=(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));
    return '<tr>'+
      '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0">'+escHtml(li.desc||'')+'</td>'+
      '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center">'+escHtml(li.partNum||'')+'</td>'+
      '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center">'+parseFloat(li.qtyOrdered||1)+'</td>'+
      '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right">$'+parseFloat(li.unitCost||0).toFixed(2)+'</td>'+
      '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700">$'+lt.toFixed(2)+'</td>'+
    '</tr>';
  }).join('');

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PO '+escHtml(po.poNumber||'')+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1a1a1a;font-size:13px;padding:40px 48px}'+
    '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1565c0}'+
    '.co-name .red{color:#cc0000;font-size:26px;font-weight:900}.co-name .blue{color:#1565c0;font-size:26px;font-weight:900}'+
    '.po-label{font-size:32px;font-weight:900;color:#1565c0;letter-spacing:2px}'+
    '.addr-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-bottom:24px}'+
    '.addr-block label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#90a4ae;display:block;margin-bottom:6px;border-bottom:1px solid #e0e0e0;padding-bottom:4px}'+
    '.addr-block .val{font-size:13px;line-height:1.7}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:20px}'+
    'thead th{background:#1565c0;color:#fff;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left}'+
    'thead th:nth-child(3){text-align:center}thead th:nth-child(4),thead th:nth-child(5){text-align:right}'+
    'tbody tr:nth-child(even){background:#fafafa}'+
    '.totals{display:flex;justify-content:flex-end;margin-bottom:24px}.totals-table{width:280px}'+
    '.tot-final{display:flex;justify-content:space-between;padding:10px 0 0;font-size:18px;font-weight:900;color:#1565c0;border-top:2px solid #1565c0;margin-top:4px}'+
    '.footer{border-top:1px solid #e0e0e0;padding-top:14px;font-size:11px;color:#90a4ae;text-align:center}'+
    '@media print{@page{margin:12mm}.no-print{display:none!important}}</style></head><body>'+
    '<div class="no-print" style="margin-bottom:16px"><button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;cursor:pointer;font-weight:700">🖨 Print</button> <button onclick="window.close()" style="background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">Close</button></div>'+
    '<div class="header">'+
      '<div><div class="co-name"><span class="red">TOTAL </span><span class="blue">COMMUNICATIONS</span></div>'+
      '<div style="font-size:12px;color:#546e7a;margin-top:2px">Systems &amp; Solutions, Inc.</div>'+
      '<div style="font-size:11px;color:#546e7a;margin-top:4px;line-height:1.7">'+(s.caddr?escHtml(s.caddr)+'<br>':'')+(s.cphone?'📞 '+escHtml(s.cphone)+'<br>':'')+(s.cemail?'✉️ '+escHtml(s.cemail):'')+'</div></div>'+
      '<div style="text-align:right"><div class="po-label">PURCHASE ORDER</div><div style="font-size:14px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(po.poNumber||'')+'</div></div>'+
    '</div>'+
    '<div class="addr-grid">'+
      '<div class="addr-block"><label>Vendor</label><div class="val"><strong>'+escHtml(vendor.name||po.vendorName||'')+'</strong>'+(vendor.address?'<br>'+escHtml(vendor.address):'')+(vendor.city||vendor.state?'<br>'+[vendor.city,vendor.state].filter(Boolean).join(', ')+(vendor.zip?' '+escHtml(vendor.zip):''):'')+(vendor.phone?'<br>📞 '+escHtml(vendor.phone):'')+(vendor.acctNum?'<br>Acct: '+escHtml(vendor.acctNum):'')+'</div></div>'+
      '<div class="addr-block"><label>Ship To</label><div class="val"><strong>'+escHtml(po.shipName||'')+'</strong>'+(po.shipAddr?'<br>'+escHtml(po.shipAddr):'')+(po.shipCity||po.shipState?'<br>'+[po.shipCity,po.shipState].filter(Boolean).join(', ')+(po.shipZip?' '+escHtml(po.shipZip):''):'')+'</div></div>'+
      '<div class="addr-block"><label>PO Details</label><div class="val"><strong>Date:</strong> '+escHtml(po.date||'')+(po.dateNeeded?'<br><strong>Needed By:</strong> '+escHtml(po.dateNeeded):'')+(po.jobName?'<br><strong>Job:</strong> '+escHtml(po.jobName):'')+'</div></div>'+
    '</div>'+
    '<table><thead><tr><th style="width:45%">Description</th><th style="width:12%">Part #</th><th style="width:8%;text-align:center">Qty</th><th style="width:15%;text-align:right">Unit Cost</th><th style="width:15%;text-align:right">Total</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<div class="totals"><div class="totals-table"><div class="tot-final"><span>PO Total</span><span>$'+parseFloat(po.total||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</span></div></div></div>'+
    (po.notes?'<div style="background:#f8f9fa;border-left:4px solid #1565c0;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:12px;color:#37474f"><strong>Notes:</strong> '+escHtml(po.notes)+'</div>':'')+
    '<div class="footer">Total Communications Systems &amp; Solutions, Inc. · '+escHtml(po.poNumber||'')+'</div>'+
  '</body></html>';

  var win=window.open('','_blank','width=900,height=700');
  if(win){win.document.write(html);win.document.close();setTimeout(function(){win.print();},500);}
}

function emailPO() {
  if(!_poCurrentId){showToast('Save the PO first','error');return;}
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===_poCurrentId;});
  if(!po) return;
  var vendor=(DB.vendors||[]).find(function(v){return v.id===po.vendorId;})||{};
  var toEmail=vendor.email||'';
  if(!toEmail){showToast('No email on file for this vendor — add it to the vendor record','error');return;}
  if((DB.settings||{}).sgKey){
    showToast('Sending PO to '+toEmail+'...','info',2000);
    var subject='Purchase Order '+escHtml(po.poNumber)+' from TCSS';
    var body='Please find attached Purchase Order '+po.poNumber+' from Total Communications Systems & Solutions.\n\nPO Total: $'+parseFloat(po.total||0).toFixed(2)+'\n'+(po.dateNeeded?'Date Needed: '+po.dateNeeded+'\n':'')+(po.notes?'\nNotes: '+po.notes:'');
    sendViaSendGrid(toEmail,vendor.name||'',subject,body,null).then(function(ok){
      if(ok){po.status='Sent';saveDB();renderPOList();showToast('PO emailed to '+toEmail+' ✓','success',4000);}
    });
  } else {
    window.location.href='mailto:'+encodeURIComponent(toEmail)+'?subject='+encodeURIComponent('Purchase Order '+po.poNumber+' from TCSS')+'&body='+encodeURIComponent('Please find attached Purchase Order '+po.poNumber+'.\n\nPO Total: $'+parseFloat(po.total||0).toFixed(2));
    po.status='Sent';
    saveDB();
    renderPOList();
    showToast('Email client opened — attach the PO PDF','info',4000);
  }
}
