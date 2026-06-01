
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
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  } catch(e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      // localStorage is full — strip large WT defaults (they're re-generatable) and retry
      try {
        var slim = Object.assign({}, DB);
        // Remove catalog/templates/buildingTypes — regenerated from defaults on demand
        if (slim.wtItemCatalog && slim.wtItemCatalog.length > 0 &&
            slim.wtItemCatalog[0].id && slim.wtItemCatalog[0].id.startsWith('itm_')) {
          delete slim.wtItemCatalog;   // default catalog, not customized
        }
        if (slim.wtRoomTemplates && slim.wtRoomTemplates.length > 0 &&
            slim.wtRoomTemplates[0].id && slim.wtRoomTemplates[0].id.startsWith('tpl_')) {
          delete slim.wtRoomTemplates; // default templates
        }
        if (slim.wtBuildingTypes) delete slim.wtBuildingTypes;
        // Also trim wizard draft from DB if somehow stored there
        localStorage.setItem(DB_KEY, JSON.stringify(slim));
        console.warn('saveDB: trimmed WT defaults to fit quota');
      } catch(e2) {
        console.error('saveDB: quota still exceeded after trim', e2);
        showToast && showToast('Storage full — please clear old data or use a different browser profile','error');
      }
    } else {
      console.warn('Save error', e);
    }
  }
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


// ============================================================
// APP-WIDE BROWSER BACK BUTTON GUARD
// Single clean implementation — covers all pages in ProBid
// ============================================================
var _probidBackGuardInstalled = false;
var _probidAllowLeave         = false;
var _probidLeaveCallback      = null;

function probidInstallBackGuard() {
  if (_probidBackGuardInstalled) return;
  _probidBackGuardInstalled = true;

  // Push one state so the back button has something to hit
  history.pushState({ probid: true }, '');

  window.addEventListener('popstate', function(e) {
    // If we explicitly told it to leave, allow it once
    if (_probidAllowLeave) {
      _probidAllowLeave = false;
      return;
    }
    // Re-push immediately to stay on the current page
    history.pushState({ probid: true }, '');
    // Show the right dialog for current context
    probidShowBackDialog();
  });
}

function probidActuallyLeave() {
  _probidAllowLeave = true;
  history.back();
}

function probidShowBackDialog() {
  // ── Work Tracking: wizard open ────────────────────────────
  var wizOpen = document.getElementById('wt-wizard-modal') ||
                document.getElementById('wt-abw-modal');
  if (wizOpen) {
    probidLeaveModal(
      'Wizard in Progress',
      'Your progress is saved as a draft. Resume it next time you open the wizard.',
      'Stay in Wizard',
      'Close Wizard',
      function(leave) { if (leave) wizOpen.remove(); }
    );
    return;
  }

  // ── Work Tracking: inside a project ───────────────────────
  var wtPage  = document.getElementById('page-worktracking');
  var wtActive = wtPage && wtPage.classList.contains('active');
  if (wtActive && typeof WT !== 'undefined' && WT.proj && WT.view !== 'list') {
    probidLeaveModal(
      'Where do you want to go?',
      'Use the app navigation buttons. The browser back button exits ProBid entirely.',
      '← Back to Projects',
      'Leave ProBid',
      function(leave) {
        if (!leave) {
          if (typeof wtRenderProjectList === 'function') {
            WT.view = 'list'; WT.proj = null;
            wtRenderProjectList();
          }
        } else {
          probidActuallyLeave();
        }
      }
    );
    return;
  }

  // ── Quick Quote: unsaved changes ──────────────────────────
  var qqPage  = document.getElementById('page-qq');
  var qqActive = qqPage && qqPage.classList.contains('active');
  if (qqActive && typeof _qqDirty !== 'undefined' && _qqDirty) {
    probidLeaveModal(
      'Unsaved Quote Changes',
      'You have unsaved changes. Leaving now will lose them.',
      'Stay & Save',
      'Leave Anyway',
      function(leave) { if (leave) probidActuallyLeave(); }
    );
    return;
  }

  // ── Any other page ────────────────────────────────────────
  probidLeaveModal(
    'Leave ProBid?',
    'You are about to exit the ProBid application.',
    'Stay in ProBid',
    'Leave ProBid',
    function(leave) { if (leave) probidActuallyLeave(); }
  );
}

function probidLeaveModal(title, message, stayLabel, leaveLabel, callback) {
  var existing = document.getElementById('probid-leave-modal');
  if (existing) existing.remove();
  _probidLeaveCallback = callback;

  var el = document.createElement('div');
  el.id = 'probid-leave-modal';
  el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(13,27,42,.65);z-index:999999;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
  el.innerHTML =
    '<div style="background:#fff;border-radius:20px;max-width:440px;width:100%;padding:36px 32px;' +
      'box-shadow:0 32px 80px rgba(0,0,0,.3);text-align:center">' +
      '<div style="font-size:44px;margin-bottom:16px">&#9888;</div>' +
      '<div style="font-size:20px;font-weight:800;color:#0d1b2a;margin-bottom:10px">' + title + '</div>' +
      '<div style="font-size:14px;color:#546e7a;margin-bottom:30px;line-height:1.6">' + message + '</div>' +
      '<div style="display:flex;gap:12px">' +
        '<button id="plm-stay" style="flex:1;padding:14px;font-size:14px;font-weight:800;' +
          'background:#1565c0;color:#fff;border:none;border-radius:10px;cursor:pointer">' +
          stayLabel + '</button>' +
        '<button id="plm-leave" style="flex:1;padding:14px;font-size:14px;font-weight:700;' +
          'border:2px solid #e0e0e0;border-radius:10px;background:#fff;color:#546e7a;cursor:pointer">' +
          leaveLabel + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(el);

  // Wire buttons using addEventListener — no inline onclick needed
  document.getElementById('plm-stay').addEventListener('click', function() {
    probidLeaveChoice(false);
  });
  document.getElementById('plm-leave').addEventListener('click', function() {
    probidLeaveChoice(true);
  });
}

function probidLeaveChoice(leave) {
  var modal = document.getElementById('probid-leave-modal');
  if (modal) modal.remove();
  if (_probidLeaveCallback) {
    var cb = _probidLeaveCallback;
    _probidLeaveCallback = null;
    cb(leave);
  }
}

// Install after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', probidInstallBackGuard);
} else {
  probidInstallBackGuard();
}
