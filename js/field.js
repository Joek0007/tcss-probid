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
  onsiteBreakBase: 0,   // break+lunch mins already banked when THIS on-site leg began
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
  var job=typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id==jobId;});
  if (!job||!job.gpsAnchor) return {ok:true,distanceFt:null,reason:'no_anchor'};
  var dist=geoDistanceFt(lat,lng,job.gpsAnchor.lat,job.gpsAnchor.lng);
  return {ok:dist<=GEO_RADIUS_FT,distanceFt:dist,reason:dist<=GEO_RADIUS_FT?'in_range':'out_of_range'};
}

function setJobAnchor(jobId,lat,lng) {
  if (!lat||!lng) return;
  var job=typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id==jobId;});
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

// ── r17 OFFLINE CLOCK QUEUE ─────────────────────────────────────────────────────
// Field techs often clock in with no signal. Every clock write (session create/update and
// time_events) is submitted through ONE FIFO queue: online it drains immediately; offline it
// persists to localStorage and drains automatically on reconnect. Session ids are generated
// client-side so a shift is fully tracked with or without signal, and replay uses upsert so a
// retried op can never duplicate. This is why doStartTravel no longer needs the DB to hand back
// an id, and why logTimeEvent no longer silently bails when offline.
var _CLOCK_QUEUE_KEY = 'probid_clockQueue';
function _clockNewId(){
  return (typeof makeUUID==='function') ? makeUUID()
    : 'ce-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
}
function _clockQueueGet(){ try { return JSON.parse(localStorage.getItem(_CLOCK_QUEUE_KEY)||'[]'); } catch(e){ return []; } }
function _clockQueueSet(a){ try { localStorage.setItem(_CLOCK_QUEUE_KEY, JSON.stringify(a)); } catch(e){} }
function _clockPending(){ return _clockQueueGet().length; }
function _clockOnline(){ return !!_sb && (typeof navigator==='undefined' || navigator.onLine !== false); }
async function _clockApplyOp(op){
  try {
    var res;
    if (op.kind==='session_upsert')      res = await _sb.from('clock_sessions').upsert(op.row);
    else if (op.kind==='session_update') res = await _sb.from('clock_sessions').update(op.patch).eq('id', op.id);
    else if (op.kind==='time_event')     res = await _sb.from('time_events').upsert(op.row);
    else return true; // unknown op — drop it
    if (res && res.error){ console.warn('[Clock] sync op failed:', op.kind, res.error.message); return false; }
    return true;
  } catch(e){ console.warn('[Clock] sync op threw:', op.kind, e && e.message); return false; }
}
var _clockFlushing = false;
async function _clockFlush(){
  if (_clockFlushing || !_clockOnline()) return;
  _clockFlushing = true;
  try {
    var q = _clockQueueGet();
    while (q.length){
      var ok = await _clockApplyOp(q[0]);
      if (!ok) break;            // keep this op + the rest, in order, for the next attempt
      q.shift(); _clockQueueSet(q);
    }
  } finally { _clockFlushing = false; _updateConnPill(); }
}
function _clockSubmit(op){ var q=_clockQueueGet(); q.push(op); _clockQueueSet(q); _updateConnPill(); return _clockFlush(); }

// r19: global connection indicator (topbar pill), on every page / both devices. Shows Online /
// Offline, and — the part that matters for a field tech — "Offline · N to sync" / "Syncing… N"
// when clock punches are queued, then a brief "Synced ✓". Driven by navigator.onLine + queue depth.
function _updateConnPill(){
  var el = (typeof document!=='undefined') && document.getElementById('conn-pill');
  if (!el) return;
  var online = (typeof navigator==='undefined') || navigator.onLine !== false;
  var pending = (typeof _clockPending==='function') ? _clockPending() : 0;
  if (!online){
    el.textContent = '● Offline' + (pending>0 ? ' · '+pending+' to sync' : '');
    el.style.background = '#d81b60';   // pinkish-red so offline is unmistakable
    el.style.color      = '#ffffff';   // high-contrast lettering
  } else if (pending>0){
    el.textContent = '● Syncing… '+pending;
    el.style.background = '#fff8e1'; el.style.color = '#f57f17';
  } else if (el._wasPending){            // just finished draining → brief confirmation
    el.textContent = '● Synced ✓'; el.style.background='#e8f5e9'; el.style.color='#2e7d32';
    setTimeout(function(){ try {
      if (((typeof _clockPending==='function')?_clockPending():0)===0 && (typeof navigator==='undefined'||navigator.onLine!==false)){
        var e2=document.getElementById('conn-pill'); if(e2){ e2.textContent='● Online'; e2.style.background='#e8f5e9'; e2.style.color='#2e7d32'; }
      }
    } catch(e){} }, 2500);
  } else {
    el.textContent = '● Online'; el.style.background='#e8f5e9'; el.style.color='#2e7d32';
  }
  el._wasPending = pending>0;
}

// r20: keep the Time Clock page honest across devices — re-pull and reconcile the clock from the
// cloud when this tab regains focus / reconnects, so a second device (or the office watching their
// own clock) reflects the latest status without a hard refresh. Guarded inside restoreClockSession.
function _refreshClockView(){
  try {
    var fp = (typeof document!=='undefined') && document.getElementById('page-field');
    var visible = fp && (fp.classList.contains('active') || fp.offsetParent!==null);
    if (visible && typeof restoreClockSession==='function') restoreClockSession({resync:true});
  } catch(e){}
}

if (typeof window !== 'undefined'){
  // Coming back online: update the pill, drain the clock queue, refresh the office live views + this clock.
  window.addEventListener('online',  function(){ _updateConnPill(); _clockFlush(); if(typeof _refreshLiveViews==='function') _refreshLiveViews(); _refreshClockView(); });
  window.addEventListener('offline', function(){ _updateConnPill(); });
  // Clicking back to the tab refreshes the live dashboard AND this device's clock immediately.
  window.addEventListener('focus',   function(){ if(typeof _refreshLiveViews==='function') _refreshLiveViews(); _refreshClockView(); });
  if (typeof document!=='undefined') document.addEventListener('visibilitychange', function(){ if(!document.hidden){ if(typeof _refreshLiveViews==='function') _refreshLiveViews(); _refreshClockView(); } });
  setInterval(function(){ try { _updateConnPill(); } catch(e){} }, 3000); // keep the "N to sync" count honest as the queue drains
  setInterval(function(){ try { _refreshClockView(); } catch(e){} }, 20000); // light cross-device clock resync while the page is open
  setTimeout(function(){ try { _updateConnPill(); _clockFlush(); } catch(e){} }, 3500);
}

// Record a clock event. Offline → it queues and syncs later (never silently dropped).
function logTimeEvent(type,lat,lng,acc,note){
  var row = {
    id: _clockNewId(),
    session_id:_clockState.sessionId,
    user_id:_currentUser?_currentUser.id:null,
    user_name:_currentUser?_currentUser.full_name:'Unknown',
    job_id:_clockState.jobId, job_name:_clockState.jobName,
    event_type:type, lat:lat, lng:lng, accuracy:acc,
    timestamp:new Date().toISOString(), note:note||''
  };
  return _clockSubmit({ kind:'time_event', row: row });
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
    _ensureClockDayEntry();   // r43: open the day's itemized timesheet line now (base/office)
    updateClockUI(); startClockTimer();
    showToast('Day started — select a job and start travel when ready', 'success');
    scheduleEodReminder();
  });
}

// PHASE 1 — START TRAVEL (from homebase or from a job to next job)
async function doStartTravel(){
  if (typeof hasPermission==='function' && !hasPermission('time.clock')) { showToast('You do not have permission to clock in','error'); return; }
  var jobSel=document.getElementById('clock-job-select');
  var jobId=jobSel?jobSel.value:'';
  var jobName=jobSel&&jobSel.selectedIndex>0?jobSel.options[jobSel.selectedIndex].text:'General';
  if(!jobId){showToast('Please select a job first','warning');if(jobSel)jobSel.style.borderColor='#c62828';return;}
  if(jobSel)jobSel.style.borderColor='';
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    // r17: session id is generated on-device so the shift is tracked with or without signal.
    var sessionId=_clockNewId();
    var session={id:sessionId,user_id:_currentUser?_currentUser.id:null,user_name:_currentUser?_currentUser.full_name:'Unknown',
      job_id:jobId,job_name:jobName,status:'traveling',clock_in_at:now.toISOString(),
      clock_in_lat:lat,clock_in_lng:lng,date:now.toISOString().split('T')[0]};
    await _clockSubmit({kind:'session_upsert', row:session});   // online: writes now; offline: queues + syncs on reconnect
    _clockState.status='traveling';onClockStateChange('traveling');_clockState.sessionId=sessionId;
    _clockState.dayStart=now;_clockState.travelOutStart=now;
    _clockState.jobId=jobId;_clockState.jobName=jobName;
    _clockState.todayEvents.push({type:'travel_start',time:now,lat:lat,lng:lng,label:'Started Travel'});
    _ensureClockDayEntry();   // r43: open (or fill the WO on) the day's itemized timesheet line
    await logTimeEvent('travel_start',lat,lng,acc);
    updateClockUI();startClockTimer();
    if(_clockPending()>0){
      showToast('Travel started — saved on this device. No signal right now, so it will sync to the office automatically when you’re back online.','info',6000);
    } else {
      showToast('Travel started — drive safe!','success');
    }
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
    // Baseline the break/lunch already taken earlier today so THIS leg's "On Site" timer only
    // discounts breaks taken during THIS leg — not the whole day's. Without this, arriving at a
    // second job after a lunch made the timer sit at 0:00:00 until the new leg exceeded that lunch.
    _clockState.onsiteBreakBase=_clockState.breakMins+_clockState.lunchMins;
    if(_clockState.sessionId) await _clockSubmit({kind:'session_update', id:_clockState.sessionId, patch:{status:'clocked_in'}});
    await logTimeEvent('clock_in',lat,lng,acc,geo.reason==='out_of_range'?'Outside geofence':null);
    _clockState.status='onsite';onClockStateChange('onsite');
    _clockState.todayEvents.push({type:'clock_in',time:now,lat:lat,lng:lng,label:'Arrived On Site',flagged:geo.reason==='out_of_range'});
    updateClockUI();startClockTimer();showToast('Clocked in to '+_clockState.jobName,'success');
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
    if(_clockState.sessionId) await _clockSubmit({kind:'session_update', id:_clockState.sessionId, patch:{status:'returning'}});
    await logTimeEvent('clock_out',lat,lng,acc,geo.reason==='out_of_range'?'Outside geofence':null);
    _clockState.status='returning';onClockStateChange('returning');
    _clockState.todayEvents.push({type:'clock_out',time:now,lat:lat,lng:lng,label:'Left Job Site',flagged:geo.reason==='out_of_range'});
    updateClockUI();showToast('Clocked out — traveling back','info');
  });
}

// PHASE 4 — ARRIVE BACK / END DAY
async function doArriveBack(){
  // Check for incomplete field logs before ending the day
  if (typeof checkFieldLogBeforeClockOut === 'function') {
    checkFieldLogBeforeClockOut(function(){
      _doArriveBackActual();
    });
    return;
  }
  _doArriveBackActual();
}

// r44: compute a clock day's PAID minutes correctly. PAID = the whole clocked span (base/office +
// travel + on-site + paid breaks) MINUS unpaid lunch. Base/office time — before "Start Travel" — now
// counts as paid (Joe, 2026-10-30). The OLD formula (travel + onsite + break) was wrong three ways: it
// dropped base time entirely, never subtracted a lunch taken while on-site, and added break on top of an
// on-site figure that already contained it (double-count). On Lisa's test day (7:33a start-at-base →
// 3:46p out, 45m lunch) the old math gave 5h51m; this gives the correct 7h28m. Pure + unit-tested.
// Returns a consistent breakdown where office + travel + onsite === totalPaid; break/lunch are
// informational (break is already inside the paid time; lunch is excluded).
function _computeClockDayTotals(st, endTime){
  st = st || {};
  var t0 = st.homebaseStart || st.dayStart;
  if (!t0 && st.todayEvents && st.todayEvents.length) { try { t0 = new Date(st.todayEvents[0].time); } catch(e){} }
  if (!t0) t0 = endTime;
  var spanMins  = Math.max(0, Math.round((endTime - t0)/60000));
  var lunch     = st.lunchMins || 0;
  var brk       = st.breakMins || 0;
  var travel    = (st.travelOutMins||0) + (st.travelBackMins||0);
  var totalPaid = Math.max(0, spanMins - lunch);          // base + travel + onsite + break paid; lunch unpaid
  var firstMove = st.travelOutStart || st.onsiteStart || null;
  var baseMins;
  if (st.homebaseStart && firstMove)       baseMins = Math.max(0, Math.round((firstMove - st.homebaseStart)/60000));
  else if (st.homebaseStart && !firstMove) baseMins = totalPaid;   // started at base and never left → whole paid day is base/office
  else                                     baseMins = 0;           // went straight to travel (no base phase)
  if (baseMins > totalPaid) baseMins = totalPaid;
  if (travel  > totalPaid - baseMins) travel = Math.max(0, totalPaid - baseMins);
  var onsite = Math.max(0, totalPaid - baseMins - travel);        // remainder is on-site (includes any paid break)
  return { totalPaidMins: totalPaid, officeMins: baseMins, travelMins: travel, onsiteMins: onsite, breakMins: brk, lunchMins: lunch };
}

