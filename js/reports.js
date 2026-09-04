// =============================================
// STAGE 5: CONTROL + FOLLOW-UP SYSTEM
// =============================================
function getTodayISO(){ return new Date().toISOString().split('T')[0]; }

// ── Dashboard "Revenue Won" period logic (fiscal-year aware) ──────────────────
// Fiscal year start month from Company Settings (1-12); defaults to January.
function _fiscalStartMonth(){ var m=parseInt((DB.settings&&DB.settings.fiscalYearStartMonth))||1; return (m>=1&&m<=12)?m:1; }
// Best available "won date" for a quote: the stamped wonDate, else last-updated, else the quote date.
function _quoteWonDate(q){
  if (!q) return '';
  if (q.wonDate) return q.wonDate;
  if (q.updatedAt) return String(q.updatedAt).split('T')[0];
  return q.dt || (q.createdAt ? String(q.createdAt).split('T')[0] : '');
}
// Selected dashboard revenue period ('month' | 'quarter' | 'ytd'), remembered per browser.
function getRevWonPeriod(){ try { return localStorage.getItem('dashRevPeriod') || 'ytd'; } catch(e){ return 'ytd'; } }
function setRevWonPeriod(p){ try { localStorage.setItem('dashRevPeriod', p); } catch(e){} if (typeof renderDash==='function') renderDash(); }
// Start-of-period Date for the current month / current fiscal quarter / current fiscal year.
function _revWonPeriodStart(period){
  var now=new Date(), y=now.getFullYear(), m0=now.getMonth(), fsm=_fiscalStartMonth();
  if (period==='month') return new Date(y, m0, 1);
  if (period==='quarter'){
    var fmi=((m0+1) - fsm + 12) % 12;                 // 0-based fiscal month index
    var qStart0=(fsm-1 + Math.floor(fmi/3)*3) % 12;   // calendar month (0-based) the quarter started
    var start=new Date(y, qStart0, 1);
    if (start>now) start=new Date(y-1, qStart0, 1);
    return start;
  }
  var ys=new Date(y, fsm-1, 1);                        // ytd (fiscal)
  if (ys>now) ys=new Date(y-1, fsm-1, 1);
  return ys;
}
function getQQQuoteDate(){ return (document.getElementById('qq-dt')||{}).value || getTodayISO(); }
function getQQFollowupDate(){ return (document.getElementById('qq-followup')||{}).value || ''; }
function getQQCreatedDate(){ return (document.getElementById('qq-created')||{}).value || ''; }
function qqSetDefaultFollowup(){
  var dt = getQQQuoteDate();
  var fuEl = document.getElementById('qq-followup');
  if (!fuEl) return;
  if (fuEl.value) return;
  fuEl.value = calcFollowupDate(dt);
}
// Aging anchor: for a SENT/FOLLOWUP quote we count from the day it was sent
// (how long the customer has been sitting on it); otherwise from the quote/created date.
// Legacy sent quotes with no sentDate fall back to the quote date.
function getQuoteAgeInfo(q){
  if (!q) return {days:null, basis:'', fromSent:false};
  var status = q.status || 'draft';
  var fromSent = (status === 'sent' || status === 'followup') && !!q.sentDate;
  var anchor = fromSent ? q.sentDate : (q.dt || q.createdDate || ((q.createdAt||'').split('T')[0]) || '');
  if (!anchor) return {days:null, basis:'', fromSent:fromSent};
  var days = Math.floor((new Date(getTodayISO()) - new Date(anchor)) / 86400000);
  if (isNaN(days) || days < 0) days = 0;
  return {days:days, basis: fromSent ? 'since sent' : 'since created', fromSent:fromSent};
}
// Color for an age value — closed quotes are neutral, open ones escalate green→amber→orange→red.
function quoteAgeColor(days, status){
  if (status === 'approved' || status === 'declined') return '#90a4ae';
  if (days == null) return '#90a4ae';
  if (days >= 30) return '#c62828';
  if (days >= 14) return '#e65100';
  if (days >= 7)  return '#f9a825';
  return '#2e7d32';
}
function getQuotePriority(q){
  if (!q) return {label:'Normal', tone:'normal', sort:50};
  var status = q.status || 'draft';
  var ready = (q.readiness || '').toUpperCase();
  if ((status === 'sent' || status === 'followup') && isFollowupOverdue(q)) return {label:'Critical', tone:'critical', sort:1};
  if ((status === 'sent' || status === 'followup') && isFollowupDue(q)) return {label:'High', tone:'high', sort:2};
  if (status === 'draft' && ready !== 'READY') return {label:'Needs Work', tone:'needswork', sort:3};
  if (status !== 'approved' && status !== 'declined') {
    var age = getQuoteAgeInfo(q).days;
    if (age != null) {
      if (age >= 30) return {label:'Aging 30+', tone:'critical', sort:4};
      if (age >= 14) return {label:'Aging 14+', tone:'high', sort:5};
      if (age >= 7)  return {label:'Aging 7+', tone:'watch', sort:6};
    }
  }
  if (status === 'ready') return {label:'Ready to Send', tone:'ready', sort:7};
  if (status === 'sent') return {label:'Waiting', tone:'watch', sort:8};
  if (status === 'approved') return {label:'Won', tone:'won', sort:90};
  if (status === 'declined') return {label:'Lost', tone:'lost', sort:91};
  return {label:'Normal', tone:'normal', sort:50};
}
function qqStage4EffectiveStatus(){
  var status = (document.getElementById('qq-status')||{}).value || 'draft';
  var totals = calcTotals();
  if ((status === 'draft' || !status) && String(totals.readiness||'').toUpperCase() === 'READY') return 'ready';
  return status;
}
function qqStage4ActionText(stage, totals){
  if (String(totals.readiness||'').toUpperCase() !== 'READY') return 'Fix Issues';
  if (stage === 'ready') return 'Send Quote';
  if (stage === 'sent') return 'Schedule Follow-Up';
  if (stage === 'followup') {
    var q = { status: stage, followupDate: getQQFollowupDate(), dt: getQQQuoteDate(), readiness: totals.readiness };
    if (isFollowupDue(q)) return 'Follow-Up NOW';
    return 'Move to Follow-Up';
  }
  if (stage === 'approved') return 'Won';
  if (stage === 'declined') return 'Lost';
  return 'Update Status';
}
function qqStage5BannerState(){
  var totals = calcTotals();
  var status = qqStage4EffectiveStatus();
  var fu = getQQFollowupDate();
  var created = getQQCreatedDate() || getQQQuoteDate();
  var q = { status: status, followupDate: fu, dt: getQQQuoteDate(), readiness: totals.readiness };
  var age = created ? Math.floor((new Date(getTodayISO()) - new Date(created)) / 86400000) : 0;
  if (String(totals.readiness||'').toUpperCase() !== 'READY') return {show:true, text:'Complete required quote details before this can move forward.', bg:'#fff3e0', color:'#e65100'};
  if ((status === 'sent' || status === 'followup') && fu && isFollowupOverdue(q)) return {show:true, text:'Overdue follow-up. This quote needs action now.', bg:'#ffebee', color:'#c62828'};
  if ((status === 'sent' || status === 'followup') && fu && isFollowupDue(q)) return {show:true, text:'Follow-up is due. Call or email the customer now.', bg:'#fff8e1', color:'#e65100'};
  if ((status === 'sent' || status === 'followup') && !fu) return {show:true, text:'No follow-up date is set. Schedule one before this quote goes quiet.', bg:'#fff8e1', color:'#e65100'};
  if (status === 'ready') return {show:true, text:'Quote is ready. Send it and set the next touchpoint.', bg:'#e8f5e9', color:'#2e7d32'};
  if ((status === 'draft' || status === 'ready') && age >= 7) return {show:true, text:'This draft is aging. Either send it or clean it up.', bg:'#fff8e1', color:'#e65100'};
  return {show:false, text:'', bg:'', color:''};
}
function qqStage4Init(){
  var totals = calcTotals();
  var stage = qqStage4EffectiveStatus();
  var qNum = (document.getElementById('qq-num')||{}).value || '---';
  var total = totals.totalSell || 0;
  var numEl = document.getElementById('qq-stage4-num');
  var statusEl = document.getElementById('qq-stage4-status');
  var totalEl = document.getElementById('qq-stage4-total');
  var hintEl = document.getElementById('qq-stage4-hint');
  var btn = document.getElementById('qq-smart-action');
  if (numEl) numEl.textContent = 'Quote #' + qNum;
  if (totalEl) totalEl.textContent = fmt(total);
  if (statusEl) {
    statusEl.textContent = stage === 'ready' ? 'Ready' : (stage === 'approved' ? 'Won' : stage === 'declined' ? 'Lost' : stage.charAt(0).toUpperCase()+stage.slice(1));
    statusEl.className = 'qq-stage4-status ' + (stage === 'ready' ? 'ready' : stage);
  }
  document.querySelectorAll('[data-stage4-step]').forEach(function(el){
    var key = el.getAttribute('data-stage4-step');
    el.classList.remove('active','done');
    var order = {draft:1,ready:2,sent:3,followup:4,closed:5};
    var current = stage === 'approved' || stage === 'declined' ? 'closed' : stage;
    if (key === current) el.classList.add('active');
    else if (order[key] < order[current]) el.classList.add('done');
  });
  var actionText = qqStage4ActionText(stage, totals);
  if (btn) {
    var notReady = String(totals.readiness||'').toUpperCase() !== 'READY';
    // Hide the button entirely when quote is not ready (was useless "Fix Issues" nag)
    btn.style.display = notReady ? 'none' : '';
    btn.textContent = actionText;
    btn.disabled = false;
    btn.onclick = function(){
      var statusEl = document.getElementById('qq-status');
      var fuEl = document.getElementById('qq-followup');
      var dt = getQQQuoteDate();
      if (String((calcTotals().readiness||'').toUpperCase()) !== 'READY') {
        showToast('Complete required fields and pricing checks first.','error'); return;
      }
      if (stage === 'ready') {
        if (statusEl) statusEl.value = 'sent';
        if (fuEl && !fuEl.value) fuEl.value = calcFollowupDate(dt);
      } else if (stage === 'sent') {
        if (fuEl && !fuEl.value) fuEl.value = calcFollowupDate(dt);
        if (statusEl) statusEl.value = 'followup';
      } else if (stage === 'followup') {
        if (fuEl && !fuEl.value) fuEl.value = calcFollowupDate(dt);
        showToast((fuEl&&fuEl.value&&fuEl.value<=getTodayISO())?'Follow up with the customer now!':'Follow-up stage is active','info');
      }
      updateQQStage3UI();
      qqStage4Init();
    };
  }
  var hint = 'Start by filling customer, job name, and line items.';
  if (String(totals.readiness||'').toUpperCase() !== 'READY') hint = 'Quote is not ready. Fix the required fields and pricing issues.';
  else if (stage === 'ready') hint = 'Ready to send. Next move: send quote and schedule follow-up.';
  else if (stage === 'sent') hint = 'Quote sent. Next move: set and work the follow-up date.';
  else if (stage === 'followup') hint = 'Follow-up stage active. Stay on this until it is won or lost.';
  else if (stage === 'approved') hint = 'Quote won. Convert to job when ready.';
  else if (stage === 'declined') hint = 'Quote closed as lost.';
  if (hintEl) hintEl.textContent = hint;

  var prEl = document.getElementById('qq-stage5-priority');
  if (prEl) {
    var q = { status: stage, followupDate: getQQFollowupDate(), dt: getQQQuoteDate(), readiness: totals.readiness };
    var pr = getQuotePriority(q);
    prEl.textContent = pr.label;
    var styles = {
      critical:['#ffebee','#c62828'], high:['#fff3e0','#e65100'], watch:['#fff8e1','#f57f17'],
      ready:['#e8f5e9','#2e7d32'], needswork:['#fff3e0','#e65100'], won:['#e8f5e9','#2e7d32'], lost:['#ffebee','#c62828'], normal:['#f8fafc','#546e7a']
    };
    var st = styles[pr.tone] || styles.normal;
    prEl.style.background = st[0]; prEl.style.color = st[1]; prEl.style.borderColor = st[0];
  }
  var banner = document.getElementById('qq-stage5-banner');
  if (banner) {
    var b = qqStage5BannerState();
    banner.style.display = b.show ? 'block' : 'none';
    banner.textContent = b.text;
    banner.style.background = b.bg; banner.style.color = b.color;
    banner.style.border = b.show ? ('1px solid ' + b.color + '33') : 'none';
  }
}

