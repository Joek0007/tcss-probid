// ============================================================
// END ROLE PERMISSIONS SYSTEM
// ============================================================

function printQRLabels() {
  if (!_wtProjectId) { showToast('Select a project first','warning'); return; }
  var project  = (DB.wtProjects||[]).find(function(p){ return p.id===_wtProjectId; });
  var buildings = (DB.wtBuildings||[]).filter(function(b){ return b.projectId===_wtProjectId; });
  if (!buildings.length) { showToast('No buildings on this project yet','warning'); return; }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
    '<title>QR Labels — '+(project?project.name:'Project')+'</title>'+
    '<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>'+
    '<style>'+
      'body{font-family:Arial,sans-serif;margin:0;padding:16px;background:#fff}'+
      'h2{font-size:16px;margin:0 0 16px;color:#1565c0}'+
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}'+
      '.label{border:2px solid #1565c0;border-radius:10px;padding:10px;text-align:center;break-inside:avoid}'+
      '.label-bld{font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px}'+
      '.label-room{font-size:16px;font-weight:900;color:#0d1b2a;margin:4px 0}'+
      '.label-floor{font-size:10px;color:#90a4ae}'+
      'canvas{margin:6px 0}'+
      '.bld-title{font-size:14px;font-weight:700;color:#0d1b2a;margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid #1565c0}'+
      '@media print{.no-print{display:none}@page{margin:10mm}}'+
    '</style></head><body>'+
    '<div class="no-print" style="margin-bottom:16px">'+
      '<h2>🏷 QR Room Labels — '+(project?escHtml(project.name):'')+'</h2>'+
      '<button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">🖨 Print Labels</button>'+
      '<button onclick="window.close()" style="background:none;border:1px solid #e0e0e0;border-radius:8px;padding:10px 16px;font-size:14px;cursor:pointer">Close</button>'+
    '</div>';

  buildings.forEach(function(b){
    var rooms = (DB.wtRooms||[]).filter(function(r){ return r.buildingId===b.id; });
    if (!rooms.length) return;
    html += '<div class="bld-title">🏢 '+escHtml(b.name)+'</div><div class="grid">';
    rooms.forEach(function(r){
      var qrData = 'TCSS-ROOM:'+r.id;
      html += '<div class="label" id="lbl-'+r.id+'">'+
        '<div class="label-bld">'+escHtml(b.name)+'</div>'+
        '<div class="label-room">'+escHtml(r.name)+'</div>'+
        '<div class="label-floor">Floor '+escHtml(r.floor||'')+(r.layout?' · '+escHtml(r.layout):'')+'</div>'+
        '<canvas id="qr-'+r.id+'"></canvas>'+
        '<div style="font-size:8px;color:#90a4ae;margin-top:2px">'+escHtml(qrData)+'</div>'+
      '</div>';
    });
    html += '</div>';
  });

  html += '<script>'+
    'document.addEventListener("DOMContentLoaded",function(){'+
    'document.querySelectorAll("canvas[id^=\'qr-\']").forEach(function(canvas){'+
      'var roomId=canvas.id.replace("qr-","");'+
      'QRCode.toCanvas(canvas,"TCSS-ROOM:"+roomId,{width:90,margin:1},function(){});'+
    '});});'+
  '<\/script></body></html>';

  var win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
  else showToast('Allow popups to print QR labels','warning');
}

// ============================================================
// PHASE 3 — TIME PER ITEM + BENCHMARK SYSTEM (Q40, Q50)
// Tracks duration of each check-off, flags techs >50% slower
// 30-day grace period for new hires
// ============================================================

// Record start time when tech opens check-off modal
var _checkoffStartTime = null;
var _origOpenCheckoffModal = null;
var _origSubmitWTCheckoff  = null;

// Deferred patch — runs after all scripts load
window.addEventListener('load', function() {
  if (typeof openCheckoffModal === 'function')  _origOpenCheckoffModal = openCheckoffModal;
  if (typeof submitWTCheckoff  === 'function')  _origSubmitWTCheckoff  = submitWTCheckoff;
});

// After checkoff is saved, store duration and check benchmarks

