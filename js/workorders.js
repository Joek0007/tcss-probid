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


// ── WO/Job Unification ────────────────────────────────────────────────────
// Work Orders ARE jobs. These helpers let existing code work with WOs
// wherever it previously used DB.jobs.

function _woToJob(wo) {
  if (!wo) return null;
  var techs = (wo.assignedTechs||[]).map(function(t){
    return typeof t==='string' ? t : (t.name||t.full_name||'');
  }).filter(Boolean);
  return {
    id:            wo.id,
    woId:          wo.id,
    woNumber:      wo.woNumber || '',
    name:          wo.description || wo.woNumber || 'Work Order',
    customer:      wo.customerName || '',
    customerName:  wo.customerName || '',
    address:       [wo.siteAddr, wo.siteCity, wo.siteState].filter(Boolean).join(', '),
    siteAddr:      wo.siteAddr || '',
    siteCity:      wo.siteCity || '',
    siteState:     wo.siteState || '',
    status:        wo.status || 'Open',
    scheduledDate: wo.scheduledDate || wo.dateRequested || '',
    scheduledTime: wo.scheduledTime || '',
    estLaborHours: wo.estLaborHours || wo.scheduledDuration || 4,
    assignedTechs: techs,
    assignedTo:    techs[0] || '',
    crew:          techs.map(function(n,i){ return {techName:n, role:i===0?'lead':'helper'}; }),
    gpsAnchor:     wo.gpsAnchor || null,
    priority:      wo.priority || 'Normal',
    _isWO:         true
  };
}

// Returns all active (non-closed) WOs as job-compatible objects
function _getActiveWOsAsJobs() {
  return (DB.workOrders||[])
    .filter(function(w){ return !w.deleted && w.status!=='Billed' && w.status!=='Void' && w.status!=='Closed'; })
    .map(_woToJob);
}

// Returns WOs assigned to a specific tech as job-compatible objects
function _getMyWOsAsJobs(techName) {
  var name = (techName||'').toLowerCase().trim();
  return (DB.workOrders||[])
    .filter(function(w){
      if (w.deleted || w.status==='Billed' || w.status==='Void') return false;
      return (w.assignedTechs||[]).some(function(t){
        var n=(typeof t==='string'?t:(t.name||t.full_name||'')).toLowerCase().trim();
        return n===name;
      });
    })
    .map(_woToJob);
}

// Find a job-compatible object by ID — checks both DB.jobs and DB.workOrders
function _findJobOrWO(id) {
  if (!id) return null;
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===id; });
  if (wo) return _woToJob(wo);
  return (DB.jobs||[]).find(function(j){ return j.id===id; }) || null;
}

// Always look up statuses from settings first, fall back to hardcoded
function _getWOStatuses() {
  return (DB.woSettings&&DB.woSettings.statuses&&DB.woSettings.statuses.length)
    ? DB.woSettings.statuses : WO_STATUSES;
}
function _getWOStatusDef(statusId) {
  if (!statusId) return {color:'#e0e0e0',open:true};
  var list = _getWOStatuses();
  return list.find(function(s){
    return s.id===statusId || s.id.toLowerCase()===statusId.toLowerCase();
  }) || {color:'#e0e0e0',open:true};
}

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

  // Build status dropdown from WO_STATUSES so values always match
  var statusSel = document.getElementById('wo-filter-status');
  if (statusSel && statusSel.options.length <= 1) {
    var isTechView = _currentUser && _currentUser.role === 'helper_tech';
    var statusList = (DB.woSettings&&DB.woSettings.statuses&&DB.woSettings.statuses.length)
      ? DB.woSettings.statuses : WO_STATUSES;
    if (isTechView) statusList = statusList.filter(function(s){ return s.mobile !== false; });
    statusList.forEach(function(s){
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.id;
      statusSel.appendChild(opt);
    });
  }

  // Build service type dropdown dynamically to pick up custom types
  var typeSel = document.getElementById('wo-filter-type');
  if (typeSel && typeSel.options.length <= 1) {
    var typeList = (DB.woSettings&&DB.woSettings.serviceTypes&&DB.woSettings.serviceTypes.length)
      ? DB.woSettings.serviceTypes : WO_SERVICE_TYPES;
    typeList.forEach(function(t){
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeSel.appendChild(opt);
    });
  }

  var search   = ((document.getElementById('wo-search')||{}).value||'').trim().toLowerCase();
  var fStatus  = (document.getElementById('wo-filter-status')||{}).value||'';
  // Reset unscheduled filter if a status was explicitly chosen
  if (fStatus && _woUnscheduledFilter) _woUnscheduledFilter = false;
  var fPriority= (document.getElementById('wo-filter-priority')||{}).value||'';
  var fType    = (document.getElementById('wo-filter-type')||{}).value||'';

  var list = DB.workOrders.slice();

  // ---- ASSIGNMENT FILTER — role-based, owner always sees all ----
  var myName  = _currentUser ? _currentUser.full_name : '';
  var myRole  = _currentUser ? _currentUser.role : '';
  var isTech  = myRole === 'helper_tech';
  var assignedOnly = isTech;

  if (assignedOnly && myName) {
    list = list.filter(function(w){
      return _isTechAssignedToWO(myName, w);
    });
  }

  if (search) list = list.filter(function(w){
    return (w.woNumber||'').toLowerCase().includes(search) ||
           (w.customerName||'').toLowerCase().includes(search) ||
           (w.description||'').toLowerCase().includes(search) ||
           (w.siteAddr||'').toLowerCase().includes(search) ||
           (w.siteCity||'').toLowerCase().includes(search);
  });
  if (_woUnscheduledFilter) {
    list = list.filter(function(w){ return !w.scheduledDate; });
  } else if (fStatus) {
    list = list.filter(function(w){ return w.status === fStatus; });
  }
  if (fPriority) list = list.filter(function(w){ return w.priority === fPriority; });
  if (fType)     list = list.filter(function(w){ return w.serviceType === fType; });

  // Sort by selected column
  list.sort(function(a,b){
    var av = (a[_woSortField]||'').toString();
    var bv = (b[_woSortField]||'').toString();
    var r = av.localeCompare(bv, undefined, {numeric:true, sensitivity:'base'});
    return _woSortAsc ? r : -r;
  });

  // Stats bar replaced by chips below

  // Hide/show action buttons based on permissions
  var newWoBtn = document.querySelector('#page-workorders .btn-primary');
  var woSetBtn = document.querySelector('#page-workorders .btn-outline[onclick*="wo-settings"]');
  if (newWoBtn) newWoBtn.style.display = (typeof hasPermission==='function' && !hasPermission('wo.create')) ? 'none' : '';
  if (woSetBtn) woSetBtn.style.display = (typeof hasPermission==='function' && !hasPermission('wo.settings')) ? 'none' : '';

  var body = document.getElementById('wo-list-body');
  if (!body) return;

  if (!list.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#90a4ae"><div style="font-size:32px;margin-bottom:8px">🔨</div><div>No work orders found.</div></div>';
    return;
  }

  // Populate tech filter
  var techSel = document.getElementById('wo-filter-tech');
  var fTech = techSel ? techSel.value : '';
  if (techSel && techSel.options.length <= 1) {
    (DB.team||[]).forEach(function(m){
      var o = document.createElement('option');
      o.value = m.name; o.textContent = m.name;
      techSel.appendChild(o);
    });
  }
  if (fTech) list = list.filter(function(w){ return _isTechAssignedToWO(fTech, w); });

  // Status quick-filter chips
  var chipsEl = document.getElementById('wo-status-chips');
  if (chipsEl) {
    var allU = isTech ? (DB.workOrders||[]).filter(function(w){ return _isTechAssignedToWO(myName, w); }) : (DB.workOrders||[]);
    var sCounts = {};
    allU.forEach(function(w){ sCounts[w.status] = (sCounts[w.status]||0)+1; });
    var chipFilter = (document.getElementById('wo-filter-status')||{}).value||'';
    var chipStyle = 'padding:5px 14px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;display:inline-block;border:2px solid;margin-right:2px';
    function makeChip(status, bg, color, border, label) {
      return '<span onclick="woChipClick(\'' + status + '\')" style="'+chipStyle+';background:'+bg+';color:'+color+';border-color:'+border+'">'+label+'</span>';
    }
    var chipEls = makeChip('', chipFilter===''?'#1565c0':'#e0e7ef', chipFilter===''?'#fff':'#0d1b2a', chipFilter===''?'#1565c0':'#c8d0db', 'All <b>'+allU.length+'</b>');
    _getWOStatuses().forEach(function(s){
      var cnt = sCounts[s.id]||0; if (!cnt) return;
      var col = s.color||'#546e7a';
      var active = chipFilter===s.id;
      chipEls += makeChip(s.id, active?col:'#e0e7ef', active?_smartTextColor(col):'#0d1b2a', active?col:'#c8d0db', escHtml(s.id)+' <b>'+cnt+'</b>');
    });
    var unschedCount = allU.filter(function(w){ return !w.scheduledDate; }).length;
    if (unschedCount) {
      var ua = _woUnscheduledFilter;
      chipEls += makeChip('__unscheduled__', ua?'#c62828':'#e0e7ef', ua?'#fff':'#0d1b2a', ua?'#c62828':'#c8d0db', '&#9888; Unscheduled <b>'+unschedCount+'</b>');
    }
    chipsEl.innerHTML = '<span style="font-size:11px;color:#546e7a;font-weight:700;margin-right:6px">QUICK FILTER:</span>'+chipEls;
  }

  // Column layout
  var cols = '90px 160px 1fr 120px 130px 90px 36px';
  var isRole = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='lead_tech');

  var header = '<div style="display:grid;grid-template-columns:'+cols+';padding:9px 16px;background:#f5f7fa;border-bottom:2px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'
    +'<span class="wo-sort-hdr" data-field="woNumber" style="cursor:pointer">WO # ⇅</span>'
    +'<span class="wo-sort-hdr" data-field="customerName" style="cursor:pointer">Customer ⇅</span>'
    +'<span>Description · Scheduled</span>'
    +'<span>Techs</span>'
    +'<span class="wo-sort-hdr" data-field="status" style="cursor:pointer">Status ⇅</span>'
    +'<span>Priority</span>'
    +'<span></span>'
    +'</div>';

  var avColors = ['#1565c0','#2e7d32','#6a1b9a','#e65100','#546e7a'];

  var rows = list.map(function(wo) {
    var st = _getWOStatusDef(wo.status);
    var stColor = st.color||'#90a4ae';
    var stText  = _smartTextColor(stColor);

    var prDot = wo.priority==='Urgent'
      ? '<span style="width:9px;height:9px;border-radius:50%;background:#c62828;display:inline-block;vertical-align:middle;margin-right:4px"></span><span style="font-size:11px;color:#c62828;font-weight:700">Urgent</span>'
      : wo.priority==='High'
      ? '<span style="width:9px;height:9px;border-radius:50%;background:#f57c00;display:inline-block;vertical-align:middle;margin-right:4px"></span><span style="font-size:11px;color:#f57c00;font-weight:700">High</span>'
      : '<span style="width:9px;height:9px;border-radius:50%;background:#e0e0e0;display:inline-block;vertical-align:middle"></span>';

    var schedHtml = wo.scheduledDate
      ? '<div style="font-size:10px;color:#90a4ae;margin-top:2px">&#128197; '+escHtml(wo.scheduledDate)+(wo.scheduledTime?' &middot; '+escHtml(wo.scheduledTime):'')+'</div>'
      : '<div style="font-size:10px;color:#c62828;margin-top:2px">&#9888; Not scheduled</div>';

    var techNames = (wo.assignedTechs||[]).map(function(t){ return typeof t==='string'?t:(t.name||''); }).filter(Boolean);
    var techHtml = techNames.length
      ? techNames.slice(0,3).map(function(n,i){
          var ini = n.split(' ').map(function(p){return p[0]||'';}).join('').substring(0,2).toUpperCase();
          return '<span title="'+escHtml(n)+'" style="width:24px;height:24px;border-radius:50%;background:'+avColors[i%avColors.length]+';display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff;margin-right:2px">'+escHtml(ini)+'</span>';
        }).join('')+(techNames.length>3?'<span style="width:24px;height:24px;border-radius:50%;background:#90a4ae;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff">+'+(techNames.length-3)+'</span>':'')
      : '<span style="font-size:10px;color:#bdbdbd">Unassigned</span>';

    var menuHtml = isRole
      ? '<div class="wo-menu-wrap" style="position:relative">'
          +'<div class="wo-menu-btn" data-woid="'+escHtml(wo.id)+'" style="width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#90a4ae;border:1px solid #e0e7ef;background:#fff;cursor:pointer">&#8942;</div>'
          +'<div id="womenu-'+escHtml(wo.id)+'" style="display:none;position:absolute;right:0;top:32px;background:#fff;border:1px solid #e0e7ef;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;min-width:140px">'
            +'<div class="wo-menu-item" data-action="edit" data-woid="'+escHtml(wo.id)+'" style="padding:9px 14px;font-size:12px;cursor:pointer">&#9999;&#65039; Edit WO</div>'
            +'<div class="wo-menu-item" data-action="delete" data-woid="'+escHtml(wo.id)+'" style="padding:9px 14px;font-size:12px;cursor:pointer;color:#c62828">&#128465; Delete</div>'
          +'</div>'
        +'</div>'
      : '';

    return '<div class="wo-list-row" data-woid="'+escHtml(wo.id)+'" style="display:grid;grid-template-columns:'+cols+';padding:11px 16px;border-bottom:1px solid #f0f4f8;align-items:center;cursor:pointer">'
      +'<div class="wo-num-link" data-woid="'+escHtml(wo.id)+'" style="font-weight:700;color:#1565c0;font-size:13px;text-decoration:underline">'+escHtml(wo.woNumber||'')+'</div>'
      +'<div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(wo.customerName||'—')+'</div>'
      +'<div style="overflow:hidden"><div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml((wo.description||'').substring(0,50))+'</div>'+schedHtml+'</div>'
      +'<div>'+techHtml+'</div>'
      +'<div><span class="wo-status-badge" data-woid="'+escHtml(wo.id)+'" style="background:'+stColor+';color:'+_smartTextColor(stColor)+';padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;display:inline-block">'+escHtml(wo.status||'')+'</span></div>'
      +'<div style="display:flex;align-items:center;gap:4px">'+prDot+'</div>'
      +'<div>'+menuHtml+'</div>'
    +'</div>';
  }).join('');


  body.innerHTML = header + rows;
  if (!body.dataset.eventsWired) { _wireWOListEvents(); body.dataset.eventsWired='1'; }
}



