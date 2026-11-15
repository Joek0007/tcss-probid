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
        '<button class="btn btn-danger btn-sm" onclick="deleteVendor(\''+v.id+'\')">Del</button>'+
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
  if (typeof probidCheckContactFields==='function' && !probidCheckContactFields('modal-vendor')) return;
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

// ---- DELETE (soft-delete) A VENDOR ----
// Vendors carry an `active` flag and renderVendors already hides inactive ones,
// but until now there was no way to set it — you could never remove a vendor
// (e.g. a duplicate or a typo). This soft-deletes: the vendor drops off the
// active list and the pickers, existing purchase orders keep their own copy of
// the vendor name, and it's recoverable by flipping is_active back on. Mirrors
// the direct-write pattern saveVendor already uses (vendor management is not
// role-gated server-side today — a possible future hardening item, noted).
function deleteVendor(id) {
  var v = (DB.vendors||[]).find(function(x){ return x.id===id; });
  if (!v) return;
  if (!confirm('Delete vendor "'+(v.name||'')+'"?\n\nExisting purchase orders keep their record; the vendor is just removed from your active list.')) return;
  v.active = false;
  // Cloud: flip is_active off. The vendor pull only fetches is_active=true, so it
  // won't come back on any device; pushAllToCloud never re-pushes vendors, so it
  // can't resurrect. No tombstone needed (this is a flag update, not a row delete).
  if (_sb && _currentUser) {
    _sb.from('vendors').update({ is_active:false }).eq('id', id)
      .then(function(r){ if (r && r.error) console.warn('[Vendor Delete]', r.error.message); });
  }
  saveDB();
  renderVendors();
  if (typeof showToast==='function') showToast('Vendor "'+(v.name||'')+'" deleted','info');
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

  // Fixed last column (was `auto`) so the header row and data rows compute identical column
  // widths — otherwise the buttons made the data Actions column wider than the header's, and
  // every fr column drifted, misaligning the labels from their data.
  // Column widths tuned for balance: Vendor gets the room, Job/WO (often empty) is slimmer,
  // Date/Total/Status are fixed so whitespace doesn't pool in the middle. Status centered.
  var GRID='90px 2fr 1.1fr 108px 120px 116px 250px';
  var header='<div style="display:grid;grid-template-columns:'+GRID+';gap:8px;padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+
    '<div>PO #</div><div>Vendor</div><div>Job / WO</div><div>Date</div><div style="text-align:right">Total</div><div style="text-align:center">Status</div><div style="text-align:right">Actions</div></div>';

  var rows=list.map(function(po){
    var sc=statusColors[po.status]||{bg:'#f5f5f5',color:'#546e7a'};
    return '<div style="display:grid;grid-template-columns:'+GRID+';gap:8px;padding:12px 16px;border-bottom:1px solid #f5f7fa;align-items:center" onmouseover="this.style.background=\'#f8f9fa\'" onmouseout="this.style.background=\'\'">'+
      '<div style="font-weight:700;color:#1565c0;font-size:13px">'+escHtml(po.poNumber||'')+'</div>'+
      '<div>'+
        '<div style="font-weight:600;font-size:13px">'+escHtml(po.vendorName||'—')+'</div>'+
        (po.vendorInvNum?'<div style="font-size:10px;color:#546e7a">Inv: '+escHtml(po.vendorInvNum)+'</div>':'')+
      '</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(po.jobName||'—')+'</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(po.date||'—')+'</div>'+
      '<div style="font-weight:700;font-size:13px;text-align:right">$'+parseFloat(po.total||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</div>'+
      '<div style="text-align:center"><span style="background:'+sc.bg+';color:'+sc.color+';padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700">'+escHtml(po.status||'')+'</span></div>'+
      '<div style="display:flex;gap:4px;justify-content:flex-end;align-items:center">'+
        '<button class="btn btn-outline btn-sm" onclick="openPO(\''+po.id+'\')">Open</button>'+
        // r101: Receive keeps the SAME footprint on every row so the Actions column stays in line. A PO that
        // is ready to receive (Sent / Partially Received) gets a solid DARK-GREEN clickable Receive; every
        // other row shows a light GREEN-OUTLINE placeholder (inert — just holds the line).
        ((['Sent','Partially Received'].includes(po.status))
          ? '<button class="btn btn-success btn-sm po-recv" onclick="openReceiving(\''+po.id+'\')">📥 Receive</button>'
          // (r138) A PO awaiting approval shows an Approve button (for approvers) in the Receive slot —
          // keeps the Actions column width identical. Others keep the inert placeholder.
          : ((po.approvalRequired && !po.approved && (typeof hasPermission==='function'?hasPermission('po.approve'):true))
             ? '<button class="btn btn-success btn-sm po-recv" onclick="event.stopPropagation&&event.stopPropagation();approvePO(\''+po.id+'\')" title="Approve this PO">✅ Approve</button>'
             : '<button class="btn btn-sm po-recv po-recv-ph" tabindex="-1" aria-hidden="true">Receive</button>'))+
        '<button class="btn btn-outline btn-sm" onclick="printPOById(\''+po.id+'\')" title="Print PO">🖨</button>'+
        ((typeof _canDeleteOfficeRecords==='function' ? _canDeleteOfficeRecords() : (_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office')))?'<button class="btn btn-danger btn-sm" onclick="deletePO(\''+po.id+'\')" title="Delete PO">✕</button>':'')+
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
  sv('po-tax',''); sv('po-freight','');   // (r135)
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
  if(typeof _renderPOApprovalBar==='function') _renderPOApprovalBar(null);   // (r138) no approval bar on a blank PO
  if(typeof _fillPOCatalogDatalist==='function') _fillPOCatalogDatalist();   // (r140) catalog type-ahead
  openModal('modal-po');
}

function newPOForVendor(vendorId) {
  openNewPO();
  var vSel=document.getElementById('po-vendor');
  if(vSel) vSel.value=vendorId;
}

function openPO(id) {
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===id;});
  if(!po){
    // Older/closed PO outside the bounded working set — fetch on demand, then retry.
    if (typeof ensurePOLoaded==='function') {
      ensurePOLoaded(id).then(function(f){
        if (f) openPO(id);
        else if (typeof showToast==='function') showToast('Purchase order not found','error');
      });
    }
    return;
  }
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
  sv('po-tax',(po.tax!=null&&po.tax!==0)?po.tax:'');         // (r135)
  sv('po-freight',(po.freight!=null&&po.freight!==0)?po.freight:'');
  sv('po-job-id-hidden',po.jobId||'');
  sv('po-wo-id-hidden',po.woId||'');

  var rtpEl=document.getElementById('po-ready-to-pay');if(rtpEl)rtpEl.checked=!!po.readyToPay;

  _populatePOVendorSelect(po.vendorId);
  _populatePOJobSelect(po.jobId);

  // Source chain
  var chain=[];
  if(po.jobId){var j=(typeof _findJobOrWO==="function"?_findJobOrWO(po.jobId):(DB.jobs||[]).find(function(x){return x.id===po.jobId;}));if(j)chain.push('Job '+escHtml(j.num||''));}
  if(po.woId){var w=(DB.workOrders||[]).find(function(x){return x.id===po.woId;});if(w)chain.push('WO '+escHtml(w.woNumber||''));}
  var chainEl=document.getElementById('po-source-chain');
  if(chainEl) chainEl.innerHTML=chain.length?'📎 Linked: '+chain.join(' → '):'';

  renderPOItems();
  refreshPOTotals();
  checkPOMatch();
  if(typeof _renderPOApprovalBar==='function') _renderPOApprovalBar(po);   // (r138)
  if(typeof _fillPOCatalogDatalist==='function') _fillPOCatalogDatalist();   // (r140) catalog type-ahead
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
    (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[])).map(function(j){
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
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;}));
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
      '<input value="'+escHtml(li.desc||'')+'" list="po-catalog-list" oninput="updatePOItem('+i+',\'desc\',this.value)" onchange="poCatalogFill('+i+',this.value)" placeholder="Description / search catalog..." style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%">'+
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

// (r140) Catalog part # + cost for a line. Prefer an exact catalog match on the description; fall back
// to a loose contains-match. Returns {desc,partNum,unitCost} or null.
function _poCatalogMatch(val){
  if(!val) return null;
  var q=String(val).toLowerCase().trim();
  var cat=DB.catalog||[];
  var item = cat.find(function(c){ return ((c.name||c.desc||'').toLowerCase().trim())===q; })
          || cat.find(function(c){ return (c.name||c.desc||'').toLowerCase().indexOf(q)>=0; });
  if(!item) return null;
  return { desc:item.name||item.desc||'', partNum:item.part||item.partNum||'', unitCost:parseFloat(item.mc!=null?item.mc:(item.cost||0))||0 };
}

// (r140) Populate the shared catalog datalist the line-item description inputs type-ahead against.
function _fillPOCatalogDatalist(){
  var dl=document.getElementById('po-catalog-list'); if(!dl) return;
  dl.innerHTML=(DB.catalog||[]).map(function(c){
    var label=(c.name||c.desc||''); if(!label) return '';
    return '<option value="'+escHtml(label)+'">'+escHtml(c.part||c.partNum||'')+'</option>';
  }).join('');
}

// (r140) When a line's description matches a catalog item, auto-fill its part # and unit cost (only
// when those are still blank, so a manual override is never clobbered). This is the type-ahead fix
// that replaces the old prompt()-based From-Catalog flow which dropped the part number.
function poCatalogFill(idx,val){
  if(!_poItems[idx]) return;
  var m=_poCatalogMatch(val);
  if(!m) return;
  _poItems[idx].desc=m.desc;
  if(!_poItems[idx].partNum) _poItems[idx].partNum=m.partNum;
  if(!parseFloat(_poItems[idx].unitCost||0)) _poItems[idx].unitCost=m.unitCost;
  renderPOItems();
  refreshPOTotals();
}

// Kept for the "+ From Catalog" button — now a proper picker that carries desc + part # + cost (the
// old version hardcoded partNum:'' and lost the number).
function addPOFromCatalog() {
  var name=prompt('Type part name / description to find in your catalog:','');
  if(!name) return;
  var m=_poCatalogMatch(name);
  if(m){
    _poItems.push({_eid:_poItems.length,desc:m.desc,partNum:m.partNum,qtyOrdered:1,qtyReceived:0,unitCost:m.unitCost});
    renderPOItems(); refreshPOTotals();
    showToast('Added from catalog: '+escHtml(m.desc)+(m.partNum?' ('+escHtml(m.partNum)+')':''),'success');
  } else {
    if(confirm('No catalog match for "'+name+'". Add it as a new line anyway?')){
      _poItems.push({_eid:_poItems.length,desc:name,partNum:'',qtyOrdered:1,qtyReceived:0,unitCost:0});
      renderPOItems(); refreshPOTotals();
    }
  }
}

// (r135) PO total now includes Tax + Freight so it matches what the vendor will actually invoice.
function _poSubtotal(){ return _poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0); }
function _poTaxVal(){ return parseFloat((document.getElementById('po-tax')||{}).value)||0; }
function _poFreightVal(){ return parseFloat((document.getElementById('po-freight')||{}).value)||0; }
function _poGrandTotal(){ return _poSubtotal()+_poTaxVal()+_poFreightVal(); }
function refreshPOTotals() {
  var subtotal=_poSubtotal();
  var total=subtotal+_poTaxVal()+_poFreightVal();
  var stEl=document.getElementById('po-subtotal-display');if(stEl)stEl.textContent='$'+subtotal.toFixed(2);
  var totEl=document.getElementById('po-total-display');if(totEl)totEl.textContent='$'+total.toFixed(2);
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
  // (r135) Compare the vendor invoice to the PO GRAND TOTAL (subtotal + tax + freight), not the bare
  // material subtotal — otherwise every real invoice (which includes tax/freight) flagged a false
  // discrepancy.
  var poTotal=_poGrandTotal();
  var resultEl=document.getElementById('po-match-result');
  var badgeEl=document.getElementById('po-match-badge');
  if(!resultEl||!vendorAmt) return;

  var poMatch=Math.abs(poTotal-vendorAmt)<0.02;

  if(poMatch){
    resultEl.innerHTML='<span style="color:#2e7d32;font-weight:700">✅ PO total matches vendor invoice — ready to approve</span>';
    if(badgeEl){badgeEl.style.display='inline-block';badgeEl.style.background='#e8f5e9';badgeEl.style.color='#2e7d32';badgeEl.style.padding='3px 10px';badgeEl.style.borderRadius='20px';badgeEl.style.fontSize='11px';badgeEl.style.fontWeight='700';badgeEl.textContent='✅ Matched';}
    var statusEl=document.getElementById('po-status');
    if(statusEl&&statusEl.value==='Received') statusEl.value='Matched';
  } else {
    var diff=vendorAmt-poTotal;
    resultEl.innerHTML='<span style="color:#c62828;font-weight:700">⚠️ Discrepancy: Vendor invoice is $'+Math.abs(diff).toFixed(2)+(diff>0?' over':' under')+' the PO total ($'+poTotal.toFixed(2)+') — check tax/freight or line items before approving</span>';
    if(badgeEl){badgeEl.style.display='inline-block';badgeEl.style.background='#ffebee';badgeEl.style.color='#c62828';badgeEl.style.padding='3px 10px';badgeEl.style.borderRadius='20px';badgeEl.style.fontSize='11px';badgeEl.style.fontWeight='700';badgeEl.textContent='⚠️ Mismatch';}
  }
}

function onPOReadyToPay(checked) {
  if(!checked) return;
  var statusEl=document.getElementById('po-status');
  if(statusEl) statusEl.value='Ready to Pay';
  // (r140) No hardcoded recipient, no false "notified" claim. The office is notified through the
  // notification engine when the PO is SAVED with status 'Ready to Pay' (trg_notif_po_status → the
  // configurable "PO ready to pay" rule — owner edits who/how in Settings → Notifications).
  showToast('Marked Ready to Pay — save to notify the office','info',3500);
}

// (r138) Approval routing — approve a PO that is awaiting approval so it can be sent.
function approvePO(id){
  if (typeof hasPermission==='function' && !hasPermission('po.approve')) { showToast('You do not have permission to approve purchase orders','error'); return; }
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===id;});
  if(!po) return;
  po.approved=true;
  po.approvedByName=(_currentUser&&_currentUser.full_name)||'Approver';
  po.approvedAt=new Date().toISOString();
  if(po.status==='Pending Approval') po.status='Draft';
  po.updatedAt=new Date().toISOString();
  if(typeof _pushPOToCloud==='function') _pushPOToCloud(po);
  saveDB();
  renderPOList();
  if(_poCurrentId===id){
    var statusEl=document.getElementById('po-status'); if(statusEl) statusEl.value=po.status;
    _renderPOApprovalBar(po);
  }
  showToast('PO '+(po.poNumber||'')+' approved ✓','success',3500);
}