function getBenchmark(system, phase) {
  // Returns {avg, count} for this system+phase combo from all historical checkoffs
  var checkoffs = (DB.wtCheckoffs||[]).filter(function(c){
    return c.system===system && c.phase===phase && c.durationSecs && c.durationSecs>30;
  });
  if (checkoffs.length < 5) return null; // need at least 5 data points
  var total = checkoffs.reduce(function(s,c){ return s+(c.durationSecs||0); }, 0);
  return { avg: Math.round(total/checkoffs.length), count: checkoffs.length };
}

function checkBenchmarkFlag(techName, system, phase, durationSecs) {
  var benchmark = getBenchmark(system, phase);
  if (!benchmark) return; // not enough data yet
  // Check 30-day new hire grace period (Q50)
  var tech = (DB.team||[]).find(function(m){ return m.name===techName; });
  if (tech && tech.hireDate) {
    var daysSinceHire = (Date.now()-new Date(tech.hireDate))/(1000*60*60*24);
    if (daysSinceHire < 30) return; // grace period — don't flag
  }
  // Flag if >50% slower than average
  if (durationSecs > benchmark.avg * 1.5) {
    addNotification('benchmarks',
      techName+' flagged: slow on '+phase,
      system+' '+phase+' took '+Math.round(durationSecs/60)+'min vs avg '+Math.round(benchmark.avg/60)+'min'
    );
  }
}

// ============================================================
// PHASE 3 — REPORTS (Weekly Summary, Leaderboard, Benchmarks, Difficult)
// ============================================================
function switchWTReportBtn(type) {
  ['weekly','leaderboard','benchmarks','difficult'].forEach(function(t){
    var btn=document.getElementById('rpt-btn-'+t);
    if(btn) btn.className='btn btn-'+(t===type?'primary':'outline')+' btn-sm';
  });
}

function renderWTReport(type) {
  switchWTReportBtn(type);
  var el = document.getElementById('wt-reports-content'); if(!el) return;
  if (type==='weekly')      el.innerHTML = renderWTWeeklyReport();
  else if (type==='leaderboard') el.innerHTML = renderWTLeaderboard();
  else if (type==='benchmarks')  el.innerHTML = renderWTBenchmarks();
  else if (type==='difficult')   el.innerHTML = renderWTDifficultFlags();
}

