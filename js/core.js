
// =============================================
// TCSS PROBID v5 — Phase 1 Enhanced
// Stage 1: Margin-Based Pricing Engine (v4)
// Stage 2: Enhanced Save Structure (v4)
// Stage 3: Professional Proposal Output (v4)
// V5-P1: Equipment Rentals, Permits, Margin Floor, Expanded Templates
// =============================================

// ---- CONSTANTS ----
const DB_KEY = 'tcssv8';
const ENV_PRESETS = {
  office:   { label:'Office',          margin:35, laborMult:1.00, riskLevel:'Low' },
  mixed:    { label:'Mixed',           margin:38, laborMult:1.10, riskLevel:'Medium' },
  warehouse:{ label:'Warehouse',       margin:32, laborMult:0.95, riskLevel:'Low' },
  exterior: { label:'Exterior Heavy',  margin:42, laborMult:1.25, riskLevel:'High' },
  highcplx: { label:'High Complexity', margin:45, laborMult:1.35, riskLevel:'Very High' }
};

// V5: Equipment rental types
const EQUIPMENT_TYPES = [
  { id:'lift30art',  name:'30ft Articulating Boom Lift', daily:285 },
  { id:'lift40art',  name:'40ft Articulating Boom Lift', daily:350 },
  { id:'lift35tow',  name:'Towable Boom Lift 35ft.',     daily:245 },
  { id:'lift50tow',  name:'Towable Boom Lift 50ft.',     daily:310 },
  { id:'lift30sci',  name:'30ft Scissor Lift',           daily:195 },
  { id:'lift40sci',  name:'40ft Scissor Lift',           daily:240 },
  { id:'forklift',   name:'Forklift',                    daily:180 },
  { id:'manilift',   name:'Man Lift / Vertical Mast',    daily:145 },
  { id:'other',      name:'Other Equipment',              daily:0   }
];

// V5: Default margin floors by job type
const MF_DEFAULTS = { 'New Construction':35, 'Remodel':40, 'Service Call':50, 'Upgrade':38, 'Addition':36 };

// ---- DATABASE ----
let DB = { quotes:[], customers:[], contacts:[], jobs:[], team:[], catalog:[], templates:[], settings:{}, marginFloors:{}, quoteSeq:1000, jobSeq:1, deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]}, workOrders:[], woLabor:[], woExpenses:[], woParts:[], woChecklist:[], woSettings:null, woSeq:1000, jobPhotos:[], commsLog:[], invoicePayments:[], purchaseOrders:[], vendors:[], poSeq:1000, invLocations:[], invTransfers:[] };

function saveDB() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch(e) { console.warn('Save error', e); }
  // Don't schedule a push if we're in the middle of a sync pull — data just came FROM Supabase
  if (window._syncInProgress) return;
  // Debounced cloud push — no recursion
  if (typeof _sb !== 'undefined' && _sb && typeof _currentUser !== 'undefined' && _currentUser && _currentUser.role !== 'field') {
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(pushAllToCloud, 2000);
  }
}
function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      DB = Object.assign({quotes:[],customers:[],contacts:[],jobs:[],team:[],catalog:[],templates:[],settings:{},marginFloors:{},inventory:[],checkoutLog:[],tools:[],toolCheckouts:[],quoteSeq:1000,jobSeq:1,invSeq:1,toolSeq:1,deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]},workOrders:[],woLabor:[],woExpenses:[],woParts:[],woChecklist:[],woSettings:null,woSeq:1000,jobPhotos:[],commsLog:[],invoicePayments:[],purchaseOrders:[],vendors:[],poSeq:1000,invLocations:[],invTransfers:[],auditLog:[],woDocuments:[],timeEntries:[]}, parsed);
      // Ensure deletedIds sub-arrays exist even on old saved data
      if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
      if (!DB.deletedIds.quotes)    DB.deletedIds.quotes    = [];
      if (!DB.deletedIds.team)      DB.deletedIds.team      = [];
      if (!DB.deletedIds.customers) DB.deletedIds.customers = [];
      if (!DB.deletedIds.contacts)  DB.deletedIds.contacts  = [];
      if (!DB.deletedIds.jobs)      DB.deletedIds.jobs      = [];
    } else {
      const prev = localStorage.getItem('tcssv7') || localStorage.getItem('tcssv6') || localStorage.getItem('tcssv5') || localStorage.getItem('tcssv4');
      if (prev) {
        try {
          const oldData = JSON.parse(prev);
          DB = Object.assign({quotes:[],customers:[],contacts:[],jobs:[],team:[],catalog:[],templates:[],settings:{},marginFloors:{},inventory:[],checkoutLog:[],tools:[],toolCheckouts:[],quoteSeq:1000,jobSeq:1,invSeq:1,toolSeq:1,deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]}}, oldData);
          console.log('Migrated data to v8');
        } catch(e) {}
      }
    }
    if (!DB.marginFloors)  DB.marginFloors  = {};
    if (!DB.inventory)     DB.inventory     = [];
    if (!DB.checkoutLog)   DB.checkoutLog   = [];
    if (!DB.invSeq)        DB.invSeq        = 1;
    if (!DB.catalogVersion) DB.catalogVersion = 1;
    if (!DB.toolLoans)     DB.toolLoans     = [];
    if (!DB.lunchFlags)    DB.lunchFlags    = [];
    if (!DB.workDays)      DB.workDays      = [];
    if (!DB.timeOffRequests) DB.timeOffRequests = [];
    if (!DB.timeCorrections) DB.timeCorrections = [];
    if (!DB.leaveForfeiture) DB.leaveForfeiture = [];
    if (!DB.payrollLog)      DB.payrollLog      = [];
    if (!DB.absences)        DB.absences        = [];
    if (!DB.wtProjects)      DB.wtProjects      = [];
    if (!DB.wtTemplates)     DB.wtTemplates     = [];
    if (!DB.wtItemCatalog)   DB.wtItemCatalog   = [];
    if (!DB.wtRoomTemplates) DB.wtRoomTemplates = [];
    if (!DB.wtBuildingTypes) DB.wtBuildingTypes = [];
    if (!DB.wtBuildings)     DB.wtBuildings     = [];
    if (!DB.wtRooms)         DB.wtRooms         = [];
    if (!DB.wtItems)         DB.wtItems         = [];
    if (!DB.wtCheckoffs)     DB.wtCheckoffs     = [];
    if (!DB.wtReworks)       DB.wtReworks       = [];

    // ONE-TIME MIGRATION: normalize quote status values to lowercase
    // Fixes Supabase Title Case values ('Draft','Sent','Approved','Lost') → app lowercase
    var statusNormMap = {
      'Draft':'draft','Sent':'sent','Review':'followup','Followup':'followup',
      'Approved':'approved','Won':'approved','Lost':'declined','Declined':'declined',
      'Rejected':'declined','Expired':'declined'
    };
    (DB.quotes||[]).forEach(function(q){
      if (q.status && statusNormMap[q.status]) q.status = statusNormMap[q.status];
    });

    // ONE-TIME MIGRATION: backfill customerId and contactId on existing quotes
    var migrated = 0;
    (DB.quotes||[]).forEach(function(q){
      if (!q.customerId && q.cn) {
        var mc = (DB.customers||[]).find(function(c){ return (c.name||'').toLowerCase()===(q.cn||'').toLowerCase(); });
        if (mc) { q.customerId = mc.id; migrated++; }
      }
      if (!q.contactId && q.contactName) {
        var mct = (DB.contacts||[]).find(function(c){ return (c.name||'').toLowerCase()===(q.contactName||'').toLowerCase(); });
        if (mct) { q.contactId = mct.id; }
      }
    });
    // Backfill customerId on contacts that have matching company name
    (DB.contacts||[]).forEach(function(c){
      if (!c.customerId && c.company) {
        var mc2 = (DB.customers||[]).find(function(x){ return (x.name||'').toLowerCase()===(c.company||'').toLowerCase(); });
        if (mc2) c.customerId = mc2.id;
      }
    });
    if (migrated > 0) { console.log('[Migration] Backfilled customerId on '+migrated+' quotes'); }
    if (!DB.settings.followupDays) DB.settings.followupDays = 7;
    // Migrate old tool checkouts that lack status field
    (DB.toolCheckouts||[]).forEach(function(co){
      if (!co.status) co.status = co.returnedAt ? 'verified' : 'checked_out';
    });
    // Migrate old tools to ensure new fields exist
    (DB.tools||[]).forEach(function(t){
      if (!t.linkedGroups) t.linkedGroups = [];
      if (t.photoUrl === undefined) t.photoUrl = '';
    });
  } catch(e) { console.warn('Load error', e); }
}

