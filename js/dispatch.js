// ============================================================
// DISPATCH BOARD — Full Multi-Crew Edition
// ============================================================

var _dispatchRefreshTimer = null;
var _dispatchDragJob      = null;
var _dispatchDragSource   = null;
var _dispatchStatusFilter = '';

var DISPATCH_START_HOUR  = 6;
var DISPATCH_END_HOUR    = 20;
var DISPATCH_TOTAL_HRS   = DISPATCH_END_HOUR - DISPATCH_START_HOUR;
var DISPATCH_MINS_TOTAL  = DISPATCH_TOTAL_HRS * 60;

var JOB_PALETTE = [
  {bg:'#1565c0',border:'#0d47a1',text:'#fff'},
  {bg:'#2e7d32',border:'#1b5e20',text:'#fff'},
  {bg:'#6a1b9a',border:'#4a148c',text:'#fff'},
  {bg:'#e65100',border:'#bf360c',text:'#fff'},
  {bg:'#00695c',border:'#004d40',text:'#fff'},
  {bg:'#ad1457',border:'#880e4f',text:'#fff'},
  {bg:'#37474f',border:'#263238',text:'#fff'},
  {bg:'#558b2f',border:'#33691e',text:'#fff'},
  {bg:'#4527a0',border:'#311b92',text:'#fff'},
  {bg:'#c62828',border:'#b71c1c',text:'#fff'},
];
var _jobColorMap = {};

function getJobColor(jobId) {
  if (_jobColorMap[jobId] === undefined) {
    _jobColorMap[jobId] = Object.keys(_jobColorMap).length % JOB_PALETTE.length;
  }
  return JOB_PALETTE[_jobColorMap[jobId]];
}

var TECH_STATUS = {
  out:         {dot:'#d0d0d0',label:'Off Clock',  text:'#90a4ae',pulse:false},
  at_homebase: {dot:'#1565c0',label:'At Base',    text:'#1565c0',pulse:false},
  traveling:   {dot:'#1565c0',label:'Traveling',  text:'#1565c0',pulse:true},
  onsite:      {dot:'#2e7d32',label:'On Site',    text:'#2e7d32',pulse:true},
  break:       {dot:'#e65100',label:'On Break',   text:'#e65100',pulse:false},
  lunch:       {dot:'#6a1b9a',label:'At Lunch',   text:'#6a1b9a',pulse:false},
  returning:   {dot:'#1565c0',label:'Returning',  text:'#1565c0',pulse:true},
  complete:    {dot:'#90a4ae',label:'Done Today', text:'#90a4ae',pulse:false},
};

function getJobCrew(job) {
  if (job.crew && job.crew.length) return job.crew;
  if (job.assignedTo) return [{techName:job.assignedTo,role:'lead',addedDate:job.scheduledDate||getTodayISO()}];
  return [];
}

function getJobLead(job) {
  var crew = getJobCrew(job);
  var lead = crew.find(function(c){return c.role==='lead';});
  return lead ? lead.techName : (crew[0]?crew[0].techName:'');
}

function isCrewMember(job, techName) {
  return getJobCrew(job).some(function(c){return c.techName===techName;});
}

function addCrewMember(job, techName, role) {
  if (!job.crew) job.crew = getJobCrew(job);
  var existing = job.crew.find(function(c){return c.techName===techName;});
  if (existing) { existing.role=role||existing.role; return; }
  job.crew.push({techName:techName,role:role||'helper',addedDate:getTodayISO()});
  job.assignedTo = getJobLead(job);
}

function removeCrewMember(job, techName) {
  if (!job.crew) job.crew = getJobCrew(job);
  job.crew = job.crew.filter(function(c){return c.techName!==techName;});
  if (job.crew.length && !job.crew.find(function(c){return c.role==='lead';})) {
    job.crew[0].role = 'lead';
  }
  job.assignedTo = getJobLead(job)||'';
}

function setCrewLead(job, techName) {
  if (!job.crew) job.crew = getJobCrew(job);
  job.crew.forEach(function(c){c.role=c.techName===techName?'lead':'helper';});
  job.assignedTo = techName;
}

// Write job changes back to the WO in DB.workOrders
function _saveJobToWO(job) {
  if (!job || !job._isWO) return; // not a WO-backed job
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===job.id; });
  if (!wo) return;
  // Sync crew → assignedTechs
  var crew = job.crew || [];
  wo.assignedTechs = crew.map(function(c){ return c.techName; });
  // Sync schedule
  if (job.scheduledDate) wo.scheduledDate = job.scheduledDate;
  if (job.scheduledTime) wo.scheduledTime = job.scheduledTime;
  if (job.status) wo.status = job.status;
  saveDB();
  // Push to Supabase
  if (typeof _sb !== 'undefined' && _sb) {
    _sb.from('work_orders').update({
      assigned_techs: wo.assignedTechs,
    }).eq('id', wo.id).then(function(r){
      if (r && r.error) console.warn('[Dispatch] WO update error:', r.error.message);
    });
  }
  // Send SMS to newly added techs
  if (typeof sendAssignmentSMS === 'function') {
    crew.forEach(function(c){
      sendAssignmentSMS(c.techName, wo.woNumber||wo.description||'Work Order', wo.scheduledDate||null);
    });
  }
}


// ── Tech → WO Pool Card assignment ───────────────────────────────────────────
function dispatchTechDragStart(e, techName) {
  _dispatchDragTech = techName;
  e.dataTransfer.setData('text/plain', 'TECH:' + techName);
  e.dataTransfer.effectAllowed = 'copy';
  e.currentTarget.classList.add('dragging');
}
function dispatchTechDragEnd(e) {
  _dispatchDragTech = null;
  e.currentTarget.classList.remove('dragging');
}
function dispatchPoolCardDragOver(e) {
  // Only accept if a tech is being dragged
  if (!_dispatchDragTech) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  e.currentTarget.classList.add('drag-over');
}
function dispatchPoolCardDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}
function dispatchPoolCardDrop(e, woId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  var techName = _dispatchDragTech;
  if (!techName || !woId) return;
  _dispatchDragTech = null;

  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return;

  // Add tech to WO if not already assigned
  if (!wo.assignedTechs) wo.assignedTechs = [];
  var already = wo.assignedTechs.some(function(t){
    return (typeof t==='string'?t:(t.name||'')).toLowerCase()===techName.toLowerCase();
  });
  if (already) { showToast(techName+' is already assigned', 'info', 2000); return; }

  wo.assignedTechs.push(techName);
  saveDB();

  // Sync to Supabase
  if (typeof _sb !== 'undefined' && _sb) {
    _sb.from('work_orders').update({ assigned_techs: wo.assignedTechs })
      .eq('id', wo.id).then(function(r){
        if (r && r.error) console.warn('[Dispatch] assign error:', r.error.message);
      });
  }

  // Send SMS
  if (typeof sendAssignmentSMS === 'function') {
    sendAssignmentSMS(techName, wo.woNumber||wo.description||'Work Order', wo.scheduledDate||null);
  }

  showToast(techName + ' assigned to ' + (wo.woNumber||'WO'), 'success', 3000);
  renderDispatchBoard();
}

// Helpers for active work strip
function dispatchActiveStripDragStart(e) {
  var card = e.currentTarget;
  var jobId = card.getAttribute('data-job-id');
  if (jobId) onDispatchDragStart(e, jobId, 'active');
}
function dispatchScheduleFromStrip(e) {
  e.stopPropagation();
  var card = e.currentTarget.closest('.dispatch-active-wo-card');
  if (card) scheduleWO(card.getAttribute('data-job-id'));
}

function initDispatchBoard() {
  var dateEl = document.getElementById('dispatch-date');
  if (dateEl && !dateEl.value) dateEl.value = getTodayISO();
  _dispatchStatusFilter = '';
  renderDispatchBoard();
  clearInterval(_dispatchRefreshTimer);
  _dispatchRefreshTimer = setInterval(function(){
    var page = document.getElementById('page-dispatch');
    if (page && page.classList.contains('active')) { renderDispatchBoard(); }
    else clearInterval(_dispatchRefreshTimer);
  }, 60000);
  // Wire resize observer for accurate NOW line positioning
  setTimeout(attachDispatchResizeObserver, 300);
  // Wire touch drag
  setTimeout(attachTouchDrag, 300);
}

function dispatchChangeDate(delta) {
  var dateEl = document.getElementById('dispatch-date');
  if (!dateEl) return;
  var d = new Date((dateEl.value||getTodayISO())+'T12:00:00');
  d.setDate(d.getDate()+delta);
  dateEl.value = d.toISOString().split('T')[0];
  renderDispatchBoard();
}

function dispatchGoToday() {
  var dateEl = document.getElementById('dispatch-date');
  if (dateEl) dateEl.value = getTodayISO();
  renderDispatchBoard();
}

function renderDispatchBoard() {
  var dateEl    = document.getElementById('dispatch-date');
  var boardDate = dateEl ? dateEl.value : getTodayISO();
  var isToday   = boardDate === getTodayISO();
  var lrEl      = document.getElementById('dispatch-last-refresh');
  if (lrEl) lrEl.textContent = 'Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});

  var team    = DB.team||[];
  // WOs are jobs — use WOs as the source of truth for dispatch
  var allJobs = typeof _getActiveWOsAsJobs==='function' ? _getActiveWOsAsJobs() : (DB.jobs||[]);

  // ── Three display buckets ─────────────────────────────────────────────────
  // 1. dayJobs    — scheduled for boardDate + time + at least 1 tech → timeline
  // 2. needsTech  — scheduled for boardDate but no tech assigned → holding panel
  // 3. pool       — no scheduled date yet (backlog) OR unscheduled

  function _isActive(j) {
    return j.status!=='Complete'&&j.status!=='Closed'&&j.status!=='Billed'&&j.status!=='Void';
  }
  function _hasTech(j) {
    return (j.assignedTechs&&j.assignedTechs.length>0)||(j.crew&&j.crew.length>0);
  }

  var dayJobs = allJobs.filter(function(j){
    if (!_isActive(j)) return false;
    return (j.scheduledDate||'')=== boardDate && _hasTech(j);
  });

  // Scheduled for this date but no tech yet — needs someone assigned
  var needsTech = allJobs.filter(function(j){
    if (!_isActive(j)) return false;
    return (j.scheduledDate||'')=== boardDate && !_hasTech(j);
  });

  // Unscheduled backlog — no date set or not scheduled for this date
  var unassigned = allJobs.filter(function(j){
    if (!_isActive(j)) return false;
    var jDate = j.scheduledDate||'';
    return !jDate || jDate !== boardDate;
  });

  var activeWOs = []; // No longer used — removed Active Work strip

  if (_dispatchStatusFilter) {
    dayJobs = dayJobs.filter(function(j){
      return (j.status||'Scheduled')===_dispatchStatusFilter;
    });
  }

  var summaryEl = document.getElementById('dispatch-day-summary');
  if (summaryEl) {
    var sc=dayJobs.filter(function(j){return j.status==='Scheduled';}).length;
    var ip=dayJobs.filter(function(j){return j.status==='In Progress';}).length;
    summaryEl.innerHTML =
      pill(sc,'Scheduled','#e3f2fd','#1565c0')+
      (ip?pill(ip,'Active','#e8f5e9','#2e7d32'):'')+
      (unassigned.length?pill(unassigned.length,'Unassigned','#ffebee','#c62828'):'');
  }

  console.log('[Dispatch] renderDispatchBoard — team:', team.length, 'allJobs:', allJobs.length, 'dayJobs:', dayJobs.length, 'unassigned:', unassigned.length);
  renderDispatchPool(unassigned, needsTech);
  renderDispatchRuler();
  renderDispatchTechRows(team, dayJobs, activeWOs, boardDate, isToday);
  renderStatusBar(allJobs, boardDate);
  if (isToday) setTimeout(updateNowLine,100);
}

