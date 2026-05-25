
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
  if (qqHasRecoverableDraft()) { try { if (confirm('Recover the last unsaved Quick Quote draft from this browser?')) restoreQQDraft(); else clearQQDraft(); } catch(e){} }
  updateQQStage3UI();
  renderTplLibrary();
  renderDash();
  loadMarginFloors();
  loadLogoOnStartup();
  initLogoUpload();
  const cb = document.getElementById('company-badge');
  if (cb) cb.textContent = (DB.settings.cname || 'TCSS').substring(0,12);

  // Check mobile mode on load and resize
  checkMobileMode();
  window.addEventListener('resize', checkMobileMode);

  // Initialize Supabase and check session
  if (initSupabase()) {
    // file:// protocol can't handle Supabase auth redirects
    // Always show login screen and let user sign in manually
    var isLocalFile = window.location.protocol === 'file:';
    if (isLocalFile) {
      // Still try to restore session from localStorage
      _sb.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          loadCurrentUserProfile().then(function(){ syncAllFromCloud(); restoreClockSession(); });
        } else {
          showAuthModal();
        }
      }).catch(function(){ showAuthModal(); });
    } else {
      _sb.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          loadCurrentUserProfile().then(function(){ syncAllFromCloud(); restoreClockSession(); });
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
        if (!_currentUser) {
          loadCurrentUserProfile().then(function() {
            showToast('Welcome back, ' + (_currentUser ? _currentUser.full_name.split(' ')[0] : '') + '!', 'success');
            syncAllFromCloud();
          });
        }
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
    setTimeout(initPhase2, 500);
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

async function loadCurrentUserProfile() {
  if (!_sb) { console.warn('[Profile] No Supabase client'); return; }
  var session = await _sb.auth.getSession();
  if (!session.data.session) { console.warn('[Profile] No session'); return; }
  var uid = session.data.session.user.id;
  var email = session.data.session.user.email;
  console.log('[Profile] Loading for uid:', uid, 'email:', email);
  var res = await _sb.from('profiles').select('*').eq('id', uid).single();
  console.log('[Profile] Result:', res);
  if (res.data) {
    _currentUser = res.data;
    applyRolePermissions(_currentUser.role);
    updateUserBadge(_currentUser);
    console.log('[Profile] Loaded:', _currentUser.full_name, _currentUser.role);
  } else {
    console.warn('[Profile] No profile row found. Error:', res.error);
    // Fallback: create a minimal currentUser from the auth session
    // so the app doesn't completely break
    _currentUser = {
      id: uid,
      full_name: email.split('@')[0],
      role: 'owner',
      email: email
    };
    updateUserBadge(_currentUser);
    showToast('Profile not found — using fallback. Check Supabase profiles table.', 'warning', 5000);
  }
}

function applyRolePermissions(role) {
  var fieldRoles = ['helper_tech','subcontractor','field'];
  var fieldOnlyHide = ['catalog','templates','reports','customers','contacts','settings','qq','quotes','invoices','timesheet','team','purchaseorders','vendors','scanner'];
  var leadTechShow  = ['dash','field','jobs','dispatch','worktracking','workorders','customers','contacts','reports','catalog','tools','inventory','calendar','timesheet'];
  var estimatorShow = ['dash','quotes','customers','contacts','catalog','templates'];
  var isCustomRole  = typeof BUILT_IN_ROLES !== 'undefined' && BUILT_IN_ROLES.indexOf(role) < 0;

  var nav = document.querySelectorAll('.nav-item[data-page]');
  nav.forEach(function(item) {
    var page = item.getAttribute('data-page');
    if (role === 'owner') {
      item.style.display = '';
    } else if (role === 'lead_tech') {
      item.style.display = leadTechShow.indexOf(page) >= 0 ? '' : 'none';
    } else if (role === 'estimator') {
      item.style.display = estimatorShow.indexOf(page) >= 0 ? '' : 'none';
    } else if (fieldRoles.indexOf(role) >= 0 || role === 'field') {
      item.style.display = fieldOnlyHide.indexOf(page) >= 0 ? 'none' : '';
    } else if (role === 'office') {
      item.style.display = page === 'team' ? 'none' : '';
    } else {
      // All other roles (project_manager, custom roles, manager, back_office)
      // Show everything except team page — permissions matrix governs actions
      item.style.display = page === 'team' ? 'none' : '';
    }
  });

  // Hide rate column on Team page from non-owners
  var rateHeaders = document.querySelectorAll('.team-rate-col');
  rateHeaders.forEach(function(el) { el.style.display = role === 'owner' ? '' : 'none'; });

  // Render permissions editor if on settings page
  if (role === 'owner') setTimeout(renderPermissionsEditor, 200);
}

function updateUserBadge(profile) {
  if (!profile) return;
  var badge = document.getElementById('user-badge');
  if (badge) {
    var name = profile.full_name || profile.email || '?';
    var initials = name.split(' ').filter(Boolean).map(function(n){ return n[0]; }).join('').substring(0,2).toUpperCase() || '?';
    badge.textContent = initials;
    badge.title = (profile.full_name||profile.email||'User') + ' (' + (profile.role||'user') + ')';
    badge.style.background = profile.role==='owner' ? '#1565c0' : profile.role==='office' ? '#2e7d32' : profile.role==='lead_tech' ? '#6a1b9a' : '#546e7a';
  }
  var nameBadge = document.getElementById('user-name-badge');
  if (nameBadge) {
    var firstName = (profile.full_name||profile.email||'').split(' ')[0].split('@')[0];
    nameBadge.textContent = firstName || 'User';
  }
}

// ---- SYNC ----
async function syncAllFromCloud() {
  if (!_sb || !_currentUser) return;
  window._syncInProgress = true;
  showSpinner('Syncing with cloud...');
  var errors = [];
  // Ensure deletedIds exists and is properly structured
  if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
  var delQ   = DB.deletedIds.quotes   || [];
  var delT   = DB.deletedIds.team     || [];
  var delC   = DB.deletedIds.customers|| [];
  var delCt  = DB.deletedIds.contacts || [];
  var delJ   = DB.deletedIds.jobs     || [];

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
      DB.settings.cname = settingsRow.company_name || DB.settings.cname;
      DB.settings.laborRate = settingsRow.default_labor_rate || DB.settings.laborRate;
      DB.settings.targetMargin = settingsRow.default_target_margin || DB.settings.targetMargin;
      if (!DB.settings.managerApproval) DB.settings.managerApproval = {};
      DB.settings.managerApproval.enabled = settingsRow.ma_enabled;
      DB.settings.managerApproval.belowFloorOnly = settingsRow.ma_below_floor_only;
      DB.settings.managerApproval.pinHash = settingsRow.ma_pin_hash || '';
      DB.settings.managerApproval.pinSalt = settingsRow.ma_pin_salt || '';
    }
  } catch(e) { errors.push('settings: '+e.message); }

  if (_currentUser.role !== 'helper_tech' && _currentUser.role !== 'lead_tech') {

    // 2. Quotes
    try {
      var { data: quotes, error: qe } = await _sb.from('quotes')
        .select('*, quote_line_items(*)')
        .order('created_at', { ascending: false });
      if (qe) { errors.push('quotes: '+qe.message); }
      else if (quotes) {
        // Filter out quotes the user has deleted locally
        quotes = quotes.filter(function(q){ return delQ.indexOf(String(q.id)) < 0; });
        var cloudQuoteIds = new Set(quotes.map(function(q){ return String(q.id); }));
        // Preserve any local quotes not yet synced to cloud (created before push debounce fired)
        var localOnlyQuotes = (DB.quotes||[]).filter(function(q){ return q.id && !cloudQuoteIds.has(String(q.id)) && delQ.indexOf(String(q.id)) < 0; });
        var cloudQuotes = quotes.map(function(q) {
          return {
            id: q.id,
            num: q.quote_number,
            cn: q.customer_name,
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
            notes: q.scope_notes,
            internalNotes: q.internal_notes,
            terms: q.quote_terms,
            priority: q.priority,
            lumpSum: q.lump_sum_enabled ? { enabled: true, label: q.lump_sum_label, showItems: true } : null,
            approval: q.approval_status ? { status: q.approval_status } : null,
            approvalToken: q.approval_token || null,
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
        DB.quotes = cloudQuotes.concat(localOnlyQuotes);
      }
    } catch(e) { errors.push('quotes: '+e.message); }

    // 3. Customers
    try {
      var { data: custs, error: ce } = await _sb.from('customers').select('*').eq('is_active', true).order('name');
      if (ce) { errors.push('customers: '+ce.message); }
      else if (custs) {
        custs = custs.filter(function(c){ return delC.indexOf(String(c.id)) < 0; });
        var cloudCustIds = new Set(custs.map(function(c){ return String(c.id); }));
        var localOnlyCusts = (DB.customers||[]).filter(function(c){ return c.id && !cloudCustIds.has(String(c.id)) && delC.indexOf(String(c.id)) < 0; });
        var cloudCusts = custs.map(function(c) {
          return { id:c.id, name:c.name, company:c.company, email:c.email, phone:c.phone, phone2:c.phone_alt, address:c.address, street:c.street||null, city:c.city, state:c.state, zip:c.zip, defaultTerms:c.default_terms||null, hotNoteTech:c.hot_note_tech||null, hotNoteOffice:c.hot_note_office||null, notes:c.notes, active:c.is_active };
        });
        DB.customers = cloudCusts.concat(localOnlyCusts);
      }
    } catch(e) { errors.push('customers: '+e.message); }

    // 4. Catalog
    try {
      var { data: cat, error: cate } = await _sb.from('catalog').select('*').eq('is_active', true).order('name');
      if (cate) { errors.push('catalog: '+cate.message); }
      else if (cat && cat.length) {
        DB.catalog = cat.map(function(item) {
          return { id:item.id, name:item.name, desc:item.description, cat:item.category, unit:item.unit, cost:item.default_cost, hours:item.default_hours, notes:item.notes, active:item.is_active };
        });
      }
    } catch(e) { errors.push('catalog: '+e.message); }

    // 5. Templates
    try {
      var { data: tmpl, error: te } = await _sb.from('templates').select('*').eq('is_active', true).order('name');
      if (te) { errors.push('templates: '+te.message); }
      else if (tmpl && tmpl.length) {
        DB.templates = tmpl.map(function(t) {
          return { id:t.id, name:t.name, cat:t.category, desc:t.description, items:t.items||[], active:t.is_active };
        });
      }
    } catch(e) { errors.push('templates: '+e.message); }

    // 6. Margin floors
    try {
      var { data: floors, error: fe } = await _sb.from('margin_floors').select('*');
      if (fe) { errors.push('margin_floors: '+fe.message); }
      else if (floors && floors.length) {
        DB.marginFloors = DB.marginFloors || {};
        floors.forEach(function(f) { DB.marginFloors[f.job_type] = f.floor_pct; });
      }
    } catch(e) { errors.push('margin_floors: '+e.message); }

    // 7. Contacts
    try {
      var { data: conts, error: cone } = await _sb.from('contacts').select('*').eq('is_active', true).order('name');
      if (cone) { errors.push('contacts: '+cone.message); }
      else if (conts) {
        conts = conts.filter(function(c){ return delCt.indexOf(String(c.id)) < 0; });
        var cloudContIds = new Set(conts.map(function(c){ return String(c.id); }));
        var localOnlyConts = (DB.contacts||[]).filter(function(c){ return c.id && !cloudContIds.has(String(c.id)) && delCt.indexOf(String(c.id)) < 0; });
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
        DB.contacts = cloudConts.concat(localOnlyConts);
      }
    } catch(e) { errors.push('contacts: '+e.message); }

    // 8. Jobs
    try {
      var { data: jobRows, error: je } = await _sb.from('jobs').select('*').eq('is_active', true).order('created_at', {ascending:false});
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
      var { data: teamRows, error: te2 } = await _sb.from('team').select('*').eq('is_active', true).order('full_name');
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
            active:       m.is_active !== false
          };
        });
      }
    } catch(e) { errors.push('team: '+e.message); }

    // 10. Time Entries
    try {
      var { data: timeRows, error: tre } = await _sb.from('time_entries').select('*').order('clock_in', { ascending: false });
      if (tre) { errors.push('time_entries: '+tre.message); }
      else if (timeRows) {
        var cloudTimeIds = new Set(timeRows.map(function(t){ return String(t.id); }));
        var localOnlyTime = (DB.timeEntries||[]).filter(function(t){ return t.id && !cloudTimeIds.has(String(t.id)); });
        DB.timeEntries = timeRows.map(function(t){
          return {
            id: t.id, userId: t.user_id, teamMemberId: t.team_member_id,
            jobId: t.job_id, clockIn: t.clock_in, clockOut: t.clock_out,
            breakMinutes: t.break_minutes||0, totalHours: t.total_hours,
            entryType: t.entry_type||'regular', notes: t.notes,
            gpsLat: t.gps_lat, gpsLng: t.gps_lng,
            isApproved: !!t.is_approved, approvedBy: t.approved_by,
            createdAt: t.created_at
          };
        }).concat(localOnlyTime);
      }
    } catch(e) { errors.push('time_entries: '+e.message); }

    // 11. Work Tracking
    try {
      var { data: wtRows, error: wte } = await _sb.from('work_tracking').select('*').order('created_at', { ascending: false });
      if (wte) { errors.push('work_tracking: '+wte.message); }
      else if (wtRows) {
        var cloudWtIds = new Set(wtRows.map(function(w){ return String(w.id); }));
        var localOnlyWt = (DB.wtCheckoffs||[]).filter(function(w){ return w.id && !cloudWtIds.has(String(w.id)); });
        DB.wtCheckoffs = wtRows.map(function(w){
          return {
            id: w.id, projectId: w.project_id, buildingId: w.building_id,
            roomId: w.room_id, itemId: w.item_id, assignedTo: w.assigned_to,
            status: w.status||'pending', completedAt: w.completed_at,
            completedBy: w.completed_by, notes: w.notes,
            rework: !!w.rework, reworkReason: w.rework_reason,
            createdAt: w.created_at
          };
        }).concat(localOnlyWt);
      }
    } catch(e) { errors.push('work_tracking: '+e.message); }

    // 12. Job Photos
    if (typeof syncJobPhotos === 'function') { try { await syncJobPhotos(); } catch(e) { errors.push('job_photos: '+e.message); } }

    // 13. Comms Log
    try {
      var { data: commsRows, error: comme } = await _sb.from('comms_log').select('*').order('created_at', { ascending: false });
      if (comme) { errors.push('comms_log: '+comme.message); }
      else if (commsRows) {
        DB.commsLog = commsRows.map(function(c){
          return { id:c.id, customerId:c.customer_id, jobId:c.job_id, loggedBy:c.logged_by, loggerName:c.logger_name, type:c.comm_type, direction:c.direction, subject:c.subject, notes:c.notes, followUpDate:c.follow_up_date, createdAt:c.created_at };
        });
      }
    } catch(e) { errors.push('comms_log: '+e.message); }

    // 14. Invoice Payments
    try {
      var { data: pmtRows, error: pmte } = await _sb.from('invoice_payments').select('*').order('created_at', { ascending: false });
      if (pmte) { errors.push('invoice_payments: '+pmte.message); }
      else if (pmtRows) {
        DB.invoicePayments = pmtRows.map(function(p){
          return { id:p.id, invoiceId:p.invoice_id, amount:p.amount, paymentMethod:p.payment_method, reference:p.reference, notes:p.notes, recordedBy:p.recorded_by, recorderName:p.recorder_name, paymentDate:p.payment_date, createdAt:p.created_at };
        });
      }
    } catch(e) { errors.push('invoice_payments: '+e.message); }

    // 15. Work Orders
    try {
      var { data: woRows, error: woe } = await _sb.from('work_orders').select('*').order('created_at', { ascending: false });
      if (woe) { errors.push('work_orders: '+woe.message); }
      else if (woRows) {
        DB.workOrders = woRows.map(function(w){
          return { id:w.id, woNumber:w.wo_number, customerId:w.customer_id, customerName:w.customer_name, contactId:w.contact_id, description:w.description, workPerformed:w.work_performed, status:w.status, serviceType:w.service_type, priority:w.priority, serviceRep:w.service_rep, refNum:w.reference_num, siteAddr:w.site_address, siteCity:w.site_city, siteState:w.site_state, siteZip:w.site_zip, laborRate:w.labor_rate, taxRate:w.tax_rate, dateRequested:w.date_requested, dateFollowup:w.date_followup, dateOpened:w.date_opened, dateClosed:w.date_closed, internalNotes:w.internal_notes, invoiceId:w.invoice_id, jobId:w.job_id, quoteId:w.quote_id, assignedTechs:w.assigned_techs||[], createdBy:w.created_by, createdByName:w.created_by_name, createdAt:w.created_at, updatedAt:w.updated_at };
        });
      }
    } catch(e) { errors.push('work_orders: '+e.message); }

    // 16. WO Labor
    try {
      var { data: woLaborRows, error: wole } = await _sb.from('wo_labor').select('*').order('created_at', { ascending: false });
      if (wole) { errors.push('wo_labor: '+wole.message); }
      else if (woLaborRows) {
        DB.woLabor = woLaborRows.map(function(l){
          return { id:l.id, woId:l.wo_id, techName:l.tech_name, entryType:l.entry_type, clockIn:l.clock_in, clockOut:l.clock_out, hours:l.hours, notes:l.notes, createdAt:l.created_at };
        });
      }
    } catch(e) { errors.push('wo_labor: '+e.message); }

    // 17. WO Parts
    try {
      var { data: woPartsRows, error: wope } = await _sb.from('wo_parts').select('*').order('created_at', { ascending: false });
      if (wope) { errors.push('wo_parts: '+wope.message); }
      else if (woPartsRows) {
        DB.woParts = woPartsRows.map(function(p){
          return { id:p.id, woId:p.wo_id, name:p.part_name, partNum:p.part_num, qty:p.quantity, status:p.status, notes:p.notes, requestedBy:p.requested_by, createdAt:p.created_at };
        });
      }
    } catch(e) { errors.push('wo_parts: '+e.message); }

    // 18. WO Expenses
    try {
      var { data: woExpRows, error: woee } = await _sb.from('wo_expenses').select('*').order('created_at', { ascending: false });
      if (woee) { errors.push('wo_expenses: '+woee.message); }
      else if (woExpRows) {
        DB.woExpenses = woExpRows.map(function(e){
          return { id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount, paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by, createdAt:e.created_at };
        });
      }
    } catch(e) { errors.push('wo_expenses: '+e.message); }

    // 16. Vendors
    try {
      var { data: vendorRows, error: ve } = await _sb.from('vendors').select('*').eq('is_active', true).order('name');
      if (ve) { errors.push('vendors: '+ve.message); }
      else if (vendorRows) {
        DB.vendors = vendorRows.map(function(v){
          return { id:v.id, name:v.name, contact:v.contact_name, phone:v.phone, email:v.email, acctNum:v.account_num, address:v.address, city:v.city, state:v.state, zip:v.zip, terms:v.payment_terms||'Net 30', taxExempt:!!v.tax_exempt, notes:v.notes, active:v.is_active!==false };
        });
      }
    } catch(e) { errors.push('vendors: '+e.message); }

    // 17. Purchase Orders
    try {
      var { data: poRows, error: poe } = await _sb.from('purchase_orders').select('*, po_line_items(*)').order('created_at', { ascending: false });
      if (poe) { errors.push('purchase_orders: '+poe.message); }
      else if (poRows) {
        DB.purchaseOrders = poRows.map(function(p){
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
        });
      }
    } catch(e) { errors.push('purchase_orders: '+e.message); }

  }

  // Save to localStorage only — do NOT call saveDB() here as it would schedule a push
  // We just pulled from Supabase so there's nothing to push back
  window._syncInProgress = false;
  try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch(e) {}
  clearTimeout(window._syncTimer); // Cancel any push timer that snuck in during sync
  renderDash();
  hideSpinner();
  if (errors.length) {
    console.warn('[Sync] Partial errors:', errors);
    showToast('Synced with warnings — check console', 'warning', 3000);
  } else {
    showToast('Synced ✓', 'success', 2000);
  }
}