// ---- CURRENCY HELPER ----
function fmt(n) { return '$ ' + (isFinite(n) ? Math.abs(n).toFixed(2) : '0.00').replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtSigned(n) { return (n < 0 ? '-' : '') + fmt(n); }
function pct(n) { return (isFinite(n) ? n.toFixed(1) : '0.0') + '%'; }

// ---- NAVIGATION ----
const PAGE_TITLES = {dash:'Dashboard',qq:'Quick Quote',quotes:'Quotes',jobs:'Active Jobs',customers:'Customers',contacts:'Contacts',team:'Team',catalog:'Price Catalog',templates:'Job Templates',reports:'Reports & Analytics',inventory:'Inventory',tools:'Tools',settings:'Settings',field:'Time Clock',timesheet:'Timesheets',worktracking:'Work Tracking',dispatch:'Dispatch Board',invoices:'Invoices',workorders:'Work Orders','wo-settings':'WO Settings',calendar:'Calendar',purchaseorders:'Purchase Orders',vendors:'Vendors',scanner:'Scanner',auditlog:'Audit Log'};

function goPage(id) {
  // Warn if leaving Quick Quote with unsaved changes — only if QQ page is actually visible
  var qqPage = document.getElementById('page-qq');
  var qqActive = qqPage && qqPage.classList.contains('active');
  if (id !== 'qq' && qqActive && typeof _qqDirty !== 'undefined' && _qqDirty) {
    if (!confirm('You have unsaved changes in the Quick Quote.\nLeave anyway? Your changes will be lost.')) return;
  }
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
  // Always close dispatch detail panel when navigating away
  var dp = document.getElementById('dispatch-detail-panel');
  if (dp) dp.style.display = 'none';
  // Stop dispatch refresh timer if leaving dispatch
  if (id !== 'dispatch' && _dispatchRefreshTimer) {
    clearInterval(_dispatchRefreshTimer);
    _dispatchRefreshTimer = null;
  }
  var pg = document.getElementById('page-'+id);
  if (pg) pg.classList.add('active');
  var ni = document.querySelector('[data-page="'+id+'"]');
  if (ni) ni.classList.add('active');
  var tt = document.getElementById('topbar-title');
  if (tt) tt.textContent = PAGE_TITLES[id] || id;
  // Render page content
  if (id==='dash')       renderDash();
  if (id==='quotes') {
    // Apply saved default sort on page visit
    var qs = document.getElementById('q-sort');
    if (qs) {
      var savedSort = (DB.settings && DB.settings.quoteDefaultSort) || 'num-desc';
      qs.value = savedSort;
    }
    renderQuotes();
  }
  if (id==='customers')  renderCustomers();
  if (id==='contacts')   renderContacts();
  if (id==='jobs')       renderJobs();
  if (id==='team')       renderTeam();
  if (id==='calendar')   { if (typeof renderCalendar === 'function') renderCalendar(); }
  if (id==='workorders') { if (typeof initWorkOrdersPage === 'function') initWorkOrdersPage(); }
  if (id==='wo-settings'){ if (typeof renderWOSettingsPage === 'function') renderWOSettingsPage(); }
  if (id==='purchaseorders') { if (typeof renderPOList === 'function') renderPOList(); }
  if (id==='vendors')    { if (typeof renderVendors === 'function') renderVendors(); }
  if (id==='scanner')    { if (typeof renderScannerPage === 'function') renderScannerPage(); }
  if (id==='dash')       { if (typeof renderDashReorderAlert === 'function') setTimeout(renderDashReorderAlert, 200); }
  if (id==='auditlog')   { if (typeof renderAuditLog === 'function') setTimeout(renderAuditLog, 100); }
  if (id==='catalog')    { _pumActive=false; renderCatalog(); }
  else if (id==='templates') renderTemplates();
  if (id==='reports')    renderReports();
  if (id==='inventory')  renderInventory();
  if (id==='tools')      { setTimeout(renderTools, 50); }
  if (id==='settings')   { loadSettings(); setTimeout(function(){ renderPermissionsEditor(); switchMsTab('company'); initViewAsCard(); window.scrollTo(0,0); var p=document.getElementById('page-settings'); if(p)p.scrollTop=0; }, 150); }
  if (id==='qq')         { renderTplLibrary(); setTimeout(populateJTDropdown, 150); }
qqStage4Init();
  if (id==='field')      setTimeout(renderFieldPage, 50);
  if (id==='timesheet')  { var today=new Date().toISOString().split('T')[0]; var dtEl=document.getElementById('ts-date-filter'); if(dtEl&&!dtEl.value) dtEl.value=today; setTimeout(loadTimesheets,50); }
  if (id==='worktracking') { setTimeout(renderWorkTracking, 50); }
  if (id==='dispatch')     { setTimeout(initDispatchBoard, 50); }
  if (id==='invoices')     { setTimeout(renderInvoicesPage, 50); }
  // Sync mobile bottom nav highlight
  var mobilePages = ['dash','qq','field','jobs','inventory'];
  document.querySelectorAll('.mob-nav-item').forEach(function(item){ item.classList.remove('active'); });
  if (mobilePages.includes(id)) {
    var mob = document.getElementById('mob-'+id);
    if (mob) mob.classList.add('active');
  }
  // Close mobile sidebar after navigation
  if (document.body.classList.contains('is-mobile')) {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobile-overlay');
    if (sidebar) { sidebar.classList.remove('mobile-open'); sidebar.style.transform='translateX(-220px)'; sidebar.style.boxShadow='none'; }
    if (overlay) overlay.classList.remove('visible');
  }
}

// ---- LINE ITEMS ----
let lineItems = [];
let liSeq = Date.now(); // Start from timestamp so IDs are always unique across sessions

function nextLiId() {
  return ++liSeq; // Still sequential but starting from a large unique base
}

// ---- V6: PER DIEM / TRAVEL STATE ----
let perDiemData = { men:0, days:0, rate:75, rooms:0, nights:0, lodgingRate:120, trips:0, travelRate:0, travelDesc:'' };

// =============================================
// V6: SECTION TOGGLE FUNCTIONS
// =============================================
function toggleEquipment() {
  const cb    = document.getElementById('equipment-enabled');
  const body  = document.getElementById('equipment-body');
  const label = document.getElementById('equipment-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  // If turning off, clear equipment rows and recalc
  if (!on) {
    equipmentRows = [];
    renderEquipRows();
    calcTotals();
  }
}

function togglePerDiem() {
  const cb    = document.getElementById('perdiem-enabled');
  const body  = document.getElementById('perdiem-body');
  const label = document.getElementById('perdiem-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  if (!on) { clearPerDiem(false); }
}

// ---- PROPOSAL SECTION TOGGLES ----
var PROP_SECTIONS = ['exec-summary','assumptions','exclusions','terms'];

function toggleProposalSection(section) {
  var idMap = {
    'exec-summary': 'prop-show-exec',
    'assumptions':  'prop-show-assumptions',
    'exclusions':   'prop-show-exclusions',
    'terms':        'prop-show-terms'
  };
  var cbId = idMap[section];
  var cb   = document.getElementById(cbId);
  var lbl  = document.getElementById(cbId + '-label');
  if (!cb) return;
  var on = cb.checked;
  if (lbl) { lbl.textContent = on ? 'YES' : 'NO'; lbl.className = 'toggle-value-label' + (on ? ' on' : ''); }
}

function getProposalSections() {
  return {
    showExecSummary:  (document.getElementById('prop-show-exec')||{checked:true}).checked,
    showAssumptions:  (document.getElementById('prop-show-assumptions')||{checked:true}).checked,
    showExclusions:   (document.getElementById('prop-show-exclusions')||{checked:true}).checked,
    showTerms:        (document.getElementById('prop-show-terms')||{checked:true}).checked
  };
}

function resetProposalSectionToggles() {
  PROP_SECTIONS.forEach(function(s) {
    var idMap = {'exec-summary':'prop-show-exec','assumptions':'prop-show-assumptions','exclusions':'prop-show-exclusions','terms':'prop-show-terms'};
    var cb  = document.getElementById(idMap[s]);
    var lbl = document.getElementById(idMap[s] + '-label');
    if (cb)  cb.checked = true;
    if (lbl) { lbl.textContent = 'YES'; lbl.className = 'toggle-value-label on'; }
  });
}

function restoreProposalSectionToggles(sections) {
  if (!sections) return;
  var map = {
    showExecSummary: 'prop-show-exec',
    showAssumptions: 'prop-show-assumptions',
    showExclusions:  'prop-show-exclusions',
    showTerms:       'prop-show-terms'
  };
  Object.keys(map).forEach(function(key) {
    var on  = sections[key] !== false;
    var cb  = document.getElementById(map[key]);
    var lbl = document.getElementById(map[key] + '-label');
    if (cb)  cb.checked = on;
    if (lbl) { lbl.textContent = on ? 'YES' : 'NO'; lbl.className = 'toggle-value-label' + (on ? ' on' : ''); }
  });
}

function toggleLumpSum() {
  const cb    = document.getElementById('lumpsum-toggle');
  const body  = document.getElementById('lumpsum-body');
  const label = document.getElementById('lumpsum-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  updateLumpSumPreview();
}

function toggleLaborBanner() {
  const cb    = document.getElementById('labor-banner-toggle');
  const label = document.getElementById('labor-banner-label');
  if (!cb) return;
  const on = cb.checked;
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  calcTotals();
}

function getLaborBannerOn() {
  const cb = document.getElementById('labor-banner-toggle');
  return cb ? cb.checked : true; // default ON
}

// =============================================
// V6: PER DIEM / TRAVEL FUNCTIONS
// =============================================
function getPerDiemMarkup() {
  return (parseFloat(DB.settings.perDiemMarkup) || 0) / 100;
}

function calcPerDiem() {
  function gn(id) { return parseFloat(document.getElementById(id) && document.getElementById(id).value) || 0; }
  function gs(id) { return (document.getElementById(id)||{}).value || ''; }

  const men         = gn('pd-men');
  const days        = gn('pd-days');
  const rate        = gn('pd-rate');
  const rooms       = gn('pd-rooms');
  const nights      = gn('pd-nights');
  const lodgingRate = gn('pd-lodging-rate');
  const trips       = gn('pd-trips');
  const travelRate  = gn('pd-travel-rate');

  const pdCost      = men * days * rate;
  const lodgingCost = rooms * nights * lodgingRate;
  const travelCost  = trips * travelRate;
  const subtotal    = pdCost + lodgingCost + travelCost;
  const markup      = getPerDiemMarkup();
  const afterMarkup = subtotal * (1 + markup);

  // Update display fields
  function setVal(id, val) { const el=document.getElementById(id); if(el) el.value = val > 0 ? fmt(val) : ''; }
  setVal('pd-cost-display', pdCost);
  setVal('pd-lodging-display', lodgingCost);
  setVal('pd-travel-display', travelCost);

  const sub = document.getElementById('pd-subtotal');
  if (sub) sub.textContent = fmt(subtotal);

  const markupNote = document.getElementById('pd-markup-note');
  const afterEl    = document.getElementById('pd-total-after-markup');
  if (markup > 0) {
    if (markupNote) markupNote.textContent = (markup * 100).toFixed(0) + '% markup applied per Settings';
    if (afterEl)   afterEl.textContent = 'After markup: ' + fmt(afterMarkup);
  } else {
    if (markupNote) markupNote.textContent = 'No markup (0%) — pass-through at cost';
    if (afterEl)    afterEl.textContent = '';
  }

  // Persist to state
  perDiemData = { men, days, rate, rooms, nights, lodgingRate, trips, travelRate, travelDesc: gs('pd-travel-desc'), subtotal, afterMarkup };

  return { subtotal, afterMarkup, pdCost, lodgingCost, travelCost };
}

function getPerDiemCost() {
  // Returns the marked-up total to include in quote pricing
  return perDiemData.afterMarkup || 0;
}

function clearPerDiem(skipCalc) {
  ['pd-men','pd-days','pd-rooms','pd-nights','pd-trips'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=0; });
  const rateEl = document.getElementById('pd-rate'); if(rateEl) rateEl.value = 75;
  const lodgEl = document.getElementById('pd-lodging-rate'); if(lodgEl) lodgEl.value = 120;
  const travEl = document.getElementById('pd-travel-rate'); if(travEl) travEl.value = 0;
  const descEl = document.getElementById('pd-travel-desc'); if(descEl) descEl.value = '';
  perDiemData = { men:0, days:0, rate:75, rooms:0, nights:0, lodgingRate:120, trips:0, travelRate:0, travelDesc:'', subtotal:0, afterMarkup:0 };
  if (!skipCalc) calcPerDiem();
}

function loadPerDiemData(d) {
  if (!d) return;
  function sv(id,v){ const el=document.getElementById(id); if(el) el.value = v||0; }
  sv('pd-men', d.men); sv('pd-days', d.days); sv('pd-rate', d.rate||75);
  sv('pd-rooms', d.rooms); sv('pd-nights', d.nights); sv('pd-lodging-rate', d.lodgingRate||120);
  sv('pd-trips', d.trips); sv('pd-travel-rate', d.travelRate||0);
  const descEl = document.getElementById('pd-travel-desc'); if(descEl) descEl.value = d.travelDesc||'';
  calcPerDiem();
}

// =============================================
// V6: LUMP SUM FUNCTIONS
// =============================================
function toggleLumpSumItems() {
  var cb  = document.getElementById('lumpsum-show-items');
  var lbl = document.getElementById('lumpsum-show-items-label');
  if (!cb || !lbl) return;
  var on = cb.checked;
  lbl.textContent = on ? 'YES' : 'NO';
  lbl.className = 'toggle-value-label' + (on ? ' on' : '');
}

function getLumpSumState() {
  const toggle    = document.getElementById('lumpsum-toggle');
  const label     = document.getElementById('lumpsum-label');
  const showItems = document.getElementById('lumpsum-show-items');
  return {
    enabled:   !!(toggle && toggle.checked),
    label:     label ? label.value.trim() || 'Complete Low Voltage Installation' : 'Complete Low Voltage Installation',
    showItems: showItems ? showItems.checked : true
  };
}

function updateLumpSumPreview() {
  const state = getLumpSumState();
  const text  = document.getElementById('lumpsum-preview-text');
  if (!text) return;
  const totalEl = document.getElementById('ps-total');
  const total   = totalEl ? totalEl.textContent : '$0.00';
  text.textContent = state.label + ' — ' + total;
}

// =============================================
// V6: ALSO INCLUDE PER DIEM IN QUOTE SAVE
// =============================================

// ---- V5: EQUIPMENT RENTALS ----
let equipmentRows = [];
let eqSeq = 1;
function newLI(desc, cat, qty, unit, mc, lh) {
  return { _id: nextLiId(), desc:desc||'', cat:cat||'General', qty:qty||1, unit:unit||'ea', mc:parseFloat(mc)||0, lh:parseFloat(lh)||0 };
}
function addRow(item) {
  lineItems.push(item || newLI('','',1,'ea',0,0));
  renderLI();
  calcTotals();
  clearQQDraft();
  setQQDirty(false, 'Fresh quote started');
  updateQQStage3UI();
}
function delRow(id) {
  lineItems = lineItems.filter(function(x){return x._id != id});
  renderLI();
  calcTotals();
}
function renderLI() {
  const body = document.getElementById('li-body');
  if (!body) return;
  if (lineItems.length === 0) {
    body.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#90a4ae;padding:20px">No items yet. Click &ldquo;+ Add Row&rdquo; or select a template above.</td></tr>';
    return;
  }
  // Determine pricing mode and rate ONCE per render
  const _isMarkupMode = currentPricingMode() === 'markup';
  const _rate = getMarginDecimal();
  // In markup mode, compute equivalent margin %: margin = markup / (1 + markup)
  // 25% markup ≈ 20% margin; 35% markup ≈ 25.9% margin; 100% markup = 50% margin
  const _equivMargin = _isMarkupMode && _rate > 0 ? (_rate / (1 + _rate)) * 100 : null;
  const _equivMarginLabel = _equivMargin != null
    ? '<span class="li-equiv-margin">≈ ' + (Math.round(_equivMargin * 10) / 10).toFixed(1) + '% margin</span>'
    : '';
  let html = '';
  lineItems.forEach(function(item, i) {
    let unitMS;
    if (!item.mc) {
      unitMS = item.mc;
    } else if (_isMarkupMode) {
      // Markup: sell = cost × (1 + markup rate)
      unitMS = item.mc * (1 + Math.max(_rate, 0));
    } else {
      // Margin: sell = cost / (1 - margin rate)
      unitMS = (_rate < 1) ? (item.mc / (1 - _rate)) : item.mc;
    }
    const totalMS = unitMS * item.qty;
    html += '<tr>';
    html += '<td style="color:#90a4ae;font-size:11px">' + (i+1) + '</td>';
    html += '<td><input data-li="'+item._id+'" data-field="desc" value="'+escHtml(item.desc)+'" style="min-width:140px" placeholder="Description"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="cat" value="'+escHtml(item.cat)+'" style="width:90px" placeholder="Category"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="qty" type="number" value="'+item.qty+'" min="0" style="width:60px"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="unit" value="'+escHtml(item.unit)+'" style="width:50px" placeholder="ea"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="mc" type="number" value="'+item.mc+'" min="0" step="0.01" style="width:80px"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="lh" type="number" value="'+item.lh+'" min="0" step="0.25" style="width:65px"></td>';
    html += '<td style="color:#546e7a;font-size:12px">'+fmt(unitMS)+(i===0?_equivMarginLabel:'')+'</td>';
    html += '<td style="color:#1565c0;font-weight:700;font-size:12px">'+fmt(totalMS)+'</td>';
    html += '<td style="color:#2e7d32;font-size:12px">'+fmt(item.lh*item.qty*getLaborRate())+'</td>';
    html += '<td><button class="btn btn-danger btn-sm" data-action="delRow" data-id="'+item._id+'">×</button></td>';
    html += '</tr>';
  });
  body.innerHTML = html;
}
function getLaborRate() {
  const el = document.getElementById('qq-lr');
  return el ? parseFloat(el.value)||100 : 100;
}
function getMarginDecimal() {
  const el = document.getElementById('qq-mk');
  const _mv = el ? parseFloat(el.value) : NaN; const v = !isNaN(_mv) ? _mv : 35;
  // In markup mode, allow rates up to 500% (5.0). In margin mode, cap at 99% (0.99).
  if (currentPricingMode() === 'markup') {
    return Math.min(Math.max(v,0),500) / 100;
  }
  return Math.min(Math.max(v,0),99) / 100;
}

// Current pricing mode for the active quote.
// Returns 'margin' (default) or 'markup'.
// Reads from the toggle's hidden state via the active button.
function currentPricingMode() {
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle) return 'margin';
  const active = toggle.querySelector('.pmt-btn.active');
  return active ? (active.getAttribute('data-pmt-mode') || 'margin') : 'margin';
}

// Set the pricing mode programmatically. Updates the toggle visual,
// updates labels/help text, recalculates totals, re-renders line items.
function setPricingMode(newMode, opts) {
  opts = opts || {};
  if (newMode !== 'margin' && newMode !== 'markup') newMode = 'margin';
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle) return;
  const oldMode = currentPricingMode();
  if (oldMode === newMode && !opts.force) return;

  // Capture old total before switching, for the banner
  let oldTotal = 0;
  if (!opts.silent && lineItems.length > 0) {
    try { const t = calcTotals(); oldTotal = t.totalSell || 0; } catch(e) {}
  }

  // Update toggle visual
  Array.prototype.forEach.call(toggle.querySelectorAll('.pmt-btn'), function(b){
    const isActive = b.getAttribute('data-pmt-mode') === newMode;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Update mode badge
  const badge = document.getElementById('pricing-mode-badge');
  if (badge) {
    badge.textContent = newMode === 'markup'
      ? '💰 Pricing Mode: T&M / Markup'
      : '💰 Pricing Mode: Margin-Based';
  }

  // Update label
  const label = document.getElementById('qq-mk-label');
  if (label) {
    label.textContent = newMode === 'markup' ? 'Markup (%)' : 'Target Margin (%)';
  }

  // Update input constraints
  const mk = document.getElementById('qq-mk');
  if (mk) {
    if (newMode === 'markup') { mk.min='0'; mk.max='500'; mk.step='1'; }
    else { mk.min='0'; mk.max='99'; mk.step='1'; }
  }

  // Update help text
  const help = document.getElementById('pmt-help-text');
  if (help) {
    help.textContent = newMode === 'markup'
      ? 'T&M / Markup mode: Material × (1 + markup %). Labor, equipment, and per diem PASS THROUGH at cost. True time-and-materials behavior — best for service calls and small jobs.'
      : 'Margin-Based mode: Sell = Cost ÷ (1 - margin %). Targets a profit margin as a percentage of the sell price. Best for project work.';
  }

  // Update the small note at the bottom of the pricing card
  const modeNote = document.getElementById('pricing-mode-note');
  if (modeNote) {
    modeNote.textContent = newMode === 'markup'
      ? 'Quote pricing driven by markup on top of cost'
      : 'Quote pricing driven by target margin, not markup';
  }

  // Re-render line items with new mode-aware math
  renderLI();
  // Recalculate totals
  let newTotal = 0;
  try { const t = calcTotals(); newTotal = t.totalSell || 0; } catch(e) {}

  // Show the switch banner if total changed meaningfully
  if (!opts.silent && oldTotal > 0 && Math.abs(newTotal - oldTotal) > 0.5) {
    showPmtSwitchBanner(oldMode, newMode, oldTotal, newTotal);
  }
}

function showPmtSwitchBanner(oldMode, newMode, oldTotal, newTotal) {
  const banner = document.getElementById('pmt-switch-banner');
  if (!banner) return;
  const fmtMoney = function(n){ return '$' + (Math.round((n||0)*100)/100).toFixed(2); };
  const oldLabel = oldMode === 'markup' ? 'T&M / Markup' : 'Margin-Based';
  const newLabel = newMode === 'markup' ? 'T&M / Markup' : 'Margin-Based';
  const diff = newTotal - oldTotal;
  const dirWord = diff > 0 ? 'up' : 'down';
  banner.innerHTML = ''
    + '<button class="pmt-close" type="button" aria-label="Dismiss">×</button>'
    + '⚠️ Switched from <strong>' + oldLabel + '</strong> to <strong>' + newLabel + '</strong>. '
    + 'Total Sell changed from <strong>' + fmtMoney(oldTotal) + '</strong> to <strong>' + fmtMoney(newTotal) + '</strong> '
    + '(' + dirWord + ' ' + fmtMoney(Math.abs(diff)) + '). Review pricing before sending.';
  banner.classList.add('show');
  const closeBtn = banner.querySelector('.pmt-close');
  if (closeBtn) closeBtn.onclick = function(){ banner.classList.remove('show'); };
}

// Wire up the toggle buttons (called once on DOM ready)
function initPricingModeToggle() {
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle || toggle._pmtWired) return;
  Array.prototype.forEach.call(toggle.querySelectorAll('.pmt-btn'), function(b){
    b.addEventListener('click', function(ev){
      ev.preventDefault();
      const newMode = b.getAttribute('data-pmt-mode');
      setPricingMode(newMode);
    });
  });
  toggle._pmtWired = true;
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


// =============================================
// V5 PHASE 1: EQUIPMENT RENTAL FUNCTIONS
// =============================================
function addEquipRow() {
  equipmentRows.push({ _id: eqSeq++, type: EQUIPMENT_TYPES[0].id, days: 1, dailyRate: EQUIPMENT_TYPES[0].daily, notes: '' });
  renderEquipRows();
  calcTotals();
}
function delEquipRow(id) {
  equipmentRows = equipmentRows.filter(function(r){ return r._id != id; });
  renderEquipRows();
  calcTotals();
}
function renderEquipRows() {
  const cont = document.getElementById('eq-rows');
  if (!cont) return;
  if (equipmentRows.length === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:#90a4ae;padding:4px 0">No equipment added. Click below to add lifts or rentals.</div>';
    updateEquipTotal();
    return;
  }
  cont.innerHTML = equipmentRows.map(function(row) {
    const typeOpts = EQUIPMENT_TYPES.map(function(t){
      return '<option value="'+t.id+'"'+(row.type===t.id?' selected':'')+'>'+escHtml(t.name)+'</option>';
    }).join('');
    return '<div class="eq-row" data-eqid="'+row._id+'" style="margin-bottom:8px">' +
      '<div><label>Equipment Type</label><select data-eqfield="type" data-eqid="'+row._id+'">'+typeOpts+'</select></div>' +
      '<div><label>Days</label><input type="number" min="1" value="'+row.days+'" data-eqfield="days" data-eqid="'+row._id+'" style="width:70px"></div>' +
      '<div><label>Daily Rate ($)</label><input type="number" min="0" value="'+row.dailyRate+'" data-eqfield="dailyRate" data-eqid="'+row._id+'" style="width:90px"></div>' +
      '<div><button class="btn btn-danger btn-sm" data-action="delEquipRow" data-id="'+row._id+'" style="margin-top:16px">×</button></div>' +
    '</div>';
  }).join('');
  updateEquipTotal();
}
function updateEquipTotal() {
  let total = equipmentRows.reduce(function(s, r){ return s + (parseFloat(r.days)||0) * (parseFloat(r.dailyRate)||0); }, 0);
  const el = document.getElementById('eq-total');
  if (el) el.textContent = fmt(total);
  return total;
}
function getEquipmentCost() {
  return equipmentRows.reduce(function(s, r){ return s + (parseFloat(r.days)||0) * (parseFloat(r.dailyRate)||0); }, 0);
}
function checkEquipWarn(equipCost, totalSell) {
  const warn = document.getElementById('eq-warn');
  if (!warn) return;
  if (totalSell > 0 && equipCost / totalSell > 0.15) {
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}

// =============================================
// V5 PHASE 1: PERMIT COMPLIANCE FUNCTIONS
// =============================================
function updatePermitStatus() {
  const lv    = document.getElementById('permit-lv');
  const elec  = document.getElementById('permit-elec');
  const other = document.getElementById('permit-other');
  const none  = document.getElementById('permit-none');
  const badge = document.getElementById('permit-status-badge');
  const otherDesc = document.getElementById('permit-other-desc');
  if (!badge) return;

  // "No Permit Required" is mutually exclusive with specific permits
  if (none && none.checked) {
    if (lv)    lv.checked = false;
    if (elec)  elec.checked = false;
    if (other) other.checked = false;
    if (otherDesc) otherDesc.style.display = 'none';
    badge.className = 'permit-status permit-ok';
    badge.textContent = '✓ No permit required — confirmed for this job';
    return;
  }

  // Checking a specific permit unchecks "none"
  const anySpecific = (lv && lv.checked) || (elec && elec.checked) || (other && other.checked);
  if (anySpecific && none) none.checked = false;

  if (other && otherDesc) {
    otherDesc.style.display = other.checked ? 'block' : 'none';
  }

  if (anySpecific) {
    const parts = [];
    if (lv && lv.checked)    parts.push('Low Voltage');
    if (elec && elec.checked) parts.push('Electrical');
    if (other && other.checked) parts.push('Other');
    badge.className = 'permit-status permit-ok';
    badge.textContent = '✓ Permits identified: ' + parts.join(', ');
  } else {
    badge.className = 'permit-status permit-pending';
    badge.textContent = '⚠️ No permits selected — verify requirements before sending quote';
  }
}
function getPermitData() {
  return {
    lv:       !!(document.getElementById('permit-lv')   && document.getElementById('permit-lv').checked),
    elec:     !!(document.getElementById('permit-elec') && document.getElementById('permit-elec').checked),
    other:    !!(document.getElementById('permit-other')&& document.getElementById('permit-other').checked),
    none:     !!(document.getElementById('permit-none') && document.getElementById('permit-none').checked),
    otherText: (document.getElementById('permit-other-text')||{}).value || '',
    coord:     (document.getElementById('permit-coord')||{}).value || ''
  };
}
function loadPermitData(p) {
  if (!p) return;
  function sc(id, v) { const el = document.getElementById(id); if(el) el.checked = !!v; }
  function sv(id, v) { const el = document.getElementById(id); if(el) el.value = v||''; }
  sc('permit-lv', p.lv); sc('permit-elec', p.elec); sc('permit-other', p.other); sc('permit-none', p.none);
  sv('permit-other-text', p.otherText); sv('permit-coord', p.coord);
  updatePermitStatus();
}

// =============================================
// MARGIN FLOOR FUNCTIONS — dynamic, editable
// =============================================

// Default floors as array — used when DB.marginFloors is empty or legacy object
var MF_DEFAULT_LIST = [
  { jobType:'New Construction', floor:35, notes:'Standard residential/commercial builds' },
  { jobType:'Remodel',          floor:40, notes:'Higher floor — unknown conditions add risk' },
  { jobType:'Service Call',     floor:42, notes:'High margin — small ticket, high overhead' },
  { jobType:'Upgrade',          floor:38, notes:'Existing system additions' },
  { jobType:'Addition',         floor:36, notes:'Project expansions' }
];

function _getMFList() {
  // Support both old object format and new array format
  var mf = DB.marginFloors;
  if (!mf) return MF_DEFAULT_LIST.map(function(x){ return Object.assign({},x); });
  if (Array.isArray(mf)) return mf;
  // Migrate old object format to array
  var arr = MF_DEFAULT_LIST.map(function(def) {
    return { jobType:def.jobType, floor: mf[def.jobType]!==undefined ? parseFloat(mf[def.jobType]) : def.floor, notes:def.notes };
  });
  // Add any extra keys not in defaults
  Object.keys(mf).forEach(function(k) {
    if (!arr.find(function(x){ return x.jobType===k; })) {
      var _f=parseFloat(mf[k]); arr.push({ jobType:k, floor:!isNaN(_f)?_f:35, notes:'' });
    }
  });
  return arr;
}

function getMarginFloor(jobType) {
  var list = _getMFList();
  var entry = list.find(function(x){ return x.jobType===jobType; });
  if (entry) return parseFloat(entry.floor);
  return MF_DEFAULTS[jobType] || 35;
}

function checkMarginFloor(achievedMarginPct, jobType) {
  const floor = getMarginFloor(jobType);
  const badge = document.getElementById('mf-floor-badge');
  const approval = document.getElementById('mf-approval');
  if (!badge) return false;
  badge.style.display = 'inline-block';
  const belowFloor = achievedMarginPct < floor;
  if (belowFloor) {
    badge.className = 'margin-floor-badge mf-warn';
    badge.textContent = '⚠️ Below Floor: ' + pct(achievedMarginPct) + ' < ' + pct(floor) + ' (' + (jobType||'Job') + ')';
    if (approval) approval.classList.add('visible');
  } else {
    badge.className = 'margin-floor-badge mf-ok';
    badge.textContent = '✓ Margin Floor OK: ' + pct(achievedMarginPct) + ' ≥ ' + pct(floor) + ' (' + (jobType||'Job') + ')';
    if (approval) approval.classList.remove('visible');
  }
  return belowFloor;
}

function renderMarginFloorsEditor() {
  var el = document.getElementById('ms-margin-floors-container');
  if (!el) return;
  var list = _getMFList();

  var html =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
      '<div>'+
        '<div class="card-title" style="margin:0">🎯 Margin Floor Settings</div>'+
        '<p style="font-size:12px;color:#546e7a;margin:4px 0 0">Minimum acceptable margin per job type. Quotes below floor are flagged and require approval.</p>'+
      '</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addMarginFloorRow()">+ Add Job Type</button>'+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Job Type</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;width:130px">Min Margin %</th>'+
      '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Notes / Description</th>'+
      '<th style="width:40px"></th>'+
    '</tr></thead><tbody id="mf-tbody">';

  list.forEach(function(row, i) {
    html +=
      '<tr style="border-bottom:1px solid #f0f4f8" data-mf-idx="'+i+'">'+
        '<td style="padding:6px 8px">'+
          '<input value="'+escHtml(row.jobType||'')+'" onchange="mfUpdateRow('+i+',\'jobType\',this.value)" '+
          'style="width:100%;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;font-weight:600;box-sizing:border-box">'+
        '</td>'+
        '<td style="padding:6px 8px;text-align:center">'+
          '<div style="display:flex;align-items:center;justify-content:center;gap:4px">'+
            '<input type="number" value="'+escHtml(String(row.floor!==undefined&&row.floor!==null?row.floor:35))+'" min="0" max="999" step="0.5" '+
            'onchange="mfUpdateRow('+i+',\'floor\',parseFloat(this.value))" '+
            'style="width:64px;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;font-weight:700;text-align:center">'+
            '<span style="font-size:13px;color:#546e7a">%</span>'+
          '</div>'+
        '</td>'+
        '<td style="padding:6px 8px">'+
          '<input value="'+escHtml(row.notes||'')+'" placeholder="Optional description..." onchange="mfUpdateRow('+i+',\'notes\',this.value)" '+
          'style="width:100%;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;color:#546e7a;box-sizing:border-box">'+
        '</td>'+
        '<td style="padding:6px 8px;text-align:center">'+
          '<button onclick="mfDeleteRow('+i+')" style="background:none;border:none;color:#c62828;font-size:16px;cursor:pointer;padding:0" title="Remove">×</button>'+
        '</td>'+
      '</tr>';
  });

  html += '</tbody></table>'+
    '<div style="margin-top:12px;display:flex;gap:10px;align-items:center">'+
      '<button class="btn btn-primary" onclick="saveMarginFloors()">💾 Save Margin Floors</button>'+
      '<span id="mf-saved-note" style="font-size:12px;color:#2e7d32;display:none">✓ Saved!</span>'+
    '</div>';

  el.innerHTML = html;
}

function mfUpdateRow(idx, field, value) {
  var list = _getMFList();
  if (list[idx]) {
    if (field === 'floor') {
      var fv = parseFloat(value);
      list[idx].floor = !isNaN(fv) ? fv : 35;
    } else {
      list[idx][field] = value;
    }
  }
  DB.marginFloors = list;
  // Don't saveDB on every keystroke — save button handles final save
}

function mfDeleteRow(idx) {
  var list = _getMFList();
  var name = list[idx] ? list[idx].jobType : 'this row';
  if (!confirm('Remove "'+name+'" floor? Any quotes using this job type will fall back to the default 35% floor.')) return;
  list.splice(idx, 1);
  DB.marginFloors = list;
  saveDB();
  renderMarginFloorsEditor();
  showToast('"'+name+'" removed','info');
}

function addMarginFloorRow() {
  var list = _getMFList();
  list.push({ jobType:'New Job Type', floor:35, notes:'' });
  DB.marginFloors = list;
  saveDB();
  renderMarginFloorsEditor();
  // Focus the new name input
  var rows = document.querySelectorAll('#mf-tbody tr');
  if (rows.length) {
    var lastInput = rows[rows.length-1].querySelector('input');
    if (lastInput) { lastInput.focus(); lastInput.select(); }
  }
}

function saveMarginFloors() {
  // Read current values from DOM and save
  var list = _getMFList();
  var rows = document.querySelectorAll('#mf-tbody tr[data-mf-idx]');
  rows.forEach(function(row) {
    var idx = parseInt(row.getAttribute('data-mf-idx'));
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && list[idx]) list[idx].jobType = inputs[0].value.trim() || list[idx].jobType;
    if (inputs[1] && list[idx]) { var fv = parseFloat(inputs[1].value); list[idx].floor = (!isNaN(fv)) ? fv : 35; }
    if (inputs[2] && list[idx]) list[idx].notes   = inputs[2].value.trim();
  });
  DB.marginFloors = list;
  saveDB();
  var note = document.getElementById('mf-saved-note');
  if (note) { note.style.display='inline'; setTimeout(function(){ note.style.display='none'; }, 2000); }
  showToast('Margin floors saved ✓','success',2000);
}

function loadMarginFloors() {
  // With the new dynamic renderer this is a no-op when on the quoting tab
  // Kept for backward compatibility with calls from loadSettings()
  renderMarginFloorsEditor();
}


// ============================================================
// AUDIT LOG SYSTEM
// ============================================================

// Central audit function — call this from anywhere
function auditLog(event, recordType, recordId, details) {
  if (!_currentUser) return;

  var entry = {
    id:          'al-' + Date.now() + '-' + Math.random().toString(36).slice(2,5),
    event:       event,
    recordType:  recordType,
    recordId:    recordId || null,
    actorId:     _currentUser.id,
    actorName:   _currentUser.full_name || _currentUser.email || 'Unknown',
    actorRole:   _currentUser.role || 'unknown',
    oldValue:    details && details.old !== undefined ? JSON.stringify(details.old) : null,
    newValue:    details && details.new !== undefined ? JSON.stringify(details.new) : null,
    note:        details && details.note ? details.note : null,
    ts:          new Date().toISOString(),
    // Track if this was done in View As mode
    viewAsMode:  typeof _viewAsActive !== 'undefined' && _viewAsActive,
    realActorName: typeof _realUser !== 'undefined' && _realUser ? _realUser.full_name : null
  };

  // Store locally
  if (!DB.auditLog) DB.auditLog = [];
  DB.auditLog.push(entry);

  // Keep local log trimmed to last 500 entries (full history in Supabase)
  if (DB.auditLog.length > 500) DB.auditLog = DB.auditLog.slice(-500);

  // Push to Supabase async — never blocks UI
  _pushAuditEntry(entry);

  return entry;
}

async function _pushAuditEntry(entry) {
  if (!_sb || !_currentUser) return;
  try {
    await _sb.from('audit_log').insert({
      id:           entry.id,
      event:        entry.event,
      record_type:  entry.recordType,
      record_id:    entry.recordId,
      actor_id:     entry.actorId,
      actor_name:   entry.actorName,
      actor_role:   entry.actorRole,
      old_value:    entry.oldValue,
      new_value:    entry.newValue,
      note:         entry.note,
      view_as_mode: entry.viewAsMode,
      real_actor:   entry.realActorName,
      created_at:   entry.ts
    });
  } catch(e) {
    // Fail silently — audit log should never break the app
    console.warn('[Audit]', e.message);
  }
}

// Convenience wrappers for common events
function auditWOStatus(woId, woNumber, oldStatus, newStatus) {
  auditLog('wo_status_changed', 'work_order', woId, {
    old: oldStatus, new: newStatus,
    note: woNumber + ': ' + oldStatus + ' → ' + newStatus
  });
}

function auditWOTechAssigned(woId, woNumber, techName) {
  auditLog('wo_tech_assigned', 'work_order', woId, {
    new: techName,
    note: woNumber + ': assigned ' + techName
  });
}

function auditWOTechUnassigned(woId, woNumber, techName) {
  auditLog('wo_tech_unassigned', 'work_order', woId, {
    old: techName,
    note: woNumber + ': unassigned ' + techName
  });
}

function auditTimeEntry(action, entryId, techName, details) {
  auditLog('time_entry_' + action, 'time_entry', entryId, {
    note: techName + ': ' + (details||'')
  });
}

function auditPermChange(roleId, permKey, oldVal, newVal) {
  auditLog('role_permission_changed', 'settings', roleId, {
    old: oldVal, new: newVal,
    note: roleId + ' — ' + permKey + ': ' + (oldVal?'ON':'OFF') + ' → ' + (newVal?'ON':'OFF')
  });
}

// ============================================================
// AUDIT LOG RENDER
// ============================================================

function renderAuditLog() {
  var el = document.getElementById('audit-log-content');
  if (!el) return;

  var myRole = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager';
  if (!isAdmin) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#90a4ae">Access restricted to owner and office.</div>';
    return;
  }

  // Filters
  var filterType  = (document.getElementById('al-filter-type')||{}).value  || '';
  var filterActor = (document.getElementById('al-filter-actor')||{}).value || '';
  var filterFrom  = (document.getElementById('al-filter-from')||{}).value  || '';
  var filterTo    = (document.getElementById('al-filter-to')||{}).value    || '';

  // Populate actor filter
  var actorSel = document.getElementById('al-filter-actor');
  if (actorSel && actorSel.options.length <= 1) {
    var actors = [...new Set((DB.auditLog||[]).map(function(e){ return e.actorName; }))].sort();
    actors.forEach(function(a){
      var o = document.createElement('option'); o.value=a; o.textContent=a; actorSel.appendChild(o);
    });
  }

  // Set default date range to last 7 days
  var fromEl = document.getElementById('al-filter-from');
  var toEl   = document.getElementById('al-filter-to');
  if (fromEl && !fromEl.value) {
    var d = new Date(); d.setDate(d.getDate()-7);
    fromEl.value = d.toISOString().split('T')[0];
  }
  if (toEl && !toEl.value) {
    toEl.value = new Date().toISOString().split('T')[0];
  }
  filterFrom = (document.getElementById('al-filter-from')||{}).value || '';
  filterTo   = (document.getElementById('al-filter-to')||{}).value   || '';

  var entries = (DB.auditLog||[]).filter(function(e){
    if (filterType  && e.recordType !== filterType)  return false;
    if (filterActor && e.actorName  !== filterActor) return false;
    if (filterFrom  && e.ts.split('T')[0] < filterFrom) return false;
    if (filterTo    && e.ts.split('T')[0] > filterTo)   return false;
    return true;
  }).sort(function(a,b){ return b.ts.localeCompare(a.ts); }); // newest first

  if (!entries.length) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No audit entries for the selected filters.</div>';
    return;
  }

  var typeColors = {
    work_order:'#e3f2fd', time_entry:'#e8f5e9', settings:'#f3e5f5',
    quote:'#fff3e0', invoice:'#fce4ec', purchase_order:'#fff8e1', inventory:'#e0f2f1'
  };
  var typeIcons = {
    work_order:'🔨', time_entry:'⏱', settings:'⚙️',
    quote:'💰', invoice:'📄', purchase_order:'📦', inventory:'🏪'
  };

  var html = '<div class="card" style="padding:0;overflow:hidden">'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">When</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Who</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">What</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Record</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Detail</th>'+
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    var ts   = new Date(e.ts);
    var when = ts.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' +
               ts.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    var bg   = typeColors[e.recordType] || '#f8f9fa';
    var icon = typeIcons[e.recordType]  || '•';
    var eventLabel = (e.event||'').replace(/_/g,' ');
    var detail = '';
    if (e.oldValue && e.newValue) detail = e.oldValue + ' → ' + e.newValue;
    else if (e.newValue) detail = e.newValue;
    else if (e.oldValue) detail = e.oldValue;
    if (e.note) detail = e.note;

    html += '<tr style="border-bottom:1px solid #f0f4f8">'+
      '<td style="padding:10px 14px;font-size:11px;color:#546e7a;white-space:nowrap">'+escHtml(when)+'</td>'+
      '<td style="padding:10px 14px">'+
        '<div style="font-weight:600;font-size:12px">'+escHtml(e.actorName||'')+'</div>'+
        '<div style="font-size:10px;color:#90a4ae">'+escHtml(e.actorRole||'')+'</div>'+
        (e.viewAsMode?'<div style="font-size:9px;color:#e65100;font-weight:700">VIEW AS MODE</div>':'')+
      '</td>'+
      '<td style="padding:10px 14px">'+
        '<span style="background:'+bg+';padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">'+
          icon+' '+escHtml(eventLabel)+
        '</span>'+
      '</td>'+
      '<td style="padding:10px 14px;font-size:12px;color:#546e7a">'+escHtml(e.recordId||'')+'</td>'+
      '<td style="padding:10px 14px;font-size:12px;color:#37474f;max-width:300px">'+escHtml(detail||'')+'</td>'+
    '</tr>';
  });

  html += '</tbody></table>'+
    '<div style="padding:10px 14px;font-size:11px;color:#90a4ae;border-top:1px solid #f0f4f8">'+
      entries.length+' entries shown · Full history in Supabase'+
    '</div>'+
  '</div>';

  el.innerHTML = html;
}

// Populate job type dropdown from dynamic margin floor list
function populateJTDropdown() {
  var sel = document.getElementById('qq-jt');
  if (!sel) return;
  var current = sel.value;
  var list = _getMFList();
  sel.innerHTML = list.map(function(row) {
    return '<option value="'+escHtml(row.jobType)+'"'+(row.jobType===current?' selected':'')+'>'+escHtml(row.jobType)+'</option>';
  }).join('');
  if (!sel.value && list.length) sel.value = list[0].jobType;
}
