
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
  if (qqHasRecoverableDraft()) { try { if (confirm('Recover the last unsaved Quick Quote draft from this browser?')) restoreQQDraft(); else clearQQDraft(); } catch(e){} }
  updateQQStage3UI();
  renderTplLibrary();
  // Only render dash if no Supabase auth — if there is a session it will render after profile loads
  // Avoid rendering owner dashboard briefly before tech dashboard kicks in
  if (!window._sb) renderDash();
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
        // Guard: skip if getSession() already kicked off a sync (avoids double-push race on line items)
        if (!_currentUser && !window._syncInProgress) {
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
    setTimeout(function initPhase2() {
      // Phase 2 init — runs 500ms after login
      // Re-enforce role permissions after all syncs have settled
      if (_currentUser) applyRolePermissions(_currentUser.role);
      // Start location morning detection for field techs
      if (typeof startMorningDetection === 'function') startMorningDetection();
      // Restore clock session if tech was previously clocked in
      if (typeof restoreClockSession === 'function') restoreClockSession();
      // Render dashboard — but re-enforce permissions immediately after
      if (typeof renderDash === 'function') {
        renderDash();
        if (_currentUser) applyRolePermissions(_currentUser.role);
      }
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
  if (res.data) {
    _currentUser = res.data;
    applyRolePermissions(_currentUser.role);
    updateUserBadge(_currentUser);
    console.log('[Profile] Loaded:', _currentUser.full_name, _currentUser.role);
    // Re-apply after page renders
    setTimeout(function(){ applyRolePermissions(_currentUser.role); }, 300);
    setTimeout(function(){ applyRolePermissions(_currentUser.role); }, 1000);
    // Load WT notifications for this user
    setTimeout(function(){ if(typeof wtLoadNotifications==='function') wtLoadNotifications(); }, 1500);
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

// ── Role permission system ───────────────────────────────────────────────────
// enforceNavPermissions() is called from goPage() on every navigation.
// That is the single enforcement point. No timers, no observers, no CSS tricks.

var _activeRole = null;

function applyRolePermissions(role) {
  _activeRole = role || 'helper_tech';
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
  if (!role) { console.log('[Nav] enforceNavPermissions: no role, skipping'); return; }
  console.log('[Nav] enforceNavPermissions running for role:', role);

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
    return;
  }

  if (typeof getPermMatrix === 'function') {
    var matrix = getPermMatrix();
    var pageMap = {
      'qq':'page.qq','quotes':'page.quotes','jobs':'page.jobs',
      'dispatch':'page.dispatch','invoices':'page.invoices',
      'workorders':'page.workorders','purchaseorders':'page.purchaseorders',
      'vendors':'page.vendors','customers':'page.customers',
      'contacts':'page.contacts','team':'page.team','catalog':'page.catalog',
      'templates':'page.templates','reports':'page.reports','auditlog':'page.auditlog',
      'calendar':'page.calendar','inventory':'page.inventory','scanner':'page.scanner',
      'tools':'page.tools','field':'page.timeclock','timesheet':'page.timesheet',
      'worktracking':'page.worktracking','settings':'page.settings'
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

  console.log('[Nav] perms computed:', JSON.stringify(perms));
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
  console.log('[Nav] Done. Body classes:', document.body.className);
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

async function syncAllFromCloud() {
  // Always re-enforce role permissions when sync completes
  var _syncRole = _currentUser ? _currentUser.role : null;
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
        var localOnlyQuotes = (DB.quotes||[]).filter(function(q){ return q.id && !cloudQuoteIds.has(String(q.id)) && !(q.num && cloudQuoteNums.has(String(q.num))) && delQ.indexOf(String(q.id)) < 0; });
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
        DB.quotes = cloudQuotes.concat(localOnlyQuotes);
        // Clear any stale QQ draft — cloud is now the source of truth
        try { if (typeof clearQQDraft === 'function') clearQQDraft(); } catch(e) {}
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
          return { id:c.id, name:c.name, company:c.company, email:c.email, phone:c.phone, phone2:c.phone_alt, address:c.address, street:c.street||null, city:c.city, state:c.state, zip:c.zip, defaultTerms:c.default_terms||null, taxExempt:!!c.tax_exempt, hotNoteTech:c.hot_note_tech||null, hotNoteOffice:c.hot_note_office||null, notes:c.notes, active:c.is_active };
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

    // 11. Work Tracking — sync project metadata only (items/checkoffs fetched on demand)
    try {
      var { data: wtProjRows, error: wtpe } = await _sb.from('wt_projects').select('*').in('status',['active','paused']).order('created_at', { ascending: false });
      if (wtpe) { errors.push('wt_projects: '+wtpe.message); }
      else if (wtProjRows) { DB.wtProjects = wtProjRows; }
    } catch(e) { errors.push('wt_projects: '+e.message); }
    try {
      var { data: wtTplRows, error: wtte } = await _sb.from('wt_templates').select('id,name,template_type,customer_id,created_at').order('created_at', { ascending: false });
      if (!wtte && wtTplRows) DB.wtTemplates = wtTplRows;
    } catch(e) { /* templates optional */ }

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

    // 19. Inventory
    try {
      var { data: invRows, error: inve } = await _sb.from('inventory').select('*').order('name');
      if (inve) { errors.push('inventory: '+inve.message); }
      else if (invRows) {
        DB.inventory = invRows.map(function(i){
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
      var { data: vendorRows, error: ve } = await _sb.from('vendors').select('*').eq('is_active', true).order('name');
      if (ve) { errors.push('vendors: '+ve.message); }
      else if (vendorRows) {
        DB.vendors = vendorRows.map(function(v){
          return { id:v.id, name:v.name, contact:v.contact_name, phone:v.phone, email:v.email, acctNum:v.account_num, address:v.address, city:v.city, state:v.state, zip:v.zip, defaultTerms:v.default_terms||'Due on Receipt', taxExempt:!!v.tax_exempt, notes:v.notes, active:v.is_active!==false };
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
  // Re-apply permissions after sync then render correct dashboard for role
  if (_currentUser) applyRolePermissions(_currentUser.role);
  if (typeof wtIsFieldTech === 'function' && wtIsFieldTech()) {
    if (typeof wtRenderTechDashboard === 'function') wtRenderTechDashboard();
  } else {
    renderDash();
  }
  hideSpinner();
  if (errors.length) {
    console.warn('[Sync] Partial errors:', errors);
    showToast('Synced with warnings — check console', 'warning', 3000);
  } else {
    showToast('Synced ✓', 'success', 2000);
  }
}

var _pushInProgress = false;

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
      default_target_margin: DB.settings.targetMargin !== undefined ? DB.settings.targetMargin : 35,
      ma_enabled: DB.settings.managerApproval ? !!DB.settings.managerApproval.enabled : false,
      ma_below_floor_only: DB.settings.managerApproval ? !!DB.settings.managerApproval.belowFloorOnly : true,
      ma_pin_hash: DB.settings.managerApproval ? (DB.settings.managerApproval.pinHash || '') : '',
      ma_pin_salt: DB.settings.managerApproval ? (DB.settings.managerApproval.pinSalt || '') : ''
    });

    // Push margin floors — upsert each row
    if (_getMFList) {
      var mfList = _getMFList();
      for (var mf of mfList) {
        if (!mf || !mf.jobType) continue;
        try {
          await _sb.from('margin_floors').upsert({
            job_type: mf.jobType,
            floor_pct: mf.floor !== undefined ? mf.floor : 35,
            notes: mf.notes || ''
          }, { onConflict: 'job_type' });
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
        await _sb.from('quotes').upsert({
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
          default_terms: c.defaultTerms || 'Due on Receipt',
          tax_exempt: !!c.taxExempt,
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

    // Push inventory
    for (var inv of (DB.inventory || [])) {
      if (!inv || !inv.id) continue;
      try {
        await _sb.from('inventory').upsert({
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
        }, {onConflict:'id'});
      } catch(invErr) { console.warn('[Push] Inventory:', invErr.message||invErr); }
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
    showToast('Sync error — changes saved locally', 'warning');
  } finally {
    _pushInProgress = false;
  }
  var syncEl = document.getElementById('dash-last-updated');
  if (syncEl) syncEl.textContent = 'Saved ' + new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
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
