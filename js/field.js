// =============================================
// TIME CLOCK, TRAVEL PHASES & GEOFENCING
// =============================================

var _clockState = {
  status: 'out',        // out | at_homebase | traveling | onsite | break | lunch | returning
  sessionId: null,
  dayStart: null,
  homebaseStart: null,
  travelOutStart: null, travelOutMins: 0,
  onsiteStart: null,    onsiteMins: 0,
  breakStart: null,     breakMins: 0,
  lunchStart: null,     lunchMins: 0,
  travelBackStart: null,travelBackMins: 0,
  jobId: null, jobName: null,
  gpsLat: null, gpsLng: null, gpsAccuracy: null,
  timerInterval: null,
  todayEvents: [],
  outOfTown: false, hotelAddr: '',
  lunchCount: 0  // number of lunch periods taken today
};

var _eodReminderShown = false;
var GEO_RADIUS_FT = 500;

function geoDistanceFt(lat1,lng1,lat2,lng2) {
  var R=20902231;
  var dLat=(lat2-lat1)*Math.PI/180;
  var dLng=(lng2-lng1)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

function getGPS(callback) {
  var badge=document.getElementById('gps-badge');
  if (badge){badge.className='gps-badge acquiring';badge.textContent='📍 Getting GPS...';}
  if (!navigator.geolocation){if(badge){badge.className='gps-badge failed';badge.textContent='❌ GPS unavailable';}callback(null,null,null);return;}
  navigator.geolocation.getCurrentPosition(
    function(pos){
      var lat=pos.coords.latitude,lng=pos.coords.longitude,acc=Math.round(pos.coords.accuracy);
      _clockState.gpsLat=lat;_clockState.gpsLng=lng;_clockState.gpsAccuracy=acc;
      if(badge){badge.className='gps-badge locked';badge.textContent='📍 GPS ±'+acc+'m';}
      callback(lat,lng,acc);
    },
    function(){if(badge){badge.className='gps-badge failed';badge.textContent='❌ GPS denied';}callback(null,null,null);},
    {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
  );
}

function checkGeofence(lat,lng,jobId) {
  if (!lat||!lng) return {ok:true,distanceFt:null,reason:'no_gps'};
  var job=DB.jobs.find(function(j){return j.id==jobId;});
  if (!job||!job.gpsAnchor) return {ok:true,distanceFt:null,reason:'no_anchor'};
  var dist=geoDistanceFt(lat,lng,job.gpsAnchor.lat,job.gpsAnchor.lng);
  return {ok:dist<=GEO_RADIUS_FT,distanceFt:dist,reason:dist<=GEO_RADIUS_FT?'in_range':'out_of_range'};
}

function setJobAnchor(jobId,lat,lng) {
  if (!lat||!lng) return;
  var job=DB.jobs.find(function(j){return j.id==jobId;});
  if (!job||job.gpsAnchor) return;
  job.gpsAnchor={lat:lat,lng:lng,setBy:_currentUser?_currentUser.full_name:'Unknown',setAt:new Date().toISOString()};
  saveDB();
  showToast('Job site anchor set for '+job.name,'info',4000);
}

function showGeoAlert(msg){var el=document.getElementById('geo-alert');if(el){el.innerHTML=msg;el.style.display='block';}}
function clearGeoAlert(){var el=document.getElementById('geo-alert');if(el){el.innerHTML='';el.style.display='none';}}

function toggleOutOfTown(){
  var cb=document.getElementById('clock-out-of-town');
  var wrap=document.getElementById('hotel-addr-wrap');
  _clockState.outOfTown=cb?cb.checked:false;
  if(wrap) wrap.style.display=_clockState.outOfTown?'block':'none';
  // Persist hotel setting across days — saved until explicitly cleared
  if (!_clockState.outOfTown) {
    DB.settings = Object.assign({}, DB.settings, {currentHotel:''});
    _clockState.hotelAddr = '';
    saveDB();
  }
}

function saveHotelAddress() {
  var inp = document.getElementById('clock-hotel-addr');
  var addr = inp ? inp.value.trim() : '';
  if (!addr) return;
  _clockState.hotelAddr = addr;
  DB.settings = Object.assign({}, DB.settings, {currentHotel: addr});
  saveDB();
  showToast('Hotel base saved — will persist for consecutive days', 'success', 3000);
}

function clearHotelBase() {
  var cb = document.getElementById('clock-out-of-town');
  var wrap = document.getElementById('hotel-addr-wrap');
  var inp = document.getElementById('clock-hotel-addr');
  if (cb) cb.checked = false;
  if (wrap) wrap.style.display = 'none';
  if (inp) inp.value = '';
  _clockState.outOfTown = false;
  _clockState.hotelAddr = '';
  DB.settings = Object.assign({}, DB.settings, {currentHotel:''});
  saveDB();
  showToast('Hotel base cleared — using office as home base', 'info');
}

async function logTimeEvent(type,lat,lng,acc,note){
  if(!_sb||!_currentUser) return;
  await _sb.from('time_events').insert({
    session_id:_clockState.sessionId,
    user_id:_currentUser.id,user_name:_currentUser.full_name,
    job_id:_clockState.jobId,job_name:_clockState.jobName,
    event_type:type,lat:lat,lng:lng,accuracy:acc,
    timestamp:new Date().toISOString(),note:note||''
  });
}

// PHASE 0 — START OF DAY (GPS required, must be at office/hotel)
async function doStartDay() {
  getGPS(async function(lat, lng, acc) {
    if (!lat || !lng) {
      showToast('GPS required to start your day. Enable location and try again.', 'error', 4000);
      return;
    }
    // Check if at office (soft mode — warn but allow; hard mode — block)
    var officeAnchor = DB.settings && DB.settings.officeGpsLat ? {lat: DB.settings.officeGpsLat, lng: DB.settings.officeGpsLng} : null;
    if (officeAnchor) {
      var dist = geoDistanceFt(lat, lng, officeAnchor.lat, officeAnchor.lng);
      var enforce = !!(DB.settings && DB.settings.geofenceEnforce);
      if (dist > GEO_RADIUS_FT) {
        if (enforce) { showGeoAlert('🔒 Must be at the office or hotel to start your day. You are '+dist+' ft away.'); return; }
        else { showGeoAlert('⚠️ You appear to be '+dist+' ft from the office. Proceeding — flagged for review.'); }
      } else { clearGeoAlert(); }
    }
    var now = new Date();
    _clockState.status = 'at_homebase';
    _clockState.dayStart = now;
    _clockState.homebaseStart = now;
    _clockState.gpsLat = lat; _clockState.gpsLng = lng; _clockState.gpsAccuracy = acc;
    _clockState.todayEvents.push({type:'day_start', time:now, lat:lat, lng:lng, label:'Started Day at Base'});
    await logTimeEvent('day_start', lat, lng, acc);
    updateClockUI(); startClockTimer();
    showToast('Day started — select a job and start travel when ready', 'success');
    scheduleEodReminder();
  });
}

// PHASE 1 — START TRAVEL (from homebase or from a job to next job)
async function doStartTravel(){
  var jobSel=document.getElementById('clock-job-select');
  var jobId=jobSel?jobSel.value:'';
  var jobName=jobSel&&jobSel.selectedIndex>0?jobSel.options[jobSel.selectedIndex].text:'General';
  if(!jobId){showToast('Please select a job first','warning');if(jobSel)jobSel.style.borderColor='#c62828';return;}
  if(jobSel)jobSel.style.borderColor='';
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    var session={user_id:_currentUser?_currentUser.id:null,user_name:_currentUser?_currentUser.full_name:'Unknown',
      job_id:jobId,job_name:jobName,status:'traveling',clock_in_at:now.toISOString(),
      clock_in_lat:lat,clock_in_lng:lng,date:now.toISOString().split('T')[0]};
    var sessionId=null;
    if(_sb&&_currentUser){var res=await _sb.from('clock_sessions').insert(session).select().single();if(res.data)sessionId=res.data.id;}
    _clockState.status='traveling';_clockState.sessionId=sessionId;
    _clockState.dayStart=now;_clockState.travelOutStart=now;
    _clockState.jobId=jobId;_clockState.jobName=jobName;
    _clockState.todayEvents.push({type:'travel_start',time:now,lat:lat,lng:lng,label:'Started Travel'});
    await logTimeEvent('travel_start',lat,lng,acc);
    updateClockUI();startClockTimer();
    showToast('Travel started — drive safe!','success');
    scheduleEodReminder();
  });
}

