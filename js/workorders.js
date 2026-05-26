// ============================================================
// TCSS ProBid V9 — Work Orders Module
// ============================================================

// ---- CONSTANTS ----
var WO_STATUSES = [
  {id:'NEW',                                         color:'#ddd8d8',open:true, mobile:true },
  {id:'OPEN',                                        color:'#4a86e8',open:true, mobile:true },
  {id:'Open -- Waiting on Customer',                 color:'#928b8b',open:true, mobile:true },
  {id:'Open -- Action Needed',                       color:'#ffff00',open:true, mobile:true },
  {id:'Open -- QUOTE NEEDED',                        color:'#980000',open:true, mobile:false},
  {id:'Open -- Part(s) Needed',                      color:'#f9d1ee',open:true, mobile:true },
  {id:'Open -- Part(s) Ordered',                     color:'#e57ec8',open:true, mobile:false},
  {id:'Open -- Part(s) Received -- Partial',         color:'#ffffff',open:true, mobile:false},
  {id:'Open -- Part(s) Received -- Complete',        color:'#a52fea',open:true, mobile:false},
  {id:'Open -- Ready For Review',                    color:'#f73e3e',open:true, mobile:false},
  {id:'Open -- Ready For Pricing',                   color:'#f6c636',open:true, mobile:false},
  {id:'Open -- Partial Invoice (Please Create One)', color:'#ee8b67',open:true, mobile:false},
  {id:'Open -- Partial Invoice Sent (MAILED)',       color:'#7bf363',open:true, mobile:false},
  {id:'Open -- Partial Invoice Sent (By E-MAIL)',    color:'#93c47d',open:true, mobile:false},
  {id:'*** RMA ***',                                 color:'#78c9f9',open:true, mobile:true },
  {id:'BILLED',                                      color:'#fd881a',open:false,mobile:false},
  {id:'Invoice Sent (MAILED)',                       color:'#0dbc0a',open:false,mobile:false},
  {id:'Invoice Sent (By E-MAIL)',                    color:'#0dbc0a',open:false,mobile:false},
  {id:'No Charge',                                   color:'#46f4af',open:false,mobile:false},
  {id:'No Charge -- (Rental System)',                color:'#46f4af',open:false,mobile:false},
  {id:'No Charge -- (Warranty)',                     color:'#e6b8af',open:false,mobile:false},
  {id:'Partial Invoice -- FINAL Invoice (MAILED)',   color:'#0dbc0a',open:false,mobile:false},
  {id:'Partial Invoice -- FINAL Invoice (BY E-MAIL)',color:'#0dbc0a',open:false,mobile:false},
  {id:'Void',                                        color:'#00ffff',open:false,mobile:false},
  {id:'Void (Q-Books Invoice Voided)',               color:'#00ffff',open:false,mobile:false},
];

var WO_SERVICE_TYPES = [
  'Onsite Service','Remote Support','Installation','Counter Sales',
  'New Contract','TCSS Account Change','Building Maintenance','Vehicle Maintenance'
];

var WO_EXPENSE_CATS = [
  'Storage Rental','Equipment Purchase','Fuel','Hotel/Lodging','Lift Rental',
  'Meals','Mileage','Miscellaneous','Parking','Per Diem / Overnight','Tolls','Air / Land Travel'
];

var WO_EXPENSE_PAY_TYPES = [
  'Company Credit Card','Employee Paid Cash','Company Gas Card','Billed to Company Account'
];

// ---- STATE ----
var _woCurrentId  = null;
var _woTab        = 'labor';
var _woTimerInterval = null;
var _woTimerStart    = null;
var _woTimerType     = null;
var _hotNotesCb      = null;
var _hotNotesQueue   = [];

// ---- INIT ----
function initWorkOrdersPage() {
  if (!DB.workOrders) DB.workOrders = [];
  if (!DB.woLabor)    DB.woLabor    = [];
  if (!DB.woExpenses) DB.woExpenses = [];
  if (!DB.woParts)    DB.woParts    = [];
  if (!DB.woChecklist)DB.woChecklist= [];
  if (!DB.woSettings) DB.woSettings = {
    serviceTypes: WO_SERVICE_TYPES.slice(),
    expenseCats:  WO_EXPENSE_CATS.slice(),
    expensePayTypes: WO_EXPENSE_PAY_TYPES.slice(),
    defaultLaborRate: 125,
    defaultTaxRate: 0
  };
  renderWorkOrders();
}

// ---- RENDER LIST ----
function renderWorkOrders() {
  if (!DB.workOrders) DB.workOrders = [];
  var search   = ((document.getElementById('wo-search')||{}).value||'').toLowerCase();
  var fStatus  = (document.getElementById('wo-filter-status')||{}).value||'';
  var fPriority= (document.getElementById('wo-filter-priority')||{}).value||'';
  var fType    = (document.getElementById('wo-filter-type')||{}).value||'';

  var list = DB.workOrders.slice().sort(function(a,b){
    // Urgent first, then by date desc
    var pa = a.priority==='Urgent'?0:a.priority==='High'?1:a.priority==='Normal'?2:3;
    var pb = b.priority==='Urgent'?0:b.priority==='High'?1:b.priority==='Normal'?2:3;
    if (pa!==pb) return pa-pb;
    return (b.createdAt||'').localeCompare(a.createdAt||'');
  });

  // ---- PERMISSION FILTER — assignment-based, not role-hardcoded ----
  var myName  = _currentUser ? _currentUser.full_name : '';
  var myRole  = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager'||myRole==='back_office';

  if (!isAdmin && myName) {
    var myProfile = (DB.team||[]).find(function(m){ return m.name===myName; });
    var seeAllWOs = myProfile && myProfile.woViewMode === 'all';
    if (!seeAllWOs) {
      list = list.filter(function(w){
        return _isTechAssignedToWO(myName, w);
      });
    }
  }

  if (search) list = list.filter(function(w){
    return (w.woNumber||'').toLowerCase().includes(search) ||
           (w.customerName||'').toLowerCase().includes(search) ||
           (w.description||'').toLowerCase().includes(search);
  });
  if (fStatus)   list = list.filter(function(w){ return w.status === fStatus; });
  if (fPriority) list = list.filter(function(w){ return w.priority === fPriority; });
  if (fType)     list = list.filter(function(w){ return w.serviceType === fType; });

  // Stats bar
  var statsEl = document.getElementById('wo-stats-bar');
  if (statsEl) {
    var allWOs = DB.workOrders;
    var urgent  = allWOs.filter(function(w){ return w.priority==='Urgent' && w.status!=='Billed'&&w.status!=='Void'; }).length;
    var open    = allWOs.filter(function(w){ return WO_STATUSES.find(function(s){return s.id===w.status&&s.open;}); }).length;
    var review  = allWOs.filter(function(w){ return w.status==='Ready for Review'; }).length;
    var pricing = allWOs.filter(function(w){ return w.status==='Ready for Pricing'; }).length;
    statsEl.innerHTML =
      (urgent?'<div style="background:#c62828;color:#fff;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700;animation:pulse 1s infinite">🚨 '+urgent+' URGENT</div>':'') +
      '<div style="background:#e3f2fd;color:#1565c0;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">📋 '+open+' Open</div>' +
      (review?'<div style="background:#ffebee;color:#c62828;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">👁 '+review+' Ready for Review</div>':'') +
      (pricing?'<div style="background:#fff3e0;color:#e65100;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:700">💰 '+pricing+' Ready for Pricing</div>':'');
  }

  var body = document.getElementById('wo-list-body');
  if (!body) return;

  if (!list.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#90a4ae"><div style="font-size:32px;margin-bottom:8px">🔨</div><div>No work orders found.</div></div>';
    return;
  }

  var header = '<div style="display:grid;grid-template-columns:100px 1fr 1fr 120px 130px 120px auto;gap:8px;padding:10px 16px;background:#f8f9fa;border-bottom:1px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">' +
    '<div>WO #</div><div>Customer</div><div>Description</div><div>Type</div><div>Status</div><div>Priority</div><div>Actions</div></div>';

  var rows = list.map(function(wo) {
    var st = WO_STATUSES.find(function(s){ return s.id===wo.status; }) || { color:'#e0e0e0' };
    var prColor = wo.priority==='Urgent'?'#c62828':wo.priority==='High'?'#e65100':wo.priority==='Normal'?'#546e7a':'#90a4ae';
    var prBg    = wo.priority==='Urgent'?'#ffebee':wo.priority==='High'?'#fff3e0':'#f5f5f5';
    var isRole  = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='office'||_currentUser.role==='lead_tech');
    return '<div style="display:grid;grid-template-columns:100px 1fr 1fr 120px 130px 120px auto;gap:8px;padding:12px 16px;border-bottom:1px solid #f5f7fa;align-items:center" onmouseover="this.style.background=\'#f8f9fa\'" onmouseout="this.style.background=\'\'">'+
      '<div style="font-weight:700;color:#1565c0;font-size:13px">'+escHtml(wo.woNumber||'')+'</div>'+
      '<div style="font-weight:600;font-size:13px">'+escHtml(wo.customerName||'—')+'</div>'+
      '<div style="font-size:12px;color:#546e7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px">'+escHtml((wo.description||'').substring(0,60))+'</div>'+
      '<div style="font-size:11px;color:#546e7a">'+escHtml(wo.serviceType||'—')+'</div>'+
      '<div><span style="background:'+escHtml(st.color)+'33;border-left:3px solid '+escHtml(st.color)+';padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#1a2332">'+escHtml(wo.status||'')+'</span></div>'+
      '<div><span style="background:'+prBg+';color:'+prColor+';padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700">'+(wo.priority==='Urgent'?'🚨 ':'')+(wo.priority==='High'?'🟠 ':'')+escHtml(wo.priority||'Normal')+'</span></div>'+
      '<div style="display:flex;gap:4px">'+
        '<button class="btn btn-outline btn-sm" onclick="openWorkOrder(\''+wo.id+'\')">Open</button>'+
        (isRole?'<button class="btn btn-danger btn-sm" onclick="deleteWorkOrder(\''+wo.id+'\')">✕</button>':'')+
      '</div>'+
    '</div>';
  }).join('');

  body.innerHTML = header + rows;
}