function pill(count,label,bg,color) {
  return '<span style="background:'+bg+';color:'+color+';border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;margin-right:4px">'+count+' '+label+'</span>';
}

function renderDispatchPool(jobs, needsTech) {
  needsTech = needsTech || [];
  var countEl = document.getElementById('dispatch-unassigned-count');
  if (countEl) countEl.textContent = (jobs.length + needsTech.length) || '';
  var pool = document.getElementById('dispatch-pool-jobs');
  if (!pool) return;

  function makeCard(j, urgent) {
    var color = getJobColor(j.id);
    var dur   = j.estLaborHours||j.scheduledDuration||4;
    return '<div class="dispatch-pool-card'+(urgent?' dispatch-needs-sched':'')+'" draggable="true" data-job-id="'+j.id+'" '
      +'style="border-left-color:'+color.bg+'" '
      +'ondragstart="(function(e){onDispatchDragStart(e,e.currentTarget.dataset.jobId,\'pool\');}).call(null,event)" '
      +'ondragend="onDispatchDragEnd(event)" '
      +'ondragover="dispatchPoolCardDragOver(event)" ondragleave="dispatchPoolCardDragLeave(event)" ondrop="dispatchPoolCardDrop(event,this.dataset.jobId)" onclick="openDispatchDetail(this.dataset.jobId)">'
      +'<div style="font-size:11px;font-weight:700;color:'+color.bg+'">'+escHtml(j.woNumber||'')+'</div>'
      +'<div class="dispatch-pool-card-name">'+escHtml((j.name||'').substring(0,35))+'</div>'
      +'<div class="dispatch-pool-card-sub">'+escHtml(j.customer||j.customerName||'')+'</div>'
      +(j.address?'<div class="dispatch-pool-card-sub">📍 '+escHtml(j.address.split(',')[0])+'</div>':'')
      +(j.scheduledDate?'<div style="font-size:10px;color:#1565c0;margin-top:3px">📅 '+j.scheduledDate+(j.scheduledTime?' '+j.scheduledTime:'')+'</div>':'')
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:5px">'
        +'<span style="font-size:10px;font-weight:700;color:'+color.bg+'">⏱ '+dur+'h</span>'
        +(urgent?'<span style="font-size:10px;font-weight:700;color:#c62828">Needs tech</span>':'')
      +'</div>'
      +'</div>';
  }

  var html = '';

  // Section 1: Scheduled but no tech — highest priority
  if (needsTech.length) {
    html += '<div class="dispatch-pool-section-header dispatch-needs-tech-header">⚠ Scheduled — Needs a Tech ('+needsTech.length+')</div>';
    html += needsTech.map(function(j){ return makeCard(j, true); }).join('');
  }

  // Section 2: Unscheduled backlog
  if (jobs.length) {
    html += '<div class="dispatch-pool-section-header">📋 Unscheduled ('+jobs.length+')</div>';
    html += jobs.map(function(j){ return makeCard(j, false); }).join('');
  }

  if (!needsTech.length && !jobs.length) {
    html = '<div style="text-align:center;padding:24px 12px;color:#90a4ae;font-size:12px"><div style="font-size:28px;margin-bottom:6px">✓</div>All jobs assigned</div>';
  }

  pool.innerHTML = html;
}

function renderDispatchRuler() {
  var ruler = document.getElementById('dispatch-ruler');
  if (!ruler) return;
  var html='';
  for (var h=DISPATCH_START_HOUR;h<=DISPATCH_END_HOUR;h++) {
    var pct=((h-DISPATCH_START_HOUR)/DISPATCH_TOTAL_HRS)*100;
    var label=h===12?'12 PM':h<12?h+' AM':(h-12)+' PM';
    html+='<div style="position:absolute;left:'+pct+'%;top:0;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:4px;padding-left:4px">'+
      '<div style="position:absolute;top:0;left:0;width:1px;height:100%;background:'+(h%2===0?'#d0d7e0':'#ebebeb')+'"></div>'+
      '<span style="font-size:10px;font-weight:700;color:#546e7a;white-space:nowrap">'+label+'</span></div>';
  }
  ruler.innerHTML=html;
}

function renderDispatchTechRows(team, dayJobs, activeWOs, boardDate, isToday) {
  var container = document.getElementById('dispatch-tech-rows');
  console.log('[Dispatch] renderDispatchTechRows called — team:', team.length, 'dayJobs:', dayJobs.length, 'activeWOs:', (activeWOs||[]).length, 'container:', !!container);
  if (!container) { console.error('[Dispatch] dispatch-tech-rows container NOT FOUND'); return; }
  if (!team.length) { container.innerHTML='<div style="padding:60px;text-align:center;color:#90a4ae">No team members. Add your crew in Team.</div>'; return; }

  var clockMap={};
  (DB.workDays||[]).filter(function(d){return d.date===boardDate;}).forEach(function(d){clockMap[d.techName]=d;});

  var techJobMap={};
  team.forEach(function(m){techJobMap[m.name]=[];});
  dayJobs.forEach(function(j){
    getJobCrew(j).forEach(function(cm){
      if (!techJobMap[cm.techName]) techJobMap[cm.techName]=[];
      techJobMap[cm.techName].push({job:j,crewEntry:cm});
    });
  });

  var avatarColors=['#1565c0','#2e7d32','#6a1b9a','#e65100','#00695c','#ad1457','#37474f'];
  var WORK_DAY_HRS = 8;

  container.innerHTML = team.map(function(member,idx){
    var name=member.name||'';
    var clockData=clockMap[name];
    var initials=name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
    var avatarBg=avatarColors[idx%avatarColors.length];

    var liveStatus='out';
    if (isToday&&_currentUser&&_currentUser.full_name===name) liveStatus=_clockState.status||'out';
    else if (clockData&&!clockData.clockOutTime&&clockData.clockInTime) liveStatus='onsite';
    else if (clockData&&clockData.clockOutTime) liveStatus='complete';
    var statusInfo=TECH_STATUS[liveStatus]||TECH_STATUS.out;

    var absent=(DB.absences||[]).find(function(a){return a.date===boardDate&&a.techName===name;});
    var myJobs=techJobMap[name]||[];

    // Capacity calculation
    var bookedHrs=myJobs.reduce(function(s,e){return s+parseFloat(e.job.estLaborHours||e.job.scheduledDuration||4);},0);
    var capPct=Math.min(100,Math.round(bookedHrs/WORK_DAY_HRS*100));
    var capColor=capPct>=100?'#c62828':capPct>=80?'#e65100':'#2e7d32';

    var blocksHtml=myJobs.map(function(e){return buildJobBlock(e.job,e.crewEntry,name);}).join('');

    // Travel dotted line: clock-in → first job
    var travelHtml='';
    if (clockData&&clockData.clockInTime&&myJobs.length) {
      var first=myJobs.slice().sort(function(a,b){return timeStrToMins(a.job.scheduledTime||'08:00')-timeStrToMins(b.job.scheduledTime||'08:00');})[0];
      var ciM=timeStrToMins(clockData.clockInTime)-DISPATCH_START_HOUR*60;
      var jM=timeStrToMins(first.job.scheduledTime||'08:00')-DISPATCH_START_HOUR*60;
      if (jM>ciM+15) {
        var lP=Math.max(0,ciM/DISPATCH_MINS_TOTAL*100);
        var wP=Math.min(100-lP,(jM-ciM)/DISPATCH_MINS_TOTAL*100);
        travelHtml='<div class="dispatch-travel-line" style="left:'+lP+'%;width:'+wP+'%;border-color:#1565c0;top:36px"></div>';
      }
    }

    // Clock worked segment (green bar at bottom)
    var segHtml='';
    if (clockData&&clockData.clockInTime) {
      var iM=timeStrToMins(clockData.clockInTime)-DISPATCH_START_HOUR*60;
      var oM=clockData.clockOutTime?timeStrToMins(clockData.clockOutTime)-DISPATCH_START_HOUR*60:(isToday?(new Date().getHours()*60+new Date().getMinutes())-DISPATCH_START_HOUR*60:iM);
      if (iM>=0&&oM>iM) {
        var iP2=Math.max(0,iM/DISPATCH_MINS_TOTAL*100);
        var wP2=Math.min(100-iP2,(oM-iM)/DISPATCH_MINS_TOTAL*100);
        segHtml='<div class="dispatch-clock-seg" style="left:'+iP2+'%;width:'+wP2+'%"></div>';
      }
    }

    return '<div class="dispatch-tech-row" id="drow-'+escHtml(name.replace(/\W/g,'-'))+'">'+
      '<div class="dispatch-tech-label" draggable="true" '+
        'ondragstart="dispatchTechDragStart(event,\''+escHtml(name)+'\')" '+
        'ondragend="dispatchTechDragEnd(event)">'+
        '<div class="dispatch-tech-avatar" style="background:'+avatarBg+';color:#fff;border-color:rgba(0,0,0,.1)">'+
          (absent?'<span style="font-size:16px">🚫</span>':escHtml(initials))+
        '</div>'+
        '<div class="dispatch-tech-info">'+
          '<div style="display:flex;align-items:center;justify-content:space-between">'+
            '<div class="dispatch-tech-name">'+escHtml(name)+'</div>'+
            '<button onclick="event.stopPropagation();openJournalEntry(\''+escHtml(name)+'\')") '+
              'title="Log journal entry for '+escHtml(name)+'" '+
              'style="padding:2px 6px;font-size:10px;border:1px solid #e0e0e0;border-radius:4px;background:#fff;cursor:pointer;color:#546e7a;flex-shrink:0">📝</button>'+
          '</div>'+
          '<div class="dispatch-tech-status">'+
            '<div class="dispatch-tech-status-dot'+(statusInfo.pulse?' pulse':'')+'" style="background:'+statusInfo.dot+'"></div>'+
            '<span style="color:'+statusInfo.text+';font-size:10px">'+(absent?'<span style="color:#c62828">Out</span>':statusInfo.label)+'</span>'+
          '</div>'+
          (myJobs.length?
            '<div style="margin-top:3px">'+
              '<div style="display:flex;justify-content:space-between;align-items:center">'+
                '<span style="font-size:9px;color:'+capColor+';font-weight:700">'+bookedHrs.toFixed(1)+'h booked</span>'+
                (capPct>=100?'<span style="font-size:8px;background:#ffebee;color:#c62828;border-radius:3px;padding:1px 4px;font-weight:700">FULL</span>':
                 capPct>=80?'<span style="font-size:8px;background:#fff3e0;color:#e65100;border-radius:3px;padding:1px 4px;font-weight:700">BUSY</span>':'')+
              '</div>'+
              '<div class="dispatch-capacity-bar">'+
                '<div class="dispatch-capacity-fill" style="width:'+capPct+'%;background:'+capColor+'"></div>'+
              '</div>'+
            '</div>':
            '<div style="font-size:9px;color:#90a4ae;margin-top:2px">Available</div>'
          )+
        '</div>'+
      '</div>'+
      '<div class="dispatch-tech-timeline" data-tech="'+escHtml(name)+'" '+
        'ondragover="onDispatchDragOver(event)" ondragleave="onDispatchDragLeave(event)" '+
        'ondrop="onDispatchDrop(event,\''+escHtml(name)+'\')">'+
        travelHtml+blocksHtml+segHtml+
      '</div>'+

    '</div>';
  }).join('');

  // Re-attach touch drag listeners after DOM update
  setTimeout(attachTouchDrag, 50);
}



