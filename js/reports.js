// =============================================
// STAGE 5: CONTROL + FOLLOW-UP SYSTEM
// =============================================
function getTodayISO(){ return new Date().toISOString().split('T')[0]; }
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
function getQuotePriority(q){
  if (!q) return {label:'Normal', tone:'normal', sort:50};
  var status = q.status || 'draft';
  var ready = (q.readiness || '').toUpperCase();
  if ((status === 'sent' || status === 'followup') && isFollowupOverdue(q)) return {label:'Critical', tone:'critical', sort:1};
  if ((status === 'sent' || status === 'followup') && isFollowupDue(q)) return {label:'High', tone:'high', sort:2};
  if (status === 'draft' && ready !== 'READY') return {label:'Needs Work', tone:'needswork', sort:3};
  var dt = q.dt || q.createdAt || '';
  if (dt) {
    var age = Math.floor((new Date(getTodayISO()) - new Date(dt)) / 86400000);
    if (age >= 30 && status !== 'approved' && status !== 'declined') return {label:'Aging 30+', tone:'critical', sort:4};
    if (age >= 14 && status !== 'approved' && status !== 'declined') return {label:'Aging 14+', tone:'high', sort:5};
    if (age >= 7  && status !== 'approved' && status !== 'declined') return {label:'Aging 7+', tone:'watch', sort:6};
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
    targetMargin: parseFloat((document.getElementById('qq-mk')||{}).value)||35,
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
    svcContract: getSvcContractData(),
    execSummary: existing && existing.execSummary ? existing.execSummary : '',
    proposalSections: getProposalSections(),
    markup: totals.totalMaterialCost > 0 ? ((totals.materialSell / totals.totalMaterialCost - 1)*100).toFixed(1) : '0',
    subtotal: totals.sellBeforeTax,
    margin: totals.achievedMarginPct,
    items: JSON.parse(JSON.stringify(lineItems)),
    createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString()
  };
}

function qqFieldIds(){
  return ['qq-cn','qq-contact-name','qq-ph','qq-em','qq-contact-title','qq-ad','qq-city','qq-state','qq-zip','qq-jn','qq-jt','qq-env','qq-dt','qq-num','qq-rep','qq-vu','qq-followup','qq-created','qq-pt','qq-notes','qq-tc','qq-int','qq-status','qq-lr','qq-mk','qq-tx','qq-disc','lumpsum-label','pd-men','pd-days','pd-rate','pd-rooms','pd-nights','pd-lodging-rate','pd-travel-desc','pd-trips','pd-travel-rate','cqq-count','cqq-type','cqq-cable','cqq-nvr','cqq-labor','cqq-env'];
}

