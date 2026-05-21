// ============================================================
// TCSS ProBid V9 — Calendar, Comms Log, Photo Log, Payments
// ============================================================

// ---- CALENDAR ----
var _calYear  = new Date().getFullYear();
var _calMonth = new Date().getMonth(); // 0-indexed
var _calDragJobId = null;

function calGoToday() {
  _calYear  = new Date().getFullYear();
  _calMonth = new Date().getMonth();
  renderCalendar();
}

function calNav(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  renderCalendar();
}

function renderCalendar() {
  var grid = document.getElementById('cal-grid');
  var label = document.getElementById('cal-month-label');
  if (!grid) return;

  var showJobs     = (document.getElementById('cal-show-jobs')||{}).checked !== false;
  var showFollowups= (document.getElementById('cal-show-followups')||{}).checked !== false;

  var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (label) label.textContent = monthNames[_calMonth] + ' ' + _calYear;

  var firstDay  = new Date(_calYear, _calMonth, 1).getDay(); // 0=Sun
  var daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  var today = new Date(); today.setHours(0,0,0,0);
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

  // Build event map by date string
  var events = {};
  function addEvent(dateStr, item) {
    if (!dateStr) return;
    if (!events[dateStr]) events[dateStr] = [];
    events[dateStr].push(item);
  }

  if (showJobs) {
    (DB.jobs||[]).forEach(function(j) {
      if (j.scheduledDate) addEvent(j.scheduledDate, { type:'job', id:j.id, label:j.name||'Job', customer:j.customer||'', status:j.status||'' });
    });
  }
  if (showFollowups) {
    (DB.quotes||[]).forEach(function(q) {
      if (q.followupDate) addEvent(q.followupDate, { type:'followup', id:q.id, label:(q.num||'')+(q.cn?' — '+q.cn:''), status:q.status||'' });
    });
  }

  // Day headers
  var headerHtml = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){
    return '<div style="background:#1565c0;color:#fff;padding:8px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.5px">'+d+'</div>';
  }).join('');

  // Empty cells before first day
  var cells = headerHtml;
  for (var i = 0; i < firstDay; i++) {
    cells += '<div style="background:#fff;min-height:90px;padding:6px;opacity:.3"></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = _calYear + '-' + String(_calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var isToday = dateStr === todayStr;
    var dayEvents = events[dateStr] || [];
    var isWeekend = (new Date(_calYear, _calMonth, d).getDay() === 0 || new Date(_calYear, _calMonth, d).getDay() === 6);

    var evHtml = dayEvents.map(function(ev) {
      if (ev.type === 'job') {
        return '<div class="cal-event cal-job" draggable="true" ' +
          'ondragstart="calDragStart(event,\''+ev.id+'\')" ' +
          'onclick="openDispatchDetail(\''+ev.id+'\');goPage(\'dispatch\')" ' +
          'title="'+escHtml(ev.customer)+'" ' +
          'style="background:#1565c0;color:#fff;border-radius:4px;padding:2px 5px;font-size:10px;font-weight:600;margin-bottom:2px;cursor:grab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+
          '🔧 '+escHtml(ev.label.substring(0,22))+
          '</div>';
      } else {
        return '<div class="cal-event cal-followup" ' +
          'onclick="editQuote(\''+ev.id+'\');goPage(\'qq\')" ' +
          'title="Follow-up: '+escHtml(ev.label)+'" ' +
          'style="background:#e65100;color:#fff;border-radius:4px;padding:2px 5px;font-size:10px;font-weight:600;margin-bottom:2px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+
          '📋 '+escHtml(ev.label.substring(0,22))+
          '</div>';
      }
    }).join('');

    cells += '<div ' +
      'ondragover="event.preventDefault()" ' +
      'ondrop="calDrop(event,\''+dateStr+'\')" ' +
      'style="background:'+(isToday?'#e3f2fd':isWeekend?'#fafafa':'#fff')+';min-height:90px;padding:6px;border:'+(isToday?'2px solid #1565c0':'1px solid transparent')+';transition:background .15s" ' +
      'onmouseover="this.style.background=\'#f0f7ff\'" ' +
      'onmouseout="this.style.background=\''+(isToday?'#e3f2fd':isWeekend?'#fafafa':'#fff')+'\'">'+
      '<div style="font-size:12px;font-weight:'+(isToday?'900':'600')+';color:'+(isToday?'#1565c0':'#546e7a')+';margin-bottom:4px">'+d+'</div>'+
      evHtml+
    '</div>';
  }

  // Fill remaining cells
  var totalCells = firstDay + daysInMonth;
  var remainder  = totalCells % 7;
  if (remainder > 0) {
    for (var r = 0; r < (7 - remainder); r++) {
      cells += '<div style="background:#fff;min-height:90px;padding:6px;opacity:.3"></div>';
    }
  }

  grid.innerHTML = cells;
}