function buildJobBlock(job, crewEntry, techName) {
  var startTime=job.scheduledTime||'08:00';
  var dur=parseFloat(job.estLaborHours||job.scheduledDuration||4);
  var color=getJobColor(job.id);
  var isLead=crewEntry&&crewEntry.role==='lead';
  var startMins=timeStrToMins(startTime)-DISPATCH_START_HOUR*60;
  var durMins=dur*60;
  var leftPct=Math.max(0,startMins/DISPATCH_MINS_TOTAL*100);
  var widPct=Math.min(100-leftPct,durMins/DISPATCH_MINS_TOTAL*100);
  if (widPct<0.5) widPct=0.5;

  // WT progress bar
  var wtProj=(DB.wtProjects||[]).find(function(p){return p.jobId===job.id;});
  var pctBar='';
  if (wtProj) {
    var items=(DB.wtItems||[]).filter(function(i){return i.projectId===wtProj.id;});
    var done=items.filter(function(i){return i.status==='done';}).length;
    var pct=items.length?Math.round(done/items.length*100):0;
    pctBar='<div style="position:absolute;bottom:0;left:0;height:3px;width:'+pct+'%;background:rgba(255,255,255,.5);border-radius:0 0 0 8px"></div>';
  }

  // Multi-day indicator
  var isMultiDay = job.scheduledEndDate && job.scheduledEndDate !== job.scheduledDate;
  var multiDayBadge = isMultiDay ? '<span class="dispatch-multiday-badge">∞</span>' : '';

  // Crew badges
  var crew=getJobCrew(job);
  var crewBadge=crew.length>1?'<span class="dispatch-role-badge">👥'+crew.length+'</span>':'';
  var roleBadge=isLead?'<span class="dispatch-role-badge">♛</span>':'<span class="dispatch-role-badge" style="opacity:.6">+</span>';

  return '<div class="dispatch-job-block'+(isLead?' is-lead':' is-helper')+'" '+
    'style="left:'+leftPct+'%;width:'+widPct+'%;background:'+color.bg+';border-color:'+color.border+';color:'+color.text+';opacity:'+(isLead?1:0.88)+';" '+
    'draggable="true" data-job-id="'+job.id+'" '+
    'ondragstart="onDispatchDragStart(event,\''+job.id+'\',\'board\')" '+
    'ondragend="onDispatchDragEnd(event)" onclick="openDispatchDetail(\''+job.id+'\')" '+
    '>'+
    multiDayBadge+
    '<div class="dispatch-job-block-name">'+(job.woNumber?'<span class="dispatch-job-block-wo-num">'+escHtml(job.woNumber)+'</span> ':'')+escHtml((job.name||'').substring(0,28))+'</div>'+
    '<div class="dispatch-job-block-sub">'+escHtml(job.customer||job.customerName||'')+(job.scheduledTime?' · '+job.scheduledTime:'')+'</div>'+
    '<div class="dispatch-job-block-badges">'+roleBadge+crewBadge+'</div>'+
    pctBar+
  '</div>';
}



function renderStatusBar(allJobs, boardDate) {
  var bar=document.getElementById('dispatch-status-bar');
  if (!bar) return;
  var dayJobs=allJobs.filter(function(j){return (j.scheduledDate||j.startDate||'')===boardDate;});
  var statuses=[
    {key:'',label:'All',icon:''},
    {key:'Scheduled',label:'Scheduled',icon:'📅'},
    {key:'In Progress',label:'Working',icon:'▶'},
    {key:'Paused',label:'Paused',icon:'⏸'},
    {key:'On Hold',label:'Hold',icon:'⏳'},
    {key:'Complete',label:'Done',icon:'✓'},
  ];
  bar.innerHTML=statuses.map(function(s){
    var count=s.key===''?dayJobs.length:dayJobs.filter(function(j){return (j.status||'Scheduled')===s.key;}).length;
    var isActive=_dispatchStatusFilter===s.key;
    return '<div class="dispatch-status-pill'+(isActive?' active':'')+'" onclick="setDispatchFilter(\''+escHtml(s.key)+'\')">'+
      (s.icon?s.icon+' ':'')+s.label+' <span class="dp-count">'+count+'</span></div>';
  }).join('');
}

function setDispatchFilter(status){_dispatchStatusFilter=status;renderDispatchBoard();}

function onDispatchDragStart(e,jobId,source){
  _dispatchDragJob=jobId;_dispatchDragSource=source;
  e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',jobId);
  var el=e.currentTarget;
  setTimeout(function(){el.style.opacity='0.4';el.classList.add('dragging');},0);
}
function onDispatchDragEnd(e){
  _dispatchDragJob=null;_dispatchDragSource=null;
  document.querySelectorAll('.dispatch-job-block,.dispatch-pool-card').forEach(function(el){el.style.opacity='1';el.classList.remove('dragging');});
  document.querySelectorAll('.dispatch-tech-timeline').forEach(function(el){el.classList.remove('drag-over');});
}
function onDispatchDragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  e.currentTarget.classList.add('drag-over');
  // Show snap guide line
  var rect=e.currentTarget.getBoundingClientRect();
  var xPct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  var snapMins=Math.round(xPct*DISPATCH_MINS_TOTAL/15)*15;
  var snapPct=(snapMins/DISPATCH_MINS_TOTAL)*100;
  var guide=e.currentTarget.querySelector('.dispatch-snap-guide');
  if (!guide) {
    guide=document.createElement('div');
    guide.className='dispatch-snap-guide';
    e.currentTarget.appendChild(guide);
  }
  guide.style.left=snapPct+'%';
  // Show time label
  var h=DISPATCH_START_HOUR+Math.floor(snapMins/60);
  var m=snapMins%60;
  var ampm=h>=12?'PM':'AM';
  var h12=h>12?h-12:(h===0?12:h);
  guide.setAttribute('data-time',h12+':'+(m===0?'00':m)+' '+ampm);
}
function onDispatchDragLeave(e){
  e.currentTarget.classList.remove('drag-over');
  var guide=e.currentTarget.querySelector('.dispatch-snap-guide');
  if(guide) guide.remove();
}

function onDispatchDrop(e, techName) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  var guide=e.currentTarget.querySelector('.dispatch-snap-guide');
  if(guide) guide.remove();
  var jobId=_dispatchDragJob||e.dataTransfer.getData('text/plain');
  if (!jobId) return;
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  var rect=e.currentTarget.getBoundingClientRect();
  var xPct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  var dropMins=Math.round(xPct*DISPATCH_MINS_TOTAL/15)*15; // Snap to 15-min increments
  var dropHour=DISPATCH_START_HOUR+Math.floor(dropMins/60);
  var dropMin=dropMins%60;
  var dropTime=String(dropHour).padStart(2,'0')+':'+String(dropMin).padStart(2,'0');
  console.log('[Drop] tech:',techName,'clientX:',e.clientX,'rect.left:',Math.round(rect.left),'rect.width:',Math.round(rect.width),'xPct:',xPct.toFixed(3),'dropTime:',dropTime);
  var dateEl=document.getElementById('dispatch-date');
  var boardDate=dateEl?dateEl.value:getTodayISO();
  var already=isCrewMember(job,techName);
  if (!already) {
    var crew=getJobCrew(job);
    addCrewMember(job,techName,crew.length===0?'lead':'helper');
  }
  job.scheduledDate=boardDate;job.scheduledTime=dropTime;
  if(!job.status||job.status==='') job.status='Scheduled';
  _saveJobToWO(job);
  saveDB();renderDispatchBoard();
  showToast(already?escHtml(job.name||'')+' rescheduled to '+dropTime:escHtml(techName)+' added to '+escHtml(job.name||'')+(getJobCrew(job).length>1?' (crew)':''),'success');
}

