
// Safety stubs — functions that may not be defined in all builds
if (typeof seedDemoData === 'undefined')          window.seedDemoData          = function(){};
if (typeof seedCatalogAndTemplates === 'undefined') window.seedCatalogAndTemplates = function(){};

function init() {
  loadDB();
  seedCatalogAndTemplates();
  seedDemoData();
  saveDB();
  equipmentRows = [];
  renderEquipRows();
  updatePermitStatus();
  initPricingModeToggle();  // Wire up the segmented toggle for margin/markup
  clearQQ(true);
  initQQStage3Watchers();
  wrapQQStage3Mutations();
  // Cross-tab safety: when another tab writes the DB to localStorage, reload our
  // in-memory copy so this tab never pushes a stale snapshot — which would resurrect
  // records that the other tab just deleted. Guarded against running mid-sync/push.
  if (!window._crossTabGuard) {
    window._crossTabGuard = true;
    window.addEventListener('storage', function(e){
      if (!e || e.key !== DB_KEY) return;
      if (window._syncInProgress || _pushInProgress) return;
      // Don't clobber an unsaved edit in THIS tab: skip the reload while the user is
      // typing or has unsaved Quick Quote changes. The next pull reconciles anyway.
      var ae = document.activeElement;
      if (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
      if (typeof _qqDirty !== 'undefined' && _qqDirty) return;
      try { loadDB(); } catch(err){}
      try {
        if (typeof renderDash === 'function') renderDash();
        if (typeof renderQuotes === 'function') renderQuotes();
        if (typeof renderWorkOrders === 'function') renderWorkOrders();
      } catch(err){}
    });
  }
  if (qqHasRecoverableDraft()) { try { if (confirm('Recover the last unsaved Quick Quote draft from this browser?')) restoreQQDraft(); else clearQQDraft(); } catch(e){} }
  updateQQStage3UI();
  renderTplLibrary();
  renderDash();
  // Backup safety net: once-a-day local snapshot + refresh the Settings backup panel.
  try { if (typeof _saveDailySnapshot === 'function') _saveDailySnapshot(); } catch(e){}
  try { if (typeof updateBackupInfo === 'function') updateBackupInfo(); } catch(e){}
  loadMarginFloors();
  loadLogoOnStartup();
  initLogoUpload();
  const cb = document.getElementById('company-badge');
  if (cb) cb.textContent = (DB.settings.cname || 'TCSS').substring(0,12);

  // Check mobile mode on load and resize
  checkMobileMode();
  window.addEventListener('resize', checkMobileMode);

  // Capture a magic-link / recovery ARRIVAL synchronously, BEFORE Supabase's
  // detectSessionInUrl consumes and strips the URL hash. Without this the
  // mandatory set-password gate never fires on the invite flow: the client
  // auto-establishes the session and the app loads straight in, bypassing the
  // manual-login path the gate used to hang off of.
  try {
    var _arrHash = String(window.location.hash || '');
    window.__pbAuthArrival  = /access_token=|refresh_token=|type=recovery|type=magiclink|type=invite|type=signup/.test(_arrHash);
    window.__pbAuthRecovery = /type=recovery/.test(_arrHash);
  } catch(e) { window.__pbAuthArrival = false; window.__pbAuthRecovery = false; }

  // Initialize Supabase and check session
  if (initSupabase()) {
    // file:// protocol can't handle Supabase auth redirects
    // Always show login screen and let user sign in manually
    var isLocalFile = window.location.protocol === 'file:';
    if (isLocalFile) {
      // Still try to restore session from localStorage
      _sb.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          if (window.__pbAuthArrival && !window.__pbArrivalHandled) { window.__pbArrivalHandled = true; _handleAuthRedirect(); }
          else { loadCurrentUserProfile().then(function(){ syncAllFromCloud(); restoreClockSession(); }); }
        } else {
          showAuthModal();
        }
      }).catch(function(){ showAuthModal(); });
    } else {
      _sb.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          if (window.__pbAuthArrival && !window.__pbArrivalHandled) { window.__pbArrivalHandled = true; _handleAuthRedirect(); }
          else { loadCurrentUserProfile().then(function(){ syncAllFromCloud(); restoreClockSession(); }); }
        } else {
          showAuthModal();
        }
      });
    }
    _sb.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_OUT') {
        _currentUser = null;
        showAuthModal();
      }
      if (event === 'SIGNED_IN') {
        hideAuthModal();
        // Magic-link / recovery arrival: route through the redirect handler so the
        // mandatory set-password gate can fire before the app loads.
        if (window.__pbAuthArrival && !window.__pbArrivalHandled) {
          window.__pbArrivalHandled = true;
          _handleAuthRedirect();
        }
        // Guard: skip if getSession() already kicked off a sync (avoids double-push race on line items)
        else if (!_currentUser && !window._syncInProgress) {
          loadCurrentUserProfile().then(function() {
            showToast('Welcome back, ' + (_currentUser ? _currentUser.full_name.split(' ')[0] : '') + '!', 'success');
            syncAllFromCloud();
          });
        }
      }
      // Supabase fires a dedicated event for recovery links — treat it as an arrival too.
      if (event === 'PASSWORD_RECOVERY') {
        window.__pbAuthArrival = true; window.__pbAuthRecovery = true;
        if (!window.__pbArrivalHandled) { window.__pbArrivalHandled = true; hideAuthModal(); _handleAuthRedirect(); }
      }
      // TOKEN_REFRESHED — update session silently, no re-sync
      if (event === 'TOKEN_REFRESHED') {
        hideAuthModal();
      }
    });
  } else {
    showToast('Running in offline mode', 'warning', 3000);
  }
}

// =============================================
// V9: SUPABASE CLOUD LAYER
// =============================================

var SUPABASE_URL = 'https://jzvoksidbelxibzbizvi.supabase.co';
var SUPABASE_KEY = 'sb_publishable_4qYpNQoz_RXU29p_pkuI-A_H5-rOXDL';

var _sb = null;        // Supabase client
var _currentUser = null;  // logged-in profile
var _syncPending = false;

function initSupabase() {
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    console.error('Supabase init failed:', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Paginated SELECT — fetch ALL rows past Supabase/PostgREST's 1000-row cap.
// PostgREST returns at most 1000 rows per request unless you page with .range().
// Without this, tables over 1000 rows (e.g. a large customer/contact import)
// load only their first 1000 rows and the rest silently never appear.
// `build` must return a FRESH query builder each call (so .range can be applied
// per page); the builder's own .select/.eq/.order/.is/.in are preserved.
// Returns { data, error } just like a normal select. On a mid-page error it
// returns whatever was gathered so far PLUS the error, so callers that guard on
// `error` (to avoid dropping local rows) keep working.
// ---------------------------------------------------------------------------
async function _sbSelectAll(build) {
  var PAGE = 1000, from = 0, all = [];
  for (;;) {
    var resp = await build().range(from, from + PAGE - 1);
    if (resp.error) { return { data: all, error: resp.error }; }
    var rows = resp.data || [];
    all = all.concat(rows);
    if (rows.length < PAGE) break;   // last (partial) page reached
    from += PAGE;
  }
  return { data: all, error: null };
}

// ---------------------------------------------------------------------------
// PERF windows (load-on-demand): the sync keeps only a recent working set of the
// big imported-history tables in memory; older rows load on demand when a specific
// record is opened. Keeps the browser from holding (and re-compressing) tens of
// thousands of historical rows on every refresh.
// ---------------------------------------------------------------------------
var WO_EXPENSE_WINDOW_DAYS = 365;
var PO_WINDOW_DAYS         = 365;
// A PO is kept in the working set unless its status means DONE. Using a CLOSED-list
// (rather than an open allow-list) is robust to the legacy CRM-import status strings
// ("Open", "All Received -- Open", "Partially Back Ordered", …) as well as the app's
// native statuses — anything not closed stays in memory regardless of age.
var PO_CLOSED_STATUSES = '("Completed","Received","Matched","Void","Cancelled","Declined","Closed")';
var _ondemandExpWOIds = {};   // wo ids whose full expense set we've already fetched
var _ondemandPOIds    = {};   // po ids fetched on demand (preserve across bounded syncs)

// Ensure ALL expenses for one work order are in DB.woExpenses (older ones may be
// outside the sync window). Safe to call repeatedly; fetches each wo once per session.
async function ensureWOExpensesLoaded(woId){
  if (!woId || !_sb) return;
  if (_ondemandExpWOIds[woId]) return;
  try {
    var r = await _sb.from('wo_expenses').select('*').eq('wo_id', woId);
    if (r && !r.error && Array.isArray(r.data)) {
      if (!DB.woExpenses) DB.woExpenses = [];
      var have = {}; DB.woExpenses.forEach(function(e){ if(e&&e.id) have[e.id]=1; });
      var delWE = (DB.deletedIds && DB.deletedIds.woExpenses) || [];
      r.data.forEach(function(e){
        if (have[e.id] || delWE.indexOf(String(e.id))>=0) return;
        DB.woExpenses.push({ id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount, paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by, receiptUrl:e.receipt_url, receiptDocId:e.receipt_doc_id, createdAt:e.created_at });
      });
      _ondemandExpWOIds[woId] = 1;
    }
  } catch(e) { /* leave as-is on failure */ }
}

// Ensure expenses for a set of work orders are loaded (used by the vehicle profile so
// its cost rollup is exact). One query, chunked to keep the URL sane.
async function ensureWOExpensesForIds(ids){
  if (!_sb || !ids || !ids.length) return;
  var pending = ids.filter(function(id){ return id && !_ondemandExpWOIds[id]; });
  if (!pending.length) return;
  if (!DB.woExpenses) DB.woExpenses = [];
  var delWE = (DB.deletedIds && DB.deletedIds.woExpenses) || [];
  for (var i=0; i<pending.length; i+=150) {
    var chunk = pending.slice(i, i+150);
    try {
      var r = await _sb.from('wo_expenses').select('*').in('wo_id', chunk);
      if (r && !r.error && Array.isArray(r.data)) {
        var have = {}; DB.woExpenses.forEach(function(e){ if(e&&e.id) have[e.id]=1; });
        r.data.forEach(function(e){
          if (have[e.id] || delWE.indexOf(String(e.id))>=0) return;
          DB.woExpenses.push({ id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount, paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by, receiptUrl:e.receipt_url, receiptDocId:e.receipt_doc_id, createdAt:e.created_at });
        });
      }
    } catch(e) { /* skip chunk on failure */ }
    chunk.forEach(function(id){ _ondemandExpWOIds[id]=1; });
  }
}

// On-demand loaders for a set of work orders' parts and labor — used by the vehicle
// profile so its Parts/Expenses/Labor cost rollup is exact even for WOs outside the
// normal sync window. Mirror ensureWOExpensesForIds exactly.
var _ondemandPartWOIds = {};
var _ondemandLaborWOIds = {};
async function ensureWOPartsForIds(ids){
  if (!_sb || !ids || !ids.length) return;
  var pending = ids.filter(function(id){ return id && !_ondemandPartWOIds[id]; });
  if (!pending.length) return;
  if (!DB.woParts) DB.woParts = [];
  var delWP = (DB.deletedIds && DB.deletedIds.woParts) || [];
  for (var i=0; i<pending.length; i+=150) {
    var chunk = pending.slice(i, i+150);
    try {
      var r = await _sb.from('wo_parts').select('*').in('wo_id', chunk);
      if (r && !r.error && Array.isArray(r.data)) {
        var have = {}; DB.woParts.forEach(function(p){ if(p&&p.id) have[p.id]=1; });
        r.data.forEach(function(p){
          if (have[p.id] || delWP.indexOf(String(p.id))>=0) return;
          DB.woParts.push({ id:p.id, woId:p.wo_id, name:p.part_name, partNum:p.part_num, qty:p.quantity, unit:p.unit, unitCost:p.unit_cost, status:p.status, notes:p.notes, requestedBy:p.requested_by, createdAt:p.created_at });
        });
      }
    } catch(e) { /* skip chunk on failure */ }
    chunk.forEach(function(id){ _ondemandPartWOIds[id]=1; });
  }
}
async function ensureWOLaborForIds(ids){
  if (!_sb || !ids || !ids.length) return;
  var pending = ids.filter(function(id){ return id && !_ondemandLaborWOIds[id]; });
  if (!pending.length) return;
  if (!DB.woLabor) DB.woLabor = [];
  var delWL = (DB.deletedIds && DB.deletedIds.woLabor) || [];
  for (var i=0; i<pending.length; i+=150) {
    var chunk = pending.slice(i, i+150);
    try {
      var r = await _sb.from('wo_labor').select('*').in('wo_id', chunk);
      if (r && !r.error && Array.isArray(r.data)) {
        var have = {}; DB.woLabor.forEach(function(l){ if(l&&l.id) have[l.id]=1; });
        r.data.forEach(function(l){
          if (have[l.id] || delWL.indexOf(String(l.id))>=0) return;
          DB.woLabor.push({ id:l.id, woId:l.wo_id, techName:l.tech_name, techId:l.tech_id, entryType:l.entry_type, clockIn:l.clock_in, clockOut:l.clock_out, hours:l.hours, rate:l.rate, notes:l.notes, createdAt:l.created_at });
        });
      }
    } catch(e) { /* skip chunk on failure */ }
    chunk.forEach(function(id){ _ondemandLaborWOIds[id]=1; });
  }
}

// Single source of truth for mapping a purchase_orders row (+ nested po_line_items) to the
// app's PO shape. Used by both the bounded sync pull and the on-demand loader so they can
// never drift apart.
function _mapPORow(p){
  return {
    id:p.id, poNumber:p.po_number, vendorId:p.vendor_id, vendorName:p.vendor_name,
    jobId:p.job_id, woId:p.wo_id, status:p.status, date:p.created_at?p.created_at.split('T')[0]:'',
    dateNeeded:p.date_needed, shipName:p.ship_to_name, shipAddr:p.ship_to_address,
    shipCity:p.ship_to_city, shipState:p.ship_to_state, shipZip:p.ship_to_zip,
    subtotal:p.subtotal, total:p.total, notes:p.notes,
    vendorInvNum:p.vendor_invoice_num, vendorInvAmt:p.vendor_invoice_amount,
    readyToPay:!!p.ready_to_pay, createdBy:p.created_by, createdByName:p.created_by_name,
    createdAt:p.created_at, updatedAt:p.updated_at,
    items:(p.po_line_items||[]).sort(function(a,b){return (a.sort_order||0)-(b.sort_order||0);}).map(function(li){
      return { id:li.id, desc:li.description, partNum:li.part_num, qtyOrdered:li.qty_ordered, qtyReceived:li.qty_received, unitCost:li.unit_cost };
    })
  };
}

// Ensure a purchase order (with its line items) is in DB.purchaseOrders. Older/closed POs
// fall outside the bounded sync; this pulls one on demand when opened/received/printed.
async function ensurePOLoaded(poId){
  if (!poId || !_sb) return null;
  var existing = (DB.purchaseOrders||[]).find(function(p){ return p.id===poId; });
  if (existing) return existing;
  try {
    var r = await _sb.from('purchase_orders').select('*, po_line_items(*)').eq('id', poId).limit(1);
    if (r && !r.error && r.data && r.data[0]) {
      var po = _mapPORow(r.data[0]);
      po._synced = true;
      if (!DB.purchaseOrders) DB.purchaseOrders = [];
      DB.purchaseOrders.unshift(po);
      _ondemandPOIds[po.id] = 1;   // preserve across the next bounded sync
      return po;
    }
  } catch(e) { /* fall through */ }
  return null;
}

// ---------------------------------------------------------------------------
// On-demand invoice fetch (Phase-2 load-on-demand). The sync keeps only a bounded
// working set of invoices in memory; these fetch older/historical ones straight from
// the cloud when a screen needs them, so the browser never has to hold them all.
// ---------------------------------------------------------------------------
async function fetchInvoicesCloud(opts){
  opts = opts || {};
  if (!_sb) return { data: [], error: 'offline' };
  try {
    var q = _sb.from('app_invoices').select('*');
    if (opts.customerId) q = q.eq('data->>customerId', opts.customerId);
    if (opts.customerName) q = q.eq('customer_name', opts.customerName);
    if (opts.search) {
      var s = String(opts.search).replace(/[%,]/g,' ').trim();
      if (s) q = q.or('num.ilike.%'+s+'%,customer_name.ilike.%'+s+'%');
    }
    q = q.order('invoice_date',{ascending:false,nullsFirst:false}).range(opts.offset||0, (opts.offset||0)+(opts.limit||200)-1);
    var r = await q;
    if (r.error) return { data: [], error: r.error };
    var del = (DB.deletedIds && DB.deletedIds.invoices) || [];
    var rows = (r.data||[]).filter(function(x){ return del.indexOf(x.id)===-1; }).map(function(x){ var d=x.data||{}; d._synced=true; return d; });
    return { data: rows, error: null };
  } catch(e){ return { data: [], error: e.message||e }; }
}
// Per-customer invoice count rollup for the customers LIST card bubble. Invoices are
// load-on-demand (not all in memory), so we fetch one lightweight grouped count from the
// cloud (one row per customer), cache it on DB.invoiceRollup, and let renderCustomers use it.
var _invRollupLoaded = false, _invRollupBusy = false;
function _ensureInvoiceRollup(force){
  if (force) { _invRollupLoaded = false; }
  if (_invRollupLoaded || _invRollupBusy) return;
  if (typeof _sb === 'undefined' || !_sb) return;
  _invRollupBusy = true;
  _sb.rpc('customer_invoice_rollup').then(function(rr){
    _invRollupBusy = false;
    if (rr && !rr.error && Array.isArray(rr.data)) {
      var m = {};
      rr.data.forEach(function(x){ if(x && x.customer_id) m[x.customer_id] = { cnt:+x.cnt||0, open:+x.open_cnt||0 }; });
      DB.invoiceRollup = m; _invRollupLoaded = true;
      if (typeof renderCustomers === 'function' && document.getElementById('cust-tbl')) {
        try { renderCustomers(); } catch(e){}
      }
    }
  }).catch(function(){ _invRollupBusy = false; });
}
// Per-customer work-order count rollup for the customers LIST card bubble (work orders are
// load-on-demand). One lightweight grouped count, cached on DB.woRollup.
var _woRollupLoaded = false, _woRollupBusy = false;
function _ensureWORollup(force){
  if (force) { _woRollupLoaded = false; }
  if (_woRollupLoaded || _woRollupBusy) return;
  if (typeof _sb === 'undefined' || !_sb) return;
  _woRollupBusy = true;
  _sb.rpc('customer_wo_rollup').then(function(rr){
    _woRollupBusy = false;
    if (rr && !rr.error && Array.isArray(rr.data)) {
      var m = {};
      rr.data.forEach(function(x){ if(x && x.customer_id) m[x.customer_id] = { cnt:+x.cnt||0 }; });
      DB.woRollup = m; _woRollupLoaded = true;
      if (typeof renderCustomers === 'function' && document.getElementById('cust-tbl')) {
        try { renderCustomers(); } catch(e){}
      }
    }
  }).catch(function(){ _woRollupBusy = false; });
}
async function fetchInvoiceById(id){
  var local = (DB.invoices||[]).find(function(i){ return i.id===id; });
  if (local) return local;
  if (!_sb) return null;
  try {
    var r = await _sb.from('app_invoices').select('*').eq('id', id).limit(1);
    if (r.error || !r.data || !r.data.length) return null;
    var d = r.data[0].data || {}; d._synced=true;
    // cache into memory so downstream reprint/print/pay lookups by id succeed
    if (d.id && !(DB.invoices||[]).some(function(i){return i.id===d.id;})) { (DB.invoices=DB.invoices||[]).push(d); }
    return d;
  } catch(e){ return null; }
}

// Map a work_orders DB row -> the in-memory WO object shape. Shared by the sync pull
// and the on-demand fetchers so all three stay identical.
function _mapWORow(w){
  return { id:w.id, woNumber:w.wo_number, customerId:w.customer_id, customerName:w.customer_name, vehicleId:w.vehicle_id||null, contactId:w.contact_id, description:w.description, workPerformed:w.work_performed, status:w.status, serviceType:w.service_type, priority:w.priority, serviceRep:w.service_rep, refNum:w.reference_num, siteAddr:w.site_address, siteCity:w.site_city, siteState:w.site_state, siteZip:w.site_zip, laborRate:w.labor_rate, taxRate:w.tax_rate, dateRequested:w.date_requested, dateFollowup:w.date_followup, dateOpened:w.date_opened, dateClosed:w.date_closed, internalNotes:w.internal_notes, invoiceId:w.invoice_id, jobId:w.job_id, quoteId:w.quote_id, assignedTechs:w.assigned_techs||[], scheduledDate:w.scheduled_date||'', scheduledTime:w.scheduled_time||'', wtProjectId:w.wt_project_id||null, parentWoId:w.parent_wo_id||null, isChangeOrder:w.is_change_order||false, changeOrderReason:w.change_order_reason||null, createdBy:w.created_by, createdByName:w.created_by_name, createdAt:w.created_at, updatedAt:w.updated_at };
}

// On-demand work-order fetch (Phase-2 load-on-demand). The sync keeps only a bounded
// working set of work orders in memory; these fetch older/closed ones from the cloud when
// a screen needs them (WO-list search, customer profile) so the browser never holds all.
async function fetchWorkOrdersCloud(opts){
  opts = opts || {};
  if (!_sb) return { data: [], error: 'offline' };
  try {
    var q = _sb.from('work_orders').select('*');
    if (opts.customerId) q = q.eq('customer_id', opts.customerId);
    if (opts.vehicleId) q = q.eq('vehicle_id', opts.vehicleId);
    if (opts.search) {
      var s = String(opts.search).replace(/[%,]/g,' ').trim();
      if (s) q = q.or('wo_number.ilike.%'+s+'%,customer_name.ilike.%'+s+'%,description.ilike.%'+s+'%,site_address.ilike.%'+s+'%,site_city.ilike.%'+s+'%');
    }
    q = q.order('created_at',{ascending:false}).range(opts.offset||0, (opts.offset||0)+(opts.limit||300)-1);
    var r = await q;
    if (r.error) return { data: [], error: r.error };
    var del = (DB.deletedIds && DB.deletedIds.workOrders) || [];
    var rows = (r.data||[]).filter(function(x){ return del.indexOf(x.id)===-1; }).map(function(x){ var w=_mapWORow(x); w._synced=true; return w; });
    return { data: rows, error: null };
  } catch(e){ return { data: [], error: e.message||e }; }
}
async function fetchWorkOrderById(id){
  var local = (DB.workOrders||[]).find(function(w){ return w.id===id; });
  if (local) return local;
  if (!_sb) return null;
  try {
    var r = await _sb.from('work_orders').select('*').eq('id', id).limit(1);
    if (r.error || !r.data || !r.data.length) return null;
    var w = _mapWORow(r.data[0]); w._synced=true;
    if (w.id && !(DB.workOrders||[]).some(function(x){return x.id===w.id;})) { (DB.workOrders=DB.workOrders||[]).push(w); }
    return w;
  } catch(e){ return null; }
}

// Map a time_entries DB row -> in-memory shape. Shared by the sync pull and on-demand
// fetchers. (Delete-tombstone from DB.deletedIds is applied by the caller.)
function _mapTimeRow(t){
  return {
    id: t.id,
    techName: t.tech_name || null, date: t.entry_date || null,
    entryType: t.entry_type || 'regular',
    startTime: t.start_time || null, endTime: t.end_time || null,
    totalHours: t.total_hours, totalMins: t.total_mins,
    isPaid: t.is_paid, woId: t.wo_id || null, jobId: t.job_id || null,
    woLabel: t.wo_label || null, notes: t.notes, gpsReason: t.gps_reason || null,
    isManual: !!t.is_manual, addedBy: t.added_by || null, addedAt: t.added_at || null,
    lastEditedBy: t.last_edited_by || null, lastEditedAt: t.last_edited_at || null,
    auditTrail: Array.isArray(t.audit_trail) ? t.audit_trail : (function(){ try { return JSON.parse(t.audit_trail||'[]'); } catch(e){ return []; } })(),
    deleted: (t.deleted === true),
    deletedBy: t.deleted_by || null, deletedAt: t.deleted_at || null,
    userId: t.user_id, teamMemberId: t.team_member_id,
    clockIn: t.clock_in, clockOut: t.clock_out, breakMinutes: t.break_minutes||0,
    gpsLat: t.gps_lat, gpsLng: t.gps_lng,
    isApproved: !!t.is_approved, approvedBy: t.approved_by,
    createdAt: t.created_at
  };
}
// On-demand time-entry fetch (bounded working set keeps only recent+unsettled). These pull
// older/settled entries from the cloud for reports/timesheet history.
async function fetchTimeEntriesCloud(opts){
  opts = opts || {};
  if (!_sb) return { data: [], error: 'offline' };
  try {
    var q = _sb.from('time_entries').select('*');
    if (opts.techName) q = q.eq('tech_name', opts.techName);
    if (opts.woId)     q = q.eq('wo_id', opts.woId);
    if (opts.dateFrom) q = q.gte('entry_date', opts.dateFrom);
    if (opts.dateTo)   q = q.lte('entry_date', opts.dateTo);
    q = q.order('entry_date',{ascending:false}).range(opts.offset||0, (opts.offset||0)+(opts.limit||1000)-1);
    var r = await q;
    if (r.error) return { data: [], error: r.error };
    var del = (DB.deletedIds && DB.deletedIds.timeEntries) || [];
    var rows = (r.data||[]).filter(function(x){ return del.indexOf(String(x.id))<0; }).map(function(x){ var m=_mapTimeRow(x); m._synced=true; return m; });
    return { data: rows, error: null };
  } catch(e){ return { data: [], error: e.message||e }; }
}
async function fetchTimeEntryById(id){
  var local = (DB.timeEntries||[]).find(function(t){ return t.id===id; });
  if (local) return local;
  if (!_sb) return null;
  try {
    var r = await _sb.from('time_entries').select('*').eq('id', id).limit(1);
    if (r.error || !r.data || !r.data.length) return null;
    var m = _mapTimeRow(r.data[0]); m._synced=true;
    if (m.id && !(DB.timeEntries||[]).some(function(t){return t.id===m.id;})) { (DB.timeEntries=DB.timeEntries||[]).push(m); }
    return m;
  } catch(e){ return null; }
}

// ---------------------------------------------------------------------------
// Server-authoritative business-number allocation (migration _17).
// Every human-facing sequence number (Q-, J-, WO-, PO-, INV-) is allocated by
// the atomic next_number() RPC, so two devices can never mint the same number.
// `localFloor` is the highest number this device currently knows about for the
// sequence; the server never issues at or below it, so numbering only moves
// FORWARD even if this device is behind on sync. Offline / not-signed-in falls
// back to a self-healing local increment (best-effort — a rare offline number
// is reconciled the next time the server allocates above the local floor).
// Always returns a Promise<number>. Callers format the prefix/padding.
// ---------------------------------------------------------------------------
async function allocNumber(seqName, localFloor) {
  var floor = parseInt(localFloor, 10); if (!(floor >= 0)) floor = 0;
  try {
    if (_sb && _currentUser) {
      var res = await _sb.rpc('next_number', { p_seq: seqName, p_floor: floor });
      if (res && !res.error && res.data != null) {
        var n = parseInt(res.data, 10);
        if (n > 0) {
          DB._seqCache = DB._seqCache || {};
          DB._seqCache[seqName] = n;   // remember last server value for offline fallback
          return n;
        }
      }
      if (res && res.error) console.warn('[allocNumber] RPC error for', seqName, res.error.message);
    }
  } catch (e) {
    console.warn('[allocNumber] falling back to local for', seqName, e && e.message);
  }
  // Offline / not-signed-in fallback: self-healing local increment.
  DB._seqCache = DB._seqCache || {};
  var base = Math.max(DB._seqCache[seqName] || 0, floor);
  DB._seqCache[seqName] = base + 1;
  return base + 1;
}

// Max integer embedded in a business-number field across a set of rows, using
// the entity's own prefix regex — the "floor" passed to allocNumber so the
// server sequence can never dip below a number already present locally.
function _maxNum(arr, getStr, re) {
  var mx = 0;
  (arr || []).forEach(function (o) {
    try {
      var m = re.exec(String((getStr(o)) || ''));
      if (m && m[1]) { var n = parseInt(m[1], 10); if (n > mx) mx = n; }
    } catch (e) {}
  });
  return mx;
}

// ---- AUTH — Email + Password ----
async function signIn(email, password) {
  if (!_sb) return { error: { message: 'Not connected' } };
  var result = await _sb.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });
  if (!result.error) {
    await loadCurrentUserProfile();
    hideAuthModal();
    showToast('Welcome back, ' + (_currentUser ? _currentUser.full_name.split(' ')[0] : '') + '!', 'success');
    if (localStorage.getItem('_skipNextPull') === '1') {
      localStorage.removeItem('_skipNextPull');
      showToast('Import complete ✓', 'success', 3000);
    } else {
      syncAllFromCloud();
    }
    startClockInReminder();
    checkYearEndForfeiture();
    setTimeout(flushOfflineQueue, 2000);
    // Check for unfinished quote draft after login
    setTimeout(_checkQQDraftOnLogin, 2500);
    setTimeout(function initPhase2() {
      // Phase 2 init — runs 500ms after login
      // Re-enforce role permissions after all syncs have settled
      if (_currentUser) applyRolePermissions(_currentUser.role);
      // Start location morning detection for field techs
      if (typeof startMorningDetection === 'function') startMorningDetection();
      // Restore clock session if tech was previously clocked in
      if (typeof restoreClockSession === 'function') restoreClockSession();
      // Render correct dashboard based on role
      if (_currentUser && _currentUser.role === 'helper_tech') {
        if (typeof wtRenderTechDashboard === 'function') wtRenderTechDashboard();
      } else if (typeof renderDash === 'function') {
        renderDash();
      }
      if (_currentUser) applyRolePermissions(_currentUser.role);
      // Run self-test to catch permission issues early
      setTimeout(function(){
        if (_currentUser) runPermissionsSelfTest(_currentUser.role);
      }, 1000);
    }, 500);
    setTimeout(initPhase3, 800);
    startSessionTimeout();
    startAutoSync();
  }
  return result;
}