// Determine if text should be white or dark based on background color
function _smartTextColor(hexColor) {
  try {
    var h = hexColor.replace('#','');
    if (h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r=parseInt(h.substr(0,2),16);
    var g=parseInt(h.substr(2,2),16);
    var b=parseInt(h.substr(4,2),16);
    // Luminance formula
    var lum = (0.299*r + 0.587*g + 0.114*b) / 255;
    return lum > 0.55 ? '#0d1b2a' : '#ffffff';
  } catch(e) { return '#ffffff'; }
}

// ── WO List event handlers ─────────────────────────────────────────────────
var _woSortField = 'woNumber';
var _woSortAsc = true;
var _woUnscheduledFilter = false;

function woSort(field) {
  if (_woSortField === field) { _woSortAsc = !_woSortAsc; }
  else { _woSortField = field; _woSortAsc = true; }
  renderWorkOrders();
}

function woChipClick(status) {
  if (status === '__unscheduled__') {
    _woUnscheduledFilter = !_woUnscheduledFilter;
    var sf = document.getElementById('wo-filter-status');
    if (sf) sf.value = '';
  } else {
    _woUnscheduledFilter = false;
    var sf = document.getElementById('wo-filter-status');
    if (sf) sf.value = status;
  }
  renderWorkOrders();
}

function woQuickFilterStatus(status) {
  var el = document.getElementById('wo-filter-status');
  if (el) el.value = status;
  renderWorkOrders();
}

function toggleWOMenu(woId) {
  var m = document.getElementById('womenu-'+woId);
  if (!m) return;
  var isOpen = m.style.display !== 'none';
  document.querySelectorAll('[id^="womenu-"]').forEach(function(el){ el.style.display='none'; });
  if (!isOpen) m.style.display = 'block';
}

function cycleWOStatus(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return;
  var statuses = _getWOStatuses();
  var idx = statuses.findIndex(function(s){ return s.id===wo.status; });
  var next = statuses[(idx+1) % statuses.length];
  if (!next) return;
  wo.status = next.id;
  saveDB();
  if (typeof _sb!=='undefined'&&_sb) _sb.from('work_orders').update({status:next.id}).eq('id',woId).then(function(){});
  renderWorkOrders();
  showToast('Status → '+next.id,'success',2000);
}

// Wire up event delegation for the WO list
function _wireWOListEvents() {
  var body = document.getElementById('wo-list-body');
  if (!body) return;

  // Row click → open WO
  body.addEventListener('click', function(e) {
    // WO number link
    var numLink = e.target.closest('.wo-num-link');
    if (numLink) { e.stopPropagation(); openWorkOrder(numLink.dataset.woid); return; }

    // Status badge → cycle status
    var badge = e.target.closest('.wo-status-badge');
    if (badge) { e.stopPropagation(); cycleWOStatus(badge.dataset.woid); return; }

    // Menu button
    var menuBtn = e.target.closest('.wo-menu-btn');
    if (menuBtn) { e.stopPropagation(); toggleWOMenu(menuBtn.dataset.woid); return; }

    // Menu items
    var menuItem = e.target.closest('.wo-menu-item');
    if (menuItem) {
      e.stopPropagation();
      var action = menuItem.dataset.action;
      var woid = menuItem.dataset.woid;
      toggleWOMenu(woid);
      if (action==='edit') openWorkOrder(woid);
      if (action==='delete') deleteWorkOrder(woid);
      return;
    }

    // Sort headers
    var sortHdr = e.target.closest('.wo-sort-hdr');
    if (sortHdr) { woSort(sortHdr.dataset.field); return; }

    // Row click — but not if menu wrap
    if (e.target.closest('.wo-menu-wrap')) return;
    var row = e.target.closest('.wo-list-row');
    if (row) openWorkOrder(row.dataset.woid);
  });

  // Row hover
  body.addEventListener('mouseover', function(e) {
    var row = e.target.closest('.wo-list-row');
    if (row) row.style.background = '#f0f4ff';
  });
  body.addEventListener('mouseout', function(e) {
    var row = e.target.closest('.wo-list-row');
    if (row) row.style.background = '';
  });

  // Close menus on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.wo-menu-wrap')) {
      document.querySelectorAll('[id^="womenu-"]').forEach(function(el){ el.style.display='none'; });
    }
  });
}