// Tech Weekly Summary Report (Q38)
function renderWTWeeklyReport() {
  var project = (DB.wtProjects||[]).find(function(p){ return p.id===_wtProjectId; });
  var now = new Date();
  var weekStart = new Date(now); weekStart.setDate(now.getDate()-now.getDay());
  weekStart.setHours(0,0,0,0);
  var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  var weekStartStr = weekStart.toISOString().split('T')[0];
  var weekEndStr   = weekEnd.toISOString().split('T')[0];

  // All checkoffs this week for this project
  var weekCheckoffs = (DB.wtCheckoffs||[]).filter(function(c){
    return c.projectId===_wtProjectId && c.timestamp && c.timestamp.split('T')[0]>=weekStartStr && c.timestamp.split('T')[0]<=weekEndStr;
  });

  // Reworks this week
  var weekReworks = (DB.wtReworks||[]).filter(function(r){
    return r.projectId===_wtProjectId && r.loggedAt>=weekStartStr && r.loggedAt<=weekEndStr && r.fault==='original';
  });

  // Group by tech
  var techMap = {};
  weekCheckoffs.forEach(function(c){
    if (!techMap[c.techName]) techMap[c.techName]={name:c.techName,checkoffs:0,phases:{rough:0,device:0,test:0},reworks:0,difficult:0};
    techMap[c.techName].checkoffs++;
    if(c.phase) techMap[c.techName].phases[c.phase]=(techMap[c.techName].phases[c.phase]||0)+1;
    if(c.difficult) techMap[c.techName].difficult++;
  });
  weekReworks.forEach(function(r){
    if(r.origTech&&techMap[r.origTech]) techMap[r.origTech].reworks++;
  });

  var techs = Object.values(techMap).sort(function(a,b){ return b.checkoffs-a.checkoffs; });
  var teamAvg = techs.length ? Math.round(techs.reduce(function(s,t){ return s+t.checkoffs; },0)/techs.length) : 0;

  var html = '<div class="card" style="margin-bottom:12px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'+
      '<div class="card-title" style="margin:0">📅 Tech Weekly Summary</div>'+
      '<div style="font-size:12px;color:#546e7a">'+formatDate(weekStartStr)+' — '+formatDate(weekEndStr)+'</div>'+
    '</div>';

  if (!techs.length) {
    html += '<div style="color:#90a4ae;padding:16px;text-align:center">No check-offs recorded this week.</div>';
  } else {
    html += '<div style="font-size:11px;color:#546e7a;margin-bottom:10px">Team average: <strong>'+teamAvg+' check-offs</strong> this week</div>'+
    techs.map(function(t){
      var reworkRate = t.checkoffs ? Math.round(t.reworks/t.checkoffs*100) : 0;
      var vsAvg = t.checkoffs-teamAvg;
      var vsColor = vsAvg>0?'#2e7d32':vsAvg<0?'#c62828':'#546e7a';
      var vsTxt = vsAvg>0?'+'+vsAvg:String(vsAvg);
      return '<div style="background:#f8f9fa;border-radius:10px;padding:12px;margin-bottom:8px">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
          '<div style="font-weight:700;font-size:14px">'+escHtml(t.name)+'</div>'+
          '<div style="display:flex;gap:10px;align-items:center">'+
            '<span style="font-size:12px;color:'+vsColor+';font-weight:700">'+vsTxt+' vs avg</span>'+
            '<span style="font-weight:800;font-size:16px;color:#1565c0">'+t.checkoffs+' items</span>'+
          '</div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">'+
          '<div class="ts-stat"><div class="ts-stat-val">'+t.phases.rough+'</div><div class="ts-stat-lbl">Rough</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+t.phases.device+'</div><div class="ts-stat-lbl">Device</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+t.phases.test+'</div><div class="ts-stat-lbl">Test</div></div>'+
          '<div class="ts-stat" style="'+(reworkRate>10?'background:#ffebee':'')+'">'+'<div class="ts-stat-val" style="'+(reworkRate>10?'color:#c62828':'')+'">'+reworkRate+'%</div><div class="ts-stat-lbl">Rework</div></div>'+
        '</div>'+
        (t.difficult?'<div style="font-size:11px;color:#e65100;margin-top:6px">⚠ '+t.difficult+' item(s) flagged as difficult — pending back office review</div>':'')+
      '</div>';
    }).join('');
  }
  html += '</div>';
  return html;
}

