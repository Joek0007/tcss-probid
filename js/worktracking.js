// ============================================================
// END PHASE 3
// ============================================================
function toggleDarkMode() {
  var isDark = document.body.classList.toggle('dark-mode');
  DB.settings = Object.assign({}, DB.settings, {darkMode: isDark});
  saveDB();
  var btn = document.getElementById('dark-mode-btn');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  if (btn) btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

function applyDarkMode() {
  var isDark = DB.settings && DB.settings.darkMode;
  if (isDark) {
    document.body.classList.add('dark-mode');
    var btn = document.getElementById('dark-mode-btn');
    if (btn) { btn.textContent='☀️'; btn.title='Switch to light mode'; }
  }
}

// ============================================================
// PHASE 2 — IN-APP NOTIFICATION SYSTEM
// ============================================================
var _notifications = [];

function addNotification(type, title, body, action) {
  var notif = {
    id:        'n-'+Date.now(),
    type:      type,   // 'assignment'|'lunch'|'item_reopened'|'eod'|'message'|'absence'
    title:     title,
    body:      body,
    action:    action||null,
    time:      new Date().toISOString(),
    read:      false
  };
  _notifications.unshift(notif);
  // Keep last 50
  if (_notifications.length > 50) _notifications = _notifications.slice(0,50);
  updateNotifBadge();
  renderNotifPanel();
  // Also show as toast for urgent types
  if (type==='item_reopened'||type==='absence'||type==='message') {
    showToast('🔔 '+title, 'info', 5000);
  }
}

function updateNotifBadge() {
  var unread = _notifications.filter(function(n){ return !n.read; }).length;
  var badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.style.display = unread > 0 ? 'flex' : 'none';
  badge.textContent = unread > 9 ? '9+' : String(unread);
}

function toggleNotifPanel() {
  var panel = document.getElementById('notif-panel');
  if (!panel) return;
  var isOpen = panel.classList.toggle('open');
  if (isOpen) renderNotifPanel();
  // Close on outside click
  if (isOpen) {
    setTimeout(function(){
      document.addEventListener('click', function closePanel(e){
        if (!panel.contains(e.target) && e.target.id!=='notif-bell-wrap') {
          panel.classList.remove('open');
          document.removeEventListener('click', closePanel);
        }
      });
    }, 10);
  }
}

function renderNotifPanel() {
  var list = document.getElementById('notif-panel-list'); if(!list) return;
  if (!_notifications.length) {
    list.innerHTML='<div style="padding:20px;text-align:center;color:#90a4ae;font-size:13px">No notifications yet.</div>';
    return;
  }
  var typeIcons = {assignment:'📅',lunch:'🍽',item_reopened:'🔄',eod:'📊',message:'💬',absence:'🚨',confirm:'✅'};
  list.innerHTML = _notifications.slice(0,20).map(function(n){
    var t = new Date(n.time);
    var timeStr = t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    return '<div class="notif-item'+(n.read?'':' unread')+'" onclick="readNotif(\''+n.id+'\')">'+(n.action?'data-action="'+escHtml(n.action)+'"':'')+'>'+
      '<div class="notif-item-title">'+(typeIcons[n.type]||'🔔')+' '+escHtml(n.title)+'</div>'+
      '<div class="notif-item-body">'+escHtml(n.body||'')+'</div>'+
      '<div class="notif-item-time">'+timeStr+'</div>'+
    '</div>';
  }).join('');
}

function readNotif(id) {
  var n = _notifications.find(function(x){ return x.id===id; });
  if (n) n.read=true;
  updateNotifBadge();
  renderNotifPanel();
}

function markAllNotifsRead() {
  _notifications.forEach(function(n){ n.read=true; });
  updateNotifBadge();
  renderNotifPanel();
}

// ============================================================
// PHASE 2 — GPS MORNING AUTO-DETECT (Q70: C)
// Detects when tech is at office → prompts "Start Day?"
// ============================================================
var _morningPromptShown = false;
var _morningCheckInterval = null;

function startMorningDetection() {
  if (_morningPromptShown || _clockState.status !== 'out') return;
  clearInterval(_morningCheckInterval);
  _morningCheckInterval = setInterval(function(){
    if (_clockState.status !== 'out' || _morningPromptShown) {
      clearInterval(_morningCheckInterval); return;
    }
    var now = new Date();
    var hour = now.getHours();
    if (hour < 5 || hour > 10) return; // Only check 5am-10am window
    var officeAnchor = DB.settings && DB.settings.officeGpsLat
      ? {lat:DB.settings.officeGpsLat, lng:DB.settings.officeGpsLng} : null;
    if (!officeAnchor && !_clockState.outOfTown) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(pos){
      var lat=pos.coords.latitude, lng=pos.coords.longitude;
      var baseAnchor = _clockState.outOfTown && _clockState.hotelAddr
        ? officeAnchor : officeAnchor;
      if (!baseAnchor) return;
      var dist = geoDistanceFt(lat,lng,baseAnchor.lat,baseAnchor.lng);
      if (dist <= GEO_RADIUS_FT) {
        showMorningPrompt(now);
      }
    }, null, {enableHighAccuracy:true,timeout:8000,maximumAge:60000});
  }, 120000); // Check every 2 minutes
}

function showMorningPrompt(now) {
  _morningPromptShown = true;
  var prompt = document.getElementById('geo-morning-prompt');
  var timeEl = document.getElementById('geo-morning-time');
  if (!prompt) return;
  if (timeEl) timeEl.textContent = 'GPS confirms you\'re at base — '+now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
  prompt.style.display='flex';
  // Auto-dismiss after 60 seconds if no action
  setTimeout(function(){ dismissMorningPrompt(); }, 60000);
}

function doStartDayFromPrompt() {
  dismissMorningPrompt();
  goPage('field');
  setTimeout(doStartDay, 300);
}

function dismissMorningPrompt() {
  var prompt = document.getElementById('geo-morning-prompt');
  if (prompt) prompt.style.display='none';
}

// ============================================================
// PHASE 2 — AUTO CLOCK-IN ON GEOFENCE (Q72: C)
// Notification → auto clock-in after 30 seconds if no action
// ============================================================
var _autoClockInTimer = null;
var _autoClockInCountdown = null;

function triggerGeofenceArrival(lat, lng, acc) {
  // Called when GPS detects entry into job site geofence
  if (_clockState.status !== 'traveling') return;
  clearTimeout(_autoClockInTimer);
  clearInterval(_autoClockInCountdown);

  var countdown = 30;
  var geoEl = document.getElementById('geo-alert');
  if (geoEl) {
    geoEl.style.display='block';
    geoEl.style.background='#e8f5e9';
    geoEl.style.borderColor='#a5d6a7';
    geoEl.style.color='#2e7d32';
    geoEl.innerHTML='📍 You\'ve arrived at <strong>'+escHtml(_clockState.jobName||'job site')+'</strong>.<br>'+
      'Clocking in automatically in <strong id="auto-ci-count">30</strong> seconds — '+
      '<button onclick="doArriveOnSite()" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;font-weight:700">Clock In Now</button> '+
      '<button onclick="cancelAutoClockIn()" style="background:none;border:1px solid #2e7d32;color:#2e7d32;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer">Cancel</button>';
  }
  _autoClockInCountdown = setInterval(function(){
    countdown--;
    var el=document.getElementById('auto-ci-count');
    if(el) el.textContent=countdown;
    if(countdown<=0){
      clearInterval(_autoClockInCountdown);
      cancelAutoClockIn();
    }
  },1000);
  _autoClockInTimer = setTimeout(function(){
    clearInterval(_autoClockInCountdown);
    doArriveOnSite();
    addNotification('assignment','Clocked in — '+(_clockState.jobName||'Job'),'Auto clock-in from geofence detection');
  }, 30000);
}

function cancelAutoClockIn() {
  clearTimeout(_autoClockInTimer);
  clearInterval(_autoClockInCountdown);
  clearGeoAlert();
}


// ============================================================
// WORK TRACKING MODULE — TCSS ProBid V9
// Built for Joe Kucinski / TCSS, Asheboro NC
// ============================================================
// Architecture:
//   DB.wtProjects  — project metadata array (synced via auth.js)
//   DB.wtTemplates — saved templates array
//   WT             — runtime state (not persisted)
//   wt_offline_queue (localStorage) — pending check-offs for sync
//   Supabase fetch-on-demand for buildings/floors/rooms/items/checkoffs
// ============================================================

// ─── STATE ────────────────────────────────────────────────────────────────────
var WT = {
  proj:      null,     // active wt_project object
  data:      {},       // keyed project_id → {buildings,floors,rooms,items,checkoffs,reworks,flags}
  view:      'list',   // 'list'|'dashboard'|'building'|'floor'|'room'|'field'|'confirm'|'reworks'|'flags'|'reports'
  bldgId:    null,
  floorId:   null,
  roomId:    null,
  dashTab:   'heatmap',  // 'heatmap'|'table'|'day'
  bldgTab:   'overview', // 'overview'|'phases'|'techs'
  dayFilter: null,       // Date string for day-drill
  loading:   false,
  online:    navigator.onLine,
  wizard:    { open:false, step:1, data:{} },
};

var WT_OFFLINE_KEY   = 'wt_offline_queue';
var WT_CACHE_PREFIX  = 'wt_proj_';

// ─── PHASES ───────────────────────────────────────────────────────────────────
var WT_PHASES = [
  { id:'rough_in',        label:'Rough-In',              short:'RI',  color:'#e65100', bg:'#fff3e0', isVerify:false },
  { id:'rough_in_verify', label:'Rough-In Verification', short:'RIV', color:'#f57c00', bg:'#fff8e1', isVerify:true  },
  { id:'devicing',        label:'Devicing & Terminating', short:'D&T', color:'#1565c0', bg:'#e3f2fd', isVerify:false },
  { id:'testing',         label:'Testing & Labeling',    short:'T&L', color:'#2e7d32', bg:'#e8f5e9', isVerify:false },
  { id:'final_verify',    label:'Final Verification',    short:'FV',  color:'#6a1b9a', bg:'#f3e5f5', isVerify:true  },
];

// ─── ITEM TYPES ───────────────────────────────────────────────────────────────
var WT_ITEM_TYPES = {
  outlet:           { label:'Cable Outlet',            icon:'🔌', cat:'outlet'   },
  ap:               { label:'Wireless AP',             icon:'📡', cat:'device'   },
  camera:           { label:'Camera',                  icon:'📷', cat:'device'   },
  door_controller:  { label:'Door Controller',         icon:'🚪', cat:'device'   },
  deadbolt:         { label:'Electronic Deadbolt',     icon:'🔐', cat:'device'   },
  panel:            { label:'Structured Wiring Panel', icon:'🗄',  cat:'device'   },
  tv_drop:          { label:'TV Drop',                 icon:'📺', cat:'outlet'   },
  speaker:          { label:'Speaker',                 icon:'🔊', cat:'device'   },
  fiber_run:        { label:'Fiber Run',               icon:'🔗', cat:'backbone' },
  backbone_cat6:    { label:'Backbone Cat6',           icon:'🔗', cat:'backbone' },
  control_pad:      { label:'Control Pad',             icon:'🎛',  cat:'device'   },
  other:            { label:'Other',                   icon:'⚙',  cat:'other'    },
};

var WT_UNIT_TYPES = ['Studio','1BR','2BR','3BR','4BR','Common','IDF/MDF','Other'];

var WT_REWORK_CATEGORIES = [
  { id:'inspection_failure', label:'Inspection Failure' },
  { id:'customer_complaint', label:'Customer Complaint' },
  { id:'internal_qc',        label:'Internal QC' },
  { id:'damage',             label:'Damage' },
  { id:'other',              label:'Other' },
];

// ─── OFFLINE QUEUE ────────────────────────────────────────────────────────────
function wtQueueOffline(action) {
  // action: { type:'checkoff'|'rework_resolve'|'flag', data:{...} }
  var q = JSON.parse(localStorage.getItem(WT_OFFLINE_KEY)||'[]');
  action.id = 'offline_'+Date.now()+'_'+Math.random().toString(36).slice(2);
  action.queuedAt = new Date().toISOString();
  action.attempts = 0;
  q.push(action);
  localStorage.setItem(WT_OFFLINE_KEY, JSON.stringify(q));
}

async function wtFlushOfflineQueue() {
  if (!WT.online || !_sb || !_currentUser) return;
  var q = JSON.parse(localStorage.getItem(WT_OFFLINE_KEY)||'[]');
  if (!q.length) return;
  var remaining = [];
  for (var action of q) {
    if (action.attempts >= 3) continue; // drop after 3 failures
    try {
      if (action.type === 'checkoff') {
        await wtSaveCheckoff(action.data, true);
      } else if (action.type === 'flag') {
        await wtSaveFlag(action.data, true);
      }
    } catch(e) {
      action.attempts++;
      remaining.push(action);
    }
  }
  localStorage.setItem(WT_OFFLINE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0 && q.length > 0) {
    showToast('✅ '+q.length+' offline check-offs synced', 'success');
    if (WT.proj) wtLoadProjectData(WT.proj.id).then(wtRenderCurrentView);
  }
}

window.addEventListener('online',  function(){ WT.online=true;  wtUpdateOnlineBadge(); wtFlushOfflineQueue(); });
window.addEventListener('offline', function(){ WT.online=false; wtUpdateOnlineBadge(); });

function wtUpdateOnlineBadge() {
  var el = document.getElementById('wt-online-badge');
  if (!el) return;
  el.textContent = WT.online ? '🟢 Online' : '🔴 Offline — changes queued';
  el.style.color  = WT.online ? '#2e7d32' : '#c62828';
}

// ─── SUPABASE LAYER ───────────────────────────────────────────────────────────
async function wtLoadProjectData(projId) {
  if (!_sb) return;
  WT.loading = true;
  try {
    var [bRes, fRes, rRes, iRes, coRes, rwRes, flRes] = await Promise.all([
      _sb.from('wt_buildings').select('*').eq('project_id', projId).order('sort_order'),
      _sb.from('wt_floors').select('*').eq('project_id', projId).order('sort_order'),
      _sb.from('wt_rooms').select('*').eq('project_id', projId).order('sort_order'),
      _sb.from('wt_items').select('*').eq('project_id', projId).order('sort_order'),
      _sb.from('wt_checkoffs').select('*').eq('project_id', projId),
      _sb.from('wt_reworks').select('*').eq('project_id', projId).order('created_at', {ascending:false}),
      _sb.from('wt_flags').select('*').eq('project_id', projId).order('created_at', {ascending:false}),
    ]);
    WT.data[projId] = {
      buildings: bRes.data  || [],
      floors:    fRes.data  || [],
      rooms:     rRes.data  || [],
      items:     iRes.data  || [],
      checkoffs: coRes.data || [],
      reworks:   rwRes.data || [],
      flags:     flRes.data || [],
    };
  } finally {
    WT.loading = false;
  }
}

async function wtSaveCheckoff(co, skipQueue) {
  if (!WT.online && !skipQueue) {
    wtQueueOffline({ type:'checkoff', data:co });
    // Optimistically update local cache
    var d = WT.data[co.project_id];
    if (d) {
      var existing = d.checkoffs.find(function(x){ return x.item_id===co.item_id && x.phase===co.phase; });
      if (existing) { Object.assign(existing, co); }
      else { d.checkoffs.push(Object.assign({ id:'offline_'+Date.now() }, co)); }
    }
    return;
  }
  // Upsert by (item_id, phase)
  var { data, error } = await _sb.from('wt_checkoffs')
    .upsert(co, { onConflict:'item_id,phase' })
    .select().single();
  if (error) throw error;
  // Update local cache
  var d = WT.data[co.project_id];
  if (d) {
    var idx = d.checkoffs.findIndex(function(x){ return x.item_id===co.item_id && x.phase===co.phase; });
    if (idx >= 0) d.checkoffs[idx] = data;
    else d.checkoffs.push(data);
  }
  return data;
}

async function wtSaveFlag(flag, skipQueue) {
  if (!WT.online && !skipQueue) {
    wtQueueOffline({ type:'flag', data:flag });
    return;
  }
  var { data, error } = await _sb.from('wt_flags').insert(flag).select().single();
  if (error) throw error;
  var d = WT.data[flag.project_id];
  if (d) d.flags.unshift(data);
  return data;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function wtProjData() { return WT.proj ? (WT.data[WT.proj.id] || {}) : {}; }

function wtPhaseLabel(phaseId) {
  var p = WT_PHASES.find(function(x){ return x.id===phaseId; });
  return p ? p.label : phaseId;
}

function wtGetCheckoff(itemId, phase) {
  var d = wtProjData();
  return (d.checkoffs||[]).find(function(c){ return c.item_id===itemId && c.phase===phase; });
}

function wtItemPct(item) {
  // Returns 0-100 based on how many phases are confirmed/complete
  var phases = (item.phases_required || ['rough_in','rough_in_verify','devicing','testing','final_verify']);
  var done = phases.filter(function(ph){
    var co = wtGetCheckoff(item.id, ph);
    return co && (co.status==='confirmed' || co.status==='complete');
  }).length;
  return Math.round((done / phases.length) * 100);
}

function wtBuildingPct(buildingId) {
  var d = wtProjData();
  var items = (d.items||[]).filter(function(i){ return i.building_id===buildingId; });
  if (!items.length) return 0;
  var total = items.reduce(function(s,i){ return s + wtItemPct(i); }, 0);
  return Math.round(total / items.length);
}

function wtPhasePct(phase, buildingId) {
  var d = wtProjData();
  var items = (d.items||[]).filter(function(i){ return !buildingId || i.building_id===buildingId; });
  if (!items.length) return 0;
  var done = items.filter(function(i){
    var co = wtGetCheckoff(i.id, phase);
    return co && (co.status==='confirmed'||co.status==='complete');
  }).length;
  return Math.round((done/items.length)*100);
}

function wtCurrentUserName() {
  return _currentUser ? (_currentUser.full_name||_currentUser.email||'Unknown') : 'Unknown';
}

function wtCurrentUserId() {
  return _currentUser ? _currentUser.id : null;
}

function wtIsVerifyRole() {
  // Verification phases require lead_tech, project_manager, or admin
  var r = _currentUser ? _currentUser.role : '';
  return r==='admin'||r==='owner'||r==='lead_tech'||r==='project_manager'||r==='office';
}

// ─── MAIN PAGE ENTRY ─────────────────────────────────────────────────────────
function wtScrollTop() {
  // Scroll both the window and the content area to top
  window.scrollTo(0, 0);
  var m = document.getElementById('wt-main');
  if (m) m.scrollTop = 0;
  var content = document.getElementById('content');
  if (content) content.scrollTop = 0;
}

function renderWorkTracking() {
  wtScrollTop();
  wtFlushOfflineQueue();
  if (WT.view === 'list' || !WT.proj) {
    wtRenderProjectList();
  } else {
    wtRenderCurrentView();
  }
}

function wtRenderCurrentView() {
  switch (WT.view) {
    case 'list':      wtRenderProjectList();       break;
    case 'dashboard': wtRenderDashboard();         break;
    case 'building':  wtRenderBuildingView();      break;
    case 'floor':     wtRenderFloorView();         break;
    case 'room':      wtRenderRoomView();          break;
    case 'field':     wtRenderFieldView();         break;
    case 'confirm':   wtRenderConfirmView();       break;
    case 'reworks':   wtRenderReworksView();       break;
    case 'flags':     wtRenderFlagsView();         break;
    case 'reports':   wtRenderReportsView();       break;
    default:          wtRenderProjectList();
  }
}


function wtProjectCard(p) {
  var statusColor = { active:'#2e7d32', paused:'#e65100', completed:'#1565c0', archived:'#90a4ae' };
  return '<div class="card" style="transition:box-shadow .15s;border-left:3px solid '+(statusColor[p.status]||'#90a4ae')+'" onmouseenter="this.style.boxShadow=\'0 6px 20px rgba(0,0,0,.12)\'" onmouseleave="this.style.boxShadow=\'\'" >'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:16px;font-weight:800;color:#0d1b2a">'+escHtml(p.name)+'</div>'+
        (p.customer_name?'<div style="font-size:12px;color:#546e7a;margin-top:2px">'+escHtml(p.customer_name)+'</div>':'')+
        (p.systems&&p.systems.length?'<div style="font-size:11px;color:#90a4ae;margin-top:2px">'+p.systems.length+' systems selected</div>':'')+
      '</div>'+
      '<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;background:'+(statusColor[p.status]||'#90a4ae')+'20;color:'+(statusColor[p.status]||'#90a4ae')+';flex-shrink:0">'+
        (p.status||'active').toUpperCase()+
      '</span>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid #f0f0f0">'+
      '<div style="font-size:12px;color:#90a4ae">Created '+new Date(p.created_at).toLocaleDateString()+'</div>'+
      '<button onclick="wtOpenProject(\''+p.id+'\')" class="btn btn-primary btn-sm">Open Project →</button>'+
    '</div>'+
  '</div>';
}
async function wtOpenProject(projId) {
  try {
    var p = (DB.wtProjects||[]).find(function(x){ return x.id===projId; });
    if (!p) {
      // Try a direct Supabase fetch if not in local cache
      if (_sb) {
        var { data:pd } = await _sb.from('wt_projects').select('*').eq('id',projId).single();
        if (pd) { p = pd; if (!DB.wtProjects) DB.wtProjects=[]; DB.wtProjects.push(pd); saveDB(); }
      }
      if (!p) { showToast('Project not found — try refreshing the page','error'); return; }
    }
    WT.proj = p;
    WT.view = 'dashboard';
    WT.bldgId = null; WT.floorId = null; WT.roomId = null;
    wtScrollTop();
    // Show inline loading state immediately
    var el = document.getElementById('wt-main');
    if (el) el.innerHTML = '<div style="padding:60px;text-align:center;color:#546e7a"><div style="font-size:32px;margin-bottom:12px">&#x231B;</div><div style="font-size:16px;font-weight:600">Loading '+escHtml(p.name)+'...</div></div>';
    await wtLoadProjectData(projId);
    wtRenderDashboard();
  } catch(e) {
    console.error('wtOpenProject error:', e);
    showToast('Error: '+(e.message||String(e)),'error');
  }
}


function wtDashTab(tab) {
  WT.dashTab = tab;
  var el = document.getElementById('wt-dash-content');
  if (el) el.innerHTML = wtRenderDashContent();
  // Re-render the toggle buttons
  document.querySelectorAll('[onclick^="wtDashTab"]').forEach(function(b){
    var t = b.getAttribute('onclick').match(/'([^']+)'/)[1];
    b.style.border = '2px solid '+(WT.dashTab===t?'#1565c0':'#e0e0e0');
    b.style.background = WT.dashTab===t?'#1565c0':'#fff';
    b.style.color = WT.dashTab===t?'#fff':'#546e7a';
  });
}

function wtRenderDashContent() {
  if (WT.dashTab === 'heatmap')  return wtHeatmap();
  if (WT.dashTab === 'table')    return wtPhaseTable();
  if (WT.dashTab === 'day')      return wtDayDrill();
  return '';
}

function wtHeatmap() {
  var d = wtProjData();
  var buildings = d.buildings || [];
  if (!buildings.length) return '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No buildings yet. Click "+ Building" to add one.</div>';

  return buildings.map(function(b) {
    var pct = wtBuildingPct(b.id);
    var color = pct===100?'#2e7d32':pct>=75?'#1565c0':pct>=50?'#f57c00':pct>=25?'#e65100':'#c62828';
    var bg = pct===100?'#e8f5e9':pct>=75?'#e3f2fd':pct>=50?'#fff3e0':pct>=25?'#fff8e1':'#ffebee';
    var items = (d.items||[]).filter(function(i){ return i.building_id===b.id; });
    var pending = (d.reworks||[]).filter(function(r){ return r.building_id===b.id && r.status!=='resolved'; });
    var floors = (d.floors||[]).filter(function(f){ return f.building_id===b.id; });

    return '<div class="card" style="margin-bottom:12px;border-left:4px solid '+color+';cursor:pointer" onclick="wtNavBuilding(\''+b.id+'\')">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'+
        '<div>'+
          '<div style="font-size:16px;font-weight:800;color:#0d1b2a">'+escHtml(b.name)+'</div>'+
          '<div style="font-size:12px;color:#546e7a">'+
            floors.length+' floors · '+items.length+' items'+
            (pending.length?' · <span style="color:#c62828;font-weight:600">'+pending.length+' open reworks</span>':'')+
          '</div>'+
        '</div>'+
        '<div style="background:'+bg+';border-radius:12px;padding:8px 16px;text-align:center">'+
          '<div style="font-size:28px;font-weight:900;color:'+color+'">'+pct+'%</div>'+
          '<div style="font-size:10px;font-weight:700;color:'+color+';text-transform:uppercase">Complete</div>'+
        '</div>'+
      '</div>'+
      // Phase breakdown per building
      '<div style="display:flex;gap:4px">'+
        WT_PHASES.map(function(ph){
          var p = wtPhasePct(ph.id, b.id);
          return '<div style="flex:1;min-width:0;text-align:center">'+
            '<div style="font-size:9px;font-weight:700;color:'+ph.color+';margin-bottom:2px">'+ph.short+'</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:8px">'+
              '<div style="background:'+ph.color+';height:8px;border-radius:3px;width:'+p+'%"></div>'+
            '</div>'+
            '<div style="font-size:9px;color:#90a4ae;margin-top:1px">'+p+'%</div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}

function wtPhaseTable() {
  var d = wtProjData();
  var buildings = d.buildings || [];
  if (!buildings.length) return '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No buildings yet.</div>';

  var hdr = '<th style="text-align:left;padding:10px 12px;background:#f5f7fa;font-size:12px;font-weight:700;color:#546e7a;border-bottom:2px solid #e0e0e0">Building</th>'+
    WT_PHASES.map(function(ph){
      return '<th style="text-align:center;padding:10px 8px;background:#f5f7fa;font-size:11px;font-weight:700;color:'+ph.color+';border-bottom:2px solid #e0e0e0">'+ph.short+'</th>';
    }).join('')+
    '<th style="text-align:center;padding:10px 8px;background:#f5f7fa;font-size:12px;font-weight:700;color:#546e7a;border-bottom:2px solid #e0e0e0">Total</th>';

  var rows = buildings.map(function(b){
    var cells = WT_PHASES.map(function(ph){
      var p = wtPhasePct(ph.id, b.id);
      var c = p===100?'#2e7d32':p>=50?'#1565c0':'#546e7a';
      return '<td style="text-align:center;padding:10px 8px;border-bottom:1px solid #f0f0f0">'+
        '<div style="font-size:14px;font-weight:700;color:'+c+'">'+p+'%</div>'+
        '<div style="background:#e0e0e0;border-radius:2px;height:4px;width:50px;margin:4px auto 0">'+
          '<div style="background:'+c+';height:4px;border-radius:2px;width:'+p+'%"></div>'+
        '</div>'+
      '</td>';
    }).join('');
    var total = wtBuildingPct(b.id);
    var tc = total===100?'#2e7d32':total>=50?'#1565c0':'#546e7a';
    return '<tr onclick="wtNavBuilding(\''+b.id+'\')" style="cursor:pointer" onmouseenter="this.style.background=\'#f9f9f9\'" onmouseleave="this.style.background=\'\'">'+
      '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:700;font-size:13px;color:#0d1b2a">'+escHtml(b.name)+'</td>'+
      cells+
      '<td style="text-align:center;padding:10px 8px;border-bottom:1px solid #f0f0f0">'+
        '<span style="font-size:15px;font-weight:800;color:'+tc+'">'+total+'%</span>'+
      '</td>'+
    '</tr>';
  }).join('');

  return '<div class="card" style="overflow-x:auto">'+
    '<table style="width:100%;border-collapse:collapse">'+
      '<thead><tr>'+hdr+'</tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
    '</table>'+
  '</div>';
}

function wtDayDrill() {
  var d = wtProjData();
  var dateInput = WT.dayFilter || new Date().toISOString().slice(0,10);
  var checkoffs = (d.checkoffs||[]).filter(function(c){
    return c.checked_at && c.checked_at.slice(0,10)===dateInput;
  });

  var grouped = {}; // user_name → [{item,phase,note,time}]
  checkoffs.forEach(function(c){
    var techList = Array.isArray(c.checked_by) ? c.checked_by : [];
    if (!techList.length && c.checked_by_name) techList = [{user_name:c.checked_by_name}];
    techList.forEach(function(t){
      var name = t.user_name||'Unknown';
      if (!grouped[name]) grouped[name]=[];
      var item = (d.items||[]).find(function(i){ return i.id===c.item_id; });
      grouped[name].push({ item:item, phase:c.phase, note:c.note, status:c.status, time:c.checked_at });
    });
  });

  return '<div class="card" style="margin-bottom:12px">'+
    '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'+
      '<div class="card-title" style="margin:0">📅 Day Drill</div>'+
      '<input type="date" value="'+dateInput+'" onchange="WT.dayFilter=this.value;document.getElementById(\'wt-dash-content\').innerHTML=wtRenderDashContent()" '+
        'style="padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px">'+
      '<span style="font-size:13px;color:#546e7a">'+checkoffs.length+' check-offs on this day</span>'+
    '</div>'+
  '</div>'+
  (!Object.keys(grouped).length
    ? '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No check-offs recorded on this date.</div>'
    : Object.keys(grouped).map(function(name){
        var checks = grouped[name];
        return '<div class="card" style="margin-bottom:12px">'+
          '<div style="font-size:15px;font-weight:800;color:#0d1b2a;margin-bottom:12px">👷 '+escHtml(name)+' &mdash; '+checks.length+' items</div>'+
          '<table style="width:100%;border-collapse:collapse">'+
            checks.map(function(c){
              var ph = WT_PHASES.find(function(x){ return x.id===c.phase; }) || {};
              return '<tr>'+
                '<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">'+escHtml((c.item&&c.item.name)||'Unknown item')+'</td>'+
                '<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+(ph.bg||'#f5f5f5')+';color:'+(ph.color||'#546e7a')+'">'+escHtml(ph.short||c.phase)+'</span></td>'+
                '<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#546e7a">'+escHtml(c.note||'')+'</td>'+
                '<td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#90a4ae">'+(c.time?new Date(c.time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}):'')+'</td>'+
              '</tr>';
            }).join('')+
          '</table>'+
        '</div>';
      }).join('')
  );
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function wtNav(view) {
  WT.view = view;
  wtScrollTop();
  wtRenderCurrentView();
}

function wtNavBuilding(bldgId) {
  WT.view = 'building'; WT.bldgId = bldgId;
  wtScrollTop(); wtRenderBuildingView();
}

function wtNavFloor(floorId) {
  WT.view = 'floor'; WT.floorId = floorId;
  wtScrollTop(); wtRenderFloorView();
}

function wtNavRoom(roomId) {
  WT.view = 'room'; WT.roomId = roomId;
  wtScrollTop(); wtRenderRoomView();
}

function wtBreadcrumb() {
  var crumbs = [{ label:'Projects', onclick:'WT.view=\'list\'; WT.proj=null; wtRenderProjectList()' }];
  if (WT.proj) crumbs.push({ label:escHtml(WT.proj.name), onclick:'wtNav(\'dashboard\')' });
  if (WT.view==='building'||WT.view==='floor'||WT.view==='room') {
    var d = wtProjData();
    if (WT.bldgId) {
      var b = (d.buildings||[]).find(function(x){ return x.id===WT.bldgId; });
      if (b) crumbs.push({ label:escHtml(b.name), onclick:'wtNavBuilding(\''+WT.bldgId+'\')' });
    }
    if (WT.floorId) {
      var f = (d.floors||[]).find(function(x){ return x.id===WT.floorId; });
      if (f) crumbs.push({ label:escHtml(f.name), onclick:'wtNavFloor(\''+WT.floorId+'\')' });
    }
    if (WT.roomId) {
      var r = (d.rooms||[]).find(function(x){ return x.id===WT.roomId; });
      if (r) crumbs.push({ label:escHtml(r.name) });
    }
  } else if (WT.view!=='list'&&WT.view!=='dashboard') {
    crumbs.push({ label: {field:'Field View',confirm:'Confirm',reworks:'Reworks',flags:'Flags',reports:'Reports'}[WT.view]||WT.view });
  }

  return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;font-size:13px">'+
    crumbs.map(function(c,i){
      return (c.onclick&&i<crumbs.length-1)
        ? '<span onclick="'+c.onclick+'" style="color:#1565c0;cursor:pointer;font-weight:600">'+c.label+'</span>'
        : '<span style="color:'+(i<crumbs.length-1?'#90a4ae':'#0d1b2a')+';font-weight:'+(i<crumbs.length-1?'400':'700')+'">'+c.label+'</span>';
    }).join('<span style="color:#90a4ae;margin:0 2px">›</span>')+
  '</div>';
}





// ─── CHECK-OFF MODAL ──────────────────────────────────────────────────────────
var _wtCheckoffItem = null;
var _wtCheckoffPhase = null;
var _wtCheckoffPhotos = [];

function openWTCheckoffModal(itemId, phase) {
  var d = wtProjData();
  _wtCheckoffItem  = (d.items||[]).find(function(i){ return i.id===itemId; });
  _wtCheckoffPhase = phase;
  _wtCheckoffPhotos = [];
  if (!_wtCheckoffItem) return;

  var ph = WT_PHASES.find(function(x){ return x.id===phase; }) || {};
  var co = wtGetCheckoff(itemId, phase);
  var isVerify = ph.isVerify;
  var canVerify = wtIsVerifyRole();
  var locked = co && co.status==='confirmed';

  var existingCheckers = '';
  if (co && Array.isArray(co.checked_by) && co.checked_by.length) {
    existingCheckers = '<div style="margin-bottom:12px;padding:10px;background:#f5f7fa;border-radius:8px">'+
      '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:6px">ALREADY CHECKED BY</div>'+
      co.checked_by.map(function(t){
        return '<div style="font-size:13px;font-weight:600;color:#0d1b2a">✓ '+escHtml(t.user_name||'')+'<span style="font-size:11px;color:#90a4ae;margin-left:8px">'+(t.checked_at?new Date(t.checked_at).toLocaleString():'')+'</span></div>';
      }).join('')+
    '</div>';
  }

  var html = '<div class="modal-overlay open" id="wt-checkoff-modal" onclick="if(event.target===this)closeWTCheckoffModal()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head" style="border-bottom-color:'+ph.color+'">'+
        '<h3 style="color:'+ph.color+'">'+escHtml(ph.label||phase)+'</h3>'+
        '<button class="btn-icon" onclick="closeWTCheckoffModal()">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="font-size:15px;font-weight:700;color:#0d1b2a;margin-bottom:16px">'+escHtml(_wtCheckoffItem.name)+'</div>'+
        existingCheckers+
        (locked
          ? '<div style="padding:16px;background:#e8f5e9;border-radius:8px;color:#2e7d32;font-weight:600;text-align:center">'+
              '✅ Confirmed by '+escHtml(co.confirmed_by_name||'')+'<br>'+
              '<span style="font-size:11px;font-weight:400">'+(co.confirmed_at?new Date(co.confirmed_at).toLocaleString():'')+'</span>'+
            '</div>'+
            ((_currentUser&&(_currentUser.role==='admin'||_currentUser.role==='owner'))
              ? '<button class="btn btn-outline btn-sm" style="margin-top:12px;width:100%" onclick="wtUnlockCheckoff(\''+itemId+'\',\''+phase+'\')">🔓 Back Office Unlock</button>'
              : '')
          : '<div>'+
              (isVerify&&!canVerify
                ? '<div style="padding:12px;background:#fff3e0;border-radius:8px;color:#e65100;font-size:13px;font-weight:600;margin-bottom:12px">'+
                    '⚠ Verification phases require Lead Tech or Project Manager'+
                  '</div>'
                : '')+
              '<div style="margin-bottom:12px">'+
                '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">STATUS</label>'+
                '<div style="display:flex;gap:8px">'+
                  '<button id="wt-co-btn-complete" onclick="document.getElementById(\'wt-co-status\').value=\'complete\';document.querySelectorAll(\'[id^=wt-co-btn]\').forEach(function(b){b.style.border=\'2px solid #e0e0e0\';b.style.background=\'#fff\'});this.style.border=\'2px solid '+ph.color+'\';this.style.background=\''+ph.bg+'\'" '+
                    'style="flex:1;padding:10px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer">✓ Complete</button>'+
                  '<button id="wt-co-btn-progress" onclick="document.getElementById(\'wt-co-status\').value=\'in_progress\';document.querySelectorAll(\'[id^=wt-co-btn]\').forEach(function(b){b.style.border=\'2px solid #e0e0e0\';b.style.background=\'#fff\'});this.style.border=\'2px solid #f57c00\';this.style.background=\'#fff8e1\'" '+
                    'style="flex:1;padding:10px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer">⏳ In Progress</button>'+
                '</div>'+
                '<input type="hidden" id="wt-co-status" value="">'+
              '</div>'+
              '<div style="margin-bottom:12px">'+
                '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">NOTE (optional)</label>'+
                '<textarea id="wt-co-note" rows="2" placeholder="Any notes about this phase..." '+
                  'style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;resize:vertical">'+escHtml((co&&co.note)||'')+'</textarea>'+
              '</div>'+
              // Photo upload
              ((item_photo_required(itemId,phase))
                ? '<div style="margin-bottom:12px;padding:10px;background:#fff3e0;border-radius:8px;font-size:12px;font-weight:700;color:#e65100">📸 Photo required for this item type</div>'
                : '')+
              '<div style="margin-bottom:16px">'+
                '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">PHOTOS</label>'+
                '<div id="wt-co-photo-list" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"></div>'+
                '<label style="cursor:pointer;display:inline-block;padding:8px 14px;background:#f5f7fa;border:2px dashed #ccc;border-radius:8px;font-size:13px;color:#546e7a">'+
                  '📸 Add Photo <input type="file" accept="image/*" multiple onchange="wtAddCheckoffPhotos(this)" style="display:none">'+
                '</label>'+
              '</div>'+
              '<div style="display:flex;gap:8px">'+
                '<button class="btn btn-primary" style="flex:1" onclick="wtSubmitCheckoff()">Submit</button>'+
                (co&&(co.status==='complete'||co.status==='in_progress')&&canVerify
                  ? '<button class="btn btn-success" style="flex:1" onclick="wtConfirmCheckoff(\''+itemId+'\',\''+phase+'\')">✅ Confirm</button>'
                  : '')+
                (co&&co.status!=='rejected'&&co.status!=='confirmed'&&(_currentUser&&(_currentUser.role==='admin'||_currentUser.role==='owner'||_currentUser.role==='lead_tech'))
                  ? '<button class="btn btn-outline" onclick="wtRejectCheckoffPrompt(\''+itemId+'\',\''+phase+'\')">Reject</button>'
                  : '')+
              '</div>'+
            '</div>'
        )+
      '</div>'+
    '</div>'+
  '</div>';

  var existing = document.getElementById('wt-checkoff-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function item_photo_required(itemId, phase) {
  var d = wtProjData();
  var item = (d.items||[]).find(function(i){ return i.id===itemId; });
  if (!item || !item.photo_required_phases) return false;
  return item.photo_required_phases.indexOf(phase) >= 0;
}

function wtAddCheckoffPhotos(input) {
  if (!input.files) return;
  Array.from(input.files).forEach(function(file){
    var reader = new FileReader();
    reader.onload = function(e){
      _wtCheckoffPhotos.push({ dataUrl: e.target.result, name: file.name });
      wtRenderCheckoffPhotoList();
    };
    reader.readAsDataURL(file);
  });
}

function wtRenderCheckoffPhotoList() {
  var list = document.getElementById('wt-co-photo-list'); if (!list) return;
  list.innerHTML = _wtCheckoffPhotos.map(function(p,i){
    return '<div style="position:relative">'+
      '<img src="'+p.dataUrl+'" style="width:60px;height:60px;object-fit:cover;border-radius:6px">'+
      '<button onclick="_wtCheckoffPhotos.splice('+i+',1);wtRenderCheckoffPhotoList()" '+
        'style="position:absolute;top:-6px;right:-6px;background:#c62828;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>'+
    '</div>';
  }).join('');
}

async function wtSubmitCheckoff() {
  var status = (document.getElementById('wt-co-status')||{}).value;
  if (!status) { showToast('Please select Complete or In Progress', 'warning'); return; }
  if (!_wtCheckoffItem || !_wtCheckoffPhase) return;

  var note = (document.getElementById('wt-co-note')||{}).value || '';
  var projId = WT.proj ? WT.proj.id : null;
  var co = wtGetCheckoff(_wtCheckoffItem.id, _wtCheckoffPhase) || {};

  // Build or update checked_by array (multi-tech support)
  var checkers = Array.isArray(co.checked_by) ? co.checked_by.slice() : [];
  var myEntry = { user_id: wtCurrentUserId(), user_name: wtCurrentUserName(), checked_at: new Date().toISOString() };
  var myIdx = checkers.findIndex(function(t){ return t.user_id === wtCurrentUserId(); });
  if (myIdx >= 0) checkers[myIdx] = myEntry; else checkers.push(myEntry);

  var payload = {
    item_id:     _wtCheckoffItem.id,
    project_id:  projId,
    phase:       _wtCheckoffPhase,
    status:      status,
    checked_by:  checkers,
    checked_at:  new Date().toISOString(),
    note:        note,
    photos:      _wtCheckoffPhotos.map(function(p){ return p.dataUrl; }), // TODO: upload to Supabase storage
    offline_id:  'offl_'+Date.now(),
  };

  try {
    await wtSaveCheckoff(payload);
    closeWTCheckoffModal();
    wtRenderCurrentView();
    showToast((status==='complete'?'✅':'⏳')+' Check-off saved', 'success');
  } catch(e) {
    showToast('Error saving: '+e.message, 'error');
  }
}

async function wtConfirmCheckoff(itemId, phase) {
  var co = wtGetCheckoff(itemId, phase);
  if (!co || !co.id) return;
  try {
    var payload = {
      item_id: itemId, phase: phase,
      project_id: WT.proj.id,
      status: 'confirmed',
      confirmed_by: wtCurrentUserId(),
      confirmed_by_name: wtCurrentUserName(),
      confirmed_at: new Date().toISOString(),
    };
    Object.assign(co, payload);
    await wtSaveCheckoff(Object.assign({}, co, payload));
    closeWTCheckoffModal();
    wtRenderCurrentView();
    showToast('✅ Check-off confirmed and locked', 'success');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

async function wtUnlockCheckoff(itemId, phase) {
  if (!confirm('This will unlock a confirmed check-off. Back office only. Continue?')) return;
  var co = wtGetCheckoff(itemId, phase);
  if (!co) return;
  try {
    var payload = Object.assign({}, co, { status:'complete', confirmed_by:null, confirmed_by_name:null, confirmed_at:null });
    await wtSaveCheckoff(payload);
    closeWTCheckoffModal();
    wtRenderCurrentView();
    showToast('🔓 Check-off unlocked', 'info');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

async function wtRejectCheckoffPrompt(itemId, phase) {
  var reason = prompt('Reason for rejection:');
  if (!reason) return;
  var co = wtGetCheckoff(itemId, phase);
  if (!co) return;
  try {
    var payload = Object.assign({}, co, {
      status: 'rejected',
      rejected_by: wtCurrentUserId(),
      rejected_by_name: wtCurrentUserName(),
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    });
    await wtSaveCheckoff(payload);
    // Auto-create rework
    await wtCreateRework(itemId, co.id||null, reason, 'internal_qc', 'original_tech');
    closeWTCheckoffModal();
    wtRenderCurrentView();
    showToast('❌ Rejected and rework logged', 'warning');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

function closeWTCheckoffModal() {
  var m = document.getElementById('wt-checkoff-modal'); if (m) m.remove();
}

// ─── FIELD VIEW ───────────────────────────────────────────────────────────────
function wtRenderFieldView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'field';
  var d = wtProjData();
  var buildings = d.buildings || [];
  var allItems  = d.items || [];

  // Items not yet fully confirmed
  var pending = allItems.filter(function(i){ return wtItemPct(i) < 100; });
  var myItems  = pending.filter(function(i){
    return (d.checkoffs||[]).some(function(c){
      return c.item_id===i.id && Array.isArray(c.checked_by) &&
        c.checked_by.some(function(t){ return t.user_id===wtCurrentUserId(); });
    });
  });
  var unassigned = pending.filter(function(i){ return !myItems.some(function(x){ return x.id===i.id; }); });

  el.innerHTML = wtBreadcrumb()+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+
      '<div>'+
        '<h3 style="margin:0;font-size:18px;font-weight:800;color:#0d1b2a">📱 Field View</h3>'+
        '<div style="font-size:12px;color:#546e7a">'+escHtml(wtCurrentUserName())+' · '+
          '<span id="wt-online-badge" style="font-weight:600"></span>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-outline btn-sm" onclick="wtAddFlag(null,null)">🚩 Report Issue</button>'+
    '</div>'+
    // Navigate by building
    '<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:16px">'+
      '<button onclick="document.getElementById(\'wt-field-area\').value=\'\';wtRenderFieldItems()" '+
        'style="flex-shrink:0;padding:8px 14px;border:2px solid #1565c0;border-radius:20px;background:#1565c0;color:#fff;font-size:12px;font-weight:700;cursor:pointer">All</button>'+
      buildings.map(function(b){
        return '<button onclick="document.getElementById(\'wt-field-area\').value=\''+b.id+'\';wtRenderFieldItems()" '+
          'style="flex-shrink:0;padding:8px 14px;border:2px solid #e0e0e0;border-radius:20px;background:#fff;color:#546e7a;font-size:12px;font-weight:600;cursor:pointer">'+
          escHtml(b.name)+'</button>';
      }).join('')+
    '</div>'+
    // Search + phase filter
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">'+
      '<input id="wt-field-search" placeholder="🔍 Search items..." oninput="wtRenderFieldItems()" '+
        'style="flex:1;min-width:160px;padding:10px 12px;border:2px solid #e0e0e0;border-radius:10px;font-size:14px">'+
      '<select id="wt-field-phase" onchange="wtRenderFieldItems()" '+
        'style="padding:10px;border:2px solid #e0e0e0;border-radius:10px;font-size:13px">'+
        '<option value="">All Phases</option>'+
        WT_PHASES.map(function(ph){ return '<option value="'+ph.id+'">'+ph.short+' — '+ph.label+'</option>'; }).join('')+
      '</select>'+
    '</div>'+
    '<input type="hidden" id="wt-field-area" value="">'+
    '<div id="wt-field-items"></div>';

  wtRenderFieldItems();
  wtUpdateOnlineBadge();
}

function wtRenderFieldItems() {
  var el = document.getElementById('wt-field-items'); if (!el) return;
  var d = wtProjData();
  var search = ((document.getElementById('wt-field-search')||{}).value||'').toLowerCase();
  var phFilter = (document.getElementById('wt-field-phase')||{}).value||'';
  var areaFilter = (document.getElementById('wt-field-area')||{}).value||'';

  var items = (d.items||[]).filter(function(i){
    if (areaFilter && i.building_id !== areaFilter) return false;
    if (search && i.name.toLowerCase().indexOf(search) < 0) return false;
    return true;
  });

  // Group by room
  var roomMap = {};
  items.forEach(function(i){
    var rId = i.room_id || '_none';
    if (!roomMap[rId]) roomMap[rId] = [];
    roomMap[rId].push(i);
  });

  var html = '';
  Object.keys(roomMap).forEach(function(rId){
    var room = (d.rooms||[]).find(function(r){ return r.id===rId; });
    var floor = room ? (d.floors||[]).find(function(f){ return f.id===room.floor_id; }) : null;
    var bldg  = room ? (d.buildings||[]).find(function(b){ return b.id===room.building_id; }) : null;
    var rItems = roomMap[rId];

    html += '<div class="card" style="margin-bottom:12px">'+
      '<div style="font-size:14px;font-weight:800;color:#0d1b2a;margin-bottom:4px">'+
        escHtml(room ? room.name : 'No Room')+
      '</div>'+
      '<div style="font-size:11px;color:#90a4ae;margin-bottom:10px">'+
        (bldg?escHtml(bldg.name)+' · ':'')+
        (floor?escHtml(floor.name):'')+'</div>'+
      rItems.map(function(item){
        var phases = item.phases_required || ['rough_in','rough_in_verify','devicing','testing','final_verify'];
        var phasesToShow = phFilter ? phases.filter(function(p){ return p===phFilter; }) : phases;
        return '<div style="border-top:1px solid #f0f0f0;padding:10px 0">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
            '<div>'+
              '<span style="font-size:16px">'+(WT_ITEM_TYPES[item.item_type]||{icon:'⚙'}).icon+'</span>'+
              ' <span style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(item.name)+'</span>'+
            '</div>'+
            '<span style="font-size:13px;font-weight:800;color:'+(wtItemPct(item)===100?'#2e7d32':'#1565c0')+'">'+wtItemPct(item)+'%</span>'+
          '</div>'+
          // Phase buttons — big tap targets for field use
          '<div style="display:grid;grid-template-columns:repeat('+phasesToShow.length+',1fr);gap:6px">'+
            phasesToShow.map(function(phId){
              var ph = WT_PHASES.find(function(x){ return x.id===phId; }) || {};
              var co = wtGetCheckoff(item.id, phId);
              var st = co ? co.status : 'pending';
              var isLocked = st==='confirmed';
              var bg = st==='confirmed'?ph.color:st==='complete'?ph.bg:'#f5f5f5';
              var clr = st==='confirmed'?'#fff':st==='complete'?ph.color:'#90a4ae';
              var border = st==='confirmed'||st==='complete' ? ph.color : '#e0e0e0';
              return '<button onclick="openWTCheckoffModal(\''+item.id+'\',\''+phId+'\')" '+
                'style="padding:12px 6px;border:2px solid '+border+';border-radius:10px;background:'+bg+';color:'+clr+';font-size:11px;font-weight:700;cursor:pointer;min-height:52px;text-align:center;line-height:1.3">'+
                (st==='confirmed'?'✅':'')+(st==='complete'?'⏳':'')+(st==='rejected'?'❌':'')+
                '<div>'+escHtml(ph.short||phId)+'</div>'+
              '</button>';
            }).join('')+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';
  });

  el.innerHTML = html || '<div style="text-align:center;padding:40px;color:#90a4ae">No items match your filter.</div>';
}

// ─── CONFIRM VIEW ─────────────────────────────────────────────────────────────
function wtRenderConfirmView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'confirm';
  var d = wtProjData();
  var pending = (d.checkoffs||[]).filter(function(c){ return c.status==='complete'; });

  el.innerHTML = wtBreadcrumb()+
    '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<div class="card-title" style="margin:0">✅ Pending Confirmation</div>'+
        (pending.length ? '<button class="btn btn-success btn-sm" onclick="wtConfirmAllVisible()">Confirm All ('+pending.length+')</button>' : '')+
      '</div>'+
      '<p style="font-size:12px;color:#546e7a;margin:0">Check-offs awaiting lead tech or back office confirmation. Once confirmed, the record is locked — only back office can reopen.</p>'+
    '</div>'+
    (!pending.length
      ? '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">🎉 Nothing pending — all caught up!</div>'
      : pending.map(function(co){
          var item = (d.items||[]).find(function(i){ return i.id===co.item_id; });
          var room = item ? (d.rooms||[]).find(function(r){ return r.id===item.room_id; }) : null;
          var bldg = item ? (d.buildings||[]).find(function(b){ return b.id===item.building_id; }) : null;
          var ph   = WT_PHASES.find(function(x){ return x.id===co.phase; }) || {};
          var techs = Array.isArray(co.checked_by) ? co.checked_by.map(function(t){ return t.user_name||''; }).join(', ') : '';
          return '<div class="card" style="margin-bottom:10px;border-left:3px solid '+ph.color+'">'+
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">'+
              '<div>'+
                '<div style="font-size:14px;font-weight:700;color:#0d1b2a">'+escHtml((item&&item.name)||'Unknown item')+'</div>'+
                '<div style="font-size:12px;color:#546e7a">'+
                  (bldg?escHtml(bldg.name)+' · ':'')+
                  (room?escHtml(room.name)+' · ':'')+
                  '<span style="color:'+ph.color+';font-weight:700">'+escHtml(ph.label||co.phase)+'</span>'+
                '</div>'+
                '<div style="font-size:12px;color:#90a4ae;margin-top:4px">By: '+escHtml(techs)+'</div>'+
                (co.note?'<div style="font-size:12px;color:#546e7a;margin-top:4px;font-style:italic">'+escHtml(co.note)+'</div>':'')+
              '</div>'+
              '<div style="display:flex;gap:6px;flex-shrink:0">'+
                '<button class="btn btn-success btn-sm" onclick="wtConfirmCheckoff(\''+co.item_id+'\',\''+co.phase+'\')">✅ Confirm</button>'+
                '<button class="btn btn-outline btn-sm" onclick="wtRejectCheckoffPrompt(\''+co.item_id+'\',\''+co.phase+'\')">Reject</button>'+
              '</div>'+
            '</div>'+
          '</div>';
        }).join('')
    );
}

async function wtConfirmAllVisible() {
  var d = wtProjData();
  var pending = (d.checkoffs||[]).filter(function(c){ return c.status==='complete'; });
  if (!pending.length) return;
  if (!confirm('Confirm all '+pending.length+' pending check-offs?')) return;
  showSpinner('Confirming…');
  try {
    for (var co of pending) {
      await wtConfirmCheckoff_silent(co.item_id, co.phase);
    }
    wtRenderConfirmView();
    showToast('✅ All '+pending.length+' check-offs confirmed', 'success');
  } finally { hideSpinner(); }
}

async function wtConfirmCheckoff_silent(itemId, phase) {
  var co = wtGetCheckoff(itemId, phase);
  if (!co) return;
  var payload = Object.assign({}, co, {
    status: 'confirmed',
    confirmed_by: wtCurrentUserId(),
    confirmed_by_name: wtCurrentUserName(),
    confirmed_at: new Date().toISOString(),
  });
  await wtSaveCheckoff(payload);
}

// ─── REWORKS VIEW ─────────────────────────────────────────────────────────────
async function wtCreateRework(itemId, checkoffId, description, category, fault) {
  if (!_sb || !WT.proj) return;
  var d = wtProjData();
  var item = (d.items||[]).find(function(i){ return i.id===itemId; });
  var co   = checkoffId ? (d.checkoffs||[]).find(function(c){ return c.id===checkoffId; }) : null;
  var originalTechs = co && Array.isArray(co.checked_by) ? co.checked_by.map(function(t){ return t.user_id; }) : [];

  var rw = {
    item_id: itemId, checkoff_id: checkoffId||null,
    project_id: WT.proj.id,
    severity: 'standard', category: category||'internal_qc',
    fault: fault||'external',
    original_tech_ids: originalTechs,
    description: description,
    status: 'open',
    created_by: wtCurrentUserId(), created_by_name: wtCurrentUserName(),
  };
  var { data, error } = await _sb.from('wt_reworks').insert(rw).select().single();
  if (error) throw error;
  var proj = WT.data[WT.proj.id];
  if (proj) proj.reworks.unshift(data);
  return data;
}

function wtRenderReworksView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'reworks';
  var d = wtProjData();
  var reworks = d.reworks || [];

  var open   = reworks.filter(function(r){ return r.status==='open'; });
  var inProg = reworks.filter(function(r){ return r.status==='in_progress'; });
  var done   = reworks.filter(function(r){ return r.status==='resolved'; });

  el.innerHTML = wtBreadcrumb()+
    '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div class="card-title" style="margin:0">🔄 Rework Log</div>'+
        '<button class="btn btn-outline btn-sm" onclick="wtOpenReworkModal()">+ Log Rework</button>'+
      '</div>'+
      '<div style="display:flex;gap:16px;margin-top:12px;font-size:13px">'+
        '<span style="color:#c62828;font-weight:700">● '+open.length+' Open</span>'+
        '<span style="color:#e65100;font-weight:700">● '+inProg.length+' In Progress</span>'+
        '<span style="color:#2e7d32;font-weight:700">✓ '+done.length+' Resolved</span>'+
      '</div>'+
    '</div>'+
    ([['open',open,'#c62828'],['in_progress',inProg,'#e65100'],['resolved',done,'#2e7d32']]).map(function(group){
      var status=group[0], list=group[1], color=group[2];
      if (!list.length) return '';
      return '<div style="margin-bottom:8px;font-size:11px;font-weight:700;color:'+color+';text-transform:uppercase;letter-spacing:.5px">'+status.replace('_',' ')+'</div>'+
        list.map(function(rw){
          var item = (d.items||[]).find(function(i){ return i.id===rw.item_id; });
          var bldg = item ? (d.buildings||[]).find(function(b){ return b.id===item.building_id; }) : null;
          var svr  = {critical:'#c62828',standard:'#e65100',minor:'#f57c00'};
          return '<div class="card" style="margin-bottom:8px;border-left:3px solid '+(svr[rw.severity]||'#90a4ae')+'">'+
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">'+
              '<div style="flex:1">'+
                '<div style="font-size:14px;font-weight:700;color:#0d1b2a">'+escHtml((item&&item.name)||'Unknown item')+'</div>'+
                (bldg?'<div style="font-size:11px;color:#546e7a">'+escHtml(bldg.name)+'</div>':'')+
                '<div style="font-size:12px;color:#546e7a;margin-top:4px">'+escHtml(rw.description)+'</div>'+
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px">'+
                  '<span style="padding:2px 8px;border-radius:10px;background:'+(svr[rw.severity]||'#90a4ae')+'20;color:'+(svr[rw.severity]||'#90a4ae')+';font-weight:700">'+
                    (rw.severity||'standard').toUpperCase()+
                  '</span>'+
                  '<span style="padding:2px 8px;border-radius:10px;background:'+(rw.fault==='original_tech'?'#ffebee':'#f5f5f5')+';color:'+(rw.fault==='original_tech'?'#c62828':'#546e7a')+';font-weight:700">'+
                    (rw.fault==='original_tech'?'⚠ TECH FAULT':'External Cause')+
                  '</span>'+
                  (rw.assigned_to_name?'<span style="color:#90a4ae">Assigned: '+escHtml(rw.assigned_to_name)+'</span>':'')+
                '</div>'+
              '</div>'+
              (rw.status!=='resolved'
                ? '<button class="btn btn-success btn-sm" onclick="wtOpenResolveRework(\''+rw.id+'\')">Resolve</button>'
                : '<div style="font-size:11px;color:#2e7d32;font-weight:700;text-align:right">✓ Resolved<br><span style="font-weight:400;color:#90a4ae">'+escHtml(rw.resolved_by_name||'')+'</span></div>'
              )+
            '</div>'+
          '</div>';
        }).join('');
    }).join('');
}

var _wtReworkTarget = null;

function wtOpenReworkModal(itemId) {
  _wtReworkTarget = itemId || null;
  var d = wtProjData();
  var teamOptions = (DB.team||[]).map(function(m){ return '<option value="'+m.id+'">'+escHtml(m.name)+'</option>'; }).join('');
  var itemOptions = !itemId ? (d.items||[]).map(function(i){ return '<option value="'+i.id+'">'+escHtml(i.name)+'</option>'; }).join('') : '';

  var html = '<div class="modal-overlay open" id="wt-rework-modal" onclick="if(event.target===this)document.getElementById(\'wt-rework-modal\').remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>🔄 Log Rework</h3><button class="btn-icon" onclick="document.getElementById(\'wt-rework-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        (!itemId?'<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">ITEM</label><select id="rw-item" class="form-control">'+itemOptions+'</select></div>':'')+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">DESCRIPTION *</label><textarea id="rw-desc" rows="3" class="form-control" placeholder="What needs to be reworked?"></textarea></div>'+
        '<div class="form-row cols2" style="margin-bottom:12px">'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">SEVERITY</label>'+
            '<select id="rw-sev" class="form-control"><option value="standard">Standard</option><option value="critical">Critical</option><option value="minor">Minor</option></select></div>'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">CATEGORY</label>'+
            '<select id="rw-cat" class="form-control">'+WT_REWORK_CATEGORIES.map(function(c){ return '<option value="'+c.id+'">'+c.label+'</option>'; }).join('')+'</select></div>'+
        '</div>'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">FAULT</label>'+
          '<div style="display:flex;gap:8px">'+
            '<button id="rw-fault-orig" onclick="document.getElementById(\'rw-fault\').value=\'original_tech\';this.style.background=\'#ffebee\';this.style.border=\'2px solid #c62828\';this.style.color=\'#c62828\';document.getElementById(\'rw-fault-ext\').style.background=\'#fff\';document.getElementById(\'rw-fault-ext\').style.border=\'2px solid #e0e0e0\';document.getElementById(\'rw-fault-ext\').style.color=\'#546e7a\'" '+
              'style="flex:1;padding:10px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer">⚠ Tech Fault</button>'+
            '<button id="rw-fault-ext" onclick="document.getElementById(\'rw-fault\').value=\'external\';this.style.background=\'#f5f5f5\';this.style.border=\'2px solid #546e7a\';this.style.color=\'#0d1b2a\';document.getElementById(\'rw-fault-orig\').style.background=\'#fff\';document.getElementById(\'rw-fault-orig\').style.border=\'2px solid #e0e0e0\';document.getElementById(\'rw-fault-orig\').style.color=\'#546e7a\'" '+
              'style="flex:1;padding:10px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;font-size:13px;font-weight:600;cursor:pointer">External Cause</button>'+
          '</div>'+
          '<input type="hidden" id="rw-fault" value="external">'+
        '</div>'+
        '<div style="margin-bottom:16px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">ASSIGN TO</label>'+
          '<select id="rw-assign" class="form-control"><option value="">— Unassigned —</option>'+teamOptions+'</select></div>'+
        '<button class="btn btn-primary" style="width:100%" onclick="wtSaveRework()">Save Rework</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  var existing = document.getElementById('wt-rework-modal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

async function wtSaveRework() {
  var desc  = (document.getElementById('rw-desc')||{}).value||'';
  var itemId = _wtReworkTarget || (document.getElementById('rw-item')||{}).value||'';
  if (!desc.trim()) { showToast('Description is required', 'warning'); return; }
  if (!itemId)       { showToast('Select an item', 'warning'); return; }
  var sev    = (document.getElementById('rw-sev')||{}).value||'standard';
  var cat    = (document.getElementById('rw-cat')||{}).value||'internal_qc';
  var fault  = (document.getElementById('rw-fault')||{}).value||'external';
  var assign = document.getElementById('rw-assign')||{};
  var assignId   = assign.value||null;
  var assignName = assign.options && assignId ? assign.options[assign.selectedIndex].text : null;

  try {
    await wtCreateRework(itemId, null, desc, cat, fault);
    // Update assignment on rework
    if (assignId && WT.data[WT.proj.id]) {
      var rw = WT.data[WT.proj.id].reworks[0];
      if (rw) {
        rw.assigned_to = assignId; rw.assigned_to_name = assignName;
        await _sb.from('wt_reworks').update({ assigned_to:assignId, assigned_to_name:assignName, severity:sev, category:cat, fault:fault }).eq('id',rw.id);
      }
    }
    document.getElementById('wt-rework-modal').remove();
    wtRenderReworksView();
    showToast('🔄 Rework logged', 'success');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

function wtOpenResolveRework(rwId) {
  var html = '<div class="modal-overlay open" id="wt-resolve-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>✅ Resolve Rework</h3><button class="btn-icon" onclick="document.getElementById(\'wt-resolve-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<p style="font-size:13px;color:#546e7a;margin-bottom:16px">Confirm the fix is complete. A photo and note are required to close this out.</p>'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">RESOLUTION NOTE *</label>'+
          '<textarea id="resolve-note" rows="3" class="form-control" placeholder="Describe what was done to fix this..."></textarea></div>'+
        '<div style="margin-bottom:16px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">CONFIRMATION PHOTO (required)</label>'+
          '<div id="resolve-photo-preview" style="margin-bottom:8px"></div>'+
          '<label style="cursor:pointer;display:inline-block;padding:8px 14px;background:#f5f7fa;border:2px dashed #ccc;border-radius:8px;font-size:13px;color:#546e7a">'+
            '📸 Take / Add Photo <input type="file" accept="image/*" onchange="wtPreviewResolvePhoto(this)" style="display:none">'+
          '</label></div>'+
        '<button class="btn btn-success" style="width:100%" onclick="wtSubmitResolve(\''+rwId+'\')">✅ Mark Resolved</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var existing = document.getElementById('wt-resolve-modal'); if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

var _wtResolvePhoto = null;

function wtPreviewResolvePhoto(input) {
  if (!input.files || !input.files[0]) return;
  var reader = new FileReader();
  reader.onload = function(e){
    _wtResolvePhoto = e.target.result;
    var prev = document.getElementById('resolve-photo-preview');
    if (prev) prev.innerHTML = '<img src="'+e.target.result+'" style="width:80px;height:80px;object-fit:cover;border-radius:8px">';
  };
  reader.readAsDataURL(input.files[0]);
}

async function wtSubmitResolve(rwId) {
  var note = (document.getElementById('resolve-note')||{}).value||'';
  if (!note.trim()) { showToast('Resolution note is required', 'warning'); return; }
  if (!_wtResolvePhoto) { showToast('Photo confirmation is required', 'warning'); return; }
  try {
    var { error } = await _sb.from('wt_reworks').update({
      status: 'resolved',
      resolved_by: wtCurrentUserId(), resolved_by_name: wtCurrentUserName(),
      resolved_at: new Date().toISOString(),
      resolution_photo: _wtResolvePhoto, // TODO: upload to storage
      resolution_note: note,
    }).eq('id', rwId);
    if (error) throw error;
    var d = WT.data[WT.proj.id];
    if (d) { var rw = d.reworks.find(function(r){ return r.id===rwId; }); if (rw) rw.status='resolved'; }
    document.getElementById('wt-resolve-modal').remove();
    _wtResolvePhoto = null;
    wtRenderReworksView();
    showToast('✅ Rework resolved and signed off', 'success');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

// ─── FLAGS VIEW ───────────────────────────────────────────────────────────────
function wtRenderFlagsView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'flags';
  var d = wtProjData();
  var flags = d.flags || [];
  var open  = flags.filter(function(f){ return f.status!=='resolved'; });
  var done  = flags.filter(function(f){ return f.status==='resolved'; });

  el.innerHTML = wtBreadcrumb()+
    '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between">'+
        '<div class="card-title" style="margin:0">🚩 Site Flags & Issues</div>'+
        '<button class="btn btn-outline btn-sm" onclick="wtAddFlag(null,null)">+ Report Issue</button>'+
      '</div>'+
      '<div style="font-size:13px;color:#546e7a;margin-top:8px">'+
        open.length+' open · '+done.length+' resolved'+
      '</div>'+
    '</div>'+
    flags.map(function(flag){
      var isOpen = flag.status !== 'resolved';
      return '<div class="card" style="margin-bottom:10px;border-left:3px solid '+(isOpen?'#c62828':'#2e7d32')+'">'+
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">'+
          '<div style="flex:1">'+
            '<div style="font-size:14px;font-weight:700;color:#0d1b2a">'+(flag.title?escHtml(flag.title):'Site Issue')+'</div>'+
            '<div style="font-size:12px;color:#546e7a;margin-top:2px">'+escHtml(flag.description)+'</div>'+
            '<div style="font-size:11px;color:#90a4ae;margin-top:6px">'+
              'By '+escHtml(flag.created_by_name||'')+' · '+
              new Date(flag.created_at).toLocaleDateString()+
            '</div>'+
            (flag.photos&&flag.photos.length
              ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">'+
                  flag.photos.slice(0,3).map(function(p){ return '<img src="'+p+'" style="width:50px;height:50px;object-fit:cover;border-radius:6px">'; }).join('')+
                '</div>'
              : '')+
            (!isOpen&&flag.resolution_note
              ? '<div style="margin-top:8px;padding:8px;background:#e8f5e9;border-radius:8px;font-size:12px;color:#2e7d32">'+
                  '✅ Resolved: '+escHtml(flag.resolution_note)+
                '</div>'
              : '')+
          '</div>'+
          (isOpen ? '<button class="btn btn-success btn-sm" onclick="wtOpenResolveFlag(\''+flag.id+'\')">Resolve</button>' : '')+
        '</div>'+
      '</div>';
    }).join('')+
    (!flags.length ? '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No flags reported yet.</div>' : '');
}

function wtAddFlag(itemId, roomId) {
  var d = wtProjData();
  var bldgOptions = (d.buildings||[]).map(function(b){ return '<option value="'+b.id+'">'+escHtml(b.name)+'</option>'; }).join('');

  var html = '<div class="modal-overlay open" id="wt-flag-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>🚩 Report Site Issue</h3><button class="btn-icon" onclick="document.getElementById(\'wt-flag-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">TITLE (optional)</label>'+
          '<input id="flag-title" class="form-control" placeholder="Brief title for this issue..."></div>'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">DESCRIPTION *</label>'+
          '<textarea id="flag-desc" rows="3" class="form-control" placeholder="Describe the issue — what, where, how bad..."></textarea></div>'+
        (!itemId&&!roomId ? '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">LOCATION (optional)</label>'+
          '<select id="flag-bldg" class="form-control"><option value="">— Select building —</option>'+bldgOptions+'</select></div>' : '')+
        '<div style="margin-bottom:16px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">PHOTOS</label>'+
          '<div id="flag-photo-list" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>'+
          '<label style="cursor:pointer;display:inline-block;padding:8px 14px;background:#f5f7fa;border:2px dashed #ccc;border-radius:8px;font-size:13px;color:#546e7a">'+
            '📸 Add Photo <input type="file" accept="image/*" multiple onchange="wtFlagAddPhotos(this)" style="display:none">'+
          '</label></div>'+
        '<button class="btn btn-primary" style="width:100%" onclick="wtSubmitFlag(\''+itemId+'\',\''+roomId+'\')">Submit Flag</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  var existing = document.getElementById('wt-flag-modal'); if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  window._wtFlagPhotos = [];
}

function wtFlagAddPhotos(input) {
  if (!input.files) return;
  Array.from(input.files).forEach(function(file){
    var r = new FileReader();
    r.onload = function(e){
      window._wtFlagPhotos = window._wtFlagPhotos || [];
      window._wtFlagPhotos.push(e.target.result);
      var list = document.getElementById('flag-photo-list');
      if (list) list.innerHTML = (window._wtFlagPhotos||[]).map(function(p){
        return '<img src="'+p+'" style="width:56px;height:56px;object-fit:cover;border-radius:6px">';
      }).join('');
    };
    r.readAsDataURL(file);
  });
}

async function wtSubmitFlag(itemId, roomId) {
  var desc  = (document.getElementById('flag-desc')||{}).value||'';
  var title = (document.getElementById('flag-title')||{}).value||'';
  var bldgId = (document.getElementById('flag-bldg')||{}).value||null;
  if (!desc.trim()) { showToast('Description is required', 'warning'); return; }

  var flag = {
    project_id:   WT.proj.id,
    item_id:      itemId||null,
    room_id:      roomId||null,
    building_id:  bldgId||null,
    is_freeform:  !itemId&&!roomId,
    title:        title||null,
    description:  desc,
    photos:       window._wtFlagPhotos||[],
    visibility_roles: ['admin','office','lead_tech'],
    status: 'open',
    created_by:      wtCurrentUserId(),
    created_by_name: wtCurrentUserName(),
  };

  try {
    await wtSaveFlag(flag);
    document.getElementById('wt-flag-modal').remove();
    window._wtFlagPhotos = [];
    if (WT.view==='flags') wtRenderFlagsView();
    showToast('🚩 Issue reported', 'success');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

function wtOpenResolveFlag(flagId) {
  var html = '<div class="modal-overlay open" id="wt-resolve-flag-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>✅ Resolve Flag</h3><button class="btn-icon" onclick="document.getElementById(\'wt-resolve-flag-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">RESOLUTION NOTE *</label>'+
          '<textarea id="rfl-note" rows="3" class="form-control" placeholder="What was done to resolve this?"></textarea></div>'+
        '<div style="margin-bottom:16px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">CONFIRMATION PHOTO *</label>'+
          '<div id="rfl-photo-prev" style="margin-bottom:8px"></div>'+
          '<label style="cursor:pointer;display:inline-block;padding:8px 14px;background:#f5f7fa;border:2px dashed #ccc;border-radius:8px;font-size:13px;color:#546e7a">'+
            '📸 Photo <input type="file" accept="image/*" onchange="(function(el){var r=new FileReader();r.onload=function(e){window._rflPhoto=e.target.result;var p=document.getElementById(\'rfl-photo-prev\');if(p)p.innerHTML=\'<img src=\"\'+e.target.result+\'\" style=\"width:80px;height:80px;object-fit:cover;border-radius:8px\">\';};r.readAsDataURL(el.files[0]);})(this)" style="display:none">'+
          '</label></div>'+
        '<button class="btn btn-success" style="width:100%" onclick="wtSubmitFlagResolve(\''+flagId+'\')">✅ Mark Resolved</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var existing = document.getElementById('wt-resolve-flag-modal'); if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  window._rflPhoto = null;
}

async function wtSubmitFlagResolve(flagId) {
  var note = (document.getElementById('rfl-note')||{}).value||'';
  if (!note.trim()) { showToast('Note is required', 'warning'); return; }
  if (!window._rflPhoto) { showToast('Photo is required', 'warning'); return; }
  try {
    await _sb.from('wt_flags').update({
      status: 'resolved',
      resolved_by: wtCurrentUserId(), resolved_by_name: wtCurrentUserName(),
      resolved_at: new Date().toISOString(),
      resolution_photo: window._rflPhoto,
      resolution_note: note,
    }).eq('id', flagId);
    var d = WT.data[WT.proj.id];
    if (d) { var fl = d.flags.find(function(f){ return f.id===flagId; }); if (fl) fl.status='resolved'; }
    document.getElementById('wt-resolve-flag-modal').remove();
    wtRenderFlagsView();
    showToast('✅ Flag resolved', 'success');
  } catch(e) {
    showToast('Error: '+e.message, 'error');
  }
}

// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────
function wtRenderReportsView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'reports';
  el.innerHTML = wtBreadcrumb()+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">'+
      ['weekly','leaderboard','rework_stats'].map(function(r){
        return '<button onclick="wtShowReport(\''+r+'\')" style="padding:8px 16px;font-size:13px;font-weight:600;border:2px solid #e0e0e0;border-radius:8px;background:#fff;color:#546e7a;cursor:pointer">'+
          {weekly:'📅 Tech Weekly', leaderboard:'🏆 Leaderboard', rework_stats:'🔄 Rework Stats'}[r]+
        '</button>';
      }).join('')+
    '</div>'+
    '<div id="wt-report-content"><div class="card" style="text-align:center;padding:40px;color:#90a4ae">Select a report above.</div></div>';
}

function wtShowReport(type) {
  var el = document.getElementById('wt-report-content'); if (!el) return;
  var d = wtProjData();

  if (type === 'leaderboard') {
    // Count confirmed check-offs per tech
    var techScore = {};
    (d.checkoffs||[]).filter(function(c){ return c.status==='confirmed'; }).forEach(function(c){
      (Array.isArray(c.checked_by)?c.checked_by:[]).forEach(function(t){
        var n = t.user_name||'Unknown';
        if (!techScore[n]) techScore[n]={confirmed:0,reworks:0,name:n};
        techScore[n].confirmed++;
      });
    });
    (d.reworks||[]).filter(function(r){ return r.fault==='original_tech'; }).forEach(function(rw){
      (rw.original_tech_ids||[]).forEach(function(uid){
        var tech = (DB.team||[]).find(function(m){ return m.id===uid; });
        var n = tech ? tech.name : uid;
        if (!techScore[n]) techScore[n]={confirmed:0,reworks:0,name:n};
        techScore[n].reworks++;
      });
    });
    var sorted = Object.values(techScore).sort(function(a,b){ return (b.confirmed-b.reworks*3)-(a.confirmed-a.reworks*3); });
    el.innerHTML = '<div class="card">'+
      '<div class="card-title" style="margin-bottom:16px">🏆 Tech Leaderboard</div>'+
      '<table style="width:100%;border-collapse:collapse">'+
        '<thead><tr>'+
          ['Rank','Tech','Confirmed','Reworks (fault)','Net Score'].map(function(h){ return '<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e0e0e0;font-size:12px;font-weight:700;color:#546e7a">'+h+'</th>'; }).join('')+
        '</tr></thead>'+
        '<tbody>'+sorted.map(function(t,i){
          var score = t.confirmed - t.reworks*3;
          var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
          return '<tr>'+
            '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px">'+medal+'</td>'+
            '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:700">'+escHtml(t.name)+'</td>'+
            '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#2e7d32;font-weight:700">'+t.confirmed+'</td>'+
            '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:'+(t.reworks?'#c62828':'#90a4ae')+';font-weight:700">'+t.reworks+'</td>'+
            '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:16px;font-weight:900;color:'+(score>0?'#1565c0':score<0?'#c62828':'#90a4ae')+'">'+score+'</td>'+
          '</tr>';
        }).join('')+'</tbody></table></div>';

  } else if (type === 'rework_stats') {
    var byTech = {};
    (d.reworks||[]).filter(function(r){ return r.fault==='original_tech'; }).forEach(function(rw){
      (rw.original_tech_ids||[]).forEach(function(uid){
        var tech = (DB.team||[]).find(function(m){ return m.id===uid; });
        var n = tech?tech.name:uid;
        if (!byTech[n]) byTech[n]={open:0,resolved:0,total:0,critical:0};
        byTech[n].total++;
        if (rw.status==='resolved') byTech[n].resolved++; else byTech[n].open++;
        if (rw.severity==='critical') byTech[n].critical++;
      });
    });
    var sortedT = Object.keys(byTech).sort(function(a,b){ return byTech[b].total-byTech[a].total; });
    el.innerHTML = '<div class="card">'+
      '<div class="card-title" style="margin-bottom:16px">🔄 Reworks by Tech (fault = original tech)</div>'+
      (sortedT.length
        ? '<table style="width:100%;border-collapse:collapse">'+
          '<thead><tr>'+['Tech','Total','Open','Resolved','Critical'].map(function(h){ return '<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e0e0e0;font-size:12px;font-weight:700;color:#546e7a">'+h+'</th>'; }).join('')+'</tr></thead>'+
          '<tbody>'+sortedT.map(function(n){
            var t=byTech[n];
            return '<tr>'+
              '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:700">'+escHtml(n)+'</td>'+
              '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:16px;font-weight:800;color:#c62828">'+t.total+'</td>'+
              '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#e65100;font-weight:700">'+t.open+'</td>'+
              '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#2e7d32;font-weight:700">'+t.resolved+'</td>'+
              '<td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#c62828;font-weight:700">'+t.critical+'</td>'+
            '</tr>';
          }).join('')+'</tbody></table>'
        : '<div style="text-align:center;padding:40px;color:#90a4ae">No reworks logged yet.</div>'
      )+'</div>';

  } else {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">Weekly tech summary — coming in next build.</div>';
  }
}

// ─── QUICK ADD HELPERS ────────────────────────────────────────────────────────

// ============================================================
// ADD BUILDING WIZARD — runs inside an existing project
// 4 steps: Basics → Floors & Rooms → Systems → Review & Create
// ============================================================

var _wtABW = {
  step: 1,
  bldg: { name:'', type:'residential', floors:[] },
  systems: [],
  s2floor: 0,
};

function wtOpenAddBuildingWizard() {
  var d = wtProjData();
  var nextNum = (d.buildings||[]).length + 1;
  _wtABW = {
    step: 1,
    bldg: { name:'Building '+nextNum, type:'residential', floors:[] },
    systems: (WT.proj && WT.proj.systems) ? WT.proj.systems.slice() : [],
    s2floor: 0,
  };
  wtShowABW();
}

function wtShowABW() {
  var e=document.getElementById('wt-abw-modal'); if(e) e.remove();
  var labels=['Basics','Floors & Rooms','Systems','Review'];
  var content=[wtAbwStep1,wtAbwStep2,wtAbwStep3,wtAbwStep4][_wtABW.step-1]();
  var html='<div class="modal-overlay open" id="wt-abw-modal">'+
    '<div class="modal-box" style="max-width:860px;max-height:94vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<div>'+
          '<h3 style="margin:0">🏗 Add Building</h3>'+
          '<div style="font-size:11px;color:#90a4ae;margin-top:2px">'+escHtml(WT.proj?WT.proj.name:'')+' &mdash; Step '+_wtABW.step+' of 4</div>'+
        '</div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-abw-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div style="display:flex;gap:0;padding:0 22px;border-bottom:1px solid #f0f0f0;flex-shrink:0">'+
        labels.map(function(l,i){
          var a=i+1===_wtABW.step,d=i+1<_wtABW.step;
          return '<div style="flex:1;text-align:center;padding:8px 4px;font-size:11px;font-weight:'+(a?800:600)+';'+
            'color:'+(a?'#1565c0':d?'#2e7d32':'#90a4ae')+';border-bottom:3px solid '+(a?'#1565c0':d?'#2e7d32':'transparent')+';margin-bottom:-1px">'+
            (d?'&#x2713; ':'')+l+'</div>';
        }).join('')+
      '</div>'+
      '<div class="modal-body" style="overflow-y:auto;flex:1;padding:20px 22px">'+content+'</div>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}

function wtAbwRefreshStep2() {
  var e=document.getElementById('wt-abw-modal'); if(e) e.remove();
  wtShowABW();
}

// ─── STEP 1: BASICS ──────────────────────────────────────────────────────────
function wtAbwStep1() {
  var types=wtGetBuildingTypes();
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Building Details</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 20px">Name this building exactly as it appears on the plans.</p>'+
    '<div style="margin-bottom:16px"><label class="wiz-label">BUILDING NAME *</label>'+
      '<input id="abw-name" class="form-control" value="'+escHtml(_wtABW.bldg.name)+'" placeholder="e.g. Building 3, Parking Garage, Clubhouse"></div>'+
    '<div style="margin-bottom:24px"><label class="wiz-label">BUILDING TYPE</label>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px">'+
        types.map(function(t){
          var sel=_wtABW.bldg.type===t.id;
          return '<div onclick="document.querySelectorAll(\'[data-abwt]\').forEach(function(e){e.style.border=\'1px solid #e0e0e0\';e.style.background=\'#fff\'});this.style.border=\'2px solid #1565c0\';this.style.background=\'#e3f2fd\';_wtABW.bldg.type=\''+t.id+'\'" data-abwt="'+t.id+'" '+
            'style="padding:10px 14px;border:'+(sel?'2px solid #1565c0':'1px solid #e0e0e0')+';border-radius:8px;cursor:pointer;background:'+(sel?'#e3f2fd':'#fff')+';font-size:13px;font-weight:600;color:#0d1b2a">'+
            escHtml(t.label)+'</div>';
        }).join('')+
      '</div></div>'+
    '<div style="display:flex;justify-content:flex-end">'+
      '<button class="btn btn-primary" onclick="wtAbwNext(1)">Next &#x2192; Floors &amp; Rooms</button></div>';
}

// ─── STEP 2: FLOORS & ROOM ROSTER ────────────────────────────────────────────
function wtAbwStep2() {
  var bldg=_wtABW.bldg;
  if (!bldg.floors||!bldg.floors.length) {
    bldg.floors=[{id:'f_'+Date.now(),name:'Floor 1',floorNum:1,rooms:[]}];
  }
  _wtABW.s2floor=Math.max(0,Math.min(_wtABW.s2floor,bldg.floors.length-1));
  var fl=bldg.floors[_wtABW.s2floor];

  return '<h4 style="margin:0 0 4px;font-size:16px;font-weight:800">Floors &amp; Room Setup</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 14px">Build the room roster for each floor, then assign unit types.</p>'+
    // Floor tabs
    '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">'+
      bldg.floors.map(function(f,i){
        var a=i===_wtABW.s2floor;
        var done=f.rooms.length>0&&f.rooms.every(function(r){ return r.unitType; });
        return '<button onclick="_wtABW.s2floor='+i+';wtAbwRefreshStep2()" '+
          'style="padding:5px 14px;font-size:12px;font-weight:700;border:2px solid '+(a?'#1565c0':done?'#2e7d32':'#e0e0e0')+';border-radius:20px;background:'+(a?'#1565c0':done?'#e8f5e9':'#fff')+';color:'+(a?'#fff':done?'#2e7d32':'#546e7a')+';cursor:pointer">'+
          escHtml(f.name)+' <span style="font-size:10px;opacity:.8">('+f.rooms.length+')</span>'+
          (done?' &#x2713;':'')+
        '</button>';
      }).join('')+
      '<button onclick="wtAbwAddFloor()" style="padding:5px 12px;font-size:12px;border:2px dashed #ccc;border-radius:20px;background:#fff;color:#546e7a;cursor:pointer">+ Floor</button>'+
      (bldg.floors.length>1?'<button onclick="wtAbwDeleteFloor()" style="padding:5px 8px;font-size:11px;border:1px solid #ffcdd2;border-radius:20px;background:#fff;color:#c62828;cursor:pointer" title="Delete floor">&#x1F5D1;</button>':'')+
    '</div>'+
    // Floor + building name inline edit
    '<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;flex-wrap:wrap">'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-size:11px;color:#90a4ae;font-weight:700">BUILDING:</span>'+
        '<input id="abw-bname" value="'+escHtml(bldg.name)+'" oninput="_wtABW.bldg.name=this.value" '+
          'style="font-size:14px;font-weight:700;border:none;border-bottom:2px solid #1565c0;padding:3px 0;background:transparent;color:#0d1b2a;width:180px">'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-size:11px;color:#90a4ae;font-weight:700">FLOOR:</span>'+
        '<input id="abw-fname" value="'+escHtml(fl.name)+'" oninput="_wtABW.bldg.floors[_wtABW.s2floor].name=this.value" '+
          'style="font-size:14px;font-weight:700;border:none;border-bottom:2px solid #e0e0e0;padding:3px 0;background:transparent;color:#0d1b2a;width:120px">'+
      '</div>'+
    '</div>'+
    // Generate bar
    '<div id="abw-gen-bar">'+wtAbwGenBarHtml(fl)+'</div>'+
    '<div style="height:12px"></div>'+
    // Roster
    '<div id="abw-roster-wrap">'+wtAbwRosterHtml()+'</div>'+
    // Footer
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;margin-bottom:20px;flex-wrap:wrap;gap:8px">'+
      '<button onclick="wtAbwAddRoom()" style="padding:8px 16px;font-size:13px;color:#2e7d32;background:#e8f5e9;border:2px dashed #a5d6a7;border-radius:8px;cursor:pointer;font-weight:700">+ Add Room</button>'+
      '<div style="display:flex;gap:8px">'+
        '<button onclick="wtAbwSetAllModal()" style="padding:8px 14px;font-size:12px;border:1px solid #1565c0;border-radius:8px;background:#e3f2fd;color:#1565c0;cursor:pointer;font-weight:600">Set All &#x2192;</button>'+
        '<button onclick="wtAbwCopyFloorModal()" style="padding:8px 14px;font-size:12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer">&#x1F4CB; Copy Floor</button>'+
      '</div>'+
    '</div>'+
    wtAbwBldgProgress()+
    '<div style="display:flex;justify-content:space-between;margin-top:8px">'+
      '<button class="btn btn-outline" onclick="_wtABW.step=1;wtShowABW()">&#x2190; Back</button>'+
      '<button class="btn btn-primary" onclick="wtAbwNext(2)">Next &#x2192; Systems</button></div>';
}

// ─── ABW ROSTER HELPERS ───────────────────────────────────────────────────────
function wtAbwRosterHtml() {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];
  if (!fl||!fl.rooms.length) return '<div style="padding:30px;text-align:center;color:#90a4ae;border:1px solid #e0e0e0;border-radius:10px">No rooms yet — use Quick Generate above or add rooms one by one.</div>';

  var typeHdrs=WT_UNIT_DEF.map(function(t){
    return '<th style="text-align:center;padding:6px 4px;font-size:10px;font-weight:700;color:'+t.color+';min-width:38px">'+t.short+'</th>';
  }).join('');

  var rows=fl.rooms.map(function(r,ri){
    var typeCells=WT_UNIT_DEF.map(function(t){
      var sel=r.unitType===t.id;
      return '<td style="text-align:center;padding:4px 2px">'+
        '<button onclick="wtAbwSetType('+ri+',\''+t.id+'\')" title="'+t.id+'" '+
          'style="width:34px;height:28px;border:2px solid '+(sel?t.color:'#e0e0e0')+';border-radius:6px;background:'+(sel?t.color:'#fff')+';color:'+(sel?'#fff':t.color)+';font-size:10px;font-weight:800;cursor:pointer">'+
          t.short+'</button></td>';
    }).join('');
    return '<tr style="background:'+(r.unitType?'#fff':'#fffde7')+'" id="abw-row-'+ri+'">'+
      '<td style="padding:6px 8px;font-size:11px;color:#90a4ae;text-align:right;width:30px">'+(ri+1)+'</td>'+
      '<td style="padding:4px 6px;width:100px">'+
        '<input value="'+escHtml(r.number)+'" oninput="_wtABW.bldg.floors[_wtABW.s2floor].rooms['+ri+'].number=this.value" '+
          'style="width:100%;padding:5px 7px;border:1px solid '+(r.number?'#e0e0e0':'#f57c00')+';border-radius:6px;font-size:13px;font-weight:700;color:#0d1b2a;box-sizing:border-box">'+
      '</td>'+
      typeCells+
      '<td style="padding:4px 6px;width:32px">'+
        '<button onclick="wtAbwDeleteRoom('+ri+')" style="width:28px;height:28px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer;font-size:12px">&#x2715;</button>'+
      '</td>'+
    '</tr>';
  }).join('');

  return '<div style="overflow-x:auto;border:1px solid #e0e0e0;border-radius:10px">'+
    '<table style="width:100%;border-collapse:collapse;min-width:500px">'+
      '<thead><tr style="background:#f5f7fa">'+
        '<th style="width:30px"></th>'+
        '<th style="text-align:left;padding:8px 6px;font-size:11px;font-weight:700;color:#546e7a;width:100px">ROOM #</th>'+
        typeHdrs+'<th style="width:32px"></th>'+
      '</tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
    '</table></div>';
}

function wtAbwGenBarHtml(fl) {
  var hasRooms=fl&&fl.rooms&&fl.rooms.length>0;
  var firstVal=hasRooms?fl.rooms[0].number:'101';
  var lastVal=hasRooms?fl.rooms[fl.rooms.length-1].number:'125';
  return '<div style="background:#f5f7fa;border-radius:10px;padding:14px 16px">'+
    '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">&#x26A1; Generate Room Numbers</div>'+
    '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">'+
      '<div><label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">FIRST ROOM</label>'+
        '<input id="abw-first" value="'+escHtml(firstVal)+'" oninput="wtAbwUpdatePreview()" placeholder="e.g. 1001" '+
          'style="width:90px;padding:8px 10px;border:2px solid #1565c0;border-radius:8px;font-size:16px;font-weight:700;text-align:center;color:#0d1b2a"></div>'+
      '<div style="font-size:22px;color:#90a4ae;padding-bottom:4px">&#x2192;</div>'+
      '<div><label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">LAST ROOM</label>'+
        '<input id="abw-last" value="'+escHtml(lastVal)+'" oninput="wtAbwUpdatePreview()" placeholder="e.g. 1025" '+
          'style="width:90px;padding:8px 10px;border:2px solid #1565c0;border-radius:8px;font-size:16px;font-weight:700;text-align:center;color:#0d1b2a"></div>'+
      '<div><label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">SUFFIX <span style="font-weight:400">(opt)</span></label>'+
        '<input id="abw-sfx" oninput="wtAbwUpdatePreview()" placeholder="e.g. A" '+
          'style="width:65px;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;text-align:center"></div>'+
      '<button onclick="wtAbwGenRooms()" class="btn btn-primary" style="flex-shrink:0;height:38px">'+
        (hasRooms?'&#x21BB; Regenerate':'&#x25B6; Generate')+
      '</button>'+
    '</div>'+
    '<div id="abw-gen-preview" style="font-size:12px;font-weight:600;min-height:18px">'+
      wtWizGenPreview2(firstVal,lastVal,'')+
    '</div>'+
    (hasRooms
      ?'<div style="border-top:1px solid #e0e0e0;margin-top:12px;padding-top:12px">'+
          '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Modify Existing Room Numbers</div>'+
          '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              '<span style="font-size:12px;color:#546e7a;font-weight:600">Add Prefix:</span>'+
              '<input id="abw-mod-pfx" placeholder="e.g. A" style="width:65px;padding:5px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
              '<button onclick="wtAbwApplyPrefix()" class="btn btn-outline btn-sm">Apply to All</button>'+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              '<span style="font-size:12px;color:#546e7a;font-weight:600">Add Suffix:</span>'+
              '<input id="abw-mod-sfx" placeholder="e.g. A" style="width:65px;padding:5px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
              '<button onclick="wtAbwApplySuffix()" class="btn btn-outline btn-sm">Apply to All</button>'+
            '</div>'+
          '</div>'+
          '<div style="font-size:11px;color:#e65100;margin-top:8px">&#x26A0; Regenerate replaces all '+fl.rooms.length+' rooms but preserves types for matching numbers.</div>'+
        '</div>'
      :'')+
  '</div>';
}

function wtAbwUpdatePreview() {
  var first=(document.getElementById('abw-first')||{}).value||'';
  var last=(document.getElementById('abw-last')||{}).value||'';
  var sfx=(document.getElementById('abw-sfx')||{}).value||'';
  var el=document.getElementById('abw-gen-preview');
  if(el) el.innerHTML=wtWizGenPreview2(first,last,sfx);
}

function wtAbwGenRooms() {
  var first=((document.getElementById('abw-first')||{}).value||'').trim();
  var last=((document.getElementById('abw-last')||{}).value||'').trim();
  var sfx=(document.getElementById('abw-sfx')||{}).value||'';
  if(!first){showToast('Enter the first room number','warning');return;}
  var f=wtWizParseRoom(first),l=last?wtWizParseRoom(last):f;
  if(!f){showToast('Invalid format','warning');return;}
  if(!l)l=f;
  var start=f.num,end=l.num;
  if(end<start){showToast('Last Room must be >= First Room','warning');return;}
  var count=end-start+1;
  if(count>200){showToast('Maximum 200 rooms per floor','warning');return;}
  var digits=Math.max(f.digits,l.digits),prefix=f.prefix,suffix=f.suffix+sfx;
  var fl=_wtABW.bldg.floors[_wtABW.s2floor]; if(!fl)return;
  var oldTypes={};
  (fl.rooms||[]).forEach(function(r){if(r.unitType)oldTypes[r.number]=r.unitType;});
  var rooms=[];
  for(var i=0;i<count;i++){
    var num=start+i,rnum=prefix+String(num).padStart(digits,'0')+suffix;
    rooms.push({id:'r_'+Date.now()+'_'+i,number:rnum,unitType:oldTypes[rnum]||null});
  }
  fl.rooms=rooms;
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
  var bar=document.getElementById('abw-gen-bar');if(bar)bar.innerHTML=wtAbwGenBarHtml(fl);
}

function wtAbwSetType(ri,typeId) {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl||!fl.rooms[ri])return;
  fl.rooms[ri].unitType=fl.rooms[ri].unitType===typeId?null:typeId;
  var row=document.getElementById('abw-row-'+ri);if(!row)return;
  row.style.background=fl.rooms[ri].unitType?'#fff':'#fffde7';
  row.querySelectorAll('button[title]').forEach(function(btn){
    var tid=btn.getAttribute('title'),td=wtUnitDef(tid),sel=fl.rooms[ri].unitType===tid;
    btn.style.border='2px solid '+(sel?td.color:'#e0e0e0');
    btn.style.background=sel?td.color:'#fff';
    btn.style.color=sel?'#fff':td.color;
  });
}

function wtAbwAddRoom() {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl)return;
  fl.rooms.push({id:'r_'+Date.now(),number:'',unitType:null});
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
  setTimeout(function(){var inputs=document.querySelectorAll('#abw-roster-wrap input');if(inputs.length)inputs[inputs.length-1].focus();},80);
}

function wtAbwDeleteRoom(ri) {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl)return;
  fl.rooms.splice(ri,1);
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
}

function wtAbwApplyPrefix() {
  var pfx=(document.getElementById('abw-mod-pfx')||{}).value||'';
  if(!pfx.trim()){showToast('Enter a prefix','warning');return;}
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl||!fl.rooms.length)return;
  fl.rooms.forEach(function(r){r.number=pfx+r.number;});
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
  var bar=document.getElementById('abw-gen-bar');if(bar)bar.innerHTML=wtAbwGenBarHtml(fl);
  showToast('Prefix added to all rooms','success');
}

function wtAbwApplySuffix() {
  var sfx=(document.getElementById('abw-mod-sfx')||{}).value||'';
  if(!sfx.trim()){showToast('Enter a suffix','warning');return;}
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl||!fl.rooms.length)return;
  fl.rooms.forEach(function(r){r.number=r.number+sfx;});
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
  var bar=document.getElementById('abw-gen-bar');if(bar)bar.innerHTML=wtAbwGenBarHtml(fl);
  showToast('Suffix added to all rooms','success');
}

function wtAbwAddFloor() {
  var n=_wtABW.bldg.floors.length+1;
  _wtABW.bldg.floors.push({id:'f_'+Date.now(),name:'Floor '+n,floorNum:n,rooms:[]});
  _wtABW.s2floor=_wtABW.bldg.floors.length-1;
  wtAbwRefreshStep2();
}

function wtAbwDeleteFloor() {
  if(_wtABW.bldg.floors.length<=1)return;
  if(!confirm('Delete "'+_wtABW.bldg.floors[_wtABW.s2floor].name+'"?'))return;
  _wtABW.bldg.floors.splice(_wtABW.s2floor,1);
  _wtABW.s2floor=Math.max(0,_wtABW.s2floor-1);
  wtAbwRefreshStep2();
}

function wtAbwSetAllModal() {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl)return;
  var untyped=fl.rooms.filter(function(r){return!r.unitType;}).length;
  var html='<div class="modal-overlay open" id="wt-abw-setall" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm"><div class="modal-head"><h3>Set Type</h3>'+
      '<button class="btn-icon" onclick="document.getElementById(\'wt-abw-setall\').remove()">&#x2715;</button></div>'+
    '<div class="modal-body">'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'+
        WT_UNIT_DEF.map(function(t){
          return '<button onclick="wtAbwDoSetAll(\''+t.id+'\',false)" '+
            'style="padding:10px 16px;font-size:13px;font-weight:700;border:2px solid '+t.color+';border-radius:8px;background:'+t.bg+';color:'+t.color+';cursor:pointer">'+t.id+'</button>';
        }).join('')+
      '</div>'+
      (untyped<fl.rooms.length?'<div style="border-top:1px solid #f0f0f0;padding-top:10px">'+
        '<p style="font-size:12px;color:#546e7a;margin:0 0 8px">Unassigned rooms only ('+untyped+'):</p>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          WT_UNIT_DEF.map(function(t){
            return '<button onclick="wtAbwDoSetAll(\''+t.id+'\',true)" '+
              'style="padding:8px 12px;font-size:12px;font-weight:700;border:2px solid '+t.color+';border-radius:8px;background:#fff;color:'+t.color+';cursor:pointer">'+t.id+' (unassigned)</button>';
          }).join('')+
        '</div></div>':'')+ 
    '</div></div></div>';
  var e=document.getElementById('wt-abw-setall');if(e)e.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function wtAbwDoSetAll(typeId,unassignedOnly) {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];if(!fl)return;
  fl.rooms.forEach(function(r){if(!unassignedOnly||!r.unitType)r.unitType=typeId;});
  document.getElementById('wt-abw-setall').remove();
  var el=document.getElementById('abw-roster-wrap');if(el)el.innerHTML=wtAbwRosterHtml();
}

function wtAbwCopyFloorModal() {
  var fl=_wtABW.bldg.floors[_wtABW.s2floor];
  if(!fl||!fl.rooms.length){showToast('Add rooms first','warning');return;}
  var others=_wtABW.bldg.floors.filter(function(f,i){return i!==_wtABW.s2floor;});
  var html='<div class="modal-overlay open" id="wt-abw-cpfl" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm"><div class="modal-head"><h3>&#x1F4CB; Copy Floor</h3>'+
      '<button class="btn-icon" onclick="document.getElementById(\'wt-abw-cpfl\').remove()">&#x2715;</button></div>'+
    '<div class="modal-body">'+
      '<p style="font-size:13px;color:#546e7a;margin:0 0 12px">Copy <strong>'+escHtml(fl.name)+'</strong> ('+fl.rooms.length+' rooms) to:</p>'+
      (others.length?others.map(function(f){
        return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">'+
          '<input type="checkbox" data-abwfid="'+f.id+'" style="width:16px;height:16px">'+
          '<span style="font-size:13px;font-weight:600">'+escHtml(f.name)+'</span>'+
          '<span style="font-size:11px;color:#90a4ae">('+f.rooms.length+' rooms)</span></label>';
      }).join(''):'<p style="color:#90a4ae;font-size:13px">No other floors yet.</p>')+
      '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f0f0f0">'+
        '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">CREATE NEW FLOORS:</label>'+
        '<input id="abw-cp-new" type="number" min="0" value="0" style="width:60px;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
        '<span style="font-size:12px;color:#546e7a;margin-left:8px">additional floors</span></div>'+
      '<button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="wtAbwDoCopyFloor()">&#x1F4CB; Copy</button>'+
    '</div></div></div>';
  var e=document.getElementById('wt-abw-cpfl');if(e)e.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function wtAbwDoCopyFloor() {
  var srcFl=_wtABW.bldg.floors[_wtABW.s2floor];if(!srcFl)return;
  var srcRooms=JSON.parse(JSON.stringify(srcFl.rooms));
  var count=0;
  document.querySelectorAll('#wt-abw-cpfl [data-abwfid]:checked').forEach(function(cb){
    var fid=cb.getAttribute('data-abwfid');
    var tgt=_wtABW.bldg.floors.find(function(f){return f.id===fid;});
    if(tgt){tgt.rooms=srcRooms.map(function(r){return Object.assign({},r,{id:'r_'+Date.now()+'_'+Math.random()});});count++;}
  });
  var newCount=parseInt((document.getElementById('abw-cp-new')||{}).value)||0;
  for(var i=0;i<newCount;i++){
    var n=_wtABW.bldg.floors.length+1;
    _wtABW.bldg.floors.push({id:'f_'+Date.now()+'_'+i,name:'Floor '+n,floorNum:n,
      rooms:srcRooms.map(function(r){return Object.assign({},r,{id:'r_'+Date.now()+'_'+Math.random()});})});
    count++;
  }
  document.getElementById('wt-abw-cpfl').remove();
  wtAbwRefreshStep2();
  showToast('&#x1F4CB; Floor copied to '+count+' floor'+(count>1?'s':''),'success');
}

function wtAbwBldgProgress() {
  var bldg=_wtABW.bldg;
  var totalRooms=0,typedRooms=0;
  (bldg.floors||[]).forEach(function(f){
    totalRooms+=f.rooms.length;
    typedRooms+=f.rooms.filter(function(r){return r.unitType;}).length;
  });
  if(!totalRooms)return '';
  var pct=Math.round(typedRooms/totalRooms*100);
  return '<div style="padding:10px 12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px">'+
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">'+
      '<span style="font-weight:700;color:#0d1b2a">'+escHtml(bldg.name)+' &mdash; '+totalRooms+' rooms across '+bldg.floors.length+' floor'+(bldg.floors.length>1?'s':'')+'</span>'+
      '<span style="font-weight:700;color:'+(pct===100?'#2e7d32':'#e65100')+'">'+typedRooms+'/'+totalRooms+' typed</span>'+
    '</div>'+
    '<div style="background:#e0e0e0;border-radius:3px;height:6px">'+
      '<div style="background:'+(pct===100?'#2e7d32':'#1565c0')+';height:6px;border-radius:3px;width:'+pct+'%;transition:width .3s"></div>'+
    '</div>'+
  '</div>';
}

// ─── STEP 3: SYSTEMS ─────────────────────────────────────────────────────────
function wtAbwStep3() {
  var systems=[
    {id:'structured_wiring',label:'Structured Wiring',icon:'&#x1F50C;',desc:'Cat6 outlets'},
    {id:'wireless_ap',label:'Wireless APs',icon:'&#x1F4E1;',desc:'PoE AP locations'},
    {id:'access_control',label:'Access Control',icon:'&#x1F6AA;',desc:'Readers, strikes'},
    {id:'deadbolts',label:'Electronic Deadbolts',icon:'&#x1F510;',desc:'Tenant deadbolts'},
    {id:'fiber_interbuilding',label:'Fiber Interbuilding',icon:'&#x1F517;',desc:'Backbone fiber'},
    {id:'clubhouse_av',label:'Clubhouse AV',icon:'&#x1F50A;',desc:'Speakers, TV drops'},
    {id:'perimeter_cameras',label:'Perimeter Cameras',icon:'&#x1F4F7;',desc:'Exterior cameras'},
    {id:'gate_access',label:'Gate Access',icon:'&#x1F3D7;',desc:'Vehicle gates'},
  ];
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Systems</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Select systems for <strong>'+escHtml(_wtABW.bldg.name)+'</strong>. This building can differ from the rest of the project.</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px">'+
      systems.map(function(s){
        var sel=_wtABW.systems.indexOf(s.id)>=0;
        return '<div onclick="var i=_wtABW.systems.indexOf(\''+s.id+'\');if(i>=0)_wtABW.systems.splice(i,1);else _wtABW.systems.push(\''+s.id+'\');this.style.border=\'2px solid \'+(i<0?\'#1565c0\':\'#e0e0e0\');this.style.background=\'\'+(i<0?\'#e3f2fd\':\'#fff\')" '+
          'style="padding:12px;border:2px solid '+(sel?'#1565c0':'#e0e0e0')+';border-radius:10px;cursor:pointer;background:'+(sel?'#e3f2fd':'#fff')+';display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:20px">'+s.icon+'</span>'+
          '<div><div style="font-size:13px;font-weight:700;color:#0d1b2a">'+s.label+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+s.desc+'</div></div></div>';
      }).join('')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between">'+
      '<button class="btn btn-outline" onclick="_wtABW.step=2;wtShowABW()">&#x2190; Back</button>'+
      '<button class="btn btn-primary" onclick="wtAbwNext(3)">Next &#x2192; Review</button></div>';
}

// ─── STEP 4: REVIEW & CREATE ─────────────────────────────────────────────────
function wtAbwStep4() {
  var totalRooms=0,typedRooms=0,totalItems=0;
  var tmpls=wtGetTemplates();
  (_wtABW.bldg.floors||[]).forEach(function(f){
    totalRooms+=f.rooms.length;
    f.rooms.forEach(function(r){
      if(r.unitType)typedRooms++;
      var tpl=r.unitType?tmpls.find(function(t){return t.unit_type===r.unitType;}):null;
      if(tpl)totalItems+=(tpl.areas||[]).reduce(function(s,a){return s+(a.items||[]).reduce(function(s2,i){return s2+i.qty;},0);},0);
    });
  });
  var untyped=totalRooms-typedRooms;
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Review &amp; Add</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Confirm before adding this building to the project.</p>'+
    '<div class="card" style="background:#f9fbff;margin-bottom:12px">'+
      '<div style="font-size:16px;font-weight:800;color:#0d1b2a;margin-bottom:4px">'+escHtml(_wtABW.bldg.name)+'</div>'+
      '<div style="font-size:13px;color:#546e7a">'+escHtml((_wtABW.bldg.type||'').replace('_',' '))+'</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">'+
      [['&#x1F3E2;',(_wtABW.bldg.floors||[]).length,'Floors'],['&#x1F6AA;',totalRooms,'Rooms'],['&#x1F4CB;','~'+totalItems,'Items'],['&#x2699;',_wtABW.systems.length,'Systems']].map(function(r){
        return '<div style="text-align:center;padding:12px;background:#fff;border:1px solid #e0e0e0;border-radius:8px">'+
          '<div style="font-size:11px;color:#546e7a">'+r[0]+' '+r[2]+'</div>'+
          '<div style="font-size:22px;font-weight:900;color:#0d1b2a">'+r[1]+'</div></div>';
      }).join('')+
    '</div>'+
    (untyped?'<div style="padding:12px;background:#fff3e0;border-left:4px solid #e65100;border-radius:8px;margin-bottom:12px;font-size:13px;color:#e65100">'+
      '&#x26A0; '+untyped+' room'+(untyped>1?'s are':' is')+' untyped — will be created without items.</div>':'')+
    (_wtABW.bldg.floors||[]).map(function(f){
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'+
        '<span style="font-weight:700">'+escHtml(f.name)+'</span>'+
        '<span style="color:#546e7a">'+f.rooms.length+' rooms</span></div>';
    }).join('')+
    '<div style="display:flex;justify-content:space-between;margin-top:24px">'+
      '<button class="btn btn-outline" onclick="_wtABW.step=3;wtShowABW()">&#x2190; Back</button>'+
      '<button class="btn btn-primary" id="abw-create-btn" onclick="wtAbwCreate()">&#x1F680; Add Building</button></div>';
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function wtAbwNext(fromStep) {
  if(fromStep===1){
    var name=(document.getElementById('abw-name')||{}).value||'';
    if(!name.trim()){showToast('Building name is required','warning');return;}
    // Check for duplicate building name in this project
    var existingNames=(wtProjData().buildings||[]).map(function(b){ return b.name.trim().toLowerCase(); });
    if(existingNames.indexOf(name.trim().toLowerCase())>=0){
      showToast('"'+name.trim()+'" already exists in this project — use a different name','warning');
      return;
    }
    _wtABW.bldg.name=name.trim();
  } else if(fromStep===2){
    var anyRooms=(_wtABW.bldg.floors||[]).some(function(f){return f.rooms&&f.rooms.length>0;});
    if(!anyRooms){showToast('Add at least one room before continuing','warning');return;}
  }
  _wtABW.step=fromStep+1;
  var e=document.getElementById('wt-abw-modal');if(e)e.remove();
  wtShowABW();
}

// ─── CREATE BUILDING IN PROJECT ───────────────────────────────────────────────
async function wtAbwCreate() {
  var btn=document.getElementById('abw-create-btn');
  if(btn){btn.disabled=true;btn.textContent='Adding...';}
  try {
    if(!_sb)throw new Error('Not connected to Supabase');
    var d=wtProjData();
    var tmpls=wtGetTemplates();

    // Final duplicate name check
    var existingNames=(d.buildings||[]).map(function(b){ return b.name.trim().toLowerCase(); });
    if(existingNames.indexOf(_wtABW.bldg.name.trim().toLowerCase())>=0){
      showToast('"'+_wtABW.bldg.name+'" already exists — go back and rename it','warning');
      if(btn){btn.disabled=false;btn.textContent='&#x1F680; Add Building';}
      return;
    }

    // 1. Create building
    var {data:bRec,error:be}=await _sb.from('wt_buildings').insert({
      project_id:WT.proj.id, name:_wtABW.bldg.name,
      building_type:_wtABW.bldg.type||'residential',
      sort_order:(d.buildings||[]).length
    }).select().single();
    if(be)throw be;
    d.buildings.push(bRec);

    // 2. Floors → Rooms → Items
    for(var fi=0;fi<(_wtABW.bldg.floors||[]).length;fi++){
      var wf=_wtABW.bldg.floors[fi];
      var {data:fRec,error:fe}=await _sb.from('wt_floors').insert({
        building_id:bRec.id,project_id:WT.proj.id,
        name:wf.name,floor_number:wf.floorNum||fi+1,sort_order:fi
      }).select().single();
      if(fe)throw fe;
      d.floors.push(fRec);

      if(!wf.rooms||!wf.rooms.length)continue;

      var roomIns=wf.rooms.map(function(r,ri){
        return{floor_id:fRec.id,building_id:bRec.id,project_id:WT.proj.id,
          name:r.number||('Room '+(ri+1)),room_number:r.number||null,
          unit_type:r.unitType||null,sort_order:ri};
      });
      var {data:roomRecs,error:re}=await _sb.from('wt_rooms').insert(roomIns).select();
      if(re)throw re;
      d.rooms.push.apply(d.rooms,roomRecs);

      // Generate items from templates
      var itemIns=[];
      for(var ri=0;ri<wf.rooms.length;ri++){
        var wr=wf.rooms[ri],rRec=roomRecs[ri];
        if(!wr.unitType)continue;
        var tpl=tmpls.find(function(t){return t.unit_type===wr.unitType;});
        if(!tpl)continue;
        var sort=0;
        (tpl.areas||[]).forEach(function(area){
          (area.items||[]).forEach(function(ai){
            var ci=wtCatalogItem(ai.catalog_id);if(!ci)return;
            for(var q=0;q<(ai.qty||1);q++){
              itemIns.push({
                room_id:rRec.id,building_id:bRec.id,project_id:WT.proj.id,
                name:ci.name+(ai.qty>1?' #'+(q+1):'')+' \u2014 '+area.name,
                category:ci.category,item_type:ci.item_type,
                cable_count:ci.cable_count||0,cable_types:ci.cable_types||[],
                outlet_type:ci.outlet_type||null,
                phases_required:['rough_in','rough_in_verify','devicing','testing','final_verify'],
                sort_order:sort++
              });
            }
          });
        });
      }
      for(var chunk=0;chunk<itemIns.length;chunk+=100){
        var batch=itemIns.slice(chunk,chunk+100);
        var {data:iRecs,error:ie}=await _sb.from('wt_items').insert(batch).select();
        if(ie)throw ie;
        d.items.push.apply(d.items,iRecs);
      }
    }

    document.getElementById('wt-abw-modal').remove();
    wtRenderDashboard();
    showToast('&#x1F3D7; "'+_wtABW.bldg.name+'" added \u2014 '+
      d.rooms.filter(function(r){return r.building_id===bRec.id;}).length+' rooms, '+
      d.items.filter(function(i){return i.building_id===bRec.id;}).length+' items','success');

  } catch(e){
    console.error('wtAbwCreate error:',e);
    showToast('Error: '+(e.message||String(e)),'error');
    if(btn){btn.disabled=false;btn.textContent='&#x1F680; Add Building';}
  }
}


async function wtAddBuilding() {
  wtOpenAddBuildingWizard();
}



async function wtAddFloor(bldgId) {
  var d = wtProjData();
  var existingFloors = (d.floors||[]).filter(function(f){ return f.building_id===bldgId; });
  var nextNum = existingFloors.length + 1;
  var name = prompt('Floor name:', 'Floor '+nextNum);
  if (!name) return;
  try {
    var { data, error } = await _sb.from('wt_floors').insert({
      building_id:bldgId, project_id:WT.proj.id,
      name:name.trim(), floor_number:nextNum, sort_order:nextNum-1
    }).select().single();
    if (error) throw error;
    var proj = WT.data[WT.proj.id]; if (proj) proj.floors.push(data);
    wtRenderBuildingView();
    showToast('Floor added', 'success');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
}

async function wtAddRoom(floorId, bldgId) {
  var name = prompt('Room / Unit name (e.g. "Unit 204B", "Laundry Room"):');
  if (!name) return;
  var unitType = prompt('Unit type (1BR/2BR/3BR/4BR/Studio/Common/Other):', '2BR');
  try {
    var d = wtProjData();
    var sortOrder = (d.rooms||[]).filter(function(r){ return r.floor_id===floorId; }).length;
    var { data, error } = await _sb.from('wt_rooms').insert({
      floor_id:floorId, building_id:bldgId, project_id:WT.proj.id,
      name:name.trim(), unit_type:unitType||null, sort_order:sortOrder
    }).select().single();
    if (error) throw error;
    if (WT.data[WT.proj.id]) WT.data[WT.proj.id].rooms.push(data);
    wtRenderFloorView();
    showToast('Room added', 'success');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
}

async function wtAddItem(roomId, bldgId) {
  // Replaced by catalog picker
  wtOpenItemPicker(roomId, bldgId);
}

async function wtSaveBuildingTemplate(bldgId) {
  var name = prompt('Template name (e.g. "Smith Properties 2BR Standard Building"):');
  if (!name) return;
  var d = wtProjData();
  // Capture full building structure
  var bldg    = (d.buildings||[]).find(function(b){ return b.id===bldgId; });
  var floors  = (d.floors||[]).filter(function(f){ return f.building_id===bldgId; });
  var rooms   = (d.rooms||[]).filter(function(r){ return r.building_id===bldgId; });
  var itemIds = new Set(rooms.map(function(r){ return r.id; }));
  var items   = (d.items||[]).filter(function(i){ return i.building_id===bldgId; });

  var templateData = { building:bldg, floors:floors, rooms:rooms, items:items };
  try {
    await _sb.from('wt_templates').insert({
      name:name.trim(), template_type:'building',
      source_building_id: bldgId, source_project_id: WT.proj.id,
      data: templateData,
      created_by: wtCurrentUserId(), created_by_name: wtCurrentUserName(),
    });
    showToast('💾 Building template saved: "'+name+'"', 'success');
  } catch(e) { showToast('Error: '+e.message, 'error'); }
}


// ─── ITEM CATALOG — DEFAULTS ──────────────────────────────────────────────────
var WT_DEFAULT_CATALOG = [
  // Outlets & Faceplates
  { id:'itm_01', name:'Cat6 Outlet — Single',       category:'outlet',     item_type:'outlet',         cable_count:1, cable_types:['Cat6'],              outlet_type:'single_gang', sort_order:1  },
  { id:'itm_02', name:'Cat6 Outlet — Dual',         category:'outlet',     item_type:'outlet',         cable_count:2, cable_types:['Cat6','Cat6'],        outlet_type:'double_gang', sort_order:2  },
  { id:'itm_03', name:'Cat6 + Coax Outlet',         category:'outlet',     item_type:'outlet',         cable_count:2, cable_types:['Cat6','RG6'],         outlet_type:'single_gang', sort_order:3  },
  { id:'itm_04', name:'Dual Cat6 + Coax Outlet',    category:'outlet',     item_type:'outlet',         cable_count:3, cable_types:['Cat6','Cat6','RG6'],  outlet_type:'double_gang', sort_order:4  },
  { id:'itm_05', name:'Coax Outlet — Single',       category:'outlet',     item_type:'outlet',         cable_count:1, cable_types:['RG6'],               outlet_type:'single_gang', sort_order:5  },
  { id:'itm_06', name:'Cat6A Outlet — Single',      category:'outlet',     item_type:'outlet',         cable_count:1, cable_types:['Cat6A'],             outlet_type:'single_gang', sort_order:6  },
  { id:'itm_07', name:'TV Drop (Coax)',              category:'outlet',     item_type:'tv_drop',        cable_count:1, cable_types:['RG6'],               outlet_type:'single_gang', sort_order:7  },
  { id:'itm_08', name:'Floor Box — Dual Cat6',      category:'outlet',     item_type:'outlet',         cable_count:2, cable_types:['Cat6','Cat6'],        outlet_type:'floor_box',   sort_order:8  },
  // Devices
  { id:'itm_09', name:'Wireless AP — Ceiling',      category:'device',     item_type:'ap',             cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:9  },
  { id:'itm_10', name:'Wireless AP — Wall',         category:'device',     item_type:'ap',             cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:10 },
  { id:'itm_11', name:'IP Camera — Indoor',         category:'device',     item_type:'camera',         cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:11 },
  { id:'itm_12', name:'IP Camera — Outdoor/Dome',   category:'device',     item_type:'camera',         cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:12 },
  { id:'itm_13', name:'Door Controller — Full',     category:'device',     item_type:'door_controller', cable_count:5, cable_types:['Cat6','18/2','18/2','18/4','Cat6'], outlet_type:null, sort_order:13 },
  { id:'itm_14', name:'Electronic Deadbolt',        category:'device',     item_type:'deadbolt',       cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:14 },
  { id:'itm_15', name:'Structured Wiring Panel',    category:'device',     item_type:'panel',          cable_count:0, cable_types:[],                    outlet_type:null,          sort_order:15 },
  { id:'itm_16', name:'Ceiling Speaker',            category:'device',     item_type:'speaker',        cable_count:1, cable_types:['16/2'],              outlet_type:null,          sort_order:16 },
  { id:'itm_17', name:'Control Pad',                category:'device',     item_type:'control_pad',    cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:17 },
  { id:'itm_18', name:'Gate Controller',            category:'device',     item_type:'door_controller', cable_count:2, cable_types:['Cat6','18/4'],      outlet_type:null,          sort_order:18 },
  // Backbone
  { id:'itm_19', name:'Backbone Cat6 Run',          category:'backbone',   item_type:'backbone_cat6',  cable_count:1, cable_types:['Cat6'],              outlet_type:null,          sort_order:19 },
  { id:'itm_20', name:'Backbone Cat6A Run',         category:'backbone',   item_type:'backbone_cat6',  cable_count:1, cable_types:['Cat6A'],             outlet_type:null,          sort_order:20 },
  { id:'itm_21', name:'Fiber Run — Interbuilding',  category:'backbone',   item_type:'fiber_run',      cable_count:1, cable_types:['OM4 Fiber'],         outlet_type:null,          sort_order:21 },
];

// ─── ROOM TEMPLATE DEFAULTS ───────────────────────────────────────────────────
var WT_DEFAULT_TEMPLATES = [
  { id:'tpl_studio', name:'Studio — Standard', unit_type:'Studio', areas:[
    { id:'a1', name:'Main Room',  items:[{ catalog_id:'itm_02', qty:1 },{ catalog_id:'itm_07', qty:1 },{ catalog_id:'itm_09', qty:1 }] },
    { id:'a2', name:'Kitchen',   items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a3', name:'Entry',     items:[{ catalog_id:'itm_15', qty:1 },{ catalog_id:'itm_14', qty:1 }] },
  ]},
  { id:'tpl_1br', name:'1BR — Standard', unit_type:'1BR', areas:[
    { id:'a1', name:'Living Room', items:[{ catalog_id:'itm_02', qty:1 },{ catalog_id:'itm_07', qty:1 },{ catalog_id:'itm_09', qty:1 }] },
    { id:'a2', name:'Bedroom',     items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a3', name:'Kitchen',     items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a4', name:'Entry',       items:[{ catalog_id:'itm_15', qty:1 },{ catalog_id:'itm_14', qty:1 }] },
  ]},
  { id:'tpl_2br', name:'2BR — Standard', unit_type:'2BR', areas:[
    { id:'a1', name:'Living Room', items:[{ catalog_id:'itm_02', qty:1 },{ catalog_id:'itm_07', qty:1 },{ catalog_id:'itm_09', qty:1 }] },
    { id:'a2', name:'Bedroom 1',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a3', name:'Bedroom 2',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a4', name:'Kitchen',     items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a5', name:'Entry',       items:[{ catalog_id:'itm_15', qty:1 },{ catalog_id:'itm_14', qty:1 }] },
  ]},
  { id:'tpl_3br', name:'3BR — Standard', unit_type:'3BR', areas:[
    { id:'a1', name:'Living Room', items:[{ catalog_id:'itm_02', qty:1 },{ catalog_id:'itm_07', qty:1 },{ catalog_id:'itm_09', qty:1 }] },
    { id:'a2', name:'Bedroom 1',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a3', name:'Bedroom 2',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a4', name:'Bedroom 3',   items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a5', name:'Kitchen',     items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a6', name:'Entry',       items:[{ catalog_id:'itm_15', qty:1 },{ catalog_id:'itm_14', qty:1 }] },
  ]},
  { id:'tpl_4br', name:'4BR — Standard', unit_type:'4BR', areas:[
    { id:'a1', name:'Living Room', items:[{ catalog_id:'itm_04', qty:1 },{ catalog_id:'itm_07', qty:1 },{ catalog_id:'itm_09', qty:1 }] },
    { id:'a2', name:'Bedroom 1',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a3', name:'Bedroom 2',   items:[{ catalog_id:'itm_03', qty:1 }] },
    { id:'a4', name:'Bedroom 3',   items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a5', name:'Bedroom 4',   items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a6', name:'Kitchen',     items:[{ catalog_id:'itm_01', qty:1 }] },
    { id:'a7', name:'Entry',       items:[{ catalog_id:'itm_15', qty:1 },{ catalog_id:'itm_14', qty:1 }] },
  ]},
  { id:'tpl_common', name:'Common Area — Standard', unit_type:'Common', areas:[
    { id:'a1', name:'Main Space',  items:[{ catalog_id:'itm_02', qty:2 },{ catalog_id:'itm_09', qty:2 },{ catalog_id:'itm_07', qty:1 }] },
    { id:'a2', name:'Entry/Lobby', items:[{ catalog_id:'itm_13', qty:1 },{ catalog_id:'itm_11', qty:1 }] },
  ]},
  { id:'tpl_idf', name:'IDF/MDF — Standard', unit_type:'IDF/MDF', areas:[
    { id:'a1', name:'Closet', items:[{ catalog_id:'itm_19', qty:4 },{ catalog_id:'itm_15', qty:1 }] },
  ]},
];

// ─── CATALOG HELPERS ─────────────────────────────────────────────────────────
function wtGetCatalog() {
  if (!DB.wtItemCatalog || !DB.wtItemCatalog.length) {
    // Return defaults in memory without persisting — only save when user modifies
    DB.wtItemCatalog = JSON.parse(JSON.stringify(WT_DEFAULT_CATALOG));
  }
  return DB.wtItemCatalog;
}

function wtGetTemplates() {
  if (!DB.wtRoomTemplates || !DB.wtRoomTemplates.length) {
    DB.wtRoomTemplates = JSON.parse(JSON.stringify(WT_DEFAULT_TEMPLATES));
  }
  return DB.wtRoomTemplates;
}

function wtCatalogItem(id) {
  return wtGetCatalog().find(function(c){ return c.id===id; }) || null;
}

// ─── ITEM CATALOG MANAGER ─────────────────────────────────────────────────────
function wtOpenCatalogManager() {
  var html = '<div class="modal-overlay open" id="wt-catalog-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:780px;max-height:90vh">'+
      '<div class="modal-head">'+
        '<h3>🔌 Item Catalog</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-catalog-modal\').remove()">✕</button>'+
      '</div>'+
      '<div class="modal-body" style="overflow-y:auto;max-height:calc(90vh-120px)">'+
        '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Define every item your techs will install. These populate the Room Template editor and the project wizard.</p>'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">'+
          '<button class="btn btn-primary btn-sm" onclick="wtOpenCatalogItemForm(null)">+ Add Item</button>'+
        '</div>'+
        '<div id="wt-catalog-table">'+wtRenderCatalogTable()+'</div>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-catalog-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtRenderCatalogTable() {
  var cat = wtGetCatalog();
  var cats = { outlet:'#e3f2fd', device:'#e8f5e9', backbone:'#f3e5f5', infrastructure:'#fff3e0', other:'#f5f5f5' };
  var groups = {};
  cat.forEach(function(i){ if(!groups[i.category]) groups[i.category]=[]; groups[i.category].push(i); });

  return Object.keys(groups).map(function(grp){
    return '<div style="margin-bottom:16px">'+
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#546e7a;margin-bottom:6px">'+grp+'</div>'+
      groups[grp].map(function(item){
        var cables = (item.cable_types||[]).join(', ');
        return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(item.name)+'</div>'+
            '<div style="font-size:11px;color:#546e7a">'+
              (item.cable_count?item.cable_count+'× cable':'No cable')+
              (cables?' ('+escHtml(cables)+')':'')+
              (item.outlet_type?' · '+escHtml(item.outlet_type.replace('_',' ')):'')+
            '</div>'+
          '</div>'+
          '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:'+(cats[item.category]||'#f5f5f5')+';color:#546e7a;font-weight:700;flex-shrink:0">'+item.category+'</span>'+
          '<button onclick="wtOpenCatalogItemForm(\''+item.id+'\')" style="padding:5px 10px;font-size:12px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer;flex-shrink:0">✏</button>'+
          '<button onclick="wtDeleteCatalogItem(\''+item.id+'\')" style="padding:5px 10px;font-size:12px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer;flex-shrink:0">🗑</button>'+
        '</div>';
      }).join('')+
    '</div>';
  }).join('');
}

function wtOpenCatalogItemForm(itemId) {
  var cat = wtGetCatalog();
  var item = itemId ? cat.find(function(i){ return i.id===itemId; }) : null;
  var cableList = item ? (item.cable_types||[]).join(', ') : '';

  var html = '<div class="modal-overlay open" id="wt-catitem-modal" onclick="if(event.target===this)this.remove()" style="z-index:10001">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head">'+
        '<h3>'+(item?'Edit':'Add')+' Catalog Item</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-catitem-modal\').remove()">✕</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">NAME *</label>'+
          '<input id="ci-name" class="form-control" value="'+escHtml(item?item.name:'')+'" placeholder="e.g. Cat6 + Coax Outlet"></div>'+
        '<div class="form-row cols2" style="margin-bottom:12px">'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">CATEGORY</label>'+
            '<select id="ci-cat" class="form-control">'+
              ['outlet','device','backbone','infrastructure','other'].map(function(c){
                return '<option value="'+c+'"'+(item&&item.category===c?' selected':'')+'>'+c+'</option>';
              }).join('')+
            '</select></div>'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">TYPE</label>'+
            '<select id="ci-type" class="form-control">'+
              Object.keys(WT_ITEM_TYPES).map(function(k){
                return '<option value="'+k+'"'+(item&&item.item_type===k?' selected':'')+'>'+WT_ITEM_TYPES[k].label+'</option>';
              }).join('')+
            '</select></div>'+
        '</div>'+
        '<div class="form-row cols2" style="margin-bottom:12px">'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">CABLE COUNT</label>'+
            '<input id="ci-cnt" type="number" min="0" class="form-control" value="'+(item?item.cable_count||0:0)+'"></div>'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">OUTLET TYPE</label>'+
            '<select id="ci-outlet" class="form-control">'+
              ['','single_gang','double_gang','floor_box','ceiling','wall'].map(function(o){
                return '<option value="'+o+'"'+(item&&item.outlet_type===o?' selected':'')+'>'+escHtml(o||'— N/A —')+'</option>';
              }).join('')+
            '</select></div>'+
        '</div>'+
        '<div style="margin-bottom:16px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">CABLE TYPES <span style="font-weight:400">(comma separated)</span></label>'+
          '<input id="ci-cables" class="form-control" placeholder="Cat6, RG6" value="'+escHtml(cableList)+'"></div>'+
        '<button class="btn btn-primary" style="width:100%" onclick="wtSaveCatalogItem(\''+escHtml(itemId||'')+'\')">'+(item?'Save Changes':'Add to Catalog')+'</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-catitem-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtSaveCatalogItem(itemId) {
  var name = (document.getElementById('ci-name')||{}).value||'';
  if (!name.trim()) { showToast('Name is required','warning'); return; }
  var cat    = (document.getElementById('ci-cat')||{}).value||'outlet';
  var type   = (document.getElementById('ci-type')||{}).value||'other';
  var cnt    = parseInt((document.getElementById('ci-cnt')||{}).value)||0;
  var outlet = (document.getElementById('ci-outlet')||{}).value||null;
  var cables = ((document.getElementById('ci-cables')||{}).value||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean);

  var catalog = wtGetCatalog();
  if (itemId) {
    var idx = catalog.findIndex(function(i){ return i.id===itemId; });
    if (idx>=0) catalog[idx] = Object.assign(catalog[idx], { name:name.trim(), category:cat, item_type:type, cable_count:cnt, cable_types:cables, outlet_type:outlet||null });
  } else {
    catalog.push({ id:'itm_'+Date.now(), name:name.trim(), category:cat, item_type:type, cable_count:cnt, cable_types:cables, outlet_type:outlet||null, sort_order:catalog.length+1 });
  }
  DB.wtItemCatalog = catalog;
  saveDB();
  document.getElementById('wt-catitem-modal').remove();
  var tbl = document.getElementById('wt-catalog-table');
  if (tbl) tbl.innerHTML = wtRenderCatalogTable();
  showToast('✅ Catalog updated','success');
}

function wtDeleteCatalogItem(itemId) {
  if (!confirm('Remove this item from the catalog?\nThis does not affect items already added to projects.')) return;
  DB.wtItemCatalog = wtGetCatalog().filter(function(i){ return i.id!==itemId; });
  saveDB();
  var tbl = document.getElementById('wt-catalog-table');
  if (tbl) tbl.innerHTML = wtRenderCatalogTable();
  showToast('Item removed','info');
}

// ─── ROOM TEMPLATE MANAGER ────────────────────────────────────────────────────
function wtOpenTemplateManager() {
  var tmpls = wtGetTemplates();
  var html = '<div class="modal-overlay open" id="wt-tmpl-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:780px;max-height:90vh">'+
      '<div class="modal-head"><h3>📋 Room Templates</h3><button class="btn-icon" onclick="document.getElementById(\'wt-tmpl-modal\').remove()">✕</button></div>'+
      '<div class="modal-body" style="overflow-y:auto;max-height:calc(90vh-120px)">'+
        '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Define what gets installed in each unit type. The wizard uses these to generate every item automatically.</p>'+
        '<div style="display:flex;justify-content:flex-end;margin-bottom:12px">'+
          '<button class="btn btn-primary btn-sm" onclick="wtOpenTemplateEditor(null)">+ New Template</button>'+
        '</div>'+
        '<div id="wt-tmpl-list">'+wtRenderTemplateList()+'</div>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-tmpl-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtRenderTemplateList() {
  var tmpls = wtGetTemplates();
  if (!tmpls.length) return '<div style="text-align:center;padding:40px;color:#90a4ae">No templates yet. Add one above.</div>';
  return tmpls.map(function(t){
    var itemCount = (t.areas||[]).reduce(function(s,a){ return s+(a.items||[]).reduce(function(s2,i){ return s2+i.qty; },0); },0);
    return '<div style="border:1px solid #e0e0e0;border-radius:10px;margin-bottom:10px;overflow:hidden">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f9f9f9">'+
        '<div>'+
          '<span style="font-size:14px;font-weight:700;color:#0d1b2a">'+escHtml(t.name)+'</span>'+
          '<span style="font-size:11px;color:#546e7a;margin-left:10px">'+t.unit_type+' · '+(t.areas||[]).length+' areas · '+itemCount+' items</span>'+
        '</div>'+
        '<div style="display:flex;gap:6px">'+
          '<button onclick="wtOpenTemplateEditor(\''+t.id+'\')" style="padding:5px 12px;font-size:12px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer">✏ Edit</button>'+
          '<button onclick="wtDeleteTemplate(\''+t.id+'\')" style="padding:5px 12px;font-size:12px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">🗑</button>'+
        '</div>'+
      '</div>'+
      (t.areas||[]).map(function(a){
        return '<div style="padding:8px 14px;border-top:1px solid #f0f0f0;display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:12px;font-weight:700;color:#546e7a;min-width:110px">'+escHtml(a.name)+'</span>'+
          '<div style="font-size:12px;color:#0d1b2a">'+
            (a.items||[]).map(function(ai){
              var ci = wtCatalogItem(ai.catalog_id);
              return ci ? (ai.qty>1?ai.qty+'× ':'')+escHtml(ci.name) : '?';
            }).join(' &nbsp;·&nbsp; ')+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';
  }).join('');
}

// ─── TEMPLATE EDITOR ─────────────────────────────────────────────────────────
var _wtTe = null; // template being edited

function wtOpenTemplateEditor(tplId) {
  var tmpls = wtGetTemplates();
  var src   = tplId ? tmpls.find(function(t){ return t.id===tplId; }) : null;
  _wtTe = src
    ? JSON.parse(JSON.stringify(src))
    : { id:'tpl_'+Date.now(), name:'', unit_type:'2BR', areas:[] };

  wtShowTemplateEditor();
}

function wtShowTemplateEditor() {
  var catalog = wtGetCatalog();
  var catOptions = catalog.map(function(c){ return '<option value="'+c.id+'">'+escHtml(c.name)+'</option>'; }).join('');

  var html = '<div class="modal-overlay open" id="wt-te-modal" onclick="if(event.target===this)this.remove()" style="z-index:10001">'+
    '<div class="modal-box" style="max-width:720px;max-height:92vh">'+
      '<div class="modal-head"><h3>📋 '+((_wtTe.name&&_wtTe.name.trim())?escHtml(_wtTe.name):'New Template')+'</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-te-modal\').remove()">✕</button></div>'+
      '<div class="modal-body" style="overflow-y:auto;max-height:calc(92vh-120px)">'+
        // Header fields
        '<div class="form-row cols2" style="margin-bottom:16px">'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">TEMPLATE NAME *</label>'+
            '<input id="te-name" class="form-control" value="'+escHtml(_wtTe.name||'')+'" placeholder="e.g. 2BR — Smith Properties" oninput="_wtTe.name=this.value"></div>'+
          '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">UNIT TYPE</label>'+
            '<select id="te-utype" class="form-control" onchange="_wtTe.unit_type=this.value">'+
              WT_UNIT_TYPES.map(function(t){ return '<option value="'+t+'"'+(_wtTe.unit_type===t?' selected':'')+'>'+t+'</option>'; }).join('')+
            '</select></div>'+
        '</div>'+
        // Areas
        '<div style="font-size:12px;font-weight:700;color:#546e7a;margin-bottom:10px">AREAS & ITEMS</div>'+
        '<div id="te-areas-list">'+wtRenderTeAreas(catOptions)+'</div>'+
        '<button onclick="wtTeAddArea(\''+escHtml(catOptions)+'\')" style="font-size:13px;color:#1565c0;background:#e3f2fd;border:2px dashed #90caf9;border-radius:8px;cursor:pointer;padding:10px;width:100%;font-weight:700;margin-bottom:20px">+ Add Area</button>'+
        '<button class="btn btn-primary" style="width:100%" onclick="wtSaveTemplate()">💾 Save Template</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-te-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtRenderTeAreas(catOptions) {
  if (!catOptions) {
    catOptions = wtGetCatalog().map(function(c){ return '<option value="'+c.id+'">'+escHtml(c.name)+'</option>'; }).join('');
  }
  return (_wtTe.areas||[]).map(function(area, ai){
    return '<div style="border:1px solid #e0e0e0;border-radius:10px;margin-bottom:10px;overflow:hidden" id="te-area-'+ai+'">'+
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#f5f7fa">'+
        '<input value="'+escHtml(area.name)+'" oninput="_wtTe.areas['+ai+'].name=this.value" '+
          'placeholder="Area name (e.g. Living Room)" '+
          'style="flex:1;font-size:13px;font-weight:700;border:none;border-bottom:2px solid #e0e0e0;padding:4px 0;background:transparent;color:#0d1b2a">'+
        '<button onclick="wtTeRemoveArea('+ai+')" style="padding:4px 10px;font-size:11px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">Remove</button>'+
      '</div>'+
      // Item rows
      '<div style="padding:10px 12px" id="te-area-items-'+ai+'">'+
        wtRenderTeAreaItems(ai, catOptions)+
      '</div>'+
      '<div style="padding:0 12px 10px">'+
        '<button onclick="wtTeAddItem('+ai+',\''+catOptions+'\')" style="font-size:12px;color:#2e7d32;background:#e8f5e9;border:none;border-radius:6px;cursor:pointer;padding:6px 12px">+ Add Item</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

function wtRenderTeAreaItems(areaIdx, catOptions) {
  var area = _wtTe.areas[areaIdx]; if (!area) return '';
  catOptions = catOptions || wtGetCatalog().map(function(c){ return '<option value="'+c.id+'">'+escHtml(c.name)+'</option>'; }).join('');
  return (area.items||[]).map(function(item, ii){
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<select oninput="_wtTe.areas['+areaIdx+'].items['+ii+'].catalog_id=this.value" style="flex:1;font-size:12px;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px">'+
        catOptions.replace('value="'+item.catalog_id+'"','value="'+item.catalog_id+'" selected')+
      '</select>'+
      '<label style="font-size:11px;color:#546e7a;flex-shrink:0">Qty</label>'+
      '<input type="number" value="'+item.qty+'" min="1" oninput="_wtTe.areas['+areaIdx+'].items['+ii+'].qty=parseInt(this.value)||1" '+
        'style="width:52px;font-size:13px;text-align:center;border:1px solid #e0e0e0;border-radius:6px;padding:6px 4px">'+
      '<button onclick="wtTeRemoveItem('+areaIdx+','+ii+')" style="padding:5px 8px;font-size:11px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">✕</button>'+
    '</div>';
  }).join('');
}

function wtTeAddArea(catOptions) {
  _wtTe.areas.push({ id:'a_'+Date.now(), name:'', items:[] });
  var list = document.getElementById('te-areas-list');
  if (list) list.innerHTML = wtRenderTeAreas(catOptions);
}

function wtTeRemoveArea(ai) {
  _wtTe.areas.splice(ai, 1);
  var list = document.getElementById('te-areas-list');
  if (list) list.innerHTML = wtRenderTeAreas();
}

function wtTeAddItem(areaIdx, catOptions) {
  if (!_wtTe.areas[areaIdx]) return;
  var firstCat = wtGetCatalog()[0];
  _wtTe.areas[areaIdx].items.push({ catalog_id: firstCat ? firstCat.id : '', qty:1 });
  var el = document.getElementById('te-area-items-'+areaIdx);
  if (el) el.innerHTML = wtRenderTeAreaItems(areaIdx, catOptions);
}

function wtTeRemoveItem(areaIdx, itemIdx) {
  if (_wtTe.areas[areaIdx]) _wtTe.areas[areaIdx].items.splice(itemIdx,1);
  var el = document.getElementById('te-area-items-'+areaIdx);
  if (el) el.innerHTML = wtRenderTeAreaItems(areaIdx);
}

function wtSaveTemplate() {
  _wtTe.name = (document.getElementById('te-name')||{}).value||'';
  _wtTe.unit_type = (document.getElementById('te-utype')||{}).value||'2BR';
  if (!_wtTe.name.trim()) { showToast('Template name is required','warning'); return; }

  var tmpls = wtGetTemplates();
  var idx = tmpls.findIndex(function(t){ return t.id===_wtTe.id; });
  if (idx>=0) tmpls[idx] = _wtTe; else tmpls.push(_wtTe);
  DB.wtRoomTemplates = tmpls;
  saveDB();

  document.getElementById('wt-te-modal').remove();
  var list = document.getElementById('wt-tmpl-list');
  if (list) list.innerHTML = wtRenderTemplateList();
  showToast('✅ Template saved','success');
}

function wtDeleteTemplate(tplId) {
  if (!confirm('Delete this template?')) return;
  DB.wtRoomTemplates = wtGetTemplates().filter(function(t){ return t.id!==tplId; });
  saveDB();
  var list = document.getElementById('wt-tmpl-list');
  if (list) list.innerHTML = wtRenderTemplateList();
  showToast('Template deleted','info');
}

// ─── PROJECT WIZARD — 5 STEPS ────────────────────────────────────────────────
// Step 1: Basics
// Step 2: Buildings & Floors
// Step 3: Room Numbering
// Step 4: Unit → Template Mapping
// Step 5: Systems + Review

// ─── WIZARD DRAFT (auto-save) ─────────────────────────────────────────────────
var WT_WIZ_DRAFT = 'wt_wizard_draft';

function wtWizSaveDraft() {
  try {
    // Trim generated IDs from draft to reduce size — they get regenerated on create
    var slim = JSON.parse(JSON.stringify(_wiz));
    localStorage.setItem(WT_WIZ_DRAFT, JSON.stringify(slim));
    // Flash the "Draft saved" badge
    var badge = document.getElementById('wiz-save-badge');
    if (badge) {
      badge.style.opacity = '1';
      clearTimeout(wtWizSaveDraft._t);
      wtWizSaveDraft._t = setTimeout(function(){ badge.style.opacity='0'; }, 2000);
    }
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      // Try clearing old wizard drafts first, then retry
      try {
        localStorage.removeItem(WT_WIZ_DRAFT);
        localStorage.setItem(WT_WIZ_DRAFT, JSON.stringify(_wiz));
      } catch(e2) {
        console.warn('Wizard draft could not be saved — localStorage full');
      }
    }
  }
}
function wtWizClearDraft() {
  try { localStorage.removeItem(WT_WIZ_DRAFT); } catch(e) {}
}
function wtWizLoadDraft() {
  try { var d=localStorage.getItem(WT_WIZ_DRAFT); return d?JSON.parse(d):null; } catch(e) { return null; }
}

var _wiz = {
  step: 1, totalSteps: 5,
  proj: { name:'', jobId:'', customerName:'', structureType:'multi', systems:[] },
  buildings: [],
  // buildings[i] = { id, name, type, floors:[{ id, name, num, units:[{unitType,qty}], numbering:{mode,startNum,digits,prefix,customList} }] }
  templateMap: {}, // unitType → tplId
};


// ─── BUILDING TYPES ───────────────────────────────────────────────────────────
function wtGetBuildingTypes() {
  if (!DB.wtBuildingTypes || !DB.wtBuildingTypes.length) {
    DB.wtBuildingTypes = [
      { id:'residential',    label:'Residential'    },
      { id:'common_area',    label:'Common Area'    },
      { id:'network_closet', label:'Network Closet' },
      { id:'infrastructure', label:'Infrastructure' },
      { id:'parking',        label:'Parking'        },
      { id:'recreational',   label:'Recreational'   },
      { id:'retail',         label:'Retail'         },
      { id:'office',         label:'Office'         },
    ];
  }
  return DB.wtBuildingTypes;
}

function wtBtRender() {
  var types = wtGetBuildingTypes();
  return types.map(function(t, i){
    var del = types.length > 1
      ? '<button onclick="wtBtDelete('+i+')" style="padding:4px 8px;font-size:11px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">Del</button>'
      : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:6px">'+
      '<input value="'+escHtml(t.label)+'" oninput="wtBtRename('+i+',this.value)" '+
        'style="flex:1;font-size:13px;font-weight:600;border:none;border-bottom:2px solid #e0e0e0;padding:3px 0;background:transparent;color:#0d1b2a">'+
      del+'</div>';
  }).join('');
}
function wtBtRename(i, val) { if (DB.wtBuildingTypes[i]) { DB.wtBuildingTypes[i].label=val; saveDB(); } }
function wtBtDelete(i) {
  DB.wtBuildingTypes.splice(i,1); saveDB();
  var el=document.getElementById('bt-list'); if(el) el.innerHTML=wtBtRender();
}
function wtBtAdd() {
  DB.wtBuildingTypes.push({ id:'bt_'+Date.now(), label:'New Type' }); saveDB();
  var el=document.getElementById('bt-list'); if(el) el.innerHTML=wtBtRender();
}
function wtOpenBuildingTypeManager() {
  var html = '<div class="modal-overlay open" id="wt-bt-modal" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>Building Types</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-bt-modal\').remove()">&#x2715;</button></div>'+
      '<div class="modal-body">'+
        '<p style="font-size:13px;color:#546e7a;margin:0 0 14px">Edit, add, or remove building type options used in the wizard.</p>'+
        '<div id="bt-list">'+wtBtRender()+'</div>'+
        '<button onclick="wtBtAdd()" style="font-size:13px;color:#1565c0;background:#e3f2fd;border:2px dashed #90caf9;border-radius:8px;cursor:pointer;padding:10px;width:100%;font-weight:700;margin-top:8px">+ Add Type</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-bt-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

// ============================================================
// PROJECT WIZARD V2 — Floor-first, room-by-room roster
// ============================================================

var _wiz = {
  step:1, totalSteps:5,
  proj:{ name:'', jobId:'', customerName:'', structureType:'multi', systems:[] },
  buildings:[],
  s3bldg:0, s3floor:0,
};

// Unit type definitions — used throughout wizard and app
var WT_UNIT_DEF = [
  { id:'Studio', short:'S',   color:'#7b1fa2', bg:'#f3e5f5' },
  { id:'1BR',    short:'1BR', color:'#1565c0', bg:'#e3f2fd' },
  { id:'2BR',    short:'2BR', color:'#2e7d32', bg:'#e8f5e9' },
  { id:'3BR',    short:'3BR', color:'#e65100', bg:'#fff3e0' },
  { id:'4BR',    short:'4BR', color:'#c62828', bg:'#ffebee' },
  { id:'Common', short:'CMN', color:'#546e7a', bg:'#eceff1' },
  { id:'Other',  short:'OTH', color:'#90a4ae', bg:'#f5f5f5' },
];

function wtUnitDef(id) {
  return WT_UNIT_DEF.find(function(t){ return t.id===id; }) || WT_UNIT_DEF[6];
}

// ─── WIZARD OPEN / SHOW ───────────────────────────────────────────────────────
function openNewProjectWizard() {
  var draft = wtWizLoadDraft();
  // Validate draft is compatible with V5 format (rooms array, not units)
  var draftValid = draft && draft.proj && draft.proj.name && draft.proj.name.trim() &&
    Array.isArray(draft.buildings) && typeof draft.s3bldg === 'number';
  if (draftValid) {
    if (confirm('You have an unsaved project "'+draft.proj.name+'" in progress (Step '+draft.step+' of 5).\nResume where you left off?')) {
      _wiz = draft;
      // Ensure buildings have rooms arrays not units (V4→V5 migration)
      (_wiz.buildings||[]).forEach(function(b){
        (b.floors||[]).forEach(function(f){
          if (!f.rooms) f.rooms = [];
        });
      });
      wtShowWizard();
      return;
    }
    wtWizClearDraft();
  } else if (draft) {
    wtWizClearDraft(); // clear incompatible old draft silently
  }
  _wiz = { step:1, totalSteps:5,
    proj:{ name:'', jobId:'', customerName:'', structureType:'multi', systems:[] },
    buildings:[], s3bldg:0, s3floor:0 };
  wtShowWizard();
}

function wtShowWizard() {
  var e=document.getElementById('wt-wizard-modal'); if(e) e.remove();
  var labels = ['Basics','Buildings','Rooms','Systems','Review'];
  var content = [wtWizStep1,wtWizStep2,wtWizStep3,wtWizStep4,wtWizStep5][_wiz.step-1]();
  var html='<div class="modal-overlay open" id="wt-wizard-modal">'+
    '<div class="modal-box" style="max-width:860px;max-height:94vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<div><h3 style="margin:0">🏗 New Project Wizard</h3>'+
          '<div style="display:flex;align-items:center;gap:10px;margin-top:2px">'+
            '<span style="font-size:11px;color:#90a4ae">Step '+_wiz.step+' of 5 — '+labels[_wiz.step-1]+'</span>'+
            '<span id="wiz-save-badge" style="font-size:10px;color:#2e7d32;font-weight:700;opacity:0;transition:opacity .5s">✓ Draft saved</span>'+
          '</div></div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-wizard-modal\').remove()">✕</button>'+
      '</div>'+
      '<div style="display:flex;gap:0;padding:0 22px;border-bottom:1px solid #f0f0f0;flex-shrink:0">'+
        labels.map(function(l,i){
          var a=i+1===_wiz.step,d=i+1<_wiz.step;
          return '<div style="flex:1;text-align:center;padding:8px 4px;font-size:11px;font-weight:'+(a?800:600)+';'+
            'color:'+(a?'#1565c0':d?'#2e7d32':'#90a4ae')+';border-bottom:3px solid '+(a?'#1565c0':d?'#2e7d32':'transparent')+';margin-bottom:-1px">'+
            (d?'✓ ':'')+l+'</div>';
        }).join('')+
      '</div>'+
      '<div class="modal-body" style="overflow-y:auto;flex:1;padding:20px 22px">'+content+'</div>'+
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
}

// ─── STEP 1: BASICS ───────────────────────────────────────────────────────────
function wtWizStep1() {
  var jobOpts=(DB.jobs||[]).map(function(j){
    return '<option value="'+j.id+'"'+(j.id===_wiz.proj.jobId?' selected':'')+'>'+
      escHtml(j.name||'')+(j.customerName?' — '+escHtml(j.customerName):'')+'</option>';
  }).join('');
  return '<h4 style="margin:0 0 20px;font-size:16px;font-weight:800">Project Basics</h4>'+
    '<div style="margin-bottom:14px"><label class="wiz-label">PROJECT NAME *</label>'+
      '<input id="wiz-name" class="form-control" placeholder="e.g. Smith Properties Phase 2" value="'+escHtml(_wiz.proj.name||'')+'"></div>'+
    '<div style="margin-bottom:14px"><label class="wiz-label">LINK TO JOB <span style="font-weight:400;text-transform:none">(optional — connects tracking to your quote)</span></label>'+
      '<select id="wiz-job" class="form-control" onchange="var j=(DB.jobs||[]).find(function(x){return x.id===this.value});if(j&&j.customerName)document.getElementById(\'wiz-cust\').value=j.customerName||\'\'">'+
        '<option value="">— None —</option>'+jobOpts+'</select></div>'+
    '<div style="margin-bottom:20px"><label class="wiz-label">CUSTOMER NAME</label>'+
      '<input id="wiz-cust" class="form-control" placeholder="Customer / Property name" value="'+escHtml(_wiz.proj.customerName||'')+'"></div>'+
    '<div style="margin-bottom:24px"><label class="wiz-label">PROJECT TYPE</label>'+
      '<div style="display:flex;gap:10px">'+
        [['multi','🏘 Multi-Building','Multiple buildings on one project'],
         ['single','🏠 Single Building','One building or structure']].map(function(t){
          var s=_wiz.proj.structureType===t[0];
          return '<div onclick="document.querySelectorAll(\'[data-pt]\').forEach(function(e){e.style.border=\'2px solid #e0e0e0\';e.style.background=\'#fff\'});this.style.border=\'2px solid #1565c0\';this.style.background=\'#e3f2fd\';_wiz.proj.structureType=\''+t[0]+'\'" data-pt="'+t[0]+'" '+
            'style="flex:1;padding:14px;border:2px solid '+(s?'#1565c0':'#e0e0e0')+';border-radius:10px;cursor:pointer;background:'+(s?'#e3f2fd':'#fff')+'">'+
            '<div style="font-size:15px;margin-bottom:4px">'+t[1]+'</div>'+
            '<div style="font-size:11px;color:#546e7a">'+t[2]+'</div></div>';
        }).join('')+
      '</div></div>'+
    '<div style="display:flex;justify-content:flex-end">'+
      '<button class="btn btn-primary" onclick="wtWizNext(1)">Next → Buildings</button></div>';
}

// ─── STEP 2: BUILDINGS ────────────────────────────────────────────────────────
function wtWizStep2() {
  if (!_wiz.buildings.length) {
    _wiz.buildings=[{ id:'b_'+Date.now(), name:'Building 1', type:'residential', floors:[] }];
  }
  var types=wtGetBuildingTypes();
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Buildings</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 4px">Name each building exactly as it appears on the plans — your team will use these names to navigate the job.</p>'+
    '<p style="font-size:12px;color:#1565c0;margin:0 0 16px;cursor:pointer" onclick="wtOpenBuildingTypeManager()">⚙ Manage building types</p>'+
    '<div id="wiz-s2-list">'+wtWizS2Render()+'</div>'+
    '<button onclick="wtWizS2Add()" style="font-size:13px;color:#1565c0;background:#e3f2fd;border:2px dashed #90caf9;border-radius:10px;cursor:pointer;padding:12px;width:100%;font-weight:700;margin-bottom:24px">+ Add Building</button>'+
    '<div style="display:flex;justify-content:space-between">'+
      '<button class="btn btn-outline" onclick="_wiz.step=1;wtShowWizard()">← Back</button>'+
      '<button class="btn btn-primary" onclick="wtWizNext(2)">Next → Rooms</button></div>';
}

function wtWizS2Render() {
  var types=wtGetBuildingTypes();
  return _wiz.buildings.map(function(b,bi){
    var typeOpts=types.map(function(t){
      return '<option value="'+t.id+'"'+(b.type===t.id?' selected':'')+'>'+escHtml(t.label)+'</option>';
    }).join('');
    return '<div style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e0e0e0;border-radius:10px;margin-bottom:8px;background:#fff">'+
      '<input value="'+escHtml(b.name)+'" oninput="_wiz.buildings['+bi+'].name=this.value" '+
        'placeholder="e.g. North Tower, Clubhouse" '+
        'style="flex:1;font-size:14px;font-weight:700;border:none;border-bottom:2px solid #1565c0;padding:4px 0;background:transparent;color:#0d1b2a">'+
      '<select oninput="_wiz.buildings['+bi+'].type=this.value" style="font-size:12px;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px">'+typeOpts+'</select>'+
      (_wiz.buildings.length>1
        ?'<button onclick="_wiz.buildings.splice('+bi+',1);document.getElementById(\'wiz-s2-list\').innerHTML=wtWizS2Render()" '+
          'style="padding:5px 10px;font-size:12px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">✕</button>'
        :'')+
    '</div>';
  }).join('');
}

function wtWizS2Add() {
  _wiz.buildings.push({ id:'b_'+Date.now(), name:'Building '+(_wiz.buildings.length+1), type:'residential', floors:[] });
  var el=document.getElementById('wiz-s2-list'); if(el) el.innerHTML=wtWizS2Render();
}

// ─── STEP 3: FLOOR & ROOM ROSTER ─────────────────────────────────────────────
function wtWizStep3() {
  if (!_wiz.buildings.length) { _wiz.step=2; wtShowWizard(); return ''; }
  _wiz.s3bldg = Math.max(0,Math.min(_wiz.s3bldg,_wiz.buildings.length-1));
  var b = _wiz.buildings[_wiz.s3bldg];
  if (!b.floors) b.floors=[];
  if (!b.floors.length) b.floors.push({ id:'f_'+Date.now(), name:'Floor 1', floorNum:1, rooms:[] });
  _wiz.s3floor = Math.max(0,Math.min(_wiz.s3floor,b.floors.length-1));
  var fl = b.floors[_wiz.s3floor];
  var untyped = fl.rooms.filter(function(r){ return !r.unitType; }).length;

  return '<h4 style="margin:0 0 4px;font-size:16px;font-weight:800">Floor & Room Setup</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 14px">Generate room numbers from your plans, then tap to assign each room\'s type.</p>'+

    // Building tabs (only if multi-building)
    (_wiz.buildings.length>1
      ?'<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">'+
          _wiz.buildings.map(function(bd,i){
            var a=i===_wiz.s3bldg;
            return '<button onclick="_wiz.s3bldg='+i+';_wiz.s3floor=0;wtWizRefreshStep3()" '+
              'style="padding:6px 14px;font-size:12px;font-weight:700;border:2px solid '+(a?'#1565c0':'#e0e0e0')+';border-radius:8px;background:'+(a?'#1565c0':'#fff')+';color:'+(a?'#fff':'#546e7a')+';cursor:pointer">'+
              escHtml(bd.name)+'</button>';
          }).join('')+
        '</div>' : '')+

    // Floor tabs
    '<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">'+
      b.floors.map(function(f,i){
        var a=i===_wiz.s3floor;
        var done=f.rooms.length>0&&f.rooms.every(function(r){ return r.unitType; });
        return '<button onclick="_wiz.s3floor='+i+';wtWizRefreshStep3()" '+
          'style="padding:5px 14px;font-size:12px;font-weight:700;border:2px solid '+(a?'#1565c0':done?'#2e7d32':'#e0e0e0')+';border-radius:20px;background:'+(a?'#1565c0':done?'#e8f5e9':'#fff')+';color:'+(a?'#fff':done?'#2e7d32':'#546e7a')+';cursor:pointer">'+
          escHtml(f.name)+
          ' <span style="font-size:10px;opacity:.8">('+f.rooms.length+')</span>'+
          (done?' ✓':'')+
        '</button>';
      }).join('')+
      '<button onclick="wtWizS3AddFloor()" '+
        'style="padding:5px 12px;font-size:12px;border:2px dashed #ccc;border-radius:20px;background:#fff;color:#546e7a;cursor:pointer">+ Floor</button>'+
      (b.floors.length>1
        ?'<button onclick="wtWizS3DeleteFloor()" style="padding:5px 8px;font-size:11px;border:1px solid #ffcdd2;border-radius:20px;background:#fff;color:#c62828;cursor:pointer" title="Delete this floor">🗑</button>'
        :'')+
    '</div>'+

    // Building + Floor name row
    '<div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;flex-wrap:wrap">'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-size:11px;color:#90a4ae;font-weight:700">BUILDING:</span>'+
        '<input id="wiz-bld-name" value="'+escHtml(b.name)+'" '+
          'oninput="_wiz.buildings[_wiz.s3bldg].name=this.value;wtWizSaveDraft();var tabs=document.querySelectorAll(\'[data-bldg-tab]\');if(tabs[_wiz.s3bldg])tabs[_wiz.s3bldg].textContent=this.value||(\'Building \'+(+_wiz.s3bldg+1))" '+
          'style="font-size:14px;font-weight:700;border:none;border-bottom:2px solid #1565c0;padding:4px 0;background:transparent;color:#0d1b2a;width:180px" placeholder="Building name">'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-size:11px;color:#90a4ae;font-weight:700">FLOOR:</span>'+
        '<input id="wiz-fl-name" value="'+escHtml(fl.name)+'" '+
          'oninput="_wiz.buildings[_wiz.s3bldg].floors[_wiz.s3floor].name=this.value;wtWizSaveDraft()" '+
          'style="font-size:14px;font-weight:700;border:none;border-bottom:2px solid #e0e0e0;padding:4px 0;background:transparent;color:#0d1b2a;width:120px" placeholder="Floor name">'+
      '</div>'+
    '</div>'+

    // Generate bar — refreshable div
    '<div id="wiz-gen-bar">'+wtWizGenBarHtml(fl)+'</div>'+

    // Roster
    '<div id="wiz-roster-wrap">'+wtWizRosterHtml()+'</div>'+

    // Footer
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">'+
      '<button onclick="wtWizRosterAddRoom()" '+
        'style="padding:8px 16px;font-size:13px;color:#2e7d32;background:#e8f5e9;border:2px dashed #a5d6a7;border-radius:8px;cursor:pointer;font-weight:700">+ Add Room</button>'+
      '<div style="display:flex;gap:8px">'+
        '<button onclick="wtWizSetAllModal()" '+
          'style="padding:8px 14px;font-size:12px;border:1px solid #1565c0;border-radius:8px;background:#e3f2fd;color:#1565c0;cursor:pointer;font-weight:600">Set All →</button>'+
        '<button onclick="wtWizCopyFloorModal()" '+
          'style="padding:8px 14px;font-size:12px;border:1px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer">📋 Copy Floor</button>'+
        (_wiz.buildings.length>1
          ?'<button onclick="wtWizCopyBuildingModal()" '+
            'style="padding:8px 14px;font-size:12px;border:1px solid #7b1fa2;border-radius:8px;background:#f3e5f5;color:#7b1fa2;cursor:pointer;font-weight:600">🏗 Copy Building →</button>'
          :'')+
      '</div>'+
    '</div>'+

    // Building completion overview
    wtWizBldgProgress()+

    '<div style="display:flex;justify-content:space-between;margin-top:12px">'+
      '<button class="btn btn-outline" onclick="_wiz.step=2;wtShowWizard()">← Back</button>'+
      '<button class="btn btn-primary" onclick="wtWizNext(3)">Next → Systems</button></div>';
}

function wtWizRosterHtml() {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if (!fl) return '';
  if (!fl.rooms.length) return '<div style="padding:30px;text-align:center;color:#90a4ae;border:1px solid #e0e0e0;border-radius:10px">'+
    'No rooms yet — use Quick Generate above or add rooms one by one below.</div>';

  var typeHdrs = WT_UNIT_DEF.map(function(t){
    return '<th style="text-align:center;padding:6px 4px;font-size:10px;font-weight:700;color:'+t.color+';min-width:38px">'+t.short+'</th>';
  }).join('');

  var rows = fl.rooms.map(function(r,ri){
    var typeCells = WT_UNIT_DEF.map(function(t){
      var sel = r.unitType===t.id;
      return '<td style="text-align:center;padding:4px 2px">'+
        '<button onclick="wtWizSetType('+ri+',\''+t.id+'\')" '+
          'title="'+t.id+'" '+
          'style="width:34px;height:28px;border:2px solid '+(sel?t.color:'#e0e0e0')+';border-radius:6px;'+
          'background:'+(sel?t.color:'#fff')+';color:'+(sel?'#fff':t.color)+';'+
          'font-size:10px;font-weight:800;cursor:pointer;transition:all .1s">'+
          t.short+
        '</button></td>';
    }).join('');

    return '<tr style="background:'+(r.unitType?'#fff':'#fffde7')+'" id="wiz-row-'+ri+'">'+
      '<td style="padding:6px 8px;font-size:11px;color:#90a4ae;text-align:right;width:30px">'+(ri+1)+'</td>'+
      '<td style="padding:4px 6px;width:100px">'+
        '<input value="'+escHtml(r.number)+'" '+
          'oninput="_wiz.buildings[_wiz.s3bldg].floors[_wiz.s3floor].rooms['+ri+'].number=this.value" '+
          'style="width:100%;padding:5px 7px;border:1px solid '+(r.number?'#e0e0e0':'#f57c00')+';border-radius:6px;font-size:13px;font-weight:700;color:#0d1b2a;box-sizing:border-box">'+
      '</td>'+
      typeCells+
      '<td style="padding:4px 6px;width:32px">'+
        '<button onclick="wtWizDeleteRoom('+ri+')" '+
          'style="width:28px;height:28px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer;font-size:12px">✕</button>'+
      '</td>'+
    '</tr>';
  }).join('');

  return '<div style="overflow-x:auto;border:1px solid #e0e0e0;border-radius:10px">'+
    '<table style="width:100%;border-collapse:collapse;min-width:500px">'+
      '<thead><tr style="background:#f5f7fa">'+
        '<th style="width:30px"></th>'+
        '<th style="text-align:left;padding:8px 6px;font-size:11px;font-weight:700;color:#546e7a;width:100px">ROOM #</th>'+
        typeHdrs+
        '<th style="width:32px"></th>'+
      '</tr></thead>'+
      '<tbody>'+rows+'</tbody>'+
    '</table>'+
  '</div>';
}

function wtWizSetType(ri, typeId) {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if (!fl||!fl.rooms[ri]) return;
  fl.rooms[ri].unitType = fl.rooms[ri].unitType===typeId ? null : typeId;
  // Re-render just the row for performance
  var row = document.getElementById('wiz-row-'+ri);
  if (row) {
    var t = wtUnitDef(fl.rooms[ri].unitType);
    row.style.background = fl.rooms[ri].unitType ? '#fff' : '#fffde7';
    var btns = row.querySelectorAll('button[title]');
    btns.forEach(function(btn){
      var tid = btn.getAttribute('title');
      var td = wtUnitDef(tid);
      var sel = fl.rooms[ri].unitType === tid;
      btn.style.border = '2px solid '+(sel?td.color:'#e0e0e0');
      btn.style.background = sel?td.color:'#fff';
      btn.style.color = sel?'#fff':td.color;
    });
  }
  // Auto-save after type assignment
  clearTimeout(wtWizSetType._t);
  wtWizSetType._t = setTimeout(wtWizSaveDraft, 800);
}


// Live preview of generated room numbers

// ─── GENERATE BAR HELPERS ─────────────────────────────────────────────────────
function wtWizParseRoom(s) {
  s = (s||'').trim();
  var m = s.match(/^([^0-9]*)(\d+)([^0-9]*)$/);
  return m ? { prefix:m[1], num:parseInt(m[2]), digits:m[2].length, suffix:m[3] } : null;
}

function wtWizGenPreview2(firstVal, lastVal, sfx) {
  sfx = sfx||'';
  var f = wtWizParseRoom(firstVal);
  if (!f) return firstVal ? '<span style="color:#c62828">Invalid room number</span>' : '';
  var l = wtWizParseRoom(lastVal);
  if (!l) l = f;
  var start=f.num, end=l.num;
  if (end < start) return '<span style="color:#c62828">Last must be &ge; First</span>';
  var count = end-start+1;
  if (count > 200) return '<span style="color:#c62828">Max 200 rooms ('+count+' selected)</span>';
  var digits = Math.max(f.digits, l.digits);
  var pfx=f.prefix, sfxAll=f.suffix+sfx;
  function fmt(n){ return pfx+String(n).padStart(digits,'0')+sfxAll; }
  var preview;
  if (count<=5) {
    var arr=[]; for(var i=0;i<count;i++) arr.push(fmt(start+i));
    preview = arr.join(', ');
  } else {
    preview = fmt(start)+', '+fmt(start+1)+', ..., '+fmt(end);
  }
  return '&#x1F50D; <span style="color:#0d1b2a;font-family:monospace">'+
    escHtml(preview)+'</span> &nbsp;<span style="color:#546e7a">('+count+
    ' room'+(count>1?'s':'')+')</span>';
}

function wtWizUpdatePreview2() {
  var first=(document.getElementById('wiz-first')||{}).value||'';
  var last =(document.getElementById('wiz-last') ||{}).value||'';
  var sfx  =(document.getElementById('wiz-sfx2') ||{}).value||'';
  var el=document.getElementById('wiz-gen-preview2');
  if(el) el.innerHTML=wtWizGenPreview2(first,last,sfx);
}

function wtWizGenBarHtml(fl) {
  var hasRooms = fl && fl.rooms && fl.rooms.length > 0;
  var firstVal = hasRooms ? fl.rooms[0].number : '101';
  var lastVal  = hasRooms ? fl.rooms[fl.rooms.length-1].number : '125';
  return '<div style="background:#f5f7fa;border-radius:10px;padding:14px 16px">'+
    '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">&#x26A1; Generate Room Numbers</div>'+
    '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">'+
      '<div>'+
        '<label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">FIRST ROOM</label>'+
        '<input id="wiz-first" value="'+escHtml(firstVal)+'" oninput="wtWizUpdatePreview2()" '+
          'placeholder="e.g. 1001" '+
          'style="width:90px;padding:8px 10px;border:2px solid #1565c0;border-radius:8px;font-size:16px;font-weight:700;text-align:center;color:#0d1b2a">'+
      '</div>'+
      '<div style="font-size:22px;color:#90a4ae;padding-bottom:4px">&#x2192;</div>'+
      '<div>'+
        '<label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">LAST ROOM</label>'+
        '<input id="wiz-last" value="'+escHtml(lastVal)+'" oninput="wtWizUpdatePreview2()" '+
          'placeholder="e.g. 1025" '+
          'style="width:90px;padding:8px 10px;border:2px solid #1565c0;border-radius:8px;font-size:16px;font-weight:700;text-align:center;color:#0d1b2a">'+
      '</div>'+
      '<div>'+
        '<label style="font-size:11px;color:#546e7a;font-weight:700;display:block;margin-bottom:4px">SUFFIX <span style="font-weight:400;text-transform:none">(optional)</span></label>'+
        '<input id="wiz-sfx2" oninput="wtWizUpdatePreview2()" '+
          'placeholder="e.g. A" '+
          'style="width:65px;padding:8px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;text-align:center">'+
      '</div>'+
      '<button onclick="wtWizGenRooms2()" class="btn btn-primary" style="flex-shrink:0;height:38px">'+
        (hasRooms ? '&#x21BB; Regenerate' : '&#x25B6; Generate')+
      '</button>'+
    '</div>'+
    '<div id="wiz-gen-preview2" style="font-size:12px;font-weight:600;min-height:18px">'+
      wtWizGenPreview2(firstVal, lastVal, '')+
    '</div>'+
    (hasRooms
      ? '<div style="border-top:1px solid #e0e0e0;margin-top:12px;padding-top:12px">'+
          '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Modify Existing Room Numbers</div>'+
          '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              '<span style="font-size:12px;color:#546e7a;font-weight:600">Add Prefix:</span>'+
              '<input id="mod-pfx" placeholder="e.g. A" style="width:65px;padding:5px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
              '<button onclick="wtWizApplyPrefix()" class="btn btn-outline btn-sm">Apply to All</button>'+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              '<span style="font-size:12px;color:#546e7a;font-weight:600">Add Suffix:</span>'+
              '<input id="mod-sfx" placeholder="e.g. A" style="width:65px;padding:5px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
              '<button onclick="wtWizApplySuffix()" class="btn btn-outline btn-sm">Apply to All</button>'+
            '</div>'+
          '</div>'+
          '<div style="font-size:11px;color:#e65100;margin-top:8px">'+
            '&#x26A0; Regenerate replaces all '+fl.rooms.length+' rooms but preserves types for matching numbers.'+
          '</div>'+
        '</div>'
      : '')+
  '</div>';
}

function wtWizGenRooms2() {
  var first=((document.getElementById('wiz-first')||{}).value||'').trim();
  var last =((document.getElementById('wiz-last') ||{}).value||'').trim();
  var sfx  = (document.getElementById('wiz-sfx2') ||{}).value||'';
  if (!first) { showToast('Enter the first room number','warning'); return; }
  var f=wtWizParseRoom(first);
  var l=last?wtWizParseRoom(last):f;
  if (!f) { showToast('Invalid format — enter something like 101 or A101','warning'); return; }
  if (!l) l=f;
  var start=f.num, end=l.num;
  if (end<start) { showToast('Last Room must be >= First Room','warning'); return; }
  var count=end-start+1;
  if (count>200) { showToast('Maximum 200 rooms per floor','warning'); return; }
  var digits=Math.max(f.digits,l.digits);
  var prefix=f.prefix, suffix=f.suffix+sfx;
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if (!fl) return;
  var oldTypes={};
  (fl.rooms||[]).forEach(function(r){ if(r.unitType) oldTypes[r.number]=r.unitType; });
  var rooms=[];
  for (var i=0;i<count;i++) {
    var num=start+i;
    var rnum=prefix+String(num).padStart(digits,'0')+suffix;
    rooms.push({ id:'r_'+Date.now()+'_'+i, number:rnum, unitType:oldTypes[rnum]||null });
  }
  fl.rooms=rooms;
  var el=document.getElementById('wiz-roster-wrap');
  if(el) el.innerHTML=wtWizRosterHtml();
  var bar=document.getElementById('wiz-gen-bar');
  if(bar) bar.innerHTML=wtWizGenBarHtml(fl);
  wtWizSaveDraft();
}

function wtWizApplyPrefix() {
  var pfx=(document.getElementById('mod-pfx')||{}).value||'';
  if (!pfx.trim()) { showToast('Enter a prefix to apply','warning'); return; }
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl||!fl.rooms.length) return;
  fl.rooms.forEach(function(r){ r.number=pfx+r.number; });
  var el=document.getElementById('wiz-roster-wrap'); if(el) el.innerHTML=wtWizRosterHtml();
  var bar=document.getElementById('wiz-gen-bar'); if(bar) bar.innerHTML=wtWizGenBarHtml(fl);
  wtWizSaveDraft();
  showToast('Prefix "'+pfx+'" added to all '+fl.rooms.length+' rooms','success');
}

function wtWizApplySuffix() {
  var sfx=(document.getElementById('mod-sfx')||{}).value||'';
  if (!sfx.trim()) { showToast('Enter a suffix to apply','warning'); return; }
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl||!fl.rooms.length) return;
  fl.rooms.forEach(function(r){ r.number=r.number+sfx; });
  var el=document.getElementById('wiz-roster-wrap'); if(el) el.innerHTML=wtWizRosterHtml();
  var bar=document.getElementById('wiz-gen-bar'); if(bar) bar.innerHTML=wtWizGenBarHtml(fl);
  wtWizSaveDraft();
  showToast('Suffix "'+sfx+'" added to all '+fl.rooms.length+' rooms','success');
}

// Shims for old function names
function wtWizGenPreview()  { return ''; }
function wtWizUpdatePreview() {}
function wtWizGenRooms()    { wtWizGenRooms2(); }


function wtWizRosterAddRoom() {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if (!fl) return;
  fl.rooms.push({ id:'r_'+Date.now(), number:'', unitType:null });
  wtWizSaveDraft();
  var el=document.getElementById('wiz-roster-wrap');
  if(el) el.innerHTML=wtWizRosterHtml();
  // Focus the new room number input
  setTimeout(function(){
    var inputs=document.querySelectorAll('#wiz-roster-wrap input');
    if(inputs.length) inputs[inputs.length-1].focus();
  },80);
}

function wtWizDeleteRoom(ri) {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if (!fl) return;
  fl.rooms.splice(ri,1);
  wtWizSaveDraft();
  var el=document.getElementById('wiz-roster-wrap');
  if(el) el.innerHTML=wtWizRosterHtml();
}

function wtWizS3AddFloor() {
  var b=_wiz.buildings[_wiz.s3bldg]; if(!b) return;
  var n=b.floors.length+1;
  b.floors.push({ id:'f_'+Date.now(), name:'Floor '+n, floorNum:n, rooms:[] });
  _wiz.s3floor=b.floors.length-1;
  wtWizSaveDraft();
  wtWizRefreshStep3();
}

function wtWizS3DeleteFloor() {
  var b=_wiz.buildings[_wiz.s3bldg]; if(!b||b.floors.length<=1) return;
  if (!confirm('Delete "'+b.floors[_wiz.s3floor].name+'"? All rooms on this floor will be removed.')) return;
  b.floors.splice(_wiz.s3floor,1);
  _wiz.s3floor=Math.max(0,_wiz.s3floor-1);
  wtWizRefreshStep3();
}

function wtWizRefreshStep3() {
  var e=document.getElementById('wt-wizard-modal'); if(e) e.remove();
  wtShowWizard();
}

// Set All — assign one type to all unassigned rooms on current floor
function wtWizSetAllModal() {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl) return;
  var untyped=fl.rooms.filter(function(r){ return !r.unitType; }).length;
  var html='<div class="modal-overlay open" id="wt-setall-modal" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>Set Type</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-setall-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Apply a type to rooms on this floor:</p>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">'+
          WT_UNIT_DEF.map(function(t){
            return '<button onclick="wtWizDoSetAll(\''+t.id+'\',false)" '+
              'style="padding:10px 16px;font-size:13px;font-weight:700;border:2px solid '+t.color+';border-radius:8px;background:'+t.bg+';color:'+t.color+';cursor:pointer">'+t.id+'</button>';
          }).join('')+
        '</div>'+
        (untyped<fl.rooms.length
          ?'<div style="border-top:1px solid #f0f0f0;padding-top:12px">'+
              '<p style="font-size:12px;color:#546e7a;margin:0 0 10px">Or set ONLY the '+untyped+' unassigned rooms:</p>'+
              '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
                WT_UNIT_DEF.map(function(t){
                  return '<button onclick="wtWizDoSetAll(\''+t.id+'\',true)" '+
                    'style="padding:8px 12px;font-size:12px;font-weight:700;border:2px solid '+t.color+';border-radius:8px;background:#fff;color:'+t.color+';cursor:pointer">'+t.id+' (unassigned only)</button>';
                }).join('')+
              '</div></div>'
          :'')+
      '</div></div></div>';
  var e=document.getElementById('wt-setall-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function wtWizDoSetAll(typeId, unassignedOnly) {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl) return;
  fl.rooms.forEach(function(r){
    if (!unassignedOnly || !r.unitType) r.unitType=typeId;
  });
  document.getElementById('wt-setall-modal').remove();
  wtWizSaveDraft();
  var el=document.getElementById('wiz-roster-wrap');
  if(el) el.innerHTML=wtWizRosterHtml();
}

// Copy Floor — copy current floor's room roster to other floors
function wtWizCopyFloorModal() {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl||!fl.rooms.length) { showToast('Add rooms to this floor first','warning'); return; }
  var otherFloors=b.floors.filter(function(f,i){ return i!==_wiz.s3floor; });
  var html='<div class="modal-overlay open" id="wt-cpfl-modal" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>📋 Copy Floor</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-cpfl-modal\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<p style="font-size:13px;color:#546e7a;margin:0 0 4px">Copy <strong>'+escHtml(fl.name)+'</strong> ('+fl.rooms.length+' rooms) to:</p>'+
        '<p style="font-size:11px;color:#90a4ae;margin:0 0 14px">Room numbers and types will be copied exactly.</p>'+
        (otherFloors.length
          ?'<div style="margin-bottom:14px">'+
              otherFloors.map(function(f){
                return '<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">'+
                  '<input type="checkbox" data-fid="'+f.id+'" style="width:16px;height:16px">'+
                  '<span style="font-size:13px;font-weight:600">'+escHtml(f.name)+'</span>'+
                  '<span style="font-size:11px;color:#90a4ae">('+f.rooms.length+' rooms)</span>'+
                '</label>';
              }).join('')+
            '</div>'
          :'<p style="color:#90a4ae;font-size:13px">No other floors yet.</p>')+
        '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:12px">'+
          '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">ALSO CREATE NEW FLOORS:</label>'+
          '<input id="cp-new" type="number" min="0" value="0" style="width:60px;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;text-align:center">'+
          '<span style="font-size:12px;color:#546e7a;margin-left:8px">additional floors</span>'+
        '</div>'+
        '<button class="btn btn-primary" style="width:100%" onclick="wtWizDoCopyFloor()">📋 Copy</button>'+
      '</div></div></div>';
  var e=document.getElementById('wt-cpfl-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

function wtWizDoCopyFloor() {
  var b=_wiz.buildings[_wiz.s3bldg], fl=b&&b.floors[_wiz.s3floor];
  if(!fl) return;
  var srcRooms=JSON.parse(JSON.stringify(fl.rooms));
  var copyCount=0;
  // Copy to checked floors
  document.querySelectorAll('#wt-cpfl-modal [data-fid]:checked').forEach(function(cb){
    var fid=cb.getAttribute('data-fid');
    var target=b.floors.find(function(f){ return f.id===fid; });
    if(target){
      target.rooms=srcRooms.map(function(r){ return Object.assign({},r,{id:'r_'+Date.now()+'_'+Math.random()}); });
      copyCount++;
    }
  });
  // Create new floors
  var newCount=parseInt((document.getElementById('cp-new')||{}).value)||0;
  for(var i=0;i<newCount;i++){
    var n=b.floors.length+1;
    b.floors.push({
      id:'f_'+Date.now()+'_'+i, name:'Floor '+n, floorNum:n,
      rooms:srcRooms.map(function(r){ return Object.assign({},r,{id:'r_'+Date.now()+'_'+Math.random()}); })
    });
    copyCount++;
  }
  document.getElementById('wt-cpfl-modal').remove();
  wtWizSaveDraft();
  wtWizRefreshStep3();
  showToast('📋 Floor copied to '+copyCount+' floor'+(copyCount>1?'s':''),'success');
}


// ─── COPY BUILDING (wizard) ────────────────────────────────────────────────────
function wtWizCopyBuildingModal() {
  var srcIdx = _wiz.s3bldg;
  var src = _wiz.buildings[srcIdx];
  if (!src) return;
  var totalRooms = (src.floors||[]).reduce(function(s,f){ return s+(f.rooms||[]).length; },0);
  if (!totalRooms) { showToast('This building has no rooms to copy','warning'); return; }

  var targets = _wiz.buildings.filter(function(b,i){ return i!==srcIdx; });
  var html = '<div class="modal-overlay open" id="wt-cpbldg-modal" onclick="if(event.target===this)this.remove()" style="z-index:10002">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>&#x1F3D7; Copy Building</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-cpbldg-modal\').remove()">&#x2715;</button></div>'+
      '<div class="modal-body">'+
        '<div style="padding:12px;background:#f3e5f5;border-radius:8px;margin-bottom:16px;font-size:13px;color:#7b1fa2">'+
          'Copy all floors, rooms, and type assignments from <strong>'+escHtml(src.name)+'</strong><br>'+
          '<span style="font-size:11px">('+src.floors.length+' floors &nbsp;·&nbsp; '+totalRooms+' rooms)</span>'+
        '</div>'+
        '<div style="font-size:12px;font-weight:700;color:#546e7a;margin-bottom:8px">COPY TO:</div>'+
        targets.map(function(b){
          var bRooms=(b.floors||[]).reduce(function(s,f){ return s+(f.rooms||[]).length; },0);
          return '<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">'+
            '<input type="checkbox" data-cpbldg="'+escHtml(b.name)+'" style="width:18px;height:18px">'+
            '<div>'+
              '<div style="font-size:13px;font-weight:700">'+escHtml(b.name)+'</div>'+
              '<div style="font-size:11px;color:#90a4ae">'+
                (bRooms>0?'Currently has '+bRooms+' rooms — will be replaced':'Empty — ready to copy into')+
              '</div>'+
            '</div>'+
          '</label>';
        }).join('')+
        '<div style="margin-top:14px;padding:8px;background:#fff3e0;border-radius:6px;font-size:11px;color:#e65100">'+
          '&#x26A0; This replaces all existing floors and rooms in the selected buildings.'+
        '</div>'+
        '<button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="wtWizDoCopyBuilding('+srcIdx+')">&#x1F3D7; Copy Building</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-cpbldg-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtWizDoCopyBuilding(srcIdx) {
  var srcBldg = _wiz.buildings[srcIdx];
  if (!srcBldg) return;
  var checked = document.querySelectorAll('#wt-cpbldg-modal [data-cpbldg]:checked');
  if (!checked.length) { showToast('Select at least one building to copy to','warning'); return; }

  var copyCount = 0;
  checked.forEach(function(cb){
    var targetName = cb.getAttribute('data-cpbldg');
    var targetIdx = _wiz.buildings.findIndex(function(b){ return b.name===targetName; });
    if (targetIdx < 0 || targetIdx===srcIdx) return;
    // Deep copy floors+rooms, generate fresh IDs
    _wiz.buildings[targetIdx].floors = JSON.parse(JSON.stringify(srcBldg.floors)).map(function(f){
      f.id = 'f_'+Date.now()+'_'+Math.random();
      f.rooms = f.rooms.map(function(r){
        r.id = 'r_'+Date.now()+'_'+Math.random();
        return r;
      });
      return f;
    });
    copyCount++;
  });

  document.getElementById('wt-cpbldg-modal').remove();
  wtWizSaveDraft();
  wtWizRefreshStep3();
  showToast('&#x1F3D7; Building copied to '+copyCount+' building'+(copyCount>1?'s':''),'success');
}

function wtWizBldgProgress() {
  var b=_wiz.buildings[_wiz.s3bldg]; if(!b) return '';
  var totalRooms=0, typedRooms=0;
  b.floors.forEach(function(f){
    totalRooms+=f.rooms.length;
    typedRooms+=f.rooms.filter(function(r){ return r.unitType; }).length;
  });
  if(!totalRooms) return '';
  var pct=Math.round(typedRooms/totalRooms*100);
  return '<div style="padding:10px 12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px">'+
    '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">'+
      '<span style="font-weight:700;color:#0d1b2a">'+escHtml(b.name)+' — '+totalRooms+' rooms across '+b.floors.length+' floor'+(b.floors.length>1?'s':'')+'</span>'+
      '<span style="font-weight:700;color:'+(pct===100?'#2e7d32':'#e65100')+'">'+typedRooms+'/'+totalRooms+' typed</span>'+
    '</div>'+
    '<div style="background:#e0e0e0;border-radius:3px;height:6px">'+
      '<div style="background:'+(pct===100?'#2e7d32':'#1565c0')+';height:6px;border-radius:3px;width:'+pct+'%;transition:width .3s"></div>'+
    '</div>'+
  '</div>';
}

// ─── STEP 4: SYSTEMS ─────────────────────────────────────────────────────────
function wtWizStep4() {
  var systems=[
    { id:'structured_wiring',  label:'Structured Wiring',  icon:'🔌', desc:'Cat6 outlets throughout' },
    { id:'wireless_ap',        label:'Wireless APs',        icon:'📡', desc:'PoE AP locations' },
    { id:'access_control',     label:'Access Control',      icon:'🚪', desc:'Readers, strikes, mag-locks' },
    { id:'deadbolts',          label:'Electronic Deadbolts',icon:'🔐', desc:'Tenant door deadbolts' },
    { id:'fiber_interbuilding',label:'Fiber Interbuilding', icon:'🔗', desc:'Building-to-MDF backbone' },
    { id:'clubhouse_av',       label:'Clubhouse AV',        icon:'🔊', desc:'Speakers, TV drops' },
    { id:'perimeter_cameras',  label:'Perimeter Cameras',   icon:'📷', desc:'Exterior cameras' },
    { id:'gate_access',        label:'Gate Access',         icon:'🏗',  desc:'Vehicle & pedestrian gates' },
  ];
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Systems</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Select all systems being installed. These determine which catalog items get generated per room.</p>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:24px">'+
      systems.map(function(s){
        var sel=_wiz.proj.systems.indexOf(s.id)>=0;
        return '<div onclick="var i=_wiz.proj.systems.indexOf(\''+s.id+'\');if(i>=0)_wiz.proj.systems.splice(i,1);else _wiz.proj.systems.push(\''+s.id+'\');this.style.border=\'2px solid \'+(i<0?\'#1565c0\':\'#e0e0e0\');this.style.background=\'\'+(i<0?\'#e3f2fd\':\'#fff\')" '+
          'style="padding:12px;border:2px solid '+(sel?'#1565c0':'#e0e0e0')+';border-radius:10px;cursor:pointer;background:'+(sel?'#e3f2fd':'#fff')+';display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:20px">'+s.icon+'</span>'+
          '<div><div style="font-size:13px;font-weight:700;color:#0d1b2a">'+s.label+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+s.desc+'</div></div></div>';
      }).join('')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between">'+
      '<button class="btn btn-outline" onclick="_wiz.step=3;wtShowWizard()">← Back</button>'+
      '<button class="btn btn-primary" onclick="wtWizNext(4)">Next → Review</button></div>';
}

// ─── STEP 5: REVIEW ───────────────────────────────────────────────────────────
function wtWizStep5() {
  var totalRooms=0, typedRooms=0, totalItems=0;
  var tmpls=wtGetTemplates();
  _wiz.buildings.forEach(function(b){
    b.floors.forEach(function(f){
      totalRooms+=f.rooms.length;
      f.rooms.forEach(function(r){
        if(r.unitType){ typedRooms++; }
        var tpl=r.unitType?tmpls.find(function(t){ return t.unit_type===r.unitType; }):null;
        if(tpl) totalItems+=(tpl.areas||[]).reduce(function(s,a){ return s+(a.items||[]).reduce(function(s2,i){ return s2+i.qty; },0); },0);
      });
    });
  });
  var untyped=totalRooms-typedRooms;
  return '<h4 style="margin:0 0 6px;font-size:16px;font-weight:800">Review & Create</h4>'+
    '<p style="font-size:13px;color:#546e7a;margin:0 0 16px">Confirm everything before the wizard generates your project.</p>'+
    // Project summary
    '<div class="card" style="background:#f9fbff;margin-bottom:12px">'+
      '<div style="font-size:16px;font-weight:800;color:#0d1b2a;margin-bottom:4px">'+escHtml(_wiz.proj.name)+'</div>'+
      (_wiz.proj.customerName?'<div style="font-size:13px;color:#546e7a">'+escHtml(_wiz.proj.customerName)+'</div>':'')+
    '</div>'+
    // Counts grid
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">'+
      [['🏗',_wiz.buildings.length,'Buildings'],['🏢',_wiz.buildings.reduce(function(s,b){ return s+b.floors.length; },0),'Floors'],['🚪',totalRooms,'Rooms'],['📋','~'+totalItems,'Items']].map(function(r){
        return '<div style="text-align:center;padding:12px;background:#fff;border:1px solid #e0e0e0;border-radius:8px">'+
          '<div style="font-size:11px;color:#546e7a">'+r[0]+' '+r[2]+'</div>'+
          '<div style="font-size:22px;font-weight:900;color:#0d1b2a">'+r[1]+'</div></div>';
      }).join('')+
    '</div>'+
    // Warnings
    (untyped>0
      ?'<div style="padding:12px;background:#fff3e0;border-left:4px solid #e65100;border-radius:8px;margin-bottom:12px;font-size:13px;color:#e65100">'+
          '⚠ <strong>'+untyped+' room'+(untyped>1?'s are':' is')+' untyped.</strong> Those rooms will be created without items. You can add them manually after setup.'+
        '</div>'
      :'')+
    // Building breakdown
    '<div style="margin-bottom:20px">'+
      _wiz.buildings.map(function(b){
        var bRooms=b.floors.reduce(function(s,f){ return s+f.rooms.length; },0);
        return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px">'+
          '<span style="font-weight:700">'+escHtml(b.name)+'</span>'+
          '<span style="color:#546e7a">'+b.floors.length+' floors &nbsp;·&nbsp; '+bRooms+' rooms</span></div>';
      }).join('')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between">'+
      '<button class="btn btn-outline" onclick="_wiz.step=4;wtShowWizard()">← Back</button>'+
      '<button class="btn btn-primary" id="wiz-create-btn" onclick="wtCreateProject()">🚀 Create Project</button></div>';
}

// ─── WIZARD NAVIGATION ────────────────────────────────────────────────────────
function wtWizNext(fromStep) {
  if (fromStep===1) {
    var name=(document.getElementById('wiz-name')||{}).value||'';
    if(!name.trim()){ showToast('Project name is required','warning'); return; }
    _wiz.proj.name=name.trim();
    _wiz.proj.jobId=(document.getElementById('wiz-job')||{}).value||'';
    _wiz.proj.customerName=(document.getElementById('wiz-cust')||{}).value||'';
  } else if (fromStep===2) {
    if(!_wiz.buildings.length){ showToast('Add at least one building','warning'); return; }
    // Ensure all buildings have at least one floor initialized
    _wiz.buildings.forEach(function(b){ if(!b.floors) b.floors=[]; });
  } else if (fromStep===3) {
    // Validate: at least ONE building must have rooms configured
    var anyRooms = _wiz.buildings.some(function(b){
      return b.floors && b.floors.some(function(f){ return f.rooms && f.rooms.length>0; });
    });
    if (!anyRooms) { showToast('Add rooms to at least one building before continuing','warning'); return; }
    // Warn (not block) about buildings with no rooms
    var empties = _wiz.buildings.filter(function(b){
      return !b.floors || !b.floors.length || !b.floors.some(function(f){ return f.rooms && f.rooms.length>0; });
    });
    if (empties.length) {
      var names = empties.map(function(b){ return '"'+b.name+'"'; }).join(', ');
      if (!confirm(names+' '+(empties.length>1?'have':'has')+' no rooms and will be created empty. Continue anyway?')) return;
    }
  }
  _wiz.step=fromStep+1;
  wtWizSaveDraft();
  var e=document.getElementById('wt-wizard-modal'); if(e) e.remove();
  wtShowWizard();
}

// ─── CREATE PROJECT ───────────────────────────────────────────────────────────
async function wtCreateProject() {
  var btn=document.getElementById('wiz-create-btn');
  if(btn){ btn.disabled=true; btn.textContent='Creating…'; }
  try {
    if(!_sb) throw new Error('Not connected to Supabase');
    var tmpls=wtGetTemplates();
    // 1. Create project
    var { data:proj, error:pe } = await _sb.from('wt_projects').insert({
      name:_wiz.proj.name, job_id:_wiz.proj.jobId||null,
      customer_name:_wiz.proj.customerName||null,
      structure_type:_wiz.proj.structureType,
      systems:_wiz.proj.systems, status:'active',
      created_by:wtCurrentUserId(), created_by_name:wtCurrentUserName(),
    }).select().single();
    if(pe) throw pe;

    WT.data[proj.id]={ buildings:[], floors:[], rooms:[], items:[], checkoffs:[], reworks:[], flags:[] };
    var d=WT.data[proj.id];

    // 2. Buildings → Floors → Rooms → Items
    for(var bi=0;bi<_wiz.buildings.length;bi++){
      var wb=_wiz.buildings[bi];
      var { data:bRec, error:be }=await _sb.from('wt_buildings').insert({
        project_id:proj.id, name:wb.name, building_type:wb.type, sort_order:bi
      }).select().single();
      if(be) throw be;
      d.buildings.push(bRec);

      for(var fi=0;fi<(wb.floors||[]).length;fi++){
        var wf=wb.floors[fi];
        var { data:fRec, error:fe }=await _sb.from('wt_floors').insert({
          building_id:bRec.id, project_id:proj.id,
          name:wf.name, floor_number:wf.floorNum||fi+1, sort_order:fi
        }).select().single();
        if(fe) throw fe;
        d.floors.push(fRec);

        if(!wf.rooms||!wf.rooms.length) continue;

        // Batch insert rooms
        var roomIns=wf.rooms.map(function(r,ri){
          return { floor_id:fRec.id, building_id:bRec.id, project_id:proj.id,
            name:r.number||('Room '+(ri+1)), room_number:r.number||null,
            unit_type:r.unitType||null, sort_order:ri };
        });
        var { data:roomRecs, error:re }=await _sb.from('wt_rooms').insert(roomIns).select();
        if(re) throw re;
        d.rooms.push.apply(d.rooms,roomRecs);

        // Generate items from templates
        var itemIns=[];
        for(var ri2=0;ri2<wf.rooms.length;ri2++){
          var wr=wf.rooms[ri2], rRec=roomRecs[ri2];
          if(!wr.unitType) continue;
          var tpl=tmpls.find(function(t){ return t.unit_type===wr.unitType; });
          if(!tpl) continue;
          var sort=0;
          (tpl.areas||[]).forEach(function(area){
            (area.items||[]).forEach(function(ai){
              var ci=wtCatalogItem(ai.catalog_id); if(!ci) return;
              for(var q=0;q<(ai.qty||1);q++){
                itemIns.push({
                  room_id:rRec.id, building_id:bRec.id, project_id:proj.id,
                  name:ci.name+(ai.qty>1?' #'+(q+1):'')+' — '+area.name,
                  category:ci.category, item_type:ci.item_type,
                  cable_count:ci.cable_count||0, cable_types:ci.cable_types||[],
                  outlet_type:ci.outlet_type||null,
                  phases_required:['rough_in','rough_in_verify','devicing','testing','final_verify'],
                  sort_order:sort++,
                });
              }
            });
          });
        }
        // Insert items in batches of 100
        for(var chunk=0;chunk<itemIns.length;chunk+=100){
          var batch=itemIns.slice(chunk,chunk+100);
          var { data:iRecs, error:ie }=await _sb.from('wt_items').insert(batch).select();
          if(ie) throw ie;
          d.items.push.apply(d.items,iRecs);
        }
      }
    }

    // 3. Save to local DB
    if(!DB.wtProjects) DB.wtProjects=[];
    DB.wtProjects.unshift(proj);
    saveDB();
    wtWizClearDraft();

    document.getElementById('wt-wizard-modal').remove();
    WT.proj=proj; WT.view='dashboard';
    wtScrollTop();
    showToast('✅ "'+proj.name+'" created — '+d.rooms.length+' rooms, '+d.items.length+' items','success');
    wtRenderDashboard();

  } catch(e) {
    console.error('wtCreateProject error:',e);
    showToast('Error: '+(e.message||String(e)),'error');
    if(btn){ btn.disabled=false; btn.textContent='🚀 Create Project'; }
  }
}

// Legacy shim
function wtGenerateRoomItems(room, bldgId, projId, systems) { return []; }




// ─── ROOM ITEM PICKER ─────────────────────────────────────────────────────────
// Full catalog browser with quantity controls for any room
var _wtPicker = { roomId:null, bldgId:null, sel:{}, catFilter:'all', search:'' };

function wtOpenItemPicker(roomId, bldgId) {
  _wtPicker = { roomId:roomId, bldgId:bldgId, sel:{}, catFilter:'all', search:'' };
  var d = wtProjData();
  var room = (d.rooms||[]).find(function(r){ return r.id===roomId; });
  var roomName = room ? room.name : 'Room';

  var html = '<div class="modal-overlay open" id="wt-picker-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:680px;max-height:92vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<div>'+
          '<h3 style="margin:0">+ Add Items</h3>'+
          '<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+escHtml(roomName)+'</div>'+
        '</div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-picker-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      // Filter bar
      '<div style="padding:10px 16px;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap">'+
        '<div style="display:flex;gap:4px">'+
          ['all','outlet','device','backbone'].map(function(cat){
            var labels = {all:'All',outlet:'Outlets',device:'Devices',backbone:'Backbone'};
            var active = _wtPicker.catFilter===cat;
            return '<button onclick="wtPickerFilter(\''+cat+'\')" '+
              'style="padding:5px 12px;font-size:12px;font-weight:700;border:2px solid '+(active?'#1565c0':'#e0e0e0')+';border-radius:20px;background:'+(active?'#1565c0':'#fff')+';color:'+(active?'#fff':'#546e7a')+';cursor:pointer">'+
              labels[cat]+'</button>';
          }).join('')+
        '</div>'+
        '<input id="wt-picker-search" placeholder="&#x1F50D; Search..." oninput="wtPickerSearch(this.value)" '+
          'style="flex:1;min-width:120px;padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px">'+
      '</div>'+
      // Catalog list
      '<div id="wt-picker-list" style="overflow-y:auto;flex:1;padding:8px 0">'+
        wtPickerListHtml()+
      '</div>'+
      // Selection summary + add button
      '<div id="wt-picker-footer" style="padding:14px 16px;border-top:1px solid #e0e0e0;flex-shrink:0">'+
        wtPickerFooterHtml()+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-picker-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtPickerListHtml() {
  var catalog = wtGetCatalog();
  var filtered = catalog.filter(function(item){
    if (_wtPicker.catFilter !== 'all' && item.category !== _wtPicker.catFilter) return false;
    if (_wtPicker.search && item.name.toLowerCase().indexOf(_wtPicker.search.toLowerCase()) < 0) return false;
    return true;
  });
  if (!filtered.length) return '<div style="text-align:center;padding:40px;color:#90a4ae">No items match your filter.</div>';

  // Group by category
  var groups = {outlet:[],device:[],backbone:[],infrastructure:[],other:[]};
  filtered.forEach(function(item){ (groups[item.category]||groups.other).push(item); });
  var catLabels = {outlet:'Outlets & Faceplates',device:'Devices',backbone:'Backbone',infrastructure:'Infrastructure',other:'Other'};
  var catColors = {outlet:'#1565c0',device:'#2e7d32',backbone:'#7b1fa2',infrastructure:'#e65100',other:'#546e7a'};

  return Object.keys(groups).filter(function(k){ return groups[k].length>0; }).map(function(cat){
    return '<div>'+
      '<div style="padding:8px 16px 4px;font-size:10px;font-weight:800;color:'+catColors[cat]+';text-transform:uppercase;letter-spacing:.8px;background:#fafafa;border-bottom:1px solid #f0f0f0">'+
        catLabels[cat]+
      '</div>'+
      groups[cat].map(function(item){
        var qty = _wtPicker.sel[item.id] || 0;
        var selected = qty > 0;
        var cables = (item.cable_types||[]).join(', ');
        var itype = WT_ITEM_TYPES[item.item_type]||WT_ITEM_TYPES.other;
        return '<div id="wt-pick-row-'+item.id+'" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f5f5f5;background:'+(selected?'#e8f5e9':'#fff')+';transition:background .1s">'+
          '<span style="font-size:20px;flex-shrink:0">'+itype.icon+'</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:'+(selected?'700':'500')+';color:#0d1b2a">'+escHtml(item.name)+'</div>'+
            '<div style="font-size:11px;color:#90a4ae">'+
              (item.cable_count?item.cable_count+'× ':'')+(cables?escHtml(cables):'')+(item.outlet_type?' · '+item.outlet_type.replace('_',' '):'')+
            '</div>'+
          '</div>'+
          // Quantity controls
          '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'+
            '<button onclick="wtPickerDecr(\''+item.id+'\')" '+
              'style="width:28px;height:28px;border:1px solid '+(selected?'#2e7d32':'#e0e0e0')+';border-radius:6px;background:'+(selected?'#e8f5e9':'#fff')+';color:'+(selected?'#2e7d32':'#90a4ae')+';font-size:16px;cursor:pointer;font-weight:700;line-height:1">&#x2212;</button>'+
            '<span id="wt-pick-qty-'+item.id+'" style="min-width:28px;text-align:center;font-size:15px;font-weight:700;color:'+(selected?'#2e7d32':'#90a4ae')+'">'+qty+'</span>'+
            '<button onclick="wtPickerIncr(\''+item.id+'\')" '+
              'style="width:28px;height:28px;border:1px solid '+(selected?'#2e7d32':'#e0e0e0')+';border-radius:6px;background:'+(selected?'#2e7d32':'#fff')+';color:'+(selected?'#fff':'#546e7a')+';font-size:16px;cursor:pointer;font-weight:700;line-height:1">+</button>'+
          '</div>'+
        '</div>';
      }).join('')+
    '</div>';
  }).join('');
}

function wtPickerFooterHtml() {
  var totalQty = Object.values(_wtPicker.sel).reduce(function(s,q){ return s+q; }, 0);
  var summaryItems = Object.keys(_wtPicker.sel).filter(function(id){ return _wtPicker.sel[id]>0; });
  var summary = summaryItems.length
    ? summaryItems.map(function(id){
        var ci = wtCatalogItem(id);
        return (ci?escHtml(ci.name):'?')+' &times;'+_wtPicker.sel[id];
      }).join('&nbsp; · &nbsp;')
    : '<span style="color:#90a4ae">No items selected — use + buttons above</span>';

  return '<div style="font-size:12px;color:#546e7a;margin-bottom:10px;min-height:16px">'+summary+'</div>'+
    '<button class="btn btn-primary" style="width:100%;font-size:15px;padding:12px" '+
      (totalQty===0?'disabled style="width:100%;font-size:15px;padding:12px;opacity:.5;cursor:not-allowed"':'')+
      ' onclick="wtPickerAddItems()">'+
      (totalQty>0?'Add '+totalQty+' Item'+(totalQty>1?'s':'')+' to Room':'Select items above')+
    '</button>';
}

function wtPickerIncr(itemId) {
  _wtPicker.sel[itemId] = (_wtPicker.sel[itemId]||0) + 1;
  wtPickerRefreshRow(itemId);
  wtPickerRefreshFooter();
}

function wtPickerDecr(itemId) {
  var cur = _wtPicker.sel[itemId]||0;
  if (cur <= 0) return;
  _wtPicker.sel[itemId] = cur - 1;
  if (_wtPicker.sel[itemId] === 0) delete _wtPicker.sel[itemId];
  wtPickerRefreshRow(itemId);
  wtPickerRefreshFooter();
}

function wtPickerRefreshRow(itemId) {
  var row = document.getElementById('wt-pick-row-'+itemId);
  var qtyEl = document.getElementById('wt-pick-qty-'+itemId);
  if (!row || !qtyEl) return;
  var qty = _wtPicker.sel[itemId]||0;
  var sel = qty > 0;
  row.style.background = sel ? '#e8f5e9' : '#fff';
  qtyEl.textContent = qty;
  qtyEl.style.color = sel ? '#2e7d32' : '#90a4ae';
  var btns = row.querySelectorAll('button');
  // minus button
  if (btns[0]) {
    btns[0].style.borderColor = sel ? '#2e7d32' : '#e0e0e0';
    btns[0].style.background  = sel ? '#e8f5e9' : '#fff';
    btns[0].style.color       = sel ? '#2e7d32' : '#90a4ae';
  }
  // plus button
  if (btns[1]) {
    btns[1].style.borderColor = sel ? '#2e7d32' : '#e0e0e0';
    btns[1].style.background  = sel ? '#2e7d32' : '#fff';
    btns[1].style.color       = sel ? '#fff'    : '#546e7a';
  }
  // name bold
  var nameEl = row.querySelector('div > div:first-child');
  if (nameEl) nameEl.style.fontWeight = sel ? '700' : '500';
}

function wtPickerRefreshFooter() {
  var el = document.getElementById('wt-picker-footer');
  if (el) el.innerHTML = wtPickerFooterHtml();
}

function wtPickerFilter(cat) {
  _wtPicker.catFilter = cat;
  var el = document.getElementById('wt-picker-list');
  if (el) el.innerHTML = wtPickerListHtml();
  // Re-style filter buttons
  document.querySelectorAll('#wt-picker-modal button[onclick^="wtPickerFilter"]').forEach(function(b){
    var bCat = b.getAttribute('onclick').match(/'([^']+)'/)[1];
    var active = bCat === cat;
    b.style.border = '2px solid '+(active?'#1565c0':'#e0e0e0');
    b.style.background = active?'#1565c0':'#fff';
    b.style.color = active?'#fff':'#546e7a';
  });
}

function wtPickerSearch(val) {
  _wtPicker.search = val;
  var el = document.getElementById('wt-picker-list');
  if (el) el.innerHTML = wtPickerListHtml();
}

async function wtPickerAddItems() {
  var selected = Object.keys(_wtPicker.sel).filter(function(id){ return _wtPicker.sel[id]>0; });
  if (!selected.length) return;

  var d = wtProjData();
  var sortStart = (d.items||[]).filter(function(i){ return i.room_id===_wtPicker.roomId; }).length;
  var inserts = [];

  selected.forEach(function(catalogId){
    var ci = wtCatalogItem(catalogId);
    if (!ci) return;
    var qty = _wtPicker.sel[catalogId];
    for (var q=0; q<qty; q++) {
      inserts.push({
        room_id:     _wtPicker.roomId,
        building_id: _wtPicker.bldgId,
        project_id:  WT.proj.id,
        name:        ci.name + (qty>1 ? ' #'+(q+1) : ''),
        category:    ci.category,
        item_type:   ci.item_type,
        cable_count: ci.cable_count||0,
        cable_types: ci.cable_types||[],
        outlet_type: ci.outlet_type||null,
        phases_required: ['rough_in','rough_in_verify','devicing','testing','final_verify'],
        sort_order:  sortStart + inserts.length,
      });
    }
  });

  var btn = document.querySelector('#wt-picker-footer .btn-primary');
  if (btn) { btn.disabled=true; btn.textContent='Adding...'; }

  try {
    var { data:newItems, error } = await _sb.from('wt_items').insert(inserts).select();
    if (error) throw error;
    if (WT.data[WT.proj.id]) WT.data[WT.proj.id].items.push.apply(WT.data[WT.proj.id].items, newItems);
    document.getElementById('wt-picker-modal').remove();
    wtRenderRoomView();
    showToast('&#x2705; '+inserts.length+' item'+(inserts.length>1?'s':'')+' added to room','success');
  } catch(e) {
    showToast('Error: '+e.message,'error');
    if (btn) { btn.disabled=false; btn.textContent='Add '+inserts.length+' Items to Room'; }
  }
}


// ─── EDIT / DELETE LAYER ──────────────────────────────────────────────────────
async function wtEditProject() {
  if (!WT.proj) return;
  var name = prompt('Project name:', WT.proj.name);
  if (!name || !name.trim()) return;
  var cust = prompt('Customer name:', WT.proj.customer_name||'');
  try {
    await _sb.from('wt_projects').update({ name:name.trim(), customer_name:cust||null, updated_at:new Date().toISOString() }).eq('id',WT.proj.id);
    WT.proj.name = name.trim(); WT.proj.customer_name = cust||null;
    var idx = (DB.wtProjects||[]).findIndex(function(p){ return p.id===WT.proj.id; });
    if (idx>=0) { DB.wtProjects[idx].name=name.trim(); DB.wtProjects[idx].customer_name=cust||null; saveDB(); }
    wtRenderDashboard();
    showToast('Project updated','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtEditBuilding(bldgId) {
  var d = wtProjData();
  var b = (d.buildings||[]).find(function(x){ return x.id===bldgId; });
  if (!b) return;
  var name = prompt('Building name:', b.name);
  if (!name || !name.trim()) return;
  try {
    await _sb.from('wt_buildings').update({ name:name.trim() }).eq('id',bldgId);
    b.name = name.trim();
    wtRenderBuildingView();
    showToast('Building renamed','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtDeleteBuilding(bldgId) {
  var d = wtProjData();
  var b = (d.buildings||[]).find(function(x){ return x.id===bldgId; });
  if (!b) return;
  if (!confirm('Delete "'+b.name+'" and ALL its floors, rooms, and items? This cannot be undone.')) return;
  try {
    await _sb.from('wt_buildings').delete().eq('id',bldgId);
    WT.data[WT.proj.id].buildings = d.buildings.filter(function(x){ return x.id!==bldgId; });
    WT.data[WT.proj.id].floors    = (d.floors||[]).filter(function(x){ return x.building_id!==bldgId; });
    WT.data[WT.proj.id].rooms     = (d.rooms||[]).filter(function(x){ return x.building_id!==bldgId; });
    WT.data[WT.proj.id].items     = (d.items||[]).filter(function(x){ return x.building_id!==bldgId; });
    wtNav('dashboard');
    showToast('Building deleted','info');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtEditFloor(floorId) {
  var d = wtProjData();
  var f = (d.floors||[]).find(function(x){ return x.id===floorId; });
  if (!f) return;
  var name = prompt('Floor name:', f.name);
  if (!name || !name.trim()) return;
  try {
    await _sb.from('wt_floors').update({ name:name.trim() }).eq('id',floorId);
    f.name = name.trim();
    wtRenderBuildingView();
    showToast('Floor renamed','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtDeleteFloor(floorId) {
  var d = wtProjData();
  var f = (d.floors||[]).find(function(x){ return x.id===floorId; });
  if (!f) return;
  if (!confirm('Delete "'+f.name+'" and all its rooms and items?')) return;
  try {
    await _sb.from('wt_floors').delete().eq('id',floorId);
    WT.data[WT.proj.id].floors = (d.floors||[]).filter(function(x){ return x.id!==floorId; });
    WT.data[WT.proj.id].rooms  = (d.rooms||[]).filter(function(x){ return x.floor_id!==floorId; });
    var roomIds = new Set((d.rooms||[]).filter(function(r){ return r.floor_id===floorId; }).map(function(r){ return r.id; }));
    WT.data[WT.proj.id].items  = (d.items||[]).filter(function(x){ return !roomIds.has(x.room_id); });
    wtRenderBuildingView();
    showToast('Floor deleted','info');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtEditRoom(roomId) {
  var d = wtProjData();
  var r = (d.rooms||[]).find(function(x){ return x.id===roomId; });
  if (!r) return;
  var name = prompt('Room name / number:', r.name);
  if (!name || !name.trim()) return;
  var utype = prompt('Unit type (1BR/2BR/3BR/4BR/Studio/Common/Other):', r.unit_type||'');
  try {
    await _sb.from('wt_rooms').update({ name:name.trim(), room_number:name.trim(), unit_type:utype||null }).eq('id',roomId);
    r.name = name.trim(); r.room_number = name.trim(); r.unit_type = utype||null;
    wtRenderFloorView();
    showToast('Room updated','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtDeleteRoom(roomId) {
  var d = wtProjData();
  var r = (d.rooms||[]).find(function(x){ return x.id===roomId; });
  if (!r || !confirm('Delete room "'+r.name+'" and all its items?')) return;
  try {
    await _sb.from('wt_rooms').delete().eq('id',roomId);
    WT.data[WT.proj.id].rooms = (d.rooms||[]).filter(function(x){ return x.id!==roomId; });
    WT.data[WT.proj.id].items = (d.items||[]).filter(function(x){ return x.room_id!==roomId; });
    wtRenderFloorView();
    showToast('Room deleted','info');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtEditItem(itemId) {
  var d = wtProjData();
  var item = (d.items||[]).find(function(x){ return x.id===itemId; });
  if (!item) return;
  var name = prompt('Item name:', item.name);
  if (!name || !name.trim()) return;
  try {
    await _sb.from('wt_items').update({ name:name.trim(), updated_at:new Date().toISOString() }).eq('id',itemId);
    item.name = name.trim();
    wtRenderRoomView();
    showToast('Item updated','success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

async function wtDeleteItem(itemId) {
  var d = wtProjData();
  var item = (d.items||[]).find(function(x){ return x.id===itemId; });
  if (!item || !confirm('Delete item "'+item.name+'"?')) return;
  try {
    await _sb.from('wt_items').delete().eq('id',itemId);
    WT.data[WT.proj.id].items     = (d.items||[]).filter(function(x){ return x.id!==itemId; });
    WT.data[WT.proj.id].checkoffs = (d.checkoffs||[]).filter(function(x){ return x.item_id!==itemId; });
    wtRenderRoomView();
    showToast('Item deleted','info');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

// ─── PROJECT LIST — UPDATED (adds Catalog + Template buttons) ─────────────────
function wtRenderProjectList() {
  var el = document.getElementById('wt-main'); if (!el) return;
  var projects = DB.wtProjects || [];
  el.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">'+
      '<h2 style="margin:0;font-size:22px;font-weight:800;color:#0d1b2a">✅ Work Tracking</h2>'+
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
        '<span id="wt-online-badge" style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;background:#f5f5f5"></span>'+
        '<button class="btn btn-outline btn-sm" onclick="wtOpenCatalogManager()">🔌 Item Catalog</button>'+
        '<button class="btn btn-outline btn-sm" onclick="wtOpenTemplateManager()">📋 Room Templates</button>'+
        '<button class="btn btn-primary" onclick="openNewProjectWizard()">+ New Project</button>'+
      '</div>'+
    '</div>'+
    (!projects.length
      ? '<div class="card" style="text-align:center;padding:60px 20px;color:#90a4ae">'+
          '<div style="font-size:48px;margin-bottom:16px">🏗</div>'+
          '<div style="font-size:18px;font-weight:700;margin-bottom:8px">No projects yet</div>'+
          '<div style="font-size:14px;margin-bottom:24px">Build your first project with the guided wizard — it generates every room and item automatically.</div>'+
          '<button class="btn btn-primary" onclick="openNewProjectWizard()">+ Create First Project</button>'+
        '</div>'
      : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">'+
          projects.map(wtProjectCard).join('')+
        '</div>'
    );
  wtUpdateOnlineBadge();
}

// ─── UPDATED DASHBOARD (adds Edit button) ─────────────────────────────────────
function wtRenderDashboard() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'dashboard';
  var p = WT.proj; if (!p) return;
  var d = wtProjData();
  var buildings = d.buildings || [];

  el.innerHTML =
    wtBreadcrumb()+
    '<div class="card" style="margin-bottom:16px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'+
        '<div>'+
          '<div style="font-size:20px;font-weight:800;color:#0d1b2a">'+escHtml(p.name)+'</div>'+
          (p.customer_name?'<div style="font-size:13px;color:#546e7a">'+escHtml(p.customer_name)+'</div>':'')+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button class="btn btn-outline btn-sm" onclick="wtEditProject()">✏ Edit</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtNav(\'field\')">📱 Field View</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtNav(\'confirm\')">✅ Confirm</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtNav(\'reworks\')">🔄 Reworks</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtNav(\'flags\')">🚩 Flags</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtNav(\'reports\')">📈 Reports</button>'+
          '<button class="btn btn-primary btn-sm" onclick="wtAddBuilding()">+ Building</button>'+
        '</div>'+
      '</div>'+
      '<div style="margin-top:16px;display:flex;gap:6px">'+
        WT_PHASES.map(function(ph){
          var pct = wtPhasePct(ph.id, null);
          return '<div style="flex:1;min-width:0">'+
            '<div style="font-size:10px;font-weight:700;color:'+ph.color+';margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+ph.short+'</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:10px">'+
              '<div style="background:'+ph.color+';height:10px;border-radius:3px;width:'+pct+'%"></div>'+
            '</div>'+
            '<div style="font-size:10px;color:#546e7a;margin-top:2px">'+pct+'%</div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:4px;margin-bottom:16px">'+
      ['heatmap','table','day'].map(function(t){
        return '<button onclick="wtDashTab(\''+t+'\')" style="padding:7px 16px;font-size:12px;font-weight:600;border:2px solid '+(WT.dashTab===t?'#1565c0':'#e0e0e0')+';border-radius:8px;background:'+(WT.dashTab===t?'#1565c0':'#fff')+';color:'+(WT.dashTab===t?'#fff':'#546e7a')+';cursor:pointer">'+
          {heatmap:'🔥 Heatmap',table:'📊 Phase Table',day:'📅 Day Drill'}[t]+
        '</button>';
      }).join('')+
    '</div>'+
    '<div id="wt-dash-content">'+wtRenderDashContent()+'</div>';
}

// ─── UPDATED BUILDING VIEW (adds edit/delete buttons) ─────────────────────────
function wtRenderBuildingView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'building';
  var d = wtProjData();
  var b = (d.buildings||[]).find(function(x){ return x.id===WT.bldgId; });
  if (!b) { wtNav('dashboard'); return; }
  var floors = (d.floors||[]).filter(function(f){ return f.building_id===b.id; });
  var items  = (d.items||[]).filter(function(i){ return i.building_id===b.id; });

  el.innerHTML = wtBreadcrumb()+
    '<div class="card" style="margin-bottom:16px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'+
        '<div>'+
          '<div style="font-size:20px;font-weight:800;color:#0d1b2a">'+escHtml(b.name)+'</div>'+
          '<div style="font-size:12px;color:#546e7a">'+floors.length+' floors · '+items.length+' items · '+wtBuildingPct(b.id)+'% complete</div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button class="btn btn-outline btn-sm" onclick="wtEditBuilding(\''+b.id+'\')">✏ Rename</button>'+
          '<button class="btn btn-outline btn-sm" style="color:#c62828;border-color:#ffcdd2" onclick="wtDeleteBuilding(\''+b.id+'\')">🗑 Delete</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtAddFloor(\''+b.id+'\')">+ Floor</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtOpenDuplicateBuildingModal(\''+b.id+'\')" style="color:#1565c0;border-color:#1565c0">&#x2398; Duplicate</button>'+
          '<button class="btn btn-primary btn-sm" onclick="wtSaveBuildingTemplate(\''+b.id+'\')">💾 Save Template</button>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px">'+
        WT_PHASES.map(function(ph){
          var pct = wtPhasePct(ph.id, b.id);
          return '<div style="flex:1;min-width:0">'+
            '<div style="font-size:10px;font-weight:700;color:'+ph.color+';margin-bottom:3px">'+ph.short+'</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:8px"><div style="background:'+ph.color+';height:8px;border-radius:3px;width:'+pct+'%"></div></div>'+
            '<div style="font-size:10px;color:#546e7a;margin-top:2px">'+pct+'%</div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>'+
    (floors.length
      ? floors.map(function(f){
          var fRooms = (d.rooms||[]).filter(function(r){ return r.floor_id===f.id; });
          var fItems = (d.items||[]).filter(function(i){ return fRooms.some(function(r){ return r.id===i.room_id; }); });
          var fPct   = fItems.length ? Math.round(fItems.filter(function(i){ return wtItemPct(i)===100; }).length/fItems.length*100) : 0;
          return '<div class="card" style="margin-bottom:10px;border-left:3px solid #1565c0">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'+
              '<div style="cursor:pointer;flex:1" onclick="wtNavFloor(\''+f.id+'\')">'+
                '<div style="font-size:15px;font-weight:700;color:#0d1b2a">'+escHtml(f.name)+'</div>'+
                '<div style="font-size:12px;color:#546e7a">'+fRooms.length+' rooms · '+fItems.length+' items</div>'+
              '</div>'+
              '<div style="display:flex;align-items:center;gap:8px">'+
                '<div style="text-align:right;cursor:pointer" onclick="wtNavFloor(\''+f.id+'\')">'+
                  '<div style="font-size:20px;font-weight:800;color:#1565c0">'+fPct+'%</div>'+
                  '<div style="font-size:10px;color:#90a4ae">complete</div>'+
                '</div>'+
                '<button onclick="wtQuickAddRoom(\''+f.id+'\',\''+f.building_id+'\')" style="padding:4px 10px;font-size:11px;border:1px solid #2e7d32;border-radius:6px;background:#e8f5e9;color:#2e7d32;cursor:pointer;font-weight:700">+ Room</button>'+
                '<button onclick="wtEditFloor(\''+f.id+'\')" style="padding:4px 8px;font-size:11px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;cursor:pointer">✏</button>'+
                '<button onclick="wtDeleteFloor(\''+f.id+'\')" style="padding:4px 8px;font-size:11px;border:1px solid #ffcdd2;border-radius:6px;background:#fff;color:#c62828;cursor:pointer">🗑</button>'+
              '</div>'+
            '</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:5px;margin-top:8px">'+
              '<div style="background:#1565c0;height:5px;border-radius:3px;width:'+fPct+'%"></div></div>'+
          '</div>';
        }).join('')
      : '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No floors yet.</div>'
    );
}

// ─── UPDATED FLOOR VIEW (adds edit/delete on rooms) ───────────────────────────
function wtRenderFloorView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'floor';
  var d = wtProjData();
  var f = (d.floors||[]).find(function(x){ return x.id===WT.floorId; });
  if (!f) { wtNavBuilding(WT.bldgId); return; }
  WT.bldgId = f.building_id;
  var rooms = (d.rooms||[]).filter(function(r){ return r.floor_id===f.id; });

  el.innerHTML = wtBreadcrumb()+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+
      '<h3 style="margin:0;font-size:18px;font-weight:800;color:#0d1b2a">'+escHtml(f.name)+'</h3>'+
      '<div style="display:flex;gap:8px">'+
        '<button class="btn btn-outline btn-sm" onclick="wtOpenRenumberTool(\''+f.id+'\')" style="color:#6a1b9a;border-color:#ce93d8">&#x2116; Renumber</button>'+
        '<button class="btn btn-outline btn-sm" onclick="wtAddRoom(\''+f.id+'\',\''+f.building_id+'\')" >+ Add Room</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px">'+
      rooms.map(function(r){
        var rItems = (d.items||[]).filter(function(i){ return i.room_id===r.id; });
        var pct = rItems.length ? Math.round(rItems.reduce(function(s,i){ return s+wtItemPct(i); },0)/rItems.length) : 0;
        var col = pct===100?'#2e7d32':pct>0?'#1565c0':'#90a4ae';
        return '<div class="card" style="border-top:3px solid '+col+';padding:14px;position:relative">'+
          '<div style="position:absolute;top:8px;right:8px;display:flex;gap:4px">'+
            '<button onclick="event.stopPropagation();wtEditRoom(\''+r.id+'\')" style="padding:2px 6px;font-size:10px;border:1px solid #e0e0e0;border-radius:4px;background:#fff;cursor:pointer">✏</button>'+
            '<button onclick="event.stopPropagation();wtDeleteRoom(\''+r.id+'\')" style="padding:2px 6px;font-size:10px;border:1px solid #ffcdd2;border-radius:4px;background:#fff;color:#c62828;cursor:pointer">🗑</button>'+
          '</div>'+
          '<div style="cursor:pointer" onclick="wtNavRoom(\''+r.id+'\')">'+
            '<div style="font-size:14px;font-weight:800;color:#0d1b2a;margin-bottom:2px;padding-right:40px">'+escHtml(r.name)+'</div>'+
            (r.unit_type?'<div style="font-size:11px;color:#546e7a;margin-bottom:8px">'+escHtml(r.unit_type)+'</div>':'')+
            '<div style="font-size:22px;font-weight:900;color:'+col+'">'+pct+'%</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:4px;margin:4px 0">'+
              '<div style="background:'+col+';height:4px;border-radius:3px;width:'+pct+'%"></div></div>'+
            '<div style="font-size:11px;color:#90a4ae">'+rItems.length+' items</div>'+
          '</div>'+
        '</div>';
      }).join('')+
      '<div class="card" style="cursor:pointer;border:2px dashed #e0e0e0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;color:#90a4ae;min-height:100px" '+
        'onclick="wtAddRoom(\''+f.id+'\',\''+f.building_id+'\')" onmouseenter="this.style.borderColor=\'#1565c0\';this.style.color=\'#1565c0\'" onmouseleave="this.style.borderColor=\'#e0e0e0\';this.style.color=\'#90a4ae\'">'+
        '<div style="font-size:24px">+</div><div style="font-size:12px;font-weight:600">Add Room</div>'+
      '</div>'+
    '</div>';
}

// ─── UPDATED ROOM VIEW (adds edit/delete on items) ────────────────────────────
function wtRenderRoomView() {
  var el = document.getElementById('wt-main'); if (!el) return;
  WT.view = 'room';
  var d = wtProjData();
  var r = (d.rooms||[]).find(function(x){ return x.id===WT.roomId; });
  if (!r) { wtNavFloor(WT.floorId); return; }
  WT.bldgId = r.building_id; WT.floorId = r.floor_id;
  var items = (d.items||[]).filter(function(i){ return i.room_id===r.id; });
  var rPct = items.length ? Math.round(items.reduce(function(s,i){ return s+wtItemPct(i); },0)/items.length) : 0;

  el.innerHTML = wtBreadcrumb()+
    '<div class="card" style="margin-bottom:16px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'+
        '<div>'+
          '<div style="font-size:20px;font-weight:800;color:#0d1b2a">'+escHtml(r.name)+'</div>'+
          (r.unit_type?'<div style="font-size:12px;color:#546e7a">'+escHtml(r.unit_type)+' · '+items.length+' items</div>':'')+
        '</div>'+
        '<div style="display:flex;gap:8px">'+
          '<button class="btn btn-outline btn-sm" onclick="wtEditRoom(\''+r.id+'\')">✏ Edit Room</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtAddItem(\''+r.id+'\',\''+r.building_id+'\')">+ Add Items</button>'+
          '<button class="btn btn-outline btn-sm" onclick="wtAddFlag(null,\''+r.id+'\')">🚩 Flag</button>'+
        '</div>'+
      '</div>'+
      '<div style="margin-top:8px;background:#e0e0e0;border-radius:4px;height:8px">'+
        '<div style="background:'+(rPct===100?'#2e7d32':'#1565c0')+';height:8px;border-radius:4px;width:'+rPct+'%"></div>'+
      '</div>'+
    '</div>'+
    items.map(function(item){ return wtItemChecklistCard(item, d); }).join('')+
    (!items.length?'<div class="card" style="text-align:center;padding:60px 20px;color:#90a4ae">'+
    '<div style="font-size:36px;margin-bottom:12px">&#x1F4CB;</div>'+
    '<div style="font-size:15px;font-weight:700;margin-bottom:8px;color:#546e7a">No items yet</div>'+
    '<div style="font-size:13px;margin-bottom:20px">Open your catalog and select what belongs in this room.</div>'+
    '<button class="btn btn-primary" onclick="wtOpenItemPicker(\''+r.id+'\',\''+r.building_id+'\')" >&#x1F4CB; Add Items from Catalog</button>'+
    '</div>':'');
}

// ─── UPDATED ITEM CHECKLIST CARD (adds edit/delete) ───────────────────────────
function wtItemChecklistCard(item, d) {
  var phases = item.phases_required || ['rough_in','rough_in_verify','devicing','testing','final_verify'];
  var pct    = wtItemPct(item);
  var itype  = WT_ITEM_TYPES[item.item_type] || WT_ITEM_TYPES.other;

  return '<div class="card" style="margin-bottom:10px">'+
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">'+
      '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">'+
        '<span style="font-size:18px;flex-shrink:0">'+itype.icon+'</span>'+
        '<div style="min-width:0">'+
          '<div style="font-size:14px;font-weight:700;color:#0d1b2a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(item.name)+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+itype.label+
            (item.cable_count?' · '+item.cable_count+'× '+(item.cable_types||[]).join(','): '')+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'+
        '<span style="font-size:16px;font-weight:800;color:'+(pct===100?'#2e7d32':pct>0?'#1565c0':'#90a4ae')+'">'+pct+'%</span>'+
        '<button onclick="wtEditItem(\''+item.id+'\')" style="padding:3px 7px;font-size:10px;border:1px solid #e0e0e0;border-radius:4px;background:#fff;cursor:pointer">✏</button>'+
        '<button onclick="wtDeleteItem(\''+item.id+'\')" style="padding:3px 7px;font-size:10px;border:1px solid #ffcdd2;border-radius:4px;background:#fff;color:#c62828;cursor:pointer">🗑</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:4px;flex-wrap:nowrap">'+
      phases.map(function(phId){
        var ph = WT_PHASES.find(function(x){ return x.id===phId; }) || {};
        var co = wtGetCheckoff(item.id, phId);
        var st = co ? co.status : 'pending';
        var bg = st==='confirmed'?ph.color:st==='complete'?ph.bg:'#f5f5f5';
        var clr= st==='confirmed'?'#fff':st==='complete'?ph.color:'#90a4ae';
        var icon=st==='confirmed'?'✅':st==='complete'?'⏳':st==='rejected'?'❌':'';
        return '<button onclick="openWTCheckoffModal(\''+item.id+'\',\''+phId+'\')" '+
          'style="flex:1;min-width:0;padding:7px 2px;border:2px solid '+(st==='pending'?'#e0e0e0':ph.color)+';border-radius:8px;background:'+bg+';color:'+clr+';font-size:10px;font-weight:700;cursor:pointer;text-align:center;line-height:1.2">'+
          (icon?icon+' ':'')+escHtml(ph.short||phId)+
          (co&&Array.isArray(co.checked_by)&&co.checked_by.length?'<div style="font-size:8px;margin-top:1px;opacity:.8">'+co.checked_by.map(function(t){ return (t.user_name||'').split(' ')[0]; }).join('+')+'</div>':'')+
        '</button>';
      }).join('')+
    '</div>'+
  '</div>';
}


// ─── DUPLICATE BUILDING ───────────────────────────────────────────────────────
function wtOpenDuplicateBuildingModal(bldgId) {
  var d = wtProjData();
  var src = (d.buildings||[]).find(function(b){ return b.id===bldgId; });
  if (!src) return;

  // Auto-suggest next name
  var suggestName = (function(){
    var m = src.name.match(/^(.*?)(\d+)(\s*)$/);
    if (m) {
      var nums = (d.buildings||[]).map(function(b){
        var bm = b.name.match(/^(.*?)(\d+)(\s*)$/);
        return bm && bm[1]===m[1] ? parseInt(bm[2]) : 0;
      });
      return m[1] + (Math.max.apply(null,nums)+1) + m[3];
    }
    return src.name + ' (copy)';
  })();

  var types = wtGetBuildingTypes();
  var typeOpts = types.map(function(t){
    return '<option value="'+t.id+'"'+(t.id===src.building_type?' selected':'')+'>'+escHtml(t.label)+'</option>';
  }).join('');

  var srcFloors  = (d.floors||[]).filter(function(f){ return f.building_id===bldgId; });
  var srcRooms   = (d.rooms||[]).filter(function(r){ return r.building_id===bldgId; });
  var srcItems   = (d.items||[]).filter(function(i){ return i.building_id===bldgId; });

  var html = '<div class="modal-overlay open" id="wt-dup-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head"><h3>&#x2398; Duplicate Building</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-dup-modal\').remove()">&#x2715;</button></div>'+
      '<div class="modal-body">'+
        '<div style="padding:12px;background:#e3f2fd;border-radius:8px;margin-bottom:16px;font-size:13px;color:#1565c0">'+
          'Copies all floors, rooms, and items from <strong>'+escHtml(src.name)+'</strong>.<br>'+
          '<span style="font-size:11px">'+srcFloors.length+' floors &nbsp;·&nbsp; '+srcRooms.length+' rooms &nbsp;·&nbsp; '+srcItems.length+' items &nbsp;·&nbsp; Room numbers carry over &nbsp;·&nbsp; No check-off history copied.</span>'+
        '</div>'+
        '<div style="margin-bottom:14px"><label class="wiz-label">NEW BUILDING NAME</label>'+
          '<input id="dup-name" class="form-control" value="'+escHtml(suggestName)+'"></div>'+
        '<div style="margin-bottom:20px"><label class="wiz-label">TYPE</label>'+
          '<select id="dup-type" class="form-control">'+typeOpts+'</select></div>'+
        '<button class="btn btn-primary" style="width:100%" id="dup-btn" onclick="wtDuplicateBuilding(\''+bldgId+'\')">&#x2398; Duplicate Building</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-dup-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var el=document.getElementById('dup-name'); if(el){el.focus();el.select();} },100);
}

async function wtDuplicateBuilding(srcBldgId) {
  var name = (document.getElementById('dup-name')||{}).value||'';
  var type = (document.getElementById('dup-type')||{}).value||'residential';
  if (!name.trim()) { showToast('Name is required','warning'); return; }

  var btn = document.getElementById('dup-btn');
  if (btn) { btn.disabled=true; btn.textContent='Duplicating...'; }

  var d = wtProjData();
  var srcFloors = (d.floors||[]).filter(function(f){ return f.building_id===srcBldgId; });

  try {
    // 1 — Create new building
    var { data:newBldg, error:be } = await _sb.from('wt_buildings').insert({
      project_id: WT.proj.id, name: name.trim(),
      building_type: type, sort_order: (d.buildings||[]).length
    }).select().single();
    if (be) throw be;
    d.buildings.push(newBldg);

    // 2 — Duplicate each floor
    for (var fi=0; fi<srcFloors.length; fi++) {
      var srcFl = srcFloors[fi];
      var { data:newFl, error:fe } = await _sb.from('wt_floors').insert({
        building_id: newBldg.id, project_id: WT.proj.id,
        name: srcFl.name, floor_number: srcFl.floor_number, sort_order: srcFl.sort_order
      }).select().single();
      if (fe) throw fe;
      d.floors.push(newFl);

      // 3 — Duplicate rooms (same names = same numbers)
      var srcRooms = (d.rooms||[]).filter(function(r){ return r.floor_id===srcFl.id; })
        .sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });

      if (!srcRooms.length) continue;

      var roomInserts = srcRooms.map(function(r){
        return { floor_id:newFl.id, building_id:newBldg.id, project_id:WT.proj.id,
          name:r.name, room_number:r.room_number||r.name, unit_type:r.unit_type, sort_order:r.sort_order };
      });

      var { data:newRooms, error:re } = await _sb.from('wt_rooms').insert(roomInserts).select();
      if (re) throw re;
      d.rooms.push.apply(d.rooms, newRooms);

      // 4 — Duplicate items (no check-offs)
      var itemInserts = [];
      for (var ri=0; ri<srcRooms.length; ri++) {
        var srcItems = (d.items||[]).filter(function(i){ return i.room_id===srcRooms[ri].id; })
          .sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); });
        srcItems.forEach(function(item){
          itemInserts.push({
            room_id:newRooms[ri].id, building_id:newBldg.id, project_id:WT.proj.id,
            name:item.name, category:item.category, item_type:item.item_type,
            cable_count:item.cable_count||0, cable_types:item.cable_types||[],
            outlet_type:item.outlet_type||null, device_model:item.device_model||null,
            device_serial:item.device_serial||null, source_location:item.source_location||null,
            dest_location:item.dest_location||null,
            phases_required:item.phases_required||['rough_in','rough_in_verify','devicing','testing','final_verify'],
            photo_required_phases:item.photo_required_phases||[],
            sort_order:item.sort_order||0
          });
        });
      }

      // Batch insert items in chunks of 100
      for (var chunk=0; chunk<itemInserts.length; chunk+=100) {
        var batch = itemInserts.slice(chunk, chunk+100);
        var { data:newItems, error:ie } = await _sb.from('wt_items').insert(batch).select();
        if (ie) throw ie;
        d.items.push.apply(d.items, newItems);
      }
    }

    var modal = document.getElementById('wt-dup-modal'); if(modal) modal.remove();
    wtRenderDashboard();
    showToast('&#x2398; "'+name.trim()+'" created — '+d.rooms.filter(function(r){ return r.building_id===newBldg.id; }).length+' rooms, '+d.items.filter(function(i){ return i.building_id===newBldg.id; }).length+' items','success');

  } catch(e) {
    showToast('Error: '+e.message,'error');
    if(btn){ btn.disabled=false; btn.textContent='&#x2398; Duplicate Building'; }
  }
}

// ─── FLOOR RENUMBER TOOL ─────────────────────────────────────────────────────
var _wtRn = { floorId:null, rooms:[], dragSrc:-1 };

function wtOpenRenumberTool(floorId) {
  var d = wtProjData();
  var fl = (d.floors||[]).find(function(f){ return f.id===floorId; });
  if (!fl) return;

  _wtRn.floorId = floorId;
  _wtRn.dragSrc = -1;
  _wtRn.rooms = (d.rooms||[])
    .filter(function(r){ return r.floor_id===floorId; })
    .sort(function(a,b){ return (a.sort_order||0)-(b.sort_order||0); })
    .map(function(r){ return { id:r.id, currentName:r.name, newName:r.name }; });

  var html = '<div class="modal-overlay open" id="wt-rn-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:620px;max-height:92vh">'+
      '<div class="modal-head">'+
        '<div><h3>&#x2116; Renumber Rooms</h3>'+
          '<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+escHtml(fl.name)+' &mdash; '+_wtRn.rooms.length+' rooms</div>'+
        '</div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-rn-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      // Pattern bar
      '<div style="padding:14px 22px;background:#f5f7fa;border-bottom:1px solid #e0e0e0">'+
        '<div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Auto-Pattern Generator</div>'+
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'+
          '<div><label style="font-size:11px;color:#546e7a;display:block;margin-bottom:3px">Prefix</label>'+
            '<input id="rn-prefix" class="form-control" style="width:80px" placeholder="e.g. A-"></div>'+
          '<div><label style="font-size:11px;color:#546e7a;display:block;margin-bottom:3px">Start #</label>'+
            '<input id="rn-start" type="number" class="form-control" style="width:70px;text-align:center" value="1"></div>'+
          '<div><label style="font-size:11px;color:#546e7a;display:block;margin-bottom:3px">Digits</label>'+
            '<select id="rn-digits" class="form-control" style="width:100px">'+
              '<option value="0">None (1,2...)</option>'+
              '<option value="2" selected>2-digit (01...)</option>'+
              '<option value="3">3-digit (001...)</option>'+
            '</select></div>'+
          '<div><label style="font-size:11px;color:#546e7a;display:block;margin-bottom:3px">Suffix</label>'+
            '<input id="rn-suffix" class="form-control" style="width:70px" placeholder="e.g. B"></div>'+
          '<div style="padding-bottom:1px">'+
            '<button onclick="wtRnApplyPattern()" class="btn btn-outline btn-sm" style="white-space:nowrap">&#x21BB; Apply Pattern</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
      // Room list
      '<div class="modal-body" style="overflow-y:auto;max-height:calc(92vh-260px);padding:0">'+
        '<div style="display:grid;grid-template-columns:36px 1fr 1fr;gap:0;font-size:11px;font-weight:700;color:#546e7a;padding:10px 16px;border-bottom:2px solid #e0e0e0;background:#fafafa">'+
          '<span></span><span>CURRENT</span><span>NEW NUMBER</span>'+
        '</div>'+
        '<div id="wt-rn-list">'+wtRnRenderRows()+'</div>'+
      '</div>'+
      '<div style="padding:14px 22px;border-top:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center">'+
        '<button class="btn btn-outline" onclick="document.getElementById(\'wt-rn-modal\').remove()">Cancel</button>'+
        '<button class="btn btn-primary" onclick="wtApplyRenumber()">Apply Changes ('+_wtRn.rooms.length+' rooms)</button>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-rn-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function wtRnRenderRows() {
  return _wtRn.rooms.map(function(r, i){
    var changed = r.newName !== r.currentName;
    return '<div draggable="true" id="rn-row-'+i+'" '+
      'ondragstart="wtRnDragStart('+i+')" '+
      'ondragover="event.preventDefault();wtRnDragOver('+i+')" '+
      'ondragend="wtRnDragEnd()" '+
      'style="display:grid;grid-template-columns:36px 1fr 1fr;gap:0;align-items:center;'+
        'padding:8px 16px;border-bottom:1px solid #f0f0f0;'+
        'background:'+(changed?'#fff8e1':'#fff')+';cursor:grab;'+
        'transition:background .15s">'+
      '<span style="font-size:18px;color:#90a4ae;cursor:grab;user-select:none" title="Drag to reorder">&#8942;</span>'+
      '<span style="font-size:13px;color:#546e7a;font-weight:500">'+escHtml(r.currentName)+'</span>'+
      '<div style="padding-right:8px">'+
        '<input value="'+escHtml(r.newName)+'" oninput="_wtRn.rooms['+i+'].newName=this.value;wtRnRefreshChanged()" '+
          'style="width:100%;padding:6px 8px;border:1px solid '+(changed?'#f57c00':'#e0e0e0')+';border-radius:6px;font-size:13px;font-weight:'+(changed?'700':'400')+';'+
          'color:'+(changed?'#e65100':'#0d1b2a')+';box-sizing:border-box">'+
      '</div>'+
    '</div>';
  }).join('');
}

function wtRnRefreshChanged() {
  // Re-color rows without full re-render to avoid losing focus
  _wtRn.rooms.forEach(function(r, i){
    var row = document.getElementById('rn-row-'+i);
    if (!row) return;
    var changed = r.newName !== r.currentName;
    row.style.background = changed ? '#fff8e1' : '#fff';
    var inp = row.querySelector('input');
    if (inp) {
      inp.style.border = '1px solid '+(changed?'#f57c00':'#e0e0e0');
      inp.style.fontWeight = changed?'700':'400';
      inp.style.color = changed?'#e65100':'#0d1b2a';
    }
  });
}

function wtRnDragStart(i) {
  _wtRn.dragSrc = i;
  var row = document.getElementById('rn-row-'+i);
  if (row) row.style.opacity = '0.4';
}

function wtRnDragOver(i) {
  if (_wtRn.dragSrc < 0 || _wtRn.dragSrc === i) return;
  var item = _wtRn.rooms.splice(_wtRn.dragSrc, 1)[0];
  _wtRn.rooms.splice(i, 0, item);
  _wtRn.dragSrc = i;
  var el = document.getElementById('wt-rn-list');
  if (el) el.innerHTML = wtRnRenderRows();
  // Restore opacity on the moved row
  var row = document.getElementById('rn-row-'+i);
  if (row) row.style.opacity = '0.4';
}

function wtRnDragEnd() {
  _wtRn.dragSrc = -1;
  var el = document.getElementById('wt-rn-list');
  if (el) el.innerHTML = wtRnRenderRows();
}

function wtRnRefreshList() {
  var el = document.getElementById('wt-rn-list');
  if (el) el.innerHTML = wtRnRenderRows();
}

function wtRnApplyPattern() {
  var prefix = (document.getElementById('rn-prefix')||{}).value||'';
  var suffix = (document.getElementById('rn-suffix')||{}).value||'';
  var start  = parseInt((document.getElementById('rn-start')||{}).value)||1;
  var digits = parseInt((document.getElementById('rn-digits')||{}).value)||2;
  _wtRn.rooms.forEach(function(r, i){
    var num    = start + i;
    var numStr = digits > 0 ? String(num).padStart(digits,'0') : String(num);
    r.newName  = prefix + numStr + suffix;
  });
  wtRnRefreshList();
}

async function wtApplyRenumber() {
  var changed = _wtRn.rooms.filter(function(r){ return r.newName.trim() && r.newName !== r.currentName; });
  if (!changed.length && _wtRn.rooms.every(function(r,i){ return (r.sort_order||i)===i; })) {
    showToast('No changes to apply','info');
    return;
  }

  var btn = document.querySelector('#wt-rn-modal .btn-primary');
  if (btn) { btn.disabled=true; btn.textContent='Saving...'; }

  try {
    // Update each room — name + sort_order
    for (var i=0; i<_wtRn.rooms.length; i++) {
      var r = _wtRn.rooms[i];
      var newName = r.newName.trim() || r.currentName;
      var { error } = await _sb.from('wt_rooms').update({
        name: newName, room_number: newName, sort_order: i
      }).eq('id', r.id);
      if (error) throw error;
      // Update local cache
      var cached = (WT.data[WT.proj.id].rooms||[]).find(function(x){ return x.id===r.id; });
      if (cached) { cached.name=newName; cached.room_number=newName; cached.sort_order=i; }
    }
    var modal = document.getElementById('wt-rn-modal'); if(modal) modal.remove();
    wtRenderFloorView();
    showToast('&#x2116; '+_wtRn.rooms.length+' rooms renumbered','success');
  } catch(e) {
    showToast('Error: '+e.message,'error');
    if(btn){ btn.disabled=false; btn.textContent='Apply Changes ('+_wtRn.rooms.length+' rooms)'; }
  }
}

// Quick-add room from building view (without navigating to floor)
function wtQuickAddRoom(floorId, buildingId) {
  var d = wtProjData();
  var fl = (d.floors||[]).find(function(f){ return f.id===floorId; });
  if (!fl) return;

  var html = '<div class="modal-overlay open" id="wt-qaroom-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm">'+
      '<div class="modal-head">'+
        '<div><h3>+ Add Room</h3>'+
          '<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+escHtml(fl.name)+'</div>'+
        '</div>'+
        '<button class="btn-icon" onclick="document.getElementById(\'wt-qaroom-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div class="modal-body">'+
        '<div style="margin-bottom:12px"><label class="wiz-label">ROOM NAME / NUMBER *</label>'+
          '<input id="qar-name" class="form-control" placeholder="e.g. 101, Unit 204B, Suite 300"></div>'+
        '<div style="margin-bottom:20px"><label class="wiz-label">UNIT TYPE</label>'+
          '<select id="qar-utype" class="form-control">'+
            '<option value="">— Select —</option>'+
            WT_UNIT_TYPES.map(function(t){ return '<option value="'+t+'">'+t+'</option>'; }).join('')+
          '</select></div>'+
        '<div style="display:flex;gap:8px">'+
          '<button class="btn btn-outline" style="flex:1" onclick="document.getElementById(\'wt-qaroom-modal\').remove()">Cancel</button>'+
          '<button class="btn btn-primary" style="flex:1" onclick="wtSubmitQuickAddRoom(\''+floorId+'\',\''+buildingId+'\')">Add Room</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
  '</div>';
  var e=document.getElementById('wt-qaroom-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){ var el=document.getElementById('qar-name'); if(el) el.focus(); },100);
}

async function wtSubmitQuickAddRoom(floorId, buildingId) {
  var name  = (document.getElementById('qar-name')||{}).value||'';
  var utype = (document.getElementById('qar-utype')||{}).value||null;
  if (!name.trim()) { showToast('Room name is required','warning'); return; }
  var modal = document.getElementById('wt-qaroom-modal'); if(modal) modal.remove();
  try {
    var d = wtProjData();
    var sortOrder = (d.rooms||[]).filter(function(r){ return r.floor_id===floorId; }).length;
    var { data, error } = await _sb.from('wt_rooms').insert({
      floor_id:floorId, building_id:buildingId, project_id:WT.proj.id,
      name:name.trim(), room_number:name.trim(), unit_type:utype||null, sort_order:sortOrder
    }).select().single();
    if (error) throw error;
    if (WT.data[WT.proj.id]) WT.data[WT.proj.id].rooms.push(data);
    // Refresh current view
    if (WT.view==='building') wtRenderBuildingView();
    else if (WT.view==='floor') wtRenderFloorView();
    showToast('Room added: '+name.trim(),'success');
  } catch(e) { showToast('Error: '+e.message,'error'); }
}


// ─── CSS HELPER (injected once) ───────────────────────────────────────────────
(function() {
  if (document.getElementById('wt-v2-styles')) return;
  var style = document.createElement('style');
  style.id = 'wt-v2-styles';
  style.textContent = '.wiz-label{font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.3px}';
  document.head.appendChild(style);
})();

// ─── PAGE INIT (shims) ────────────────────────────────────────────────────────
function renderWTProjectCards() { wtRenderProjectList(); }
function loadWTProject(id)       { if(id) wtOpenProject(id); }
function switchWTView(v) {
  var map = { structure:'dashboard', field:'field', progress:'dashboard', confirm:'confirm', reports:'reports', reworks:'reworks' };
  wtNav(map[v]||v);
}
function renderWTConfirmView()   { wtRenderConfirmView(); }
function renderWTFieldView()     { wtRenderFieldView(); }
function renderWTProgressView()  { wtRenderDashboard(); }
function renderWTReworksView()   { wtRenderReworksView(); }
function renderWTReport(t)       { wtNav('reports'); setTimeout(function(){ wtShowReport(t); }, 100); }
function openAddBuildingModal()  { wtAddBuilding(); }
function confirmCheckoff(id)     {}
function reopenCheckoff(id)      {}
function confirmAllVisible()     { wtConfirmAllVisible(); }
function openReworkFromItem(id)  { wtOpenReworkModal(id); }
function openAddReworkModal()    { wtOpenReworkModal(null); }
function saveRework()            { wtSaveRework(); }
function renderMiniPhaseBar()    { return ''; }
function renderWTPhaseBar()      {}
function renderWTStructureView() { wtRenderDashboard(); }
function renderWTBuilding()      {}
function toggleWTBuilding()      {}
function renderWTFieldItem()     {}
function openCheckoffModal(i,p)  { openWTCheckoffModal(i,p); }
function submitWTCheckoff()      { wtSubmitCheckoff(); }
function onCoPhotoSelected(i)    { wtAddCheckoffPhotos(i); }
function bulkCompleteRoom()      {}
function printQRLabels()         { showToast('QR labels — coming soon','info'); }

// ─── INDEX.HTML PAGE ENTRY POINT ──────────────────────────────────────────────
// <div id="wt-main"></div>  ← sole mount point; this module populates it

// ============================================================
// END WORK TRACKING MODULE
// ============================================================

// ============================================================
// END WORK TRACKING MODULE
// ============================================================
// ============================================================
var _absenceStep = 1;
var _absenceData = {};

function openAbsenceModal() {
  _absenceStep = 1;
  _absenceData = {};
  // Populate team datalist
  var dl = document.getElementById('abs-team-list');
  if (dl) dl.innerHTML = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  // Pre-fill name if logged in
  var nameEl = document.getElementById('abs-name');
  if (nameEl && _currentUser) nameEl.value = _currentUser.full_name||'';
  // Reset all steps
  [1,2,3,4].forEach(function(n){
    var s = document.getElementById('abs-step-'+n);
    if (s) s.style.display = n===1 ? 'block' : 'none';
    var dot = document.getElementById('abs-step-dot-'+n);
    if (dot) { dot.style.background = n===1?'#1565c0':'#e0e0e0'; dot.style.color = n===1?'#fff':'#90a4ae'; }
  });
  // Reset selections
  document.querySelectorAll('.abs-reason-btn,.abs-dur-btn,.abs-cov-btn').forEach(function(b){ b.classList.remove('selected'); });
  ['abs-reason-val','abs-reason-label','abs-duration-val','abs-coverage-val'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var det = document.getElementById('abs-details'); if(det) det.value='';
  var dd = document.getElementById('abs-duration-detail'); if(dd){ dd.value=''; dd.style.display='none'; }
  // Button state
  var back = document.getElementById('abs-back-btn'); if(back) back.style.display='none';
  var next = document.getElementById('abs-next-btn'); if(next) next.textContent='Next →';
  var cancel = document.getElementById('abs-cancel-btn'); if(cancel) cancel.style.display='inline-flex';
  openModal('modal-absence');
}

function absenceStepNext() {
  // Validate current step
  if (_absenceStep === 1) {
    var name = ((document.getElementById('abs-name')||{}).value||'').trim();
    var reason = (document.getElementById('abs-reason-val')||{}).value||'';
    if (!name)   { showToast('Please enter your name','error'); return; }
    if (!reason) { showToast('Please select a reason','error'); return; }
    _absenceData.name   = name;
    _absenceData.reason = reason;
    _absenceData.reasonLabel = (document.getElementById('abs-reason-label')||{}).value||reason;
  }
  else if (_absenceStep === 2) {
    var dur = (document.getElementById('abs-duration-val')||{}).value||'';
    if (!dur) { showToast('Please select how long you\'ll be out','error'); return; }
    _absenceData.duration = dur;
    _absenceData.durationDetail = ((document.getElementById('abs-duration-detail')||{}).value||'').trim();
  }
  else if (_absenceStep === 3) {
    var cov = (document.getElementById('abs-coverage-val')||{}).value||'';
    if (!cov) { showToast('Please select your leave coverage','error'); return; }
    _absenceData.coverage = cov;
    _absenceData.details  = ((document.getElementById('abs-details')||{}).value||'').trim();
  }
  else if (_absenceStep === 4) {
    submitAbsence();
    return;
  }

  _absenceStep++;
  showAbsenceStep(_absenceStep);
}

function absenceStepBack() {
  if (_absenceStep <= 1) return;
  _absenceStep--;
  showAbsenceStep(_absenceStep);
}

function showAbsenceStep(step) {
  [1,2,3,4].forEach(function(n){
    var s = document.getElementById('abs-step-'+n);
    if (s) s.style.display = n===step ? 'block' : 'none';
    var dot = document.getElementById('abs-step-dot-'+n);
    if (dot) {
      if (n < step)  { dot.style.background='#2e7d32'; dot.style.color='#fff'; dot.textContent='✓'; }
      else if (n===step){ dot.style.background='#1565c0'; dot.style.color='#fff'; dot.textContent=String(n); }
      else           { dot.style.background='#e0e0e0'; dot.style.color='#90a4ae'; dot.textContent=String(n); }
    }
  });
  var back = document.getElementById('abs-back-btn'); if(back) back.style.display = step>1?'inline-flex':'none';
  var next = document.getElementById('abs-next-btn');
  if (next) next.textContent = step===4 ? '🚨 Submit Absence Report' : 'Next →';

  // Build confirm summary on step 4
  if (step === 4) {
    var now = new Date();
    var isLate = now.getHours() > 5 || (now.getHours()===5 && now.getMinutes()>=30);
    var timeStr = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    var durLabels = {today:'Today only',today_tomorrow:'Today and tomorrow',unsure:'Not sure — will update',multiple:'Multiple days'};
    var covLabels = {pto:'Using PTO',vacation:'Using Vacation',makeup:'Will make up time',unpaid:'Unpaid'};
    var summary = document.getElementById('abs-confirm-summary');
    if (summary) {
      summary.innerHTML =
        '<div style="margin-bottom:6px"><strong>'+escHtml(_absenceData.name)+'</strong> is reporting an absence</div>'+
        '<div>📋 <strong>Reason:</strong> '+escHtml(_absenceData.reasonLabel)+'</div>'+
        '<div>⏱ <strong>Duration:</strong> '+escHtml(durLabels[_absenceData.duration]||_absenceData.duration)+(_absenceData.durationDetail?' — '+escHtml(_absenceData.durationDetail):'')+'</div>'+
        '<div>💰 <strong>Coverage:</strong> '+escHtml(covLabels[_absenceData.coverage]||_absenceData.coverage)+'</div>'+
        (_absenceData.details?'<div style="margin-top:6px;padding-top:6px;border-top:1px solid #ffcdd2">📝 '+escHtml(_absenceData.details)+'</div>':'')+
        '<div style="margin-top:8px;font-size:11px;color:#90a4ae">Submitted at '+timeStr+'</div>';
    }
    var lateWarn = document.getElementById('abs-late-warning');
    if (lateWarn) lateWarn.style.display = isLate ? 'block' : 'none';
    _absenceData.isLate = isLate;
    _absenceData.submittedAt = now.toISOString();
  }
}

function selectAbsReason(val, label) {
  document.querySelectorAll('.abs-reason-btn').forEach(function(b){ b.classList.remove('selected'); });
  event.currentTarget.classList.add('selected');
  var v = document.getElementById('abs-reason-val'); if(v) v.value=val;
  var l = document.getElementById('abs-reason-label'); if(l) l.value=label;
}

function selectAbsDuration(val, label) {
  document.querySelectorAll('.abs-dur-btn').forEach(function(b){ b.classList.remove('selected'); });
  event.currentTarget.classList.add('selected');
  var v = document.getElementById('abs-duration-val'); if(v) v.value=val;
  var det = document.getElementById('abs-duration-detail');
  if (det) det.style.display = val==='multiple' ? 'block' : 'none';
}

function selectAbsCoverage(val, label) {
  document.querySelectorAll('.abs-cov-btn').forEach(function(b){ b.classList.remove('selected'); });
  event.currentTarget.classList.add('selected');
  var v = document.getElementById('abs-coverage-val'); if(v) v.value=val;
}

function submitAbsence() {
  var record = {
    id:           'abs-'+Date.now(),
    techName:     _absenceData.name,
    reason:       _absenceData.reason,
    reasonLabel:  _absenceData.reasonLabel,
    duration:     _absenceData.duration,
    durationDetail: _absenceData.durationDetail||'',
    coverage:     _absenceData.coverage,
    details:      _absenceData.details||'',
    isLate:       _absenceData.isLate,
    submittedAt:  _absenceData.submittedAt||new Date().toISOString(),
    date:         new Date().toISOString().split('T')[0],
    status:       'reported',
    alertSent:    false  // will be true once Twilio is wired
  };

  if (!DB.absences) DB.absences=[];
  DB.absences.push(record);
  saveDB();

  // SEND ALERTS — stubbed, ready for Twilio wiring
  sendAbsenceAlert(record);

  closeModal('modal-absence');

  // Show confirmation on field page
  var statusEl = document.getElementById('field-absence-status');
  if (statusEl) {
    statusEl.innerHTML =
      '<div style="background:#e8f5e9;border-radius:8px;padding:10px 12px;font-size:12px;color:#2e7d32;font-weight:700">'+
        '✓ Absence reported at '+new Date(record.submittedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})+
        (record.isLate?' <span style="color:#e65100">(Late notice)</span>':'')+
      '</div>';
  }

  showToast('Absence reported — your manager has been notified','success',5000);
}

function sendAbsenceAlert(record) {
  // TWILIO STUB — replace with Supabase Edge Function call when ready
  // The edge function will:
  //   1. Send SMS to critical list (Joe + dispatcher)
  //   2. Send email to Joe + 4 others
  // Message format:
  //   TCSS [LATE NOTICE if late] — HH:MMam
  //   {name} is OUT today — {reason}
  //   Duration: {duration}
  //   Coverage: {coverage}
  //   Notes: {details if any}
  //   Submitted: {time}
  console.log('[ABSENCE ALERT STUB] Would send SMS+email for:', record.techName, record.reasonLabel, record.isLate?'LATE':'on time');
  // When Twilio is ready, call:
  // await supabase.functions.invoke('send-absence-alert', { body: record });
}

// ---- ABSENCE DASHBOARD (back office) ----
function renderAbsenceDashboard() {
  var el = document.getElementById('dash-absence-alerts'); if(!el) return;
  var today = new Date().toISOString().split('T')[0];
  var todayAbs = (DB.absences||[]).filter(function(a){ return a.date===today; });
  if (!todayAbs.length) { el.style.display='none'; return; }
  el.style.display='block';
  el.innerHTML =
    '<div style="background:#ffebee;border:2px solid #ffcdd2;border-radius:12px;padding:14px;margin-bottom:14px">'+
      '<div style="font-weight:800;font-size:14px;color:#c62828;margin-bottom:10px">🚨 '+todayAbs.length+' Absence Report'+(todayAbs.length>1?'s':'')+' Today</div>'+
      todayAbs.map(function(a){
        var covLabels={pto:'PTO',vacation:'Vacation',makeup:'Make up',unpaid:'Unpaid'};
        var durLabels={today:'Today only',today_tomorrow:'2 days',unsure:'Duration TBD',multiple:a.durationDetail||'Multiple days'};
        return '<div style="background:#fff;border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid #ffcdd2">'+
          '<div style="display:flex;align-items:center;justify-content:space-between">'+
            '<div style="font-weight:700;font-size:13px">'+escHtml(a.techName)+'</div>'+
            (a.isLate?'<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">⚠ Late notice</span>':
                      '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">On time</span>')+
          '</div>'+
          '<div style="font-size:12px;color:#546e7a;margin-top:4px">'+
            escHtml(a.reasonLabel)+' · '+escHtml(durLabels[a.duration]||a.duration)+' · '+escHtml(covLabels[a.coverage]||a.coverage)+
          '</div>'+
          (a.details?'<div style="font-size:11px;color:#546e7a;margin-top:4px;font-style:italic">'+escHtml(a.details)+'</div>':'')+
          '<div style="font-size:10px;color:#90a4ae;margin-top:4px">Reported '+new Date(a.submittedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true})+'</div>'+
        '</div>';
      }).join('')+
    '</div>';
}

// ============================================================
// END ABSENCE REPORTING
// ============================================================
var _offlineQueue = [];
var _isOnline = navigator.onLine;

window.addEventListener('online',  function(){ _isOnline=true;  checkOfflineStatus(); flushOfflineQueue(); });
window.addEventListener('offline', function(){ _isOnline=false; checkOfflineStatus(); });

function checkOfflineStatus() {
  var banner = document.getElementById('offline-banner');
  var countEl = document.getElementById('offline-queue-count');
  if (!banner) return;
  var queue = loadOfflineQueue();
  banner.style.display = (!_isOnline || queue.length > 0) ? 'block' : 'none';
  if (countEl) countEl.textContent = queue.length > 0 ? queue.length+' event(s) pending sync' : (_isOnline ? 'Back online — syncing...' : '');
}

function loadOfflineQueue() {
  try { return JSON.parse(localStorage.getItem('tcss_offline_queue')||'[]'); } catch(e){ return []; }
}

function saveOfflineQueue(q) {
  try { localStorage.setItem('tcss_offline_queue', JSON.stringify(q)); } catch(e){}
}

function queueOfflineEvent(eventData) {
  var q = loadOfflineQueue();
  q.push(Object.assign({}, eventData, {queuedAt: new Date().toISOString()}));
  saveOfflineQueue(q);
  checkOfflineStatus();
}

async function flushOfflineQueue() {
  if (!_sb || !_currentUser || !_isOnline) return;
  var q = loadOfflineQueue();
  if (!q.length) return;
  showToast('Syncing '+q.length+' offline events...', 'info', 3000);
  var failed = [];
  for (var i=0; i<q.length; i++) {
    var ev = q[i];
    try {
      await _sb.from('time_events').insert({
        user_id: _currentUser.id,
        user_name: _currentUser.full_name,
        event_type: ev.type,
        job_id: ev.jobId||null,
        job_name: ev.jobName||null,
        lat: ev.lat||null,
        lng: ev.lng||null,
        accuracy: ev.accuracy||null,
        timestamp: ev.timestamp||ev.queuedAt,
        note: ev.note||'Offline sync'
      });
    } catch(e) {
      failed.push(ev);
    }
  }
  saveOfflineQueue(failed);
  checkOfflineStatus();
  if (!failed.length) showToast('All offline events synced ✓', 'success');
  else showToast(failed.length+' events failed to sync — will retry', 'warning', 4000);
}

// Override logTimeEvent to queue when offline
var _origLogTimeEvent = logTimeEvent;
async function logTimeEvent(type,lat,lng,acc,note){
  if (!_isOnline) {
    queueOfflineEvent({type:type,lat:lat,lng:lng,accuracy:acc,note:note,jobId:_clockState.jobId,jobName:_clockState.jobName,timestamp:new Date().toISOString()});
    return;
  }
  return _origLogTimeEvent(type,lat,lng,acc,note);
}

// ============================================================
// CLOCK-IN REMINDER
// ============================================================
var _clockInReminderInterval = null;

function startClockInReminder() {
  clearInterval(_clockInReminderInterval);
  var reminderTime = DB.settings && DB.settings.clockInReminderTime;
  if (!reminderTime) return; // not configured
  _clockInReminderInterval = setInterval(function(){
    if (_clockState.status !== 'out') { clearInterval(_clockInReminderInterval); return; }
    var now = new Date();
    var parts = reminderTime.split(':');
    var rH = parseInt(parts[0]), rM = parseInt(parts[1])||0;
    if (now.getHours() === rH && now.getMinutes() === rM) {
      showToast('⏰ Reminder: You haven\'t started your day yet!', 'warning', 8000);
      // Show on field page if visible
      var geo = document.getElementById('geo-alert');
      if (geo) { geo.innerHTML='⏰ You haven\'t clocked in yet today. Tap Start Day when you arrive at base.'; geo.style.display='block'; }
      clearInterval(_clockInReminderInterval);
    }
  }, 60000);
}

// ============================================================
// PTO/VACATION BALANCE DEDUCTION
// ============================================================
function getLeaveBalance(techName, type) {
  // Accrued from pay periods
  var tech = (DB.team||[]).find(function(m){ return m.name===techName; });
  var hireDate = tech && tech.hireDate ? new Date(tech.hireDate) : null;
  var now = new Date();
  var yearStart = new Date(now.getFullYear(), 0, 1);
  var ppElapsed = Math.floor((now-yearStart)/(1000*60*60*24*14));

  var accrued = 0;
  if (type==='vacation') {
    var yearsWorked = hireDate ? (now-hireDate)/(1000*60*60*24*365.25) : 0;
    var vacTier = yearsWorked>=10?15:yearsWorked>=2?10:yearsWorked>=1?5:0;
    accrued = Math.round(vacTier*8/26*ppElapsed*10)/10;
  } else if (type==='pto') {
    var ptoEligible = hireDate && (now-hireDate)/(1000*60*60*24)>=90;
    accrued = ptoEligible ? Math.round(20/26*ppElapsed*10)/10 : 0;
  }

  // Subtract used hours from approved requests this year
  var used = (DB.timeOffRequests||[]).filter(function(r){
    return r.techName===techName && r.type===type && r.status==='approved' &&
           r.startDate && r.startDate.startsWith(String(now.getFullYear()));
  }).reduce(function(s,r){ return s+(r.hours||0); }, 0);

  return Math.max(0, accrued - used);
}

// Update leave balances display to use real deducted balance
function getLeaveBalanceDisplay(techName) {
  var vac = getLeaveBalance(techName, 'vacation');
  var pto = getLeaveBalance(techName, 'pto');
  return {vacAccrued: vac, ptoAccrued: pto};
}

// ============================================================
// YEAR-END FORFEITURE WORKFLOW
// ============================================================
function checkYearEndForfeiture() {
  var now = new Date();
  // Only relevant in December
  if (now.getMonth() !== 11) return;
  var isAdmin = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office');
  if (!isAdmin) return;
  // Check if already processed this year
  var processed = DB.settings && DB.settings.yearEndForfeitureYear;
  if (processed === now.getFullYear()) return;

  // Build forfeiture review list
  var techsWithBalance = (DB.team||[]).filter(function(m){
    return getLeaveBalance(m.name,'vacation')>0 || getLeaveBalance(m.name,'pto')>0;
  });
  if (!techsWithBalance.length) return;

  // Show alert on dashboard
  setTimeout(function(){
    var msg = techsWithBalance.length+' team member(s) have unused leave expiring Dec 31. Review in Timesheets → Year End.';
    showToast('📅 Year-End: '+msg, 'warning', 10000);
  }, 2000);
}

function renderYearEndReview() {
  var now = new Date();
  var techs = (DB.team||[]).map(function(m){
    var vac = getLeaveBalance(m.name,'vacation');
    var pto = getLeaveBalance(m.name,'pto');
    return {name:m.name, vac:vac, pto:pto};
  }).filter(function(t){ return t.vac>0||t.pto>0; });

  if (!techs.length) return '<div style="color:#90a4ae;padding:12px 0">No unused leave balances — nothing to forfeit.</div>';

  return '<div style="font-size:12px;color:#546e7a;margin-bottom:12px">Unused balances expire Dec 31. Choose to forfeit (default) or roll over for each tech.</div>'+
    techs.map(function(t){
      return '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:8px">'+
        '<div style="font-weight:700;font-size:13px;margin-bottom:8px">'+escHtml(t.name)+'</div>'+
        '<div style="display:flex;gap:14px;font-size:12px;color:#546e7a;margin-bottom:8px">'+
          (t.vac?'<span>🏖 Vacation: <strong>'+t.vac+' hrs</strong></span>':'')+
          (t.pto?'<span>🏥 PTO: <strong>'+t.pto+' hrs</strong></span>':'')+
        '</div>'+
        '<div style="display:flex;gap:6px">'+
          '<button class="btn btn-danger btn-sm" onclick="forfeitLeave(\''+escHtml(t.name)+'\')">✗ Forfeit (default)</button>'+
          '<button class="btn btn-outline btn-sm" onclick="rolloverLeave(\''+escHtml(t.name)+'\')">↻ Roll Over</button>'+
        '</div>'+
      '</div>';
    }).join('');
}

function forfeitLeave(techName) {
  if (!DB.leaveForfeiture) DB.leaveForfeiture=[];
  var now = new Date();
  DB.leaveForfeiture.push({
    techName:techName, year:now.getFullYear(),
    vacForfeited:getLeaveBalance(techName,'vacation'),
    ptoForfeited:getLeaveBalance(techName,'pto'),
    action:'forfeit', processedBy:_currentUser?_currentUser.full_name:'Admin',
    processedAt:now.toISOString()
  });
  DB.settings = Object.assign({},DB.settings,{yearEndForfeitureYear:now.getFullYear()});
  saveDB();
  showToast(techName+' — unused leave forfeited','info');
}

function rolloverLeave(techName) {
  var hours = prompt('How many hours to roll over for '+techName+'?','');
  if (!hours||isNaN(parseFloat(hours))) return;
  if (!DB.leaveForfeiture) DB.leaveForfeiture=[];
  var now = new Date();
  DB.leaveForfeiture.push({
    techName:techName, year:now.getFullYear(),
    vacRolled:getLeaveBalance(techName,'vacation'),
    ptoRolled:getLeaveBalance(techName,'pto'),
    hoursRolled:parseFloat(hours),
    action:'rollover', processedBy:_currentUser?_currentUser.full_name:'Admin',
    processedAt:now.toISOString()
  });
  DB.settings = Object.assign({},DB.settings,{yearEndForfeitureYear:now.getFullYear()});
  saveDB();
  showToast(techName+' — '+hours+' hours rolled over','success');
}

// ============================================================
// END TIME TRACKING GAPS
// ============================================================
// 8 TCSS holidays per spec Section 12
// ============================================================
function getTCSSHolidays(year) {
  var y = year || new Date().getFullYear();
  function easterSunday(y) {
    var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;
    return new Date(y,mo-1,da);
  }
  var easter = easterSunday(y);
  var easterFri = new Date(easter); easterFri.setDate(easter.getDate()-2);
  // Memorial Day: last Monday in May
  var memDay = new Date(y,4,31);
  while(memDay.getDay()!==1) memDay.setDate(memDay.getDate()-1);
  // Labor Day: first Monday in September
  var laborDay = new Date(y,8,1);
  while(laborDay.getDay()!==1) laborDay.setDate(laborDay.getDate()+1);
  // Thanksgiving: 4th Thursday in November
  var thanksgiving = new Date(y,10,1);
  while(thanksgiving.getDay()!==4) thanksgiving.setDate(thanksgiving.getDate()+1);
  thanksgiving.setDate(thanksgiving.getDate()+21);

  return [
    {name:"New Year's Day",      date:new Date(y,0,1).toISOString().split('T')[0]},
    {name:"Easter Friday",        date:easterFri.toISOString().split('T')[0]},
    {name:"Memorial Day",         date:memDay.toISOString().split('T')[0]},
    {name:"Independence Day",     date:new Date(y,6,4).toISOString().split('T')[0]},
    {name:"Labor Day",            date:laborDay.toISOString().split('T')[0]},
    {name:"Thanksgiving",         date:thanksgiving.toISOString().split('T')[0]},
    {name:"Christmas Eve",        date:new Date(y,11,24).toISOString().split('T')[0]},
    {name:"Christmas Day",        date:new Date(y,11,25).toISOString().split('T')[0]}
  ];
}

function isHoliday(dateStr) {
  var year = parseInt((dateStr||'').split('-')[0]);
  return getTCSSHolidays(year).find(function(h){ return h.date === dateStr; }) || null;
}

// ============================================================
// FEATURE 2: TIME OFF REQUEST WORKFLOW
// ============================================================
function openTimeOffModal() {
  var teamOpts = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  var dl = document.getElementById('toff-team-list'); if(dl) dl.innerHTML=teamOpts;
  var today = new Date().toISOString().split('T')[0];
  ['toff-name','toff-hours','toff-note'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var s=document.getElementById('toff-start'); if(s) s.value=today;
  var e=document.getElementById('toff-end');   if(e) e.value=today;
  var myName = _currentUser ? _currentUser.full_name : '';
  var nm=document.getElementById('toff-name'); if(nm&&myName) nm.value=myName;
  openModal('modal-time-off');
}

function submitTimeOffRequest() {
  var name   = ((document.getElementById('toff-name')||{}).value||'').trim();
  var type   = (document.getElementById('toff-type')||{}).value||'vacation';
  var start  = (document.getElementById('toff-start')||{}).value||'';
  var end    = (document.getElementById('toff-end')||{}).value||'';
  var hours  = parseFloat((document.getElementById('toff-hours')||{}).value)||8;
  var note   = (document.getElementById('toff-note')||{}).value||'';
  if (!name)  { showToast('Please enter your name','error'); return; }
  if (!start) { showToast('Please select a start date','error'); return; }
  if (hours < 4) { showToast('Minimum 4 hours per request','error'); return; }
  if (!DB.timeOffRequests) DB.timeOffRequests=[];
  DB.timeOffRequests.push({
    id:          'tor-'+Date.now(),
    techName:    name,
    type:        type,
    startDate:   start,
    endDate:     end||start,
    hours:       hours,
    note:        note,
    status:      'pending',
    submittedAt: new Date().toISOString().split('T')[0]
  });
  saveDB();
  closeModal('modal-time-off');
  renderTimeOffTab();
  showToast('Time off request submitted — pending approval','success');
}

function renderTimeOffTab() {
  var myName  = _currentUser ? _currentUser.full_name : '';
  var myRole  = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office';
  var requests = DB.timeOffRequests||[];

  // My requests
  var myEl = document.getElementById('ts-my-timeoff');
  if (myEl) {
    var mine = requests.filter(function(r){ return r.techName===myName; }).slice().reverse();
    myEl.innerHTML = mine.length ? mine.map(function(r){ return renderTimeOffRow(r, false); }).join('')
      : '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No time off requests yet. Click + Request Time Off to submit one.</div>';
  }

  // Admin pending queue
  var adminCard = document.getElementById('ts-admin-timeoff-card');
  var adminEl   = document.getElementById('ts-admin-timeoff');
  if (adminCard) adminCard.style.display = isAdmin ? 'block' : 'none';
  if (adminEl && isAdmin) {
    var pending = requests.filter(function(r){ return r.status==='pending'; });
    adminEl.innerHTML = pending.length ? pending.map(function(r){ return renderTimeOffRow(r, true); }).join('')
      : '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No pending requests.</div>';
  }
}

function renderTimeOffRow(r, showActions) {
  var typeLabels = {vacation:'🏖 Vacation',pto:'🏥 PTO',unpaid:'Unpaid'};
  var statusBadge = r.status==='pending'  ? '<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">⏳ Pending</span>'
                  : r.status==='approved' ? '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">✓ Approved</span>'
                  : '<span style="background:#ffebee;color:#c62828;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">✗ Denied</span>';
  var actions = showActions && r.status==='pending'
    ? '<div style="display:flex;gap:6px;margin-top:8px">'+
        '<button class="btn btn-success btn-sm" onclick="resolveTimeOff(\''+r.id+'\',\'approved\')">✓ Approve</button>'+
        '<button class="btn btn-danger btn-sm" onclick="resolveTimeOff(\''+r.id+'\',\'denied\')">✗ Deny</button>'+
      '</div>' : '';
  return '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:8px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'+
      '<div style="font-weight:700;font-size:13px">'+escHtml(typeLabels[r.type]||r.type)+'</div>'+
      statusBadge+
    '</div>'+
    '<div style="font-size:12px;color:#546e7a">'+
      (showActions?'<strong>'+escHtml(r.techName)+'</strong> · ':'')+
      escHtml(r.startDate)+(r.endDate&&r.endDate!==r.startDate?' — '+escHtml(r.endDate):'')+
      ' · <strong>'+r.hours+' hrs</strong>'+
    '</div>'+
    (r.note?'<div style="font-size:11px;color:#90a4ae;margin-top:3px">'+escHtml(r.note)+'</div>':'')+
    (r.denyReason?'<div style="font-size:11px;color:#c62828;margin-top:3px">Denied: '+escHtml(r.denyReason)+'</div>':'')+
    actions+
  '</div>';
}

function resolveTimeOff(id, status) {
  var r = (DB.timeOffRequests||[]).find(function(x){ return x.id===id; }); if(!r) return;
  if (status==='denied') {
    var reason = prompt('Reason for denial (optional):','')||'';
    r.denyReason = reason;
  }
  r.status = status;
  r.resolvedAt = new Date().toISOString().split('T')[0];
  r.resolvedBy = _currentUser ? _currentUser.full_name : 'Admin';
  // If approved vacation/PTO, log it as a work day entry
  if (status==='approved' && (r.type==='vacation'||r.type==='pto')) {
    if (!DB.workDays) DB.workDays=[];
    DB.workDays.push({
      id:'wd-toff-'+Date.now(), techName:r.techName, date:r.startDate,
      totalPaidMins:r.hours*60, onsiteMins:0, travelMins:0, lunchMins:0,
      breakMins:0, jobName:'', dayType:r.type, approved:true,
      approvedBy:_currentUser?_currentUser.full_name:'Admin'
    });
  }
  saveDB(); renderTimeOffTab();
  showToast('Request '+status,'success');
}

// ============================================================
// FEATURE 3: PAYROLL SUMMARY + EXPORT
// ============================================================
function getPayPeriodByOffset(offset) {
  var anchor = new Date('2025-01-06');
  var now = new Date();
  var diffDays = Math.floor((now-anchor)/(1000*60*60*24));
  var periodNum = Math.floor(diffDays/14) - (offset||0);
  var start = new Date(anchor); start.setDate(start.getDate()+periodNum*14);
  var end = new Date(start); end.setDate(end.getDate()+13);
  return {start:start,end:end};
}

function renderPayrollTab() {
  var el = document.getElementById('ts-payroll-content'); if(!el) return;
  var lockEl = document.getElementById('ts-payroll-lock-warning');
  var myRole = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office';
  if (!isAdmin) { el.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">Admin access required.</div>'; return; }

  var offsetSel = document.getElementById('payroll-period-select');
  var offset = offsetSel ? {current:0,prev1:1,prev2:2}[offsetSel.value]||0 : 0;
  var pp = getPayPeriodByOffset(offset);
  var ppStart = pp.start.toISOString().split('T')[0];
  var ppEnd   = pp.end.toISOString().split('T')[0];

  // Check for open flags — block payroll if any unresolved
  var openFlags = (DB.lunchFlags||[]).filter(function(f){ return f.status==='pending_review' && f.date>=ppStart && f.date<=ppEnd; });
  if (lockEl) lockEl.style.display = openFlags.length ? 'block' : 'none';

  // Gather work days for this period, grouped by tech
  var days = (DB.workDays||[]).filter(function(d){ return d.date>=ppStart && d.date<=ppEnd; });
  var holidays = getTCSSHolidays(pp.start.getFullYear());

  // Build per-tech summaries
  var techMap = {};
  (DB.team||[]).forEach(function(m){ techMap[m.name]={name:m.name,rate:parseFloat(m.rate)||0,workedMins:0,vacMins:0,ptoMins:0,holidayMins:0,days:[]}; });

  days.forEach(function(d){
    if (!techMap[d.techName]) techMap[d.techName]={name:d.techName,rate:0,workedMins:0,vacMins:0,ptoMins:0,holidayMins:0,days:[]};
    var t = techMap[d.techName];
    t.days.push(d);
    if (d.dayType==='vacation')      t.vacMins     += d.totalPaidMins||0;
    else if (d.dayType==='pto')      t.ptoMins     += d.totalPaidMins||0;
    else if (d.dayType==='holiday')  t.holidayMins += d.totalPaidMins||0;
    else                             t.workedMins  += d.totalPaidMins||0;
  });

  // Auto-add holidays that fall in this period
  holidays.forEach(function(h){ if(h.date>=ppStart&&h.date<=ppEnd){
    Object.keys(techMap).forEach(function(name){
      var alreadyHas = techMap[name].days.find(function(d){ return d.date===h.date; });
      if(!alreadyHas) techMap[name].holidayMins+=480;
    });
  }});

  var techs = Object.values(techMap).filter(function(t){ return t.workedMins||t.vacMins||t.ptoMins||t.holidayMins; });
  if (!techs.length) { el.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">No data for this pay period.</div>'; return; }

  el.innerHTML =
    '<div style="font-size:12px;color:#546e7a;margin-bottom:14px">'+formatDate(ppStart)+' — '+formatDate(ppEnd)+'</div>'+
    techs.map(function(t){
      var regMins  = Math.min(t.workedMins, 4800);
      var otMins   = Math.max(0, t.workedMins - 4800);
      var totalPay = (regMins/60*t.rate) + (otMins/60*t.rate*1.5) +
                     ((t.vacMins+t.ptoMins+t.holidayMins)/60*t.rate);
      var hasFlags = openFlags.find(function(f){ return f.techName===t.name; });
      return '<div style="background:#f8f9fa;border-radius:10px;padding:14px;margin-bottom:10px">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
          '<div style="font-weight:700;font-size:14px">'+escHtml(t.name)+'</div>'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            (hasFlags?'<span style="background:#ffebee;color:#c62828;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">⚠ Flags</span>':'')+
            '<span style="font-weight:800;font-size:16px;color:#2e7d32">$'+totalPay.toFixed(2)+'</span>'+
          '</div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(t.workedMins)+'</div><div class="ts-stat-lbl">Worked</div></div>'+
          '<div class="ts-stat" style="'+(otMins>0?'background:#fff3e0':'')+'"><div class="ts-stat-val" style="'+(otMins>0?'color:#e65100':'')+'">'+fmtMins(otMins)+'</div><div class="ts-stat-lbl">Overtime</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(t.vacMins+t.ptoMins+t.holidayMins)+'</div><div class="ts-stat-lbl">Leave/Holiday</div></div>'+
        '</div>'+
        '<div style="font-size:11px;color:#546e7a;display:flex;gap:14px">'+
          (t.rate?'<span>$'+t.rate+'/hr</span>':'<span style="color:#c62828">No rate set</span>')+
          '<span>Reg: $'+(regMins/60*t.rate).toFixed(2)+'</span>'+
          (otMins?'<span>OT: $'+(otMins/60*t.rate*1.5).toFixed(2)+'</span>':'')+
          (t.vacMins?'<span>Vac: $'+(t.vacMins/60*t.rate).toFixed(2)+'</span>':'')+
          (t.ptoMins?'<span>PTO: $'+(t.ptoMins/60*t.rate).toFixed(2)+'</span>':'')+
          (t.holidayMins?'<span>Hol: $'+(t.holidayMins/60*t.rate).toFixed(2)+'</span>':'')+
        '</div>'+
        (!hasFlags?'<button class="btn btn-success btn-sm" style="margin-top:10px" onclick="markPayrollProcessed(\''+escHtml(t.name)+'\',\''+ppStart+'\',\''+ppEnd+'\')">✓ Mark Processed</button>':'')+
      '</div>';
    }).join('');
}

function markPayrollProcessed(techName, ppStart, ppEnd) {
  if (!DB.payrollLog) DB.payrollLog=[];
  DB.payrollLog.push({tech:techName,ppStart:ppStart,ppEnd:ppEnd,processedAt:new Date().toISOString(),processedBy:_currentUser?_currentUser.full_name:'Admin'});
  saveDB();
  showToast(techName+' payroll marked as processed','success');
}

function exportPayrollCSV() {
  var offsetSel=document.getElementById('payroll-period-select');
  var offset={current:0,prev1:1,prev2:2}[(offsetSel&&offsetSel.value)||'current']||0;
  var pp=getPayPeriodByOffset(offset);
  var ppStart=pp.start.toISOString().split('T')[0];
  var ppEnd=pp.end.toISOString().split('T')[0];
  var days=(DB.workDays||[]).filter(function(d){return d.date>=ppStart&&d.date<=ppEnd;});
  var rows=[['Tech','Date','Total Paid Hrs','On Site Hrs','Travel Hrs','Vacation Hrs','PTO Hrs','Holiday Hrs','Day Type','Job']];
  days.forEach(function(d){
    rows.push([d.techName,d.date,((d.totalPaidMins||0)/60).toFixed(2),((d.onsiteMins||0)/60).toFixed(2),((d.travelMins||0)/60).toFixed(2),(d.dayType==='vacation'?(d.totalPaidMins||0)/60:0).toFixed(2),(d.dayType==='pto'?(d.totalPaidMins||0)/60:0).toFixed(2),(d.dayType==='holiday'?(d.totalPaidMins||0)/60:0).toFixed(2),d.dayType||'work',d.jobName||'']);
  });
  var csv=rows.map(function(r){return r.map(function(c){return '"'+String(c).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  downloadCSV('TCSS-Payroll-'+ppStart+'-to-'+ppEnd+'.csv',[csv]);
  showToast('Payroll CSV exported','success');
}

// ============================================================
// FEATURE 4: LIVE ACTIVITY PANEL
// ============================================================
function renderLiveActivity() {
  var el = document.getElementById('live-activity'); if(!el) return;
  // Pull from DB.workDays for today — incomplete days = still clocked in
  var today = new Date().toISOString().split('T')[0];
  var activeToday = (DB.workDays||[]).filter(function(d){
    return d.date===today && !d.totalPaidMins; // no totalPaid means still in progress
  });
  // Also check if current user is clocked in
  var liveEntries = [];
  if (_clockState.status!=='out' && _currentUser) {
    liveEntries.push({
      name: _currentUser.full_name,
      status: _clockState.status,
      job: _clockState.jobName||'—',
      since: _clockState.dayStart ? _clockState.dayStart.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}) : '—'
    });
  }
  if (!liveEntries.length) {
    el.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No one currently clocked in. Live status syncs when field devices connect.</div>';
    return;
  }
  var statusLabels={at_homebase:'🏠 At Base',traveling:'🚗 Traveling',onsite:'🔧 On Site',break:'⏸ On Break',lunch:'🍽 At Lunch',returning:'🚗 Returning'};
  el.innerHTML=liveEntries.map(function(e){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5">'+
      '<div>'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(e.name)+'</div>'+
        '<div style="font-size:11px;color:#546e7a">'+escHtml(e.job)+' · Since '+escHtml(e.since)+'</div>'+
      '</div>'+
      '<span style="font-size:12px;font-weight:700;color:#2e7d32">'+escHtml(statusLabels[e.status]||e.status)+'</span>'+
    '</div>';
  }).join('');
}

// ============================================================
// FEATURE 5: MANUAL TIME CORRECTION
// ============================================================
function openTimeCorrectionModal(workDayId) {
  var wd = (DB.workDays||[]).find(function(d){ return d.id===workDayId; });
  if (!wd) return;
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v||''; }
  sv('tc-tech',  wd.techName);
  sv('tc-date',  wd.date);
  sv('tc-total', wd.totalPaidMins||0);
  sv('tc-onsite',wd.onsiteMins||0);
  sv('tc-travel',wd.travelMins||0);
  sv('tc-lunch', wd.lunchMins||0);
  sv('tc-reason','');
  sv('tc-workday-id', workDayId);
  openModal('modal-time-correction');
}

function saveTimeCorrection() {
  var id     = (document.getElementById('tc-workday-id')||{}).value||'';
  var reason = ((document.getElementById('tc-reason')||{}).value||'').trim();
  if (!reason) { showToast('Please enter a reason for the correction','error'); return; }
  var wd = (DB.workDays||[]).find(function(d){ return d.id===id; });
  if (!wd) { showToast('Work day not found','error'); return; }
  // Archive original
  if (!wd.corrections) wd.corrections=[];
  wd.corrections.push({
    correctedAt:  new Date().toISOString(),
    correctedBy:  _currentUser ? _currentUser.full_name : 'Admin',
    reason:       reason,
    original:     {totalPaidMins:wd.totalPaidMins,onsiteMins:wd.onsiteMins,travelMins:wd.travelMins,lunchMins:wd.lunchMins}
  });
  // Apply correction
  wd.totalPaidMins = parseInt((document.getElementById('tc-total')||{}).value)||0;
  wd.onsiteMins    = parseInt((document.getElementById('tc-onsite')||{}).value)||0;
  wd.travelMins    = parseInt((document.getElementById('tc-travel')||{}).value)||0;
  wd.lunchMins     = parseInt((document.getElementById('tc-lunch')||{}).value)||0;
  wd.corrected     = true;
  saveDB();
  closeModal('modal-time-correction');
  loadTimesheets();
  showToast('Time correction saved — original preserved in audit trail','success');
}

// ============================================================
// END TIME MANAGEMENT FEATURES
// ============================================================
function renderDayRow(d) {
  var flagStr = d.lunchFlagged ? '<span class="ts-flag-chip">⚠ Lunch</span>' : '';
  var otMins = Math.max(0, (d.totalPaidMins||0) - 480);
  var otStr = otMins > 0 ? '<span class="ts-ot-chip">OT +'+fmtMins(otMins)+'</span>' : '';
  return '<div class="ts-day-row">'+
    '<span class="ts-day-date">'+formatDate(d.date)+'</span>'+
    '<div class="ts-day-stats">'+
      '<span>🔧 '+fmtMins(d.onsiteMins)+'</span>'+
      '<span>🚗 '+fmtMins(d.travelMins)+'</span>'+
      (d.lunchMins?'<span>🍽 '+fmtMins(d.lunchMins)+'</span>':'')+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:4px">'+flagStr+otStr+'</div>'+
    '<span class="ts-day-total">'+fmtMins(d.totalPaidMins)+'</span>'+
  '</div>';
}

// Render a full day summary card (for today)
function renderDaySummaryCard(d) {
  return '<div class="ts-stat-grid">'+
    '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(d.totalPaidMins)+'</div><div class="ts-stat-lbl">Total Paid</div></div>'+
    '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(d.onsiteMins)+'</div><div class="ts-stat-lbl">On Site</div></div>'+
    '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(d.travelMins)+'</div><div class="ts-stat-lbl">Travel</div></div>'+
    '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(d.lunchMins)+'</div><div class="ts-stat-lbl">Lunch</div></div>'+
  '</div>';
}

function resolveLunchFlag(flagId, action) {
  var flag=(DB.lunchFlags||[]).find(function(f){return f.id===flagId;});
  if(!flag) return;
  flag.status='resolved'; flag.resolution=action;
  flag.resolvedAt=new Date().toISOString().split('T')[0];
  flag.resolvedBy=_currentUser?_currentUser.full_name:'Office';
  saveDB(); loadTimesheets();
  showToast('Flag resolved','success');
}

// RESTORE SESSION ON LOGIN
async function restoreClockSession(){
  // Stubbed — will be implemented in time tracking module build
}

// =============================================
// END TIME CLOCK & GEOFENCING
// =============================================

var DEFAULT_ASSUMPTIONS = [
  'Existing infrastructure (conduit, power, network backbone) is assumed functional and accessible',
  'Adequate power and network connectivity are available at required locations',
  'Reasonable site access during normal working hours (7am–5pm, Mon–Fri)',
  'No unforeseen structural, hazardous material, or AHJ conditions',
  'Customer will provide accurate site drawings or access for site walk prior to install'
];

var DEFAULT_EXCLUSIONS = [
  'Patch, paint, or restoration of walls/ceilings unless explicitly specified',
  'Permits (permit acquisition available upon request — pricing TBD)',
  'Network switching/routing equipment unless included in line items',
  'Lift/aerial equipment rental unless included in line items',
  'Trenching, underground conduit, or civil work unless specified',
  'IT infrastructure beyond scope of this proposal'
];

var JT_ADDENDUM_TYPES = [
  { key:'New Construction',  icon:'🏗️', hint:'Add clauses specific to new builds (rough-in coordination, inspection phases, etc.)' },
  { key:'Remodel',  icon:'🔨', hint:'Unknown conditions, demo coordination, working in occupied spaces' },
  { key:'Service Call',      icon:'🔧', hint:'Diagnostic fees, minimum billing, parts markup, response time' },
  { key:'Upgrade',           icon:'⬆️', hint:'Compatibility with existing systems, data migration, downtime windows' },
  { key:'Addition',          icon:'➕', hint:'Tie-in to existing infrastructure, warranty on new work only' }
];

function getProposalDefaults() {
  return DB.settings.proposalDefaults || {
    showAssumptions: true,
    showExclusions:  true,
    assumptions:     DEFAULT_ASSUMPTIONS.slice(),
    exclusions:      DEFAULT_EXCLUSIONS.slice()
  };
}

function getJtAddendums() {
  return DB.settings.jtAddendums || {};
}

function loadProposalDefaultsUI() {
  var pd = getProposalDefaults();

  // Toggles
  var ta = document.getElementById('toggle-assumptions');
  var te = document.getElementById('toggle-exclusions');
  if (ta) ta.checked = pd.showAssumptions !== false;
  if (te) te.checked = pd.showExclusions  !== false;
  updateClauseLabel('assumptions', pd.showAssumptions !== false);
  updateClauseLabel('exclusions',  pd.showExclusions  !== false);

  // Lists
  renderClauseList('assumptions', pd.assumptions || DEFAULT_ASSUMPTIONS.slice());
  renderClauseList('exclusions',  pd.exclusions  || DEFAULT_EXCLUSIONS.slice());
}

function renderClauseList(type, items) {
  var list = document.getElementById(type + '-list');
  if (!list) return;
  list.innerHTML = '';
  items.forEach(function(text, i) {
    var li = document.createElement('li');
    li.className = 'clause-item';
    li.innerHTML =
      '<span style="font-size:16px;color:#90a4ae;cursor:grab;flex-shrink:0;padding-top:4px">⋮⋮</span>' +
      '<textarea data-clause-type="' + type + '" data-clause-idx="' + i + '" rows="2">' + escHtml(text) + '</textarea>' +
      '<button class="clause-del-btn" onclick="deleteClause(\'' + type + '\',' + i + ')" title="Remove">✕</button>';
    list.appendChild(li);
  });
}

function addClause(type) {
  var pd = getProposalDefaults();
  var arr = type === 'assumptions' ? (pd.assumptions || []) : (pd.exclusions || []);
  arr.push('');
  if (type === 'assumptions') pd.assumptions = arr; else pd.exclusions = arr;
  DB.settings.proposalDefaults = pd;
  renderClauseList(type, arr);
  // Focus the new textarea
  var list = document.getElementById(type + '-list');
  if (list) {
    var textareas = list.querySelectorAll('textarea');
    if (textareas.length) textareas[textareas.length - 1].focus();
  }
}

function deleteClause(type, idx) {
  var pd = getProposalDefaults();
  var arr = type === 'assumptions' ? (pd.assumptions || []) : (pd.exclusions || []);
  arr.splice(idx, 1);
  if (type === 'assumptions') pd.assumptions = arr; else pd.exclusions = arr;
  DB.settings.proposalDefaults = pd;
  renderClauseList(type, arr);
}

function toggleClause(type) {
  var cb = document.getElementById('toggle-' + type);
  if (!cb) return;
  var on = cb.checked;
  updateClauseLabel(type, on);
}

function updateClauseLabel(type, on) {
  var lbl = document.getElementById('toggle-' + type + '-label');
  if (lbl) { lbl.textContent = on ? 'YES' : 'NO'; lbl.className = 'toggle-value-label' + (on ? ' on' : ''); }
}

function readClauseListFromDOM(type) {
  var list = document.getElementById(type + '-list');
  if (!list) return [];
  var items = [];
  list.querySelectorAll('textarea').forEach(function(ta) {
    var val = ta.value.trim();
    if (val) items.push(val);
  });
  return items;
}

function saveProposalDefaults() {
  var ta = document.getElementById('toggle-assumptions');
  var te = document.getElementById('toggle-exclusions');
  var pd = {
    showAssumptions: ta ? ta.checked : true,
    showExclusions:  te ? te.checked : true,
    assumptions:     readClauseListFromDOM('assumptions'),
    exclusions:      readClauseListFromDOM('exclusions')
  };
  DB.settings.proposalDefaults = pd;
  saveDB();
  var note = document.getElementById('clauses-saved-note');
  if (note) { note.style.display='inline'; setTimeout(function(){ note.style.display='none'; }, 2500); }
}

// =============================================
// TERMS BY JOB TYPE
// =============================================

function loadJtAddendumsUI() {
  var addendums = getJtAddendums();
  var container = document.getElementById('jt-addendum-list');
  if (!container) return;
  container.innerHTML = JT_ADDENDUM_TYPES.map(function(jt) {
    var val = addendums[jt.key] || '';
    return '<div class="jt-addendum-item">' +
      '<div class="jt-addendum-title">' + jt.icon + ' ' + escHtml(jt.key) +
        '<span style="font-size:10px;font-weight:400;color:#90a4ae;margin-left:4px">— ' + escHtml(jt.hint) + '</span>' +
      '</div>' +
      '<textarea id="jt-addendum-' + jt.key.replace(/[^a-z]/gi,'') + '" placeholder="Leave blank to use base T&amp;C only. Add job-type-specific clauses here — they will append after the base terms on the proposal..." rows="3">' +
        escHtml(val) +
      '</textarea>' +
    '</div>';
  }).join('');
}

function saveJtAddendums() {
  var addendums = {};
  JT_ADDENDUM_TYPES.forEach(function(jt) {
    var id = 'jt-addendum-' + jt.key.replace(/[^a-z]/gi,'');
    var el = document.getElementById(id);
    if (el && el.value.trim()) addendums[jt.key] = el.value.trim();
  });
  DB.settings.jtAddendums = addendums;
  saveDB();
  var note = document.getElementById('jt-saved-note');
  if (note) { note.style.display='inline'; setTimeout(function(){ note.style.display='none'; }, 2500); }
}

// =============================================
// PROPOSAL DEFAULTS — END

// =============================================
// CUSTOMER & CONTACT AUTOCOMPLETE
// =============================================

function onCustomerInput(val) {
  var dropdown = document.getElementById('customer-dropdown');
  if (!dropdown) return;
  if (!val || val.length < 1) { dropdown.style.display='none'; return; }
  var sl = val.toLowerCase();
  var matches = DB.customers.filter(function(c){
    return (c.name||'').toLowerCase().includes(sl);
  }).slice(0,8);

  var html = matches.map(function(c){
    return '<div class="autocomplete-item" onmousedown="selectCustomer(\''+c.id+'\')">'+
      '<span class="autocomplete-item-main">'+escHtml(c.name||'')+'</span>'+
      '<span class="autocomplete-item-sub">'+(c.phone||'')+(c.email?' · '+c.email:'')+'</span>'+
    '</div>';
  }).join('');

  // Exact match exists — no need for "create" option
  var exactMatch = DB.customers.find(function(c){ return (c.name||'').toLowerCase()===sl; });
  if (!exactMatch) {
    html += '<div class="autocomplete-item" onmousedown="createCustomerFromQuote(\''+escHtml(val)+'\')" style="border-top:1px solid #e0e0e0;color:#1565c0">'+
      '<span class="autocomplete-item-main">✚ Create new customer: <strong>'+escHtml(val)+'</strong></span>'+
      '<span class="autocomplete-item-sub">Adds to your customer list automatically</span>'+
    '</div>';
  }

  dropdown.innerHTML = html;
  dropdown.style.display = 'block';
}

function selectCustomer(id) {
  var cust = DB.customers.find(function(c){ return c.id===id; });
  if (!cust) return;
  var cnEl=document.getElementById('qq-cn');       if(cnEl) cnEl.value=cust.name||'';
  var cidEl=document.getElementById('qq-customer-id'); if(cidEl) cidEl.value=cust.id||'';
  var phEl=document.getElementById('qq-ph');       if(phEl&&cust.phone&&!phEl.value) phEl.value=cust.phone;
  var emEl=document.getElementById('qq-em');       if(emEl&&cust.email&&!emEl.value) emEl.value=cust.email;
  var adEl=document.getElementById('qq-ad');       if(adEl&&!adEl.value) adEl.value=cust.street||cust.address||'';
  var cityEl=document.getElementById('qq-city');   if(cityEl&&!cityEl.value) cityEl.value=cust.city||'';
  var stEl=document.getElementById('qq-state');    if(stEl&&!stEl.value) stEl.value=cust.state||'';
  var zipEl=document.getElementById('qq-zip');     if(zipEl&&!zipEl.value) zipEl.value=cust.zip||'';
  var ptEl=document.getElementById('qq-pt');       if(ptEl&&cust.defaultTerms) ptEl.value=cust.defaultTerms;
  closeCustomerDropdown();
  // Clear old contact selection
  var ctEl=document.getElementById('qq-contact-name');
  var ctIdEl=document.getElementById('qq-contact-id');
  if(ctIdEl) ctIdEl.value='';
  // Find contacts — prefer customerId match, fall back to company name match
  var contacts = DB.contacts.filter(function(c){
    return c.customerId===cust.id ||
      (!c.customerId && (c.company||'').toLowerCase()===(cust.name||'').toLowerCase());
  });
  if (contacts.length===1) {
    selectContact(contacts[0].id);
  } else if (contacts.length>1 && ctEl) {
    ctEl.placeholder='Select contact...';
    ctEl.value='';
    showContactsForCustomer(contacts);
    // Don't call .focus() here — it triggers blur on current element which closes the dropdown
  } else if (ctEl) {
    ctEl.placeholder='No contacts on file';
    ctEl.value='';
  }
}

function createCustomerFromQuote(name) {
  closeCustomerDropdown();
  // Pre-fill name with what was typed
  var nameEl  = document.getElementById('ncust-name');
  var phoneEl = document.getElementById('ncust-phone');
  var emailEl = document.getElementById('ncust-email');
  var addrEl  = document.getElementById('ncust-address');
  if (nameEl)  nameEl.value  = name.trim();
  if (phoneEl) phoneEl.value = '';
  if (emailEl) emailEl.value = '';
  if (addrEl)  addrEl.value  = '';
  // Show panel
  var panel = document.getElementById('qq-new-customer-panel');
  if (panel) { panel.style.display='block'; if(nameEl) nameEl.focus(); }
}

function saveNewCustomerFromQuote() {
  var name  = ((document.getElementById('ncust-name')||{}).value||'').trim();
  var phone = (document.getElementById('ncust-phone')||{}).value||'';
  var email = (document.getElementById('ncust-email')||{}).value||'';
  var addr  = (document.getElementById('ncust-address')||{}).value||'';
  if (!name) { showToast('Customer name is required','error'); return; }

  // Check not a duplicate
  var existing = DB.customers.find(function(c){ return (c.name||'').toLowerCase()===name.toLowerCase(); });
  if (existing) {
    showToast('"'+name+'" already exists — selecting them','info');
    selectCustomer(existing.id);
    cancelNewCustomerFromQuote();
    return;
  }

  var newCust = {
    id:        'cust-' + Date.now(),
    name:      name,
    phone:     phone,
    email:     email,
    address:   addr,
    notes:     '',
    createdAt: new Date().toISOString()
  };
  DB.customers.push(newCust);
  saveDB();
  renderCustomers();

  // Select them — fills form fields and sets hidden customer ID
  selectCustomer(newCust.id);
  cancelNewCustomerFromQuote();
  showToast('Customer "'+name+'" created and linked','success');
}

function cancelNewCustomerFromQuote() {
  var panel = document.getElementById('qq-new-customer-panel');
  if (panel) panel.style.display='none';
  ['ncust-name','ncust-phone','ncust-email','ncust-address'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
}

function closeCustomerDropdown() {
  var d=document.getElementById('customer-dropdown'); if(d) d.style.display='none';
}

function onContactInput(val) {
  var dropdown=document.getElementById('contact-dropdown');
  if (!dropdown) return;
  if (!val||val.length<1) { dropdown.style.display='none'; return; }

  var sl = val.toLowerCase();
  // Get currently selected customer ID
  var custId = (document.getElementById('qq-customer-id')||{}).value||'';
  var custName = (document.getElementById('qq-cn')||{}).value||'';

  // Filter contacts — if customer selected, show only their contacts
  // If no customer yet, search all contacts
  var pool = DB.contacts.filter(function(c){
    if (custId) return c.customerId===custId ||
      (!c.customerId && (c.company||'').toLowerCase()===(custName||'').toLowerCase());
    return true;
  });

  var matches = pool.filter(function(c){
    return (c.name||'').toLowerCase().includes(sl);
  }).slice(0,8);

  var html = matches.map(function(c){
    return '<div class="autocomplete-item" onmousedown="selectContact(\''+c.id+'\')">' +
      '<span class="autocomplete-item-main">'+escHtml(c.name||'')+'</span>' +
      '<span class="autocomplete-item-sub">'+(c.title||c.role||'')+(c.phone?' · '+c.phone:'')+'</span>' +
    '</div>';
  }).join('');

  // Add "Create new contact" if no exact match
  var exactMatch = pool.find(function(c){ return (c.name||'').toLowerCase()===sl; });
  if (!exactMatch && val.trim().length > 1) {
    html += '<div class="autocomplete-item" onmousedown="createContactFromQuote(\''+escHtml(val)+'\')" style="border-top:1px solid #e0e0e0;color:#1565c0">'+
      '<span class="autocomplete-item-main">✚ Create new contact: <strong>'+escHtml(val)+'</strong></span>'+
      '<span class="autocomplete-item-sub">'+(custName?'Will be linked to '+escHtml(custName):'Add customer first to link')+'</span>'+
    '</div>';
  }

  if (!html) { dropdown.style.display='none'; return; }
  dropdown.innerHTML = html;
  dropdown.style.display='block';
}

function showContactsForCustomer(contacts) {
  var dropdown=document.getElementById('contact-dropdown');
  if (!dropdown) return;
  var custName = (document.getElementById('qq-cn')||{}).value||'';
  var custId = (document.getElementById('qq-customer-id')||{}).value||'';
  dropdown.innerHTML=
    contacts.map(function(c){
      return '<div class="autocomplete-item" onmousedown="selectContact(\''+c.id+'\')">' +
        '<span class="autocomplete-item-main">'+escHtml(c.name||'')+'</span>' +
        '<span class="autocomplete-item-sub">'+(c.title||c.role||'')+(c.phone?' · '+c.phone:'')+(c.email?' · '+c.email:'')+'</span>' +
      '</div>';
    }).join('')+
    '<div class="autocomplete-item" onmousedown="createContactFromQuote(\'\')" style="border-top:1px solid #e0e0e0;color:#1565c0">'+
      '<span class="autocomplete-item-main">✚ Add new contact for '+escHtml(custName)+'</span>'+
      '<span class="autocomplete-item-sub">Fill in name, title, phone and email</span>'+
    '</div>';
  dropdown.style.display='block';
}

function selectContact(id) {
  var contact=DB.contacts.find(function(c){ return c.id===id; });
  if (!contact) return;
  var ctEl=document.getElementById('qq-contact-name');   if(ctEl)   ctEl.value=contact.name||'';
  var ctIdEl=document.getElementById('qq-contact-id');   if(ctIdEl) ctIdEl.value=contact.id||'';
  var tiEl=document.getElementById('qq-contact-title');  if(tiEl)   tiEl.value=contact.title||contact.role||'';
  var phEl=document.getElementById('qq-ph');             if(phEl&&contact.phone&&!phEl.value) phEl.value=contact.phone;
  var emEl=document.getElementById('qq-em');             if(emEl&&contact.email&&!emEl.value) emEl.value=contact.email;
  closeContactDropdown();
}

function createContactFromQuote(name) {
  closeContactDropdown();
  // Pre-fill the name field with whatever was typed
  var nameEl = document.getElementById('nc-name');
  var titleEl = document.getElementById('nc-title');
  var phoneEl = document.getElementById('nc-phone');
  var emailEl = document.getElementById('nc-email');
  if (nameEl)  nameEl.value  = name.trim();
  if (titleEl) titleEl.value = (document.getElementById('qq-contact-title')||{}).value||'';
  if (phoneEl) phoneEl.value = '';
  if (emailEl) emailEl.value = '';
  // Show the panel
  var panel = document.getElementById('qq-new-contact-panel');
  if (panel) { panel.style.display='block'; if(nameEl) nameEl.focus(); }
}

function saveNewContactFromQuote() {
  var name  = ((document.getElementById('nc-name')||{}).value||'').trim();
  var title = (document.getElementById('nc-title')||{}).value||'';
  var phone = (document.getElementById('nc-phone')||{}).value||'';
  var email = (document.getElementById('nc-email')||{}).value||'';
  if (!name) { showToast('Contact name is required','error'); return; }

  var custId   = (document.getElementById('qq-customer-id')||{}).value||'';
  var custName = (document.getElementById('qq-cn')||{}).value||'';

  var newContact = {
    id:         'ct-' + Date.now(),
    name:       name,
    company:    custName,
    customerId: custId,
    phone:      phone,
    email:      email,
    role:       title,
    title:      title,
    createdAt:  new Date().toISOString()
  };
  if (!DB.contacts) DB.contacts = [];
  DB.contacts.push(newContact);
  saveDB();

  // Fill contact into the quote form
  selectContact(newContact.id);

  // Update title field in case it was set
  var titEl = document.getElementById('qq-contact-title');
  if (titEl && title) titEl.value = title;

  // Hide panel
  cancelNewContactFromQuote();
  showToast('Contact "'+name+'" saved and linked to quote','success');
}

function cancelNewContactFromQuote() {
  var panel = document.getElementById('qq-new-contact-panel');
  if (panel) panel.style.display='none';
  // Clear panel fields
  ['nc-name','nc-title','nc-phone','nc-email'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
}

function closeContactDropdown() {
  var d=document.getElementById('contact-dropdown'); if(d) d.style.display='none';
}

// =============================================
// END AUTOCOMPLETE
// =============================================
// =============================================
var _cqqEnabled = false;

function toggleCQQ() {
  var cb    = document.getElementById('cqq-enabled');
  var body  = document.getElementById('cqq-body');
  var label = document.getElementById('cqq-toggle-label');
  if (!cb||!body) return;
  _cqqEnabled = cb.checked;
  body.classList.toggle('expanded', _cqqEnabled);
  if (label) { label.textContent=_cqqEnabled?'YES':'NO'; label.className='toggle-value-label'+(_cqqEnabled?' on':''); }
  if (_cqqEnabled) cqqCalc();
}

function cqqCalc() {
  var count   = parseInt((document.getElementById('cqq-count')||{}).value)||4;
  var type    = (document.getElementById('cqq-type')||{}).value||'standard';
  var cableRun= parseInt((document.getElementById('cqq-cable')||{}).value)||150;
  var nvrYes  = (document.getElementById('cqq-nvr')||{}).value!=='no';
  var laborHr = parseFloat((document.getElementById('cqq-labor')||{}).value)||2;

  // Camera specs by type
  var specs = {
    standard: { name:'IP Camera Outdoor Bullet 4MP', mc:115, icon:'📷' },
    verkada:  { name:'Verkada CD62 Outdoor Camera',  mc:429, icon:'📸' },
    ptz:      { name:'PTZ Camera',                   mc:385, icon:'🎥' }
  };
  var cam = specs[type]||specs.standard;

  // NVR sizing
  var nvrName='', nvrMc=0;
  if (nvrYes) {
    if (count<=8)  { nvrName='NVR 8-Channel 4K';  nvrMc=280; }
    else if (count<=16) { nvrName='NVR 16-Channel 4K'; nvrMc=420; }
    else           { nvrName='NVR 32-Channel 4K'; nvrMc=680; }
  }

  // HDD sizing
  var hddCount = Math.max(1, Math.ceil(count/8));
  var totalCable = count * cableRun;
  var totalLabor = count * laborHr;
  var cableMc = type==='verkada' ? 0.10 : 0.35; // CAT6 vs RG59

  // Build preview rows
  var rows = [
    { desc: cam.name,                 qty: count,      unit:'ea',   mc: cam.mc },
    { desc: type==='verkada'?'Verkada CMD Bridge':'Camera Mounting Bracket', qty: type==='verkada'?1:count, unit:'ea', mc: type==='verkada'?299:18 },
  ];
  if (type==='verkada') rows.push({ desc:'Verkada License - 1yr (per camera)', qty:count, unit:'ea', mc:149 });
  if (nvrYes) {
    rows.push({ desc: nvrName, qty:1, unit:'ea', mc:nvrMc });
    rows.push({ desc:'2TB Surveillance HDD', qty:hddCount, unit:'ea', mc:75 });
  }
  rows.push({ desc: type==='verkada'?'CAT6 Cable (per 1000ft)':'Camera Cable RG59+Power', qty:totalCable, unit:'ft', mc:cableMc });
  rows.push({ desc:'General Labor', qty:totalLabor, unit:'hr', mc:0 });

  var totalMat = rows.reduce(function(s,r){ return s + r.mc*r.qty; },0);
  var preview  = document.getElementById('cqq-preview-rows');
  if (!preview) return;
  preview.innerHTML = rows.map(function(r){
    return '<div class="cqq-preview-row"><span>'+escHtml(r.desc)+'</span><span>×'+r.qty+' '+r.unit+(r.mc>0?' — $'+(r.mc*r.qty).toFixed(0):'')+'</span></div>';
  }).join('') +
  '<div class="cqq-preview-row" style="margin-top:4px;padding-top:4px;border-top:1.5px solid #90caf9"><span>Total Material Cost</span><span style="font-weight:700;color:#1565c0">$'+totalMat.toFixed(0)+'</span></div>';

  // Store for append
  window._cqqRows = rows;
}

function cqqAppend() {
  if (!window._cqqRows||!window._cqqRows.length) { cqqCalc(); }
  var rows = window._cqqRows||[];
  rows.forEach(function(r){
    addRow(newLI(r.desc, r.mc>0?'Security':'Labor', r.qty, r.unit, r.mc, r.mc===0?1:0));
  });
  renderLI(); calcTotals();
  // Turn off CQQ toggle after append
  var cb=document.getElementById('cqq-enabled'); if(cb) cb.checked=false; toggleCQQ();
  // Flash confirm
  var flash=document.getElementById('tlib-appended-flash');
  if(flash){flash.style.display='inline';setTimeout(function(){flash.style.display='none';},2000);}
  goPage('qq');
}

// =============================================
// SERVICE CONTRACT OFFER
// =============================================
var _svcTier = null; // 'basic' | 'standard' | 'premium'

var SVC_TIERS = [
  { id:'basic',    label:'Basic',    pct:0.05, color:'#546e7a',
    includes:['Annual system inspection','Phone support (business hours)','Health check report'] },
  { id:'standard', label:'Standard', pct:0.07, color:'#1565c0',
    includes:['Annual inspection + 1 service visit','Remote monitoring support','Priority scheduling','Health check report'] },
  { id:'premium',  label:'Premium',  pct:0.10, color:'#4a148c',
    includes:['2 site visits per year','24/7 priority response','Parts coverage (cameras/hardware)','Annual system upgrade review'] }
];

function toggleServiceContract() {
  var cb    = document.getElementById('svc-enabled');
  var body  = document.getElementById('svc-body');
  var label = document.getElementById('svc-toggle-label');
  if (!cb||!body) return;
  var on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent=on?'YES':'NO'; label.className='toggle-value-label'+(on?' on':''); }
  if (on) renderSvcTiers();
  else _svcTier=null;
}

function renderSvcTiers() {
  var grid    = document.getElementById('svc-tier-grid');
  var rateEl  = document.getElementById('svc-rate');
  var totalEl = document.getElementById('ps-total');
  if (!grid) return;
  var rate    = parseFloat((rateEl||{}).value||7)/100;
  var total   = parseFloat(((totalEl||{}).textContent||'0').replace(/[^0-9.]/g,''))||0;

  grid.innerHTML = SVC_TIERS.map(function(tier){
    var annualPrice = total * (tier.pct * (rate / 0.07)); // scale by rate vs default 7%
    var isSelected  = _svcTier===tier.id;
    return '<div class="svc-card'+(isSelected?' selected':'')+'" onclick="selectSvcTier(\''+tier.id+'\')">'+
      '<div class="svc-card-tier">'+tier.label+'</div>'+
      '<div class="svc-card-price" style="color:'+tier.color+'">$'+Math.round(annualPrice)+'/yr</div>'+
      '<div class="svc-card-desc">'+tier.includes.map(function(i){ return '· '+i; }).join('<br>')+'</div>'+
    '</div>';
  }).join('');
  updateSvcInfo();
}

function selectSvcTier(id) {
  _svcTier = id;
  renderSvcTiers();
}

function updateSvcInfo() {
  var info = document.getElementById('svc-selected-info');
  if (!info) return;
  if (!_svcTier) { info.textContent=''; return; }
  var tier   = SVC_TIERS.find(function(t){ return t.id===_svcTier; });
  var termEl = document.getElementById('svc-term');
  var rateEl = document.getElementById('svc-rate');
  var total  = parseFloat(((document.getElementById('ps-total')||{}).textContent||'0').replace(/[^0-9.]/g,''))||0;
  var rate   = parseFloat((rateEl||{}).value||7)/100;
  var years  = parseInt((termEl||{}).value||1);
  var annualPrice = total * (tier.pct*(rate/0.07));
  info.textContent = tier.label+' plan selected — $'+Math.round(annualPrice)+'/yr × '+years+' year'+(years>1?'s':'');
}

function getSvcContractData() {
  if (!_svcTier) return null;
  var tier   = SVC_TIERS.find(function(t){ return t.id===_svcTier; });
  var termEl = document.getElementById('svc-term');
  var rateEl = document.getElementById('svc-rate');
  var total  = parseFloat(((document.getElementById('ps-total')||{}).textContent||'0').replace(/[^0-9.]/g,''))||0;
  var rate   = parseFloat((rateEl||{}).value||7)/100;
  var years  = parseInt((termEl||{}).value||1);
  return {
    tier:      tier.id,
    label:     tier.label,
    annualPct: rate,
    annual:    Math.round(total*(tier.pct*(rate/0.07))),
    term:      years,
    includes:  tier.includes
  };
}

// =============================================
// FOREMAN CLOSEOUT
// =============================================
var _closeoutDifficulty = 3;

function setDifficulty(n) {
  _closeoutDifficulty = n;
  document.querySelectorAll('.diff-btn').forEach(function(btn){
    btn.classList.toggle('active', parseInt(btn.getAttribute('data-diff'))===n);
  });
}

function openCloseout(jobId) {
  var job = DB.jobs.find(function(j){ return j.id==jobId; });
  if (!job) return;

  document.getElementById('co-job-id').value = jobId;
  var estHrs = parseFloat(job.estLaborHours||job.laborHours||0);
  var actHrs = parseFloat(job.actualLaborHours||0);

  // Job info banner
  var info = document.getElementById('closeout-job-info');
  if (info) info.innerHTML = '<strong>'+escHtml(job.name||'')+'</strong> &nbsp;·&nbsp; '+escHtml(job.customer||'')+(job.qnum?' &nbsp;·&nbsp; <span style="color:#1565c0">'+escHtml(job.qnum)+'</span>':'');

  // Pre-fill fields
  var estEl = document.getElementById('co-est-hrs'); if(estEl) estEl.value = estHrs.toFixed(1);
  var actEl = document.getElementById('co-act-hrs'); if(actEl) actEl.value = actHrs>0?actHrs:'';

  // Restore existing closeout if any
  var existing = job.closeout||{};
  var issueEl  = document.getElementById('co-issues');    if(issueEl)   issueEl.value   = existing.issues||'';
  var matEl    = document.getElementById('co-materials'); if(matEl)     matEl.value     = existing.materials||'';
  var fbEl     = document.getElementById('co-feedback');  if(fbEl)      fbEl.value      = existing.feedback||'';
  var techEl   = document.getElementById('co-tech');      if(techEl)    techEl.value    = existing.tech||job.assignedTo||'';
  var dateEl   = document.getElementById('co-date');      if(dateEl)    dateEl.value    = existing.date||new Date().toISOString().split('T')[0];

  _closeoutDifficulty = existing.difficulty||3;
  setDifficulty(_closeoutDifficulty);

  // Variance indicator
  updateCloseoutVariance();

  // Team datalist
  var tdl = document.getElementById('co-tech-list');
  if (tdl) tdl.innerHTML = DB.team.map(function(t){ return '<option value="'+escHtml(t.name)+'">'; }).join('');

  // Setup live variance update
  var actInput = document.getElementById('co-act-hrs');
  if (actInput) actInput.oninput = updateCloseoutVariance;

  openModal('modal-closeout');
}

function updateCloseoutVariance() {
  var estEl = document.getElementById('co-est-hrs');
  var actEl = document.getElementById('co-act-hrs');
  var varEl = document.getElementById('co-hrs-variance');
  if (!estEl||!actEl||!varEl) return;
  var est = parseFloat(estEl.value)||0;
  var act = parseFloat(actEl.value)||0;
  if (!act||!est) { varEl.textContent=''; return; }
  var diff = act-est;
  var pctV = (diff/est*100).toFixed(1);
  var color= diff>est*0.05?'#c62828':diff<-est*0.05?'#2e7d32':'#546e7a';
  varEl.innerHTML = '<span style="font-weight:700;color:'+color+'">'+(diff>0?'▲ Over ':'▼ Under ')+Math.abs(diff).toFixed(1)+' hrs ('+Math.abs(pctV)+'%)</span>';
}

function saveCloseout() {
  var jobId  = document.getElementById('co-job-id').value;
  var job    = DB.jobs.find(function(j){ return j.id==jobId; });
  if (!job) return;

  var actHrs = parseFloat(document.getElementById('co-act-hrs').value)||0;
  if (!actHrs) { showToast('Please enter the actual hours worked.','error'); return; }

  var closeoutData = {
    savedAt:    new Date().toISOString(),
    actHrs:     actHrs,
    estHrs:     parseFloat(document.getElementById('co-est-hrs').value)||0,
    issues:     document.getElementById('co-issues').value.trim(),
    materials:  document.getElementById('co-materials').value.trim(),
    difficulty: _closeoutDifficulty,
    feedback:   document.getElementById('co-feedback').value.trim(),
    tech:       document.getElementById('co-tech').value.trim(),
    date:       document.getElementById('co-date').value
  };
  closeoutData.variance    = closeoutData.estHrs>0 ? ((closeoutData.actHrs-closeoutData.estHrs)/closeoutData.estHrs*100).toFixed(1) : 0;
  closeoutData.varianceHrs = (closeoutData.actHrs - closeoutData.estHrs).toFixed(1);

  // Save to job record
  job.closeout          = closeoutData;
  job.actualLaborHours  = actHrs;
  if (job.status==='In Progress') job.status = 'Complete'; // auto-advance status

  saveDB();
  closeModal('modal-closeout');
  renderJobs();

  // Also update the linked quote if exists
  if (job.qid) {
    var q = DB.quotes.find(function(x){ return x.id===job.qid; });
    if (q) { q.closeout=closeoutData; saveDB(); }
  }

  showToast('Closeout saved! Variance: '+(closeoutData.variance>0?'+':'')+closeoutData.variance+'%','success',5000);
}

// ---- SETTINGS ----
function loadSettings() {
  const s = DB.settings || {};
  function sv(id,v){const el=document.getElementById(id);if(el)el.value=v||'';}
  sv('s-cname',s.cname);sv('s-cphone',s.cphone);sv('s-cemail',s.cemail);sv('s-caddr',s.caddr);sv('s-clic',s.clic);sv('s-cweb',s.cweb);sv('s-ctag',s.ctag);
  sv('s-lr',s.laborRate||100);sv('s-mk',s.targetMargin||35);sv('s-tx',s.taxRate||0);sv('s-vd',s.validDays||30);sv('s-pt',s.payTerms);sv('s-tc',s.tc);
  sv('s-followup-days', s.followupDays||7);
  sv('s-perdiem-markup', s.perDiemMarkup!==undefined ? s.perDiemMarkup : 15);
  sv('s-uname',s.uname);sv('s-utitle',s.utitle);sv('s-uphone',s.uphone);sv('s-uemail',s.uemail);
  // Geofence settings
  sv('s-office-addr', s.officeAddr||'');
  sv('s-clockin-reminder', s.clockInReminderTime||'');
  var gfCb  = document.getElementById('s-geofence-enforce');
  var gfLbl = document.getElementById('s-geofence-label');
  var gfNote= document.getElementById('geofence-status-note');
  if (gfCb) gfCb.checked = !!(s.geofenceEnforce);
  if (gfLbl) { gfLbl.textContent = s.geofenceEnforce ? 'ON' : 'OFF'; gfLbl.className = 'toggle-value-label' + (s.geofenceEnforce ? ' on' : ''); }
  if (gfNote) gfNote.innerHTML = s.geofenceEnforce
    ? '<span style="color:#c62828;font-weight:700">🔒 Hard mode ON</span> — techs are blocked if outside 500 ft of job site.'
    : 'Currently: <strong>Soft mode</strong> — GPS is captured and flagged but techs are never blocked.';
  // SendGrid email settings
  sv('s-sgfromname', s.sgFromName||'TCSS Proposals');
  sv('s-sgfrom',     s.sgFrom||'');
  sv('s-sgsubject',  s.sgSubject||'Your Proposal from TCSS — {quote_num}');
  sv('s-sgbody',     s.sgBody||'Please find attached your proposal for {job_name}. We appreciate the opportunity to earn your business.');
  // Show key placeholder but never expose the actual key
  var keyEl = document.getElementById('s-sgkey');
  if (keyEl) keyEl.placeholder = s.sgKey ? '••••••••••••••• (key saved — paste new key to replace)' : 'SG.xxxxxxxx — paste your API key here';
  // Update status badge
  var badge = document.getElementById('sendgrid-status-badge');
  if (badge) {
    if (s.sgKey) { badge.textContent = '✅ Connected'; badge.style.background='#e8f5e9'; badge.style.color='#2e7d32'; }
    else { badge.textContent = '⏳ API Key Required'; badge.style.background='#fff3e0'; badge.style.color='#e65100'; }
  }
  const cb=document.getElementById('company-badge'); if(cb) cb.textContent=(s.cname||'TCSS').substring(0,12);
  loadMarginFloors();
  applyLogoEverywhere(s.logoDataUrl || null);
  loadProposalDefaultsUI();
  loadJtAddendumsUI();
}
function saveSettings() {
  function gv(id){const el=document.getElementById(id);return el?el.value:'';}
  // Preserve fields not in the settings form (logo, favorites, usage tracking, etc.)
  DB.settings = Object.assign({}, DB.settings, {
    cname:gv('s-cname'),cphone:gv('s-cphone'),cemail:gv('s-cemail'),caddr:gv('s-caddr'),clic:gv('s-clic'),cweb:gv('s-cweb'),ctag:gv('s-ctag'),
    laborRate:parseFloat(gv('s-lr'))||100,targetMargin:parseFloat(gv('s-mk'))||35,taxRate:parseFloat(gv('s-tx'))||0,validDays:parseInt(gv('s-vd'))||30,payTerms:gv('s-pt'),tc:gv('s-tc'),
    followupDays:parseInt(gv('s-followup-days'))||7,
    perDiemMarkup:parseFloat(gv('s-perdiem-markup'))||0,
    uname:gv('s-uname'),utitle:gv('s-utitle'),uphone:gv('s-uphone'),uemail:gv('s-uemail')
  });
  saveDB();
  const cb=document.getElementById('company-badge');if(cb)cb.textContent=(DB.settings.cname||'TCSS').substring(0,12);
  showToast('Settings saved','success');
}

function saveSendGridSettings() {
  function gv(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var newKey = gv('s-sgkey');
  DB.settings = DB.settings || {};
  // Only update key if a new one was pasted (don't clear existing key if field left blank)
  if (newKey && newKey.startsWith('SG.')) DB.settings.sgKey = newKey;
  else if (newKey && !newKey.startsWith('SG.')) { showToast('Invalid API key — must start with SG.','error'); return; }
  DB.settings.sgFromName = gv('s-sgfromname') || 'TCSS Proposals';
  DB.settings.sgFrom     = gv('s-sgfrom');
  DB.settings.sgSubject  = gv('s-sgsubject') || 'Your Proposal from TCSS — {quote_num}';
  DB.settings.sgBody     = gv('s-sgbody');
  saveDB();
  loadSettings();
  showToast('Email settings saved','success');
}

async function sendViaSendGrid(toEmail, toName, subject, bodyText, htmlBody) {
  var key = (DB.settings||{}).sgKey;
  if (!key) { showToast('SendGrid API key not configured — go to Settings → Email Settings','error',4000); return false; }
  var fromEmail = (DB.settings.sgFrom||'').trim() || 'quotes@tcss.com';
  var fromName  = (DB.settings.sgFromName||'TCSS Proposals').trim();
  try {
    var res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: toName||'' }] }],
        from: { email: fromEmail, name: fromName },
        subject: subject,
        content: [
          { type: 'text/plain', value: bodyText },
          { type: 'text/html',  value: htmlBody || bodyText.replace(/\n/g,'<br>') }
        ]
      })
    });
    if (res.status === 202) { return true; }
    var errData = await res.json().catch(function(){ return {}; });
    var errMsg = (errData.errors && errData.errors[0] && errData.errors[0].message) || ('Status ' + res.status);
    showToast('Email failed: ' + errMsg, 'error', 5000);
    console.error('[SendGrid] Error:', errData);
    return false;
  } catch(e) {
    showToast('Email error: ' + e.message, 'error', 4000);
    console.error('[SendGrid] Exception:', e);
    return false;
  }
}

async function testSendGridEmail() {
  var key = (DB.settings||{}).sgKey;
  if (!key) { showToast('Save your API key first','error'); return; }
  var testTo = (DB.settings.sgFrom||DB.settings.cemail||DB.settings.uemail||'').trim();
  if (!testTo) { showToast('Add a From Email address first so we know where to send the test','error'); return; }
  showToast('Sending test email...','info',2000);
  var ok = await sendViaSendGrid(testTo, 'TCSS Test', 'ProBid Email Test ✅', 'Your SendGrid integration is working! Emails from ProBid will be delivered successfully.', '<h2 style="color:#1565c0">✅ ProBid Email Test</h2><p>Your SendGrid integration is working correctly.<br>Quotes sent from ProBid will be delivered to your customers.</p>');
  if (ok) showToast('Test email sent to ' + testTo + ' — check your inbox','success',5000);
}

// ---- EXPORT/IMPORT DATA ----
// =============================================
// IMPORT / EXPORT — CATALOG, TEMPLATES, BACKUP
// =============================================

function parseCSV(text) {
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(function(l){ return l.trim(); });
  return lines.map(function(line){
    const cols=[]; let cur=''; let inQ=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i];
      if (ch==='"') { if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
      else if (ch===','&&!inQ) { cols.push(cur.trim()); cur=''; }
      else cur+=ch;
    }
    cols.push(cur.trim()); return cols;
  });
}
function toCSVRow(arr) {
  return arr.map(function(v){ const s=(v===null||v===undefined)?'':String(v); return s.includes(',')||s.includes('"')||s.includes('\n')?'"'+s.replace(/"/g,'""')+'"':s; }).join(',');
}
function downloadCSV(filename, rows) {
  const csv=rows.map(toCSVRow).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function showImportResult(elId, success, message) {
  const el=document.getElementById(elId); if(!el) return;
  el.style.display='block';
  el.style.background=success?'#e8f5e9':'#ffebee';
  el.style.border=success?'1px solid #a5d6a7':'1px solid #ef9a9a';
  el.style.color=success?'#2e7d32':'#c62828';
  el.textContent=message;
  setTimeout(function(){el.style.display='none';},7000);
}

// ---- CATALOG EXPORT ----
function exportCatalogCSV() {
  const rows=[['id','name','category','unit','material_cost','labor_hours']];
  (DB.catalog||[]).forEach(function(i){ rows.push([i.id||'',i.name||'',i.cat||'',i.unit||'ea',i.mc!==undefined?i.mc:0,i.lh!==undefined?i.lh:0]); });
  downloadCSV('tcss-catalog-'+new Date().toISOString().split('T')[0]+'.csv', rows);
}

// ---- CATALOG IMPORT ----
function handleCatalogImport(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try {
      const parsed=parseCSV(e.target.result);
      if(parsed.length<2){showImportResult('catalog-import-result',false,'File appears empty — need header + at least one row.');return;}
      const hdr=parsed[0].map(function(h){return h.toLowerCase().replace(/[^a-z0-9]/g,'_');});
      const col=function(row,name){const i=hdr.indexOf(name);return i>=0?row[i]||'':''};
      const missing=['name','category','unit'].filter(function(r){return !hdr.includes(r);});
      if(missing.length){showImportResult('catalog-import-result',false,'Missing columns: '+missing.join(', '));input.value='';return;}
      const items=[]; let seq=1; const usedIds=new Set();
      parsed.slice(1).forEach(function(row){
        if(row.every(function(c){return !c.trim();}))return;
        const name=col(row,'name').trim(); if(!name)return;
        let id=col(row,'id').trim();
        if(!id||usedIds.has(id)){id='ci'+(Date.now()+seq);}
        usedIds.add(id);
        items.push({id,name,cat:col(row,'category').trim()||'General',unit:col(row,'unit').trim()||'ea',mc:parseFloat(col(row,'material_cost'))||0,lh:parseFloat(col(row,'labor_hours'))||0});
        seq++;
      });
      if(!items.length){showImportResult('catalog-import-result',false,'No valid items found.');input.value='';return;}
      if(!confirm('Import '+items.length+' catalog items? This REPLACES your current catalog ('+((DB.catalog||[]).length)+' items). Quotes are not affected.')){input.value='';return;}
      DB.catalog=items; DB.catalogVersion='custom-'+Date.now(); saveDB(); input.value='';
      showImportResult('catalog-import-result',true,'✓ Imported '+items.length+' catalog items successfully.');
    } catch(err){showImportResult('catalog-import-result',false,'Parse error: '+err.message);input.value='';}
  };
  reader.readAsText(file);
}

// ---- TEMPLATES EXPORT ----
function exportTemplatesCSV() {
  const rows=[['template_id','template_name','icon','category','environment','margin','item_desc','item_category','qty','unit','mat_cost','labor_hrs']];
  (DB.templates||[]).forEach(function(t){
    const items=t.items||[];
    if(!items.length){rows.push([t.id||'',t.name||'',t.icon||'📐',t.cat||'Custom',t.env||'office',t.margin||35,'','',1,'ea',0,0]);}
    else items.forEach(function(item){rows.push([t.id||'',t.name||'',t.icon||'📐',t.cat||'Custom',t.env||'office',t.margin||35,item.desc||'',item.cat||'',item.qty||1,item.unit||'ea',item.mc||0,item.lh||0]);});
  });
  downloadCSV('tcss-templates-'+new Date().toISOString().split('T')[0]+'.csv', rows);
}

// ---- TEMPLATES IMPORT ----
function handleTemplatesImport(input) {
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try {
      const parsed=parseCSV(e.target.result);
      if(parsed.length<2){showImportResult('templates-import-result',false,'File appears empty.');return;}
      const hdr=parsed[0].map(function(h){return h.toLowerCase().replace(/[^a-z0-9]/g,'_');});
      const col=function(row,name){const i=hdr.indexOf(name);return i>=0?row[i]||'':''};
      const missing=['template_name','category'].filter(function(r){return !hdr.includes(r);});
      if(missing.length){showImportResult('templates-import-result',false,'Missing columns: '+missing.join(', '));input.value='';return;}
      const tplMap={}; const tplOrder=[]; let autoSeq=1;
      parsed.slice(1).forEach(function(row){
        if(row.every(function(c){return !c.trim();}))return;
        const tName=col(row,'template_name').trim(); if(!tName)return;
        let tId=col(row,'template_id').trim()||('ti'+tName.replace(/\W+/g,'').toLowerCase().substring(0,8)+autoSeq);
        const key=tId||tName;
        if(!tplMap[key]){
          tplMap[key]={id:tId||(Date.now().toString()+autoSeq),name:tName,icon:col(row,'icon').trim()||'📐',cat:col(row,'category').trim()||'Custom',env:col(row,'environment').trim()||'office',margin:parseFloat(col(row,'margin'))||35,items:[]};
          tplOrder.push(key); autoSeq++;
        }
        const itemDesc=col(row,'item_desc').trim();
        if(itemDesc) tplMap[key].items.push({desc:itemDesc,cat:col(row,'item_category').trim()||tplMap[key].cat,qty:parseFloat(col(row,'qty'))||1,unit:col(row,'unit').trim()||'ea',mc:parseFloat(col(row,'mat_cost'))||0,lh:parseFloat(col(row,'labor_hrs'))||0});
      });
      const templates=tplOrder.map(function(k){return tplMap[k];});
      if(!templates.length){showImportResult('templates-import-result',false,'No valid templates found.');input.value='';return;}
      const summary=templates.slice(0,5).map(function(t){return t.name+' ('+t.items.length+' items)';}).join('\n')+(templates.length>5?'\n+ '+(templates.length-5)+' more...':'');
      if(!confirm('Import '+templates.length+' templates?\n\n'+summary+'\n\nReplaces current templates ('+(DB.templates||[]).length+'). Quotes unaffected. Continue?')){input.value='';return;}
      DB.templates=templates; saveDB(); input.value='';
      if(typeof renderTplLibrary==='function') renderTplLibrary();
      if(typeof renderTemplates==='function') renderTemplates();
      const totalItems=templates.reduce(function(s,t){return s+t.items.length;},0);
      showImportResult('templates-import-result',true,'✓ Imported '+templates.length+' templates ('+totalItems+' total line items). Template Library updated.');
    } catch(err){showImportResult('templates-import-result',false,'Parse error: '+err.message);input.value='';}
  };
  reader.readAsText(file);
}

// ---- FULL JSON BACKUP / RESTORE ----
function exportData() {
  const json=JSON.stringify(DB,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tcss-probid-backup-'+new Date().toISOString().split('T')[0]+'.json'; a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function importData() {
  const input=document.getElementById('import-file'); if(!input) return;
  input.onchange=function(e){
    const file=e.target.files[0]; if(!file) return;
    if(!confirm('Restore from backup? This REPLACES all current data — quotes, jobs, customers, catalog, templates, settings. Cannot be undone. Continue?')){input.value='';return;}
    const reader=new FileReader();
    reader.onload=function(ev){
      try {
        const data=JSON.parse(ev.target.result);
        DB=Object.assign({quotes:[],customers:[],contacts:[],jobs:[],team:[],catalog:[],templates:[],settings:{},marginFloors:{},inventory:[],checkoutLog:[],tools:[],toolCheckouts:[],quoteSeq:1000,jobSeq:1,invSeq:1,toolSeq:1},data);
        saveDB();
        input.value='';
        if (_sb && _currentUser) {
          showToast('Backup restored — pushing to cloud...','info');
          pushAllToCloud().then(function() {
            localStorage.setItem('_skipNextPull', '1');
            showToast('Pushed to cloud ✓','success');
            location.reload();
          }).catch(function() {
            showToast('Backup restored locally','success'); location.reload();
          });
        } else {
          showToast('Backup restored','success'); location.reload();
        }
      } catch(err){showToast('Error reading backup: '+err.message,'error');input.value='';}
    };
    reader.readAsText(file);
  };
  input.click();
}
function clearData() {
  if(!confirm('CLEAR ALL DATA?\n\nPermanently deletes ALL quotes, jobs, customers, contacts, catalog, templates, and settings.\n\nThis CANNOT be undone.')) return;
  if(!confirm('Last warning — everything will be gone. Are you absolutely sure?')) return;
  localStorage.removeItem(DB_KEY); showToast('All data cleared','info'); location.reload();
}

// ---- PROJECT ENVIRONMENT HANDLER ----
let _envManualOverride = false;
function onEnvChange() {
  const env = (document.getElementById('qq-env')||{}).value || 'office';
  const preset = ENV_PRESETS[env];
  if (!preset) return;
  const mkEl = document.getElementById('qq-mk');
  const noteEl = document.getElementById('env-default-note');
  if (!_envManualOverride && mkEl) {
    mkEl.value = preset.margin;
    if (noteEl) noteEl.classList.add('visible');
    _envManualOverride = false;
  } else {
    if (noteEl) noteEl.classList.remove('visible');
  }
  calcTotals();
}
function onMarginManualChange() {
  _envManualOverride = true;
  const noteEl = document.getElementById('env-default-note');
  if (noteEl) noteEl.classList.remove('visible');
  // Re-render line items so per-line Unit Mat Sell reflects the new rate
  renderLI();
  calcTotals();
}

// ---- UPDATE LINE ITEM ----
function updateLI(id, field, value, rerender) {
  var numId = typeof id === 'string' ? parseInt(id) : id;
  var item = lineItems.find(function(x){ return x._id === numId || x._id === id; });
  if (!item) return;
  if (field==='qty'||field==='mc'||field==='lh') {
    item[field] = parseFloat(value)||0;
    if (rerender) renderLI(); // only re-render when explicitly requested (on blur)
  } else {
    item[field] = value; // text fields: just update data, don't re-render (preserves focus)
  }
  calcTotals();
}


// ---- SEED CATALOG & TEMPLATES ----
const CATALOG_VERSION = 'v8.2'; // bump this whenever seed data changes

function seedCatalogAndTemplates() {
  // Force reseed if catalog is empty OR on a version mismatch (upgrades)
  if (DB.catalog && DB.catalog.length > 0 && DB.catalogVersion === CATALOG_VERSION) return;
  const cats = [
    // ── Structured Wiring ──────────────────────────────────────────
    {id:'c1', name:'CAT6 Cable (per 1000ft)',            cat:'Structured Wiring', unit:'roll', mc:85,   lh:0},
    {id:'c2', name:'CAT6 Jack Keystone',                 cat:'Structured Wiring', unit:'ea',   mc:4.5,  lh:0.15},
    {id:'c3', name:'CAT6 Patch Panel 24-Port',           cat:'Structured Wiring', unit:'ea',   mc:55,   lh:1.0},
    {id:'c4', name:'CAT6 Patch Cable 5ft',               cat:'Structured Wiring', unit:'ea',   mc:5,    lh:0.05},
    {id:'c5', name:'Structured Wiring Panel 14"',        cat:'Structured Wiring', unit:'ea',   mc:55,   lh:1.5},
    {id:'c6', name:'Low Voltage Bracket',                cat:'Structured Wiring', unit:'ea',   mc:2.5,  lh:0.1},
    {id:'c7', name:'Decora Wall Plate (1-port)',         cat:'Structured Wiring', unit:'ea',   mc:1.8,  lh:0.05},
    {id:'c8', name:'Decora Wall Plate (2-port)',         cat:'Structured Wiring', unit:'ea',   mc:2.25, lh:0.05},
    {id:'c9', name:'Decora Wall Plate (3-port)',         cat:'Structured Wiring', unit:'ea',   mc:2.75, lh:0.05},
    {id:'c10',name:'Coax Keystone (F-type)',             cat:'Structured Wiring', unit:'ea',   mc:3.5,  lh:0.1},
    {id:'c11',name:'Voice/Data Outlet — 1V/2D',         cat:'Structured Wiring', unit:'ea',   mc:18,   lh:0.75},
    {id:'c12',name:'Voice/Data Outlet — 1V/2D/1Coax',  cat:'Structured Wiring', unit:'ea',   mc:24,   lh:0.9},
    {id:'c13',name:'Data Outlet — 2 Data',              cat:'Structured Wiring', unit:'ea',   mc:14,   lh:0.6},
    {id:'c14',name:'Data Outlet — 4 Data',              cat:'Structured Wiring', unit:'ea',   mc:22,   lh:0.85},
    {id:'c15',name:'Velcro Cable Tie (50pk)',            cat:'Structured Wiring', unit:'pkg',  mc:8,    lh:0},
    {id:'c16',name:'Cable Staples / J-Hook (100pk)',     cat:'Structured Wiring', unit:'pkg',  mc:12,   lh:0},
    // ── Fiber ──────────────────────────────────────────────────────
    {id:'c17',name:'Fiber — Single Mode OS2 (per 1000ft)',cat:'Fiber',           unit:'roll', mc:145,  lh:0},
    {id:'c18',name:'Fiber — Multimode OM3 (per 1000ft)', cat:'Fiber',            unit:'roll', mc:195,  lh:0},
    {id:'c19',name:'Fiber Patch Cable SM 3ft (LC-LC)',   cat:'Fiber',            unit:'ea',   mc:12,   lh:0.1},
    {id:'c20',name:'Fiber Patch Cable MM 3ft (LC-LC)',   cat:'Fiber',            unit:'ea',   mc:10,   lh:0.1},
    {id:'c21',name:'Fiber Media Converter (SM)',         cat:'Fiber',            unit:'ea',   mc:55,   lh:0.5},
    {id:'c22',name:'Fiber Splice Enclosure',             cat:'Fiber',            unit:'ea',   mc:85,   lh:1.5},
    {id:'c23',name:'Fiber Patch Panel 12-Port',          cat:'Fiber',            unit:'ea',   mc:65,   lh:1.0},
    // ── Networking ─────────────────────────────────────────────────
    {id:'c24',name:'Network Switch 8-Port',              cat:'Networking',       unit:'ea',   mc:65,   lh:0.5},
    {id:'c25',name:'Network Switch 24-Port',             cat:'Networking',       unit:'ea',   mc:180,  lh:1.0},
    {id:'c26',name:'PoE Switch 8-Port',                  cat:'Networking',       unit:'ea',   mc:110,  lh:0.75},
    {id:'c27',name:'PoE+ Switch 16-Port',                cat:'Networking',       unit:'ea',   mc:245,  lh:0.75},
    {id:'c28',name:'PoE+ Managed Switch 24-Port (1U)',   cat:'Networking',       unit:'ea',   mc:485,  lh:1.0},
    {id:'c29',name:'Wireless Access Point',              cat:'Networking',       unit:'ea',   mc:185,  lh:1.5},
    // ── Security / Cameras ─────────────────────────────────────────
    {id:'c30',name:'IP Camera Indoor Dome 4MP',          cat:'Security',         unit:'ea',   mc:95,   lh:1.5},
    {id:'c31',name:'IP Camera Outdoor Bullet 4MP',       cat:'Security',         unit:'ea',   mc:115,  lh:2.0},
    {id:'c32',name:'IP Camera Outdoor Turret 4MP',       cat:'Security',         unit:'ea',   mc:125,  lh:2.0},
    {id:'c33',name:'NVR 8-Channel 4K',                   cat:'Security',         unit:'ea',   mc:280,  lh:2.5},
    {id:'c34',name:'NVR 16-Channel 4K',                  cat:'Security',         unit:'ea',   mc:420,  lh:3.0},
    {id:'c35',name:'2TB Surveillance HDD',               cat:'Security',         unit:'ea',   mc:75,   lh:0.25},
    {id:'c36',name:'Camera Cable RG59+Power',            cat:'Security',         unit:'ft',   mc:0.35, lh:0.01},
    {id:'c37',name:'Camera Mounting Bracket',            cat:'Security',         unit:'ea',   mc:18,   lh:0.25},
    {id:'c38',name:'Verkada CD62 Outdoor Camera',        cat:'Security',         unit:'ea',   mc:429,  lh:2.0},
    {id:'c39',name:'Verkada CD42 Indoor Dome Camera',    cat:'Security',         unit:'ea',   mc:349,  lh:1.5},
    {id:'c40',name:'Verkada CMD Bridge',                 cat:'Security',         unit:'ea',   mc:299,  lh:1.0},
    {id:'c41',name:'Verkada License - 1yr (per camera)', cat:'Security',         unit:'ea',   mc:149,  lh:0},
    // ── Access Control ─────────────────────────────────────────────
    {id:'c42',name:'Access Control Panel 2-Door',        cat:'Access Control',   unit:'ea',   mc:320,  lh:4.0},
    {id:'c43',name:'Card Reader Proximity',              cat:'Access Control',   unit:'ea',   mc:85,   lh:1.5},
    {id:'c44',name:'Magnetic Lock 600lb',                cat:'Access Control',   unit:'ea',   mc:95,   lh:2.0},
    {id:'c45',name:'Electric Strike Fail-Secure',        cat:'Access Control',   unit:'ea',   mc:120,  lh:2.5},
    {id:'c46',name:'Door Sensor Contact',                cat:'Access Control',   unit:'ea',   mc:18,   lh:0.5},
    {id:'c47',name:'REX Motion Sensor',                  cat:'Access Control',   unit:'ea',   mc:35,   lh:0.5},
    {id:'c48',name:'Verkada AC41 Access Controller (2-Door)',cat:'Access Control',unit:'ea',  mc:599,  lh:3.0},
    {id:'c49',name:'Verkada Card Reader',                cat:'Access Control',   unit:'ea',   mc:189,  lh:1.5},
    {id:'c50',name:'Verkada Access License - 1yr (per door)',cat:'Access Control',unit:'ea',  mc:99,   lh:0},
    // ── Infrastructure ─────────────────────────────────────────────
    {id:'c51',name:'Wall-Mount Server Rack 12U',         cat:'Infrastructure',   unit:'ea',   mc:285,  lh:2.0},
    {id:'c52',name:'1U Rackmount Power Strip (PDU)',      cat:'Infrastructure',   unit:'ea',   mc:95,   lh:0.5},
    {id:'c53',name:'1U Cable Management Ring',           cat:'Infrastructure',   unit:'ea',   mc:28,   lh:0.25},
    {id:'c54',name:'UPS Battery Backup 1500VA (1U)',      cat:'Infrastructure',   unit:'ea',   mc:295,  lh:0.75},
    // ── Labor ──────────────────────────────────────────────────────
    {id:'c55',name:'General Labor',                      cat:'Labor',            unit:'hr',   mc:0,    lh:1.0},
    {id:'c56',name:'Service Call (First Hour)',          cat:'Labor',            unit:'ea',   mc:0,    lh:1.0},
    {id:'c57',name:'Programming / Configuration',        cat:'Labor',            unit:'hr',   mc:0,    lh:1.0},
    {id:'c58',name:'Termination Labor (per point)',      cat:'Labor',            unit:'ea',   mc:0,    lh:0.25},
  ];
  DB.catalog = cats;

  DB.templates = [
    // ── Structured Wiring ──────────────────────────────────────────
    { id:'t1', name:'Outlet Config — 1 Voice / 2 Data', icon:'🔌', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'Low Voltage Bracket',           cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.5,  lh:0.1},
        {desc:'Decora Wall Plate (3-port)',     cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.75, lh:0.05},
        {desc:'CAT6 Jack Keystone',            cat:'Structured Wiring',qty:2, unit:'ea',   mc:4.5,  lh:0.15},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1, unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:0.75}
      ]},
    { id:'t2', name:'Outlet Config — 1 Voice / 2 Data / 1 Coax', icon:'🔌', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'Low Voltage Bracket',           cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.5,  lh:0.1},
        {desc:'Decora Wall Plate (3-port)',     cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.75, lh:0.05},
        {desc:'CAT6 Jack Keystone',            cat:'Structured Wiring',qty:2, unit:'ea',   mc:4.5,  lh:0.15},
        {desc:'Coax Keystone (F-type)',        cat:'Structured Wiring',qty:1, unit:'ea',   mc:3.5,  lh:0.1},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1, unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:0.9}
      ]},
    { id:'t3', name:'Outlet Config — 2 Data', icon:'🔌', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'Low Voltage Bracket',           cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.5,  lh:0.1},
        {desc:'Decora Wall Plate (2-port)',     cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.25, lh:0.05},
        {desc:'CAT6 Jack Keystone',            cat:'Structured Wiring',qty:2, unit:'ea',   mc:4.5,  lh:0.15},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1, unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:0.6}
      ]},
    { id:'t4', name:'Outlet Config — 4 Data', icon:'🔌', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'Low Voltage Bracket',           cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.5,  lh:0.1},
        {desc:'Decora Wall Plate (3-port)',     cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.75, lh:0.05},
        {desc:'CAT6 Jack Keystone',            cat:'Structured Wiring',qty:4, unit:'ea',   mc:4.5,  lh:0.15},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:2, unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:0.85}
      ]},
    { id:'t5', name:'Cat6 Home Run — Single Drop', icon:'📡', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1, unit:'roll', mc:85,   lh:0},
        {desc:'CAT6 Jack Keystone',            cat:'Structured Wiring',qty:1, unit:'ea',   mc:4.5,  lh:0.15},
        {desc:'Low Voltage Bracket',           cat:'Structured Wiring',qty:1, unit:'ea',   mc:2.5,  lh:0.1},
        {desc:'Termination Labor (per point)', cat:'Labor',            qty:2, unit:'ea',   mc:0,    lh:0.25}
      ]},
    { id:'t6', name:'Fiber Run — Single Mode OS2', icon:'💡', cat:'Structured Wiring', env:'office', margin:42,
      items:[
        {desc:'Fiber — Single Mode OS2 (per 1000ft)',cat:'Fiber',     qty:1, unit:'roll', mc:145,  lh:0},
        {desc:'Fiber Splice Enclosure',        cat:'Fiber',            qty:2, unit:'ea',   mc:85,   lh:1.5},
        {desc:'Fiber Patch Cable SM 3ft (LC-LC)',cat:'Fiber',          qty:2, unit:'ea',   mc:12,   lh:0.1},
        {desc:'General Labor',                 cat:'Labor',            qty:4, unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t7', name:'Patch Panel Termination — 24 Port', icon:'🔧', cat:'Structured Wiring', env:'office', margin:40,
      items:[
        {desc:'CAT6 Patch Panel 24-Port',       cat:'Structured Wiring',qty:1, unit:'ea',  mc:55,   lh:1.0},
        {desc:'1U Cable Management Ring',       cat:'Infrastructure',   qty:1, unit:'ea',  mc:28,   lh:0.25},
        {desc:'Termination Labor (per point)',  cat:'Labor',            qty:24,unit:'ea',  mc:0,    lh:0.25}
      ]},
    // ── Security / Cameras ─────────────────────────────────────────
    { id:'t8', name:'Security — 4 Camera System', icon:'📷', cat:'Security', env:'office', margin:38,
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',  cat:'Security',         qty:4, unit:'ea',   mc:115,  lh:2.0},
        {desc:'NVR 8-Channel 4K',              cat:'Security',         qty:1, unit:'ea',   mc:280,  lh:2.5},
        {desc:'2TB Surveillance HDD',          cat:'Security',         qty:1, unit:'ea',   mc:75,   lh:0.25},
        {desc:'Camera Cable RG59+Power',       cat:'Security',         qty:400,unit:'ft',  mc:0.35, lh:0.01},
        {desc:'Camera Mounting Bracket',       cat:'Security',         qty:4, unit:'ea',   mc:18,   lh:0.25},
        {desc:'General Labor',                 cat:'Labor',            qty:6, unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t9', name:'Security — 8 Camera System', icon:'🎥', cat:'Security', env:'office', margin:38,
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',  cat:'Security',         qty:6, unit:'ea',   mc:115,  lh:2.0},
        {desc:'IP Camera Indoor Dome 4MP',     cat:'Security',         qty:2, unit:'ea',   mc:95,   lh:1.5},
        {desc:'NVR 16-Channel 4K',             cat:'Security',         qty:1, unit:'ea',   mc:420,  lh:3.0},
        {desc:'2TB Surveillance HDD',          cat:'Security',         qty:2, unit:'ea',   mc:75,   lh:0.25},
        {desc:'PoE Switch 8-Port',             cat:'Security',         qty:1, unit:'ea',   mc:110,  lh:0.75},
        {desc:'Camera Cable RG59+Power',       cat:'Security',         qty:800,unit:'ft',  mc:0.35, lh:0.01},
        {desc:'Camera Mounting Bracket',       cat:'Security',         qty:8, unit:'ea',   mc:18,   lh:0.25},
        {desc:'General Labor',                 cat:'Labor',            qty:10,unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t10',name:'Verkada — 4 Camera System', icon:'📸', cat:'Security', env:'office', margin:40,
      items:[
        {desc:'Verkada CD62 Outdoor Camera',   cat:'Security',         qty:4, unit:'ea',   mc:429,  lh:2.0},
        {desc:'Verkada CMD Bridge',            cat:'Security',         qty:1, unit:'ea',   mc:299,  lh:1.0},
        {desc:'Verkada License - 1yr (per camera)',cat:'Security',     qty:4, unit:'ea',   mc:149,  lh:0},
        {desc:'PoE Switch 8-Port',             cat:'Security',         qty:1, unit:'ea',   mc:110,  lh:0.5},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1,unit:'roll', mc:85,   lh:0},
        {desc:'Camera Mounting Bracket',       cat:'Security',         qty:4, unit:'ea',   mc:18,   lh:0.25},
        {desc:'General Labor - Config & Commission',cat:'Labor',       qty:4, unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t11',name:'Verkada — 8 Camera + Access (2 Door)', icon:'🏢', cat:'Security', env:'office', margin:42,
      items:[
        {desc:'Verkada CD62 Outdoor Camera',   cat:'Security',         qty:6, unit:'ea',   mc:429,  lh:2.0},
        {desc:'Verkada CD42 Indoor Dome Camera',cat:'Security',        qty:2, unit:'ea',   mc:349,  lh:1.5},
        {desc:'Verkada CMD Bridge',            cat:'Security',         qty:1, unit:'ea',   mc:299,  lh:1.0},
        {desc:'Verkada License - 1yr (per camera)',cat:'Security',     qty:8, unit:'ea',   mc:149,  lh:0},
        {desc:'Verkada AC41 Access Controller (2-Door)',cat:'Access Control',qty:1,unit:'ea',mc:599,lh:3.0},
        {desc:'Verkada Card Reader',           cat:'Access Control',   qty:2, unit:'ea',   mc:189,  lh:1.5},
        {desc:'Verkada Access License - 1yr (per door)',cat:'Access Control',qty:2,unit:'ea',mc:99, lh:0},
        {desc:'Magnetic Lock 600lb',           cat:'Access Control',   qty:2, unit:'ea',   mc:95,   lh:2.0},
        {desc:'PoE+ Switch 16-Port',           cat:'Networking',       qty:1, unit:'ea',   mc:245,  lh:0.75},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:2,unit:'roll', mc:85,   lh:0},
        {desc:'General Labor - Config & Commission',cat:'Labor',       qty:8, unit:'hr',   mc:0,    lh:1.0}
      ]},
    // ── Access Control ─────────────────────────────────────────────
    { id:'t12',name:'Access Control — 2 Door', icon:'🚪', cat:'Access Control', env:'office', margin:40,
      items:[
        {desc:'Access Control Panel 2-Door',   cat:'Access Control',   qty:1, unit:'ea',   mc:320,  lh:4.0},
        {desc:'Card Reader Proximity',         cat:'Access Control',   qty:2, unit:'ea',   mc:85,   lh:1.5},
        {desc:'Magnetic Lock 600lb',           cat:'Access Control',   qty:2, unit:'ea',   mc:95,   lh:2.0},
        {desc:'Door Sensor Contact',           cat:'Access Control',   qty:2, unit:'ea',   mc:18,   lh:0.5},
        {desc:'REX Motion Sensor',             cat:'Access Control',   qty:2, unit:'ea',   mc:35,   lh:0.5},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:1,unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:4, unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t13',name:'Access Control — 4 Door', icon:'🚪', cat:'Access Control', env:'office', margin:40,
      items:[
        {desc:'Access Control Panel 2-Door',   cat:'Access Control',   qty:2, unit:'ea',   mc:320,  lh:4.0},
        {desc:'Card Reader Proximity',         cat:'Access Control',   qty:4, unit:'ea',   mc:85,   lh:1.5},
        {desc:'Magnetic Lock 600lb',           cat:'Access Control',   qty:4, unit:'ea',   mc:95,   lh:2.0},
        {desc:'Door Sensor Contact',           cat:'Access Control',   qty:4, unit:'ea',   mc:18,   lh:0.5},
        {desc:'REX Motion Sensor',             cat:'Access Control',   qty:4, unit:'ea',   mc:35,   lh:0.5},
        {desc:'CAT6 Cable (per 1000ft)',        cat:'Structured Wiring',qty:2,unit:'roll', mc:85,   lh:0},
        {desc:'General Labor',                 cat:'Labor',            qty:8, unit:'hr',   mc:0,    lh:1.0}
      ]},
    // ── Infrastructure ─────────────────────────────────────────────
    { id:'t14',name:'IDF Rack Buildout — Full', icon:'🖥️', cat:'Infrastructure', env:'mixed', margin:38,
      items:[
        {desc:'Wall-Mount Server Rack 12U',    cat:'Infrastructure',   qty:1, unit:'ea',   mc:285,  lh:2.0},
        {desc:'CAT6 Patch Panel 24-Port',       cat:'Structured Wiring',qty:2,unit:'ea',   mc:65,   lh:1.0},
        {desc:'1U Rackmount Power Strip (PDU)', cat:'Infrastructure',   qty:1, unit:'ea',   mc:95,   lh:0.5},
        {desc:'1U Cable Management Ring',       cat:'Infrastructure',   qty:2, unit:'ea',   mc:28,   lh:0.25},
        {desc:'PoE+ Managed Switch 24-Port (1U)',cat:'Networking',      qty:1, unit:'ea',   mc:485,  lh:1.0},
        {desc:'UPS Battery Backup 1500VA (1U)', cat:'Infrastructure',   qty:1, unit:'ea',   mc:295,  lh:0.75},
        {desc:'Fiber Patch Panel 12-Port',      cat:'Fiber',            qty:1, unit:'ea',   mc:65,   lh:1.0},
        {desc:'CAT6 Patch Cable 5ft (bundle)', cat:'Structured Wiring',qty:1, unit:'lot',  mc:55,   lh:0.5},
        {desc:'General Labor - Rack Build & Dress',cat:'Labor',        qty:6, unit:'hr',   mc:0,    lh:1.0}
      ]},
    // ── Service ────────────────────────────────────────────────────
    { id:'t15',name:'Service Call — Troubleshoot', icon:'🔧', cat:'Service', env:'office', margin:42,
      items:[
        {desc:'Service Call (First Hour)',     cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:1.0},
        {desc:'General Labor',                cat:'Labor',            qty:1, unit:'hr',   mc:0,    lh:1.0}
      ]},
    { id:'t16',name:'Service Call — Network Troubleshoot', icon:'🌐', cat:'Service', env:'office', margin:42,
      items:[
        {desc:'Service Call (First Hour)',     cat:'Labor',            qty:1, unit:'ea',   mc:0,    lh:1.0},
        {desc:'Programming / Configuration',  cat:'Labor',            qty:1, unit:'hr',   mc:0,    lh:1.0},
        {desc:'CAT6 Patch Cable 5ft',          cat:'Structured Wiring',qty:2, unit:'ea',   mc:5,    lh:0.05}
      ]}
  ];
  DB.catalogVersion = CATALOG_VERSION;
}

// ---- EVENT DELEGATION ----
document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  const id = el.getAttribute('data-id');
  const modal = el.getAttribute('data-modal');

  switch(action) {
    case 'newQuote': clearQQ(true); goPage('qq'); break;
    case 'saveQQ': saveQQ(); break;
    case 'clearQQ': clearQQ(); break;
    case 'previewQQ': previewQQ(); break;
    case 'startEditSummary':   startEditSummary(); break;
    case 'applySummary':       applySummary(); break;
    case 'cancelEditSummary':  cancelEditSummary(); break;
    case 'resetSummary':       resetSummary(); break;
    case 'printInternal': printInternal(); break;
    case 'emailQuote': emailQuote(); break;
    case 'emailQuoteQQ': emailQuoteQQ(); break;
    case 'emailSavedQuote': emailSavedQuote(id); break;
    case 'emailFromView': if(_viewingQuoteId) emailSavedQuote(_viewingQuoteId); break;
    case 'addRow': addRow(); break;
    case 'delRow': delRow(id); break;
    case 'openCatalog': openCatalog(); break;
    case 'addFromCatalog': addFromCatalog(); break;
    case 'addCatToQQ': addCatToQQ(id); break;
    case 'loadTemplate': loadTemplate(id); break;
    // V5 Phase 1
    case 'addEquipRow': addEquipRow(); break;
    case 'delEquipRow': delEquipRow(id); break;
    case 'saveMarginFloors': saveMarginFloors(); break;
    case 'removeLogo': removeLogo(); break;
    // V6 Phase 2
    case 'newToolItem':    newToolItem(); break;
    case 'saveToolItem':   saveToolItem(); break;
    case 'editTool':       editTool(id); break;
    case 'delTool':        delTool(id); break;
    case 'checkoutTool':   checkoutTool(id); break;
    case 'checkinTool':    checkinTool(id); break;
    case 'saveCloseout':   saveCloseout(); break;
    case 'cqqAppend':      cqqAppend(); break;
    case 'convertToJob': openConvertToJob(id); break;
    case 'confirmConvertJob': confirmConvertJob(); break;
    case 'snoozeFollowup': snoozeFollowup(id); break;
    case 'goJobsPage': goPage('jobs'); break;
    // V8 Phase 4 — Inventory
    case 'newInventoryItem':   newInventoryItem(); break;
    case 'editInventoryItem':  editInventoryItem(id); break;
    case 'saveInventoryItem':  saveInventoryItem(); break;
    case 'delInventoryItem':   delInventoryItem(id); break;
    case 'checkoutItem':       checkoutItem(id); break;
    case 'confirmCheckout':    confirmCheckout(); break;
    case 'checkinItem':        checkinItem(id); break;
    case 'exportInventoryCSV': exportInventoryCSV(); break;
    // Template Library
    case 'exportReportCSV': exportReportCSV(); break;
    case 'saveAsTemplate': saveAsTemplate(); break;
    case 'confirmSaveAsTemplate': confirmSaveAsTemplate(); break;
    case 'appendSelectedTemplates': appendSelectedTemplates(); break;
    case 'clearTemplateSelection':  clearTemplateSelection(); break;
    case 'clearTlibSearch':         clearTlibSearch(); break;
    case 'editQuote': editQuote(id); break;
    case 'dupQuote': dupQuote(id); break;
    case 'viewQuote': viewQuote(id); break;
    case 'deleteQuote': deleteQuote(id); break;
    case 'copyPortalLink': copyPortalLink(id); break;
    case 'refreshQuotes': renderQuotes(); break;
    case 'refreshDash': renderDash(); break;
    case 'editFromView': closeModal('modal-view-quote'); if(_viewingQuoteId) editQuote(_viewingQuoteId); break;
    case 'dupFromView': closeModal('modal-view-quote'); if(_viewingQuoteId) dupQuote(_viewingQuoteId); break;
    case 'previewFromView': closeModal('modal-view-quote'); if(_viewingQuoteId) { const q=DB.quotes.find(function(x){return x.id==_viewingQuoteId}); if(q){ _previewQuoteData=q; _refreshPreview(q); _updateSummaryBadge(q); openModal('modal-preview'); } } break;
    case 'exportCSV': exportCSV(); break;
    case 'newCustomer': newCustomer(); break;
    case 'editCustomer': editCustomer(id); break;
    case 'saveCustomer': saveCustomer(); break;
    case 'delCustomer': delCustomer(id); break;
    case 'newContact': newContact(); break;
    case 'editContact': editContact(id); break;
    case 'saveContact': saveContact(); break;
    case 'delContact': delContact(id); break;
    case 'newTeamMember': newTeamMember(); break;
    case 'editTeamMember': editTeamMemberV2(id); break;
    case 'inviteTeamMember': sendInviteToMember(id); break;
    case 'saveTeamMember': saveTeamMember(); break;
    case 'delTeamMember': delTeamMember(id); break;
    case 'newJob': newJob(); break;
    case 'editJob': editJob(id); break;
    case 'saveJob': saveJob(); break;
    case 'openCloseout': openCloseout(id); break;
    case 'delJob': delJob(id); break;
    case 'newCatalogItem': newCatalogItem(); break;
    case 'editCatalogItem': editCatalogItem(id); break;
    case 'saveCatalogItem': saveCatalogItem(); break;
    case 'delCatalogItem': delCatalogItem(id); break;
    case 'togglePriceUpdateMode': togglePriceUpdateMode(); break;
    case 'savePriceUpdates': savePriceUpdates(); break;
    case 'newTemplate': newTemplate(); break;
    case 'editTemplate': editTemplate(id); break;
    case 'saveTemplate': saveTemplate(); break;
    case 'delTemplate': delTemplate(id); break;
    case 'tmgmtDuplicate': tmgmtDuplicate(id); break;
    case 'addTplRow': addTplRow(); break;
    case 'delTplRow': delTplRow(id); break;
    case 'saveSettings': saveSettings(); break;
    case 'exportData': exportData(); break;
    case 'importData': importData(); break;
    case 'clearData':  clearData(); break;
    case 'exportCatalogCSV':   exportCatalogCSV(); break;
    case 'exportTemplatesCSV': exportTemplatesCSV(); break;
    case 'closeModal': if(modal) closeModal(modal); break;
    default: break;
  }
});

// Close modal by clicking overlay
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Photo thumbnail click handler — uses data-photo-key to avoid base64 in onclick attrs
document.addEventListener('click', function(e) {
  var img = e.target.closest('[data-photo-key]');
  if (img) {
    var key = img.getAttribute('data-photo-key');
    var caption = img.getAttribute('data-photo-caption')||'';
    viewPhotoById(key, caption);
  }
});

// Navigation
document.addEventListener('click', function(e) {
  const ni = e.target.closest('[data-page]');
  if (ni && ni.classList.contains('nav-item')) {
    goPage(ni.getAttribute('data-page'));
  }
});

// Re-render line item row when user tabs out of a numeric field
document.addEventListener('blur', function(e) {
  var el = e.target;
  if (el.hasAttribute('data-li') && el.hasAttribute('data-field')) {
    var field = el.getAttribute('data-field');
    if (field === 'qty' || field === 'mc' || field === 'lh') {
      updateLI(el.getAttribute('data-li'), field, el.value, true); // re-render on blur
    }
  }
}, true); // capture phase so blur fires on inputs

// Line item input changes (event delegation)
document.addEventListener('input', function(e) {
  const el = e.target;
  if (el.hasAttribute('data-li') && el.hasAttribute('data-field')) {
    // Pass false — don't re-render on every keystroke (preserves focus for all fields)
    updateLI(el.getAttribute('data-li'), el.getAttribute('data-field'), el.value, false);
    return;
  }
  // Template item row
  if (el.hasAttribute('data-tplidx') && el.hasAttribute('data-tplf')) {
    const idx = parseInt(el.getAttribute('data-tplidx'));
    const f = el.getAttribute('data-tplf');
    if (tplItems[idx]) {
      if (f==='qty'||f==='mc'||f==='lh') tplItems[idx][f] = parseFloat(el.value)||0;
      else tplItems[idx][f] = el.value;
    }
    return;
  }
  // V5: Equipment row inputs
  if (el.hasAttribute('data-eqfield') && el.hasAttribute('data-eqid')) {
    const eqid = parseInt(el.getAttribute('data-eqid'));
    const eqf = el.getAttribute('data-eqfield');
    const row = equipmentRows.find(function(r){ return r._id === eqid; });
    if (row) {
      if (eqf === 'days' || eqf === 'dailyRate') row[eqf] = parseFloat(el.value)||0;
      else row[eqf] = el.value;
      // Auto-fill daily rate when type changes (handled in change event)
    }
    calcTotals();
    return;
  }
  // V6: actual hours input on job card
  if (e.target.classList.contains('actual-hrs-input')) {
    const jid = e.target.getAttribute('data-jobid');
    const job = DB.jobs.find(function(j){ return j.id == jid; });
    if (job) { job.actualLaborHours = parseFloat(e.target.value)||0; saveDB(); renderJobs(); }
    return;
  }
  // V6: per diem inputs
  const pdIds = ['pd-men','pd-days','pd-rate','pd-rooms','pd-nights','pd-lodging-rate','pd-trips','pd-travel-rate','pd-travel-desc'];
  if (pdIds.indexOf(el.id) !== -1) { calcPerDiem(); calcTotals(); return; }
  if (el.id === 'lumpsum-label') { updateLumpSumPreview(); return; }
  // Pricing inputs on QQ page
  const pricingIds = ['qq-lr','qq-tx','qq-disc'];
  if (pricingIds.indexOf(el.id) !== -1) { calcTotals(); return; }
  if (el.id === 'qq-mk') { onMarginManualChange(); return; }
  if (el.id === 'qq-env') { _envManualOverride = false; onEnvChange(); return; }
  // Search/filter on quotes/catalog
  if (el.id === 'cat-search' || el.id === 'cat-filter') renderCatalog();
  if (el.id === 'cp-search') renderCPick();
  if (el.id === 'tlib-search') tlibOnSearch(el.value);
  if (el.id === 'tlib-sort')   renderTplLibrary();
  if (el.id === 'tmgmt-search') { _tmgmtSearch = el.value; _buildTmgmtList(); }
  if (el.id === 'inv-search') renderInventory();
});

// Job status select and actual hours — event delegation via change/input
document.addEventListener('change', function(e) {
  if (e.target.id === 'qq-env') { _envManualOverride = false; onEnvChange(); }
  if (e.target.id === 'qq-mk') { onMarginManualChange(); }
  if (e.target.id === 'cat-filter') renderCatalog();
  if (e.target.id === 'cp-cat') renderCPick();
  if (e.target.id === 'rpt-date-filter') renderReports();
  if (e.target.id === 'tlib-sort') renderTplLibrary();
  if (e.target.id === 'tmgmt-sort') _buildTmgmtList();
  if (e.target.id === 'inv-cat-filter' || e.target.id === 'inv-loc-filter') renderInventory();
  if (e.target.id === 'permit-lv' || e.target.id === 'permit-elec' || e.target.id === 'permit-other' || e.target.id === 'permit-none') {
    updatePermitStatus();
  }
  if (e.target.hasAttribute('data-eqfield') && e.target.getAttribute('data-eqfield') === 'type') {
    const eqid = parseInt(e.target.getAttribute('data-eqid'));
    const row = equipmentRows.find(function(r){ return r._id === eqid; });
    if (row) {
      row.type = e.target.value;
      const typeInfo = EQUIPMENT_TYPES.find(function(t){ return t.id === e.target.value; });
      if (typeInfo && typeInfo.daily > 0) {
        row.dailyRate = typeInfo.daily;
        const rateInput = document.querySelector('[data-eqfield="dailyRate"][data-eqid="'+eqid+'"]');
        if (rateInput) rateInput.value = typeInfo.daily;
      }
      calcTotals();
    }
  }
  if (e.target.id === 'qq-jt') { calcTotals(); }
  // V6: job status change from job card
  if (e.target.classList.contains('job-status-select')) {
    const jid = e.target.getAttribute('data-jobid');
    const job = DB.jobs.find(function(j){ return j.id == jid; });
    if (job) { job.status = e.target.value; saveDB(); renderJobs(); renderDash(); }
  }
  // V6: job filter
  if (e.target.id === 'job-filter-status') renderJobs();
});

// Click on catalog picker row toggles checkbox
document.addEventListener('click', function(e) {
  const row = e.target.closest('.cpick-row');
  if (row) {
    const cb = row.querySelector('input[type=checkbox]');
    if (cb && e.target !== cb) cb.checked = !cb.checked;
  }
});

// =============================================
// V6 PHASE 2: FOLLOW-UP DATE HELPERS
// =============================================
function getFollowupDays() {
  return parseInt(DB.settings.followupDays) || 7;
}
function calcFollowupDate(quoteDateStr) {
  const d = quoteDateStr ? new Date(quoteDateStr) : new Date();
  d.setDate(d.getDate() + getFollowupDays());
  return d.toISOString().split('T')[0];
}
function isFollowupDue(q) {
  if (!q.followupDate) return false;
  if (q.status === 'approved' || q.status === 'declined') return false;
  return q.followupDate <= new Date().toISOString().split('T')[0];
}
function isFollowupOverdue(q) {
  if (!q.followupDate) return false;
  if (q.status === 'approved' || q.status === 'declined') return false;
  const today = new Date().toISOString().split('T')[0];
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  return q.followupDate < threeDaysAgo.toISOString().split('T')[0];
}

// =============================================
// V6 PHASE 2: CONVERT QUOTE TO JOB (upgraded in CRM module)
// =============================================
function openConvertToJob(qid) {
  prepareConvertModal(qid);
  openModal('modal-convert-job');
}

// confirmConvertJob is defined in CRM MODULE above

// =============================================
// V6 PHASE 2: JOBS PAGE - CARD VIEW
// =============================================
function renderJobs() {
  var search = ((document.getElementById('job-search')||{}).value||'').toLowerCase();
  var filter = (document.getElementById('job-filter-status')||{}).value||'';
  var sort   = (document.getElementById('job-sort')||{}).value||'date-desc';

  var list = DB.jobs.slice();

  // Summary strip
  function setS(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  setS('js-total',     DB.jobs.length);
  setS('js-scheduled', DB.jobs.filter(function(j){ return j.status==='Scheduled'; }).length);
  setS('js-active',    DB.jobs.filter(function(j){ return j.status==='In Progress'; }).length);
  setS('js-onhold',    DB.jobs.filter(function(j){ return j.status==='On Hold'; }).length);
  var totalVal = DB.jobs.reduce(function(s,j){ return s+(j.estTotal||0); },0);
  setS('js-value',    '$'+Math.round(totalVal).toLocaleString());
  setS('js-invoiced', (DB.invoices||[]).length);

  // Search
  if (search) list = list.filter(function(j){
    return (j.name||'').toLowerCase().includes(search)||
           (j.customer||'').toLowerCase().includes(search)||
           (j.address||'').toLowerCase().includes(search)||
           (j.num||'').toLowerCase().includes(search)||
           (j.assignedTo||'').toLowerCase().includes(search);
  });

  // Filter
  if (filter) list = list.filter(function(j){ return j.status===filter; });

  // Sort
  list.sort(function(a,b){
    if (sort==='date-desc')    return (b.createdAt||'').localeCompare(a.createdAt||'');
    if (sort==='date-asc')     return (a.createdAt||'').localeCompare(b.createdAt||'');
    if (sort==='name-asc')     return (a.name||'').localeCompare(b.name||'');
    if (sort==='customer-asc') return (a.customer||'').localeCompare(b.customer||'');
    if (sort==='value-desc')   return (b.estTotal||0)-(a.estTotal||0);
    if (sort==='scheduled')    return (a.scheduledDate||'9999').localeCompare(b.scheduledDate||'9999');
    return 0;
  });

  var cont = document.getElementById('jobs-list');
  if (!cont) return;

  if (!list.length) {
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:#90a4ae">'+
      (search||filter?'No jobs match your search.':'No jobs yet. Convert a won quote or create one manually.')+
    '</div>';
    return;
  }

  // Column header
  var header = '<div style="display:grid;grid-template-columns:2fr 1.2fr 0.8fr 0.8fr 0.8fr auto;gap:12px;padding:8px 14px;border-bottom:2px solid #e8e8e8;background:#f8f9fa;border-radius:8px 8px 0 0">'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Job</span>'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Customer</span>'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Status</span>'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Scheduled</span>'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Value</span>'+
    '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">Actions</span>'+
  '</div>';

  var rows = list.map(function(j){
    var statusColors = {
      'Scheduled':  {bg:'#e3f2fd',color:'#1565c0'},
      'In Progress':{bg:'#e8f5e9',color:'#2e7d32'},
      'On Hold':    {bg:'#fff3e0',color:'#e65100'},
      'Complete':   {bg:'#f5f5f5',color:'#546e7a'},
      'Closed':     {bg:'#f5f5f5',color:'#546e7a'},
    };
    var sc = statusColors[j.status]||{bg:'#f5f5f5',color:'#546e7a'};

    // WT progress
    var wtProj = (DB.wtProjects||[]).find(function(p){ return p.jobId===j.id; });
    var wtPct = null;
    if (wtProj) {
      var items=(DB.wtItems||[]).filter(function(i){return i.projectId===wtProj.id;});
      var done=items.filter(function(i){return i.status==='done';}).length;
      wtPct=items.length?Math.round(done/items.length*100):0;
    }

    // Crew badges
    var crew = (j.crew||[]);
    var lead = j.assignedTo||'';
    var crewHtml = lead
      ? '<span style="font-size:11px;color:#546e7a">👷 '+escHtml(lead)+(crew.length>1?' +'+( crew.length-1):'')+'</span>'
      : '<span style="font-size:11px;color:#d0d0d0">Unassigned</span>';

    // Customer name — resolve from customers table if job.customer is empty
    var custName = j.customer || '';
    if (!custName && j.customerId) {
      var custLookup = (DB.customers||[]).find(function(c){ return c.id===j.customerId; });
      if (custLookup) custName = custLookup.name || '';
    }
    var custLink = j.customerId
      ? '<a href="#" onclick="openCustomerProfile(\''+j.customerId+'\');return false" style="color:#1565c0;text-decoration:none;font-size:13px;font-weight:600">'+escHtml(custName)+'</a>'
      : (custName ? '<span style="font-size:13px;color:#0d1b2a;font-weight:600">'+escHtml(custName)+'</span>'
                  : '<span style="font-size:12px;color:#d0d0d0">No customer</span>');

    var estH = parseFloat(j.estLaborHours)||0;
    var actH = parseFloat(j.actualLaborHours)||0;
    var varHtml = '';
    if (actH>0 && estH>0) {
      var vp = ((actH-estH)/estH*100).toFixed(0);
      var vc = actH>estH*1.05?'#c62828':actH<estH*0.95?'#2e7d32':'#546e7a';
      varHtml = '<span style="font-size:10px;color:'+vc+';">'+(parseFloat(vp)>0?'+':'')+vp+'%</span>';
    }

    return '<div style="display:grid;grid-template-columns:2fr 1.2fr 0.8fr 0.8fr 0.8fr auto;gap:12px;padding:12px 14px;border-bottom:1px solid #f0f0f0;align-items:center;transition:background .1s" onmouseover="this.style.background=\'#f8f9fa\'" onmouseout="this.style.background=\'\'">'+
      // Job name + meta
      '<div>'+
        '<div style="font-weight:700;font-size:14px;color:#0d1b2a">'+escHtml(j.name||'')+'</div>'+
        '<div style="font-size:11px;color:#90a4ae;margin-top:2px">'+
          (j.num?escHtml(j.num)+' · ':'')+
          crewHtml+
          (j.address?' · 📍'+escHtml(j.address.split(',')[0]):'')+ 
        '</div>'+
        (wtPct!==null?'<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'+
          '<div class="wt-progress-bar" style="width:80px;height:4px"><div class="wt-progress-fill" style="width:'+wtPct+'%;height:4px"></div></div>'+
          '<span style="font-size:10px;color:#1565c0;font-weight:700">'+wtPct+'%</span>'+
        '</div>':'')+
      '</div>'+
      // Customer
      '<div>'+custLink+'</div>'+
      // Status
      '<div>'+
        '<span style="background:'+sc.bg+';color:'+sc.color+';border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700">'+escHtml(j.status||'')+'</span>'+
      '</div>'+
      // Scheduled date
      '<div style="font-size:12px;color:#546e7a">'+
        (j.scheduledDate?'📅 '+j.scheduledDate:'<span style="color:#d0d0d0">—</span>')+
        (j.scheduledTime?'<div style="font-size:11px;color:#90a4ae">⏱ '+j.scheduledTime+'</div>':'')+
      '</div>'+
      // Value + hours
      '<div>'+
        '<div style="font-weight:700;font-size:13px;color:#2e7d32">'+fmt(j.estTotal||0)+'</div>'+
        (estH?'<div style="font-size:11px;color:#90a4ae">'+estH.toFixed(1)+'h est '+varHtml+'</div>':'')+
      '</div>'+
      // Actions
      '<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">'+
        '<button class="btn btn-outline btn-sm" onclick="openDispatchDetail(\''+j.id+'\')" title="Dispatch Board">🗂</button>'+
        (wtProj?'<button class="btn btn-outline btn-sm" onclick="loadWTProject(\''+wtProj.id+'\');goPage(\'worktracking\')" title="Work Tracking">✅</button>':'')+
        '<button class="btn btn-sm" onclick="var _j=(DB.jobs||[]).find(function(x){return x.id===\''+j.id+'\'});if(_j)openInvoiceModal(_j);" style="background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;font-weight:700" title="Generate Invoice">🧾 Invoice</button>'+
        '<button class="btn btn-outline btn-sm" data-action="editJob" data-id="'+j.id+'" title="Edit">✏</button>'+
        '<button class="btn btn-danger btn-sm" data-action="delJob" data-id="'+j.id+'" title="Delete">✕</button>'+
        (j.status==='Complete'||j.status==='Closed'?
          '<button class="btn btn-outline btn-sm" data-action="openCloseout" data-id="'+j.id+'" title="Closeout">📋</button>':'')
      +'</div>'+
    '</div>';
  }).join('');

  cont.innerHTML = header + rows;
}

// =============================================
// V6 PHASE 2: ALERTS ENGINE
// =============================================
function buildAlerts() {
  const alerts = [];
  const today = new Date().toISOString().split('T')[0];

  DB.quotes.forEach(function(q) {
    // Follow-ups due
    if (isFollowupDue(q)) {
      const overdue = isFollowupOverdue(q);
      alerts.push({
        type: overdue ? 'red' : 'orange',
        msg: (overdue ? '🔴 Overdue follow-up: ' : '📅 Follow-up due: ') + escHtml(q.cn||'') + ' — ' + escHtml(q.jn||'') + ' (' + (q.followupDate||'') + ')',
        action: 'editQuote', id: q.id
      });
    }
    // Low margin quotes still open
    if ((q.status === 'draft' || q.status === 'sent') && q.pricingHealth === 'Low') {
      alerts.push({ type: 'orange', msg: '⚠️ Low margin quote: ' + escHtml(q.num||'') + ' — ' + escHtml(q.cn||''), action: 'editQuote', id: q.id });
    }
  });

  DB.jobs.forEach(function(j) {
    // Jobs in progress with no actual hours logged
    if (j.status === 'In Progress' && (!j.actualLaborHours || j.actualLaborHours === 0)) {
      alerts.push({ type: 'blue', msg: '🔧 Job in progress, no hours logged: ' + escHtml(j.name||''), action: 'editJob', id: j.id });
    }
    // Jobs over estimated hours
    if (j.actualLaborHours > 0 && j.estLaborHours > 0 && j.actualLaborHours > j.estLaborHours * 1.1) {
      alerts.push({ type: 'red', msg: '⏱ Over estimate: ' + escHtml(j.name||'') + ' (' + j.actualLaborHours + 'h actual vs ' + j.estLaborHours + 'h est)', action: 'editJob', id: j.id });
    }
  });

  const bar = document.getElementById('dash-alert-bar');
  const list = document.getElementById('dash-alert-list');
  if (!bar || !list) return;
  if (alerts.length === 0) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  list.innerHTML = alerts.map(function(a) {
    return '<div class="alert-item" data-action="' + a.action + '" data-id="' + a.id + '"><span class="alert-dot ' + a.type + '"></span>' + a.msg + '</div>';
  }).join('');
}


// =============================================
// V6 PHASE 2: SNOOZE FOLLOW-UP
// =============================================
function snoozeFollowup(qid) {
  const q = DB.quotes.find(function(x){ return x.id==qid; });
  if (!q) return;
  const d = new Date(q.followupDate || new Date());
  d.setDate(d.getDate() + 3);
  q.followupDate = d.toISOString().split('T')[0];
  saveDB();
  renderDash();
}

// =============================================
// V6 PHASE 2: LOGO MANAGEMENT (carried from v5)
// =============================================
function initLogoUpload() {
  const input = document.getElementById('logo-file-input');
  if (!input) return;
  input.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Logo file must be under 2MB.','error'); return; }
    const reader = new FileReader();
    reader.onload = function(ev) {
      const dataUrl = ev.target.result;
      DB.settings.logoDataUrl = dataUrl;
      saveDB();
      applyLogoEverywhere(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    input.value = '';
  });

  // Drag & drop support
  const zone = document.getElementById('logo-drop-zone');
  if (zone) {
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor='#1976d2'; });
    zone.addEventListener('dragleave', function() { zone.style.borderColor=''; });
    zone.addEventListener('drop', function(e) {
      e.preventDefault();
      zone.style.borderColor = '';
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) { showToast('Please drop an image file.','error'); return; }
      if (file.size > 2 * 1024 * 1024) { showToast('Logo file must be under 2MB.','error'); return; }
      const reader = new FileReader();
      reader.onload = function(ev) {
        DB.settings.logoDataUrl = ev.target.result;
        saveDB();
        applyLogoEverywhere(ev.target.result);
      };
      reader.readAsDataURL(file);
    });
  }
}

function applyLogoEverywhere(dataUrl) {
  // 1. Sidebar
  const icon = document.getElementById('sidebar-logo-icon');
  const imgWrap = document.getElementById('sidebar-logo-img-wrap');
  const img = document.getElementById('sidebar-logo-img');
  const textBlock = document.getElementById('sidebar-logo-text-block');
  if (dataUrl) {
    if (icon) icon.style.display = 'none';
    if (img) img.src = dataUrl;
    if (imgWrap) imgWrap.style.display = 'block';
    if (textBlock) textBlock.style.display = 'none';
  } else {
    if (icon) icon.style.display = 'flex';
    if (imgWrap) imgWrap.style.display = 'none';
    if (textBlock) textBlock.style.display = '';
  }

  // 2. Settings preview panels
  const settIconPrev = document.getElementById('settings-logo-icon-prev');
  const settImgPrev = document.getElementById('settings-logo-img-prev');
  const propIconPrev = document.getElementById('settings-prop-icon-prev');
  const propImgPrev = document.getElementById('settings-prop-img-prev');

  if (dataUrl) {
    if (settIconPrev) settIconPrev.style.display = 'none';
    if (settImgPrev) { settImgPrev.src = dataUrl; settImgPrev.style.display = 'block'; }
    if (propIconPrev) propIconPrev.style.display = 'none';
    if (propImgPrev) { propImgPrev.src = dataUrl; propImgPrev.style.display = 'block'; }
  } else {
    if (settIconPrev) settIconPrev.style.display = 'flex';
    if (settImgPrev) settImgPrev.style.display = 'none';
    if (propIconPrev) propIconPrev.style.display = 'block';
    if (propImgPrev) propImgPrev.style.display = 'none';
  }

  // 3. Upload zone appearance
  const zone = document.getElementById('logo-drop-zone');
  const placeholder = document.getElementById('logo-upload-placeholder');
  const previewImg = document.getElementById('logo-preview-img');
  const removeBtn = document.getElementById('btn-remove-logo');
  if (dataUrl) {
    if (zone) zone.classList.add('has-logo');
    if (previewImg) { previewImg.src = dataUrl; previewImg.style.display = 'block'; }
    if (placeholder) placeholder.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'inline-flex';
  } else {
    if (zone) zone.classList.remove('has-logo');
    if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
    if (placeholder) placeholder.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function removeLogo() {
  if (!confirm('Remove the company logo?')) return;
  DB.settings.logoDataUrl = null;
  saveDB();
  applyLogoEverywhere(null);
}

function loadLogoOnStartup() {
  const dataUrl = DB.settings && DB.settings.logoDataUrl;
  if (dataUrl) applyLogoEverywhere(dataUrl);
}