// PHASE 2 — ARRIVE ON SITE
async function doArriveOnSite(){
  getGPS(async function(lat,lng,acc){
    var enforce=!!(DB.settings&&DB.settings.geofenceEnforce);
    var geo=checkGeofence(lat,lng,_clockState.jobId);
    if(geo.reason==='out_of_range'){
      var msg='📍 You are <strong>'+geo.distanceFt+' ft</strong> from the job site ('+GEO_RADIUS_FT+' ft required).';
      if(enforce){showGeoAlert('🔒 '+msg+'<br>Clock-in blocked. Move closer and try again.');return;}
      else{showGeoAlert('⚠️ '+msg+'<br>Proceeding — flagged for review.');}
    } else {clearGeoAlert();}
    var now=new Date();
    setJobAnchor(_clockState.jobId,lat,lng);
    _clockState.travelOutMins=Math.round((now-_clockState.travelOutStart)/60000);
    _clockState.onsiteStart=now;
    if(_clockState.sessionId&&_sb) await _sb.from('clock_sessions').update({status:'clocked_in'}).eq('id',_clockState.sessionId);
    await logTimeEvent('clock_in',lat,lng,acc,geo.reason==='out_of_range'?'Outside geofence':null);
    _clockState.status='onsite';
    _clockState.todayEvents.push({type:'clock_in',time:now,lat:lat,lng:lng,label:'Arrived On Site',flagged:geo.reason==='out_of_range'});
    updateClockUI();showToast('Clocked in to '+_clockState.jobName,'success');
  });
}

// PHASE 3 — LEAVE SITE
async function doLeaveOnSite(){
  getGPS(async function(lat,lng,acc){
    var enforce=!!(DB.settings&&DB.settings.geofenceEnforce);
    var geo=checkGeofence(lat,lng,_clockState.jobId);
    if(geo.reason==='out_of_range'&&enforce){
      showGeoAlert('🔒 Must be within '+GEO_RADIUS_FT+' ft to clock out. Current distance: <strong>'+geo.distanceFt+' ft</strong>.');
      return;
    }
    clearGeoAlert();
    var now=new Date();
    _clockState.onsiteMins+=Math.round((now-_clockState.onsiteStart)/60000);
    _clockState.travelBackStart=now;
    if(_clockState.sessionId&&_sb) await _sb.from('clock_sessions').update({status:'returning'}).eq('id',_clockState.sessionId);
    await logTimeEvent('clock_out',lat,lng,acc,geo.reason==='out_of_range'?'Outside geofence':null);
    _clockState.status='returning';
    _clockState.todayEvents.push({type:'clock_out',time:now,lat:lat,lng:lng,label:'Left Job Site',flagged:geo.reason==='out_of_range'});
    updateClockUI();showToast('Clocked out — traveling back','info');
  });
}

// PHASE 4 — ARRIVE BACK / END DAY
async function doArriveBack(){
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    var travelBackMins=_clockState.travelBackStart?Math.round((now-_clockState.travelBackStart)/60000):0;
    _clockState.travelBackMins+=travelBackMins;
    var totalTravel=_clockState.travelOutMins+_clockState.travelBackMins;
    var totalOnsite=_clockState.onsiteMins;
    var totalPaid=totalTravel+totalOnsite+_clockState.breakMins;
    // Lunch enforcement — spec Section 5
    var lunchFlag=false;
    if(totalPaid>360&&_clockState.lunchCount===0) lunchFlag=true;
    if(_clockState.lunchCount>0&&_clockState.lunchMins<30) lunchFlag=true;
    if(lunchFlag){
      var confirmed=await showLunchFlagModal(totalPaid);
      if(!confirmed) return;
    }
    await logTimeEvent('day_end',lat,lng,acc);
    _clockState.todayEvents.push({type:'day_end',time:now,label:'Arrived Back — Day Complete'});

    // Persist completed work day to DB for history
    if (!DB.workDays) DB.workDays = [];
    DB.workDays.push({
      id:            'wd-'+Date.now(),
      techName:      _currentUser ? _currentUser.full_name : 'Unknown',
      techId:        _currentUser ? _currentUser.id : null,
      date:          new Date().toISOString().split('T')[0],
      travelMins:    _clockState.travelOutMins+_clockState.travelBackMins,
      onsiteMins:    _clockState.onsiteMins,
      breakMins:     _clockState.breakMins,
      lunchMins:     _clockState.lunchMins,
      totalPaidMins: totalPaid,
      jobName:       _clockState.jobName||'',
      events:        _clockState.todayEvents.map(function(e){ return Object.assign({},e,{time:e.time instanceof Date?e.time.toISOString():e.time}); }),
      lunchFlagged:  lunchFlag
    });
    saveDB();
    showToast('Day complete — '+formatMinutes(totalPaid)+' total paid ('+formatMinutes(totalOnsite)+' on site, '+formatMinutes(totalTravel)+' travel)','success',6000);
    clearInterval(_clockState.timerInterval);
    _clockState.status='out';_clockState.sessionId=null;
    _clockState.travelOutStart=null;_clockState.onsiteStart=null;_clockState.travelBackStart=null;
    _clockState.dayStart=null;_clockState.homebaseStart=null;
    _clockState.travelOutMins=0;_clockState.onsiteMins=0;
    _clockState.travelBackMins=0;_clockState.breakMins=0;_clockState.lunchMins=0;_clockState.lunchCount=0;
    _eodReminderShown=false;hideEodReminder();updateClockUI();
  });
}