function calDragStart(event, jobId) {
  _calDragJobId = jobId;
  event.dataTransfer.setData('text/plain', jobId);
  event.target.style.opacity = '0.5';
}

function calDrop(event, dateStr) {
  event.preventDefault();
  var jobId = _calDragJobId || event.dataTransfer.getData('text/plain');
  if (!jobId || !dateStr) return;
  var job = (DB.jobs||[]).find(function(j){ return j.id === jobId; });
  if (!job) return;
  if (!confirm('Reschedule "' + (job.name||'this job') + '" to ' + dateStr + '?')) return;
  job.scheduledDate = dateStr;
  job.scheduledStart = dateStr;
  saveDB();
  renderCalendar();
  showToast((job.name||'Job') + ' rescheduled to ' + dateStr, 'success');
  _calDragJobId = null;
}

// ---- COMMS LOG ----
function openCommsModal(customerId, jobId) {
  var cidEl = document.getElementById('cl-customer-id');
  var jidEl = document.getElementById('cl-job-id');
  var notesEl = document.getElementById('cl-notes');
  var subjectEl = document.getElementById('cl-subject');
  var followupEl = document.getElementById('cl-followup');
  if (cidEl) cidEl.value = customerId || '';
  if (jidEl) jidEl.value = jobId || '';
  if (notesEl) notesEl.value = '';
  if (subjectEl) subjectEl.value = '';
  if (followupEl) followupEl.value = '';
  var typeEl = document.getElementById('cl-type');
  if (typeEl) typeEl.value = 'call';
  var dirEl = document.getElementById('cl-direction');
  if (dirEl) dirEl.value = 'outbound';
  openModal('modal-comms-log');
}

function saveCommsEntry() {
  var notes = (document.getElementById('cl-notes')||{}).value || '';
  if (!notes.trim()) { showToast('Notes are required','error'); return; }
  if (!DB.commsLog) DB.commsLog = [];
  var entry = {
    id:          'cl-' + Date.now(),
    customerId:  (document.getElementById('cl-customer-id')||{}).value || null,
    jobId:       (document.getElementById('cl-job-id')||{}).value || null,
    type:        (document.getElementById('cl-type')||{}).value || 'note',
    direction:   (document.getElementById('cl-direction')||{}).value || 'outbound',
    subject:     (document.getElementById('cl-subject')||{}).value || '',
    notes:       notes,
    followUpDate:(document.getElementById('cl-followup')||{}).value || null,
    loggedBy:    (_currentUser && _currentUser.id) || null,
    loggerName:  (_currentUser && _currentUser.full_name) || 'Unknown',
    createdAt:   new Date().toISOString()
  };
  DB.commsLog.push(entry);
  // Push to Supabase
  if (_sb && _currentUser) {
    _sb.from('comms_log').insert({
      id:            entry.id,
      customer_id:   entry.customerId || null,
      job_id:        entry.jobId || null,
      logged_by:     entry.loggedBy,
      logger_name:   entry.loggerName,
      comm_type:     entry.type,
      direction:     entry.direction,
      subject:       entry.subject || null,
      notes:         entry.notes,
      follow_up_date:entry.followUpDate || null
    }).then(function(r){ if (r.error) console.warn('[Comms] Push error:', r.error.message); });
  }
  saveDB();
  closeModal('modal-comms-log');
  showToast('Communication logged ✓', 'success');
  // Refresh comms tab if open
  if (typeof switchCPTab === 'function' && document.getElementById('cpt-comms') && document.getElementById('cpt-comms').classList.contains('active')) {
    switchCPTab('comms');
  }
  // Refresh job detail comms if open
  if (entry.jobId) renderJobCommsSection(entry.jobId);
}