function openDispatchDetail(jobId) {
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  var panel=document.getElementById('dispatch-detail-panel');
  var nameEl=document.getElementById('dsp-job-name');
  var bodyEl=document.getElementById('dsp-body');
  if(!panel||!bodyEl) return;
  if(nameEl) nameEl.textContent=job.name||'';
  var color=getJobColor(job.id);
  var crew=getJobCrew(job);
  var wtProj=(DB.wtProjects||[]).find(function(p){return p.jobId===job.id;});
  var pct=null;
  if (wtProj){var items=(DB.wtItems||[]).filter(function(i){return i.projectId===wtProj.id;});var done=items.filter(function(i){return i.status==='done';}).length;pct=items.length?Math.round(done/items.length*100):0;}
  var avatarColors=['#1565c0','#2e7d32','#6a1b9a','#e65100','#00695c','#ad1457'];

  bodyEl.innerHTML='<div style="padding:14px">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">'+
      '<div style="width:12px;height:12px;border-radius:3px;background:'+color.bg+'"></div>'+
      '<span style="font-size:12px;color:#546e7a">'+(job.scheduledDate||'')+(job.scheduledTime?' · '+job.scheduledTime:'')+'</span>'+
      '<span style="background:'+color.bg+'22;color:'+color.bg+';border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">'+escHtml(job.status||'Scheduled')+'</span>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">'+
      dspInfoTile('Customer',job.customer||'—')+dspInfoTile('Est Hrs',(job.estLaborHours||'—')+'h')+
      dspInfoTile('Est Value','$'+(job.estTotal||0).toLocaleString())+dspInfoTile('Job #',job.num||'—')+
    '</div>'+
    (pct!==null?'<div style="margin-bottom:14px"><div style="font-size:10px;font-weight:700;color:#546e7a;margin-bottom:4px">WORK TRACKING</div>'+
      '<div style="display:flex;align-items:center;gap:8px"><div class="wt-progress-bar" style="flex:1"><div class="wt-progress-fill" style="width:'+pct+'%"></div></div><span style="font-weight:700;color:#1565c0">'+pct+'%</span></div></div>':'')+
    (job.address?'<div style="background:#f8f9fa;border-radius:6px;padding:8px;font-size:12px;color:#546e7a;margin-bottom:14px">📍 '+escHtml(job.address)+'</div>':'')+
    (job.dispatchNotes?'<div style="background:#fff8e1;border-radius:6px;padding:8px;font-size:12px;color:#f57f17;margin-bottom:14px;border-left:3px solid #ffb300">📋 '+escHtml(job.dispatchNotes)+'</div>':'')+
    // Crew
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:14px">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px">CREW ('+crew.length+')</div>'+
        '<button class="btn btn-outline btn-sm" onclick="openAddCrewPanel(\''+jobId+'\')">+ Add</button>'+
      '</div>'+
      (crew.length?crew.map(function(cm,ci){
        var abb=(cm.techName||'?').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
        var bg=avatarColors[ci%avatarColors.length];
        return '<div class="crew-member-row">'+
          '<div class="crew-avatar" style="background:'+bg+';color:#fff">'+escHtml(abb)+'</div>'+
          '<div style="flex:1"><div style="font-weight:700;font-size:12px">'+escHtml(cm.techName||'')+'</div>'+
          '<div style="font-size:10px;color:#546e7a">'+(cm.role==='lead'?'♛ Lead':'Helper')+(cm.addedDate?' · '+cm.addedDate:'')+'</div></div>'+
          '<div style="display:flex;gap:4px">'+
            '<button class="dispatch-sms-btn" onclick="dispatchSendSMS(\''+escHtml(cm.techName)+'\',\''+jobId+'\')" title="Send dispatch SMS">💬</button>'+
            (cm.role!=='lead'?'<button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="dispatchSetLead(\''+jobId+'\',\''+escHtml(cm.techName)+'\')">♛</button>':'<span style="font-size:12px;color:#1565c0;padding:4px">♛</span>')+
            '<button class="btn btn-danger btn-sm" style="font-size:10px" onclick="dispatchRemoveCrew(\''+jobId+'\',\''+escHtml(cm.techName)+'\')">✕</button>'+
          '</div></div>';
      }).join(''):'<div style="color:#90a4ae;font-size:12px;padding:8px 0">No crew assigned. Drag onto a row or click + Add.</div>')+
      '<div id="add-crew-panel-'+jobId+'" style="display:none;margin-top:8px">'+
        '<select id="add-crew-select-'+jobId+'" style="width:100%;padding:7px;border:1px solid #e0e0e0;border-radius:6px;font-size:12px;margin-bottom:6px">'+
          '<option value="">— Select tech —</option>'+
          (DB.team||[]).filter(function(m){return !isCrewMember(job,m.name);}).map(function(m){return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>';}).join('')+
        '</select>'+
        '<div style="display:flex;gap:6px">'+
          '<button class="btn btn-primary btn-sm" onclick="dispatchAddCrewMember(\''+jobId+'\')">Add to Crew</button>'+
          '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'add-crew-panel-'+jobId+'\').style.display=\'none\'">Cancel</button>'+
        '</div>'+
      '</div>'+
    '</div>'+
    // Reschedule
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:14px">'+
      '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">RESCHEDULE</div>'+
      '<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input type="date" id="dsp-new-date" value="'+(job.scheduledDate||'')+'" style="flex:1;padding:6px;border:1px solid #e0e0e0;border-radius:6px;font-size:12px">'+
        '<input type="time" id="dsp-new-time" value="'+(job.scheduledTime||'')+'" style="flex:1;padding:6px;border:1px solid #e0e0e0;border-radius:6px;font-size:12px">'+
      '</div>'+
      '<input type="number" id="dsp-new-dur" value="'+(job.estLaborHours||4)+'" min="0.5" max="24" step="0.5" placeholder="Duration hrs" style="width:100%;padding:6px;border:1px solid #e0e0e0;border-radius:6px;font-size:12px;margin-bottom:6px;box-sizing:border-box">'+
      '<button class="btn btn-primary btn-sm" style="width:100%" onclick="rescheduleJobFromDetail(\''+jobId+'\')">Update Schedule</button>'+
    '</div>'+
    // Quick status
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-bottom:14px">'+
      '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">QUICK STATUS</div>'+
      '<div style="display:flex;gap:4px;flex-wrap:wrap">'+
        ['Scheduled','In Progress','Paused','On Hold','Complete'].map(function(s){
          var active=(job.status||'Scheduled')===s;
          return '<button class="btn btn-sm" style="font-size:10px;'+(active?'background:#1565c0;color:#fff;border-color:#1565c0;':'')+'" onclick="dispatchSetStatus(\''+jobId+'\',\''+s+'\')">'+escHtml(s)+'</button>';
        }).join('')+
      '</div>'+
    '</div>'+
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;display:flex;gap:6px;flex-wrap:wrap">'+
      '<button class="btn btn-outline btn-sm" onclick="goPage(\'jobs\');closeDispatchDetail()">Open Job</button>'+
      (wtProj?'<button class="btn btn-outline btn-sm" onclick="loadWTProject(\''+wtProj.id+'\');goPage(\'worktracking\');closeDispatchDetail()">Work Tracking</button>':'')+
      '<button class="btn btn-outline btn-sm" onclick="openCommsModal(\'\',\''+jobId+'\')">📞 Log Comm</button>'+
      '<button class="btn btn-outline btn-sm" onclick="openPhotoUpload(\''+jobId+'\')">📷 Photos</button>'+
    '</div>'+
    // Photos section
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-top:12px">'+
      '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">PHOTOS</div>'+
      '<div id="job-photos-section-'+jobId+'"></div>'+
    '</div>'+
    // Comms section
    '<div style="border-top:1px solid #f0f0f0;padding-top:12px;margin-top:4px">'+
      '<div style="font-size:10px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">COMMUNICATIONS</div>'+
      '<div id="job-comms-section-'+jobId+'"></div>'+
    '</div>'+
  '</div>';

  panel.style.display='block';
  // Render photos and comms sections
  if (typeof renderJobPhotosSection === 'function') renderJobPhotosSection(jobId);
  if (typeof renderJobCommsSection  === 'function') renderJobCommsSection(jobId);
}

function dspInfoTile(label,val){
  return '<div style="background:#f8f9fa;border-radius:6px;padding:8px"><div style="font-size:9px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+escHtml(label)+'</div><div style="font-size:12px;font-weight:700;color:#0d1b2a;margin-top:2px">'+escHtml(String(val))+'</div></div>';
}

function openAddCrewPanel(jobId){var p=document.getElementById('add-crew-panel-'+jobId);if(p)p.style.display=p.style.display==='none'||!p.style.display?'block':'none';}

function dispatchAddCrewMember(jobId){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  var sel=document.getElementById('add-crew-select-'+jobId);
  var techName=sel?sel.value:''; if(!techName){showToast('Select a team member','error');return;}
  addCrewMember(job,techName,'helper');
  saveDB();renderDispatchBoard();openDispatchDetail(jobId);
  showToast(escHtml(techName)+' added to crew','success');
}

function dispatchRemoveCrew(jobId,techName){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  if(!confirm('Remove '+techName+' from this job?')) return;
  removeCrewMember(job,techName);
  _saveJobToWO(job);
  saveDB();renderDispatchBoard();openDispatchDetail(jobId);
  showToast(escHtml(techName)+' removed','info');
}

function dispatchSetLead(jobId,techName){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  setCrewLead(job,techName);
  _saveJobToWO(job);
  saveDB();renderDispatchBoard();openDispatchDetail(jobId);
  showToast(escHtml(techName)+' is now Lead ♛','success');
}

function dispatchSetStatus(jobId,status){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  job.status=status;saveDB();renderDispatchBoard();openDispatchDetail(jobId);
  showToast('Status → '+status,'info');
}

function closeDispatchDetail(){var p=document.getElementById('dispatch-detail-panel');if(p)p.style.display='none';}

function scheduleWO(woId) {
  // Schedule an active WO to today's date at 8:00 AM
  var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
  if (!wo) return;
  var dateEl = document.getElementById('dispatch-date');
  var boardDate = dateEl ? dateEl.value : getTodayISO();
  wo.scheduledDate = boardDate;
  wo.scheduledTime = wo.scheduledTime || '08:00';
  saveDB();
  renderDispatchBoard();
  showToast('Scheduled for '+boardDate, 'success', 2000);
}

function rescheduleJobFromDetail(jobId){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  var d=(document.getElementById('dsp-new-date')||{}).value||'';
  var t=(document.getElementById('dsp-new-time')||{}).value||'';
  var dur=parseFloat((document.getElementById('dsp-new-dur')||{}).value||job.estLaborHours||4);
  if(d) job.scheduledDate=d;if(t) job.scheduledTime=t;if(dur){job.estLaborHours=dur;job.scheduledDuration=dur;}
  _saveJobToWO(job);
  saveDB();closeDispatchDetail();renderDispatchBoard();showToast('Rescheduled','success');
}

function updateNowLine(){
  var line=document.getElementById('dispatch-now-line');
  var wrap=document.getElementById('dispatch-board-wrap');
  if(!line||!wrap) return;
  var now=new Date();
  var nowMins=now.getHours()*60+now.getMinutes()-DISPATCH_START_HOUR*60;
  if(nowMins<0||nowMins>DISPATCH_MINS_TOTAL){line.style.display='none';return;}
  var pct=nowMins/DISPATCH_MINS_TOTAL;
  var labelW=200;
  var timelineW=Math.max(wrap.clientWidth-labelW, wrap.scrollWidth-labelW);
  line.style.display='block';
  line.style.left=(labelW+pct*timelineW)+'px';
}

// ResizeObserver — reposition NOW line when board is resized (window resize, panel open/close)
var _dispatchResizeObserver = null;
function attachDispatchResizeObserver() {
  var wrap = document.getElementById('dispatch-board-wrap');
  if (!wrap || !window.ResizeObserver) return;
  if (_dispatchResizeObserver) _dispatchResizeObserver.disconnect();
  _dispatchResizeObserver = new ResizeObserver(function(){
    var page = document.getElementById('page-dispatch');
    if (page && page.classList.contains('active')) updateNowLine();
  });
  _dispatchResizeObserver.observe(wrap);
}

function openScheduleJobModal(jobId){
  var sel=document.getElementById('sj-job-select');
  if(sel){sel.innerHTML='<option value="">— Select a job —</option>'+(typeof _getActiveWOsAsJobs==='function'?_getActiveWOsAsJobs():(DB.jobs||[])).filter(function(j){return j.status!=='Complete'&&j.status!=='Closed';}).map(function(j){return '<option value="'+j.id+'"'+(j.id===jobId?' selected':'')+'>'+(j.woNumber?escHtml(j.woNumber)+' — ':'')+escHtml(j.name)+'</option>';}).join('');if(jobId){sel.value=jobId;onScheduleJobSelect(jobId);}}
  var techSel=document.getElementById('sj-tech');
  if(techSel) techSel.innerHTML='<option value="">— Unassigned —</option>'+(DB.team||[]).map(function(m){return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>';}).join('');
  var dateEl=document.getElementById('dispatch-date');
  var sjDate=document.getElementById('sj-date');
  if(sjDate) sjDate.value=dateEl?dateEl.value:getTodayISO();
  openModal('modal-schedule-job');
}

function onScheduleJobSelect(jobId){
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;}));
  var prev=document.getElementById('sj-job-preview');
  if(!prev) return;
  if(!job){prev.style.display='none';return;}
  var crew=getJobCrew(job);
  prev.style.display='block';
  prev.innerHTML='<div style="font-weight:700">'+escHtml(job.name||'')+'</div>'+
    '<div style="color:#546e7a">'+escHtml(job.customer||'')+(job.address?' · '+escHtml(job.address):'')+' </div>'+
    '<div style="color:#1565c0;margin-top:4px">Est: '+(job.estLaborHours||'?')+'hrs · $'+(job.estTotal||0).toLocaleString()+'</div>'+
    (crew.length?'<div style="color:#546e7a;font-size:11px;margin-top:2px">Crew: '+crew.map(function(c){return escHtml(c.techName+(c.role==='lead'?' ♛':''));}).join(', ')+'</div>':'');
  var techSel=document.getElementById('sj-tech');
  var lead=getJobLead(job);
  if(techSel&&lead) techSel.value=lead;
  var durEl=document.getElementById('sj-duration');
  if(durEl&&job.estLaborHours) durEl.value=job.estLaborHours;
}

function saveScheduledJob(){
  var jobId=(document.getElementById('sj-job-select')||{}).value||'';
  var date=(document.getElementById('sj-date')||{}).value||'';
  var time=(document.getElementById('sj-start-time')||{}).value||'08:00';
  var dur=parseFloat((document.getElementById('sj-duration')||{}).value||4);
  var tech=(document.getElementById('sj-tech')||{}).value||'';
  var notes=(document.getElementById('sj-notes')||{}).value||'';
  if(!jobId){showToast('Please select a job','error');return;}
  if(!date){showToast('Please select a date','error');return;}
  var job=(typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;})); if(!job) return;
  job.scheduledDate=date;job.scheduledTime=time;job.estLaborHours=dur;job.scheduledDuration=dur;
  _saveJobToWO(job);
  if(notes) job.dispatchNotes=notes;
  if(!job.status||job.status==='') job.status='Scheduled';
  if(tech){if(!isCrewMember(job,tech)) addCrewMember(job,tech,'lead'); else setCrewLead(job,tech);}
  _saveJobToWO(job);
  saveDB();closeModal('modal-schedule-job');
  var dateEl=document.getElementById('dispatch-date');
  if(dateEl) dateEl.value=date;
  renderDispatchBoard();
  showToast('Job scheduled'+(tech?' → '+tech:''),'success');
}