// ---- OPEN / NEW ----
function openNewWorkOrder() {
  _woCurrentId = null;
  var today = getTodayISO();
  // Clear fields
  ['wo-customer-name','wo-customer-id','wo-description','wo-work-performed',
   'wo-ref-num','wo-site-addr','wo-site-city','wo-site-state','wo-site-zip',
   'wo-internal-notes','wo-date-followup'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var reqEl=document.getElementById('wo-date-requested'); if(reqEl) reqEl.value=today;
  document.getElementById('wo-modal-title').textContent='New Work Order';
  document.getElementById('wo-modal-num').textContent='';
  document.getElementById('wo-urgent-badge').style.display='none';
  document.getElementById('wo-btn-invoice').style.display='none';

  // Populate status dropdown
  _populateWOStatusSelect();
  // Set defaults
  var statusEl=document.getElementById('wo-status'); if(statusEl) statusEl.value='New';
  var priorityEl=document.getElementById('wo-priority'); if(priorityEl) priorityEl.value='Normal';
  _populateWOServiceTypeSelect();
  _populateWORepSelect(null);

  // Default labor/tax rates
  var settings = DB.woSettings || {};
  var lrEl=document.getElementById('wo-labor-rate'); if(lrEl) lrEl.value=settings.defaultLaborRate||125;
  var txEl=document.getElementById('wo-tax-rate');   if(txEl) txEl.value=settings.defaultTaxRate||0;

  // Contact dropdown empty
  var ctEl=document.getElementById('wo-contact'); if(ctEl) ctEl.innerHTML='<option value="">— Select customer first —</option>';

  // Internal notes only for office/owner
  var intSection=document.getElementById('wo-internal-notes-section');
  if(intSection) intSection.style.display=(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office'))?'':'none';

  switchWOTab('labor');
  openModal('modal-work-order');
}

function openWorkOrder(id) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===id; });
  if (!wo) return;
  _woCurrentId = id;

  document.getElementById('wo-modal-title').textContent='Work Order';
  document.getElementById('wo-modal-num').textContent=wo.woNumber||'';
  var urgBadge=document.getElementById('wo-urgent-badge');
  if(urgBadge) urgBadge.style.display=wo.priority==='Urgent'?'inline-block':'none';

  _populateWOStatusSelect();
  _populateWOServiceTypeSelect();
  _populateWORepSelect(wo.serviceRep);

  function sv(id,val){ var el=document.getElementById(id); if(el) el.value=val||''; }
  sv('wo-status',         wo.status||'New');
  sv('wo-priority',       wo.priority||'Normal');
  sv('wo-service-type',   wo.serviceType||'');
  sv('wo-customer-name',  wo.customerName||'');
  sv('wo-customer-id',    wo.customerId||'');
  sv('wo-description',    wo.description||'');
  sv('wo-work-performed', wo.workPerformed||'');
  sv('wo-ref-num',        wo.refNum||'');
  sv('wo-site-addr',      wo.siteAddr||'');
  sv('wo-site-city',      wo.siteCity||'');
  sv('wo-site-state',     wo.siteState||'');
  sv('wo-site-zip',       wo.siteZip||'');
  sv('wo-date-requested', wo.dateRequested||'');
  sv('wo-date-followup',  wo.dateFollowup||'');
  sv('wo-labor-rate',     wo.laborRate||'');
  sv('wo-tax-rate',       wo.taxRate||'');
  sv('wo-internal-notes', wo.internalNotes||'');

  // Populate contacts for this customer
  _populateWOContacts(wo.customerId, wo.contactId);

  // Show/hide invoice button
  var invBtn = document.getElementById('wo-btn-invoice');
  if(invBtn) invBtn.style.display=(wo.status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office')))?'':'none';

  // Internal notes visibility
  var intSection=document.getElementById('wo-internal-notes-section');
  if(intSection) intSection.style.display=(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office'))?'':'none';

  switchWOTab('labor');
  openModal('modal-work-order');

  // Hot notes
  _checkHotNotes(wo.customerId, wo.id, false);
}

function _checkHotNotes(customerId, woId, isNew) {
  var cust = (DB.customers||[]).find(function(c){ return c.id===customerId; });
  if (!cust) return;
  var isOffice = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='office');
  var isTech   = _currentUser && (_currentUser.role==='field'||_currentUser.role==='lead_tech');
  var queue = [];

  // Tech hot note — show every open unless acknowledged for this WO
  if ((isTech||isOffice) && cust.hotNoteTech) {
    var ackKey = 'hotnote_ack_'+woId;
    var acked  = isNew ? false : (sessionStorage.getItem(ackKey) === '1');
    if (!acked) {
      queue.push({ title:'⚡ Tech Notice — '+escHtml(cust.name), body:cust.hotNoteTech, icon:'⚡', ackKey:ackKey });
    }
  }
  // Office hot note — show only for office/owner on NEW orders
  if (isOffice && isNew && cust.hotNoteOffice) {
    queue.push({ title:'🏢 Office Notice — '+escHtml(cust.name), body:cust.hotNoteOffice, icon:'🏢', ackKey:null });
  }

  if (queue.length) _showHotNotesQueue(queue);
}

var _hotNotesQueueItems = [];
function _showHotNotesQueue(items) {
  _hotNotesQueueItems = items.slice();
  _showNextHotNote();
}
function _showNextHotNote() {
  if (!_hotNotesQueueItems.length) return;
  var item = _hotNotesQueueItems[0];
  var popup = document.getElementById('hot-notes-popup');
  document.getElementById('hot-notes-icon').textContent = item.icon||'⚡';
  document.getElementById('hot-notes-title').textContent = item.title||'Customer Notice';
  document.getElementById('hot-notes-body').textContent  = item.body||'';
  if(popup) popup.style.display='flex';
}
function dismissHotNotes() {
  var item = _hotNotesQueueItems.shift();
  if (item && item.ackKey) sessionStorage.setItem(item.ackKey, '1');
  var popup = document.getElementById('hot-notes-popup');
  if (_hotNotesQueueItems.length) {
    _showNextHotNote();
  } else {
    if(popup) popup.style.display='none';
  }
}