async function signOut() {
  stopAutoSync();
  clearTimeout(_sessionTimer);
  // Fire push in background but don't wait — reload immediately
  if (_sb) {
    try { pushAllToCloud(); } catch(e) {}
    try { await _sb.auth.signOut(); } catch(e) {}
  }
  window.location.reload();
}

function updateUserBadge(profile) {
  if (!profile) return;
  // Update topbar badge circle
  var badge = document.getElementById('user-badge');
  if (badge) {
    var initials = (profile.full_name||'?').split(' ').map(function(w){ return w[0]||''; }).slice(0,2).join('').toUpperCase();
    badge.textContent = initials || '?';
    var roleColors = {owner:'#1565c0',manager:'#2e7d32',back_office:'#e65100',lead_tech:'#6a1b9a',helper_tech:'#546e7a'};
    badge.style.background = roleColors[profile.role] || '#546e7a';
  }
  // Update topbar name
  var nameBadge = document.getElementById('user-name-badge');
  if (nameBadge) nameBadge.textContent = (profile.full_name||'').split(' ')[0];
  // Update user menu
  var menuName = document.getElementById('user-menu-name');
  var menuRole = document.getElementById('user-menu-role');
  if (menuName) menuName.textContent = profile.full_name || '';
  var roleLabels = {owner:'Owner',manager:'Manager',back_office:'Back Office',lead_tech:'Lead Technician',helper_tech:'Field Technician'};
  if (menuRole) menuRole.textContent = roleLabels[profile.role] || profile.role || '';
}

async function loadCurrentUserProfile() {
  if (!_sb) { console.warn('[Profile] No Supabase client'); return; }
  var session = await _sb.auth.getSession();
  if (!session.data.session) { console.warn('[Profile] No session'); return; }
  var uid = session.data.session.user.id;
  var email = session.data.session.user.email;
  console.log('[Profile] Loading for uid:', uid, 'email:', email);
  var res = await _sb.from('profiles').select('*').eq('id', uid).single();
  console.log('[Profile] Result:', res);
  if (res.data && res.data.is_active === false) {
    // AZ-6 onboarding: a pending (or deactivated) account has NO access — the database
    // denies it everywhere (current_app_role() is null for inactive users). Show a clear
    // blocking screen instead of a half-working UI, and don't establish a session identity.
    _currentUser = null;
    _showPendingApprovalScreen(res.data.full_name || email);
    return;
  }
  if (res.data) {
    _currentUser = res.data;
    // Legacy role alias: office staff were seeded with role 'office', but the permission
    // matrix + role gates standardized on 'back_office'. Without this, an 'office' user
    // fails every hasPermission() check and is locked out of their own job. Normalize to
    // the canonical role so all permission checks resolve correctly.
    if (_currentUser.role === 'office') _currentUser.role = 'back_office';
    applyRolePermissions(_currentUser.role);
    updateUserBadge(_currentUser);
    // If this boot arrived with a deep-link hash (#/invoices), land on that page
    // instead of the default. No-op when there is no explicit valid hash.
    if (typeof _applyBootRoute === 'function') setTimeout(_applyBootRoute, 0);
    // Load this user's personal menu prefs (favorites / hide / collapse) from the
    // cloud, then apply them over the role menu. Safe if it fails (menu just shows
    // the role default).
    if (typeof loadUiPrefs === 'function') loadUiPrefs();
    console.log('[Profile] Loaded:', _currentUser.full_name, _currentUser.role);
    // Re-apply after page renders
    setTimeout(function(){ applyRolePermissions(_currentUser.role); }, 300);
    setTimeout(function(){ applyRolePermissions(_currentUser.role); }, 1000);
    // Load WT notifications for this user
    setTimeout(function(){ if(typeof wtLoadNotifications==='function') wtLoadNotifications(); }, 1500);
    setTimeout(function(){ if(typeof _startNotificationChecks==='function') _startNotificationChecks(); }, 4000);
    setTimeout(function(){ if(typeof _maybeShowBackOfficeWelcome==='function') _maybeShowBackOfficeWelcome(); }, 1800);
    // Live permission refresh: pick up role / access changes made by an admin in
    // another session WITHOUT requiring this user to reload (see startPermRefresh).
    if (typeof startPermRefresh === 'function') startPermRefresh();
  } else {
    console.warn('[Profile] No profile row found. Error:', res.error);
    // Fallback: create a minimal currentUser from the auth session
    // so the app doesn't completely break
    // No profile found — use safe fallback with limited permissions
    _currentUser = {
      id: uid,
      full_name: email.split('@')[0],
      role: 'helper_tech',
      email: email
    };
    applyRolePermissions(_currentUser.role);
    updateUserBadge(_currentUser);
    showToast('Profile not found for ' + email + ' — contact your administrator.', 'error', 8000);
  }
}

// AZ-6: blocking screen for a pending/deactivated account (is_active=false).
function _showPendingApprovalScreen(name) {
  var ov = document.getElementById('pending-approval-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pending-approval-overlay'; document.body.appendChild(ov); }
  var first = ((name||'').split(' ')[0]) || 'there';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2000000;background:#0d1b2a;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:system-ui,Arial,sans-serif';
  ov.innerHTML =
    '<div style="max-width:460px">'+
      '<div style="font-size:48px;margin-bottom:12px">⏳</div>'+
      '<h2 style="margin:0 0 10px;font-size:22px">Account Pending Approval</h2>'+
      '<p style="font-size:15px;line-height:1.6;color:#cfd8e3">Hi '+escHtml(first)+' — your login works, but an administrator still needs to activate your account and set your access before you can use ProBid.</p>'+
      '<p style="font-size:13px;color:#90a4ae;margin-top:16px">Please contact your administrator. Once you’re approved, refresh this page.</p>'+
      '<div style="margin-top:18px">'+
        '<button onclick="location.reload()" style="background:#1565c0;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer">↻ Refresh</button> '+
        '<button onclick="(async function(){try{await _sb.auth.signOut();}catch(e){}location.reload();})()" style="background:none;border:1px solid #456;color:#cfd8e3;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer">Sign out</button>'+
      '</div>'+
    '</div>';
}

// One-time friendly welcome for office (back_office) staff on their first login.
// Keeps the very first minute from being a blank-app stare: warm greeting, a few
// concrete things to try, and where to leave impressions. Shows once per user.
function _maybeShowBackOfficeWelcome() {
  try {
    if (!_currentUser || _currentUser.role !== 'back_office') return;
    var key = 'probid_welcome_seen_' + _currentUser.id;
    try { if (localStorage.getItem(key)) return; } catch(e) {}
    var first = ((_currentUser.full_name||'').split(' ')[0]) || 'there';
    var ov = document.getElementById('bo-welcome-overlay');
    if (!ov) { ov = document.createElement('div'); ov.id = 'bo-welcome-overlay'; document.body.appendChild(ov); }
    ov.style.cssText = 'position:fixed;inset:0;z-index:1900000;background:rgba(13,27,42,.55);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,Arial,sans-serif';
    ov.innerHTML =
      '<div style="max-width:520px;background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden">'+
        '<div style="background:#1565c0;color:#fff;padding:20px 24px">'+
          '<div style="font-size:22px;font-weight:800;margin-bottom:2px">Welcome to ProBid, '+escHtml(first)+'! 👋</div>'+
          '<div style="font-size:13px;opacity:.9">You\'re one of the first to take it for a spin — thank you.</div>'+
        '</div>'+
        '<div style="padding:22px 24px;color:#37474f;font-size:14px;line-height:1.6">'+
          '<div style="font-weight:700;margin-bottom:8px">A few things worth trying first:</div>'+
          '<ul style="margin:0 0 14px;padding-left:20px">'+
            '<li>Open <strong>Work Orders</strong> and look through a real job.</li>'+
            '<li>Browse <strong>Customers</strong> &amp; <strong>Contacts</strong> — search for one you know.</li>'+
            '<li>Peek at <strong>Invoices</strong> and the <strong>Reports</strong> page.</li>'+
            '<li>Try building a <strong>Quote</strong> (a manager sends it out — you draft it).</li>'+
          '</ul>'+
          '<div style="background:#f0f4f8;border-radius:8px;padding:12px 14px;font-size:13px">'+
            '💬 <strong>Your impressions matter most.</strong> Jot down anything confusing, missing, '+
            'or clunky as you go, and pass it to Joe — that\'s exactly what this first look is for.</div>'+
        '</div>'+
        '<div style="padding:0 24px 22px;text-align:right">'+
          '<button id="bo-welcome-close" style="background:#1565c0;color:#fff;border:none;border-radius:8px;padding:11px 22px;font-size:14px;font-weight:700;cursor:pointer">Let’s go →</button>'+
        '</div>'+
      '</div>';
    var close = function(){ try { localStorage.setItem(key,'1'); } catch(e){} if (ov && ov.parentNode) ov.parentNode.removeChild(ov); };
    var btn = document.getElementById('bo-welcome-close'); if (btn) btn.onclick = close;
    ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  } catch(e) { /* never block login on the welcome */ }
}

// ── Role permission system ───────────────────────────────────────────────────
// enforceNavPermissions() is called from goPage() on every navigation.
// That is the single enforcement point. No timers, no observers, no CSS tricks.

// AZ-3: who may DELETE a top-level office record (work order, PO, contract,
// managed-service contract). Same office/management set as payments. This is the
// client layer for UX + defense in depth; migration _12 enforces it at the DB so
// it holds even if _currentUser is tampered with in the console.
function _canDeleteOfficeRecords() {
  return !!(typeof _currentUser !== 'undefined' && _currentUser &&
            ['owner','manager','back_office'].indexOf(_currentUser.role) >= 0);
}

var _activeRole = null;

function applyRolePermissions(role) {
  _activeRole = role || 'helper_tech';
  // Hide + New Quote button for field techs
  var newQuoteBtns = document.querySelectorAll('[data-action="newQuote"], #topbar-new-quote-btn');
  newQuoteBtns.forEach(function(btn){
    btn.style.display = (role === 'helper_tech') ? 'none' : '';
  });

  // Mobile nav switching
  var isTech = (_activeRole === 'helper_tech');
  document.querySelectorAll('.mob-role-default').forEach(function(el){
    el.style.display = isTech ? 'none' : '';
  });
  document.querySelectorAll('.mob-role-tech').forEach(function(el){
    el.style.display = isTech ? '' : 'none';
  });
  // Enforce immediately on login
  enforceNavPermissions();
  if (role === 'owner') setTimeout(renderPermissionsEditor, 200);
}

function enforceNavPermissions() {
  var role = _activeRole || (_currentUser ? _currentUser.role : null);
  if (!role) return;

  // Get page visibility from permissions matrix
  var perms = {};
  if (role === 'owner') {
    // Owner sees everything — skip all hiding
    document.querySelectorAll('.nav-item[data-page]').forEach(function(el){
      el.style.removeProperty('display');
    });
    document.querySelectorAll('.nav-group').forEach(function(g){
      g.style.removeProperty('display');
    });
    if (typeof initMenuChrome === 'function') initMenuChrome();
    if (typeof applyUserMenuPrefs === 'function') applyUserMenuPrefs();
    return;
  }

  if (typeof getPermMatrix === 'function') {
    var matrix = getPermMatrix();
    var pageMap = {
      'qq':'page.qq','quotes':'page.quotes','jobs':'page.jobs',
      'dispatch':'page.dispatch','invoices':'page.invoices',
      'workorders':'page.workorders','purchaseorders':'page.purchaseorders',
      'vendors':'page.vendors','customers':'page.customers','vehicles':'page.vehicles',
      'contacts':'page.contacts','team':'page.team','catalog':'page.catalog',
      'templates':'page.templates','reports':'page.reports','auditlog':'page.auditlog',
      'calendar':'page.calendar','inventory':'page.inventory','scanner':'page.scanner',
      'tools':'page.tools','field':'page.timeclock','timesheet':'page.timesheet',
      'worktracking':'page.worktracking','settings':'page.settings','contracts':'page.contracts','recurring':'page.recurring'
    };
    Object.keys(pageMap).forEach(function(page){
      var key = pageMap[page];
      perms[page] = matrix[key] ? !!matrix[key][role] : false;
    });
  } else {
    // Fallback defaults if matrix not available yet
    var techPages = ['workorders','worktracking','field','tools','calendar','dash'];
    document.querySelectorAll('.nav-item[data-page]').forEach(function(el){
      var page = el.getAttribute('data-page');
      perms[page] = techPages.indexOf(page) >= 0;
    });
  }


  // Apply visibility
  document.querySelectorAll('.nav-item[data-page]').forEach(function(el){
    var page = el.getAttribute('data-page');
    if (page === 'dash') { el.style.removeProperty('display'); return; }
    var visible = perms[page] === true;
    if (visible) {
      el.style.removeProperty('display');
    } else {
      el.style.setProperty('display','none','important');
    }
  });

  // Hide section headers when all their items are hidden
  document.querySelectorAll('.nav-group').forEach(function(group){
    var items = group.querySelectorAll('.nav-item[data-page]');
    var anyVisible = false;
    items.forEach(function(item){
      if (item.style.display !== 'none') anyVisible = true;
    });
    group.style.display = anyVisible ? '' : 'none';
  });

  // Rate column
  document.querySelectorAll('.team-rate-col').forEach(function(el){
    el.style.setProperty('display', role==='owner'?'':'none','important');
  });
  // Also set body class as CSS backup
  document.body.classList.remove('role-helper-tech','role-lead-tech','role-back-office','role-manager','role-owner');
  var cls = {'helper_tech':'role-helper-tech','lead_tech':'role-lead-tech',
    'back_office':'role-back-office','manager':'role-manager','owner':'role-owner'}[role];
  if (cls) document.body.classList.add(cls);

  // Overlay the user's personal menu prefs (favorites / hide / collapse) on top
  // of the role visibility just computed above.
  if (typeof initMenuChrome === 'function') initMenuChrome();
  if (typeof applyUserMenuPrefs === 'function') applyUserMenuPrefs();
}