function timeStrToMins(str){
  if(!str) return DISPATCH_START_HOUR*60;
  var p=str.split(':');
  return parseInt(p[0])*60+(parseInt(p[1])||0);
}

// ── TOUCH DRAG POLYFILL ──
// Makes drag-and-drop work on iOS Safari and Android Chrome
var _touchDragJobId = null;
var _touchGhost     = null;
var _touchDragSrc   = null;

function attachTouchDrag() {
  // Attach to pool cards
  document.querySelectorAll('.dispatch-pool-card[data-job-id]').forEach(function(el){
    el.removeEventListener('touchstart', _onTouchStart);
    el.addEventListener('touchstart', _onTouchStart, {passive:false});
  });
  // Attach to job blocks on board
  document.querySelectorAll('.dispatch-job-block[data-job-id]').forEach(function(el){
    el.removeEventListener('touchstart', _onTouchStart);
    el.addEventListener('touchstart', _onTouchStart, {passive:false});
  });
}

function _onTouchStart(e) {
  var el = e.currentTarget;
  _touchDragJobId = el.getAttribute('data-job-id');
  _touchDragSrc = el.classList.contains('dispatch-pool-card') ? 'pool' : 'board';
  if (!_touchDragJobId) return;

  var job = (typeof _findJobOrWO==="function"?_findJobOrWO(_touchDragJobId):(DB.jobs||[]).find(function(j){return j.id===_touchDragJobId;}));
  if (!job) return;

  e.preventDefault();

  // Create ghost element
  _touchGhost = document.createElement('div');
  _touchGhost.className = 'dispatch-touch-ghost';
  var color = getJobColor(job.id);
  _touchGhost.style.background = color.bg;
  _touchGhost.textContent = (job.name||'').slice(0,25);
  document.body.appendChild(_touchGhost);

  var touch = e.touches[0];
  _touchGhost.style.left = touch.clientX + 'px';
  _touchGhost.style.top  = touch.clientY + 'px';

  el.style.opacity = '0.4';

  document.addEventListener('touchmove',  _onTouchMove,  {passive:false});
  document.addEventListener('touchend',   _onTouchEnd,   {passive:false});
  document.addEventListener('touchcancel',_onTouchCancel,{passive:false});
}

function _onTouchMove(e) {
  e.preventDefault();
  if (!_touchGhost) return;
  var touch = e.touches[0];
  _touchGhost.style.left = touch.clientX + 'px';
  _touchGhost.style.top  = touch.clientY + 'px';

  // Highlight drop target
  document.querySelectorAll('.dispatch-tech-timeline').forEach(function(el){el.classList.remove('drag-over');});
  var target = document.elementFromPoint(touch.clientX, touch.clientY);
  var timeline = target ? target.closest('.dispatch-tech-timeline') : null;
  if (timeline) timeline.classList.add('drag-over');
}

function _onTouchEnd(e) {
  if (!_touchGhost || !_touchDragJobId) { _cleanTouchDrag(); return; }
  var touch = e.changedTouches[0];
  var target = document.elementFromPoint(touch.clientX, touch.clientY);
  var timeline = target ? target.closest('.dispatch-tech-timeline') : null;

  if (timeline) {
    var techName = timeline.getAttribute('data-tech');
    var rect = timeline.getBoundingClientRect();
    var xPct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    var dropMins = Math.round(xPct * DISPATCH_MINS_TOTAL / 30) * 30;
    var dropHour = DISPATCH_START_HOUR + Math.floor(dropMins/60);
    var dropMin  = dropMins % 60;
    var dropTime = String(dropHour).padStart(2,'0')+':'+String(dropMin).padStart(2,'0');
    var dateEl   = document.getElementById('dispatch-date');
    var boardDate= dateEl ? dateEl.value : getTodayISO();

    var job = (typeof _findJobOrWO==="function"?_findJobOrWO(_touchDragJobId):(DB.jobs||[]).find(function(j){return j.id===_touchDragJobId;}));
    if (job && techName) {
      var already = isCrewMember(job, techName);
      if (!already) {
        var crew = getJobCrew(job);
        addCrewMember(job, techName, crew.length===0?'lead':'helper');
      }
      job.scheduledDate = boardDate;
      job.scheduledTime = dropTime;
      if (!job.status) job.status = 'Scheduled';
      _saveJobToWO(job);
      saveDB();
      renderDispatchBoard();
      showToast(already?'Rescheduled to '+dropTime:escHtml(techName)+' added to '+escHtml(job.name||''), 'success');
    }
  }

  _cleanTouchDrag();
}

function _onTouchCancel() { _cleanTouchDrag(); }

function _cleanTouchDrag() {
  if (_touchGhost) { _touchGhost.remove(); _touchGhost=null; }
  _touchDragJobId=null; _touchDragSrc=null;
  document.querySelectorAll('.dispatch-pool-card,.dispatch-job-block').forEach(function(el){el.style.opacity='1';});
  document.querySelectorAll('.dispatch-tech-timeline').forEach(function(el){el.classList.remove('drag-over');});
  document.removeEventListener('touchmove',  _onTouchMove);
  document.removeEventListener('touchend',   _onTouchEnd);
  document.removeEventListener('touchcancel',_onTouchCancel);
}

// ── DISPATCH SMS ──
// Called when assigning a tech — optionally sends them a text via Twilio Edge Function
function dispatchSendSMS(techName, jobId) {
  var job = (typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;}));
  var tech = (DB.team||[]).find(function(m){return m.name===techName;});
  if (!job||!tech||!tech.phone) {
    showToast('No phone number on file for '+techName,'warning');
    return;
  }

  var msg = 'TCSS Dispatch: You\'ve been assigned to '+
    (job.name||'a job')+
    (job.customer?' for '+job.customer:'')+
    (job.address?' at '+job.address:'')+
    (job.scheduledDate?' on '+job.scheduledDate:'')+
    (job.scheduledTime?' at '+job.scheduledTime:'')+'.'+
    (job.dispatchNotes?' Note: '+job.dispatchNotes:'');

  if (!confirm('Send dispatch SMS to '+techName+' ('+tech.phone+')?\n\n"'+msg+'"')) return;

  // Call Twilio via Supabase Edge Function (same pattern as absence alerts)
  if (_sb && _currentUser) {
    _sb.functions.invoke('send-sms', {
      body: { to: tech.phone, message: msg }
    }).then(function(r){
      if (r.error) { console.warn('[SMS]', r.error); showToast('SMS failed — check Twilio setup','error'); }
      else showToast('SMS sent to '+techName,'success');
    });
  } else {
    showToast('SMS requires Supabase connection','warning');
  }
}

// ---- ROLE SYSTEM — dynamic, owner-editable ----

var BUILT_IN_ROLES = ['owner','manager','back_office','estimator','lead_tech','project_manager','helper_tech','subcontractor'];

var DEFAULT_ROLE_LABELS = {
  owner:'Owner', manager:'Manager', back_office:'Back Office',
  estimator:'Estimator', lead_tech:'Lead Tech',
  project_manager:'Project Manager',
  helper_tech:'Helper Tech', subcontractor:'Subcontractor'
};

// Dynamic — reads from DB.settings.customRoles + built-ins
function getRoles() {
  var custom = (DB.settings && DB.settings.customRoles) || [];
  var all = BUILT_IN_ROLES.slice();
  custom.forEach(function(r){ if (all.indexOf(r.id) < 0) all.push(r.id); });
  return all;
}

function getRoleLabel(roleId) {
  var custom = (DB.settings && DB.settings.customRoles) || [];
  var c = custom.find(function(r){ return r.id===roleId; });
  if (c) return c.label;
  return DEFAULT_ROLE_LABELS[roleId] || roleId;
}

function getRoleLabels() {
  var out = Object.assign({}, DEFAULT_ROLE_LABELS);
  ((DB.settings && DB.settings.customRoles)||[]).forEach(function(r){ out[r.id]=r.label; });
  return out;
}

// Keep ROLES and ROLE_LABELS as computed getters for backward compat
Object.defineProperty(window, 'ROLES', { get: function(){ return getRoles(); }, configurable:true });
Object.defineProperty(window, 'ROLE_LABELS', { get: function(){ return getRoleLabels(); }, configurable:true });