// ---- SAVE ----
function saveWorkOrder() {
  var custName = (document.getElementById('wo-customer-name')||{}).value||'';
  var desc     = (document.getElementById('wo-description')||{}).value||'';
  if (!custName.trim()) { showToast('Customer is required','error'); return; }
  if (!desc.trim())     { showToast('Work description is required','error'); return; }

  if (!DB.workOrders) DB.workOrders = [];
  var isNew = !_woCurrentId;
  var id    = _woCurrentId || ('wo-'+Date.now());
  var today = getTodayISO();

  function gv(eid){ var el=document.getElementById(eid); return el?el.value.trim():''; }

  var status   = gv('wo-status') || 'New';
  var priority = gv('wo-priority') || 'Normal';

  // Auto-generate WO number for new
  var woNum;
  if (isNew) {
    DB.woSeq = (DB.woSeq||1000) + 1;
    woNum = 'WO-' + DB.woSeq;
  } else {
    var existing = DB.workOrders.find(function(w){ return w.id===id; });
    woNum = existing ? existing.woNumber : 'WO-?';
  }

  // Auto-set dateOpened when time is logged
  var labor = (DB.woLabor||[]).filter(function(l){ return l.woId===id; });
  var dateOpened = null;
  if (labor.length) dateOpened = labor[0].clockIn ? labor[0].clockIn.substring(0,10) : today;

  var data = {
    id:           id,
    woNumber:     woNum,
    customerId:   gv('wo-customer-id'),
    customerName: custName,
    contactId:    gv('wo-contact'),
    description:  desc,
    workPerformed:gv('wo-work-performed'),
    status:       status,
    priority:     priority,
    serviceType:  gv('wo-service-type'),
    serviceRep:   gv('wo-service-rep'),
    refNum:       gv('wo-ref-num'),
    siteAddr:     gv('wo-site-addr'),
    siteCity:     gv('wo-site-city'),
    siteState:    gv('wo-site-state'),
    siteZip:      gv('wo-site-zip'),
    dateRequested:gv('wo-date-requested'),
    dateFollowup: gv('wo-date-followup'),
    dateOpened:   dateOpened,
    dateClosed:   (!WO_STATUSES.find(function(s){return s.id===status&&s.open;}))?today:null,
    laborRate:    parseFloat(gv('wo-labor-rate'))||125,
    taxRate:      parseFloat(gv('wo-tax-rate'))||0,
    internalNotes:(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office'))?gv('wo-internal-notes'):'',
    createdAt:    isNew ? new Date().toISOString() : ((DB.workOrders.find(function(w){return w.id===id;})||{}).createdAt||new Date().toISOString()),
    updatedAt:    new Date().toISOString(),
    createdBy:    isNew ? ((_currentUser&&_currentUser.id)||null) : ((DB.workOrders.find(function(w){return w.id===id;})||{}).createdBy||null),
    createdByName:isNew ? ((_currentUser&&_currentUser.full_name)||'Unknown') : ((DB.workOrders.find(function(w){return w.id===id;})||{}).createdByName||'Unknown')
  };

  if (isNew) {
    DB.workOrders.push(data);
    _woCurrentId = id;
  } else {
    var idx = DB.workOrders.findIndex(function(w){ return w.id===id; });
    if (idx>=0) DB.workOrders[idx]=data; else DB.workOrders.push(data);
  }

  // Update invoice button visibility
  var invBtn=document.getElementById('wo-btn-invoice');
  if(invBtn) invBtn.style.display=(status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office')))?'':'none';

  // Urgent notification
  if (priority==='Urgent') _triggerUrgentAlert(data);

  // ---- AUDIT ----
  if (typeof auditLog === 'function') {
    if (isNew) {
      auditLog('wo_created', 'work_order', id, { note: woNum+' — '+custName+' — '+status });
    } else {
      var _prevWO = DB.workOrders.find(function(w){ return w.id===id; });
      var _prevStatus = _prevWO ? _prevWO.status : null;
      if (_prevStatus && _prevStatus !== status) {
        auditWOStatus(id, woNum, _prevStatus, status);
      } else {
        auditLog('wo_saved', 'work_order', id, { note: woNum+' — '+custName });
      }
    }
  }

  // Push to Supabase
  _pushWOToCloud(data);
  saveDB();
  renderWorkOrders();
  showToast('Work Order '+woNum+' saved ✓','success');
  document.getElementById('wo-modal-num').textContent=woNum;
  document.getElementById('wo-modal-title').textContent='Work Order';
  // Refresh assigned techs section now that WO is saved
  setTimeout(function(){ renderAssignedTechs(id); }, 100);
}

function _triggerUrgentAlert(wo) {
  // In-app bell notification
  var count = parseInt((document.getElementById('notif-count')||{}).textContent||'0') + 1;
  var countEl = document.getElementById('notif-count');
  if (countEl) { countEl.textContent=count; countEl.style.display=''; }
  showToast('🚨 URGENT Work Order: '+escHtml(wo.customerName||'')+' — '+escHtml((wo.description||'').substring(0,50)), 'error', 8000);
  // SMS via Twilio — queued for when Twilio is wired
  if (typeof sendUrgentWOSMS === 'function') sendUrgentWOSMS(wo);
}

function deleteWorkOrder(id) {
  if (!confirm('Delete this work order? This cannot be undone.')) return;
  DB.workOrders = (DB.workOrders||[]).filter(function(w){ return w.id!==id; });
  if (_sb && _currentUser) _sb.from('work_orders').delete().eq('id',id).then(function(){});
  saveDB(); renderWorkOrders();
  showToast('Work order deleted','info');
}

// ---- STATUS CHANGE ----
function onWOStatusChange(status) {
  var urgBadge=document.getElementById('wo-urgent-badge');
  var invBtn=document.getElementById('wo-btn-invoice');
  if(invBtn) invBtn.style.display=(status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office')))?'':'none';
}
function onWOPriorityChange(val) {
  var badge=document.getElementById('wo-urgent-badge');
  if(badge) badge.style.display=val==='Urgent'?'inline-block':'none';
}

// ---- CUSTOMER AUTOCOMPLETE ----
function onWOCustomerInput(val) {
  var drop=document.getElementById('wo-customer-dropdown');
  if (!drop) return;
  if (!val||val.length<1) { drop.style.display='none'; return; }
  var matches=(DB.customers||[]).filter(function(c){ return (c.name||'').toLowerCase().includes(val.toLowerCase()); }).slice(0,8);
  if (!matches.length) { drop.style.display='none'; return; }
  drop.innerHTML=matches.map(function(c){
    return '<div onmousedown="selectWOCustomer(\''+c.id+'\',\''+escHtml(c.name)+'\')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f4f8;font-size:13px" onmouseover="this.style.background=\'#f0f4f8\'" onmouseout="this.style.background=\'\'">'+
      '<div style="font-weight:600">'+escHtml(c.name)+'</div>'+
      (c.phone?'<div style="font-size:11px;color:#90a4ae">'+escHtml(c.phone)+'</div>':'')+
    '</div>';
  }).join('');
  drop.style.display='block';
}

function selectWOCustomer(id, name) {
  var nameEl=document.getElementById('wo-customer-name'); if(nameEl) nameEl.value=name;
  var idEl=document.getElementById('wo-customer-id');     if(idEl)   idEl.value=id;
  var drop=document.getElementById('wo-customer-dropdown'); if(drop) drop.style.display='none';

  // Fill contacts
  _populateWOContacts(id, null);

  // Fill site address from customer
  var cust=(DB.customers||[]).find(function(c){ return c.id===id; });
  if (cust) {
    var settings = DB.woSettings||{};
    var lr = document.getElementById('wo-labor-rate');
    if (lr && cust.laborRate) lr.value=cust.laborRate;
    else if (lr) lr.value = settings.defaultLaborRate||125;
    var addrEl=document.getElementById('wo-site-addr');
    var cityEl=document.getElementById('wo-site-city');
    var stEl=document.getElementById('wo-site-state');
    var zipEl=document.getElementById('wo-site-zip');
    if(addrEl&&!addrEl.value) addrEl.value=cust.street||cust.address||'';
    if(cityEl&&!cityEl.value) cityEl.value=cust.city||'';
    if(stEl&&!stEl.value)     stEl.value=cust.state||'';
    if(zipEl&&!zipEl.value)   zipEl.value=cust.zip||'';
  }

  // Check hot notes for new WO (isNew=true for customer selection)
  if (!_woCurrentId) _checkHotNotes(id, 'new', true);
}

function _populateWOContacts(customerId, selectedContactId) {
  var sel=document.getElementById('wo-contact');
  if (!sel) return;
  var contacts=(DB.contacts||[]).filter(function(c){ return c.customerId===customerId; });
  sel.innerHTML='<option value="">— Select contact —</option>'+
    contacts.map(function(c){ return '<option value="'+escHtml(c.id)+'"'+(c.id===selectedContactId?' selected':'')+'>'+escHtml(c.name||'')+(c.role?' — '+escHtml(c.role):'')+'</option>'; }).join('');
}

function _populateWOStatusSelect() {
  var sel=document.getElementById('wo-status');
  if (!sel) return;
  var statuses = (DB.woSettings&&DB.woSettings.statuses&&DB.woSettings.statuses.length) ? DB.woSettings.statuses : WO_STATUSES;
  sel.innerHTML=statuses.map(function(s){
    return '<option value="'+escHtml(s.id||s)+'">'+escHtml(s.id||s)+'</option>';
  }).join('');
}

function _populateWOServiceTypeSelect() {
  var sel=document.getElementById('wo-service-type');
  if (!sel) return;
  var types = (DB.woSettings&&DB.woSettings.serviceTypes&&DB.woSettings.serviceTypes.length) ? DB.woSettings.serviceTypes : WO_SERVICE_TYPES;
  sel.innerHTML='<option value="">— Service Type —</option>'+
    types.map(function(t){ return '<option value="'+escHtml(t)+'">'+escHtml(t)+'</option>'; }).join('');
}

function _populateWORepSelect(currentRep) {
  var sel=document.getElementById('wo-service-rep');
  if (!sel) return;
  var fieldOnly = ['field','helper_tech','subcontractor'];
  sel.innerHTML='<option value="">— Assign Rep —</option>'+
    (DB.team||[]).filter(function(t){
      var role = t.access || t.systemRole || t.role || 'field';
      return t.active!==false && fieldOnly.indexOf(role) < 0;
    }).sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
    .map(function(t){
      return '<option value="'+escHtml(t.name||'')+'"'+(t.name===currentRep?' selected':'')+'>'+escHtml(t.name||'')+'</option>';
    }).join('');
}

// ---- TABS ----
function switchWOTab(tab) {
  _woTab = tab;
  document.querySelectorAll('.wo-tab').forEach(function(t){ t.classList.remove('active'); });
  var btn=document.getElementById('wotab-'+tab); if(btn) btn.classList.add('active');
  var content=document.getElementById('wo-tab-content');
  if (!content) return;
  var id = _woCurrentId;
  if (tab==='labor')     content.innerHTML = renderWOLaborTab(id);
  if (tab==='expenses')  content.innerHTML = renderWOExpensesTab(id);
  if (tab==='parts')     content.innerHTML = renderWOPartsTab(id);
  if (tab==='checklist') content.innerHTML = renderWOChecklistTab(id);
  if (tab==='comments')  content.innerHTML = (typeof renderCommsLog==='function') ? '<div style="margin-bottom:12px"><button class="btn btn-outline btn-sm" onclick="openCommsModal(\'\',\''+id+'\')">+ Log Communication</button></div>' + renderCommsLog(null, id) : '';
  if (tab==='photos')    { content.innerHTML = '<div id="wo-photos-inner-'+id+'"></div>'; if(typeof renderJobPhotosSection==='function') renderJobPhotosSection(id); }
}

// ---- LABOR TAB ----
function renderWOLaborTab(woId) {
  var entries = (DB.woLabor||[]).filter(function(l){ return l.woId===woId; });
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });

  // ---- SUMMARY: hours by tech ----
  var techMap = {};
  entries.forEach(function(e) {
    var t = e.techName||'Unknown';
    var type = (e.entryType||'work').toLowerCase();
    if (!techMap[t]) techMap[t] = { work:0, travel:0 };
    if (type==='travel') techMap[t].travel += parseFloat(e.hours)||0;
    else techMap[t].work += parseFloat(e.hours)||0;
  });
  var totalWork   = entries.filter(function(e){return (e.entryType||'work')!=='travel';}).reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0);
  var totalTravel = entries.filter(function(e){return (e.entryType||'work')==='travel';}).reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0);
  var totalAll    = totalWork + totalTravel;

  var html = '<div style="margin-bottom:16px">';

  if (!entries.length) {
    html += '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No labor logged yet. Use the timers at the bottom or add a manual entry.</div>';
    html += '<button class="btn btn-outline btn-sm" onclick="addWOLaborEntry()">+ Add Manual Entry</button>';
    return html + '</div>';
  }

  // Summary table
  html +=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
      '<div style="font-weight:700;font-size:14px">Total: '+totalAll.toFixed(1)+' hrs</div>'+
      '<button class="btn btn-outline btn-sm" onclick="addWOLaborEntry()">+ Add Manual Entry</button>'+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">'+
      '<thead><tr style="background:#f0f4f8">'+
        '<th style="padding:8px 10px;text-align:left;font-weight:700;color:#546e7a;font-size:11px;text-transform:uppercase">Technician</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#546e7a;font-size:11px;text-transform:uppercase">Work Hrs</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#546e7a;font-size:11px;text-transform:uppercase">Travel Hrs</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#1565c0;font-size:11px;text-transform:uppercase">Total Hrs</th>'+
      '</tr></thead><tbody>';

  Object.keys(techMap).sort().forEach(function(name) {
    var t = techMap[name];
    var tot = t.work + t.travel;
    html +=
      '<tr style="border-bottom:1px solid #f0f4f8">'+
        '<td style="padding:9px 10px;font-weight:600">'+escHtml(name)+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+t.work.toFixed(1)+'</td>'+
        '<td style="padding:9px 10px;text-align:center;color:#e65100">'+t.travel.toFixed(1)+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#1565c0">'+tot.toFixed(1)+'</td>'+
      '</tr>';
  });

  // Totals row
  html +=
      '<tr style="background:#f8f9fa;border-top:2px solid #e0e7ef">'+
        '<td style="padding:9px 10px;font-weight:700">Total</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700">'+totalWork.toFixed(1)+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#e65100">'+totalTravel.toFixed(1)+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#1565c0">'+totalAll.toFixed(1)+'</td>'+
      '</tr>'+
    '</tbody></table>';

  // ---- DETAIL LOG — grouped by date chronologically ----
  // Also pull from timeEntries linked to this WO
  var teEntries = (DB.timeEntries||[]).filter(function(e){
    return !e.deleted && (e.woId===woId || e.jobId===woId);
  });

  // Merge woLabor + timeEntries, deduplicate by id
  var allEntries = entries.slice();
  teEntries.forEach(function(te){
    if (!allEntries.find(function(e){ return e.id===te.id; })) {
      allEntries.push({
        id:te.id, woId:te.woId, techName:te.techName,
        entryType:te.entryType||'work', hours:te.totalHours||0,
        clockIn:te.date+(te.startTime?'T'+te.startTime+':00':''),
        clockOut:te.date+(te.endTime?'T'+te.endTime+':00':''),
        notes:te.notes||'', isManual:te.isManual, addedBy:te.addedBy,
        createdAt:te.createdAt||te.date
      });
    }
  });

  var byDate = {};
  allEntries.forEach(function(e){
    var d = (e.clockIn||'').split('T')[0] || (e.createdAt||'').split('T')[0] || 'Unknown';
    if (!byDate[d]) byDate[d]=[];
    byDate[d].push(e);
  });

  var dateKeys = Object.keys(byDate).sort(); // chronological order
  var isAdmin  = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='office'||_currentUser.role==='manager'||_currentUser.role==='lead_tech');
  var myName   = _currentUser ? _currentUser.full_name : '';

  html += '<div style="border-top:2px solid #e0e7ef;padding-top:14px">'+
    '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Detail Log</div>';

  if (!dateKeys.length) {
    html += '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No detail entries yet.</div>';
  }

  dateKeys.forEach(function(dateKey){
    var dayEntries = byDate[dateKey].sort(function(a,b){ return (a.clockIn||'').localeCompare(b.clockIn||''); });
    var dateLabel  = dateKey==='Unknown' ? 'Unknown Date' : new Date(dateKey+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
    var dayTotal   = dayEntries.reduce(function(s,e){ return s+(parseFloat(e.hours)||0); },0);

    html += '<div style="margin-bottom:14px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;background:#f0f4f8;padding:7px 12px;border-radius:8px;margin-bottom:6px">'+
        '<span style="font-weight:700;font-size:13px;color:#1565c0">'+escHtml(dateLabel)+'</span>'+
        '<span style="font-size:12px;font-weight:700;color:#546e7a">'+dayTotal.toFixed(1)+' hrs</span>'+
      '</div>';

    dayEntries.forEach(function(e){
      var hrs      = parseFloat(e.hours)||0;
      var type     = (e.entryType||'work').toLowerCase();
      var isTravel = type==='travel';
      var isLunch  = type==='lunch';
      var borderC  = isTravel?'#ff8f00':isLunch?'#9e9e9e':'#1565c0';
      var badgeBg  = isTravel?'#fff3e0':isLunch?'#f5f5f5':'#e3f2fd';
      var badgeC   = isTravel?'#e65100':isLunch?'#546e7a':'#1565c0';
      var typeLabel= type.charAt(0).toUpperCase()+type.slice(1);
      var timeIn   = e.clockIn  && e.clockIn.includes('T')  ? new Date(e.clockIn).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})  : '';
      var timeOut  = e.clockOut && e.clockOut.includes('T') ? new Date(e.clockOut).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : '';
      var canEdit  = isAdmin || e.techName===myName;

      html += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-left:3px solid '+borderC+';margin-bottom:5px;background:#fff;border-radius:0 8px 8px 0;box-shadow:0 1px 3px rgba(0,0,0,.05)">'+
        '<div style="flex:1">'+
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'+
            '<span style="font-weight:700;font-size:13px">'+escHtml(e.techName||'Unknown')+'</span>'+
            '<span style="background:'+badgeBg+';color:'+badgeC+';padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;text-transform:uppercase">'+typeLabel+'</span>'+
            (e.isManual?'<span style="background:#f3e5f5;color:#6a1b9a;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700">MANUAL</span>':'')+
          '</div>'+
          (timeIn||timeOut?
            '<div style="font-size:11px;color:#546e7a;margin-bottom:3px">'+
              (timeIn?'<span style="background:#f8f9fa;border-radius:4px;padding:1px 5px">In: '+timeIn+'</span> ':'')+
              (timeOut?'<span style="background:#f8f9fa;border-radius:4px;padding:1px 5px">Out: '+timeOut+'</span>':'')+
            '</div>':'')+
          (e.notes?
            '<div style="font-size:12px;color:#37474f;background:#fafafa;border-left:2px solid #e0e7ef;padding:5px 8px;border-radius:0 4px 4px 0;margin-top:3px;line-height:1.4">'+
              escHtml(e.notes)+
            '</div>':'')+ 
        '</div>'+
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;min-width:64px">'+
          '<span style="font-weight:700;font-size:14px;color:'+borderC+'">'+hrs.toFixed(1)+' hrs</span>'+
          (canEdit?'<button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px" onclick="deleteWOLabor(\''+e.id+'\')">✕</button>':'')+
        '</div>'+
      '</div>';
    });
    html += '</div>';
  });

  html += '</div></div>';
  return html;
}