function clearQQ(skipConfirm) {
  if (!skipConfirm && lineItems.length > 0 && !confirm('Clear the current quote form?')) return;
  lineItems = [];
  equipmentRows = [];
  renderEquipRows();
  const eqCb = document.getElementById('equipment-enabled'); const eqBody = document.getElementById('equipment-body'); const eqLbl = document.getElementById('equipment-toggle-label');
  if (eqCb) eqCb.checked = false; if (eqBody) eqBody.classList.remove('expanded'); if (eqLbl) { eqLbl.textContent='NO'; eqLbl.className='toggle-value-label'; }
  ['permit-lv','permit-elec','permit-other','permit-none'].forEach(function(id){ const el=document.getElementById(id); if(el) el.checked=false; });
  const otd = document.getElementById('permit-other-desc'); if(otd) otd.style.display='none';
  const otx = document.getElementById('permit-other-text'); if(otx) otx.value='';
  const pco = document.getElementById('permit-coord'); if(pco) pco.value='';
  updatePermitStatus();
  ['qq-cn','qq-ph','qq-em','qq-ad','qq-city','qq-state','qq-zip','qq-jn','qq-num','qq-id','qq-notes','qq-int','qq-tc','qq-contact-name','qq-contact-title'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
  // Clear hidden ID fields and hide new contact panel
  var cidEl=document.getElementById('qq-customer-id'); if(cidEl) cidEl.value='';
  var ctidEl=document.getElementById('qq-contact-id'); if(ctidEl) ctidEl.value='';
  cancelNewContactFromQuote();
  cancelNewCustomerFromQuote();
  const lr = document.getElementById('qq-lr'); if(lr) lr.value = DB.settings.laborRate || 100;
  const mk = document.getElementById('qq-mk'); if(mk) mk.value = DB.settings.targetMargin || 35;
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
  setV('qq-rep', q.rep); setV('qq-pt', q.pt); setV('qq-tc', q.tc);
  setV('qq-notes', q.notes); setV('qq-int', q.intNotes||q.int||'');
  setV('qq-status', q.status||'draft');
  setV('qq-lr', q.laborRate||100); setV('qq-mk', q.targetMargin||q.markup||35); setV('qq-tx', q.taxRate||0); setV('qq-disc', q.discount||0);
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
  renderLI();
  calcTotals();
  clearQQDraft();
  setQQDirty(false, 'Loaded saved quote');
  updateQQStage3UI();
  qqStage4Init();
  goPage('qq');
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
  let list = DB.quotes.slice();
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
    default:
      list.sort(function(a,b){ return (b.num||'').localeCompare(a.num||'',undefined,{numeric:true}); }); break;
  }

  // Update column header sort indicators
  ['num-desc','num-asc','customer','total-desc','margin-desc','date-desc'].forEach(function(k){
    var el=document.getElementById('qsort-'+k);
    if(el) el.textContent=sort===k?'▲':sort==='num-asc'&&k==='num-asc'?'▲':'';
  });

  const tbody = document.getElementById('quotes-tbl');
  if (!tbody) return;
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><p>No quotes found.</p></td></tr>';
    return;
  }
  const healthColor = function(q){ return q.pricingHealth==='Healthy'?'color:#2e7d32':q.pricingHealth==='Watch'?'color:#e65100':'color:#c62828'; };
  tbody.innerHTML = list.map(function(q){
    const envLabel = q.envLabel || (ENV_PRESETS[q.env] ? ENV_PRESETS[q.env].label : q.env || '');
    const fuBadge = isFollowupDue(q) ? '<span class="followup-due'+(isFollowupOverdue(q)?' followup-overdue':'')+'" style="margin-left:4px">'+(isFollowupOverdue(q)?'Overdue':'Follow-Up')+'</span>' : '';
    const pr = getQuotePriority(q);
    const prColor = pr.tone==='critical'?'#c62828':pr.tone==='high'?'#e65100':pr.tone==='needswork'?'#e65100':pr.tone==='ready'?'#2e7d32':'#607d8b';
    var canConvert = q.status!=='approved' && q.status!=='declined';
    return '<tr>'+
      '<td style="font-weight:700;color:#1565c0">'+escHtml(q.num||'')+'</td>'+
      '<td>'+escHtml(q.cn||'')+'</td>'+
      '<td>'+escHtml(q.jn||'')+'</td>'+
      '<td style="font-size:11px">'+escHtml(envLabel)+'</td>'+
      '<td style="font-weight:700">'+fmt(q.total||0)+'</td>'+
      '<td style="font-weight:700;'+healthColor(q)+'">'+pct(q.achievedMargin||0)+'</td>'+
      '<td><span class="status-badge s-'+(q.status||'draft')+'">'+(q.status||'draft')+'</span>'+fuBadge+
        '<div style="font-size:10px;color:'+prColor+';font-weight:700;margin-top:3px">'+pr.label+'</div></td>'+
      '<td style="color:#90a4ae;font-size:11px">'+(q.followupDate?'📅 '+q.followupDate:(q.dt||''))+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-ghost btn-sm" data-action="viewQuote" data-id="'+q.id+'">View</button> '+
        '<button class="btn btn-outline btn-sm" data-action="editQuote" data-id="'+q.id+'">Edit</button> '+
        '<button class="btn btn-ghost btn-sm" data-action="dupQuote" data-id="'+q.id+'">Dup</button> '+
        '<button class="btn btn-convert btn-sm" '+(canConvert?'data-action="convertToJob" data-id="'+q.id+'"':'disabled')+
          ' style="'+(canConvert?'':'opacity:.3;cursor:not-allowed;pointer-events:none')+'" title="'+(canConvert?'Mark Won & Create Job':'Already converted')+'">▶</button> '+
        '<button class="btn btn-success btn-sm" data-action="emailSavedQuote" data-id="'+q.id+'" title="Email to customer">📧</button> '+
        '<button class="btn btn-outline btn-sm" data-action="copyPortalLink" data-id="'+q.id+'" title="Copy client approval link" style="font-size:11px">🔗 Link</button> '+
        '<button class="btn btn-danger btn-sm" data-action="deleteQuote" data-id="'+q.id+'">Del</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

function renderDash() {
  const today = getTodayISO();

  // ---- QUOTE METRICS ----
  let tq=0, rev=0, wonRev=0, totalMargin=0, marginCount=0, followupsDue=0,
      aging7=0, aging14=0, aging30=0, draftsNotReady=0;
  const pipeline = { draft:0, sent:0, followup:0, approved:0, declined:0 };
  DB.quotes.forEach(function(q) {
    tq++; rev += q.total||0;
    if (q.status==='approved') wonRev += q.total||0;
    if (q.achievedMargin!=null) { totalMargin += q.achievedMargin; marginCount++; }
    pipeline[q.status||'draft'] = (pipeline[q.status||'draft']||0) + 1;
    if (isFollowupDue(q)) followupsDue++;
    var ageBase = q.createdDate||((q.createdAt||'').split('T')[0])||q.dt||'';
    if (ageBase && q.status!=='approved' && q.status!=='declined') {
      var age = Math.floor((new Date(today)-new Date(ageBase))/86400000);
      if (age>=7) aging7++; if (age>=14) aging14++; if (age>=30) aging30++;
    }
    if ((q.status||'draft')==='draft'&&String(q.readiness||'').toUpperCase()!=='READY') draftsNotReady++;
  });

  // ---- JOB METRICS ----
  const activeJobs = DB.jobs.filter(function(j){ return j.status==='Scheduled'||j.status==='In Progress'; });

  // ---- FIELD ACTIVITY ----
  // Who's clocked in today (from workDays with no totalPaidMins = still active)
  const todayWorkDays = (DB.workDays||[]).filter(function(d){ return d.date===today&&!d.totalPaidMins; });
  // Also include current user if clocked in
  var liveUsers = todayWorkDays.map(function(d){ return {name:d.techName,status:'onsite',job:''}; });
  if (_clockState.status!=='out'&&_currentUser) {
    var alreadyIn = liveUsers.find(function(u){ return u.name===_currentUser.full_name; });
    if (!alreadyIn) liveUsers.unshift({name:_currentUser.full_name,status:_clockState.status,job:_clockState.jobName||''});
    else { alreadyIn.status=_clockState.status; alreadyIn.job=_clockState.jobName||''; }
  }
  var teamTotal = (DB.team||[]).length;
  var clockedInCount = liveUsers.length;

  // ---- TOOLS ----
  const toolsOut = (DB.toolCheckouts||[]).filter(function(c){ return !c.returnedAt&&c.status!=='verified'; }).length;
  const pendingVerify = (DB.toolCheckouts||[]).filter(function(c){ return c.status==='pending_verify'; }).length;
  const toolFlags = (DB.tools||[]).filter(function(t){ return t.flags&&t.flags.length; }).length;

  // ---- WORK TRACKING ----
  const wtProjects = (DB.wtProjects||[]);
  var wtPcts = wtProjects.map(function(p){
    var items=(DB.wtItems||[]).filter(function(i){return i.projectId===p.id;});
    var done=items.filter(function(i){return i.status==='done';}).length;
    return items.length?Math.round(done/items.length*100):0;
  });
  var wtAvg = wtPcts.length?Math.round(wtPcts.reduce(function(s,v){return s+v;},0)/wtPcts.length):null;

  // ---- OPEN FLAGS ----
  var openFlags = (DB.lunchFlags||[]).filter(function(f){return f.status==='pending_review';}).length;
  openFlags += (DB.timeOffRequests||[]).filter(function(r){return r.status==='pending';}).length;

  // ---- ABSENCES TODAY ----
  var todayAbsences = (DB.absences||[]).filter(function(a){return a.date===today;});

  // ---- WORK ORDER METRICS ----
  var woAll     = DB.workOrders||[];
  var woOpen    = woAll.filter(function(w){ return ['New','Open','Waiting on Customer','Parts Needed','Parts Ordered','Parts Received — Partial','Parts Received — Complete','Ready for Review','Ready for Pricing'].includes(w.status); });
  var woUrgent  = woOpen.filter(function(w){ return w.priority==='Urgent'; });
  var woReview  = woAll.filter(function(w){ return w.status==='Ready for Review'; });
  var woPricing = woAll.filter(function(w){ return w.status==='Ready for Pricing'; });

  // ---- UPDATE STAT TILES ----
  function setT(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  setT('ds-tq', tq);
  setT('ds-won-rev', '$'+Math.round(wonRev).toLocaleString());
  setT('ds-active-jobs', activeJobs.length);
  setT('ds-clocked-in', clockedInCount+(teamTotal?' / '+teamTotal:''));
  setT('ds-wt-pct', wtAvg!==null?wtAvg+'%':'—');
  setT('ds-tools-out', toolsOut);
  setT('ds-followups', followupsDue);
  setT('ds-flags', openFlags);

  // Work Orders tile
  var woTileEl = document.getElementById('ds-wo-tile');
  if (woTileEl) {
    woTileEl.innerHTML =
      '<div style="font-size:28px;font-weight:900;color:'+(woUrgent.length?'#c62828':'#1565c0')+'">'+woOpen.length+'</div>'+
      '<div style="font-size:11px;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">OPEN WOs</div>'+
      (woUrgent.length?'<div style="font-size:10px;font-weight:700;color:#c62828;margin-top:4px;animation:pulse 1s infinite">🚨 '+woUrgent.length+' URGENT</div>':'')+
      (woReview.length?'<div style="font-size:10px;color:#e65100;margin-top:2px">'+woReview.length+' ready for review</div>':'')+
      (woPricing.length?'<div style="font-size:10px;color:#2e7d32;margin-top:2px">'+woPricing.length+' ready to invoice</div>':'');
  }

  var lastUpdated = document.getElementById('dash-last-updated');
  if (lastUpdated) lastUpdated.textContent = 'Updated '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});

  // Reorder alert
  if (typeof renderDashReorderAlert === 'function') renderDashReorderAlert();

  // ---- ALERT BAR ----
  buildAlerts();

  // ---- ABSENCE CARD ----
  var absCard = document.getElementById('dash-absence-card');
  var absDetail = document.getElementById('dash-absence-detail');
  var absCount = document.getElementById('dash-absence-count');
  if (absCard) absCard.style.display = todayAbsences.length?'block':'none';
  if (absCount) absCount.textContent = todayAbsences.length+' team member'+(todayAbsences.length!==1?'s':'')+' out';
  if (absDetail && todayAbsences.length) {
    var covLabels={pto:'PTO',vacation:'Vacation',makeup:'Make up',unpaid:'Unpaid'};
    absDetail.innerHTML = todayAbsences.map(function(a){
      return '<div class="dash-field-row">'+
        '<div class="dash-field-avatar" style="background:#ffebee;color:#c62828">'+escHtml((a.techName||'?')[0].toUpperCase())+'</div>'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:13px">'+escHtml(a.techName||'')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(a.reasonLabel||a.reason||'')+(a.coverage?' · '+escHtml(covLabels[a.coverage]||a.coverage):'')+'</div>'+
        '</div>'+
        (a.isLate?'<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">Late</span>':
                  '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">On time</span>')+
      '</div>';
    }).join('');
  }
  // Also update the old absence alerts div for compatibility
  renderAbsenceDashboard();

  // ---- FIELD ACTIVITY ----
  var fieldEl = document.getElementById('dash-field-activity');
  if (fieldEl) {
    var statusLabels={at_homebase:'At Base',traveling:'Traveling',onsite:'On Site',break:'On Break',lunch:'At Lunch',returning:'Returning',out:'Not started'};
    var statusColors={at_homebase:'#1565c0',traveling:'#1565c0',onsite:'#2e7d32',break:'#e65100',lunch:'#6a1b9a',returning:'#1565c0',out:'#90a4ae'};
    var statusBgs={at_homebase:'#e3f2fd',traveling:'#e3f2fd',onsite:'#e8f5e9',break:'#fff3e0',lunch:'#f3e5f5',returning:'#e3f2fd',out:'#f5f5f5'};

    // Show all team members with their status
    var allTeam = (DB.team||[]).map(function(m){
      var live = liveUsers.find(function(u){ return u.name===m.name; });
      return {name:m.name, status:live?live.status:'out', job:live?live.job:''};
    });
    // Put clocked-in at top
    allTeam.sort(function(a,b){ return (a.status==='out'?1:0)-(b.status==='out'?1:0); });
    if (!allTeam.length && !liveUsers.length) {
      fieldEl.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No team members configured.</div>';
    } else {
      var toShow = allTeam.slice(0,8);
      fieldEl.innerHTML = toShow.map(function(t){
        var initials=(t.name||'?').split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2);
        var bgColor=statusBgs[t.status]||'#f5f5f5';
        var txColor=statusColors[t.status]||'#90a4ae';
        return '<div class="dash-field-row">'+
          '<div class="dash-field-avatar" style="background:'+bgColor+';color:'+txColor+'">'+escHtml(initials)+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;font-size:13px">'+escHtml(t.name||'')+'</div>'+
            (t.job?'<div style="font-size:11px;color:#546e7a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(t.job)+'</div>':'')+
          '</div>'+
          '<span class="dash-field-status '+(t.status==='out'?'out':t.status==='break'?'break':t.status==='lunch'?'lunch':'in')+'">'+
            escHtml(statusLabels[t.status]||t.status)+
          '</span>'+
        '</div>';
      }).join('');
      if (allTeam.length > 8) fieldEl.innerHTML += '<div style="font-size:11px;color:#90a4ae;padding:6px 0">+'+( allTeam.length-8)+' more team members</div>';
    }
  }

  // ---- ACTIVE JOBS ----
  var jobsEl = document.getElementById('dash-jobs-list');
  if (jobsEl) {
    if (!activeJobs.length) {
      jobsEl.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No active jobs right now.</div>';
    } else {
      jobsEl.innerHTML = activeJobs.slice(0,6).map(function(j){
        // Find linked WT project — job ID first, then customer ID, then name
        var wtProj = (DB.wtProjects||[]).find(function(p){
          return p.jobId===j.id ||
            (j.customerId && p.customerId===j.customerId) ||
            (p.customer||'').toLowerCase()===(j.customer||'').toLowerCase();
        });
        var pct = null;
        if (wtProj) {
          var items=(DB.wtItems||[]).filter(function(i){return i.projectId===wtProj.id;});
          var done=items.filter(function(i){return i.status==='done';}).length;
          pct=items.length?Math.round(done/items.length*100):0;
        }
        var scColor=j.status==='In Progress'?'#2e7d32':'#1565c0';
        var scBg=j.status==='In Progress'?'#e8f5e9':'#e3f2fd';
        var custId = j.customerId || '';
        var custDisplay = custId
          ? '<a href="#" onclick="openCustomerProfile(\''+custId+'\');return false" style="color:#1565c0;text-decoration:none">'+escHtml(j.customer||'—')+'</a>'
          : escHtml(j.customer||'—');
        return '<div class="dash-job-row">'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:700;font-size:13px">'+escHtml(j.name||'')+'</div>'+
            '<div style="font-size:11px;color:#546e7a">'+custDisplay+(j.assignedTo?' · '+escHtml(j.assignedTo):'')+'</div>'+
            (pct!==null?'<div class="wt-progress-bar" style="width:120px;margin-top:4px;height:5px;border-radius:3px"><div class="wt-progress-fill" style="width:'+pct+'%;height:5px"></div></div>':'')+''+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:6px">'+
            (pct!==null?'<span style="font-size:11px;font-weight:700;color:#1565c0">'+pct+'%</span>':'')+
            '<span style="background:'+scBg+';color:'+scColor+';border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700">'+escHtml(j.status)+'</span>'+
          '</div>'+
        '</div>';
      }).join('');
      if (activeJobs.length>6) jobsEl.innerHTML+='<div style="font-size:11px;color:#90a4ae;padding:6px 0;text-align:center">+'+( activeJobs.length-6)+' more — <a href="#" onclick="goPage(\'jobs\');return false" style="color:#1565c0">view all</a></div>';
    }
  }

  // ---- FOLLOW-UPS ----
  const fuCard = document.getElementById('dash-followup-card');
  const fuTbl  = document.getElementById('dash-followup-tbl');
  const fuCount = document.getElementById('dash-followup-count');
  const dueFups = DB.quotes.filter(isFollowupDue).sort(function(a,b){
    return (isFollowupOverdue(b)?1:0)-(isFollowupOverdue(a)?1:0)||new Date(a.followupDate||today)-new Date(b.followupDate||today);
  });
  if (fuCard) fuCard.style.display = dueFups.length?'block':'none';
  if (fuCount) fuCount.textContent = dueFups.length+' pending';
  if (fuTbl && dueFups.length) {
    fuTbl.innerHTML = dueFups.map(function(q){
      var overdue=isFollowupOverdue(q);
      var custLink = q.customerId
        ? '<a href="#" onclick="openCustomerProfile(\''+q.customerId+'\');return false" style="color:#1565c0;text-decoration:none">'+escHtml(q.cn||'')+'</a>'
        : escHtml(q.cn||'');
      return '<tr style="'+(overdue?'background:#fff8f8':'')+'">'+
        '<td style="font-weight:700;color:#1565c0;font-size:12px">'+escHtml(q.num||'')+'</td>'+
        '<td style="font-size:12px">'+custLink+'</td>'+
        '<td style="font-size:12px">'+escHtml(q.jn||'')+'</td>'+
        '<td style="font-weight:700;color:'+(overdue?'#c62828':'#e65100')+'">'+escHtml(q.followupDate||'')+(overdue?' ⚠️':'')+'</td>'+
        '<td style="white-space:nowrap">'+
          '<button class="btn btn-outline btn-sm" data-action="editQuote" data-id="'+q.id+'">Edit</button> '+
          '<button class="btn btn-ghost btn-sm" data-action="snoozeFollowup" data-id="'+q.id+'">Snooze 3d</button>'+
        '</td>'+
      '</tr>';
    }).join('');
  }

  // ---- PIPELINE ----
  const pipelineBar = document.getElementById('pipeline-bar');
  const pipelineLegend = document.getElementById('pipeline-legend');
  const pipelineDetail = document.getElementById('pipeline-detail');
  const PIPE_COLORS={draft:'#607d8b',sent:'#1565c0',followup:'#6a1b9a',approved:'#2e7d32',declined:'#c62828'};
  const PIPE_LABELS={draft:'Draft',sent:'Sent',followup:'Follow-Up',approved:'Won',declined:'Lost'};
  if (pipelineBar&&tq>0) {
    pipelineBar.innerHTML=Object.keys(pipeline).map(function(k){
      var count=pipeline[k]||0;if(!count)return'';var pct2=count/tq*100;var showNum=pct2>=6;
      return '<div class="pipeline-seg '+k+'" style="width:'+pct2+'%;min-width:'+(count>0?'24px':'0')+'">'+(showNum?'<span style="pointer-events:none">'+count+'</span>':'')+'</div>';
    }).join('');
    pipelineLegend.innerHTML=Object.keys(pipeline).map(function(k){
      if(!pipeline[k])return'';
      return '<div class="pipeline-legend-item"><div class="pipeline-legend-dot" style="background:'+PIPE_COLORS[k]+'"></div><span>'+PIPE_LABELS[k]+': <strong>'+pipeline[k]+'</strong></span></div>';
    }).join('');
    if (pipelineDetail) {
      var winRate=tq>0?((pipeline.approved||0)/tq*100).toFixed(0):0;
      pipelineDetail.innerHTML='Win rate: <strong>'+winRate+'%</strong> &nbsp;·&nbsp; Aging 7/14/30d: <strong>'+aging7+' / '+aging14+' / '+aging30+'</strong> &nbsp;·&nbsp; Avg margin: <strong>'+(marginCount>0?pct(totalMargin/marginCount):'—')+'</strong>';
    }
  } else if (pipelineBar) {
    pipelineBar.innerHTML='<div style="width:100%;background:#f0f0f0;height:32px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#90a4ae;border-radius:6px">No quotes yet</div>';
    if(pipelineLegend)pipelineLegend.innerHTML='';
  }

  // Recent quotes under pipeline
  var rqEl = document.getElementById('dash-recent-quotes-list');
  if (rqEl) {
    var recentQ = DB.quotes.slice().sort(function(a,b){
      return getQuotePriority(a).sort-getQuotePriority(b).sort||new Date(b.dt||b.createdAt||0)-new Date(a.dt||a.createdAt||0);
    }).slice(0,5);
    rqEl.innerHTML = recentQ.length ? recentQ.map(function(q){
      var fu=isFollowupDue(q)?'<span class="followup-due'+(isFollowupOverdue(q)?' followup-overdue':'')+'"> FU</span>':'';
      var custId = q.customerId || '';
      var custLink = custId
        ? '<a href="#" onclick="openCustomerProfile(\''+custId+'\');return false" style="color:#1565c0;text-decoration:none;font-size:12px">'+escHtml(q.cn||'')+'</a>'
        : '<span style="font-size:12px">'+escHtml(q.cn||'')+'</span>';
      return '<div class="dash-quote-row">'+
        '<div>'+
          '<span style="font-weight:700;color:#1565c0;font-size:12px;cursor:pointer" onclick="editQuote(\''+q.id+'\')">'+escHtml(q.num||'')+'</span>'+
          ' '+custLink+fu+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(q.jn||'')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-weight:700;font-size:13px">'+fmt(q.total||0)+'</div>'+
          '<span class="status-badge s-'+(q.status||'draft')+'" style="font-size:9px">'+(q.status||'draft')+'</span>'+
        '</div>'+
      '</div>';
    }).join('') : '<div style="color:#90a4ae;font-size:13px">No quotes yet.</div>';
  }

  // ---- WORK TRACKING PROJECTS ----
  var wtEl = document.getElementById('dash-wt-projects');
  var wtCard = document.getElementById('dash-wt-card');
  if (wtEl) {
    var activeWTP = (DB.wtProjects||[]).slice(0,4);
    if (!activeWTP.length) {
      wtEl.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No work tracking projects yet.</div>';
      if(wtCard) wtCard.style.display='none';
    } else {
      if(wtCard) wtCard.style.display='block';
      wtEl.innerHTML = activeWTP.map(function(p){
        var items=(DB.wtItems||[]).filter(function(i){return i.projectId===p.id;});
        var done=items.filter(function(i){return i.status==='done';}).length;
        var rough=items.filter(function(i){return (i.phaseStatus&&i.phaseStatus.rough)==='done';}).length;
        var device=items.filter(function(i){return (i.phaseStatus&&i.phaseStatus.device)==='done';}).length;
        var test=items.filter(function(i){return (i.phaseStatus&&i.phaseStatus.test)==='done';}).length;
        var pct2=items.length?Math.round(done/items.length*100):0;
        var pending=(DB.wtCheckoffs||[]).filter(function(c){return c.projectId===p.id&&!c.confirmed;}).length;
        // Find customer for this project — use customerId if set
        var custId = p.customerId || (p.customer ? ((DB.customers||[]).find(function(c){ return (c.name||'').toLowerCase()===(p.customer||'').toLowerCase(); })||{}).id : null);
        var custLink = custId
          ? '<a href="#" onclick="openCustomerProfile(\''+custId+'\');return false" style="font-size:10px;color:#1565c0;text-decoration:none">'+escHtml(p.customer||'')+'</a>'
          : (p.customer?'<span style="font-size:10px;color:#90a4ae">'+escHtml(p.customer)+'</span>':'');
        return '<div class="dash-wt-row" style="cursor:pointer" onclick="loadWTProject(\''+p.id+'\');goPage(\'worktracking\')">'+
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'+
            '<div>'+
              '<div style="font-weight:700;font-size:13px">'+escHtml(p.name||'')+'</div>'+
              (custLink?'<div>'+custLink+'</div>':'')+
            '</div>'+
            '<div style="display:flex;align-items:center;gap:6px">'+
              (pending?'<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700">'+pending+' to confirm</span>':'')+
              '<span style="font-weight:800;font-size:13px;color:#1565c0">'+pct2+'%</span>'+
            '</div>'+
          '</div>'+
          '<div class="wt-progress-bar" style="height:6px;border-radius:3px;margin-bottom:4px"><div class="wt-progress-fill" style="width:'+pct2+'%;height:6px"></div></div>'+
          '<div style="display:flex;gap:10px;font-size:10px;color:#90a4ae">'+
            '<span>R: '+rough+'/'+items.length+'</span>'+
            '<span>D: '+device+'/'+items.length+'</span>'+
            '<span>T: '+test+'/'+items.length+'</span>'+
            (p.leadTech?'<span>Lead: '+escHtml(p.leadTech)+'</span>':'')+
          '</div>'+
        '</div>';
      }).join('');
    }
  }

  // ---- TOOLS OVERVIEW ----
  var toolsEl = document.getElementById('dash-tools-overview');
  if (toolsEl) {
    var checkedOut = (DB.toolCheckouts||[]).filter(function(c){return !c.returnedAt&&c.status!=='verified';});
    var pv = checkedOut.filter(function(c){return c.status==='pending_verify';});
    var overdue = checkedOut.filter(function(c){
      return c.expectedReturn&&c.expectedReturn<today&&c.status!=='pending_verify';
    });
    if (!checkedOut.length) {
      toolsEl.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">All tools accounted for.</div>';
    } else {
      toolsEl.innerHTML=
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">'+
          dashMini(checkedOut.length,'Out','#1565c0','#e3f2fd')+
          dashMini(pv.length,'Pending Verify',pv.length?'#e65100':'#2e7d32',pv.length?'#fff3e0':'#e8f5e9')+
          dashMini(overdue.length,'Overdue',overdue.length?'#c62828':'#2e7d32',overdue.length?'#ffebee':'#e8f5e9')+
        '</div>'+
        (overdue.length?
          '<div style="font-size:12px;font-weight:700;color:#c62828;margin-bottom:6px">⚠ Overdue Returns:</div>'+
          overdue.slice(0,3).map(function(c){
            var tool=(DB.tools||[]).find(function(t){return t.id===c.toolId;});
            return '<div class="dash-tool-row">'+
              '<span style="font-size:16px">'+(tool&&tool.photoUrl?'':'🔧')+'</span>'+
              '<div style="flex:1"><div style="font-weight:700;font-size:12px">'+escHtml((tool&&tool.name)||'Tool')+'</div>'+
              '<div style="font-size:11px;color:#546e7a">'+escHtml(c.toName||'')+'  · Due: '+escHtml(c.expectedReturn||'—')+'</div></div>'+
            '</div>';
          }).join(''):'')+
        (pv.length?'<div style="font-size:12px;color:#e65100;margin-top:4px">'+pv.length+' tool'+(pv.length!==1?'s':'')+' returned, awaiting inspection</div>':'');
    }
  }

  const cb = document.getElementById('company-badge');
  if (cb) cb.textContent = (DB.settings.cname||'TCSS').substring(0,12);
}

function dashMini(val, label, color, bg) {
  return '<div style="background:'+bg+';border-radius:8px;padding:8px;text-align:center">'+
    '<div style="font-weight:800;font-size:16px;color:'+color+'">'+val+'</div>'+
    '<div style="font-size:10px;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+escHtml(label)+'</div>'+
  '</div>';
}

function saveQQ() {
  let existing = null;
  // Primary lookup: by hidden ID field (set when editing an existing quote)
  const qqIdEl = document.getElementById('qq-id');
  const qqId   = qqIdEl ? qqIdEl.value : '';
  if (qqId) { existing = DB.quotes.find(function(q){ return q.id===qqId; }); }
  // Fallback: by number (only if no ID stored)
  if (!existing) {
    const num = (document.getElementById('qq-num')||{}).value || '';
    if (num) { existing = DB.quotes.find(function(q){ return q.num===num; }); }
  }
  const q = getQData(existing ? existing.id : Date.now().toString());
  // Auto-resolve customerId if not set (name typed manually without dropdown)
  if (!q.customerId && q.cn) {
    var matched = DB.customers.find(function(c){ return (c.name||'').toLowerCase()===(q.cn||'').toLowerCase(); });
    if (matched) q.customerId = matched.id;
  }
  // Auto-resolve contactId if not set
  if (!q.contactId && q.contactName) {
    var matchedContact = DB.contacts.find(function(c){ return (c.name||'').toLowerCase()===(q.contactName||'').toLowerCase(); });
    if (matchedContact) q.contactId = matchedContact.id;
  }
  if (!q.num || !existing) { q.num = nextQNum(); if(document.getElementById('qq-num')) document.getElementById('qq-num').value = q.num; }
  q.id = existing ? existing.id : q.id;
  if (!q.followupDate) q.followupDate = calcFollowupDate(q.dt || getTodayISO());
  if (!q.createdDate) q.createdDate = (existing && existing.createdDate) || ((existing && existing.createdAt||'').split('T')[0]) || getTodayISO();
  if (existing) {
    const idx = DB.quotes.indexOf(existing);
    if (existing.execSummary && !q.execSummary) q.execSummary = existing.execSummary;
    if (existing.createdAt && !q.createdAt) q.createdAt = existing.createdAt;
    DB.quotes[idx] = q;
    // Still upsert customer in case phone/email/address changed
    var cust = upsertCustomer(q);
    if (cust && !q.customerId) { q.customerId = cust.id; DB.quotes[idx] = q; }
  } else {
    // New quote — upsert customer first so we get the ID back
    var newCust = upsertCustomer(q);
    if (newCust) q.customerId = newCust.id;
    DB.quotes.unshift(q);
  }
  saveDB();
  clearQQDraft();
  setQQDirty(false, 'Quote ' + q.num + ' saved successfully');
  showToast('Quote '+q.num+' saved','success');
  renderDash();
  renderQuotes();
  updateQQStage3UI();
  qqStage4Init();
}

(function initStage5Watchers(){
  document.addEventListener('input', function(e){
    if (!e.target) return;
    if (e.target.id === 'qq-dt') {
      var fu = document.getElementById('qq-followup');
      if (fu && !fu.value) fu.value = calcFollowupDate(e.target.value || getTodayISO());
    }
    if (e.target.id === 'qq-followup' || e.target.id === 'qq-dt' || e.target.id === 'qq-status') setTimeout(qqStage4Init, 0);
  }, true);
  document.addEventListener('change', function(e){
    if (!e.target) return;
    if (e.target.id === 'qq-status' || e.target.id === 'qq-followup' || e.target.id === 'qq-dt') setTimeout(qqStage4Init, 0);
  }, true);
})();

// ---- INIT ----
// =============================================
// DEMO DATA SEED
// =============================================
function seedDemoData() {
  // Only seed if completely empty
  if (DB.quotes.length > 0 || DB.customers.length > 0) return;

  var now = new Date();
  function daysAgo(n){ var d=new Date(now); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
  function daysAhead(n){ var d=new Date(now); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }

  // ---- CUSTOMERS (5) ----
  DB.customers = [
    { id:'cust1', name:'Meridian Office Group',    phone:'(910) 555-0101', email:'jsmith@meridianoffice.com',   address:'1240 Commerce Blvd, Asheboro, NC 27203', notes:'Preferred client - large commercial' },
    { id:'cust2', name:'Pinecrest Industrial',     phone:'(910) 555-0188', email:'ops@pinecrestind.com',        address:'3890 Industrial Pkwy, Asheboro, NC 27205', notes:'Warehouse expansion ongoing' },
    { id:'cust3', name:'Randolph County Schools',  phone:'(336) 555-0234', email:'facilities@randolphcs.edu',   address:'2222 Learning Lane, Asheboro, NC 27203', notes:'State bid process - net 45' },
    { id:'cust4', name:'Blue Ridge Medical Ctr',   phone:'(336) 555-0310', email:'it@blueridgemed.org',         address:'500 Health Dr, Archdale, NC 27263', notes:'HIPAA sensitive - badge access required' },
    { id:'cust5', name:'Oakwood Retail Plaza',     phone:'(910) 555-0422', email:'mgmt@oakwoodplaza.com',       address:'188 Oakwood Blvd, Randleman, NC 27317', notes:'Multi-tenant property' }
  ];

  // ---- CONTACTS (5) ----
  DB.contacts = [
    { id:'cont1', name:'James Smith',     company:'Meridian Office Group',   title:'Facilities Director',  phone:'(910) 555-0101', email:'jsmith@meridianoffice.com' },
    { id:'cont2', name:'Linda Torres',    company:'Pinecrest Industrial',    title:'Operations Manager',   phone:'(910) 555-0188', email:'ltorres@pinecrestind.com' },
    { id:'cont3', name:'Dr. Ray Nguyen',  company:'Randolph County Schools', title:'Dir. of Facilities',   phone:'(336) 555-0234', email:'rnguyen@randolphcs.edu' },
    { id:'cont4', name:'Carol Hutchins',  company:'Blue Ridge Medical Ctr',  title:'IT Director',          phone:'(336) 555-0310', email:'chutchins@blueridgemed.org' },
    { id:'cont5', name:'Tom Brackett',    company:'Oakwood Retail Plaza',    title:'Property Manager',     phone:'(910) 555-0422', email:'tbrackett@oakwoodplaza.com' }
  ];

  // ---- TEAM ----
  DB.team = [
    { id:'tm1', name:'Marcus Webb',   role:'Lead Technician',  phone:'(910) 555-0501', email:'mwebb@tcss.com',   skills:'Cameras, Access Control, IDF' },
    { id:'tm2', name:'Devon Price',   role:'Technician',       phone:'(910) 555-0502', email:'dprice@tcss.com',  skills:'Structured Wiring, Fiber' },
    { id:'tm3', name:'Alicia Grant',  role:'Estimator',        phone:'(910) 555-0503', email:'agrant@tcss.com',  skills:'Estimating, Project Management' }
  ];

  // Helper: build a quote object
  function makeQuote(cfg) {
    var laborHrs  = cfg.items.reduce(function(s,i){return s+(i.lh||0)*(i.qty||1);},0);
    var matCost   = cfg.items.reduce(function(s,i){return s+(i.mc||0)*(i.qty||1);},0);
    var laborRate = 100;
    var margin    = cfg.margin||38;
    var laborSell = laborHrs * laborRate;
    var totalCost = matCost + laborSell;
    var sellBT    = margin < 100 ? totalCost/(1-margin/100) : totalCost;
    var taxAmt    = sellBT * ((cfg.taxRate||0)/100);
    var total     = sellBT + taxAmt - (cfg.discount||0);
    var achieved  = sellBT>0?((sellBT-totalCost)/sellBT*100):0;
    var health    = achieved>=35?'Healthy':achieved>=25?'Watch':'Low';
    return {
      id:              cfg.id,
      num:             cfg.num,
      cn:              cfg.cn,
      ph:              cfg.ph||'',
      em:              cfg.em||'',
      ad:              cfg.ad||'',
      jn:              cfg.jn,
      jt:              cfg.jt||'New Construction',
      env:             cfg.env||'office',
      envLabel:        (cfg.env&&ENV_PRESETS[cfg.env])?ENV_PRESETS[cfg.env].label:'Office',
      rep:             cfg.rep||'Alicia Grant',
      dt:              cfg.dt,
      vu:              cfg.vu||daysAhead(30),
      status:          cfg.status||'draft',
      followupDate:    cfg.followup||daysAhead(7),
      notes:           cfg.notes||'',
      intNotes:        cfg.intNotes||'',
      laborRate:       laborRate,
      targetMargin:    margin,
      taxRate:         cfg.taxRate||0,
      discount:        cfg.discount||0,
      totalMaterialCost: matCost,
      totalLaborHours:   laborHrs,
      laborSell:       laborSell,
      totalCost:       totalCost,
      sellBeforeTax:   sellBT,
      materialSell:    sellBT - laborSell,
      taxAmt:          taxAmt,
      total:           Math.round(total*100)/100,
      achievedMargin:  Math.round(achieved*10)/10,
      pricingHealth:   health,
      items:           cfg.items,
      equipmentRows:   [],
      permits:         { lv: cfg.permitLV||false, none: !cfg.permitLV },
      lumpSum:         { enabled: false },
      wonDate:         cfg.wonDate||null,
      quoteSeq:        null
    };
  }

  // ---- QUOTES (12) ----
  DB.quoteSeq = 1012;
  var Q = [
    // 1. Won - Meridian Office cameras + access
    makeQuote({ id:'q1', num:'Q-1001', cn:'Meridian Office Group', ph:'(910) 555-0101', em:'jsmith@meridianoffice.com',
      jn:'Meridian HQ — 8 Camera + 2 Door Access', jt:'New Construction', env:'office', margin:40,
      dt:daysAgo(45), vu:daysAgo(15), status:'approved', followup:daysAgo(38), wonDate:daysAgo(40),
      rep:'Alicia Grant', permitLV:true,
      notes:'Install 8 cameras covering lobby, parking, and server room. 2-door access control at main entrance and server room.',
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',cat:'Security',qty:6,unit:'ea',mc:115,lh:2.0},
        {desc:'IP Camera Indoor Dome 4MP',cat:'Security',qty:2,unit:'ea',mc:95,lh:1.5},
        {desc:'NVR 16-Channel 4K',cat:'Security',qty:1,unit:'ea',mc:420,lh:3.0},
        {desc:'2TB Surveillance HDD',cat:'Security',qty:2,unit:'ea',mc:75,lh:0.25},
        {desc:'Access Control Panel 2-Door',cat:'Access Control',qty:1,unit:'ea',mc:320,lh:4.0},
        {desc:'Card Reader Proximity',cat:'Access Control',qty:2,unit:'ea',mc:85,lh:1.5},
        {desc:'Magnetic Lock 600lb',cat:'Access Control',qty:2,unit:'ea',mc:95,lh:2.0},
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:2,unit:'roll',mc:85,lh:0},
        {desc:'General Labor',cat:'Labor',qty:24,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 2. Won - Pinecrest Industrial structured wiring
    makeQuote({ id:'q2', num:'Q-1002', cn:'Pinecrest Industrial', ph:'(910) 555-0188', em:'ops@pinecrestind.com',
      jn:'Pinecrest Warehouse — Network Infrastructure', jt:'Remodel', env:'warehouse', margin:42,
      dt:daysAgo(38), vu:daysAgo(8), status:'approved', followup:daysAgo(31), wonDate:daysAgo(33),
      rep:'Alicia Grant', permitLV:true,
      notes:'Full network infrastructure for 40,000 sqft warehouse. IDF rack buildout, 36 data drops, fiber backbone.',
      items:[
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:5,unit:'roll',mc:85,lh:0},
        {desc:'CAT6 Jack Keystone',cat:'Structured Wiring',qty:36,unit:'ea',mc:4.5,lh:0.15},
        {desc:'CAT6 Patch Panel 24-Port',cat:'Structured Wiring',qty:2,unit:'ea',mc:55,lh:1.0},
        {desc:'Wall-Mount Server Rack 12U',cat:'Infrastructure',qty:1,unit:'ea',mc:285,lh:2.0},
        {desc:'PoE+ Managed Switch 24-Port (1U)',cat:'Networking',qty:1,unit:'ea',mc:485,lh:1.0},
        {desc:'UPS Battery Backup 1500VA (1U)',cat:'Infrastructure',qty:1,unit:'ea',mc:295,lh:0.75},
        {desc:'Fiber — Single Mode OS2 (per 1000ft)',cat:'Fiber',qty:1,unit:'roll',mc:145,lh:0},
        {desc:'General Labor',cat:'Labor',qty:32,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 3. Won - Blue Ridge Medical Verkada
    makeQuote({ id:'q3', num:'Q-1003', cn:'Blue Ridge Medical Ctr', ph:'(336) 555-0310', em:'it@blueridgemed.org',
      jn:'Blue Ridge — Verkada 12 Camera System', jt:'Upgrade', env:'office', margin:42,
      dt:daysAgo(30), vu:daysAgo(0), status:'approved', followup:daysAgo(23), wonDate:daysAgo(25),
      rep:'Alicia Grant', permitLV:true,
      notes:'Replace existing analog system with Verkada cloud-managed cameras. 12 cameras covering all entrances, corridors, and parking.',
      items:[
        {desc:'Verkada CD62 Outdoor Camera',cat:'Security',qty:8,unit:'ea',mc:429,lh:2.0},
        {desc:'Verkada CD42 Indoor Dome Camera',cat:'Security',qty:4,unit:'ea',mc:349,lh:1.5},
        {desc:'Verkada CMD Bridge',cat:'Security',qty:1,unit:'ea',mc:299,lh:1.0},
        {desc:'Verkada License - 1yr (per camera)',cat:'Security',qty:12,unit:'ea',mc:149,lh:0},
        {desc:'PoE+ Switch 16-Port',cat:'Networking',qty:1,unit:'ea',mc:245,lh:0.75},
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:3,unit:'roll',mc:85,lh:0},
        {desc:'Camera Mounting Bracket',cat:'Security',qty:12,unit:'ea',mc:18,lh:0.25},
        {desc:'General Labor - Config & Commission',cat:'Labor',qty:20,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 4. Sent - Randolph County Schools
    makeQuote({ id:'q4', num:'Q-1004', cn:'Randolph County Schools', ph:'(336) 555-0234', em:'facilities@randolphcs.edu',
      jn:'RCS Admin Bldg — Access Control 4 Door', jt:'New Construction', env:'office', margin:38,
      dt:daysAgo(14), vu:daysAhead(16), status:'sent', followup:daysAhead(3),
      rep:'Alicia Grant',
      notes:'4-door access control for admin building. Card readers at all exterior doors plus server closet.',
      items:[
        {desc:'Access Control Panel 2-Door',cat:'Access Control',qty:2,unit:'ea',mc:320,lh:4.0},
        {desc:'Card Reader Proximity',cat:'Access Control',qty:4,unit:'ea',mc:85,lh:1.5},
        {desc:'Magnetic Lock 600lb',cat:'Access Control',qty:4,unit:'ea',mc:95,lh:2.0},
        {desc:'Door Sensor Contact',cat:'Access Control',qty:4,unit:'ea',mc:18,lh:0.5},
        {desc:'REX Motion Sensor',cat:'Access Control',qty:4,unit:'ea',mc:35,lh:0.5},
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:2,unit:'roll',mc:85,lh:0},
        {desc:'General Labor',cat:'Labor',qty:20,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 5. Follow-Up - Oakwood Retail
    makeQuote({ id:'q5', num:'Q-1005', cn:'Oakwood Retail Plaza', ph:'(910) 555-0422', em:'mgmt@oakwoodplaza.com',
      jn:'Oakwood Plaza — 16 Camera Exterior System', jt:'New Construction', env:'exterior', margin:44,
      dt:daysAgo(21), vu:daysAhead(9), status:'followup', followup:daysAgo(2),
      rep:'Alicia Grant',
      notes:'Full exterior camera coverage for 8-unit retail plaza. Includes parking lot, dumpster area, and all building corners.',
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',cat:'Security',qty:16,unit:'ea',mc:115,lh:2.0},
        {desc:'NVR 16-Channel 4K',cat:'Security',qty:1,unit:'ea',mc:420,lh:3.0},
        {desc:'2TB Surveillance HDD',cat:'Security',qty:3,unit:'ea',mc:75,lh:0.25},
        {desc:'Camera Cable RG59+Power',cat:'Security',qty:2400,unit:'ft',mc:0.35,lh:0.01},
        {desc:'Camera Mounting Bracket',cat:'Security',qty:16,unit:'ea',mc:18,lh:0.25},
        {desc:'PoE Switch 8-Port',cat:'Security',qty:2,unit:'ea',mc:110,lh:0.75},
        {desc:'General Labor',cat:'Labor',qty:36,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 6. Draft - Meridian second project
    makeQuote({ id:'q6', num:'Q-1006', cn:'Meridian Office Group', ph:'(910) 555-0101', em:'jsmith@meridianoffice.com',
      jn:'Meridian — Branch Office Structured Wiring', jt:'Remodel', env:'office', margin:38,
      dt:daysAgo(7), vu:daysAhead(23), status:'draft', followup:daysAhead(7),
      rep:'Alicia Grant',
      notes:'New branch office buildout. 24 data drops, patch panel, and WAP installation.',
      items:[
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:3,unit:'roll',mc:85,lh:0},
        {desc:'CAT6 Jack Keystone',cat:'Structured Wiring',qty:24,unit:'ea',mc:4.5,lh:0.15},
        {desc:'CAT6 Patch Panel 24-Port',cat:'Structured Wiring',qty:1,unit:'ea',mc:55,lh:1.0},
        {desc:'Wireless Access Point',cat:'Networking',qty:3,unit:'ea',mc:185,lh:1.5},
        {desc:'Network Switch 24-Port',cat:'Networking',qty:1,unit:'ea',mc:180,lh:1.0},
        {desc:'Low Voltage Bracket',cat:'Structured Wiring',qty:24,unit:'ea',mc:2.5,lh:0.1},
        {desc:'General Labor',cat:'Labor',qty:18,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 7. Sent - Pinecrest second project
    makeQuote({ id:'q7', num:'Q-1007', cn:'Pinecrest Industrial', ph:'(910) 555-0188', em:'ops@pinecrestind.com',
      jn:'Pinecrest — 8 Camera Loading Dock', jt:'Addition', env:'warehouse', margin:42,
      dt:daysAgo(10), vu:daysAhead(20), status:'sent', followup:daysAhead(5),
      rep:'Alicia Grant',
      notes:'Extend camera coverage to loading dock area. 8 weatherproof cameras with night vision.',
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',cat:'Security',qty:8,unit:'ea',mc:115,lh:2.0},
        {desc:'NVR 8-Channel 4K',cat:'Security',qty:1,unit:'ea',mc:280,lh:2.5},
        {desc:'2TB Surveillance HDD',cat:'Security',qty:2,unit:'ea',mc:75,lh:0.25},
        {desc:'Camera Cable RG59+Power',cat:'Security',qty:800,unit:'ft',mc:0.35,lh:0.01},
        {desc:'Camera Mounting Bracket',cat:'Security',qty:8,unit:'ea',mc:18,lh:0.25},
        {desc:'General Labor',cat:'Labor',qty:18,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 8. Won - Service call
    makeQuote({ id:'q8', num:'Q-1008', cn:'Oakwood Retail Plaza', ph:'(910) 555-0422', em:'mgmt@oakwoodplaza.com',
      jn:'Oakwood — Network Troubleshoot & Repair', jt:'Service Call', env:'office', margin:55,
      dt:daysAgo(18), vu:daysAgo(3), status:'approved', followup:daysAgo(11), wonDate:daysAgo(16),
      rep:'Alicia Grant',
      notes:'Intermittent network outages in tenant units 3 and 5. Diagnose and repair.',
      items:[
        {desc:'Service Call (First Hour)',cat:'Labor',qty:1,unit:'ea',mc:0,lh:1.0},
        {desc:'General Labor',cat:'Labor',qty:2,unit:'hr',mc:0,lh:1.0},
        {desc:'CAT6 Patch Cable 5ft',cat:'Structured Wiring',qty:4,unit:'ea',mc:5,lh:0.05}
      ]
    }),

    // 9. Draft - Blue Ridge second
    makeQuote({ id:'q9', num:'Q-1009', cn:'Blue Ridge Medical Ctr', ph:'(336) 555-0310', em:'it@blueridgemed.org',
      jn:'Blue Ridge — Fiber Backbone Upgrade', jt:'Upgrade', env:'office', margin:40,
      dt:daysAgo(5), vu:daysAhead(25), status:'draft', followup:daysAhead(7),
      rep:'Alicia Grant',
      notes:'Replace copper backbone between MDF and 3 IDFs with single-mode fiber. Includes all terminations and testing.',
      items:[
        {desc:'Fiber — Single Mode OS2 (per 1000ft)',cat:'Fiber',qty:2,unit:'roll',mc:145,lh:0},
        {desc:'Fiber Splice Enclosure',cat:'Fiber',qty:4,unit:'ea',mc:85,lh:1.5},
        {desc:'Fiber Patch Cable SM 3ft (LC-LC)',cat:'Fiber',qty:12,unit:'ea',mc:12,lh:0.1},
        {desc:'Fiber Media Converter (SM)',cat:'Fiber',qty:3,unit:'ea',mc:55,lh:0.5},
        {desc:'General Labor',cat:'Labor',qty:16,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 10. Declined - Schools second
    makeQuote({ id:'q10', num:'Q-1010', cn:'Randolph County Schools', ph:'(336) 555-0234', em:'facilities@randolphcs.edu',
      jn:'RCS Elementary — 20 Camera System', jt:'New Construction', env:'office', margin:38,
      dt:daysAgo(25), vu:daysAgo(10), status:'declined', followup:daysAgo(18),
      rep:'Alicia Grant',
      notes:'Full camera system for elementary school. Went with lower bid.',
      items:[
        {desc:'IP Camera Indoor Dome 4MP',cat:'Security',qty:12,unit:'ea',mc:95,lh:1.5},
        {desc:'IP Camera Outdoor Bullet 4MP',cat:'Security',qty:8,unit:'ea',mc:115,lh:2.0},
        {desc:'NVR 16-Channel 4K',cat:'Security',qty:1,unit:'ea',mc:420,lh:3.0},
        {desc:'2TB Surveillance HDD',cat:'Security',qty:2,unit:'ea',mc:75,lh:0.25},
        {desc:'CAT6 Cable (per 1000ft)',cat:'Structured Wiring',qty:3,unit:'roll',mc:85,lh:0},
        {desc:'General Labor',cat:'Labor',qty:28,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 11. Sent - New customer
    makeQuote({ id:'q11', num:'Q-1011', cn:'Carolina Auto Group', ph:'(910) 555-0600', em:'mgr@carolinaauto.com',
      jn:'Carolina Auto — Dealership Camera System', jt:'New Construction', env:'exterior', margin:42,
      dt:daysAgo(8), vu:daysAhead(22), status:'sent', followup:daysAhead(6),
      rep:'Alicia Grant',
      notes:'Complete camera system for car dealership. Interior showroom, service bay, and full lot coverage.',
      items:[
        {desc:'IP Camera Outdoor Bullet 4MP',cat:'Security',qty:12,unit:'ea',mc:115,lh:2.0},
        {desc:'IP Camera Indoor Dome 4MP',cat:'Security',qty:6,unit:'ea',mc:95,lh:1.5},
        {desc:'NVR 16-Channel 4K',cat:'Security',qty:1,unit:'ea',mc:420,lh:3.0},
        {desc:'2TB Surveillance HDD',cat:'Security',qty:3,unit:'ea',mc:75,lh:0.25},
        {desc:'PoE Switch 8-Port',cat:'Security',qty:2,unit:'ea',mc:110,lh:0.75},
        {desc:'Camera Cable RG59+Power',cat:'Security',qty:2000,unit:'ft',mc:0.35,lh:0.01},
        {desc:'Camera Mounting Bracket',cat:'Security',qty:18,unit:'ea',mc:18,lh:0.25},
        {desc:'General Labor',cat:'Labor',qty:30,unit:'hr',mc:0,lh:1.0}
      ]
    }),

    // 12. Draft - IDF buildout
    makeQuote({ id:'q12', num:'Q-1012', cn:'Meridian Office Group', ph:'(910) 555-0101', em:'jsmith@meridianoffice.com',
      jn:'Meridian — IDF Rack Buildout (Floor 3)', jt:'Addition', env:'mixed', margin:38,
      dt:daysAgo(3), vu:daysAhead(27), status:'draft', followup:daysAhead(7),
      rep:'Alicia Grant',
      notes:'New IDF for floor 3 expansion. Full rack buildout with managed switch and fiber uplink.',
      items:[
        {desc:'Wall-Mount Server Rack 12U',cat:'Infrastructure',qty:1,unit:'ea',mc:285,lh:2.0},
        {desc:'CAT6 Patch Panel 24-Port',cat:'Structured Wiring',qty:2,unit:'ea',mc:55,lh:1.0},
        {desc:'1U Rackmount Power Strip (PDU)',cat:'Infrastructure',qty:1,unit:'ea',mc:95,lh:0.5},
        {desc:'1U Cable Management Ring',cat:'Infrastructure',qty:2,unit:'ea',mc:28,lh:0.25},
        {desc:'PoE+ Managed Switch 24-Port (1U)',cat:'Networking',qty:1,unit:'ea',mc:485,lh:1.0},
        {desc:'UPS Battery Backup 1500VA (1U)',cat:'Infrastructure',qty:1,unit:'ea',mc:295,lh:0.75},
        {desc:'General Labor - Rack Build & Dress',cat:'Labor',qty:6,unit:'hr',mc:0,lh:1.0}
      ]
    })
  ];
  DB.quotes = Q;

  // ---- JOBS (5: 3 complete, 2 active) ----
  DB.jobs = [
    // Job 1 — Complete with closeout
    {
      id:'j1', num:'J-001', name:'Meridian HQ — 8 Camera + 2 Door Access',
      customer:'Meridian Office Group', qid:'q1', qnum:'Q-1001',
      env:'office', status:'Complete',
      estLaborHours:24, actualLaborHours:26.5,
      laborHours:24, estTotal:Q[0].total,
      startDate:daysAgo(35), assignedTo:'Marcus Webb',
      address:'1240 Commerce Blvd, Asheboro, NC 27203',
      notes:'All cameras installed. Access control programmed.',
      closeout:{
        savedAt:new Date(now.getTime()-25*86400000).toISOString(),
        actHrs:26.5, estHrs:24,
        issues:'Conduit run in server room was longer than expected due to existing equipment placement.',
        materials:'Needed 2 extra RJ45 keystones not in original estimate.',
        difficulty:3,
        feedback:'Add 10% labor buffer for server room installs. Conduit routing always takes longer.',
        tech:'Marcus Webb', date:daysAgo(27),
        variance:'10.4', varianceHrs:'2.5'
      }
    },
    // Job 2 — Complete with closeout
    {
      id:'j2', num:'J-002', name:'Pinecrest Warehouse — Network Infrastructure',
      customer:'Pinecrest Industrial', qid:'q2', qnum:'Q-1002',
      env:'warehouse', status:'Complete',
      estLaborHours:32, actualLaborHours:30,
      laborHours:32, estTotal:Q[1].total,
      startDate:daysAgo(28), assignedTo:'Devon Price',
      address:'3890 Industrial Pkwy, Asheboro, NC 27205',
      notes:'IDF rack complete. All 36 drops tested and certified.',
      closeout:{
        savedAt:new Date(now.getTime()-18*86400000).toISOString(),
        actHrs:30, estHrs:32,
        issues:'No major issues. Site was well prepared.',
        materials:'All materials on estimate were sufficient.',
        difficulty:2,
        feedback:'Warehouse drops are straightforward. Estimate was accurate. Keep current numbers.',
        tech:'Devon Price', date:daysAgo(20),
        variance:'-6.3', varianceHrs:'-2.0'
      }
    },
    // Job 3 — Complete with closeout
    {
      id:'j3', num:'J-003', name:'Oakwood Plaza — Network Troubleshoot & Repair',
      customer:'Oakwood Retail Plaza', qid:'q8', qnum:'Q-1008',
      env:'office', status:'Complete',
      estLaborHours:3, actualLaborHours:3.5,
      laborHours:3, estTotal:Q[7].total,
      startDate:daysAgo(15), assignedTo:'Marcus Webb',
      address:'188 Oakwood Blvd, Randleman, NC 27317',
      notes:'Faulty patch cables replaced. Switch port reset. Network stable.',
      closeout:{
        savedAt:new Date(now.getTime()-13*86400000).toISOString(),
        actHrs:3.5, estHrs:3,
        issues:'Had to trace cabling behind tenant wall — took extra 30 min.',
        materials:'Used 4 patch cables from stock.',
        difficulty:2,
        feedback:'Service calls to this building always run a bit long due to cable routing in walls.',
        tech:'Marcus Webb', date:daysAgo(13),
        variance:'16.7', varianceHrs:'0.5'
      }
    },
    // Job 4 — In Progress
    {
      id:'j4', num:'J-004', name:'Blue Ridge Medical — Verkada 12 Camera System',
      customer:'Blue Ridge Medical Ctr', qid:'q3', qnum:'Q-1003',
      env:'office', status:'In Progress',
      estLaborHours:20, actualLaborHours:12,
      laborHours:20, estTotal:Q[2].total,
      startDate:daysAgo(5), assignedTo:'Marcus Webb',
      address:'500 Health Dr, Archdale, NC 27263',
      notes:'Day 1-2 complete: All cameras mounted and cabled. Day 3: Commissioning and Verkada setup in progress.',
      closeout:null
    },
    // Job 5 — Scheduled
    {
      id:'j5', num:'J-005', name:'Meridian — Branch Office Structured Wiring',
      customer:'Meridian Office Group', qid:'q6', qnum:'Q-1006',
      env:'office', status:'Scheduled',
      estLaborHours:18, actualLaborHours:0,
      laborHours:18, estTotal:Q[5].total,
      startDate:daysAhead(5), assignedTo:'Devon Price',
      address:'1240 Commerce Blvd, Asheboro, NC 27203',
      notes:'Scheduled for next week. Materials pre-staged at shop.',
      closeout:null
    }
  ];
  DB.jobSeq = 6;

  // ---- SETTINGS ----
  DB.settings = Object.assign({
    cname:'Total Communications Systems & Solutions',
    cphone:'(910) 555-0100',
    cemail:'info@tcssolutions.com',
    caddr:'1100 Commerce Dr, Asheboro, NC 27203',
    clic:'LVA-2024-TCSS',
    cweb:'www.tcssolutions.com',
    ctag:'Low Voltage Specialists',
    laborRate:100,
    targetMargin:38,
    taxRate:0,
    validDays:30,
    payTerms:'50% deposit, balance due upon completion',
    tc:'All work performed to NEC and local AHJ standards. One-year labor warranty on all installations. Materials covered by manufacturer warranty.',
    followupDays:7,
    perDiemMarkup:15,
    uname:'Alicia Grant',
    utitle:'Estimator',
    uphone:'(910) 555-0503',
    uemail:'agrant@tcss.com'
  }, DB.settings);

  saveDB();
  console.log('Demo data seeded: 5 customers, 5 contacts, 12 quotes, 5 jobs');
}