// ---- OPEN / NEW ----
function openNewWorkOrder() {
  _woCurrentId = null;
  var today = getTodayISO();
  // Clear fields
  ['wo-customer-name','wo-customer-id','wo-description','wo-work-performed',
   'wo-ref-num','wo-site-addr','wo-site-city','wo-site-state','wo-site-zip',
   'wo-internal-notes','wo-date-followup','wo-scheduled-date','wo-scheduled-time',
   'wo-created-date','wo-closed-date'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var reqEl=document.getElementById('wo-date-requested'); if(reqEl) reqEl.value=today;
  document.getElementById('wo-modal-title').textContent='New Work Order';
  document.getElementById('wo-modal-num').textContent='';
  document.getElementById('wo-urgent-badge').style.display='none';
  document.getElementById('wo-btn-invoice').style.display='none';
  var printBtn=document.getElementById('wo-btn-print'); if(printBtn) printBtn.style.display='none';

  // Populate status dropdown
  _populateWOStatusSelect();
  // Set defaults
  var statusEl=document.getElementById('wo-status');
  if (statusEl) {
    // Find 'New' case-insensitively, or use first available status
    var newOpt = Array.from(statusEl.options).find(function(o){
      return o.value.toLowerCase()==='new';
    });
    statusEl.value = newOpt ? newOpt.value : (statusEl.options[0] ? statusEl.options[0].value : 'New');
  }
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
  if(intSection) intSection.style.display=(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office'))?'':'none';

  // Apply WO permissions
  if(typeof hasPermission==='function'){
    var _canFin=hasPermission('wo.view_financial');
    var _canEdit=hasPermission('wo.edit');
    var _canInv=hasPermission('wo.invoice');
    var _canCO=hasPermission('wo.change_order');
    setTimeout(function(){
      var lb=document.getElementById('wo-labor-rate');if(lb&&lb.closest&&lb.closest('div'))lb.closest('div').style.display=_canFin?'':'none';
      var tx=document.getElementById('wo-tax-rate');if(tx&&tx.closest&&tx.closest('div'))tx.closest('div').style.display=_canFin?'':'none';
      var ib=document.getElementById('wo-btn-invoice');if(ib)ib.style.display=_canInv?'':'none';
      var ib2=document.getElementById('wo-btn-invoice-top');if(ib2)ib2.style.display=_canInv?'':'none';
      var cb=document.getElementById('wo-btn-co');if(cb)cb.style.display=_canCO?'':'none';
      if(!_canEdit){document.querySelectorAll('#wo-desc,#wo-site-addr,#wo-site-city,#wo-site-state,#wo-site-zip').forEach(function(el){if(el){el.readOnly=true;el.style.background='#f5f5f5';}});}
    },300);
  }
  switchWOTab((typeof wtIsFieldTech==='function'&&wtIsFieldTech())?'fieldlog':'labor');
  setTimeout(function(){var cp=document.getElementById('wo-change-orders-panel');if(cp){var woId=_woCurrentId;cp.innerHTML=renderWOChangeOrders(woId);var wo=(DB.workOrders||[]).find(function(w){return w.id===woId;});if(wo&&wo.parentWoId&&wo.isChangeOrder){var par=(DB.workOrders||[]).find(function(w){return w.id===wo.parentWoId;});if(par)_renderParentWOBanner(par);}}},200);
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

  function sv(id,val){ 
    var el=document.getElementById(id); 
    if(!el) return;
    if(el.contentEditable==='true') {
      // Rich text field — detect HTML vs plain text
      var isHtml = val && (/<[a-z][\s\S]*>/i.test(val));
      if(typeof woRtfLoad==='function') woRtfLoad(id, val||'', isHtml);
    } else { 
      el.value=val||''; 
    }
  }
  // Set status — fall back to NEW if stored value not in current list
  var statusSel = document.getElementById('wo-status');
  if (statusSel) {
    statusSel.value = wo.status || 'NEW';
    if (!statusSel.value || statusSel.selectedIndex < 0) statusSel.value = 'NEW';
  }
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
  sv('wo-scheduled-date', wo.scheduledDate||'');
  sv('wo-scheduled-time', wo.scheduledTime||'');
  // Store WT project link
  var woFormEl = document.getElementById('wo-form-wrap');
  if (woFormEl) woFormEl.setAttribute('data-wt-project', wo.wtProjectId||'');
  // Created and closed — format for display
  var createdEl = document.getElementById('wo-created-date');
  if (createdEl) {
    var cDate = wo.createdAt ? new Date(wo.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
    createdEl.value = cDate;
  }
  var closedEl = document.getElementById('wo-closed-date');
  if (closedEl) closedEl.value = wo.dateClosed || '—';
  sv('wo-labor-rate',     wo.laborRate||'');
  sv('wo-tax-rate',       wo.taxRate||'');
  sv('wo-internal-notes', wo.internalNotes||'');

  // Populate contacts for this customer
  _populateWOContacts(wo.customerId, wo.contactId);

  // Show/hide invoice button
  var invBtn = document.getElementById('wo-btn-invoice');
  if(invBtn) invBtn.style.display=(wo.status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office')))?'':'none';

  // Internal notes visibility
  var intSection=document.getElementById('wo-internal-notes-section');
  if(intSection) intSection.style.display=(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office'))?'':'none';

  switchWOTab((typeof wtIsFieldTech==='function'&&wtIsFieldTech())?'fieldlog':'labor');
  setTimeout(function(){var cp=document.getElementById('wo-change-orders-panel');if(cp){var woId=_woCurrentId;cp.innerHTML=renderWOChangeOrders(woId);var wo=(DB.workOrders||[]).find(function(w){return w.id===woId;});if(wo&&wo.parentWoId&&wo.isChangeOrder){var par=(DB.workOrders||[]).find(function(w){return w.id===wo.parentWoId;});if(par)_renderParentWOBanner(par);}}},200);
  openModal('modal-work-order');

  // Hot notes
  _checkHotNotes(wo.customerId, wo.id, false);
}

function _checkHotNotes(customerId, woId, isNew) {
  var cust = (DB.customers||[]).find(function(c){ return c.id===customerId; });
  if (!cust) return;
  var isOffice = _currentUser && ['owner','manager','back_office','estimator'].includes(_currentUser.role);
  var queue = [];

  // Tech hot note — anyone assigned to this WO sees it, every single time
  var wo = woId && woId !== 'new' ? (DB.workOrders||[]).find(function(w){ return w.id===woId; }) : null;
  var assignedNames = wo ? (wo.assignedTechs||[]).map(function(t){ return typeof t==='string'?t:(t.name||''); }) : [];
  var currentName = _currentUser ? (_currentUser.name||_currentUser.email||'') : '';
  var isAssigned = assignedNames.some(function(n){ return n && currentName && n.toLowerCase()===currentName.toLowerCase(); });
  if (isAssigned && cust.hotNoteTech) {
    queue.push({ title:'⚡ Tech Notice — '+escHtml(cust.name), body:cust.hotNoteTech, icon:'⚡' });
  }

  // Office alert — fires every time for office roles
  var officeMsg = (cust.moduleAlerts && cust.moduleAlerts.workorder) || (isNew ? cust.hotNoteOffice : null);
  if (isOffice && officeMsg) {
    queue.push({ title:'🏢 Office Alert — '+escHtml(cust.name), body:officeMsg, icon:'🏢' });
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
  _hotNotesQueueItems.shift();
  var popup = document.getElementById('hot-notes-popup');
  if (_hotNotesQueueItems.length) {
    _showNextHotNote();
  } else {
    if (popup) popup.style.display = 'none';
  }
}

// ---- SAVE ----
function saveWorkOrder() {
  var custName = (document.getElementById('wo-customer-name')||{}).value||'';
  var descEl   = document.getElementById('wo-description');
  var desc     = descEl ? (descEl.contentEditable==='true' ? (typeof woRtfRead==='function' ? woRtfRead('wo-description') : descEl.innerText) : descEl.value) : '';
  if (!custName.trim()) { showToast('Customer is required','error'); return; }
  if (!desc.trim())     { showToast('Work description is required','error'); return; }

  if (!DB.workOrders) DB.workOrders = [];
  var isNew = !_woCurrentId;
  var id    = _woCurrentId || ('wo-'+Date.now());
  var today = getTodayISO();
  // Capture existing record BEFORE building data — preserves fields not on the form
  var _existingWO = DB.workOrders.find(function(w){ return w.id===id; }) || {};

  function gv(eid){ 
    var el=document.getElementById(eid); 
    if(!el) return '';
    if(el.contentEditable==='true') return typeof woRtfRead==='function' ? woRtfRead(eid) : (el.innerHTML||'').trim();
    return el.value.trim(); 
  }

  var status   = gv('wo-status') || 'New';
  // Auto-advance to Scheduled only if status is New and a scheduled date is set
  var _newSchedDate = gv('wo-scheduled-date');
  if (_newSchedDate && status.toLowerCase() === 'new') {
    var _hasSchedStatus = _getWOStatuses()
      .find(function(s){ return s.id==='Scheduled'; });
    if (_hasSchedStatus) status = 'Scheduled';
  }
  var priority = gv('wo-priority') || 'Normal';

  // Auto-generate WO number for new — always derive from highest existing
  var woNum;
  if (isNew) {
    var _maxSeq = 1000;
    (DB.workOrders||[]).forEach(function(w){
      var m = (w.woNumber||'').match(/WO-(\d+)/i);
      if (m) { var n=parseInt(m[1],10); if(n>_maxSeq) _maxSeq=n; }
    });
    DB.woSeq = _maxSeq + 1;
    woNum = 'WO-' + DB.woSeq;
    saveDB();
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
    descriptionIsHtml: (function(){ var el=document.getElementById('wo-description'); return !!(el&&el.contentEditable==='true'); })(),
    workPerformed:gv('wo-work-performed'),
    workPerformedIsHtml: (function(){ var el=document.getElementById('wo-work-performed'); return !!(el&&el.contentEditable==='true'&&gv('wo-work-performed')); })(),
    status:       status,
    priority:     priority,
    serviceType:  gv('wo-service-type'),
    refNum:       gv('wo-ref-num'),
    siteAddr:     gv('wo-site-addr'),
    siteCity:     gv('wo-site-city'),
    siteState:    gv('wo-site-state'),
    siteZip:      gv('wo-site-zip'),
    dateRequested:  gv('wo-date-requested'),
    dateFollowup:   gv('wo-date-followup'),
    scheduledDate:  gv('wo-scheduled-date'),
    scheduledTime:  gv('wo-scheduled-time'),
    wtProjectId:    (function(){ var el=document.getElementById('wo-form-wrap'); return el?el.getAttribute('data-wt-project')||null:null; })(),
    dateOpened:   dateOpened,
    dateClosed:   (!_getWOStatusDef(status).open)?today:(isNew?null:(_existingWO.dateClosed||null)),
    laborRate:    parseFloat(gv('wo-labor-rate'))||125,
    taxRate:      parseFloat(gv('wo-tax-rate'))||0,
    internalNotes:(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office'))?gv('wo-internal-notes'):'',
    createdAt:    isNew ? new Date().toISOString() : (_existingWO.createdAt||new Date().toISOString()),
    updatedAt:    new Date().toISOString(),
    createdBy:    isNew ? ((_currentUser&&_currentUser.id)||null) : (_existingWO.createdBy||null),
    createdByName:isNew ? ((_currentUser&&_currentUser.full_name)||'Unknown') : (_existingWO.createdByName||'Unknown'),
    assignedTechs:   isNew ? [] : (_existingWO.assignedTechs||[]),
    parentWoId:      isNew ? (window._newWOParentId||null) : (_existingWO.parentWoId||null),
    isChangeOrder:   isNew ? !!(window._newWOParentId) : (_existingWO.isChangeOrder||false),
    changeOrderReason: isNew ? (window._newWOCOReason||null) : (_existingWO.changeOrderReason||null),
  };
  // Clear the CO context after consuming it
  if (isNew) { window._newWOParentId=null; window._newWOCOReason=null; }

  if (isNew) {
    DB.workOrders.push(data);
    _woCurrentId = id;
  } else {
    var idx = DB.workOrders.findIndex(function(w){ return w.id===id; });
    if (idx>=0) DB.workOrders[idx]=data; else DB.workOrders.push(data);
  }

  // Update invoice button visibility
  var invBtn=document.getElementById('wo-btn-invoice');
  if(invBtn) invBtn.style.display=(status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office')))?'':'none';

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
  // Show created date immediately after first save
  var creEl = document.getElementById('wo-created-date');
  if (creEl && isNew) creEl.value = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  // Show print button as soon as WO is saved — even on first save
  var pb = document.getElementById('wo-btn-print'); if (pb) pb.style.display='';
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
  if(invBtn) invBtn.style.display=(status==='Ready for Pricing'&&(_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office')))?'':'none';
}
function onWOPriorityChange(val) {
  var badge=document.getElementById('wo-urgent-badge');
  if(badge) badge.style.display=val==='Urgent'?'inline-block':'none';
}

// ---- CUSTOMER AUTOCOMPLETE ----
function onWOCustomerInput(val) {
  var drop=document.getElementById('wo-customer-dropdown');
  if (!drop) return;
  var v = (val||'').trim().toLowerCase();
  var matches = v
    ? (DB.customers||[]).filter(function(c){ return (c.name||'').toLowerCase().includes(v); }).slice(0,10)
    : (DB.customers||[]).slice().sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); }).slice(0,15);
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
  if (tab==='photos')    { content.innerHTML = renderWODocsTab(id); }
  if (tab==='fieldlog')  { renderWOFieldLogTab(id); }
  if (tab==='tracking')  { content.innerHTML = renderWOTrackingTab(id); }
}



// ── WO Work Tracking Phase Tab ─────────────────────────────────────────────
function wtGetProjData(projId) {
  if (!projId) return {};
  return (DB.wtData && DB.wtData[projId]) || {};
}

function renderWOTrackingTab(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return '<p>Work order not found.</p>';

  var el = document.getElementById('wo-form-wrap');
  var projId = wo.wtProjectId || (el && el.getAttribute('data-wt-project')) || '';
  var proj = projId ? (DB.wtProjects||[]).find(function(p){ return p.id===projId; }) : null;

  // No project linked
  if (!proj) {
    var opts = (DB.wtProjects||[])
      .filter(function(p){ return !p.archived; })
      .map(function(p){
        var label = escHtml(p.name||'Unnamed') + (p.customerName?' — '+escHtml(p.customerName):'');
        return '<option value="' + escHtml(p.id) + '">' + label + '</option>';
      }).join('');

    return '<div style="text-align:center;padding:24px 12px" data-wo-id="' + woId + '">' +
      '<div style="font-size:32px;margin-bottom:8px">📊</div>' +
      '<div style="font-size:14px;font-weight:700;color:#0d1b2a;margin-bottom:6px">No Work Tracking project linked</div>' +
      '<div style="font-size:12px;color:#546e7a;margin-bottom:16px">' +
        'Link an existing project or create a new one to track phase progress from this work order.' +
      '</div>' +
      (opts
        ? '<div style="margin-bottom:12px">' +
            '<select id="wo-wt-link-sel" style="width:100%;max-width:320px;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px">' +
              '<option value="">— Select project —</option>' + opts +
            '</select>' +
            '<button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="woLinkWTProject()">Link Selected Project</button>' +
          '</div>'
        : '') +
      '<div style="color:#90a4ae;font-size:11px;margin-bottom:8px">— or —</div>' +
      '<button class="btn btn-outline btn-sm" onclick="woCreateWTProject()">+ Create New WT Project</button>' +
    '</div>';
  }

  // Project linked — build phase progress
  var d = wtGetProjData(projId);
  var items = d.items || [];
  var checkoffs = DB.wtCheckoffs || d.checkoffs || [];

  function getItemCO(itemId, phaseId) {
    return checkoffs.find(function(c){ return c.item_id===itemId && c.phase===phaseId; });
  }

  function phaseStats(phaseId) {
    var phItems = items.filter(function(it){
      var pr = it.phases_required;
      return !pr || !pr.length || pr.indexOf(phaseId)>=0;
    });
    var total = phItems.length;
    if (!total) return {total:0,done:0,pct:0,color:'#90a4ae'};
    var done = phItems.filter(function(it){
      var co = getItemCO(it.id, phaseId);
      return co && (co.status==='confirmed'||co.status==='submitted');
    }).length;
    var pct = Math.round(done/total*100);
    return {total:total, done:done, pct:pct, color: pct>=100?'#2e7d32':pct>=50?'#1565c0':'#90a4ae'};
  }

  var phases = typeof WT_PHASES!=='undefined' ? WT_PHASES : [
    {id:'rough_in',        label:'Rough-In',        short:'RI',  color:'#e65100',bg:'#fff3e0'},
    {id:'rough_in_verify', label:'RI Verify',        short:'RIV', color:'#f57c00',bg:'#fff8e1'},
    {id:'devicing',        label:'Device & Term',    short:'D&T', color:'#1565c0',bg:'#e3f2fd'},
    {id:'testing',         label:'Test & Label',     short:'T&L', color:'#2e7d32',bg:'#e8f5e9'},
    {id:'final_verify',    label:'Final Verify',     short:'FV',  color:'#6a1b9a',bg:'#f3e5f5'},
  ];

  var phaseRows = phases.map(function(ph){
    var st = phaseStats(ph.id);
    return '<div style="margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;background:'+ph.bg+';color:'+ph.color+'">' + ph.short + '</span>' +
          '<span style="font-size:13px;font-weight:600;color:#0d1b2a">' + ph.label + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#546e7a">' + st.done + ' / ' + st.total +
          ' <span style="font-weight:700;color:'+st.color+'">' + st.pct + '%</span>' +
        '</div>' +
      '</div>' +
      '<div style="height:8px;background:#e0e7ef;border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:'+st.pct+'%;background:'+st.color+';border-radius:4px;transition:width .4s"></div>' +
      '</div>' +
    '</div>';
  }).join('');

  var overallDone = phases.reduce(function(s,ph){ return s+phaseStats(ph.id).done; },0);
  var overallTotal = phases.length * (items.length||1);
  var overallPct   = overallTotal>0 ? Math.round(overallDone/overallTotal*100) : 0;
  var overallColor = overallPct>=100 ? '#2e7d32' : '#1565c0';

  return '<div>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:700;color:#0d1b2a">' + escHtml(proj.name||'') + '</div>' +
        '<div style="font-size:11px;color:#546e7a">' + items.length + ' items</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="btn btn-primary btn-sm" onclick="woOpenWTProject()">Open Project</button>' +
        '<button class="btn btn-ghost btn-sm" style="color:#c62828" onclick="woUnlinkWTProject()">✕ Unlink</button>' +
      '</div>' +
    '</div>' +
    '<div style="margin-bottom:16px;padding:10px 12px;background:#f5f7fa;border-radius:8px">' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#546e7a;margin-bottom:6px">' +
        '<span>OVERALL PROGRESS</span><span>' + overallPct + '%</span>' +
      '</div>' +
      '<div style="height:10px;background:#e0e7ef;border-radius:5px;overflow:hidden">' +
        '<div style="height:100%;width:'+overallPct+'%;background:'+overallColor+';border-radius:5px;transition:width .4s"></div>' +
      '</div>' +
    '</div>' +
    phaseRows +
  '</div>';
}

// Use _woCurrentId since that's always the open WO
function woLinkWTProject() {
  var sel = document.getElementById('wo-wt-link-sel');
  if (!sel || !sel.value) { showToast('Select a project first','warning',2000); return; }
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  if (!wo) return;
  wo.wtProjectId = sel.value;
  var el = document.getElementById('wo-form-wrap');
  if (el) el.setAttribute('data-wt-project', sel.value);
  saveDB();
  switchWOTab('tracking');
  showToast('Work Tracking project linked','success',2000);
}

function woUnlinkWTProject() {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  if (!wo) return;
  wo.wtProjectId = null;
  var el = document.getElementById('wo-form-wrap');
  if (el) el.setAttribute('data-wt-project','');
  saveDB();
  switchWOTab('tracking');
  showToast('Project unlinked','info',2000);
}

function woOpenWTProject() {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  var projId = wo ? wo.wtProjectId : null;
  if (!projId) return;
  if (typeof goPage==='function') goPage('worktracking');
  setTimeout(function(){
    if (typeof wtOpenProject==='function') wtOpenProject(projId);
  }, 300);
}

function woCreateWTProject() {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  if (typeof goPage==='function') goPage('worktracking');
  setTimeout(function(){
    if (typeof wtShowNewProjectWizard==='function') {
      wtShowNewProjectWizard({
        name: wo ? (wo.description||wo.woNumber||'Work Order') : '',
        customerName: wo ? (wo.customerName||'') : ''
      });
    }
  }, 300);
}



// ── Work Order Print / Save as PDF ────────────────────────────────────────────
function printWorkOrder(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) { showToast('Work order not found','error',2000); return; }

  var co = DB.settings || {};
  var labor   = (DB.woLabor||[]).filter(function(l){ return l.woId===woId; });
  var parts   = (DB.woParts||[]).filter(function(p){ return p.woId===woId; });
  var expenses= (DB.woExpenses||[]).filter(function(e){ return e.woId===woId; });
  var checklist=(DB.woChecklist||[]).filter(function(c){ return c.woId===woId; });

  // Clocked time entries
  var clocked = (DB.timeEntries||[]).filter(function(t){ return t.jobId===woId||t.job_id===woId; });
  var clockedHrs = clocked.reduce(function(s,t){ return s+(parseFloat(t.totalHours)||0); },0);

  var techNames = (wo.assignedTechs||[]).map(function(t){ return typeof t==='string'?t:(t.name||''); }).filter(Boolean);

  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(d){ if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); } catch(e){ return d; } }
  function fmtTime(t){ if (!t) return ''; var p=t.split(':'); var h=parseInt(p[0]); var m=p[1]; return (h>12?h-12:h||12)+':'+m+' '+(h>=12?'PM':'AM'); }

  var st = typeof _getWOStatusDef==='function' ? _getWOStatusDef(wo.status) : {color:'#546e7a'};

  var laborRows = labor.map(function(e){
    return '<tr><td>'+esc(e.techName||'')+'</td><td>'+esc(e.entryType||'Work')+'</td><td>'+esc(e.notes||'')+'</td><td style="text-align:right">'+parseFloat(e.hours||0).toFixed(1)+'</td></tr>';
  }).join('');
  var clockedRows = clocked.map(function(t){
    var member = (DB.team||[]).find(function(m){ return m.id===t.teamMemberId; });
    var name = member ? member.name : (t.userName||'');
    return '<tr><td>'+esc(name)+'</td><td>Clocked (Time Clock)</td><td>'+esc(t.notes||'')+'</td><td style="text-align:right">'+parseFloat(t.totalHours||0).toFixed(1)+'</td></tr>';
  }).join('');
  var totalLaborHrs = labor.reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0) + clockedHrs;
  var laborRate = parseFloat(wo.laborRate || co.laborRate || 65);
  var laborCost = totalLaborHrs * laborRate;

  var partsRows = parts.map(function(p){
    return '<tr><td>'+esc(p.name||p.partNum||'')+'</td><td>'+esc(p.partNum||'')+'</td><td style="text-align:right">'+parseFloat(p.qty||1).toFixed(0)+'</td><td style="text-align:right">$'+parseFloat(p.unitCost||0).toFixed(2)+'</td><td style="text-align:right">$'+parseFloat((p.qty||1)*(p.unitCost||0)).toFixed(2)+'</td></tr>';
  }).join('');
  var partsCost = parts.reduce(function(s,p){ return s+(parseFloat(p.qty||1)*parseFloat(p.unitCost||0)); },0);

  var expRows = expenses.map(function(e){
    return '<tr><td>'+esc(e.category||'')+'</td><td>'+esc(e.description||'')+'</td><td>'+esc(e.paymentType||'')+'</td><td style="text-align:right">$'+parseFloat(e.amount||0).toFixed(2)+'</td></tr>';
  }).join('');
  var expCost = expenses.reduce(function(s,e){ return s+parseFloat(e.amount||0); },0);

  var checklistHtml = checklist.length
    ? '<h3>CHECKLIST</h3><table><tbody>'+
        checklist.map(function(c){
          return '<tr><td style="width:20px">'+(c.completed?'&#9745;':'&#9744;')+'</td><td>'+esc(c.item)+'</td></tr>';
        }).join('')+
      '</tbody></table>'
    : '';

  var totalCost = laborCost + partsCost + expCost;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
    '<title>Work Order '+esc(wo.woNumber||'')+'</title>'+
    '<style>'+
      '*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'+
      'body{padding:24px;font-size:12px;color:#0d1b2a;background:#fff;}'+
      '@media print{body{padding:0;}@page{margin:20mm;}}'+
      '.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:18px;}'+
      '.company-name{font-size:18px;font-weight:700;color:#0d1b2a;}'+
      '.company-info{font-size:11px;color:#546e7a;margin-top:3px;}'+
      '.wo-badge{text-align:right;}'+
      '.wo-num{font-size:24px;font-weight:800;color:#1565c0;}'+
      '.wo-status{display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:700;margin-top:4px;background:'+st.color+';color:#fff;}'+
      '.section{margin-bottom:18px;}'+
      'h2{font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e0e7ef;padding-bottom:4px;margin-bottom:10px;}'+
      'h3{font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;}'+
      '.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}'+
      '.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}'+
      '.field-label{font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;margin-bottom:2px;}'+
      '.field-val{font-size:12px;color:#0d1b2a;}'+
      'table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;}'+
      'th{background:#f5f7fa;padding:6px 8px;text-align:left;font-weight:700;font-size:10px;color:#546e7a;text-transform:uppercase;border-bottom:2px solid #e0e7ef;}'+
      'td{padding:6px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;}'+
      '.total-row td{font-weight:700;background:#f5f7fa;border-top:2px solid #e0e7ef;}'+
      '.sig-section{margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:32px;}'+
      '.sig-line{border-top:1px solid #0d1b2a;padding-top:6px;font-size:11px;color:#546e7a;}'+
      '.footer{margin-top:24px;border-top:1px solid #e0e7ef;padding-top:10px;font-size:10px;color:#90a4ae;text-align:center;}'+
      '.desc-box{background:#f9f9f9;border:1px solid #e0e7ef;border-radius:6px;padding:10px 12px;font-size:12px;min-height:60px;line-height:1.6}'+
      '.desc-box h3{font-size:12px;font-weight:700;color:#1f3b57;margin:8px 0 3px}'+
      '.desc-box ul,.desc-box ol{padding-left:18px;margin:3px 0}'+
      '.desc-box li{margin:1px 0}'+
      '.desc-box strong{font-weight:700}'+
      '.desc-box em{font-style:italic}'+
      '.no-print-btn{position:fixed;top:16px;right:16px;background:#1565c0;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;z-index:1000;}'+
      '@media print{.no-print-btn{display:none;}}'+
    '</style>'+
    '</head><body>'+

    '<button class="no-print-btn" onclick="window.print()">🖨 Print / Save PDF</button>'+

    // Header
    '<div class="header">'+
      '<div>'+
        (co.logoUrl?'<img src="'+esc(co.logoUrl)+'" style="height:48px;margin-bottom:6px"><br>':'<div class="company-name">'+esc(co.cname||'TCSS')+'</div>')+
        '<div class="company-info">'+
          esc(co.address||'')+(co.address?'<br>':'')+
          esc(co.city||'')+(co.city&&co.state?' '+esc(co.state):'')+(co.zip?' '+esc(co.zip):'')+
          ((co.city||co.phone)?'<br>':'')+
          (co.phone?esc(co.phone):'')+(co.phone&&co.email?' &nbsp;|&nbsp; ':'')+
          (co.email?esc(co.email):'')+
        '</div>'+
      '</div>'+
      '<div class="wo-badge">'+
        '<div class="wo-num">'+esc(wo.woNumber||'WO')+'</div>'+
        '<div><span class="wo-status">'+esc(wo.status||'')+'</span></div>'+
        (wo.priority&&wo.priority!=='Normal'?'<div style="margin-top:4px;font-size:11px;font-weight:700;color:#c62828">'+esc(wo.priority)+'</div>':'')+
      '</div>'+
    '</div>'+

    // Dates row
    '<div class="section">'+
      '<div class="grid-3">'+
        '<div><div class="field-label">Scheduled</div><div class="field-val">'+(wo.scheduledDate?fmt(wo.scheduledDate)+(wo.scheduledTime?' at '+fmtTime(wo.scheduledTime):''):'Not scheduled')+'</div></div>'+
        '<div><div class="field-label">Date Requested</div><div class="field-val">'+fmt(wo.dateRequested)+'</div></div>'+
        '<div><div class="field-label">Created</div><div class="field-val">'+fmt(wo.createdAt)+'</div></div>'+
      '</div>'+
    '</div>'+

    // Customer + Site
    '<div class="section">'+
      '<h2>Customer &amp; Site</h2>'+
      '<div class="grid-2">'+
        '<div>'+
          '<div class="field-label">Customer</div><div class="field-val" style="font-weight:700">'+esc(wo.customerName||'—')+'</div>'+
          (wo.serviceType?'<div class="field-val" style="margin-top:4px;color:#546e7a">'+esc(wo.serviceType)+'</div>':'')+
        '</div>'+
        '<div>'+
          '<div class="field-label">Site Address</div>'+
          '<div class="field-val">'+esc(wo.siteAddr||'')+'<br>'+esc(wo.siteCity||'')+(wo.siteCity&&wo.siteState?', ':'')+esc(wo.siteState||'')+(wo.siteZip?' '+esc(wo.siteZip):'')+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+

    // Assigned Techs
    (techNames.length?
    '<div class="section">'+
      '<h2>Assigned Technicians</h2>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        techNames.map(function(n){ return '<span style="background:#e3f2fd;color:#1565c0;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:700">'+esc(n)+'</span>'; }).join('')+
      '</div>'+
    '</div>':'') +

    // Description
    '<div class="section">'+
      '<h2>Description of Work</h2>'+
      '<div class="desc-box">'+(wo.descriptionIsHtml ? wo.description : esc(wo.description||'').replace(/\n/g,'<br>'))+'</div>'+
    '</div>'+

    // Work Performed (if filled)
    (wo.workPerformed?
    '<div class="section">'+
      '<h2>Work Performed</h2>'+
      '<div class="desc-box">'+(wo.workPerformedIsHtml ? wo.workPerformed : esc(wo.workPerformed).replace(/\n/g,'<br>'))+'</div>'+
    '</div>':'') +

    // Labor
    ((laborRows||clockedRows)?
    '<div class="section">'+
      '<h2>Labor</h2>'+
      '<table><thead><tr><th>Technician</th><th>Type</th><th>Notes</th><th style="text-align:right">Hrs</th></tr></thead>'+
      '<tbody>'+laborRows+clockedRows+'</tbody>'+
      '<tfoot><tr class="total-row"><td colspan="3">Total Labor</td><td style="text-align:right">'+totalLaborHrs.toFixed(1)+' hrs @ $'+laborRate.toFixed(0)+'/hr</td></tr></tfoot>'+
      '</table>'+
      '<div style="text-align:right;font-size:12px;color:#1565c0;font-weight:700">Labor Total: $'+laborCost.toFixed(2)+'</div>'+
    '</div>':'') +

    // Parts
    (partsRows?
    '<div class="section">'+
      '<h2>Parts &amp; Materials</h2>'+
      '<table><thead><tr><th>Description</th><th>Part #</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Total</th></tr></thead>'+
      '<tbody>'+partsRows+'</tbody>'+
      '<tfoot><tr class="total-row"><td colspan="4">Parts Total</td><td style="text-align:right">$'+partsCost.toFixed(2)+'</td></tr></tfoot>'+
      '</table>'+
    '</div>':'') +

    // Expenses
    (expRows?
    '<div class="section">'+
      '<h2>Expenses</h2>'+
      '<table><thead><tr><th>Category</th><th>Description</th><th>Payment</th><th style="text-align:right">Amount</th></tr></thead>'+
      '<tbody>'+expRows+'</tbody>'+
      '<tfoot><tr class="total-row"><td colspan="3">Expenses Total</td><td style="text-align:right">$'+expCost.toFixed(2)+'</td></tr></tfoot>'+
      '</table>'+
    '</div>':'') +

    // Total
    ((laborRows||clockedRows||partsRows||expRows)?
    '<div style="text-align:right;font-size:14px;font-weight:800;color:#0d1b2a;border-top:2px solid #0d1b2a;padding-top:8px;margin-bottom:18px">'+
      'TOTAL ESTIMATED COST: $'+totalCost.toFixed(2)+
    '</div>':'') +

    // Checklist
    checklistHtml +

    // Notes
    (wo.internalNotes?
    '<div class="section">'+
      '<h2>Notes</h2>'+
      '<div class="desc-box">'+esc(wo.internalNotes)+'</div>'+
    '</div>':'') +

    // Signature lines
    '<div class="sig-section">'+
      '<div><div class="sig-line">Customer Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div></div>'+
      '<div><div class="sig-line">Authorized By (TCSS) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div></div>'+
    '</div>'+

    // Footer
    '<div class="footer">'+
      esc(co.cname||'Total Communications Systems & Solutions, Inc.')+' &nbsp;|&nbsp; '+
      esc(co.phone||'')+' &nbsp;|&nbsp; '+
      esc(co.email||'')+' &nbsp;|&nbsp; '+
      'tcssbuild.com'+
    '</div>'+

    '</body></html>';

  var win = window.open('','_blank','width=900,height=1100');
  win.document.write(html);
  win.document.close();
  win.focus();
}


// ---- LABOR TAB ----
function renderWOLaborTab(woId) {
  var manualEntries = (DB.woLabor||[]).filter(function(l){ return l.woId===woId; });
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });

  // ---- Pull clocked time entries for this WO from DB.timeEntries ----
  var clockedEntries = (DB.timeEntries||[]).filter(function(t){
    return t.jobId===woId || t.job_id===woId;
  }).map(function(t) {
    // Look up tech name from team member ID
    var member = (DB.team||[]).find(function(m){ return m.id===t.teamMemberId||m.id===t.team_member_id; });
    var techName = member ? member.name : (t.userName||t.user_name||'Unknown');
    // Calculate hours
    var hrs = 0;
    if (t.totalHours) {
      hrs = parseFloat(t.totalHours)||0;
    } else if (t.clockIn && t.clockOut) {
      var ms = new Date(t.clockOut) - new Date(t.clockIn);
      hrs = ms / 3600000;
      if (t.breakMinutes) hrs -= (t.breakMinutes/60);
      hrs = Math.max(0, hrs);
    } else if (t.clockIn && !t.clockOut) {
      // Still active — calculate to now
      var ms = Date.now() - new Date(t.clockIn);
      hrs = Math.max(0, ms / 3600000);
    }
    return {
      id:         t.id,
      woId:       woId,
      techName:   techName,
      hours:      Math.round(hrs*100)/100,
      entryType:  'clocked',
      clockIn:    t.clockIn || t.clock_in,
      clockOut:   t.clockOut || t.clock_out,
      isActive:   !t.clockOut && !t.clock_out,
      source:     'clock',
      createdAt:  t.clockIn || t.created_at
    };
  });

  // Merge: all entries for the tab
  var entries = manualEntries.concat(clockedEntries);

  // ---- SUMMARY: hours by tech ----
  var techMap = {};
  entries.forEach(function(e) {
    var t = e.techName||'Unknown';
    var type = (e.entryType||'work').toLowerCase();
    if (!techMap[t]) techMap[t] = { work:0, travel:0, clocked:0 };
    if (type==='travel') techMap[t].travel += parseFloat(e.hours)||0;
    else if (type==='clocked') techMap[t].clocked += parseFloat(e.hours)||0;
    else techMap[t].work += parseFloat(e.hours)||0;
  });
  var totalWork    = manualEntries.filter(function(e){return (e.entryType||'work')!=='travel';}).reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0);
  var totalTravel  = manualEntries.filter(function(e){return (e.entryType||'work')==='travel';}).reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0);
  var totalClocked = clockedEntries.reduce(function(s,e){return s+(parseFloat(e.hours)||0);},0);
  var totalAll     = totalWork + totalTravel + totalClocked;

  var html = '<div style="margin-bottom:16px">';

  if (!entries.length) {
    html += '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No labor logged yet. Use the timers at the bottom or add a manual entry.</div>';
    html += '<button class="btn btn-outline btn-sm" onclick="addWOLaborEntry()">+ Add Manual Entry</button>';
    return html + '</div>';
  }

  // Summary totals bar
  html +=
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
      '<div style="display:flex;gap:16px;align-items:center">'+
        '<span style="font-weight:700;font-size:14px">Total: '+totalAll.toFixed(1)+' hrs</span>'+
        (totalClocked>0?'<span style="font-size:12px;color:#1565c0;font-weight:600">⏱ '+totalClocked.toFixed(1)+' clocked</span>':'')+
        (totalWork>0?'<span style="font-size:12px;color:#546e7a">✏ '+totalWork.toFixed(1)+' manual</span>':'')+
        (totalTravel>0?'<span style="font-size:12px;color:#f57c00">🚗 '+totalTravel.toFixed(1)+' travel</span>':'')+
      '</div>'+
      '<button class="btn btn-outline btn-sm" onclick="addWOLaborEntry()">+ Add Manual Entry</button>'+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">'+
      '<thead><tr style="background:#f0f4f8">'+
        '<th style="padding:8px 10px;text-align:left;font-weight:700;color:#546e7a;font-size:11px;text-transform:uppercase">Technician</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#1565c0;font-size:11px;text-transform:uppercase">⏱ Clocked</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#546e7a;font-size:11px;text-transform:uppercase">✏ Manual</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#f57c00;font-size:11px;text-transform:uppercase">🚗 Travel</th>'+
        '<th style="padding:8px 10px;text-align:center;font-weight:700;color:#1565c0;font-size:11px;text-transform:uppercase">Total</th>'+
      '</tr></thead><tbody>';

  Object.keys(techMap).sort().forEach(function(name) {
    var t = techMap[name];
    var tot = (t.work||0) + (t.travel||0) + (t.clocked||0);
    html +=
      '<tr style="border-bottom:1px solid #f0f4f8">'+
        '<td style="padding:9px 10px;font-weight:600">'+escHtml(name)+'</td>'+
        '<td style="padding:9px 10px;text-align:center;color:#1565c0;font-weight:600">'+((t.clocked||0)>0?(t.clocked||0).toFixed(1):'—')+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+((t.work||0)>0?(t.work||0).toFixed(1):'\u2014')+'</td>'+
        '<td style="padding:9px 10px;text-align:center;color:#f57c00">'+((t.travel||0)>0?(t.travel||0).toFixed(1):'\u2014')+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#1565c0">'+tot.toFixed(1)+'</td>'+
      '</tr>';
  });

  // Totals row
  html +=
      '<tr style="background:#f8f9fa;border-top:2px solid #e0e7ef">'+
        '<td style="padding:9px 10px;font-weight:700">Total</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#1565c0">'+(totalClocked>0?totalClocked.toFixed(1):'\u2014')+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700">'+(totalWork>0?totalWork.toFixed(1):'\u2014')+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#f57c00">'+(totalTravel>0?totalTravel.toFixed(1):'\u2014')+'</td>'+
        '<td style="padding:9px 10px;text-align:center;font-weight:700;color:#1565c0">'+totalAll.toFixed(1)+'</td>'+
      '</tr>'+
    '</tbody></table>';

  // ---- DETAIL LOG — entries already merged (manual + clocked) ----
  var allEntries = entries.slice();

  var byDate = {};
  allEntries.forEach(function(e){
    var d = (e.clockIn||'').split('T')[0] || (e.createdAt||'').split('T')[0] || 'Unknown';
    if (!byDate[d]) byDate[d]=[];
    byDate[d].push(e);
  });

  var dateKeys = Object.keys(byDate).sort(); // chronological order
  var isAdmin  = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='manager'||_currentUser.role==='lead_tech');
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
      var isClock  = (e.source==='clock'||type==='clocked');
      var isActive = isClock && e.isActive;
      var isTravel = type==='travel';
      var isLunch  = type==='lunch';
      var borderC  = isClock?(isActive?'#1565c0':'#90caf9'):isTravel?'#ff8f00':isLunch?'#9e9e9e':'#1565c0';
      var badgeBg  = isClock?'#e3f2fd':isTravel?'#fff3e0':isLunch?'#f5f5f5':'#e3f2fd';
      var badgeC   = isClock?'#1565c0':isTravel?'#e65100':isLunch?'#546e7a':'#1565c0';
      var typeLabel= isClock?(isActive?'⏱ Active':'⏱ Clocked'):type.charAt(0).toUpperCase()+type.slice(1);
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
  var newLabor = { id:'wol-'+Date.now(), woId:woId, techName:techName.trim(), entryType:'work', hours:hours, notes:notes, clockIn:new Date().toISOString(), createdAt:new Date().toISOString() };
  DB.woLabor.push(newLabor);
  var woRec=(DB.workOrders||[]).find(function(w){return w.id===woId;});
  if (woRec&&woRec.status==='New'){woRec.status='Open';var sel=document.getElementById('wo-status');if(sel)sel.value='Open';}
  autoPromoteWOStatus(woId);
  saveDB();
  // Push to Supabase so hours persist across reloads
  if (typeof _sb!=='undefined' && _sb) {
    _sb.from('wo_labor').insert({
      id:newLabor.id, wo_id:woId, tech_name:newLabor.techName,
      entry_type:'work', hours:hours, notes:notes, created_at:newLabor.createdAt
    }).then(function(){});
  }
  switchWOTab('labor');
  setTimeout(function(){var cp=document.getElementById('wo-change-orders-panel');if(cp)cp.innerHTML=renderWOChangeOrders(_woCurrentId);},300);
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
        '<div style="position:relative">'+
          '<span style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:12px;color:#546e7a;font-weight:700">$</span>'+
          '<input id="woe-amt" type="number" min="0" step="0.01" placeholder="0.00" '+
          'style="width:100%;padding:7px 7px 7px 18px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;font-weight:600;box-sizing:border-box" '+
          'onblur="this.value=parseFloat(this.value||0).toFixed(2)" '+
          'onfocus="if(this.value===\'0.00\')this.value=\'\'">'+
        '</div></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Paid By</label>'+
        '<select id="woe-pay" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
          payTypes.map(function(p){return '<option>'+escHtml(p)+'</option>';}).join('')+'</select></div>'+
      '<div><label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Date</label>'+
        '<input id="woe-date" type="date" value="'+getTodayISO()+'" style="width:100%;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px"></div>'+
      '<div><button class="btn btn-primary btn-sm" style="margin-top:18px" onclick="addWOExpense()">Add</button></div>'+
    '</div>'+
    '<div style="margin-top:10px;padding:10px;background:#fff;border:1px solid #e0e7ef;border-radius:6px">'+
      '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:6px">📎 Attach Receipt (optional)</div>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#1565c0">'+
          '📷 Take Photo'+
          '<input type="file" id="woe-receipt-cam" accept="image/*" capture="environment" style="display:none" onchange="woeReceiptSelected(this)">'+
        '</label>'+
        '<label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#f3e5f5;border:1px solid #ce93d8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#6a1b9a">'+
          '📁 Choose File'+
          '<input type="file" id="woe-receipt-file" accept="image/*,application/pdf" style="display:none" onchange="woeReceiptSelected(this)">'+
        '</label>'+
        '<span id="woe-receipt-name" style="font-size:11px;color:#2e7d32;font-style:italic"></span>'+
      '</div>'+
    '</div>'+
  '</div>';

  if (!entries.length) return html+'<div style="color:#90a4ae;font-size:13px">No expenses logged yet.</div>';

  html += entries.map(function(e){
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #f0f4f8">'+
      '<div style="flex:1">'+
        '<div style="font-weight:600;font-size:13px">'+escHtml(e.category||'')+'</div>'+
        '<div style="font-size:11px;color:#546e7a">'+escHtml(e.description||'')+' · '+escHtml(e.paymentType||'')+' · '+escHtml(e.date||'')+' · '+escHtml(e.loggedBy||'')+'</div>'+
        (e.receiptUrl?'<a href="'+escHtml(e.receiptUrl)+'" target="_blank" style="font-size:11px;color:#1565c0;font-weight:600">📎 View Receipt</a>':'')+
      '</div>'+
      '<div style="font-weight:700;color:#1565c0;min-width:60px;text-align:right">$'+parseFloat(e.amount||0).toFixed(2)+'</div>'+
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
  var expEntry = {
    id:'woe-'+Date.now(), woId:woId,
    category:(document.getElementById('woe-cat')||{}).value||'',
    description:(document.getElementById('woe-desc')||{}).value||'',
    amount:amt,
    paymentType:(document.getElementById('woe-pay')||{}).value||'',
    date:(document.getElementById('woe-date')||{}).value||getTodayISO(),
    loggedBy:(_currentUser&&_currentUser.full_name)||'Unknown',
    createdAt:new Date().toISOString(),
    receiptUrl:null
  };
  DB.woExpenses.push(expEntry);
  saveDB();
  // Upload receipt if attached
  // Check both camera and file inputs for receipt
  var receiptCam  = document.getElementById('woe-receipt-cam');
  var receiptFile = document.getElementById('woe-receipt-file');
  var receiptF = (receiptCam&&receiptCam.files&&receiptCam.files[0]) ? receiptCam :
                 (receiptFile&&receiptFile.files&&receiptFile.files[0]) ? receiptFile : null;
  if (receiptF && receiptF.files && receiptF.files[0]) {
    uploadWODocument(receiptF.files[0], woId, 'Receipt: '+expEntry.category+' $'+amt.toFixed(2)).then(function(doc){
      if (doc) {
        expEntry.receiptUrl = doc.url;
        expEntry.receiptDocId = doc.id;
        saveDB();
        refreshWOQuickStats(woId);
      }
    });
    receiptF.value = '';
    var nameEl = document.getElementById('woe-receipt-name');
    if (nameEl) nameEl.textContent = '';
  }
  switchWOTab('expenses');
  refreshWOQuickStats(woId);
  showToast('Expense added','success');

  // Expense alert — notify office if enabled
  if (DB.settings.notifExpenseEnabled !== false) {
    var isOffice = _currentUser && ['owner','manager','back_office'].includes(_currentUser.role);
    if (!isOffice) {
      // Field tech logged it — notify office
      var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
      var woNum = wo ? (wo.woNumber||'WO') : 'WO';
      var custName = wo ? (wo.customer||'') : '';
      if (typeof addNotification === 'function') {
        addNotification(
          'expense_logged',
          '💰 Expense Logged — '+woNum,
          expEntry.loggedBy+' logged $'+amt.toFixed(2)+' ('+expEntry.category+')' + (custName ? ' · '+custName : ''),
          'wo'
        );
      }
    }
  }
}

function deleteWOExpense(id) {
  if (!confirm('Remove this expense?')) return;
  DB.woExpenses = (DB.woExpenses||[]).filter(function(e){ return e.id!==id; });
  saveDB();
  if (_sb && _currentUser) _sb.from('wo_expenses').delete().eq('id',id).then(function(){});
  switchWOTab('expenses');
  refreshWOQuickStats(_woCurrentId);
}

// ---- PARTS TAB ----
function renderWOPartsTab(woId) {
  var parts    = (DB.woParts||[]).filter(function(p){ return p.woId===woId; });
  var isOffice = _currentUser&&(_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='lead_tech');

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
  var newCl = {id:'wocl-'+Date.now(),woId:woId,item:item.trim(),completed:false,createdAt:new Date().toISOString()};
  DB.woChecklist.push(newCl);
  saveDB();
  if (typeof _sb!=='undefined'&&_sb) {
    _sb.from('wo_checklist').insert({id:newCl.id,wo_id:woId,item:newCl.item,completed:false,created_at:newCl.createdAt}).then(function(){});
  }
  switchWOTab('checklist');
}

function toggleWOChecklistItem(id,checked) {
  var item=(DB.woChecklist||[]).find(function(c){return c.id===id;});
  if(item){item.completed=checked;item.completedBy=checked?((_currentUser&&_currentUser.full_name)||'Unknown'):null;item.completedAt=checked?new Date().toISOString():null;}
  saveDB(); switchWOTab('checklist');
}

function deleteWOChecklistItem(id) {
  DB.woChecklist=(DB.woChecklist||[]).filter(function(c){return c.id!==id;});
  saveDB();
  if (typeof _sb!=='undefined'&&_sb) {
    _sb.from('wo_checklist').delete().eq('id',id).then(function(){});
  }
  switchWOTab('checklist');
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
  if (subtotal <= 0) {
    var partsNote = parts.length ? ' There are '+parts.length+' part(s) listed, but parts are not auto-priced into invoices yet.' : '';
    if (!confirm('No labor hours or expenses are logged on this work order yet, so this invoice will total $0.00.'+partsNote+'\n\nCreate the $0 draft anyway?')) {
      return;
    }
  }
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
    billEmail:(function(){ var c=(DB.customers||[]).find(function(x){return x.id===wo.customerId;}); return c?(c.invoicingEmail||c.email||''):''; })(),
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
      date_requested:   wo.dateRequested||null,
      scheduled_date:   wo.scheduledDate||null,
      scheduled_time:   wo.scheduledTime||null,
      wt_project_id:    wo.wtProjectId||null,
      date_followup: wo.dateFollowup||null,
      date_opened:   wo.dateOpened||null,
      date_closed:   wo.dateClosed||null,
      internal_notes:wo.internalNotes||null,
      invoice_id:    wo.invoiceId||null,
      assigned_techs:wo.assignedTechs||[],
      created_by:    wo.createdBy||_currentUser.id,
      created_by_name:wo.createdByName||null,
      updated_at:     new Date().toISOString(),
      parent_wo_id:   wo.parentWoId||null,
      is_change_order:wo.isChangeOrder||false,
      change_order_reason: wo.changeOrderReason||null,
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
  if (!wo || !techName) return false;
  var techs = wo.assignedTechs || [];
  if (!techs.length) return false;
  var name = techName.toLowerCase().trim();
  return techs.some(function(t) {
    // Handle both plain strings and objects {name:'...', id:'...'}
    var tName = (typeof t === 'string' ? t : (t.name || t.full_name || '')).toLowerCase().trim();
    return tName === name;
  });
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
    el.innerHTML = '<span style="font-size:12px;color:#90a4ae;font-style:italic">No techs assigned yet</span>';
    return;
  }

  var labor    = (DB.woLabor||[]).filter(function(l){ return l.woId===woId; });
  var teEntries= (DB.timeEntries||[]).filter(function(e){ return !e.deleted&&e.woId===woId; });

  var grandHrs = 0;
  var rows = assigned.map(function(name, i) {
    var hrs = 0;
    labor.filter(function(l){return l.techName===name;}).forEach(function(l){hrs+=parseFloat(l.hours)||0;});
    teEntries.filter(function(e){return e.techName===name&&e.entryType!=='lunch';}).forEach(function(e){hrs+=parseFloat(e.totalHours)||0;});
    grandHrs += hrs;
    return '<tr style="background:'+(i%2===0?'#e8edf4':'#f5f7fa')+';border-bottom:1px solid #d0d9e8">' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:700;color:#1a2840">' +
        escHtml(name) +
        '<button onclick="woRemoveTech(\''+escHtml(name)+'\')" title="Remove" '+
          'style="margin-left:8px;background:none;border:none;color:#c62828;cursor:pointer;font-size:11px;padding:0 2px">✕</button>' +
      '</td>' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:700;text-align:right;color:'+(hrs>0?'#0d47a1':'#78909c')+'">'+hrs.toFixed(1)+' hrs</td>' +
    '</tr>';
  }).join('');

  el.innerHTML = '<table style="width:100%;border-collapse:collapse;border-radius:6px;overflow:hidden">' +
    rows +
    '<tr style="background:#e3f2fd;border-top:2px solid #90caf9">' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:700;color:#1a237e">Total</td>' +
      '<td style="padding:5px 8px;font-size:12px;font-weight:700;text-align:right;color:#1a237e">'+grandHrs.toFixed(1)+' hrs</td>' +
    '</tr>' +
  '</table>';
}