// ── Permission system self-test ───────────────────────────────────────────────
// Runs automatically after login in dev mode — logs results to console
function runPermissionsSelfTest(role) {
  if (!role) return;
  var results = { pass: 0, fail: 0, issues: [] };

  // Test 1: getPermMatrix is available
  if (typeof getPermMatrix !== 'function') {
    results.issues.push('FAIL: getPermMatrix not available');
    results.fail++;
  } else {
    results.pass++;
  }

  // Test 2: matrix has page.* keys
  var matrix = typeof getPermMatrix === 'function' ? getPermMatrix() : {};
  var pageKeys = Object.keys(matrix).filter(function(k){ return k.indexOf('page.') === 0; });
  if (pageKeys.length < 10) {
    results.issues.push('FAIL: Only '+pageKeys.length+' page permission keys found (expected 23)');
    results.fail++;
  } else {
    results.pass++;
  }

  // Test 3: nav items have data-page attribute
  var navItems = document.querySelectorAll('.nav-item[data-page]');
  if (navItems.length < 5) {
    results.issues.push('FAIL: Only '+navItems.length+' nav items found');
    results.fail++;
  } else {
    results.pass++;
  }

  // Test 4: body has role class
  var hasRoleClass = document.body.className.indexOf('role-') >= 0;
  if (!hasRoleClass) {
    results.issues.push('FAIL: No role class on body — permissions may not apply');
    results.fail++;
  } else {
    results.pass++;
  }

  // Test 5: for helper_tech — verify pages that should be hidden ARE hidden
  if (role === 'helper_tech') {
    var shouldBeHidden = ['qq','quotes','customers','catalog','reports','dispatch','jobs'];
    shouldBeHidden.forEach(function(page) {
      var el = document.querySelector('.nav-item[data-page="'+page+'"]');
      if (el && el.offsetParent !== null) {
        results.issues.push('WARN: nav item "'+page+'" is visible but should be hidden for helper_tech');
        results.fail++;
      } else if (el) {
        results.pass++;
      }
    });
    var shouldBeVisible = ['workorders','worktracking','field','tools','calendar'];
    shouldBeVisible.forEach(function(page) {
      var el = document.querySelector('.nav-item[data-page="'+page+'"]');
      if (el && el.offsetParent === null) {
        results.issues.push('WARN: nav item "'+page+'" is hidden but should be visible for helper_tech');
        results.fail++;
      } else if (el) {
        results.pass++;
      }
    });
  }

  // Report
  var status = results.fail === 0 ? '✅ ALL PASS' : '⚠️ '+results.fail+' ISSUE(S)';
  console.group('%c[ProBid Permissions Self-Test] '+status+' ('+results.pass+' passed)',
    results.fail === 0 ? 'color:#2e7d32;font-weight:700' : 'color:#c62828;font-weight:700');
  console.log('Role:', role);
  console.log('Page keys in matrix:', pageKeys.length);
  console.log('Nav items found:', navItems.length);
  console.log('Body classes:', document.body.className);
  if (results.issues.length) {
    results.issues.forEach(function(issue){ console.warn(issue); });
  }
  console.groupEnd();
  return results;
}