// Stage 5 override: include follow-up and preserve created date
function getQData(id) {
  const totals = calcTotals();
  const env = (document.getElementById('qq-env')||{}).value || 'office';
  const envLabel = ENV_PRESETS[env] ? ENV_PRESETS[env].label : 'Office';
  var existing = null;
  // Use hidden ID field first — most reliable
  var qqIdVal = (document.getElementById('qq-id')||{}).value || '';
  if (qqIdVal) existing = DB.quotes.find(function(q){ return q.id===qqIdVal; }) || null;
  // Fallback: by number only if no ID stored
  if (!existing) {
    var numVal = (document.getElementById('qq-num')||{}).value || '';
    if (numVal) existing = DB.quotes.find(function(q){ return q.num===numVal; }) || null;
  }
  var createdVal = (document.getElementById('qq-created')||{}).value || (existing ? (existing.createdDate || (existing.createdAt||'').split('T')[0]) : getTodayISO());
  return {
    id: id || null,
    num: (document.getElementById('qq-num')||{}).value || '',
    cn:  (document.getElementById('qq-cn')||{}).value || '',
    customerId: (document.getElementById('qq-customer-id')||{}).value || '',
    ph:  (document.getElementById('qq-ph')||{}).value || '',
    em:  (document.getElementById('qq-em')||{}).value || '',
    ad:  (function(){ var s=(document.getElementById('qq-ad')||{}).value||'', ci=(document.getElementById('qq-city')||{}).value||'', st=(document.getElementById('qq-state')||{}).value||'', z=(document.getElementById('qq-zip')||{}).value||''; var parts=[s, ci&&st?ci+', '+st:(ci||st), z].filter(Boolean); return parts.join(' '); })(),
    adStreet: (document.getElementById('qq-ad')||{}).value||'',
    adCity:   (document.getElementById('qq-city')||{}).value||'',
    adState:  (document.getElementById('qq-state')||{}).value||'',
    adZip:    (document.getElementById('qq-zip')||{}).value||'',
    contactName:  (document.getElementById('qq-contact-name')||{}).value || '',
    contactId:    (document.getElementById('qq-contact-id')||{}).value || '',
    contactTitle: (document.getElementById('qq-contact-title')||{}).value || '',
    jn:  (document.getElementById('qq-jn')||{}).value || '',
    jt:  (document.getElementById('qq-jt')||{}).value || 'New Construction',
    env: env,
    envLabel: envLabel,
    dt:  (document.getElementById('qq-dt')||{}).value || '',
    vu:  (document.getElementById('qq-vu')||{}).value || '',
    rep: (document.getElementById('qq-rep')||{}).value || '',
    pt:  (document.getElementById('qq-pt')||{}).value || '',
    tc:  (document.getElementById('qq-tc')||{}).value || '',
    notes: (document.getElementById('qq-notes')||{}).value || '',
    intNotes: (document.getElementById('qq-int')||{}).value || '',
    status: (document.getElementById('qq-status')||{}).value || 'draft',
    followupDate: (document.getElementById('qq-followup')||{}).value || calcFollowupDate((document.getElementById('qq-dt')||{}).value || ''),
    createdDate: createdVal,
    laborRate: getLaborRate(),
    targetMargin: (function(){ var v=parseFloat((document.getElementById('qq-mk')||{}).value); return isNaN(v)?35:v; })(),
    pricingMode: currentPricingMode(),
    taxRate: parseFloat((document.getElementById('qq-tx')||{}).value)||0,
    discount: totals.discountAmt,
    totalMaterialCost: totals.totalMaterialCost,
    totalLaborHours: totals.totalLaborHours,
    laborSell: totals.laborSell,
    totalCost: totals.totalCost,
    materialSell: totals.materialSell,
    sellBeforeTax: totals.sellBeforeTax,
    taxAmt: totals.taxAmt,
    total: totals.totalSell,
    achievedMargin: totals.achievedMarginPct,
    pricingHealth: totals.health,
    readiness: totals.readiness,
    equipmentRows: JSON.parse(JSON.stringify(equipmentRows)),
    equipmentCost: totals.equipCost || 0,
    permits: getPermitData(),
    marginFloor: getMarginFloor((document.getElementById('qq-jt')||{}).value || 'New Construction'),
    belowMarginFloor: totals.achievedMarginPct < getMarginFloor((document.getElementById('qq-jt')||{}).value || 'New Construction'),
    perDiem: JSON.parse(JSON.stringify(perDiemData)),
    perDiemCost: totals.pdCost || 0,
    lumpSum: getLumpSumState(),
    showLaborBanner: typeof getLaborBannerOn==='function' ? getLaborBannerOn() : true,
    svcContract: getSvcContractData(),
    execSummary: (function(){ var _e=document.getElementById('qq-exec-summary'); if(_e) return _e.value; return existing && existing.execSummary ? existing.execSummary : ''; })(),
    proposalSections: getProposalSections(),
    markup: totals.totalMaterialCost > 0 ? ((totals.materialSell / totals.totalMaterialCost - 1)*100).toFixed(1) : '0',
    subtotal: totals.sellBeforeTax,
    margin: totals.achievedMarginPct,
    items: JSON.parse(JSON.stringify(lineItems)),
    createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
    // Preserve the date the quote first went out so aging counts from send, not from every re-save.
    sentDate: existing && existing.sentDate ? existing.sentDate : null,
    // Preserve the date a quote was marked Won so dashboard revenue periods stay accurate across re-saves.
    wonDate: existing && existing.wonDate ? existing.wonDate : null
  };
}

function qqFieldIds(){
  // qq-id / qq-customer-id / qq-contact-id are the quote's IDENTITY fields and MUST be
  // included: the draft save/restore uses this list, and without them a resumed draft of
  // an existing quote loses its id (saveQQ then creates a DUPLICATE) and its customer link.
  return ['qq-id','qq-customer-id','qq-contact-id','qq-cn','qq-contact-name','qq-ph','qq-em','qq-contact-title','qq-ad','qq-city','qq-state','qq-zip','qq-jn','qq-jt','qq-env','qq-dt','qq-num','qq-rep','qq-vu','qq-followup','qq-created','qq-pt','qq-notes','qq-tc','qq-int','qq-status','qq-lr','qq-mk','qq-tx','qq-disc','lumpsum-label','pd-men','pd-days','pd-rate','pd-rooms','pd-nights','pd-lodging-rate','pd-travel-desc','pd-trips','pd-travel-rate','cqq-count','cqq-type','cqq-cable','cqq-nvr','cqq-labor','cqq-env'];
}