async function pushAllToCloud() {
  if (!_sb || !_currentUser) return;
  if (_currentUser.role === 'field') return;
  showSpinner('Saving to cloud...');
  try {
    // First — process any pending deletions so they don't get restored by upserts below
    if (DB.deletedIds) {
      var dq = DB.deletedIds.quotes   || [];
      var dt = DB.deletedIds.team     || [];
      var dc = DB.deletedIds.customers|| [];
      var dct= DB.deletedIds.contacts || [];
      var dj = DB.deletedIds.jobs     || [];
      for (var qDel of dq) { await _sb.from('quote_line_items').delete().eq('quote_id', qDel); await _sb.from('quotes').delete().eq('id', qDel); }
      for (var tDel of dt)  await _sb.from('team').delete().eq('id', tDel);
      for (var cDel of dc)  await _sb.from('customers').delete().eq('id', cDel);
      for (var ctDel of dct) await _sb.from('contacts').delete().eq('id', ctDel);
      for (var jDel of dj)  await _sb.from('jobs').delete().eq('id', jDel);
      // Clear the log after successful deletion sweep
      DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
      try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch(e) {}
    }
    // Push settings to company_settings (single row, id=1)
    await _sb.from('company_settings').upsert({
      id: 1,
      company_name: DB.settings.cname || 'TCSS',
      default_labor_rate: DB.settings.laborRate || 100,
      default_target_margin: DB.settings.targetMargin || 35,
      ma_enabled: DB.settings.managerApproval ? !!DB.settings.managerApproval.enabled : false,
      ma_below_floor_only: DB.settings.managerApproval ? !!DB.settings.managerApproval.belowFloorOnly : true,
      ma_pin_hash: DB.settings.managerApproval ? (DB.settings.managerApproval.pinHash || '') : '',
      ma_pin_salt: DB.settings.managerApproval ? (DB.settings.managerApproval.pinSalt || '') : ''
    });

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
        await _sb.from('quotes').upsert({
          id: qId,
          quote_number: q.num || null,
          customer_name: q.cn || null,
          job_id: null,
          sales_rep_name: q.rep || null,
          status: statusMap[q.status] || 'Draft',
          quote_date: q.dt || new Date().toISOString().split('T')[0],
          valid_until: q.vu || null,
          quote_type: q.jt || null,
          environment: q.env || null,
          pricing_mode: (q.pricingMode === 'markup' ? 'markup' : 'margin'),
          target_margin: q.targetMargin || 35,
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
          scope_notes: q.notes || null,
          internal_notes: q.internalNotes || null,
          quote_terms: q.terms || null,
          priority: q.priority || 'Normal',
          lump_sum_enabled: !!(q.lumpSum && q.lumpSum.enabled),
          lump_sum_label: (q.lumpSum && q.lumpSum.label) || null,
          approval_status: (q.approval && q.approval.status) || null,
          approval_token: q.approvalToken || null,
          created_by: _currentUser.id
        });

        // Push line items for this quote
        if (q.items && q.items.length > 0) {
          await _sb.from('quote_line_items').delete().eq('quote_id', qId);
          var lineItems = q.items.map(function(item, idx) {
            return {
              quote_id: qId,
              sort_order: idx,
              description: item.desc || '',
              category: item.cat || null,
              qty: item.qty || 1,
              unit: item.unit || 'ea',
              material_cost: item.mc || 0,
              labor_hours: item.lh || 0
            };
          });
          if (lineItems.length > 0) {
            await _sb.from('quote_line_items').insert(lineItems);
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
      if (!obj.id || !isUUID(obj.id)) obj.id = makeUUID();
      return obj.id;
    }

    // Push customers
    for (var c of (DB.customers || [])) {
      if (!c) continue;
      try {
        var cId = ensureUUID(c);
        await _sb.from('customers').upsert({
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
          default_terms: c.defaultTerms || null,
          hot_note_tech:   c.hotNoteTech || null,
          hot_note_office: c.hotNoteOffice || null,
          notes: c.notes || null,
          is_active: c.active !== false,
          created_by: _currentUser.id
        });
      } catch(cErr) {
        console.warn('[Push] Customer error for', c.name, cErr);
      }
    }

    // Push catalog
    for (var item of (DB.catalog || [])) {
      if (!item) continue;
      try {
        var itemId = ensureUUID(item);
        await _sb.from('catalog').upsert({
          id: itemId,
          name: item.name || '',
          description: item.desc || null,
          category: item.cat || null,
          unit: item.unit || 'ea',
          default_cost: item.cost || 0,
          default_hours: item.hours || 0,
          notes: item.notes || null,
          is_active: item.active !== false
        });
      } catch(iErr) {
        console.warn('[Push] Catalog error for', item.name, iErr);
      }
    }

    // Push templates
    for (var t of (DB.templates || [])) {
      if (!t) continue;
      try {
        var tId = ensureUUID(t);
        await _sb.from('templates').upsert({
          id: tId,
          name: t.name || '',
          category: t.cat || null,
          description: t.desc || null,
          items: t.items || [],
          is_active: true,
          created_by: _currentUser.id
        });
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
          await _sb.from('contacts').upsert(ctBase);
        } else if (ctRes.error) {
          console.warn('[Push] Contact error for', ct.name, ctRes.error.message);
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
          created_by:   _currentUser.id
        });
        if (tmErr) console.warn('[Push] Team error for', tm.name, tmErr.message);
      } catch(tmCatch) {
        console.warn('[Push] Team error for', tm.name, tmCatch.message || tmCatch);
      }
    }

    // Push time entries
    for (var te of (DB.timeEntries || [])) {
      if (!te || !te.id) continue;
      try {
        var { error: teErr } = await _sb.from('time_entries').upsert({
          id:             te.id,
          user_id:        te.userId || _currentUser.id,
          team_member_id: te.teamMemberId || null,
          job_id:         te.jobId || null,
          clock_in:       te.clockIn || null,
          clock_out:      te.clockOut || null,
          break_minutes:  te.breakMinutes || 0,
          total_hours:    te.totalHours || null,
          entry_type:     te.entryType || 'regular',
          notes:          te.notes || null,
          gps_lat:        te.gpsLat || null,
          gps_lng:        te.gpsLng || null,
          is_approved:    !!te.isApproved,
          approved_by:    te.approvedBy || null
        });
        if (teErr) console.warn('[Push] Time entry error:', teErr.message);
      } catch(teCatch) { console.warn('[Push] Time entry error:', teCatch.message||teCatch); }
    }

    // Push work tracking checkoffs
    for (var wt of (DB.wtCheckoffs || [])) {
      if (!wt || !wt.id) continue;
      try {
        var { error: wtErr } = await _sb.from('work_tracking').upsert({
          id:           wt.id,
          project_id:   wt.projectId || null,
          building_id:  wt.buildingId || null,
          room_id:      wt.roomId || null,
          item_id:      wt.itemId || null,
          assigned_to:  wt.assignedTo || null,
          status:       wt.status || 'pending',
          completed_at: wt.completedAt || null,
          completed_by: wt.completedBy || null,
          notes:        wt.notes || null,
          rework:       !!wt.rework,
          rework_reason:wt.reworkReason || null
        });
        if (wtErr) console.warn('[Push] Work tracking error:', wtErr.message);
      } catch(wtCatch) { console.warn('[Push] Work tracking error:', wtCatch.message||wtCatch); }
    }

    // Push jobs
    for (var jb of (DB.jobs || [])) {
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
          if (jbRes2.error) console.warn('[Push] Job base error for', jb.name, jbRes2.error.message);
        } else if (jbRes.error) {
          console.warn('[Push] Job error for', jb.name, jbRes.error.message);
          if (jbRes.error.details) console.warn('[Push] Job details:', jbRes.error.details);
          if (jbRes.error.hint) console.warn('[Push] Job hint:', jbRes.error.hint);
        }
      } catch(jbErr) {
        console.warn('[Push] Job error for', jb.name, jbErr.message || jbErr);
      }
    }

  } catch(e) {
    console.error('Push error:', e);
    hideSpinner();
    showToast('Sync error — changes saved locally', 'warning');
  }
  hideSpinner();
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
  // Handle magic link / password reset redirect
  var hash = window.location.hash;
  if (hash && (hash.includes('access_token') || hash.includes('type=recovery'))) {
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
  var { data, error } = await _sb.auth.getSession();
  if (data && data.session) {
    hideAuthModal();
    await loadCurrentUserProfile();
    syncAllFromCloud();
    // Clear hash from URL
    history.replaceState(null, '', window.location.pathname);
    showToast('Welcome to ProBid! Please set a permanent password in Settings.','info',6000);
  }
}