// Renders the approval banner inside the open PO modal (awaiting-approval + Approve button, or the
// approved stamp). Hidden entirely when the PO doesn't require approval.
function _renderPOApprovalBar(po){
  var bar=document.getElementById('po-approval-bar'); if(!bar) return;
  if(!po || !po.approvalRequired){ bar.style.display='none'; bar.innerHTML=''; return; }
  bar.style.display='block';
  if(po.approved){
    bar.innerHTML='<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:8px 12px;font-size:12px;color:#2e7d32;font-weight:700">✅ Approved'+(po.approvedByName?' by '+escHtml(po.approvedByName):'')+(po.approvedAt?' · '+escHtml(String(po.approvedAt).split('T')[0]):'')+'</div>';
  } else {
    var canApprove = (typeof hasPermission==='function') ? hasPermission('po.approve') : true;
    bar.innerHTML='<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:8px 12px;font-size:12px;color:#e65100;font-weight:700;display:flex;align-items:center;justify-content:space-between;gap:10px">'+
      '<span>⏳ Awaiting approval — this PO is at/over the approval threshold and can’t be sent to the vendor until approved.</span>'+
      (canApprove?'<button class="btn btn-success btn-sm" onclick="approvePO(\''+escHtml(po.id)+'\')">✅ Approve</button>':'')+
    '</div>';
  }
}