function woRemoveTech(techName) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  if (!wo) return;
  wo.assignedTechs = (wo.assignedTechs||[]).filter(function(t){
    return (typeof t==='string'?t:(t.name||'')).toLowerCase() !== techName.toLowerCase();
  });
  saveDB();
  renderAssignedTechs(_woCurrentId);
  try { wtSyncWOTechsToCalendar(wo, []); } catch(e) {}
  if (typeof renderWorkOrders==='function') renderWorkOrders();
  showToast(techName+' removed from WO','info',2000);
}

function openTeamModal() {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; });
  _assigned = (wo && wo.assignedTechs) ? wo.assignedTechs.slice() : [];
  var listEl = document.getElementById('team-modal-list');
  if (!listEl) return;
  var searchEl = document.getElementById('team-modal-search');
  var filterEl = document.getElementById('team-modal-filter');
  if (searchEl) searchEl.value = '';
  if (filterEl) filterEl.value = 'techs';
  _renderTeamModalList(_assigned, '');
  openModal('modal-wo-team');
}

function _renderTeamModalList(assigned, search) {
  var listEl = document.getElementById('team-modal-list');
  if (!listEl) return;
  var filterType = (document.getElementById('team-modal-filter')||{}).value || 'techs';
  var techRoles  = ['field','lead_tech','helper_tech','subcontractor','project_manager'];
  var members = (DB.team||[]).filter(function(m){
    if (!m.active && m.active!==undefined) return false;
    var role = m.access || m.systemRole || m.role || 'field';
    if (filterType==='techs' && techRoles.indexOf(role)<0) return false;
    if (search && !(m.name||'').toLowerCase().includes(search.toLowerCase()) &&
                  !(m.email||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

  listEl.innerHTML = members.map(function(m, i) {
    var isChecked = assigned.indexOf(m.name) >= 0;
    var role = m.access || m.systemRole || m.role || 'field';
    var bg = isChecked ? '#bbdefb' : (i%2===0?'#e8edf4':'#f5f7fa');
    var border = isChecked ? '1px solid #90caf9' : '1px solid #d0d9e8';
    return '<label style="display:flex;align-items:center;gap:10px;padding:7px 14px;cursor:pointer;background:'+bg+';border-bottom:'+border+'">'+
      '<input type="checkbox" data-name="'+escHtml(m.name)+'" '+(isChecked?'checked':'')+
      ' onchange="_teamModalCheck(this)" style="width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:#1565c0">'+
      '<span style="font-size:13px;font-weight:'+(isChecked?'700':'600')+';flex:1;color:'+(isChecked?'#0d47a1':'#1a2840')+'">'+escHtml(m.name||'')+'</span>'+
      '<span style="font-size:11px;font-weight:600;color:'+(isChecked?'#1565c0':'#78909c')+'">'+escHtml(role)+'</span>'+
    '</label>';
  }).join('') || '<div style="padding:16px;text-align:center;color:#90a4ae;font-size:13px">No members found</div>';
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

  // Sync newly added techs to calendar + send notifications
  var newlyAdded = _assigned.filter(function(n){ return prev.indexOf(n)<0; });

  // Send SMS FIRST before any other calls that may throw errors
  if (newlyAdded.length && typeof sendSMS === 'function') {
    if (!wo.smsNotified) wo.smsNotified = [];
    newlyAdded.forEach(function(techName) {
      if (wo.smsNotified.indexOf(techName) >= 0) return;
      var member = (DB.team||[]).find(function(m){ return m.name===techName; });
      if (!member || !member.phone || member.smsEnabled === false) return;
      // Claim this tech as notified IMMEDIATELY (synchronously), before the async
      // sendSMS() call. This closes the race window where a second trigger path
      // (e.g. the Dispatch Board's _saveJobToWO) could fire its own duplicate
      // text for the same tech while this send is still in flight.
      wo.smsNotified.push(techName);
      saveDB();
      var msg = 'TCSS Dispatch: '+(wo.woNumber||'WO')+' | '+(wo.customerName||'');
      if (wo.description) msg += '\n'+wo.description.substring(0,80);
      if (wo.scheduledDate) {
        var d = new Date(wo.scheduledDate+'T12:00:00');
        msg += '\nScheduled: '+d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      }
      if (wo.siteAddr) msg += '\n'+wo.siteAddr+(wo.siteCity?', '+wo.siteCity:'');
      msg += '\nReply STOP to opt out.';
      sendSMS(member.phone, msg).then(function(ok){
        if (!ok) {
          // Send actually failed (e.g. insufficient credit) — un-claim so a
          // future re-trigger can retry instead of silently staying "notified".
          var idx = wo.smsNotified.indexOf(techName);
          if (idx >= 0) wo.smsNotified.splice(idx, 1);
          saveDB();
        }
      });
    });
  }

  try { if (newlyAdded.length) wtSyncWOTechsToCalendar(wo, newlyAdded); } catch(e) { console.warn('[WO] calendar sync error:', e.message); }

  closeModal('modal-wo-team');
  renderAssignedTechs(_woCurrentId);
  showToast('Team updated ✓','success',2000);
}

// Sync WO tech assignments to the linked job's calendar entry
function wtSyncWOTechsToCalendar(wo, newTechs) {
  if (!wo || !newTechs.length) return;

  // Find the linked job (by jobId reference or matching WO number)
  var linkedJob = null;
  if (wo.jobId) {
    linkedJob = (DB.jobs||[]).find(function(j){ return j.id===wo.jobId; });
  }
  if (!linkedJob && wo.woNumber) {
    linkedJob = (DB.jobs||[]).find(function(j){
      return j.woNumber===wo.woNumber || j.name===wo.description;
    });
  }

  if (linkedJob) {
    // Update existing linked job — add techs to both crew and assignedTechs
    if (!linkedJob.assignedTechs) linkedJob.assignedTechs = [];
    if (!linkedJob.crew) linkedJob.crew = [];
    var changed = false;
    newTechs.forEach(function(name){
      if (linkedJob.assignedTechs.indexOf(name)<0) {
        linkedJob.assignedTechs.push(name);
        changed = true;
      }
      var inCrew = linkedJob.crew.some(function(c){ return c.techName===name; });
      if (!inCrew) {
        linkedJob.crew.push({techName:name, role: linkedJob.crew.length===0?'lead':'helper', addedDate:getTodayISO()});
        changed = true;
      }
    });
    if (!linkedJob.scheduledDate && (wo.dateRequested||wo.scheduledDate)) {
      linkedJob.scheduledDate = wo.scheduledDate || wo.dateRequested;
      changed = true;
    }
    if (changed) {
      saveDB();
      if (_sb) _sb.from('jobs').update({
        assigned_techs: linkedJob.assignedTechs,
        scheduled_date: linkedJob.scheduledDate,
      }).eq('id', linkedJob.id).then(function(){});
    }
  }
  // WOs are jobs — no separate job record needed

  // In-app bell notifications still belong here.
  if (typeof addWOAssignmentNotifications === 'function') {
    addWOAssignmentNotifications(wo, newTechs);
  }

  // NOTE: SMS notification is intentionally NOT sent from here. It's already
  // handled by the assignment-saving functions (saveTeamModal in this file,
  // and _saveJobToWO in dispatch.js), both of which check wo.smsNotified to
  // avoid duplicates. This function previously also called sendAssignmentSMS()
  // directly with no dedup check at all, which meant every tech assignment
  // could trigger three separate texts. Calendar sync should not also be a
  // notification trigger point.
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
  // Render assigned techs and quick stats after modal renders
  setTimeout(function(){
    renderAssignedTechs(woId);
    refreshWOQuickStats(woId);
    _pullWODocuments();
  }, 200);
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

// ============================================================
// WO QUICK STATS — expense total + document count on main form
// ============================================================

function refreshWOQuickStats(woId) {
  if (!woId) return;
  // Expenses
  var expenses = (DB.woExpenses||[]).filter(function(e){ return e.woId===woId; });
  var total = expenses.reduce(function(s,e){ return s+parseFloat(e.amount||0); },0);
  var totEl   = document.getElementById('wo-expense-total');
  var cntEl   = document.getElementById('wo-expense-count');
  if (totEl) totEl.textContent = '$'+total.toFixed(2);
  if (cntEl) cntEl.textContent = expenses.length+' entr'+(expenses.length!==1?'ies':'y');

  // Documents
  var docs = (DB.woDocuments||[]).filter(function(d){ return d.woId===woId && !d.deleted; });
  var docEl = document.getElementById('wo-docs-count');
  if (docEl) docEl.textContent = docs.length;
}

// ============================================================
// DOCUMENTS / FILE ATTACHMENTS
// ============================================================

async function uploadWODocument(file, woId, label, docType) {
  if (!file || !woId) return null;
  if (!_sb || !_currentUser) { showToast('Not logged in','error'); return null; }
  docType = docType || 'office';

  var ext  = file.name.split('.').pop().toLowerCase();
  var safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  var path = 'wo-docs/'+woId+'/'+Date.now()+'-'+safe;

  try {
    var { error: upErr } = await _sb.storage.from('job-photos').upload(path, file, { cacheControl:'3600', upsert:false });
    if (upErr) throw upErr;
    var { data: urlData } = _sb.storage.from('job-photos').getPublicUrl(path);
    var url = urlData.publicUrl;

    var doc = {
      id:        'wdoc-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
      woId:      woId,
      name:      label || file.name,
      fileName:  file.name,
      fileType:  file.type || 'application/octet-stream',
      fileSize:  file.size,
      path:      path,
      url:       url,
      docType:   docType,
      uploadedBy:_currentUser.full_name,
      uploadedAt:new Date().toISOString(),
      deleted:   false
    };
    if (!DB.woDocuments) DB.woDocuments = [];
    DB.woDocuments.push(doc);

    await _sb.from('wo_documents').insert({
      id: doc.id, wo_id: woId, name: doc.name, file_name: doc.fileName,
      file_type: doc.fileType, file_size: doc.fileSize, file_path: path,
      url: url, doc_type: docType, uploaded_by: _currentUser.full_name, uploaded_at: doc.uploadedAt
    });

    saveDB();
    auditLog('doc_uploaded','work_order',woId,{note:doc.name+' ('+docType+') uploaded by '+_currentUser.full_name});
    return doc;
  } catch(e) {
    console.error('[Doc upload]', e.message);
    showToast('Upload failed: '+e.message,'error');
    return null;
  }
}

function renderWODocsTab(woId) {
  var allDocs   = (DB.woDocuments||[]).filter(function(d){ return d.woId===woId && !d.deleted; });
  var fieldDocs = allDocs.filter(function(d){ return d.docType==='field'; });
  var officeDocs= allDocs.filter(function(d){ return d.docType!=='field'; });

  var canUploadField  = typeof hasPermission==='function' && hasPermission('docs.field.upload');
  var canDeleteField  = typeof hasPermission==='function' && hasPermission('docs.field.delete');
  var canUploadOffice = typeof hasPermission==='function' && hasPermission('docs.upload');
  var canDeleteOffice = typeof hasPermission==='function' && hasPermission('docs.upload'); // same as upload for office
  var canViewOffice   = canUploadOffice; // only office roles see office docs section

  function docCard(d, canDelete, deleteFn) {
    var isImg = (d.fileType||'').startsWith('image/');
    var icon  = isImg ? '🖼' : (d.fileType==='application/pdf' ? '📄' : '📎');
    var kb    = d.fileSize ? (d.fileSize/1024).toFixed(0)+'KB' : '';
    return '<div style="background:#fff;border:1px solid #e0e7ef;border-radius:8px;overflow:hidden">'+
      (isImg && d.url
        ? '<img src="'+escHtml(d.url)+'" style="width:100%;height:110px;object-fit:cover;display:block">'
        : '<div style="height:80px;background:#f0f4f8;display:flex;align-items:center;justify-content:center;font-size:30px">'+icon+'</div>'
      )+
      '<div style="padding:8px 10px">'+
        '<div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+escHtml(d.name)+'">'+escHtml(d.name)+'</div>'+
        '<div style="font-size:10px;color:#90a4ae;margin-bottom:6px">'+escHtml(d.uploadedBy||'')+' · '+escHtml(kb)+'</div>'+
        '<div style="display:flex;gap:5px">'+
          '<a href="'+escHtml(d.url)+'" target="_blank" download style="flex:1;text-align:center;padding:4px;background:#1565c0;color:#fff;border-radius:4px;font-size:11px;font-weight:700;text-decoration:none">⬇ Open</a>'+
          (canDelete ? '<button onclick="'+deleteFn+'(\''+d.id+'\')" style="padding:4px 8px;background:#ffebee;color:#c62828;border:none;border-radius:4px;font-size:11px;cursor:pointer">✕</button>' : '')+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function uploadBar(tabType, inputIdCam, inputIdFile, inputIdLabel, inputIdName, submitFn) {
    return '<div style="background:#f0f4f8;border-radius:8px;padding:12px 14px;margin-bottom:14px">'+
      '<div style="font-weight:700;font-size:13px;margin-bottom:8px">'+(tabType==='field'?'📐 Upload Drawing or Doc':'📎 Upload Office Document')+'</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">'+
        '<div style="flex:1;min-width:160px">'+
          '<label style="font-size:11px;font-weight:700;color:#546e7a;display:block;margin-bottom:3px">Label (optional)</label>'+
          '<input id="'+inputIdLabel+'" placeholder="e.g. Floor Plan, Spec Sheet, Manual..." style="width:100%;padding:7px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;box-sizing:border-box">'+
        '</div>'+
        '<div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap">'+
          '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#e3f2fd;border:1px solid #90caf9;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#1565c0">'+
            '📷 Camera'+
            '<input type="file" id="'+inputIdCam+'" accept="image/*" capture="environment" style="display:none" onchange="wdocFileSelected(this,\''+inputIdName+'\',\''+inputIdFile+'\')">'+
          '</label>'+
          '<label style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;background:#f3e5f5;border:1px solid #ce93d8;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;color:#6a1b9a">'+
            '📁 Browse'+
            '<input type="file" id="'+inputIdFile+'" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg,.dxf" style="display:none" onchange="wdocFileSelected(this,\''+inputIdName+'\',\''+inputIdCam+'\')">'+
          '</label>'+
          '<span id="'+inputIdName+'" style="font-size:11px;color:#2e7d32;font-style:italic;align-self:center"></span>'+
        '</div>'+
        '<button class="btn btn-primary btn-sm" onclick="'+submitFn+'()" style="padding:7px 14px">⬆ Upload</button>'+
      '</div>'+
      '<div style="font-size:11px;color:#90a4ae;margin-top:6px">Accepts photos, PDF, Word, Excel, DWG. Tap Camera on mobile.</div>'+
    '</div>';
  }

  var html = '<div style="margin-bottom:16px">';

  // ── FIELD DOCS SECTION ──────────────────────────────────────────────────────
  html += '<div style="font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">📐 Field Documents — Drawings & Specs</div>';
  html += '<div style="font-size:12px;color:#546e7a;margin-bottom:10px;padding:8px 10px;background:#e3f2fd;border-radius:7px;border-left:3px solid #1565c0">Drawings, specs and manuals for this job. Visible to all assigned team.</div>';

  if (canUploadField) {
    html += uploadBar('field','wdoc-f-cam','wdoc-f-file','wdoc-f-label','wdoc-f-name','submitFieldDoc');
  }

  if (fieldDocs.length) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px">' +
      fieldDocs.sort(function(a,b){ return (b.uploadedAt||'').localeCompare(a.uploadedAt||''); })
        .map(function(d){ return docCard(d, canDeleteField, 'deleteWODoc'); }).join('') +
    '</div>';
  } else {
    html += '<div style="color:#90a4ae;font-size:13px;padding:8px 0 16px">No field documents attached yet.'+(canUploadField?' Use the upload above.':' Ask your office to upload drawings for this job.')+'</div>';
  }

  // ── OFFICE DOCS SECTION (office roles only) ─────────────────────────────────
  if (canViewOffice) {
    html += '<div style="border-top:1.5px solid #e0e7ef;margin-bottom:14px"></div>';
    html += '<div style="font-size:11px;font-weight:700;color:#6a1b9a;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">📎 Office Documents — Receipts & Internal Files</div>';

    if (canUploadOffice) {
      html += uploadBar('office','wdoc-o-cam','wdoc-o-file','wdoc-o-label','wdoc-o-name','submitOfficeDoc');
    }

    if (officeDocs.length) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">' +
        officeDocs.sort(function(a,b){ return (b.uploadedAt||'').localeCompare(a.uploadedAt||''); })
          .map(function(d){ return docCard(d, canDeleteOffice, 'deleteWODoc'); }).join('') +
      '</div>';
    } else {
      html += '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No office documents attached yet.</div>';
    }
  }

  html += '</div>';
  return html;
}

async function _submitWODocByType(camId, fileId, labelId, nameId, docType) {
  var woId = _woCurrentId;
  if (!woId) { showToast('Save the work order first','error'); return; }
  var fileCam = document.getElementById(camId);
  var fileEl  = document.getElementById(fileId);
  var fileEl2 = (fileCam&&fileCam.files&&fileCam.files[0]) ? fileCam :
                (fileEl&&fileEl.files&&fileEl.files[0])   ? fileEl : null;
  var label   = ((document.getElementById(labelId)||{}).value||'').trim();
  if (!fileEl2 || !fileEl2.files || !fileEl2.files[0]) { showToast('Select a file first','error'); return; }
  var file = fileEl2.files[0];
  showToast('Uploading...','info',10000);
  var doc = await uploadWODocument(file, woId, label||file.name, docType);
  if (doc) {
    showToast('Uploaded ✓','success');
    if (fileCam) fileCam.value = '';
    if (fileEl)  fileEl.value  = '';
    var labelEl = document.getElementById(labelId);
    var nameEl  = document.getElementById(nameId);
    if (labelEl) labelEl.value = '';
    if (nameEl)  nameEl.textContent = '';
    switchWOTab('photos');
    refreshWOQuickStats(woId);
  }
}

function submitFieldDoc()  { _submitWODocByType('wdoc-f-cam','wdoc-f-file','wdoc-f-label','wdoc-f-name','field'); }
function submitOfficeDoc() { _submitWODocByType('wdoc-o-cam','wdoc-o-file','wdoc-o-label','wdoc-o-name','office'); }
// Legacy alias - keep working for any calls from expenses receipt upload
function submitWODoc()     { _submitWODocByType('wdoc-cam','wdoc-file','wdoc-label','wdoc-selected-name','office'); }

function deleteWODoc(docId) {
  if (!confirm('Remove this document?')) return;
  var doc = (DB.woDocuments||[]).find(function(d){ return d.id===docId; });
  if (doc) {
    doc.deleted = true;
    saveDB();
    if (_sb) _sb.from('wo_documents').update({deleted:true}).eq('id',docId).then(function(){});
    switchWOTab('photos');
    refreshWOQuickStats(_woCurrentId);
    showToast('Document removed','info');
  }
}

// Pull WO documents from Supabase on sync
async function _pullWODocuments() {
  if (!_sb || !_currentUser) return;
  try {
    var { data: rows, error: e } = await _sb.from('wo_documents').select('*').eq('deleted',false).order('uploaded_at',{ascending:false});
    if (e) { console.warn('[WO Docs pull]', e.message); return; }
    if (rows) {
      DB.woDocuments = rows.map(function(d){
        return { id:d.id, woId:d.wo_id, name:d.name, fileName:d.file_name, fileType:d.file_type, fileSize:d.file_size, path:d.file_path, url:d.url, docType:d.doc_type||'office', uploadedBy:d.uploaded_by, uploadedAt:d.uploaded_at, deleted:false };
      });
      saveDB();
    }
  } catch(e) { console.warn('[WO Docs pull]', e.message); }
}

// ---- FILE SELECTION DISPLAY HELPERS ----
function woeReceiptSelected(input) {
  var nameEl = document.getElementById('woe-receipt-name');
  if (!nameEl) return;
  if (input.files && input.files[0]) {
    nameEl.textContent = '✓ ' + input.files[0].name;
    // Clear the other input
    var other = input.id==='woe-receipt-cam' ? document.getElementById('woe-receipt-file') : document.getElementById('woe-receipt-cam');
    if (other) other.value = '';
  }
}

function wdocFileSelected(input, nameId, otherId) {
  var nameEl = document.getElementById(nameId || 'wdoc-selected-name');
  if (!nameEl) return;
  if (input.files && input.files[0]) {
    nameEl.textContent = '✓ ' + input.files[0].name;
    var other = document.getElementById(otherId || (input.id==='wdoc-cam' ? 'wdoc-file' : 'wdoc-cam'));
    if (other) other.value = '';
  }
}

// ─── CHANGE ORDERS ───────────────────────────────────────────────────────────

function createChangeOrder(parentWoId) {
  var parent = (DB.workOrders||[]).find(function(w){ return w.id===parentWoId; });
  if (!parent) { showToast('Save the work order first','warning'); return; }

  // Show a quick reason modal before creating
  var html = '<div class="modal-overlay open" id="co-reason-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:480px">'+
      '<div class="modal-head">'+
        '<h3>📋 New Change Order</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(&quot;co-reason-modal&quot;).remove()">&#x2715;</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="background:#f5f7fa;border-radius:10px;padding:12px;margin-bottom:16px">'+
          '<div style="font-size:12px;font-weight:700;color:#546e7a;margin-bottom:4px">PARENT WORK ORDER</div>'+
          '<div style="font-size:14px;font-weight:800;color:#0d1b2a">'+escHtml(parent.woNumber||'')+'</div>'+
          '<div style="font-size:13px;color:#546e7a">'+escHtml(parent.customerName||'')+(parent.description?' — '+parent.description.substring(0,50):'')+'</div>'+
        '</div>'+
        '<div style="margin-bottom:16px">'+
          '<label class="wiz-label">REASON FOR CHANGE ORDER *</label>'+
          '<textarea id="co-reason" class="form-control" rows="3" '+
            'placeholder="What is the additional scope of work? Why is this change order needed?"></textarea>'+
        '</div>'+
        '<button class="btn btn-primary" style="width:100%" onclick="confirmCreateChangeOrder(\"'+parentWoId+'\")">'+
          '📋 Create Change Order</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  var e = document.getElementById('co-reason-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var el=document.getElementById('co-reason'); if(el) el.focus(); }, 100);
}

function confirmCreateChangeOrder(parentWoId) {
  var reason = ((document.getElementById('co-reason')||{}).value||'').trim();
  if (!reason) { showToast('Describe the reason for this change order','warning'); return; }

  var parent = (DB.workOrders||[]).find(function(w){ return w.id===parentWoId; });
  if (!parent) return;

  document.getElementById('co-reason-modal').remove();

  // Set context for the new WO
  window._newWOParentId = parentWoId;
  window._newWOCOReason = reason;

  // Open new WO pre-filled with parent data
  _woCurrentId = null;
  newWorkOrder();

  // Pre-fill fields from parent after modal renders
  setTimeout(function(){
    function sv(id, val) { var el=document.getElementById(id); if(el&&val) el.value=val; }
    sv('wo-customer-id',   parent.customerId||'');
    sv('wo-site-addr',     parent.siteAddr||'');
    sv('wo-site-city',     parent.siteCity||'');
    sv('wo-site-state',    parent.siteState||'');
    sv('wo-site-zip',      parent.siteZip||'');
    sv('wo-labor-rate',    parent.laborRate||125);
    sv('wo-tax-rate',      parent.taxRate||0);

    // Set customer name display
    var custNameEl = document.getElementById('wo-customer-name-display');
    if (custNameEl) custNameEl.textContent = parent.customerName||'';

    // Pre-fill description with CO context
    var descEl = document.getElementById('wo-desc');
    if (descEl) descEl.value = 'Change Order — '+escHtml(parent.woNumber||'')+(parent.description?' ('+parent.description.substring(0,40)+')':'');

    // Show parent WO banner
    _renderParentWOBanner(parent);

    showToast('📋 Change Order started — linked to '+escHtml(parent.woNumber||''),'info', 4000);
  }, 400);
}

function _renderParentWOBanner(parent) {
  var existing = document.getElementById('co-parent-banner');
  if (existing) existing.remove();
  var headerArea = document.querySelector('#page-workorders .wo-header-area, #wo-form-top');
  if (!headerArea) return;
  var banner = document.createElement('div');
  banner.id = 'co-parent-banner';
  banner.style.cssText = 'background:#fff3e0;border:2px solid #ffb300;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px';
  banner.innerHTML =
    '<div>'+
      '<div style="font-size:12px;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:.4px">Change Order — Linked to Parent</div>'+
      '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(parent.woNumber||'')+' — '+escHtml(parent.customerName||'')+'</div>'+
    '</div>'+
    '<button onclick="openWorkOrder(\"'+parent.id+'\")" '+
      'style="padding:6px 12px;font-size:12px;font-weight:700;border:2px solid #e65100;border-radius:8px;background:#fff;color:#e65100;cursor:pointer">'+
      'View Parent WO</button>';
  headerArea.insertBefore(banner, headerArea.firstChild);
}

function renderWOChangeOrders(woId) {
  var children = (DB.workOrders||[]).filter(function(w){
    return w.parentWoId === woId && !w.deleted;
  });
  if (!children.length) return '';

  var rows = children.map(function(co){
    var statusInfo = _getWOStatusDef(co.status);
    var labor = (DB.woLabor||[]).filter(function(l){ return l.woId===co.id; });
    var totalHours = labor.reduce(function(s,l){ return s+(l.hours||0); }, 0);
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;flex-wrap:wrap;gap:8px">'+
      '<div>'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:13px;font-weight:800;color:#1565c0;cursor:pointer" onclick="openWorkOrder(\"'+co.id+'\")">'+escHtml(co.woNumber||co.id)+'</span>'+
          '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:'+(statusInfo.color||'#e0e0e0')+';font-weight:700">'+escHtml(co.status||'New')+'</span>'+
        '</div>'+
        (co.changeOrderReason?'<div style="font-size:12px;color:#546e7a;margin-top:2px">'+escHtml(co.changeOrderReason.substring(0,60))+'</div>':'')+
        '<div style="font-size:11px;color:#90a4ae;margin-top:2px">'+
          (totalHours?totalHours.toFixed(1)+'h logged · ':'')+
          'Created: '+escHtml((co.createdAt||'').split('T')[0])+
        '</div>'+
      '</div>'+
      '<button onclick="openWorkOrder(\"'+co.id+'\")" class="btn btn-outline btn-sm">Open</button>'+
    '</div>';
  }).join('');

  var totalCOs = children.length;
  var openCOs  = children.filter(function(c){ return _getWOStatusDef(c.status).open; }).length;

  return '<div style="margin:16px 0;border:1px solid #ffb300;border-radius:12px;overflow:hidden">'+
    '<div style="background:#fff3e0;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">'+
      '<div style="font-size:14px;font-weight:800;color:#e65100">📋 Change Orders ('+totalCOs+')</div>'+
      '<div style="font-size:12px;color:#e65100">'+openCOs+' open</div>'+
    '</div>'+
    '<div style="padding:0 16px;background:#fff">'+rows+'</div>'+
    '<div style="padding:10px 16px;background:#fffde7;border-top:1px solid #ffb300">'+
      '<button onclick="createChangeOrder(\"'+woId+'\")" '+
        'style="font-size:13px;font-weight:700;color:#e65100;background:none;border:none;cursor:pointer;padding:0">'+
        '+ Add Another Change Order</button>'+
    '</div>'+
  '</div>';
}

// ─── WORK TRACKING TIE-IN ────────────────────────────────────────────────────
function wtOpenFromWorkOrder() {
  var wo = _woCurrentId ? (DB.workOrders||[]).find(function(w){ return w.id===_woCurrentId; }) : null;
  if (!wo) { showToast('Save the work order first','warning'); return; }

  // Check if a WT project already exists for this WO/job
  var existing = (DB.wtProjects||[]).find(function(p){
    return p.job_id === wo.id || p.job_id === wo.jobId ||
           (p.name && wo.description && p.name.toLowerCase() === wo.description.toLowerCase().substring(0,50));
  });

  if (existing) {
    // Open the existing project in Work Tracking
    showToast('Opening Work Tracking project...','success');
    goPage('worktracking');
    setTimeout(function(){
      if (typeof wtOpenProject === 'function') wtOpenProject(existing.id);
    }, 300);
    return;
  }

  // No project yet — launch wizard pre-filled with WO data
  if (!confirm('No Work Tracking project found for this work order.\nLaunch the wizard to create one?')) return;
  goPage('worktracking');
  setTimeout(function(){
    if (typeof openNewProjectWizard !== 'function') return;
    openNewProjectWizard();
    // Pre-fill after wizard opens
    setTimeout(function(){
      var nameEl = document.getElementById('wiz-name');
      var custEl = document.getElementById('wiz-cust');
      if (nameEl) nameEl.value = wo.description || wo.woNumber || '';
      if (custEl) custEl.value = wo.customerName || '';
      // Store WO id for linking on create
      if (typeof _wiz !== 'undefined') {
        _wiz.proj.jobId = wo.id;
        _wiz.proj.customerName = wo.customerName || '';
        _wiz.proj.name = wo.description || wo.woNumber || '';
      }
    }, 400);
  }, 400);
}

// ============================================================
// WORK ORDER FIELD LOG
// Structured daily log entry per tech per WO
// Accessible from WO Field Log tab + clock-out nudge
// ============================================================

var _woFieldLogs = {};  // cache: woId -> array of log entries

// ── Load logs for a WO ───────────────────────────────────────────────────────
async function loadWOFieldLogs(woId) {
  if (!_sb || !woId) return [];
  try {
    var { data, error } = await _sb.from('wo_field_logs')
      .select('*').eq('wo_id', woId)
      .order('log_date', {ascending: false})
      .order('created_at', {ascending: false});
    if (error) throw error;
    _woFieldLogs[woId] = data || [];
    return _woFieldLogs[woId];
  } catch(e) {
    console.error('loadWOFieldLogs:', e);
    return [];
  }
}

// ── Render the Field Log tab ──────────────────────────────────────────────────
async function renderWOFieldLogTab(woId) {
  var content = document.getElementById('wo-tab-content');
  if (!content) return;

  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return;

  content.innerHTML = '<div style="padding:20px;text-align:center;color:#90a4ae">Loading field log...</div>';

  var logs = await loadWOFieldLogs(woId);
  var isTech = typeof wtIsFieldTech === 'function' && wtIsFieldTech();

  // Check if tech already logged today
  var today = getTodayISO ? getTodayISO() : new Date().toISOString().split('T')[0];
  var myName = typeof wtCurrentUserName === 'function' ? wtCurrentUserName() : (_currentUser?_currentUser.full_name:'');
  var loggedToday = logs.some(function(l){
    return l.log_date === today && l.tech_name === myName;
  });

  content.innerHTML =
    // Header with add button
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'+
      '<div>'+
        '<div style="font-size:14px;font-weight:800;color:#0d1b2a">Field Log</div>'+
        '<div style="font-size:12px;color:#546e7a">'+logs.length+' entr'+(logs.length===1?'y':'ies')+' · '+
          (loggedToday
            ? '<span style="color:#2e7d32;font-weight:700">✓ You logged today</span>'
            : '<span style="color:#e65100;font-weight:700">⚠ No entry for today yet</span>')+
        '</div>'+
      '</div>'+
      '<button onclick="openFieldLogEntry(\''+woId+'\')" class="btn btn-primary" '+
        'style="'+(loggedToday?'background:#546e7a;border-color:#546e7a':'')+'">'+
        (loggedToday ? '+ Add Another Entry' : '📝 Log Today\'s Work')+
      '</button>'+
    '</div>'+

    // Log entries grouped by date
    (logs.length ? renderFieldLogEntries(logs, woId) :
      '<div style="text-align:center;padding:40px;background:#f5f7fa;border-radius:12px;color:#90a4ae">'+
        '<div style="font-size:32px;margin-bottom:12px">📝</div>'+
        '<div style="font-size:15px;font-weight:700;margin-bottom:6px">No field log entries yet</div>'+
        '<div style="font-size:13px;margin-bottom:20px">Log what you did on this job each day you work it.</div>'+
        '<button onclick="openFieldLogEntry(\''+woId+'\')" class="btn btn-primary">📝 Log Today\'s Work</button>'+
      '</div>');
}

function renderFieldLogEntries(logs, woId) {
  // Group by date
  var byDate = {};
  logs.forEach(function(l){
    if (!byDate[l.log_date]) byDate[l.log_date] = [];
    byDate[l.log_date].push(l);
  });

  return Object.keys(byDate).map(function(date){
    var dayLogs = byDate[date];
    var dateLabel = formatDateFriendly ? formatDateFriendly(date) : date;
    return '<div style="margin-bottom:20px">'+
      '<div style="font-size:12px;font-weight:800;color:#546e7a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #f0f0f0">'+
        escHtml(dateLabel)+
      '</div>'+
      dayLogs.map(function(l){ return renderFieldLogCard(l, woId); }).join('')+
    '</div>';
  }).join('');
}

function renderFieldLogCard(l, woId) {
  var isOwn = l.tech_name === (typeof wtCurrentUserName==='function'?wtCurrentUserName():'');
  var canEdit = isOwn || (_currentUser && ['owner','manager','back_office'].includes(_currentUser.role));

  return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:16px;margin-bottom:10px">'+
    // Header
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:#1565c0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">'+
          escHtml((l.tech_name||'?').charAt(0).toUpperCase())+
        '</div>'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(l.tech_name)+'</div>'+
          '<div style="font-size:11px;color:#90a4ae">'+
            (l.time_spent ? l.time_spent+'h logged' : 'Time not recorded')+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        (l.customer_present?'<span style="font-size:11px;background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-weight:700">Customer Present</span>':'')+
        (l.follow_up_needed?'<span style="font-size:11px;background:#fff3e0;color:#e65100;padding:2px 8px;border-radius:10px;font-weight:700">⚠ Follow-up Needed</span>':'')+
      '</div>'+
    '</div>'+

    // Work performed
    '<div style="margin-bottom:10px">'+
      '<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Work Performed</div>'+
      '<div style="font-size:13px;color:#0d1b2a;line-height:1.6;white-space:pre-wrap">'+escHtml(l.work_performed)+'</div>'+
    '</div>'+

    // Issues
    (l.issues ? '<div style="margin-bottom:10px;padding:10px;background:#fff3e0;border-radius:8px">'+
      '<div style="font-size:11px;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Issues Encountered</div>'+
      '<div style="font-size:13px;color:#0d1b2a;line-height:1.5;white-space:pre-wrap">'+escHtml(l.issues)+'</div>'+
    '</div>' : '')+

    // Follow-up notes
    (l.follow_up_needed && l.follow_up_notes ? '<div style="margin-bottom:10px;padding:10px;background:#e3f2fd;border-radius:8px">'+
      '<div style="font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Follow-up Required</div>'+
      '<div style="font-size:13px;color:#0d1b2a;line-height:1.5">'+escHtml(l.follow_up_notes)+'</div>'+
    '</div>' : '')+

    // Site conditions
    (l.site_conditions ? '<div style="font-size:12px;color:#546e7a;font-style:italic;margin-top:6px">Site conditions: '+escHtml(l.site_conditions)+'</div>' : '')+

  '</div>';
}

// ── Open the log entry modal ──────────────────────────────────────────────────
function openFieldLogEntry(woId) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  var today = getTodayISO ? getTodayISO() : new Date().toISOString().split('T')[0];
  var myName = typeof wtCurrentUserName === 'function' ? wtCurrentUserName() : (_currentUser?_currentUser.full_name:'');

  // Pre-populate time from clock if active
  var timeHint = '';
  if (typeof _clockState !== 'undefined' && _clockState.status !== 'out' && _clockState.clockInTime) {
    var elapsed = (Date.now() - new Date(_clockState.clockInTime)) / 3600000;
    timeHint = elapsed.toFixed(1);
  }

  var html = '<div class="modal-overlay open" id="fl-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:560px;max-height:94vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<div>'+
          '<h3 style="margin:0">📝 Field Log Entry</h3>'+
          '<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+escHtml(wo?wo.woNumber||wo.description||'Work Order':'Work Order')+'</div>'+
        '</div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'fl-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div class="modal-body" style="overflow-y:auto;flex:1">'+

        // Date + tech
        '<div style="display:flex;gap:10px;margin-bottom:14px">'+
          '<div style="flex:1">'+
            '<label class="wiz-label">DATE</label>'+
            '<input type="date" id="fl-date" class="form-control" value="'+today+'">'+
          '</div>'+
          '<div style="flex:2">'+
            '<label class="wiz-label">TECH</label>'+
            '<input id="fl-tech" class="form-control" value="'+escHtml(myName)+'" '+
              (typeof wtIsFieldTech==='function'&&wtIsFieldTech()?'readonly style="background:#f5f5f5"':'')+'>'+
          '</div>'+
        '</div>'+

        // Work performed — the most important field
        '<div style="margin-bottom:14px">'+
          '<label class="wiz-label">WHAT DID YOU DO TODAY? *</label>'+
          '<textarea id="fl-work" class="form-control" rows="5" '+
            'placeholder="Describe the work you performed on this job today. Be specific — what was installed, where, how many, any challenges you worked through."></textarea>'+
        '</div>'+

        // Time spent
        '<div style="margin-bottom:14px">'+
          '<label class="wiz-label">TIME ON THIS JOB (hours)</label>'+
          '<input type="number" id="fl-time" class="form-control" step="0.25" min="0" max="24" '+
            'value="'+timeHint+'" placeholder="e.g. 3.5" style="max-width:140px">'+
          (timeHint?'<div style="font-size:11px;color:#1565c0;margin-top:4px">&#x23F1; Auto-filled from your clock — adjust if needed</div>':'')+
        '</div>'+

        // Issues
        '<div style="margin-bottom:14px">'+
          '<label class="wiz-label">ISSUES ENCOUNTERED <span style="font-weight:400;text-transform:none">(optional)</span></label>'+
          '<textarea id="fl-issues" class="form-control" rows="3" '+
            'placeholder="Any problems, obstacles, or things that slowed you down? Missing materials, access issues, rework needed?"></textarea>'+
        '</div>'+

        // Toggles row
        '<div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">'+
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">'+
            '<input type="checkbox" id="fl-customer" style="width:18px;height:18px">'+
            '<span style="font-size:13px;font-weight:600">Customer was present</span>'+
          '</label>'+
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer">'+
            '<input type="checkbox" id="fl-followup" style="width:18px;height:18px" onchange="document.getElementById(\'fl-followup-notes\').style.display=this.checked?\'block\':\'none\'">'+
            '<span style="font-size:13px;font-weight:600">Follow-up needed</span>'+
          '</label>'+
        '</div>'+

        // Follow-up notes (hidden by default)
        '<div id="fl-followup-notes" style="display:none;margin-bottom:14px">'+
          '<label class="wiz-label">FOLLOW-UP DETAILS</label>'+
          '<textarea id="fl-followup-text" class="form-control" rows="2" '+
            'placeholder="What needs to happen next? Who needs to know?"></textarea>'+
        '</div>'+

        // Site conditions
        '<div style="margin-bottom:20px">'+
          '<label class="wiz-label">SITE CONDITIONS <span style="font-weight:400;text-transform:none">(optional)</span></label>'+
          '<input id="fl-site" class="form-control" placeholder="Anything unusual — access restricted, weather affected work, area not ready, etc.">'+
        '</div>'+

        '<button class="btn btn-primary" id="fl-submit-btn" style="width:100%;padding:14px;font-size:15px" onclick="saveFieldLogEntry(\''+woId+'\')">'+
          '💾 Submit Field Log</button>'+

      '</div>'+
    '</div>'+
  '</div>';

  var e = document.getElementById('fl-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){
    var ta = document.getElementById('fl-work');
    if (ta) ta.focus();
  }, 150);
}