function clearQQ(skipConfirm) {
  if (!skipConfirm && lineItems.length > 0 && !confirm('Clear the current quote form?')) return;
  // Reset auto-save protection so the NEXT quote can auto-save again. Without this the
  // stub only ever fired once per page load, because _autoSaveStubDone was only reset
  // in a duplicate clearQQ() in quotes.js that is shadowed by THIS definition (reports.js
  // loads later) and never ran. NOTE: we deliberately do NOT clear the local QQ draft
  // here — clearQQ() runs during init() (auth.js) BEFORE the draft-recovery prompt, so
  // wiping it here would break resume-on-startup. The draft is cleared on a successful
  // saveQQ() and overwritten as the user types the next quote. See changelog.
  if (typeof _resetAutoSaveStub === 'function') _resetAutoSaveStub();
  lineItems = [];
  equipmentRows = [];
  renderEquipRows();
  const eqCb = document.getElementById('equipment-enabled'); const eqBody = document.getElementById('equipment-body'); const eqLbl = document.getElementById('equipment-toggle-label');
  if (eqCb) eqCb.checked = false; if (eqBody) eqBody.classList.remove('expanded'); if (eqLbl) { eqLbl.textContent='NO'; eqLbl.className='toggle-value-label'; }
  ['permit-lv','permit-elec','permit-other','permit-none'].forEach(function(id){ const el=document.getElementById(id); if(el) el.checked=false; });
  // Default to "No Permit" when starting a fresh quote
  const pnDef = document.getElementById('permit-none'); if (pnDef) pnDef.checked = true;
  const otd = document.getElementById('permit-other-desc'); if(otd) otd.style.display='none';
  const otx = document.getElementById('permit-other-text'); if(otx) otx.value='';
  const pco = document.getElementById('permit-coord'); if(pco) pco.value='';
  updatePermitStatus();
  ['qq-cn','qq-ph','qq-em','qq-ad','qq-city','qq-state','qq-zip','qq-jn','qq-num','qq-id','qq-notes','qq-int','qq-tc','qq-exec-summary','qq-contact-name','qq-contact-title'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
  // qq-notes (Scope of Work) is a rich-text contenteditable div — .value is a no-op on it,
  // so clear its innerHTML explicitly or the PREVIOUS quote's scope bleeds into a new quote.
  var _qnClr = document.getElementById('qq-notes');
  if (_qnClr && _qnClr.contentEditable === 'true') { _qnClr.innerHTML = ''; if (typeof qqNotesUpdatePlaceholder==='function') qqNotesUpdatePlaceholder(); }
  // Clear hidden ID fields and hide new contact panel
  var cidEl=document.getElementById('qq-customer-id'); if(cidEl) cidEl.value='';
  var ctidEl=document.getElementById('qq-contact-id'); if(ctidEl) ctidEl.value='';
  cancelNewContactFromQuote();
  cancelNewCustomerFromQuote();
  const lr = document.getElementById('qq-lr'); if(lr) lr.value = DB.settings.laborRate || 100;
  const mk = document.getElementById('qq-mk'); if(mk) mk.value = (DB.settings.targetMargin!==undefined && DB.settings.targetMargin!==null) ? DB.settings.targetMargin : 35;
  const tx = document.getElementById('qq-tx'); if(tx) tx.value = DB.settings.taxRate || 0;
  const disc = document.getElementById('qq-disc'); if(disc) disc.value = 0;
  const env = document.getElementById('qq-env'); if(env) env.value = 'office';
  const status = document.getElementById('qq-status'); if(status) status.value = 'draft';
  const dt = document.getElementById('qq-dt'); if(dt) dt.value = getTodayISO();
  const created = document.getElementById('qq-created'); if (created) created.value = getTodayISO();
  const follow = document.getElementById('qq-followup'); if (follow) follow.value = calcFollowupDate(getTodayISO());
  const vd = DB.settings.validDays || 30;
  const vu = document.getElementById('qq-vu'); if(vu){ const d=new Date(); d.setDate(d.getDate()+vd); vu.value=d.toISOString().split('T')[0]; }
  const rep = document.getElementById('qq-rep'); if(rep) rep.value = DB.settings.uname || '';
  const pt = document.getElementById('qq-pt'); if(pt) pt.value = DB.settings.payTerms || '';
  const tc = document.getElementById('qq-tc'); if(tc) tc.value = DB.settings.tc || '';
  const note = document.getElementById('env-default-note'); if(note) note.classList.remove('visible');
  const mfb = document.getElementById('mf-floor-badge'); if(mfb) mfb.style.display='none';
  const mfa = document.getElementById('mf-approval'); if(mfa) mfa.classList.remove('visible');
  clearPerDiem(true);
  const pdCb = document.getElementById('perdiem-enabled'); const pdBody = document.getElementById('perdiem-body'); const pdLbl = document.getElementById('perdiem-toggle-label');
  if (pdCb) pdCb.checked = false; if (pdBody) pdBody.classList.remove('expanded'); if (pdLbl) { pdLbl.textContent='NO'; pdLbl.className='toggle-value-label'; }
  const lsToggle = document.getElementById('lumpsum-toggle'); if(lsToggle) lsToggle.checked = false;
  const lsBody = document.getElementById('lumpsum-body'); if(lsBody) lsBody.classList.remove('expanded');
  const lsLbl = document.getElementById('lumpsum-toggle-label'); if(lsLbl){ lsLbl.textContent='NO'; lsLbl.className='toggle-value-label'; }
  const lsLabel = document.getElementById('lumpsum-label'); if(lsLabel) lsLabel.value = 'Complete Low Voltage Installation';
  const lsItems = document.getElementById('lumpsum-show-items'); if(lsItems) lsItems.checked = true;
  const lsILbl = document.getElementById('lumpsum-show-items-label'); if(lsILbl){ lsILbl.textContent='YES'; lsILbl.className='toggle-value-label on'; }
  _svcTier = null;
  const svcCb = document.getElementById('svc-enabled'); if(svcCb) svcCb.checked=false;
  const svcBody=document.getElementById('svc-body'); if(svcBody) svcBody.classList.remove('expanded');
  const svcLbl=document.getElementById('svc-toggle-label'); if(svcLbl){svcLbl.textContent='NO';svcLbl.className='toggle-value-label';}
  _cqqEnabled=false;
  const cqqCb=document.getElementById('cqq-enabled'); if(cqqCb) cqqCb.checked=false;
  const cqqBody=document.getElementById('cqq-body'); if(cqqBody) cqqBody.classList.remove('expanded');
  const cqqLbl=document.getElementById('cqq-toggle-label'); if(cqqLbl){cqqLbl.textContent='NO';cqqLbl.className='toggle-value-label';}
  resetProposalSectionToggles();
  // Reset pricing mode to default (margin) for a fresh quote
  setPricingMode('margin', { silent: true });
  renderLI();
  calcTotals();
  qqStage4Init();
}

function editQuote(id) {
  const q = DB.quotes.find(function(x){return x.id==id});
  if (!q) return;
  function setV(elId, val) { const el=document.getElementById(elId); if(el) el.value = (val!==undefined&&val!==null) ? val : ''; }
  setV('qq-cn', q.cn); setV('qq-ph', q.ph); setV('qq-em', q.em);
  // Split address fields — use stored split values if available, else parse the combined ad string
  setV('qq-ad',    q.adStreet || q.ad || '');
  setV('qq-city',  q.adCity   || '');
  setV('qq-state', q.adState  || '');
  setV('qq-zip',   q.adZip    || '');
  setV('qq-contact-name', q.contactName||''); setV('qq-contact-title', q.contactTitle||'');
  // Populate hidden ID fields
  setV('qq-customer-id', q.customerId||'');
  setV('qq-contact-id', q.contactId||'');
  // If no customerId yet, try to resolve from name
  if (!q.customerId && q.cn) {
    var mc=DB.customers.find(function(c){return (c.name||'').toLowerCase()===(q.cn||'').toLowerCase();});
    if(mc){setV('qq-customer-id',mc.id);}
  }
  // If no contactId yet, try to resolve from name
  if (!q.contactId && q.contactName) {
    var mct=DB.contacts.find(function(c){return (c.name||'').toLowerCase()===(q.contactName||'').toLowerCase();});
    if(mct){setV('qq-contact-id',mct.id);}
  }
  setV('qq-jn', q.jn); setV('qq-jt', q.jt); setV('qq-env', q.env||'office');
  setV('qq-dt', q.dt); setV('qq-vu', q.vu); setV('qq-num', q.num); setV('qq-id', q.id||''); setV('qq-followup', q.followupDate || calcFollowupDate(q.dt || getTodayISO()));
  setV('qq-created', q.createdDate || ((q.createdAt||'').split('T')[0]) || q.dt || getTodayISO());
  setV('qq-rep', q.rep); setV('qq-pt', q.pt); setV('qq-tc', q.tc); setV('qq-exec-summary', q.execSummary||'');
  // qq-notes is contenteditable — load via innerHTML (setV/.value is a no-op on it), or
  // the editor keeps showing stale content instead of THIS quote's saved Scope of Work.
  (function(){
    var _nc = q.notes || '';
    var _isHtml = !!q.notesIsHtml || (typeof _nc === 'string' && _nc.replace(/^\s+/,'').charAt(0) === '<');
    var _el = document.getElementById('qq-notes');
    if (_el && _el.contentEditable === 'true') {
      if (typeof woRtfLoad === 'function') woRtfLoad('qq-notes', _nc, _isHtml); else _el.innerHTML = _nc;
      if (typeof qqNotesUpdatePlaceholder === 'function') qqNotesUpdatePlaceholder();
    } else { setV('qq-notes', _nc); }
  })();
  setV('qq-int', q.intNotes||q.int||'');
  setV('qq-status', q.status||'draft');
  setV('qq-lr', q.laborRate||100); setV('qq-mk', q.targetMargin!==undefined && q.targetMargin!==null ? q.targetMargin : (q.markup!==undefined && q.markup!==null ? q.markup : 35)); setV('qq-tx', q.taxRate||0); setV('qq-disc', q.discount||0);
  if (typeof refreshAllPaymentTermsDropdowns==='function') refreshAllPaymentTermsDropdowns();
  setV('qq-pt', q.pt||'Due on Receipt');
  // Restore pricing mode (margin/markup) — defaults to margin for older quotes that didn't save this field
  setPricingMode(q.pricingMode === 'markup' ? 'markup' : 'margin', { silent: true });
  lineItems = q.items ? JSON.parse(JSON.stringify(q.items)) : [];
  lineItems.forEach(function(item){ if(!item._id) item._id = nextLiId(); });
  equipmentRows = q.equipmentRows ? JSON.parse(JSON.stringify(q.equipmentRows)) : [];
  equipmentRows.forEach(function(r){ if(!r._id) r._id = eqSeq++; });
  renderEquipRows();
  const hasEquip = equipmentRows.length > 0;
  const eqCb2 = document.getElementById('equipment-enabled'); const eqBody2 = document.getElementById('equipment-body'); const eqLbl2 = document.getElementById('equipment-toggle-label');
  if (eqCb2) eqCb2.checked = hasEquip; if (eqBody2) eqBody2.classList.toggle('expanded', hasEquip); if (eqLbl2) { eqLbl2.textContent = hasEquip ? 'YES' : 'NO'; eqLbl2.className = 'toggle-value-label' + (hasEquip ? ' on' : ''); }
  loadPermitData(q.permits || null);
  loadPerDiemData(q.perDiem || null);
  const hasPD = !!(q.perDiem && q.perDiemCost > 0);
  const pdCb2 = document.getElementById('perdiem-enabled'); const pdBody2 = document.getElementById('perdiem-body'); const pdLbl2 = document.getElementById('perdiem-toggle-label');
  if (pdCb2) pdCb2.checked = hasPD; if (pdBody2) pdBody2.classList.toggle('expanded', hasPD); if (pdLbl2) { pdLbl2.textContent = hasPD ? 'YES' : 'NO'; pdLbl2.className = 'toggle-value-label' + (hasPD ? ' on' : ''); }
  const lsToggle = document.getElementById('lumpsum-toggle'); const lsBody = document.getElementById('lumpsum-body'); const lsLbl = document.getElementById('lumpsum-toggle-label'); const lsLabel = document.getElementById('lumpsum-label');
  const lsOn = !!(q.lumpSum && q.lumpSum.enabled);
  if (lsToggle) lsToggle.checked = lsOn; if (lsBody) lsBody.classList.toggle('expanded', lsOn); if (lsLbl) { lsLbl.textContent = lsOn ? 'YES' : 'NO'; lsLbl.className = 'toggle-value-label' + (lsOn ? ' on' : ''); }
  if (lsLabel && q.lumpSum && q.lumpSum.label) lsLabel.value = q.lumpSum.label;
  updateLumpSumPreview();
  restoreProposalSectionToggles(q.proposalSections || null);
  // Restore labor banner toggle — default ON unless explicitly saved as off
  var lbCb = document.getElementById('labor-banner-toggle');
  var lbLbl = document.getElementById('labor-banner-label');
  var lbOn = q.showLaborBanner !== undefined ? !!q.showLaborBanner : true;
  if (lbCb) lbCb.checked = lbOn;
  if (lbLbl) { lbLbl.textContent = lbOn ? 'YES' : 'NO'; lbLbl.className = 'toggle-value-label' + (lbOn ? ' on' : ''); }
  renderLI();
  calcTotals();
  clearQQDraft();
  setQQDirty(false, 'Loaded saved quote');
  updateQQStage3UI();
  qqStage4Init();
  goPage('qq');
  // Prev/next arrows — step through quotes by number; warn if the editor has unsaved changes
  if (typeof showDocNav === 'function') showDocNav('quote', id, editQuote, function(){ return (typeof _qqDirty !== 'undefined' && _qqDirty); }, 'page-qq');
  // Populate job type dropdown from dynamic list AFTER page loads, preserve selected value
  setTimeout(function(){
    if (typeof populateJTDropdown === 'function') {
      populateJTDropdown();
      // Re-select the quote's job type since populate resets the dropdown
      var jtEl = document.getElementById('qq-jt');
      if (jtEl && q.jt) jtEl.value = q.jt;
    }
  }, 200);
}

function saveQuoteSortDefault() {
  var sel = document.getElementById('q-sort');
  var sortVal = sel ? sel.value : 'num-desc';
  DB.settings = Object.assign({}, DB.settings, {quoteDefaultSort: sortVal});
  saveDB();
  var sortLabels = {
    'num-desc':'Quote # Newest','num-asc':'Quote # Oldest',
    'priority':'Priority','date-desc':'Date Newest','date-asc':'Date Oldest',
    'total-desc':'Highest Value','total-asc':'Lowest Value',
    'customer':'Customer A–Z','margin-desc':'Highest Margin','followup':'Follow-Up Due'
  };
  showToast('Default sort saved: '+( sortLabels[sortVal]||sortVal),'success');
}

function setSortQuotes(sortVal) {
  var sel = document.getElementById('q-sort');
  if (sel) sel.value = sortVal;
  renderQuotes();
}

function renderQuotes() {
  const search = (document.getElementById('q-search')||{}).value || '';
  const filter = (document.getElementById('q-filter')||{}).value || '';
  const sort   = (document.getElementById('q-sort')||{}).value || 'priority';
  // Never show soft-deleted quotes. deletedAt is set locally the moment a quote
  // is deleted; the cloud pull also filters them out, so this is belt-and-suspenders.
  let list = DB.quotes.filter(function(q){ return !q.deletedAt; });
  if (search) { const sl=search.toLowerCase(); list=list.filter(function(q){ return (q.cn||'').toLowerCase().includes(sl)||(q.jn||'').toLowerCase().includes(sl)||(q.num||'').toLowerCase().includes(sl); }); }
  if (filter) list=list.filter(function(q){ return (q.status||'draft').toLowerCase()===filter.toLowerCase(); });

  // Apply sort
  switch(sort) {
    case 'num-desc':
      list.sort(function(a,b){ return (b.num||'').localeCompare(a.num||'',undefined,{numeric:true}); }); break;
    case 'num-asc':
      list.sort(function(a,b){ return (a.num||'').localeCompare(b.num||'',undefined,{numeric:true}); }); break;
    case 'priority':
      list.sort(function(a,b){
        var pa=getQuotePriority(a),pb=getQuotePriority(b);
        if(pa.sort!==pb.sort) return pa.sort-pb.sort;
        return (b.num||'').localeCompare(a.num||'',undefined,{numeric:true});
      }); break;
    case 'date-desc':
      list.sort(function(a,b){ return new Date(b.dt||b.createdAt||0)-new Date(a.dt||a.createdAt||0); }); break;
    case 'date-asc':
      list.sort(function(a,b){ return new Date(a.dt||a.createdAt||0)-new Date(b.dt||b.createdAt||0); }); break;
    case 'total-desc':
      list.sort(function(a,b){ return (b.total||0)-(a.total||0); }); break;
    case 'total-asc':
      list.sort(function(a,b){ return (a.total||0)-(b.total||0); }); break;
    case 'customer':
      list.sort(function(a,b){ return (a.cn||'').localeCompare(b.cn||''); }); break;
    case 'margin-desc':
      list.sort(function(a,b){ return (b.achievedMargin||0)-(a.achievedMargin||0); }); break;
    case 'followup':
      list.sort(function(a,b){ return (a.followupDate||'9999').localeCompare(b.followupDate||'9999'); }); break;
    case 'age-desc':
      list.sort(function(a,b){ var da=getQuoteAgeInfo(a).days, db=getQuoteAgeInfo(b).days; return (db==null?-1:db)-(da==null?-1:da); }); break;
    case 'age-asc':
      list.sort(function(a,b){ var da=getQuoteAgeInfo(a).days, db=getQuoteAgeInfo(b).days; return (da==null?1e9:da)-(db==null?1e9:db); }); break;
    default:
      list.sort(function(a,b){ return (b.num||'').localeCompare(a.num||'',undefined,{numeric:true}); }); break;
  }

  // Update column header sort indicators
  ['num-desc','num-asc','customer','total-desc','margin-desc','date-desc','age-desc'].forEach(function(k){
    var el=document.getElementById('qsort-'+k);
    if(el) el.textContent=sort===k?'▲':sort==='num-asc'&&k==='num-asc'?'▲':'';
  });

  const tbody = document.getElementById('quotes-tbl');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>No quotes found.</p></td></tr>';
    return;
  }
  const healthColor = function(q){ return q.pricingHealth==='Healthy'?'color:#2e7d32':q.pricingHealth==='Watch'?'color:#e65100':'color:#c62828'; };
  // UI-layer authorization: only show the Del control to roles the permission
  // matrix allows. This is convenience only — the database (soft_delete_quote
  // RPC) is the real lock, so a hidden button can't be worked around.
  var _canDelQ = (typeof hasPermission === 'function') ? hasPermission('quote.delete') : true;
  tbody.innerHTML = list.map(function(q){
    const envLabel = q.envLabel || (ENV_PRESETS[q.env] ? ENV_PRESETS[q.env].label : q.env || '');
    const fuBadge = isFollowupDue(q) ? '<span class="followup-due'+(isFollowupOverdue(q)?' followup-overdue':'')+'" style="margin-left:4px">'+(isFollowupOverdue(q)?'Overdue':'Follow-Up')+'</span>' : '';
    const pr = getQuotePriority(q);
    const prColor = pr.tone==='critical'?'#c62828':pr.tone==='high'?'#e65100':pr.tone==='needswork'?'#e65100':pr.tone==='ready'?'#2e7d32':'#607d8b';
    var canConvert = q.status!=='approved' && q.status!=='declined';
    // Aging: days old (from sent date for sent quotes, else created), color-coded, with a row accent.
    var ageInfo = getQuoteAgeInfo(q);
    var ageColor = quoteAgeColor(ageInfo.days, q.status);
    var isClosed = q.status==='approved' || q.status==='declined';
    var rowStyle = '';
    if (!isClosed && ageInfo.days!=null && ageInfo.days>=7) {
      rowStyle = 'border-left:4px solid '+ageColor+';';
      if (ageInfo.days>=30) rowStyle += 'background:#fff5f5;';
      else if (ageInfo.days>=14) rowStyle += 'background:#fff9f2;';
    }
    var ageCell = (ageInfo.days==null)
      ? '<td style="color:#b0bec5">—</td>'
      : '<td style="white-space:nowrap"><span style="font-weight:700;color:'+ageColor+'">'+ageInfo.days+'d</span>'+
        '<div style="font-size:9px;color:#b0bec5">'+ageInfo.basis+'</div></td>';
    return '<tr'+(rowStyle?' style="'+rowStyle+'"':'')+'>'+
      '<td style="font-weight:700;color:#1565c0">'+escHtml(q.num||'')+'</td>'+
      '<td>'+escHtml(q.cn||'')+'</td>'+
      '<td>'+escHtml(q.jn||'')+'</td>'+
      '<td style="font-size:11px">'+escHtml(envLabel)+'</td>'+
      '<td style="font-weight:700">'+fmt(q.total||0)+'</td>'+
      '<td style="font-weight:700;'+healthColor(q)+'">'+pct(q.achievedMargin||0)+'</td>'+
      '<td><span class="status-badge s-'+(q.status||'draft')+'">'+(q.status||'draft')+'</span>'+fuBadge+
        '<div style="font-size:10px;color:'+prColor+';font-weight:700;margin-top:3px">'+pr.label+'</div></td>'+
      ageCell+
      '<td style="color:#90a4ae;font-size:11px">'+(q.followupDate?'📅 '+q.followupDate:(q.dt||''))+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" data-action="viewQuote" data-id="'+q.id+'">View</button> '+
        '<button class="btn btn-outline btn-sm" data-action="editQuote" data-id="'+q.id+'">Edit</button> '+
        '<button class="btn btn-ghost btn-sm" data-action="dupQuote" data-id="'+q.id+'">Dup</button> '+
        '<button class="btn btn-convert btn-sm" '+(canConvert?'data-action="convertToJob" data-id="'+q.id+'"':'disabled')+
          ' style="'+(canConvert?'':'opacity:.3;cursor:not-allowed;pointer-events:none')+'" title="'+(canConvert?'Mark Won & Create Job':'Already converted')+'">▶</button> '+
        '<button class="btn btn-success btn-sm" data-action="emailSavedQuote" data-id="'+q.id+'" title="Email to customer">📧</button> '+
        '<button class="btn btn-outline btn-sm" data-action="copyPortalLink" data-id="'+q.id+'" title="Copy client approval link" style="font-size:11px">🔗 Link</button> '+
        (_canDelQ ? '<button class="btn btn-danger btn-sm" data-action="deleteQuote" data-id="'+q.id+'">Del</button>' : '')+
      '</td>'+
    '</tr>';
  }).join('');
}