// r49 — split a clock day across LOCAL midnight(s), cap a runaway at 24h, and flag.
// Fixes two things the 435-hour Dawn record exposed: (1) a forgotten clock-out banked the whole multi-day
// span as paid, and (2) overnight work belongs partly to each calendar day. Pure + unit-tested.
//   t0, endTime : Date (span start/end); st : the clock state (for the r44 breakdown).
//   LONG_DAY_MINS : paid minutes above which a day is flagged for office review (not truncated).
// Rules: cap the span at 24h (autoStopped); split [t0, end] at each local midnight into one segment per
// calendar day; allocate the r44 breakdown proportionally by each segment's span (last segment absorbs the
// rounding remainder, so the pieces sum EXACTLY to the whole). A normal same-day shift → one segment,
// identical to before. Returns { autoStopped, crossesMidnight, segments:[{date, totalPaidMins, officeMins,
// travelMins, onsiteMins, breakMins, lunchMins, longDayFlagged}] }.
function _localDateStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _splitClockDay(t0, endTime, st, LONG_DAY_MINS){
  LONG_DAY_MINS = LONG_DAY_MINS || (16*60);
  var MAX = 24*60*60000;
  var autoStopped = false;
  if (endTime - t0 > MAX){ endTime = new Date(t0.getTime()+MAX); autoStopped = true; }
  var full = _computeClockDayTotals(st, endTime);          // breakdown over the (capped) span
  var totalSpanMs = Math.max(1, endTime - t0);
  // one segment per local calendar day the span touches
  var segs = [], cur = new Date(t0.getTime());
  while (cur < endTime){
    var nextMid = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()+1, 0,0,0,0); // next LOCAL midnight
    var segEnd  = (nextMid < endTime) ? nextMid : endTime;
    segs.push({ startMs:cur.getTime(), endMs:segEnd.getTime(), date:_localDateStr(cur) });
    cur = segEnd;
  }
  if (!segs.length) segs.push({ startMs:t0.getTime(), endMs:endTime.getTime(), date:_localDateStr(t0) });
  // proportional allocation; last segment takes the remainder so sums are exact
  function alloc(total){
    var out=[], acc=0;
    for (var i=0;i<segs.length;i++){
      if (i===segs.length-1){ out.push(Math.max(0, total-acc)); }
      else { var v=Math.round(total * ((segs[i].endMs-segs[i].startMs)/totalSpanMs)); out.push(v); acc+=v; }
    }
    return out;
  }
  var paid=alloc(full.totalPaidMins), off=alloc(full.officeMins), trav=alloc(full.travelMins),
      ons=alloc(full.onsiteMins), brk=alloc(full.breakMins), lun=alloc(full.lunchMins);
  segs.forEach(function(s,i){
    s.totalPaidMins=paid[i]; s.officeMins=off[i]; s.travelMins=trav[i];
    s.onsiteMins=ons[i]; s.breakMins=brk[i]; s.lunchMins=lun[i];
    s.longDayFlagged = autoStopped || s.totalPaidMins > LONG_DAY_MINS;
  });
  return { autoStopped:autoStopped, crossesMidnight:segs.length>1, segments:segs };
}

async function _doArriveBackActual(){
  getGPS(async function(lat,lng,acc){
    var now=new Date();
    var travelBackMins=_clockState.travelBackStart?Math.round((now-_clockState.travelBackStart)/60000):0;
    _clockState.travelBackMins+=travelBackMins;
    var _dt=_computeClockDayTotals(_clockState, now);
    var totalTravel=_dt.travelMins;
    var totalOnsite=_dt.onsiteMins;
    var totalPaid=_dt.totalPaidMins;
    // Lunch enforcement — spec Section 5
    var lunchFlag=false;
    if(totalPaid>360&&_clockState.lunchCount===0) lunchFlag=true;
    if(_clockState.lunchCount>0&&_clockState.lunchMins<30) lunchFlag=true;
    if(lunchFlag){
      var confirmed=await showLunchFlagModal(totalPaid);
      if(!confirmed) return;
    }
    await logTimeEvent('day_end',lat,lng,acc);
    // r18: close the cloud session so OTHER devices and the office dashboard see the day is done.
    // Without this the open session lingered at 'returning' and a second device showed "traveling"
    // after the tech had already arrived back. Goes through the offline queue so it works with no signal.
    if(_clockState.sessionId) await _clockSubmit({kind:'session_update', id:_clockState.sessionId, patch:{status:'out', clock_out_at: now.toISOString()}});
    _clockState.todayEvents.push({type:'day_end',time:now,label:'Arrived Back — Day Complete'});

    // Persist completed work day(s) to DB for history. r49: split across local midnight so overnight work
    // lands on each calendar day, and cap a forgotten clock-out at 24h (flagged) instead of banking the
    // whole multi-day span. A normal same-day shift yields exactly one workDay, as before.
    if (!DB.workDays) DB.workDays = [];
    var _t0 = _clockState.homebaseStart || _clockState.dayStart ||
              (_clockState.todayEvents && _clockState.todayEvents.length ? new Date(_clockState.todayEvents[0].time) : now);
    var _evInStartOrder = _clockState.todayEvents.map(function(e){ return Object.assign({},e,{time:e.time instanceof Date?e.time.toISOString():e.time}); });
    var _split = _splitClockDay(_t0, now, _clockState);
    var _baseId = 'wd-'+Date.now();
    _split.segments.forEach(function(seg, i){
      DB.workDays.push({
        id:            i===0 ? _baseId : _baseId+'-'+i,
        techName:      _currentUser ? _currentUser.full_name : 'Unknown',
        techId:        _currentUser ? _currentUser.id : null,
        date:          seg.date,
        travelMins:    seg.travelMins,
        onsiteMins:    seg.onsiteMins,
        officeMins:    seg.officeMins,       // r44: base/office time counted (and paid)
        breakMins:     seg.breakMins,        // informational — already inside the paid onsite/office time
        lunchMins:     seg.lunchMins,        // informational — unpaid, excluded from totalPaidMins
        totalPaidMins: seg.totalPaidMins,
        jobName:       _clockState.jobName||'',
        // punches go on the FIRST calendar day's record (they describe the one continuous shift)
        events:        i===0 ? _evInStartOrder : [],
        lunchFlagged:  lunchFlag && i===0,
        autoStopped:   !!_split.autoStopped,          // 24h runaway cap hit
        longDayFlagged:!!seg.longDayFlagged           // over the review threshold → office should eyeball
      });
    });
    // r49: report the CAPPED sum across segments (not the raw span) so a 24h-capped runaway doesn't toast
    // "435h", and an overnight shift's reported total matches the two day records that were written.
    var _capTotal  = _split.segments.reduce(function(s,x){ return s+x.totalPaidMins; }, 0);
    var _capOnsite = _split.segments.reduce(function(s,x){ return s+x.onsiteMins;   }, 0);
    var _capTravel = _split.segments.reduce(function(s,x){ return s+x.travelMins;   }, 0);
    saveDB();
    showToast('Day complete — '+formatMinutes(_capTotal)+' total paid ('+formatMinutes(_capOnsite)+' on site, '+formatMinutes(_capTravel)+' travel)'+(_split.autoStopped?' · ⚠ auto-stopped at 24h — flagged for office':''),'success',6000);
    clearInterval(_clockState.timerInterval);
    _clockState.status='out';onClockStateChange('out');_clockState.sessionId=null;
    _clockState.travelOutStart=null;_clockState.onsiteStart=null;_clockState.travelBackStart=null;
    _clockState.dayStart=null;_clockState.homebaseStart=null;
    _clockState.travelOutMins=0;_clockState.onsiteMins=0;
    _clockState.travelBackMins=0;_clockState.breakMins=0;_clockState.lunchMins=0;_clockState.lunchCount=0;
    _eodReminderShown=false;hideEodReminder();updateClockUI();
    _closeClockDayEntry(_capTotal);   // r43/r49: stamp the end + CAPPED total on the day's itemized line
  });
}