// ── Save the log entry ────────────────────────────────────────────────────────
async function saveFieldLogEntry(woId) {
  var work = ((document.getElementById('fl-work')||{}).value||'').trim();
  var tech = ((document.getElementById('fl-tech')||{}).value||'').trim();
  var date = (document.getElementById('fl-date')||{}).value || getTodayISO();
  var time = parseFloat((document.getElementById('fl-time')||{}).value)||null;
  var issues  = ((document.getElementById('fl-issues')||{}).value||'').trim();
  var custPres = (document.getElementById('fl-customer')||{}).checked||false;
  var followUp = (document.getElementById('fl-followup')||{}).checked||false;
  var followUpNotes = ((document.getElementById('fl-followup-text')||{}).value||'').trim();
  var site    = ((document.getElementById('fl-site')||{}).value||'').trim();

  if (!work) { showToast('Describe the work you performed — that field is required','warning'); return; }
  if (!tech) { showToast('Tech name is required','warning'); return; }

  var btn = document.getElementById('fl-submit-btn');
  if (btn) { btn.disabled=true; btn.textContent='Saving...'; }

  var member = (DB.team||[]).find(function(m){ return m.name===tech; });
  var entry = {
    wo_id:           woId,
    tech_id:         member&&member.userId ? member.userId : (wtCurrentUserId?wtCurrentUserId():null),
    tech_name:       tech,
    log_date:        date,
    work_performed:  work,
    time_spent:      time,
    issues:          issues || null,
    follow_up_needed:followUp,
    follow_up_notes: followUp ? followUpNotes||null : null,
    customer_present:custPres,
    site_conditions: site || null,
    photos:          [],
  };

  try {
    if (_sb) {
      var { data, error } = await _sb.from('wo_field_logs').insert(entry).select().single();
      if (error) throw error;
      entry = data;
    }

    // Update local cache
    if (!_woFieldLogs[woId]) _woFieldLogs[woId] = [];
    _woFieldLogs[woId].unshift(entry);

    // Mark this WO as having a log today (for clock-out check)
    if (!DB.woFieldLogDates) DB.woFieldLogDates = {};
    if (!DB.woFieldLogDates[woId]) DB.woFieldLogDates[woId] = [];
    DB.woFieldLogDates[woId].push(date);

    document.getElementById('fl-modal').remove();

    // Refresh the tab if still on it
    if (_woTab === 'fieldlog') renderWOFieldLogTab(woId);

    // Notify manager of follow-up if needed
    if (followUp && _sb) {
      await notifyFollowUpNeeded(woId, tech, followUpNotes);
    }

    showToast('📝 Field log saved — good work, '+escHtml(tech.split(' ')[0])+'!','success');

  } catch(e) {
    console.error('saveFieldLogEntry:', e);
    showToast('Error saving log: '+e.message,'error');
    if (btn) { btn.disabled=false; btn.textContent='💾 Submit Field Log'; }
  }
}