async function syncAllFromCloud(silent) {
  // Always re-enforce role permissions when sync completes
  var _syncRole = _currentUser ? _currentUser.role : null;
  if (!_sb || !_currentUser) return;
  // PERF: if a local cache already exists (every hard refresh / re-login), never block the
  // screen with the sync overlay. Show the cached data instantly and refresh in the
  // background — exactly like the 15-minute auto-sync. Only a genuinely empty first load
  // (no cache yet) shows the blocking "Syncing…" spinner.
  if (!silent) {
    var _haveCache = !!(DB && (
      (DB.customers   && DB.customers.length)   ||
      (DB.workOrders  && DB.workOrders.length)  ||
      (DB.quotes      && DB.quotes.length)      ||
      (DB.timeEntries && DB.timeEntries.length) ||
      (DB.catalog     && DB.catalog.length)
    ));
    if (_haveCache) silent = true;
  }
  window._syncInProgress = true;
  // Rollback safety: snapshot the pre-sync local state so a bad pull can be undone
  // (restoreLastKnownGood()). Cheap, quota-guarded, one write per pull.
  try { if (typeof _saveRestorePoint === 'function') _saveRestorePoint('pre-sync'); } catch(e){}
  // Background/auto syncs run silently — a small dashboard indicator, no blocking
  // overlay — so they never freeze you mid-quote. Only the initial login sync blocks.
  if (silent) { var _syncInd = document.getElementById('dash-last-updated'); if (_syncInd) _syncInd.textContent = 'Syncing…'; }
  else { showSpinner('Syncing with cloud...'); }
  var errors = [];
  // Ensure deletedIds exists and is properly structured
  if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
  var delQ   = DB.deletedIds.quotes   || [];
  var delT   = DB.deletedIds.team     || [];
  var delC   = DB.deletedIds.customers|| [];
  var delCt  = DB.deletedIds.contacts || [];
  var delJ   = DB.deletedIds.jobs     || [];
  var delCat  = DB.deletedIds.catalog   || [];
  var delTmpl = DB.deletedIds.templates || [];
  var delInv  = DB.deletedIds.inventory || [];
  var delWO   = DB.deletedIds.workOrders    || [];
  var delPO   = DB.deletedIds.purchaseOrders|| [];
  var delTime = DB.deletedIds.timeEntries   || [];
  var delCon  = DB.deletedIds.contracts     || [];
  var delRC   = DB.deletedIds.recurringContracts || [];
  var delWP   = DB.deletedIds.woParts       || [];  // SC-3b: WO parts tombstones
  var delWL   = DB.deletedIds.woLabor       || [];  // WO child-record tombstones (delete-guard hardening)
  var delWE   = DB.deletedIds.woExpenses    || [];
  var delWCl  = DB.deletedIds.woChecklist   || [];
  var delInvoices = DB.deletedIds.invoices  || [];  // RED #4: invoice tombstones

  // Status map — Supabase Title Case → app lowercase
  var pullStatusMap = {
    'Draft':'draft','draft':'draft',
    'Sent':'sent','sent':'sent',
    'Review':'followup','review':'followup','Followup':'followup',
    'Approved':'approved','approved':'approved',
    'Won':'approved','won':'approved',
    'Lost':'declined','lost':'declined',
    'Declined':'declined','declined':'declined',
    'Rejected':'declined','rejected':'declined',
    'Expired':'declined','expired':'declined'
  };

  // 1. Company settings
  try {
    var { data: settingsRow, error: se } = await _sb.from('company_settings').select('*').eq('id', 1).single();
    if (settingsRow) {
      DB.settings = DB.settings || {};
      // Restore full settings from Supabase JSON backup if available
      if (settingsRow.settings_json && typeof settingsRow.settings_json === 'object') {
        // Merge Supabase backup over local — Supabase is source of truth
        DB.settings = Object.assign({}, settingsRow.settings_json, {
          // Always keep these specific Supabase-controlled fields
          managerApproval: {
            enabled: settingsRow.ma_enabled,
            belowFloorOnly: settingsRow.ma_below_floor_only,
            pinHash: settingsRow.ma_pin_hash || '',
            pinSalt: settingsRow.ma_pin_salt || '',
          }
        });
        // sync-audit RED #5/#6: WO settings and Managed-Services settings are bundled into
        // settings_json on push (below). Restore them to their top-level DB keys, then strip
        // the nested copies so DB.settings isn't bloated. This makes custom WO statuses/types/
        // expense categories and MS types/statuses/cycles round-trip across devices.
        if (settingsRow.settings_json._woSettings) DB.woSettings = settingsRow.settings_json._woSettings;
        if (settingsRow.settings_json._msSettings) DB.msSettings = settingsRow.settings_json._msSettings;
        delete DB.settings._woSettings;
        delete DB.settings._msSettings;
      } else {
        // Fallback: individual field merge (old behavior)
        DB.settings.cname = settingsRow.company_name || DB.settings.cname;
        DB.settings.laborRate = settingsRow.default_labor_rate || DB.settings.laborRate;
        DB.settings.targetMargin = settingsRow.default_target_margin || DB.settings.targetMargin;
        if (!DB.settings.managerApproval) DB.settings.managerApproval = {};
        DB.settings.managerApproval.enabled = settingsRow.ma_enabled;
        DB.settings.managerApproval.belowFloorOnly = settingsRow.ma_below_floor_only;
        DB.settings.managerApproval.pinHash = settingsRow.ma_pin_hash || '';
        DB.settings.managerApproval.pinSalt = settingsRow.ma_pin_salt || '';
      }
    }
  } catch(e) { errors.push('settings: '+e.message); }

  if (_currentUser.role !== 'helper_tech' && _currentUser.role !== 'lead_tech') {

    // 2. Quotes
    try {
      var { data: quotes, error: qe } = await _sbSelectAll(function(){ return _sb.from('quotes')
        .select('*, quote_line_items(*)')
        .is('deleted_at', null)   // never pull soft-deleted quotes — structural fix for resurrection
        .order('created_at', { ascending: false }); });
      if (qe) { errors.push('quotes: '+qe.message); }
      else if (quotes) {
        // Filter out quotes the user has deleted locally
        quotes = quotes.filter(function(q){ return delQ.indexOf(String(q.id)) < 0; });
        var cloudQuoteIds  = new Set(quotes.map(function(q){ return String(q.id); }));
        var cloudQuoteNums = new Set(quotes.map(function(q){ return String(q.quote_number||''); }).filter(Boolean));
        // Correct any local quote IDs that don't match cloud (happens when ensureUUID
        // changed a timestamp ID to UUID in memory but localStorage kept the old ID)
        var cloudNumToId = {};
        quotes.forEach(function(q){ if (q.quote_number) cloudNumToId[String(q.quote_number)] = q.id; });
        (DB.quotes||[]).forEach(function(lq){
          if (lq.num && cloudNumToId[String(lq.num)] && lq.id !== cloudNumToId[String(lq.num)]) {
            lq.id = cloudNumToId[String(lq.num)];
          }
        });
        // Preserve local quotes not yet in cloud — check by ID AND by quote number
        // Preserve ONLY genuinely-new local quotes (never synced). A quote that was
        // previously pulled from the cloud (_synced) but is now absent was deleted
        // elsewhere — do NOT preserve/re-push it, or it resurrects.
        // Safety: only treat a synced-but-absent row as "deleted elsewhere" when the
        // pull is provably COMPLETE — non-empty and under Supabase's 1000-row default
        // cap. An empty or capped result must NOT drop synced rows (would lose data).
        var qCloudComplete = quotes.length > 0;  // pagination returns the full set (no 1000 cap)
        var localOnlyQuotes = (DB.quotes||[]).filter(function(q){ return q.id && !cloudQuoteIds.has(String(q.id)) && !(q.num && cloudQuoteNums.has(String(q.num))) && delQ.indexOf(String(q.id)) < 0 && !(q._synced && qCloudComplete); });
        var cloudQuotes = quotes.map(function(q) {
          return {
            id: q.id,
            num: q.quote_number,
            cn: q.customer_name,
            customerId: q.customer_id || null,
            jn: q.job_name || null,
            ph: q.phone || null,
            em: q.email || null,
            adStreet: q.site_address || null,
            adCity: q.site_city || null,
            adState: q.site_state || null,
            adZip: q.site_zip || null,
            contactName: q.contact_name || null,
            contactId: q.contact_id || null,
            contactTitle: q.contact_title || null,
            rep: q.sales_rep_name,
            status: pullStatusMap[q.status] || 'draft',
            dt: q.quote_date,
            vu: q.valid_until,
            jt: q.quote_type,
            env: q.environment,
            pricingMode: q.pricing_mode,
            targetMargin: q.target_margin,
            laborRate: q.labor_rate,
            taxRate: q.tax_rate,
            discount: q.discount,
            totalMaterialCost: q.total_material_cost,
            totalLaborHours: q.total_labor_hours,
            laborSell: q.labor_sell,
            materialSell: q.material_sell,
            totalCost: q.total_cost,
            sellBeforeTax: q.sell_before_tax,
            taxAmt: q.tax_amount,
            total: q.total_sell,
            achievedMargin: q.achieved_margin_pct,
            belowMarginFloor: q.below_margin_floor,
            marginBypass: q.margin_bypass ? { enabled:true, by:q.margin_bypass_by||null, at:q.margin_bypass_at||null } : { enabled:false, by:null, at:null },
            notes: q.scope_notes,
            internalNotes: q.internal_notes,
            tc: q.quote_terms || null,
            priority: q.priority,
            lumpSum: q.lump_sum_enabled ? { enabled: true, label: q.lump_sum_label, showItems: true } : null,
            approval: q.approval_status ? { status: q.approval_status } : null,
            approvalToken: q.approval_token || null,
            showLaborBanner: q.show_labor_banner !== undefined ? !!q.show_labor_banner : true,
            pt: q.payment_terms || 'Net 30',
            followupDate: q.followup_date || null,
            permits: q.permit_data ? (function(){ try{ return JSON.parse(q.permit_data); }catch(e){ return null; } })() : null,
            items: (q.quote_line_items || []).sort(function(a,b){ return a.sort_order - b.sort_order; }).map(function(li) {
              return { _id:li.id, desc:li.description, cat:li.category, qty:li.qty, unit:li.unit, mc:li.material_cost, lh:li.labor_hours };
            })
          };
        });
        // Immediately push local-only records so they land in Supabase
        if (localOnlyQuotes.length > 0) {
          console.log('[Sync] Pushing', localOnlyQuotes.length, 'local-only quote(s) to cloud');
          setTimeout(pushAllToCloud, 500);
        }
        cloudQuotes.forEach(function(cq){ cq._synced = true; }); // mark as known-in-cloud
        DB.quotes = cloudQuotes.concat(localOnlyQuotes);
        // Clear any stale QQ draft — cloud is now the source of truth. But NOT during a
        // silent background sync: that would wipe an in-progress quote the user is writing.
        try { if (!silent && typeof clearQQDraft === 'function') clearQQDraft(); } catch(e) {}
      }
    } catch(e) { errors.push('quotes: '+e.message); }

    // 3. Customers
    try {
      var { data: custs, error: ce } = await _sbSelectAll(function(){ return _sb.from('customers').select('*').eq('is_active', true).order('name'); });
      if (ce) { errors.push('customers: '+ce.message); }
      else if (custs) {
        custs = custs.filter(function(c){ return delC.indexOf(String(c.id)) < 0; });
        var cloudCustIds = new Set(custs.map(function(c){ return String(c.id); }));
        // Complete = fetched with no error AND non-empty. Pagination now returns the
        // FULL set, so completeness no longer depends on being under the 1000 cap.
        var cCloudComplete = custs.length > 0;
        var localOnlyCusts = (DB.customers||[]).filter(function(c){ return c.id && !cloudCustIds.has(String(c.id)) && delC.indexOf(String(c.id)) < 0 && !(c._synced && cCloudComplete); });
        var cloudCusts = custs.map(function(c) {
          return { id:c.id, name:c.name, company:c.company, email:c.email, phone:c.phone, phone2:c.phone_alt, address:c.address, street:c.street||null, city:c.city, state:c.state, zip:c.zip, defaultTerms:c.default_terms||null, taxExempt:!!c.tax_exempt, hotNoteTech:c.hot_note_tech||null, hotNoteOffice:c.hot_note_office||null, officeAlertScope:c.office_alert_scope||null, invoicingContact:c.invoicing_contact||null, invoicingEmail:c.invoicing_email||null, moduleAlerts:c.module_alerts||null, notes:c.notes, active:c.is_active };
        });
        cloudCusts.forEach(function(cc){ cc._synced = true; });
        DB.customers = cloudCusts.concat(localOnlyCusts);
      }
    } catch(e) { errors.push('customers: '+e.message); }

    // 4. Catalog
    try {
      var { data: cat, error: cate } = await _sbSelectAll(function(){ return _sb.from('catalog').select('*').eq('is_active', true).order('name'); });
      if (cate) { errors.push('catalog: '+cate.message); }
      else if (cat && cat.length) {
        DB.catalog = cat.filter(function(item){ return delCat.indexOf(String(item.id)) < 0; }).map(function(item) {
          return { id:item.id, name:item.name, desc:item.description, cat:item.category, unit:item.unit, mc:item.default_cost, lh:item.default_hours, cost:item.default_cost, hours:item.default_hours, notes:item.notes, active:item.is_active };
        });
      }
    } catch(e) { errors.push('catalog: '+e.message); }

    // 5. Templates
    try {
      var { data: tmpl, error: te } = await _sbSelectAll(function(){ return _sb.from('templates').select('*').eq('is_active', true).order('name'); });
      if (te) { errors.push('templates: '+te.message); }
      else if (tmpl && tmpl.length) {
        DB.templates = tmpl.filter(function(t){ return delTmpl.indexOf(String(t.id)) < 0; }).map(function(t) {
          return { id:t.id, name:t.name, cat:t.category, desc:t.description, items:t.items||[], active:t.is_active };
        });
      }
    } catch(e) { errors.push('templates: '+e.message); }

    // 6. Margin floors
    try {
      var { data: floors, error: fe } = await _sb.from('margin_floors').select('*');
      if (fe) { errors.push('margin_floors: '+fe.message); }
      else if (floors && floors.length) {
        // Merge Supabase floor values into existing array format
        // Don't overwrite — update floor values but preserve jobType/notes structure
        var existing = _getMFList ? _getMFList() : [];
        floors.forEach(function(f) {
          var entry = existing.find(function(e){ return e.jobType===f.job_type; });
          if (entry) { entry.floor = parseFloat(f.floor_pct)||entry.floor; }
          else { existing.push({ jobType:f.job_type, floor:parseFloat(f.floor_pct)||35, notes:'' }); }
        });
        DB.marginFloors = existing;
      }
    } catch(e) { errors.push('margin_floors: '+e.message); }

    // 7. Contacts
    try {
      var { data: conts, error: cone } = await _sbSelectAll(function(){ return _sb.from('contacts').select('*').eq('is_active', true).order('name'); });
      if (cone) { errors.push('contacts: '+cone.message); }
      else if (conts) {
        conts = conts.filter(function(c){ return delCt.indexOf(String(c.id)) < 0; });
        var cloudContIds = new Set(conts.map(function(c){ return String(c.id); }));
        // Complete = non-empty (pagination returns the full set); no longer 1000-capped.
        var ctCloudComplete = conts.length > 0;
        var localOnlyConts = (DB.contacts||[]).filter(function(c){ return c.id && !cloudContIds.has(String(c.id)) && delCt.indexOf(String(c.id)) < 0 && !(c._synced && ctCloudComplete); });
        var cloudConts = conts.map(function(c) {
          return {
            id:          c.id,
            name:        c.name,
            company:     c.company,
            customerId:  c.customer_id,
            phone:       c.phone,
            email:       c.email,
            role:        c.title,
            title:       c.title,
            contactType: c.contact_type,
            contactPref: c.contact_pref,
            notes:       c.notes,
            createdAt:   c.created_at
          };
        });
        cloudConts.forEach(function(cc){ cc._synced = true; });
        DB.contacts = cloudConts.concat(localOnlyConts);
      }
    } catch(e) { errors.push('contacts: '+e.message); }

    // 8. Jobs
    try {
      var { data: jobRows, error: je } = await _sbSelectAll(function(){ return _sb.from('jobs').select('*').eq('is_active', true).order('created_at', {ascending:false}); });
      if (je) { errors.push('jobs: '+je.message); }
      else if (jobRows && jobRows.length) {
        var jobPullStatusMap = {
          'pending':   'Scheduled',
          'active':    'In Progress',
          'on_hold':   'On Hold',
          'completed': 'Complete',
          'invoiced':  'Complete',
          'closed':    'Closed'
        };
        DB.jobs = jobRows.map(function(j) {
          // Resolve customer name: Supabase jobs table has no customer_name column
          // Look it up from DB.customers using customer_id
          var custName = j.customer_name || '';
          if (!custName && j.customer_id) {
            var cust = (DB.customers||[]).find(function(c){ return c.id===j.customer_id; });
            if (cust) custName = cust.name || '';
          }
          return {
            id:                j.id,
            num:               j.job_number,
            name:              j.name,
            customer:          custName,
            customerId:        j.customer_id,
            contactId:         j.contact_id,
            assignedTo:        j.assigned_to,
            crew:              j.crew || [],
            status:            jobPullStatusMap[j.status] || 'Scheduled',
            scheduledDate:     j.scheduled_date || (j.scheduled_start ? j.scheduled_start : null),
            scheduledTime:     j.scheduled_time,
            scheduledDuration: j.scheduled_duration,
            startDate:         j.actual_start || j.scheduled_start,
            endDate:           j.actual_end || j.scheduled_end,
            address:           j.address || j.site_address || (j.site_city ? [j.site_address,j.site_city,j.site_state].filter(Boolean).join(', ') : null),
            estLaborHours:     j.est_labor_hours,
            actualLaborHours:  j.actual_labor_hours,
            estTotal:          j.est_total,
            notes:             j.notes || j.description,
            dispatchNotes:     j.dispatch_notes,
            quoteId:           j.quote_id || j.primary_quote_id,
            createdAt:         j.created_at
          };
        });
      }
    } catch(e) { errors.push('jobs: '+e.message); }

    // 9. Team — pull from team table (Supabase is authoritative — no local merge)
    try {
      var { data: teamRows, error: te2 } = await _sbSelectAll(function(){ return _sb.from('team').select('*').eq('is_active', true).order('full_name'); });
      if (te2) { errors.push('team: '+te2.message); }
      else if (teamRows) {
        teamRows = teamRows.filter(function(m){ return delT.indexOf(String(m.id)) < 0; });
        DB.team = teamRows.map(function(m) {
          return {
            id:           m.id,
            name:         m.full_name || '',
            role:         m.role || 'field',
            phone:        m.phone || '',
            email:        m.email || '',
            rate:         m.rate || 65,
            hireDate:     m.hire_date || '',
            showVacation: !!m.show_vacation,
            showPTO:      !!m.show_pto,
            active:       m.is_active !== false,
            smsEnabled:   m.sms_enabled !== false
          };
        });
      }
    } catch(e) { errors.push('team: '+e.message); }

    // 10. Time Entries — bounded WORKING SET (load-on-demand). Pulling every time entry
    // once the ~56k legacy timelog history is loaded would overflow the browser cache and
    // slow startup. Payroll periods are computed from Work Days (#10b), not raw time entries,
    // so bounding this feed is safe: we keep every RECENT entry (last ~180 days by
    // entry_date) + every UNSETTLED entry (open shift / unpaid / unapproved, any age) +
    // non-deleted, and fetch older/settled ones on demand via fetchTimeEntriesCloud()/
    // fetchTimeEntryById(). Imported historical rows are approved+paid+dated in the past, so
    // they stay out of the set.
    try {
      var tre=null, timeRows=[];
      var _teCut = new Date(Date.now() - 180*86400000).toISOString().slice(0,10);
      var _recentTE = await _sb.from('time_entries').select('*').gte('entry_date', _teCut).order('entry_date',{ascending:false}).limit(8000);
      var _openTE   = await _sb.from('time_entries').select('*').or('end_time.is.null,is_paid.eq.false,is_approved.eq.false').limit(8000);
      if (_recentTE.error) tre=_recentTE.error; else if (_openTE.error) tre=_openTE.error;
      else { var _seenTE={}; (_recentTE.data||[]).concat(_openTE.data||[]).forEach(function(r){ if(!_seenTE[r.id]){ _seenTE[r.id]=1; timeRows.push(r); } }); }
      if (tre) { errors.push('time_entries: '+(tre.message||tre)); }
      else {
        var cloudTimeIds = new Set(timeRows.map(function(t){ return String(t.id); }));
        // keep only genuinely local-only (never pushed) entries; a synced entry outside the
        // working set lives in the cloud and is dropped from memory (fetched on demand).
        var localOnlyTime = (DB.timeEntries||[]).filter(function(t){ return t.id && !cloudTimeIds.has(String(t.id)) && t._synced !== true; });
        DB.timeEntries = timeRows.map(function(t){ var m=_mapTimeRow(t); m._synced=true; if (delTime.indexOf(String(t.id))>=0) m.deleted=true; return m; }).concat(localOnlyTime);
      }
    } catch(e) { errors.push('time_entries: '+e.message); }

    // 10b. Work Days (payroll) — migration _15. Mirror the time_entries merge: preserve
    // local-only (not-yet-pushed) rows so payroll period totals stay COMPLETE, and map
    // back the correction audit (corrections/corrected) + PTO flags so they survive the
    // round-trip. No tombstones (workDays has no delete path).
    try {
      var { data: wdRows, error: wdpe } = await _sbSelectAll(function(){ return _sb.from('app_work_days').select('*'); });
      if (wdpe) { errors.push('app_work_days: '+wdpe.message); }
      else if (wdRows) {
        var cloudWdIds = new Set(wdRows.map(function(w){ return String(w.id); }));
        var localOnlyWd = (DB.workDays||[]).filter(function(w){ return w.id && !cloudWdIds.has(String(w.id)); });
        DB.workDays = wdRows.map(function(w){
          return {
            id: w.id, techName: w.tech_name||null, techId: w.tech_id||null, date: w.work_date||null,
            totalPaidMins: w.total_paid_mins, onsiteMins: w.onsite_mins, travelMins: w.travel_mins,
            breakMins: w.break_mins, lunchMins: w.lunch_mins, officeMins: w.office_mins,
            ptoMins: w.pto_mins, vacationMins: w.vacation_mins, holidayMins: w.holiday_mins,
            jobName: w.job_name||'', jobId: w.job_id||null, dayType: w.day_type||null,
            approved: (w.approved!=null)?!!w.approved:undefined, approvedBy: w.approved_by||null,
            lunchFlagged: !!w.lunch_flagged, hasManualEntries: !!w.has_manual_entries,
            corrected: !!w.corrected, corrections: w.corrections||null, events: w.events||null
          };
        }).concat(localOnlyWd);
      }
    } catch(e) { errors.push('app_work_days: '+e.message); }

    // 10c. Invoices — migration _16 (RED #4). All invoice shapes (WO, recurring/MSC,
    // manual) live in one heterogeneous DB.invoices array; each row stores its FULL
    // object as jsonb `data` for perfect fidelity. Merge preserves local-only (not-yet-
    // pushed) invoices and drops any that are tombstoned locally, so a pull never wipes
    // an invoice that hasn't synced and never resurrects one queued for delete.
    // LOAD-ON-DEMAND (Phase-2 history): with thousands of historical invoices in the
    // cloud, we no longer pull them ALL into memory/localStorage (that overflows the
    // browser cache and slows startup). Instead we keep a bounded WORKING SET —
    // every OPEN invoice (unpaid/partial) + the most recent ~600 by date — and fetch
    // older/paid invoices on demand (Invoices-page search + customer profile) via
    // fetchInvoicesCloud()/fetchInvoiceById(). Pulled rows are marked _synced so the
    // local-only merge keeps genuinely-unpushed invoices but drops synced ones that
    // simply fell outside the working set (they're safe in the cloud).
    try {
      var invpe=null, invRows=[];
      var _recentQ = await _sb.from('app_invoices').select('*').order('invoice_date',{ascending:false,nullsFirst:false}).limit(600);
      var _openQ   = await _sb.from('app_invoices').select('*').neq('status','paid').limit(3000);
      if (_recentQ.error) invpe=_recentQ.error; else if (_openQ.error) invpe=_openQ.error;
      else {
        var _seen={};
        (_recentQ.data||[]).concat(_openQ.data||[]).forEach(function(r){ if(!_seen[r.id]){ _seen[r.id]=1; invRows.push(r); } });
      }
      if (invpe) { errors.push('app_invoices: '+(invpe.message||invpe)); }
      else {
        var cloudInvIds = new Set(invRows.map(function(r){ return String(r.id); }));
        // keep only genuinely local-only (never pushed) invoices; a synced invoice that
        // isn't in the working set lives in the cloud and is dropped from memory.
        var localOnlyInv = (DB.invoices||[]).filter(function(i){
          return i.id && !cloudInvIds.has(String(i.id)) && delInvoices.indexOf(i.id) === -1 && i._synced !== true;
        });
        DB.invoices = invRows.filter(function(r){ return delInvoices.indexOf(r.id) === -1; })
          .map(function(r){ var d=r.data||{}; d._synced=true; return d; }).concat(localOnlyInv);
      }
    } catch(e) { errors.push('app_invoices: '+e.message); }

    // 11. Work Tracking — sync project metadata only (items/checkoffs fetched on demand)
    try {
      var { data: wtProjRows, error: wtpe } = await _sbSelectAll(function(){ return _sb.from('wt_projects').select('*').in('status',['active','paused']).order('created_at', { ascending: false }); });
      if (wtpe) { errors.push('wt_projects: '+wtpe.message); }
      else if (wtProjRows) { DB.wtProjects = wtProjRows; }
    } catch(e) { errors.push('wt_projects: '+e.message); }
    try {
      var { data: wtTplRows, error: wtte } = await _sbSelectAll(function(){ return _sb.from('wt_templates').select('id,name,template_type,customer_id,created_at').order('created_at', { ascending: false }); });
      if (!wtte && wtTplRows) DB.wtTemplates = wtTplRows;
    } catch(e) { /* templates optional */ }

    // 12. Job Photos
    if (typeof syncJobPhotos === 'function') { try { await syncJobPhotos(); } catch(e) { errors.push('job_photos: '+e.message); } }

    // 13. Comms Log
    try {
      var { data: commsRows, error: comme } = await _sbSelectAll(function(){ return _sb.from('comms_log').select('*').order('created_at', { ascending: false }); });
      if (comme) { errors.push('comms_log: '+comme.message); }
      else if (commsRows) {
        DB.commsLog = commsRows.map(function(c){
          return { id:c.id, customerId:c.customer_id, jobId:c.job_id, loggedBy:c.logged_by, loggerName:c.logger_name, type:c.comm_type, direction:c.direction, subject:c.subject, notes:c.notes, followUpDate:c.follow_up_date, createdAt:c.created_at };
        });
      }
    } catch(e) { errors.push('comms_log: '+e.message); }

    // 14. Invoice Payments
    try {
      var { data: pmtRows, error: pmte } = await _sbSelectAll(function(){ return _sb.from('invoice_payments').select('*').order('created_at', { ascending: false }); });
      if (pmte) { errors.push('invoice_payments: '+pmte.message); }
      else if (pmtRows) {
        DB.invoicePayments = pmtRows.map(function(p){
          return { id:p.id, invoiceId:p.invoice_id, amount:p.amount, paymentMethod:p.payment_method, reference:p.reference, notes:p.notes, recordedBy:p.recorded_by, recorderName:p.recorder_name, paymentDate:p.payment_date, createdAt:p.created_at };
        });
      }
    } catch(e) { errors.push('invoice_payments: '+e.message); }

    // 15. Work Orders — bounded WORKING SET (load-on-demand, like invoices). Pulling all
    // work orders into memory/localStorage overflows the cache and slows startup once the
    // legacy service-order history is loaded (~8.5k rows). Instead keep every OPEN work
    // order (status flagged open in woSettings) + the most recent ~500 by created_at, and
    // fetch older/closed ones on demand via fetchWorkOrdersCloud()/fetchWorkOrderById().
    // Imported historical service orders are dated in the past and closed, so they stay out.
    try {
      var woe = null, woRows = [];
      var _openWOIds = [];
      try {
        var _wslist = (DB.woSettings&&DB.woSettings.statuses&&DB.woSettings.statuses.length) ? DB.woSettings.statuses : (typeof WO_STATUSES!=='undefined'?WO_STATUSES:[]);
        _openWOIds = _wslist.filter(function(s){ return s && s.open; }).map(function(s){ return s.id; });
      } catch(e){}
      var _recentWO = await _sb.from('work_orders').select('*').order('created_at',{ascending:false}).limit(500);
      var _openWO   = _openWOIds.length ? await _sb.from('work_orders').select('*').in('status',_openWOIds).limit(3000) : {data:[],error:null};
      if (_recentWO.error) woe=_recentWO.error; else if (_openWO.error) woe=_openWO.error;
      else { var _seenWO={}; (_recentWO.data||[]).concat(_openWO.data||[]).forEach(function(r){ if(!_seenWO[r.id]){ _seenWO[r.id]=1; woRows.push(r); } }); }
      if (woe) { errors.push('work_orders: '+(woe.message||woe)); }
      else {
        woRows = woRows.filter(function(w){ return delWO.indexOf(String(w.id)) < 0; });
        var cloudWOIds = new Set(woRows.map(function(w){ return String(w.id); }));
        // keep only genuinely local-only (never pushed) WOs; a synced WO outside the working
        // set lives in the cloud and is dropped from memory (fetched on demand).
        var localOnlyWOs = (DB.workOrders||[]).filter(function(w){ return w.id && !cloudWOIds.has(String(w.id)) && delWO.indexOf(String(w.id)) < 0 && w._synced !== true; });
        var cloudWOs = woRows.map(function(w){ return _mapWORow(w); });
        cloudWOs.forEach(function(cw){ cw._synced = true; }); // mark as known-in-cloud
        // Push any offline-created WOs so they land in the cloud (they were never synced).
        if (localOnlyWOs.length > 0 && typeof _pushWOToCloud === 'function') {
          localOnlyWOs.forEach(function(w){ try { _pushWOToCloud(w); } catch(e){} });
        }
        DB.workOrders = cloudWOs.concat(localOnlyWOs);
      }
    } catch(e) { errors.push('work_orders: '+e.message); }

    // 16. WO Labor
    try {
      var { data: woLaborRows, error: wole } = await _sbSelectAll(function(){ return _sb.from('wo_labor').select('*').order('created_at', { ascending: false }); });
      if (wole) { errors.push('wo_labor: '+wole.message); }
      else if (woLaborRows) {
        // Tombstone-filter: a labor entry deleted locally but not yet confirmed-deleted
        // in the cloud must be excluded from this full-replace pull, or it resurrects on
        // every sync (payroll-adjacent — a resurrected entry could re-inflate an invoice).
        DB.woLabor = woLaborRows.filter(function(l){ return delWL.indexOf(String(l.id)) < 0; }).map(function(l){
          return { id:l.id, woId:l.wo_id, techName:l.tech_name, entryType:l.entry_type, clockIn:l.clock_in, clockOut:l.clock_out, hours:l.hours, notes:l.notes, createdAt:l.created_at };
        });
      }
    } catch(e) { errors.push('wo_labor: '+e.message); }

    // 17. WO Parts
    try {
      var { data: woPartsRows, error: wope } = await _sbSelectAll(function(){ return _sb.from('wo_parts').select('*').order('created_at', { ascending: false }); });
      if (wope) { errors.push('wo_parts: '+wope.message); }
      else if (woPartsRows) {
        // SC-3b: this pull FULL-REPLACES DB.woParts, so a part tombstoned locally but
        // not yet confirmed-deleted in the cloud must be filtered out here or it would
        // resurrect on every sync. Mirrors the WO/PO tombstone-filter pattern.
        DB.woParts = woPartsRows.filter(function(p){ return delWP.indexOf(String(p.id)) < 0; }).map(function(p){
          return { id:p.id, woId:p.wo_id, name:p.part_name, partNum:p.part_num, qty:p.quantity, unit:p.unit, status:p.status, notes:p.notes, requestedBy:p.requested_by, createdAt:p.created_at };
        });
      }
    } catch(e) { errors.push('wo_parts: '+e.message); }

    // 17b. WO Checklist
    try {
      var { data: woClRows, error: wocle } = await _sbSelectAll(function(){ return _sb.from('wo_checklist').select('*').order('created_at', { ascending: true }); });
      if (wocle) { errors.push('wo_checklist: '+wocle.message); }
      else if (woClRows) {
        DB.woChecklist = woClRows.filter(function(c){ return delWCl.indexOf(String(c.id)) < 0; }).map(function(c){
          return { id:c.id, woId:c.wo_id, item:c.item, completed:!!c.completed, completedBy:c.completed_by, completedAt:c.completed_at, createdAt:c.created_at };
        });
      }
    } catch(e) { errors.push('wo_checklist: '+e.message); }

    // 18. WO Expenses — PERF: bounded to a recent window (not all history). Older expenses
    // load on demand when a specific work order or vehicle is opened
    // (ensureWOExpensesLoaded / the vehicle profile), and any such on-demand rows already in
    // memory are preserved across this bounded pull so they don't blank out.
    try {
      var _expCut = new Date(Date.now() - WO_EXPENSE_WINDOW_DAYS*86400000).toISOString();
      var _prevExp = DB.woExpenses || [];
      var { data: woExpRows, error: woee } = await _sbSelectAll(function(){ return _sb.from('wo_expenses').select('*').gte('created_at', _expCut).order('created_at', { ascending: false }); });
      if (woee) { errors.push('wo_expenses: '+woee.message); }
      else if (woExpRows) {
        var _mappedExp = woExpRows.filter(function(e){ return delWE.indexOf(String(e.id)) < 0; }).map(function(e){
          return { id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount, paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by, receiptUrl:e.receipt_url, receiptDocId:e.receipt_doc_id, createdAt:e.created_at };
        });
        var _expHave = {}; _mappedExp.forEach(function(e){ if(e&&e.id) _expHave[e.id]=1; });
        // Keep on-demand-loaded older rows (outside the window) that this pull didn't return.
        _prevExp.forEach(function(e){
          if (e && e.id && !_expHave[e.id] && delWE.indexOf(String(e.id))<0 && (!e.createdAt || e.createdAt < _expCut)) _mappedExp.push(e);
        });
        DB.woExpenses = _mappedExp;
      }
    } catch(e) { errors.push('wo_expenses: '+e.message); }

    // 19. Inventory
    try {
      var { data: invRows, error: inve } = await _sbSelectAll(function(){ return _sb.from('inventory').select('*').order('name'); });
      if (inve) { errors.push('inventory: '+inve.message); }
      else if (invRows) {
        // Exclude soft-deleted (is_active===false). NULL-safe: existing rows may have
        // is_active NULL (column predates the flag), so treat NULL/true as active — a
        // strict .eq('is_active',true) would have hidden all legacy inventory.
        DB.inventory = invRows.filter(function(i){ return i.is_active !== false && delInv.indexOf(String(i.id)) < 0; }).map(function(i){
          return {
            id:         i.id,
            name:       i.name,
            tag:        i.tag||'',
            cat:        i.category||'General',
            partNum:    i.part_num||'',
            barcode:    i.barcode||'',
            returnable: !!i.returnable,
            locations:  i.locations||{'loc-shop':0},
            qty:        i.qty||0,
            minQty:     i.min_qty||0,
            cost:       i.unit_cost||0,
            notes:      i.notes||'',
            createdAt:  i.created_at
          };
        });
      }
    } catch(e) { errors.push('inventory: '+e.message); }

    // 16. Vendors
    try {
      var { data: vendorRows, error: ve } = await _sbSelectAll(function(){ return _sb.from('vendors').select('*').eq('is_active', true).order('name'); });
      if (ve) { errors.push('vendors: '+ve.message); }
      else if (vendorRows) {
        DB.vendors = vendorRows.map(function(v){
          // SC-1: the vendors table column is payment_terms (see vendor save in
          // purchaseorders.js). The old read of v.default_terms hit a nonexistent
          // column, so every vendor's terms silently fell back to 'Due on Receipt'
          // regardless of what was saved. Read the real column.
          return { id:v.id, name:v.name, contact:v.contact_name, phone:v.phone, email:v.email, acctNum:v.account_num, address:v.address, city:v.city, state:v.state, zip:v.zip, defaultTerms:v.payment_terms||'Due on Receipt', taxExempt:!!v.tax_exempt, notes:v.notes, active:v.is_active!==false };
        });
      }
    } catch(e) { errors.push('vendors: '+e.message); }

    // 16b. Assets (Fleet Vehicles) — office-managed, is_active-filtered pull (mirrors vendors).
    try {
      var { data: assetRows, error: ase } = await _sbSelectAll(function(){ return _sb.from('assets').select('*').eq('is_active', true).order('number'); });
      if (ase) { errors.push('assets: '+ase.message); }
      else if (assetRows) {
        DB.vehicles = assetRows.map(function(a){
          return { id:a.id, number:a.number, name:a.name, type:a.type, make:a.make, model:a.model, year:a.year,
            color:a.color, vin:a.vin, plate:a.plate, status:a.status, assignedTech:a.assigned_tech, homeBase:a.home_base,
            odometer:a.odometer, purchaseDate:a.purchase_date, purchaseCost:a.purchase_cost,
            registrationExpires:a.registration_expires, insuranceExpires:a.insurance_expires,
            notes:a.notes, isActive:a.is_active!==false, createdBy:a.created_by, createdAt:a.created_at };
        });
      }
    } catch(e) { errors.push('assets: '+e.message); }

    // 16c. Vehicle open-issue rollup — so the office sees the Vehicles nav badge
    // without having to open the page first.
    try { if (typeof _ensureVehicleIssueRollup==='function') _ensureVehicleIssueRollup(true); } catch(e) {}

    // 20. Recurring Contracts (Managed Services)
    try {
      var { data: rcRows, error: rce } = await _sbSelectAll(function(){ return _sb.from('recurring_contracts').select('*').order('sort_order',{ascending:true}); });
      if (rce) { errors.push('recurring_contracts: '+rce.message); }
      else if (rcRows) {
        var mapped = rcRows.map(function(r){
          return {
            id:r.id, number:r.number, client:r.client, type:r.type,
            billingCycle:r.billing_cycle, billingDay:r.billing_day,
            status:r.status, autoRenew:!!r.auto_renew,
            deliveryMethod:r.delivery_method||'email', clientEmail:r.client_email||'',
            contractStart:r.contract_start||'', contractEnd:r.contract_end||'',
            nextBillingDate:r.next_billing_date||'', lastBilledDate:r.last_billed_date||'',
            lineItems:r.line_items||[], notes:r.notes||'',
            doNotBill:!!r.do_not_bill, sortOrder:r.sort_order||0,
            priceHistory:r.price_history||[], createdAt:r.created_at
          };
        });
        // Suppress tombstoned rows until their cloud delete confirms (RLS-silent-block guard).
        mapped = mapped.filter(function(r){ return delRC.indexOf(String(r.id)) < 0; });
        // Merge: Supabase is authoritative for records it has, keep local-only records
        var sbIds = mapped.map(function(r){return r.id;});
        var rcCloudComplete = rcRows.length > 0 && rcRows.length < 1000;
        var localOnly = (DB.recurringContracts||[]).filter(function(c){return !sbIds.includes(c.id) && delRC.indexOf(String(c.id)) < 0 && !(c._synced && rcCloudComplete);});
        mapped.forEach(function(m){ m._synced = true; });
        DB.recurringContracts = mapped.concat(localOnly);
      }
    } catch(e) { errors.push('recurring_contracts: '+e.message); }

    // 21. Contracts
    try {
      var { data: ctrRows, error: ctre } = await _sbSelectAll(function(){ return _sb.from('contracts').select('*').order('created_at',{ascending:false}); });
      if (ctre) { errors.push('contracts: '+ctre.message); }
      else if (ctrRows) {
        // Suppress tombstoned rows until the cloud delete confirms (RLS-silent-block guard).
        var ctrMapped = ctrRows.filter(function(r){ return delCon.indexOf(String(r.id)) < 0; }).map(function(r){
          return {
            id:r.id, number:r.number, type:r.type, client:r.client,
            project:r.project||'', value:r.value||0, status:r.status||'draft',
            scope:r.scope||'', notes:r.notes||'',
            dateCreated:r.date_created||'', dateExecuted:r.date_executed||'',
            dateExpires:r.date_expires||'', woId:r.wo_id||null,
            parentContractId:r.parent_contract_id||null, createdAt:r.created_at
          };
        });
        var ctrIds = ctrMapped.map(function(r){ return String(r.id); });
        var ctrComplete = ctrRows.length > 0 && ctrRows.length < 1000;
        var ctrLocalOnly = (DB.contracts||[]).filter(function(c){ return c.id && ctrIds.indexOf(String(c.id)) < 0 && delCon.indexOf(String(c.id)) < 0 && !(c._synced && ctrComplete); });
        ctrMapped.forEach(function(m){ m._synced = true; });
        DB.contracts = ctrMapped.concat(ctrLocalOnly);
      }
    } catch(e) { errors.push('contracts: '+e.message); }

    // 17. Purchase Orders — PERF: bounded to recent (last PO_WINDOW_DAYS) PLUS every still-open
    // PO of any age (so nothing actionable is ever missing). Older CLOSED POs load on demand
    // via ensurePOLoaded() when opened/received/printed. Two bounded queries, merged, instead
    // of pulling all ~1,500 POs + ~7,000 line items every sync.
    try {
      var _poCut = new Date(Date.now() - PO_WINDOW_DAYS*86400000).toISOString();
      var _poRecent = await _sbSelectAll(function(){ return _sb.from('purchase_orders').select('*, po_line_items(*)').gte('created_at', _poCut).order('created_at', { ascending: false }); });
      var _poOpen   = await _sbSelectAll(function(){ return _sb.from('purchase_orders').select('*, po_line_items(*)').not('status','in',PO_CLOSED_STATUSES).order('created_at', { ascending: false }); });
      var poe = _poRecent.error || _poOpen.error;
      if (poe) { errors.push('purchase_orders: '+poe.message); }
      var poRows = (_poRecent.data||[]).concat(_poOpen.data||[]);
      if (poRows) {
        // De-dupe (a PO can match both queries) + drop tombstoned rows.
        var _poSeen = {};
        poRows = poRows.filter(function(p){
          if (!p || _poSeen[p.id]) return false;
          if (delPO.indexOf(String(p.id)) >= 0) return false;   // tombstoned — hide until delete confirms
          _poSeen[p.id] = 1;
          return true;
        });
        var cloudPOIds = new Set(poRows.map(function(p){ return String(p.id); }));
        // Bounded pull is intentionally incomplete, so DON'T drop synced-but-unpulled POs the
        // way a full pull would. Keep local-only (offline-created) AND on-demand-loaded POs.
        var localOnlyPOs = (DB.purchaseOrders||[]).filter(function(p){
          return p.id && !cloudPOIds.has(String(p.id)) && delPO.indexOf(String(p.id)) < 0 && (!p._synced || _ondemandPOIds[p.id]);
        });
        var cloudPOs = poRows.map(_mapPORow);
        cloudPOs.forEach(function(cp){ cp._synced = true; });
        // Push any offline-created POs so they land in the cloud (never synced).
        var _reallyLocal = localOnlyPOs.filter(function(p){ return !p._synced; });
        if (_reallyLocal.length > 0 && typeof _pushPOToCloud === 'function') {
          _reallyLocal.forEach(function(p){ try { _pushPOToCloud(p); } catch(e){} });
        }
        DB.purchaseOrders = cloudPOs.concat(localOnlyPOs);
      }
    } catch(e) { errors.push('purchase_orders: '+e.message); }

  }

  // Secondary collections (tools, checkouts, inventory locations/transfers) live in the
  // app_state blob store. Only overwrite local when the cloud actually returned an array.
  try {
    var { data: stateRows } = await _sbSelectAll(function(){ return _sb.from('app_state').select('key,data'); });
    if (stateRows && stateRows.length) {
      stateRows.forEach(function(row){ if (row && row.key && Array.isArray(row.data)) DB[row.key] = row.data; });
    }
  } catch(e) { errors.push('app_state: '+e.message); }

  // Audit log — read recent history back so the view isn't empty after a reload.
  try {
    var { data: auditRows } = await _sb.from('probid_audit').select('*').order('created_at', { ascending: false }).limit(500);
    if (auditRows) {
      DB.auditLog = auditRows.map(function(a){ return {
        id:a.id, event:a.event, recordType:a.record_type, recordId:a.record_id,
        actorId:a.actor_id, actorName:a.actor_name, actorRole:a.actor_role,
        oldValue:a.old_value, newValue:a.new_value, note:a.note,
        ts:a.created_at || '', viewAsMode:a.view_as_mode, realActorName:a.real_actor
      }; });
    }
  } catch(e) { errors.push('audit: '+e.message); }

  // Save to localStorage only — do NOT call saveDB() here as it would schedule a push
  // We just pulled from Supabase so there's nothing to push back
  window._syncInProgress = false;
  // Persist the freshly-pulled data off the main thread (no push — data came FROM cloud).
  try { _dbPackAsync(DB).then(function(p){ try{ localStorage.setItem(DB_KEY, p); }catch(e){} }); } catch(e) {}
  clearTimeout(window._syncTimer); // Cancel any push timer that snuck in during sync
  // Re-apply permissions after sync then render correct dashboard for role
  if (_currentUser) applyRolePermissions(_currentUser.role);
  if (_currentUser && _currentUser.role === 'helper_tech') {
    if (typeof wtRenderTechDashboard === 'function') wtRenderTechDashboard();
    else if (typeof renderDash === 'function') renderDash();
  } else {
    if (typeof renderDash === 'function') renderDash();
  }
  hideSpinner();
  if (errors.length) {
    console.warn('[Sync] Partial errors:', errors);
    if (!silent) showToast('Synced with warnings — check console', 'warning', 3000);
  } else if (!silent) {
    showToast('Synced ✓', 'success', 2000);
  }
  // Quiet, non-blocking confirmation for every sync (incl. background).
  var _syncDone = document.getElementById('dash-last-updated');
  if (_syncDone) _syncDone.textContent = 'Synced ' + new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true });
}