function addWOLaborEntry() {
  var woId = _woCurrentId;
  if (!woId) { showToast('Save the work order first','error'); return; }
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });

  // Use the new time entry modal if available
  if (typeof openAddTimeEntry === 'function') {
    // Pre-fill date from WO
    var prefillDate = wo && wo.dateOpened ? wo.dateOpened : getTodayISO();
    openAddTimeEntry('', prefillDate, woId);
    return;
  }

  // Fallback if modal not available
  var techName = prompt('Tech name:'); if (!techName||!techName.trim()) return;
  var hoursStr = prompt('Hours worked (e.g. 1.5):'); if (!hoursStr) return;
  var hours = parseFloat(hoursStr)||0; if (!hours) { showToast('Invalid hours','error'); return; }
  var notes = prompt('Notes (optional):','') || '';
  if (!DB.woLabor) DB.woLabor=[];
  DB.woLabor.push({ id:'wol-'+Date.now(), woId:woId, techName:techName.trim(), entryType:'work', hours:hours, notes:notes, clockIn:new Date().toISOString(), createdAt:new Date().toISOString() });
  var woRec=(DB.workOrders||[]).find(function(w){return w.id===woId;});
  if (woRec&&woRec.status==='New'){woRec.status='Open';var sel=document.getElementById('wo-status');if(sel)sel.value='Open';}
  autoPromoteWOStatus(woId);
  saveDB(); switchWOTab('labor');
  showToast('Labor entry added','success');
}