// ============================================================
// FIELD TECH DASHBOARD
// Replaces the owner dashboard for helper_tech role
// Shows: today's assignments, clock status, assigned projects,
//        open flags, recent notifications
// ============================================================

// ============================================================
// TECH PERFORMANCE JOURNAL
// Manager-maintained permanent record of tech behavior
// Both positive and negative entries
// ============================================================

var TJ_POS_CATEGORIES = [
  'Volunteered / Above & Beyond',
  'Customer Compliment',
  'Saved a Job / Caught an Issue',
  'Helped a Teammate',
  'Quality Above Expectations',
  'Perfect Log Compliance',
  'Professional Conduct',
  'Safety Leadership',
  'Other Positive',
];

var TJ_NEG_CATEGORIES = [
  'Late / No-Show',
  'Customer Complaint',
  'Safety Violation',
  'Dishonesty',
  'Poor Attitude',
  'Equipment Damage',
  'Rework / Careless Work',
  'Incomplete / Late Logs',
  'Insubordination',
  'Other Negative',
];

var _tjState = {
  type: 'positive',
  techName: '',
  category: '',
};

// ── Open the quick-add modal ──────────────────────────────────────────────────
function openJournalEntry(techName, preType) {
  _tjState = { type: preType||'positive', techName: techName||'', category:'' };
  var team = (DB.team||[]).filter(function(m){ return m.active!==false; });

  var techOptions = team.map(function(m){
    return '<option value="'+escHtml(m.name)+'"'+(m.name===techName?' selected':'')+'>'+escHtml(m.name)+'</option>';
  }).join('');

  var html = '<div class="modal-overlay open" id="tj-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:520px">'+
      '<div class="modal-head">'+
        '<h3>📝 Log Journal Entry</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'tj-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div class="modal-body">'+

        // Tech selector
        '<div style="margin-bottom:16px">'+
          '<label class="wiz-label">TEAM MEMBER *</label>'+
          '<select id="tj-tech" class="form-control" onchange="_tjState.techName=this.value">'+
            '<option value="">— Select tech —</option>'+
            techOptions+
          '</select>'+
        '</div>'+

        // Type toggle — big and obvious
        '<div style="margin-bottom:16px">'+
          '<label class="wiz-label">ENTRY TYPE *</label>'+
          '<div style="display:flex;gap:10px">'+
            '<button id="tj-btn-pos" onclick="tjSetType(\'positive\')" '+
              'style="flex:1;padding:14px;font-size:15px;font-weight:800;border:3px solid '+(_tjState.type==='positive'?'#2e7d32':'#e0e0e0')+';border-radius:12px;background:'+(_tjState.type==='positive'?'#e8f5e9':'#fff')+';color:'+(_tjState.type==='positive'?'#2e7d32':'#90a4ae')+';cursor:pointer">'+
              '👍 Positive</button>'+
            '<button id="tj-btn-neg" onclick="tjSetType(\'negative\')" '+
              'style="flex:1;padding:14px;font-size:15px;font-weight:800;border:3px solid '+(_tjState.type==='negative'?'#c62828':'#e0e0e0')+';border-radius:12px;background:'+(_tjState.type==='negative'?'#ffebee':'#fff')+';color:'+(_tjState.type==='negative'?'#c62828':'#90a4ae')+';cursor:pointer">'+
              '👎 Negative</button>'+
          '</div>'+
        '</div>'+

        // Category
        '<div style="margin-bottom:16px">'+
          '<label class="wiz-label">CATEGORY *</label>'+
          '<div id="tj-categories" style="display:flex;gap:6px;flex-wrap:wrap">'+
            tjCategoryButtons(_tjState.type, '')+
          '</div>'+
        '</div>'+

        // What happened
        '<div style="margin-bottom:16px">'+
          '<label class="wiz-label">WHAT HAPPENED *</label>'+
          '<textarea id="tj-desc" class="form-control" rows="4" '+
            'placeholder="Describe what you observed or were told. Be specific — who, what, when, where."'+
            'style="resize:vertical;min-height:100px"></textarea>'+
        '</div>'+

        // Related WO (optional)
        '<div style="margin-bottom:20px">'+
          '<label class="wiz-label">RELATED WORK ORDER <span style="font-weight:400;text-transform:none">(optional)</span></label>'+
          '<select id="tj-wo" class="form-control">'+
            '<option value="">— None —</option>'+
            (DB.workOrders||[]).slice(0,30).map(function(w){
              return '<option value="'+w.id+'">'+escHtml((w.woNumber||w.id)+' — '+(w.customerName||stripHtmlToText(w.description)||'').substring(0,40))+'</option>';
            }).join('')+
          '</select>'+
        '</div>'+

        '<button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px" onclick="saveJournalEntry()">'+
          '💾 Save Entry</button>'+
      '</div>'+
    '</div>'+
  '</div>';

  var e = document.getElementById('tj-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(function(){
    var sel = document.getElementById('tj-tech');
    if (sel && !techName) sel.focus();
  }, 100);
}