async function notifyFollowUpNeeded(woId, techName, notes) {
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!_sb) return;
  // Notify owner and managers
  var managers = (DB.team||[]).filter(function(m){
    return m.userId && ['owner','manager','back_office'].includes(m.role);
  });
  for (var i=0; i<managers.length; i++) {
    await _sb.from('wt_notifications').insert({
      user_id:    managers[i].userId,
      user_name:  managers[i].name,
      type:       'follow_up',
      title:      '⚠ Follow-up needed — '+(wo?wo.woNumber||'WO':'WO'),
      message:    techName+' flagged a follow-up: '+(notes||'See field log'),
      project_id: null,
    });
  }
}

// ── Clock-out nudge ───────────────────────────────────────────────────────────
async function checkFieldLogBeforeClockOut(onProceed) {
  var today = getTodayISO ? getTodayISO() : new Date().toISOString().split('T')[0];
  var myName = _currentUser ? _currentUser.full_name : '';

  // Find WOs this tech worked today (from labor entries)
  var todayLabor = (DB.woLabor||[]).filter(function(l){
    return l.techName===myName &&
           (l.clockIn||'').startsWith(today);
  });
  var workedWoIds = [...new Set(todayLabor.map(function(l){ return l.woId; }))];

  if (!workedWoIds.length) { onProceed(); return; }

  // Check which ones have no field log today
  var missingLogs = [];
  for (var i=0; i<workedWoIds.length; i++) {
    var woId = workedWoIds[i];
    var logs = _woFieldLogs[woId] || await loadWOFieldLogs(woId);
    var hasLog = logs.some(function(l){ return l.log_date===today && l.tech_name===myName; });
    if (!hasLog) {
      var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
      missingLogs.push({ woId:woId, woNum:wo?wo.woNumber||woId:woId, desc:wo?wo.description||'':'', woObj:wo });
    }
  }

  if (!missingLogs.length) { onProceed(); return; }

  // Show the nudge modal
  var html = '<div class="modal-overlay open" id="fl-nudge-modal" style="z-index:99998">'+
    '<div class="modal-box" style="max-width:460px;text-align:center">'+
      '<div style="font-size:40px;margin-bottom:12px">📝</div>'+
      '<div style="font-size:18px;font-weight:800;color:#0d1b2a;margin-bottom:8px">Before you clock out</div>'+
      '<div style="font-size:14px;color:#546e7a;margin-bottom:20px;line-height:1.6">'+
        'You worked <strong>'+missingLogs.length+'</strong> job'+(missingLogs.length>1?'s':'')+' today without submitting field notes.<br>'+
        'It only takes 2 minutes while it\'s fresh.'+
      '</div>'+
      // List the WOs missing logs
      '<div style="background:#f5f7fa;border-radius:10px;padding:12px;margin-bottom:20px;text-align:left">'+
        missingLogs.map(function(m){
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e0e0e0">'+
            '<div>'+
              '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(m.woNum)+'</div>'+
              '<div style="font-size:11px;color:#546e7a">'+escHtml(m.desc.substring(0,45))+'</div>'+
            '</div>'+
            '<button onclick="flNudgeOpenLog(\''+m.woId+'\')" '+
              'style="padding:6px 12px;font-size:12px;font-weight:700;border:none;border-radius:8px;background:#1565c0;color:#fff;cursor:pointer">'+
              'Log Now</button>'+
          '</div>';
        }).join('')+
      '</div>'+
      // Buttons
      '<div style="display:flex;gap:10px">'+
        '<button onclick="flNudgeProceed()" '+
          'style="flex:1;padding:12px;font-size:13px;border:2px solid #e0e0e0;border-radius:10px;background:#fff;color:#546e7a;cursor:pointer;font-weight:700">'+
          'Skip & Clock Out</button>'+
        '<button onclick="flNudgeDismiss()" class="btn btn-primary" style="flex:1;padding:12px">'+
          'Log All Now</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  // Store callback
  window._flNudgeCallback = onProceed;
  window._flMissingLogs   = missingLogs;

  var e = document.getElementById('fl-nudge-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function flNudgeProceed() {
  var e = document.getElementById('fl-nudge-modal'); if(e) e.remove();
  if (window._flNudgeCallback) window._flNudgeCallback();
}

function flNudgeDismiss() {
  var e = document.getElementById('fl-nudge-modal'); if(e) e.remove();
  // Open the first WO needing a log
  if (window._flMissingLogs && window._flMissingLogs.length) {
    var first = window._flMissingLogs[0];
    // Navigate to WO
    goPage('workorders');
    setTimeout(function(){
      if (typeof openWorkOrder === 'function') {
        openWorkOrder(first.woId);
        setTimeout(function(){ switchWOTab('fieldlog'); }, 500);
      }
    }, 300);
  }
}

function flNudgeOpenLog(woId) {
  var e = document.getElementById('fl-nudge-modal'); if(e) e.remove();
  goPage('workorders');
  setTimeout(function(){
    if (typeof openWorkOrder === 'function') {
      openWorkOrder(woId);
      setTimeout(function(){
        switchWOTab('fieldlog');
        setTimeout(function(){ openFieldLogEntry(woId); }, 300);
      }, 500);
    }
  }, 300);
}