function deleteWOLabor(id) {
  if(!confirm('Remove this labor entry?')) return;
  DB.woLabor=(DB.woLabor||[]).filter(function(l){return l.id!==id;});
  saveDB(); switchWOTab('labor');
}

// ---- TIMERS ----
function woStartTimer(type) {
  if (_woTimerInterval) { woStopTimer(); return; }
  if (!_woCurrentId) { saveWorkOrder(); }
  _woTimerType  = type;
  _woTimerStart = Date.now();
  var workBtn=document.getElementById('wo-timer-work-btn');
  var travBtn=document.getElementById('wo-timer-travel-btn');
  if(workBtn) workBtn.textContent = type==='work' ? '⏹ Stop Work Timer' : '▶ Work Timer';
  if(travBtn) travBtn.textContent = type==='travel' ? '⏹ Stop Travel Timer' : '🚗 Travel Timer';
  _woTimerInterval = setInterval(function(){
    var elapsed = Math.floor((Date.now()-_woTimerStart)/1000);
    var h=Math.floor(elapsed/3600), m=Math.floor((elapsed%3600)/60), s=elapsed%60;
    var disp=document.getElementById('wo-timer-display');
    if(disp) disp.textContent=(type==='work'?'⏱ ':'🚗 ')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  },1000);
}

function woStopTimer() {
  if (!_woTimerInterval) return;
  clearInterval(_woTimerInterval); _woTimerInterval=null;
  var hours = (Date.now()-_woTimerStart)/3600000;
  var roundedHours = Math.round(hours*4)/4; // round to nearest 15 min
  if(!DB.woLabor) DB.woLabor=[];
  DB.woLabor.push({
    id: 'wol-'+Date.now(),
    woId: _woCurrentId,
    techName: (_currentUser&&_currentUser.full_name)||'Unknown',
    entryType: _woTimerType||'work',
    hours: roundedHours,
    clockIn: new Date(_woTimerStart).toISOString(),
    clockOut: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });
  // Auto-set status to Open
  var wo=(DB.workOrders||[]).find(function(w){return w.id===_woCurrentId;});
  if(wo&&wo.status==='New'){wo.status='Open';var sel=document.getElementById('wo-status');if(sel)sel.value='Open';}
  var disp=document.getElementById('wo-timer-display'); if(disp) disp.textContent='';
  var workBtn=document.getElementById('wo-timer-work-btn'); if(workBtn) workBtn.textContent='▶ Work Timer';
  var travBtn=document.getElementById('wo-timer-travel-btn'); if(travBtn) travBtn.textContent='🚗 Travel Timer';
  saveDB(); switchWOTab('labor');
  showToast(roundedHours.toFixed(2)+' hrs logged ('+_woTimerType+')','success');
}

// ---- EXPENSES TAB ----
function renderWOExpensesTab(woId) {
  var entries = (DB.woExpenses||[]).filter(function(e){ return e.woId===woId; });
  var total   = entries.reduce(function(s,e){ return s+parseFloat(e.amount||0); },0);
  var settings= DB.woSettings||{};
  var cats    = settings.expenseCats||WO_EXPENSE_CATS;
  var payTypes= settings.expensePayTypes||WO_EXPENSE_PAY_TYPES;

  var html = '<div style="margin-bottom:12px"><strong>Total Expenses: $'+total.toFixed(2)+'</strong></div>';
  html += '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:12px">'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 0.7fr 1fr 0.7fr auto;gap:8px;align-items:end">'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Category</label>'+
        '<select id="woe-cat" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
          cats.map(function(c){return '<option>'+escHtml(c)+'</option>';}).join('')+'</select></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Description</label>'+
        '<input id="woe-desc" placeholder="Details..." style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px"></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Amount ($)</label>'+
        '<input id="woe-amt" type="number" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px"></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Paid By</label>'+
        '<select id="woe-pay" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
          payTypes.map(function(p){return '<option>'+escHtml(p)+'</option>';}).join('')+'</select></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Date</label>'+
        '<input id="woe-date" type="date" value="'+getTodayISO()+'" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px"></div>'+
      '<div><button class="btn btn-primary btn-sm" style="margin-top:18px" onclick="addWOExpense()">Add</button></div>'+
    '</div>'+
  '</div>';

  if (!entries.length) return html+'<div style="color:#90a4ae;font-size:13px">No expenses logged yet.</div>';

  html += entries.map(function(e){
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #f0f4f8">'+
      '<div style="flex:1">'+
        '<div style="font-weight:600;font-size:13px">'+escHtml(e.category||'')+'</div>'+
        '<div style="font-size:11px;color:#546e7a">'+escHtml(e.description||'')+' · '+escHtml(e.paymentType||'')+' · '+escHtml(e.date||'')+'</div>'+
      '</div>'+
      '<div style="font-weight:700;color:#1565c0">$'+parseFloat(e.amount||0).toFixed(2)+'</div>'+
      '<button class="btn btn-danger btn-sm" onclick="deleteWOExpense(\''+e.id+'\')">✕</button>'+
    '</div>';
  }).join('');
  return html;
}

function addWOExpense() {
  var woId=_woCurrentId; if(!woId){showToast('Save the work order first','error');return;}
  var amt=parseFloat((document.getElementById('woe-amt')||{}).value)||0;
  if(!amt){showToast('Enter an amount','error');return;}
  if(!DB.woExpenses) DB.woExpenses=[];
  DB.woExpenses.push({
    id:'woe-'+Date.now(), woId:woId,
    category:(document.getElementById('woe-cat')||{}).value||'',
    description:(document.getElementById('woe-desc')||{}).value||'',
    amount:amt,
    paymentType:(document.getElementById('woe-pay')||{}).value||'',
    date:(document.getElementById('woe-date')||{}).value||getTodayISO(),
    loggedBy:(_currentUser&&_currentUser.full_name)||'Unknown',
    createdAt:new Date().toISOString()
  });
  saveDB(); switchWOTab('expenses');
  showToast('Expense added','success');
}

function deleteWOExpense(id) {
  if(!confirm('Remove this expense?'))return;
  DB.woExpenses=(DB.woExpenses||[]).filter(function(e){return e.id!==id;});
  saveDB(); switchWOTab('expenses');
}

// ---- PARTS TAB ----
function renderWOPartsTab(woId) {
  var parts    = (DB.woParts||[]).filter(function(p){ return p.woId===woId; });
  var isOffice = _currentUser&&(_currentUser.role==='owner'||_currentUser.role==='office'||_currentUser.role==='lead_tech');

  // Counts by status
  var requested = parts.filter(function(p){ return p.status==='requested'; });
  var ordered   = parts.filter(function(p){ return p.status==='ordered'; });
  var received  = parts.filter(function(p){ return p.status==='received'; });
  var partial   = parts.filter(function(p){ return p.status==='partial'; });

  var html = '<div>';

  // Add part form (office/lead only)
  if (isOffice) {
    html +=
      '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px">'+
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin-bottom:8px">Request a Part</div>'+
        '<div style="display:grid;grid-template-columns:1fr 80px 1fr auto;gap:8px;align-items:end">'+
          '<div><input id="wop-name" placeholder="Part name / search catalog..." list="wop-catalog-list" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box">'+
          '<datalist id="wop-catalog-list">'+
            (DB.catalog||[]).map(function(c){return '<option value="'+escHtml(c.desc||c.name||'')+'">'+escHtml(c.part||'')+'</option>';}).join('')+
          '</datalist></div>'+
          '<div><input id="wop-qty" type="number" min="1" value="1" placeholder="Qty" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
          '<div><input id="wop-notes" placeholder="Notes / part #..." style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
          '<div><button class="btn btn-primary btn-sm" onclick="addWOPart()">+ Request</button></div>'+
        '</div>'+
      '</div>';
  } else {
    // Field tech — simple request form
    html +=
      '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px">'+
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin-bottom:8px">Request a Part</div>'+
        '<div style="display:grid;grid-template-columns:1fr 80px auto;gap:8px;align-items:end">'+
          '<div><input id="wop-name" placeholder="Part name..." style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
          '<div><input id="wop-qty" type="number" min="1" value="1" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box"></div>'+
          '<div><button class="btn btn-primary btn-sm" onclick="addWOPart()">Request</button></div>'+
        '</div>'+
      '</div>';
  }

  if (!parts.length) {
    return html + '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No parts on this work order yet.</div></div>';
  }

  // Create PO button if there are requested parts
  if (isOffice && requested.length) {
    html +=
      '<div style="margin-bottom:12px">'+
        '<button class="btn btn-outline btn-sm" onclick="createPOFromWOParts(\''+woId+'\')">📦 Create PO from '+requested.length+' Requested Part'+(requested.length!==1?'s':'')+' </button>'+
      '</div>';
  }

  function renderGroup(label, icon, groupParts, color, bgColor) {
    if (!groupParts.length) return '';
    var out = '<div style="margin-bottom:16px">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
        '<span style="font-size:15px">'+icon+'</span>'+
        '<span style="font-weight:700;font-size:13px;color:'+color+'">'+label+'</span>'+
        '<span style="background:'+bgColor+';color:'+color+';padding:1px 8px;border-radius:10px;font-size:11px;font-weight:700">'+groupParts.length+'</span>'+
      '</div>';

    out += '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
      '<thead><tr style="background:#f8f9fa">'+
        '<th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Part</th>'+
        '<th style="padding:7px 10px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Qty</th>'+
        '<th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">'+
          (label.includes('Received') ? 'Received By / Date' : 'Requested By')+
        '</th>'+
        (isOffice?'<th style="padding:7px 10px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Status</th>':'')+
        (isOffice?'<th style="padding:7px 10px;width:32px"></th>':'')+
      '</tr></thead><tbody>';

    groupParts.forEach(function(p) {
      var receivedInfo = '';
      if (p.status==='received'||p.status==='partial') {
        receivedInfo = (p.receivedBy||p.requestedBy||'') + (p.receivedDate ? ' · '+p.receivedDate : '');
      } else {
        receivedInfo = p.requestedBy||'';
      }
      out += '<tr style="border-bottom:1px solid #f0f4f8">'+
        '<td style="padding:9px 10px">'+
          '<div style="font-weight:600">'+escHtml(p.name||'')+'</div>'+
          (p.partNum?'<div style="font-size:11px;color:#90a4ae">'+escHtml(p.partNum)+'</div>':'')+
          (p.notes?'<div style="font-size:11px;color:#546e7a;font-style:italic">'+escHtml(p.notes)+'</div>':'')+
        '</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700">'+escHtml(String(p.qty||1))+'</td>'+
        '<td style="padding:9px 10px;font-size:12px;color:#546e7a">'+escHtml(receivedInfo)+'</td>'+
        (isOffice?
          '<td style="padding:9px 10px;text-align:center">'+
            '<select onchange="updateWOPartStatus(\''+p.id+'\',this.value)" style="padding:4px 6px;border:1px solid #e0e7ef;border-radius:4px;font-size:11px">'+
              ['requested','ordered','received','partial'].map(function(s){
                return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+s.charAt(0).toUpperCase()+s.slice(1)+'</option>';
              }).join('')+
            '</select>'+
          '</td>':'')+
        (isOffice?'<td style="padding:9px 10px;text-align:center"><button class="btn btn-danger btn-sm" onclick="deleteWOPart(\''+p.id+'\')">✕</button></td>':'')+
      '</tr>';
    });

    out += '</tbody></table></div>';
    return out;
  }

  html += renderGroup('Requested — Needs Ordering', '🔴', requested, '#c62828', '#ffebee');
  html += renderGroup('Ordered — In Transit',       '⏳', ordered,   '#1565c0', '#e3f2fd');
  html += renderGroup('Partially Received',          '🔶', partial,   '#e65100', '#fff3e0');
  html += renderGroup('Received — On Hand',          '✅', received,  '#2e7d32', '#e8f5e9');

  return html + '</div>';
}