// r43 PHASE 1 — "the clock IS the timesheet." Clocking in opens ONE itemized time_entries line for the
// day (in-progress, no end), so the tech's timesheet shows it immediately and they just open it to add
// what-they-did + materials — never re-typing the time. Clock-out closes it. The line is CLOCK-SOURCED
// (is_manual=false + clock_in set, plus an in-memory `source:'clock'` flag) and is EXCLUDED from payroll
// and summary aggregation — those keep reading the clock's authoritative workDay — so this moves ZERO
// payroll minutes. It starts unverified (is_approved=false) → office "Verify" gate (spec Decision 3).
function _isClockEntry(e){ return !!(e && (e.source==='clock' || (e.isManual===false && e.clockIn))); }
function _clockDayEntryId(){
  var tid = (_currentUser && _currentUser.id) ? _currentUser.id : 'self';
  return 'te-clock-'+tid+'-'+getTodayISO();
}
function _findClockDayEntry(){
  var id=_clockDayEntryId();
  return (DB.timeEntries||[]).find(function(e){ return e && e.id===id && !e.deleted; });
}
function _hhmm(d){ return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function _ensureClockDayEntry(){
  try {
    if (!_currentUser) return;
    var jid = _clockState.jobId || '';
    var isOffice = (!jid || jid==='office');
    var existing = _findClockDayEntry();
    if (existing){
      // first real job of the day fills the WO on the day line if it started at base (office)
      if (!existing.woId && !isOffice){
        existing.woId=jid; existing.jobId=jid; existing.entryType='work';
        existing.woLabel=_clockState.jobName||existing.woLabel;
        saveDB(); if (typeof _pushTimeEntryToSupabase==='function') _pushTimeEntryToSupabase(existing);
      }
      return;
    }
    var now = new Date();
    var entry = {
      id:         _clockDayEntryId(),
      techName:   _currentUser.full_name || 'Unknown',
      userId:     _currentUser.id || null,
      date:       getTodayISO(),
      entryType:  isOffice ? 'office' : 'work',
      startTime:  _hhmm(now),
      endTime:    '',
      totalHours: 0, totalMins: 0,
      isPaid:     true,
      woId:       isOffice ? '' : jid,
      jobId:      isOffice ? '' : jid,
      woLabel:    _clockState.jobName || (isOffice ? 'Office / General' : ''),
      notes:      '',
      isManual:   false,              // clock-sourced marker (durable; survives cloud round-trip)
      source:     'clock',            // in-memory convenience marker
      clockIn:    now.toISOString(),
      isApproved: false,              // "needs review" until office verifies
      addedBy:    _currentUser.full_name || 'Unknown',
      addedAt:    now.toISOString(),
      auditTrail: [{ action:'clock-day-open', by:(_currentUser.full_name||'self'), at:now.toISOString() }]
    };
    if (!DB.timeEntries) DB.timeEntries = [];
    DB.timeEntries.push(entry);
    saveDB();
    if (typeof _pushTimeEntryToSupabase==='function') _pushTimeEntryToSupabase(entry);
    if (typeof loadTimesheets==='function') { try { loadTimesheets(); } catch(e){} }
  } catch(e){ console.warn('[clock day entry]', e && e.message); }
}
function _closeClockDayEntry(totalPaidMins){
  try {
    var entry = _findClockDayEntry();
    if (!entry) return;
    var now = new Date();
    entry.endTime     = _hhmm(now);
    entry.totalMins   = (totalPaidMins!=null) ? totalPaidMins : (entry.totalMins||0);
    entry.totalHours  = Math.round((entry.totalMins/60)*100)/100;
    entry.clockOut    = now.toISOString();
    entry.breakMinutes= (_clockState.breakMins||0)+(_clockState.lunchMins||0);
    if (!entry.woLabel && _clockState.jobName) entry.woLabel = _clockState.jobName;
    (entry.auditTrail=entry.auditTrail||[]).push({ action:'clock-day-close', by:(_currentUser?_currentUser.full_name:'self'), at:now.toISOString() });
    saveDB();
    if (typeof _pushTimeEntryToSupabase==='function') _pushTimeEntryToSupabase(entry);
    if (typeof loadTimesheets==='function') { try { loadTimesheets(); } catch(e){} }
  } catch(e){ console.warn('[clock day entry close]', e && e.message); }
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
    _clockState.status='traveling';onClockStateChange('traveling');_clockState.travelOutStart=now;_clockState.onsiteStart=null;
    // Keep the open clock_sessions row truthful: on a job change update its job AND status, the
    // same way arrive/leave/break update status. Without this the session kept the ORIGINAL job,
    // so a refresh (restoreClockSession reads the session) snapped the tech back to the first job,
    // and the office dashboard showed the wrong job too.
    if(_clockState.sessionId) await _clockSubmit({kind:'session_update', id:_clockState.sessionId, patch:{job_id:nextId,job_name:nextName,status:'traveling'}});
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
  DB.lunchFlags.push({id:'lf-'+Date.now(),techName:_currentUser?_currentUser.full_name:'Unknown',date:getTodayISO(),lunchMins:_clockState.lunchMins,cleared:choice==='yes',approver:approver,note:note,status:'pending_review'});
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
    else if(_clockState.status==='onsite'){var offMs=Math.max(0,(_clockState.breakMins+_clockState.lunchMins-(_clockState.onsiteBreakBase||0)))*60000;if(_clockState.breakStart)offMs+=(now-_clockState.breakStart);if(_clockState.lunchStart)offMs+=(now-_clockState.lunchStart);if(disp)disp.textContent=formatMs(Math.max(0,now-_clockState.onsiteStart-offMs));if(lbl)lbl.textContent='🔧 On Site';}
    else if(_clockState.status==='break'){if(disp)disp.textContent=formatMs(now-_clockState.breakStart);if(lbl)lbl.textContent='⏸ On Break';}
    else if(_clockState.status==='lunch'){if(disp)disp.textContent=formatMs(now-_clockState.lunchStart);if(lbl)lbl.textContent='🍽 At Lunch';}
    else if(_clockState.status==='returning'){if(disp)disp.textContent=formatMs(now-_clockState.travelBackStart);if(lbl)lbl.textContent='🚗 Return Travel';}
    var travelMs=(_clockState.travelOutMins*60000)+(_clockState.status==='traveling'?now-_clockState.travelOutStart:0)+(_clockState.travelBackMins*60000)+(_clockState.status==='returning'?now-_clockState.travelBackStart:0);
    var onsiteMs=(_clockState.onsiteMins*60000)+(_clockState.status==='onsite'?Math.max(0,now-_clockState.onsiteStart-Math.max(0,(_clockState.breakMins+_clockState.lunchMins-(_clockState.onsiteBreakBase||0)))*60000):0);
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
  var otherJobs=_getMyAssignedJobs().filter(function(j){return j.id!==_clockState.jobId;});
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


function _getMyAssignedJobs() {
  var myName = _currentUser ? _currentUser.full_name : '';
  if (!myName) return [];
  // WOs are jobs — return assigned WOs as job objects
  if (typeof _getMyWOsAsJobs === 'function') return _getMyWOsAsJobs(myName);
  return [];
}

function renderFieldPage(){
  var sel=document.getElementById('clock-job-select');
  if(sel){
    sel.innerHTML='<option value="">-- Choose your job --</option>';
    var myJobs=_getMyAssignedJobs();
    // Use WO number + description as display
    myJobs.forEach(function(j){var opt=document.createElement('option');opt.value=j.id;opt.textContent=j.name+(j.customer?' — '+j.customer:'');sel.appendChild(opt);});
    // r18: always allow clocking in with NO specific work order (office/shop/training days, or when
    // no WO is assigned yet). 'office' is a valid non-empty job id that doStartTravel accepts.
    var _og=document.createElement('option'); _og.value='office'; _og.textContent='Office / General (no specific work order)'; sel.appendChild(_og);
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
    var active=_getMyAssignedJobs();
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

  // Vehicle-issue report card — show only to roles allowed to report
  var viCard = document.getElementById('field-vehicle-issue-card');
  if (viCard) viCard.style.display = ((typeof hasPermission!=='function') || hasPermission('vehicles.report_issue')) ? '' : 'none';

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
  // Initialize date range when opening All Timesheets tab
  if (tab === 'all-timesheets') {
    var fromEl = document.getElementById('ts-date-from');
    var toEl   = document.getElementById('ts-date-to');
    if (fromEl && !fromEl.value) {
      var wk = getWeekDates();
      fromEl.value = dateStr(wk.start);
      if (toEl) toEl.value = dateStr(wk.end);
    }
  }
  loadTimesheets();
}

function fmtMins(mins) {
  if (!mins) return '0h 0m';
  var h=Math.floor(mins/60), m=Math.round(mins%60);
  return h+'h '+m+'m';
}

function getPayPeriodDates() {
  // Bi-weekly pay periods anchored to Jan 6, 2025 (confirmed Monday)
  // Weeks always run Monday–Sunday per TCSS policy
  var anchor = new Date('2025-01-06T00:00:00'); // Monday
  var now    = new Date();
  // Work in local midnight to avoid DST drift
  var anchorMidnight = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  var todayMidnight  = new Date(now.getFullYear(),    now.getMonth(),    now.getDate());
  var diffDays  = Math.round((todayMidnight - anchorMidnight) / (1000*60*60*24));
  var periodNum = Math.floor(diffDays / 14);
  var startDate = new Date(anchorMidnight); startDate.setDate(anchorMidnight.getDate() + periodNum*14);
  var endDate   = new Date(startDate);       endDate.setDate(startDate.getDate() + 13);
  return { start: startDate, end: endDate };
}

function getWeekDates() {
  // Week always starts Monday, ends Sunday
  var now = new Date();
  var todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var dow = todayMidnight.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  var daysFromMonday = dow === 0 ? 6 : dow - 1; // Sun→6, Mon→0, Tue→1 ...
  var weekStart = new Date(todayMidnight); weekStart.setDate(todayMidnight.getDate() - daysFromMonday);
  var weekEnd   = new Date(weekStart);     weekEnd.setDate(weekStart.getDate() + 6);
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

  // Hide admin-only timesheet tabs the current user can't use (nav-level; the tab
  // bodies also enforce independently so a forced tab still shows an access notice).
  var _tabAll = document.getElementById('ts-tab-all');
  if (_tabAll) _tabAll.style.display = (typeof hasPermission!=='function' || hasPermission('time.viewall')) ? '' : 'none';
  var _tabPay = document.getElementById('ts-tab-payroll');
  if (_tabPay) { var _payOk = (typeof _canViewPay==='function') ? _canViewPay() : true; _tabPay.style.display = _payOk ? '' : 'none'; }

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
      // r44: live "Total Paid" uses the same rule as the finished day — the whole clocked span so far
      // (base/office + travel + on-site + breaks) minus unpaid lunch — so the running number matches what
      // gets recorded at clock-out (the old travel+onsite+break estimate dropped base time and mis-handled
      // break/lunch). On Site / Travel below stay running estimates.
      var _liveT0 = _clockState.homebaseStart || _clockState.dayStart || now;
      var livePaidMins = Math.max(0, Math.round((now - _liveT0)/60000) - (_clockState.lunchMins||0));
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
    var isAdmin = (typeof hasPermission==='function') ? hasPermission('time.viewall') : (myRole==='owner'||myRole==='manager'||myRole==='back_office');
    if (!isAdmin) {
      allEl.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">You do not have permission to view all timesheets.</div>';
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


// ============================================================
// PHASE 1 — BACK OFFICE MANUAL TIME ENTRY
// ============================================================

// ---- OPEN / POPULATE ENTRY MODAL ----

// ============================================================
// TEAM CLOCK (simple) — a lead/office clocks a teammate IN or OUT.
// Creates/closes an OPEN time_entries row for that teammate (no GPS/timers — that's the
// planned "full GPS shift on behalf" follow-up). An OPEN shift = a time entry with no end
// time for that tech, today. Who did it is stamped in added_by (persists through sync, so
// clock-out still works after a cloud round-trip). Gated by time.clockteam.
// ============================================================
function _tcNowHHMM(){ var d=new Date(); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function _tcHHMMtoMins(t){ var p=String(t||'').split(':'); return (parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0); }
function _findOpenTeamShift(techName){
  var today = getTodayISO();
  return (DB.timeEntries||[]).find(function(e){
    if (!e || e.deleted || e.techName!==techName || e.date!==today || e.endTime) return false;
    // Pre-sync: the local teamClock flag is set. Post-sync that flag is gone (not a DB
    // column), so fall back to persistent fields: an open (no end-time) manual entry whose
    // added_by is someone OTHER than the tech is a team clock-in. Self-clock never uses
    // time_entries, so an open time_entries row is effectively always a team clock.
    return e.teamClock===true || (e.isManual && e.addedBy && e.addedBy!==e.techName);
  });
}
function openTeamClock(){
  if (typeof hasPermission==='function' && !hasPermission('time.clockteam')) { showToast('You do not have permission to clock the team','error'); return; }
  var existing = document.getElementById('modal-team-clock'); if (existing) existing.remove();
  var team = (DB.team||[]).filter(function(m){ return m.active!==false; })
    .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });
  var opts = '<option value="">— Select teammate —</option>' +
    team.map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  var html = '<div class="modal-overlay open" id="modal-team-clock" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box sm" style="max-width:420px">'+
      '<div class="modal-head"><h3>⏱ Clock a Teammate</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'modal-team-clock\').remove()">✕</button></div>'+
      '<div class="modal-body">'+
        '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">TEAMMATE</label>'+
        '<select id="tc-team-tech" onchange="_renderTeamClockState()" style="width:100%;padding:9px;border:1px solid #e0e7ef;border-radius:6px;font-size:14px;box-sizing:border-box">'+opts+'</select>'+
        '<div id="tc-team-state" style="margin:14px 0;font-size:13px;color:#546e7a;min-height:20px"></div>'+
        '<div id="tc-team-actions"></div>'+
        '<div style="font-size:11px;color:#90a4ae;margin-top:14px">Records to the timesheet under the teammate’s name, stamped with your name. No GPS — for quick crew clock-in/out.</div>'+
      '</div>'+
    '</div></div>';
  var wrap = document.createElement('div'); wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}
function _renderTeamClockState(){
  var tech = (document.getElementById('tc-team-tech')||{}).value||'';
  var stateEl = document.getElementById('tc-team-state');
  var actEl = document.getElementById('tc-team-actions');
  if (!stateEl || !actEl) return;
  if (!tech){ stateEl.textContent=''; actEl.innerHTML=''; return; }
  var open = _findOpenTeamShift(tech);
  if (open){
    stateEl.innerHTML = '<span style="color:#2e7d32;font-weight:700">● On the clock</span> since '+escHtml(open.startTime||'?')+' today (started by '+escHtml(open.addedBy||'?')+').';
    actEl.innerHTML = '<button class="btn btn-danger" style="width:100%" onclick="teamClockOut()">Clock '+escHtml(tech)+' Out Now</button>';
  } else {
    stateEl.innerHTML = '<span style="color:#90a4ae;font-weight:700">○ Not on the clock</span> today.';
    actEl.innerHTML = '<button class="btn btn-success" style="width:100%" onclick="teamClockIn()">Clock '+escHtml(tech)+' In Now</button>';
  }
}
function teamClockIn(){
  if (typeof hasPermission==='function' && !hasPermission('time.clockteam')) { showToast('You do not have permission to clock the team','error'); return; }
  var tech = (document.getElementById('tc-team-tech')||{}).value||'';
  if (!tech){ showToast('Select a teammate','error'); return; }
  if (_findOpenTeamShift(tech)){ showToast(tech+' is already clocked in','warning'); return; }
  var adder = _currentUser ? _currentUser.full_name : 'Unknown';
  var now = new Date().toISOString();
  var entry = {
    id:         'te-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
    techName:   tech,
    date:       getTodayISO(),
    entryType:  'work',
    startTime:  _tcNowHHMM(),
    endTime:    '',
    totalHours: 0,
    totalMins:  0,
    isPaid:     true,
    woId:       '',
    jobId:      '',
    woLabel:    '',
    notes:      'Team clock-in by '+adder,
    isManual:   true,
    teamClock:  true,
    addedBy:    adder,
    addedAt:    now,
    auditTrail: [{ action:'team-clock-in', by:adder, at:now }]
  };
  if (!DB.timeEntries) DB.timeEntries = [];
  DB.timeEntries.push(entry);
  saveDB();
  if (typeof _pushTimeEntryToSupabase==='function') _pushTimeEntryToSupabase(entry);
  showToast(tech+' clocked in','success');
  _renderTeamClockState();
  if (typeof loadTimesheets==='function') loadTimesheets();
}
function teamClockOut(){
  if (typeof hasPermission==='function' && !hasPermission('time.clockteam')) { showToast('You do not have permission to clock the team','error'); return; }
  var tech = (document.getElementById('tc-team-tech')||{}).value||'';
  if (!tech){ showToast('Select a teammate','error'); return; }
  var open = _findOpenTeamShift(tech);
  if (!open){ showToast(tech+' is not clocked in','warning'); return; }
  var adder = _currentUser ? _currentUser.full_name : 'Unknown';
  var now = new Date().toISOString();
  var endHHMM = _tcNowHHMM();
  var mins = _tcHHMMtoMins(endHHMM) - _tcHHMMtoMins(open.startTime);
  if (mins < 0) mins = 0; // guard against a clock-out that crosses midnight in this simple v1
  open.endTime    = endHHMM;
  open.totalMins  = mins;
  open.totalHours = Math.round((mins/60)*100)/100;
  open.teamClock  = false; // shift closed
  open.lastEditedBy = adder;
  open.lastEditedAt = now;
  if (!open.auditTrail) open.auditTrail = [];
  open.auditTrail.push({ action:'team-clock-out', by:adder, at:now });
  saveDB();
  if (typeof _pushTimeEntryToSupabase==='function') _pushTimeEntryToSupabase(open);
  showToast(tech+' clocked out — '+open.totalHours+' hrs','success');
  _renderTeamClockState();
  if (typeof loadTimesheets==='function') loadTimesheets();
}

function openAddTimeEntry(prefillTech, prefillDate, prefillWoId) {
  // Recording/adjusting time for the team is governed by the time.clockteam permission
  // (default: owner/manager/back_office/lead_tech — owner can adjust per role in Settings).
  // Replaces the old hardcoded office-only check, which excluded lead techs.
  if (typeof hasPermission==='function' && !hasPermission('time.clockteam')) { showToast('You do not have permission to record time for the team','error'); return; }
  // r48: can't add time onto a locked / payroll-sealed day.
  if (prefillTech && prefillDate && typeof _dayEditBlockMsg==='function'){ var _blkA=_dayEditBlockMsg(prefillTech, prefillDate); if(_blkA){ showToast(_blkA,'error'); return; } }

  // Clear form
  document.getElementById('te-edit-id').value = '';
  document.getElementById('te-modal-title').textContent = '+ Add Time Entry';
  document.getElementById('te-notes').value = '';
  document.getElementById('te-start').value = '';
  document.getElementById('te-end').value = '';
  document.getElementById('te-gps-reason').value = '';
  document.getElementById('te-duration-preview').textContent = '';
  var delBtn = document.getElementById('te-delete-btn');
  if (delBtn) delBtn.style.display = 'none';

  // Pre-fill tech dropdown
  var techSel = document.getElementById('te-tech');
  techSel.innerHTML = '<option value="">— Select Tech —</option>' +
    (DB.team||[]).filter(function(m){ return m.active!==false; })
      .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
      .map(function(m){ return '<option value="'+escHtml(m.name)+'"'+(m.name===prefillTech?' selected':'')+'>'+escHtml(m.name)+'</option>'; }).join('');

  // Date
  var dateEl = document.getElementById('te-date');
  dateEl.value = prefillDate || getTodayISO();

  // Entry type default
  document.getElementById('te-type').value = prefillWoId ? 'work' : 'work';
  window._teForcedWO = prefillWoId || null;
  onTeTypeChange();

  // Pre-select WO if provided (inject the option even if its status excludes it from the open-WO list)
  if (prefillWoId) {
    setTimeout(function(){
      var woSel = document.getElementById('te-wo');
      if (woSel) {
        if (!Array.prototype.some.call(woSel.options, function(o){ return o.value===prefillWoId; })) {
          var w=(DB.workOrders||[]).find(function(x){ return x.id===prefillWoId; });
          var opt=document.createElement('option'); opt.value=prefillWoId;
          opt.textContent = w ? ((w.woNumber||'WO')+' — '+(w.customerName||'')) : 'This Work Order';
          woSel.insertBefore(opt, woSel.options[1]||null);
        }
        woSel.value = prefillWoId;
      }
    }, 80);
  }

  openModal('modal-time-entry');
}

function openEditTimeEntry(entryId) {
  // Editing an existing entry is a time CORRECTION → time.correct (distinct from adding
  // team time, which is time.clockteam). A lead may clock the crew in/out but not
  // retroactively correct records unless the owner grants time.correct.
  if (typeof hasPermission==='function' && !hasPermission('time.correct')) { showToast('You do not have permission to correct time entries','error'); return; }
  // Delete follows the same correction permission (not a separate hardcoded role list),
  // so an owner can grant/revoke it per role like every other toggle.
  var canDelete = (typeof hasPermission==='function') ? hasPermission('time.correct')
    : (_currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='manager'));
  var entry = (DB.timeEntries||[]).find(function(e){ return e.id===entryId; });
  if (!entry) { showToast('Entry not found','error'); return; }
  // r48: can't edit an entry on a locked / payroll-sealed day.
  if (typeof _dayEditBlockMsg==='function'){ var _blkE=_dayEditBlockMsg(entry.techName, entry.date); if(_blkE){ showToast(_blkE,'error'); return; } }

  document.getElementById('te-modal-title').textContent = 'Edit Time Entry';
  document.getElementById('te-edit-id').value = entryId;
  document.getElementById('te-notes').value = entry.notes||'';
  document.getElementById('te-gps-reason').value = entry.gpsReason||'';

  var techSel = document.getElementById('te-tech');
  techSel.innerHTML = '<option value="">— Select Tech —</option>' +
    (DB.team||[]).filter(function(m){ return m.active!==false; })
      .sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); })
      .map(function(m){ return '<option value="'+escHtml(m.name)+'"'+(m.name===entry.techName?' selected':'')+'>'+escHtml(m.name)+'</option>'; }).join('');

  document.getElementById('te-date').value = entry.date||getTodayISO();
  document.getElementById('te-type').value = entry.entryType||'work';
  document.getElementById('te-start').value = entry.startTime||'';
  document.getElementById('te-end').value = entry.endTime||'';

  window._teForcedWO = entry.woId || null;
  onTeTypeChange();
  // Set WO after type change populates the dropdown (inject if its status excludes it)
  setTimeout(function(){
    var woSel = document.getElementById('te-wo');
    if (woSel && entry.woId) {
      if (!Array.prototype.some.call(woSel.options, function(o){ return o.value===entry.woId; })) {
        var w=(DB.workOrders||[]).find(function(x){ return x.id===entry.woId; });
        var opt=document.createElement('option'); opt.value=entry.woId;
        opt.textContent = w ? ((w.woNumber||'WO')+' — '+(w.customerName||'')) : 'This Work Order';
        woSel.insertBefore(opt, woSel.options[1]||null);
      }
      woSel.value = entry.woId;
    }
  }, 50);

  updateTeDuration();

  var delBtn = document.getElementById('te-delete-btn');
  if (delBtn) delBtn.style.display = canDelete ? '' : 'none';

  openModal('modal-time-entry');
}