// NEXT JOB — Done at current site, heading to another job
async function doNextJob(){
  var sel=document.getElementById('clock-next-job-select');
  var nextId=sel?sel.value:'';
  var nextName=sel&&sel.selectedIndex>0?sel.options[sel.selectedIndex].text:'';
  if(!nextId){showToast('Please select your next job','warning');return;}
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    _clockState.onsiteMins+=Math.round((now-(_clockState.onsiteStart||now))/60000);
    var prev=_clockState.jobName;
    _clockState.jobId=nextId;_clockState.jobName=nextName;
    _clockState.status='traveling';_clockState.travelOutStart=now;_clockState.onsiteStart=null;
    await logTimeEvent('job_change',lat,lng,acc,'Left '+prev+' → '+nextName);
    _clockState.todayEvents.push({type:'job_change',time:now,lat:lat,lng:lng,label:'Left '+prev+' → '+nextName});
    updateClockUI();startClockTimer();
    showToast('Heading to '+nextName,'success');
  });
}

// LUNCH FLAG MODAL
function showLunchFlagModal(totalPaidMins){
  return new Promise(function(resolve){
    var adminOpts=(DB.team||[]).filter(function(m){return m.role==='owner'||m.role==='manager';}).map(function(m){return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>';}).join('');
    var reason=_clockState.lunchMins>0?'Your lunch was only '+_clockState.lunchMins+' min (30 min minimum required).':'You did not record a lunch break today.';
    var div=document.createElement('div');
    div.className='modal-overlay';div.id='modal-lunch-flag';div.style.display='flex';
    div.innerHTML='<div class="modal-box"><div class="modal-head"><h3>⚠ Lunch Break Required</h3></div>'+
      '<div class="modal-body">'+
        '<div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:8px;padding:12px;margin-bottom:14px"><strong>'+reason+'</strong><br><span style="font-size:12px;color:#555">Policy requires a minimum 30-minute uninterrupted lunch break.</span></div>'+
        '<label>Did you get permission from the office to skip or shorten lunch?</label>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">'+
          '<div id="lf-yes" onclick="selectLunchFlag(\'yes\')" style="border:2px solid #e0e0e0;border-radius:8px;padding:12px;cursor:pointer;text-align:center;font-weight:700">Yes — office cleared it</div>'+
          '<div id="lf-no" onclick="selectLunchFlag(\'no\')" style="border:2px solid #1565c0;background:#e3f2fd;border-radius:8px;padding:12px;cursor:pointer;text-align:center;font-weight:700;color:#1565c0">No</div>'+
        '</div>'+
        '<div id="lf-cleared" style="display:none;margin-top:12px">'+
          '<label>Who cleared it? *</label>'+
          '<select id="lf-approver" style="width:100%;padding:8px;border:1px solid #e0e0e0;border-radius:6px"><option value="">Select name</option>'+adminOpts+'</select>'+
          '<div style="margin-top:8px"><label>Notes</label><input id="lf-note" placeholder="Emergency call, customer waiting, etc."></div>'+
        '</div>'+
        '<input type="hidden" id="lf-choice" value="no">'+
      '</div>'+
      '<div class="modal-foot">'+
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'modal-lunch-flag\').remove();window._lfResolve&&window._lfResolve(false)">Cancel — Stay Clocked In</button>'+
        '<button class="btn btn-primary" onclick="submitLunchFlag()">Submit & End Day</button>'+
      '</div></div>';
    document.body.appendChild(div);
    window._lfResolve=resolve;
  });
}

function selectLunchFlag(choice){
  document.getElementById('lf-choice').value=choice;
  var y=document.getElementById('lf-yes'),n=document.getElementById('lf-no'),f=document.getElementById('lf-cleared');
  if(choice==='yes'){y.style.border='2px solid #2e7d32';y.style.background='#e8f5e9';y.style.color='#2e7d32';n.style.border='2px solid #e0e0e0';n.style.background='';n.style.color='';f.style.display='block';}
  else{n.style.border='2px solid #1565c0';n.style.background='#e3f2fd';n.style.color='#1565c0';y.style.border='2px solid #e0e0e0';y.style.background='';y.style.color='';f.style.display='none';}
}

function submitLunchFlag(){
  var choice=(document.getElementById('lf-choice')||{}).value||'no';
  var approver=((document.getElementById('lf-approver')||{}).value||'').trim();
  var note=(document.getElementById('lf-note')||{}).value||'';
  if(choice==='yes'&&!approver){showToast('Please select who cleared it','error');return;}
  if(!DB.lunchFlags) DB.lunchFlags=[];
  DB.lunchFlags.push({id:'lf-'+Date.now(),techName:_currentUser?_currentUser.full_name:'Unknown',date:new Date().toISOString().split('T')[0],lunchMins:_clockState.lunchMins,cleared:choice==='yes',approver:approver,note:note,status:'pending_review'});
  saveDB();
  var m=document.getElementById('modal-lunch-flag');if(m)m.remove();
  if(window._lfResolve){window._lfResolve(true);window._lfResolve=null;}
}

// BREAK & LUNCH
async function doBreakStart(){var now=new Date();_clockState.breakStart=now;_clockState.status='break';if(_clockState.sessionId&&_sb)await _sb.from('clock_sessions').update({status:'on_break'}).eq('id',_clockState.sessionId);await logTimeEvent('break_start',null,null,null);_clockState.todayEvents.push({type:'break_start',time:now,label:'Break Started'});updateClockUI();showToast('Break started','info');}
async function doBreakEnd(){var now=new Date();_clockState.breakMins+=Math.round((now-_clockState.breakStart)/60000);_clockState.breakStart=null;_clockState.status='onsite';if(_clockState.sessionId&&_sb)await _sb.from('clock_sessions').update({status:'clocked_in',break_minutes:_clockState.breakMins}).eq('id',_clockState.sessionId);await logTimeEvent('break_end',null,null,null);_clockState.todayEvents.push({type:'break_end',time:now,label:'Break Ended'});updateClockUI();showToast('Back on the clock','success');}
async function doLunchStart(){var now=new Date();_clockState.lunchStart=now;_clockState.status='lunch';if(_clockState.sessionId&&_sb)await _sb.from('clock_sessions').update({status:'at_lunch'}).eq('id',_clockState.sessionId);await logTimeEvent('lunch_start',null,null,null);_clockState.todayEvents.push({type:'lunch_start',time:now,label:'Lunch Started'});updateClockUI();showToast('Lunch started','info');}
async function doLunchEnd(){
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    var lunchMins=Math.round((now-_clockState.lunchStart)/60000);
    _clockState.lunchMins+=lunchMins;
    _clockState.lunchCount+=1;
    _clockState.lunchStart=null;_clockState.status='onsite';
    await logTimeEvent('lunch_end',lat,lng,acc);
    _clockState.todayEvents.push({type:'lunch_end',time:now,label:'Back from Lunch ('+lunchMins+' min)'});
    if(lunchMins<30){showToast('Lunch was only '+lunchMins+' min — 30 min required. This will be flagged.','warning',5000);}
    else{showToast('Back from lunch','success');}
    updateClockUI();
  });
}