function addWOPart() {
  var woId=_woCurrentId; if(!woId){showToast('Save the work order first','error');return;}
  var name=(document.getElementById('wop-name')||{}).value||'';
  if(!name.trim()){showToast('Enter a part name','error');return;}
  if(!DB.woParts) DB.woParts=[];
  DB.woParts.push({ id:'wop-'+Date.now(), woId:woId, name:name.trim(), qty:parseFloat((document.getElementById('wop-qty')||{}).value)||1, notes:(document.getElementById('wop-notes')||{}).value||'', status:'requested', requestedBy:(_currentUser&&_currentUser.full_name)||'Unknown', createdAt:new Date().toISOString() });
  // Auto-update WO status to Parts Needed
  var wo=(DB.workOrders||[]).find(function(w){return w.id===woId;});
  if(wo&&(wo.status==='New'||wo.status==='Open')){wo.status='Parts Needed';var sel=document.getElementById('wo-status');if(sel)sel.value='Parts Needed';}
  saveDB(); switchWOTab('parts');
  showToast('Part requested','success');
}

function updateWOPartStatus(id,status) {
  var part=(DB.woParts||[]).find(function(p){return p.id===id;});
  if(part){part.status=status; saveDB(); switchWOTab('parts');}
}

function deleteWOPart(id) {
  if(!confirm('Remove this part request?'))return;
  DB.woParts=(DB.woParts||[]).filter(function(p){return p.id!==id;});
  saveDB(); switchWOTab('parts');
}

// ---- CHECKLIST TAB ----
function renderWOChecklistTab(woId) {
  var items=(DB.woChecklist||[]).filter(function(c){return c.woId===woId;});
  var done=items.filter(function(c){return c.completed;}).length;
  var html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
    '<div style="font-weight:700">'+done+' / '+items.length+' complete</div>'+
    '<div style="display:flex;gap:8px"><input id="wocl-new" placeholder="Add checklist item..." style="padding:7px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;width:220px">'+
    '<button class="btn btn-outline btn-sm" onclick="addWOChecklistItem()">+ Add</button></div></div>';
  if(!items.length) return html+'<div style="color:#90a4ae;font-size:13px">No checklist items yet.</div>';
  html+=items.map(function(c){
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #f0f4f8">'+
      '<input type="checkbox" '+(c.completed?'checked':'')+' onchange="toggleWOChecklistItem(\''+c.id+'\',this.checked)" style="width:16px;height:16px;cursor:pointer">'+
      '<span style="flex:1;font-size:13px;'+(c.completed?'text-decoration:line-through;color:#90a4ae;':'')+'">'+escHtml(c.item||'')+'</span>'+
      (c.completed&&c.completedBy?'<span style="font-size:10px;color:#90a4ae">'+escHtml(c.completedBy)+'</span>':'')+
      '<button class="btn btn-danger btn-sm" onclick="deleteWOChecklistItem(\''+c.id+'\')">✕</button>'+
    '</div>';
  }).join('');
  return html;
}

function addWOChecklistItem() {
  var woId=_woCurrentId; if(!woId){showToast('Save the work order first','error');return;}
  var item=(document.getElementById('wocl-new')||{}).value||'';
  if(!item.trim()){showToast('Enter item text','error');return;}
  if(!DB.woChecklist) DB.woChecklist=[];
  DB.woChecklist.push({id:'wocl-'+Date.now(),woId:woId,item:item.trim(),completed:false,createdAt:new Date().toISOString()});
  saveDB(); switchWOTab('checklist');
}

function toggleWOChecklistItem(id,checked) {
  var item=(DB.woChecklist||[]).find(function(c){return c.id===id;});
  if(item){item.completed=checked;item.completedBy=checked?((_currentUser&&_currentUser.full_name)||'Unknown'):null;item.completedAt=checked?new Date().toISOString():null;}
  saveDB(); switchWOTab('checklist');
}

function deleteWOChecklistItem(id) {
  DB.woChecklist=(DB.woChecklist||[]).filter(function(c){return c.id!==id;});
  saveDB(); switchWOTab('checklist');
}

// ---- CREATE INVOICE FROM WO ----
function createWOInvoice() {
  var woId=_woCurrentId; if(!woId) return;
  var wo=(DB.workOrders||[]).find(function(w){return w.id===woId;}); if(!wo) return;
  var labor=(DB.woLabor||[]).filter(function(l){return l.woId===woId;});
  var expenses=(DB.woExpenses||[]).filter(function(e){return e.woId===woId;});
  var parts=(DB.woParts||[]).filter(function(p){return p.woId===woId;});
  var rate=parseFloat(wo.laborRate)||125;
  var totalHrs=labor.reduce(function(s,l){return s+parseFloat(l.hours||0);},0);
  var laborAmt=totalHrs*rate;
  var expAmt=expenses.reduce(function(s,e){return s+parseFloat(e.amount||0);},0);
  var subtotal=laborAmt+expAmt;
  var taxRate=parseFloat(wo.taxRate)||0;
  var taxAmt=subtotal*(taxRate/100);
  var total=subtotal+taxAmt;
  // Find or link job
  var job=(DB.jobs||[]).find(function(j){return j.customerId===wo.customerId;});
  if(!DB.invoices) DB.invoices=[];
  DB.invSeq=(DB.invSeq||1000)+1;
  var inv={
    id:'inv-'+Date.now(),
    num:'INV-'+DB.invSeq,
    status:'draft',
    date:getTodayISO(),
    due:'',
    jobId:job?job.id:null,
    woId:woId,
    job:{ name:wo.description||'', customer:wo.customerName||'' },
    total:total,
    subtotal:subtotal,
    laborAmt:laborAmt,
    expAmt:expAmt,
    taxAmt:taxAmt,
    taxRate:taxRate,
    notes:'Labor: '+totalHrs.toFixed(2)+' hrs @ $'+rate+'/hr\n'+
          (expAmt>0?'Expenses: $'+expAmt.toFixed(2)+'\n':'')+
          (parts.length?'Parts: '+parts.map(function(p){return p.name;}).join(', ')+'\n':'')+
          (wo.workPerformed||''),
    items:[]
  };
  // Add labor as invoice item
  if(totalHrs>0) inv.items.push({_id:'woi-l',desc:'Labor ('+totalHrs.toFixed(2)+' hrs @ $'+rate+'/hr)',cat:'Labor',qty:totalHrs,unit:'hr',mc:rate,lh:0});
  // Add expenses as items
  expenses.forEach(function(e){ inv.items.push({_id:'woi-e-'+e.id,desc:escHtml(e.category||'Expense')+(e.description?' — '+e.description:''),cat:'Expense',qty:1,unit:'EA',mc:e.amount,lh:0}); });
  DB.invoices.push(inv);
  // Update WO status
  wo.status='Open — Partial Invoice (Please Create)';
  wo.invoiceId=inv.id;
  saveDB(); renderWorkOrders();
  closeModal('modal-work-order');
  goPage('invoices');
  showToast('Draft invoice '+inv.num+' created — review and edit before sending','success',5000);
}