function onTeTypeChange() {
  var type   = (document.getElementById('te-type')||{}).value||'work';
  var gpsRow = document.getElementById('te-gps-row');

  // GPS reason — only for work/travel/office
  if (gpsRow) gpsRow.style.display = ['work','travel','office'].includes(type) ? '' : 'none';

  // WO dropdown — only open status WOs, assigned to this tech (or all for admin)
  var woSel = document.getElementById('te-wo');
  if (woSel) {
    var currentVal = woSel.value;
    var myName2  = (document.getElementById('te-tech')||{}).value || '';
    var isAdmin2 = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='manager'||_currentUser.role==='back_office');

    // Get open statuses from settings or defaults. Compare case-insensitively — legacy
    // imports use "Open" (title case) while the configured id is "OPEN", so a case-sensitive
    // match silently dropped 27+ open WOs (e.g. #105798) from this dropdown. (Unknown/closed
    // statuses like "Invoiced"/"Completed" are still excluded — they aren't in this list.)
    var openStatuses = ((DB.woSettings&&DB.woSettings.statuses)||WO_STATUSES)
      .filter(function(s){ return s.open!==false; })
      .map(function(s){ return String(s.id).toLowerCase(); });

    var availableWOs = (DB.workOrders||[]).filter(function(w){
      var isOpen = openStatuses.indexOf(String(w.status||'').toLowerCase()) >= 0;
      if (!isOpen) return false;
      // If tech selected and not admin, only show WOs they're assigned to
      if (myName2 && !isAdmin2) return _isTechAssignedToWO(myName2, w);
      return true;
    }).sort(function(a,b){ return (a.woNumber||'').localeCompare(b.woNumber||''); });

    // Keep a forced WO (opened from a specific WO's Labor tab) selectable even if its status
    // (e.g. New / Invoiced) would normally exclude it from the open-WO list.
    if (window._teForcedWO && !availableWOs.some(function(w){ return w.id===window._teForcedWO; })) {
      var _fw=(DB.workOrders||[]).find(function(w){ return w.id===window._teForcedWO; });
      if (_fw) availableWOs.unshift(_fw);
    }

    woSel.innerHTML =
      '<option value="office">Office / General (no specific job)</option>' +
      availableWOs.map(function(w){
        return '<option value="'+escHtml(w.id)+'">'+escHtml(w.woNumber)+' — '+escHtml(w.customerName||'')+'</option>';
      }).join('') +
      (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[]))
        .filter(function(j){ return j.status!=='Closed'; })
        .map(function(j){ return '<option value="job:'+escHtml(j.id)+'">'+escHtml(j.num)+' — '+escHtml(j.name||'')+'</option>'; }).join('');
    if (currentVal) woSel.value = currentVal; else if (window._teForcedWO) woSel.value = window._teForcedWO;
  }
}

function updateTeDuration() {
  var start = (document.getElementById('te-start')||{}).value||'';
  var end   = (document.getElementById('te-end')||{}).value||'';
  var prev  = document.getElementById('te-duration-preview');
  if (!prev) return;
  if (!start || !end) { prev.textContent=''; return; }
  var startMins = parseInt(start.split(':')[0])*60 + parseInt(start.split(':')[1]);
  var endMins   = parseInt(end.split(':')[0])*60   + parseInt(end.split(':')[1]);
  var diff = endMins - startMins;
  if (diff <= 0) { prev.textContent = '⚠ End time must be after start time'; prev.style.color='#c62828'; return; }
  var h = Math.floor(diff/60), m = diff%60;
  prev.style.color = '#2e7d32';
  prev.textContent = '→ ' + (h>0?h+'h ':'') + (m>0?m+'m':'') + ' (' + (diff/60).toFixed(2) + ' hrs)';
}

// ---- SAVE MANUAL ENTRY ----

function saveManualTimeEntry() {
  var editId   = (document.getElementById('te-edit-id')||{}).value||'';
  // Adding a new entry = time.clockteam; editing an existing one = time.correct.
  var _needPerm = editId ? 'time.correct' : 'time.clockteam';
  if (typeof hasPermission==='function' && !hasPermission(_needPerm)) {
    showToast('You do not have permission to '+(editId?'correct time entries':'record time for the team'),'error'); return;
  }
  var techName = (document.getElementById('te-tech')||{}).value||'';
  var date     = (document.getElementById('te-date')||{}).value||'';
  var type     = (document.getElementById('te-type')||{}).value||'work';
  var start    = (document.getElementById('te-start')||{}).value||'';
  var end      = (document.getElementById('te-end')||{}).value||'';
  var notes    = ((document.getElementById('te-notes')||{}).value||'').trim();
  var gpsReason= (document.getElementById('te-gps-reason')||{}).value||'';
  var woVal    = (document.getElementById('te-wo')||{}).value||'office';

  if (!techName) { showToast('Select a technician','error'); return; }
  if (!date)     { showToast('Date is required','error'); return; }
  if (!start || !end) { showToast('Start and end time are required','error'); return; }
  if (!notes)    { showToast('Notes are required for manual entries','error'); return; }
  // r48: block saving onto a locked / payroll-sealed day — both the target day and (for an edit that
  // moves an entry) the entry's original day.
  if (typeof _dayEditBlockMsg==='function'){
    var _blkS=_dayEditBlockMsg(techName, date); if(_blkS){ showToast(_blkS,'error'); return; }
    if (editId){ var _o=(DB.timeEntries||[]).find(function(e){ return e.id===editId; });
      if(_o){ var _blkO=_dayEditBlockMsg(_o.techName, _o.date); if(_blkO){ showToast(_blkO,'error'); return; } } }
  }

  var startMins = parseInt(start.split(':')[0])*60 + parseInt(start.split(':')[1]);
  var endMins   = parseInt(end.split(':')[0])*60   + parseInt(end.split(':')[1]);
  if (endMins <= startMins) { showToast('End time must be after start time','error'); return; }

  var totalHours = (endMins - startMins) / 60;
  var isPaid = !['lunch'].includes(type);

  // Resolve WO/job link
  var woId = null, jobId = null, woLabel = '';
  if (woVal && woVal !== 'office') {
    if (woVal.startsWith('job:')) {
      jobId = woVal.replace('job:','');
      var j = typeof _findJobOrWO==='function'?_findJobOrWO(jobId):(DB.jobs||[]).find(function(x){return x.id===jobId;});
      woLabel = j ? (j.num+' — '+j.name) : jobId;
    } else {
      woId = woVal;
      var w = (DB.workOrders||[]).find(function(x){return x.id===woId;});
      woLabel = w ? (w.woNumber+' — '+w.customerName) : woId;
    }
  } else {
    woLabel = 'Office / General';
  }

  var adder = _currentUser ? _currentUser.full_name : 'Unknown';
  var now = new Date().toISOString();

  if (!DB.timeEntries) DB.timeEntries = [];

  if (editId) {
    // Update existing
    var idx = DB.timeEntries.findIndex(function(e){ return e.id===editId; });
    if (idx>=0) {
      var orig = DB.timeEntries[idx];
      var wasClock = _isClockEntry(orig);   // r43: preserve the clock-source marker through an office edit
      if (!orig.auditTrail) orig.auditTrail = [];
      orig.auditTrail.push({
        action: 'edited',
        by: adder,
        at: now,
        prev: { techName:orig.techName, date:orig.date, type:orig.entryType, start:orig.startTime, end:orig.endTime, hours:orig.totalHours, notes:orig.notes }
      });
      orig.techName    = techName;
      orig.date        = date;
      orig.entryType   = type;
      orig.startTime   = start;
      orig.endTime     = end;
      orig.totalHours  = Math.round(totalHours*100)/100;
      orig.totalMins   = endMins - startMins;
      orig.isPaid      = isPaid;
      orig.woId        = woId;
      orig.jobId       = jobId;
      orig.woLabel     = woLabel;
      orig.notes       = notes;
      orig.gpsReason   = gpsReason||null;
      // r43: keep a clock-sourced line clock-sourced (is_manual=false + source) so it stays OUT of
      // payroll/summary aggregation even after an office edit and a cloud round-trip (source is not a
      // DB column, so the durable signal is is_manual=false + clock_in). A genuinely manual entry → true.
      orig.isManual    = wasClock ? false : true;
      if (wasClock) orig.source = 'clock';
      orig.lastEditedBy = adder;
      orig.lastEditedAt = now;
    }
  } else {
    var entry = {
      id:          'te-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
      techName:    techName,
      date:        date,
      entryType:   type,
      startTime:   start,
      endTime:     end,
      totalHours:  Math.round(totalHours*100)/100,
      totalMins:   endMins - startMins,
      isPaid:      isPaid,
      woId:        woId,
      jobId:       jobId,
      woLabel:     woLabel,
      notes:       notes,
      gpsReason:   gpsReason||null,
      isManual:    true,
      addedBy:     adder,
      addedAt:     now,
      auditTrail:  [{ action:'created', by:adder, at:now }]
    };
    DB.timeEntries.push(entry);
  }

  saveDB();
  closeModal('modal-time-entry');
  showToast(editId ? 'Entry updated ✓' : 'Time entry added ✓', 'success');
  loadTimesheets();

  // Audit
  if (typeof auditTimeEntry === 'function') {
    var action = editId ? 'edited' : 'added';
    auditTimeEntry(action, editId || DB.timeEntries[DB.timeEntries.length-1].id,
      techName, date + ' ' + type + (woVal&&woVal!=='office'?' on '+woVal:''));
  }

  // Auto-promote NEW → OPEN on first time entry
  if (woId && typeof autoPromoteWOStatus === 'function') autoPromoteWOStatus(woId);

  // Push to Supabase in background — don't await, don't block UI
  var savedEntry = DB.timeEntries.find(function(e){
    return e.id === (editId || DB.timeEntries[DB.timeEntries.length-1].id);
  });
  if (savedEntry) _pushTimeEntryToSupabase(savedEntry);

  // If we're on a WO, refresh its labor tab too
  if (woId && typeof switchWOTab === 'function' && typeof _woCurrentId !== 'undefined' && _woCurrentId === woId) {
    switchWOTab('labor');
  }

  // Refresh the tech's day summary
  _rebuildDaySummary(techName, date);
}