function renderCommsLog(customerId, jobId) {
  if (!DB.commsLog) DB.commsLog = [];
  var entries = DB.commsLog.filter(function(e) {
    if (customerId && jobId) return e.customerId === customerId || e.jobId === jobId;
    if (customerId) return e.customerId === customerId;
    if (jobId) return e.jobId === jobId;
    return false;
  }).sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });

  var typeIcons = { call:'📞', email:'✉️', text:'💬', meeting:'🤝', note:'📝', voicemail:'📳' };

  if (!entries.length) {
    return '<div style="text-align:center;padding:24px;color:#90a4ae;font-size:13px">No communications logged yet.<br><br>' +
      '<button class="btn btn-outline btn-sm" onclick="openCommsModal(\''+(customerId||'')+'\',\''+(jobId||'')+'\')">' +
      '+ Log First Communication</button></div>';
  }

  var addBtn = customerId ?
    '<button class="btn btn-outline btn-sm" onclick="openCommsModal(\''+customerId+'\',\'\')">+ Log Communication</button>' :
    '<button class="btn btn-outline btn-sm" onclick="openCommsModal(\'\',\''+jobId+'\')">+ Log Communication</button>';

  var html = '<div style="margin-bottom:12px">'+addBtn+'</div>';

  entries.forEach(function(e) {
    var icon = typeIcons[e.type] || '📝';
    var date = e.createdAt ? new Date(e.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    html += '<div style="border:1px solid #e0e7ef;border-radius:10px;padding:12px 16px;margin-bottom:8px;background:#fff">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:16px">'+icon+'</span>'+
          '<span style="font-weight:700;font-size:13px;color:#1a2332">'+escHtml(e.subject||e.type)+'</span>'+
          '<span style="font-size:10px;background:#f0f4f8;color:#546e7a;padding:2px 8px;border-radius:10px;text-transform:uppercase">'+escHtml(e.direction)+'</span>'+
        '</div>'+
        '<div style="font-size:11px;color:#90a4ae">'+escHtml(date)+'</div>'+
      '</div>'+
      '<div style="font-size:13px;color:#37474f;line-height:1.5">'+escHtml(e.notes)+'</div>'+
      (e.followUpDate?'<div style="margin-top:6px;font-size:11px;color:#e65100;font-weight:600">📅 Follow-up: '+escHtml(e.followUpDate)+'</div>':'')+
      '<div style="margin-top:4px;font-size:10px;color:#b0bec5">Logged by '+escHtml(e.loggerName||'Unknown')+'</div>'+
    '</div>';
  });

  return html;
}

function renderJobCommsSection(jobId) {
  var el = document.getElementById('job-comms-section-'+jobId);
  if (el) el.innerHTML = renderCommsLog(null, jobId);
}

// ---- PHOTO LOG ----
function openPhotoUpload(jobId) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = function() {
    if (!input.files || !input.files.length) return;
    var caption = prompt('Add a caption for these photos (optional):') || '';
    Array.from(input.files).forEach(function(file) {
      uploadJobPhoto(jobId, file, caption);
    });
  };
  input.click();
}