// ---- USER MANAGEMENT (Owners only) ----
var TCSS_USERS = [
  { name:'Joe Kucinski',          role:'owner',     email:'joek@tcss.com',                   phone:'336-736-6507', title:'Owner / GM' },
  { name:'Jordan Davis',          role:'owner',     email:'jordand@tcss.com',                phone:'252-314-8370', title:'Owner' },
  { name:'Dawn Brown',            role:'office',    email:'dawnb@tcss.com',                  phone:'919-214-1186', title:'Office Admin' },
  { name:'Lisa Lammonds',         role:'office',    email:'lisam@tcss.com',                  phone:'336-257-4725', title:'Office Assistant' },
  { name:'Victoria Davis',        role:'office',    email:'Victoriad@tcss.com',              phone:'336-302-3979', title:'Financial Manager' },
  { name:'Evan Morris',           role:'office',    email:'evanm@tcss.com',                  phone:'336-447-8507', title:'Project Management' },
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

function showForgotPassword() {
  var email = (document.getElementById('auth-email')||{}).value || '';
  if (!email) { showToast('Enter your email address first, then click Forgot Password.','error'); return; }
  if (_sb) {
    // For local file usage, direct them to Supabase dashboard to set password
    if (window.location.protocol === 'file:') {
      alert('To reset your password:\n\n1. Go to supabase.com\n2. Open your project\n3. Go to Authentication → Users\n4. Click the three dots next to ' + email + '\n5. Click "Edit user" and set a new password directly');
      return;
    }
    _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
    alert('Password reset email sent to ' + email + '. Check your inbox.');
  }
}

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
      console.log('[AutoSync] Running background sync');
      syncAllFromCloud();
    } else {
      clearInterval(_autoSyncTimer);
    }
  }, AUTO_SYNC_INTERVAL);
}

function stopAutoSync() {
  clearInterval(_autoSyncTimer);
  _autoSyncTimer = null;
}

// ---- INIT ----
// Start app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