var PERM_DEFS = [
  {key:'quote.create',    label:'Create / Edit Quotes',       group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.view',      label:'View Quotes',                group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.delete',    label:'Delete Quotes',              group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.send',      label:'Send Quote to Customer',     group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.convert',   label:'Convert Quote to Job',       group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.export',    label:'Export Quotes CSV',          group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'quote.bypass',    label:'Bypass Margin Floor',        group:'Quoting',        fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'cust.view',       label:'View Customers & Contacts',  group:'CRM',            fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'cust.edit',       label:'Add / Edit Customers',       group:'CRM',            fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'cust.delete',     label:'Delete Customers',           group:'CRM',            fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'contact.edit',    label:'Add / Edit Contacts',        group:'CRM',            fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'job.create',      label:'Create / Edit Jobs',         group:'Jobs',           fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'job.delete',      label:'Delete Jobs',                group:'Jobs',           fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'job.closeout',    label:'Job Closeout / Sign-off',    group:'Jobs',           fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},

  // ── Work Order permissions ────────────────────────────────────────────────
  {key:'wo.create',        label:'Create New Work Orders',     group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wo.edit',          label:'Edit WO Details',            group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wo.delete',        label:'Delete Work Orders',         group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'wo.view_financial',label:'View Rates & Financials',    group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wo.change_status', label:'Change WO Status',           group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wo.invoice',       label:'Create Invoices from WO',    group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'wo.change_order',  label:'Create Change Orders',       group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wo.settings',      label:'Access WO Settings',         group:'Work Orders',    fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'wo.view_assigned_only',label:'See Only Assigned WOs',  group:'Work Orders',    fixed:false, defaults:{owner:0,manager:0,back_office:0,estimator:0,lead_tech:0,helper_tech:1,project_manager:0,subcontractor:1}},
  {key:'wt.create',       label:'Create WT Projects',         group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wt.checkoff',     label:'Field Check-off Items',      group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'wt.confirm',      label:'Confirm Check-offs',         group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wt.reopen',       label:'Reopen Check-offs',          group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wt.rework',       label:'Log Reworks',                group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'wt.flags',        label:'Review Difficult Flags',     group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'wt.leaderboard',  label:'View Leaderboard',           group:'Work Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'time.clock',      label:'Clock In / Out (own)',        group:'Time Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'time.clockteam',  label:'Clock Team In / Out',         group:'Time Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'time.correct',    label:'Edit Time Corrections',       group:'Time Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'time.approveflag',label:'Approve Lunch Flags',         group:'Time Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'time.viewall',    label:'View All Timesheets',         group:'Time Tracking',  fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'leave.request',   label:'Request Time Off',            group:'Leave & Payroll',fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:0}},
  {key:'leave.approve',   label:'Approve Time Off',            group:'Leave & Payroll',fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'payroll.view',    label:'View Payroll Summary',        group:'Leave & Payroll',fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'payroll.process', label:'Mark Payroll Processed',      group:'Leave & Payroll',fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'payroll.export',  label:'Export Payroll CSV',          group:'Leave & Payroll',fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'tool.edit',       label:'Add / Edit Tools',            group:'Tools',          fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'tool.checkout',   label:'Check Out / Return Tools',    group:'Tools',          fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'tool.transfer',   label:'Transfer Tools',              group:'Tools',          fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'tool.inspect',    label:'Inspect Returned Tools',      group:'Tools',          fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'rpt.quotes',      label:'Quoting / Pipeline Reports',  group:'Reports',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'rpt.jobs',        label:'Job Performance Reports',     group:'Reports',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'rpt.tech',        label:'Tech Performance Reports',    group:'Reports',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'rpt.tools',       label:'Tool Utilization Reports',    group:'Reports',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'rpt.payroll',     label:'Payroll Reports',             group:'Reports',        fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'settings.team',   label:'Manage Team / Users',         group:'Settings',       fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'settings.margin', label:'Set Margin Floors',           group:'Settings',       fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'settings.catalog',label:'Edit Price Catalog',          group:'Settings',       fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'settings.company',label:'Company Settings',            group:'Settings',       fixed:true,  defaults:{owner:1,manager:0,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'docs.view',   label:'View WO Documents',   group:'Documents', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,project_manager:1,helper_tech:0,subcontractor:0}},
  {key:'docs.upload', label:'Upload WO Documents', group:'Documents', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,project_manager:1,helper_tech:0,subcontractor:0}},

  // ── Page Access — controls nav visibility ──────────────────────────────────
  {key:'page.qq',          label:'Quick Quote Page',      group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.quotes',      label:'Quotes Page',           group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.jobs',        label:'Active Jobs Page',      group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.dispatch',    label:'Dispatch Board',        group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.invoices',    label:'Invoices Page',         group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.workorders',  label:'Work Orders Page',      group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:0}},
  {key:'page.purchaseorders',label:'Purchase Orders Page',group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.vendors',     label:'Vendors Page',          group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.customers',   label:'Customers Page',        group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.contacts',    label:'Contacts Page',         group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.team',        label:'Team Page',             group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.catalog',     label:'Price Catalog Page',    group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.templates',   label:'Job Templates Page',    group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.reports',     label:'Reports Page',          group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.auditlog',    label:'Audit Log Page',        group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.calendar',    label:'Calendar Page',         group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:1,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:0}},
  {key:'page.inventory',   label:'Inventory Page',        group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.scanner',     label:'Scanner Page',          group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:1,helper_tech:0,project_manager:0,subcontractor:0}},
  {key:'page.tools',       label:'Tools Page',            group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:0}},
  {key:'page.timeclock',   label:'Time Clock Page',       group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'page.timesheet',   label:'Timesheets Page',       group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:0,helper_tech:0,project_manager:1,subcontractor:0}},
  {key:'page.worktracking',label:'Work Tracking Page',    group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:1,estimator:0,lead_tech:1,helper_tech:1,project_manager:1,subcontractor:1}},
  {key:'page.settings',    label:'Settings Page',         group:'Page Access', fixed:false, defaults:{owner:1,manager:1,back_office:0,estimator:0,lead_tech:0,helper_tech:0,project_manager:0,subcontractor:0}},
];

function getPermMatrix() {
  var saved  = (DB.settings && DB.settings.rolePermissions) || {};
  var roles  = getRoles();
  var matrix = {};
  PERM_DEFS.forEach(function(p){
    matrix[p.key] = {};
    var isRestriction = RESTRICTION_PERMS.indexOf(p.key) >= 0;
    roles.forEach(function(r){
      if (r === 'owner' && !isRestriction) {
        // Owner gets all capability permissions automatically
        matrix[p.key][r] = true;
      } else if (p.fixed) {
        matrix[p.key][r] = p.defaults[r] ? true : false;
      } else {
        var isCustom   = BUILT_IN_ROLES.indexOf(r) < 0;
        var defaultVal = isCustom ? false : (p.defaults[r] ? true : false);
        matrix[p.key][r] = (saved[p.key] && saved[p.key][r] !== undefined)
          ? !!saved[p.key][r]
          : defaultVal;
      }
    });
  });
  return matrix;
}

// Restriction permissions — owner follows the matrix for these (defaults to OFF)
var RESTRICTION_PERMS = ['wo.view_assigned_only'];

function hasPermission(permKey) {
  if (!_currentUser) return false;
  var role = _currentUser.role || 'helper_tech';
  var matrix = getPermMatrix();
  if (!matrix[permKey]) return false;
  return matrix[permKey][role] === true;
}