// Project Leaderboard (Q39 — admin only by default)
function renderWTLeaderboard() {
  var myRole = _currentUser?_currentUser.role:'';
  var isAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office';
  var project = (DB.wtProjects||[]).find(function(p){ return p.id===_wtProjectId; });
  var isPublic = project && project.leaderboardPublic;

  if (!isAdmin && !isPublic) {
    return '<div class="card"><div style="text-align:center;padding:24px;color:#90a4ae">'+
      '<div style="font-size:32px;margin-bottom:8px">🔒</div>'+
      '<div style="font-weight:700">Leaderboard is admin-only for this project.</div>'+
    '</div></div>';
  }

  var checkoffs = (DB.wtCheckoffs||[]).filter(function(c){ return c.projectId===_wtProjectId; });
  var reworks   = (DB.wtReworks||[]).filter(function(r){ return r.projectId===_wtProjectId&&r.fault==='original'; });

  var techMap = {};
  checkoffs.forEach(function(c){
    if(!techMap[c.techName]) techMap[c.techName]={name:c.techName,total:0,confirmed:0,reworks:0};
    techMap[c.techName].total++;
    if(c.confirmed) techMap[c.techName].confirmed++;
  });
  reworks.forEach(function(r){
    if(r.origTech&&techMap[r.origTech]) techMap[r.origTech].reworks++;
  });

  var ranked = Object.values(techMap).sort(function(a,b){ return b.total-a.total; });
  var medals = ['🥇','🥈','🥉'];

  return '<div class="card">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'+
      '<div class="card-title" style="margin:0">🏆 Project Leaderboard</div>'+
      (isAdmin?'<label style="font-size:12px;cursor:pointer;display:flex;align-items:center;gap:6px">'+
        '<input type="checkbox" '+(isPublic?'checked':'')+' onchange="toggleLeaderboardPublic(this.checked)" style="width:14px;height:14px"> Make public to techs'+
      '</label>':'')+
    '</div>'+
    (ranked.length?
      ranked.map(function(t,i){
        var reworkRate=t.total?Math.round(t.reworks/t.total*100):0;
        var confRate=t.total?Math.round(t.confirmed/t.total*100):0;
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;margin-bottom:8px;background:'+(i===0?'#fff8e1':i===1?'#f5f5f5':i===2?'#fbe9e7':'#f8f9fa')+'">'+
          '<div style="font-size:28px;min-width:36px;text-align:center">'+(medals[i]||('#'+(i+1)))+'</div>'+
          '<div style="flex:1">'+
            '<div style="font-weight:700;font-size:14px">'+escHtml(t.name)+'</div>'+
            '<div style="font-size:12px;color:#546e7a">'+confRate+'% confirmed · '+reworkRate+'% rework rate</div>'+
          '</div>'+
          '<div style="font-weight:800;font-size:20px;color:#1565c0">'+t.total+'</div>'+
        '</div>';
      }).join(''):
      '<div style="color:#90a4ae;padding:16px;text-align:center">No check-offs recorded yet.</div>')+
  '</div>';
}

function toggleLeaderboardPublic(isPublic) {
  var project=(DB.wtProjects||[]).find(function(p){ return p.id===_wtProjectId; });
  if(project){ project.leaderboardPublic=isPublic; saveDB(); showToast(isPublic?'Leaderboard now visible to all techs':'Leaderboard restricted to admin','info'); }
}