// ---- SAVE PO ----

async function savePO() {
  var vendorId=(document.getElementById('po-vendor')||{}).value||'';
  if(!vendorId){showToast('Select a vendor','error');return;}
  function gv(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var vendor=(DB.vendors||[]).find(function(v){return v.id===vendorId;})||{};
  var isNew=!_poCurrentId;
  var id=_poCurrentId||crypto.randomUUID();
  // Server-authoritative PO number (migration _17) for new POs; existing POs keep theirs.
  var poNumber;
  if (isNew) {
    var poFloor = _maxNum(DB.purchaseOrders, function(p){ return p.poNumber; }, /PO-(\d+)/);
    var poN = await allocNumber('po', poFloor);
    poNumber = 'PO-' + poN;
  } else {
    poNumber = ((DB.purchaseOrders||[]).find(function(p){return p.id===_poCurrentId;})||{}).poNumber || 'PO-?';
  }
  var subtotal=_poItems.reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0);
  var taxAmt=parseFloat(gv('po-tax'))||0;          // (r135) tax + freight roll into the PO total
  var freightAmt=parseFloat(gv('po-freight'))||0;
  var grandTotal=subtotal+taxAmt+freightAmt;
  var jobId=gv('po-job-id-hidden');
  var job=jobId?(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})):null;

  // (r138) PO approval routing. Threshold is tenant config (poApprovalThreshold); 0/unset = OFF, so
  // no PO is ever blocked until the owner sets a dollar amount. A PO at/over the threshold needs
  // approval before it can be emailed to the vendor. Someone with po.approve self-approves (their own
  // POs aren't blocked); anyone else's over-threshold PO lands in "Pending Approval". Existing/prior
  // approval is preserved on edit so an already-approved PO doesn't bounce back to pending.
  var _poPrior = isNew ? null : (DB.purchaseOrders||[]).find(function(p){return p.id===id;});
  var _poThreshold = parseFloat((DB.settings||{}).poApprovalThreshold)||0;
  var _poNeedsApproval = _poThreshold>0 && grandTotal >= _poThreshold;
  var _poCanApprove = (typeof hasPermission==='function') ? hasPermission('po.approve') : true;
  // Preserve a PRIOR approval only if the PO was already approved UNDER an approval requirement —
  // a PO that was below-threshold carries approved=true by default, which must NOT count as a real
  // approval when the PO later crosses the threshold (that needs fresh approval).
  var _poPriorReallyApproved = !!(_poPrior && _poPrior.approvalRequired && _poPrior.approved);
  var _poApproved, _poApprovedByName, _poApprovedAt;
  if (!_poNeedsApproval) {
    _poApproved = true;
    _poApprovedByName = _poPriorReallyApproved ? _poPrior.approvedByName : null;
    _poApprovedAt     = _poPriorReallyApproved ? _poPrior.approvedAt : null;
  } else if (_poCanApprove) {
    if (_poPriorReallyApproved) { _poApproved=true; _poApprovedByName=_poPrior.approvedByName; _poApprovedAt=_poPrior.approvedAt; }
    else { _poApproved=true; _poApprovedByName=(_currentUser&&_currentUser.full_name)||'Approver'; _poApprovedAt=new Date().toISOString(); }
  } else {
    _poApproved       = _poPriorReallyApproved;
    _poApprovedByName = _poPriorReallyApproved ? _poPrior.approvedByName : null;
    _poApprovedAt     = _poPriorReallyApproved ? _poPrior.approvedAt : null;
  }

  var po={
    id:          id,
    poNumber:    poNumber,
    vendorId:    vendorId,
    vendorName:  vendor.name||'',
    jobId:       jobId||null,
    jobName:     job?job.name:'',
    woId:        gv('po-wo-id-hidden')||null,
    status:      (_poNeedsApproval && !_poApproved) ? 'Pending Approval' : (gv('po-status')||'Draft'),
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
    tax:         taxAmt,
    freight:     freightAmt,
    total:       grandTotal,
    approvalRequired: _poNeedsApproval,   // (r138) approval routing
    approved:         _poApproved,
    approvedByName:   _poApprovedByName,
    approvedAt:       _poApprovedAt,
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

  // (feat hl) Parts put on this PO from a WO's "needs ordering" review dialog carry _woPartId.
  // On the FIRST save, flip each of those WO parts to "Ordered" and stamp the PO number, so the
  // WO Parts tab stops showing them as red "Needs Ordering" and nobody double-orders them.
  if (isNew) {
    _poItems.forEach(function(li){
      if (!li._woPartId) return;
      var wp = (DB.woParts||[]).find(function(p){ return p.id===li._woPartId; });
      if (wp && wp.status!=='received' && wp.status!=='partial') {
        wp.status = 'ordered';   // status is a real wo_parts column → persists. The "which PO" link
                                 // is carried by po_line_items.wo_part_id and derived at display time
                                 // (see _woPartPOInfo in workorders.js), so no non-persisting stamp here.
        if (typeof _pushWOPartToCloud==='function') _pushWOPartToCloud(wp);
      }
    });
  }

  // Push to Supabase
  _pushPOToCloud(po);
  saveDB();
  document.getElementById('po-modal-title').textContent='Purchase Order';
  renderPOList();
  // (r138) reflect approval state in the open modal + a clear save message when it needs approval.
  var _psEl=document.getElementById('po-status'); if(_psEl) _psEl.value=po.status;
  if(typeof _renderPOApprovalBar==='function') _renderPOApprovalBar(po);
  showToast((po.approvalRequired && !po.approved)
    ? ('PO '+po.poNumber+' saved — awaiting approval before it can be sent')
    : ('PO '+po.poNumber+' saved ✓'),'success',4000);
}