function deleteTimeEntry() {
  var editId = (document.getElementById('te-edit-id')||{}).value||'';
  if (!editId) return;
  var canDelete = (typeof hasPermission==='function') ? hasPermission('time.correct')
    : (_currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='manager'));
  if (!canDelete) { showToast('Permission denied','error'); return; }
  // r48: can't delete an entry on a locked / payroll-sealed day.
  var _delEntry = (DB.timeEntries||[]).find(function(e){ return e.id===editId; });
  if (_delEntry && typeof _dayEditBlockMsg==='function'){ var _blkD=_dayEditBlockMsg(_delEntry.techName, _delEntry.date); if(_blkD){ showToast(_blkD,'error'); return; } }
  if (!confirm('Delete this time entry? This is logged in the audit trail.')) return;

  var adder = _currentUser ? _currentUser.full_name : 'Unknown';
  var now = new Date().toISOString();
  var entry = (DB.timeEntries||[]).find(function(e){ return e.id===editId; });
  if (entry) {
    if (!entry.auditTrail) entry.auditTrail = [];
    entry.auditTrail.push({ action:'deleted', by:adder, at:now });
    entry.deleted = true;
    entry.deletedBy = adder;
    entry.deletedAt = now;
  }
  // Tombstone so an unconfirmed cloud soft-delete (offline, or a failed write)
  // can't be un-deleted by a stale cloud row on the next pull — the pull forces
  // deleted=true for any tombstoned id until the delete is confirmed. pushAllToCloud
  // persists the flag (UPDATE, so it re-matches every retry) and clears the tombstone.
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.timeEntries)DB.deletedIds.timeEntries=[];
  if(DB.deletedIds.timeEntries.indexOf(editId)<0)DB.deletedIds.timeEntries.push(editId);
  saveDB();
  if (_sb && _currentUser) {
    _sb.from('time_entries').update({deleted:true, deleted_by:adder, deleted_at:now}).eq('id',editId).select('id').then(function(r){
      if(r&&r.error)console.warn('[Delete] time_entry:',r.error.message);
      if(typeof pushAllToCloud==='function')setTimeout(pushAllToCloud,300);
    });
  }
  closeModal('modal-time-entry');
  if (entry) _rebuildDaySummary(entry.techName, entry.date); // recompute payroll day totals without the deleted entry
  loadTimesheets();
  showToast('Entry deleted','info');
}

// Single source of truth for the time_entries row shape. Carries BOTH the manual
// timesheet model (tech_name/entry_date/start_time/... + deleted flag) AND the
// clock-based columns, so an entry of either kind round-trips without losing
// fields. Every column here exists after migration 2026-09-04_09. Used by the
// per-entry push below AND by pushAllToCloud's bulk push so the two can never
// disagree (they used to write different, partly-nonexistent column sets).
function _timeEntryToRow(e) {
  return {
    id:             e.id,
    // manual timesheet model
    tech_name:      e.techName || null,
    entry_date:     e.date || null,
    entry_type:     e.entryType || 'regular',
    start_time:     e.startTime || null,
    end_time:       e.endTime || null,
    total_hours:    (e.totalHours !== undefined && e.totalHours !== null) ? e.totalHours : null,
    total_mins:     (e.totalMins  !== undefined && e.totalMins  !== null) ? e.totalMins  : null,
    is_paid:        (e.isPaid !== undefined) ? !!e.isPaid : null,
    wo_id:          e.woId || null,
    job_id:         e.jobId || null,
    wo_label:       e.woLabel || null,
    notes:          e.notes || null,
    gps_reason:     e.gpsReason || null,
    is_manual:      (e.isManual !== undefined) ? !!e.isManual : true,
    added_by:       e.addedBy || (_currentUser ? _currentUser.full_name : null),
    added_at:       e.addedAt || null,
    last_edited_by: e.lastEditedBy || null,
    last_edited_at: e.lastEditedAt || null,
    audit_trail:    e.auditTrail || [],
    // soft-delete
    deleted:        !!e.deleted,
    deleted_by:     e.deletedBy || null,
    deleted_at:     e.deletedAt || null,
    // clock-based model (preserved for clock entries; null for manual)
    user_id:        e.userId || (_currentUser ? _currentUser.id : null),
    team_member_id: e.teamMemberId || null,
    clock_in:       e.clockIn || null,
    clock_out:      e.clockOut || null,
    break_minutes:  e.breakMinutes || 0,
    gps_lat:        e.gpsLat || null,
    gps_lng:        e.gpsLng || null,
    is_approved:    !!e.isApproved,
    approved_by:    e.approvedBy || null
  };
}

// Payroll sync (migration _15): map a DB.workDays record → app_work_days row. The app's
// work-day objects are sparse and vary by origin (clock-out / manual aggregation / PTO
// approval); this writes the full column superset. Preserves the correction audit
// (corrections/corrected), PTO day_type/approved, and the raw clock events JSON.
function _workDayToRow(wd) {
  return {
    id:                 wd.id,
    tech_name:          wd.techName || null,
    tech_id:            wd.techId || null,
    work_date:          wd.date || null,
    total_paid_mins:    (wd.totalPaidMins != null) ? wd.totalPaidMins : null,
    onsite_mins:        (wd.onsiteMins   != null) ? wd.onsiteMins   : null,
    travel_mins:        (wd.travelMins   != null) ? wd.travelMins   : null,
    break_mins:         (wd.breakMins    != null) ? wd.breakMins    : null,
    lunch_mins:         (wd.lunchMins    != null) ? wd.lunchMins    : null,
    office_mins:        (wd.officeMins   != null) ? wd.officeMins   : null,
    pto_mins:           (wd.ptoMins      != null) ? wd.ptoMins      : null,
    vacation_mins:      (wd.vacationMins != null) ? wd.vacationMins : null,
    holiday_mins:       (wd.holidayMins  != null) ? wd.holidayMins  : null,
    job_name:           wd.jobName || null,
    job_id:             wd.jobId || null,
    day_type:           wd.dayType || null,
    approved:           (wd.approved != null) ? !!wd.approved : null,
    approved_by:        wd.approvedBy || null,
    lunch_flagged:      (wd.lunchFlagged != null) ? !!wd.lunchFlagged : null,
    auto_stopped:       (wd.autoStopped != null) ? !!wd.autoStopped : null,  // r49: 24h runaway cap hit
    has_manual_entries: (wd.hasManualEntries != null) ? !!wd.hasManualEntries : null,
    corrected:          (wd.corrected != null) ? !!wd.corrected : null,
    corrections:        wd.corrections || null,
    events:             wd.events || null,
    // r46: field-tech work note — tech writes it on My Hours, office/manager can modify from All
    // Timesheets; once office modifies, note_locked=true locks the tech out. note_audit keeps every change.
    work_note:          (wd.workNote != null) ? wd.workNote : null,
    note_locked:        (wd.noteLocked != null) ? !!wd.noteLocked : null,
    note_audit:         wd.noteAudit || null,
    // r48: day lock for payroll integrity — soft lock (office, reversible) hardening to sealed once the
    // pay period is marked processed; payroll_unlocked records a deliberate reopen of a processed day.
    day_locked:         (wd.dayLocked != null) ? !!wd.dayLocked : null,
    payroll_unlocked:   (wd.payrollUnlocked != null) ? !!wd.payrollUnlocked : null,
    lock_audit:         wd.lockAudit || null,
    created_by:         wd.techId || (_currentUser ? _currentUser.id : null),
    updated_at:         new Date().toISOString()
  };
}

// r46: immediate single-row work-day push so a saved work note lands in the cloud right away
// (the office sees a tech's note, the tech sees an office edit) without waiting for the next sweep.
// The r36 write-gate chokepoint still suppresses this on a stale build, so no extra guard needed here.
async function _pushWorkDayToCloud(wd) {
  if (!_sb || !wd || !wd.id) return;
  try {
    var row = (typeof _workDayToRow === 'function') ? _workDayToRow(wd) : null;
    if (!row) return;
    var r = await _sb.from('app_work_days').upsert(row, {onConflict:'id'});
    if (r && r.error) console.warn('[WorkDay push]', r.error.message);
  } catch(e) { console.warn('[WorkDay push]', e.message||e); }
}

// ---- r48: DAY LOCK — payroll-integrity lock state + lock/unlock actions + the edit gate ----
// A day's pay period is "processed" once markPayrollProcessed logged it (DB.payrollLog, per tech+period).
function _isDayProcessed(techName, date){
  var log = DB.payrollLog || [];
  return log.some(function(p){ return p && p.tech===techName && date && date>=p.ppStart && date<=p.ppEnd; });
}
// Resolve the lock state for a tech/day: the workDay (if any), whether its period is processed, and
// whether it is currently LOCKED (frozen) per _dayIsLocked.
function _dayLockState(techName, date){
  var wd = (DB.workDays||[]).find(function(d){ return d.techName===techName && d.date===date; });
  var processed = _isDayProcessed(techName, date);
  var locked = (typeof _dayIsLocked==='function') ? _dayIsLocked(wd, processed)
             : !!(wd && (wd.dayLocked || wd.noteLocked) || (processed && !(wd&&wd.payrollUnlocked)));
  return { wd:wd, processed:processed, locked:locked };
}
// The single edit gate every timesheet-edit path calls. Returns a user-facing message if the day may NOT
// be edited, else null. Keeps "data stays secure" in one place.
function _dayEditBlockMsg(techName, date){
  var st = _dayLockState(techName, date);
  if (st.processed && !(st.wd && st.wd.payrollUnlocked))
    return 'That day is in a processed payroll period and is sealed. Someone with "Unlock Processed Payroll" must reopen it before it can be changed.';
  if (st.wd && st.wd.dayLocked)
    return 'That day is locked. Unlock it on the All Timesheets screen before making changes.';
  return null;
}
// Find the workDay carrying a day's data, creating/rebuilding one if the day has entries but no summary yet
// (so a lock always has a carrier). A day with no data at all gets a minimal stub.
function _findOrCreateWorkDay(techName, date){
  var wd = (DB.workDays||[]).find(function(d){ return d.techName===techName && d.date===date; });
  if (wd) return wd;
  if (typeof _rebuildDaySummary==='function') { try { _rebuildDaySummary(techName, date); } catch(e){} }
  wd = (DB.workDays||[]).find(function(d){ return d.techName===techName && d.date===date; });
  if (!wd) {
    wd = { id:'wd-'+Date.now()+'-'+Math.random().toString(36).slice(2,7), techName:techName, date:date };
    (DB.workDays = DB.workDays||[]).push(wd);
  }
  return wd;
}
function _lockActor(){
  return {
    name: _currentUser ? _currentUser.full_name : '',
    canCorrect: (typeof hasPermission==='function') ? hasPermission('time.correct') : false,
    canUnlockProcessed: (typeof hasPermission==='function') ? hasPermission('payroll.unlock') : false
  };
}
function _afterLockChange(wd){
  if (typeof saveDB==='function') saveDB();
  _pushWorkDayToCloud(wd);
  if (typeof loadTimesheets==='function') { try { loadTimesheets(); } catch(e){} }
  if (typeof renderAllTimesheetsTab==='function') { try { renderAllTimesheetsTab(); } catch(e){} }
}
function lockDay(techName, date){
  if (typeof _writesBlocked==='function' && _writesBlocked()){ showToast('A newer version is open elsewhere — reload first.','error'); return; }
  var wd = _findOrCreateWorkDay(techName, date);
  var res = _applyDayLock(wd, 'lock', _lockActor(), _isDayProcessed(techName, date));
  if (!res.ok){ showToast(res.reason==='no_perm'?'You do not have permission to lock timesheets':'Could not lock day','error'); return; }
  _afterLockChange(wd);
  showToast('Day locked for '+(techName||'')+' · '+formatDate(date),'success');
}
function unlockDay(techName, date){
  if (typeof _writesBlocked==='function' && _writesBlocked()){ showToast('A newer version is open elsewhere — reload first.','error'); return; }
  var wd = (DB.workDays||[]).find(function(d){ return d.techName===techName && d.date===date; });
  if (!wd){ showToast('Day not found','error'); return; }
  var processed = _isDayProcessed(techName, date);
  var res = _applyDayLock(wd, 'unlock', _lockActor(), processed);
  if (!res.ok){
    var msg = res.reason==='need_payroll_unlock'
      ? 'This day is in a processed payroll period. Only someone with "Unlock Processed Payroll" can reopen it.'
      : (res.reason==='no_perm' ? 'You do not have permission to unlock timesheets' : 'Could not unlock day');
    showToast(msg,'error'); return;
  }
  _afterLockChange(wd);
  showToast((processed?'Processed day reopened for ':'Day unlocked for ')+(techName||'')+' · '+formatDate(date),'success');
}
// One-click "Lock all shown" — locks every tech/day currently in the All Timesheets filter range.
function lockAllShown(){
  if (typeof hasPermission==='function' && !hasPermission('time.correct')){ showToast('You do not have permission to lock timesheets','error'); return; }
  if (typeof _writesBlocked==='function' && _writesBlocked()){ showToast('A newer version is open elsewhere — reload first.','error'); return; }
  var range = (typeof getTsDateRange==='function') ? getTsDateRange() : {};
  var from = range.from || dateStr(getWeekDates().start);
  var to   = range.to   || dateStr(getWeekDates().end);
  var filterTech = (document.getElementById('ts-tech-filter')||{}).value || '';
  // Distinct tech+date pairs from workDays and time entries in range.
  var pairs = {};
  (DB.workDays||[]).forEach(function(d){ if(d.date>=from&&d.date<=to&&(!filterTech||d.techName===filterTech)) pairs[d.techName+'|'+d.date]=1; });
  (DB.timeEntries||[]).forEach(function(e){ if(!e.deleted&&e.date>=from&&e.date<=to&&(!filterTech||e.techName===filterTech)) pairs[e.techName+'|'+e.date]=1; });
  var keys = Object.keys(pairs);
  if (!keys.length){ showToast('No days in view to lock','info'); return; }
  if (!confirm('Lock all '+keys.length+' day(s) shown ('+formatDate(from)+(from!==to?' — '+formatDate(to):'')+(filterTech?', '+filterTech:'')+')? Techs will no longer be able to edit them. You can unlock any day again.')) return;
  var actor = _lockActor(), n=0, last=null;
  keys.forEach(function(k){
    var i=k.indexOf('|'), t=k.slice(0,i), dt=k.slice(i+1);
    var wd=_findOrCreateWorkDay(t,dt);
    var r=_applyDayLock(wd,'lock',actor,_isDayProcessed(t,dt));
    if(r.ok){ n++; last=wd; }
  });
  if (typeof saveDB==='function') saveDB();
  if (typeof pushAllToCloud==='function') setTimeout(pushAllToCloud,300);
  if (typeof loadTimesheets==='function') { try { loadTimesheets(); } catch(e){} }
  if (typeof renderAllTimesheetsTab==='function') { try { renderAllTimesheetsTab(); } catch(e){} }
  showToast('Locked '+n+' day(s)','success');
}
// Badge + Lock/Unlock button for one day in the All Timesheets Detail view.
function _dayLockControlHTML(techName, date){
  var st = _dayLockState(techName, date);
  var a  = _lockActor();
  var tj = escHtml(techName);
  if (st.locked){
    var badge = st.processed
      ? '<span style="background:#fdeaea;color:#b71c1c;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700">🔒 Payroll sealed</span>'
      : '<span style="background:#eceff1;color:#455a64;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700">🔒 Locked</span>';
    var canUnlock = st.processed ? a.canUnlockProcessed : a.canCorrect;
    var btn = canUnlock
      ? '<button class="btn btn-outline btn-sm" onclick="unlockDay(\''+tj+'\',\''+date+'\')">🔓 Unlock</button>'
      : (st.processed ? '<span style="font-size:10px;color:#90a4ae">needs Unlock-Payroll perm</span>' : '');
    return '<div style="display:flex;gap:6px;align-items:center">'+badge+btn+'</div>';
  }
  return a.canCorrect
    ? '<button class="btn btn-outline btn-sm" onclick="lockDay(\''+tj+'\',\''+date+'\')">🔒 Lock</button>'
    : '';
}