function tjCategoryButtons(type, selected) {
  var cats = type === 'positive' ? TJ_POS_CATEGORIES : TJ_NEG_CATEGORIES;
  var color = type === 'positive' ? '#2e7d32' : '#c62828';
  var bg    = type === 'positive' ? '#e8f5e9'  : '#ffebee';
  return cats.map(function(cat){
    var active = cat === selected;
    return '<button onclick="tjSetCategory(\''+escHtml(cat)+'\')" '+
      'style="padding:6px 12px;font-size:12px;font-weight:600;border:2px solid '+(active?color:'#e0e0e0')+';border-radius:20px;background:'+(active?bg:'#fff')+';color:'+(active?color:'#546e7a')+';cursor:pointer">'+
      escHtml(cat)+'</button>';
  }).join('');
}

function tjSetType(type) {
  _tjState.type = type;
  _tjState.category = '';
  var posBtn = document.getElementById('tj-btn-pos');
  var negBtn = document.getElementById('tj-btn-neg');
  var catDiv = document.getElementById('tj-categories');
  if (posBtn) {
    posBtn.style.border = '3px solid '+(type==='positive'?'#2e7d32':'#e0e0e0');
    posBtn.style.background = type==='positive'?'#e8f5e9':'#fff';
    posBtn.style.color = type==='positive'?'#2e7d32':'#90a4ae';
  }
  if (negBtn) {
    negBtn.style.border = '3px solid '+(type==='negative'?'#c62828':'#e0e0e0');
    negBtn.style.background = type==='negative'?'#ffebee':'#fff';
    negBtn.style.color = type==='negative'?'#c62828':'#90a4ae';
  }
  if (catDiv) catDiv.innerHTML = tjCategoryButtons(type, '');
}

function tjSetCategory(cat) {
  _tjState.category = cat;
  var catDiv = document.getElementById('tj-categories');
  if (catDiv) catDiv.innerHTML = tjCategoryButtons(_tjState.type, cat);
}

async function saveJournalEntry() {
  var techName = (document.getElementById('tj-tech')||{}).value || _tjState.techName;
  var desc     = ((document.getElementById('tj-desc')||{}).value||'').trim();
  var woEl     = document.getElementById('tj-wo');
  var woId     = woEl ? woEl.value : '';
  var wo       = woId ? (DB.workOrders||[]).find(function(w){ return w.id===woId; }) : null;

  if (!techName)         { showToast('Select a team member','warning'); return; }
  if (!_tjState.category){ showToast('Select a category','warning'); return; }
  if (!desc)             { showToast('Describe what happened','warning'); return; }

  var member = (DB.team||[]).find(function(m){ return m.name===techName; });

  var entry = {
    tech_id:        member && member.userId ? member.userId : null,
    tech_name:      techName,
    entry_type:     _tjState.type,
    category:       _tjState.category,
    description:    desc,
    wo_id:          woId || null,
    wo_number:      wo ? (wo.woNumber||null) : null,
    entered_by_id:  (typeof wtCurrentUserId==='function'?wtCurrentUserId():null),
    entered_by_name:(typeof wtCurrentUserName==='function'?wtCurrentUserName():''),
    entry_date:     new Date().toISOString().split('T')[0],
  };

  var btn = document.querySelector('#tj-modal .btn-primary');
  if (btn) { btn.disabled=true; btn.textContent='Saving...'; }

  try {
    if (_sb) {
      var { data, error } = await _sb.from('tech_journal').insert(entry).select().single();
      if (error) throw error;
      entry = data;
    }

    // Cache locally
    if (!DB.techJournal) DB.techJournal = [];
    DB.techJournal.unshift(entry);

    // Send positive notification to tech immediately
    if (_tjState.type === 'positive' && entry.tech_id && _sb) {
      await _sb.from('wt_notifications').insert({
        user_id:    entry.tech_id,
        user_name:  techName,
        type:       'journal_positive',
        title:      '👍 Great work noted by '+escHtml((typeof wtCurrentUserName==='function'?wtCurrentUserName():'')),
        message:    escHtml(_tjState.category)+': '+escHtml(desc.substring(0,100)),
        project_id: null,
      });
    }

    document.getElementById('tj-modal').remove();

    // Refresh dashboard blip if visible
    renderJournalBlip();
    showToast((entry.entry_type==='positive'?'👍':'📝')+' Entry saved for '+escHtml(techName),'success');

  } catch(e) {
    console.error('saveJournalEntry:', e);
    showToast('Error: '+e.message,'error');
    if (btn) { btn.disabled=false; btn.textContent='💾 Save Entry'; }
  }
}

// ── Journal dashboard blip ────────────────────────────────────────────────────
async function loadJournalForDash() {
  if (!_sb || !_currentUser) return;
  if (!['owner','manager','back_office','lead_tech'].includes(_currentUser.role)) return;
  try {
    var thirtyDaysAgo = new Date(Date.now()-30*86400000).toISOString().split('T')[0];
    var { data } = await _sb.from('tech_journal')
      .select('*').gte('entry_date', thirtyDaysAgo)
      .order('created_at',{ascending:false}).limit(50);
    if (data) { DB.techJournal = data; renderJournalBlip(); }
  } catch(e) { console.warn('loadJournalForDash:', e); }
}

function renderJournalBlip() {
  var el = document.getElementById('dash-journal-blip');
  if (!el) return;

  var entries = DB.techJournal || [];
  if (!entries.length) {
    el.innerHTML = '<div style="color:#90a4ae;font-size:13px">No entries this month.</div>';
    return;
  }

  // This week
  var weekAgo = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
  var thisWeek = entries.filter(function(e){ return e.entry_date >= weekAgo; });
  var posWeek  = thisWeek.filter(function(e){ return e.entry_type==='positive'; }).length;
  var negWeek  = thisWeek.filter(function(e){ return e.entry_type==='negative'; }).length;

  // Recent entries (last 3)
  var recent = entries.slice(0,3);

  el.innerHTML =
    // Summary counts
    '<div style="display:flex;gap:12px;margin-bottom:12px">'+
      '<div style="flex:1;padding:10px;background:#e8f5e9;border-radius:8px;text-align:center">'+
        '<div style="font-size:22px;font-weight:800;color:#2e7d32">'+posWeek+'</div>'+
        '<div style="font-size:10px;font-weight:700;color:#2e7d32">POSITIVE</div>'+
        '<div style="font-size:9px;color:#546e7a">this week</div>'+
      '</div>'+
      '<div style="flex:1;padding:10px;background:#ffebee;border-radius:8px;text-align:center">'+
        '<div style="font-size:22px;font-weight:800;color:#c62828">'+negWeek+'</div>'+
        '<div style="font-size:10px;font-weight:700;color:#c62828">NEGATIVE</div>'+
        '<div style="font-size:9px;color:#546e7a">this week</div>'+
      '</div>'+
    '</div>'+
    // Recent entries
    recent.map(function(e){
      var isPos = e.entry_type==='positive';
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f0f0f0">'+
        '<span style="font-size:16px">'+(isPos?'👍':'⚠️')+'</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:700;color:#0d1b2a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+
            escHtml(e.tech_name)+' — '+escHtml(e.category)+
          '</div>'+
          '<div style="font-size:11px;color:#90a4ae">'+escHtml(formatTimeAgo?formatTimeAgo(e.created_at):e.entry_date)+'</div>'+
        '</div>'+
      '</div>';
    }).join('')+
    // Actions
    '<div style="display:flex;gap:8px;margin-top:10px">'+
      '<button onclick="openJournalEntry(\'\')" class="btn btn-primary btn-sm" style="flex:1">'+
        '📝 Log Entry</button>'+
      '<button onclick="openTechJournalView()" class="btn btn-outline btn-sm" style="flex:1">'+
        'View All</button>'+
    '</div>'+
    '<div id="dash-log-rates" style="margin-top:10px"></div>';
  setTimeout(renderTeamLogRates, 1200);
}