async function _pushPOToCloud(po) {
  if(!_sb||!_currentUser) return;
  try {
    var {error:poErr}=await _sb.from('purchase_orders').upsert({
      id:po.id,po_number:po.poNumber,vendor_id:po.vendorId||null,vendor_name:po.vendorName||null,
      job_id:po.jobId||null,wo_id:po.woId||null,status:po.status||'Draft',
      ship_to_name:po.shipName||null,ship_to_address:po.shipAddr||null,
      ship_to_city:po.shipCity||null,ship_to_state:po.shipState||null,ship_to_zip:po.shipZip||null,
      subtotal:po.subtotal||0,total:po.total||0,tax_amount:po.tax||0,freight_amount:po.freight||0,date_needed:po.dateNeeded||null,
      approval_required:!!po.approvalRequired,approved:po.approved!==false,approved_by_name:po.approvedByName||null,approved_at:po.approvedAt||null,
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
        total_cost:(li.unitCost||0)*(li.qtyOrdered||1),sort_order:i,
        wo_part_id:li._woPartId||null   // (feat hl r134) persists the WO-part→PO link so a part's
                                        // "ordered on PO-xxxx" survives reload (derived at display time)
      });
    }
  } catch(e){console.warn('[PO Push]',e.message);}
}

function deletePO(id) {
  if (typeof _canDeleteOfficeRecords==='function' && !_canDeleteOfficeRecords()) { showToast('Only owner, manager, or office staff can delete purchase orders','error'); return; }
  if(!confirm('Delete this purchase order?')) return;
  DB.purchaseOrders=(DB.purchaseOrders||[]).filter(function(p){return p.id!==id;});
  // Single-writer delete: only tombstone here. pushAllToCloud performs the cloud delete
  // (cascading po_line_items first, then the PO) and clears the tombstone on a confirmed
  // delete. Deleting here too would leave the retry finding 0 rows and never clearing.
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.purchaseOrders)DB.deletedIds.purchaseOrders=[];
  if(DB.deletedIds.purchaseOrders.indexOf(id)<0)DB.deletedIds.purchaseOrders.push(id);
  saveDB();
  if(_sb&&_currentUser&&typeof pushAllToCloud==='function') setTimeout(pushAllToCloud,300);
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
  if(!po){
    if (typeof ensurePOLoaded==='function') { ensurePOLoaded(id).then(function(f){ if(f) _printPOHTML(f); else if(typeof showToast==='function') showToast('Purchase order not found','error'); }); }
    return;
  }
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

  // (r135) totals breakdown — show Subtotal/Tax/Freight above the PO Total when tax or freight apply.
  var _poSub=(po.subtotal!=null)?parseFloat(po.subtotal):((po.items||[]).reduce(function(s,li){return s+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0));
  var _poTax=parseFloat(po.tax||0), _poFr=parseFloat(po.freight||0);
  var _totRows=(_poTax||_poFr)
    ? '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#546e7a">Subtotal</span><span>$'+_poSub.toFixed(2)+'</span></div>'+
      (_poTax?'<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#546e7a">Tax</span><span>$'+_poTax.toFixed(2)+'</span></div>':'')+
      (_poFr?'<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px"><span style="color:#546e7a">Freight / Shipping</span><span>$'+_poFr.toFixed(2)+'</span></div>':'')
    : '';
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
      '<div style="font-size:11px;color:#546e7a;margin-top:4px;line-height:1.7">'+(s.caddr?escHtml(s.caddr)+'<br>':'')+(s.cphone?'📞 '+escHtml(s.cphone)+'<br>':'')+((s.poReplyTo||s.cemail)?'✉️ '+escHtml(s.poReplyTo||s.cemail):'')+'</div></div>'+
      '<div style="text-align:right"><div class="po-label">PURCHASE ORDER</div><div style="font-size:14px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(po.poNumber||'')+'</div></div>'+
    '</div>'+
    '<div class="addr-grid">'+
      '<div class="addr-block"><label>Vendor</label><div class="val"><strong>'+escHtml(vendor.name||po.vendorName||'')+'</strong>'+(vendor.address?'<br>'+escHtml(vendor.address):'')+(vendor.city||vendor.state?'<br>'+[vendor.city,vendor.state].filter(Boolean).join(', ')+(vendor.zip?' '+escHtml(vendor.zip):''):'')+(vendor.phone?'<br>📞 '+escHtml(vendor.phone):'')+(vendor.acctNum?'<br>Acct: '+escHtml(vendor.acctNum):'')+'</div></div>'+
      '<div class="addr-block"><label>Ship To</label><div class="val"><strong>'+escHtml(po.shipName||'')+'</strong>'+(po.shipAddr?'<br>'+escHtml(po.shipAddr):'')+(po.shipCity||po.shipState?'<br>'+[po.shipCity,po.shipState].filter(Boolean).join(', ')+(po.shipZip?' '+escHtml(po.shipZip):''):'')+'</div></div>'+
      '<div class="addr-block"><label>PO Details</label><div class="val"><strong>Date:</strong> '+escHtml(po.date||'')+(po.dateNeeded?'<br><strong>Needed By:</strong> '+escHtml(po.dateNeeded):'')+(po.jobName?'<br><strong>Job:</strong> '+escHtml(po.jobName):'')+'</div></div>'+
    '</div>'+
    '<table><thead><tr><th style="width:45%">Description</th><th style="width:12%">Part #</th><th style="width:8%;text-align:center">Qty</th><th style="width:15%;text-align:right">Unit Cost</th><th style="width:15%;text-align:right">Total</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<div class="totals"><div class="totals-table">'+_totRows+'<div class="tot-final"><span>PO Total</span><span>$'+parseFloat(po.total||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</span></div></div></div>'+
    (po.notes?'<div style="background:#f8f9fa;border-left:4px solid #1565c0;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;font-size:12px;color:#37474f"><strong>Notes:</strong> '+(typeof rtfDisplayHTML==='function'?rtfDisplayHTML(po.notes):escHtml(po.notes))+'</div>':'')+
    '<div class="footer">Total Communications Systems &amp; Solutions, Inc. · '+escHtml(po.poNumber||'')+'</div>'+
  '</body></html>';

  var win=window.open('','_blank','width=900,height=700');
  if(win){win.document.write(html);win.document.close();setTimeout(function(){win.print();},500);}
}

// (r135) Inline-styled PO as an email body (email clients strip <style> blocks, so everything is
// inline). This is what the vendor actually receives in the email.
function _poEmailHTML(po){
  var s=DB.settings||{};
  var vendor=(DB.vendors||[]).find(function(v){return v.id===po.vendorId;})||{};
  var rows=(po.items||[]).map(function(li){
    var lt=(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));
    return '<tr>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px">'+escHtml(li.desc||'')+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">'+escHtml(li.partNum||'')+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center">'+parseFloat(li.qtyOrdered||1)+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right">$'+parseFloat(li.unitCost||0).toFixed(2)+'</td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:700">$'+lt.toFixed(2)+'</td>'+
    '</tr>';
  }).join('');
  var _poSub=(po.subtotal!=null)?parseFloat(po.subtotal):((po.items||[]).reduce(function(a,li){return a+(parseFloat(li.unitCost||0))*(parseFloat(li.qtyOrdered||1));},0));
  var _poTax=parseFloat(po.tax||0), _poFr=parseFloat(po.freight||0);
  var totRows=(_poTax||_poFr)
    ? '<tr><td colspan="4" style="text-align:right;padding:4px 10px;color:#546e7a;font-size:13px">Subtotal</td><td style="text-align:right;padding:4px 10px;font-size:13px">$'+_poSub.toFixed(2)+'</td></tr>'+
      (_poTax?'<tr><td colspan="4" style="text-align:right;padding:4px 10px;color:#546e7a;font-size:13px">Tax</td><td style="text-align:right;padding:4px 10px;font-size:13px">$'+_poTax.toFixed(2)+'</td></tr>':'')+
      (_poFr?'<tr><td colspan="4" style="text-align:right;padding:4px 10px;color:#546e7a;font-size:13px">Freight / Shipping</td><td style="text-align:right;padding:4px 10px;font-size:13px">$'+_poFr.toFixed(2)+'</td></tr>':'')
    : '';
  var addr=function(name,street,city,st,zip){return '<strong>'+escHtml(name||'')+'</strong>'+(street?'<br>'+escHtml(street):'')+((city||st)?'<br>'+[city,st].filter(Boolean).map(escHtml).join(', ')+(zip?' '+escHtml(zip):''):'');};
  return ''+
  '<div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:680px;margin:0 auto;padding:16px">'+
    '<div style="border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:16px">'+
      '<table width="100%"><tr>'+
        '<td style="vertical-align:top"><div style="font-size:20px;font-weight:900"><span style="color:#cc0000">TOTAL </span><span style="color:#1565c0">COMMUNICATIONS</span></div>'+
          '<div style="font-size:11px;color:#546e7a">Systems &amp; Solutions, Inc.</div>'+
          '<div style="font-size:11px;color:#546e7a;margin-top:4px;line-height:1.6">'+(s.caddr?escHtml(s.caddr)+'<br>':'')+(s.cphone?escHtml(s.cphone)+'<br>':'')+((s.poReplyTo||s.cemail)?escHtml(s.poReplyTo||s.cemail):'')+'</div></td>'+
        '<td style="vertical-align:top;text-align:right"><div style="font-size:22px;font-weight:900;color:#1565c0;letter-spacing:1px">PURCHASE ORDER</div><div style="font-size:14px;color:#546e7a;font-weight:700;margin-top:4px">'+escHtml(po.poNumber||'')+'</div></td>'+
      '</tr></table>'+
    '</div>'+
    '<table width="100%" style="margin-bottom:16px"><tr>'+
      '<td style="vertical-align:top;width:50%;font-size:12px;line-height:1.6"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#90a4ae;margin-bottom:4px">Vendor</div>'+addr(vendor.name||po.vendorName,vendor.address,vendor.city,vendor.state,vendor.zip)+'</td>'+
      '<td style="vertical-align:top;width:50%;font-size:12px;line-height:1.6"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#90a4ae;margin-bottom:4px">Ship To</div>'+addr(po.shipName,po.shipAddr,po.shipCity,po.shipState,po.shipZip)+'</td>'+
    '</tr></table>'+
    '<div style="font-size:12px;color:#546e7a;margin-bottom:12px">'+
      '<strong>Date:</strong> '+escHtml(po.date||'')+(po.dateNeeded?' &nbsp;&middot;&nbsp; <strong>Needed By:</strong> '+escHtml(po.dateNeeded):'')+(po.jobName?' &nbsp;&middot;&nbsp; <strong>Job:</strong> '+escHtml(po.jobName):'')+'</div>'+
    '<table width="100%" style="border-collapse:collapse;margin-bottom:12px">'+
      '<thead><tr style="background:#1565c0;color:#fff">'+
        '<th style="padding:8px 10px;text-align:left;font-size:11px">Description</th>'+
        '<th style="padding:8px 10px;text-align:center;font-size:11px">Part #</th>'+
        '<th style="padding:8px 10px;text-align:center;font-size:11px">Qty</th>'+
        '<th style="padding:8px 10px;text-align:right;font-size:11px">Unit</th>'+
        '<th style="padding:8px 10px;text-align:right;font-size:11px">Total</th>'+
      '</tr></thead><tbody>'+rows+totRows+
        '<tr><td colspan="4" style="text-align:right;padding:10px;font-size:16px;font-weight:900;color:#1565c0;border-top:2px solid #1565c0">PO Total</td><td style="text-align:right;padding:10px;font-size:16px;font-weight:900;color:#1565c0;border-top:2px solid #1565c0">$'+parseFloat(po.total||0).toFixed(2)+'</td></tr>'+
      '</tbody></table>'+
    (po.notes?'<div style="background:#f8f9fa;border-left:4px solid #1565c0;padding:10px 14px;font-size:12px;color:#37474f;margin-bottom:12px"><strong>Notes:</strong> '+(typeof stripHtmlToText==='function'?escHtml(stripHtmlToText(po.notes)):escHtml(po.notes))+'</div>':'')+
    '<div style="font-size:11px;color:#90a4ae;border-top:1px solid #e0e0e0;padding-top:10px">Total Communications Systems &amp; Solutions, Inc. &middot; '+escHtml(po.poNumber||'')+'</div>'+
  '</div>';
}