function renderPermissionsEditor() {
  var card = document.getElementById('role-permissions-card');
  if (!card) return;
  var role = _currentUser ? _currentUser.role : '';
  if (role !== 'owner') { card.style.display='none'; return; }
  card.style.display = 'block';

  var roles  = getRoles();
  var labels = getRoleLabels();
  var matrix = getPermMatrix();

  // ---- Role tab pills + Add Role button ----
  var tabsEl = document.getElementById('perm-role-tabs');
  if (tabsEl) {
    tabsEl.innerHTML =
      roles.map(function(r){
        var isBuiltIn = BUILT_IN_ROLES.indexOf(r) >= 0;
        var isOwner   = r === 'owner';
        return '<div style="display:inline-flex;align-items:center;gap:4px;background:#e3f2fd;border-radius:20px;padding:4px 12px;margin-right:6px;margin-bottom:6px">'+
          '<span style="font-size:12px;font-weight:700;color:#1565c0">'+escHtml(labels[r]||r)+'</span>'+
          (!isBuiltIn?'<button onclick="deleteCustomRole(\''+r+'\')" style="background:none;border:none;cursor:pointer;color:#c62828;font-size:14px;padding:0;line-height:1">×</button>':'')+
        '</div>';
      }).join('') +
      '<button onclick="openAddRoleModal()" style="background:#fff;border:1px dashed #1565c0;color:#1565c0;border-radius:20px;padding:4px 14px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:6px">+ Add Role</button>';
  }

  // ---- Permission grid ----
  var grid = document.getElementById('perm-grid');
  if (!grid) return;

  var html = '<div style="overflow-x:auto"><table class="perm-table" style="min-width:'+((roles.length+1)*120)+'px"><thead><tr>'+
    '<th style="text-align:left;min-width:200px;position:sticky;left:0;background:#f0f4f8;z-index:2">Permission</th>'+
    roles.map(function(r){
      return '<th style="min-width:100px;text-align:center">'+
        '<div style="font-weight:700;font-size:11px">'+escHtml(labels[r]||r)+'</div>'+
      '</th>';
    }).join('')+
  '</tr></thead><tbody>';

  var lastGroup = '';
  PERM_DEFS.forEach(function(p){
    if (p.group !== lastGroup) {
      lastGroup = p.group;
      html += '<tr class="perm-group-row"><td colspan="'+(roles.length+1)+'" style="position:sticky;left:0">'+escHtml(p.group)+'</td></tr>';
    }
    html += '<tr><td style="position:sticky;left:0;background:#fff;z-index:1">'+(p.fixed?'🔒 ':'')+escHtml(p.label)+(p.fixed?' <span style="font-size:10px;color:#90a4ae">(structural)</span>':'')+'</td>';
    roles.forEach(function(r){
      var val = matrix[p.key] ? matrix[p.key][r] : false;
      // Owner always on, always fixed
      if (r === 'owner') {
        html += '<td class="perm-center"><span style="color:#2e7d32;font-size:16px">✓</span></td>';
      } else if (p.fixed) {
        html += '<td class="perm-center"><span class="perm-fixed" style="color:'+(val?'#2e7d32':'#d0d0d0')+'">'+(val?'✓':'✗')+'</span></td>';
      } else {
        var tid = 'perm-'+p.key.replace(/\./g,'-')+'-'+r;
        html += '<td class="perm-center">'+
          '<label class="perm-toggle">'+
            '<input type="checkbox" id="'+tid+'" '+(val?'checked':'')+
            ' onchange="savePermChange(\''+p.key+'\',\''+r+'\',this.checked)">'+
            '<span class="perm-slider"></span>'+
          '</label>'+
        '</td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  grid.innerHTML = html;
}

// ---- ADD CUSTOM ROLE ----
function openAddRoleModal() {
  var name = prompt('New role name (e.g. "Field Supervisor"):');
  if (!name || !name.trim()) return;
  var id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');
  if (getRoles().indexOf(id) >= 0) {
    showToast('A role with that name already exists','error'); return;
  }
  if (!DB.settings) DB.settings = {};
  if (!DB.settings.customRoles) DB.settings.customRoles = [];
  DB.settings.customRoles.push({ id: id, label: name.trim() });
  // Set all perms to off by default for new role
  if (!DB.settings.rolePermissions) DB.settings.rolePermissions = {};
  PERM_DEFS.forEach(function(p){
    if (!DB.settings.rolePermissions[p.key]) DB.settings.rolePermissions[p.key] = {};
    DB.settings.rolePermissions[p.key][id] = false;
  });
  saveDB();
  renderPermissionsEditor();
  showToast('"'+name.trim()+'" role created — set permissions below','success');
}

function deleteCustomRole(roleId) {
  if (BUILT_IN_ROLES.indexOf(roleId) >= 0) {
    showToast('Built-in roles cannot be deleted','error'); return;
  }
  var labels = getRoleLabels();
  if (!confirm('Delete role "'+labels[roleId]+'"? Team members assigned this role will need to be reassigned.')) return;
  if (!DB.settings || !DB.settings.customRoles) return;
  DB.settings.customRoles = DB.settings.customRoles.filter(function(r){ return r.id !== roleId; });
  saveDB();
  renderPermissionsEditor();
  showToast('Role deleted','info');
}

function savePermChange(permKey, role, value) {
  if (!DB.settings) DB.settings={};
  if (!DB.settings.rolePermissions) DB.settings.rolePermissions={};
  if (!DB.settings.rolePermissions[permKey]) DB.settings.rolePermissions[permKey]={};
  var oldVal = DB.settings.rolePermissions[permKey][role];
  DB.settings.rolePermissions[permKey][role] = value;
  saveDB();
  if (typeof auditPermChange === 'function') auditPermChange(role, permKey, oldVal, value);
  showToast((ROLE_LABELS[role]||role)+': '+(value?'✓ Granted':'✗ Revoked'),'info',2000);
}

function resetPermissionsToDefault() {
  if (!confirm('Reset ALL permissions to factory defaults? This cannot be undone.')) return;
  if (!DB.settings) DB.settings={};
  DB.settings.rolePermissions = {};
  saveDB();
  renderPermissionsEditor();
  showToast('Permissions reset to defaults','success');
}

function exportPermissionsDoc() {
  var matrix = getPermMatrix();
  var groups = {};
  PERM_DEFS.forEach(function(p){ if(!groups[p.group]) groups[p.group]=[]; groups[p.group].push(p); });
  var roleColors = {owner:'#1565c0',manager:'#2e7d32',back_office:'#e65100',estimator:'#6a1b9a',lead_tech:'#00695c',helper_tech:'#546e7a',subcontractor:'#ad1457'};

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TCSS ProBid — Role Permissions</title>'+
    '<style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px}h1{color:#1565c0;margin-bottom:2px}h2{font-size:11px;color:#546e7a;font-weight:400;margin-top:0;margin-bottom:16px}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#1565c0;color:#fff;padding:6px 10px;font-size:11px;text-align:center}th:first-child{text-align:left}'+
    'td{padding:5px 10px;border-bottom:1px solid #eee;font-size:11px}tr:hover td{background:#f8f9fa}'+
    '.grp td{background:#e3f0ff!important;font-weight:700;color:#1565c0;font-size:10px;text-transform:uppercase;letter-spacing:.5px}'+
    '.yes{color:#2e7d32;font-weight:700;text-align:center}.no{color:#d0d0d0;text-align:center}.fixed{color:#90a4ae;text-align:center}'+
    '.no-print{margin-bottom:16px}@media print{.no-print{display:none}@page{margin:10mm;size:landscape}}'+
    '</style></head><body>'+
    '<div class="no-print"><button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;margin-right:8px">🖨 Print</button>'+
    '<button onclick="window.close()" style="border:1px solid #ddd;background:#fff;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer">Close</button></div>'+
    '<h1>TCSS ProBid V9 — Role Permissions Reference</h1>'+
    '<h2>Generated '+new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})+'  ·  Confidential — Internal Use Only</h2>'+
    '<table><thead><tr><th>Permission</th>'+
      ROLES.map(function(r){ return '<th style="background:'+roleColors[r]+'">'+ROLE_LABELS[r]+'</th>'; }).join('')+
    '</tr></thead><tbody>';

  Object.keys(groups).forEach(function(grp){
    html += '<tr class="grp"><td colspan="'+(ROLES.length+1)+'">'+grp+'</td></tr>';
    groups[grp].forEach(function(p){
      html += '<tr><td>'+(p.fixed?'🔒 ':'')+escHtml(p.label)+'</td>';
      ROLES.forEach(function(r){
        var val = matrix[p.key][r];
        html += p.fixed
          ? '<td class="fixed">'+(val?'●':'○')+'</td>'
          : '<td class="'+(val?'yes':'no')+'">'+(val?'✓':'✗')+'</td>';
      });
      html += '</tr>';
    });
  });
  html += '</tbody></table><p style="font-size:10px;color:#90a4ae">✓ Full Access  ✗ No Access  🔒 Structural (fixed)  ● Fixed On  ○ Fixed Off</p></body></html>';

  var win = window.open('','_blank','width=1100,height=750');
  if (win) { win.document.write(html); win.document.close(); setTimeout(function(){ win.print(); },500); }
  else showToast('Allow popups to export','warning');
}


// ============================================================
// MASTER SETTINGS
// ============================================================

function switchMsTab(tab) {
  document.querySelectorAll('.ms-tab').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-tab')===tab);
  });
  document.querySelectorAll('.ms-section').forEach(function(s){
    s.classList.toggle('active', s.id==='ms-'+tab);
  });
  // Scroll settings page to top on every tab switch
  var page = document.getElementById('page-settings');
  if (page) page.scrollTop = 0;
  window.scrollTo(0,0);
  // Render tab content on first open
  if (tab==='workorders')   renderMsWOSettings();
  if (tab==='roles')        renderMsRolesTab();
  if (tab==='quoting')      { setTimeout(function(){ renderMarginFloorsEditor(); renderMsPaymentTerms(); }, 50); }
  if (tab==='inventory')    typeof renderLocationSettings === 'function' && renderLocationSettings();
  if (tab==='time')         typeof renderMsTimeSettings   === 'function' && renderMsTimeSettings();
}

// ---- ROLES TAB ----
function renderMsRolesTab() {
  var el = document.getElementById('ms-roles-content');
  if (!el) return;
  // Move role-permissions-card into this tab and show it
  var card = document.getElementById('role-permissions-card');
  if (card) {
    card.style.display = 'block';
    el.appendChild(card);
    renderPermissionsEditor();
  }
}

// ---- WO SETTINGS TAB ----
function renderMsWOSettings() {
  renderMsWOStatuses();
  renderMsWOTypes();
  renderMsWOExpenses();
  renderMsWORates();
}

function renderMsWOStatuses() {
  var el = document.getElementById('ms-wo-statuses-section');
  if (!el) return;
  var settings = DB.woSettings || {};
  var statuses = settings.statuses && settings.statuses.length ? settings.statuses : WO_STATUSES;

  el.innerHTML =
    '<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
      '<div class="card-title" style="margin:0">📋 Work Order Statuses</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addMsWOStatus()">+ Add Status</button>'+
    '</div>'+
    '<p style="font-size:12px;color:#546e7a;margin-bottom:12px">'+
      '⣿ Drag the handle to reorder. '+
      'Open statuses allow time entries and field access. '+
      'Closed statuses lock the WO for billing.'+
    '</p>'+
    '<table id="wo-status-table" style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:8px 6px;width:24px"></th>'+
      '<th style="padding:8px 10px;text-align:left;font-size:11px;color:#546e7a;text-transform:uppercase;font-weight:700">Status Name</th>'+
      '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#546e7a;text-transform:uppercase;font-weight:700">Color</th>'+
      '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#546e7a;text-transform:uppercase;font-weight:700">Open</th>'+
      '<th style="padding:8px 10px;text-align:center;font-size:11px;color:#546e7a;text-transform:uppercase;font-weight:700">Mobile</th>'+
      '<th style="padding:8px 10px;width:32px"></th>'+
    '</tr></thead>'+
    '<tbody id="wo-status-tbody">'+
    statuses.map(function(s,i){
      var isOpen = s.open !== false;
      return '<tr data-idx="'+i+'" style="border-bottom:1px solid #f0f4f8">'+
        '<td draggable="true" data-idx="'+i+'" '+
        'ondragstart="wsDragStart(event)" ondragend="wsDragEnd(event)" '+
        'style="padding:8px 6px;text-align:center;cursor:grab;color:#90a4ae;font-size:18px;user-select:none" title="Drag to reorder">⣿</td>'+
        '<td style="padding:8px 10px">'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            '<div style="width:12px;height:12px;border-radius:50%;background:'+escHtml(s.color||'#ddd')+';border:1px solid rgba(0,0,0,.15);flex-shrink:0"></div>'+
            '<input value="'+escHtml(s.id)+'" onchange="updateWOStatusName('+i+',this.value)" style="flex:1;padding:5px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
          '</div>'+
        '</td>'+
        '<td style="padding:8px 10px;text-align:center">'+
          '<input type="color" value="'+escHtml(s.color||'#dddddd')+'" onchange="updateWOStatusColor('+i+',this.value)" style="width:36px;height:28px;border:none;border-radius:4px;cursor:pointer;padding:2px">'+
        '</td>'+
        '<td style="padding:8px 10px;text-align:center">'+
          '<label class="perm-toggle" style="margin:0 auto">'+
            '<input type="checkbox" '+(isOpen?'checked':'')+' onchange="updateWOStatusOpen('+i+',this.checked)">'+
            '<span class="perm-slider"></span>'+
          '</label>'+
        '</td>'+
        '<td style="padding:8px 10px;text-align:center">'+
          '<label class="perm-toggle" style="margin:0 auto">'+
            '<input type="checkbox" '+(s.mobile?'checked':'')+' onchange="updateWOStatusMobile('+i+',this.checked)">'+
            '<span class="perm-slider"></span>'+
          '</label>'+
        '</td>'+
        '<td style="padding:8px 6px;text-align:center">'+
          '<button onclick="deleteMsWOStatus('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:16px;padding:0" title="Delete">×</button>'+
        '</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>';

  _initWOStatusDrag();
}

// ---- DRAG TO REORDER ----
var _wsDragSrcIdx = null;

function _initWOStatusDrag() {
  var tbody = document.getElementById('wo-status-tbody');
  if (!tbody) return;
  tbody.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var tr = e.target.closest('tr');
    var rows = tbody.querySelectorAll('tr');
    rows.forEach(function(r){ r.style.borderTop = ''; });
    if (tr) tr.style.borderTop = '2px solid #1565c0';
  });
  tbody.addEventListener('drop', function(e) {
    e.preventDefault();
    var tr = e.target.closest('tr');
    if (!tr) return;
    var targetIdx = parseInt(tr.getAttribute('data-idx'));
    if (_wsDragSrcIdx === null || isNaN(targetIdx) || _wsDragSrcIdx === targetIdx) return;
    var statuses = _getMsStatuses();
    var moved = statuses.splice(_wsDragSrcIdx, 1)[0];
    statuses.splice(targetIdx, 0, moved);
    saveDB();
    showToast('Order saved ✓', 'success', 1500);
    renderMsWOStatuses();
  });
  tbody.addEventListener('dragleave', function(e) {
    if (!tbody.contains(e.relatedTarget)) {
      tbody.querySelectorAll('tr').forEach(function(r){ r.style.borderTop = ''; });
    }
  });
}

function wsDragStart(e) {
  _wsDragSrcIdx = parseInt(e.currentTarget.getAttribute('data-idx'));
  // Dim the whole row
  var row = e.currentTarget.closest('tr') || e.currentTarget.parentElement;
  if (row) row.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _wsDragSrcIdx);
}



function wsDragEnd(e) {
  var row = e.currentTarget.closest('tr') || e.currentTarget.parentElement;
  if (row) row.style.opacity = '';
  var rows = document.querySelectorAll('#wo-status-tbody tr');
  rows.forEach(function(r){ r.style.borderTop = ''; r.style.opacity = ''; });
  _wsDragSrcIdx = null;
}

function _getMsStatuses() {
  if (!DB.woSettings) DB.woSettings = {};
  if (!DB.woSettings.statuses || !DB.woSettings.statuses.length) {
    DB.woSettings.statuses = WO_STATUSES.map(function(s){ return Object.assign({},s); });
  }
  return DB.woSettings.statuses;
}