var _pushInProgress = false;

// ============================================================
// Inline per-record cloud push (write-through on save).
// Mirrors the exact row mappings used by pushAllToCloud so a
// newly created/edited record reaches Supabase immediately —
// the same pattern work orders, purchase orders, vendors and
// team already use. pushAllToCloud remains the periodic
// full-database reconciler / safety net.
// IMPORTANT: if a mapping below changes, change it in
// pushAllToCloud too (search the table name) so the two agree.
// ============================================================
async function _pushCustomerToCloud(c) {
  if (!_sb || !_currentUser || !c) return;
  try {
    var cId = (typeof ensureUUID === 'function') ? ensureUUID(c) : c.id;
    var { error } = await _sb.from('customers').upsert({
      id: cId,
      name: c.name || '',
      company: c.company || null,
      email: c.email || null,
      phone: c.phone || null,
      phone_alt: c.phone2 || null,
      address: c.address || null,
      street: c.street || null,
      city: c.city || null,
      state: c.state || null,
      zip: c.zip || null,
      default_terms: c.defaultTerms || 'Due on Receipt',
      tax_exempt: !!c.taxExempt,
      hot_note_tech: c.hotNoteTech || null,
      hot_note_office: c.hotNoteOffice || null,
      office_alert_scope: c.officeAlertScope || null,
      invoicing_contact: c.invoicingContact || null,
      invoicing_email: c.invoicingEmail || null,
      module_alerts: c.moduleAlerts || null,
      notes: c.notes || null,
      is_active: c.active !== false,
      created_by: _currentUser.id
    });
    if (error) console.warn('[Customer Push]', error.message);
  } catch (e) { console.warn('[Customer Push]', e.message || e); }
}