// TIMER
function startClockTimer(){
  clearInterval(_clockState.timerInterval);
  _clockState.timerInterval=setInterval(function(){
    if(_clockState.status==='out') return;
    var now=new Date();
    var disp=document.getElementById('clock-timer-display');
    var lbl=document.getElementById('clock-timer-label');
    if(_clockState.status==='traveling'){if(disp)disp.textContent=formatMs(now-_clockState.travelOutStart);if(lbl)lbl.textContent='🚗 Travel to Site';}
    else if(_clockState.status==='onsite'){var offMs=(_clockState.breakMins+_clockState.lunchMins)*60000;if(_clockState.breakStart)offMs+=(now-_clockState.breakStart);if(_clockState.lunchStart)offMs+=(now-_clockState.lunchStart);if(disp)disp.textContent=formatMs(Math.max(0,now-_clockState.onsiteStart-offMs));if(lbl)lbl.textContent='🔧 On Site';}
    else if(_clockState.status==='break'){if(disp)disp.textContent=formatMs(now-_clockState.breakStart);if(lbl)lbl.textContent='⏸ On Break';}
    else if(_clockState.status==='lunch'){if(disp)disp.textContent=formatMs(now-_clockState.lunchStart);if(lbl)lbl.textContent='🍽 At Lunch';}
    else if(_clockState.status==='returning'){if(disp)disp.textContent=formatMs(now-_clockState.travelBackStart);if(lbl)lbl.textContent='🚗 Return Travel';}
    var travelMs=(_clockState.travelOutMins*60000)+(_clockState.status==='traveling'?now-_clockState.travelOutStart:0)+(_clockState.travelBackMins*60000)+(_clockState.status==='returning'?now-_clockState.travelBackStart:0);
    var onsiteMs=(_clockState.onsiteMins*60000)+(_clockState.status==='onsite'?Math.max(0,now-_clockState.onsiteStart-(_clockState.breakMins+_clockState.lunchMins)*60000):0);
    var breakMs=_clockState.breakMins*60000+(_clockState.breakStart?now-_clockState.breakStart:0);
    var lunchMs=_clockState.lunchMins*60000+(_clockState.lunchStart?now-_clockState.lunchStart:0);
    function setDs(id,ms){var el=document.getElementById(id);if(el)el.textContent=formatMs(ms);}
    setDs('ds-travel',travelMs);setDs('ds-worked',onsiteMs);setDs('ds-break',breakMs);setDs('ds-lunch',lunchMs);
  },1000);
}