// ---- r46: WORK NOTE edit modal (My Hours tech + All Timesheets office) ----
// Open the note editor for a work day. The textarea is read-only (and Save hidden) when the viewer
// isn't allowed to edit — a tech viewing a day the office already locked still sees the note.
function openWorkNoteModal(workDayId){
  var wd = (DB.workDays||[]).find(function(d){ return d.id===workDayId; });
  if (!wd) { showToast('Day not found','error'); return; }
  var myName      = _currentUser ? _currentUser.full_name : '';
  var canEditNotes= (typeof hasPermission==='function') ? hasPermission('time.editnotes') : false;
  var isOwner     = myName && wd.techName===myName;
  // r48: a locked / payroll-sealed day blocks note editing for everyone inline — unlock the day first.
  var st          = (typeof _dayLockState==='function') ? _dayLockState(wd.techName, wd.date) : {locked:!!wd.noteLocked, processed:false};
  var canEdit     = !st.locked && (canEditNotes || isOwner);

  var idEl=document.getElementById('wn-workday-id'); if(idEl) idEl.value=workDayId;
  var ta=document.getElementById('wn-text'); if(ta){ ta.value=wd.workNote||''; ta.readOnly=!canEdit; ta.style.background=canEdit?'#fff':'#f5f5f5'; }
  var titleEl=document.getElementById('wn-title'); if(titleEl) titleEl.textContent=(wd.techName||'')+' · '+formatDate(wd.date);
  var noteEl=document.getElementById('wn-lock-note');
  if (noteEl){
    if (st.locked && st.processed)         { noteEl.style.display=''; noteEl.textContent='🔒 This day is in a processed payroll period and is sealed. It must be reopened (Unlock Processed Payroll) before the note can change.'; }
    else if (st.locked && !canEditNotes)   { noteEl.style.display=''; noteEl.textContent='🔒 This day is locked. Ask the office to unlock it to change the note.'; }
    else if (st.locked)                    { noteEl.style.display=''; noteEl.textContent='🔒 This day is locked. Unlock it on All Timesheets before editing.'; }
    else { noteEl.style.display='none'; }
  }
  var saveBtn=document.getElementById('wn-save-btn'); if(saveBtn) saveBtn.style.display=canEdit?'':'none';
  openModal('modal-work-note');
}

function saveWorkNote(){
  if (typeof _writesBlocked==='function' && _writesBlocked()){
    showToast('A newer version is open on another device — reload before saving.','error'); return;
  }
  var id=(document.getElementById('wn-workday-id')||{}).value||'';
  var text=(document.getElementById('wn-text')||{}).value||'';
  var wd=(DB.workDays||[]).find(function(d){ return d.id===id; });
  if (!wd){ showToast('Day not found','error'); return; }
  // r48: a locked / payroll-sealed day can't take a note edit — unlock first.
  if (typeof _dayEditBlockMsg==='function'){ var _blkN=_dayEditBlockMsg(wd.techName, wd.date); if(_blkN){ showToast(_blkN,'error'); return; } }
  var actor={ name:(_currentUser?_currentUser.full_name:''), canEditNotes:((typeof hasPermission==='function')?hasPermission('time.editnotes'):false) };
  var res=_applyWorkNote(wd, text, actor);
  if (!res.ok){
    var msg={ locked:'This day is locked — unlock it first.',
              not_yours:'You can only edit your own work note.',
              nochange:'No change to save.', not_found:'Day not found.' }[res.reason] || 'Could not save note.';
    showToast(msg, res.reason==='nochange'?'info':'error');
    if (res.reason==='nochange') closeModal('modal-work-note');
    return;
  }
  saveDB();
  _pushWorkDayToCloud(wd);
  closeModal('modal-work-note');
  if (typeof loadTimesheets==='function') loadTimesheets();
  if (typeof renderAllTimesheetsTab==='function') { try { renderAllTimesheetsTab(); } catch(e){} }
  showToast(res.reason==='office_saved'?'Work note updated (tech is now locked out)':'Work note saved','success');
}

// Office-only: show the full change history for a day's work note.
function showWorkNoteHistory(workDayId){
  var wd=(DB.workDays||[]).find(function(d){ return d.id===workDayId; });
  if (!wd || !Array.isArray(wd.noteAudit) || !wd.noteAudit.length){ showToast('No note history','info'); return; }
  var rows=wd.noteAudit.map(function(a){
    return '<div style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px">'+
      '<div style="font-weight:700;color:#546e7a">'+escHtml(a.by||'')+' · '+(a.role==='office'?'office':'tech')+' · '+_punchTimeStr(a.at)+'</div>'+
      '<div style="color:#37474f;white-space:pre-wrap;margin-top:2px">'+escHtml(a.next||'(cleared)')+'</div>'+
    '</div>';
  }).join('');
  var histEl=document.getElementById('wn-history-body'); if(histEl) histEl.innerHTML=rows;
  var titleEl=document.getElementById('wn-history-title'); if(titleEl) titleEl.textContent='Note history — '+(wd.techName||'')+' · '+formatDate(wd.date);
  openModal('modal-work-note-history');
}

async function _pushTimeEntryToSupabase(entry) {
  if (!_sb || !_currentUser || !entry) return;
  try {
    var r = await _sb.from('time_entries').upsert(_timeEntryToRow(entry), {onConflict:'id'}).select('id');
    if (r && r.error) console.warn('[TimeEntry push]', r.error.message);
  } catch(e) { console.warn('[TimeEntry push]', e.message); }
}

// ---- REBUILD DAY SUMMARY FROM ENTRIES ----
// When entries change, recalculate the workDay record for that tech/date

function _rebuildDaySummary(techName, date) {
  if (!DB.timeEntries) return;
  var entries = DB.timeEntries.filter(function(e){
    // r43: exclude the clock-sourced day line — the clock writes its own authoritative workDay in
    // _doArriveBackActual; letting this aggregate the single clock line would clobber the travel/onsite
    // split or double-count. Keeping it out guarantees ZERO payroll movement from Phase 1.
    return e.techName===techName && e.date===date && !e.deleted && !_isClockEntry(e);
  });

  // r43: with NO non-clock entries, never touch a CLOCK-origin workDay — the clock owns its hours
  // (set directly in _doArriveBackActual). Only a workDay that was itself built from manual entries
  // gets cleared when its entries are gone. Without this, opening the clock day-line to add notes
  // (which calls this) would zero that day's payroll.
  var _existing0 = (DB.workDays||[]).find(function(d){ return d.techName===techName && d.date===date; });
  if (entries.length === 0) {
    if (_existing0 && _existing0.hasManualEntries) {
      _existing0.onsiteMins=0; _existing0.travelMins=0; _existing0.officeMins=0; _existing0.lunchMins=0;
      _existing0.ptoMins=0; _existing0.vacationMins=0; _existing0.holidayMins=0; _existing0.totalPaidMins=0;
      saveDB();
    }
    return;
  }

  var workMins   = 0, travelMins = 0, officeMins = 0;
  var lunchMins  = 0, ptoMins    = 0, vacMins    = 0, holMins = 0;
  entries.forEach(function(e) {
    var m = e.totalMins||Math.round((e.totalHours||0)*60);
    switch(e.entryType) {
      case 'work':     workMins   += m; break;
      case 'travel':   travelMins += m; break;
      case 'office':   officeMins += m; break;
      case 'lunch':    lunchMins  += m; break;
      case 'pto':      ptoMins    += m; break;
      case 'vacation': vacMins    += m; break;
      case 'holiday':  holMins    += m; break;
    }
  });

  var totalPaidMins = workMins + travelMins + officeMins + ptoMins + vacMins + holMins;

  if (!DB.workDays) DB.workDays = [];
  var existing = DB.workDays.find(function(d){ return d.techName===techName && d.date===date; });
  if (existing) {
    existing.onsiteMins    = workMins;
    existing.travelMins    = travelMins;
    existing.officeMins    = officeMins;
    existing.lunchMins     = lunchMins;
    existing.ptoMins       = ptoMins;
    existing.vacationMins  = vacMins;
    existing.holidayMins   = holMins;
    existing.totalPaidMins = totalPaidMins;
    existing.hasManualEntries = true;
  } else if (entries.length > 0) {
    DB.workDays.push({
      id:             'wd-'+techName.replace(/\s/g,'')+'-'+date,
      techName:       techName,
      date:           date,
      onsiteMins:     workMins,
      travelMins:     travelMins,
      officeMins:     officeMins,
      lunchMins:      lunchMins,
      ptoMins:        ptoMins,
      vacationMins:   vacMins,
      holidayMins:    holMins,
      totalPaidMins:  totalPaidMins,
      hasManualEntries: true
    });
  }
  saveDB();
}

// ---- DATE RANGE HELPERS ----

function getTsDateRange() {
  var from = (document.getElementById('ts-date-from')||{}).value || '';
  var to   = (document.getElementById('ts-date-to')||{}).value   || '';
  return { from: from, to: to };
}

function applyTsPreset() {
  var preset = (document.getElementById('ts-range-preset')||{}).value || 'this_week';
  var today  = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var from, to;

  if (preset === 'today') {
    from = to = dateStr(today);
  } else if (preset === 'yesterday') {
    var y = new Date(today); y.setDate(today.getDate()-1);
    from = to = dateStr(y);
  } else if (preset === 'this_week') {
    var wk = getWeekDates();
    from = dateStr(wk.start); to = dateStr(wk.end);
  } else if (preset === 'last_week') {
    var wk = getWeekDates();
    var ls = new Date(wk.start); ls.setDate(wk.start.getDate()-7);
    var le = new Date(wk.end);   le.setDate(wk.end.getDate()-7);
    from = dateStr(ls); to = dateStr(le);
  } else if (preset === 'this_period') {
    var pp = getPayPeriodDates();
    from = dateStr(pp.start); to = dateStr(pp.end);
  } else if (preset === 'last_period') {
    var pp = getPayPeriodDates();
    var ls = new Date(pp.start); ls.setDate(pp.start.getDate()-14);
    var le = new Date(pp.end);   le.setDate(pp.end.getDate()-14);
    from = dateStr(ls); to = dateStr(le);
  } else {
    // custom — don't change inputs
    return;
  }

  var fromEl = document.getElementById('ts-date-from');
  var toEl   = document.getElementById('ts-date-to');
  if (fromEl) fromEl.value = from;
  if (toEl)   toEl.value   = to;

  renderAllTimesheetsTab();
}

function onTsRangeChange() {
  // When user edits dates manually, switch preset to Custom
  var presetEl = document.getElementById('ts-range-preset');
  if (presetEl) presetEl.value = 'custom';
  renderAllTimesheetsTab();
}

// ---- ALL TIMESHEETS TAB ----

function renderAllTimesheetsTab() {
  var allEl = document.getElementById('ts-all-content');
  if (!allEl) return;
  var myRole = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager'||myRole==='back_office';
  if (!isAdmin) {
    allEl.innerHTML='<div style="color:#90a4ae;padding:20px;text-align:center">Admin access required.</div>';
    return;
  }

  var range     = getTsDateRange();
  var filterFrom = range.from || dateStr(getWeekDates().start);
  var filterTo   = range.to   || dateStr(getWeekDates().end);
  var filterTech = (document.getElementById('ts-tech-filter')||{}).value || '';
  var viewMode   = (document.getElementById('ts-view-mode')||{}).value || 'detail';

  // Set date inputs if empty
  var fromEl = document.getElementById('ts-date-from');
  var toEl   = document.getElementById('ts-date-to');
  if (fromEl && !fromEl.value) fromEl.value = filterFrom;
  if (toEl   && !toEl.value)   toEl.value   = filterTo;

  // Range label
  var labelEl = document.getElementById('ts-range-label');
  if (labelEl) {
    labelEl.textContent = formatDate(filterFrom) + (filterFrom !== filterTo ? '  —  ' + formatDate(filterTo) : '');
  }

  // Populate tech filter
  var techSel = document.getElementById('ts-tech-filter');
  if (techSel && techSel.options.length <= 1) {
    var techNames = (DB.team||[]).filter(function(m){return m.active!==false;}).map(function(m){return m.name;}).sort();
    techNames.forEach(function(n){
      var o = document.createElement('option'); o.value=n; o.textContent=n; techSel.appendChild(o);
    });
  }

  // Get all entries in range
  var entries = (DB.timeEntries||[]).filter(function(e){
    return !e.deleted &&
           e.date >= filterFrom && e.date <= filterTo &&
           (!filterTech || e.techName === filterTech);
  });

  // Also pull from workDays for legacy clock-in data
  var workDays = (DB.workDays||[]).filter(function(d){
    return d.date >= filterFrom && d.date <= filterTo &&
           (!filterTech || d.techName === filterTech);
  });

  if (viewMode === 'summary') {
    _renderAllEmployeesSummary(allEl, entries, workDays, filterFrom, filterTo, filterTech);
  } else {
    _renderDetailView(allEl, entries, workDays, filterFrom, filterTo, filterTech);
  }
}