async function uploadJobPhoto(jobId, file, caption) {
  if (!_sb || !_currentUser) { showToast('Must be logged in to upload photos','error'); return; }
  var ext = file.name.split('.').pop();
  var path = jobId + '/' + Date.now() + '-' + Math.random().toString(36).slice(2,7) + '.' + ext;
  showToast('Uploading ' + file.name + '...', 'info', 3000);
  try {
    var { data: uploadData, error: uploadErr } = await _sb.storage.from('job-photos').upload(path, file, { cacheControl: '3600', upsert: false });
    if (uploadErr) { showToast('Upload failed: ' + uploadErr.message, 'error'); return; }
    var { data: urlData } = _sb.storage.from('job-photos').getPublicUrl(path);
    var photoRecord = {
      id:           'ph-' + Date.now(),
      jobId:        jobId,
      uploadedBy:   _currentUser.id,
      uploaderName: _currentUser.full_name || 'Unknown',
      filePath:     path,
      fileName:     file.name,
      caption:      caption || '',
      photoType:    'general',
      createdAt:    new Date().toISOString(),
      url:          urlData ? urlData.publicUrl : null
    };
    if (!DB.jobPhotos) DB.jobPhotos = [];
    DB.jobPhotos.push(photoRecord);
    // Save to Supabase table
    await _sb.from('job_photos').insert({
      id:            photoRecord.id,
      job_id:        jobId,
      uploaded_by:   _currentUser.id,
      uploader_name: photoRecord.uploaderName,
      file_path:     path,
      file_name:     file.name,
      caption:       caption || null,
      photo_type:    'general'
    });
    saveDB();
    showToast('Photo uploaded ✓', 'success');
    renderJobPhotosSection(jobId);
  } catch(e) {
    console.error('[Photos] Upload error:', e);
    showToast('Upload error: ' + e.message, 'error');
  }
}