async function emailPO() {
  if(!_poCurrentId){showToast('Save the PO first','error');return;}
  var po=(DB.purchaseOrders||[]).find(function(p){return p.id===_poCurrentId;});
  if(!po) return;
  // (r138) Approval gate — an at/over-threshold PO can't be emailed to the vendor until approved.
  if(po.approvalRequired && !po.approved){
    showToast('This PO needs approval before it can be sent to the vendor.','error',5000);
    return;
  }
  var vendor=(DB.vendors||[]).find(function(v){return v.id===po.vendorId;})||{};
  var toEmail=vendor.email||'';
  if(!toEmail){showToast('No email on file for this vendor — add it to the vendor record','error');return;}
  var s=DB.settings||{};
  var _coPO = (typeof coFullName==='function' ? coFullName() : '') || 'us';
  var subject='Purchase Order '+po.poNumber+' from '+_coPO;
  var textBody='Purchase Order '+po.poNumber+' from '+_coPO+'.\n\nPO Total: $'+parseFloat(po.total||0).toFixed(2)+(po.dateNeeded?'\nDate Needed: '+po.dateNeeded:'')+'\n\nThe full purchase order is shown below.';
  // (r136) Send via Mailgun — the app's configured email provider (same path quotes/invoices use).
  // Multi-tenant: from-domain reads mgDomain/mgFrom from settings (tcss.com default), consistent with
  // the invoice sender — per-tenant verified domains are the email-infra layer.
  if(s.mgKey){
    showToast('Sending PO to '+toEmail+'...','info',2000);
    try{
      var htmlBody=(typeof _poEmailHTML==='function')?_poEmailHTML(po):textBody.replace(/\n/g,'<br>');
      var mgDomain=s.mgDomain||'tcss.com';
      var fd=new FormData();
      fd.append('from', s.mgFrom || ((s.cname||'Purchasing')+' Purchasing <purchasing@'+mgDomain+'>'));
      fd.append('to', toEmail);
      var poReply=s.poReplyTo||s.cemail||s.uemail||'';   // (r137) PO replies go to the configured PO
      if(poReply) fd.append('h:Reply-To', poReply);       // contact (e.g. dispatch@), fallback company email
      fd.append('subject', subject);
      fd.append('text', textBody);
      fd.append('html', htmlBody);
      fd.append('o:tracking','yes'); fd.append('o:tracking-opens','yes');
      fd.append('v:probid_type','po'); fd.append('v:probid_id', String(po.id));
      var res=await fetch('https://api.mailgun.net/v3/'+mgDomain+'/messages',{method:'POST',headers:{'Authorization':'Basic '+btoa('api:'+s.mgKey)},body:fd});
      var data=await res.json().catch(function(){return {};});
      if(res.ok){ po.status='Sent'; po.emailedTo=toEmail; po.emailedAt=new Date().toISOString(); if(typeof _pushPOToCloud==='function')_pushPOToCloud(po); saveDB(); renderPOList(); showToast('PO emailed to '+toEmail+' ✓','success',4000); }
      else{ showToast('Mailgun error: '+(data.message||('Status '+res.status)),'error',6000); console.error('[PO Email]',data); }
    }catch(e){ showToast('PO email failed: '+e.message,'error',5000); console.error('[PO Email]',e); }
  } else {
    // No email provider configured → open the user's mail client with a summary.
    window.location.href='mailto:'+encodeURIComponent(toEmail)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(textBody+'\n\n(Printed PO can be attached from the Print button.)');
    po.status='Sent';
    saveDB();
    renderPOList();
    showToast('Email client opened with the PO summary','info',4000);
  }
}