// ---- SUMMARY VIEW — one row per employee ----

function _renderAllEmployeesSummary(el, entries, workDays, fromDate, toDate, filterTech) {
  // Build per-tech totals
  var techTotals = {};

  function ensureTech(name) {
    if (!techTotals[name]) {
      var member = (DB.team||[]).find(function(m){return m.name===name;});
      techTotals[name] = { name:name, rate:parseFloat((member&&member.rate)||0), workMins:0, travelMins:0, officeMins:0, lunchMins:0, ptoMins:0, vacMins:0, holMins:0, dayCount:0, days:new Set() };
    }
    return techTotals[name];
  }

  // From timeEntries
  entries.forEach(function(e) {
    if (_isClockEntry(e)) return;   // r43: clocked days are summed from the authoritative workDay below, not the clock line
    var t = ensureTech(e.techName);
    var m = e.totalMins || Math.round((e.totalHours||0)*60);
    t.days.add(e.date);
    switch(e.entryType) {
      case 'work':     t.workMins   += m; break;
      case 'travel':   t.travelMins += m; break;
      case 'office':   t.officeMins += m; break;
      case 'lunch':    t.lunchMins  += m; break;
      case 'pto':      t.ptoMins    += m; break;
      case 'vacation': t.vacMins    += m; break;
      case 'holiday':  t.holMins    += m; break;
    }
  });

  // Fill in from workDays for techs with no timeEntries
  workDays.forEach(function(d) {
    // r43: a clock-sourced day line does NOT count as "has entries" here — a clocked day's numbers come
    // from its workDay (correct travel/onsite split), exactly as before Phase 1. Only a real manual entry
    // suppresses the workDay fill.
    var hasEntries = entries.some(function(e){ return e.techName===d.techName && e.date===d.date && !_isClockEntry(e); });
    if (!hasEntries) {
      var t = ensureTech(d.techName);
      t.days.add(d.date);
      t.workMins   += d.onsiteMins  || 0;
      t.travelMins += d.travelMins  || 0;
      t.lunchMins  += d.lunchMins   || 0;
    }
  });

  var techList = Object.values(techTotals).sort(function(a,b){ return a.name.localeCompare(b.name); });

  if (!techList.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#90a4ae">No time data for this period.</div>';
    return;
  }

  // Totals row
  var grandWork = 0, grandTravel = 0, grandOther = 0, grandPay = 0;

  var rows = techList.map(function(t) {
    var totalWorked = t.workMins + t.travelMins + t.officeMins;
    var otMins      = Math.max(0, totalWorked - 4800); // 80hrs per period
    var regMins     = totalWorked - otMins;
    var leaveMins   = t.ptoMins + t.vacMins + t.holMins;
    var totalPay    = t.rate ? (regMins/60*t.rate + otMins/60*t.rate*1.5 + leaveMins/60*t.rate) : null;
    grandWork   += t.workMins;
    grandTravel += t.travelMins;
    grandOther  += leaveMins;
    grandPay    += totalPay||0;
    return '<tr style="border-bottom:1px solid #f0f4f8">'+
      '<td style="padding:10px 12px;font-weight:700">'+escHtml(t.name)+'</td>'+
      '<td style="padding:10px 12px;text-align:center">'+t.days.size+'</td>'+
      '<td style="padding:10px 12px;text-align:center;font-weight:700;color:#1565c0">'+fmtMins(totalWorked)+'</td>'+
      '<td style="padding:10px 12px;text-align:center">'+fmtMins(t.workMins)+'</td>'+
      '<td style="padding:10px 12px;text-align:center;color:#e65100">'+fmtMins(t.travelMins)+'</td>'+
      '<td style="padding:10px 12px;text-align:center;color:'+(otMins>0?'#c62828':'#90a4ae')+'">'+fmtMins(otMins)+'</td>'+
      '<td style="padding:10px 12px;text-align:center;color:#2e7d32">'+fmtMins(leaveMins)+'</td>'+
      (totalPay!==null?'<td style="padding:10px 12px;text-align:right;font-weight:700;color:#2e7d32">$'+totalPay.toFixed(2)+'</td>':'<td style="padding:10px 12px;text-align:right;color:#90a4ae">—</td>')+
      '<td style="padding:10px 12px"><button class="btn btn-primary btn-sm" onclick="filterTsToTech(\''+escHtml(t.name)+'\')">Open / Edit ›</button></td>'+
    '</tr>';
  }).join('');

  el.innerHTML =
    // r47: the Summary is a view-only payroll roll-up — editing (time corrections + work notes) lives in
    // Detail. Say so plainly and make the way in obvious, so it never reads as "I can't edit this".
    '<div style="background:#eef4fb;border:1px solid #d6e4f5;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#3a5a7a">'+
      'ℹ This is a view-only roll-up. To edit a person’s hours or add/change their work note, use <strong>Open / Edit</strong> on their row (or switch the view to <strong>Detail</strong>).'+
    '</div>'+
    '<div style="overflow-x:auto">'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Employee</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Days</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase">Total Worked</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">On Site</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#e65100;text-transform:uppercase">Travel</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#c62828;text-transform:uppercase">Overtime</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#2e7d32;text-transform:uppercase">Leave/Hol</th>'+
      '<th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#2e7d32;text-transform:uppercase">Est. Pay</th>'+
      '<th style="padding:8px 12px;width:70px"></th>'+
    '</tr></thead>'+
    '<tbody>'+rows+'</tbody>'+
    '<tfoot><tr style="background:#1565c0;color:#fff">'+
      '<td style="padding:10px 12px;font-weight:700" colspan="2">TOTALS</td>'+
      '<td style="padding:10px 12px;text-align:center;font-weight:700">'+fmtMins(grandWork+grandTravel)+'</td>'+
      '<td style="padding:10px 12px;text-align:center;font-weight:700">'+fmtMins(grandWork)+'</td>'+
      '<td style="padding:10px 12px;text-align:center;font-weight:700">'+fmtMins(grandTravel)+'</td>'+
      '<td colspan="2" style="padding:10px 12px;text-align:center;font-weight:700">'+fmtMins(grandOther)+' leave</td>'+
      '<td style="padding:10px 12px;text-align:right;font-weight:700">$'+grandPay.toFixed(2)+'</td>'+
      '<td></td>'+
    '</tr></tfoot>'+
    '</table></div>';
}

function filterTsToTech(techName) {
  var techSel = document.getElementById('ts-tech-filter');
  var modeSel = document.getElementById('ts-view-mode');
  if (techSel) techSel.value = techName;
  if (modeSel) modeSel.value = 'detail';
  renderAllTimesheetsTab();
}

// ---- DETAIL VIEW — entries grouped by date then tech ----

function _renderDetailView(el, entries, workDays, fromDate, toDate, filterTech) {
  var typeColors = { work:'#e3f2fd', travel:'#fff3e0', office:'#f3e5f5', lunch:'#f5f5f5', pto:'#e8f5e9', vacation:'#e8f5e9', holiday:'#e8f5e9' };
  var typeLabels = { work:'Work', travel:'Travel', office:'Office', lunch:'Lunch (unpaid)', pto:'PTO', vacation:'Vacation', holiday:'Holiday' };

  // Group entries by date
  var byDate = {};
  entries.forEach(function(e) {
    if (!byDate[e.date]) byDate[e.date] = {};
    if (!byDate[e.date][e.techName]) byDate[e.date][e.techName] = [];
    byDate[e.date][e.techName].push(e);
  });

  // Add workDay dates that have no entries
  workDays.forEach(function(d) {
    if (!byDate[d.date]) byDate[d.date] = {};
    if (!byDate[d.date][d.techName]) byDate[d.date][d.techName] = [];
  });

  var dates = Object.keys(byDate).sort();

  if (!dates.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#90a4ae">No time entries for this range'+(filterTech?' — '+filterTech:'')+'.</div>';
    return;
  }

  var html = dates.map(function(date) {
    var dayLabel = new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});
    var techsOnDay = Object.keys(byDate[date]).sort();

    var techBlocks = techsOnDay.map(function(techName) {
      var techEntries = byDate[date][techName];
      var workDay = workDays.find(function(d){ return d.techName===techName && d.date===date; });
      var totalMins = techEntries.reduce(function(s,e){ return s+(e.entryType!=='lunch'?(e.totalMins||Math.round((e.totalHours||0)*60)):0); },0);
      if (!totalMins && workDay) totalMins = workDay.totalPaidMins||0;
      // r48: lock state drives what's editable in this block.
      var _lk = (typeof _dayLockState==='function') ? _dayLockState(techName, date) : {locked:false, processed:false};
      var _lockCtl = (typeof _dayLockControlHTML==='function') ? _dayLockControlHTML(techName, date) : '';
      // r49: flag an auto-stopped (24h cap) or unusually long day for the office to eyeball.
      var _flag = '';
      if (workDay && workDay.autoStopped) _flag = '<span style="background:#fdecea;color:#b71c1c;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700" title="Clock ran past 24h and was auto-stopped — review">⚠ Auto-stopped 24h</span>';
      else if (workDay && (workDay.totalPaidMins||0) > 16*60) _flag = '<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700" title="Unusually long day — review">⚠ Long day</span>';

      return '<div style="background:#fff;border:1px solid '+(_lk.locked?'#e6c9c9':(_flag?'#f0d9b5':'#e0e7ef'))+';border-radius:8px;padding:9px 11px;margin-bottom:5px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="font-weight:700;font-size:13px">'+escHtml(techName)+' '+_flag+'</span>'+
          '<div style="display:flex;gap:8px;align-items:center">'+
            '<span style="font-weight:700;color:#1565c0">'+fmtMins(totalMins)+'</span>'+
            _lockCtl+
            (_lk.locked ? '' : '<button class="btn btn-primary btn-sm" onclick="openAddTimeEntry(\''+escHtml(techName)+'\',\''+date+'\')">+ Entry</button>')+
          '</div>'+
        '</div>'+
        (techEntries.length ?
          techEntries.sort(function(a,b){ return (a.startTime||'').localeCompare(b.startTime||''); }).map(function(e){
            var m = e.totalMins || Math.round((e.totalHours||0)*60);
            return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:'+(typeColors[e.entryType]||'#f8f9fa')+';border-radius:6px;margin-bottom:3px;font-size:12px">'+
              '<span style="min-width:90px;font-weight:600;color:#546e7a">'+(e.startTime&&e.endTime?e.startTime+' — '+e.endTime:'')+'</span>'+
              '<span style="font-weight:700;min-width:60px">'+(typeLabels[e.entryType]||e.entryType)+'</span>'+
              (e.woLabel&&e.woLabel!=='Office / General'?'<span style="color:#546e7a;flex:1">'+escHtml(e.woLabel)+'</span>':'<span style="flex:1"></span>')+
              (e.notes?'<span style="color:#90a4ae;font-style:italic;flex:2">'+escHtml(e.notes)+'</span>':'<span style="flex:2"></span>')+
              '<span style="font-weight:700;min-width:45px;text-align:right">'+fmtMins(m)+'</span>'+
              (_lk.locked ? '' : '<button onclick="openEditTimeEntry(\''+e.id+'\')" style="background:none;border:1px solid #e0e7ef;border-radius:4px;padding:1px 6px;font-size:11px;cursor:pointer;color:#546e7a">✏</button>')+
            '</div>';
          }).join('') :
          (workDay ?
            '<div style="font-size:12px;color:#90a4ae;padding:4px 0">Legacy clock-in record — '+fmtMins(workDay.totalPaidMins||0)+' total.'+(_lk.locked?'':' <span style="color:#1565c0;cursor:pointer" onclick="openAddTimeEntry(\''+escHtml(techName)+'\',\''+date+'\')">Add detail entries</span>')+'</div>' :
            '<div style="font-size:12px;color:#90a4ae;padding:4px 0">No entries</div>'
          )
        )+
        // r45: office can see the tech's actual clock punches (in/out, travel, break, lunch) for the day.
        (typeof _punchDetailsHTML==='function' ? _punchDetailsHTML(workDay) : '')+
        // r46: the tech's work note — office/manager can edit it here (which locks the tech out).
        (typeof _workNoteHTML==='function' ? _workNoteHTML(workDay) : '')+
      '</div>';
    }).join('');

    // r49: the day-group total must match the per-tech lines — include a tech's clocked workDay hours when
    // they have no manual entries (before, this summed only entries, so a clock-only day read "0 total"
    // while the tech's line showed the real hours).
    var dayTotal = techsOnDay.reduce(function(s, tn){
      var te = byDate[date][tn] || [];
      var tm = te.reduce(function(a,e){ return a+(e.entryType!=='lunch'?(e.totalMins||Math.round((e.totalHours||0)*60)):0); },0);
      if (!tm){ var wdx=workDays.find(function(d){ return d.techName===tn && d.date===date; }); if(wdx) tm=wdx.totalPaidMins||0; }
      return s+tm;
    }, 0);

    return '<div style="margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;background:#f0f4f8;padding:6px 12px;border-radius:7px;margin-bottom:5px">'+
        '<span style="font-weight:700;color:#1565c0;font-size:13px">'+escHtml(dayLabel)+'</span>'+
        '<span style="font-size:12px;font-weight:700;color:#546e7a">'+techsOnDay.length+' employee'+(techsOnDay.length!==1?'s':'')+' · '+fmtMins(dayTotal)+' total</span>'+
      '</div>'+
      techBlocks+
    '</div>';
  }).join('');

  // r48: one-click "Lock all shown" for the office — locks every day in the current filter range.
  var lockAllBar = (typeof hasPermission!=='function' || hasPermission('time.correct'))
    ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'+
        '<button class="btn btn-outline btn-sm" onclick="lockAllShown()">🔒 Lock all shown</button>'+
      '</div>'
    : '';
  el.innerHTML = lockAllBar + html;
}
// ---- ADD ENTRY BUTTON on the All Timesheets tab ----
// Add "+ Add Entry for Any Tech" button at top of tab
function initAllTimesheetsTab() {
  var container = document.getElementById('ts-all-content');
  if (!container) return;
  var isAdmin = _currentUser && (_currentUser.role==='owner'||_currentUser.role==='back_office'||_currentUser.role==='manager');
  if (!isAdmin) return;
}