async function _pushContactToCloud(ct) {
  if (!_sb || !_currentUser || !ct) return;
  try {
    var ctId = (typeof ensureUUID === 'function') ? ensureUUID(ct) : ct.id;
    var _isUUID = function(v){ return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
    var ctBase = {
      id:          ctId,
      name:        ct.name || '',
      customer_id: _isUUID(ct.customerId) ? ct.customerId : null,
      phone:       ct.phone || null,
      email:       ct.email || null,
      title:       ct.role || ct.title || null,
      notes:       ct.notes || null,
      is_active:   true
    };
    var ctFull = Object.assign({}, ctBase, {
      company:      ct.company || null,
      contact_type: ct.contactType || null,
      contact_pref: ct.contactPref || null
    });
    var ctRes = await _sb.from('contacts').upsert(ctFull);
    if (ctRes.error && ctRes.error.message && ctRes.error.message.includes('column')) {
      await _sb.from('contacts').upsert(ctBase);
    } else if (ctRes.error) {
      console.warn('[Contact Push]', ctRes.error.message);
    }
  } catch (e) { console.warn('[Contact Push]', e.message || e); }
}

async function _pushInvoiceToCloud(inv0) {
  if (!_sb || !_currentUser || !inv0 || !inv0.id) return;
  try {
    var _invRow = {
      id:            inv0.id,
      num:           inv0.num || null,
      inv_type:      inv0.type || (inv0.woId ? 'workorder' : 'manual'),
      status:        inv0.status || null,
      customer_name: inv0.clientName || (inv0.job && inv0.job.customer) || inv0.customerName || null,
      total:         (inv0.total != null) ? inv0.total : ((inv0.amount != null) ? inv0.amount : null),
      invoice_date:  inv0.invoiceDate || inv0.date || null,
      data:          inv0,
      updated_at:    new Date().toISOString()
    };
    var { error } = await _sb.from('app_invoices').upsert(_invRow, { onConflict: 'id' });
    if (error) console.warn('[Invoice Push]', error.message); else inv0._synced = true;
  } catch (e) { console.warn('[Invoice Push]', e.message || e); }
}

async function _pushWOExpenseToCloud(we) {
  if (!_sb || !_currentUser || !we || !we.id) return;
  try {
    var { error } = await _sb.from('wo_expenses').upsert({
      id:            we.id,
      wo_id:         we.woId || null,
      category:      we.category || null,
      description:   we.description || null,
      amount:        (we.amount != null) ? we.amount : null,
      payment_type:  we.paymentType || null,
      logged_by:     we.loggedBy || null,
      expense_date:  we.date || null,
      receipt_url:   we.receiptUrl || null,
      receipt_doc_id:we.receiptDocId || null,
      created_at:    we.createdAt || new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) console.warn('[Expense Push]', error.message);
  } catch (e) { console.warn('[Expense Push]', e.message || e); }
}

async function _pushWOChecklistToCloud(wc) {
  if (!_sb || !_currentUser || !wc || !wc.id) return;
  try {
    var { error } = await _sb.from('wo_checklist').upsert({
      id:           wc.id,
      wo_id:        wc.woId||null,
      item:         wc.item||null,
      completed:    !!wc.completed,
      completed_by: wc.completedBy||null,
      completed_at: wc.completedAt||null,
      created_at:   wc.createdAt||new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) console.warn('[WO Checklist Push]', error.message);
  } catch (e) { console.warn('[WO Checklist Push]', e.message || e); }
}

async function _pushWOPartToCloud(wp) {
  if (!_sb || !_currentUser || !wp || !wp.id) return;
  try {
    var { error } = await _sb.from('wo_parts').upsert({
      id:           wp.id,
      wo_id:        wp.woId||null,
      part_name:    wp.name||null,
      part_num:     wp.partNum||null,
      quantity:     wp.qty||0,
      unit:         wp.unit||null,
      unit_cost:    (wp.unitCost!=null)?wp.unitCost:0,
      status:       wp.status||'requested',
      notes:        wp.notes||null,
      requested_by: wp.requestedBy||null,
      created_at:   wp.createdAt||new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) console.warn('[WO Part Push]', error.message);
  } catch (e) { console.warn('[WO Part Push]', e.message || e); }
}

async function _pushInventoryToCloud(inv) {
  if (!_sb || !_currentUser || !inv || !inv.id) return;
  try {
    var { error } = await _sb.from('inventory').upsert({
      id:         inv.id,
      name:       inv.name,
      tag:        inv.tag||null,
      category:   inv.cat||'General',
      part_num:   inv.partNum||null,
      barcode:    inv.barcode||null,
      returnable: !!inv.returnable,
      locations:  inv.locations||null,
      qty:        inv.qty||0,
      min_qty:    inv.minQty||0,
      unit_cost:  inv.cost||0,
      notes:      inv.notes||null,
      created_by: _currentUser.id
    }, { onConflict: 'id' });
    if (error) console.warn('[Inventory Push]', error.message);
  } catch (e) { console.warn('[Inventory Push]', e.message || e); }
}

async function _pushQuoteToCloud(q) {
  if (!_sb || !_currentUser || !q) return;
  try {
    var qId = (typeof ensureUUID === 'function') ? ensureUUID(q) : q.id;
    var statusMap = {
      'draft':'Draft','Draft':'Draft','sent':'Sent','Sent':'Sent','review':'Review','Review':'Review',
      'followup':'Review','approved':'Approved','Approved':'Approved','won':'Won','Won':'Won',
      'declined':'Lost','lost':'Lost','Lost':'Lost','rejected':'Rejected','Rejected':'Rejected',
      'expired':'Expired','Expired':'Expired'
    };
    var { error } = await _sb.from('quotes').upsert({
      id: qId,
      quote_number: q.num || null,
      customer_name: q.cn || null,
      job_id: null,
      sales_rep_name: q.rep || null,
      status: statusMap[q.status] || 'Draft',
      quote_date: q.dt || new Date().toISOString().split('T')[0],
      valid_until: q.vu || null,
      job_name: q.jn || null,
      contact_name: q.contactName || null,
      contact_id: q.contactId || null,
      contact_title: q.contactTitle || null,
      phone: q.ph || null,
      email: q.em || null,
      site_address: q.adStreet || null,
      site_city: q.adCity || null,
      site_state: q.adState || null,
      site_zip: q.adZip || null,
      customer_id: q.customerId || null,
      quote_type: q.jt || null,
      environment: q.env || null,
      pricing_mode: (q.pricingMode === 'markup' ? 'markup' : 'margin'),
      target_margin: q.targetMargin !== undefined ? q.targetMargin : 35,
      labor_rate: q.laborRate || 100,
      tax_rate: q.taxRate || 0,
      discount: q.discount || 0,
      total_material_cost: q.totalMaterialCost || 0,
      total_labor_hours: q.totalLaborHours || 0,
      labor_sell: q.laborSell || 0,
      material_sell: q.materialSell || 0,
      total_cost: q.totalCost || 0,
      sell_before_tax: q.sellBeforeTax || 0,
      tax_amount: q.taxAmt || 0,
      total_sell: q.total || 0,
      achieved_margin_pct: q.achievedMargin || 0,
      below_margin_floor: !!q.belowMarginFloor,
      margin_bypass:    !!(q.marginBypass && q.marginBypass.enabled),
      margin_bypass_by: (q.marginBypass && q.marginBypass.by) || null,
      margin_bypass_at: (q.marginBypass && q.marginBypass.at) || null,
      scope_notes: q.notes || null,
      internal_notes: q.internalNotes || null,
      quote_terms: q.tc || null,
      priority: q.priority || 'Normal',
      lump_sum_enabled: !!(q.lumpSum && q.lumpSum.enabled),
      lump_sum_label: (q.lumpSum && q.lumpSum.label) || null,
      approval_status: (q.approval && q.approval.status) || null,
      approval_token: q.approvalToken || null,
      show_labor_banner: q.showLaborBanner !== undefined ? !!q.showLaborBanner : true,
      permit_data: q.permits ? JSON.stringify(q.permits) : null,
      payment_terms: q.pt || 'Net 30',
      followup_date: q.followupDate || null,
      created_by: _currentUser.id
    });
    if (error) { console.warn('[Quote Push]', error.message); return; }
    // Line items — atomic replace (same transaction guarantee as the full push).
    if (Array.isArray(q.items)) {
      var lineItems = q.items.map(function(item, idx) {
        return {
          sort_order: idx,
          description: item.desc || '',
          category: item.cat || null,
          qty: item.qty || 1,
          unit: item.unit || 'ea',
          material_cost: item.mc || 0,
          labor_hours: item.lh || 0
        };
      });
      var _rli = await _sb.rpc('replace_quote_line_items', { p_quote_id: qId, p_items: lineItems });
      if (_rli && _rli.error) console.warn('[Quote Push] line items', _rli.error.message);
    }
  } catch (e) { console.warn('[Quote Push]', e.message || e); }
}

async function _pushJobToCloud(jb) {
  if (!_sb || !_currentUser || !jb) return;
  try {
    var jbId = (typeof ensureUUID === 'function') ? ensureUUID(jb) : jb.id;
    var jobStatusMap = {
      'Scheduled':'pending','scheduled':'pending','In Progress':'active','in_progress':'active',
      'Active':'active','Paused':'on_hold','On Hold':'on_hold','on_hold':'on_hold',
      'Complete':'completed','Completed':'completed','complete':'completed','Closed':'closed',
      'closed':'closed','Invoiced':'invoiced','invoiced':'invoiced'
    };
    var _isUUIDjb = function(v){ return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
    var jbBase = {
      id:              jbId,
      job_number:      jb.num || null,
      name:            jb.name || '',
      customer_id:     _isUUIDjb(jb.customerId) ? jb.customerId : null,
      status:          jobStatusMap[jb.status] || 'pending',
      site_address:    jb.address || null,
      scheduled_start: jb.scheduledDate || jb.startDate || null,
      scheduled_end:   jb.endDate || null,
      is_active:       true,
      created_by:      _currentUser.id
    };
    var jbFull = Object.assign({}, jbBase, {
      customer_name:      jb.customer || null,
      primary_quote_id:   jb.quoteId || null,
      assigned_to:        jb.assignedTo || null,
      crew:               jb.crew || [],
      scheduled_date:     jb.scheduledDate || null,
      scheduled_time:     jb.scheduledTime || null,
      scheduled_duration: jb.scheduledDuration || null,
      est_labor_hours:    jb.estLaborHours || null,
      actual_labor_hours: jb.actualLaborHours || null,
      est_total:          jb.estTotal || null,
      address:            jb.address || null,
      notes:              jb.notes || null,
      dispatch_notes:     jb.dispatchNotes || null,
      contact_id:         jb.contactId || null,
      quote_id:           jb.quoteId || null
    });
    var jbRes = await _sb.from('jobs').upsert(jbFull);
    if (jbRes.error && jbRes.error.message && jbRes.error.message.includes('column')) {
      await _sb.from('jobs').upsert(jbBase);
    } else if (jbRes.error) {
      var _jmsg2 = jbRes.error.message || '';
      // Benign duplicate job_number (imported-history job under a different id) — already in
      // cloud, skip quietly. See the full-sync loop for the full rationale.
      if (!(_jmsg2.indexOf('jobs_job_number_key') >= 0 || (/duplicate key/i.test(_jmsg2) && /job_number/i.test(_jmsg2)))) {
        console.warn('[Job Push]', jbRes.error.message);
      }
    }
  } catch (e) { console.warn('[Job Push]', e.message || e); }
}

async function pushAllToCloud() {
  if (!_sb || !_currentUser) return;
  if (_currentUser.role === 'helper_tech') return;
  // Concurrency lock — prevent overlapping pushes which cause duplicate line item inserts
  if (_pushInProgress) {
    // Re-schedule for after current push completes
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(pushAllToCloud, 3000);
    return;
  }
  _pushInProgress = true;
  // Background push — silent, no spinner, no UI blocking
  var syncEl = document.getElementById('dash-last-updated');
  if (syncEl) syncEl.textContent = 'Saving...';
  // SF-3: Supabase returns {error} on a failed write instead of throwing, so the old
  // per-section try/catch (which only caught throws) let write failures pass and the
  // status still read "Saved". Collect every write failure here and reflect it honestly
  // in the final status instead of always claiming success.
  var _pushErrors = [];
  function _pushErr(label, res) { if (res && res.error) _pushErrors.push(label + ': ' + (res.error.message || res.error)); return res; }
  try {
    // First — process any pending deletions so they don't get restored by upserts below
    if (DB.deletedIds) {
      var dq = DB.deletedIds.quotes   || [];
      var dt = DB.deletedIds.team     || [];
      var dc = DB.deletedIds.customers|| [];
      var dct= DB.deletedIds.contacts || [];
      var dj = DB.deletedIds.jobs     || [];
      // Keep ONLY the tombstones whose cloud delete failed, so they retry next push.
      // Previously this cleared ALL tombstones unconditionally — a failed/blocked
      // delete then left no record and the row resurrected on the next upsert.
      var keepQ=[], keepT=[], keepC=[], keepCt=[], keepJ=[];
      // IMPORTANT: append .select('id') to every delete. Without it, Supabase RLS
      // that blocks the DELETE returns NO error and 0 rows — the old `if (_rq.error)`
      // check saw no error, cleared the tombstone, and the row resurrected on the next
      // pull/upsert. With .select('id') we can tell a real delete (data.length>0) from a
      // blocked/no-op one (empty data) and KEEP the tombstone so the pull filter keeps
      // suppressing the row. A tombstone that never clears is harmless; a lost one is the bug.
      function _delFailed(r){ return !r || r.error || !(r.data && r.data.length); }
      // Quotes delete via the authorized soft-delete RPC (role check + audit +
      // recoverable). The RPC returns an error only on real failure/refusal, so a
      // clean return clears the tombstone; an error keeps it for the next retry.
      for (var qDel of dq) { var _rq = await _sb.rpc('soft_delete_quote', { p_id: qDel }); if (_rq && _rq.error) keepQ.push(qDel); }
      for (var tDel of dt)   { var _rt  = await _sb.rpc('soft_delete_team', { p_id: tDel }); if (_rt  && _rt.error)  keepT.push(tDel); }
      // Customers/contacts/jobs delete via their authorized soft-delete RPCs (role
      // check + audit + recoverable), NOT raw DELETE — same model as quotes. A clean
      // return clears the tombstone; an error keeps it for the next retry.
      for (var cDel of dc)   { var _rc  = await _sb.rpc('soft_delete_customer', { p_id: cDel }); if (_rc  && _rc.error)  keepC.push(cDel); }
      for (var ctDel of dct) { var _rct = await _sb.rpc('soft_delete_contact',  { p_id: ctDel }); if (_rct && _rct.error) keepCt.push(ctDel); }
      for (var jDel of dj)   { var _rj  = await _sb.rpc('soft_delete_job',       { p_id: jDel }); if (_rj  && _rj.error)  keepJ.push(jDel); }
      // catalog/templates/inventory soft-delete via an is_active flag (not an RPC). Retry
      // the flag flip; keep the tombstone only if the update actually errored.
      var dcat = DB.deletedIds.catalog||[], dtmpl = DB.deletedIds.templates||[], dinv = DB.deletedIds.inventory||[];
      var keepCat=[], keepTmpl=[], keepInv=[];
      for (var _ic of dcat)  { var _r1 = await _sb.from('catalog').update({is_active:false}).eq('id',_ic).select('id');   if (_r1 && _r1.error) keepCat.push(_ic); }
      for (var _it of dtmpl) { var _r2 = await _sb.from('templates').update({is_active:false}).eq('id',_it).select('id'); if (_r2 && _r2.error) keepTmpl.push(_it); }
      for (var _ii of dinv)  { var _r3 = await _sb.from('inventory').update({is_active:false}).eq('id',_ii).select('id'); if (_r3 && _r3.error) keepInv.push(_ii); }
      // Work orders and purchase orders are HARD-delete tables (no soft-delete flag).
      // Same RLS-silent-block guard: append .select('id') so a blocked delete (no error,
      // 0 rows) keeps its tombstone instead of resurrecting the row on the next pull.
      var dwo = DB.deletedIds.workOrders||[], dpo = DB.deletedIds.purchaseOrders||[];
      var keepWO=[], keepPO=[];
      for (var _iw of dwo) { var _r4 = await _sb.from('work_orders').delete().eq('id',_iw).select('id'); if (_delFailed(_r4)) keepWO.push(_iw); }
      for (var _ip of dpo) {
        // Cascade line items first so no orphan po_line_items rows are left behind.
        try { await _sb.from('po_line_items').delete().eq('po_id',_ip); } catch(e) {}
        var _r5 = await _sb.from('purchase_orders').delete().eq('id',_ip).select('id'); if (_delFailed(_r5)) keepPO.push(_ip);
      }
      // Time entries soft-delete (deleted=true). UPDATE, so it re-matches on every retry
      // and clears the tombstone once the flag is confirmed persisted. Payroll-sensitive:
      // the tombstone keeps a deleted entry deleted through a pull until the flag reaches
      // the cloud, so deleted hours can't re-inflate pay.
      var dte = DB.deletedIds.timeEntries||[]; var keepTE=[];
      for (var _ite of dte) {
        var _le = (DB.timeEntries||[]).find(function(x){ return String(x.id)===String(_ite); });
        var _r6 = await _sb.from('time_entries').update({
          deleted:true,
          deleted_by: (_le && _le.deletedBy) || (_currentUser ? _currentUser.full_name : null),
          deleted_at: (_le && _le.deletedAt) || new Date().toISOString()
        }).eq('id',_ite).select('id');
        if (_delFailed(_r6)) keepTE.push(_ite);
      }
      // Contracts and recurring contracts are HARD-delete tables (no soft-delete flag).
      // Same RLS-silent-block guard as WO/PO: .select('id') so a blocked delete keeps its
      // tombstone instead of resurrecting on the next pull.
      var dcon = DB.deletedIds.contracts||[], drc = DB.deletedIds.recurringContracts||[];
      var keepCon=[], keepRC=[];
      for (var _icn of dcon) { var _r7 = await _sb.from('contracts').delete().eq('id',_icn).select('id'); if (_delFailed(_r7)) keepCon.push(_icn); }
      for (var _irc of drc) { var _r8 = await _sb.from('recurring_contracts').delete().eq('id',_irc).select('id'); if (_delFailed(_r8)) keepRC.push(_irc); }
      // SC-3b: WO parts are a HARD-delete table (text ids). Same RLS-silent-block guard:
      // .select('id') so a blocked/no-op delete keeps its tombstone rather than letting
      // the row resurrect on the next full-replace pull.
      var dwp = DB.deletedIds.woParts||[]; var keepWP=[];
      for (var _iwp of dwp) { var _r9 = await _sb.from('wo_parts').delete().eq('id',_iwp).select('id'); if (_delFailed(_r9)) keepWP.push(_iwp); }
      // WO child records (labor / expenses / checklist) — HARD-delete tables (text ids).
      // Delete-guard hardening: same single-writer + RLS-silent-block .select('id') pattern
      // as WO parts. deleteWOLabor previously did NO cloud delete at all (payroll-adjacent
      // resurrection risk); deleteWOExpense/deleteWOChecklistItem used unguarded
      // fire-and-forget deletes. Routing all three through here makes deletes reliable,
      // offline-safe (tombstone retries), and RLS-block-safe.
      var dwl = DB.deletedIds.woLabor||[], dwe = DB.deletedIds.woExpenses||[], dwcl = DB.deletedIds.woChecklist||[];
      var keepWL=[], keepWE=[], keepWCl=[];
      for (var _iwl of dwl)  { var _r10 = await _sb.from('wo_labor').delete().eq('id',_iwl).select('id');     if (_delFailed(_r10)) keepWL.push(_iwl); }
      for (var _iwe of dwe)  { var _r11 = await _sb.from('wo_expenses').delete().eq('id',_iwe).select('id');  if (_delFailed(_r11)) keepWE.push(_iwe); }
      for (var _iwc of dwcl) { var _r12 = await _sb.from('wo_checklist').delete().eq('id',_iwc).select('id'); if (_delFailed(_r12)) keepWCl.push(_iwc); }
      // RED #4: invoices — hard-delete table (text ids), same single-writer + .select('id') guard.
      var dinvc = DB.deletedIds.invoices||[]; var keepInvoices=[];
      for (var _iinv of dinvc) { var _r13 = await _sb.from('app_invoices').delete().eq('id',_iinv).select('id'); if (_delFailed(_r13)) keepInvoices.push(_iinv); }
      // Only confirmed cloud deletes (a row actually came back from .select) clear the
      // tombstone; blocked/no-op deletes stay tombstoned so the row never resurrects.
      DB.deletedIds = {quotes:keepQ, team:keepT, customers:keepC, contacts:keepCt, jobs:keepJ, catalog:keepCat, templates:keepTmpl, inventory:keepInv, workOrders:keepWO, purchaseOrders:keepPO, timeEntries:keepTE, contracts:keepCon, recurringContracts:keepRC, woParts:keepWP, woLabor:keepWL, woExpenses:keepWE, woChecklist:keepWCl, invoices:keepInvoices};
      try { _dbPackAsync(DB).then(function(p){ try{ localStorage.setItem(DB_KEY, p); }catch(e){} }); } catch(e) {}
    }
    // Push settings to company_settings (single row, id=1)
    _pushErr('company_settings', await _sb.from('company_settings').upsert({
      id: 1,
      company_name: DB.settings.cname || 'TCSS',
      default_labor_rate: DB.settings.laborRate || 100,
      default_target_margin: DB.settings.targetMargin !== undefined ? DB.settings.targetMargin : 35,
      ma_enabled: DB.settings.managerApproval ? !!DB.settings.managerApproval.enabled : false,
      ma_below_floor_only: DB.settings.managerApproval ? !!DB.settings.managerApproval.belowFloorOnly : true,
      ma_pin_hash: DB.settings.managerApproval ? (DB.settings.managerApproval.pinHash || '') : '',
      ma_pin_salt: DB.settings.managerApproval ? (DB.settings.managerApproval.pinSalt || '') : '',
      // Bundle the per-module settings blobs so they persist + round-trip (RED #5/#6).
      settings_json: Object.assign({}, DB.settings, { _woSettings: DB.woSettings || null, _msSettings: DB.msSettings || null })
    }));

    // Push margin floors — upsert each row
    if (_getMFList) {
      var mfList = _getMFList();
      for (var mf of mfList) {
        if (!mf || !mf.jobType) continue;
        try {
          _pushErr('margin_floors', await _sb.from('margin_floors').upsert({
            job_type: mf.jobType,
            floor_pct: mf.floor !== undefined ? mf.floor : 35,
            notes: mf.notes || ''
          }, { onConflict: 'job_type' }));
        } catch(mfErr) { console.warn('[Push] Margin floor:', mfErr.message||mfErr); }
      }
    }

    // Push quotes
    for (var q of (DB.quotes || [])) {
      if (!q) continue;
      try {
        var qId = ensureUUID(q);
        // Map app status values to schema enum values
        var statusMap = {
          'draft': 'Draft', 'Draft': 'Draft',
          'sent': 'Sent', 'Sent': 'Sent',
          'review': 'Review', 'Review': 'Review',
          'followup': 'Review',
          'approved': 'Approved', 'Approved': 'Approved',
          'won': 'Won', 'Won': 'Won',
          'declined': 'Lost', 'lost': 'Lost', 'Lost': 'Lost',
          'rejected': 'Rejected', 'Rejected': 'Rejected',
          'expired': 'Expired', 'Expired': 'Expired'
        };
        _pushErr('quote '+(q.num||qId), await _sb.from('quotes').upsert({
          id: qId,
          quote_number: q.num || null,
          customer_name: q.cn || null,
          job_id: null,
          sales_rep_name: q.rep || null,
          status: statusMap[q.status] || 'Draft',
          quote_date: q.dt || new Date().toISOString().split('T')[0],
          valid_until: q.vu || null,
          job_name: q.jn || null,
          contact_name: q.contactName || null,
          contact_id: q.contactId || null,
          contact_title: q.contactTitle || null,
          phone: q.ph || null,
          email: q.em || null,
          site_address: q.adStreet || null,
          site_city: q.adCity || null,
          site_state: q.adState || null,
          site_zip: q.adZip || null,
          customer_id: q.customerId || null,
          quote_type: q.jt || null,
          environment: q.env || null,
          pricing_mode: (q.pricingMode === 'markup' ? 'markup' : 'margin'),
          target_margin: q.targetMargin !== undefined ? q.targetMargin : 35,
          labor_rate: q.laborRate || 100,
          tax_rate: q.taxRate || 0,
          discount: q.discount || 0,
          total_material_cost: q.totalMaterialCost || 0,
          total_labor_hours: q.totalLaborHours || 0,
          labor_sell: q.laborSell || 0,
          material_sell: q.materialSell || 0,
          total_cost: q.totalCost || 0,
          sell_before_tax: q.sellBeforeTax || 0,
          tax_amount: q.taxAmt || 0,
          total_sell: q.total || 0,
          achieved_margin_pct: q.achievedMargin || 0,
          below_margin_floor: !!q.belowMarginFloor,
          margin_bypass:    !!(q.marginBypass && q.marginBypass.enabled),
          margin_bypass_by: (q.marginBypass && q.marginBypass.by) || null,
          margin_bypass_at: (q.marginBypass && q.marginBypass.at) || null,
          scope_notes: q.notes || null,
          internal_notes: q.internalNotes || null,
          quote_terms: q.tc || null,
          priority: q.priority || 'Normal',
          lump_sum_enabled: !!(q.lumpSum && q.lumpSum.enabled),
          lump_sum_label: (q.lumpSum && q.lumpSum.label) || null,
          approval_status: (q.approval && q.approval.status) || null,
          approval_token: q.approvalToken || null,
          show_labor_banner: q.showLaborBanner !== undefined ? !!q.showLaborBanner : true,
          permit_data: q.permits ? JSON.stringify(q.permits) : null,
          payment_terms: q.pt || 'Net 30',
          followup_date: q.followupDate || null,
          created_by: _currentUser.id
        }));

        // Push line items ATOMICALLY (SF-1). The old code did a loose
        // delete-then-insert with no error checks: a failed insert left the quote
        // with NO line items in the cloud — pricing silently wiped. replace_quote_line_items
        // does both in one transaction, so a failed insert rolls back the delete and
        // the quote keeps its existing pricing. Guard on Array.isArray (not length>0) so
        // that emptying a quote's items actually clears them in the cloud too — the old
        // length>0 guard left stale line items behind when the last item was removed.
        if (Array.isArray(q.items)) {
          var lineItems = q.items.map(function(item, idx) {
            return {
              sort_order: idx,
              description: item.desc || '',
              category: item.cat || null,
              qty: item.qty || 1,
              unit: item.unit || 'ea',
              material_cost: item.mc || 0,
              labor_hours: item.lh || 0
            };
          });
          var _rli = await _sb.rpc('replace_quote_line_items', { p_quote_id: qId, p_items: lineItems });
          if (_rli && _rli.error) {
            // Do NOT swallow — the quote's pricing is at stake. Surface it so the sync
            // reports a problem instead of a false "Saved". The transaction rolled back,
            // so the previously-stored line items are intact.
            console.warn('[Push] Quote line items error for', q.num, _rli.error.message);
            _pushErrors.push('quote '+(q.num || qId)+' line items: '+_rli.error.message);
          }
        }
      } catch(qErr) {
        console.warn('[Push] Quote error for', q.num, qErr);
      }
    }

    // UUID helpers for legacy IDs
    function isUUID(s) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    }
    function makeUUID() {
      return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){
        return (c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16);
      });
    }
    function ensureUUID(obj) {
      if (!obj.id || !isUUID(obj.id)) {
        // Generate a new UUID and UPDATE the object in DB so it persists
        // This ensures next sync uses the same UUID — no duplicates
        var newId = makeUUID();
        obj.id = newId;
        // saveDB() will be called at end of push cycle
      }
      return obj.id;
    }

    // Assign UUIDs to any customers/quotes with non-UUID IDs BEFORE pushing
    // Do this in one pass so saveDB() captures stable IDs.
    // IMPORTANT: before minting a brand-new UUID for a customer, check whether a
    // matching customer already exists in the cloud (same name + same phone/email).
    // Without this check, the same customer entered independently on two devices/
    // sessions before either had synced would each get their own fresh UUID and
    // become permanent duplicate rows once pushed. This was the root cause of the
    // "Blue Ridge Medical Ctr" duplicate records.
    var needsSave = false;
    var _localNonUuidCustomers = (DB.customers||[]).filter(function(c){ return c && c.id && !isUUID(c.id); });
    if (_localNonUuidCustomers.length) {
      try {
        var { data: _existingCusts } = await _sbSelectAll(function(){ return _sb.from('customers').select('id,name,phone,email'); });
        _existingCusts = _existingCusts || [];
        _localNonUuidCustomers.forEach(function(c){
          var norm = function(s){ return (s||'').toString().trim().toLowerCase().replace(/[^a-z0-9]/g,''); };
          var cName = norm(c.name), cPhone = norm(c.phone), cEmail = norm(c.email);
          var match = _existingCusts.find(function(e){
            var eName = norm(e.name), ePhone = norm(e.phone), eEmail = norm(e.email);
            if (!eName || eName !== cName) return false;
            if (cPhone && ePhone && cPhone === ePhone) return true;
            if (cEmail && eEmail && cEmail === eEmail) return true;
            return false;
          });
          if (match) {
            c.id = match.id; // adopt existing cloud record instead of creating a duplicate
          } else {
            c.id = makeUUID();
          }
          needsSave = true;
        });
      } catch(e) {
        // If the existing-customer lookup fails for any reason, fall back to the
        // old behavior (mint a new UUID) rather than blocking the sync entirely.
        _localNonUuidCustomers.forEach(function(c){ c.id = makeUUID(); needsSave = true; });
      }
    }
    (DB.quotes||[]).forEach(function(q){
      if (q && q.id && !isUUID(q.id)) { q.id = makeUUID(); needsSave = true; }
    });
    if (needsSave) { try { saveDB(); } catch(e) {} }

    // Push customers
    for (var c of (DB.customers || [])) {
      if (!c) continue;
      try {
        var cId = ensureUUID(c);
        _pushErr('customer '+(c.name||cId), await _sb.from('customers').upsert({
          id: cId,
          name: c.name || '',
          company: c.company || null,
          email: c.email || null,
          phone: c.phone || null,
          phone_alt: c.phone2 || null,
          address: c.address || null,
          street: c.street || null,
          city: c.city || null,
          state: c.state || null,
          zip: c.zip || null,
          default_terms: c.defaultTerms || 'Due on Receipt',
          tax_exempt: !!c.taxExempt,
          hot_note_tech:   c.hotNoteTech || null,
          hot_note_office: c.hotNoteOffice || null,
          office_alert_scope: c.officeAlertScope || null,
          invoicing_contact: c.invoicingContact || null,
          invoicing_email:   c.invoicingEmail || null,
          module_alerts:     c.moduleAlerts || null,
          notes: c.notes || null,
          is_active: c.active !== false,
          created_by: _currentUser.id
        }));
      } catch(cErr) {
        console.warn('[Push] Customer error for', c.name, cErr);
      }
    }

    // Push catalog
    for (var item of (DB.catalog || [])) {
      if (!item) continue;
      try {
        var itemId = ensureUUID(item);
        _pushErr('catalog '+(item.name||itemId), await _sb.from('catalog').upsert({
          id: itemId,
          name: item.name || '',
          description: item.desc || null,
          category: item.cat || null,
          unit: item.unit || 'ea',
          default_cost: (item.mc != null ? item.mc : (item.cost || 0)),
          default_hours: (item.lh != null ? item.lh : (item.hours || 0)),
          notes: item.notes || null,
          is_active: item.active !== false
        }));
      } catch(iErr) {
        console.warn('[Push] Catalog error for', item.name, iErr);
      }
    }

    // Push templates
    for (var t of (DB.templates || [])) {
      if (!t) continue;
      try {
        var tId = ensureUUID(t);
        _pushErr('template '+(t.name||tId), await _sb.from('templates').upsert({
          id: tId,
          name: t.name || '',
          category: t.cat || null,
          description: t.desc || null,
          items: t.items || [],
          is_active: t.active !== false,   // was hardcoded true, which un-deleted templates
          created_by: _currentUser.id
        }));
      } catch(tErr) {
        console.warn('[Push] Template error for', t.name, tErr);
      }
    }

    // Push contacts
    for (var ct of (DB.contacts || [])) {
      if (!ct || !ct.name) continue;
      try {
        var ctId = ensureUUID(ct);
        // Try with extended columns first; fall back to base schema if columns not yet added
        // Only send customer_id if it looks like a UUID — legacy 'cust-XXXX' IDs are not valid uuid type
        var _isUUID = function(v){ return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
        var ctBase = {
          id:          ctId,
          name:        ct.name || '',
          customer_id: _isUUID(ct.customerId) ? ct.customerId : null,
          phone:       ct.phone || null,
          email:       ct.email || null,
          title:       ct.role || ct.title || null,
          notes:       ct.notes || null,
          is_active:   true
        };
        var ctFull = Object.assign({}, ctBase, {
          company:      ct.company || null,
          contact_type: ct.contactType || null,
          contact_pref: ct.contactPref || null
        });
        var ctRes = await _sb.from('contacts').upsert(ctFull);
        if (ctRes.error && ctRes.error.message && ctRes.error.message.includes('column')) {
          _pushErr('contact '+(ct.name||ctId), await _sb.from('contacts').upsert(ctBase));
        } else if (ctRes.error) {
          console.warn('[Push] Contact error for', ct.name, ctRes.error.message);
          _pushErrors.push('contact '+(ct.name||ctId)+': '+ctRes.error.message);
        }
      } catch(ctErr) {
        console.warn('[Push] Contact error for', ct.name, ctErr.message || ctErr);
      }
    }

    // Push team
    for (var tm of (DB.team || [])) {
      if (!tm || !tm.name) continue;
      try {
        var tmId = ensureUUID(tm);
        var { error: tmErr } = await _sb.from('team').upsert({
          id:           tmId,
          full_name:    tm.name || '',
          role:         tm.role || 'field',
          phone:        tm.phone || null,
          email:        tm.email || null,
          rate:         parseFloat(tm.rate) || 65,
          hire_date:    tm.hireDate || null,
          show_vacation: !!tm.showVacation,
          show_pto:     !!tm.showPTO,
          is_active:    tm.active !== false,
          sms_enabled:  tm.smsEnabled !== false,
          created_by:   _currentUser.id
        });
        if (tmErr) { console.warn('[Push] Team error for', tm.name, tmErr.message); _pushErrors.push('team '+(tm.name)+': '+tmErr.message); }
      } catch(tmCatch) {
        console.warn('[Push] Team error for', tm.name, tmCatch.message || tmCatch);
      }
    }

    // Push time entries — one shared row mapper (_timeEntryToRow) with the manual
    // push, so both write the identical full column set including the deleted flag.
    for (var te of (DB.timeEntries || [])) {
      if (!te || !te.id) continue;
      try {
        var teRow = (typeof _timeEntryToRow === 'function') ? _timeEntryToRow(te) : null;
        if (!teRow) continue;
        var { error: teErr } = await _sb.from('time_entries').upsert(teRow, {onConflict:'id'});
        if (teErr) { console.warn('[Push] Time entry error:', teErr.message); _pushErrors.push('time entry '+(te.id)+': '+teErr.message); }
      } catch(teCatch) { console.warn('[Push] Time entry error:', teCatch.message||teCatch); }
    }

    // Push work days (payroll) — migration _15. Previously local-only, so payroll data
    // lived per-device; now synced per-row via _workDayToRow, same model as time_entries.
    // workDays has no delete path, so no tombstones — pure upsert.
    for (var wd of (DB.workDays || [])) {
      if (!wd || !wd.id) continue;
      try {
        var wdRow = (typeof _workDayToRow === 'function') ? _workDayToRow(wd) : null;
        if (!wdRow) continue;
        var { error: wdErr } = await _sb.from('app_work_days').upsert(wdRow, {onConflict:'id'});
        if (wdErr) { console.warn('[Push] Work day error:', wdErr.message); _pushErrors.push('work day '+(wd.id)+': '+wdErr.message); }
      } catch(wdCatch) { console.warn('[Push] Work day error:', wdCatch.message||wdCatch); }
    }

    // Push invoices — migration _16 (RED #4). Whole invoice object as jsonb `data`
    // plus queryable columns, mapped across the three shapes (WO / recurring-MSC /
    // manual). Per-row upsert, deletes handled by the tombstone loop above.
    for (var inv0 of (DB.invoices || [])) {
      if (!inv0 || !inv0.id) continue;
      try {
        var _invRow = {
          id:            inv0.id,
          num:           inv0.num || null,
          inv_type:      inv0.type || (inv0.woId ? 'workorder' : 'manual'),
          status:        inv0.status || null,
          customer_name: inv0.clientName || (inv0.job && inv0.job.customer) || inv0.customerName || null,
          total:         (inv0.total != null) ? inv0.total : ((inv0.amount != null) ? inv0.amount : null),
          invoice_date:  inv0.invoiceDate || inv0.date || null,
          data:          inv0,
          updated_at:    new Date().toISOString()
        };
        var { error: invErr } = await _sb.from('app_invoices').upsert(_invRow, {onConflict:'id'});
        if (invErr) { console.warn('[Push] Invoice error:', invErr.message); _pushErrors.push('invoice '+(inv0.id)+': '+invErr.message); }
        else { inv0._synced = true; }  // pushed → safe in cloud; load-on-demand bounding may drop it from memory
      } catch(invCatch) { console.warn('[Push] Invoice error:', invCatch.message||invCatch); }
    }

    // Push inventory
    for (var inv of (DB.inventory || [])) {
      if (!inv || !inv.id) continue;
      try {
        _pushErr('inventory '+(inv.name||inv.id), await _sb.from('inventory').upsert({
          id:         inv.id,
          name:       inv.name,
          tag:        inv.tag||null,
          category:   inv.cat||'General',
          part_num:   inv.partNum||null,
          barcode:    inv.barcode||null,
          returnable: !!inv.returnable,
          locations:  inv.locations||null,
          qty:        inv.qty||0,
          min_qty:    inv.minQty||0,
          unit_cost:  inv.cost||0,
          notes:      inv.notes||null,
          created_by: _currentUser.id
        }, {onConflict:'id'}));
      } catch(invErr) { console.warn('[Push] Inventory:', invErr.message||invErr); }
    }

    // SC-2: removed an orphan push of DB.wtCheckoffs into the `work_tracking` table.
    // That was dead/wrong on two counts: (1) DB.wtCheckoffs is a legacy global that
    // nothing populates from the cloud anymore (it is initialized empty in core.js and
    // only read by legacy report code), and (2) the live work-tracking module persists
    // check-offs to the `wt_checkoffs` table with its own upsert/delete path
    // (js/worktracking.js). The `work_tracking` table is empty and unused. Writing an
    // always-empty array to a dead table did nothing but risk future confusion.

    // Push jobs
    var _activeJobsForStats = typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[]);
  for (var jb of _activeJobsForStats) {
      if (!jb || !jb.name) continue;
      try {
        var jbId = ensureUUID(jb);
        // Map app status to Supabase enum — exact values: pending, active, on_hold, completed, invoiced, closed
        var jobStatusMap = {
          'Scheduled':   'pending',
          'scheduled':   'pending',
          'In Progress': 'active',
          'in_progress': 'active',
          'Active':      'active',
          'Paused':      'on_hold',
          'On Hold':     'on_hold',
          'on_hold':     'on_hold',
          'Complete':    'completed',
          'Completed':   'completed',
          'complete':    'completed',
          'Closed':      'closed',
          'closed':      'closed',
          'Invoiced':    'invoiced',
          'invoiced':    'invoiced'
        };
        var _isUUIDjb = function(v){ return v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); };
        // Base schema columns — always safe to push
        var jbBase = {
          id:              jbId,
          job_number:      jb.num || null,
          name:            jb.name || '',
          customer_id:     _isUUIDjb(jb.customerId) ? jb.customerId : null,
          status:          jobStatusMap[jb.status] || 'pending',
          site_address:    jb.address || null,
          scheduled_start: jb.scheduledDate || jb.startDate || null,
          scheduled_end:   jb.endDate || null,
          is_active:       true,
          created_by:      _currentUser.id
        };
        // Extended custom columns (require ALTER TABLE — see master ref 3.1)
        var jbFull = Object.assign({}, jbBase, {
          customer_name:      jb.customer || null,
          primary_quote_id:   jb.quoteId || null,
          assigned_to:        jb.assignedTo || null,
          crew:               jb.crew || [],
          scheduled_date:     jb.scheduledDate || null,
          scheduled_time:     jb.scheduledTime || null,
          scheduled_duration: jb.scheduledDuration || null,
          est_labor_hours:    jb.estLaborHours || null,
          actual_labor_hours: jb.actualLaborHours || null,
          est_total:          jb.estTotal || null,
          address:            jb.address || null,
          notes:              jb.notes || null,
          dispatch_notes:     jb.dispatchNotes || null,
          contact_id:         jb.contactId || null,
          quote_id:           jb.quoteId || null
        });
        var jbRes = await _sb.from('jobs').upsert(jbFull);
        if (jbRes.error && jbRes.error.message && jbRes.error.message.includes('column')) {
          // Custom columns not yet added — fall back to base schema
          console.warn('[Push] Job falling back to base schema for', jb.name);
          var jbRes2 = await _sb.from('jobs').upsert(jbBase);
          if (jbRes2.error) { console.warn('[Push] Job base error for', jb.name, jbRes2.error.message); _pushErrors.push('job '+(jb.name)+': '+jbRes2.error.message); }
        } else if (jbRes.error) {
          var _jmsg = jbRes.error.message || '';
          // Benign: a job with this number already exists in the cloud (imported-history job
          // held under a different id). Upsert keys on id, so the unique job_number constraint
          // trips for these — the record is already there, nothing is lost. Skip quietly instead
          // of spamming the console + error list on every full sync. Normal same-id edits still
          // update correctly (they don't collide). Real errors still surface below.
          if (_jmsg.indexOf('jobs_job_number_key') >= 0 || (/duplicate key/i.test(_jmsg) && /job_number/i.test(_jmsg))) {
            /* already in cloud — no-op */
          } else {
            console.warn('[Push] Job error for', jb.name, jbRes.error.message);
            if (jbRes.error.details) console.warn('[Push] Job details:', jbRes.error.details);
            if (jbRes.error.hint) console.warn('[Push] Job hint:', jbRes.error.hint);
            _pushErrors.push('job '+(jb.name)+': '+jbRes.error.message);
          }
        }
      } catch(jbErr) {
        console.warn('[Push] Job error for', jb.name, jbErr.message || jbErr);
      }
    }

    // SC-3b: Push WO parts. Previously parts were pulled but NEVER pushed, so any part
    // created locally — from the WO Parts tab, the inventory scanner, or a PO receipt,
    // all of which write to DB.woParts — was wiped on the next full-replace pull. This
    // one bulk upsert covers every creation path uniformly (each calls saveDB(), which
    // schedules this push). Text ids ('wop-…') match the table, so no UUID conversion.
    // Tombstoned ids are skipped so a part being deleted isn't re-created by its own upsert.
    var _wpTomb = (DB.deletedIds && DB.deletedIds.woParts) || [];
    for (var wp of (DB.woParts||[])) {
      if (!wp || !wp.id) continue;
      if (_wpTomb.indexOf(String(wp.id)) >= 0) continue;
      try {
        _pushErr('wo_part '+(wp.name||wp.id), await _sb.from('wo_parts').upsert({
          id:           wp.id,
          wo_id:        wp.woId||null,
          part_name:    wp.name||null,
          part_num:     wp.partNum||null,
          quantity:     wp.qty||0,
          unit:         wp.unit||null,
          unit_cost:    (wp.unitCost!=null)?wp.unitCost:0,
          status:       wp.status||'requested',
          notes:        wp.notes||null,
          requested_by: wp.requestedBy||null,
          created_at:   wp.createdAt||new Date().toISOString()
        }, {onConflict:'id'}));
      } catch(wpErr) { console.warn('[Push] WO part:', wpErr.message||wpErr); }
    }

    // Push WO labor / expenses / checklist (sync-audit RED #1-3). These previously had NO
    // create/edit push (expenses none; labor only a manual-add insert; checklist only a
    // create insert, never the toggle) — so records were lost or reverted on the next
    // full-replace pull. Bulk upsert covers create AND edit for all three, same model as
    // wo_parts. Deletes are already tombstone-guarded above. Skip tombstoned ids.
    var _wlTomb = (DB.deletedIds && DB.deletedIds.woLabor) || [];
    for (var wl of (DB.woLabor||[])) {
      if (!wl || !wl.id) continue;
      if (_wlTomb.indexOf(String(wl.id)) >= 0) continue;
      try {
        _pushErr('wo_labor '+wl.id, await _sb.from('wo_labor').upsert({
          id:         wl.id,
          wo_id:      wl.woId||null,
          tech_name:  wl.techName||null,
          tech_id:    wl.techId||null,
          entry_type: wl.entryType||'work',
          clock_in:   wl.clockIn||null,
          clock_out:  wl.clockOut||null,
          hours:      (wl.hours!=null)?wl.hours:null,
          rate:       (wl.rate!=null)?wl.rate:null,
          notes:      wl.notes||null,
          created_at: wl.createdAt||new Date().toISOString()
        }, {onConflict:'id'}));
      } catch(wlErr) { console.warn('[Push] WO labor:', wlErr.message||wlErr); }
    }
    var _weTomb = (DB.deletedIds && DB.deletedIds.woExpenses) || [];
    for (var we of (DB.woExpenses||[])) {
      if (!we || !we.id) continue;
      if (_weTomb.indexOf(String(we.id)) >= 0) continue;
      try {
        _pushErr('wo_expense '+we.id, await _sb.from('wo_expenses').upsert({
          id:            we.id,
          wo_id:         we.woId||null,
          category:      we.category||null,
          description:   we.description||null,
          amount:        (we.amount!=null)?we.amount:null,
          payment_type:  we.paymentType||null,
          logged_by:     we.loggedBy||null,
          expense_date:  we.date||null,
          receipt_url:   we.receiptUrl||null,
          receipt_doc_id:we.receiptDocId||null,
          created_at:    we.createdAt||new Date().toISOString()
        }, {onConflict:'id'}));
      } catch(weErr) { console.warn('[Push] WO expense:', weErr.message||weErr); }
    }
    var _wcTomb = (DB.deletedIds && DB.deletedIds.woChecklist) || [];
    for (var wc of (DB.woChecklist||[])) {
      if (!wc || !wc.id) continue;
      if (_wcTomb.indexOf(String(wc.id)) >= 0) continue;
      try {
        _pushErr('wo_checklist '+wc.id, await _sb.from('wo_checklist').upsert({
          id:           wc.id,
          wo_id:        wc.woId||null,
          item:         wc.item||null,
          completed:    !!wc.completed,
          completed_by: wc.completedBy||null,
          completed_at: wc.completedAt||null,
          created_at:   wc.createdAt||new Date().toISOString()
        }, {onConflict:'id'}));
      } catch(wcErr) { console.warn('[Push] WO checklist:', wcErr.message||wcErr); }
    }

    // Push recurring contracts (Managed Services)
    for (var rc of (DB.recurringContracts||[])) {
      try {
        _pushErr('recurring contract '+(rc.number||rc.id), await _sb.from('recurring_contracts').upsert({
          id:rc.id, number:rc.number, client:rc.client, type:rc.type,
          billing_cycle:rc.billingCycle, billing_day:rc.billingDay||1,
          status:rc.status||'active', auto_renew:!!rc.autoRenew,
          delivery_method:rc.deliveryMethod||'email', client_email:rc.clientEmail||null,
          contract_start:rc.contractStart||null, contract_end:rc.contractEnd||null,
          next_billing_date:rc.nextBillingDate||null, last_billed_date:rc.lastBilledDate||null,
          line_items:rc.lineItems||[], notes:rc.notes||null,
          do_not_bill:!!rc.doNotBill, sort_order:rc.sortOrder||0,
          price_history:rc.priceHistory||[], created_at:rc.createdAt||new Date().toISOString()
        }));
      } catch(rcErr) { console.warn('[Push] RC:', rcErr.message||rcErr); }
    }

    // Persist secondary collections that have no dedicated table (tools & assets,
    // tool checkouts, checkout log, inventory locations/transfers). Stored as whole-
    // collection JSON blobs in app_state so they survive reloads and reach every device.
    var _blobKeys = ['tools','toolCheckouts','checkoutLog','invLocations','invTransfers','timeOffRequests','absences',
      // sync-audit RED #7: payroll/tool side-records that were local-only (per-device). Arrays,
      // synced via the app_state blob store (whole-array last-write-wins — fine for these
      // low-frequency, office-written collections; strictly better than never syncing).
      'lunchFlags','payrollLog','timeCorrections','leaveForfeiture','toolLoans'];
    for (var _bk of _blobKeys) {
      try { await _sb.from('app_state').upsert({ key: _bk, data: DB[_bk] || [], updated_at: new Date().toISOString() }, { onConflict: 'key' }); }
      catch(_be) { console.warn('[Push] app_state', _bk, _be && _be.message); }
    }

  } catch(e) {
    console.error('Push error:', e);
    _pushErrors.push('sync aborted: ' + (e.message || e));
    showToast('Sync error — changes saved locally', 'warning');
  } finally {
    _pushInProgress = false;
  }
  // SF-3: tell the truth. Only claim "Saved" when every cloud write actually
  // succeeded; otherwise show that some writes failed (they stay in local storage
  // and retry on the next push) instead of a misleading green "Saved".
  var syncEl = document.getElementById('dash-last-updated');
  var _now = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  if (_pushErrors.length) {
    console.warn('[Push] '+_pushErrors.length+' write(s) failed this sync:', _pushErrors);
    if (syncEl) { syncEl.textContent = '⚠ '+_pushErrors.length+' item(s) not synced — kept locally, will retry'; syncEl.title = _pushErrors.slice(0,10).join('\n'); }
    if (typeof showToast === 'function') showToast(_pushErrors.length+' change(s) could not be saved to the cloud — kept locally and will retry', 'warning', 5000);
  } else {
    if (syncEl) { syncEl.textContent = 'Saved ' + _now; syncEl.title = ''; }
  }
  // No hideSpinner — push runs silently in background
}

// Cloud push is now built into saveDB directly — no override needed

// Toast notification
function showSpinner(msg) {
  var el = document.getElementById('tc-spinner-overlay');
  var msgEl = document.getElementById('tc-spinner-msg');
  if (el) { el.style.display = 'flex'; }
  if (msgEl) msgEl.textContent = msg || 'Loading...';
}
function hideSpinner() {
  var el = document.getElementById('tc-spinner-overlay');
  if (el) el.style.display = 'none';
}

function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 3000;
  var colors = { success:'#2e7d32', error:'#c62828', warning:'#e65100', info:'#1565c0' };
  var toast = document.getElementById('tcss-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'tcss-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:10px;color:#fff;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.2);transition:opacity .3s;pointer-events:none';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = colors[type] || colors.info;
  toast.style.opacity = '1';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(function(){ toast.style.opacity='0'; }, duration);
}

// ---- AUTH MODAL ----
function showAuthModal() {
  var modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'flex';
  showSignIn();
  // Handle magic link / password reset redirect. Use the arrival flag captured at
  // boot (the URL hash may already be stripped by detectSessionInUrl by now).
  var hash = window.location.hash;
  var arrived = (window.__pbAuthArrival) || (hash && (hash.includes('access_token') || hash.includes('type=recovery')));
  if (arrived && !window.__pbArrivalHandled) {
    window.__pbArrivalHandled = true;
    _handleAuthRedirect();
  }
}
function hideAuthModal() {
  var modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'none';
}
function showSignIn() {
  var sf = document.getElementById('auth-signin-form');
  var ff = document.getElementById('auth-forgot-form');
  if (sf) sf.style.display = '';
  if (ff) ff.style.display = 'none';
  clearAuthMessages();
}
function showForgotPassword() {
  var sf = document.getElementById('auth-signin-form');
  var ff = document.getElementById('auth-forgot-form');
  if (sf) sf.style.display = 'none';
  if (ff) ff.style.display = '';
  clearAuthMessages();
  var resetEl = document.getElementById('auth-reset-email');
  var emailEl = document.getElementById('auth-email');
  if (resetEl && emailEl) resetEl.value = emailEl.value;
}
function clearAuthMessages() {
  var errEl = document.getElementById('auth-error');
  var sucEl = document.getElementById('auth-success');
  if (errEl) { errEl.style.display='none'; errEl.textContent=''; }
  if (sucEl) { sucEl.style.display='none'; sucEl.textContent=''; }
}
function showAuthError(msg) {
  var errEl = document.getElementById('auth-error');
  if (errEl) { errEl.style.display=''; errEl.textContent=msg; }
}
function showAuthSuccess(msg) {
  var sucEl = document.getElementById('auth-success');
  if (sucEl) { sucEl.style.display=''; sucEl.textContent=msg; }
}

async function doPasswordReset() {
  var email = ((document.getElementById('auth-reset-email')||{}).value||'').trim();
  if (!email) { showAuthError('Enter your email address'); return; }
  if (!_sb) { showAuthError('Not connected'); return; }
  clearAuthMessages();
  var btn = document.querySelector('#auth-forgot-form button');
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }
  var redirectTo = window.location.origin + window.location.pathname;
  var { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
  if (btn) { btn.textContent = 'Send Reset Link'; btn.disabled = false; }
  if (error) { showAuthError(error.message); return; }
  showAuthSuccess('✓ Reset link sent to '+email+' — check your inbox');
  setTimeout(showSignIn, 4000);
}

async function _handleAuthRedirect() {
  if (!_sb) return;
  // Recovery vs invite: prefer the flag captured at boot (the URL hash is usually
  // already stripped by detectSessionInUrl by the time this runs), falling back to
  // whatever is still on the hash.
  var _hash = String(window.location.hash || '');
  var _isRecovery = !!window.__pbAuthRecovery || /type=recovery/.test(_hash);
  var { data, error } = await _sb.auth.getSession();
  if (data && data.session) {
    hideAuthModal();
    var u = (data.session.user) || {};
    var meta = u.user_metadata || {};
    // MANDATORY set-password gate. A new member onboards via a passwordless magic-link
    // invite (signInWithOtp) and would otherwise never have a real password — leaving
    // magic links as the only way in. Force them to choose one now. A recovery link
    // (Forgot password) also lands here and must let them set the new password.
    var needsPassword = _isRecovery || (meta.password_set !== true);
    if (needsPassword) {
      // Strip the tokens from the URL right away while the gate is up.
      history.replaceState(null, '', window.location.pathname);
      _showSetPasswordGate({ recovery: _isRecovery, name: (u.email || '') });
      return; // The gate drives the rest of onboarding once a password is saved.
    }
    await loadCurrentUserProfile();
    syncAllFromCloud();
    // Clear hash from URL
    history.replaceState(null, '', window.location.pathname);
  }
}

// MANDATORY set-password gate (full-screen, blocking). Shown when a member arrives
// via a magic-link invite (no password chosen yet, user_metadata.password_set!==true)
// or a password-recovery link. The app stays locked behind this until a permanent
// password is saved via _sb.auth.updateUser(). We stamp user_metadata.password_set=true
// so returning members go straight through and only ever see this once.
// Onboarding order: password first (here) -> loadCurrentUserProfile(), which then shows
// the pending-approval screen if an admin hasn't activated the account yet.
function _showSetPasswordGate(opts) {
  opts = opts || {};
  var recovery = !!opts.recovery;
  var ov = document.getElementById('set-password-overlay');
  if (!ov) { ov = document.createElement('div'); ov.id = 'set-password-overlay'; document.body.appendChild(ov); }
  ov.style.cssText = 'position:fixed;inset:0;z-index:2100000;background:#0d1b2a;color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-family:system-ui,Arial,sans-serif';
  var title = recovery ? 'Set a New Password' : 'Set Your Password';
  var lead = recovery
    ? 'Choose a new password for your ProBid account. You’ll use it to sign in from now on.'
    : 'Welcome to ProBid! Before you continue, choose a password for your account. From now on you’ll sign in with your email and this password.';
  ov.innerHTML =
    '<div style="max-width:420px;width:100%">'+
      '<div style="font-size:44px;margin-bottom:10px">🔐</div>'+
      '<h2 style="margin:0 0 10px;font-size:22px">'+title+'</h2>'+
      '<p style="font-size:14px;line-height:1.6;color:#cfd8e3">'+lead+'</p>'+
      '<div style="margin-top:18px;text-align:left">'+
        '<input id="spg-pw1" type="password" autocomplete="new-password" placeholder="New password (min 8 characters)" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid #456;background:#12263a;color:#fff;font-size:15px;margin-bottom:10px">'+
        '<input id="spg-pw2" type="password" autocomplete="new-password" placeholder="Confirm password" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:8px;border:1px solid #456;background:#12263a;color:#fff;font-size:15px">'+
        '<div id="spg-err" style="display:none;color:#ff8a80;font-size:13px;margin-top:10px"></div>'+
      '</div>'+
      '<div style="margin-top:18px">'+
        '<button id="spg-save" style="background:#1565c0;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:15px;font-weight:700;cursor:pointer;width:100%">Save Password &amp; Continue</button>'+
      '</div>'+
      '<div style="margin-top:14px">'+
        '<button id="spg-signout" style="background:none;border:none;color:#90a4ae;font-size:13px;cursor:pointer;text-decoration:underline">Sign out</button>'+
      '</div>'+
    '</div>';
  var errEl = document.getElementById('spg-err');
  var showErr = function(m){ if(errEl){ errEl.style.display=''; errEl.textContent=m; } };
  var btn = document.getElementById('spg-save');
  var submit = async function(){
    var p1 = ((document.getElementById('spg-pw1')||{}).value) || '';
    var p2 = ((document.getElementById('spg-pw2')||{}).value) || '';
    if (p1.length < 8) { showErr('Password must be at least 8 characters.'); return; }
    if (p1 !== p2) { showErr('Passwords don’t match — please re-type them.'); return; }
    if (errEl) errEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      var r = await _sb.auth.updateUser({ password: p1, data: { password_set: true } });
      if (r && r.error) {
        showErr(r.error.message || 'Could not save password.');
        if (btn) { btn.disabled = false; btn.textContent = 'Save Password & Continue'; }
        return;
      }
    } catch(e) {
      showErr('Could not save password — please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Save Password & Continue'; }
      return;
    }
    // Saved. Tear down the gate and finish onboarding (pending-approval screen next
    // if the account still isn't active).
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    try { showToast('✓ Password set — use your email and this password to sign in next time.','success',5000); } catch(e){}
    await loadCurrentUserProfile();
    syncAllFromCloud();
  };
  if (btn) btn.onclick = submit;
  var signout = document.getElementById('spg-signout');
  if (signout) signout.onclick = async function(){ try { await _sb.auth.signOut(); } catch(e){} location.reload(); };
  var pw2 = document.getElementById('spg-pw2');
  if (pw2) pw2.addEventListener('keydown', function(e){ if (e.key === 'Enter') submit(); });
  var pw1 = document.getElementById('spg-pw1');
  if (pw1) setTimeout(function(){ try { pw1.focus(); } catch(e){} }, 60);
}

