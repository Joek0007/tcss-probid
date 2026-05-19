
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
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        hideAuthModal();
        // Load profile + sync when session established (handles magic link redirect)
        if (!_currentUser) {
          loadCurrentUserProfile().then(function() {
            showToast('Welcome back, ' + (_currentUser ? _currentUser.full_name.split(' ')[0] : '') + '!', 'success');
            syncAllFromCloud();
          });
        }
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
  // Nav visibility based on role
  var fieldRoles = ['helper_tech','subcontractor'];
  var fieldOnlyHide = ['catalog','templates','reports','customers','contacts','settings','qq','quotes','invoices','timesheet','team'];
  var leadTechShow = ['dash','field','jobs','dispatch','worktracking','customers','contacts','reports','catalog','tools','inventory'];
  var estimatorShow = ['dash','quotes','customers','contacts','catalog','templates'];
  var nav = document.querySelectorAll('.nav-item[data-page]');
  nav.forEach(function(item) {
    var page = item.getAttribute('data-page');
    if (role === 'lead_tech') {
      item.style.display = leadTechShow.indexOf(page) >= 0 ? '' : 'none';
    } else if (fieldRoles.indexOf(role) >= 0 && fieldOnlyHide.indexOf(page) >= 0) {
      item.style.display = 'none';
    } else if (role === 'office') {
      // Office sees everything except Team (pay rates — owner only)
      item.style.display = page === 'team' ? 'none' : '';
    } else if (role === 'estimator' && estimatorShow.indexOf(page) < 0) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
  });
  // Hide rate column on Team page from non-owners (second layer of protection)
  var rateHeaders = document.querySelectorAll('.team-rate-col');
  rateHeaders.forEach(function(el) { el.style.display = role === 'owner' ? '' : 'none'; });
  // Render permissions editor if on settings page
  if (role === 'owner') setTimeout(renderPermissionsEditor, 200);
}

function updateUserBadge(profile) {
  var badge = document.getElementById('user-badge');
  if (badge) {
    var initials = profile.full_name.split(' ').map(function(n){ return n[0]; }).join('').substring(0,2).toUpperCase();
    badge.textContent = initials;
    badge.title = profile.full_name + ' (' + profile.role + ')';
    badge.style.background = profile.role==='owner' ? '#1565c0' : profile.role==='office' ? '#2e7d32' : '#6a1b9a';
  }
  var nameBadge = document.getElementById('user-name-badge');
  if (nameBadge) nameBadge.textContent = profile.full_name.split(' ')[0];
}

// ---- SYNC ----
async function syncAllFromCloud() {
  if (!_sb || !_currentUser) return;
  showToast('Syncing...', 'info', 1500);
  var errors = [];

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
        var cloudQuoteIds = new Set(quotes.map(function(q){ return String(q.id); }));
        // Preserve any local quotes not yet synced to cloud (created before push debounce fired)
        var localOnlyQuotes = (DB.quotes||[]).filter(function(q){ return q.id && !cloudQuoteIds.has(String(q.id)); });
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
        var cloudCustIds = new Set(custs.map(function(c){ return String(c.id); }));
        var localOnlyCusts = (DB.customers||[]).filter(function(c){ return c.id && !cloudCustIds.has(String(c.id)); });
        var cloudCusts = custs.map(function(c) {
          return { id:c.id, name:c.name, company:c.company, email:c.email, phone:c.phone, phone2:c.phone_alt, address:c.address, street:c.street||null, city:c.city, state:c.state, zip:c.zip, defaultTerms:c.default_terms||null, notes:c.notes, active:c.is_active };
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
        var cloudContIds = new Set(conts.map(function(c){ return String(c.id); }));
        var localOnlyConts = (DB.contacts||[]).filter(function(c){ return c.id && !cloudContIds.has(String(c.id)); });
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

    // 9. Team — pull from team table
    try {
      var { data: teamRows, error: te2 } = await _sb.from('team').select('*').eq('is_active', true).order('full_name');
      if (te2) { errors.push('team: '+te2.message); }
      else if (teamRows) {
        var cloudTeamIds = new Set(teamRows.map(function(m){ return String(m.id); }));
        var localOnlyTeam = (DB.team||[]).filter(function(m){ return m.id && !cloudTeamIds.has(String(m.id)); });
        var cloudTeam = teamRows.map(function(m) {
          return {
            id:          m.id,
            name:        m.full_name || '',
            role:        m.role || 'field',
            phone:       m.phone || '',
            email:       m.email || '',
            rate:        m.rate || 65,
            hireDate:    m.hire_date || '',
            showVacation: !!m.show_vacation,
            showPTO:     !!m.show_pto,
            active:      m.is_active !== false
          };
        });
        if (localOnlyTeam.length > 0) setTimeout(pushAllToCloud, 500);
        DB.team = cloudTeam.concat(localOnlyTeam);
      }
    } catch(e) { errors.push('team: '+e.message); }

  }

  saveDB();
  renderDash();

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
  try {
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
        var ctBase = {
          id:          ctId,
          name:        ct.name || '',
          customer_id: ct.customerId || null,
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
        // Base schema columns — always safe to push
        var jbBase = {
          id:              jbId,
          job_number:      jb.num || null,
          name:            jb.name || '',
          customer_id:     jb.customerId || null,
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
  }
}

// Cloud push is now built into saveDB directly — no override needed

// Toast notification
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
}
function hideAuthModal() {
  var modal = document.getElementById('modal-auth');
  if (modal) modal.style.display = 'none';
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
  var email    = (document.getElementById('auth-email')||{}).value || '';
  var password = (document.getElementById('auth-password')||{}).value || '';
  var errEl    = document.getElementById('auth-error');
  var btn      = document.getElementById('auth-btn');
  if (!email || !password) {
    if (errEl) { errEl.style.display='block'; errEl.textContent='Please enter your email and password.'; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.textContent='Signing in...'; btn.disabled=true; }
  var result = await signIn(email, password);
  if (result.error) {
    if (errEl) { errEl.style.display='block'; errEl.textContent=result.error.message||'Sign in failed. Check your credentials.'; }
    if (btn) { btn.textContent='Sign In'; btn.disabled=false; }
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