// Benchmark Report (Q40)
function renderWTBenchmarks() {
  var systems = ['cat6','coax','wifi','access','cameras','intercoms','audio','tv','deadbolts','fiber'];
  var phases  = ['rough','device','test'];
  var phLabels= {rough:'Rough-in',device:'Devicing',test:'Test+Label'};
  var sysLabels={cat6:'Cat6',coax:'Coax',wifi:'WiFi AP',access:'Access Control',cameras:'Cameras',intercoms:'Intercoms',audio:'Audio',tv:'TV',deadbolts:'Deadbolts',fiber:'Fiber'};

  var rows = [];
  systems.forEach(function(sys){
    phases.forEach(function(ph){
      var b = getBenchmark(sys,ph);
      if(b) rows.push({sys:sys,ph:ph,avg:b.avg,count:b.count});
    });
  });

  if (!rows.length) {
    return '<div class="card"><div style="text-align:center;padding:24px;color:#90a4ae">'+
      '<div style="font-size:32px;margin-bottom:8px">⏱</div>'+
      '<div style="font-weight:700;margin-bottom:4px">Not enough data yet</div>'+
      '<div style="font-size:13px">Benchmarks are built automatically as techs complete check-offs. Need at least 5 of each type to establish a baseline.</div>'+
    '</div></div>';
  }

  return '<div class="card">'+
    '<div class="card-title">⏱ Time Benchmarks</div>'+
    '<p style="font-size:12px;color:#546e7a;margin-bottom:12px">Average time per item by system and phase. Techs more than 50% slower than average are flagged. New hires have a 30-day grace period.</p>'+
    '<table><thead><tr><th>System</th><th>Phase</th><th>Avg Time</th><th>Sample Size</th></tr></thead><tbody>'+
    rows.map(function(r){
      var mins=Math.floor(r.avg/60), secs=r.avg%60;
      return '<tr>'+
        '<td style="font-weight:700">'+escHtml(sysLabels[r.sys]||r.sys)+'</td>'+
        '<td><span class="wt-phase-pill '+r.ph+'">'+escHtml(phLabels[r.ph]||r.ph)+'</span></td>'+
        '<td style="font-weight:700;color:#1565c0">'+mins+'m '+secs+'s</td>'+
        '<td style="color:#90a4ae">'+r.count+' check-offs</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>';
}

// Difficult Flags Review (Q50 — back office reviews)
function renderWTDifficultFlags() {
  var myRole = _currentUser?_currentUser.role:'';
  var isAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office';
  if (!isAdmin) return '<div class="card"><div style="color:#90a4ae;padding:20px;text-align:center">Admin access required.</div></div>';

  var difficult = (DB.wtCheckoffs||[]).filter(function(c){
    return c.projectId===_wtProjectId && c.difficult && !c.difficultReviewed;
  });

  if (!difficult.length) {
    return '<div class="card"><div style="color:#2e7d32;font-weight:700;padding:20px;text-align:center">✓ No difficult flags pending review.</div></div>';
  }

  return '<div class="card">'+
    '<div class="card-title">⚠ Difficult Flag Review</div>'+
    '<p style="font-size:12px;color:#546e7a;margin-bottom:12px">Techs flagged these items as abnormally difficult. Review each one — if legitimate, it\'s excluded from benchmarks. If it\'s a pattern, it\'s a conversation.</p>'+
    difficult.map(function(c){
      var item=(DB.wtItems||[]).find(function(i){ return i.id===c.itemId; });
      var room=(DB.wtRooms||[]).find(function(r){ return r.id===c.roomId; });
      var bld=(DB.wtBuildings||[]).find(function(b){ return b.id===c.buildingId; });
      var phLabels={rough:'Rough-in',device:'Devicing',test:'Test+Label'};
      return '<div style="background:#fff8f0;border:1px solid #ffcc02;border-radius:10px;padding:12px;margin-bottom:8px">'+
        '<div style="font-weight:700;font-size:13px;margin-bottom:4px">'+(item?escHtml(item.label||''):'Item')+'</div>'+
        '<div style="font-size:12px;color:#546e7a">'+(bld?escHtml(bld.name)+' / ':'')+( room?escHtml(room.name)+' / ':'')+escHtml(phLabels[c.phase]||c.phase)+'</div>'+
        '<div style="font-size:12px;margin-top:4px">By <strong>'+escHtml(c.techName||'')+'</strong> · '+(c.note?escHtml(c.note):'No note')+'</div>'+
        '<div style="display:flex;gap:6px;margin-top:8px">'+
          '<button class="btn btn-success btn-sm" onclick="reviewDifficultFlag(\''+c.id+'\',true)">✓ Legitimate — exclude from benchmarks</button>'+
          '<button class="btn btn-outline btn-sm" onclick="reviewDifficultFlag(\''+c.id+'\',false)">✗ Not legitimate — include in benchmarks</button>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';
}

function reviewDifficultFlag(checkoffId, isLegitimate) {
  var c=(DB.wtCheckoffs||[]).find(function(x){ return x.id===checkoffId; }); if(!c) return;
  c.difficultReviewed=true;
  c.difficultLegitimate=isLegitimate;
  c.difficultReviewedBy=_currentUser?_currentUser.full_name:'Admin';
  c.difficultReviewedAt=new Date().toISOString();
  if(!isLegitimate) c.difficult=false; // include in benchmarks
  saveDB();
  renderWTReport('difficult');
  showToast(isLegitimate?'Flag accepted — excluded from benchmarks':'Flag dismissed — counted in benchmarks','success');
}

// ============================================================
// PHASE 3 — OFFICE GPS PIN + SETTINGS SAVE
// ============================================================
function pinOfficeLocation() {
  var status = document.getElementById('office-pin-status');
  if (!navigator.geolocation) { showToast('GPS not available','error'); return; }
  navigator.geolocation.getCurrentPosition(function(pos){
    var lat=pos.coords.latitude, lng=pos.coords.longitude;
    var latEl=document.getElementById('s-office-lat'); if(latEl) latEl.value=lat.toFixed(6);
    var lngEl=document.getElementById('s-office-lng'); if(lngEl) lngEl.value=lng.toFixed(6);
    if(status){ status.style.display='inline'; setTimeout(function(){ status.style.display='none'; },3000); }
    showToast('Office location pinned — save settings to apply','success');
  },function(){ showToast('GPS denied — enable location and try again','error'); },{enableHighAccuracy:true,timeout:10000});
}

// ============================================================
// PHASE 3 — PWA INSTALL PROMPT
// ============================================================
var _pwaInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e){
  e.preventDefault();
  _pwaInstallPrompt = e;
  // Show install banner after 30 seconds if not already installed
  setTimeout(function(){
    if (_pwaInstallPrompt) showPWAInstallBanner();
  }, 30000);
});

function showPWAInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.style.cssText='position:fixed;bottom:80px;left:12px;right:12px;background:#1565c0;color:#fff;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;z-index:1000;box-shadow:0 8px 24px rgba(0,0,0,.2)';
  banner.innerHTML=
    '<div>'+
      '<div style="font-weight:700;font-size:14px">📱 Add TCSS ProBid to Home Screen</div>'+
      '<div style="font-size:12px;opacity:.85;margin-top:2px">Install for faster access — works offline</div>'+
    '</div>'+
    '<div style="display:flex;gap:8px">'+
      '<button onclick="installPWA()" style="background:#fff;color:#1565c0;border:none;border-radius:8px;padding:8px 14px;font-weight:700;font-size:13px;cursor:pointer">Install</button>'+
      '<button onclick="dismissPWABanner()" style="background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer">Not now</button>'+
    '</div>';
  document.body.appendChild(banner);
}

function installPWA() {
  if (!_pwaInstallPrompt) return;
  _pwaInstallPrompt.prompt();
  _pwaInstallPrompt.userChoice.then(function(){ _pwaInstallPrompt=null; dismissPWABanner(); });
}

function dismissPWABanner() {
  var b=document.getElementById('pwa-install-banner'); if(b) b.remove();
}

// iOS "Add to Home Screen" hint (no API, just guide)
function showiOSInstallHint() {
  var isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  var isStandalone = window.navigator.standalone;
  if (!isIOS || isStandalone) return;
  setTimeout(function(){
    showToast('📱 Tip: Tap the Share button → "Add to Home Screen" to install TCSS ProBid','info',8000);
  }, 45000);
}

// ============================================================
// PHASE 3 — SAVE SETTINGS (includes GPS coords)
// ============================================================
function saveFieldSettings(){
  var cb=document.getElementById('s-geofence-enforce');
  var addr=document.getElementById('s-office-addr');
  var reminder=document.getElementById('s-clockin-reminder');
  var lat=document.getElementById('s-office-lat');
  var lng=document.getElementById('s-office-lng');
  DB.settings=Object.assign({},DB.settings,{
    geofenceEnforce:cb?cb.checked:false,
    officeAddr:addr?addr.value:'',
    clockInReminderTime:reminder?reminder.value:'',
    officeGpsLat:lat&&lat.value?parseFloat(lat.value):DB.settings.officeGpsLat||null,
    officeGpsLng:lng&&lng.value?parseFloat(lng.value):DB.settings.officeGpsLng||null
  });
  saveDB();
  startClockInReminder();
  startMorningDetection();
  var savedEl=document.getElementById('field-settings-saved');
  if(savedEl){savedEl.style.display='inline';setTimeout(function(){savedEl.style.display='none';},2000);}
  showToast('Field settings saved','success');
}

// Load GPS coords when settings page renders

// ============================================================
// PHASE 3 — SETTINGS LOAD PATCH
// ============================================================
function loadSettingsGPS() {
  var s = DB.settings||{};
  var lat=document.getElementById('s-office-lat'); if(lat&&s.officeGpsLat) lat.value=s.officeGpsLat;
  var lng=document.getElementById('s-office-lng'); if(lng&&s.officeGpsLng) lng.value=s.officeGpsLng;
}

// Wire into goPage

// ============================================================
// PHASE 3 — INIT
// ============================================================
function initPhase3() {
  showiOSInstallHint();
  // Patch settings load
  var origGoPage = window.goPage;
  window.goPage = function(id) {
    origGoPage(id);
    if (id==='settings') setTimeout(loadSettingsGPS, 100);
  };
}