function updateWOStatusName(idx, val) {
  var s = _getMsStatuses(); if (!s[idx]) return;
  s[idx].id = val; saveDB();
}
function updateWOStatusColor(idx, val) {
  var s = _getMsStatuses(); if (!s[idx]) return;
  s[idx].color = val; saveDB();
}
function updateWOStatusOpen(idx, val) {
  var s = _getMsStatuses(); if (!s[idx]) return;
  s[idx].open = val; saveDB();
}
function updateWOStatusMobile(idx, val) {
  var s = _getMsStatuses(); if (!s[idx]) return;
  s[idx].mobile = val; saveDB();
}
function addMsWOStatus() {
  var name = prompt('New status name:'); if (!name||!name.trim()) return;
  var s = _getMsStatuses();
  s.push({ id:name.trim(), color:'#ddd8d8', open:true, mobile:false });
  saveDB(); renderMsWOStatuses();
}
function deleteMsWOStatus(idx) {
  var s = _getMsStatuses();
  if (!confirm('Delete status "'+s[idx].id+'"?')) return;
  s.splice(idx,1); saveDB(); renderMsWOStatuses();
}

function renderMsWOTypes() {
  var el = document.getElementById('ms-wo-types-section');
  if (!el) return;
  var settings  = DB.woSettings || {};
  var types     = settings.serviceTypes || WO_SERVICE_TYPES || [];
  el.innerHTML =
    '<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
      '<div class="card-title" style="margin:0">🔧 Service Types</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addMsWOType()">+ Add Type</button>'+
    '</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:8px">'+
      types.map(function(t,i){
        return '<div style="display:flex;align-items:center;gap:4px;background:#f0f4f8;border-radius:20px;padding:4px 10px">'+
          '<span style="font-size:12px;font-weight:600">'+escHtml(t)+'</span>'+
          '<button onclick="deleteMsWOType('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>'+
        '</div>';
      }).join('')+
    '</div></div>';
}
function addMsWOType() {
  var v = prompt('New service type:'); if(!v||!v.trim()) return;
  if (!DB.woSettings) DB.woSettings={};
  if (!DB.woSettings.serviceTypes) DB.woSettings.serviceTypes = (WO_SERVICE_TYPES||[]).slice();
  DB.woSettings.serviceTypes.push(v.trim()); saveDB(); renderMsWOTypes();
}
function deleteMsWOType(idx) {
  if (!DB.woSettings||!DB.woSettings.serviceTypes) return;
  DB.woSettings.serviceTypes.splice(idx,1); saveDB(); renderMsWOTypes();
}

function renderMsWOExpenses() {
  var el = document.getElementById('ms-wo-expenses-section');
  if (!el) return;
  var settings = DB.woSettings || {};
  var cats = settings.expenseCategories || WO_EXPENSE_CATS || [];
  el.innerHTML =
    '<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
      '<div class="card-title" style="margin:0">💸 Expense Categories</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addMsWOExpCat()">+ Add Category</button>'+
    '</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:8px">'+
      cats.map(function(c,i){
        return '<div style="display:flex;align-items:center;gap:4px;background:#fff3e0;border-radius:20px;padding:4px 10px">'+
          '<span style="font-size:12px;font-weight:600">'+escHtml(c)+'</span>'+
          '<button onclick="deleteMsWOExpCat('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>'+
        '</div>';
      }).join('')+
    '</div></div>';
}
function addMsWOExpCat() {
  var v = prompt('New expense category:'); if(!v||!v.trim()) return;
  if (!DB.woSettings) DB.woSettings={};
  if (!DB.woSettings.expenseCategories) DB.woSettings.expenseCategories = (WO_EXPENSE_CATS||[]).slice();
  DB.woSettings.expenseCategories.push(v.trim()); saveDB(); renderMsWOExpenses();
}
function deleteMsWOExpCat(idx) {
  if (!DB.woSettings||!DB.woSettings.expenseCategories) return;
  DB.woSettings.expenseCategories.splice(idx,1); saveDB(); renderMsWOExpenses();
}

function renderMsWORates() {
  var el = document.getElementById('ms-wo-rates-section');
  if (!el) return;
  var s = DB.woSettings || {};
  el.innerHTML =
    '<div class="card">'+
    '<div class="card-title">⚙️ Default Rates</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'+
      '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">Default Labor Rate ($/hr)</label>'+
        '<input id="ms-default-labor" type="number" value="'+(s.defaultLaborRate||125)+'" style="width:100%;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;box-sizing:border-box" onchange="saveMsWORate(\'defaultLaborRate\',this.value)"></div>'+
      '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">Default OT Rate ($/hr)</label>'+
        '<input id="ms-default-ot" type="number" value="'+(s.defaultOTRate||187.50)+'" style="width:100%;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;box-sizing:border-box" onchange="saveMsWORate(\'defaultOTRate\',this.value)"></div>'+
      '<div><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">Default Tax Rate (%)</label>'+
        '<input id="ms-default-tax" type="number" value="'+(s.defaultTaxRate||0)+'" style="width:100%;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;box-sizing:border-box" onchange="saveMsWORate(\'defaultTaxRate\',this.value)"></div>'+
    '</div></div>';
}
function saveMsWORate(key, val) {
  if (!DB.woSettings) DB.woSettings = {};
  DB.woSettings[key] = parseFloat(val)||0;
  saveDB();
  showToast('Rate saved ✓','success',2000);
}

// ============================================================
// PAYMENT TERMS — Master Settings
// ============================================================

var PAYMENT_TERMS_DEFAULT = [
  'Due on Receipt',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
  '50% Down, Balance on Completion',
  '25% Down, Balance on Completion'
];

function getPaymentTermsList() {
  var saved = DB.settings && DB.settings.paymentTerms;
  return (saved && saved.length) ? saved : PAYMENT_TERMS_DEFAULT.slice();
}

function renderMsPaymentTerms() {
  var el = document.getElementById('ms-payment-terms-section');
  if (!el) return;
  var terms = getPaymentTermsList();

  el.innerHTML =
    '<div class="card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
      '<div class="card-title" style="margin:0">💳 Payment Terms</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addPaymentTerm()">+ Add Term</button>'+
    '</div>'+
    '<p style="font-size:12px;color:#546e7a;margin-bottom:12px">Drag ⣿ to reorder. First item is the default for new customers and quotes.</p>'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<tbody id="pt-tbody">'+
    terms.map(function(t, i) {
      return '<tr data-pt-idx="'+i+'" style="border-bottom:1px solid #f0f4f8">'+
        '<td style="padding:6px 6px;cursor:grab;color:#90a4ae;font-size:18px;user-select:none;width:24px" '+
        'draggable="true" data-pt-idx="'+i+'" '+
        'ondragstart="ptDragStart(event)" ondragend="ptDragEnd(event)">⣿</td>'+
        '<td style="padding:6px 8px">'+
          '<input value="'+escHtml(t)+'" onchange="updatePaymentTerm('+i+',this.value)" '+
          'style="width:100%;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;box-sizing:border-box">'+
        '</td>'+
        '<td style="padding:6px 8px;width:32px;text-align:center">'+
          (i===0?'<span style="font-size:10px;color:#2e7d32;font-weight:700">DEFAULT</span>':
          '<button onclick="deletePaymentTerm('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:16px;padding:0">×</button>')+
        '</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table>'+
    '<div style="margin-top:12px">'+
      '<button class="btn btn-primary" onclick="savePaymentTerms()">💾 Save Payment Terms</button>'+
    '</div>'+
    '</div>';

  _initPtDrag();
}

var _ptDragSrcIdx = null;
function _initPtDrag() {
  var tbody = document.getElementById('pt-tbody');
  if (!tbody) return;
  tbody.addEventListener('dragover', function(e){
    e.preventDefault();
    var tr = e.target.closest('tr');
    tbody.querySelectorAll('tr').forEach(function(r){ r.style.borderTop=''; });
    if (tr) tr.style.borderTop = '2px solid #1565c0';
  });
  tbody.addEventListener('drop', function(e){
    e.preventDefault();
    var tr = e.target.closest('tr');
    if (!tr) return;
    var targetIdx = parseInt(tr.getAttribute('data-pt-idx'));
    if (_ptDragSrcIdx===null || isNaN(targetIdx) || _ptDragSrcIdx===targetIdx) return;
    var terms = getPaymentTermsList();
    var moved = terms.splice(_ptDragSrcIdx,1)[0];
    terms.splice(targetIdx,0,moved);
    if (!DB.settings) DB.settings={};
    DB.settings.paymentTerms = terms;
    saveDB(); renderMsPaymentTerms();
    showToast('Order saved ✓','success',1500);
  });
  tbody.addEventListener('dragleave', function(e){
    if (!tbody.contains(e.relatedTarget))
      tbody.querySelectorAll('tr').forEach(function(r){ r.style.borderTop=''; });
  });
}
function ptDragStart(e) {
  _ptDragSrcIdx = parseInt(e.currentTarget.getAttribute('data-pt-idx'));
  var row = e.currentTarget.closest('tr'); if(row) row.style.opacity='0.4';
  e.dataTransfer.effectAllowed='move';
}
function ptDragEnd(e) {
  var row = e.currentTarget.closest('tr'); if(row) row.style.opacity='';
  document.querySelectorAll('#pt-tbody tr').forEach(function(r){ r.style.borderTop=''; r.style.opacity=''; });
  _ptDragSrcIdx=null;
}
function updatePaymentTerm(idx, val) {
  var terms = getPaymentTermsList();
  if (terms[idx]!==undefined) terms[idx]=val;
  if (!DB.settings) DB.settings={};
  DB.settings.paymentTerms = terms;
}
function addPaymentTerm() {
  var terms = getPaymentTermsList();
  terms.push('New Term');
  if (!DB.settings) DB.settings={};
  DB.settings.paymentTerms = terms;
  saveDB(); renderMsPaymentTerms();
  var rows = document.querySelectorAll('#pt-tbody tr');
  if (rows.length) { var inp=rows[rows.length-1].querySelector('input'); if(inp){inp.focus();inp.select();} }
}
function deletePaymentTerm(idx) {
  var terms = getPaymentTermsList();
  if (!confirm('Remove "'+terms[idx]+'"?')) return;
  terms.splice(idx,1);
  if (!DB.settings) DB.settings={};
  DB.settings.paymentTerms = terms;
  saveDB(); renderMsPaymentTerms();
}
function savePaymentTerms() {
  var terms = getPaymentTermsList();
  var rows = document.querySelectorAll('#pt-tbody tr[data-pt-idx]');
  rows.forEach(function(row){
    var idx = parseInt(row.getAttribute('data-pt-idx'));
    var inp = row.querySelector('input');
    if (inp && terms[idx]!==undefined) terms[idx]=inp.value.trim()||terms[idx];
  });
  if (!DB.settings) DB.settings={};
  DB.settings.paymentTerms = terms;
  saveDB();
  // Refresh all payment terms dropdowns
  refreshAllPaymentTermsDropdowns();
  showToast('Payment terms saved ✓','success',2000);
}

function refreshAllPaymentTermsDropdowns() {
  var terms = getPaymentTermsList();
  var opts = '<option value="">— Select —</option>' +
    terms.map(function(t){ return '<option value="'+escHtml(t)+'">'+escHtml(t)+'</option>'; }).join('');
  ['qq-pt','m-cterms'].forEach(function(id){
    var el = document.getElementById(id);
    if (!el) return;
    var cur = el.value;
    el.innerHTML = opts;
    if (cur) el.value = cur;
  });
}