function formatMs(ms){var s=Math.floor(Math.max(0,ms)/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}
function formatMinutes(mins){var h=Math.floor(mins/60),m=mins%60;return h+'h '+m+'m';}

// UI UPDATE
function updateClockUI(){
  var dot=document.getElementById('clock-dot');
  var txt=document.getElementById('clock-status-text');
  var btnGrid=document.getElementById('clock-btn-grid');
  var jobWrap=document.getElementById('clock-job-wrap');
  var daySumm=document.getElementById('day-summary');
  var punchCard=document.getElementById('punch-log-card');
  var statusMap={
    out:         {cls:'out',   text:'Not Started'},
    at_homebase: {cls:'in',   text:'🏠 At Base — Ready to Travel'},
    traveling:   {cls:'in',   text:'🚗 Traveling to '+(_clockState.jobName||'Job')},
    onsite:      {cls:'in',   text:'🔧 On Site — '+(_clockState.jobName||'')},
    break:       {cls:'break',text:'⏸ On Break'},
    lunch:       {cls:'lunch',text:'🍽 At Lunch'},
    returning:   {cls:'in',   text:'🚗 Returning to Base'}
  };
  var s=statusMap[_clockState.status]||statusMap.out;
  if(dot)dot.className='clock-status-dot '+s.cls;
  if(txt)txt.textContent=s.text;
  // Job wrap — show when out (to select job) or at_homebase (to select job before traveling)
  if(jobWrap)jobWrap.style.display=(_clockState.status==='out'||_clockState.status==='at_homebase')?'block':'none';
  if(daySumm)daySumm.style.display=_clockState.status!=='out'?'grid':'none';
  if(punchCard)punchCard.style.display=_clockState.todayEvents.length?'block':'none';
  if(_clockState.status==='out'){var el=document.getElementById('clock-timer-display');if(el)el.textContent='0:00:00';}
  if(!btnGrid) return;

  // Build next-job options for multi-job day
  var otherJobs=DB.jobs.filter(function(j){return (j.status==='Scheduled'||j.status==='In Progress')&&j.id!==_clockState.jobId;});
  var nextJobOpts=otherJobs.map(function(j){return '<option value="'+escHtml(j.id)+'">'+escHtml(j.name+(j.customer?' — '+j.customer:''))+'</option>';}).join('');
  var nextJobSel=otherJobs.length
    ? '<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:#546e7a;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Next Job</div>'+
      '<select id="clock-next-job-select" style="width:100%;padding:8px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px"><option value="">-- Select next job --</option>'+nextJobOpts+'</select></div>'
    : '';

  if(_clockState.status==='out'){
    btnGrid.innerHTML='<button class="clock-btn clock-in" onclick="doStartDay()" style="grid-column:1/-1"><span class="btn-icon">☀️</span>Start Day at Base</button>';
  }
  else if(_clockState.status==='at_homebase'){
    btnGrid.innerHTML='<button class="clock-btn clock-in" onclick="doStartTravel()" style="grid-column:1/-1"><span class="btn-icon">🚗</span>Start Travel to Site</button>';
  }
  else if(_clockState.status==='traveling'){
    btnGrid.innerHTML='<button class="clock-btn clock-in" style="grid-column:1/-1;background:#1565c0" id="btn-arrive-site" onclick="doArriveOnSite()"><span class="btn-icon">📍</span>Arrive On Site — Clock In</button>';
  }
  else if(_clockState.status==='onsite'){
    btnGrid.innerHTML=
      '<button class="clock-btn break-start" onclick="doBreakStart()"><span class="btn-icon">⏸</span>Break</button>'+
      '<button class="clock-btn lunch-start" onclick="doLunchStart()"><span class="btn-icon">🍽</span>Lunch</button>'+
      (nextJobOpts
        ? nextJobSel+'<button class="clock-btn" onclick="doNextJob()" style="background:#e3f2fd;color:#1565c0;border:2.5px solid #90caf9;grid-column:1/-1;min-height:80px;font-size:16px"><span class="btn-icon">➡️</span>Go to Next Job</button>'
        : '')+
      '<button class="clock-btn clock-out" onclick="doLeaveOnSite()" style="grid-column:1/-1;margin-top:4px"><span class="btn-icon">🚗</span>Leave Site — Return to Base</button>';
  }
  else if(_clockState.status==='break'){
    btnGrid.innerHTML='<button class="clock-btn break-end" style="grid-column:1/-1" onclick="doBreakEnd()"><span class="btn-icon">▶️</span>End Break — Back to Work</button>';
  }
  else if(_clockState.status==='lunch'){
    btnGrid.innerHTML='<button class="clock-btn lunch-end" style="grid-column:1/-1" onclick="doLunchEnd()"><span class="btn-icon">▶️</span>Back from Lunch</button>';
  }
  else if(_clockState.status==='returning'){
    btnGrid.innerHTML='<button class="clock-btn clock-in" onclick="doArriveBack()" style="grid-column:1/-1;background:#1565c0"><span class="btn-icon">🏁</span>Arrived Back — End Day</button>';
  }
  renderPunchLog();
}

function renderPunchLog(){
  var list=document.getElementById('punch-log-list');
  if(!list||!_clockState.todayEvents.length) return;
  var colors={travel_start:'#1565c0',clock_in:'#2e7d32',clock_out:'#e65100',break_start:'#e65100',break_end:'#2e7d32',lunch_start:'#6a1b9a',lunch_end:'#2e7d32',day_end:'#c62828'};
  list.innerHTML=_clockState.todayEvents.slice().reverse().map(function(ev){
    var t=ev.time instanceof Date?ev.time:new Date(ev.time);
    var timeStr=t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    var flagStr=ev.flagged?' <span style="color:#c62828;font-size:10px">⚠️ Outside geofence</span>':'';
    return '<div class="clock-log-item"><div class="clock-log-dot" style="background:'+(colors[ev.type]||'#90a4ae')+'"></div><span class="clock-log-time">'+timeStr+'</span><span class="clock-log-event">'+(ev.label||ev.type)+(ev.lat?' 📍':'')+flagStr+'</span></div>';
  }).join('');
}

function renderFieldPage(){
  var sel=document.getElementById('clock-job-select');
  if(sel){
    sel.innerHTML='<option value="">-- Choose your job --</option>';
    var myJobs=DB.jobs.filter(function(j){return j.status==='Scheduled'||j.status==='In Progress';});
    myJobs.forEach(function(j){var opt=document.createElement('option');opt.value=j.id;opt.textContent=j.name+(j.customer?' — '+j.customer:'');sel.appendChild(opt);});
    if(_clockState.jobId) sel.value=_clockState.jobId;
  }

  // Restore multi-day out-of-town hotel setting
  var hotelCb = document.getElementById('clock-out-of-town');
  var hotelWrap = document.getElementById('hotel-addr-wrap');
  var hotelInput = document.getElementById('clock-hotel-addr');
  var savedHotel = DB.settings && DB.settings.currentHotel;
  if (savedHotel && hotelCb) {
    hotelCb.checked = true;
    _clockState.outOfTown = true;
    _clockState.hotelAddr = savedHotel;
    if (hotelWrap) hotelWrap.style.display='block';
    if (hotelInput) hotelInput.value=savedHotel;
  }

  var myJobsEl=document.getElementById('field-my-jobs');
  if(myJobsEl){
    var active=DB.jobs.filter(function(j){return j.status==='Scheduled'||j.status==='In Progress';});
    if(!active.length){myJobsEl.innerHTML='<div style="color:#90a4ae;font-size:13px">No active jobs assigned.</div>';}
    else{myJobsEl.innerHTML=active.map(function(j){var ha=!!j.gpsAnchor;return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f5f5f5"><div><div style="font-weight:700;font-size:13px">'+escHtml(j.name||'')+'</div><div style="font-size:11px;color:#90a4ae">'+escHtml(j.customer||'')+(j.address?' · '+escHtml(j.address):'')+' · '+(ha?'<span style="color:#2e7d32">📍 Anchor set</span>':'<span style="color:#90a4ae">No anchor yet</span>')+'</div></div><span class="status-badge '+(j.status==='In Progress'?'s-inprogress':'s-pending')+'" style="font-size:10px">'+escHtml(j.status)+'</span></div>';}).join('');}
  }

  // Show recent time off requests for this tech
  var toffEl = document.getElementById('field-timeoff-status');
  if (toffEl) {
    var myName = _currentUser ? _currentUser.full_name : '';
    var recent = (DB.timeOffRequests||[]).filter(function(r){ return r.techName===myName; }).slice(-3).reverse();
    toffEl.innerHTML = recent.length
      ? recent.map(function(r){
          var color = r.status==='approved'?'#2e7d32':r.status==='denied'?'#c62828':'#e65100';
          var label = r.status==='approved'?'✓ Approved':r.status==='denied'?'✗ Denied':'⏳ Pending';
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px;border-bottom:1px solid #f5f5f5">'+
            '<span>'+escHtml(r.startDate)+(r.endDate&&r.endDate!==r.startDate?' — '+escHtml(r.endDate):'')+'</span>'+
            '<span style="color:'+color+';font-weight:700">'+label+'</span>'+
          '</div>';
        }).join('')
      : '';
  }

  // Offline banner
  checkOfflineStatus();

  if(_clockState.status!=='out'&&!_clockState.timerInterval) startClockTimer();
  updateClockUI();
  getGPS(function(){});
}

// GEOFENCE SETTINGS
function toggleGeofenceEnforcement(){
  var cb=document.getElementById('s-geofence-enforce');
  var lbl=document.getElementById('s-geofence-label');
  var note=document.getElementById('geofence-status-note');
  var on=cb?cb.checked:false;
  if(lbl){lbl.textContent=on?'ON':'OFF';lbl.className='toggle-value-label'+(on?' on':'');}
  if(note)note.innerHTML=on?'<span style="color:#c62828;font-weight:700">🔒 Hard mode ON</span> — techs blocked if outside 500 ft.':'Currently: <strong>Soft mode</strong> — GPS captured and flagged, techs never blocked.';
}

function _saveFieldSettingsOld(){
  // Replaced by Phase 3 version below
}

// EOD REMINDER
function scheduleEodReminder(){clearInterval(window._eodInterval);window._eodInterval=setInterval(function(){if(_clockState.status==='out'){clearInterval(window._eodInterval);return;}var now=new Date(),h=now.getHours(),m=now.getMinutes();if((h===16&&m>=45)||h>=17){if(!_eodReminderShown){_eodReminderShown=true;showEodReminder();}}},60000);}
function showEodReminder(){if(document.getElementById('eod-reminder'))return;var div=document.createElement('div');div.id='eod-reminder';div.className='eod-reminder';var btn=_clockState.status==='onsite'?'<button class="eod-clock-out-btn" onclick="doLeaveOnSite()">Leave Site</button>':_clockState.status==='returning'?'<button class="eod-clock-out-btn" onclick="doArriveBack()">End Day</button>':'<button class="eod-clock-out-btn" onclick="doArriveBack()">Clock Out</button>';div.innerHTML='<div class="eod-reminder-text">⏰ After 4:45pm — don\'t forget to clock out!</div>'+btn+'<button onclick="hideEodReminder()" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px">×</button>';document.body.appendChild(div);}
function hideEodReminder(){var el=document.getElementById('eod-reminder');if(el)el.remove();}

// TIMESHEET TABS
function switchTsTab(tab) {
  document.querySelectorAll('.ts-section').forEach(function(s){ s.classList.remove('active'); });
  document.querySelectorAll('#page-timesheet .inv-tab').forEach(function(b){ b.classList.remove('active'); });
  var section = document.getElementById('ts-'+tab);
  if (section) section.classList.add('active');
  var map = {'my-hours':0,'pay-period':1,'time-off':2,'all-timesheets':3,'payroll':4,'flags':5};
  var tabs = document.querySelectorAll('#page-timesheet .inv-tab');
  var idx = map[tab];
  if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
  loadTimesheets();
}

function fmtMins(mins) {
  if (!mins) return '0h 0m';
  var h=Math.floor(mins/60), m=Math.round(mins%60);
  return h+'h '+m+'m';
}

function getPayPeriodDates() {
  // Bi-weekly pay periods anchored to a known date (Jan 6, 2025 = start of first period)
  var anchor = new Date('2025-01-06');
  var now = new Date();
  var diffDays = Math.floor((now - anchor) / (1000*60*60*24));
  var periodNum = Math.floor(diffDays / 14);
  var start = new Date(anchor); start.setDate(start.getDate() + periodNum*14);
  var end   = new Date(start);  end.setDate(end.getDate() + 13);
  return { start: start, end: end };
}

function getWeekDates() {
  var now = new Date();
  var dow = now.getDay(); // 0=Sun
  var weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  var weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  return { start: weekStart, end: weekEnd };
}

function dateStr(d) { return d.toISOString().split('T')[0]; }

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
}

async function loadTimesheets() {
  var myName = _currentUser ? _currentUser.full_name : '';
  var myRole = _currentUser ? _currentUser.role : '';
  var workDays = DB.workDays || [];
  var today = dateStr(new Date());

  // ---- MY HOURS TAB ----
  var myDays = workDays.filter(function(d){ return d.techName === myName; }).sort(function(a,b){ return b.date.localeCompare(a.date); });

  // Today
  var todayEl = document.getElementById('ts-today-content');
  var todayDateEl = document.getElementById('ts-today-date');
  if (todayDateEl) todayDateEl.textContent = formatDate(today);
  if (todayEl) {
    // If currently clocked in, show live stats
    if (_clockState.status !== 'out') {
      var now = new Date();
      var liveTravelMins = _clockState.travelOutMins + _clockState.travelBackMins +
        (_clockState.status==='traveling'||_clockState.status==='returning' ? Math.round((now-(_clockState.travelOutStart||_clockState.travelBackStart||now))/60000) : 0);
      var liveOnsiteMins = _clockState.onsiteMins +
        (_clockState.status==='onsite' ? Math.round((now-(_clockState.onsiteStart||now))/60000) : 0);
      var livePaidMins = liveTravelMins + liveOnsiteMins + _clockState.breakMins;
      todayEl.innerHTML =
        '<div style="background:#e8f5e9;border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;color:#2e7d32;font-weight:700">🔴 Currently clocked in — '+(_clockState.jobName||'')+'</div>'+
        '<div class="ts-stat-grid">'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(livePaidMins)+'</div><div class="ts-stat-lbl">Total Paid</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(liveOnsiteMins)+'</div><div class="ts-stat-lbl">On Site</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(liveTravelMins)+'</div><div class="ts-stat-lbl">Travel</div></div>'+
          '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(_clockState.lunchMins)+'</div><div class="ts-stat-lbl">Lunch</div></div>'+
        '</div>';
    } else {
      var todayDay = myDays.find(function(d){ return d.date === today; });
      if (todayDay) {
        todayEl.innerHTML = renderDaySummaryCard(todayDay);
      } else {
        todayEl.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No hours recorded today yet.</div>';
      }
    }
  }

  // This week
  var week = getWeekDates();
  var weekDays = myDays.filter(function(d){ return d.date >= dateStr(week.start) && d.date <= dateStr(week.end); });
  var weekTotalPaid = weekDays.reduce(function(s,d){ return s + (d.totalPaidMins||0); }, 0);
  var weekOnsite    = weekDays.reduce(function(s,d){ return s + (d.onsiteMins||0); }, 0);
  var weekTravel    = weekDays.reduce(function(s,d){ return s + (d.travelMins||0); }, 0);
  var weekEl = document.getElementById('ts-this-week-content');
  if (weekEl) {
    var otMins = Math.max(0, weekTotalPaid - 2400); // over 40 hours
    weekEl.innerHTML =
      '<div style="font-size:11px;color:#90a4ae;margin-bottom:8px">'+formatDate(dateStr(week.start))+' — '+formatDate(dateStr(week.end))+'</div>'+
      '<div class="ts-stat-grid">'+
        '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(weekTotalPaid)+'</div><div class="ts-stat-lbl">Total Paid</div></div>'+
        '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(weekOnsite)+'</div><div class="ts-stat-lbl">On Site</div></div>'+
        '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(weekTravel)+'</div><div class="ts-stat-lbl">Travel</div></div>'+
        '<div class="ts-stat" style="'+(otMins>0?'background:#fff3e0':'')+'"><div class="ts-stat-val" style="'+(otMins>0?'color:#e65100':'')+'">'+fmtMins(otMins)+'</div><div class="ts-stat-lbl">Overtime</div></div>'+
      '</div>'+
      (weekDays.length ? weekDays.map(function(d){ return renderDayRow(d); }).join('') : '<div style="color:#90a4ae;font-size:13px">No days recorded this week.</div>');
  }

  // Recent days
  var recentEl = document.getElementById('ts-recent-days');
  if (recentEl) {
    var recent = myDays.slice(0, 14);
    recentEl.innerHTML = recent.length
      ? recent.map(function(d){ return renderDayRow(d); }).join('')
      : '<div style="color:#90a4ae;font-size:13px">No recent history.</div>';
  }

  // ---- PAY PERIOD TAB ----
  var pp = getPayPeriodDates();
  var ppDatesEl = document.getElementById('ts-pay-period-dates');
  if (ppDatesEl) ppDatesEl.textContent = formatDate(dateStr(pp.start))+' — '+formatDate(dateStr(pp.end));

  var ppDays = myDays.filter(function(d){ return d.date >= dateStr(pp.start) && d.date <= dateStr(pp.end); });
  var ppTotalPaid  = ppDays.reduce(function(s,d){ return s + (d.totalPaidMins||0); }, 0);
  var ppOnsite     = ppDays.reduce(function(s,d){ return s + (d.onsiteMins||0); }, 0);
  var ppTravel     = ppDays.reduce(function(s,d){ return s + (d.travelMins||0); }, 0);
  var ppRegMins    = Math.min(ppTotalPaid, 4800); // 80 hours
  var ppOtMins     = Math.max(0, ppTotalPaid - 4800);

  var ppEl = document.getElementById('ts-pay-period-content');
  if (ppEl) {
    ppEl.innerHTML =
      '<div class="ts-stat-grid" style="grid-template-columns:repeat(3,1fr)">'+
        '<div class="ts-stat"><div class="ts-stat-val">'+fmtMins(ppTotalPaid)+'</div><div class="ts-stat-lbl">Total Paid Hours</div></div>'+
        '<div class="ts-stat"><div class="ts-stat-val" style="color:#2e7d32">'+fmtMins(ppRegMins)+'</div><div class="ts-stat-lbl">Regular</div></div>'+
        '<div class="ts-stat" style="'+(ppOtMins>0?'background:#fff3e0':'')+'"><div class="ts-stat-val" style="'+(ppOtMins>0?'color:#e65100':'')+'">'+fmtMins(ppOtMins)+'</div><div class="ts-stat-lbl">Overtime (1.5×)</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:20px;font-size:12px;color:#546e7a;margin-bottom:14px">'+
        '<span>🔧 On Site: <strong>'+fmtMins(ppOnsite)+'</strong></span>'+
        '<span>🚗 Travel: <strong>'+fmtMins(ppTravel)+'</strong></span>'+
        '<span>📅 Days worked: <strong>'+ppDays.length+'</strong></span>'+
      '</div>'+
      '<div style="font-weight:700;font-size:12px;color:#546e7a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Day Breakdown</div>'+
      (ppDays.length ? ppDays.map(function(d){ return renderDayRow(d); }).join('') : '<div style="color:#90a4ae;font-size:13px">No days recorded in this pay period.</div>');
  }

  // Leave balances
  var balEl = document.getElementById('ts-leave-balances');
  if (balEl) {
    var techProfile = (DB.team||[]).find(function(m){ return m.name===myName; });
    var showVac = techProfile ? !!techProfile.showVacation : false;
    var showPto = techProfile ? !!techProfile.showPTO : false;
    var isAdminView = myRole==='owner'||myRole==='manager'||myRole==='back_office';

    // Admins always see balances; techs only see if toggled on
    if (!isAdminView && !showVac && !showPto) {
      balEl.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:12px 0">Leave balance visibility is managed by your back office. Contact them for your current balances.</div>';
    } else {
      var hireDate = techProfile && techProfile.hireDate ? new Date(techProfile.hireDate) : null;
      var now2 = new Date();
      var yearsWorked = hireDate ? (now2-hireDate)/(1000*60*60*24*365.25) : 0;
      var vacTier = yearsWorked >= 10 ? 15 : yearsWorked >= 2 ? 10 : yearsWorked >= 1 ? 5 : 0;
      var ptoEligible = hireDate && (now2-hireDate)/(1000*60*60*24) >= 90;
      var yearStart = new Date(now2.getFullYear(), 0, 1);
      var ppElapsed = Math.floor((now2 - yearStart) / (1000*60*60*24*14));
      var vacAccrued = Math.round(vacTier * 8 / 26 * ppElapsed * 10) / 10;
      var ptoAccrued = ptoEligible ? Math.round(20 / 26 * ppElapsed * 10) / 10 : 0;

      var balances = getLeaveBalanceDisplay(myName);
      var vacAccrued = balances.vacAccrued;
      var ptoAccrued = balances.ptoAccrued;

      var html = '';
      if (isAdminView || showVac) {
        html += '<div class="leave-bal-row">'+
          '<div><strong>🏖 Vacation</strong><div style="font-size:11px;color:#90a4ae">Tier '+vacTier+' days/yr · '+Math.round(yearsWorked*10)/10+' years seniority</div></div>'+
          '<div style="text-align:right"><div class="leave-val vac">'+vacAccrued+' hrs</div><div style="font-size:10px;color:#90a4ae">available after used</div></div>'+
        '</div>';
      }
      if (isAdminView || showPto) {
        html += '<div class="leave-bal-row">'+
          '<div><strong>🏥 PTO</strong><div style="font-size:11px;color:#90a4ae">'+(ptoEligible?'Eligible (90+ days)':'Waiting period — eligible day 90')+'</div></div>'+
          '<div style="text-align:right"><div class="leave-val pto">'+ptoAccrued+' hrs</div><div style="font-size:10px;color:#90a4ae">available after used</div></div>'+
        '</div>';
      }
      if (!isAdminView && !showVac) html += '<div style="font-size:12px;color:#90a4ae;padding:6px 0">Vacation balance — contact back office.</div>';
      if (!isAdminView && !showPto) html += '<div style="font-size:12px;color:#90a4ae;padding:6px 0">PTO balance — contact back office.</div>';
      if (vacTier===0&&yearsWorked<1) html += '<div style="font-size:12px;color:#90a4ae;padding:8px 0">Vacation accrual begins after your 1-year anniversary.</div>';
      balEl.innerHTML = html || '<div style="color:#90a4ae;font-size:13px;padding:12px 0">No leave data configured yet.</div>';
    }
  }

  // ---- TIME OFF TAB ----
  renderTimeOffTab();

  // ---- PAYROLL TAB ----
  renderPayrollTab();

  // ---- LIVE ACTIVITY ----
  renderLiveActivity();

  // ---- ALL TIMESHEETS TAB (admin) ----
  var allEl = document.getElementById('ts-all-content');
  var liveEl = document.getElementById('live-activity');
  if (allEl) {
    var isAdmin = myRole==='owner'||myRole==='manager'||myRole==='back_office';
    if (!isAdmin) {
      allEl.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">Admin access required to view all timesheets.</div>';
    } else {
      var filterDate = (document.getElementById('ts-date-filter')||{}).value || today;
      var filterTech = (document.getElementById('ts-tech-filter')||{}).value || '';
      var techSel = document.getElementById('ts-tech-filter');
      if (techSel && techSel.options.length <= 1) {
        var techNames = [...new Set(workDays.map(function(d){ return d.techName; }))].sort();
        techNames.forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; techSel.appendChild(o); });
      }
      var filtered = workDays.filter(function(d){
        return d.date === filterDate && (!filterTech || d.techName === filterTech);
      });
      allEl.innerHTML = filtered.length
        ? '<table><thead><tr><th>Tech</th><th>Job</th><th>Total</th><th>On Site</th><th>Travel</th><th>Lunch</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
          filtered.map(function(d){
            var ot = d.totalPaidMins > 480 ? '<span class="ts-ot-chip">OT</span>' : '';
            var flag = d.lunchFlagged ? '<span class="ts-flag-chip">⚠ Lunch</span>' : '';
            var corrected = d.corrected ? '<span style="background:#e3f2fd;color:#1565c0;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700">✏ Corrected</span>' : '';
            var holiday = isHoliday(d.date);
            var holidayBadge = holiday ? '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700">🎉 '+escHtml(holiday.name)+'</span>' : '';
            return '<tr>'+
              '<td style="font-weight:700">'+escHtml(d.techName||'')+'</td>'+
              '<td style="font-size:12px">'+escHtml(d.jobName||'—')+'</td>'+
              '<td style="font-weight:700;color:#1565c0">'+fmtMins(d.totalPaidMins)+'</td>'+
              '<td style="font-size:12px">'+fmtMins(d.onsiteMins)+'</td>'+
              '<td style="font-size:12px">'+fmtMins(d.travelMins)+'</td>'+
              '<td style="font-size:12px">'+fmtMins(d.lunchMins)+'</td>'+
              '<td>'+ot+' '+flag+' '+corrected+' '+holidayBadge+'</td>'+
              '<td><button class="btn btn-outline btn-sm" onclick="openTimeCorrectionModal(\''+d.id+'\')">✏ Correct</button></td>'+
            '</tr>';
          }).join('')+'</tbody></table>'
        : '<div style="color:#90a4ae;padding:20px;text-align:center">No timesheet data for '+filterDate+(filterTech?' — '+filterTech:'')+'.</div>';
    }
  }
  if (liveEl) {
    liveEl.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">Live status syncs from Supabase. Connect field devices to see real-time clock-in status.</div>';
  }

  // ---- FLAGS TAB ----
  var flagsBody = document.getElementById('timesheet-body');
  if (flagsBody) {
    var flags=(DB.lunchFlags||[]).filter(function(f){return f.status==='pending_review';});
    flagsBody.innerHTML = flags.length
      ? flags.map(function(f){
          return '<tr>'+
            '<td style="font-weight:700">'+escHtml(f.techName||'')+'</td>'+
            '<td>'+escHtml(f.date||'')+'</td>'+
            '<td><span class="ts-flag-chip">⚠ Lunch: '+f.lunchMins+' min</span></td>'+
            '<td style="font-size:12px">'+(f.cleared?'Cleared by <strong>'+escHtml(f.approver)+'</strong>':'<span style="color:#c62828">Not cleared</span>')+'</td>'+
            '<td style="font-size:12px">'+escHtml(f.note||'—')+'</td>'+
            '<td>'+
              '<button class="btn btn-success btn-sm" onclick="resolveLunchFlag(\''+f.id+'\',\'approve\')">✓ Approve</button> '+
              '<button class="btn btn-outline btn-sm" onclick="resolveLunchFlag(\''+f.id+'\',\'deduct\')">−30 min</button>'+
            '</td>'+
          '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="padding:20px;text-align:center;color:#90a4ae">No flags pending review.</td></tr>';
  }
}