// ── Full journal view ─────────────────────────────────────────────────────────
async function openTechJournalView(techName) {
  var entries = DB.techJournal || [];

  // Filter by tech if specified
  if (techName) {
    entries = entries.filter(function(e){ return e.tech_name===techName; });
  }

  // Load fresh from Supabase
  if (_sb) {
    try {
      var q = _sb.from('tech_journal').select('*').order('entry_date',{ascending:false}).limit(200);
      if (techName) q = q.eq('tech_name', techName);
      var { data } = await q;
      if (data) entries = data;
    } catch(e) { console.warn(e); }
  }

  var team = [...new Set((DB.team||[]).map(function(m){ return m.name; }))];

  var html = '<div class="modal-overlay open" id="tj-view-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:700px;max-height:90vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<h3>📋 Tech Journal</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'tj-view-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center">'+
        // Tech filter
        '<select id="tj-filter-tech" onchange="tjFilterView()" style="padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px">'+
          '<option value="">All Techs</option>'+
          team.map(function(n){ return '<option value="'+escHtml(n)+'"'+(n===techName?' selected':'')+'>'+escHtml(n)+'</option>'; }).join('')+
        '</select>'+
        // Type filter
        '<select id="tj-filter-type" onchange="tjFilterView()" style="padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px">'+
          '<option value="">All Entries</option>'+
          '<option value="positive">👍 Positive Only</option>'+
          '<option value="negative">⚠️ Negative Only</option>'+
        '</select>'+
        // Date range
        '<select id="tj-filter-period" onchange="tjFilterView()" style="padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px">'+
          '<option value="30">Last 30 days</option>'+
          '<option value="90">Last Quarter</option>'+
          '<option value="180">Last 6 Months</option>'+
          '<option value="365">Last Year</option>'+
          '<option value="all">All Time</option>'+
        '</select>'+
        '<button onclick="openJournalEntry(\'\')" class="btn btn-primary btn-sm" style="margin-left:auto">+ New Entry</button>'+
      '</div>'+
      '<div id="tj-view-list" style="overflow-y:auto;flex:1;padding:0 16px">'+
        tjRenderEntryList(entries)+
      '</div>'+
    '</div>'+
  '</div>';

  var e = document.getElementById('tj-view-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function tjRenderEntryList(entries) {
  if (!entries.length) return '<div style="text-align:center;padding:40px;color:#90a4ae">'+
    '<div style="font-size:32px;margin-bottom:12px">📋</div>'+
    '<div style="font-size:14px;font-weight:600">No entries found</div>'+
  '</div>';

  return entries.map(function(e){
    var isPos = e.entry_type === 'positive';
    return '<div style="padding:14px 0;border-bottom:1px solid #f0f0f0;display:flex;gap:12px;align-items:flex-start">'+
      // Type indicator
      '<div style="width:36px;height:36px;border-radius:50%;background:'+(isPos?'#e8f5e9':'#ffebee')+';'+
        'display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+
        (isPos?'👍':'⚠️')+
      '</div>'+
      // Content
      '<div style="flex:1;min-width:0">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:4px">'+
          '<div style="font-size:14px;font-weight:800;color:#0d1b2a">'+escHtml(e.tech_name)+'</div>'+
          '<div style="font-size:11px;color:#90a4ae">'+escHtml(e.entry_date)+'</div>'+
        '</div>'+
        '<div style="font-size:12px;font-weight:700;color:'+(isPos?'#2e7d32':'#c62828')+';margin-bottom:6px">'+
          escHtml(e.category)+
        '</div>'+
        '<div style="font-size:13px;color:#0d1b2a;line-height:1.5">'+escHtml(e.description)+'</div>'+
        (e.wo_number?'<div style="font-size:11px;color:#1565c0;margin-top:4px">WO: '+escHtml(e.wo_number)+'</div>':'')+
        '<div style="font-size:11px;color:#90a4ae;margin-top:4px">Logged by: '+escHtml(e.entered_by_name)+'</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

async function renderTeamLogRates() {
  var el = document.getElementById('dash-log-rates');
  if (!el) return;
  var today = getTodayISO ? getTodayISO() : new Date().toISOString().split('T')[0];
  var monthStart = today.substring(0,7)+'-01';

  var fieldTechs = (DB.team||[]).filter(function(m){
    return m.role==='helper_tech'||m.role==='lead_tech'||m.role==='field_tech';
  }).slice(0,6);

  if (!fieldTechs.length) return;

  el.innerHTML = '<div style="font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Log Rate — This Month</div>';

  for (var i=0; i<fieldTechs.length; i++) {
    var m = fieldTechs[i];
    var stats = await calcLogCompletionRate(m.name, monthStart, today);
    if (!stats.worked) continue;
    var color = stats.rate>=80?'#2e7d32':stats.rate>=50?'#e65100':'#c62828';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f5';
    row.innerHTML =
      '<div style="font-size:12px;font-weight:600;color:#0d1b2a;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(m.name)+'</div>'+
      '<div style="background:#e0e0e0;border-radius:4px;height:6px;width:60px;flex-shrink:0">'+
        '<div style="background:'+color+';height:6px;border-radius:4px;width:'+stats.rate+'%"></div>'+
      '</div>'+
      '<div style="font-size:12px;font-weight:800;color:'+color+';min-width:36px;text-align:right">'+stats.rate+'%</div>';
    el.appendChild(row);
  }
}

async function tjFilterView() {
  var tech   = (document.getElementById('tj-filter-tech')||{}).value||'';
  var type   = (document.getElementById('tj-filter-type')||{}).value||'';
  var period = (document.getElementById('tj-filter-period')||{}).value||'30';

  var cutoff = period==='all' ? null :
    new Date(Date.now()-parseInt(period)*86400000).toISOString().split('T')[0];

  if (!_sb) return;
  try {
    var q = _sb.from('tech_journal').select('*').order('entry_date',{ascending:false}).limit(200);
    if (tech)   q = q.eq('tech_name', tech);
    if (type)   q = q.eq('entry_type', type);
    if (cutoff) q = q.gte('entry_date', cutoff);
    var { data } = await q;
    var list = document.getElementById('tj-view-list');
    if (list) list.innerHTML = tjRenderEntryList(data||[]);
  } catch(e) { showToast('Error loading entries','error'); }
}

// ── Quarterly review per tech ─────────────────────────────────────────────────

// ── Log completion rate calculation ──────────────────────────────────────────
// Compares days a tech worked (from workDays) vs days they submitted a field log
async function calcLogCompletionRate(techName, startDate, endDate) {
  // Work days in range
  var workDays = (DB.workDays||[]).filter(function(d){
    return d.techName === techName &&
           d.date >= startDate &&
           (!endDate || d.date <= endDate);
  });

  // Also check clock sessions for days not in workDays yet
  var clockDays = (DB.timeEntries||[]).filter(function(e){
    return !e.deleted &&
           e.techName === techName &&
           e.date >= startDate &&
           (!endDate || e.date <= endDate) &&
           e.entryType === 'day_end';
  }).map(function(e){ return e.date; });

  // Combine unique worked dates
  var workedSet = {};
  workDays.forEach(function(d){ workedSet[d.date] = true; });
  clockDays.forEach(function(d){ workedSet[d] = true; });
  var workedDates = Object.keys(workedSet);

  if (!workedDates.length) return { rate: null, worked: 0, logged: 0 };

  // Get field log dates from Supabase
  var loggedDates = {};
  if (_sb) {
    try {
      var { data } = await _sb.from('wo_field_logs')
        .select('log_date')
        .eq('tech_name', techName)
        .gte('log_date', startDate)
        .lte('log_date', endDate || new Date().toISOString().split('T')[0]);
      if (data) data.forEach(function(r){ loggedDates[r.log_date] = true; });
    } catch(e) { console.warn('calcLogCompletionRate:', e); }
  }

  // Count how many worked days have at least one field log
  var loggedCount = workedDates.filter(function(d){ return loggedDates[d]; }).length;
  var rate = Math.round(loggedCount / workedDates.length * 100);

  return {
    rate:   rate,
    worked: workedDates.length,
    logged: loggedCount,
    missed: workedDates.length - loggedCount,
  };
}

async function openQuarterlyReview(techName) {
  var now = new Date();
  var quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
  var qStart = quarterStart.toISOString().split('T')[0];

  var entries = [];
  if (_sb) {
    try {
      var { data } = await _sb.from('tech_journal')
        .select('*').eq('tech_name', techName)
        .gte('entry_date', qStart).order('entry_date',{ascending:false});
      entries = data || [];
    } catch(e) {}
  }

  var pos = entries.filter(function(e){ return e.entry_type==='positive'; });
  var neg = entries.filter(function(e){ return e.entry_type==='negative'; });
  var member = (DB.team||[]).find(function(m){ return m.name===techName; }) || {};

  // Real log completion rate from wo_field_logs vs worked days
  var logStats = await calcLogCompletionRate(techName, qStart, new Date().toISOString().split('T')[0]);
  var logRate = logStats.rate;

  var qLabel = ['Q1','Q2','Q3','Q4'][Math.floor(now.getMonth()/3)]+' '+now.getFullYear();

  var html = '<div class="modal-overlay open" id="tj-review-modal" onclick="if(event.target===this)this.remove()">'+
    '<div class="modal-box" style="max-width:600px;max-height:90vh;display:flex;flex-direction:column">'+
      '<div class="modal-head" style="flex-shrink:0">'+
        '<h3>📊 Quarterly Review — '+escHtml(techName)+'</h3>'+
        '<button class="btn-icon" onclick="document.getElementById(\'tj-review-modal\').remove()">&#x2715;</button>'+
      '</div>'+
      '<div style="overflow-y:auto;flex:1;padding:20px">'+

        // Header
        '<div style="background:#f5f7fa;border-radius:12px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:14px">'+
          '<div style="width:52px;height:52px;border-radius:50%;background:#1565c0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;flex-shrink:0">'+
            escHtml((techName||'?').charAt(0).toUpperCase())+
          '</div>'+
          '<div>'+
            '<div style="font-size:18px;font-weight:800;color:#0d1b2a">'+escHtml(techName)+'</div>'+
            '<div style="font-size:13px;color:#546e7a">'+escHtml(member.role||member.title||'Technician')+' · '+qLabel+'</div>'+
          '</div>'+
        '</div>'+

        // Score cards
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">'+
          '<div style="padding:14px;background:#e8f5e9;border-radius:10px;text-align:center">'+
            '<div style="font-size:28px;font-weight:800;color:#2e7d32">'+pos.length+'</div>'+
            '<div style="font-size:11px;font-weight:700;color:#2e7d32">POSITIVE</div>'+
          '</div>'+
          '<div style="padding:14px;background:#ffebee;border-radius:10px;text-align:center">'+
            '<div style="font-size:28px;font-weight:800;color:#c62828">'+neg.length+'</div>'+
            '<div style="font-size:11px;font-weight:700;color:#c62828">NEGATIVE</div>'+
          '</div>'+
          '<div style="padding:14px;background:'+(logRate===null?'#f5f5f5':logRate>=80?'#e8f5e9':logRate>=50?'#fff3e0':'#ffebee')+';border-radius:10px;text-align:center">'+
            '<div style="font-size:28px;font-weight:800;color:'+(logRate===null?'#90a4ae':logRate>=80?'#2e7d32':logRate>=50?'#e65100':'#c62828')+'">'+(logRate!==null?logRate+'%':'—')+'</div>'+
            '<div style="font-size:11px;font-weight:700;color:'+(logRate===null?'#90a4ae':logRate>=80?'#2e7d32':logRate>=50?'#e65100':'#c62828')+'">LOG RATE</div>'+
            (logStats.worked?'<div style="font-size:10px;color:#546e7a;margin-top:2px">'+logStats.logged+'/'+logStats.worked+' days</div>':'')+
          '</div>'+
        '</div>'+

        // Journal entries timeline
        '<div style="font-size:14px;font-weight:800;color:#0d1b2a;margin-bottom:10px">Journal Entries This Quarter</div>'+
        (entries.length
          ? tjRenderEntryList(entries)
          : '<div style="color:#90a4ae;font-size:13px;padding:16px 0">No journal entries this quarter.</div>')+

        // Manager notes area for review
        '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e0e0e0">'+
          '<label class="wiz-label">REVIEW NOTES (private — for your records)</label>'+
          '<textarea id="tj-review-notes" class="form-control" rows="4" placeholder="Your observations for this review period..."></textarea>'+
          '<button class="btn btn-primary" style="width:100%;margin-top:10px" onclick="openJournalEntry(\''+escHtml(techName)+'\')">+ Add Journal Entry</button>'+
        '</div>'+

      '</div>'+
    '</div>'+
  '</div>';

  var e = document.getElementById('tj-review-modal'); if(e) e.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}


async function wtRenderTechDashboard() {
  var el = document.getElementById('page-dash');
  var _techRole = typeof _currentUser !== 'undefined' && _currentUser ? _currentUser.role : null;
  if (!el || _techRole !== 'helper_tech') return;

  var today     = getTodayISO ? getTodayISO() : new Date().toISOString().split('T')[0];
  var myName    = (typeof wtCurrentUserName==='function'?wtCurrentUserName():'');

  // Gather all async data FIRST, then build html all at once
  var myProjects = (DB.wtProjects||[]).filter(function(p){
    return (p.status==='active'||p.status==='paused') && (typeof wtIsAssigned==='function'?wtIsAssigned(p.id):true);
  });

  var myJobs = ((typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[]))).filter(function(j){
    return j.scheduledDate === today &&
      (j.assignedTechs||j.techs||[]).some(function(t){
        return (typeof t==='string'?t:t.name||'').toLowerCase() === myName.toLowerCase();
      });
  });

  var myFlags = [];
  myProjects.forEach(function(p){
    var d = WT.data[p.id];
    if (d && d.flags) d.flags.filter(function(f){ return f.status!=='resolved'; })
      .forEach(function(f){ myFlags.push(Object.assign({},f,{projectName:p.name})); });
  });

  // Async: log completion rate for this month
  var monthStart = today.substring(0,7)+'-01';
  var logStats   = await calcLogCompletionRate(myName, monthStart, today);

  // Clock status
  var clocked    = _clockState && _clockState.status !== 'out';
  var clockLabel = clocked ? 'Clocked in'+((_clockState.jobName)?' — '+_clockState.jobName:'') : 'Not clocked in';
  var clockColor = clocked ? '#2e7d32' : '#90a4ae';

  // Log rate section
  var logRateHtml = '';
  if (logStats && logStats.worked > 0) {
    var lrClr = logStats.rate>=80?'#2e7d32':logStats.rate>=50?'#e65100':'#c62828';
    var lrBg  = logStats.rate>=80?'#e8f5e9':logStats.rate>=50?'#fff3e0':'#ffebee';
    logRateHtml =
      '<div style="background:'+lrBg+';border-radius:12px;padding:16px;margin-bottom:14px;'+
        'display:flex;align-items:center;justify-content:space-between">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:800;color:#0d1b2a">Field Log Completion</div>'+
          '<div style="font-size:12px;color:#546e7a;margin-top:2px">This month: '+logStats.logged+' of '+logStats.worked+' days logged</div>'+
        '</div>'+
        '<div style="font-size:28px;font-weight:800;color:'+lrClr+'">'+logStats.rate+'%</div>'+
      '</div>';
  }

  // Notifications section
  var notifHtml = typeof wtRenderTechNotifications === 'function' ? wtRenderTechNotifications() : '';

  // ── Build html all at once ─────────────────────────────────────────────
  el.innerHTML =
    '<div style="padding:16px;max-width:600px;margin:0 auto">'+

    // Header
    '<div style="margin-bottom:20px">'+
      '<div style="font-size:22px;font-weight:800;color:#0d1b2a">Good '+
        (new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening')+', '+escHtml(myName.split(' ')[0])+'</div>'+
      '<div style="font-size:13px;color:#546e7a;margin-top:2px">'+
        (function(){var _d=new Date(today+'T12:00:00');return _d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});})()+'</div>'+
    '</div>'+

    // Clock card
    '<div style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;padding:16px;margin-bottom:14px;'+
        'display:flex;align-items:center;justify-content:space-between">'+
      '<div>'+
        '<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Clock Status</div>'+
        '<div style="font-size:14px;font-weight:700;color:'+clockColor+'">'+(clocked?'🟢':'⚪')+' '+escHtml(clockLabel)+'</div>'+
      '</div>'+
      '<button onclick="goPage(&quot;field&quot;)" style="padding:8px 16px;background:#1565c0;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">⏱ Clock</button>'+
    '</div>'+

    // Today's schedule
    (myJobs.length ?
      '<div style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;padding:16px;margin-bottom:14px">'+
        '<div style="font-size:13px;font-weight:800;color:#0d1b2a;margin-bottom:12px">📅 Today&#39;s Schedule</div>'+
        myJobs.map(function(j){
          return '<div style="padding:10px 0;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between">'+
            '<div>'+
              '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(j.name||'Job')+'</div>'+
              '<div style="font-size:11px;color:#546e7a">'+escHtml(j.customer||j.customerName||'')+(j.siteAddr?' · '+escHtml(j.siteAddr):'')+'</div>'+
            '</div>'+
            '<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:10px;background:#e3f2fd;color:#1565c0">'+escHtml(j.status||'Scheduled')+'</span>'+
          '</div>';
        }).join('')+
      '</div>'
    : '') +

    // My projects
    (myProjects.length ?
      '<div style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;padding:16px;margin-bottom:14px">'+
        '<div style="font-size:13px;font-weight:800;color:#0d1b2a;margin-bottom:12px">📋 My Projects</div>'+
        myProjects.map(function(p){
          var d = WT.data[p.id] || {};
          var items = d.items || [];
          var confirmed = items.filter(function(i){ return typeof wtItemPct==='function'&&(typeof wtItemPct==='function'&&wtItemPct(i)===100); }).length;
          var pct = items.length ? Math.round(confirmed/items.length*100) : 0;
          return '<div onclick="wtOpenProject(\'+p.id+\')\" style="padding:12px 0;border-bottom:1px solid #f0f0f0;cursor:pointer">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'+
              '<div style="font-size:14px;font-weight:700;color:#0d1b2a">'+escHtml(p.name)+'</div>'+
              '<span style="font-size:12px;font-weight:700;color:'+(pct===100?'#2e7d32':'#1565c0')+'">'+pct+'%</span>'+
            '</div>'+
            '<div style="background:#e0e0e0;border-radius:3px;height:6px">'+
              '<div style="background:'+(pct===100?'#2e7d32':'#1565c0')+';height:6px;border-radius:3px;width:'+pct+'%"></div>'+
            '</div>'+
          '</div>';
        }).join('')+
      '</div>'
    :
      '<div style="background:#f5f7fa;border-radius:12px;padding:24px;text-align:center;margin-bottom:14px;color:#90a4ae">'+
        '<div style="font-size:28px;margin-bottom:8px">📋</div>'+
        '<div style="font-size:14px;font-weight:600">No projects assigned yet</div>'+
        '<div style="font-size:12px;margin-top:4px">Your manager will assign you to a project</div>'+
      '</div>'
    ) +

    // Open flags
    (myFlags.length ?
      '<div style="background:#fff3e0;border-radius:12px;border:1px solid #ffe0b2;padding:16px;margin-bottom:14px">'+
        '<div style="font-size:13px;font-weight:800;color:#e65100;margin-bottom:10px">🚩 Open Issues ('+myFlags.length+')</div>'+
        myFlags.slice(0,3).map(function(f){
          return '<div style="font-size:13px;padding:6px 0;border-bottom:1px solid #ffe0b2">'+
            '<div style="font-weight:600">'+escHtml(f.title||f.description||'Issue')+'</div>'+
            '<div style="font-size:11px;color:#e65100">'+escHtml(f.projectName||'')+'</div>'+
          '</div>';
        }).join('')+
      '</div>'
    : '') +

    // Log completion rate
    logRateHtml +

    // Notifications
    notifHtml +

    '</div>';
}



// ── Main Dashboard Renderer ────────────────────────────────────────────────
function setT(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderDash() {
  // Field techs get their own dashboard — check role directly, no dependency on worktracking.js
  var _role = typeof _currentUser !== 'undefined' && _currentUser ? _currentUser.role : null;
  if (_role === 'helper_tech') {
    setTimeout(function(){
      if (typeof wtRenderTechDashboard === 'function') wtRenderTechDashboard();
    }, 100);
    return;
  }
  // Load journal data for dashboard blip
  setTimeout(loadJournalForDash, 800);

  const today = getTodayISO();

  // ── Stats strip ────────────────────────────────────────────────────────────
  var quotes    = DB.quotes || [];
  var jobs      = typeof _getActiveWOsAsJobs==="function" ? _getActiveWOsAsJobs() : (DB.jobs||[]);
  var workDays  = DB.workDays || [];
  var tools     = DB.tools  || [];
  var workOrders = DB.workOrders || [];

  // Total quotes
  setT('ds-tq', quotes.length);

  // Revenue won
  var _rperiod = getRevWonPeriod();
  var _rstart  = _revWonPeriodStart(_rperiod);
  var wonRev = quotes.filter(function(q){ return q.status==='approved'||q.status==='won'; })
    .filter(function(q){ var d=_quoteWonDate(q); return d && new Date(d) >= _rstart; })
    .reduce(function(s,q){ return s+(parseFloat(q.total)||0); }, 0);
  setT('ds-won-rev', '$'+wonRev.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}));
  // Highlight the active period pill (Mo / Qtr / YTD)
  ['month','quarter','ytd'].forEach(function(p){
    var el=document.getElementById('ds-rp-'+p); if(!el) return;
    var on=(p===_rperiod);
    el.style.background = on ? '#2e7d32' : 'rgba(255,255,255,.65)';
    el.style.color      = on ? '#fff' : '#2e7d32';
    el.style.fontWeight = on ? '800' : '700';
  });

  // Active jobs
  // jobs = active work orders (finished states already excluded). "Active" here = work has started
  // (anything past the brand-new state), so the tile reflects jobs actually being worked.
  var activeJobs = jobs.filter(function(j){ return (j.status||'').toLowerCase().indexOf('new')<0; });
  setT('ds-active-jobs', activeJobs.length);

  // Clocked in today
  var clockedIn = workDays.filter(function(d){ return d.date===today && !d.totalPaidMins; }).length;
  setT('ds-clocked-in', clockedIn+' / '+(DB.team||[]).filter(function(m){ return m.active!==false&&(m.role==='helper_tech'||m.role==='lead_tech'); }).length);

  // Avg project % (Work Tracking)
  var wtProjects = DB.wtProjects || [];
  var wtPcts = wtProjects.map(function(p){
    var d = (typeof WT!=='undefined'&&WT.data&&WT.data[p.id]) || {};
    var items = d.items || [];
    if (!items.length) return 0;
    var done = items.filter(function(i){ return typeof wtItemPct==='function'&&(typeof wtItemPct==='function'&&wtItemPct(i)===100); }).length;
    return Math.round(done/items.length*100);
  });
  var wtAvg = wtPcts.length ? Math.round(wtPcts.reduce(function(s,v){ return s+v; },0)/wtPcts.length) : null;
  setT('ds-wt-pct', wtAvg!==null ? wtAvg+'%' : '—');

  // Tools out
  var toolsOut = tools.filter(function(t){ return t.status==='checked_out'||t.status==='out'; }).length;
  setT('ds-tools-out', toolsOut);

  // Follow-ups due
  var fuDue = quotes.filter(function(q){
    return q.followupDate && q.followupDate <= today &&
           q.status!=='approved'&&q.status!=='won'&&q.status!=='declined';
  }).length;
  setT('ds-followups', fuDue);

  // Open flags (WT)
  var openFlags = 0;
  wtProjects.forEach(function(p){
    var d = (typeof WT!=='undefined'&&WT.data&&WT.data[p.id]) || {};
    if (d.flags) openFlags += d.flags.filter(function(f){ return f.status!=='resolved'; }).length;
  });
  setT('ds-flags', openFlags);

  // Open WOs
  var openWOs  = workOrders.filter(function(w){
    if (w.deleted) return false;
    var s=(w.status||'').toLowerCase();
    return s.indexOf('billed')<0 && s.indexOf('void')<0 && s.indexOf('closed')<0 && s.indexOf('complete')<0 && s.indexOf('invoiced')<0;
  });
  var urgentWO = workOrders.filter(function(w){ return !w.deleted&&w.status==='urgent'; }).length;
  var woTile = document.getElementById('ds-wo-tile');
  if (woTile) {
    woTile.innerHTML =
      '<div class="dash-stat-val">'+openWOs.length+'</div>'+
      '<div class="dash-stat-lbl">OPEN WOs</div>'+
      (urgentWO ? '<div style="font-size:10px;font-weight:700;color:#c62828;margin-top:2px">⚠ '+urgentWO+' URGENT</div>' : '');
  }

  // Last updated
  var lu = document.getElementById('dash-last-updated');
  if (lu) lu.textContent = 'Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});

  // ── Field Activity ─────────────────────────────────────────────────────────
  var fieldEl = document.getElementById('dash-field-activity');
  if (fieldEl) {
    var todayDays = workDays.filter(function(d){ return d.date===today; });
    var _fstat = function(m){ var wd=todayDays.find(function(d){ return d.techName===m.name; }); return wd ? (wd.totalPaidMins?'out':wd.currentStatus||'in') : 'out'; };
    // Show ALL active members (card scrolls); put anyone clocked in / active at the top.
    var team = (DB.team||[]).filter(function(m){ return m.active!==false; });
    team.sort(function(a,b){ var ao=_fstat(a)==='out'?1:0, bo=_fstat(b)==='out'?1:0; return ao!==bo ? ao-bo : (a.name||'').localeCompare(b.name||''); });
    fieldEl.innerHTML = team.map(function(m){
      var wd = todayDays.find(function(d){ return d.techName===m.name; });
      var status = _fstat(m);
      var statusLabels = {in:'Clocked In',out:'Not started',break:'On Break',lunch:'Lunch',traveling:'Traveling',onsite:'On Site'};
      var statusClasses = {in:'in',out:'out',break:'break',lunch:'lunch',traveling:'in',onsite:'in'};
      var initials = (m.name||'?').split(' ').map(function(w){ return w[0]||''; }).slice(0,2).join('').toUpperCase();
      return '<div class="dash-field-row">'+
        '<div class="dash-field-avatar" style="background:#1565c0;color:#fff">'+initials+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:700;color:#0d1b2a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(m.name)+'</div>'+
          (wd&&wd.jobName?'<div style="font-size:11px;color:#546e7a">'+escHtml(wd.jobName)+'</div>':'')+'</div>'+
        '<span class="dash-field-status '+(statusClasses[status]||'out')+'">'+escHtml(statusLabels[status]||'Not started')+'</span>'+
      '</div>';
    }).join('');
  }

  // ── Active Jobs ────────────────────────────────────────────────────────────
  var jobsEl = document.getElementById('dash-jobs-list');
  if (jobsEl) {
    var active = jobs.filter(function(j){ return j.status!=='completed'&&j.status!=='cancelled'; }).slice(0,6);
    if (!active.length) {
      jobsEl.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No active jobs</div>';
    } else {
      jobsEl.innerHTML = active.map(function(j){
        var statusColor = j.status==='In Progress'||j.status==='in_progress'?'#1565c0':'#546e7a';
        return '<div style="padding:8px 0;border-bottom:1px solid #f5f5f5;display:flex;justify-content:space-between;align-items:center">'+
          '<div>'+
            '<div style="font-size:13px;font-weight:700;color:#0d1b2a;cursor:pointer" onclick="goPage(\'jobs\')">'+escHtml(stripHtmlToText(j.name)||'Job')+'</div>'+
            '<div style="font-size:11px;color:#546e7a">'+(j.customer||j.customerName||'')+(j.assignedTechs&&j.assignedTechs.length?' — '+j.assignedTechs.slice(0,2).join(', '):'')+'</div>'+
          '</div>'+
          '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#e3f2fd;color:'+statusColor+'">'+escHtml(j.status||'Scheduled')+'</span>'+
        '</div>';
      }).join('');
    }
  }

  // ── Quote Pipeline ─────────────────────────────────────────────────────────
  var pipelineBar = document.getElementById('pipeline-bar');
  var pipelineLeg = document.getElementById('pipeline-legend');
  var pipelineDet = document.getElementById('pipeline-detail');
  var recentList  = document.getElementById('dash-recent-quotes-list');

  if (pipelineBar) {
    var statuses = ['draft','sent','followup','approved','declined'];
    var colors   = {draft:'#607d8b',sent:'#1565c0',followup:'#7b1fa2',approved:'#2e7d32',declined:'#c62828'};
    var labels   = {draft:'Draft',sent:'Sent',followup:'Follow-Up',approved:'Won',declined:'Lost'};
    var counts   = {};
    statuses.forEach(function(s){ counts[s]=0; });
    quotes.forEach(function(q){ if (counts[q.status]!==undefined) counts[q.status]++; });
    var total = quotes.length || 1;
    pipelineBar.innerHTML = statuses.map(function(s){
      var pct = Math.round(counts[s]/total*100);
      return pct>0?'<div style="height:100%;width:'+pct+'%;background:'+colors[s]+';display:inline-block;transition:width .3s" title="'+labels[s]+': '+counts[s]+'"></div>':'';
    }).join('');
    if (pipelineLeg) pipelineLeg.innerHTML = statuses.filter(function(s){return counts[s]>0;}).map(function(s){
      return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">'+
        '<span style="width:10px;height:10px;border-radius:50%;background:'+colors[s]+';display:inline-block"></span>'+
        '<span style="font-size:11px;color:#546e7a">'+labels[s]+': <strong>'+counts[s]+'</strong></span></span>';
    }).join('');
    var won = counts['approved']||0, total2 = quotes.length||1;
    var wr = Math.round(won/total2*100);
    if (pipelineDet) pipelineDet.textContent = 'Win rate: '+wr+'%  ·  '+quotes.length+' total quotes';
  }

  if (recentList) {
    var recent = quotes.slice().sort(function(a,b){ return (b.num||0)-(a.num||0); }).slice(0,5);
    recentList.innerHTML = recent.map(function(q){
      var statusColors = {draft:'#546e7a',sent:'#1565c0',followup:'#7b1fa2',approved:'#2e7d32',declined:'#c62828'};
      var sc = statusColors[q.status]||'#546e7a';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f5f5f5;cursor:pointer" onclick="editQuote(\''+q.id+'\')">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:#1565c0">'+escHtml(q.num || ('Q-'+q.id))+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(q.cn||'')+(q.projName?' — '+escHtml(q.projName):'')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-size:13px;font-weight:700">$'+((parseFloat(q.total)||0).toLocaleString())+'</div>'+
          '<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:'+sc+'22;color:'+sc+'">'+escHtml((q.status||'').toUpperCase())+'</span>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  // ── Project Progress ───────────────────────────────────────────────────────
  var wtEl = document.getElementById('dash-wt-projects');
  if (wtEl) {
    var activeWTP = wtProjects.filter(function(p){ return p.status==='active'; }).slice(0,4);
    if (!activeWTP.length) {
      wtEl.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:8px 0">No active projects</div>';
    } else {
      wtEl.innerHTML = activeWTP.map(function(p){
        var d = (typeof WT!=='undefined'&&WT.data&&WT.data[p.id]) || {};
        var items = d.items||[];
        var done  = items.filter(function(i){ return typeof wtItemPct==='function'&&(typeof wtItemPct==='function'&&wtItemPct(i)===100); }).length;
        var pct   = items.length ? Math.round(done/items.length*100) : 0;
        var phases = (d.checkoffs||[]);
        var riDone = phases.filter(function(c){ return c.phase==='rough_in'&&c.status==='confirmed'; }).length;
        var riTot  = items.length;
        return '<div class="dash-wt-row" style="cursor:pointer" onclick="goPage(\'worktracking\')">'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'+
            '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+escHtml(p.name)+'</div>'+
            '<div style="font-size:12px;font-weight:700;color:'+(pct===100?'#2e7d32':'#1565c0')+'">'+pct+'%</div>'+
          '</div>'+
          '<div style="background:#e0e0e0;border-radius:3px;height:5px">'+
            '<div style="background:'+(pct===100?'#2e7d32':'#1565c0')+';height:5px;border-radius:3px;width:'+pct+'%;transition:width .4s"></div>'+
          '</div>'+
          '<div style="font-size:10px;color:#90a4ae;margin-top:3px">R: '+riDone+'/'+riTot+' &nbsp; D: 0/0 &nbsp; T: 0/0</div>'+
        '</div>';
      }).join('');
    }
  }

  // ── Tools Overview ─────────────────────────────────────────────────────────
  var toolsEl = document.getElementById('dash-tools-overview');
  if (toolsEl) {
    if (!tools.length) {
      toolsEl.innerHTML = '<div style="color:#90a4ae;font-size:13px">All tools accounted for.</div>';
    } else {
      var outTools = tools.filter(function(t){ return t.status==='checked_out'||t.status==='out'; }).slice(0,5);
      toolsEl.innerHTML = outTools.length ?
        outTools.map(function(t){
          return '<div style="font-size:13px;padding:4px 0;border-bottom:1px solid #f5f5f5">'+
            escHtml(t.name||'Tool')+' — <strong>'+escHtml(t.checkedOutTo||'')+'</strong></div>';
        }).join('') :
        '<div style="color:#90a4ae;font-size:13px">All tools accounted for.</div>';
    }
  }

  // Inventory reorder alert
  if (typeof renderDashReorderAlert === 'function') renderDashReorderAlert();
}