// ---- USER MANAGEMENT (Owners only) ----
var TCSS_USERS = [
  { name:'Joe Kucinski',          role:'owner',     email:'joek@tcss.com',                   phone:'336-736-6507', title:'Owner / GM' },
  { name:'Jordan Davis',          role:'owner',     email:'jordand@tcss.com',                phone:'252-314-8370', title:'Owner' },
  { name:'Dawn Brown',            role:'back_office', email:'dawnb@tcss.com',                phone:'919-214-1186', title:'Office Admin' },
  { name:'Lisa Lammonds',         role:'back_office', email:'lisam@tcss.com',                phone:'336-257-4725', title:'Office Assistant' },
  { name:'Victoria Davis',        role:'back_office', email:'Victoriad@tcss.com',            phone:'336-302-3979', title:'Financial Manager' },
  { name:'Evan Morris',           role:'back_office', email:'evanm@tcss.com',                phone:'336-447-8507', title:'Project Management' },
  { name:'Chris Jackson',         role:'lead_tech', email:'chrisj@tcss.com',                 phone:'336-964-5476', title:'Lead Technician' },
  { name:'Ernie Johnson',         role:'lead_tech', email:'erniej@tcss.com',                 phone:'336-736-6490', title:'Lead Technician' },
  { name:'David Corona',          role:'field',     email:'corona.david179@icloud.com',      phone:'336-483-5677', title:'Technician' },
  { name:'Aron Smith',            role:'field',     email:'thescavenger514@gmail.com',       phone:'336-615-2690', title:'Technician' },
  { name:'Tyler Turner',          role:'field',     email:'tylergsp@aol.com',                phone:'781-361-2724', title:'Technician' },
  { name:'Caleb Thomas',          role:'field',     email:'icvleb@gmail.com',                phone:'336-257-2456', title:'Technician' },
  { name:'John Wilson',           role:'field',     email:'spam3@tcss.com',                  phone:'828-747-8116', title:'Technician' },
  { name:'Chad Fulghum',          role:'field',     email:'cfulghum1497@gmail.com',          phone:'336-780-0434', title:'Technician' },
  { name:'Irving Velazquez-Luna', role:'field',     email:'irvingvelazquezluna@gmail.com',   phone:'336-521-2942', title:'Technician' },
  { name:'Isai Ramirez',          role:'field',     email:'isaikitzapata@gmail.com',         phone:'336-624-2372', title:'Technician' },
  { name:'Jonathan Scarberry',    role:'field',     email:'jscarberry20190@yahoo.com',       phone:'336-523-8881', title:'Technician' },
  { name:'Michael Collins',       role:'field',     email:'michaelcollins1781799@gmail.com', phone:'336-906-3693', title:'Technician' },
  { name:'Rashun Allmond',        role:'field',     email:'rashunallmond33@icloud.com',      phone:'336-460-5158', title:'Technician' },
  { name:'Marcus Pineda',         role:'field',     email:'pinedmarcus45@yahoo.com',         phone:'830-499-2470', title:'Technician' },
  { name:'Larry Voncannon',       role:'field',     email:'larry.voncannon@gmail.com',       phone:'336-267-1403', title:'Maintenance' },
];

