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
// PHASE 2 — LEAD TECH CONFIRMATION WORKFLOW (Q10, Q49, Q75)
// Parallel: lead tech OR back office can confirm, first locks it
// ============================================================
function switchWTView(view) {
  var tabMap = {structure:0,field:1,progress:2,confirm:3,reports:4,reworks:5};
  document.querySelectorAll('.wt-view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('#wt-view-tabs .inv-tab').forEach(function(t){ t.classList.remove('active'); });
  var viewEl = document.getElementById('wt-view-'+view);
  if (viewEl) viewEl.classList.add('active');
  var tabs = document.querySelectorAll('#wt-view-tabs .inv-tab');
  if (tabMap[view]!==undefined && tabs[tabMap[view]]) tabs[tabMap[view]].classList.add('active');
  if (view==='field')    renderWTFieldView();
  if (view==='progress') renderWTProgressView();
  if (view==='reworks')  renderWTReworksView();
  if (view==='confirm')  renderWTConfirmView();
  if (view==='reports')  renderWTReport('weekly');
  if (view==='structure') renderWTStructureView(_wtProjectId);
}

function renderWTConfirmView() {
  var el = document.getElementById('wt-confirm-list'); if(!el) return;
  var myRole = _currentUser ? _currentUser.role : '';
  var myName = _currentUser ? _currentUser.full_name : '';
  var isLeadOrAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office'||myRole==='lead_tech';
  if (!isLeadOrAdmin) {
    el.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">Lead tech or admin access required to confirm check-offs.</div>';
    return;
  }
  var pending = (DB.wtCheckoffs||[]).filter(function(c){
    return c.projectId===_wtProjectId && !c.confirmed;
  }).slice().reverse();
  if (!pending.length) {
    el.innerHTML='<div style="color:#2e7d32;font-weight:700;padding:16px;text-align:center">✓ All check-offs confirmed — nothing pending.</div>';
    return;
  }
  el.innerHTML = pending.map(function(c){
    var item = (DB.wtItems||[]).find(function(i){ return i.id===c.itemId; });
    var room = (DB.wtRooms||[]).find(function(r){ return r.id===c.roomId; });
    var bld  = (DB.wtBuildings||[]).find(function(b){ return b.id===c.buildingId; });
    var phLabels={rough:'Rough-in',device:'Devicing',test:'Test+Label'};
    var t = new Date(c.timestamp);
    var timeStr = t.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    return '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid #e0e0e0">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:13px">'+(item?escHtml(item.icon||'')+' '+escHtml(item.label||''):'Item')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+(bld?escHtml(bld.name)+' / ':'')+( room?escHtml(room.name):'')+' · <span class="wt-phase-pill '+c.phase+'" style="font-size:10px">'+escHtml(phLabels[c.phase]||c.phase)+'</span></div>'+
          '<div style="font-size:11px;color:#546e7a;margin-top:3px">By <strong>'+escHtml(c.techName||'')+'</strong> · '+timeStr+'</div>'+
          (c.note?'<div style="font-size:11px;color:#90a4ae;font-style:italic;margin-top:2px">'+escHtml(c.note)+'</div>':'')+
          (c.difficult?'<div style="font-size:10px;background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;margin-top:4px;display:inline-block">⚠ Flagged as difficult</div>':'')+
          (c.photoUrl?'<div style="margin-top:6px">'+photoThumb(c.photoUrl,'Check-off photo',40)+'</div>':'')+
        '</div>'+
        '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">'+
          '<button class="btn btn-success btn-sm" onclick="confirmCheckoff(\''+c.id+'\')">✓ Confirm</button>'+
          '<button class="btn btn-danger btn-sm" onclick="reopenCheckoff(\''+c.id+'\')">↩ Reopen</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
  // Update tab badge
  var tabs = document.querySelectorAll('#wt-view-tabs .inv-tab');
  if (tabs[3]) tabs[3].textContent = '✅ Confirm'+(pending.length?' ('+pending.length+')':'');
}

function confirmCheckoff(checkoffId) {
  var c=(DB.wtCheckoffs||[]).find(function(x){ return x.id===checkoffId; }); if(!c) return;
  c.confirmed=true;
  c.confirmedBy=_currentUser?_currentUser.full_name:'Lead';
  c.confirmedAt=new Date().toISOString();
  saveDB();
  renderWTConfirmView();
  showToast('Check-off confirmed ✓','success');
}

function reopenCheckoff(checkoffId) {
  var myRole = _currentUser?_currentUser.role:'';
  var isAdmin = myRole==='owner'||myRole==='back_office'||myRole==='manager';
  if (!isAdmin) { showToast('Only back office can reopen a check-off','error'); return; }
  var c=(DB.wtCheckoffs||[]).find(function(x){ return x.id===checkoffId; }); if(!c) return;
  var reason = prompt('Reason for reopening:')||'';
  c.confirmed=false; c.reopened=true; c.reopenReason=reason; c.reopenedBy=_currentUser?_currentUser.full_name:'Admin'; c.reopenedAt=new Date().toISOString();
  // Reset item phase status
  var item=(DB.wtItems||[]).find(function(i){ return i.id===c.itemId; });
  if(item&&item.phaseStatus) { item.phaseStatus[c.phase]='pending'; item.status='in_progress'; }
  saveDB();
  renderWTConfirmView();
  // Notify the tech
  addNotification('item_reopened','Item reopened: '+(item?item.label||'':''), 'Reason: '+(reason||'No reason given'));
  showToast('Check-off reopened — tech notified','info');
}

function confirmAllVisible() {
  var myName = _currentUser?_currentUser.full_name:'Lead';
  var pending=(DB.wtCheckoffs||[]).filter(function(c){ return c.projectId===_wtProjectId&&!c.confirmed; });
  var count=0;
  pending.forEach(function(c){
    if(!c.difficult) { // Don't auto-confirm difficult flags
      c.confirmed=true; c.confirmedBy=myName; c.confirmedAt=new Date().toISOString(); count++;
    }
  });
  saveDB();
  renderWTConfirmView();
  showToast(count+' check-offs confirmed','success');
}

// ============================================================
// PHASE 2 — QR CODE SCANNER (Q61: D)
// Scans room QR → jumps to that room's items in field view
// ============================================================
var _qrStream = null;
var _qrScanInterval = null;

function openQRScanner() {
  var overlay = document.getElementById('qr-scanner-overlay');
  if (!overlay) return;
  overlay.style.display='flex';
  var video = document.getElementById('qr-video');
  var status = document.getElementById('qr-status');
  if (!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) {
    if(status) status.textContent='Camera not available on this device.';
    return;
  }
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
    .then(function(stream){
      _qrStream=stream;
      if(video){ video.srcObject=stream; video.play(); }
      if(status) status.textContent='Ready — point at a room QR label';
      // QR decode requires jsQR library — load it dynamically
      if(!window.jsQR) {
        var script=document.createElement('script');
        script.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        script.onload=function(){ startQRScan(video,status); };
        document.head.appendChild(script);
      } else { startQRScan(video,status); }
    })
    .catch(function(){
      if(status) status.textContent='Camera access denied. Try typing the room number in search instead.';
    });
}

function startQRScan(video, status) {
  var canvas=document.createElement('canvas');
  var ctx=canvas.getContext('2d');
  clearInterval(_qrScanInterval);
  _qrScanInterval=setInterval(function(){
    if(!video||!video.videoWidth) return;
    canvas.width=video.videoWidth; canvas.height=video.videoHeight;
    ctx.drawImage(video,0,0);
    try{
      var imageData=ctx.getImageData(0,0,canvas.width,canvas.height);
      var code=window.jsQR(imageData.data,imageData.width,imageData.height);
      if(code&&code.data){
        clearInterval(_qrScanInterval);
        closeQRScanner();
        handleQRResult(code.data);
      }
    }catch(e){}
  },250);
}

function handleQRResult(data) {
  // QR code format: "TCSS-ROOM:{roomId}" or just a room name
  var roomId = null;
  if (data.startsWith('TCSS-ROOM:')) {
    roomId = data.replace('TCSS-ROOM:','').trim();
  } else {
    // Try to find room by name
    var room=(DB.wtRooms||[]).find(function(r){ return r.projectId===_wtProjectId&&r.name===data.trim(); });
    if(room) roomId=room.id;
  }
  if (roomId) {
    switchWTViewWithConfirm('field');
    var search=document.getElementById('wt-field-search');
    var room2=(DB.wtRooms||[]).find(function(r){ return r.id===roomId; });
    if(search&&room2) search.value=room2.name;
    renderWTFieldView();
    showToast('📍 Jumped to '+(room2?room2.name:roomId),'success');
  } else {
    showToast('QR code not recognized: '+data,'warning',4000);
  }
}

function closeQRScanner() {
  clearInterval(_qrScanInterval);
  if(_qrStream){ _qrStream.getTracks().forEach(function(t){ t.stop(); }); _qrStream=null; }
  var overlay=document.getElementById('qr-scanner-overlay');
  if(overlay) overlay.style.display='none';
}

// Generate QR code data string for a room (for printing labels)
function getRoomQRData(roomId) {
  return 'TCSS-ROOM:'+roomId;
}

// ============================================================
// PHASE 2 — EOD SUMMARY NOTIFICATION (Q77)
// ============================================================
function sendEODSummary() {
  var myName=_currentUser?_currentUser.full_name:'';
  var today=new Date().toISOString().split('T')[0];
  var myCheckoffs=(DB.wtCheckoffs||[]).filter(function(c){ return c.techName===myName&&c.timestamp&&c.timestamp.startsWith(today); });
  if(!myCheckoffs.length) return;
  addNotification('eod','End of Day Summary','You completed '+myCheckoffs.length+' check-offs today. Great work!');
}

// Wire EOD summary into doArriveBack
var _origDoArriveBack = doArriveBack;

// ============================================================
// PHASE 2 — OFFLINE ENHANCED VISUAL INDICATORS (Q67: D)
// Banner + header color when offline
// ============================================================
window.addEventListener('online',  function(){
  document.body.classList.remove('offline');
  _isOnline=true;
  checkOfflineStatus();
  flushOfflineQueue();
});
window.addEventListener('offline', function(){
  document.body.classList.add('offline');
  _isOnline=false;
  checkOfflineStatus();
});

// ============================================================
// PHASE 2 — INIT HOOKS
// ============================================================
function initPhase2() {
  applyDarkMode();
  updateNotifBadge();
  if (!navigator.onLine) document.body.classList.add('offline');
  startMorningDetection();
  // Check for pending confirmations — badge the confirm tab
  setTimeout(function(){
    if (_wtProjectId) renderWTConfirmView();
  }, 1000);
}

// ============================================================
// END PHASE 2
// ============================================================
// Spec: Q1-Q80 (TCSS-WorkTracking-MasterQA_R3.docx)
// Phase 1: Data model, project setup, structure, field check-off
// ============================================================

// Item templates per system type — rough-in / devicing / test+label phases
var WT_ITEM_TEMPLATES = {
  cat6:     [{label:'Cat6 Outlet', phases:['rough','device','test'], icon:'🔌'}],
  coax:     [{label:'Coax Outlet', phases:['rough','device','test'], icon:'📡'}],
  wifi:     [{label:'AP Drop',     phases:['rough','device','test'], icon:'📶'}],
  access:   [{label:'Door Reader', phases:['rough','device','test'], icon:'🚪'},{label:'Door Strike', phases:['rough','device','test'], icon:'🔒'}],
  cameras:  [{label:'Camera Drop', phases:['rough','device','test'], icon:'📷'}],
  intercoms:[{label:'Intercom Station', phases:['rough','device','test'], icon:'🔔'}],
  audio:    [{label:'Speaker Drop', phases:['rough','device','test'], icon:'🔊'}],
  tv:       [{label:'TV Drop',     phases:['rough','device','test'], icon:'📺'}],
  deadbolts:[{label:'Electronic Deadbolt', phases:['device','test'], icon:'🔐'}],
  fiber:    [{label:'Fiber Run',   phases:['rough','test'], icon:'🌐'}]
};

var _wtProjectId = null; // currently active project
var _wtWizardStep = 1;
var _wtWizardBuildings = [];

// ---- RENDER MAIN PAGE ----
function renderWorkTracking() {
  var projSel = document.getElementById('wt-project-select');
  if (projSel) {
    var prev = projSel.value;
    projSel.innerHTML = '<option value="">— Select a project —</option>';
    (DB.wtProjects||[]).forEach(function(p){
      var opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      projSel.appendChild(opt);
    });
    if (prev) { projSel.value = prev; if (projSel.value) loadWTProject(prev); }
  }
  renderWTProjectCards();
  if (_wtProjectId) loadWTProject(_wtProjectId);
}

function renderWTProjectCards() {
  var el = document.getElementById('wt-project-cards'); if (!el) return;
  var projects = DB.wtProjects||[];
  if (!projects.length) {
    el.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:12px 0">No projects yet. Click + New Project to get started.</div>';
    return;
  }
  el.innerHTML = projects.slice(0,6).map(function(p){
    var items = (DB.wtItems||[]).filter(function(i){ return i.projectId===p.id; });
    var done  = items.filter(function(i){ return i.status==='done'; }).length;
    var pct   = items.length ? Math.round(done/items.length*100) : 0;
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5;cursor:pointer" onclick="loadWTProject(\''+p.id+'\')">'+
      '<div>'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(p.name)+'</div>'+
        '<div style="font-size:11px;color:#546e7a">'+escHtml(p.customer||'')+(p.leadTech?' · '+escHtml(p.leadTech):'')+'</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-weight:700;font-size:13px;color:'+(pct===100?'#2e7d32':pct>0?'#e65100':'#90a4ae')+'">'+pct+'%</div>'+
        '<div style="font-size:10px;color:#90a4ae">'+done+'/'+items.length+' items</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function loadWTProject(projectId) {
  if (!projectId) return;
  _wtProjectId = projectId;
  var p = (DB.wtProjects||[]).find(function(x){ return x.id===projectId; });
  if (!p) return;

  // Show active project panel
  var activeEl = document.getElementById('wt-active-project');
  if (activeEl) activeEl.style.display='block';

  // Update header
  var nameEl = document.getElementById('wt-proj-name');
  if (nameEl) nameEl.textContent = p.name;
  var metaEl = document.getElementById('wt-proj-meta');
  if (metaEl) metaEl.textContent = (p.customer||'')+(p.leadTech?' · Lead: '+p.leadTech:'')+(p.startDate?' · Started: '+p.startDate:'');

  // Update project select
  var sel = document.getElementById('wt-project-select');
  if (sel) sel.value = projectId;

  // Phase progress bar
  renderWTPhaseBar(projectId);

  // Render current view
  renderWTStructureView(projectId);
}

function renderWTPhaseBar(projectId) {
  var el = document.getElementById('wt-phase-bar'); if (!el) return;
  var items = (DB.wtItems||[]).filter(function(i){ return i.projectId===projectId; });
  if (!items.length) { el.innerHTML=''; return; }

  function phasePct(phase) {
    var phItems = items.filter(function(i){ return i.phases && i.phases.indexOf(phase)>=0; });
    if (!phItems.length) return 0;
    var done = phItems.filter(function(i){ return (i.phaseStatus&&i.phaseStatus[phase])==='done'; }).length;
    return Math.round(done/phItems.length*100);
  }
  var roughPct  = phasePct('rough');
  var devicePct = phasePct('device');
  var testPct   = phasePct('test');
  var totalDone = items.filter(function(i){ return i.status==='done'; }).length;
  var totalPct  = Math.round(totalDone/items.length*100);

  el.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:4px">'+
      renderMiniPhaseBar('Rough-in',roughPct,'#1565c0')+
      renderMiniPhaseBar('Devicing',devicePct,'#6a1b9a')+
      renderMiniPhaseBar('Test+Label',testPct,'#2e7d32')+
      renderMiniPhaseBar('Overall',totalPct,'#0d1b2a')+
    '</div>';
}

function renderMiniPhaseBar(label, pct, color) {
  return '<div style="background:#f8f9fa;border-radius:8px;padding:8px 10px">'+
    '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px">'+label+'</div>'+
    '<div style="font-weight:800;font-size:16px;color:'+color+'">'+pct+'%</div>'+
    '<div class="wt-progress-bar"><div class="wt-progress-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
  '</div>';
}

// ---- STRUCTURE VIEW ----
function _switchWTViewBase(view) {
  document.querySelectorAll('.wt-view').forEach(function(v){ v.classList.remove('active'); });
  document.querySelectorAll('#wt-view-tabs .inv-tab').forEach(function(t){ t.classList.remove('active'); });
  var viewEl = document.getElementById('wt-view-'+view);
  if (viewEl) viewEl.classList.add('active');
  var tabMap = {structure:0,field:1,progress:2,confirm:3,reworks:4};
  var tabs = document.querySelectorAll('#wt-view-tabs .inv-tab');
  if (tabMap[view]!==undefined && tabs[tabMap[view]]) tabs[tabMap[view]].classList.add('active');
  if (view==='field')    renderWTFieldView();
  if (view==='progress') renderWTProgressView();
  if (view==='reworks')  renderWTReworksView();
  if (view==='structure') renderWTStructureView(_wtProjectId);
}

function renderWTStructureView(projectId) {
  var el = document.getElementById('wt-building-list'); if (!el) return;
  var buildings = (DB.wtBuildings||[]).filter(function(b){ return b.projectId===projectId; });
  if (!buildings.length) {
    el.innerHTML =
      '<div class="card" style="text-align:center;padding:24px">'+
        '<div style="font-size:40px;margin-bottom:8px">🏗</div>'+
        '<div style="font-weight:700;margin-bottom:4px">No buildings yet</div>'+
        '<div style="font-size:13px;color:#546e7a;margin-bottom:14px">Add your first building or structure to start building the project.</div>'+
        '<button class="btn btn-primary" onclick="openAddBuildingModal()">+ Add Building</button>'+
      '</div>';
    return;
  }
  el.innerHTML = buildings.map(function(b){ return renderWTBuilding(b); }).join('');
}

function renderWTBuilding(b) {
  var rooms  = (DB.wtRooms||[]).filter(function(r){ return r.buildingId===b.id; });
  var items  = (DB.wtItems||[]).filter(function(i){ return i.buildingId===b.id; });
  var done   = items.filter(function(i){ return i.status==='done'; }).length;
  var pct    = items.length ? Math.round(done/items.length*100) : 0;

  // Group rooms by floor
  var floorMap = {};
  rooms.forEach(function(r){
    var f = r.floor||'1';
    if (!floorMap[f]) floorMap[f]=[];
    floorMap[f].push(r);
  });

  var floorsHtml = Object.keys(floorMap).sort().map(function(floor){
    var floorRooms = floorMap[floor];
    return '<div class="wt-floor-section">'+
      '<div class="wt-floor-label">Floor '+escHtml(floor)+'</div>'+
      '<div>'+
      floorRooms.map(function(r){
        var rItems = (DB.wtItems||[]).filter(function(i){ return i.roomId===r.id; });
        var rDone  = rItems.filter(function(i){ return i.status==='done'; }).length;
        var rPart  = rItems.filter(function(i){ return i.status==='in_progress'; }).length;
        var cls    = rItems.length&&rDone===rItems.length?'done':rPart>0||rDone>0?'partial':'';
        var icon   = cls==='done'?'✓':cls==='partial'?'◐':'○';
        return '<span class="wt-room-chip '+cls+'" onclick="openRoomDetail(\''+r.id+'\')">'+
          icon+' '+escHtml(r.name)+
          (rItems.length?'<span style="font-size:10px;opacity:.7"> '+rDone+'/'+rItems.length+'</span>':'')+
        '</span>';
      }).join('')+
      '</div>'+
      '<button class="btn btn-ghost btn-sm" style="margin-top:6px;font-size:11px" onclick="openAddRoomModal(\''+b.id+'\',\''+escHtml(floor)+'\')">+ Add Rooms to Floor '+escHtml(floor)+'</button>'+
    '</div>';
  }).join('');

  var typeIcons = {residential:'🏢',clubhouse:'🏛',amenity:'🏊',idf:'🖧',other:'📦'};

  return '<div class="wt-building-card">'+
    '<div class="wt-building-header" onclick="toggleWTBuilding(\''+b.id+'\')">'+
      '<div>'+
        '<div class="wt-building-name">'+(typeIcons[b.type]||'🏢')+' '+escHtml(b.name)+'</div>'+
        '<div class="wt-building-meta">'+rooms.length+' rooms · '+items.length+' items · '+pct+'% complete</div>'+
        '<div class="wt-progress-bar" style="width:140px;margin-top:4px"><div class="wt-progress-fill" style="width:'+pct+'%"></div></div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();openAddRoomModal(\''+b.id+'\',\''+(Object.keys(floorMap).length+1)+'\')" style="font-size:11px">+ Floor / Rooms</button>'+
        '<button class="btn btn-outline btn-sm" onclick="event.stopPropagation();editWTBuilding(\''+b.id+'\')" style="font-size:11px">Edit</button>'+
        '<span style="font-size:18px;color:#546e7a" id="wt-building-toggle-'+b.id+'">▼</span>'+
      '</div>'+
    '</div>'+
    '<div id="wt-building-body-'+b.id+'" style="display:block">'+
      (floorsHtml||'<div style="padding:14px;color:#90a4ae;font-size:13px">No rooms yet. Click + Floor / Rooms to add.</div>')+
    '</div>'+
  '</div>';
}

function toggleWTBuilding(id) {
  var body = document.getElementById('wt-building-body-'+id);
  var icon = document.getElementById('wt-building-toggle-'+id);
  if (!body) return;
  var isOpen = body.style.display!=='none';
  body.style.display = isOpen?'none':'block';
  if (icon) icon.textContent = isOpen?'▶':'▼';
}

// ---- FIELD VIEW ----
function renderWTFieldView() {
  var el = document.getElementById('wt-field-items'); if (!el) return;
  var search = ((document.getElementById('wt-field-search')||{}).value||'').toLowerCase();
  var phase  = (document.getElementById('wt-field-phase')||{}).value||'';
  var status = (document.getElementById('wt-field-status')||{}).value||'';
  var myName = _currentUser ? _currentUser.full_name : '';

  var items = (DB.wtItems||[]).filter(function(i){
    if (i.projectId !== _wtProjectId) return false;
    if (phase  && (!i.phases||i.phases.indexOf(phase)<0)) return false;
    if (status && i.status!==status) return false;
    if (search) {
      var room = (DB.wtRooms||[]).find(function(r){ return r.id===i.roomId; });
      var building = (DB.wtBuildings||[]).find(function(b){ return b.id===i.buildingId; });
      var text = [(room&&room.name)||'',(building&&building.name)||'',i.label||''].join(' ').toLowerCase();
      if (text.indexOf(search)<0) return false;
    }
    return true;
  });

  if (!items.length) {
    el.innerHTML='<div style="color:#90a4ae;text-align:center;padding:20px">No items match your filters.</div>';
    return;
  }

  // Group by building → room
  var grouped = {};
  items.forEach(function(i){
    var bld = (DB.wtBuildings||[]).find(function(b){ return b.id===i.buildingId; });
    var room = (DB.wtRooms||[]).find(function(r){ return r.id===i.roomId; });
    var key = (bld&&bld.name)||'Unknown';
    var subKey = (room&&room.name)||'Unknown';
    if (!grouped[key]) grouped[key]={};
    if (!grouped[key][subKey]) grouped[key][subKey]=[];
    grouped[key][subKey].push(i);
  });

  el.innerHTML = Object.keys(grouped).map(function(bldName){
    return '<div style="margin-bottom:16px">'+
      '<div style="font-weight:700;font-size:13px;color:#0d1b2a;margin-bottom:8px;padding:8px 12px;background:#f5f7fa;border-radius:8px">🏢 '+escHtml(bldName)+'</div>'+
      Object.keys(grouped[bldName]).map(function(roomName){
        var roomItems = grouped[bldName][roomName];
        return '<div style="margin-bottom:10px;padding:0 4px">'+
          '<div style="font-weight:700;font-size:12px;color:#546e7a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">'+escHtml(roomName)+'</div>'+
          roomItems.map(function(i){ return renderWTFieldItem(i); }).join('')+
          // Bulk complete button for room
          '<button class="btn btn-ghost btn-sm" style="font-size:11px;margin-top:4px" onclick="bulkCompleteRoom(\''+roomItems[0].roomId+'\')">✓ Complete all in room for phase</button>'+
        '</div>';
      }).join('')+
    '</div>';
  }).join('');
}

function renderWTFieldItem(i) {
  var statusIcon = i.status==='done'?'✓':i.status==='in_progress'?'◐':'○';
  var statusCls  = i.status==='done'?'done':i.status==='in_progress'?'in_progress':'pending';
  var phases = (i.phases||[]).map(function(ph){
    var phStatus = (i.phaseStatus&&i.phaseStatus[ph])||'pending';
    var phColor  = phStatus==='done'?'#2e7d32':phStatus==='in_progress'?'#e65100':'#90a4ae';
    var phBg     = phStatus==='done'?'#e8f5e9':phStatus==='in_progress'?'#fff3e0':'#f5f5f5';
    var phLabels = {rough:'Rough',device:'Device',test:'Test'};
    return '<span class="wt-phase-pill" style="background:'+phBg+';color:'+phColor+'" onclick="openCheckoffModal(\''+i.id+'\',\''+ph+'\')">'+
      (phStatus==='done'?'✓ ':'')+escHtml(phLabels[ph]||ph)+
    '</span>';
  }).join('');

  return '<div class="wt-item-row">'+
    '<div class="wt-check-btn '+statusCls+'" onclick="openCheckoffModal(\''+i.id+'\',null)">'+statusIcon+'</div>'+
    '<div style="flex:1;min-width:0">'+
      '<div style="font-weight:700;font-size:13px">'+escHtml(i.icon||'')+'  '+escHtml(i.label||'')+'</div>'+
      '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">'+phases+'</div>'+
      (i.note?'<div style="font-size:11px;color:#546e7a;margin-top:2px;font-style:italic">'+escHtml(i.note)+'</div>':'')+
    '</div>'+
    '<button class="btn btn-ghost btn-sm" style="font-size:11px;flex-shrink:0" onclick="openReworkFromItem(\''+i.id+'\')">⚠</button>'+
  '</div>';
}

function openCheckoffModal(itemId, phase) {
  var item = (DB.wtItems||[]).find(function(i){ return i.id===itemId; }); if(!item) return;
  var room = (DB.wtRooms||[]).find(function(r){ return r.id===item.roomId; });
  var building = (DB.wtBuildings||[]).find(function(b){ return b.id===item.buildingId; });
  var teamOpts = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  var myName = _currentUser ? _currentUser.full_name : '';
  var phaseToUse = phase || (item.phases&&item.phases[0])||'rough';

  var titleEl = document.getElementById('wt-checkoff-title');
  if (titleEl) titleEl.textContent = '✅ '+escHtml(item.label||'');

  var phLabels = {rough:'Rough-in',device:'Devicing',test:'Test + Label'};
  var phaseOpts = (item.phases||[]).map(function(ph){
    var done = (item.phaseStatus&&item.phaseStatus[ph])==='done';
    return '<option value="'+ph+'"'+(ph===phaseToUse?' selected':'')+
      (done?' disabled':'')+'>'+escHtml(phLabels[ph]||ph)+(done?' (done)':'')+'</option>';
  }).join('');

  document.getElementById('wt-checkoff-body').innerHTML =
    '<div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px;color:#546e7a">'+
      '📍 '+(building?escHtml(building.name)+' / ':'')+(room?escHtml(room.name)+' / ':'')+'<strong>'+escHtml(item.label||'')+'</strong>'+
    '</div>'+
    '<label>Phase *</label>'+
    '<select id="co-phase" style="width:100%;padding:10px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px">'+phaseOpts+'</select>'+
    '<label>Completed by *</label>'+
    '<input id="co-tech" list="co-team-list" value="'+escHtml(myName)+'" style="margin-bottom:10px">'+
    '<datalist id="co-team-list">'+teamOpts+'</datalist>'+
    '<label>Note (optional)</label>'+
    '<div style="display:flex;gap:6px;margin-bottom:10px">'+
      '<input id="co-note" placeholder="Type or select a quick note..." style="flex:1">'+
      '<select onchange="document.getElementById(\'co-note\').value=this.value;this.value=\'\'" style="padding:8px;border:1px solid #e0e0e0;border-radius:8px;font-size:12px">'+
        '<option value="">Quick notes...</option>'+
        '<option value="Plumber pipe in the way">Plumber pipe in way</option>'+
        '<option value="Design change required">Design change</option>'+
        '<option value="Inspector callout">Inspector callout</option>'+
        '<option value="Damage by other trade">Damage by other trade</option>'+
        '<option value="Abnormally difficult">Abnormally difficult</option>'+
      '</select>'+
    '</div>'+
    '<label>Photo (optional)</label>'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'+
      '<div id="co-photo-preview" onclick="document.getElementById(\'co-photo-input\').click()" style="width:56px;height:56px;border:2px dashed #e0e0e0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;overflow:hidden;background:#f8f9fa">📷</div>'+
      '<div>'+
        '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'co-photo-input\').click()">📷 Add Photo</button>'+
        '<input type="file" id="co-photo-input" accept="image/*" capture="environment" style="display:none" onchange="onCoPhotoSelected(this)">'+
        '<input type="hidden" id="co-photo-url">'+
        '<div style="font-size:11px;color:#90a4ae;margin-top:4px">Auto-compressed. GPS + timestamp tagged.</div>'+
      '</div>'+
    '</div>'+
    '<input type="hidden" id="co-item-id" value="'+escHtml(itemId)+'">'+
    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600">'+
      '<input type="checkbox" id="co-difficult" style="width:16px;height:16px">'+
      '⚠ Flag as abnormally difficult (excluded from benchmarks, reviewed by back office)'+
    '</label>';

  openModal('modal-wt-checkoff');
}

function onCoPhotoSelected(input) {
  var file=input.files[0]; if(!file) return;
  if(file.size>5*1024*1024){showToast('Photo must be under 5MB','error');return;}
  var reader=new FileReader();
  reader.onload=function(e){
    var compressed=e.target.result; // future: compress before storing
    document.getElementById('co-photo-url').value=compressed;
    var prev=document.getElementById('co-photo-preview');
    if(prev) prev.innerHTML='<img src="'+compressed+'" style="width:100%;height:100%;object-fit:cover">';
  };
  reader.readAsDataURL(file);
}

function submitWTCheckoff() {
  var itemId  = (document.getElementById('co-item-id')||{}).value||'';
  var phase   = (document.getElementById('co-phase')||{}).value||'';
  var tech    = ((document.getElementById('co-tech')||{}).value||'').trim();
  var note    = (document.getElementById('co-note')||{}).value||'';
  var photo   = (document.getElementById('co-photo-url')||{}).value||'';
  var hard    = (document.getElementById('co-difficult')||{}).checked||false;
  if (!tech)  { showToast('Please enter who completed this','error'); return; }

  var item = (DB.wtItems||[]).find(function(i){ return i.id===itemId; }); if(!item) return;

  // Update phase status
  if (!item.phaseStatus) item.phaseStatus={};
  item.phaseStatus[phase]='done';

  // Check if all phases done
  var allDone = (item.phases||[]).every(function(ph){ return item.phaseStatus[ph]==='done'; });
  item.status = allDone ? 'done' : 'in_progress';
  item.note = note || item.note;

  // Log checkoff record
  if (!DB.wtCheckoffs) DB.wtCheckoffs=[];
  DB.wtCheckoffs.push({
    id:        'co-'+Date.now(),
    itemId:    itemId,
    projectId: item.projectId,
    buildingId:item.buildingId,
    roomId:    item.roomId,
    phase:     phase,
    techName:  tech,
    note:      note,
    photoUrl:  photo,
    difficult: hard,
    timestamp: new Date().toISOString(),
    confirmed: false,
    confirmedBy:null
  });

  saveDB();
  closeModal('modal-wt-checkoff');
  renderWTPhaseBar(_wtProjectId);
  renderWTFieldView();
  showToast((allDone?'✓ Item complete':'◐ Phase marked done')+' — '+escHtml(item.label||''), 'success');
}

function bulkCompleteRoom(roomId) {
  var phase = (document.getElementById('wt-field-phase')||{}).value||'rough';
  if (!phase) { showToast('Select a phase first using the filter above','warning'); return; }
  var myName = _currentUser ? _currentUser.full_name : '';
  var count = 0;
  (DB.wtItems||[]).forEach(function(i){
    if (i.roomId!==roomId||!i.phases||i.phases.indexOf(phase)<0) return;
    if ((i.phaseStatus&&i.phaseStatus[phase])==='done') return;
    if (!i.phaseStatus) i.phaseStatus={};
    i.phaseStatus[phase]='done';
    var allDone=(i.phases||[]).every(function(ph){ return i.phaseStatus[ph]==='done'; });
    i.status=allDone?'done':'in_progress';
    if (!DB.wtCheckoffs) DB.wtCheckoffs=[];
    DB.wtCheckoffs.push({id:'co-'+Date.now()+'-'+count,itemId:i.id,projectId:i.projectId,buildingId:i.buildingId,roomId:roomId,phase:phase,techName:myName||'Unknown',note:'Bulk complete',timestamp:new Date().toISOString(),confirmed:false});
    count++;
  });
  saveDB();
  renderWTPhaseBar(_wtProjectId);
  renderWTFieldView();
  showToast(count+' items marked complete for '+phase,'success');
}

// ---- PROGRESS VIEW ----
function renderWTProgressView() {
  var el = document.getElementById('wt-progress-content'); if (!el) return;
  var buildings = (DB.wtBuildings||[]).filter(function(b){ return b.projectId===_wtProjectId; });

  el.innerHTML = buildings.map(function(b){
    var items  = (DB.wtItems||[]).filter(function(i){ return i.buildingId===b.id; });
    var checkoffs = (DB.wtCheckoffs||[]).filter(function(c){ return c.buildingId===b.id; });

    // Per-tech stats
    var techMap = {};
    checkoffs.forEach(function(c){
      if (!techMap[c.techName]) techMap[c.techName]={name:c.techName,count:0,phases:{rough:0,device:0,test:0}};
      techMap[c.techName].count++;
      if (c.phase) techMap[c.techName].phases[c.phase]=(techMap[c.techName].phases[c.phase]||0)+1;
    });
    var techs = Object.values(techMap).sort(function(a,b){ return b.count-a.count; });

    var done = items.filter(function(i){ return i.status==='done'; }).length;
    var pct  = items.length ? Math.round(done/items.length*100) : 0;

    return '<div class="card" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
        '<div style="font-weight:700;font-size:14px">🏢 '+escHtml(b.name)+'</div>'+
        '<div style="font-weight:800;font-size:16px;color:'+(pct===100?'#2e7d32':'#1565c0')+'">'+pct+'%</div>'+
      '</div>'+
      '<div class="wt-progress-bar" style="height:12px;margin-bottom:12px"><div class="wt-progress-fill" style="width:'+pct+'%"></div></div>'+
      (techs.length?
        '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Tech Activity</div>'+
        techs.map(function(t){
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid #f5f5f5">'+
            '<span style="font-weight:700">'+escHtml(t.name)+'</span>'+
            '<span style="color:#546e7a">'+t.count+' check-offs · R:'+t.phases.rough+' D:'+t.phases.device+' T:'+t.phases.test+'</span>'+
          '</div>';
        }).join(''):
        '<div style="color:#90a4ae;font-size:13px">No activity yet.</div>')+
    '</div>';
  }).join('');

  if (!buildings.length) el.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">No buildings on this project yet.</div>';
}

// ---- REWORKS VIEW ----
function renderWTReworksView() {
  var el = document.getElementById('wt-reworks-list'); if (!el) return;
  var reworks = (DB.wtReworks||[]).filter(function(r){ return r.projectId===_wtProjectId; });
  if (!reworks.length) { el.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No reworks logged for this project.</div>'; return; }
  el.innerHTML = reworks.map(function(r){
    var sevIcons = {critical:'🔴',standard:'🟡',minor:'🟢'};
    return '<div class="rework-row '+r.severity+'">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'+
        '<span style="font-weight:700;font-size:13px">'+escHtml(sevIcons[r.severity]||'')+'  '+escHtml(r.location||'')+'</span>'+
        '<span style="font-size:11px;color:#90a4ae">'+escHtml(r.loggedAt||'')+'</span>'+
      '</div>'+
      '<div style="font-size:12px;color:#546e7a;margin-bottom:4px">'+escHtml(r.description||'')+'</div>'+
      '<div style="font-size:11px;display:flex;gap:12px">'+
        '<span>Category: <strong>'+escHtml(r.category||'')+'</strong></span>'+
        '<span>Original: <strong>'+escHtml(r.origTech||'—')+'</strong></span>'+
        '<span>Assigned to: <strong>'+escHtml(r.assignTech||'—')+'</strong></span>'+
        '<span>Fault: <strong style="color:'+(r.fault==='original'?'#c62828':'#2e7d32')+'">'+escHtml(r.fault==='original'?'Original Work':'External')+'</strong></span>'+
      '</div>'+
    '</div>';
  }).join('');
}

function openReworkFromItem(itemId) {
  var item = (DB.wtItems||[]).find(function(i){ return i.id===itemId; });
  var room = item ? (DB.wtRooms||[]).find(function(r){ return r.id===item.roomId; }) : null;
  var bld  = item ? (DB.wtBuildings||[]).find(function(b){ return b.id===item.buildingId; }) : null;
  var loc  = [(bld&&bld.name)||'',(room&&room.name)||'',(item&&item.label)||''].filter(Boolean).join(' / ');
  var el = document.getElementById('rw-location'); if(el) el.value=loc;
  var el2 = document.getElementById('rw-project-id'); if(el2) el2.value=_wtProjectId;
  var el3 = document.getElementById('rw-item-id'); if(el3) el3.value=itemId||'';
  var tl = document.getElementById('rw-team-list');
  if (tl) tl.innerHTML=(DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  openModal('modal-wt-rework');
}

function openAddReworkModal() {
  var el = document.getElementById('rw-project-id'); if(el) el.value=_wtProjectId;
  var el2 = document.getElementById('rw-location'); if(el2) el2.value='';
  var tl = document.getElementById('rw-team-list');
  if (tl) tl.innerHTML=(DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  openModal('modal-wt-rework');
}

function saveRework() {
  var loc  = ((document.getElementById('rw-location')||{}).value||'').trim();
  var desc = ((document.getElementById('rw-desc')||{}).value||'').trim();
  if (!loc)  { showToast('Please enter the item location','error'); return; }
  if (!desc) { showToast('Please describe what needs to be fixed','error'); return; }
  var fault = document.querySelector('input[name="rw-fault"]:checked');
  if (!DB.wtReworks) DB.wtReworks=[];
  DB.wtReworks.push({
    id:          'rw-'+Date.now(),
    projectId:   (document.getElementById('rw-project-id')||{}).value||_wtProjectId,
    itemId:      (document.getElementById('rw-item-id')||{}).value||'',
    category:    (document.getElementById('rw-category')||{}).value||'',
    severity:    (document.getElementById('rw-severity')||{}).value||'standard',
    location:    loc,
    description: desc,
    origTech:    (document.getElementById('rw-orig-tech')||{}).value||'',
    assignTech:  (document.getElementById('rw-assign-tech')||{}).value||'',
    fault:       fault?fault.value:'original',
    loggedAt:    new Date().toISOString().split('T')[0],
    loggedBy:    _currentUser?_currentUser.full_name:'',
    status:      'open'
  });
  saveDB();
  closeModal('modal-wt-rework');
  renderWTReworksView();
  showToast('Rework logged','success');
}

// ---- ROOM DETAIL ----
function openRoomDetail(roomId) {
  var room = (DB.wtRooms||[]).find(function(r){ return r.id===roomId; }); if(!room) return;
  // Switch to field view filtered to this room
  switchWTView('field');
  var search = document.getElementById('wt-field-search');
  if (search) { search.value = room.name; }
  renderWTFieldView();
}

// ---- ADD BUILDING MODAL ----
function openAddBuildingModal() {
  ['wtb-name','wtb-notes'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var f=document.getElementById('wtb-floors'); if(f) f.value=3;
  var u=document.getElementById('wtb-units'); if(u) u.value=8;
  var ut=document.getElementById('wtb-unit-types'); if(ut) ut.value='1BR,2BR,3BR';
  var pid=document.getElementById('wtb-project-id'); if(pid) pid.value=_wtProjectId;
  var bid=document.getElementById('wtb-id'); if(bid) bid.value='';
  openModal('modal-wt-building');
}

function editWTBuilding(buildingId) {
  var b=(DB.wtBuildings||[]).find(function(x){ return x.id===buildingId; }); if(!b) return;
  function sv(id,v){ var e=document.getElementById(id); if(e) e.value=v||''; }
  sv('wtb-name',b.name); sv('wtb-notes',b.notes); sv('wtb-floors',b.floors||3); sv('wtb-units',b.unitsPerFloor||8); sv('wtb-unit-types',b.unitTypes||'');
  var tp=document.getElementById('wtb-type'); if(tp) tp.value=b.type||'residential';
  var pid=document.getElementById('wtb-project-id'); if(pid) pid.value=b.projectId;
  var bid=document.getElementById('wtb-id'); if(bid) bid.value=b.id;
  openModal('modal-wt-building');
}

function saveWTBuilding() {
  var name = ((document.getElementById('wtb-name')||{}).value||'').trim();
  if (!name) { showToast('Building name required','error'); return; }
  var id  = (document.getElementById('wtb-id')||{}).value||'';
  var pid = (document.getElementById('wtb-project-id')||{}).value||_wtProjectId;
  var data = {
    id:           id||'wtb-'+Date.now(),
    projectId:    pid,
    name:         name,
    type:         (document.getElementById('wtb-type')||{}).value||'residential',
    floors:       parseInt((document.getElementById('wtb-floors')||{}).value)||3,
    unitsPerFloor:parseInt((document.getElementById('wtb-units')||{}).value)||8,
    unitTypes:    (document.getElementById('wtb-unit-types')||{}).value||'',
    notes:        (document.getElementById('wtb-notes')||{}).value||''
  };
  if (!DB.wtBuildings) DB.wtBuildings=[];
  if (id) { var idx=DB.wtBuildings.findIndex(function(b){ return b.id===id; }); if(idx>=0) DB.wtBuildings[idx]=data; else DB.wtBuildings.push(data); }
  else DB.wtBuildings.push(data);
  saveDB();
  closeModal('modal-wt-building');
  renderWTStructureView(pid);
  showToast('Building saved','success');
}

// ---- ADD ROOMS MODAL ----
function openAddRoomModal(buildingId, floor) {
  var b=(DB.wtBuildings||[]).find(function(x){ return x.id===buildingId; });
  var ctx=document.getElementById('wtr-context');
  if (ctx) ctx.textContent = 'Building: '+(b?b.name:'')+(floor?' · Floor '+floor:'');
  var bid=document.getElementById('wtr-building-id'); if(bid) bid.value=buildingId;
  var fl=document.getElementById('wtr-floor'); if(fl) fl.value=floor||'1';
  var rm=document.getElementById('wtr-rooms'); if(rm) rm.value='';
  openModal('modal-wt-room');
}

function saveWTRooms() {
  var buildingId = (document.getElementById('wtr-building-id')||{}).value||'';
  var floor      = (document.getElementById('wtr-floor')||{}).value||'1';
  var roomsRaw   = ((document.getElementById('wtr-rooms')||{}).value||'').trim();
  var roomType   = (document.getElementById('wtr-type')||{}).value||'unit';
  var layout     = (document.getElementById('wtr-layout')||{}).value||'';
  if (!roomsRaw) { showToast('Please enter room numbers','error'); return; }

  // Parse room list — supports ranges (101-108) and comma-separated
  var roomNames = [];
  roomsRaw.split(',').forEach(function(part){
    part = part.trim();
    var rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      var from=parseInt(rangeMatch[1]), to=parseInt(rangeMatch[2]);
      for(var n=from;n<=to;n++) roomNames.push(String(n));
    } else if (part) {
      roomNames.push(part);
    }
  });

  if (!roomNames.length) { showToast('No valid room numbers found','error'); return; }

  // Get project systems to know which items to generate
  var building = (DB.wtBuildings||[]).find(function(b){ return b.id===buildingId; });
  var project  = building ? (DB.wtProjects||[]).find(function(p){ return p.id===building.projectId; }) : null;
  var systems  = (project&&project.systems)||[];

  if (!DB.wtRooms)  DB.wtRooms=[];
  if (!DB.wtItems)  DB.wtItems=[];

  var addedRooms=0, addedItems=0;
  roomNames.forEach(function(rName){
    // Skip if room already exists in this building/floor
    var existing = DB.wtRooms.find(function(r){ return r.buildingId===buildingId&&r.floor===floor&&r.name===rName; });
    if (existing) return;

    var roomId = 'wtr-'+Date.now()+'-'+Math.random().toString(36).substr(2,5);
    DB.wtRooms.push({
      id:buildingId+'-f'+floor+'-'+rName.replace(/\s/g,''),
      projectId: building?building.projectId:'',
      buildingId:buildingId, floor:floor,
      name:rName, type:roomType, layout:layout
    });
    addedRooms++;

    // Generate items from project systems
    systems.forEach(function(sys){
      var templates = WT_ITEM_TEMPLATES[sys]||[];
      templates.forEach(function(tpl){
        DB.wtItems.push({
          id:        'wti-'+Date.now()+'-'+Math.random().toString(36).substr(2,6),
          projectId: building?building.projectId:'',
          buildingId:buildingId, roomId:roomId,
          label:     tpl.label, icon:tpl.icon||'🔌',
          phases:    tpl.phases, phaseStatus:{},
          status:    'pending', note:'', system:sys
        });
        addedItems++;
      });
    });
  });

  saveDB();
  closeModal('modal-wt-room');
  renderWTStructureView(building?building.projectId:_wtProjectId);
  renderWTPhaseBar(_wtProjectId);
  showToast(addedRooms+' rooms added · '+addedItems+' items generated','success');
}

// ---- PROJECT WIZARD ----
function openNewProjectWizard() {
  _wtWizardStep=1; _wtWizardBuildings=[];
  // Populate datalists
  var custDl=document.getElementById('wtp-cust-list');
  if(custDl) custDl.innerHTML=(DB.customers||[]).map(function(c){ return '<option value="'+escHtml(c.name)+'">'; }).join('');
  var teamDl=document.getElementById('wtp-team-list');
  if(teamDl) teamDl.innerHTML=(DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  var jobSel=document.getElementById('wtp-job-link');
  if(jobSel){ jobSel.innerHTML='<option value="">— None —</option>';(DB.jobs||[]).forEach(function(j){ var o=document.createElement('option');o.value=j.id;o.textContent=j.name+(j.customer?' — '+j.customer:'');jobSel.appendChild(o); }); }
  // Clear fields
  ['wtp-name','wtp-customer','wtp-lead','wtp-address'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  var s=document.getElementById('wtp-start'); if(s) s.value=new Date().toISOString().split('T')[0];
  // Reset steps
  showWTPStep(1);
  document.getElementById('wtp-building-entries').innerHTML='';
  openModal('modal-wt-project');
}

function showWTPStep(step) {
  [1,2,3,4].forEach(function(n){
    var s=document.getElementById('wtp-step-'+n); if(s) s.style.display=n===step?'block':'none';
    var dot=document.getElementById('wtp-dot-'+n); if(dot){
      if(n<step){dot.className='wt-step-dot done';dot.textContent='✓';}
      else if(n===step){dot.className='wt-step-dot active';dot.textContent=String(n);}
      else{dot.className='wt-step-dot';dot.textContent=String(n);}
    }
    var line=document.getElementById('wtp-line-'+n); if(line) line.className='wt-step-line'+(n<step?' done':'');
  });
  var back=document.getElementById('wtp-back-btn'); if(back) back.style.display=step>1?'inline-flex':'none';
  var next=document.getElementById('wtp-next-btn'); if(next) next.textContent=step===4?'✓ Create Project':'Next →';
  _wtWizardStep=step;

  if(step===2 && !document.getElementById('wtp-building-entries').children.length) addWTPBuilding();
  if(step===4) buildWTPSummary();
}

function wtpStepNext() {
  if(_wtWizardStep===1){
    var name=((document.getElementById('wtp-name')||{}).value||'').trim();
    if(!name){showToast('Project name required','error');return;}
  }
  if(_wtWizardStep===4){ createWTProject(); return; }
  showWTPStep(_wtWizardStep+1);
}
function wtpStepBack(){ if(_wtWizardStep>1) showWTPStep(_wtWizardStep-1); }

function addWTPBuilding() {
  var container=document.getElementById('wtp-building-entries');
  var idx=container.children.length;
  var div=document.createElement('div');
  div.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:8px';
  div.innerHTML='<input placeholder="Building name (e.g. Building '+( idx+1)+')" style="flex:1;padding:10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px" class="wtp-bld-name">'+
    '<select style="padding:10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px" class="wtp-bld-type"><option value="residential">Residential</option><option value="clubhouse">Clubhouse</option><option value="idf">IDF</option><option value="amenity">Amenity</option></select>'+
    '<input type="number" min="1" max="20" value="3" style="width:60px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;text-align:center" class="wtp-bld-floors" title="Floors">'+
    '<button type="button" onclick="this.parentNode.remove()" style="background:none;border:none;color:#c62828;font-size:18px;cursor:pointer;padding:0 4px">×</button>';
  container.appendChild(div);
}

function buildWTPSummary() {
  var name     = ((document.getElementById('wtp-name')||{}).value||'').trim();
  var customer = (document.getElementById('wtp-customer')||{}).value||'';
  var lead     = (document.getElementById('wtp-lead')||{}).value||'';
  var systems  = ['cat6','coax','wifi','fiber','access','cameras','intercoms','audio','tv','deadbolts']
    .filter(function(s){ var cb=document.getElementById('sys-'+s); return cb&&cb.checked; });
  var buildings = Array.from(document.querySelectorAll('#wtp-building-entries>div')).map(function(div){
    return {
      name:   (div.querySelector('.wtp-bld-name')||{}).value||'',
      type:   (div.querySelector('.wtp-bld-type')||{}).value||'residential',
      floors: parseInt((div.querySelector('.wtp-bld-floors')||{}).value)||3
    };
  }).filter(function(b){ return b.name.trim(); });

  var sysLabels={cat6:'Cat6 Data',coax:'Coax/TV',wifi:'Wireless AP',fiber:'Fiber',access:'Access Control',cameras:'Cameras',intercoms:'Intercoms',audio:'Audio',tv:'TV Installs',deadbolts:'Electronic Deadbolts'};
  var el=document.getElementById('wtp-confirm-summary');
  if(el) el.innerHTML=
    '<div><strong>Project:</strong> '+escHtml(name)+'</div>'+
    (customer?'<div><strong>Customer:</strong> '+escHtml(customer)+'</div>':'')+
    (lead?'<div><strong>Lead Tech:</strong> '+escHtml(lead)+'</div>':'')+
    '<div><strong>Buildings:</strong> '+buildings.length+' — '+buildings.map(function(b){ return escHtml(b.name)+' ('+b.floors+'fl)'; }).join(', ')+'</div>'+
    '<div><strong>Systems:</strong> '+(systems.length?systems.map(function(s){ return sysLabels[s]||s; }).join(', '):'None selected')+'</div>';
}

function createWTProject() {
  var name     = ((document.getElementById('wtp-name')||{}).value||'').trim();
  var customer = (document.getElementById('wtp-customer')||{}).value||'';
  var lead     = (document.getElementById('wtp-lead')||{}).value||'';
  var start    = (document.getElementById('wtp-start')||{}).value||'';
  var address  = (document.getElementById('wtp-address')||{}).value||'';
  var jobLink  = (document.getElementById('wtp-job-link')||{}).value||'';
  var systems  = ['cat6','coax','wifi','fiber','access','cameras','intercoms','audio','tv','deadbolts']
    .filter(function(s){ var cb=document.getElementById('sys-'+s); return cb&&cb.checked; });
  var buildings = Array.from(document.querySelectorAll('#wtp-building-entries>div')).map(function(div){
    return { name:(div.querySelector('.wtp-bld-name')||{}).value||'', type:(div.querySelector('.wtp-bld-type')||{}).value||'residential', floors:parseInt((div.querySelector('.wtp-bld-floors')||{}).value)||3 };
  }).filter(function(b){ return b.name.trim(); });

  if (!DB.wtProjects)  DB.wtProjects=[];
  if (!DB.wtBuildings) DB.wtBuildings=[];

  var projectId = 'wtp-'+Date.now();
  DB.wtProjects.push({ id:projectId, name:name, customer:customer, leadTech:lead, startDate:start, address:address, jobId:jobLink, systems:systems, createdAt:new Date().toISOString() });

  buildings.forEach(function(b){
    DB.wtBuildings.push({ id:'wtb-'+Date.now()+'-'+Math.random().toString(36).substr(2,5), projectId:projectId, name:b.name, type:b.type, floors:b.floors, unitsPerFloor:8, unitTypes:'1BR,2BR,3BR', notes:'' });
  });

  saveDB();
  closeModal('modal-wt-project');
  _wtProjectId = projectId;
  renderWorkTracking();
  loadWTProject(projectId);
  showToast('Project "'+name+'" created with '+buildings.length+' buildings','success');
}

// ============================================================
// END WORK TRACKING PHASE 1
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
  var ptEl=document.getElementById('qq-pt');       if(ptEl&&cust.defaultTerms&&!ptEl.value) ptEl.value=cust.defaultTerms;
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
    ctEl.focus();
    showContactsForCustomer(contacts);
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
  var item = lineItems.find(function(x){return x._id==id});
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
    case 'editTeamMember': editTeamMember(id); break;
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
        '<button class="btn btn-sm" onclick="openInvoiceModal(\''+j.id+'\')" style="background:#e3f2fd;color:#1565c0;border:1px solid #90caf9;font-weight:700" title="Generate Invoice">🧾 Invoice</button>'+
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