// ============================================================
// SMART LOCATION MONITORING
// Detects arrivals at job sites and return to base
// Triggers field log prompts at the right moment
// Battery-conscious: polls on intervals, not continuous streaming
// ============================================================

var _locMonitor = {
  interval:       null,
  active:         false,
  lastLat:        null,
  lastLng:        null,
  arrivalShown:   false,
  departureShown: false,
  baseReturnShown:false,
  consecutiveNear:0,     // how many consecutive checks within radius (avoid false positives)
  consecutiveFar: 0,     // how many consecutive checks outside radius
};

var LOC_POLL_TRAVEL_MS  = 3 * 60 * 1000;  // check every 3 min while traveling
var LOC_POLL_ONSITE_MS  = 4 * 60 * 1000;  // check every 4 min while on site
var LOC_POLL_RETURN_MS  = 3 * 60 * 1000;  // check every 3 min while returning
var LOC_ARRIVE_CONFIRM  = 2;  // need 2 consecutive "near" readings to confirm arrival
var LOC_DEPART_CONFIRM  = 2;  // need 2 consecutive "far" readings to confirm departure
var LOC_BASE_RADIUS_FT  = 800; // slightly larger radius for base detection

// ── Start monitoring ──────────────────────────────────────────────────────────
function startLocationMonitoring() {
  if (!navigator.geolocation) return;
  if (!(DB.settings && DB.settings.autoDetectArrivals !== false)) return; // off by default until opted in

  stopLocationMonitoring();
  _locMonitor.active = true;
  _locMonitor.arrivalShown = false;
  _locMonitor.departureShown = false;
  _locMonitor.consecutiveNear = 0;
  _locMonitor.consecutiveFar = 0;

  var pollMs = _clockState.status === 'traveling'  ? LOC_POLL_TRAVEL_MS
             : _clockState.status === 'onsite'     ? LOC_POLL_ONSITE_MS
             : _clockState.status === 'returning'  ? LOC_POLL_RETURN_MS
             : LOC_POLL_TRAVEL_MS;

  _locMonitor.interval = setInterval(function() {
    if (_clockState.status === 'out') { stopLocationMonitoring(); return; }
    _runLocationCheck();
  }, pollMs);

  // Run immediately once
  setTimeout(_runLocationCheck, 5000);
}

function stopLocationMonitoring() {
  if (_locMonitor.interval) {
    clearInterval(_locMonitor.interval);
    _locMonitor.interval = null;
  }
  _locMonitor.active = false;
}

function _runLocationCheck() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      var acc = pos.coords.accuracy;
      _locMonitor.lastLat = lat;
      _locMonitor.lastLng = lng;

      // Update stored GPS position
      _clockState.gpsLat = lat;
      _clockState.gpsLng = lng;
      _clockState.gpsAccuracy = acc;

      var status = _clockState.status;

      if (status === 'traveling') {
        _checkJobArrival(lat, lng);
      } else if (status === 'onsite') {
        _checkJobDeparture(lat, lng);
      } else if (status === 'returning') {
        _checkBaseReturn(lat, lng);
      }
    },
    function(err) { /* silent fail on GPS error */ },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
  );
}

// ── Check if arriving at job site ────────────────────────────────────────────
function _checkJobArrival(lat, lng) {
  if (_locMonitor.arrivalShown) return;
  if (!_clockState.jobId) return;

  var job = typeof _findJobOrWO==='function'?_findJobOrWO(_clockState.jobId):(DB.jobs||[]).find(function(j){return j.id===_clockState.jobId;});
  if (!job) return;

  // Auto-set anchor if not set
  if (!job.gpsAnchor) {
    // First visit — we don't have an anchor yet
    // Check if WO has a site address we could geocode — for now skip
    return;
  }

  var dist = geoDistanceFt(lat, lng, job.gpsAnchor.lat, job.gpsAnchor.lng);

  if (dist <= GEO_RADIUS_FT) {
    _locMonitor.consecutiveNear++;
    _locMonitor.consecutiveFar = 0;
    if (_locMonitor.consecutiveNear >= LOC_ARRIVE_CONFIRM && !_locMonitor.arrivalShown) {
      _locMonitor.arrivalShown = true;
      _showArrivalPrompt(job, dist);
    }
  } else {
    _locMonitor.consecutiveNear = 0;
    _locMonitor.consecutiveFar++;
  }
}

// ── Check if departing job site ───────────────────────────────────────────────
function _checkJobDeparture(lat, lng) {
  if (_locMonitor.departureShown) return;
  if (!_clockState.jobId) return;

  var job = typeof _findJobOrWO==='function'?_findJobOrWO(_clockState.jobId):(DB.jobs||[]).find(function(j){return j.id===_clockState.jobId;});
  if (!job || !job.gpsAnchor) return;

  var dist = geoDistanceFt(lat, lng, job.gpsAnchor.lat, job.gpsAnchor.lng);
  var departureRadius = GEO_RADIUS_FT * 1.8; // slightly wider — allow some movement

  if (dist > departureRadius) {
    _locMonitor.consecutiveFar++;
    _locMonitor.consecutiveNear = 0;
    if (_locMonitor.consecutiveFar >= LOC_DEPART_CONFIRM && !_locMonitor.departureShown) {
      _locMonitor.departureShown = true;
      _showDeparturePrompt(job);
    }
  } else {
    _locMonitor.consecutiveFar = 0;
    _locMonitor.consecutiveNear++;
  }
}

// ── Check if back at base ─────────────────────────────────────────────────────
function _checkBaseReturn(lat, lng) {
  if (_locMonitor.baseReturnShown) return;

  var officeAnchor = DB.settings && DB.settings.officeGpsLat
    ? { lat: DB.settings.officeGpsLat, lng: DB.settings.officeGpsLng } : null;

  // If out of town, check hotel instead
  if (_clockState.outOfTown && _clockState.hotelGpsLat) {
    officeAnchor = { lat: _clockState.hotelGpsLat, lng: _clockState.hotelGpsLng };
  }

  if (!officeAnchor) return;

  var dist = geoDistanceFt(lat, lng, officeAnchor.lat, officeAnchor.lng);

  if (dist <= LOC_BASE_RADIUS_FT) {
    _locMonitor.consecutiveNear++;
    if (_locMonitor.consecutiveNear >= LOC_ARRIVE_CONFIRM && !_locMonitor.baseReturnShown) {
      _locMonitor.baseReturnShown = true;
      _showBaseReturnNudge();
    }
  } else {
    _locMonitor.consecutiveNear = 0;
  }
}

// ── Arrival prompt ────────────────────────────────────────────────────────────
function _showArrivalPrompt(job, distFt) {
  // Don't show if already on site
  if (_clockState.status === 'onsite') return;

  var distStr = distFt < 100 ? 'You\'re right on site' : 'About '+Math.round(distFt)+' ft away';

  showLocNotification(
    '📍 Arrived at Job Site?',
    escHtml(job.name||'Job Site') + '<br><span style="font-size:12px;color:#546e7a">' + distStr + '</span>',
    'Yes — I\'m Here',
    'Not Yet',
    function(confirmed) {
      if (confirmed && typeof doArriveOnSite === 'function') {
        doArriveOnSite();
      }
    }
  );
}

// ── Departure prompt ──────────────────────────────────────────────────────────
function _showDeparturePrompt(job) {
  // Find the WO linked to this job
  var wo = null;
  if (_clockState.jobId) {
    wo = (DB.workOrders||[]).find(function(w){
      return w.jobId === _clockState.jobId ||
             w.id === _clockState.jobId;
    });
  }

  var woId = wo ? wo.id : null;

  showLocNotification(
    '🚗 Left the Job Site?',
    'Looks like you\'ve left <strong>' + escHtml(job.name||'the job site') + '</strong>.<br>' +
    '<span style="font-size:12px;color:#546e7a">Log your work while it\'s fresh — takes 2 minutes.</span>',
    '📝 Log Now',
    'I\'m Still Here',
    function(confirmed) {
      if (confirmed) {
        if (woId) {
          // Go directly to WO field log
          goPage('workorders');
          setTimeout(function(){
            if (typeof openWorkOrder === 'function') {
              openWorkOrder(woId);
              setTimeout(function(){
                switchWOTab('fieldlog');
                setTimeout(function(){ openFieldLogEntry(woId); }, 300);
              }, 500);
            }
          }, 300);
        } else {
          // No WO linked — just leave the site
          if (typeof doLeaveOnSite === 'function') doLeaveOnSite();
        }
      } else {
        // Tech says still there — reset departure counter
        _locMonitor.consecutiveFar = 0;
        _locMonitor.departureShown = false;
      }
    }
  );
}

// ── Return-to-base nudge ──────────────────────────────────────────────────────
function _showBaseReturnNudge() {
  // Find any open field log entries for today
  var today = getTodayISO ? getTodayISO() : getTodayISO();
  var myName = _currentUser ? _currentUser.full_name : '';

  var todayLabor = (DB.woLabor||[]).filter(function(l){
    return l.techName === myName && (l.clockIn||'').startsWith(today);
  });
  var workedWoIds = [...new Set(todayLabor.map(function(l){ return l.woId; }))];
  var missing = workedWoIds.filter(function(id){
    var logs = _woFieldLogs ? (_woFieldLogs[id]||[]) : [];
    return !logs.some(function(l){ return l.log_date===today && l.tech_name===myName; });
  });

  if (!missing.length) {
    // All logs done — just show a nice confirmation
    showToast('✅ You\'re back at base — all field logs are complete. Great work!', 'success', 5000);
    return;
  }

  showLocNotification(
    '🏠 Welcome Back to Base',
    'You\'re back! You have <strong>' + missing.length + ' work order' +
    (missing.length > 1 ? 's' : '') + '</strong> that still need field notes.<br>' +
    '<span style="font-size:12px;color:#546e7a">Log them now while the details are fresh.</span>',
    '📝 Log Now',
    'I\'ll Do It Later',
    function(confirmed) {
      if (confirmed && typeof checkFieldLogBeforeClockOut === 'function') {
        checkFieldLogBeforeClockOut(function(){});
      }
    }
  );
}

// ── Reusable location notification banner ─────────────────────────────────────
var _locNotifCallback = null;

function showLocNotification(title, body, confirmLabel, dismissLabel, callback) {
  var existing = document.getElementById('loc-notif-banner');
  if (existing) existing.remove();

  _locNotifCallback = callback;

  var el = document.createElement('div');
  el.id = 'loc-notif-banner';
  el.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:99990;' +
    'background:#1565c0;color:#fff;padding:14px 16px;' +
    'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
    'box-shadow:0 4px 20px rgba(0,0,0,.3);flex-wrap:wrap';

  el.innerHTML =
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:14px;font-weight:800;margin-bottom:2px">' + title + '</div>' +
      '<div style="font-size:13px;opacity:.9;line-height:1.4">' + body + '</div>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-shrink:0">' +
      '<button id="loc-notif-confirm" ' +
        'style="padding:8px 16px;background:#fff;color:#1565c0;border:none;border-radius:8px;font-size:13px;font-weight:800;cursor:pointer">' +
        confirmLabel + '</button>' +
      '<button id="loc-notif-dismiss" ' +
        'style="padding:8px 12px;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;font-size:12px;cursor:pointer">' +
        dismissLabel + '</button>' +
    '</div>';

  document.body.appendChild(el);

  // Wire buttons
  el.querySelector('#loc-notif-confirm').addEventListener('click', function() {
    el.remove();
    if (_locNotifCallback) { var cb = _locNotifCallback; _locNotifCallback = null; cb(true); }
  });
  el.querySelector('#loc-notif-dismiss').addEventListener('click', function() {
    el.remove();
    if (_locNotifCallback) { var cb = _locNotifCallback; _locNotifCallback = null; cb(false); }
  });

  // Auto-dismiss after 45 seconds
  setTimeout(function() {
    var banner = document.getElementById('loc-notif-banner');
    if (banner) {
      banner.remove();
      if (_locNotifCallback) { _locNotifCallback = null; }
    }
  }, 45000);

  // Also try browser notification if permission granted
  _tryBrowserNotification(title, body.replace(/<[^>]+>/g, ''));
}

function _tryBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body:  body,
        icon:  '/favicon.ico',
        badge: '/favicon.ico',
        tag:   'probid-location',
        renotify: true
      });
    } catch(e) { /* silent */ }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// ── Hook into clock state changes ────────────────────────────────────────────
// Call this whenever _clockState.status changes
function onClockStateChange(newStatus) {
  switch(newStatus) {
    case 'traveling':
      _locMonitor.arrivalShown = false;
      _locMonitor.consecutiveNear = 0;
      _locMonitor.consecutiveFar = 0;
      startLocationMonitoring();
      break;
    case 'onsite':
      _locMonitor.departureShown = false;
      _locMonitor.consecutiveFar = 0;
      _locMonitor.consecutiveNear = 0;
      startLocationMonitoring();
      break;
    case 'returning':
      _locMonitor.baseReturnShown = false;
      _locMonitor.consecutiveNear = 0;
      startLocationMonitoring();
      break;
    case 'out':
      stopLocationMonitoring();
      break;
  }
}

// ── Settings toggle ───────────────────────────────────────────────────────────
function toggleAutoDetectArrivals() {
  var cb = document.getElementById('s-auto-arrivals');
  if (!DB.settings) DB.settings = {};
  DB.settings.autoDetectArrivals = cb ? cb.checked : !DB.settings.autoDetectArrivals;
  saveDB();
  showToast(
    DB.settings.autoDetectArrivals
      ? '✅ Auto arrival detection ON — app will prompt when you arrive at job sites'
      : 'Auto arrival detection OFF',
    'info', 3000
  );
}