// ---- MOBILE NAVIGATION ----
function toggleMobileMenu() {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('mobile-overlay');
  if (!sidebar) return;
  var isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    sidebar.classList.remove('mobile-open');
    sidebar.style.transform = 'translateX(-220px)';
    sidebar.style.boxShadow = 'none';
    if (overlay) overlay.classList.remove('visible');
  } else {
    sidebar.classList.add('mobile-open');
    sidebar.style.transform = 'translateX(0)';
    sidebar.style.boxShadow = '4px 0 20px rgba(0,0,0,.4)';
    if (overlay) overlay.classList.add('visible');
  }
}

function checkMobileMode() {
  // Use screen width as the ONLY trigger — avoids false positives on touch laptops
  var isMobile  = window.innerWidth <= 900;
  var mobileNav = document.getElementById('mobile-nav');
  var menuBtn   = document.getElementById('mobile-menu-btn');
  var sidebar   = document.getElementById('sidebar');
  var content   = document.getElementById('content');
  var topbar    = document.getElementById('topbar');

  if (isMobile) {
    if (mobileNav) mobileNav.style.display = 'flex';
    if (menuBtn)   menuBtn.style.display   = 'block';
    if (sidebar)   { sidebar.style.transform='translateX(-220px)'; sidebar.style.boxShadow='none'; }
    if (content)   { content.style.marginLeft='0'; content.style.paddingBottom='72px'; }
    if (topbar)    topbar.style.left = '0';
    document.body.classList.add('is-mobile');
  } else {
    if (mobileNav) mobileNav.style.display = 'none';
    if (menuBtn)   menuBtn.style.display   = 'none';
    if (sidebar)   { sidebar.style.transform='translateX(0)'; sidebar.style.boxShadow=''; }
    if (content)   { content.style.marginLeft='220px'; content.style.paddingBottom=''; }
    if (topbar)    topbar.style.left = '220px';
    document.body.classList.remove('is-mobile');
    var overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.classList.remove('visible');
  }
}

function mobileNav(page) {
  // Update bottom nav active state
  var items = document.querySelectorAll('.mob-nav-item');
  items.forEach(function(item){ item.classList.remove('active'); });
  var active = document.getElementById('mob-' + page);
  if (active) active.classList.add('active');
  // Navigate
  goPage(page);
  // Close sidebar if open
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('mobile-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('visible');
}

// Mobile nav sync is now built into goPage directly

// ---- AUTH HELPERS ----
async function doSignIn() {
  var email    = ((document.getElementById('auth-email')||{}).value||'').trim();
  var password = (document.getElementById('auth-password')||{}).value || '';
  if (!email || !password) {
    showAuthError('Please enter your email and password.');
    return;
  }
  clearAuthMessages();
  var btn = document.getElementById('auth-btn');
  if (btn) { btn.textContent='Signing in...'; btn.disabled=true; }
  var result = await signIn(email, password);
  if (result.error) {
    var msg = result.error.message||'Sign in failed.';
    if (msg.includes('Invalid login')) msg = 'Incorrect email or password. Check your credentials or use Forgot Password.';
    if (msg.includes('Email not confirmed')) msg = 'Check your inbox — you need to verify your email before signing in.';
    showAuthError(msg);
    if (btn) { btn.textContent='Sign In →'; btn.disabled=false; }
  }
}

async function doSignOut() {
  hideUserMenu();
  if (confirm('Sign out of TCSS ProBid?')) await signOut();
}

function showUserMenu() {
  var menu = document.getElementById('user-menu');
  if (!menu) return;
  if (menu.style.display==='none'||!menu.style.display) {
    var nameEl  = document.getElementById('user-menu-name');
    var roleEl  = document.getElementById('user-menu-role');
    var adminEl = document.getElementById('user-menu-admin');
    if (nameEl && _currentUser) nameEl.textContent = _currentUser.full_name;
    if (roleEl && _currentUser) roleEl.textContent = _currentUser.role.charAt(0).toUpperCase()+_currentUser.role.slice(1)+' — '+(_currentUser.job_title||'');
    if (adminEl) adminEl.style.display = (_currentUser&&_currentUser.role==='owner') ? 'flex' : 'none';
    menu.style.display = 'block';
    setTimeout(function(){ document.addEventListener('click', hideUserMenuOutside, {once:true}); }, 10);
  } else {
    hideUserMenu();
  }
}

function hideUserMenu() {
  var m = document.getElementById('user-menu');
  if (m) m.style.display = 'none';
}

function hideUserMenuOutside(e) {
  var menu  = document.getElementById('user-menu');
  var badge = document.getElementById('user-badge');
  if (menu && badge && !menu.contains(e.target) && e.target !== badge) hideUserMenu();
}

// NOTE: the active showForgotPassword() is defined earlier in this file — it opens the
// in-page "Reset Password" panel (#auth-forgot-form), whose "Send Reset Link" button calls
// doPasswordReset() (inline success/error, no browser alert()s). A second, alert()-based
// copy used to live here and shadowed that panel (last definition wins); it was removed so
// the cleaner in-page form is what runs. Do not re-add a duplicate here.

function continueOffline() {
  hideAuthModal();
  showToast('Working offline — data saves locally and syncs when connected', 'warning', 4000);
}

// ============================================================
// SESSION TIMEOUT — auto sign-out after 30 min inactivity
// ============================================================
var _sessionTimer    = null;
var _sessionWarned   = false;
var SESSION_TIMEOUT  = 30 * 60 * 1000;  // 30 minutes
var SESSION_WARN     = 29 * 60 * 1000;  // warn at 29 minutes

function startSessionTimeout() {
  clearTimeout(_sessionTimer);
  _sessionWarned = false;
  _sessionTimer = setTimeout(function() {
    if (!_sessionWarned) {
      _sessionWarned = true;
      showToast('Session expiring in 1 minute due to inactivity', 'warning', 8000);
      _sessionTimer = setTimeout(function() {
        showToast('Session expired — signing out', 'warning', 3000);
        setTimeout(function() { signOut(); }, 1500);
      }, 60 * 1000);
    }
  }, SESSION_WARN);
}

function resetSessionTimeout() {
  if (!_currentUser) return;
  startSessionTimeout();
}

// Reset timer on any user interaction
['mousedown','keydown','touchstart','scroll'].forEach(function(evt) {
  document.addEventListener(evt, function() {
    if (_currentUser) resetSessionTimeout();
  }, { passive: true });
});

// ============================================================
// AUTO-SYNC — every 15 minutes while logged in
// ============================================================
var _autoSyncTimer = null;
var AUTO_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes

function startAutoSync() {
  clearInterval(_autoSyncTimer);
  _autoSyncTimer = setInterval(function() {
    if (_currentUser && _sb) {
      // Never interrupt active work: skip this cycle if the user is typing or has an
      // unsaved quote in progress. It'll sync on the next tick when they're idle.
      var ae = document.activeElement;
      var editing = (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) || (typeof _qqDirty !== 'undefined' && _qqDirty);
      if (editing) { console.log('[AutoSync] skipped — user is editing'); return; }
      console.log('[AutoSync] Running silent background sync');
      syncAllFromCloud(true);   // silent = non-blocking, no spinner
    } else {
      clearInterval(_autoSyncTimer);
    }
  }, AUTO_SYNC_INTERVAL);
}

function stopAutoSync() {
  clearInterval(_autoSyncTimer);
  _autoSyncTimer = null;
}

// ============================================================
// LIVE PERMISSION REFRESH
// Picks up a role / per-user-override / pay-visibility / active-status change made
// by an admin in another session and applies it to THIS open session without a
// reload. Polls the current user's profile row on a short interval, and also on
// tab focus for a near-instant update. Server-side RLS is still the hard floor;
// this just keeps the UI honest live.
// ============================================================
var _permRefreshTimer = null;
var _permSig = null;               // signature of the last-known role/overrides/pay/active
var _permRefreshListenersBound = false;
var PERM_REFRESH_INTERVAL = 30000; // 30s safety net (focus/visibility make it feel instant)

function _profileSig(p) {
  if (!p) return '';
  var role = (p.role === 'office') ? 'back_office' : (p.role || '');
  return [role, p.can_view_pay ? 1 : 0, (p.is_active === false) ? 0 : 1,
          JSON.stringify(p.perm_overrides || {})].join('|');
}

async function refreshCurrentUserPermissions() {
  // Never refresh while previewing someone else (View As), while signed out, or mid-edit.
  if (!_sb || !_currentUser || !_currentUser.id) return;
  if (typeof _viewAsActive !== 'undefined' && _viewAsActive) return;
  try {
    var res = await _sb.from('profiles').select('*').eq('id', _currentUser.id).single();
    if (res.error || !res.data) return;
    var p = res.data;
    if (p.role === 'office') p.role = 'back_office';   // same legacy alias as load
    var sig = _profileSig(p);
    if (_permSig === null) { _permSig = sig; return; } // first observation: baseline only
    if (sig === _permSig) return;                      // nothing changed
    _permSig = sig;

    // Deactivated mid-session → block access immediately.
    if (p.is_active === false) {
      _currentUser = null;
      clearInterval(_permRefreshTimer);
      if (typeof _showPendingApprovalScreen === 'function') _showPendingApprovalScreen(p.full_name || '');
      return;
    }

    // Apply the new role / overrides / pay flag live.
    _currentUser = p;
    if (typeof applyRolePermissions === 'function') applyRolePermissions(_currentUser.role);
    if (typeof enforceNavPermissions === 'function') enforceNavPermissions();
    if (typeof updateUserBadge === 'function') updateUserBadge(_currentUser);
    if (typeof loadUiPrefs === 'function') loadUiPrefs();

    // Re-render the page they're on so its controls reflect the new access. If they
    // lost access to the current page, bounce to the Dashboard.
    try {
      var active = document.querySelector('.page.active');
      var pid = active ? active.id.replace(/^page-/, '') : 'dash';
      if (typeof _canAccessPage === 'function' && !_canAccessPage(pid)) {
        if (typeof goPage === 'function') goPage('dash');
      } else if (typeof goPage === 'function') {
        goPage(pid);
      }
    } catch (e) {}

    if (typeof showToast === 'function') showToast('Your access level was updated','info',5000);
  } catch (e) { /* silent — retry next tick */ }
}

function startPermRefresh() {
  clearInterval(_permRefreshTimer);
  _permSig = _profileSig(_currentUser);   // baseline from the just-loaded profile
  _permRefreshTimer = setInterval(function() {
    if (_currentUser && _sb) refreshCurrentUserPermissions();
    else clearInterval(_permRefreshTimer);
  }, PERM_REFRESH_INTERVAL);

  // Near-instant when the user returns to the tab (bind once).
  if (!_permRefreshListenersBound) {
    _permRefreshListenersBound = true;
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') refreshCurrentUserPermissions();
    });
    window.addEventListener('focus', function() { refreshCurrentUserPermissions(); });
  }
}

// ---- INIT ----
// Start app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}


// ============================================================
// VIEW AS — owner testing mode
// ============================================================

var _viewAsActive = false;
var _realUser = null;

function initViewAsCard() {
  var card = document.getElementById('view-as-card');
  var sel  = document.getElementById('view-as-select');
  if (!card || !sel) return;
  var isOwner = _currentUser && _currentUser.role === 'owner';
  card.style.display = isOwner ? 'block' : 'none';
  if (!isOwner) return;
  // Populate team members
  sel.innerHTML = '<option value="">— Select team member —</option>' +
    (DB.team||[]).filter(function(m){ return m.name !== _currentUser.full_name; })
      .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
      .map(function(m){
        return '<option value="'+escHtml(m.id)+'">'+escHtml(m.name)+' ('+escHtml(m.access||m.role||'field')+')</option>';
      }).join('');
}

function activateViewAs() {
  var sel = document.getElementById('view-as-select');
  if (!sel || !sel.value) { showToast('Select a team member first','error'); return; }
  var member = (DB.team||[]).find(function(m){ return m.id===sel.value; });
  if (!member) return;

  // Store real user
  _realUser = Object.assign({}, _currentUser);
  _viewAsActive = true;

  // Switch to member's perspective
  _currentUser = {
    id:         member.id,
    full_name:  member.name,
    email:      member.email||'',
    role:       member.access || member.systemRole || 'field',
    rate:       member.rate||65
  };

  // Show banner
  var banner = document.getElementById('view-as-banner');
  var nameEl = document.getElementById('view-as-name');
  var roleEl = document.getElementById('view-as-role');
  if (banner) banner.style.display = 'flex';
  if (nameEl) nameEl.textContent = member.name;
  if (roleEl) roleEl.textContent = _currentUser.role;

  // Shift content down for banner
  var sidebar = document.getElementById('sidebar');
  var main    = document.getElementById('main-content');
  if (sidebar) sidebar.style.marginTop = '38px';
  if (main)    main.style.marginTop    = '38px';

  // Apply their permissions
  applyRolePermissions(_currentUser.role);
  updateUserBadge(_currentUser);

  // Navigate to dashboard as them
  goPage('dash');
  showToast('Viewing as '+member.name+' — '+_currentUser.role,'info',3000);
}

function deactivateViewAs() {
  if (!_realUser) return;
  _currentUser = _realUser;
  _realUser = null;
  _viewAsActive = false;

  // Hide banner
  var banner = document.getElementById('view-as-banner');
  if (banner) banner.style.display = 'none';

  // Restore margins
  var sidebar = document.getElementById('sidebar');
  var main    = document.getElementById('main-content');
  if (sidebar) sidebar.style.marginTop = '';
  if (main)    main.style.marginTop    = '';

  // Restore owner permissions
  applyRolePermissions(_currentUser.role);
  updateUserBadge(_currentUser);
  goPage('settings');
  showToast('Back to Owner view','success',2000);
}