function renderJobPhotosSection(jobId) {
  var el = document.getElementById('job-photos-section-'+jobId);
  if (!el) return;
  var photos = (DB.jobPhotos||[]).filter(function(p){ return p.jobId === jobId; })
    .sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
  var html = '<div style="margin-bottom:10px">'+
    '<button class="btn btn-outline btn-sm" onclick="openPhotoUpload(\''+jobId+'\')">📷 Upload Photos</button>'+
  '</div>';
  if (!photos.length) {
    html += '<div style="color:#90a4ae;font-size:12px;padding:8px 0">No photos yet.</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px">';
    photos.forEach(function(p) {
      if (!p.url) return;
      html += '<div style="position:relative">'+
        '<img src="'+escHtml(p.url)+'" onclick="window.open(\''+escHtml(p.url)+'\',\'_blank\')" '+
        'style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid #e0e7ef" '+
        'title="'+escHtml(p.caption||p.fileName||'')+'" loading="lazy">'+
        (p.caption?'<div style="font-size:9px;color:#546e7a;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(p.caption)+'</div>':'')+
      '</div>';
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

// Pull job photos from Supabase on sync
async function syncJobPhotos() {
  if (!_sb || !_currentUser) return;
  try {
    var { data, error } = await _sb.from('job_photos').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('[Sync] job_photos:', error.message); return; }
    if (data) {
      // Get signed URLs for all photos
      DB.jobPhotos = await Promise.all(data.map(async function(p) {
        var urlData = _sb.storage.from('job-photos').getPublicUrl(p.file_path);
        return {
          id:           p.id,
          jobId:        p.job_id,
          uploadedBy:   p.uploaded_by,
          uploaderName: p.uploader_name,
          filePath:     p.file_path,
          fileName:     p.file_name,
          caption:      p.caption || '',
          photoType:    p.photo_type || 'general',
          createdAt:    p.created_at,
          url:          urlData && urlData.data ? urlData.data.publicUrl : null
        };
      }));
    }
  } catch(e) { console.warn('[Sync] job_photos error:', e.message); }
}

// ---- PARTIAL INVOICE PAYMENTS ----
function openRecordPayment(invId) {
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) return;
  var payments = (DB.invoicePayments||[]).filter(function(p){ return p.invoiceId===invId; });
  var totalPaid = payments.reduce(function(s,p){ return s+parseFloat(p.amount||0); }, 0);
  var balance = (inv.total||0) - totalPaid;
  var summaryEl = document.getElementById('rp-invoice-summary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:6px">'+escHtml(inv.num||'Invoice')+'</div>'+
      '<div style="display:flex;gap:20px;font-size:12px">'+
        '<div><div style="color:#90a4ae;font-size:10px">TOTAL</div><div style="font-weight:700">$'+(inv.total||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</div></div>'+
        '<div><div style="color:#90a4ae;font-size:10px">PAID</div><div style="font-weight:700;color:#2e7d32">$'+totalPaid.toLocaleString('en-US',{minimumFractionDigits:2})+'</div></div>'+
        '<div><div style="color:#90a4ae;font-size:10px">BALANCE</div><div style="font-weight:700;color:'+(balance>0?'#c62828':'#2e7d32')+'">$'+balance.toLocaleString('en-US',{minimumFractionDigits:2})+'</div></div>'+
      '</div>'+
      (payments.length?'<div style="margin-top:8px;font-size:11px;color:#546e7a">'+payments.length+' payment(s) recorded</div>':'');
  }
  var amtEl = document.getElementById('rp-amount');
  if (amtEl) amtEl.value = balance > 0 ? balance.toFixed(2) : '';
  var dateEl = document.getElementById('rp-date');
  if (dateEl) dateEl.value = getTodayISO();
  var methodEl = document.getElementById('rp-method');
  if (methodEl) methodEl.value = 'check';
  var refEl = document.getElementById('rp-ref');
  if (refEl) refEl.value = '';
  var notesEl = document.getElementById('rp-notes');
  if (notesEl) notesEl.value = '';
  var idEl = document.getElementById('rp-invoice-id');
  if (idEl) idEl.value = invId;
  openModal('modal-record-payment');
}

function savePaymentRecord() {
  var invId  = (document.getElementById('rp-invoice-id')||{}).value;
  var amount = parseFloat((document.getElementById('rp-amount')||{}).value)||0;
  var date   = (document.getElementById('rp-date')||{}).value;
  if (!invId || !amount || !date) { showToast('Amount and date are required','error'); return; }
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) return;
  if (!DB.invoicePayments) DB.invoicePayments = [];
  var payment = {
    id:            'pmt-' + Date.now(),
    invoiceId:     invId,
    amount:        amount,
    paymentMethod: (document.getElementById('rp-method')||{}).value || 'check',
    reference:     (document.getElementById('rp-ref')||{}).value || '',
    notes:         (document.getElementById('rp-notes')||{}).value || '',
    recordedBy:    (_currentUser && _currentUser.id) || null,
    recorderName:  (_currentUser && _currentUser.full_name) || 'Unknown',
    paymentDate:   date,
    createdAt:     new Date().toISOString()
  };
  DB.invoicePayments.push(payment);
  // Check if fully paid
  var allPayments = DB.invoicePayments.filter(function(p){ return p.invoiceId===invId; });
  var totalPaid   = allPayments.reduce(function(s,p){ return s+parseFloat(p.amount||0); }, 0);
  if (totalPaid >= (inv.total||0)) {
    inv.status   = 'paid';
    inv.paidDate = date;
    var job = (DB.jobs||[]).find(function(j){ return j.id===inv.jobId; });
    if (job) { job.status='Closed'; job.invoicePaid=true; }
    showToast('Invoice fully paid and closed ✓', 'success', 4000);
  } else {
    inv.status = 'partial';
    var remaining = (inv.total||0) - totalPaid;
    showToast('Payment of $'+amount.toLocaleString('en-US',{minimumFractionDigits:2})+' recorded. Balance: $'+remaining.toLocaleString('en-US',{minimumFractionDigits:2}), 'success', 5000);
  }
  // Push to Supabase
  if (_sb && _currentUser) {
    _sb.from('invoice_payments').insert({
      id:             payment.id,
      invoice_id:     invId,
      amount:         amount,
      payment_method: payment.paymentMethod,
      reference:      payment.reference || null,
      notes:          payment.notes || null,
      recorded_by:    payment.recordedBy,
      recorder_name:  payment.recorderName,
      payment_date:   date
    }).then(function(r){ if (r.error) console.warn('[Payments] Push error:', r.error.message); });
  }
  saveDB();
  closeModal('modal-record-payment');
  renderInvoicesPage();
}

// ---- CUSTOMER PANEL COMMS TAB ----
// Hooked into switchCPTab in crm.js
function renderCPComms(customerId) {
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
    '<div style="font-weight:700;font-size:14px">Communications</div>'+
    '<button class="btn btn-outline btn-sm" onclick="openCommsModal(\''+escHtml(customerId)+'\',\'\')">+ Log</button>'+
  '</div>';
  html += renderCommsLog(customerId, null);
  return html;
}