// ---- SETTINGS ----
function renderWOSettingsPage() {
  var settings=DB.woSettings||{};
  var types=settings.serviceTypes||WO_SERVICE_TYPES;
  var cats=settings.expenseCats||WO_EXPENSE_CATS;
  var statuses=settings.statuses||WO_STATUSES;
  var lrEl=document.getElementById('wo-default-labor'); if(lrEl)lrEl.value=settings.defaultLaborRate||125;
  var txEl=document.getElementById('wo-default-tax');   if(txEl)txEl.value=settings.defaultTaxRate||0;
  var typesEl=document.getElementById('wo-svc-types-list');
  if(typesEl) typesEl.innerHTML=types.map(function(t,i){return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f4f8"><span style="font-size:13px">'+escHtml(t)+'</span><button class="btn btn-danger btn-sm" onclick="removeWOServiceType('+i+')">✕</button></div>';}).join('');
  var catsEl=document.getElementById('wo-exp-cats-list');
  if(catsEl) catsEl.innerHTML=cats.map(function(c,i){return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f4f8"><span style="font-size:13px">'+escHtml(c)+'</span><button class="btn btn-danger btn-sm" onclick="removeWOExpenseCat('+i+')">✕</button></div>';}).join('');
  var statusEl=document.getElementById('wo-status-list');
  if(statusEl) statusEl.innerHTML=statuses.map(function(s){var id=s.id||s; return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f4f8"><div style="width:12px;height:12px;border-radius:3px;background:'+(s.color||'#e0e0e0')+'"></div><span style="font-size:12px">'+escHtml(id)+'</span></div>';}).join('');
}

function addWOServiceType() {
  var val=(document.getElementById('wo-new-svc-type')||{}).value||'';
  if(!val.trim())return;
  if(!DB.woSettings)DB.woSettings={};
  if(!DB.woSettings.serviceTypes)DB.woSettings.serviceTypes=WO_SERVICE_TYPES.slice();
  DB.woSettings.serviceTypes.push(val.trim());
  document.getElementById('wo-new-svc-type').value='';
  saveDB(); renderWOSettingsPage();
}

function removeWOServiceType(idx) {
  if(!DB.woSettings||!DB.woSettings.serviceTypes)return;
  DB.woSettings.serviceTypes.splice(idx,1);
  saveDB(); renderWOSettingsPage();
}

function addWOExpenseCat() {
  var val=(document.getElementById('wo-new-exp-cat')||{}).value||'';
  if(!val.trim())return;
  if(!DB.woSettings)DB.woSettings={};
  if(!DB.woSettings.expenseCats)DB.woSettings.expenseCats=WO_EXPENSE_CATS.slice();
  DB.woSettings.expenseCats.push(val.trim());
  document.getElementById('wo-new-exp-cat').value='';
  saveDB(); renderWOSettingsPage();
}

function removeWOExpenseCat(idx) {
  if(!DB.woSettings||!DB.woSettings.expenseCats)return;
  DB.woSettings.expenseCats.splice(idx,1);
  saveDB(); renderWOSettingsPage();
}

function saveWOSettings() {
  if(!DB.woSettings)DB.woSettings={};
  DB.woSettings.defaultLaborRate=parseFloat((document.getElementById('wo-default-labor')||{}).value)||125;
  DB.woSettings.defaultTaxRate  =parseFloat((document.getElementById('wo-default-tax')||{}).value)||0;
  saveDB();
  showToast('Work Order settings saved ✓','success');
}

// ---- SUPABASE PUSH ----
async function _pushWOToCloud(wo) {
  if(!_sb||!_currentUser) return;
  try {
    var { error } = await _sb.from('work_orders').upsert({
      id:            wo.id,
      wo_number:     wo.woNumber,
      customer_id:   wo.customerId||null,
      customer_name: wo.customerName||null,
      contact_id:    wo.contactId||null,
      description:   wo.description||null,
      work_performed:wo.workPerformed||null,
      status:        wo.status||'New',
      service_type:  wo.serviceType||null,
      priority:      wo.priority||'Normal',
      service_rep:   wo.serviceRep||null,
      reference_num: wo.refNum||null,
      site_address:  wo.siteAddr||null,
      site_city:     wo.siteCity||null,
      site_state:    wo.siteState||null,
      site_zip:      wo.siteZip||null,
      labor_rate:    wo.laborRate||null,
      tax_rate:      wo.taxRate||null,
      date_requested:wo.dateRequested||null,
      date_followup: wo.dateFollowup||null,
      date_opened:   wo.dateOpened||null,
      date_closed:   wo.dateClosed||null,
      internal_notes:wo.internalNotes||null,
      invoice_id:    wo.invoiceId||null,
      assigned_techs:wo.assignedTechs||[],
      created_by:    wo.createdBy||_currentUser.id,
      created_by_name:wo.createdByName||null,
      updated_at:    new Date().toISOString()
    });
    if(error) console.warn('[WO Push]',error.message);
  } catch(e) { console.warn('[WO Push]',e.message); }
}

// ---- HOT NOTES on customer edit ----
// Hooked into the customer modal save
function getCustomerHotNotes() {
  return {
    tech:   (document.getElementById('m-c-hotnote-tech')||{}).value||'',
    office: (document.getElementById('m-c-hotnote-office')||{}).value||''
  };
}

function createPOFromWOParts(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return;
  var requestedParts = (DB.woParts||[]).filter(function(p){ return p.woId===woId && p.status==='requested'; });
  if (!requestedParts.length) { showToast('No requested parts to create PO from','info'); return; }
  // Pre-populate PO with these parts
  if (typeof openNewPO !== 'function') { showToast('Purchase Orders module not loaded','error'); return; }
  openNewPO();
  // Set job link
  var job = (DB.jobs||[]).find(function(j){ return j.woId===woId||j.id===wo.jobId; });
  if (job) {
    var jobSel = document.getElementById('po-job');
    if (jobSel) { jobSel.value = job.id; onPOJobChange(job.id); }
  }
  // Populate line items
  _poItems = requestedParts.map(function(p,i){
    return { _eid:i, desc:p.name||'', partNum:p.partNum||p.partNumber||'', qtyOrdered:parseFloat(p.qty||1), qtyReceived:0, unitCost:0 };
  });
  renderPOItems();
  refreshPOTotals();
  // Update source chain
  var chainEl = document.getElementById('po-source-chain');
  if (chainEl) chainEl.innerHTML = '📎 From WO: '+escHtml(wo.woNumber||'');
  showToast('PO pre-populated with '+requestedParts.length+' part request(s) — select vendor and save','info',4000);
  closeModal('modal-work-order');
  goPage('purchaseorders');
}

function openNewWOForCustomer(customerId, customerName) {
  // Close customer panel first
  if (typeof closeCustomerProfile === 'function') closeCustomerProfile();
  openNewWorkOrder();
  // Pre-fill customer
  var nameEl = document.getElementById('wo-customer-name');
  var idEl   = document.getElementById('wo-customer-id');
  if (nameEl) nameEl.value = customerName;
  if (idEl)   idEl.value   = customerId;
  // Populate contacts
  _populateWOContacts(customerId, null);
  // Fill address from customer record
  var cust = (DB.customers||[]).find(function(c){ return c.id===customerId; });
  if (cust) {
    var settings = DB.woSettings||{};
    var lr = document.getElementById('wo-labor-rate');
    if (lr) lr.value = cust.laborRate || settings.defaultLaborRate || 125;
    var addrEl  = document.getElementById('wo-site-addr');
    var cityEl  = document.getElementById('wo-site-city');
    var stEl    = document.getElementById('wo-site-state');
    var zipEl   = document.getElementById('wo-site-zip');
    if (addrEl) addrEl.value = cust.street||cust.address||'';
    if (cityEl) cityEl.value = cust.city||'';
    if (stEl)   stEl.value   = cust.state||'';
    if (zipEl)  zipEl.value  = cust.zip||'';
  }
  // Check hot notes for new WO
  _checkHotNotes(customerId, 'new', true);
  goPage('workorders');
}

// ============================================================
// ASSIGNED TECHS SYSTEM
// ============================================================

// ---- PERMISSION HELPER ----

function _isTechAssignedToWO(techName, wo) {
  if (!wo) return false;
  // Check assignedTechs array
  if (wo.assignedTechs && wo.assignedTechs.length) {
    return wo.assignedTechs.indexOf(techName) >= 0;
  }
  return false;
}

function _canViewWO(wo) {
  if (!_currentUser) return false;
  var role = _currentUser.role;
  if (role==='owner'||role==='office'||role==='manager'||role==='back_office') return true;
  var myProfile = (DB.team||[]).find(function(m){ return m.name===_currentUser.full_name; });
  var seeAll = myProfile && myProfile.woViewMode === 'all';
  if (seeAll) return true;
  return _isTechAssignedToWO(_currentUser.full_name, wo);
}

// ---- RENDER ASSIGNED TECHS ON WO ----

// ---- TEAM ASSIGNMENT ----

function renderAssignedTechs(woId) {
  var el = document.getElementById('wo-assigned-techs');
  if (!el) return;
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  var assigned = (wo && wo.assignedTechs) ? wo.assignedTechs : [];

  if (!assigned.length) {
    el.innerHTML = '<span style="font-size:12px;color:#90a4ae">No techs assigned — click + Team</span>';
    return;
  }

  // Show summary: name + logged hours
  var labor = (DB.woLabor||[]).filter(function(l){ return l.woId===woId; });
  var teEntries = (DB.timeEntries||[]).filter(function(e){ return !e.deleted && e.woId===woId; });

  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px">' +
    assigned.map(function(name) {
      var hrs = 0;
      labor.filter(function(l){ return l.techName===name; }).forEach(function(l){ hrs+=parseFloat(l.hours)||0; });
      teEntries.filter(function(e){ return e.techName===name && e.entryType!=='lunch'; }).forEach(function(e){ hrs+=parseFloat(e.totalHours)||0; });
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #e8eef4">' +
        '<span style="font-size:12px;font-weight:600">'+escHtml(name)+'</span>' +
        '<span style="font-size:11px;color:'+(hrs>0?'#1565c0':'#90a4ae')+'">'+hrs.toFixed(1)+' hrs</span>' +
      '</div>';
    }).join('') +
  '</div>';
}

function openTeamModal() {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  _assigned = (wo && wo.assignedTechs) ? wo.assignedTechs.slice() : [];
  var listEl = document.getElementById('team-modal-list');
  if (!listEl) return;
  var searchEl = document.getElementById('team-modal-search');
  if (searchEl) searchEl.value = '';

  _renderTeamModalList(_assigned, '');
  openModal('modal-wo-team');
}

function _renderTeamModalList(assigned, search) {
  var listEl = document.getElementById('team-modal-list');
  if (!listEl) return;
  var members = (DB.team||[]).filter(function(m){
    return m.active!==false &&
           (!search || (m.name||'').toLowerCase().includes(search.toLowerCase()) ||
                       (m.email||'').toLowerCase().includes(search.toLowerCase()));
  }).sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

  listEl.innerHTML = members.map(function(m) {
    var isChecked = assigned.indexOf(m.name) >= 0;
    var role = m.access || m.systemRole || m.role || 'field';
    var roleColors = {owner:'#1565c0',manager:'#1565c0',office:'#2e7d32',back_office:'#2e7d32',lead_tech:'#e65100',project_manager:'#6a1b9a',field:'#546e7a',helper_tech:'#90a4ae'};
    var roleColor = roleColors[role] || '#546e7a';
    return '<label style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-bottom:1px solid #f8f9fa;'+(isChecked?'background:#e3f2fd;':'')+'">'+
      '<input type="checkbox" data-name="'+escHtml(m.name)+'" '+(isChecked?'checked':'')+
      ' onchange="_teamModalCheck(this)" style="width:16px;height:16px;cursor:pointer">'+
      '<div style="flex:1">'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(m.name||'')+'</div>'+
        '<div style="font-size:11px;color:'+roleColor+'">'+escHtml(role)+'</div>'+
      '</div>'+
      (m.email?'<div style="font-size:11px;color:#90a4ae">'+escHtml(m.email)+'</div>':'')+
    '</label>';
  }).join('') || '<div style="padding:16px;text-align:center;color:#90a4ae;font-size:13px">No team members found</div>';
}

var _assigned = [];
function _teamModalCheck(cb) {
  var name = cb.getAttribute('data-name');
  var row  = cb.closest('label');
  if (cb.checked) {
    if (_assigned.indexOf(name)<0) _assigned.push(name);
    if (row) row.style.background = '#e3f2fd';
  } else {
    _assigned = _assigned.filter(function(n){ return n!==name; });
    if (row) row.style.background = '';
  }
}

function filterTeamModal(val) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  _assigned = (wo && wo.assignedTechs) ? wo.assignedTechs.slice() : [];
  // Preserve current checkboxes before filtering
  document.querySelectorAll('#team-modal-list input[type="checkbox"]').forEach(function(cb){
    var n = cb.getAttribute('data-name');
    if (cb.checked && _assigned.indexOf(n)<0) _assigned.push(n);
    if (!cb.checked) _assigned = _assigned.filter(function(x){ return x!==n; });
  });
  _renderTeamModalList(_assigned, val);
}

function selectAllTeamModal() {
  document.querySelectorAll('#team-modal-list input[type="checkbox"]').forEach(function(cb){
    cb.checked = true;
    var n = cb.getAttribute('data-name');
    if (_assigned.indexOf(n)<0) _assigned.push(n);
    var row = cb.closest('label');
    if (row) row.style.background = '#e3f2fd';
  });
}

function clearAllTeamModal() {
  _assigned = [];
  document.querySelectorAll('#team-modal-list input[type="checkbox"]').forEach(function(cb){
    cb.checked = false;
    var row = cb.closest('label');
    if (row) row.style.background = '';
  });
}

function saveTeamModal() {
  // Capture final state of checkboxes
  document.querySelectorAll('#team-modal-list input[type="checkbox"]').forEach(function(cb){
    var n = cb.getAttribute('data-name');
    if (cb.checked && _assigned.indexOf(n)<0) _assigned.push(n);
    if (!cb.checked) _assigned = _assigned.filter(function(x){ return x!==n; });
  });

  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  if (!wo) { closeModal('modal-wo-team'); return; }

  var prev = (wo.assignedTechs||[]).slice();
  wo.assignedTechs = _assigned.slice();

  // Audit additions and removals
  _assigned.forEach(function(n){
    if (prev.indexOf(n)<0 && typeof auditWOTechAssigned==='function') auditWOTechAssigned(wo.id,wo.woNumber||'',n);
  });
  prev.forEach(function(n){
    if (_assigned.indexOf(n)<0 && typeof auditWOTechUnassigned==='function') auditWOTechUnassigned(wo.id,wo.woNumber||'',n);
  });

  saveDB();
  // Push to Supabase
  if (_sb && _currentUser) {
    _sb.from('work_orders').update({assigned_techs:wo.assignedTechs}).eq('id',wo.id).then(function(){});
  }
  closeModal('modal-wo-team');
  renderAssignedTechs(_woCurrentId);
  showToast('Team updated ✓','success',2000);
}

function toggleAssignedTech(techName) {
  // Legacy — redirect to modal
  openTeamModal();
}


// ---- FILTER LABOR TAB BY ROLE ----
// Override to hide other techs' entries for field techs

var _origRenderWOLaborTab = renderWOLaborTab;
renderWOLaborTab = function(woId) {
  var myName = _currentUser ? _currentUser.full_name : '';
  var myRole = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager';
  var isLead  = myRole==='lead_tech';

  // Field techs see only their own entries
  if (!isAdmin && !isLead && myName) {
    var origLabor = DB.woLabor;
    DB.woLabor = (DB.woLabor||[]).filter(function(l){
      return l.woId !== woId || l.techName === myName;
    });
    var result = _origRenderWOLaborTab(woId);
    DB.woLabor = origLabor;
    return result;
  }
  return _origRenderWOLaborTab(woId);
};

// ---- FILTER EXPENSES TAB BY ROLE ----
var _origRenderWOExpensesTab = typeof renderWOExpensesTab !== 'undefined' ? renderWOExpensesTab : null;
if (_origRenderWOExpensesTab) {
  renderWOExpensesTab = function(woId) {
    var myName = _currentUser ? _currentUser.full_name : '';
    var myRole = _currentUser ? _currentUser.role : '';
    var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager';
    var isLead  = myRole==='lead_tech';
    if (!isAdmin && !isLead && myName) {
      var origExp = DB.woExpenses;
      DB.woExpenses = (DB.woExpenses||[]).filter(function(e){
        return e.woId !== woId || e.loggedBy === myName;
      });
      var result = _origRenderWOExpensesTab(woId);
      DB.woExpenses = origExp;
      return result;
    }
    return _origRenderWOExpensesTab(woId);
  };
}

// ---- GUARD openWorkOrder ----
var _origOpenWorkOrder = openWorkOrder;
openWorkOrder = function(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (wo && !_canViewWO(wo)) {
    showToast('You are not assigned to this work order','error');
    return;
  }
  _origOpenWorkOrder(woId);
  // Render assigned techs after modal renders
  setTimeout(function(){ renderAssignedTechs(woId); }, 200);
};

// ============================================================
// AUTO-PROMOTE: NEW → OPEN on first time entry
// ============================================================

function autoPromoteWOStatus(woId) {
  if (!woId) return;
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo || wo.status !== 'NEW') return;
  wo.status = 'OPEN';
  // Update status dropdown if WO modal is open
  var sel = document.getElementById('wo-status');
  if (sel && sel.value === 'NEW') sel.value = 'OPEN';
  saveDB();
  // Push to Supabase silently
  if (_sb && _currentUser) {
    _sb.from('work_orders').update({ status:'OPEN' }).eq('id', woId).then(function(r){
      if (r.error) console.warn('[AutoPromote]', r.error.message);
    });
  }
  showToast('WO status updated: NEW → OPEN','info',2000);
}
