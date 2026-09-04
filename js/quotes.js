// ── Email Invoice via Mailgun ─────────────────────────────────────────────────
async function emailInvoiceDirect() {
  var toEmail = (document.getElementById('inv-bill-email')||{}).value||'';
  if (!toEmail) {
    toEmail = prompt('Enter recipient invoicing email:');
    if (!toEmail) return;
  }
  var s = DB.settings||{};
  if (!s.mgKey) { showToast('Mailgun API key not set — go to Settings','error',4000); return; }

  var co = s;
  function esc(x){ return (x||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var lineItems = _invItems||[];
  var taxRate = parseFloat((document.getElementById('inv-tax')||{}).value||0);
  var subtotal = lineItems.reduce(function(a,i){ return a+(parseFloat(i.unitPrice||i.mc||0)*parseFloat(i.qty||1)); },0);
  var taxAmt = subtotal*(taxRate/100);
  var grandTotal = subtotal+taxAmt;
  var billName = (document.getElementById('inv-bill-name')||{}).value||'';
  var invNum   = (document.getElementById('inv-num')||{}).value||'';
  var invDate  = (document.getElementById('inv-date')||{}).value||'';

  var lineRows = lineItems.map(function(i){
    var lt = parseFloat(i.unitPrice||i.mc||0)*parseFloat(i.qty||1);
    return '<tr><td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">'+esc(i.desc||i.description||'')+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:center;font-size:13px">'+parseFloat(i.qty||1)+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-size:13px">$'+parseFloat(i.unitPrice||i.mc||0).toFixed(2)+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:700">$'+lt.toFixed(2)+'</td></tr>';
  }).join('');

  var invoiceHTML = '<div style="max-width:680px;margin:0 auto;font-family:Arial,sans-serif;color:#0d1b2a;padding:20px">'
    +'<div style="display:flex;justify-content:space-between;padding-bottom:16px;margin-bottom:20px;border-bottom:3px solid #1565c0">'
      +'<div><div style="font-size:20px;font-weight:900">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>'
      +'<div style="font-size:11px;color:#546e7a;margin-top:6px;line-height:1.8">'+esc(co.caddr||'')+(co.cphone?'<br>'+esc(co.cphone):'')+'<br>invoicing@tcss.com</div></div>'
      +'<div style="text-align:right"><div style="font-size:32px;font-weight:900;color:#1565c0">INVOICE</div>'
      +'<div style="font-size:13px;font-weight:700;margin-top:4px">'+esc(invNum)+'</div>'
      +'<div style="font-size:11px;color:#546e7a">Date: '+esc(invDate)+' | Due: Upon Receipt</div></div>'
    +'</div>'
    +'<div style="background:#f8f9fb;border-radius:8px;padding:14px 18px;margin-bottom:20px">'
      +'<div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;margin-bottom:6px">Bill To</div>'
      +'<div style="font-size:16px;font-weight:700">'+esc(billName)+'</div>'
      +'<div style="font-size:12px;color:#546e7a;margin-top:2px">'+esc(toEmail)+'</div></div>'
    +'<table style="width:100%;border-collapse:collapse">'
      +'<thead><tr style="background:#0d1b2a">'
        +'<th style="padding:10px 14px;text-align:left;font-size:11px;color:#fff">Description</th>'
        +'<th style="padding:10px 14px;text-align:center;font-size:11px;color:#fff;width:60px">Qty</th>'
        +'<th style="padding:10px 14px;text-align:right;font-size:11px;color:#fff;width:100px">Unit Price</th>'
        +'<th style="padding:10px 14px;text-align:right;font-size:11px;color:#fff;width:100px">Amount</th>'
      +'</tr></thead><tbody>'+lineRows+'</tbody>'
      +'<tfoot>'+(taxAmt>0?'<tr><td colspan="3" style="padding:10px 14px;text-align:right;color:#546e7a">Tax ('+taxRate+'%):</td><td style="padding:10px 14px;text-align:right">$'+taxAmt.toFixed(2)+'</td></tr>':'')
        +'<tr style="background:#e3f2fd"><td colspan="3" style="padding:14px;text-align:right;font-size:14px;font-weight:700">Total Due:</td>'
        +'<td style="padding:14px;text-align:right;font-size:20px;font-weight:900;color:#1565c0">$'+grandTotal.toFixed(2)+'</td></tr>'
      +'</tfoot></table>'
    +'<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e0e7ef;text-align:center;font-size:11px;color:#90a4ae">'
      +esc(co.cname||'Total Communications Systems & Solutions, Inc.')+' | '+esc(co.cphone||'')+' | invoicing@tcss.com<br>Thank you for your business.</div>'
  +'</div>';

  showToast('Generating PDF and sending...','info',4000);

  try {
    // Load html2canvas + jsPDF if needed
    if (typeof html2canvas === 'undefined') {
      await new Promise(function(res,rej){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }
    if (typeof window.jspdf === 'undefined') {
      await new Promise(function(res,rej){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=res; s.onerror=rej; document.head.appendChild(s);
      });
    }

    // Render invoice to hidden div
    var div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-9999px;top:0;width:700px;background:#fff';
    div.innerHTML = invoiceHTML;
    document.body.appendChild(div);

    var canvas = await html2canvas(div, { scale:2, useCORS:true, backgroundColor:'#ffffff' });
    document.body.removeChild(div);

    var jspdf = window.jspdf || window.jsPDF;
    var pdf = new (jspdf.jsPDF||jspdf)({ orientation:'p', unit:'px', format:'a4' });
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var imgW = pageW;
    var imgH = (canvas.height * pageW) / canvas.width;
    var y = 0;
    while (y < imgH) {
      if (y > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,-y,imgW,imgH);
      y += pageH;
    }

    var pdfBlob = pdf.output('blob');
    var pdfName = 'TCSS-'+invNum+'.pdf';

    // Send via Mailgun with PDF attachment
    var fd = new FormData();
    fd.append('from', 'TCSS Invoicing <invoicing@tcss.com>');
    fd.append('to', toEmail);
    fd.append('subject', 'Invoice '+invNum+' from Total Communications Systems & Solutions, Inc.');
    fd.append('html', invoiceHTML);
    fd.append('attachment', new File([pdfBlob], pdfName, {type:'application/pdf'}));

    var res = await fetch('https://api.mailgun.net/v3/tcss.com/messages', {
      method:'POST',
      headers:{ 'Authorization':'Basic '+btoa('api:'+s.mgKey) },
      body: fd
    });
    var data = await res.json();
    if (res.ok) {
      showToast('✅ Invoice emailed to '+toEmail+' with PDF attachment','success',5000);
      var inv2 = (DB.invoices||[]).find(function(i){ return i.num===invNum; });
      if (inv2) { inv2.emailedTo=toEmail; inv2.emailedAt=new Date().toISOString(); saveDB(); }
    } else {
      showToast('Mailgun error: '+(data.message||'Unknown'),'error',6000);
      console.error('[Mailgun]',data);
    }
  } catch(e) {
    showToast('Failed: '+e.message,'error',5000);
    console.error('[Email Invoice]',e);
  }
}


// =============================================
// STAGE 1: calcTotals() — MARGIN-BASED ENGINE
// =============================================
function calcTotals() {
  // STEP 1: Aggregate raw costs from line items
  let totalMaterialCost = 0;
  let totalLaborHours = 0;
  lineItems.forEach(function(item) {
    const qty = parseFloat(item.qty) || 0;
    totalMaterialCost += (parseFloat(item.mc) || 0) * qty;
    totalLaborHours += (parseFloat(item.lh) || 0) * qty;
  });

  // STEP 2: Labor sell = hours * rate
  const laborRate = getLaborRate();
  const laborSell = totalLaborHours * laborRate;

  // STEP 3: True total cost (V5: equipment rental, V6: per diem/travel)
  const equipCost  = getEquipmentCost();
  const pdCost     = getPerDiemCost();
  const totalCost  = totalMaterialCost + laborSell + equipCost + pdCost;

  // STEP 4: Target margin OR markup → required sell before tax
  // - Markup mode: material × (1 + markup %), labor/equipment/per-diem PASS THROUGH at cost.
  //   This is true T&M behavior — customer pays your hourly rate × hours, your material cost + markup, your actual equipment/per-diem cost.
  // - Margin mode: total sell = total cost / (1 - margin %). Margin spread across everything.
  const targetRate = getMarginDecimal();
  const isMarkup = currentPricingMode() === 'markup';
  let sellBeforeTax = 0;
  if (isMarkup) {
    // Markup mode: ONLY material gets marked up. Labor + equipment + per diem pass through.
    const materialSellMarkup = totalMaterialCost * (1 + Math.max(targetRate, 0));
    sellBeforeTax = materialSellMarkup + laborSell + equipCost + pdCost;
  } else {
    // Margin mode: original behavior (margin applied to whole bundle)
    if (targetRate >= 0.99) {
      sellBeforeTax = totalCost * 100; // cap at 99%
    } else if (targetRate <= 0) {
      sellBeforeTax = totalCost;
    } else {
      sellBeforeTax = totalCost / (1 - targetRate);
    }
  }

  // STEP 5: Material sell = what materials need to sell for (margin burden)
  const materialSell = sellBeforeTax - laborSell;

  // STEP 6: Tax, discount, total
  const taxRate = (parseFloat((document.getElementById('qq-tx')||{}).value)||0) / 100;
  const discountAmt = parseFloat((document.getElementById('qq-disc')||{}).value)||0;
  const taxAmt = sellBeforeTax * taxRate;
  const totalSell = sellBeforeTax + taxAmt - discountAmt;

  // STEP 7: Achieved margin
  const achievedMargin = sellBeforeTax > 0 ? (sellBeforeTax - totalCost) / sellBeforeTax : 0;
  const achievedMarginPct = achievedMargin * 100;

  // STEP 8: Update display
  function setEl(id, val) { const el = document.getElementById(id); if(el) el.textContent = val; }
  setEl('ps-mc', fmt(totalMaterialCost));
  setEl('ps-eq', equipCost > 0 ? fmt(equipCost) : '$0.00');
  setEl('ps-pd', pdCost > 0 ? fmt(pdCost) : '$0.00');
  setEl('ps-lh', (totalLaborHours.toFixed(2)) + ' hrs');
  setEl('ps-ls', fmt(laborSell));
  setEl('ps-tc', fmt(totalCost));
  setEl('ps-sbt', fmt(sellBeforeTax));
  setEl('ps-ms', fmt(materialSell));
  setEl('ps-tax', fmt(taxAmt));
  setEl('ps-disc', '-' + fmt(discountAmt));
  setEl('ps-total', fmt(totalSell));
  setEl('qq-stage4-total', fmt(totalSell)); // keep the header "Current quote total" in sync on every recalc
  setEl('ps-margin', pct(achievedMarginPct));

  // V5: equipment warning
  checkEquipWarn(equipCost, totalSell);
  updateEquipTotal();

  // STEP 9: Pricing health
  const env = (document.getElementById('qq-env')||{}).value || 'office';
  const healthEl = document.getElementById('ps-health');
  const readinessEl = document.getElementById('ps-readiness');

  // Environment-adjusted thresholds
  const envThresholds = { office:{healthy:35,watch:25}, mixed:{healthy:38,watch:28}, warehouse:{healthy:30,watch:20}, exterior:{healthy:42,watch:32}, highcplx:{healthy:45,watch:35} };
  const thr = envThresholds[env] || envThresholds.office;

  let health = 'Low', healthClass = 'health-low';
  if (achievedMarginPct >= thr.healthy) { health = 'Healthy'; healthClass = 'health-healthy'; }
  else if (achievedMarginPct >= thr.watch) { health = 'Watch'; healthClass = 'health-watch'; }

  if (healthEl) { healthEl.textContent = 'Pricing Health: ' + health + ' (' + pct(achievedMarginPct) + ')'; healthEl.className = 'health-badge ' + healthClass; }

  // Readiness
  let readiness = 'NOT READY', readClass = 'readiness-notready';
  let hasWarnings = false;

  // Warnings
  const materialBurden = totalMaterialCost > 0 ? materialSell / totalMaterialCost : 0;
  const laborRatio = totalSell > 0 ? laborSell / totalSell : 0;

  // Size-aware "High material markup ratio" warning.
  // For small jobs, high markup is just the math — warn only when the markup is high
  // AND the job is substantial enough that a customer might price-check materials.
  // - Substantial job (>$1k materials, >8 labor hours, markup >3.0x): WARN
  // - Large job (>$5k materials, markup >2.5x): WARN regardless of labor hours
  // - Otherwise: no warning (small jobs naturally have high material markup)
  const burdenWarnSubstantial = totalMaterialCost > 1000 && totalLaborHours > 8 && materialBurden > 3.0;
  const burdenWarnLarge = totalMaterialCost > 5000 && materialBurden > 2.5;
  const showBurdenWarn = burdenWarnSubstantial || burdenWarnLarge;

  function toggleWarn(id, show, critical) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) { el.classList.add('visible'); if(critical) el.classList.add('critical'); else el.classList.remove('critical'); hasWarnings = true; }
    else { el.classList.remove('visible'); }
  }

  toggleWarn('warn-burden', showBurdenWarn, false);
  toggleWarn('warn-belowcost', materialSell < totalMaterialCost && totalMaterialCost > 0, true);
  toggleWarn('warn-laborlow', laborRatio < 0.25 && totalSell > 0, false);
  toggleWarn('warn-laborhigh', laborRatio > 0.5 && totalSell > 0, false);

  if (health === 'Healthy' && !hasWarnings && lineItems.length > 0) {
    readiness = 'READY'; readClass = 'readiness-ready';
  } else if (health !== 'Low' && lineItems.length > 0) {
    readiness = 'REVIEW'; readClass = 'readiness-review';
  }
  if (readinessEl) { readinessEl.textContent = readiness; readinessEl.className = 'readiness-badge ' + readClass; }

  // V5: Margin floor check
  const jobType = (document.getElementById('qq-jt')||{}).value || 'New Construction';
  const belowFloor = checkMarginFloor(achievedMarginPct, jobType);
  if (belowFloor && readiness === 'READY') { readiness = 'REVIEW'; readClass = 'readiness-review'; if(readinessEl){readinessEl.textContent=readiness;readinessEl.className='readiness-badge '+readClass;} }

  // V6: update lump sum preview
  updateLumpSumPreview();
  // Refresh service contract pricing when total changes
  if (typeof renderSvcTiers === 'function') {
    var svcEn = document.getElementById('svc-enabled');
    if (svcEn && svcEn.checked) renderSvcTiers();
  }

  return { totalMaterialCost, totalLaborHours, laborSell, totalCost, equipCost, pdCost, sellBeforeTax, materialSell, taxAmt, discountAmt, totalSell, achievedMargin, achievedMarginPct, health, readiness };
}

// ---- QUOTE NUMBER GENERATOR ----
function nextQNum() {
  // Always ensure quoteSeq is at least as high as the highest existing quote number
  var maxExisting = 1024;
  (DB.quotes||[]).forEach(function(q) {
    var match = (q.num||'').match(/Q-(\d+)/);
    if (match) maxExisting = Math.max(maxExisting, parseInt(match[1]));
  });
  DB.quoteSeq = Math.max(DB.quoteSeq||0, maxExisting) + 1;
  saveDB();
  return 'Q-' + DB.quoteSeq;
}



// =============================================
// STAGE 3: QUICK QUOTE GUARDRAILS + DRAFT SAFETY
// =============================================
const QQ_DRAFT_KEY = 'tcss_probid_stage3_qq_draft_v1';
let _qqDirty = false;
let _qqRestoreLock = false;
let _qqDraftTimer = null;
let _qqWrapped = false;
function qqGetVal(id){ var el=document.getElementById(id); return el ? el.value : ''; }
function qqSetVal(id,val){ var el=document.getElementById(id); if(el) el.value = val==null ? '' : val; }

// Return the full list of QQ form field IDs — used by draft save/restore and clearQQ
// qqFieldIds is defined canonically in reports.js (loaded after this file, so it wins).
// The former copy here had drifted to stale field names (qq-labor-rate/qq-tax-rate/
// qq-discount/qq-margin/qq-notes-hidden) that no longer exist in the DOM. Removed to keep
// a single source of truth — see reports.js:qqFieldIds().

// Reset the Quick Quote form to a completely blank state.
// This was called in multiple places (auth.js, worktracking.js, quotes.js) but
// was never defined, meaning every programmatic "new quote" attempt left the
// previous quote's data in the form — causing customer/contact cross-contamination
// when navigating from a customer profile to a new quote.
// ── Draft resume banner after login ──────────────────────────────────────────
function _checkQQDraftOnLogin() {
  try {
    var raw = localStorage.getItem(QQ_DRAFT_KEY);
    if (!raw) return;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.savedAt) return;
    // Only show if draft has meaningful content
    var cn = (parsed.fields && parsed.fields['qq-cn']) || '';
    var jn = (parsed.fields && parsed.fields['qq-jn']) || '';
    if (!cn.trim() && !jn.trim() && !(parsed.lineItems||[]).length) return;
    // Format the time
    var savedAt = new Date(parsed.savedAt);
    var timeStr = savedAt.toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true });
    // Show banner on dashboard
    _showQQResumeBanner(cn || jn || 'Untitled Quote', timeStr);
  } catch(e) {}
}

function _showQQResumeBanner(quoteName, timeStr) {
  var existing = document.getElementById('qq-resume-banner');
  if (existing) existing.remove();
  var banner = document.createElement('div');
  banner.id = 'qq-resume-banner';
  banner.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#1565c0;color:#fff;border-radius:10px;padding:14px 20px;box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:8000;display:flex;align-items:center;gap:14px;max-width:500px;width:90%';
  banner.innerHTML =
    '<div style="font-size:20px">📋</div>'+
    '<div style="flex:1">'+
      '<div style="font-weight:700;font-size:14px">Unfinished quote from '+timeStr+'</div>'+
      '<div style="font-size:12px;opacity:.85;margin-top:2px">"'+escHtml(quoteName)+'" — click Resume to continue where you left off</div>'+
    '</div>'+
    '<button onclick="_resumeQQDraft()" style="background:#fff;color:#1565c0;border:none;border-radius:6px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">Resume</button>'+
    '<button onclick="document.getElementById(\'qq-resume-banner\').remove();clearQQDraft();" style="background:none;border:none;color:#fff;opacity:.7;font-size:18px;cursor:pointer;padding:0 4px">×</button>';
  document.body.appendChild(banner);
  // Auto-dismiss after 15 seconds — banner disappears but draft is preserved
  setTimeout(function(){ if (banner.parentNode) banner.remove(); }, 15000);
}

function _resumeQQDraft() {
  var banner = document.getElementById('qq-resume-banner');
  if (banner) banner.remove();
  goPage('qq');
  setTimeout(function(){
    if (typeof restoreQQDraft === 'function') restoreQQDraft();
  }, 300);
}

function clearQQ(clearDraft) {
  _autoSaveStubDone = false; // reset so next new quote can auto-save
  clearTimeout(_autoSaveStubTimer);
  try {
    // Clear all standard fields
    // Clear rich text notes editor
    var notesEl = document.getElementById('qq-notes');
    if (notesEl && notesEl.contentEditable === 'true') { notesEl.innerHTML = ''; if(typeof qqNotesUpdatePlaceholder==='function') qqNotesUpdatePlaceholder(); }
    qqFieldIds().forEach(function(id) { qqSetVal(id, ''); });
    // Clear line items, equipment, per diem
    if (typeof lineItems !== 'undefined') { lineItems = []; }
    if (typeof equipmentRows !== 'undefined') { equipmentRows = []; }
    if (typeof perDiemData !== 'undefined') { loadPerDiemData(null); }
    if (typeof renderLineItems === 'function') renderLineItems();
    if (typeof renderEquipRows === 'function') renderEquipRows();
    // Clear contact name display
    var ctEl = document.getElementById('qq-contact-name');
    if (ctEl) { ctEl.value = ''; ctEl.placeholder = 'Contact name'; }
    // Reset dirty state
    if (typeof setQQDirty === 'function') setQQDirty(false, 'New quote');
    // Clear draft if requested
    if (clearDraft && typeof clearQQDraft === 'function') clearQQDraft();
  } catch(e) { console.warn('[clearQQ] error:', e); }
}

function setQQDirty(flag, note){
  if (_qqRestoreLock) return;
  _qqDirty = !!flag;
  var dirtyEl = document.getElementById('qq-sticky-dirty');
  if (dirtyEl) dirtyEl.textContent = _qqDirty ? 'Unsaved Changes' : 'Saved';
  var pill = document.getElementById('qq-stage3-pill');
  var sub = document.getElementById('qq-stage3-sub');
  if (pill) pill.textContent = _qqDirty ? 'Draft In Progress' : 'Quote Stable';
  if (sub && note) sub.textContent = note;
  // Trigger auto-save check whenever form becomes dirty
  if (flag) _scheduleAutoSaveStub();
}

// ── Auto-save stub ────────────────────────────────────────────────────────────
// Persists the quote to the DB as soon as it has REAL scope (a line item or an
// equipment row) together with a customer + job name. Customer + job name ALONE is
// no longer enough: that intermediate state is already protected by the local draft
// + resume banner (see saveQQDraft / _checkQQDraftOnLogin), so we no longer write an
// empty $0 row that would be orphaned in the DB if the entry is later abandoned.
var _autoSaveStubTimer = null;
var _autoSaveStubDone = false; // reset by _resetAutoSaveStub() when the form is cleared

// Reset auto-save protection so the NEXT quote can auto-save again. Called from the
// authoritative clearQQ (reports.js) whenever the form is cleared/abandoned. Lives
// here so all auto-save state stays in one module.
function _resetAutoSaveStub() {
  _autoSaveStubDone = false;
  clearTimeout(_autoSaveStubTimer);
}

function _scheduleAutoSaveStub() {
  if (_autoSaveStubDone) return; // already auto-saved this quote
  if (_qqRestoreLock) return;
  clearTimeout(_autoSaveStubTimer);
  _autoSaveStubTimer = setTimeout(function() {
    var cn = (document.getElementById('qq-cn')||{}).value || '';
    var jn = (document.getElementById('qq-jn')||{}).value || '';
    if (!cn.trim() || !jn.trim()) return; // not ready yet
    var idEl = document.getElementById('qq-id');
    if (idEl && idEl.value) return; // already has an ID — already saved
    // Require real scope before creating a DB row — a line item or an equipment row.
    // Until then the local draft protects the work and we avoid orphan $0 quotes.
    var hasItems = (typeof lineItems !== 'undefined' && lineItems && lineItems.length > 0);
    var hasEquip = (typeof equipmentRows !== 'undefined' && equipmentRows && equipmentRows.length > 0);
    if (!hasItems && !hasEquip) return; // nothing real yet — stay a local draft
    // Auto-save the quote
    saveQQ();
    _autoSaveStubDone = true;
    showToast('✅ Quote auto-saved — your work is protected', 'success', 3000);
  }, 2000);
}
function qqCollectDraft(){
  var notesEl = document.getElementById('qq-notes');
  var notesHtml = notesEl && notesEl.contentEditable === 'true' ? (notesEl.innerHTML || '') : '';
  return {
    fields: qqFieldIds().reduce(function(acc,id){ acc[id]=qqGetVal(id); return acc; },{}),
    notesHtml: notesHtml,
    lineItems: JSON.parse(JSON.stringify(lineItems||[])),
    equipmentRows: JSON.parse(JSON.stringify(equipmentRows||[])),
    perDiemData: JSON.parse(JSON.stringify(perDiemData||{})),
    toggles: {
      equipmentEnabled: !!((document.getElementById('equipment-enabled')||{}).checked),
      perdiemEnabled: !!((document.getElementById('perdiem-enabled')||{}).checked),
      lumpsumEnabled: !!((document.getElementById('lumpsum-toggle')||{}).checked),
      lumpsumShowItems: !!((document.getElementById('lumpsum-show-items')||{}).checked),
      cqqEnabled: !!((document.getElementById('cqq-enabled')||{}).checked)
    },
    savedAt: new Date().toISOString()
  };
}
function saveQQDraft(){
  try{ localStorage.setItem(QQ_DRAFT_KEY, JSON.stringify(qqCollectDraft())); }catch(e){ console.warn('QQ draft save failed', e); }
}
function scheduleQQDraftSave(){
  if (_qqRestoreLock) return;
  clearTimeout(_qqDraftTimer);
  _qqDraftTimer = setTimeout(function(){ saveQQDraft(); }, 350);
}
function clearQQDraft(){
  try{ localStorage.removeItem(QQ_DRAFT_KEY); }catch(e){}
}
function qqHasRecoverableDraft(){
  try{
    var raw = localStorage.getItem(QQ_DRAFT_KEY);
    if (!raw) return false;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.fields) return false;
    return !!((parsed.fields['qq-cn']||'').trim() || (parsed.fields['qq-jn']||'').trim() || (parsed.lineItems||[]).length);
  }catch(e){ return false; }
}
function restoreQQDraft(){
  try{
    var raw = localStorage.getItem(QQ_DRAFT_KEY);
    if (!raw) return false;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.fields) return false;
    _qqRestoreLock = true;
    qqFieldIds().forEach(function(id){ if (Object.prototype.hasOwnProperty.call(parsed.fields,id)) qqSetVal(id, parsed.fields[id]); });
    // Restore rich text notes
    var notesEl = document.getElementById('qq-notes');
    if (notesEl && notesEl.contentEditable === 'true') {
      notesEl.innerHTML = parsed.notesHtml || '';
      if (typeof qqNotesUpdatePlaceholder === 'function') qqNotesUpdatePlaceholder();
    }
    lineItems = JSON.parse(JSON.stringify(parsed.lineItems||[]));
    lineItems.forEach(function(item){ if(!item._id) item._id = nextLiId(); });
    equipmentRows = JSON.parse(JSON.stringify(parsed.equipmentRows||[]));
    equipmentRows.forEach(function(r){ if(!r._id) r._id = eqSeq++; });
    if (parsed.perDiemData) perDiemData = JSON.parse(JSON.stringify(parsed.perDiemData));
    renderEquipRows();
    loadPerDiemData(parsed.perDiemData || null);
    var t = parsed.toggles || {};
    var eqCb=document.getElementById('equipment-enabled'), eqBody=document.getElementById('equipment-body'), eqLbl=document.getElementById('equipment-toggle-label');
    if(eqCb) eqCb.checked=!!t.equipmentEnabled; if(eqBody) eqBody.classList.toggle('expanded',!!t.equipmentEnabled); if(eqLbl){eqLbl.textContent=t.equipmentEnabled?'YES':'NO'; eqLbl.className='toggle-value-label'+(t.equipmentEnabled?' on':'');}
    var pdCb=document.getElementById('perdiem-enabled'), pdBody=document.getElementById('perdiem-body'), pdLbl=document.getElementById('perdiem-toggle-label');
    if(pdCb) pdCb.checked=!!t.perdiemEnabled; if(pdBody) pdBody.classList.toggle('expanded',!!t.perdiemEnabled); if(pdLbl){pdLbl.textContent=t.perdiemEnabled?'YES':'NO'; pdLbl.className='toggle-value-label'+(t.perdiemEnabled?' on':'');}
    var lsCb=document.getElementById('lumpsum-toggle'), lsBody=document.getElementById('lumpsum-body'), lsLbl=document.getElementById('lumpsum-toggle-label');
    if(lsCb) lsCb.checked=!!t.lumpsumEnabled; if(lsBody) lsBody.classList.toggle('expanded',!!t.lumpsumEnabled); if(lsLbl){lsLbl.textContent=t.lumpsumEnabled?'YES':'NO'; lsLbl.className='toggle-value-label'+(t.lumpsumEnabled?' on':'');}
    var lsItems=document.getElementById('lumpsum-show-items'), lsItemsLbl=document.getElementById('lumpsum-show-items-label');
    if(lsItems) lsItems.checked = t.lumpsumShowItems !== false; if(lsItemsLbl){ lsItemsLbl.textContent=(t.lumpsumShowItems!==false)?'YES':'NO'; lsItemsLbl.className='toggle-value-label'+((t.lumpsumShowItems!==false)?' on':''); }
    var cqqCb=document.getElementById('cqq-enabled'), cqqBody=document.getElementById('cqq-body'), cqqLbl=document.getElementById('cqq-toggle-label');
    if(cqqCb) cqqCb.checked=!!t.cqqEnabled; if(cqqBody) cqqBody.classList.toggle('expanded',!!t.cqqEnabled); if(cqqLbl){cqqLbl.textContent=t.cqqEnabled?'YES':'NO'; cqqLbl.className='toggle-value-label'+(t.cqqEnabled?' on':'');}
    renderLI();
    calcTotals();
    updateLumpSumPreview();
    _qqRestoreLock = false;
    setQQDirty(true, 'Recovered local draft from this browser');
    updateQQStage3UI();
    return true;
  }catch(e){ _qqRestoreLock = false; console.warn('QQ draft restore failed', e); return false; }
}
function qqSetCheck(id, state, label){
  var el=document.getElementById(id); if(!el) return;
  el.className='qq-stage3-check ' + state;
  el.innerHTML='<span class="qq-stage3-dot"></span><span>' + label + '</span>';
}
function validateQQStage3(){
  var cn=(qqGetVal('qq-cn')||'').trim();
  var jn=(qqGetVal('qq-jn')||'').trim();
  var email=(qqGetVal('qq-em')||'').trim();
  var dt=qqGetVal('qq-dt');
  var vu=qqGetVal('qq-vu');
  var totals=calcTotals();
  var dateOk = true;
  if (dt && vu) dateOk = vu >= dt;
  var emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  var itemsOk = (lineItems||[]).length > 0;
  var pricingOk = itemsOk && (totals.totalSell||0) > 0 && totals.readiness !== 'NOT READY';
  var score = 0;
  if (cn) score += 20;
  if (jn) score += 20;
  if (itemsOk) score += 20;
  if (dateOk) score += 20;
  if (pricingOk && emailOk) score += 20;
  return {cn:cn, jn:jn, emailOk:emailOk, dateOk:dateOk, itemsOk:itemsOk, pricingOk:pricingOk, totals:totals, score:score};
}
function updateQQStage3UI(){
  var v = validateQQStage3();
  // Expiry banner — show if Valid Until date is in the past
  var expiryBanner = document.getElementById('quote-expiry-banner');
  var expiryText   = document.getElementById('quote-expiry-text');
  if (expiryBanner && expiryText) {
    var vuVal = (document.getElementById('qq-vu')||{}).value || '';
    if (vuVal) {
      var today = new Date(); today.setHours(0,0,0,0);
      var vu    = new Date(vuVal); vu.setHours(0,0,0,0);
      var daysAgo = Math.round((today - vu) / 86400000);
      if (daysAgo > 0) {
        expiryText.textContent = '⚠️ This quote expired ' + daysAgo + ' day' + (daysAgo===1?'':'s') + ' ago (' + new Date(vuVal).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + '). Update the Valid Until date before sending.';
        expiryBanner.style.display = 'flex';
      } else {
        expiryBanner.style.display = 'none';
      }
    } else {
      expiryBanner.style.display = 'none';
    }
  }
  qqSetCheck('qq-check-customer', v.cn ? 'ok' : 'bad', v.cn ? 'Customer Ready' : 'Customer Required');
  qqSetCheck('qq-check-job', v.jn ? 'ok' : 'bad', v.jn ? 'Job Name Ready' : 'Job Name Required');
  qqSetCheck('qq-check-items', v.itemsOk ? 'ok' : 'bad', v.itemsOk ? ((lineItems||[]).length + ' Line Items') : 'Add Line Items');
  qqSetCheck('qq-check-dates', v.dateOk ? 'ok' : 'bad', v.dateOk ? 'Dates OK' : 'Valid Until < Quote Date');
  qqSetCheck('qq-check-pricing', v.pricingOk ? 'ok' : 'warn', v.pricingOk ? ('Pricing ' + (v.totals.readiness||'READY')) : 'Review Pricing');
  var bar=document.getElementById('qq-stage3-progress-bar'); if(bar) bar.style.width = Math.max(8, v.score) + '%';
  var help=document.getElementById('qq-stage3-help');
  if (help) {
    if (!v.cn) help.textContent = 'Enter the customer or company name first.';
    else if (!v.jn) help.textContent = 'Add a clear job name so the quote can be found and trusted later.';
    else if (!v.itemsOk) help.textContent = 'Add at least one line item or load a template before saving.';
    else if (!v.dateOk) help.textContent = 'Fix the date range so Valid Until is not earlier than the Quote Date.';
    else if (!v.emailOk) help.textContent = 'Contact email looks incomplete. Fix it or leave it blank.';
    else help.textContent = 'Quick Quote is in good shape. Review pricing and save when ready.';
  }
  var totalEl=document.getElementById('qq-sticky-total'); if(totalEl) totalEl.textContent='Total ' + fmt(v.totals.totalSell||0);
  var readyEl=document.getElementById('qq-sticky-ready'); if(readyEl) readyEl.textContent=v.totals.readiness || 'Not Ready';
  // Keep the "Quote #---" header in sync with the actual assigned number
  var stageNumEl = document.getElementById('qq-stage4-num');
  if (stageNumEl) {
    var assignedNum = (document.getElementById('qq-num')||{}).value || '';
    stageNumEl.textContent = assignedNum ? 'Quote #' + assignedNum : 'Quote #---';
  }
  var pill=document.getElementById('qq-stage3-pill');
  if (pill) pill.textContent = _qqDirty ? 'Draft In Progress' : ((v.cn||v.jn||v.itemsOk) ? 'Quote Stable' : 'New Draft');
  var sub=document.getElementById('qq-stage3-sub');
  if (sub && !_qqDirty) sub.textContent = (v.score >= 100 ? 'Ready for save or preview' : 'Guardrails active for safer quoting');
  var cnEl=document.getElementById('qq-cn'), jnEl=document.getElementById('qq-jn'), emEl=document.getElementById('qq-em'), dtEl=document.getElementById('qq-dt'), vuEl=document.getElementById('qq-vu');
  [cnEl,jnEl,emEl,dtEl,vuEl].forEach(function(el){ if(el) el.classList.remove('qq-invalid'); });
  if (cnEl && !v.cn) cnEl.classList.add('qq-invalid');
  if (jnEl && !v.jn) jnEl.classList.add('qq-invalid');
  if (emEl && !v.emailOk) emEl.classList.add('qq-invalid');
  if (dtEl && vuEl && !v.dateOk) { dtEl.classList.add('qq-invalid'); vuEl.classList.add('qq-invalid'); }
}
function initQQStage3Watchers(){
  if (window._qqStage3Watchers) return;
  window._qqStage3Watchers = true;
  document.addEventListener('input', function(e){
    var t=e.target;
    if (!t) return;
    if ((t.id && (qqFieldIds().indexOf(t.id) >= 0 || /^qq-/.test(t.id) || /^cqq-/.test(t.id) || /^pd-/.test(t.id) || /^permit-/.test(t.id))) || t.hasAttribute('data-li') || t.hasAttribute('data-eq')) {
      setQQDirty(true, 'Unsaved changes in Quick Quote');
      scheduleQQDraftSave();
      setTimeout(updateQQStage3UI, 0);
    }
  }, true);
  document.addEventListener('change', function(e){
    var t=e.target;
    if (!t) return;
    if ((t.id && (qqFieldIds().indexOf(t.id) >= 0 || /^qq-/.test(t.id) || /^cqq-/.test(t.id) || /^pd-/.test(t.id) || /^permit-/.test(t.id) || /^prop-show-/.test(t.id) || /^lumpsum-/.test(t.id))) || t.hasAttribute('data-li') || t.hasAttribute('data-eq')) {
      setQQDirty(true, 'Unsaved changes in Quick Quote');
      scheduleQQDraftSave();
      setTimeout(updateQQStage3UI, 0);
    }
  }, true);
  window.addEventListener('beforeunload', function(e){
    if (!_qqDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });
  document.addEventListener('keydown', function(e){
    if (!e.ctrlKey && !e.metaKey) return;
    var key = e.key.toLowerCase();
    var qqPage = document.getElementById('page-qq');
    var qqActive = qqPage && qqPage.classList.contains('active');
    if (key === 's') {
      e.preventDefault();
      if (qqActive) saveQQ(); else saveDB();
      return;
    }
    if (key === 'n') {
      e.preventDefault();
      if (typeof clearQQ === 'function') { clearQQ(true); goPage('qq'); }
      return;
    }
    if (key === 'p') {
      if (qqActive) { e.preventDefault(); if (typeof previewQQ === 'function') previewQQ(); }
      return;
    }
    if (key === 'e') {
      if (qqActive) { e.preventDefault(); if (typeof emailQuoteQQ === 'function') emailQuoteQQ(); }
      return;
    }
  });
}
function wrapQQStage3Mutations(){
  if (_qqWrapped) return;
  _qqWrapped = true;
  function wrap(name, opts){
    if (typeof window[name] !== 'function') return;
    var original = window[name];
    window[name] = function(){
      var result = original.apply(this, arguments);
      if (opts && opts.clearDraft) clearQQDraft();
      if (opts && opts.cleanState) setQQDirty(false, opts.cleanState);
      else if (!(opts && opts.skipDirty) && !(_qqRestoreLock)) { setQQDirty(true, 'Unsaved changes in Quick Quote'); scheduleQQDraftSave(); }
      setTimeout(updateQQStage3UI, 0);
      return result;
    };
  }
  wrap('addRow');
  wrap('delRow');
  wrap('addCatToQQ');
  wrap('loadTemplate');
  wrap('addEquipRow');
  wrap('delEquipRow');
  wrap('cqqAppend');
  wrap('toggleEquipment');
  wrap('togglePerDiem');
  wrap('toggleLumpSum');
  wrap('toggleLumpSumItems');
  wrap('toggleCQQ');
}

// ============================================================
// saveQQ — Save the current Quick Quote form to DB.quotes
// This was missing and is why Save Quote was silently broken.
// ============================================================
function saveQQ() {
  var cn = (document.getElementById('qq-cn')||{}).value || '';
  var jn = (document.getElementById('qq-jn')||{}).value || '';
  if (!cn.trim()) { showToast('Customer name is required before saving.','error'); return; }
  if (!jn.trim()) { showToast('Job name is required before saving.','error'); return; }

  var q = getQData();

  // Stamp the day a quote first goes to 'sent'/'followup' so aging counts from the send date.
  // getQData preserves an existing sentDate, so this only fires the first time and never resets it.
  if ((q.status==='sent' || q.status==='followup') && !q.sentDate) {
    q.sentDate = getTodayISO();
  }
  // Stamp the win date ONLY when a quote transitions INTO won in THIS save — never back-date a quote
  // that was already won (legacy wins keep their original/absent date; Convert-to-Job stamps its own).
  if (q.status==='approved' || q.status==='won') {
    var _qidW = (document.getElementById('qq-id')||{}).value || '';
    var _prevQ = _qidW ? (DB.quotes||[]).find(function(x){ return x.id===_qidW; }) : null;
    var _wasWon = _prevQ && (_prevQ.status==='approved' || _prevQ.status==='won');
    if (!_wasWon && !q.wonDate) q.wonDate = getTodayISO();
  }

  // Assign or reuse quote number
  var numEl = document.getElementById('qq-num');
  var idEl  = document.getElementById('qq-id');
  var existingId  = (idEl  && idEl.value)  || q.id  || '';
  var existingNum = (numEl && numEl.value)  || q.num || '';

  if (!existingNum || existingNum === 'PREVIEW' || existingNum === 'DRAFT') {
    existingNum = nextQNum();
    if (numEl) numEl.value = existingNum;
    // Also update the visible Quote #--- header immediately
    var displayEl = document.getElementById('qq-stage4-num');
    if (displayEl) displayEl.textContent = 'Quote #' + existingNum;
  }
  q.num = existingNum;

  // Assign or reuse ID
  if (!existingId) {
    existingId = typeof makeUUID === 'function' ? makeUUID() : 'q-' + Date.now();
    if (idEl) idEl.value = existingId;
  }
  q.id = existingId;
  q.createdAt = q.createdAt || new Date().toISOString();
  q.updatedAt = new Date().toISOString();

  // Upsert customer
  if (typeof upsertCustomer === 'function') {
    var cust = upsertCustomer(q);
    if (cust && !q.customerId) {
      q.customerId = cust.id;
      var custIdEl = document.getElementById('qq-customer-id');
      if (custIdEl) custIdEl.value = cust.id;
    }
  }

  // Upsert into DB.quotes — update if exists, insert if new
  if (!DB.quotes) DB.quotes = [];
  var idx = DB.quotes.findIndex(function(x){ return x.id === q.id; });
  if (idx >= 0) {
    DB.quotes[idx] = q;
  } else {
    DB.quotes.unshift(q);
  }

  saveDB();
  clearQQDraft();
  setQQDirty(false, 'Saved');
  renderQuotes && renderQuotes();
  renderDash && renderDash();
  showToast('Quote ' + q.num + ' saved ✓', 'success');
  if (typeof updateQQStage3UI === 'function') updateQQStage3UI();
}

// ============================================================
// editQuote — Load a saved quote back into the QQ form
// ============================================================
function editQuote(id) {
  var q = (DB.quotes||[]).find(function(x){ return x.id === id; });
  if (!q) { showToast('Quote not found','error'); return; }

  goPage('qq');
  setTimeout(function() {
    // Set hidden fields
    var idEl  = document.getElementById('qq-id');
    var numEl = document.getElementById('qq-num');
    if (idEl)  idEl.value  = q.id  || '';
    if (numEl) numEl.value = q.num || '';

    // Set all standard form fields
    var fields = {
      'qq-cn':        q.cn        || '',
      'qq-jn':        q.jn        || '',
      'qq-em':        q.em        || '',
      'qq-ph':        q.ph        || '',
      'qq-dt':        q.dt        || '',
      'qq-vu':        q.vu        || '',
      'qq-jt':        q.jt        || '',
      'qq-env':       q.env       || 'office',
      'qq-status':    q.status    || 'draft',
      'qq-rep':       q.rep       || '',
      'qq-pt':        q.pt        || '',
      'qq-tc':        q.tc        || '',
      'qq-int':       q.intNotes  || '',
      'qq-followup':  q.followupDate || '',
      'qq-labor-rate':q.laborRate || '',
      'qq-tax-rate':  q.taxRate   || '',
      'qq-discount':  q.discount  || '',
      'qq-margin':    q.targetMargin || '',
    };
    Object.keys(fields).forEach(function(fid) {
      var el = document.getElementById(fid);
      if (el) el.value = fields[fid];
    });

    // Load notes into rich text editor (contenteditable) or textarea fallback
    var notesEl = document.getElementById('qq-notes');
    if (notesEl) {
      if (notesEl.contentEditable === 'true') {
        var notesContent = q.notes || '';
        // Detect HTML by flag OR by content starting with < — handles quotes saved
        // before notesIsHtml flag was introduced
        var contentIsHtml = q.notesIsHtml || (notesContent.trimLeft().charAt(0) === '<');
        if (!contentIsHtml && notesContent) {
          // Plain text — convert newlines to HTML
          var html = notesContent
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
          notesContent = '<p>' + html + '</p>';
        }
        notesEl.innerHTML = notesContent;
        if (typeof qqNotesUpdatePlaceholder === 'function') qqNotesUpdatePlaceholder();
      } else {
        notesEl.value = q.notes || '';
      }
    }

    // Address fields
    var adFields = {
      'qq-ad':    q.adStreet || q.ad || '',
      'qq-city':  q.adCity   || q.city  || '',
      'qq-state': q.adState  || q.state || '',
      'qq-zip':   q.adZip    || q.zip   || '',
    };
    Object.keys(adFields).forEach(function(fid) {
      var el = document.getElementById(fid);
      if (el) el.value = adFields[fid];
    });

    // Restore line items
    if (typeof lineItems !== 'undefined') {
      lineItems = JSON.parse(JSON.stringify(q.items || []));
      lineItems.forEach(function(item){ if (!item._id) item._id = nextLiId(); });
    }

    // Restore equipment rows
    if (typeof equipmentRows !== 'undefined') {
      equipmentRows = JSON.parse(JSON.stringify(q.equipmentRows || []));
    }

    // Re-render
    if (typeof renderLI          === 'function') renderLI();
    if (typeof renderEquipRows   === 'function') renderEquipRows();
    if (typeof calcTotals        === 'function') calcTotals();
    if (typeof updateQQStage3UI  === 'function') updateQQStage3UI();

    setQQDirty(false, 'Editing saved quote ' + q.num);
    showToast('Editing ' + q.num + ' — ' + (q.cn||''), 'info', 2000);
  }, 150);
}

function upsertCustomer(q) {
  if (!q.cn) return null;
  // Look for existing customer by ID first, then name
  var existing = q.customerId
    ? DB.customers.find(function(c){ return c.id === q.customerId; })
    : DB.customers.find(function(c){ return (c.name||'').toLowerCase() === (q.cn||'').toLowerCase(); });
  if (existing) {
    // Update phone/email/address if the customer record is missing them
    if (!existing.phone && q.ph) existing.phone = q.ph;
    if (!existing.email && q.em) existing.email = q.em;
    if (!existing.address && q.ad) existing.address = q.ad;
    return existing;
  }
  // Create new customer record
  var newCust = {
    id: typeof makeUUID==='function' ? makeUUID() : 'cust-'+Date.now(),
    name: q.cn,
    phone: q.ph || '',
    email: q.em || '',
    address: q.ad || '',
    notes: '',
    createdAt: new Date().toISOString()
  };
  DB.customers.push(newCust);
  showToast('New customer "'+q.cn+'" added to your customer list','info', 3000);
  return newCust;
}


// =============================================
// STAGE 3: buildPrintHTML() — PROFESSIONAL PROPOSAL
// =============================================
function buildPrintHTML(q, mode) {
  mode = mode || 'client';
  const s = DB.settings || {};
  const cname = s.cname || 'TCSS';
  const cphone = s.cphone || '';
  const cemail = s.cemail || '';
  const caddr = s.caddr || '';
  const clic = s.clic || '';
  const cweb = s.cweb || '';
  const ctag = s.ctag || '';
  const uname = s.uname || q.rep || '';
  const utitle = s.utitle || 'Estimator';
  const uphone = s.uphone || '';
  const uemail = s.uemail || '';
  const envLabel = q.envLabel || (ENV_PRESETS[q.env] ? ENV_PRESETS[q.env].label : 'Office');
  const logoDataUrl = s.logoDataUrl || null;

  // Proposal header logo/name block
  const companyLogoBlock = logoDataUrl
    ? '<img src="' + logoDataUrl + '" style="max-height:60px;max-width:200px;object-fit:contain" alt="' + escHtml(cname) + '">'
    : '<div class="prop-company-name">' + escHtml(cname) + '</div>';

  // Executive Summary — reads actual line items to write specific, professional prose
  function getExecSummary() {
    var items    = q.items || [];
    var env      = q.env   || 'office';
    var jt       = q.jt    || 'New Construction';
    var cn       = q.cn    || 'the client';
    var jn       = q.jn    || 'this project';
    var total    = q.total || 0;

    // --- Detect what systems are actually in this quote ---
    var hasCameras     = items.some(function(i){ return /camera|nvr|surveillance|cctv|verkada/i.test(i.desc); });
    var hasVerkada     = items.some(function(i){ return /verkada/i.test(i.desc); });
    var hasAccess      = items.some(function(i){ return /access control|card reader|mag lock|electric strike|door sensor|rex|ac41/i.test(i.desc); });
    var hasStructured  = items.some(function(i){ return /cat6|keystones?|patch panel|structured wiring|low voltage bracket|data outlet|voice.*data/i.test(i.desc); });
    var hasFiber       = items.some(function(i){ return /fiber|os2|om3|splice|media converter/i.test(i.desc); });
    var hasNetworking  = items.some(function(i){ return /switch|wireless|wap|access point|router/i.test(i.desc); });
    var hasIDF         = items.some(function(i){ return /rack|pdu|ups|idf|server rack/i.test(i.desc); });
    var isServiceCall  = jt === 'Service Call' || items.every(function(i){ return /labor|service call|troubleshoot/i.test(i.desc); });

    // Camera count
    var camCount = 0;
    items.forEach(function(i){
      if (/camera|cam\b/i.test(i.desc) && !/nvr|bridge|license|bracket|cable/i.test(i.desc)) {
        camCount += parseFloat(i.qty)||0;
      }
    });

    // Door count for access control
    var doorCount = 0;
    items.forEach(function(i){
      if (/mag lock|electric strike/i.test(i.desc)) doorCount += parseFloat(i.qty)||0;
    });

    // Drop count for structured wiring
    var dropCount = 0;
    items.forEach(function(i){
      if (/keystone|jack\b|data outlet|voice.*data/i.test(i.desc)) dropCount += parseFloat(i.qty)||0;
    });

    // --- Environment-specific tone modifiers ---
    var envContext = {
      office:    { tone: 'with minimal disruption to daily operations', reliability: 'reliable, professional-grade', coverage: 'thorough coverage of all critical areas' },
      warehouse: { tone: 'engineered for the demands of an industrial environment', reliability: 'heavy-duty, industrial-grade', coverage: 'comprehensive coverage across the full facility footprint' },
      exterior:  { tone: 'built to withstand outdoor and harsh-weather conditions', reliability: 'weather-rated, vandal-resistant', coverage: 'complete perimeter and exterior coverage' },
      mixed:     { tone: 'coordinated across multiple functional areas', reliability: 'versatile, commercial-grade', coverage: 'consistent coverage throughout all zones' },
      highcplx:  { tone: 'executed by our most experienced installation team', reliability: 'enterprise-grade, high-performance', coverage: 'fully integrated coverage across all systems' }
    };
    var ec = envContext[env] || envContext.office;

    // --- Build system description ---
    var systems = [];
    if (hasCameras) {
      var camDesc = hasVerkada ? 'cloud-managed Verkada' : '';
      var camStr  = camCount > 0
        ? (camCount + '-camera ' + camDesc + ' video surveillance system')
        : (camDesc + ' video surveillance system');
      systems.push(camStr.trim());
    }
    if (hasAccess) {
      var doorStr = doorCount > 0
        ? (doorCount + '-door access control system')
        : 'electronic access control system';
      systems.push(doorStr);
    }
    if (hasStructured) {
      var dropStr = dropCount > 0
        ? ('structured wiring infrastructure (' + dropCount + ' data drops)')
        : 'structured wiring infrastructure';
      systems.push(dropStr);
    }
    if (hasFiber)      systems.push('fiber optic backbone');
    if (hasNetworking && !hasStructured) systems.push('network switching and wireless infrastructure');
    if (hasIDF)        systems.push('IDF rack and distribution equipment');

    // --- Build the summary paragraph ---
    var para1 = '';
    var para2 = '';
    var para3 = '';

    if (isServiceCall) {
      para1 = escHtml(cname) + ' has engaged ' + escHtml(DB.settings.cname||'Total Communications Systems & Solutions') +
        ' to provide on-site technical services for ' + escHtml(jn) + '. Our certified technicians will diagnose, troubleshoot, and resolve the identified issues efficiently, ' + ec.tone + '.';
      para2 = 'All work will be performed to manufacturer specifications and industry standards, with full documentation provided upon completion. Our goal is to restore full system functionality with minimal downtime.';
    } else if (systems.length === 0) {
      para1 = escHtml(DB.settings.cname||'Total Communications Systems & Solutions') + ' is pleased to present this proposal to ' + escHtml(cn) +
        ' for the ' + escHtml(jn) + ' project. Our team will deliver a complete low voltage installation, ' + ec.tone + ', using ' + ec.reliability + ' components backed by our comprehensive installation warranty.';
    } else if (systems.length === 1) {
      para1 = escHtml(DB.settings.cname||'Total Communications Systems & Solutions') + ' is pleased to present this proposal to ' + escHtml(cn) +
        ' for the installation of a ' + systems[0] + ' at ' + escHtml(jn) + '.';
      para2 = 'This ' + jt.toLowerCase() + ' installation will be completed ' + ec.tone + ', using ' + ec.reliability + ' components selected specifically for this environment. ' +
        'All work will be performed by our certified technicians and backed by our full labor warranty.';
    } else {
      var lastSystem = systems.pop();
      para1 = escHtml(DB.settings.cname||'Total Communications Systems & Solutions') + ' is pleased to present this comprehensive proposal to ' + escHtml(cn) +
        ' for the ' + escHtml(jn) + ' project. This scope includes installation of a ' +
        systems.join(', ') + (systems.length > 1 ? ',' : '') + ' and ' + lastSystem + '.';
      para2 = 'All systems will be installed ' + ec.tone + ' and configured to operate as an integrated solution. ' +
        'We will use ' + ec.reliability + ' components with ' + ec.coverage + ', ensuring long-term performance and reliability.';
    }

    // --- Job-type specific closing sentence ---
    var closings = {
      'New Construction': 'We will coordinate closely with the general contractor and other trades to ensure seamless integration and on-schedule completion.',
      'Remodel': 'Our team has extensive experience working in occupied facilities and will take every precaution to minimize disruption while meeting your project timeline.',
      'Service Call':     'Response time and first-call resolution are our priorities. We stand behind all work performed with our service guarantee.',
      'Upgrade':          'Existing infrastructure will be evaluated and incorporated where appropriate, protecting your prior investment while delivering a modern, capable system.',
      'Addition':         'New systems will be fully integrated with existing infrastructure, providing a unified solution with consistent performance across the entire facility.'
    };
    para3 = closings[jt] || '';

    return [para1, para2, para3].filter(Boolean).join(' ');
  }

  // Items table (client version — no cost shown)
  function itemsTableHTML() {
    const lumpSum = q.lumpSum && q.lumpSum.enabled;
    // Rate var = margin % in margin mode (capped 0-99%), markup % in markup mode (capped 0-500%)
    const _isMarkupMode = (q.pricingMode === 'markup');
    const _tm = q.targetMargin !== undefined && q.targetMargin !== null ? q.targetMargin : 35;
    const margin = _isMarkupMode
      ? Math.min(Math.max(_tm/100, 0), 5.0)
      : Math.min(Math.max(_tm/100, 0), 0.99);

    // LUMP SUM MODE — total price as one line, optionally list items below without prices
    if (lumpSum) {
      const label     = q.lumpSum.label || 'Complete Low Voltage Installation';
      // FIX: Use sellBeforeTax (pre-tax subtotal), not q.total (after-tax).
      // Otherwise the tax line below adds onto an already-after-tax number, confusing the customer.
      const lineAmount = fmt(q.sellBeforeTax || q.subtotal || q.total || 0);
      const showItems = q.lumpSum.showItems !== false; // default true
      var rows = '<tr style="border-bottom:1px solid #e8e8e8">' +
        '<td style="padding:8px 12px;width:40px;color:#888">1</td>' +
        '<td style="padding:8px 12px;font-weight:600">' + escHtml(label) + '</td>' +
        '<td style="padding:8px 12px;text-align:center">1</td>' +
        '<td style="padding:8px 12px">LOT</td>' +
        '<td style="padding:8px 12px;text-align:right">' + lineAmount + '</td>' +
        '<td style="padding:8px 12px;text-align:right;font-weight:700">' + lineAmount + '</td>' +
        '</tr>';
      // Optionally list items with qty/description only — no pricing
      if (showItems && q.items && q.items.length > 0) {
        rows += '<tr><td colspan="6" style="padding:6px 12px;background:#f8fafc;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px">Included Materials &amp; Scope</td></tr>';
        q.items.forEach(function(item, idx) {
          if (!item.desc) return;
          var qty = parseFloat(item.qty)||0;
          rows += '<tr style="border-bottom:1px solid #f5f5f5">' +
            '<td style="padding:5px 12px;color:#aaa;font-size:11px">' + (idx+1) + '</td>' +
            '<td style="padding:5px 12px;font-size:12px;color:#546e7a">' + escHtml(item.desc) + '</td>' +
            '<td style="padding:5px 12px;text-align:center;font-size:12px;color:#546e7a">' + qty + '</td>' +
            '<td style="padding:5px 12px;font-size:12px;color:#546e7a">' + escHtml(item.unit||'ea') + '</td>' +
            '<td></td><td></td>' +
            '</tr>';
        });
      }
      return rows;
    }

    // ITEMIZED MODE
    if (!q.items || q.items.length === 0) return '<p style="color:#666">No line items recorded.</p>';
    var rows = '';
    let rowNum = 0;
    q.items.forEach(function(item) {
      const qty = parseFloat(item.qty)||0;
      const mc  = parseFloat(item.mc)||0;
      const lh  = parseFloat(item.lh)||0;
      // Items with $0 cost and 0 hours but have labor — show labor-only rows
      // Markup mode: unitSell = mc × (1 + markup)
      // Margin mode: unitSell = mc / (1 - margin)
      let unitSell;
      if (mc > 0) {
        if (_isMarkupMode) {
          unitSell = mc * (1 + margin);  // 'margin' var holds the rate (markup % when in markup mode)
        } else {
          unitSell = margin < 1 ? mc / (1 - margin) : mc;
        }
      } else {
        unitSell = 0;
      }
      // Include THIS line's labor (install hours × labor rate) so labor-bearing lines
      // show a real price instead of "—". Line total = material sell + labor; the lines
      // therefore sum to the pre-tax subtotal (matches the Pricing Summary).
      const _laborRate = parseFloat(q.laborRate) || 100;
      const lineTotal  = (unitSell * qty) + (qty * lh * _laborRate);
      const lineUnit   = qty > 0 ? lineTotal / qty : lineTotal;
      rowNum++;
      rows += '<tr style="border-bottom:1px solid #e8e8e8">';
      rows += '<td style="padding:8px 12px;width:40px;color:#888">' + rowNum + '</td>';
      rows += '<td style="padding:8px 12px">' + escHtml(item.desc || 'Item') + '</td>';
      rows += '<td style="padding:8px 12px;text-align:center">' + qty + '</td>';
      rows += '<td style="padding:8px 12px">' + escHtml(item.unit||'ea') + '</td>';
      rows += '<td style="padding:8px 12px;text-align:right">' + (lineTotal > 0 ? fmt(lineUnit) : '—') + '</td>';
      rows += '<td style="padding:8px 12px;text-align:right;font-weight:600">' + (lineTotal > 0 ? fmt(lineTotal) : '—') + '</td>';
      rows += '</tr>';
    });

    // Per diem / travel rows (if any)
    const pd = q.perDiem;
    if (pd) {
      const pdAfter = pd.afterMarkup || 0;
      if (pdAfter > 0) {
        const pdParts = [];
        if (pd.men > 0 && pd.days > 0) pdParts.push(pd.men + ' men × ' + pd.days + ' days per diem');
        if (pd.rooms > 0 && pd.nights > 0) pdParts.push(pd.rooms + ' room(s) × ' + pd.nights + ' night(s) lodging');
        if (pd.trips > 0) pdParts.push((pd.travelDesc||'Travel') + ' × ' + pd.trips + ' trip(s)');
        rowNum++;
        rows += '<tr style="border-bottom:1px solid #e8e8e8;background:#f9f6ff">';
        rows += '<td style="padding:8px 12px;color:#888">' + rowNum + '</td>';
        rows += '<td style="padding:8px 12px;color:#4527a0"><strong>Per Diem / Travel</strong><br><span style="font-size:11px;color:#7e57c2">' + escHtml(pdParts.join(' · ')) + '</span></td>';
        rows += '<td style="padding:8px 12px;text-align:center">1</td>';
        rows += '<td style="padding:8px 12px">LOT</td>';
        rows += '<td style="padding:8px 12px;text-align:right">' + fmt(pdAfter) + '</td>';
        rows += '<td style="padding:8px 12px;text-align:right;font-weight:700;color:#4527a0">' + fmt(pdAfter) + '</td>';
        rows += '</tr>';
      }
    }
    return rows;
  }

  // Internal section (only shown in internal mode)
  function internalSectionHTML() {
    if (mode !== 'internal') return '';
    // V5: equipment summary
    let eqHtml = '';
    if (q.equipmentRows && q.equipmentRows.length > 0) {
      eqHtml = '<tr><td colspan="2" style="padding-top:8px;font-weight:700;color:#856404">Equipment Rentals</td></tr>';
      q.equipmentRows.forEach(function(r) {
        const typeInfo = EQUIPMENT_TYPES.find(function(t){ return t.id === r.type; });
        const name = typeInfo ? typeInfo.name : r.type;
        const cost = (parseFloat(r.days)||0) * (parseFloat(r.dailyRate)||0);
        eqHtml += '<tr><td style="padding-left:12px">' + escHtml(name) + ' × ' + r.days + ' day(s) @ $' + r.dailyRate + '/day</td><td style="text-align:right">' + fmt(cost) + '</td></tr>';
      });
      eqHtml += '<tr><td style="font-weight:700">Total Equipment Cost</td><td style="text-align:right;font-weight:700">' + fmt(q.equipmentCost||0) + '</td></tr>';
    }
    // V5: permit summary
    let permitHtml = '';
    if (q.permits) {
      const p = q.permits;
      const listed = [];
      if (p.lv) listed.push('Low Voltage');
      if (p.elec) listed.push('Electrical');
      if (p.other) listed.push('Other' + (p.otherText ? ': ' + p.otherText : ''));
      permitHtml = '<tr><td colspan="2" style="padding-top:8px;font-weight:700;color:#856404">Permit Status</td></tr>' +
        '<tr><td>Permits Required</td><td style="text-align:right">' + (listed.length ? listed.join(', ') : 'None identified') + '</td></tr>' +
        '<tr><td>Permit Coordinator</td><td style="text-align:right">' + escHtml(p.coord||'—') + '</td></tr>';
    }
    // V5: margin floor
    const floorHtml = q.marginFloor ? '<tr><td colspan="2" style="padding-top:8px;font-weight:700;color:#856404">Margin Floor</td></tr><tr><td>Floor for ' + escHtml(q.jt||'Job') + '</td><td style="text-align:right">' + pct(q.marginFloor) + '</td></tr><tr><td>Status</td><td style="text-align:right;font-weight:700;color:' + (q.belowMarginFloor?'#c62828':'#2e7d32') + '">' + (q.belowMarginFloor ? '⚠️ BELOW FLOOR — Approval Required' : '✓ Above Floor') + '</td></tr>' : '';

    // V6: per diem summary for internal copy
    let pdHtml = '';
    if (q.perDiem && q.perDiemCost > 0) {
      const pd = q.perDiem;
      pdHtml = '<tr><td colspan="2" style="padding-top:8px;font-weight:700;color:#856404">Per Diem / Travel</td></tr>';
      if (pd.men > 0 && pd.days > 0) pdHtml += '<tr><td style="padding-left:12px">Per Diem: ' + pd.men + ' men × ' + pd.days + ' days @ $' + pd.rate + '/day</td><td style="text-align:right">' + fmt((pd.men*pd.days*(pd.rate||0))) + '</td></tr>';
      if (pd.rooms > 0 && pd.nights > 0) pdHtml += '<tr><td style="padding-left:12px">Lodging: ' + pd.rooms + ' room(s) × ' + pd.nights + ' nights @ $' + pd.lodgingRate + '/night</td><td style="text-align:right">' + fmt((pd.rooms*pd.nights*(pd.lodgingRate||0))) + '</td></tr>';
      if (pd.trips > 0) pdHtml += '<tr><td style="padding-left:12px">' + escHtml(pd.travelDesc||'Travel') + ' × ' + pd.trips + ' trip(s) @ $' + pd.travelRate + '</td><td style="text-align:right">' + fmt((pd.trips*(pd.travelRate||0))) + '</td></tr>';
      pdHtml += '<tr><td style="padding-left:12px;color:#7e57c2">After ' + ((DB.settings.perDiemMarkup||0)) + '% markup</td><td style="text-align:right;font-weight:700;color:#4527a0">' + fmt(q.perDiemCost||0) + '</td></tr>';
    }

    return '<div style="background:#fff3cd;border:1px solid #ffc107;padding:14px;border-radius:6px;margin:18px 0"><h4 style="color:#856404;margin-bottom:10px;font-size:13px;text-transform:uppercase">INTERNAL PRICING ANALYSIS — NOT FOR CLIENT DISTRIBUTION</h4><table style="width:100%;font-size:12px"><tbody><tr><td>Material / Equipment Cost</td><td style="text-align:right;font-weight:600">' + fmt(q.totalMaterialCost||0) + '</td></tr><tr><td>Labor Hours (Estimated)</td><td style="text-align:right">' + ((q.totalLaborHours||0).toFixed(2)) + ' hrs</td></tr><tr><td>Labor Sell (' + fmt(q.laborRate||100) + '/hr)</td><td style="text-align:right">' + fmt(q.laborSell||0) + '</td></tr>' + eqHtml + pdHtml + '<tr><td>Total True Cost</td><td style="text-align:right;font-weight:700;border-top:1px solid #ccc;padding-top:4px">' + fmt(q.totalCost||0) + '</td></tr><tr><td>Target Margin</td><td style="text-align:right">' + pct(q.targetMargin||35) + '</td></tr><tr><td>Achieved Margin</td><td style="text-align:right;font-weight:700;color:' + (q.achievedMargin>=35?'#2e7d32':q.achievedMargin>=25?'#e65100':'#c62828') + '">' + pct(q.achievedMargin||0) + '</td></tr><tr><td>Pricing Health</td><td style="text-align:right;font-weight:700">' + (q.pricingHealth||'N/A') + '</td></tr>' + floorHtml + permitHtml + '</tbody></table></div>';
  }

  const validUntil = q.vu ? new Date(q.vu).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'Upon request';
  const quoteDate = q.dt ? new Date(q.dt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  const propCSS = 'body{font-family:"Segoe UI",Arial,sans-serif;color:#1a1a2e;background:#fff;margin:0;padding:0}' +
  '.prop-wrap{max-width:900px;margin:0 auto;padding:30px 40px}' +
  '@media print{.prop-wrap{padding:15px 25px}.no-print{display:none!important}}' +
  '.prop-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:18px;margin-bottom:22px}' +
  '.prop-company-name{font-size:26px;font-weight:900;color:#0d1b2a;letter-spacing:-0.5px}' +
  '.prop-company-sub{font-size:13px;color:#607d8b;margin-top:4px;line-height:1.6}' +
  '.prop-doc-info{text-align:right;font-size:12px;color:#455a64;line-height:2}' +
  '.prop-doc-num{font-size:18px;font-weight:800;color:#1565c0}' +
  '.prop-section{margin-bottom:22px}' +
  '.prop-section-title{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1565c0;border-bottom:2px solid #e3f2fd;padding-bottom:6px;margin-bottom:12px}' +
  '.prop-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}' +
  '.info-block{font-size:13px;line-height:1.9;color:#37474f}' +
  '.info-block strong{color:#0d1b2a;font-weight:700}' +
  '.exec-box{background:#f0f7ff;border-left:4px solid #1565c0;padding:16px 20px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.8;color:#37474f;margin-bottom:18px}' +
  '.exec-box p{margin:0 0 10px 0}' +
  '.exec-box p:last-child{margin-bottom:0}' +
  '.scope-box{background:#f8f9fa;border-radius:8px;padding:14px 18px;font-size:13px;line-height:1.7;color:#37474f}' +
  '.scope-box h3{font-size:13px;font-weight:700;color:#1f3b57;margin:10px 0 4px}' +
  '.scope-box ul,.scope-box ol{padding-left:20px;margin:4px 0}' +
  '.scope-box li{margin:2px 0}' +
  '.scope-box strong{font-weight:700}' +
  '.scope-box em{font-style:italic}' +
  'table.items-table{width:100%;border-collapse:collapse;font-size:13px;margin:10px 0}' +
  'table.items-table th{background:#1565c0;color:#fff;padding:10px 12px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}' +
  'table.items-table th:last-child,table.items-table th:nth-last-child(2){text-align:right}' +
  '.pricing-summary-table{width:100%;font-size:13px;border-collapse:collapse}' +
  '.pricing-summary-table td{padding:7px 12px}' +
  '.pricing-summary-table tr.total-row td{font-size:16px;font-weight:900;color:#0d1b2a;border-top:2px solid #1565c0;padding-top:12px}' +
  '.pricing-summary-table tr.sub-row td:last-child{text-align:right}' +
  '.pricing-summary-table tr.sub-row td:first-child{color:#546e7a}' +
  '.assumption-list li{font-size:12px;color:#546e7a;line-height:1.9}' +
  '.sig-block{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}' +
  '.sig-line{border-top:1px solid #999;padding-top:6px;margin-top:30px;font-size:12px;color:#607d8b}' +
  '.service-offer-box{background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:14px;font-size:12px;color:#1b5e20;margin:14px 0}';

  // Body content only — no DOCTYPE/html wrapper (modal injects this as innerHTML)
  let bodyContent = '<style>' + propCSS + `


/* ===== STAGE 4: LIFECYCLE + CONTROL LAYER ===== */
.qq-stage4-shell{background:linear-gradient(135deg,#ffffff,#f7fbff);border:1.5px solid #d7e9ff;border-radius:14px;padding:14px 16px;margin:0 0 14px;box-shadow:0 3px 12px rgba(21,101,192,.07)}
.qq-stage4-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.qq-stage4-num{font-size:24px;font-weight:900;color:#0d1b2a;letter-spacing:-.4px}
.qq-stage4-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}
.qq-stage4-total{font-size:28px;font-weight:900;color:#1565c0;letter-spacing:-.5px}
.qq-stage4-sub{font-size:12px;color:#607d8b;font-weight:600}
.qq-stage4-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.qq-stage4-step{position:relative;padding:10px 12px;border-radius:12px;background:#edf2f7;border:1px solid #dbe5ee;min-height:54px;display:flex;flex-direction:column;justify-content:center;transition:all .18s ease}
.qq-stage4-step.active{background:linear-gradient(135deg,#1565c0,#1e88e5);border-color:#1565c0;box-shadow:0 6px 16px rgba(21,101,192,.24)}
.qq-stage4-step.done{background:#e8f5e9;border-color:#a5d6a7}
.qq-stage4-step-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#607d8b}
.qq-stage4-step-value{font-size:13px;font-weight:800;color:#0d1b2a;margin-top:2px}
.qq-stage4-step.active .qq-stage4-step-label,.qq-stage4-step.active .qq-stage4-step-value{color:#fff}
.qq-stage4-step.done .qq-stage4-step-label{color:#2e7d32}
.qq-stage4-step.done .qq-stage4-step-value{color:#1b5e20}
.qq-stage4-status{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border:1px solid transparent}
.qq-stage4-status.draft{background:#eceff1;color:#546e7a;border-color:#cfd8dc}
.qq-stage4-status.ready{background:#e3f2fd;color:#1565c0;border-color:#90caf9}
.qq-stage4-status.sent{background:#fff3e0;color:#e65100;border-color:#ffcc80}
.qq-stage4-status.followup{background:#f3e5f5;color:#6a1b9a;border-color:#ce93d8}
.qq-stage4-status.approved{background:#e8f5e9;color:#2e7d32;border-color:#a5d6a7}
.qq-stage4-status.declined{background:#ffebee;color:#c62828;border-color:#ef9a9a}
.qq-stage4-hint{font-size:12px;color:#546e7a;margin-top:10px;line-height:1.45}
#qq-smart-action{min-width:150px;justify-content:center}
@media(max-width:768px){.qq-stage4-flow{grid-template-columns:1fr 1fr}.qq-stage4-total{font-size:24px}.qq-stage4-num{font-size:22px}}

/* ===== STEP 2 SAFE UI TIGHTENING ===== */
.card:hover,.stat-card:hover,.job-card:hover{box-shadow:0 6px 16px rgba(0,0,0,.08)}
.btn:hover{transform:translateY(-1px)}
.nav-item,.tab-btn,.inv-tab,.rpt-tab,.mob-nav-item,.cat-item,.tpl-card,.job-card,.stat-card,.card,.btn{transition:all .18s ease}
input,select,textarea{min-height:38px}
textarea{min-height:90px}
table{font-size:12.5px}
.empty-state{padding:44px 20px}
.page-header h2{letter-spacing:-.2px}

</style><div class="prop-wrap">`;

  // HEADER
  bodyContent +=
  '<div class="prop-header">' +
  '<div>' + companyLogoBlock +
  '<div class="prop-company-sub">' +
  (caddr ? escHtml(caddr) + '<br>' : '') +
  (cphone ? 'Tel: ' + escHtml(cphone) + ' ' : '') +
  (cemail ? '| ' + escHtml(cemail) + ' ' : '') +
  (cweb ? '| ' + escHtml(cweb) : '') +
  (clic ? '<br>License: ' + escHtml(clic) : '') +
  (ctag ? '<br><em>' + escHtml(ctag) + '</em>' : '') +
  '</div></div>' +
  '<div class="prop-doc-info">' +
  '<div class="prop-doc-num">PROPOSAL ' + escHtml(q.num||'') + '</div>' +
  '<div>Date: ' + quoteDate + '</div>' +
  '<div>Valid Until: ' + escHtml(validUntil) + '</div>' +
  (uname ? '<div>Prepared by: ' + escHtml(uname) + (utitle ? ' — ' + escHtml(utitle) : '') + '</div>' : '') +
  (uphone ? '<div>' + escHtml(uphone) + '</div>' : '') +
  (uemail ? '<div>' + escHtml(uemail) + '</div>' : '') +
  '</div></div>' +

  // CUSTOMER + PROJECT
  '<div class="prop-two-col">' +
  '<div class="prop-section"><div class="prop-section-title">Prepared For</div>' +
  '<div class="info-block">' +
  '<strong style="font-size:15px">' + escHtml(q.cn||'') + '</strong><br>' +
  (q.contactName ? '<span style="color:#1565c0;font-weight:600">' + escHtml(q.contactName) + '</span>' + (q.contactTitle ? ' &nbsp;·&nbsp; <span style="color:#607d8b;font-size:12px">' + escHtml(q.contactTitle) + '</span>' : '') + '<br>' : '') +
  (q.ph ? '<span style="color:#546e7a">&#128222; ' + escHtml(q.ph) + '</span><br>' : '') +
  (q.em ? '<span style="color:#546e7a">&#9993; ' + escHtml(q.em) + '</span><br>' : '') +
  (q.ad ? '<span style="color:#546e7a">&#128205; ' + escHtml(q.ad) + '</span>' : '') +
  '</div></div>' +
  '<div class="prop-section"><div class="prop-section-title">Project Details</div>' +
  '<div class="info-block">' +
  (q.jn ? '<strong>Job Name:</strong> ' + escHtml(q.jn) + '<br>' : '') +
  '<strong>Type:</strong> ' + escHtml(q.jt||'') + '<br>' +
  '<strong>Environment:</strong> ' + escHtml(envLabel) + '<br>' +
  (q.rep ? '<strong>Sales Rep:</strong> ' + escHtml(q.rep) + '<br>' : '') +
  '</div></div></div>' +

  // EXECUTIVE SUMMARY — respects per-quote toggle
  (function(){
    var ps = q.proposalSections || {};
    if (ps.showExecSummary === false) return '';
    var text = (q.execSummary && q.execSummary.trim()) ? q.execSummary : getExecSummary();
    return '<div class="prop-section">' +
      '<div class="prop-section-title">Executive Summary</div>' +
      '<div class="exec-box" id="prop-exec-box">' +
      text.split(/\n+/).filter(Boolean).map(function(p){ return '<p>' + p + '</p>'; }).join('') +
      '</div></div>';
  })() +

  // SCOPE
  (q.notes ? '<div class="prop-section"><div class="prop-section-title">Scope of Work</div><div class="scope-box">' + (q.notesIsHtml ? q.notes : escHtml(q.notes).replace(/\n/g,'<br>')) + '</div></div>' : '') +

  // EQUIPMENT & MATERIALS + LABOR
  '<div class="prop-section"><div class="prop-section-title">Equipment, Materials &amp; Installation</div>' +
  '<table class="items-table"><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th></tr></thead><tbody>' +
  itemsTableHTML() +
  '</tbody></table>' +
  (getLaborBannerOn() ? '<div style="background:#e8f5e9;padding:10px 16px;margin-top:8px;border-radius:6px;font-size:13px;color:#1b5e20"><strong>Installation Labor included</strong> — All labor necessary for professional installation of the above scope is included in this proposal.</div>' : '') +
  '</div>' +

  // PRICING SUMMARY (CLIENT)
  '<div class="prop-section"><div class="prop-section-title">Pricing Summary</div>' +
  '<table class="pricing-summary-table">' +
  (q.lumpSum && q.lumpSum.enabled
    ? '<tr class="sub-row"><td>' + escHtml(q.lumpSum.label||'Complete Low Voltage Installation') + '</td><td style="text-align:right">' + fmt(q.sellBeforeTax||q.subtotal||q.total||0) + '</td></tr>'
    : (function(){ var _mat = (q.materialSell != null) ? (parseFloat(q.materialSell)||0) : Math.max(0, (parseFloat(q.sellBeforeTax||q.total)||0) - (parseFloat(q.laborSell)||0)); return _mat > 0 ? '<tr class="sub-row"><td>Equipment &amp; Materials</td><td style="text-align:right">' + fmt(_mat) + '</td></tr>' : ''; })() +
      ((q.laborSell||0) > 0 ? '<tr class="sub-row"><td>Installation Labor</td><td style="text-align:right">' + fmt(q.laborSell||0) + '</td></tr>' : '') +
      (q.perDiemCost > 0 ? '<tr class="sub-row"><td>Per Diem / Travel</td><td style="text-align:right">' + fmt(q.perDiemCost||0) + '</td></tr>' : '') +
      '<tr class="sub-row"><td>Subtotal</td><td style="text-align:right">' + fmt(q.sellBeforeTax||q.subtotal||0) + '</td></tr>'
  ) +
  (q.taxAmt > 0 ? '<tr class="sub-row"><td>Tax (' + pct(q.taxRate||0) + ')</td><td style="text-align:right">' + fmt(q.taxAmt) + '</td></tr>' : '') +
  (q.discount > 0 ? '<tr class="sub-row"><td>Discount</td><td style="text-align:right;color:#c62828">-' + fmt(q.discount) + '</td></tr>' : '') +
  '<tr class="total-row"><td>TOTAL INVESTMENT</td><td style="text-align:right">' + fmt(q.total||0) + '</td></tr>' +
  ((!q.taxRate || q.taxRate === 0) ? '<tr><td colspan="2" style="padding:6px 0 0;font-size:11px;color:#90a4ae;font-style:italic;text-align:right">(Applicable taxes not included)</td></tr>' : '') +
  '</table></div>' +

  // INTERNAL ANALYSIS (if internal mode)
  internalSectionHTML() +


  // SERVICE CONTRACT OFFER — only show if explicitly selected
  (function() {
    var svc = q.svcContract;
    if (!svc || !svc.tier) return ''; // don't show if not selected
    return '<div class="service-offer-box">' +
      '<strong>Optional Service Agreement — ' + escHtml(svc.label) + ' Plan</strong><br>' +
      '<span style="font-size:13px;font-weight:700;color:#1b5e20">$' + svc.annual + '/year</span>' +
      (svc.term > 1 ? ' &nbsp;·&nbsp; ' + svc.term + '-year term available' : '') + '<br>' +
      '<span style="color:#2e7d32">' + (svc.includes||[]).map(function(i){ return '· '+i; }).join(' &nbsp;') + '</span>' +
    '</div>';
  })() +

  // ASSUMPTIONS — respects settings toggle AND per-quote toggle
  (function() {
    var ps = q.proposalSections || {};
    if (ps.showAssumptions === false) return '';
    var pd = DB.settings.proposalDefaults || {};
    if (pd.showAssumptions === false) return '';
    var items = pd.assumptions && pd.assumptions.length ? pd.assumptions : DEFAULT_ASSUMPTIONS;
    return '<div class="prop-section"><div class="prop-section-title">Assumptions</div>' +
      '<ul class="assumption-list">' +
      items.map(function(a){ return '<li>' + escHtml(a) + '</li>'; }).join('') +
      '</ul></div>';
  })() +

  // EXCLUSIONS — respects settings toggle AND per-quote toggle
  (function() {
    var ps = q.proposalSections || {};
    if (ps.showExclusions === false) return '';
    var pd = DB.settings.proposalDefaults || {};
    if (pd.showExclusions === false) return '';
    var items = pd.exclusions && pd.exclusions.length ? pd.exclusions : DEFAULT_EXCLUSIONS;
    return '<div class="prop-section"><div class="prop-section-title">Exclusions</div>' +
      '<ul class="assumption-list">' +
      items.map(function(e){ return '<li>' + escHtml(e) + '</li>'; }).join('') +
      '</ul></div>';
  })() +

  // TERMS — respects per-quote toggle
  (function() {
    var ps = q.proposalSections || {};
    if (ps.showTerms === false) return '';
    // Use quote-level T&C if set, otherwise fall back to global settings T&C
    var baseTC    = (q.tc && q.tc.trim()) ? q.tc : (DB.settings.tc || '');
    var addendums = DB.settings.jtAddendums || {};
    var jtExtra   = q.jt ? (addendums[q.jt] || '') : '';
    var fullTC    = baseTC + (jtExtra ? '\n\n' + jtExtra : '');
    if (!fullTC.trim()) return '';
    return '<div class="prop-section"><div class="prop-section-title">Terms &amp; Conditions</div>' +
      '<div class="scope-box" style="font-size:12px">' +
        (typeof rtfDisplayHTML==='function' ? rtfDisplayHTML(baseTC) : escHtml(baseTC).replace(/\n/g,'<br>')) +
        (jtExtra ? '<br><br><strong style="color:#1565c0">' + escHtml(q.jt) + ' — Additional Terms:</strong><br>' + escHtml(jtExtra).replace(/\n/g,'<br>') : '') +
      '</div></div>';
  })() +
  (function(){
    var pt = (q.pt && q.pt.trim()) ? q.pt : (DB.settings.payTerms || '');
    return pt ? '<div style="font-size:13px;color:#546e7a;margin-bottom:18px"><strong>Payment Terms:</strong> ' + escHtml(pt) + '</div>' : '';
  })() +

  // SIGNATURE BLOCK
  '<div class="prop-section"><div class="prop-section-title">Acceptance</div>' +
  '<p style="font-size:12px;color:#546e7a;margin-bottom:8px">By signing below, customer acknowledges and accepts this proposal in its entirety.</p>' +
  '<div class="sig-block">' +
  '<div><div class="sig-line">Customer Signature &amp; Date</div><div style="margin-top:16px;font-size:12px;color:#546e7a">Printed Name: _________________________</div></div>' +
  '<div><div class="sig-line">Authorized Signature &amp; Date<br>' + escHtml(cname) + '</div><div style="margin-top:16px;font-size:12px;color:#546e7a">Title: _________________________________</div></div>' +
  '</div></div>' +   // close sig-block + prop-section

  '</div>';          // close prop-wrap

  // Return full document for print, or body content for modal preview
  if (mode === '_bodyonly') return bodyContent;
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Proposal ' + escHtml(q.num||'') + ' - ' + escHtml(q.jn||'') + '</title></head><body>' + bodyContent + '</body></html>';
}


// ---- PREVIEW / PRINT ----
let _printMode = 'client';
let _previewQuoteData = null; // tracks the quote currently being previewed

function previewQQ() {
  const cn = (document.getElementById('qq-cn')||{}).value || '';
  const jn = (document.getElementById('qq-jn')||{}).value || '';
  if (!cn.trim() || !jn.trim()) { showToast('Please enter customer name and job name first.','error'); return; }
  const q = getQData();
  q.num = (document.getElementById('qq-num')||{}).value || 'PREVIEW';
  // Carry over any saved custom exec summary from the saved quote
  const qid = (document.getElementById('qq-id')||{}).value || '';
  if (qid) {
    const saved = DB.quotes.find(function(x){ return x.id===qid; });
    if (saved && saved.execSummary) q.execSummary = saved.execSummary;
  }
  _printMode = 'client';
  _previewQuoteData = q;
  _refreshPreview(q);
  _updateSummaryBadge(q);
  openModal('modal-preview');
}

function _refreshPreview(q) {
  const html = buildPrintHTML(q, '_bodyonly');
  const pc = document.getElementById('preview-content');
  if (pc) pc.innerHTML = html;
}

function _updateSummaryBadge(q) {
  const badge  = document.getElementById('summary-edited-badge');
  const resetBtn = document.getElementById('reset-summary-btn');
  const hasCustom = !!(q && q.execSummary && q.execSummary.trim());
  if (badge)    badge.style.display    = hasCustom ? 'inline' : 'none';
  if (resetBtn) resetBtn.style.display = hasCustom ? 'inline-flex' : 'none';
}

// ---- EXECUTIVE SUMMARY EDITOR ----
function startEditSummary() {
  var editor   = document.getElementById('summary-editor-wrap');
  var textarea = document.getElementById('summary-editor-textarea');
  if (!editor || !textarea) return;

  // Try to get current text from rendered exec box
  var execBox = document.getElementById('prop-exec-box');
  var currentText = '';

  if (execBox) {
    var paragraphs = execBox.querySelectorAll('p');
    currentText = paragraphs.length > 0
      ? Array.from(paragraphs).map(function(p){ return p.textContent; }).join('\n\n')
      : execBox.textContent;
  } else if (_previewQuoteData) {
    // Fall back to saved custom summary or auto-generate
    currentText = _previewQuoteData.execSummary || '';
    if (!currentText) {
      // Show a placeholder based on job name
      currentText = 'Enter your custom executive summary for ' + (_previewQuoteData.jn || 'this project') + ' here.';
    }
  }

  textarea.value = currentText;
  editor.style.display = 'block';
  textarea.focus();
  // Scroll to editor
  editor.scrollIntoView({ behavior:'smooth', block:'start' });
}

function applySummary() {
  const textarea = document.getElementById('summary-editor-textarea');
  const editor   = document.getElementById('summary-editor-wrap');
  if (!textarea || !editor) return;

  const newText = textarea.value.trim();
  if (!newText) { showToast('Summary cannot be empty.','error'); return; }

  // Save to current preview quote data
  if (_previewQuoteData) {
    _previewQuoteData.execSummary = newText;

    // If this is a saved quote, persist it
    if (_previewQuoteData.id) {
      const saved = DB.quotes.find(function(q){ return q.id === _previewQuoteData.id; });
      if (saved) { saved.execSummary = newText; saveDB(); }
    }

    // Re-render the preview with the new summary
    _refreshPreview(_previewQuoteData);
    _updateSummaryBadge(_previewQuoteData);
  } else {
    // Directly update the exec box without full re-render
    const execBox = document.getElementById('prop-exec-box');
    if (execBox) {
      execBox.innerHTML = newText.split(/\n+/).filter(Boolean)
        .map(function(p){ return '<p>' + p + '</p>'; }).join('');
    }
    const badge = document.getElementById('summary-edited-badge');
    if (badge) badge.style.display = 'inline';
  }

  editor.style.display = 'none';
}

function cancelEditSummary() {
  const editor = document.getElementById('summary-editor-wrap');
  if (editor) editor.style.display = 'none';
}

function resetSummary() {
  if (!confirm('Reset to the auto-generated summary? Your custom edits will be lost.')) return;
  if (_previewQuoteData) {
    _previewQuoteData.execSummary = '';
    if (_previewQuoteData.id) {
      const saved = DB.quotes.find(function(q){ return q.id === _previewQuoteData.id; });
      if (saved) { saved.execSummary = ''; saveDB(); }
    }
    _refreshPreview(_previewQuoteData);
    _updateSummaryBadge(_previewQuoteData);
  }
  const editor = document.getElementById('summary-editor-wrap');
  if (editor) editor.style.display = 'none';
}

// ---- END EXECUTIVE SUMMARY EDITOR ----

function printQuote() {
  var q = _previewQuoteData;
  if (!q) {
    var cn = (document.getElementById('qq-cn')||{}).value || '';
    var jn = (document.getElementById('qq-jn')||{}).value || '';
    if (!cn || !jn) { showToast('Please enter customer name and job name first.','error'); return; }
    q = getQData();
  }
  // Auto-generate quote number if missing
  if (!q.num || q.num === 'PREVIEW') {
    q.num = nextQNum();
    if (_previewQuoteData) _previewQuoteData.num = q.num;
    var numEl = document.getElementById('qq-num');
    if (numEl) numEl.value = q.num;
  }
  var html = buildPrintHTML(q, 'client');
  // Set document title so browser uses it as the suggested PDF filename
  var filename = 'Proposal-' + (q.num||'') + '-' + (q.cn||'').replace(/[^a-zA-Z0-9]/g,'-');
  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + filename + '</title>' +
    `<style>@media print{body{margin:0}}


/* ===== STAGE 4: LIFECYCLE + CONTROL LAYER ===== */
.qq-stage4-shell{background:linear-gradient(135deg,#ffffff,#f7fbff);border:1.5px solid #d7e9ff;border-radius:14px;padding:14px 16px;margin:0 0 14px;box-shadow:0 3px 12px rgba(21,101,192,.07)}
.qq-stage4-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.qq-stage4-num{font-size:24px;font-weight:900;color:#0d1b2a;letter-spacing:-.4px}
.qq-stage4-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}
.qq-stage4-total{font-size:28px;font-weight:900;color:#1565c0;letter-spacing:-.5px}
.qq-stage4-sub{font-size:12px;color:#607d8b;font-weight:600}
.qq-stage4-flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.qq-stage4-step{position:relative;padding:10px 12px;border-radius:12px;background:#edf2f7;border:1px solid #dbe5ee;min-height:54px;display:flex;flex-direction:column;justify-content:center;transition:all .18s ease}
.qq-stage4-step.active{background:linear-gradient(135deg,#1565c0,#1e88e5);border-color:#1565c0;box-shadow:0 6px 16px rgba(21,101,192,.24)}
.qq-stage4-step.done{background:#e8f5e9;border-color:#a5d6a7}
.qq-stage4-step-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#607d8b}
.qq-stage4-step-value{font-size:13px;font-weight:800;color:#0d1b2a;margin-top:2px}
.qq-stage4-step.active .qq-stage4-step-label,.qq-stage4-step.active .qq-stage4-step-value{color:#fff}
.qq-stage4-step.done .qq-stage4-step-label{color:#2e7d32}
.qq-stage4-step.done .qq-stage4-step-value{color:#1b5e20}
.qq-stage4-status{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border:1px solid transparent}
.qq-stage4-status.draft{background:#eceff1;color:#546e7a;border-color:#cfd8dc}
.qq-stage4-status.ready{background:#e3f2fd;color:#1565c0;border-color:#90caf9}
.qq-stage4-status.sent{background:#fff3e0;color:#e65100;border-color:#ffcc80}
.qq-stage4-status.followup{background:#f3e5f5;color:#6a1b9a;border-color:#ce93d8}
.qq-stage4-status.approved{background:#e8f5e9;color:#2e7d32;border-color:#a5d6a7}
.qq-stage4-status.declined{background:#ffebee;color:#c62828;border-color:#ef9a9a}
.qq-stage4-hint{font-size:12px;color:#546e7a;margin-top:10px;line-height:1.45}
#qq-smart-action{min-width:150px;justify-content:center}
@media(max-width:768px){.qq-stage4-flow{grid-template-columns:1fr 1fr}.qq-stage4-total{font-size:24px}.qq-stage4-num{font-size:22px}}

/* ===== STEP 2 SAFE UI TIGHTENING ===== */
.card:hover,.stat-card:hover,.job-card:hover{box-shadow:0 6px 16px rgba(0,0,0,.08)}
.btn:hover{transform:translateY(-1px)}
.nav-item,.tab-btn,.inv-tab,.rpt-tab,.mob-nav-item,.cat-item,.tpl-card,.job-card,.stat-card,.card,.btn{transition:all .18s ease}
input,select,textarea{min-height:38px}
textarea{min-height:90px}
table{font-size:12.5px}
.empty-state{padding:44px 20px}
.page-header h2{letter-spacing:-.2px}

</style>` +
    '</head><body>' + html + '</body></html>';
  var w = window.open('', '_blank');
  if (!w) {
    // Popup blocked — fallback to same-window iframe print
    showToast('Popup blocked — allow popups or use Ctrl+P to print','warning',6000);
    return;
  }
  w.document.open();
  w.document.write(fullHtml);
  w.document.close();
  w.document.title = filename;
  setTimeout(function(){ w.focus(); w.print(); }, 600);
}

function printInternal() {
  var q = _previewQuoteData || getQData();
  if (!q.num || q.num === 'PREVIEW') q.num = (document.getElementById('qq-num')||{}).value || 'INTERNAL';
  var html = buildPrintHTML(q, 'internal');
  var filename = 'Internal-' + (q.num||'') + '-' + (q.cn||'').replace(/[^a-zA-Z0-9]/g,'-');
  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + filename + '</title>' +
    '</head><body>' + html + '</body></html>';
  var w = window.open('', '_blank');
  if (!w) { showToast('Popup blocked. Please allow popups for this site and try again.','error'); return; }
  w.document.open();
  w.document.write(fullHtml);
  w.document.close();
  w.document.title = filename;
  setTimeout(function(){ w.focus(); w.print(); }, 600);
}

// =============================================
// V6: EMAIL QUOTE (Option A — mailto)
// =============================================
// Convert quote notes (which may be rich-text HTML from the editor) into clean,
// readable PLAIN TEXT for emails. Preserves line breaks and bullet structure,
// strips every tag, and decodes HTML entities. Safe on plain-text notes too.
function _notesToEmailText(notes, isHtml) {
  if (!notes) return '';
  var t = String(notes);
  var looksHtml = isHtml || /<[a-z!/][\s\S]*>/i.test(t);
  if (!looksHtml) return t.trim();
  return t
    .replace(/<\s*(br|hr)\s*\/?\s*>/gi, '\n')                    // <br>/<hr> -> newline
    .replace(/<\s*li[^>]*>/gi, '\n• ')                      // <li> -> bullet (its \n starts the line)
    .replace(/<\s*\/(p|div|h[1-6]|tr|ul|ol|table)\s*>/gi, '\n') // block ends -> newline
    .replace(/<[^>]*>/g, '')                                     // drop remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')                                     // decode &amp; last
    .replace(/[ \t]+\n/g, '\n')                                  // trim line-end spaces
    .replace(/\n{3,}/g, '\n\n')                                  // collapse blank lines
    .replace(/[ \t]{2,}/g, ' ')                                  // collapse space runs
    .trim();
}

function buildEmailBody(q) {
  const s      = DB.settings || {};
  const cname  = s.cname  || 'TCSS';
  const cphone = s.cphone || '';
  const cemail = s.cemail || '';
  const cweb   = s.cweb   || '';
  const caddr  = s.caddr  || '';
  const uname  = s.uname  || q.rep || '';
  const utitle = s.utitle || 'Estimator';
  const uphone = s.uphone || cphone;
  const uemail = s.uemail || cemail;

  const validUntil = q.vu
    ? new Date(q.vu).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})
    : '30 days from quote date';
  const quoteDate = q.dt
    ? new Date(q.dt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})
    : new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});

  const contactGreeting = q.contactName ? q.contactName.split(' ')[0] : (q.cn || 'Valued Customer');

  const lines = [];
  lines.push('Dear ' + contactGreeting + ',');
  lines.push('');
  lines.push('Thank you for the opportunity to work with ' + (q.cn||'your organization') + '. Attached to this email is our proposal for your review.');
  lines.push('');
  lines.push('PROPOSAL DETAILS');
  lines.push('─────────────────────────────────────────');
  lines.push('  Quote Number:   ' + (q.num||''));
  lines.push('  Project:        ' + (q.jn||''));
  lines.push('  Job Type:       ' + (q.jt||''));
  if (q.ad)  lines.push('  Location:       ' + q.ad);
  lines.push('  Quote Date:     ' + quoteDate);
  lines.push('  Valid Until:    ' + validUntil);
  lines.push('');
  lines.push('INVESTMENT SUMMARY');
  lines.push('─────────────────────────────────────────');
  if (q.lumpSum && q.lumpSum.enabled) {
    lines.push('  ' + (q.lumpSum.label||'Complete Low Voltage Installation') + ':');
    lines.push('  Total Investment:   $ ' + (q.total||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','));
  } else {
    if (q.sellBeforeTax) lines.push('  Subtotal:           $ ' + (q.sellBeforeTax||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','));
    if (q.taxAmt > 0)    lines.push('  Tax:                $ ' + (q.taxAmt||0).toFixed(2));
    if (q.discount > 0)  lines.push('  Discount:          -$ ' + (q.discount||0).toFixed(2));
    lines.push('  Total Investment:   $ ' + (q.total||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','));
  }
  if (q.pt) { lines.push(''); lines.push('  Payment Terms: ' + q.pt); }
  lines.push('');
  var scopeText = _notesToEmailText(q.notes, q.notesIsHtml);
  if (scopeText) {
    lines.push('SCOPE OF WORK');
    lines.push('─────────────────────────────────────────');
    lines.push(scopeText);
    lines.push('');
  }
  lines.push('─────────────────────────────────────────');
  lines.push('Please review the attached proposal and don\'t hesitate to reach out');
  lines.push('with any questions. We look forward to earning your business!');
  lines.push('');
  lines.push('Best regards,');
  lines.push('');
  lines.push(uname + (utitle ? '  |  ' + utitle : ''));
  lines.push(cname);
  if (uphone) lines.push('Direct: ' + uphone);
  if (uemail) lines.push('Email:  ' + uemail);
  if (cweb)   lines.push('Web:    ' + cweb);
  if (caddr)  lines.push(caddr);

  return lines.join('\n');
}

function fireEmailQuote(q) {
  if (!q) return;
  if (q.status === 'draft' || !q.status) {
    q.status = 'sent';
    if (!q.sentDate) q.sentDate = getTodayISO();
    if (q.id) {
      var saved = DB.quotes.find(function(x){ return x.id===q.id; });
      if (saved) { saved.status='sent'; if(!saved.sentDate) saved.sentDate=getTodayISO(); saveDB(); renderQuotes && renderQuotes(); renderDash(); }
    }
    var stEl = document.getElementById('qq-status');
    if (stEl && stEl.value==='draft') stEl.value='sent';
    showToast('Status updated to Sent', 'success', 2000);
  }
  var toEmail = q.em || '';
  var toName  = q.contactName || q.cn || '';
  var subjectTpl = (DB.settings.sgSubject || 'Your Proposal from TCSS - {quote_num}');
  var bodyTpl    = (DB.settings.sgBody    || 'Please find your proposal attached for {job_name}. We appreciate the opportunity.');
  var subject  = subjectTpl.replace('{quote_num}',q.num||'').replace('{job_name}',q.jn||'Project Quote').replace('{customer}',q.cn||'');
  var bodyText = bodyTpl.replace('{quote_num}',q.num||'').replace('{job_name}',q.jn||'Project Quote').replace('{customer}',q.cn||'');
  bodyText += '\n\n' + buildEmailBody(q);
  if ((DB.settings||{}).sgKey) {
    if (!toEmail) { showToast('No customer email on file','error'); return; }
    showToast('Sending email...','info',2000);
    sendViaSendGrid(toEmail, toName, subject, bodyText, null).then(function(ok){
      if (ok) showToast('Quote emailed to ' + toEmail + ' - sent','success',4000);
    });
  } else {
    if (!toEmail) { if (!confirm('No customer email on file.\nOpen email client anyway?')) return; }
    showToast('Opening email client - attach the PDF manually','info',5000);
    window.location.href = 'mailto:' + encodeURIComponent(toEmail) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyText);
  }
}

// From preview modal — uses the currently previewed quote data
function emailQuote() {
  // Get quote data from the current QQ form (same as what's in preview)
  const q = getQData();
  q.num = (document.getElementById('qq-num')||{}).value || '';
  // If viewing a saved quote, use that instead
  if (_printMode === 'saved' && _viewingQuoteId) {
    const saved = DB.quotes.find(function(x){ return x.id == _viewingQuoteId; });
    if (saved) { fireEmailQuote(saved); return; }
  }
  fireEmailQuote(q);
}

// From QQ toolbar — saves first if unsaved, then emails
function emailQuoteQQ() {
  const cn = (document.getElementById('qq-cn')||{}).value || '';
  const jn = (document.getElementById('qq-jn')||{}).value || '';
  if (!cn.trim() || !jn.trim()) {
    showToast('Please enter a customer name and job name before emailing.','error'); return;
  }
  const q = getQData();
  q.num = (document.getElementById('qq-num')||{}).value || 'DRAFT';
  fireEmailQuote(q);
}

// From quotes list / view modal — uses saved quote
function emailSavedQuote(qid) {
  const q = DB.quotes.find(function(x){ return x.id == qid; });
  if (q) fireEmailQuote(q);
}
let _viewingQuoteId = null;

function dupQuote(id) {
  const q = DB.quotes.find(function(x){ return x.id==id; });
  if (!q) return;
  const nq = JSON.parse(JSON.stringify(q));
  // Use UUID so ID never collides with existing quotes
  nq.id = typeof makeUUID==='function' ? makeUUID() : Date.now().toString();
  nq.num = nextQNum();
  nq.status = 'draft';
  nq.createdAt = new Date().toISOString();
  // Re-assign fresh _id to every line item to prevent cross-item edit bugs
  if (nq.items) nq.items = nq.items.map(function(item){ return Object.assign({},item,{_id:nextLiId()}); });
  DB.quotes.unshift(nq);
  saveDB();
  editQuote(nq.id);
}

function viewQuote(id) {
  const q = DB.quotes.find(function(x){return x.id==id});
  if (!q) return;
  _viewingQuoteId = id;
  const body = document.getElementById('modal-view-body');
  if (!body) return;
  const envLabel = q.envLabel || (ENV_PRESETS[q.env] ? ENV_PRESETS[q.env].label : q.env || '');
  const healthColor = q.pricingHealth==='Healthy'?'#2e7d32':q.pricingHealth==='Watch'?'#e65100':'#c62828';
  body.innerHTML = '<div class="form-row cols3">' +
    '<div><label>Quote #</label><div style="font-weight:700;font-size:15px;color:#1565c0">' + escHtml(q.num||'') + '</div></div>' +
    '<div><label>Customer</label><div style="font-weight:700">' + escHtml(q.cn||'') + '</div></div>' +
    '<div><label>Status</label><span class="status-badge s-' + (q.status||'draft') + '">' + (q.status||'draft') + '</span></div>' +
    '</div>' +
    '<div class="form-row cols3">' +
    '<div><label>Job Name</label><div>' + escHtml(q.jn||'') + '</div></div>' +
    '<div><label>Job Type</label><div>' + escHtml(q.jt||'') + '</div></div>' +
    '<div><label>Environment</label><div>' + escHtml(envLabel) + '</div></div>' +
    '</div>' +
    '<div class="card" style="background:#f8fafc">' +
    '<div class="card-title">💰 Pricing Summary (Margin-Based)</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">' +
    '<div><div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Material Cost</span><span>' + fmt(q.totalMaterialCost||0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Labor Hours</span><span>' + ((q.totalLaborHours||0).toFixed(2)) + ' hrs</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Labor Sell</span><span>' + fmt(q.laborSell||0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:700"><span>Total True Cost</span><span>' + fmt(q.totalCost||0) + '</span></div></div>' +
    '<div><div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Target Margin</span><span>' + pct(q.targetMargin||35) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Achieved Margin</span><span style="font-weight:700;color:' + healthColor + '">' + pct(q.achievedMargin||0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e0e0e0"><span>Sell Before Tax</span><span>' + fmt(q.sellBeforeTax||q.subtotal||0) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:800;font-size:15px"><span>TOTAL</span><span style="color:#1565c0">' + fmt(q.total||0) + '</span></div></div>' +
    '</div></div>';
  openModal('modal-view-quote');
  // Prev/next arrows — step through quotes by number (read-only view, no dirty guard)
  if (typeof showDocNav === 'function') showDocNav('quote', id, viewQuote, null, 'modal-view-quote');
}

// ---- MODAL HELPERS ----
function openModal(id) { const m=document.getElementById(id); if(m){ m.classList.add('open'); const body=m.querySelector('.modal-body'); if(body) body.scrollTop=0; m.scrollTop=0; } }
function closeModal(id) { const m=document.getElementById(id); if(m) m.classList.remove('open');
  // Hide the document prev/next arrows when a document modal closes
  if (typeof hideDocNav === 'function' && ['modal-view-quote','modal-work-order','modal-invoice','modal-contract'].indexOf(id) >= 0) hideDocNav();
}

// ============================================================
// INLINE SECTION EDITORS — click a proposal-section label to edit
// its content in a popup without leaving the quote you're building.
// exec + terms = THIS quote; assumptions + exclusions = the shared
// defaults used on every proposal.
// ============================================================
var _sectionEditorKind = null;
function openSectionEditor(kind) {
  _sectionEditorKind = kind;
  var titleEl = document.getElementById('sec-ed-title');
  var hintEl  = document.getElementById('sec-ed-hint');
  var scopeEl = document.getElementById('sec-ed-scope');
  var ta      = document.getElementById('sec-ed-text');
  if (!ta) return;
  if (kind === 'exec') {
    titleEl.textContent = '📝 Executive Summary';
    scopeEl.textContent = 'This quote only';
    hintEl.textContent  = 'Custom opening summary for this proposal. Leave blank to auto-generate one from the line items.';
    ta.value = (document.getElementById('qq-exec-summary')||{}).value || '';
    ta.placeholder = 'Leave blank to auto-generate a summary from the equipment on this quote…';
  } else if (kind === 'terms') {
    // Terms is now a full rich editor inline — jump to it instead of the plain popup.
    var _tc = document.getElementById('qq-tc');
    if (_tc) { try { _tc.scrollIntoView({block:'center'}); _tc.focus(); } catch(e){} }
    _sectionEditorKind = null;
    return;
  } else if (kind === 'assumptions') {
    titleEl.textContent = '✅ Assumptions';
    scopeEl.textContent = 'Default — used on ALL proposals';
    hintEl.textContent  = 'One assumption per line. This is your standard list applied to every proposal.';
    var pdA = (typeof getProposalDefaults==='function') ? getProposalDefaults() : (DB.settings.proposalDefaults||{});
    ta.value = (pdA.assumptions || (typeof DEFAULT_ASSUMPTIONS!=='undefined'?DEFAULT_ASSUMPTIONS:[])).join('\n');
    ta.placeholder = 'One assumption per line…';
  } else if (kind === 'exclusions') {
    titleEl.textContent = '🚫 Exclusions';
    scopeEl.textContent = 'Default — used on ALL proposals';
    hintEl.textContent  = 'One exclusion per line. This is your standard list applied to every proposal.';
    var pdE = (typeof getProposalDefaults==='function') ? getProposalDefaults() : (DB.settings.proposalDefaults||{});
    ta.value = (pdE.exclusions || (typeof DEFAULT_EXCLUSIONS!=='undefined'?DEFAULT_EXCLUSIONS:[])).join('\n');
    ta.placeholder = 'One exclusion per line…';
  } else { return; }
  openModal('modal-section-editor');
  setTimeout(function(){ try{ ta.focus(); }catch(e){} }, 60);
}

function saveSectionEditor() {
  var kind = _sectionEditorKind;
  var ta = document.getElementById('sec-ed-text');
  if (!ta) { closeModal('modal-section-editor'); return; }
  var val = ta.value;
  if (kind === 'exec') {
    var h = document.getElementById('qq-exec-summary'); if (h) h.value = val.trim();
    if (typeof scheduleQQDraftSave === 'function') scheduleQQDraftSave();
  } else if (kind === 'terms') {
    var t = document.getElementById('qq-tc'); if (t) t.value = val;
    if (typeof scheduleQQDraftSave === 'function') scheduleQQDraftSave();
  } else if (kind === 'assumptions' || kind === 'exclusions') {
    var list = val.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
    var cur = (typeof getProposalDefaults==='function') ? getProposalDefaults() : (DB.settings.proposalDefaults||{});
    var pd = {
      showAssumptions: cur.showAssumptions !== false,
      showExclusions:  cur.showExclusions  !== false,
      assumptions: (cur.assumptions || (typeof DEFAULT_ASSUMPTIONS!=='undefined'?DEFAULT_ASSUMPTIONS:[])).slice(),
      exclusions:  (cur.exclusions  || (typeof DEFAULT_EXCLUSIONS!=='undefined'?DEFAULT_EXCLUSIONS:[])).slice()
    };
    if (kind === 'assumptions') pd.assumptions = list; else pd.exclusions = list;
    DB.settings.proposalDefaults = pd;
    if (typeof saveDB === 'function') saveDB();
  }
  closeModal('modal-section-editor');
  if (typeof showToast === 'function') showToast('Saved — back to your quote', 'success', 1800);
  _sectionEditorKind = null;
}

function deleteQuote(id) {
  // Layer 1 (UX): only offer deletion to roles the permission matrix allows.
  // The database (soft_delete_quote RPC) is the real lock — this just keeps the
  // UI honest and gives a clear message if a disallowed path is reached.
  if (typeof hasPermission === 'function' && !hasPermission('quote.delete')) {
    showToast('Your role is not permitted to delete quotes.', 'error', 5000);
    return;
  }
  if (!confirm('Delete this quote?\n\nIt moves to the recycle bin — an owner or manager can restore it.')) return;
  if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
  if (DB.deletedIds.quotes.indexOf(id) < 0) DB.deletedIds.quotes.push(id);
  DB.quotes = DB.quotes.filter(function(q){ return q.id != id; });
  saveDB(); // persist the removal + tombstone right away so a refresh can't resurrect it
  if (window._syncTimer) { clearTimeout(window._syncTimer); window._syncTimer = null; }
  if (_sb && _currentUser) {
    // Server-authoritative soft delete: the RPC checks the caller's role, marks
    // the row deleted_at (recoverable, line items preserved), and writes the audit
    // record — atomically, server-side. A blocked delete returns an error, so we
    // keep the tombstone and retry on the next sync (also covers offline).
    _sb.rpc('soft_delete_quote', { p_id: id }).then(function(r){
      if (r && r.error) {
        console.warn('[Delete] soft_delete_quote:', r.error.message);
        showToast('Cloud delete pending (' + r.error.message + ') — will retry on next sync.', 'error', 6000);
      }
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  renderQuotes(); renderDash();
  showToast('Quote deleted (recoverable)', 'info');
}

// One-time cleanup: remove empty draft "stub" quotes that the pre-fix auto-save left
// orphaned in the DB (customer + job name saved with no line items, $0 total). Routes
// through the SAME tombstone + Supabase delete path as deleteQuote() so the rows are
// removed locally AND in the cloud and can't be resurrected by the next pushAllToCloud.
function cleanupEmptyDraftQuotes() {
  var openId = (document.getElementById('qq-id')||{}).value || '';
  function isEmptyStub(q) {
    if (!q || !q.id) return false;
    if (q.id === openId) return false;                          // never touch the quote open in the form
    if ((q.status || 'draft').toLowerCase() !== 'draft') return false; // only unsent drafts
    var noItems = !q.items || q.items.length === 0;
    var noEquip = !q.equipmentRows || q.equipmentRows.length === 0;
    var noPD    = !q.perDiemCost || Number(q.perDiemCost) <= 0;
    var noLump  = !(q.lumpSum && q.lumpSum.enabled);
    var zeroTot = !q.total || Number(q.total) <= 0;
    return noItems && noEquip && noPD && noLump && zeroTot;
  }
  var victims = (DB.quotes || []).filter(isEmptyStub);
  if (!victims.length) { showToast('No empty draft quotes to clean up ✓', 'success'); return; }
  if (!confirm('Found ' + victims.length + ' empty draft quote' + (victims.length===1?'':'s') +
               ' (no line items, $0 total). Delete permanently? This cannot be undone.')) return;
  if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
  var ids = victims.map(function(q){ return q.id; });
  ids.forEach(function(id){ if (DB.deletedIds.quotes.indexOf(id) < 0) DB.deletedIds.quotes.push(id); });
  DB.quotes = DB.quotes.filter(function(q){ return ids.indexOf(q.id) < 0; });
  if (window._syncTimer) { clearTimeout(window._syncTimer); window._syncTimer = null; }
  if (_sb && _currentUser) {
    ids.forEach(function(id){
      _sb.rpc('soft_delete_quote', { p_id: id }).then(function(r){ if (r && r.error) console.warn('[Cleanup] Quote', id, r.error.message); });
    });
    saveDB();
    if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 400);
  } else {
    saveDB();
  }
  if (typeof renderQuotes === 'function') renderQuotes();
  if (typeof renderDash === 'function') renderDash();
  showToast('Removed ' + victims.length + ' empty draft quote' + (victims.length===1?'':'s') + ' ✓', 'success');
}

function _generateToken() {
  // Generates a secure random UUID-style token
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function copyPortalLink(id) {
  var q = DB.quotes.find(function(x){ return x.id === id; });
  if (!q) { showToast('Quote not found', 'error'); return; }

  // Generate token if not already set
  if (!q.approvalToken) {
    q.approvalToken = _generateToken();
    saveDB();
    // Persist token to Supabase immediately
    if (_sb && _currentUser) {
      await _sb.from('quotes').update({ approval_token: q.approvalToken }).eq('id', id);
    }
  }

  var baseUrl = window.location.origin + window.location.pathname.replace('index.html','').replace(/\/$/, '');
  var portalUrl = baseUrl + '/portal.html?token=' + q.approvalToken;

  try {
    await navigator.clipboard.writeText(portalUrl);
    showToast('Approval link copied to clipboard! Paste it into your email to ' + (q.cn||'the customer'), 'success', 5000);
  } catch(e) {
    // Fallback for browsers that block clipboard
    prompt('Copy this link and send it to your customer:', portalUrl);
  }
}

// ============================================================
// INVOICES PAGE
// ============================================================
function renderInvoicesPage() {
  var search = ((document.getElementById('invp-search')||{}).value||'').toLowerCase();
  var filter = (document.getElementById('invp-filter')||{}).value||'';
  var today  = getTodayISO();
  var invs   = (DB.invoices||[]).filter(function(i){ return i.type!=='recurring' && !(i.num||'').match(/^INV-(RC|MSC)/); }).slice();

  // Enrich with overdue status
  invs = invs.map(function(inv){
    var isOverdue = inv.status!=='paid' && inv.due && inv.due < today;
    return Object.assign({}, inv, {isOverdue: isOverdue});
  });

  // Summary
  var unpaid  = invs.filter(function(i){ return i.status!=='paid'; }).reduce(function(s,i){ return s+(i.total||0); },0);
  var paid    = invs.filter(function(i){ return i.status==='paid'; }).reduce(function(s,i){ return s+(i.total||0); },0);
  var overdue = invs.filter(function(i){ return i.isOverdue; }).length;
  function setS(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  setS('invp-total',  invs.length);
  setS('invp-unpaid', '$'+Math.round(unpaid).toLocaleString());
  setS('invp-paid',   '$'+Math.round(paid).toLocaleString());
  setS('invp-overdue',overdue);

  // Search + filter
  if (search) invs = invs.filter(function(i){
    return (i.num||'').toLowerCase().includes(search)||
           (i.job&&(i.job.customer||'').toLowerCase().includes(search))||
           (i.job&&(i.job.name||'').toLowerCase().includes(search));
  });
  if (filter==='sent')    invs = invs.filter(function(i){ return i.status!=='paid'; });
  if (filter==='paid')    invs = invs.filter(function(i){ return i.status==='paid'; });
  if (filter==='overdue') invs = invs.filter(function(i){ return i.isOverdue; });

  var cont = document.getElementById('invp-list');
  if (!cont) return;

  if (!invs.length) {
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:#90a4ae">'+
      (search||filter?'No invoices match your search.':'No invoices yet. Generate one from any job using the 🧾 button.')+
    '</div>';
    return;
  }

  var header = '<div style="display:grid;grid-template-columns:1fr 1.5fr 0.8fr 0.8fr 0.8fr auto;gap:12px;padding:8px 14px;border-bottom:2px solid #e8e8e8;background:#f8f9fa;border-radius:8px 8px 0 0">'+
    ['Invoice','Job / Customer','Date','Due','Amount','Actions'].map(function(h){
      return '<span style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.5px">'+h+'</span>';
    }).join('')+
  '</div>';

  var rows = invs.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); })
  .map(function(inv){
    var isPaid    = inv.status==='paid';
    var isPartial = inv.status==='partial';
    var isOverdue = inv.isOverdue;
    var payments  = (DB.invoicePayments||[]).filter(function(p){ return p.invoiceId===inv.id; });
    var totalPaid = payments.reduce(function(s,p){ return s+parseFloat(p.amount||0); }, 0);
    var balance   = (inv.total||0) - totalPaid;
    var statusBg  = isPaid?'#e8f5e9':isPartial?'#e3f2fd':isOverdue?'#ffebee':'#fff3e0';
    var statusCol = isPaid?'#2e7d32':isPartial?'#1565c0':isOverdue?'#c62828':'#e65100';
    var statusLbl = isPaid?'✓ Paid':isPartial?('⬛ Partial ($'+balance.toLocaleString('en-US',{minimumFractionDigits:2})+' due)'):isOverdue?'⚠ Overdue':'Unpaid';

    return '<div style="display:grid;grid-template-columns:1fr 1.5fr 0.8fr 0.8fr 0.8fr auto;gap:12px;padding:12px 14px;border-bottom:1px solid #f0f0f0;align-items:center;cursor:pointer" onclick="reprintInvoice(\''+inv.id+'\')" onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'\'">'+
      '<div>'+
        '<div style="font-weight:700;font-size:13px;color:#1565c0">'+escHtml(inv.num||'')+'</div>'+
        (inv.po?'<div style="font-size:11px;color:#90a4ae">PO: '+escHtml(inv.po)+'</div>':'')+
      '</div>'+
      '<div>'+
        '<div style="font-weight:600;font-size:13px">'+escHtml((inv.job&&inv.job.name)||'')+'</div>'+
        '<div style="font-size:11px;color:#546e7a">'+escHtml((inv.job&&inv.job.customer)||'')+'</div>'+
      '</div>'+
      '<div style="font-size:12px;color:#546e7a">'+escHtml(inv.date||'')+'</div>'+
      '<div style="font-size:12px;color:'+(isOverdue?'#c62828':'#546e7a')+'">'+escHtml(inv.due||'—')+'</div>'+
      '<div>'+
        '<div style="font-weight:700;font-size:14px;color:#0d1b2a">'+fmt(inv.total||0)+'</div>'+
        '<span style="background:'+statusBg+';color:'+statusCol+';border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">'+statusLbl+'</span>'+
      '</div>'+
      '<div style="display:flex;gap:4px" onclick="event.stopPropagation()">'+
        '<button class="btn btn-outline btn-sm" onclick="reprintInvoice(\''+inv.id+'\')" title="Edit">✏ Edit</button>'+
        '<button class="btn btn-outline btn-sm" onclick="printInvoiceDirect(\''+inv.id+'\')" title="Print">🖨</button>'+
        (!isPaid?'<button class="btn btn-outline btn-sm" onclick="openRecordPayment(\''+inv.id+'\')" title="Record Payment">💵</button>':'')+
        (!isPaid?'<button class="btn btn-primary btn-sm" onclick="markInvoicePaid(\''+inv.id+'\')" title="Mark Fully Paid">✓ Paid</button>':'')+
        '<button class="btn btn-danger btn-sm" onclick="deleteInvoice(\''+inv.id+'\')" title="Delete">✕</button>'+
      '</div>'+
    '</div>';
  }).join('');

  cont.innerHTML = header + rows;
}

function reprintInvoice(invId) {
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) return;
  // Guard against old invoice records that may not have .job object
  var invJob = inv.job || {};
  // Migrate old items: if they have mc but no unitPrice, use mc as unitPrice
  // For old invoices from pre-rebuild: try to find the sell price from the quote
  var quote = inv.quoteId ? (DB.quotes||[]).find(function(q){return q.id===inv.quoteId;}) : null;
  _invItems = (inv.items||[]).map(function(li,i){
    var up = parseFloat(li.unitPrice||li.mc||0);
    return Object.assign({},li,{_eid:i, unitPrice:up, mc:up});
  });
  var itemsTotal = _invItems.reduce(function(s,li){ return s+(parseFloat(li.unitPrice||0))*(parseFloat(li.qty||1)); },0);
  // If all items are $0 but we have a linked quote, regenerate items from quote
  if (itemsTotal === 0 && inv.quoteId && quote) {
    var freshItems = [];
    var laborRate = parseFloat(quote.laborRate||DB.settings.laborRate||125);
    var qItems = quote.items || [];
    var laborQItems = qItems.filter(function(li){ return li.lh && parseFloat(li.lh)>0; });
    var matQItems   = qItems.filter(function(li){ return !li.lh || parseFloat(li.lh)===0; });
    var totalMatCost = matQItems.reduce(function(s,li){ return s+(parseFloat(li.mc||0))*(parseFloat(li.qty||1)); },0);
    var matSell = parseFloat(quote.materialSell||0) || (parseFloat(quote.total||0) - (parseFloat(quote.laborSell||0)));
    var matMult = totalMatCost > 0 ? matSell/totalMatCost : 1;
    laborQItems.forEach(function(li){
      var hrs = (parseFloat(li.lh||0))*(parseFloat(li.qty||1));
      freshItems.push({ desc:li.desc||'Labor', cat:'Labor', qty:hrs, unitPrice:laborRate, mc:laborRate });
    });
    matQItems.forEach(function(li){
      var sell = Math.round((parseFloat(li.mc||0)*matMult)*100)/100;
      freshItems.push({ desc:li.desc||'', cat:li.cat||'Material', qty:parseFloat(li.qty||1), unitPrice:sell, mc:sell });
    });
    if (freshItems.length) _invItems = freshItems.map(function(li,i){ return Object.assign({},li,{_eid:i}); });
    else _invItems = [{ _eid:0, desc:invJob.name||'Services Rendered', cat:'Labor', qty:1, unitPrice:parseFloat(inv.total||0), mc:parseFloat(inv.total||0) }];
  } else if (itemsTotal === 0 && parseFloat(inv.total||0) > 0) {
    _invItems = [{ _eid:0, desc:invJob.name||'Services Rendered', cat:'Labor', qty:1, unitPrice:parseFloat(inv.total||0), mc:parseFloat(inv.total||0) }];
  }
  function sv(id,val){ var el=document.getElementById(id); if(el) el.value=(val!==undefined&&val!==null)?String(val):''; }
  sv('inv-num',        inv.num||'');
  sv('inv-date',       inv.date||'');
  sv('inv-due',        inv.due||'');
  sv('inv-terms',      inv.terms||'Net 30');
  sv('inv-po',         inv.po||'');
  sv('inv-tax',        inv.taxRate||0);
  sv('inv-notes',      inv.notes||'');
  sv('inv-job-id',     inv.jobId||'');
  sv('inv-wo-id',      inv.woId||'');
  sv('inv-quote-id',   inv.quoteId||'');
  sv('inv-existing-id',inv.id);
  // Show source chain
  var chainEl2 = document.getElementById('inv-source-chain');
  if (chainEl2) {
    var chain2 = [];
    if (inv.quoteId) { var q2=(DB.quotes||[]).find(function(q){return q.id===inv.quoteId;}); if(q2) chain2.push('Quote '+escHtml(q2.num||'')); }
    if (inv.jobId)   { var j2=(typeof _findJobOrWO==="function"?_findJobOrWO(inv.jobId):(DB.jobs||[]).find(function(j){return j.id===inv.jobId;})); if(j2) chain2.push('Job '+escHtml(j2.num||'')); }
    if (inv.woId)    { var w2=(DB.workOrders||[]).find(function(w){return w.id===inv.woId;}); if(w2) chain2.push('WO '+escHtml(w2.woNumber||'')); }
    chainEl2.innerHTML = chain2.length ? '📎 Source: '+chain2.join(' → ') : '';
  }
  // Resolve customer name — cascade through multiple sources
  var invCust = null;
  if (inv.jobId) {
    var invJob2 = (typeof _findJobOrWO==="function"?_findJobOrWO(inv.jobId):(DB.jobs||[]).find(function(j){return j.id===inv.jobId;}));
    if (invJob2 && invJob2.customerId) invCust = (DB.customers||[]).find(function(c){ return c.id===invJob2.customerId; });
    if (!invCust && invJob2 && invJob2.customer) invCust = { name:invJob2.customer, address:invJob2.address||'' };
  }
  sv('inv-bill-name',  inv.billName||invJob.customer||(invCust&&invCust.name)||'');
  sv('inv-bill-email', inv.billEmail||(invCust&&(invCust.invoicingEmail||invCust.email))||'');
  sv('inv-bill-addr',  inv.billAddr||invJob.address||(invCust&&(invCust.street||invCust.address))||'');
  sv('inv-bill-city',  inv.billCity||(invCust&&invCust.city)||'');
  sv('inv-bill-state', inv.billState||(invCust&&invCust.state)||'');
  sv('inv-bill-zip',   inv.billZip||(invCust&&invCust.zip)||'');
  sv('inv-job-name',   invJob.name||'');
  sv('inv-job-addr',   invJob.address||'');
  sv('inv-job-num',    invJob.num||'');
  renderInvItemsEditor();
  refreshInvTotals();
  openModal('modal-invoice');
  // Prev/next arrows — step through invoices by number
  if (typeof showDocNav === 'function') showDocNav('invoice', invId, reprintInvoice, null, 'modal-invoice');
}

function printInvoiceDirect(invId) {
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) return;
  // Check if items are empty/zero — if so, try to reload from quote first
  var itemsTotal = (inv.items||[]).reduce(function(s,li){ return s+(parseFloat(li.unitPrice||li.mc||0))*(parseFloat(li.qty||1)); },0);
  if (itemsTotal === 0 && parseFloat(inv.total||0) > 0) {
    var invJob = inv.job || {};
    inv.items = [{ desc:invJob.name||'Services Rendered', cat:'Labor', qty:1, unitPrice:parseFloat(inv.total||0), mc:parseFloat(inv.total||0) }];
  }
  var html = buildInvoiceHTML(inv);
  var win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); setTimeout(function(){ win.print(); },500); }
}

function previewInvoice() {
  var jobId = (document.getElementById('inv-job-id')||{}).value||'';
  var job = (typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;}))||{};
  var invData = buildInvoiceData(job);
  var html = buildInvoiceHTML(invData);
  var win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

function saveAndPrintInvoice() {
  var jobId = (document.getElementById('inv-job-id')||{}).value||'';
  var job   = (typeof _findJobOrWO==="function"?_findJobOrWO(jobId):(DB.jobs||[]).find(function(j){return j.id===jobId;}))||{};
  var invData = buildInvoiceData(job);

  if (!DB.invoices) DB.invoices = [];
  var existingId = (document.getElementById('inv-existing-id')||{}).value||'';
  if (existingId) {
    var idx = DB.invoices.findIndex(function(i){ return i.id===existingId; });
    if (idx>=0) { invData.id=existingId; DB.invoices[idx]=invData; }
    else DB.invoices.push(invData);
  } else {
    DB.invoices.push(invData);
    if (job.id) { job.status='Invoiced'; job.invoiced=true; job.invoiceNum=invData.num; }
  }

  saveDB();
  closeModal('modal-invoice');
  renderInvoicesPage();
  if (typeof renderJobs === 'function') renderJobs();

  var html = buildInvoiceHTML(invData);
  var win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); setTimeout(function(){ win.print(); },600); }
  showToast('Invoice '+invData.num+' saved ✓','success');
}

function markInvoicePaid(invId) {
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) return;
  inv.status = 'paid';
  inv.paidDate = getTodayISO();
  // Update linked job status
  var job = (typeof _findJobOrWO==="function"?_findJobOrWO(inv.jobId):(DB.jobs||[]).find(function(j){return j.id===inv.jobId;}));
  if (job) { job.status='Closed'; job.invoicePaid=true; }
  saveDB();
  renderInvoicesPage();
  renderJobs();
  showToast('Invoice '+inv.num+' marked as paid ✓','success');
}

function deleteInvoice(invId) {
  if (!confirm('Delete this invoice? This cannot be undone.')) return;
  DB.invoices = (DB.invoices||[]).filter(function(i){ return i.id!==invId; });
  saveDB();
  renderInvoicesPage();
  showToast('Invoice deleted','info');
}

// ============================================================
// END INVOICES PAGE
// ============================================================

function exportCSV() {
  const rows = [['Quote#','Customer','Job Name','Environment','Total','Target Margin','Achieved Margin','Health','Status','Date']];
  DB.quotes.forEach(function(q){
    const envLabel = q.envLabel || (ENV_PRESETS[q.env] ? ENV_PRESETS[q.env].label : q.env||'');
    rows.push([q.num||'',q.cn||'',q.jn||'',envLabel,q.total||0,pct(q.targetMargin||35),pct(q.achievedMargin||0),q.pricingHealth||'',q.status||'',q.dt||'']);
  });
  const csv = rows.map(function(r){return r.map(function(c){return '"'+(c+'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tcss-quotes.csv'; a.click();
}

var _invoiceJobId = null;



// ---- INVOICE LINE ITEM EDITOR ----
var _invItems = [];

function initInvItemsEditor(items) {
  _invItems = items ? items.map(function(li,i){ return Object.assign({},li,{_eid:i}); }) : [];
  renderInvItemsEditor();
  refreshInvTotals();
}

function _populateCatalogDatalist() {
  var dl = document.getElementById('inv-catalog-dl');
  if (!dl) return;
  dl.innerHTML = (DB.catalog||[]).map(function(c){
    return '<option value="'+escHtml(c.name||c.desc||'')+'">';
  }).join('');
}

function invPickFromCatalog(idx, val) {
  var item = (DB.catalog||[]).find(function(c){ return (c.name||c.desc||'').toLowerCase()===val.toLowerCase(); });
  if (!item) { updateInvItem(idx,'desc',val); return; }
  _invItems[idx].desc      = item.name||item.desc||val;
  _invItems[idx].unitPrice = parseFloat(item.mc||0);
  _invItems[idx].mc        = parseFloat(item.mc||0);
  _invItems[idx].cat       = item.cat||'Material';
  renderInvItemsEditor();
  refreshInvTotals();
}

function renderInvItemsEditor() {
  _populateCatalogDatalist();
  var rows = document.getElementById('inv-items-rows');
  if (!rows) return;
  if (!_invItems.length) {
    rows.innerHTML = '<div style="padding:16px;text-align:center;color:#90a4ae;font-size:13px">No line items yet — click + Add Line Item</div>';
    return;
  }
  rows.innerHTML = _invItems.map(function(li,i) {
    var lineTotal = (parseFloat(li.unitPrice||li.mc||0)) * (parseFloat(li.qty||1));
    return '<div style="display:grid;grid-template-columns:3fr 1fr 1fr 1fr 70px 36px;gap:4px;padding:8px 12px;border-top:1px solid #f0f4f8;align-items:center">'+
      // Description with catalog autocomplete
      '<input value="'+escHtml(li.desc||'')+'" list="inv-catalog-dl" '+
        'oninput="updateInvItem('+i+',\'desc\',this.value)" '+
        'onchange="invPickFromCatalog('+i+',this.value)" '+
        'placeholder="Description or search catalog..." '+
        'style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%">'+
      // Category
      '<select onchange="updateInvItem('+i+',\'cat\',this.value)" style="border:1px solid #e0e7ef;border-radius:4px;padding:5px;font-size:11px;width:100%">'+
        ['Labor','Material','Equipment','Expense','Other'].map(function(c){return '<option'+(li.cat===c?' selected':'')+'>'+c+'</option>';}).join('')+
      '</select>'+
      // Qty
      '<input type="number" value="'+(li.qty||1)+'" min="0.01" step="0.01" '+
        'oninput="updateInvItem('+i+',\'qty\',this.value)" '+
        'style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;text-align:center">'+
      // Unit Price
      '<input type="number" value="'+parseFloat(li.unitPrice||li.mc||0).toFixed(2)+'" min="0" step="0.01" '+
        'oninput="updateInvItem('+i+',\'unitPrice\',this.value)" '+
        'style="border:1px solid #e0e7ef;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;text-align:right">'+
      // Line total (read only)
      '<div class="inv-line-total" style="text-align:right;font-size:12px;font-weight:700;color:#1565c0;padding-right:4px">'+fmt(lineTotal)+'</div>'+
      // Remove
      '<button onclick="removeInvItem('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:18px;padding:0 4px;line-height:1">×</button>'+
    '</div>';
  }).join('');
}

function updateInvItem(idx, field, val) {
  if (!_invItems[idx]) return;
  _invItems[idx][field] = field==='qty'||field==='unitPrice'||field==='mc' ? parseFloat(val)||0 : val;
  if (field==='unitPrice') _invItems[idx].mc = parseFloat(val)||0;
  // Update just this row's line total display without re-rendering (preserves focus)
  var lineTotals = document.querySelectorAll('#inv-items-rows .inv-line-total');
  if (lineTotals[idx]) {
    var lt = (parseFloat(_invItems[idx].unitPrice||0)) * (parseFloat(_invItems[idx].qty||1));
    lineTotals[idx].textContent = fmt(lt);
  }
  refreshInvTotals();
}

function removeInvItem(idx) {
  _invItems.splice(idx,1);
  _invItems.forEach(function(li,i){ li._eid=i; });
  renderInvItemsEditor();
  refreshInvTotals();
}

function addInvLineItem() {
  _invItems.push({ _eid:_invItems.length, desc:'', cat:'Labor', qty:1, unitPrice:0, mc:0 });
  renderInvItemsEditor();
  refreshInvTotals();
}

function refreshInvTotals() {
  var taxRate = parseFloat((document.getElementById('inv-tax')||{}).value)||0;
  var invId   = (document.getElementById('inv-existing-id')||{}).value||'';
  var subtotal = _invItems.reduce(function(s,li){ return s + (parseFloat(li.unitPrice||li.mc||0))*(parseFloat(li.qty||1)); },0);
  var taxAmt   = subtotal*(taxRate/100);
  var payments = invId ? (DB.invoicePayments||[]).filter(function(p){return p.invoiceId===invId;}).reduce(function(s,p){return s+parseFloat(p.amount||0);},0) : 0;
  var total    = subtotal + taxAmt - payments;

  var stEl=document.getElementById('inv-subtotal-display'); if(stEl) stEl.textContent=fmt(subtotal);
  var txRow=document.getElementById('inv-tax-row');        if(txRow) txRow.style.display=taxRate>0?'flex':'none';
  var txEl=document.getElementById('inv-tax-display');     if(txEl)  txEl.textContent=fmt(taxAmt);
  var pmtRow=document.getElementById('inv-payments-row');  if(pmtRow) pmtRow.style.display=payments>0?'flex':'none';
  var pmtEl=document.getElementById('inv-payments-display'); if(pmtEl) pmtEl.textContent='-'+fmt(payments);
  var totEl=document.getElementById('inv-total-display');  if(totEl)  totEl.textContent=fmt(total);
}

// ---- OPEN INVOICE MODAL ----
function openInvoiceModal(job) {
  if (!DB.invSeq) DB.invSeq=1000;
  DB.invSeq++;
  var today = getTodayISO();

  // Find linked WO and Quote
  var wo    = job.woId ? (DB.workOrders||[]).find(function(w){ return w.id===job.woId; }) : null;
  var quoteId = job.quoteId || job.qid || (wo&&wo.quoteId) || null;
  var quote = quoteId ? (DB.quotes||[]).find(function(q){ return q.id===quoteId; }) : null;
  var cust  = job.customerId ? (DB.customers||[]).find(function(c){ return c.id===job.customerId; }) : null;
  if (!cust && job.customer) cust = (DB.customers||[]).find(function(c){ return (c.name||'').toLowerCase()===(job.customer||'').toLowerCase(); });

  // Payment terms — customer default → quote → Net 30
  var terms = (cust&&cust.defaultTerms) || (quote&&quote.pt) || 'Due on Receipt';
  var daysMap = {'Due on Receipt':0,'Net 15':15,'Net 30':30,'Net 45':45,'Net 60':60,'50% Deposit / 50% on Completion':30};
  var days = daysMap[terms];
  var dueDate = '';
  if (days !== undefined) {
    var d = new Date(today); d.setDate(d.getDate()+days);
    dueDate = d.toISOString().split('T')[0];
  }

  function sv(id,val){ var el=document.getElementById(id); if(el) el.value=(val!==undefined&&val!==null)?String(val):''; }
  sv('inv-num',      'INV-'+DB.invSeq);
  sv('inv-date',     today);
  sv('inv-due',      dueDate);
  sv('inv-terms',    terms);
  sv('inv-po',       job.poNumber||'');
  sv('inv-tax',      (wo&&wo.taxRate) || (quote&&quote.taxRate) || (DB.settings&&DB.settings.taxRate) || 0);
  sv('inv-notes',    (DB.settings&&DB.settings.invNotes) || (DB.settings&&DB.settings.payTerms) || '');
  sv('inv-job-id',   job.id||'');
  sv('inv-wo-id',    (wo&&wo.id)||'');
  sv('inv-quote-id', quoteId||'');
  sv('inv-existing-id','');

  // Bill to — customer billing address
  var billName = job.customer || (cust&&cust.name) || '';
  sv('inv-bill-name',  billName);
  sv('inv-bill-email', cust ? (cust.invoicingEmail||cust.email||'') : '');
  sv('inv-bill-addr',  cust ? (cust.street||cust.address||'') : (job.address||''));
  sv('inv-bill-city',  cust ? (cust.city||'') : '');
  sv('inv-bill-state', cust ? (cust.state||'') : '');
  sv('inv-bill-zip',   cust ? (cust.zip||'') : '');

  // Job info
  sv('inv-job-name', job.name||'');
  sv('inv-job-addr', (wo&&wo.siteAddr) || job.address || '');
  sv('inv-job-num',  job.num||'');

  // Source chain display
  var chain = [];
  if (quote) chain.push('Quote '+escHtml(quote.num||''));
  chain.push('Job '+escHtml(job.num||''));
  if (wo) chain.push('WO '+escHtml(wo.woNumber||''));
  var chainEl = document.getElementById('inv-source-chain');
  if (chainEl) chainEl.innerHTML = '📎 Source: ' + chain.join(' → ');

  // Build line items — WO labor/expenses first, then quote, then blank
  var items = [];
  var laborRate = parseFloat((wo&&wo.laborRate)||(quote&&quote.laborRate)||(DB.settings&&DB.settings.laborRate)||125);
  var taxRate   = parseFloat((wo&&wo.taxRate)||(quote&&quote.taxRate)||0);
  sv('inv-tax', taxRate);

  if (wo) {
    // Labor from WO time entries
    var woLabor    = (DB.woLabor||[]).filter(function(l){ return l.woId===wo.id; });
    var woExpenses = (DB.woExpenses||[]).filter(function(e){ return e.woId===wo.id; });
    var woParts    = (DB.woParts||[]).filter(function(p){ return p.woId===wo.id && p.status==='received'; });

    // Group labor by tech
    var laborByTech = {};
    woLabor.forEach(function(l){
      var key = l.techName||'Labor';
      laborByTech[key] = (laborByTech[key]||0) + parseFloat(l.hours||0);
    });
    Object.keys(laborByTech).forEach(function(tech){
      var hrs = laborByTech[tech];
      if (hrs > 0) items.push({ desc:tech+' — Labor ('+hrs.toFixed(2)+' hrs)', cat:'Labor', qty:hrs, unitPrice:laborRate, mc:laborRate });
    });

    // Expenses
    woExpenses.forEach(function(e){
      items.push({ desc:e.category+(e.description?' — '+e.description:''), cat:'Expense', qty:1, unitPrice:parseFloat(e.amount||0), mc:parseFloat(e.amount||0) });
    });

    // Parts
    woParts.forEach(function(p){
      items.push({ desc:p.name||'Part', cat:'Material', qty:parseFloat(p.qty||1), unitPrice:0, mc:0 });
    });
  }

  // If WO had nothing logged yet, fall back to quote sell prices
  if (!items.length && quote) {
    var qItems = quote.items||[];
    var laborQItems = qItems.filter(function(li){ return li.lh && parseFloat(li.lh)>0; });
    var matQItems   = qItems.filter(function(li){ return !li.lh || parseFloat(li.lh)===0; });
    var totalMatCost = matQItems.reduce(function(s,li){ return s+(parseFloat(li.mc||0))*(parseFloat(li.qty||1)); },0);
    var matSell = parseFloat(quote.materialSell||0) || (parseFloat(quote.total||0) - parseFloat(quote.laborSell||0));
    var matMult = totalMatCost > 0 ? matSell/totalMatCost : 1;
    laborQItems.forEach(function(li){
      var hrs = (parseFloat(li.lh||0))*(parseFloat(li.qty||1));
      if (hrs > 0) items.push({ desc:li.desc||'Labor', cat:'Labor', qty:hrs, unitPrice:laborRate, mc:laborRate });
    });
    matQItems.forEach(function(li){
      var sell = Math.round((parseFloat(li.mc||0)*matMult)*100)/100;
      items.push({ desc:li.desc||'', cat:li.cat||'Material', qty:parseFloat(li.qty||1), unitPrice:sell, mc:sell });
    });
    if (!items.length) {
      items.push({ desc:job.name||'Services Rendered', cat:'Labor', qty:1, unitPrice:parseFloat(quote.total||0), mc:parseFloat(quote.total||0) });
    }
  }

  // Last resort — single blank line
  if (!items.length) {
    items.push({ desc:job.name||'', cat:'Labor', qty:1, unitPrice:0, mc:0 });
  }

  initInvItemsEditor(items);
  openModal('modal-invoice');
}

function buildInvoiceData(job) {
  var taxRate = parseFloat((document.getElementById('inv-tax')||{}).value||0);
  var subtotal = _invItems.reduce(function(s,li){ return s+(parseFloat(li.unitPrice||li.mc||0))*(parseFloat(li.qty||1)); },0);
  var taxAmt = subtotal*(taxRate/100);
  var total  = subtotal + taxAmt;
  function gv(id){ var el=document.getElementById(id); return el?el.value.trim():''; }
  return {
    id:        (document.getElementById('inv-existing-id')||{}).value || 'inv-'+Date.now(),
    jobId:     gv('inv-job-id'),
    woId:      gv('inv-wo-id'),
    quoteId:   gv('inv-quote-id'),
    num:       gv('inv-num') || 'INV-0001',
    date:      gv('inv-date'),
    due:       gv('inv-due'),
    terms:     gv('inv-terms'),
    po:        gv('inv-po'),
    taxRate:   taxRate,
    taxAmt:    taxAmt,
    subtotal:  subtotal,
    total:     total,
    notes:     gv('inv-notes'),
    status:    'sent',
    billName:  gv('inv-bill-name'),
    billEmail: gv('inv-bill-email'),
    billAddr:  gv('inv-bill-addr'),
    billCity:  gv('inv-bill-city'),
    billState: gv('inv-bill-state'),
    billZip:   gv('inv-bill-zip'),
    job: {
      name:    gv('inv-job-name'),
      address: gv('inv-job-addr'),
      num:     gv('inv-job-num'),
      customer:gv('inv-bill-name')
    },
    items:     _invItems.map(function(li){ return Object.assign({},li); }),
    createdAt: getTodayISO()
  };
}

function buildInvoiceHTML(inv) {
  var s = DB.settings||{};
  var cphone = s.cphone || '(336) 629-7474';
  var cemail = s.cemail || 'info@tcss.com';
  var caddr  = s.caddr  || '3203 US Hwy 220 Business S., Asheboro, NC 27205';
  var clic   = s.clic   || '';

  // Build billing address block
  var invJob = inv.job || {};
  var billLines = [inv.billName||invJob.customer||''];
  if (inv.billEmail) billLines.push(inv.billEmail);
  if (inv.billAddr) billLines.push(inv.billAddr);
  var cityLine = [inv.billCity, inv.billState].filter(Boolean).join(', ');
  if (cityLine) { if (inv.billZip) cityLine += ' ' + inv.billZip; billLines.push(cityLine); }
  else if (inv.billZip) billLines.push(inv.billZip);

  // Payments applied
  var payments = (DB.invoicePayments||[]).filter(function(p){return p.invoiceId===inv.id;});
  var totalPaid = payments.reduce(function(s,p){return s+parseFloat(p.amount||0);},0);
  var balanceDue = inv.total - totalPaid;

  // Line items — group by Labor vs Material vs Other
  var laborItems = (inv.items||[]).filter(function(li){ return (li.cat||'').toLowerCase()==='labor'; });
  var matItems   = (inv.items||[]).filter(function(li){ return (li.cat||'').toLowerCase()==='material'; });
  var otherItems = (inv.items||[]).filter(function(li){ var c=(li.cat||'').toLowerCase(); return c!=='labor'&&c!=='material'; });
  var allItems   = (inv.items||[]);

  function itemRows(items, headerColor) {
    return items.map(function(li) {
      var lineTotal = (parseFloat(li.unitPrice||li.mc||0))*(parseFloat(li.qty||1));
      return '<tr>'+
        '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px">'+escHtml(li.desc||'')+'</td>'+
        '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#546e7a">'+escHtml(li.cat||'')+'</td>'+
        '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px">'+(parseFloat(li.qty)||1)+'</td>'+
        '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">'+fmt(parseFloat(li.unitPrice||li.mc||0))+'</td>'+
        '<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700">'+fmt(lineTotal)+'</td>'+
      '</tr>';
    }).join('');
  }

  var lineItemsHTML = '';
  if (laborItems.length && matItems.length) {
    // Separate sections
    lineItemsHTML += '<tr><td colspan="5" style="padding:8px 14px;background:#f0f4f8;font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.5px">Labor</td></tr>';
    lineItemsHTML += itemRows(laborItems);
    lineItemsHTML += '<tr><td colspan="5" style="padding:8px 14px;background:#f0f4f8;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px">Materials &amp; Equipment</td></tr>';
    lineItemsHTML += itemRows(matItems);
    if (otherItems.length) {
      lineItemsHTML += '<tr><td colspan="5" style="padding:8px 14px;background:#f0f4f8;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.5px">Other</td></tr>';
      lineItemsHTML += itemRows(otherItems);
    }
  } else {
    lineItemsHTML = itemRows(allItems);
  }

  if (!lineItemsHTML) {
    lineItemsHTML = '<tr><td colspan="5" style="padding:16px 14px;color:#546e7a;font-style:italic;font-size:13px">'+escHtml((inv.job&&inv.job.name)||'Services Rendered')+'</td></tr>';
  }

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'+
    '<title>Invoice '+escHtml(inv.num)+'</title>'+
    '<style>'+
      '*{box-sizing:border-box;margin:0;padding:0}'+
      'body{font-family:Arial,sans-serif;color:#1a1a1a;font-size:13px;background:#fff}'+
      '.page{max-width:800px;margin:0 auto;padding:40px 48px}'+
      '.no-print{padding:12px 48px;background:#f8f9fa;border-bottom:1px solid #e0e0e0;display:flex;gap:10px;align-items:center}'+
      '.btn-print{background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 20px;font-size:13px;cursor:pointer;font-weight:700}'+
      '.btn-close{background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer}'+
      /* Header */
      '.inv-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid #1565c0}'+
      '.co-name{margin-bottom:3px}.co-name .red{color:#cc0000;font-size:28px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:-0.5px}'+
      '.co-name .blue{color:#1565c0;font-size:28px;font-weight:900;font-family:Arial,sans-serif;letter-spacing:-0.5px}'+
      '.co-sub{font-size:12px;color:#546e7a;margin-bottom:2px}'+
      '.co-contact{font-size:11px;color:#546e7a;line-height:1.7}'+
      '.inv-label{font-size:36px;font-weight:900;color:#1565c0;letter-spacing:2px;text-transform:uppercase}'+
      '.inv-num{font-size:14px;color:#546e7a;text-align:right;margin-top:4px;font-weight:600}'+
      /* Address grid */
      '.addr-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px;margin-bottom:28px}'+
      '.addr-block label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#90a4ae;display:block;margin-bottom:6px;border-bottom:1px solid #e0e0e0;padding-bottom:4px}'+
      '.addr-block .val{font-size:13px;line-height:1.7;color:#1a1a1a}'+
      '.addr-block .val strong{font-size:14px;font-weight:700;color:#0d1b2a}'+
      /* Summary bar */
      '.summary-bar{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-bottom:28px}'+
      '.summary-cell{padding:12px 16px;border-right:1px solid #e0e0e0;background:#f8f9fa}'+
      '.summary-cell:last-child{border-right:none}'+
      '.summary-cell .slabel{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#90a4ae;margin-bottom:3px}'+
      '.summary-cell .sval{font-size:13px;font-weight:700;color:#0d1b2a}'+
      '.summary-cell .sval.red{color:#c62828}.summary-cell .sval.blue{color:#1565c0;font-size:15px}'+
      /* Table */
      'table{width:100%;border-collapse:collapse;margin-bottom:20px}'+
      'thead th{background:#1565c0;color:#fff;padding:10px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;text-align:left}'+
      'thead th:nth-child(3){text-align:center}thead th:nth-child(4),thead th:nth-child(5){text-align:right}'+
      'tbody tr:nth-child(even){background:#fafafa}'+
      /* Totals */
      '.totals-wrap{display:flex;justify-content:flex-end;margin-bottom:28px}'+
      '.totals-table{width:300px}'+
      '.tot-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid #f0f0f0;color:#546e7a}'+
      '.tot-row.paid{color:#2e7d32}'+
      '.tot-final{display:flex;justify-content:space-between;padding:12px 0 0;font-size:20px;font-weight:900;color:#1565c0;border-top:2px solid #1565c0;margin-top:4px}'+
      /* Notes */
      '.inv-notes{background:#f8f9fa;border-left:4px solid #1565c0;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:28px;font-size:12px;color:#37474f;line-height:1.7}'+
      '.inv-notes strong{color:#1a1a1a;display:block;margin-bottom:4px}'+
      /* Footer */
      '.inv-footer{border-top:1px solid #e0e0e0;padding-top:16px;display:flex;justify-content:space-between;align-items:center}'+
      '.inv-footer .left{font-size:11px;color:#90a4ae;line-height:1.6}'+
      '.inv-footer .right{font-size:12px;color:#1565c0;font-weight:700;text-align:right}'+
      '@media print{.no-print{display:none!important}@page{margin:12mm}body{font-size:12px}.page{padding:0}}'+
    '</style></head><body>'+

    '<div class="no-print">'+
      '<button class="btn-print" onclick="window.print()">🖨 Print Invoice</button>'+
      '<button class="btn-close" onclick="window.close()">Close</button>'+
      '<span style="font-size:12px;color:#90a4ae;margin-left:8px">'+escHtml(inv.num)+' · '+escHtml((inv.job&&inv.job.customer)||'')+'</span>'+
    '</div>'+

    '<div class="page">'+

    /* Header */
    '<div class="inv-header">'+
      '<div>'+
        '<div class="co-name"><span class="red">TOTAL </span><span class="blue">COMMUNICATIONS</span></div>'+
        '<div class="co-sub">Systems &amp; Solutions, Inc.</div>'+
        '<div class="co-contact">'+
          (caddr?escHtml(caddr)+'<br>':'')+
          (cphone?'📞 '+escHtml(cphone)+'<br>':'')+
          (cemail?'✉️ '+escHtml(cemail):'')+
          (clic?'<br>License: '+escHtml(clic):'')+
        '</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div class="inv-label">INVOICE</div>'+
        '<div class="inv-num">'+escHtml(inv.num)+'</div>'+
      '</div>'+
    '</div>'+

    /* Address grid */
    '<div class="addr-grid">'+
      '<div class="addr-block"><label>Bill To</label><div class="val">'+
        '<strong>'+escHtml(inv.billName||(inv.job&&inv.job.customer)||'')+'</strong>'+
        (inv.billAddr?'<br>'+escHtml(inv.billAddr):'')+
        (inv.billCity||inv.billState?'<br>'+[inv.billCity,inv.billState].filter(Boolean).join(', ')+(inv.billZip?' '+escHtml(inv.billZip):''):'')+
      '</div></div>'+
      '<div class="addr-block"><label>Project / Job</label><div class="val">'+
        '<strong>'+escHtml((inv.job&&inv.job.name)||'')+'</strong>'+
        ((inv.job&&inv.job.address)?'<br>'+escHtml(inv.job.address):'')+
        ((inv.job&&inv.job.num)?'<br><span style="color:#546e7a">Job #'+escHtml(inv.job.num)+'</span>':'')+
        (inv.po?'<br><span style="color:#546e7a">PO: '+escHtml(inv.po)+'</span>':'')+
      '</div></div>'+
      '<div class="addr-block"><label>Payment</label><div class="val">'+
        '<strong>'+escHtml(inv.terms||'Net 30')+'</strong>'+
        (inv.due?'<br>Due: <span style="color:#c62828;font-weight:700">'+escHtml(inv.due)+'</span>':'')+
      '</div></div>'+
    '</div>'+

    /* Summary bar */
    '<div class="summary-bar">'+
      '<div class="summary-cell"><div class="slabel">Invoice Date</div><div class="sval">'+escHtml(inv.date||'')+'</div></div>'+
      '<div class="summary-cell"><div class="slabel">Due Date</div><div class="sval red">'+escHtml(inv.due||'On Receipt')+'</div></div>'+
      '<div class="summary-cell"><div class="slabel">Status</div><div class="sval" style="color:'+(totalPaid>=inv.total?'#2e7d32':totalPaid>0?'#e65100':'#c62828')+'">'+
        (totalPaid>=inv.total?'Paid':totalPaid>0?'Partial':'Unpaid')+'</div></div>'+
      '<div class="summary-cell"><div class="slabel">Amount Due</div><div class="sval blue">'+fmt(balanceDue)+'</div></div>'+
    '</div>'+

    /* Line items table */
    '<table>'+
      '<thead><tr>'+
        '<th style="width:45%">Description</th>'+
        '<th style="width:12%;text-align:center">Category</th>'+
        '<th style="width:8%;text-align:center">Qty</th>'+
        '<th style="width:15%;text-align:right">Unit Price</th>'+
        '<th style="width:15%;text-align:right">Total</th>'+
      '</tr></thead>'+
      '<tbody>'+lineItemsHTML+'</tbody>'+
    '</table>'+

    /* Totals */
    '<div class="totals-wrap"><div class="totals-table">'+
      '<div class="tot-row"><span>Subtotal</span><span>'+fmt(inv.subtotal)+'</span></div>'+
      (inv.taxRate>0?'<div class="tot-row"><span>Tax ('+inv.taxRate+'%)</span><span>'+fmt(inv.taxAmt)+'</span></div>':'')+
      (totalPaid>0?'<div class="tot-row paid"><span>Payments Applied</span><span>-'+fmt(totalPaid)+'</span></div>':'')+
      '<div class="tot-final"><span>Total Due</span><span>'+fmt(balanceDue)+'</span></div>'+
    '</div></div>'+

    /* Notes */
    (inv.notes?'<div class="inv-notes"><strong>Notes &amp; Payment Instructions</strong>'+(typeof rtfDisplayHTML==='function'?rtfDisplayHTML(inv.notes):escHtml(inv.notes).replace(/\n/g,'<br>'))+'</div>':'')+

    /* Footer */
    '<div class="inv-footer">'+
      '<div class="left">Total Communications Systems &amp; Solutions, Inc.<br>Thank you for your business!</div>'+
      '<div class="right">'+escHtml(inv.num)+'<br><span style="font-size:11px;color:#90a4ae;font-weight:normal">Issued '+escHtml(inv.date||getTodayISO())+'</span></div>'+
    '</div>'+

    '</div></body></html>';
}

// ---- RENDER CUSTOMERS ----
function _openEditForInvEmail(custId) {
  editCustomer(custId);
}

function renderCustomers() {
  var search  = ((document.getElementById('cust-search')||{}).value||'').trim();
  var sort    = (document.getElementById('cust-sort')||{}).value||'name-asc';
  var filter  = (document.getElementById('cust-filter')||{}).value||'';
  var sl      = search.toLowerCase();

  var allWOs   = DB.workOrders || [];
  var invoices = (DB.commsLog||[]).filter(function(x){ return x.type==='invoice'; });

  var customers = DB.customers.map(function(c) {
    var qct  = DB.quotes.filter(function(q){ return q.customerId===c.id||(q.cn||'').toLowerCase()===(c.name||'').toLowerCase(); });
    var jct  = (typeof _getActiveWOsAsJobs==='function'?_getActiveWOsAsJobs():(DB.jobs||[])).filter(function(j){ return (j.customerId===c.id||(j.customer||j.customerName||'').toLowerCase()===(c.name||'').toLowerCase()); });
    var woct = allWOs.filter(function(w){ return w.customerId===c.id||(w.customerName||'').toLowerCase()===(c.name||'').toLowerCase(); });
    var invct= invoices.filter(function(i){ return i.customerId===c.id||(i.customerName||'').toLowerCase()===(c.name||'').toLowerCase(); });
    var cct  = DB.contacts.filter(function(x){ return x.customerId===c.id; });
    var wonRev = qct.filter(function(q){ return q.status==='approved'; }).reduce(function(s,q){ return s+(q.total||0); }, 0);

    var closedQ = ['approved','rejected','archived','won','lost'];
    var qOpen   = qct.filter(function(q){ return !closedQ.includes(q.status); }).length;
    var jOpen   = jct.filter(function(j){ return j.status!=='complete'&&j.status!=='closed'; }).length;
    var woDefs  = (DB.woSettings&&DB.woSettings.statuses&&DB.woSettings.statuses.length)?DB.woSettings.statuses:(typeof WO_STATUSES!=='undefined'?WO_STATUSES:[]);
    var woOpen  = woct.filter(function(w){ var d=woDefs.find(function(s){ return s.id===w.status; }); return d?d.open:true; }).length;
    var invOpen = invct.filter(function(i){ return !i.paidAt&&!i.paid; }).length;

    return Object.assign({},c,{_qct:qct.length,_qOpen:qOpen,_jct:jct.length,_jOpen:jOpen,_woct:woct.length,_woOpen:woOpen,_invct:invct.length,_invOpen:invOpen,_cct:cct.length,_wonRev:wonRev});
  });

  // Summary strip
  var totalWon  = customers.reduce(function(s,c){ return s+c._wonRev; },0);
  var totalQ    = customers.reduce(function(s,c){ return s+c._qct; },0);
  var totalJ    = customers.reduce(function(s,c){ return s+c._jct; },0);
  var totalCont = customers.reduce(function(s,c){ return s+c._cct; },0);
  function setS(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  setS('cs-total',    customers.length);
  setS('cs-won',      '$'+Math.round(totalWon).toLocaleString());
  setS('cs-quotes',   totalQ);
  setS('cs-jobs',     totalJ);
  setS('cs-contacts', totalCont);

  if (sl) customers = customers.filter(function(c){
    return (c.name||'').toLowerCase().includes(sl)||
           (c.phone||'').toLowerCase().includes(sl)||
           (c.email||'').toLowerCase().includes(sl)||
           (c.address||'').toLowerCase().includes(sl);
  });
  if (filter==='active')     customers = customers.filter(function(c){ return c._qct>0; });
  if (filter==='won')        customers = customers.filter(function(c){ return c._wonRev>0; });
  if (filter==='jobs')       customers = customers.filter(function(c){ return c._jct>0; });
  if (filter==='no-contact') customers = customers.filter(function(c){ return c._cct===0; });

  customers.sort(function(a,b){
    if (sort==='name-asc')    return (a.name||'').localeCompare(b.name||'');
    if (sort==='name-desc')   return (b.name||'').localeCompare(a.name||'');
    if (sort==='won-desc')    return b._wonRev - a._wonRev;
    if (sort==='quotes-desc') return b._qct - a._qct;
    if (sort==='recent')      return (b.createdAt||'').localeCompare(a.createdAt||'');
    return (a.name||'').localeCompare(b.name||'');
  });

  var el = document.getElementById('cust-tbl');
  if (!el) return;

  if (!customers.length) {
    el.innerHTML = '<div style="padding:40px;text-align:center;color:#90a4ae">'+(search||filter?'No customers match your search.':'No customers yet. Click + New Customer to add one.')+'</div>';
    return;
  }

  var header = '<div class="cust-col-header">'+
    '<span onclick="setCustSort(\'name-asc\')">Customer '+(sort==='name-asc'?'▲':sort==='name-desc'?'▼':'')+'</span>'+
    '<span>Contact Info</span>'+
    '<span>Activity <span style="font-weight:400;opacity:.6;font-size:9px">(open / total)</span></span>'+
    '<span onclick="setCustSort(\'won-desc\')">Won Rev '+(sort==='won-desc'?'▼':'')+'</span>'+
    '<span>Actions</span>'+
  '</div>';

  function mkBubbles(open, total, cls, page, custName) {
    var nav = 'goPage(\''+page+'\');setTimeout(function(){var s=document.getElementById(\'cust-search\');if(s){s.value=\''+custName.replace(/'/g,'')+'\';if(typeof renderCustomers===\'function\')renderCustomers();}},300)';
    return '<span class="cust-bubble open '+cls+'" onclick="'+nav+'" title="Open '+page+'">'+open+'</span>'+
           '<span class="cust-act-sep">/</span>'+
           '<span class="cust-bubble tot" onclick="'+nav+'" title="All '+page+'">'+total+'</span>';
  }

  var rows = customers.map(function(c) {
    var phoneHtml = c.phone
      ? '<a href="tel:'+escHtml(c.phone)+'" class="cust-phone-link">'+escHtml(c.phone)+'</a>'
      : '<span style="color:#d0d0d0;font-size:12px">—</span>';
    var emailHtml = c.email
      ? '<div style="margin-top:1px"><a href="mailto:'+escHtml(c.email)+'" class="cust-phone-link" style="font-size:11px;color:#546e7a">'+escHtml(c.email)+'</a></div>'
      : '';

    var invEmailHtml = c.invoicingEmail
      ? '<div class="cust-inv-email-present"><span style="color:#2e7d32;font-size:13px;flex-shrink:0">📄</span><div class="cust-inv-email-present-inner"><span class="cust-inv-email-label">Invoicing email</span><span class="cust-inv-email-addr">'+escHtml(c.invoicingEmail)+'</span></div></div>'
      : '<div class="cust-inv-email-missing" onclick="_openEditForInvEmail(\'' + c.id + '\')"><span style="color:#f57f17;font-size:13px;flex-shrink:0">⚠️</span><div class="cust-inv-email-missing-inner"><span class="cust-inv-email-missing-label">Invoicing email</span><span class="cust-inv-email-missing-cta">Not set — click to add</span></div></div>';

    var alertPill = (c.hotNoteOffice||c.hotNoteTech)
      ? '<div class="cust-alert-pill" onclick="openCustomerProfile(\''+c.id+'\')">⚠ Alert</div>'
      : '';

    var lastQ = DB.quotes.filter(function(q){ return q.customerId===c.id||(q.cn||'').toLowerCase()===(c.name||'').toLowerCase(); })
      .sort(function(a,b){ return (b.dt||'').localeCompare(a.dt||''); })[0];
    var lastActivity = lastQ ? 'Last quote: '+escHtml(lastQ.dt||'') : '';

    var n = escHtml(c.name||'');
    var actCol =
      '<div class="cust-act-col">'+
        '<div class="cust-act-header"><div style="flex:1"></div><div class="cust-act-col-lbl" style="color:#1565c0">Open</div><div style="width:10px"></div><div class="cust-act-col-lbl">Total</div></div>'+
        '<div class="cust-act-row"><span class="cust-act-label">📋 Quotes</span><div class="cust-act-bubbles">'+mkBubbles(c._qOpen,c._qct,'q','quotes',c.name||'')+'</div></div>'+
        '<div class="cust-act-row"><span class="cust-act-label">🔧 Jobs</span><div class="cust-act-bubbles">'+mkBubbles(c._jOpen,c._jct,'j','jobs',c.name||'')+'</div></div>'+
        '<div class="cust-act-row"><span class="cust-act-label">🔨 Work Orders</span><div class="cust-act-bubbles">'+mkBubbles(c._woOpen,c._woct,'wo','workorders',c.name||'')+'</div></div>'+
        '<div class="cust-act-row"><span class="cust-act-label">🧾 Invoices</span><div class="cust-act-bubbles">'+mkBubbles(c._invOpen,c._invct,'inv','invoices',c.name||'')+'</div></div>'+
        '<div class="cust-act-row"><span class="cust-act-label">👤 Contacts</span><div class="cust-act-bubbles">'+mkBubbles(c._cct,c._cct,'ct','contacts',c.name||'')+'</div></div>'+
      '</div>';

    var wonHtml = c._wonRev>0
      ? '<span class="cust-won">$'+Math.round(c._wonRev).toLocaleString()+'</span>'
      : '<span class="cust-won zero">$0</span>';

    return '<div class="cust-card">'+
      '<div><div class="cust-card-name" onclick="openCustomerProfile(\''+c.id+'\')">'+n+'</div>'+(lastActivity?'<div class="cust-card-sub">'+lastActivity+'</div>':'')+alertPill+'</div>'+
      '<div><div>'+phoneHtml+'</div>'+emailHtml+invEmailHtml+'</div>'+
      actCol+
      '<div>'+wonHtml+'</div>'+
      '<div class="cust-actions">'+
        '<button class="btn btn-primary btn-sm" onclick="openCustomerProfile(\''+c.id+'\')" title="View profile">Profile</button>'+
        '<button class="btn btn-outline btn-sm" data-action="editCustomer" data-id="'+c.id+'" title="Edit">✏</button>'+
        ((typeof hasPermission!=='function' || hasPermission('cust.delete')) ? '<button class="btn btn-danger btn-sm" data-action="delCustomer" data-id="'+c.id+'" title="Delete">✕</button>' : '')+
      '</div>'+
    '</div>';
  }).join('');

  el.innerHTML = header + rows;
}
function setCustSort(val) {
  var sel = document.getElementById('cust-sort');
  if (sel) sel.value = val;
  renderCustomers();
}
function _custFieldIds() { return ['m-cname','m-cphone','m-cemail','m-cinvoicing-contact','m-cinvoicing-email','m-cstreet','m-ccity','m-cstate','m-czip','m-cnotes','m-cid']; }
function _custAddress(c) {
  // Build combined address from split fields for backward compat (quotes display, Supabase, etc)
  var parts = [c.street, c.city && c.state ? c.city+', '+c.state : (c.city||c.state||''), c.zip].filter(Boolean);
  return parts.join(' ');
}
function _clearPrimaryContact() {
  var section = document.getElementById('m-c-primary-contact-section');
  if (section) section.innerHTML = '';
}

function _contactRoleOptions(selected) {
  var roles = (DB.settings && DB.settings.lists && DB.settings.lists.contactRoles && DB.settings.lists.contactRoles.length)
    ? DB.settings.lists.contactRoles
    : ['Owner','Facilities Manager','Property Manager','General Contractor','IT Director','Office Manager','Project Manager','Superintendent','Purchasing Agent','Operations Manager','Director of Facilities','Financial Manager','CEO','Other'];
  return '<option value="">-- Select Title --</option>' +
    roles.map(function(r){ return '<option'+(r===selected?' selected':'')+'>'+escHtml(r)+'</option>'; }).join('');
}
function _contactTypeOptions(selected) {
  var types = (DB.settings && DB.settings.lists && DB.settings.lists.contactTypes && DB.settings.lists.contactTypes.length)
    ? DB.settings.lists.contactTypes.map(function(t){ return [t, t]; })
    : [['Decision Maker','⭐ Decision Maker'],['Billing Contact','💳 Billing Contact'],['Site Contact','📍 Site Contact'],['Technical Contact','🔧 Technical Contact'],['Other','Other']];
  return '<option value="">-- Select Type --</option>' +
    types.map(function(t){ return '<option value="'+escHtml(t[0])+'"'+(t[0]===selected?' selected':'')+'>'+escHtml(t[1])+'</option>'; }).join('');
}

function _contactAddForm(customerId) {
  return '<div id="m-pc-add-form" style="background:#f8f9fb;border-radius:10px;border:1px solid #e0e7ef;padding:16px;margin-top:12px">'+
    '<div style="font-size:12px;font-weight:700;color:#1565c0;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px">New Contact</div>'+
    '<div class="form-row cols2" style="margin-bottom:12px">'+
      '<div><label>Contact Name</label><input id="m-pc-name" placeholder="Full name" autocomplete="off"></div>'+
      '<div><label>Title / Role</label><select id="m-pc-role">'+_contactRoleOptions('')+'</select></div>'+
    '</div>'+
    '<div class="form-row cols2" style="margin-bottom:12px">'+
      '<div><label>Phone</label><input id="m-pc-phone" type="tel" placeholder="Direct phone" autocomplete="off"></div>'+
      '<div><label>Email</label><input id="m-pc-email" type="email" placeholder="Direct email" autocomplete="off"></div>'+
    '</div>'+
    '<div class="form-row" style="margin-bottom:12px">'+
      '<div><label>Contact Type</label><select id="m-pc-type">'+_contactTypeOptions('')+'</select></div>'+
    '</div>'+
    '<div style="display:flex;gap:8px">'+
      '<button class="btn btn-primary btn-sm" onclick="_saveInlineContact(\''+customerId+'\')">💾 Save Contact</button>'+
      '<button class="btn btn-ghost btn-sm" onclick="_hideInlineContactForm()">Cancel</button>'+
    '</div>'+
  '</div>';
}

function _renderContactSection(mode, customerId, customerName) {
  var section = document.getElementById('m-c-primary-contact-section');
  if (!section) return;

  if (mode === 'new') {
    // New customer — simple single-add form
    section.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👤</div>'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:#0d1b2a">Primary Contact</div>'+
          '<div style="font-size:11px;color:#90a4ae;margin-top:1px">Optional — leave blank to skip. Linked automatically when saved.</div>'+
        '</div>'+
      '</div>'+
      '<div style="background:#f8f9fb;border-radius:10px;border:1px solid #e0e7ef;padding:16px">'+
        '<div class="form-row cols2" style="margin-bottom:12px">'+
          '<div><label>Contact Name</label><input id="m-pc-name" placeholder="Full name" autocomplete="off"></div>'+
          '<div><label>Title / Role</label><select id="m-pc-role">'+_contactRoleOptions('')+'</select></div>'+
        '</div>'+
        '<div class="form-row cols2" style="margin-bottom:12px">'+
          '<div><label>Phone</label><input id="m-pc-phone" type="tel" placeholder="Direct phone number" autocomplete="off"></div>'+
          '<div><label>Email</label><input id="m-pc-email" type="email" placeholder="Direct email address" autocomplete="off"></div>'+
        '</div>'+
        '<div class="form-row" style="margin-bottom:0">'+
          '<div><label>Contact Type</label><select id="m-pc-type">'+_contactTypeOptions('')+'</select></div>'+
        '</div>'+
      '</div>';
    return;
  }

  // Edit mode — show existing contacts + add form
  var contacts = (DB.contacts||[]).filter(function(ct){ return ct.customerId === customerId; });

  var typeLabels = { decision:'⭐ Decision Maker', billing:'💳 Billing', site:'📍 Site', technical:'🔧 Technical', other:'Other' };

  var listHtml = contacts.length
    ? contacts.map(function(ct) {
        return '<div id="m-pc-contact-'+ct.id+'" style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:#fff;border-radius:9px;border:1px solid #e0e7ef;margin-bottom:8px">'+
          '<div style="width:34px;height:34px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#1565c0;flex-shrink:0">'+
            escHtml((ct.name||'?').charAt(0).toUpperCase())+
          '</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:700;color:#0d1b2a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(ct.name||'')+'</div>'+
            '<div style="font-size:11px;color:#546e7a;margin-top:2px">'+
              (ct.role||ct.title ? '<span>'+escHtml(ct.role||ct.title||'')+'</span>' : '')+
              (ct.contactType && typeLabels[ct.contactType] ? '<span style="margin-left:6px;color:#1565c0">'+typeLabels[ct.contactType]+'</span>' : '')+
            '</div>'+
            '<div style="font-size:11px;color:#90a4ae;margin-top:2px">'+
              (ct.phone ? escHtml(ct.phone) : '')+(ct.phone && ct.email ? ' · ' : '')+(ct.email ? escHtml(ct.email) : '')+
            '</div>'+
          '</div>'+
          '<div style="display:flex;gap:6px;flex-shrink:0">'+
            '<button onclick="_editInlineContact(\''+ct.id+'\',\''+customerId+'\')" style="padding:5px 10px;background:#e3f2fd;color:#1565c0;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">✏ Edit</button>'+
            ((typeof hasPermission!=='function' || hasPermission('cust.delete')) ? '<button onclick="_deleteInlineContact(\''+ct.id+'\')" style="padding:5px 10px;background:#ffebee;color:#c62828;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">✕</button>' : '')+
          '</div>'+
        '</div>';
      }).join('')
    : '<div style="color:#90a4ae;font-size:13px;padding:8px 0 12px">No contacts yet for this customer.</div>';

  section.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:#e3f2fd;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">👥</div>'+
        '<div>'+
          '<div style="font-size:13px;font-weight:700;color:#0d1b2a">Contacts</div>'+
          '<div style="font-size:11px;color:#90a4ae;margin-top:1px">'+contacts.length+' contact'+(contacts.length!==1?'s':'')+' linked to this customer</div>'+
        '</div>'+
      '</div>'+
      '<button onclick="_showInlineContactForm(\''+customerId+'\')" style="display:flex;align-items:center;gap:5px;padding:6px 12px;background:#1565c0;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">+ Add Contact</button>'+
    '</div>'+
    '<div id="m-pc-contact-list">'+listHtml+'</div>'+
    '<div id="m-pc-add-form-container"></div>';

  // Store customerId for the add form
  section.dataset.custId = customerId;
  section.dataset.custName = customerName || '';
}

function _showInlineContactForm(customerId) {
  var container = document.getElementById('m-pc-add-form-container');
  if (!container) return;
  container.innerHTML = _contactAddForm(customerId);
  var nameEl = document.getElementById('m-pc-name');
  if (nameEl) nameEl.focus();
}

function _hideInlineContactForm() {
  var container = document.getElementById('m-pc-add-form-container');
  if (container) container.innerHTML = '';
}

function _saveInlineContact(customerId) {
  var name = ((document.getElementById('m-pc-name')||{}).value||'').trim();
  if (!name) { showToast('Contact name is required','error'); return; }
  var section = document.getElementById('m-c-primary-contact-section');
  var custName = section ? (section.dataset.custName||'') : '';
  var editId = section ? (section.dataset.editContactId||'') : '';

  var contact = {
    id:          editId || (typeof makeUUID==='function' ? makeUUID() : 'ct-'+Date.now()),
    name:        name,
    company:     custName,
    phone:       ((document.getElementById('m-pc-phone')||{}).value||'').trim(),
    email:       ((document.getElementById('m-pc-email')||{}).value||'').trim(),
    role:        ((document.getElementById('m-pc-role')||{}).value||'').trim(),
    title:       ((document.getElementById('m-pc-role')||{}).value||'').trim(),
    contactType: ((document.getElementById('m-pc-type')||{}).value||'').trim(),
    contactPref: '',
    notes:       '',
    customerId:  customerId
  };

  if (!DB.contacts) DB.contacts = [];
  if (editId) {
    var idx = DB.contacts.findIndex(function(c){ return c.id === editId; });
    if (idx >= 0) DB.contacts[idx] = contact; else DB.contacts.push(contact);
    delete section.dataset.editContactId;
  } else {
    DB.contacts.push(contact);
  }
  saveDB();
  showToast((editId ? 'Contact updated' : '"'+name+'" added') + ' ✓','success');
  // Re-render the contacts section
  _renderContactSection('edit', customerId, custName);
}

function _editInlineContact(contactId, customerId) {
  var ct = (DB.contacts||[]).find(function(c){ return c.id === contactId; });
  if (!ct) return;
  var section = document.getElementById('m-c-primary-contact-section');
  var custName = section ? (section.dataset.custName||'') : '';
  // Show add form with prefilled values
  var container = document.getElementById('m-pc-add-form-container');
  if (!container) return;
  container.innerHTML = _contactAddForm(customerId);
  // Prefill
  var set = function(id, val){ var el=document.getElementById(id); if(el) el.value=val||''; };
  set('m-pc-name', ct.name);
  set('m-pc-role', ct.role||ct.title||'');
  set('m-pc-phone', ct.phone);
  set('m-pc-email', ct.email);
  set('m-pc-type', ct.contactType);
  // Update button label
  var btn = container.querySelector('.btn-primary');
  if (btn) btn.textContent = '💾 Update Contact';
  // Store edit ID
  if (section) section.dataset.editContactId = contactId;
  var nameEl = document.getElementById('m-pc-name');
  if (nameEl) nameEl.focus();
}

function _deleteInlineContact(contactId) {
  if (typeof hasPermission === 'function' && !hasPermission('cust.delete')) {
    showToast('Your role is not permitted to delete contacts.', 'error', 5000);
    return;
  }
  if (!confirm('Remove this contact?\n\nIt is hidden and can be restored by an owner or manager.')) return;
  var isReal = String(contactId).length > 10;
  if (isReal) {
    if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
    if (!DB.deletedIds.contacts) DB.deletedIds.contacts = [];
    if (DB.deletedIds.contacts.indexOf(contactId) < 0) DB.deletedIds.contacts.push(contactId);
  }
  DB.contacts = (DB.contacts||[]).filter(function(c){ return c.id !== contactId; });
  saveDB();
  if (_sb && _currentUser && isReal) {
    // Previously this removed the contact only locally, so it returned on the next
    // cloud pull. Route it through the authorized soft-delete like every other path.
    _sb.rpc('soft_delete_contact', { p_id: contactId }).then(function(r){
      if (r && r.error) console.warn('[Delete] soft_delete_contact (inline):', r.error.message);
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  var section = document.getElementById('m-c-primary-contact-section');
  var custId  = section ? (section.dataset.custId||'') : '';
  var custName= section ? (section.dataset.custName||'') : '';
  showToast('Contact removed','success');
  _renderContactSection('edit', custId, custName);
}

function newCustomer() {
  document.getElementById('modal-cust-title').textContent='New Customer';
  _custFieldIds().forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var sel=document.getElementById('m-cterms'); if(sel) sel.value='Due on Receipt';
  var _taxEl=document.getElementById('m-ctax-taxable'); if(_taxEl) _taxEl.checked=true;
  _renderContactSection('new', '', '');
  openModal('modal-customer');
}
function editCustomer(id) {
  const c = DB.customers.find(function(x){return x.id==id});
  if(!c) return;
  document.getElementById('modal-cust-title').textContent='Edit Customer';
  function sv(eid,v){const el=document.getElementById(eid);if(el)el.value=v||'';}
  sv('m-cname',c.name); sv('m-cphone',c.phone); sv('m-cemail',c.email);
  sv('m-cinvoicing-contact',c.invoicingContact); sv('m-cinvoicing-email',c.invoicingEmail);
  sv('m-cstreet',c.street||(c.address&&!c.city?c.address:'')); sv('m-ccity',c.city||''); sv('m-cstate',c.state||''); sv('m-czip',c.zip||'');
  sv('m-cnotes',c.notes); sv('m-cid',c.id);
  var sel=document.getElementById('m-cterms'); if(sel) sel.value=c.defaultTerms||'Due on Receipt';
  var taxEl=document.getElementById(c.taxExempt?'m-ctax-exempt':'m-ctax-taxable'); if(taxEl) taxEl.checked=true;
  var htEl=document.getElementById('m-c-hotnote-tech');   if(htEl) htEl.value=c.hotNoteTech||'';
  var hoEl=document.getElementById('m-c-hotnote-office'); if(hoEl) hoEl.value=c.hotNoteOffice||'';
  var scopes = c.officeAlertScope || {quotes:true,workorders:true,invoices:false,customers:false,dispatch:false};
  ['quotes','workorders','invoices','customers','dispatch'].forEach(function(k){
    var cb=document.getElementById('m-calert-'+k); if(cb) cb.checked=!!scopes[k];
  });
  _renderContactSection('edit', c.id, c.name);
  openModal('modal-customer');
}
function _buildCustomerData(id) {
  function gv(eid){var el=document.getElementById(eid); return el?el.value.trim():'';}
  var street=gv('m-cstreet'), city=gv('m-ccity'), state=gv('m-cstate').toUpperCase(), zip=gv('m-czip');
  var addrParts=[street, city&&state?city+', '+state:(city||state), zip].filter(Boolean);
  return {
    id:           id || (typeof makeUUID==='function' ? makeUUID() : 'cust-'+Date.now()),
    name:         gv('m-cname'),
    phone:        gv('m-cphone'),
    email:        gv('m-cemail'),
    street:       street,
    city:         city,
    state:        state,
    zip:          zip,
    address:      addrParts.join(' '),
    defaultTerms:  (document.getElementById('m-cterms')||{}).value||'Due on Receipt',
    taxExempt:     document.getElementById('m-ctax-exempt') ? !!document.getElementById('m-ctax-exempt').checked : false,
    notes:         gv('m-cnotes'),
    hotNoteTech:      (document.getElementById('m-c-hotnote-tech')||{}).value||'',
    hotNoteOffice:    (document.getElementById('m-c-hotnote-office')||{}).value||'',
    invoicingContact: gv('m-cinvoicing-contact'),
    invoicingEmail:   gv('m-cinvoicing-email'),
    officeAlertScope: {
      quotes:      !!((document.getElementById('m-calert-quotes')||{}).checked),
      workorders:  !!((document.getElementById('m-calert-workorders')||{}).checked),
      invoices:    !!((document.getElementById('m-calert-invoices')||{}).checked),
      customers:   !!((document.getElementById('m-calert-customers')||{}).checked),
      dispatch:    !!((document.getElementById('m-calert-dispatch')||{}).checked),
    }
  };
}
function _savePrimaryContact(customerId, customerName) {
  var name = (document.getElementById('m-pc-name')||{}).value.trim();
  if (!name) return; // blank = skip
  var contact = {
    id:          typeof makeUUID==='function' ? makeUUID() : 'ct-'+Date.now(),
    name:        name,
    company:     customerName || '',
    phone:       ((document.getElementById('m-pc-phone')||{}).value||'').trim(),
    email:       ((document.getElementById('m-pc-email')||{}).value||'').trim(),
    role:        ((document.getElementById('m-pc-role')||{}).value||'').trim(),
    title:       ((document.getElementById('m-pc-role')||{}).value||'').trim(),
    contactType: ((document.getElementById('m-pc-type')||{}).value||'').trim(),
    contactPref: '',
    notes:       '',
    customerId:  customerId
  };
  if (!DB.contacts) DB.contacts = [];
  DB.contacts.push(contact);
}

function saveCustomer() {
  const id = document.getElementById('m-cid').value;
  const name = (document.getElementById('m-cname')||{}).value||'';
  if (!name.trim()) { showToast('Customer name required','error'); return; }
  // Duplicate detection — block exact name match on NEW customers only
  if (!id) {
    var normalizedNew = name.trim().toLowerCase();
    var duplicate = (DB.customers||[]).find(function(c){
      return c.name && c.name.trim().toLowerCase() === normalizedNew;
    });
    if (duplicate) {
      showToast('A customer named "'+duplicate.name+'" already exists. Edit the existing record instead.','error',5000);
      return;
    }
  }
  const data = _buildCustomerData(id);
  if (id) { const idx=DB.customers.findIndex(function(c){return c.id==id}); if(idx>=0) DB.customers[idx]=data; else DB.customers.push(data); }
  else { DB.customers.push(data); _savePrimaryContact(data.id, data.name); }
  saveDB(); closeModal('modal-customer'); renderCustomers();
  showToast('"'+name+'" saved','success');
}
function saveCustomerAndAnother() {
  const id = document.getElementById('m-cid').value;
  const name = (document.getElementById('m-cname')||{}).value||'';
  if (!name.trim()) { showToast('Customer name required','error'); return; }
  // Duplicate detection — same as saveCustomer — block on NEW customers only
  if (!id) {
    var normalizedNew = name.trim().toLowerCase();
    var duplicate = (DB.customers||[]).find(function(c){
      return c.name && c.name.trim().toLowerCase() === normalizedNew;
    });
    if (duplicate) {
      showToast('A customer named "'+duplicate.name+'" already exists. Edit the existing record instead.','error',5000);
      return;
    }
  }
  const data = _buildCustomerData(id);
  if (id) { const idx=DB.customers.findIndex(function(c){return c.id==id}); if(idx>=0) DB.customers[idx]=data; else DB.customers.push(data); }
  else { DB.customers.push(data); _savePrimaryContact(data.id, data.name); }
  saveDB(); renderCustomers();
  _renderContactSection('new', '', '');
  _custFieldIds().forEach(function(fid){var el=document.getElementById(fid);if(el)el.value='';});
  var sel=document.getElementById('m-cterms'); if(sel) sel.value='Due on Receipt'; var _taxEl=document.getElementById('m-ctax-taxable'); if(_taxEl) _taxEl.checked=true;
  const titleEl=document.getElementById('modal-cust-title'); if(titleEl) titleEl.textContent='New Customer';
  const nameEl=document.getElementById('m-cname'); if(nameEl) nameEl.focus();
  showToast('"'+name+'" saved — ready for next customer','success');
}
function delCustomer(id) {
  // UI-layer authorization; the database (soft_delete_customer RPC) is the real lock.
  if (typeof hasPermission === 'function' && !hasPermission('cust.delete')) {
    showToast('Your role is not permitted to delete customers.', 'error', 5000);
    return;
  }
  if (!confirm('Delete customer?\n\nIt is hidden and can be restored by an owner or manager.')) return;
  var isReal = String(id).length > 10;
  if (isReal) {
    if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
    if (!DB.deletedIds.customers) DB.deletedIds.customers = [];
    if (DB.deletedIds.customers.indexOf(id) < 0) DB.deletedIds.customers.push(id);
  }
  DB.customers = DB.customers.filter(function(c){ return c.id != id; });
  saveDB();
  if (_sb && _currentUser && isReal) {
    // Authorized soft delete: role check + audit, atomic, server-side. On error the
    // tombstone is kept and pushAllToCloud retries (also covers offline).
    _sb.rpc('soft_delete_customer', { p_id: id }).then(function(r){
      if (r && r.error) { console.warn('[Delete] soft_delete_customer:', r.error.message); showToast('Cloud delete pending ('+r.error.message+') — will retry on next sync.', 'error', 6000); }
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  renderCustomers();
  showToast('Customer deleted (recoverable)','info');
}

// ---- RENDER CONTACTS ----
function renderContacts() {
  var search = (document.getElementById('cont-search')||{}).value||'';
  var sort   = (document.getElementById('cont-sort')||{}).value||'name-asc';
  var filter = (document.getElementById('cont-filter')||{}).value||'';
  var sl     = search.toLowerCase();

  var contacts = DB.contacts.slice();

  // Summary
  var linked    = contacts.filter(function(c){ return c.customerId; }).length;
  // Normalize contactType — handle both old short values and new full string values
  function normType(t) {
    if (!t) return '';
    var tl = t.toLowerCase();
    if (tl==='decision' || tl.includes('decision maker')) return 'decision';
    if (tl==='billing'  || tl.includes('billing'))        return 'billing';
    if (tl==='site'     || tl.includes('site'))           return 'site';
    if (tl==='technical'|| tl.includes('technical'))      return 'technical';
    return tl;
  }

  var decisions = contacts.filter(function(c){ return normType(c.contactType)==='decision'; }).length;
  var noEmail   = contacts.filter(function(c){ return !c.email; }).length;
  function setS(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  setS('ct-total',    contacts.length);
  setS('ct-linked',   linked);
  setS('ct-decision', decisions);
  setS('ct-no-email', noEmail);

  // Search
  if (sl) contacts = contacts.filter(function(c){
    return (c.name||'').toLowerCase().includes(sl)||
           (c.company||'').toLowerCase().includes(sl)||
           (c.phone||'').toLowerCase().includes(sl)||
           (c.email||'').toLowerCase().includes(sl)||
           (c.role||'').toLowerCase().includes(sl);
  });

  // Filter
  if (filter==='decision')  contacts=contacts.filter(function(c){ return normType(c.contactType)==='decision'; });
  if (filter==='billing')   contacts=contacts.filter(function(c){ return normType(c.contactType)==='billing'; });
  if (filter==='site')      contacts=contacts.filter(function(c){ return normType(c.contactType)==='site'; });
  if (filter==='no-email')  contacts=contacts.filter(function(c){ return !c.email; });
  if (filter==='no-phone')  contacts=contacts.filter(function(c){ return !c.phone; });
  if (filter==='unlinked')  contacts=contacts.filter(function(c){ return !c.customerId; });

  // Sort
  contacts.sort(function(a,b){
    if (sort==='name-asc')  return (a.name||'').localeCompare(b.name||'');
    if (sort==='name-desc') return (b.name||'').localeCompare(a.name||'');
    if (sort==='company')   return (a.company||'').localeCompare(b.company||'');
    if (sort==='recent')    return (b.createdAt||'').localeCompare(a.createdAt||'');
    return (a.name||'').localeCompare(b.name||'');
  });

  var el = document.getElementById('cont-tbl');
  if (!el) return;

  if (!contacts.length) {
    el.innerHTML='<div style="padding:40px;text-align:center;color:#90a4ae">'+
      (search||filter?'No contacts match your search.':'No contacts yet. Click + New Contact to add one.')+
    '</div>';
    return;
  }

  var typeLabels = {decision:'⭐ Decision Maker',billing:'💳 Billing',site:'📍 Site',technical:'🔧 Technical'};
  var prefIcons  = {phone:'📞',text:'💬',email:'✉️'};

  var header = '<div class="cont-col-header">'+
    '<span onclick="setContSort(\'name-asc\')">Contact</span>'+
    '<span onclick="setContSort(\'company\')">Company</span>'+
    '<span>Phone</span>'+
    '<span>Email</span>'+
    '<span>Type / Role</span>'+
    '<span>Actions</span>'+
  '</div>';

  var rows = contacts.map(function(c){
    // Find linked customer
    var cust = c.customerId ? (DB.customers||[]).find(function(x){ return x.id===c.customerId; }) : null;
    var custName = cust ? cust.name : (c.company||'');

    // Last quote involving this contact
    var lastQ = (DB.quotes||[]).filter(function(q){ return q.contactId===c.id; })
      .sort(function(a,b){ return (b.dt||'').localeCompare(a.dt||''); })[0];

    var phoneHtml = c.phone
      ? '<a href="tel:'+escHtml(c.phone)+'" class="cust-phone-link">'+escHtml(c.phone)+(c.phoneType?'<span style="color:#90a4ae;font-size:10px"> ('+escHtml(c.phoneType)+')</span>':'')+'</a>'+
        (c.phone2?'<br><a href="tel:'+escHtml(c.phone2)+'" class="cust-phone-link">'+escHtml(c.phone2)+(c.phone2Type?'<span style="color:#90a4ae;font-size:10px"> ('+escHtml(c.phone2Type)+')</span>':'')+'</a>':'')
      : '<span style="color:#d0d0d0;font-size:12px">—</span>';

    var emailHtml = c.email
      ? '<a href="mailto:'+escHtml(c.email)+'" class="cust-phone-link" style="color:#546e7a;font-size:12px">'+escHtml(c.email)+'</a>'
      : '<span style="color:#ffb74d;font-size:11px;font-weight:700">⚠ No email</span>';

    var companyHtml = cust
      ? '<a href="#" class="cont-company-link" onclick="openCustomerProfile(\''+cust.id+'\');return false">'+escHtml(custName)+'</a>'
      : (custName?'<span style="font-size:13px;color:#546e7a">'+escHtml(custName)+'</span>':'<span style="color:#d0d0d0;font-size:12px">—</span>');

    var typeBadge = c.contactType && typeLabels[normType(c.contactType)]
      ? '<span class="cont-type-badge '+normType(c.contactType)+'">'+typeLabels[normType(c.contactType)]+'</span>'
      : '';
    var roleTxt = c.role||c.title||'';

    var prefHtml = c.contactPref ? '<span style="font-size:10px;color:#90a4ae;margin-left:4px">'+( prefIcons[c.contactPref]||'')+' Prefers '+c.contactPref+'</span>' : '';

    var newQuoteUrl = 'javascript:void(0)';

    return '<div class="cont-card">'+
      // Name + last activity
      '<div>'+
        '<div class="cont-name">'+escHtml(c.name||'')+'</div>'+
        (lastQ?'<div class="cont-sub">Last quote: '+escHtml(lastQ.dt||'')+'</div>':'')+
        (c.notes?(function(){var _t=(typeof stripHtmlToText==='function'?stripHtmlToText(c.notes):c.notes);return '<div class="cont-sub" style="font-style:italic">'+escHtml(_t.slice(0,60))+(_t.length>60?'…':'')+'</div>';})():'')+
      '</div>'+
      // Company (clickable)
      '<div>'+companyHtml+'</div>'+
      // Phone
      '<div>'+phoneHtml+'</div>'+
      // Email
      '<div>'+emailHtml+'</div>'+
      // Type + Role
      '<div>'+
        (typeBadge?typeBadge+'<br>':'')+
        (roleTxt?'<span style="font-size:11px;color:#546e7a">'+escHtml(roleTxt)+'</span>':'')+
        prefHtml+
      '</div>'+
      // Quick actions — always show all buttons, gray out when data missing
      '<div class="cont-quick-actions">'+
        (c.phone
          ? '<a href="tel:'+escHtml(c.phone)+'" class="cont-quick-btn" title="Call '+escHtml(c.phone)+'">📞 Call</a>'
          : '<span class="cont-quick-btn cont-quick-disabled" title="No phone on file">📞 Call</span>')+
        (c.email
          ? '<a href="mailto:'+escHtml(c.email)+'" class="cont-quick-btn" title="Email '+escHtml(c.email)+'">✉️ Email</a>'
          : '<span class="cont-quick-btn cont-quick-disabled" title="No email on file">✉️ Email</span>')+
        '<button class="cont-quick-btn" onclick="newQuoteForContact(\''+c.id+'\')" title="New Quote">📋 Quote</button>'+
        '<button class="cont-quick-btn" data-action="editContact" data-id="'+c.id+'" title="Edit">✏ Edit</button>'+
        ((typeof hasPermission!=='function' || hasPermission('cust.delete')) ? '<button class="btn btn-danger btn-sm" data-action="delContact" data-id="'+c.id+'" title="Delete">✕</button>' : '')+
      '</div>'+
    '</div>';
  }).join('');

  el.innerHTML = header + rows;
}

function setContSort(val) {
  var sel = document.getElementById('cont-sort');
  if (sel) sel.value = val;
  renderContacts();
}

function newQuoteForContact(contactId) {
  var c = (DB.contacts||[]).find(function(x){ return x.id===contactId; });
  if (!c) return;
  var cust = c.customerId ? (DB.customers||[]).find(function(x){ return x.id===c.customerId; }) : null;
  goPage('qq');
  setTimeout(function(){
    var cnEl  = document.getElementById('qq-cn');
    var cidEl = document.getElementById('qq-customer-id');
    var ctEl  = document.getElementById('qq-contact-name');
    var ctIdEl= document.getElementById('qq-contact-id');
    var ttEl  = document.getElementById('qq-contact-title');
    var phEl  = document.getElementById('qq-ph');
    var emEl  = document.getElementById('qq-em');
    var adEl  = document.getElementById('qq-ad');
    var cyEl  = document.getElementById('qq-city');
    var stEl  = document.getElementById('qq-state');
    var zpEl  = document.getElementById('qq-zip');

    if (cnEl)   cnEl.value   = (cust ? cust.name : c.company)||'';
    if (cidEl)  cidEl.value  = c.customerId||'';
    if (ctEl)   ctEl.value   = c.name||'';
    if (ctIdEl) ctIdEl.value = c.id||'';
    if (ttEl)   ttEl.value   = c.role||c.title||'';
    if (phEl && !phEl.value) phEl.value = c.phone||'';
    if (emEl && !emEl.value) emEl.value = c.email||'';

    if (cust) {
      if (adEl && !adEl.value) adEl.value = cust.address||cust.addr||cust.street||'';
      if (cyEl && !cyEl.value) cyEl.value = cust.city||'';
      if (stEl && !stEl.value) stEl.value = cust.state||'NC';
      if (zpEl && !zpEl.value) zpEl.value = cust.zip||'';
      // Apply customer defaults: payment terms and tax exempt
      var ptEl2 = document.getElementById('qq-pt');
      if (ptEl2 && cust.defaultTerms) { refreshAllPaymentTermsDropdowns && refreshAllPaymentTermsDropdowns(); ptEl2.value = cust.defaultTerms; }
      var txEl2 = document.getElementById('qq-tx');
      if (txEl2 && cust.taxExempt) txEl2.value = '0';
    }
    // Do NOT dispatch input events — that triggers draft save which can wipe quote data
  }, 300);
  showToast('New quote for '+(c.name||''), 'info');
}
function delContact(id) {
  if (typeof hasPermission === 'function' && !hasPermission('cust.delete')) {
    showToast('Your role is not permitted to delete contacts.', 'error', 5000);
    return;
  }
  if (!confirm('Delete contact?\n\nIt is hidden and can be restored by an owner or manager.')) return;
  var isReal = String(id).length > 10;
  if (isReal) {
    if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
    if (!DB.deletedIds.contacts) DB.deletedIds.contacts = [];
    if (DB.deletedIds.contacts.indexOf(id) < 0) DB.deletedIds.contacts.push(id);
  }
  DB.contacts = DB.contacts.filter(function(c){return c.id!=id});
  saveDB();
  if (_sb && _currentUser && isReal) {
    _sb.rpc('soft_delete_contact', { p_id: id }).then(function(r){
      if (r && r.error) { console.warn('[Delete] soft_delete_contact:', r.error.message); showToast('Cloud delete pending ('+r.error.message+') — will retry on next sync.', 'error', 6000); }
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  renderContacts();
  showToast('Contact deleted (recoverable)','info');
}
function newJob(){
  ['m-jname','m-jcust','m-jqnum','m-jnotes','m-jid','m-jassign'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});
  const lh=document.getElementById('m-jlh');if(lh)lh.value=0;
  const act=document.getElementById('m-jactual');if(act)act.value=0;
  const st=document.getElementById('m-jstart');if(st)st.value=new Date().toISOString().split('T')[0];
  const stat=document.getElementById('m-jstatus');if(stat)stat.value='Scheduled';
  openModal('modal-job');
}
function editJob(id){
  const j=DB.jobs.find(function(x){return x.id==id});
  if(!j)return;
  function sv(eid,v){const el=document.getElementById(eid);if(el)el.value=v!==undefined&&v!==null?v:'';}
  sv('m-jname',j.name);sv('m-jcust',j.customer);sv('m-jqnum',j.qnum||'');
  sv('m-jstatus',j.status||'Scheduled');sv('m-jlh',j.estLaborHours||j.laborHours||0);
  sv('m-jnotes',j.notes);sv('m-jid',j.id);
  // V6 fields
  sv('m-jstart',j.startDate||'');sv('m-jassign',j.assignedTo||'');sv('m-jactual',j.actualLaborHours||0);
  openModal('modal-job');
}
function saveJob(){
  const id=document.getElementById('m-jid').value;
  const name=document.getElementById('m-jname').value;
  if(!name.trim()){showToast('Job name required.','error'); return;}
  const existing = id ? DB.jobs.find(function(j){return j.id==id;}) : null;
  const data = Object.assign({}, existing||{}, {
    id: id||Date.now().toString(),
    name: name,
    customer: document.getElementById('m-jcust').value,
    qnum: document.getElementById('m-jqnum').value,
    status: document.getElementById('m-jstatus').value,
    estLaborHours: parseFloat(document.getElementById('m-jlh').value)||0,
    laborHours: parseFloat(document.getElementById('m-jlh').value)||0, // legacy
    actualLaborHours: parseFloat(document.getElementById('m-jactual').value)||0,
    startDate: document.getElementById('m-jstart').value||'',
    assignedTo: document.getElementById('m-jassign').value||'',
    notes: document.getElementById('m-jnotes').value
  });
  if(id){const idx=DB.jobs.findIndex(function(j){return j.id==id});if(idx>=0)DB.jobs[idx]=data;else DB.jobs.push(data);}
  else DB.jobs.push(data);
  saveDB();closeModal('modal-job');renderJobs();renderDash();
}
function delJob(id) {
  if (typeof hasPermission === 'function' && !hasPermission('job.delete')) {
    showToast('Your role is not permitted to delete jobs.', 'error', 5000);
    return;
  }
  if (!confirm('Delete job?\n\nIt is hidden and can be restored by an owner or manager.')) return;
  var isReal = String(id).length > 10;
  if (isReal) {
    if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
    if (!DB.deletedIds.jobs) DB.deletedIds.jobs = [];
    if (DB.deletedIds.jobs.indexOf(id) < 0) DB.deletedIds.jobs.push(id);
  }
  DB.jobs = DB.jobs.filter(function(j){return j.id!=id});
  saveDB();
  if (_sb && _currentUser && isReal) {
    _sb.rpc('soft_delete_job', { p_id: id }).then(function(r){
      if (r && r.error) { console.warn('[Delete] soft_delete_job:', r.error.message); showToast('Cloud delete pending ('+r.error.message+') — will retry on next sync.', 'error', 6000); }
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  renderJobs();
  showToast('Job deleted (recoverable)','info');
}

// ---- RENDER TEAM ----
// ---- TEAM MANAGEMENT V2 (with invite system) ----

function onTmAccessChange() {
  var role = (document.getElementById('m-tmaccess')||{}).value||'';
  var row = document.getElementById('tm-wo-view-row');
  // Show WO visibility toggle for any non-admin role that can access WOs
  var adminRoles = ['owner','office','manager','back_office'];
  var fieldOnlyRoles = ['field','helper_tech','subcontractor','estimator'];
  var showToggle = adminRoles.indexOf(role) < 0 && fieldOnlyRoles.indexOf(role) < 0;
  if (row) row.style.display = showToggle ? '' : 'none';
}

var _accessLabels = {
  owner:'Owner',lead_tech:'Lead Tech',office:'Office',field:'Field Tech',estimator:'Estimator'
};

function renderTeam() {
  var tbody = document.getElementById('team-tbl');
  if (!tbody) return;
  if (!DB.team.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No team members yet. Click Invite Member to add your first team member.</p></td></tr>';
    return;
  }
  var isOwner = _currentUser && _currentUser.role === 'owner';
  tbody.innerHTML = DB.team.map(function(t) {
    var access    = t.access || t.systemRole || 'field';
    var accessLbl = _accessLabels[access] || access;
    var invited   = !!t.invitedAt;
    var hasLogin  = !!t.authUserId;
    var statusBadge = hasLogin
      ? '<span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">✓ Active</span>'
      : invited
        ? '<span style="background:#fff3e0;color:#e65100;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">⏳ Invite Sent</span>'
        : '<span style="background:#f5f5f5;color:#90a4ae;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">No Login</span>';
    return '<tr>'+
      '<td style="font-weight:700;font-size:13px">'+escHtml(t.name||'')+'</td>'+
      '<td style="font-size:12px;color:#546e7a">'+escHtml(t.role||'')+'</td>'+
      '<td><span style="background:#e3f2fd;color:#1565c0;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">'+escHtml(accessLbl)+'</span></td>'+
      '<td style="font-size:12px">'+escHtml(t.email||'—')+'</td>'+
      '<td class="team-rate-col">$'+escHtml(String(t.rate||'0'))+'/hr</td>'+
      '<td>'+statusBadge+'</td>'+
      '<td style="white-space:nowrap">'+
        '<button class="btn btn-outline btn-sm" data-action="editTeamMember" data-id="'+t.id+'">Edit</button> '+
        '<button class="btn btn-outline btn-sm" onclick="openTechJournalView(\''+escHtml(t.name)+'\')" style="color:#1565c0">📋 Journal</button> '+
        '<button class="btn btn-outline btn-sm" onclick="openQuarterlyReview(\''+escHtml(t.name)+'\')" style="color:#7b1fa2">📊 Review</button> '+
        (!hasLogin && t.email ? '<button class="btn btn-outline btn-sm" data-action="inviteTeamMember" data-id="'+t.id+'">✉ Invite</button> ' : '')+
        (isOwner ? '<button class="btn btn-danger btn-sm" data-action="delTeamMember" data-id="'+t.id+'">Del</button>' : '')+
      '</td>'+
    '</tr>';
  }).join('');
}

function newTeamMemberV2() {
  ['m-tmname','m-tmrole','m-tmph','m-tmem','m-tmid','m-tmhire','m-tm-invited'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var el=document.getElementById('m-tmrate');        if(el)  el.value=65;
  var ac=document.getElementById('m-tmaccess');      if(ac)  ac.value='field';
  var sv=document.getElementById('m-tm-show-vacation');if(sv)sv.checked=false;
  var sp=document.getElementById('m-tm-show-pto');   if(sp)  sp.checked=false;
  var sms=document.getElementById('m-tm-sms-enabled'); if(sms) sms.checked=true;
  var st=document.getElementById('tm-invite-status');if(st){st.style.display='none';st.innerHTML='';}
  var rb=document.getElementById('tm-resend-btn');   if(rb)  rb.style.display='none';
  document.getElementById('team-modal-title').textContent='New Team Member';
  openModal('modal-team');
}

// Keep old name working
function newTeamMember() { newTeamMemberV2(); }

function editTeamMemberV2(id) {
  var t=DB.team.find(function(x){return x.id==id;}); if(!t) return;
  function sv(eid,v){var el=document.getElementById(eid);if(el)el.value=v||'';}
  sv('m-tmname',t.name); sv('m-tmrole',t.role); sv('m-tmph',t.phone||''); sv('m-tmem',t.email||'');
  sv('m-tmrate',t.rate||65); sv('m-tmid',t.id); sv('m-tmhire',t.hireDate||'');
  sv('m-tm-invited',t.invitedAt||'');
  var ac=document.getElementById('m-tmaccess'); if(ac) ac.value=t.access||t.systemRole||'field';
  var sv2=document.getElementById('m-tm-show-vacation'); if(sv2) sv2.checked=!!t.showVacation;
  var sp=document.getElementById('m-tm-show-pto');       if(sp)  sp.checked=!!t.showPTO;
  var sms2=document.getElementById('m-tm-sms-enabled'); if(sms2) sms2.checked=(t.smsEnabled!==false);

  // Show invite status
  var stEl=document.getElementById('tm-invite-status');
  var rbEl=document.getElementById('tm-resend-btn');
  if (stEl) {
    if (t.authUserId) {
      stEl.style.display=''; stEl.style.background='#e8f5e9'; stEl.style.color='#2e7d32';
      stEl.innerHTML='✓ This member has an active login account.';
      if(rbEl) rbEl.style.display='none';
    } else if (t.invitedAt) {
      stEl.style.display=''; stEl.style.background='#fff3e0'; stEl.style.color='#e65100';
      stEl.innerHTML='⏳ Invite sent on '+escHtml(t.invitedAt.split('T')[0])+' — waiting for them to accept.';
      if(rbEl) rbEl.style.display='';
    } else {
      stEl.style.display='none';
      if(rbEl) rbEl.style.display='none';
    }
  }
  var woViewEl = document.getElementById('m-tm-wo-view');
  if (woViewEl) woViewEl.value = t.woViewMode||'all';
  onTmAccessChange();
  document.getElementById('team-modal-title').textContent='Edit: '+escHtml(t.name||'');
  openModal('modal-team');
}

// Keep old name working
function editTeamMember(id) { editTeamMemberV2(id); }

function _buildTeamMemberData() {
  function gv(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  var id   = gv('m-tmid');
  var name = gv('m-tmname');
  if (!name) { showToast('Name is required','error'); return null; }
  var email = gv('m-tmem');
  var existing = id ? DB.team.find(function(t){return t.id==id;}) : null;
  return {
    id:          id || crypto.randomUUID(),
    name:        name,
    role:        gv('m-tmrole'),
    access:      gv('m-tmaccess') || 'field',
    systemRole:  gv('m-tmaccess') || 'field',
    phone:       gv('m-tmph'),
    email:       email,
    rate:        parseFloat(gv('m-tmrate')) || 65,
    hireDate:    gv('m-tmhire'),
    showVacation:!!(document.getElementById('m-tm-show-vacation')||{}).checked,
    showPTO:     !!(document.getElementById('m-tm-show-pto')||{}).checked,
    smsEnabled:  !!(document.getElementById('m-tm-sms-enabled')||{}).checked,
    invitedAt:   existing ? (existing.invitedAt||null) : null,
    authUserId:  existing ? (existing.authUserId||null) : null
  };
}

function saveTeamMemberV2() {
  var data = _buildTeamMemberData(); if(!data) return;
  _upsertTeamMember(data);
  saveDB(); closeModal('modal-team'); renderTeam();
  showToast(data.name+' saved ✓','success');
}

// Keep old name working
function saveTeamMember() { saveTeamMemberV2(); }

async function saveAndInviteTeamMember() {
  var data = _buildTeamMemberData(); if(!data) return;
  if (!data.email) { showToast('Email address is required to send an invite','error'); return; }
  _upsertTeamMember(data);
  saveDB();
  showToast('Sending invite to '+data.email+'...','info',3000);
  await sendInviteToMember(data.id);
  closeModal('modal-team');
  renderTeam();
}

async function sendInviteToMember(id) {
  var t = DB.team.find(function(x){return x.id==id;}); if(!t) return;
  if (!t.email) { showToast('No email address for this team member','error'); return; }
  if (!_sb) { showToast('Not connected to database','error'); return; }
  try {
    // Use Supabase admin invite — requires service role key
    // With anon key we use signInWithOtp (magic link) as fallback
    var redirectTo = window.location.origin + window.location.pathname;
    var result = await _sb.auth.signInWithOtp({
      email: t.email,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: t.name,
          role:      t.access || 'field',
          team_id:   t.id
        }
      }
    });
    if (result.error) {
      // Try admin invite via edge function if available
      showToast('Could not send via magic link: '+result.error.message+'. Please invite from Supabase Auth dashboard.','error',6000);
      return;
    }
    t.invitedAt = new Date().toISOString();
    saveDB();
    // Push to Supabase team record
    if (_sb && _currentUser) {
      _sb.from('team').update({ invited_at: t.invitedAt }).eq('id', t.id).then(function(){});
    }
    showToast('✉️ Login invite sent to '+t.email+' ✓','success',5000);
  } catch(e) {
    showToast('Invite error: '+e.message,'error');
  }
}

async function resendTeamInvite() {
  var id = (document.getElementById('m-tmid')||{}).value||'';
  if (id) await sendInviteToMember(id);
}

function _upsertTeamMember(data) {
  if (!DB.team) DB.team = [];
  var idx = DB.team.findIndex(function(t){return t.id==data.id;});
  if (idx>=0) DB.team[idx]=data; else DB.team.push(data);
  // Push to Supabase
  if (_sb && _currentUser) {
    _sb.from('team').upsert({
      id:           data.id,
      full_name:    data.name,
      role:         data.access||'field',
      phone:        data.phone||null,
      email:        data.email||null,
      rate:         data.rate||65,
      hire_date:    data.hireDate||null,
      show_vacation:!!data.showVacation,
      show_pto:     !!data.showPTO,
      is_active:    true,
      created_by:   _currentUser.id
    }).then(function(r){ if(r.error) console.warn('[Team Push]',r.error.message); });
  }
}
function delTeamMember(id){
  // Removing a staff record is high-privilege: owner/manager only, enforced at the DB
  // by soft_delete_team. This client check just keeps the UI honest.
  var _role = _currentUser && _currentUser.role;
  if (_role !== 'owner' && _role !== 'manager') {
    showToast('Only an owner or manager can remove team members.', 'error', 5000);
    return;
  }
  if(!confirm('Remove team member?\n\nThey are hidden and can be restored by an owner or manager.')) return;
  if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
  if (!DB.deletedIds.team) DB.deletedIds.team = [];
  if (DB.deletedIds.team.indexOf(id) < 0) DB.deletedIds.team.push(id);
  DB.team = DB.team.filter(function(t){ return t.id != id; });
  saveDB();
  if (window._syncTimer) { clearTimeout(window._syncTimer); window._syncTimer = null; }
  if (_sb && _currentUser) {
    // Authorized soft-delete: role check + audit, recoverable. Was a raw hard DELETE
    // that any signed-in user could invoke and the server confirmed.
    _sb.rpc('soft_delete_team', { p_id: id }).then(function(r){
      if (r && r.error) { console.warn('[Delete] soft_delete_team:', r.error.message); showToast('Cloud removal pending ('+r.error.message+') — will retry on next sync.', 'error', 6000); }
      if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 300);
    });
  }
  renderTeam();
  showToast('Team member removed (recoverable)', 'info');
}


// ---- CATALOG ----
var _pumActive = false;

function renderCatalog() {
  var search = (document.getElementById('cat-search')||{}).value || '';
  var filter = (document.getElementById('cat-filter')||{}).value || '';
  var list   = DB.catalog.slice();
  if (search) { var sl=search.toLowerCase(); list=list.filter(function(i){return (i.name||'').toLowerCase().includes(sl)||(i.cat||'').toLowerCase().includes(sl);}); }
  if (filter) list = list.filter(function(i){return (i.cat||'')===filter;});
  var grid = document.getElementById('catalog-grid');
  if (!grid) return;
  if (!list.length) { grid.innerHTML='<div class="empty-state"><div class="empty-icon">📦</div><p>No catalog items found.</p></div>'; return; }

  var laborRate = parseFloat((document.getElementById('qq-lr')||{}).value) || DB.settings.laborRate || 100;

  // Toggle Price Update Mode class on grid
  if (_pumActive) {
    grid.classList.add('price-update-mode');
  } else {
    grid.classList.remove('price-update-mode');
  }

  grid.innerHTML = list.map(function(item){
    var pumFields = _pumActive
      ? '<div class="price-update-edit">' +
          '<div class="price-update-field">Mat $<input type="number" data-pumid="' + item.id + '" data-pumfield="mc" value="' + (item.mc||0) + '" min="0" step="0.01" title="Material cost"></div>' +
          '<div class="price-update-field">Labor hrs<input type="number" data-pumid="' + item.id + '" data-pumfield="lh" value="' + (item.lh||0) + '" min="0" step="0.01" title="Labor hours"></div>' +
        '</div>'
      : '';
    return '<div class="cat-item" data-catid="' + item.id + '">' +
      '<div class="cat-item-info">' +
        '<div class="cat-item-name">' + escHtml(item.name||'') + '</div>' +
        '<div class="cat-item-meta">' + escHtml(item.cat||'') + ' | ' + escHtml(item.unit||'ea') + ' | ' + (item.lh||0) + ' hr/unit</div>' +
        '<div class="cat-item-price">Mat: ' + fmt(item.mc||0) + ' | Labor: ' + fmt((item.lh||0)*laborRate) + '/ea</div>' +
        pumFields +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">' +
        '<button class="btn btn-primary btn-sm" data-action="addCatToQQ" data-id="' + item.id + '">+ Add</button>' +
        '<button class="cat-edit-btn" data-action="editCatalogItem" data-id="' + item.id + '">Edit</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Update category filter
  var cats = [];
  DB.catalog.forEach(function(i){ if(cats.indexOf(i.cat||'General')<0) cats.push(i.cat||'General'); });
  cats.sort();
  var cf = document.getElementById('cat-filter');
  if (cf) { cf.innerHTML = '<option value="">All Categories</option>' + cats.map(function(c){return '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>';}).join(''); if(filter) cf.value=filter; }
}

function togglePriceUpdateMode() {
  _pumActive = !_pumActive;
  var banner = document.getElementById('pum-banner');
  var btn    = document.getElementById('pum-toggle-btn');
  if (banner) banner.style.display = _pumActive ? 'flex' : 'none';
  if (btn) {
    btn.textContent = _pumActive ? '✕ Exit Price Mode' : '✏️ Price Update Mode';
    btn.style.background  = _pumActive ? '#fff3e0' : '';
    btn.style.borderColor = _pumActive ? '#f57f17' : '';
    btn.style.color       = _pumActive ? '#e65100' : '';
  }
  renderCatalog();
}

function savePriceUpdates() {
  var inputs = document.querySelectorAll('[data-pumid]');
  var changed = 0;
  inputs.forEach(function(input){
    var id    = input.getAttribute('data-pumid');
    var field = input.getAttribute('data-pumfield');
    var val   = parseFloat(input.value) || 0;
    var item  = DB.catalog.find(function(i){ return i.id===id; });
    if (item && item[field] !== val) { item[field] = val; changed++; }
  });
  saveDB();
  _pumActive = false;
  var banner = document.getElementById('pum-banner');
  var btn    = document.getElementById('pum-toggle-btn');
  if (banner) banner.style.display = 'none';
  if (btn)    { btn.textContent = '✏️ Price Update Mode'; btn.style.background=''; btn.style.borderColor=''; btn.style.color=''; }
  renderCatalog();
  // Flash confirmation
  var result = document.getElementById('catalog-import-result');
  if (result) {
    result.style.display='block'; result.style.background='#e8f5e9'; result.style.border='1px solid #a5d6a7'; result.style.color='#2e7d32';
    result.textContent = '✓ Saved ' + changed + ' price change' + (changed!==1?'s':'') + ' to ' + (inputs.length/2) + ' catalog items.';
    setTimeout(function(){ result.style.display='none'; }, 4000);
  }
}

function addCatToQQ(id) {
  const item = DB.catalog.find(function(i){return i.id==id});
  if (!item) return;
  addRow(newLI(item.name, item.cat, 1, item.unit||'ea', item.mc||0, item.lh||0));
  goPage('qq');
}

function newCatalogItem(){document.getElementById('cat-modal-title').textContent='New Catalog Item';['m-caname','m-cacat','m-caunit','m-canotes','m-caid'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});const mc=document.getElementById('m-camc');if(mc)mc.value=0;const lh=document.getElementById('m-calh');if(lh)lh.value=0;openModal('modal-catalog-item');}
function editCatalogItem(id){const item=DB.catalog.find(function(x){return x.id==id});if(!item)return;document.getElementById('cat-modal-title').textContent='Edit Item';function sv(eid,v){const el=document.getElementById(eid);if(el)el.value=v!==undefined?v:'';}sv('m-caname',item.name);sv('m-cacat',item.cat);sv('m-caunit',item.unit);sv('m-camc',item.mc||0);sv('m-calh',item.lh||0);sv('m-canotes',item.notes);sv('m-caid',item.id);openModal('modal-catalog-item');}
function saveCatalogItem(){const id=document.getElementById('m-caid').value;const name=document.getElementById('m-caname').value;if(!name.trim()){showToast('Name required.','error'); return;}const data={id:id||Date.now().toString(),name,cat:document.getElementById('m-cacat').value||'General',unit:document.getElementById('m-caunit').value||'ea',mc:parseFloat(document.getElementById('m-camc').value)||0,lh:parseFloat(document.getElementById('m-calh').value)||0,notes:document.getElementById('m-canotes').value};if(id){const idx=DB.catalog.findIndex(function(i){return i.id==id});if(idx>=0)DB.catalog[idx]=data;else DB.catalog.push(data);}else DB.catalog.push(data);saveDB();closeModal('modal-catalog-item');renderCatalog();}
function delCatalogItem(id){
  if(!confirm('Delete catalog item?'))return;
  DB.catalog=DB.catalog.filter(function(i){return i.id!=id});
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.catalog)DB.deletedIds.catalog=[];
  if(DB.deletedIds.catalog.indexOf(id)<0)DB.deletedIds.catalog.push(id);
  saveDB();
  // Soft-delete in the cloud (is_active=false) so it doesn't resurrect on the next pull.
  if(_sb&&_currentUser){ _sb.from('catalog').update({is_active:false}).eq('id',id).then(function(r){ if(r&&r.error)console.warn('[Delete] catalog:',r.error.message); if(typeof pushAllToCloud==='function')setTimeout(pushAllToCloud,300); }); }
  renderCatalog();
}

// ---- CATALOG PICKER MODAL ----
function openCatalog() {
  // Build category dropdown ONCE when modal opens
  const cpCat = document.getElementById('cp-cat');
  if (cpCat) {
    const cats = [...new Set(DB.catalog.map(function(i){return i.cat||'General'}))].sort();
    cpCat.innerHTML = '<option value="">All Categories</option>' + cats.map(function(c){
      return '<option value="'+escHtml(c)+'">'+escHtml(c)+'</option>';
    }).join('');
    cpCat.value = ''; // reset to All on open
  }
  // Clear search on open
  const cpSearch = document.getElementById('cp-search');
  if (cpSearch) cpSearch.value = '';
  renderCPick();
  openModal('modal-catalog-pick');
}

function renderCPick() {
  const search = (document.getElementById('cp-search')||{}).value || '';
  const cpCat  = document.getElementById('cp-cat');
  const cat    = cpCat ? cpCat.value : '';

  let list = DB.catalog.slice();
  if (search) {
    const sl = search.toLowerCase();
    list = list.filter(function(i){ return (i.name||'').toLowerCase().includes(sl) || (i.cat||'').toLowerCase().includes(sl); });
  }
  if (cat) list = list.filter(function(i){ return (i.cat||'') === cat; });

  const cpList = document.getElementById('cp-list');
  if (!cpList) return;

  if (!list.length) {
    cpList.innerHTML = '<div style="text-align:center;padding:20px;color:#90a4ae">No items found.</div>';
    return;
  }

  cpList.innerHTML = list.map(function(item){
    return '<div class="cpick-row" data-cpid="' + item.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 6px;border-bottom:1px solid #f0f0f0;cursor:pointer">' +
      '<input type="checkbox" data-cpid="' + item.id + '" style="width:18px;height:18px;flex-shrink:0">' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;font-size:13px;color:#0d1b2a">' + escHtml(item.name||'(no name)') + '</div>' +
        '<div style="font-size:11px;color:#90a4ae;margin-top:2px">' + escHtml(item.cat||'General') + ' &nbsp;·&nbsp; Mat: ' + fmt(item.mc||0) + ' &nbsp;·&nbsp; ' + (item.lh||0) + ' hrs &nbsp;·&nbsp; ' + escHtml(item.unit||'ea') + '</div>' +
      '</div>' +
      '<div style="font-size:12px;font-weight:700;color:#1565c0;flex-shrink:0">' + fmt(item.mc||0) + '</div>' +
    '</div>';
  }).join('');
}
function addFromCatalog() {
  const checked = document.querySelectorAll('#cp-list input[type=checkbox]:checked');
  checked.forEach(function(cb) {
    const id = cb.getAttribute('data-cpid');
    const item = DB.catalog.find(function(i){return i.id==id});
    if (item) addRow(newLI(item.name, item.cat, 1, item.unit||'ea', item.mc||0, item.lh||0));
  });
  closeModal('modal-catalog-pick');
  calcTotals();
}

// =============================================
// TEMPLATE LIBRARY
// =============================================

// Category definitions — icon, label, order
var TLIB_CATEGORIES = [
  { id:'Structured Wiring', icon:'🔌', label:'Structured Wiring' },
  { id:'Networking',        icon:'🌐', label:'Networking' },
  { id:'Security',          icon:'📷', label:'Security / Cameras' },
  { id:'Access Control',    icon:'🚪', label:'Access Control' },
  { id:'Infrastructure',    icon:'🖥️', label:'Infrastructure / IDF' },
  { id:'Service',           icon:'🔧', label:'Service' },
  { id:'Custom',            icon:'⭐', label:'Custom' },
];

// Merge duplicate display labels
function getTlibCategoryInfo(catId) {
  const match = TLIB_CATEGORIES.find(function(c){ return c.id === catId; });
  if (match) return match;
  return { id: catId, icon: '📐', label: catId || 'Uncategorized' };
}

// =============================================
// V8 COMMAND CENTER TEMPLATE LIBRARY
// =============================================

let tlibSelectedIds  = new Set();
let tlibActiveCat    = 'starred';   // default to starred on open
let tlibActiveId     = null;        // currently previewed template id
let _tlibSearch      = '';

// Usage tracking — stored in DB.settings.tlibUsage = { tplId: {count, lastUsed} }
function tlibGetUsage(id) {
  if (!DB.settings.tlibUsage) DB.settings.tlibUsage = {};
  return DB.settings.tlibUsage[id] || { count: 0, lastUsed: 0 };
}
function tlibRecordUse(id) {
  if (!DB.settings.tlibUsage) DB.settings.tlibUsage = {};
  const u = tlibGetUsage(id);
  DB.settings.tlibUsage[id] = { count: u.count + 1, lastUsed: Date.now() };
  saveDB();
}
function tlibIsFav(id) {
  return (DB.settings.favTemplates || []).includes(id);
}
function tlibToggleFav(event, id) {
  if (event) event.stopPropagation();
  if (!DB.settings.favTemplates) DB.settings.favTemplates = [];
  const idx = DB.settings.favTemplates.indexOf(id);
  if (idx >= 0) DB.settings.favTemplates.splice(idx, 1);
  else           DB.settings.favTemplates.unshift(id);
  saveDB();
  renderTplLibrary();
}

// ---- MAIN RENDER ----
function renderTplLibrary() {
  _buildTlibNav();
  _buildTlibList();
  _buildTlibPreview(tlibActiveId);
  _updateSelectBar();
}

function _buildTlibNav() {
  const nav = document.getElementById('tlib-nav');
  if (!nav) return;

  const favIds  = DB.settings.favTemplates || [];
  const favCount= favIds.filter(function(id){ return DB.templates.find(function(t){ return t.id===id; }); }).length;

  // Build category counts
  const catMap = {};
  DB.templates.forEach(function(t){
    const c = t.cat || 'Custom';
    catMap[c] = (catMap[c] || 0) + 1;
  });

  // Order by TLIB_CATEGORIES then alpha for unknown
  const orderedCats = Object.keys(catMap).sort(function(a, b){
    const ai = TLIB_CATEGORIES.findIndex(function(c){ return c.id === a; });
    const bi = TLIB_CATEGORIES.findIndex(function(c){ return c.id === b; });
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  let html = '';

  // Starred row
  html += '<div class="tlib-nav-item starred' + (tlibActiveCat === 'starred' ? ' active' : '') + '" onclick="tlibSetCat(\'starred\')">' +
    '<span class="tlib-nav-icon">⭐</span>' +
    '<span class="tlib-nav-label">Starred</span>' +
    '<span class="tlib-nav-count">' + favCount + '</span></div>';

  // All row
  html += '<div class="tlib-nav-item' + (tlibActiveCat === 'all' ? ' active' : '') + '" onclick="tlibSetCat(\'all\')">' +
    '<span class="tlib-nav-icon">📋</span>' +
    '<span class="tlib-nav-label">All Templates</span>' +
    '<span class="tlib-nav-count">' + DB.templates.length + '</span></div>';

  html += '<div class="tlib-nav-divider"></div>';

  // Category rows
  orderedCats.forEach(function(cat){
    const info  = TLIB_CATEGORIES.find(function(c){ return c.id === cat; }) || { icon: '📐' };
    const isActive = tlibActiveCat === cat;
    html += '<div class="tlib-nav-item' + (isActive ? ' active' : '') + '" onclick="tlibSetCat(' + JSON.stringify(cat) + ')">' +
      '<span class="tlib-nav-icon">' + info.icon + '</span>' +
      '<span class="tlib-nav-label">' + escHtml(cat) + '</span>' +
      '<span class="tlib-nav-count">' + catMap[cat] + '</span></div>';
  });

  nav.innerHTML = html;
}

function _buildTlibList() {
  const listEl = document.getElementById('tlib-list');
  if (!listEl) return;

  const search = _tlibSearch.toLowerCase();
  const sort   = (document.getElementById('tlib-sort') || {}).value || 'recent';
  const favIds = DB.settings.favTemplates || [];

  // Filter by category/search
  let list = DB.templates.slice();

  if (tlibActiveCat === 'starred') {
    list = list.filter(function(t){ return favIds.includes(t.id); });
  } else if (tlibActiveCat !== 'all') {
    list = list.filter(function(t){ return (t.cat || 'Custom') === tlibActiveCat; });
  }

  if (search) {
    list = list.filter(function(t){
      return (t.name||'').toLowerCase().includes(search) ||
             (t.cat||'').toLowerCase().includes(search) ||
             (t.items||[]).some(function(i){ return (i.desc||'').toLowerCase().includes(search); });
    });
  }

  // Sort
  list.sort(function(a, b){
    if (sort === 'recent') {
      return (tlibGetUsage(b.id).lastUsed || 0) - (tlibGetUsage(a.id).lastUsed || 0);
    } else if (sort === 'most') {
      return (tlibGetUsage(b.id).count || 0) - (tlibGetUsage(a.id).count || 0);
    } else if (sort === 'name') {
      return (a.name||'').localeCompare(b.name||'');
    } else if (sort === 'margin') {
      return (b.margin||35) - (a.margin||35);
    }
    return 0;
  });

  if (!list.length) {
    listEl.innerHTML = '<div class="tlib-empty">' +
      (search ? 'No templates match "' + escHtml(search) + '"' :
       tlibActiveCat === 'starred' ? 'No starred templates yet.<br>Click ☆ on any template to star it.' :
       'No templates in this category.') + '</div>';
    return;
  }

  // Group by category when showing All or search results
  const showGrouped = tlibActiveCat === 'all' || (search && tlibActiveCat === 'all');

  if (showGrouped || search) {
    // Show category labels
    const grouped = {};
    const groupOrder = [];
    list.forEach(function(t){
      const c = t.cat || 'Custom';
      if (!grouped[c]) { grouped[c] = []; groupOrder.push(c); }
      grouped[c].push(t);
    });
    let html = '';
    groupOrder.forEach(function(cat){
      html += '<div class="tlib-mid-cat-label">' + escHtml(cat) + '</div>';
      grouped[cat].forEach(function(t){ html += _buildTlibRowHTML(t, favIds); });
    });
    listEl.innerHTML = html;
  } else {
    listEl.innerHTML = list.map(function(t){ return _buildTlibRowHTML(t, favIds); }).join('');
  }
}

function _buildTlibRowHTML(t, favIds) {
  const isFav    = favIds.includes(t.id);
  const usage    = tlibGetUsage(t.id);
  const isActive = tlibActiveId === t.id;
  const isSel    = tlibSelectedIds.has(t.id);
  const estHrs   = (t.items||[]).reduce(function(s,i){ return s+(parseFloat(i.lh)||0)*(parseFloat(i.qty)||1); },0);

  return '<div class="tlib-row' + (isActive?' active':'') + '" onclick="tlibSelectRow(\'' + t.id + '\')">' +
    '<span class="tlib-row-icon">' + escHtml(t.icon||'📐') + '</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div class="tlib-row-name">' + escHtml(t.name||'') + '</div>' +
      '<div class="tlib-row-meta">' + (t.margin||35) + '% &nbsp;·&nbsp; ' + (t.items||[]).length + ' items' + (estHrs>0?' &nbsp;·&nbsp; ~'+estHrs.toFixed(1)+'h':'') + '</div>' +
    '</div>' +
    (usage.count > 0 ? '<span class="tlib-row-badge">×' + usage.count + '</span>' : '') +
    (isSel ? '<span style="font-size:11px;color:#1565c0;font-weight:700;flex-shrink:0">✓</span>' : '') +
    '<button class="tlib-row-star' + (isFav?' on':'') + '" onclick="tlibToggleFav(event,\'' + t.id + '\')" title="' + (isFav?'Unstar':'Star') + '">' + (isFav?'★':'☆') + '</button>' +
  '</div>';
}

function tlibSetCat(cat) {
  tlibActiveCat = cat;
  tlibActiveId  = null;
  renderTplLibrary();
}

function tlibSelectRow(id) {
  tlibActiveId = id;
  _buildTlibList();      // re-render list to show active state
  _buildTlibPreview(id);
}

// ---- PREVIEW PANE ----
function _buildTlibPreview(id) {
  const el = document.getElementById('tlib-right');
  if (!el) return;

  if (!id) {
    el.innerHTML = '<div class="tlib-right-empty"><div class="tlib-right-empty-icon">📐</div><div>Select a template<br>to preview</div></div>';
    return;
  }

  const t = DB.templates.find(function(x){ return x.id === id; });
  if (!t) { el.innerHTML = '<div class="tlib-right-empty"><div>Template not found.</div></div>'; return; }

  const items    = t.items || [];
  const usage    = tlibGetUsage(id);
  const isFav    = tlibIsFav(id);
  const estHrs   = items.reduce(function(s,i){ return s+(parseFloat(i.lh)||0)*(parseFloat(i.qty)||1); },0);
  const matCost  = items.reduce(function(s,i){ return s+(parseFloat(i.mc)||0)*(parseFloat(i.qty)||1); },0);
  const envInfo  = ENV_PRESETS[t.env] || { label: 'Office' };
  const isSel    = tlibSelectedIds.has(id);

  el.innerHTML =
    '<div class="tlib-preview-head">' +
      '<div class="tlib-preview-title">' +
        escHtml(t.icon||'📐') + ' ' + escHtml(t.name||'') +
        '<button class="tlib-row-star' + (isFav?' on':'') + '" onclick="tlibToggleFav(event,\'' + id + '\')" style="margin-left:auto">' + (isFav?'★':'☆') + '</button>' +
      '</div>' +
      '<div class="tlib-preview-cat">' + escHtml(t.cat||'') + ' &nbsp;·&nbsp; ' + escHtml(envInfo.label) + '</div>' +
    '</div>' +
    '<div class="tlib-preview-stats">' +
      '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (t.margin||35) + '%</div><div class="tlib-stat-lbl">Margin</div></div>' +
      '<div class="tlib-stat-box"><div class="tlib-stat-val">' + items.length + '</div><div class="tlib-stat-lbl">Items</div></div>' +
      '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (estHrs>0?'~'+estHrs.toFixed(1)+'h':'—') + '</div><div class="tlib-stat-lbl">Est. Hours</div></div>' +
      '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (matCost>0?'$'+Math.round(matCost):'—') + '</div><div class="tlib-stat-lbl">Mat. Cost</div></div>' +
    '</div>' +
    '<div class="tlib-preview-items">' +
      '<div class="tlib-preview-item-head">Line Items</div>' +
      (items.length > 0 ? items.map(function(i){
        return '<div class="tlib-item-row">' +
          '<span class="tlib-item-desc">' + escHtml(i.desc||'') + '</span>' +
          '<span class="tlib-item-detail">×' + (i.qty||1) + ' ' + escHtml(i.unit||'ea') + (i.mc>0?' · $'+i.mc:'') + '</span>' +
        '</div>';
      }).join('') : '<div style="color:#90a4ae;font-size:12px">No items in this template.</div>') +
    '</div>' +
    '<div class="tlib-preview-actions">' +
      '<button class="tlib-btn-append" onclick="appendTemplate(\'' + id + '\', false)">+ Append to Quote</button>' +
      '<button class="tlib-btn-append-stay" onclick="appendTemplate(\'' + id + '\', true)">+ Append &amp; Stay</button>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">' +
        '<button class="tlib-row-star' + (isSel?' on':'') + '" style="font-size:12px;padding:0;background:none;border:none;color:' + (isSel?'#1565c0':'#90a4ae') + ';cursor:pointer" onclick="tlibToggleSelect(\'' + id + '\')">' + (isSel?'☑ In multi-select':'☐ Add to multi-select') + '</button>' +
        (usage.count > 0 ? '<div class="tlib-usage-note">Used ' + usage.count + '× · Last: ' + new Date(usage.lastUsed).toLocaleDateString() + '</div>' : '<div class="tlib-usage-note">Never used yet</div>') +
      '</div>' +
    '</div>';
}

// ---- APPEND LOGIC ----
function appendTemplate(id, stay) {
  const t = DB.templates.find(function(x){ return x.id === id; });
  if (!t) return;

  const wasEmpty = lineItems.length === 0;
  const newItems = (t.items||[]).map(function(item){ return Object.assign({}, item, { _id: nextLiId() }); });
  lineItems = lineItems.concat(newItems);

  // Apply env/margin only if quote was blank
  if (wasEmpty) {
    const envEl  = document.getElementById('qq-env');
    const mkEl   = document.getElementById('qq-mk');
    const noteEl = document.getElementById('env-default-note');
    if (envEl && t.env)    envEl.value = t.env;
    if (mkEl && t.margin)  { mkEl.value = t.margin; if (noteEl) noteEl.classList.add('visible'); }
  }

  tlibRecordUse(id);
  renderLI();
  calcTotals();

  // Flash confirmation
  const flash = document.getElementById('tlib-appended-flash');
  if (flash) { flash.style.display='inline'; setTimeout(function(){ flash.style.display='none'; }, 2000); }

  if (!stay) {
    // Scroll to line items
    const liCard = document.getElementById('li-body');
    if (liCard) liCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Refresh usage badge in preview
  _buildTlibPreview(id);
  _buildTlibList();
}

function appendSelectedTemplates() {
  if (!tlibSelectedIds.size) return;
  let first = true;
  tlibSelectedIds.forEach(function(id){
    const t = DB.templates.find(function(x){ return x.id===id; });
    if (!t) return;
    const wasEmpty = first && lineItems.length === 0;
    const newItems = (t.items||[]).map(function(item){ return Object.assign({}, item, { _id: nextLiId() }); });
    lineItems = lineItems.concat(newItems);
    if (wasEmpty) {
      const envEl = document.getElementById('qq-env');
      const mkEl  = document.getElementById('qq-mk');
      if (envEl && t.env)   envEl.value = t.env;
      if (mkEl && t.margin) mkEl.value  = t.margin;
    }
    tlibRecordUse(id);
    first = false;
  });
  renderLI();
  calcTotals();
  tlibSelectedIds.clear();
  _updateSelectBar();
  _buildTlibList();
  const flash = document.getElementById('tlib-appended-flash');
  if (flash) { flash.style.display='inline'; setTimeout(function(){ flash.style.display='none'; }, 2000); }
}

function tlibToggleSelect(id) {
  if (tlibSelectedIds.has(id)) tlibSelectedIds.delete(id);
  else                          tlibSelectedIds.add(id);
  _updateSelectBar();
  _buildTlibList();
  _buildTlibPreview(id);
}

function clearTemplateSelection() {
  tlibSelectedIds.clear();
  _updateSelectBar();
  _buildTlibList();
}

function _updateSelectBar() {
  const bar   = document.getElementById('tlib-select-bar');
  const count = document.getElementById('tlib-select-count');
  if (!bar) return;
  const n = tlibSelectedIds.size;
  bar.classList.toggle('visible', n > 0);
  if (count) count.textContent = n + ' template' + (n !== 1 ? 's' : '') + ' selected';
}

// ---- SEARCH / SORT (called by input listeners) ----
function tlibOnSearch(val) {
  _tlibSearch = val || '';
  if (_tlibSearch) tlibActiveCat = 'all'; // switch to all when searching
  _buildTlibNav();
  _buildTlibList();
}

function clearTlibSearch() {
  _tlibSearch = '';
  const el = document.getElementById('tlib-search');
  if (el) el.value = '';
  _buildTlibList();
}

// ---- TEMPLATE MANAGEMENT PAGE (Command Center) ----
var _tmgmtActiveCat = 'all';
var _tmgmtActiveId  = null;
var _tmgmtSearch    = '';

function renderTemplates() {
  _buildTmgmtNav();
  _buildTmgmtList();
  _buildTmgmtPreview(_tmgmtActiveId);
}

function _buildTmgmtNav() {
  var nav = document.getElementById('tmgmt-nav');
  if (!nav) return;
  var catMap = {};
  DB.templates.forEach(function(t){ var c = t.cat||'Custom'; catMap[c] = (catMap[c]||0)+1; });
  var orderedCats = Object.keys(catMap).sort(function(a,b){
    var ai = TLIB_CATEGORIES.findIndex(function(c){return c.id===a;});
    var bi = TLIB_CATEGORIES.findIndex(function(c){return c.id===b;});
    return (ai===-1?999:ai)-(bi===-1?999:bi);
  });
  var html = '';
  var allActive = _tmgmtActiveCat === 'all' ? ' active' : '';
  html += '<div class="tlib-nav-item' + allActive + '" data-tmcat="all" onclick="_tmgmtSetCat(this.getAttribute(\'data-tmcat\'))">';
  html += '<span class="tlib-nav-icon">📋</span><span class="tlib-nav-label">All Templates</span>';
  html += '<span class="tlib-nav-count">' + DB.templates.length + '</span></div>';
  html += '<div class="tlib-nav-divider"></div>';
  orderedCats.forEach(function(cat){
    var info = TLIB_CATEGORIES.find(function(c){return c.id===cat;})||{icon:'📐'};
    var isAct = _tmgmtActiveCat === cat ? ' active' : '';
    html += '<div class="tlib-nav-item' + isAct + '" data-tmcat="' + escHtml(cat) + '" onclick="_tmgmtSetCat(this.getAttribute(\'data-tmcat\'))">';
    html += '<span class="tlib-nav-icon">' + info.icon + '</span><span class="tlib-nav-label">' + escHtml(cat) + '</span>';
    html += '<span class="tlib-nav-count">' + catMap[cat] + '</span></div>';
  });
  nav.innerHTML = html;
}

function _buildTmgmtList() {
  var listEl = document.getElementById('tmgmt-list');
  if (!listEl) return;
  var search = _tmgmtSearch.toLowerCase();
  var sortEl = document.getElementById('tmgmt-sort');
  var sort   = sortEl ? sortEl.value : 'name';
  var list   = DB.templates.slice();
  if (_tmgmtActiveCat !== 'all') {
    list = list.filter(function(t){ return (t.cat||'Custom') === _tmgmtActiveCat; });
  }
  if (search) {
    list = list.filter(function(t){
      return (t.name||'').toLowerCase().includes(search) ||
             (t.cat||'').toLowerCase().includes(search) ||
             (t.items||[]).some(function(i){ return (i.desc||'').toLowerCase().includes(search); });
    });
  }
  list.sort(function(a,b){
    if (sort === 'margin') return (b.margin||35) - (a.margin||35);
    if (sort === 'most')   return (tlibGetUsage(b.id).count||0) - (tlibGetUsage(a.id).count||0);
    return (a.name||'').localeCompare(b.name||'');
  });
  if (!list.length) {
    listEl.innerHTML = '<div class="tlib-empty">' + (search ? 'No match for "'+escHtml(search)+'"' : 'No templates here.') + '</div>';
    return;
  }
  var showGrouped = _tmgmtActiveCat === 'all' || !!search;
  var html = '';
  if (showGrouped) {
    var grouped = {}; var groupOrder = [];
    list.forEach(function(t){
      var c = t.cat||'Custom';
      if (!grouped[c]) { grouped[c]=[]; groupOrder.push(c); }
      grouped[c].push(t);
    });
    groupOrder.forEach(function(cat){
      html += '<div class="tlib-mid-cat-label">' + escHtml(cat) + '</div>';
      grouped[cat].forEach(function(t){ html += _buildTmgmtRowHTML(t); });
    });
  } else {
    list.forEach(function(t){ html += _buildTmgmtRowHTML(t); });
  }
  listEl.innerHTML = html;
}

function _buildTmgmtRowHTML(t) {
  var isActive = _tmgmtActiveId === t.id ? ' active' : '';
  var usage    = tlibGetUsage(t.id);
  var estHrs   = (t.items||[]).reduce(function(s,i){ return s+(parseFloat(i.lh)||0)*(parseFloat(i.qty)||1); },0);
  var html = '<div class="tlib-row' + isActive + '" data-tid="' + t.id + '" onclick="_tmgmtSelectRow(this.getAttribute(\'data-tid\'))">';
  html += '<span class="tlib-row-icon">' + escHtml(t.icon||'📐') + '</span>';
  html += '<div style="flex:1;min-width:0">';
  html += '<div class="tlib-row-name">' + escHtml(t.name||'') + '</div>';
  html += '<div class="tlib-row-meta">' + (t.margin||35) + '% &nbsp;&middot;&nbsp; ' + (t.items||[]).length + ' items' + (estHrs>0?' &nbsp;&middot;&nbsp; ~'+estHrs.toFixed(1)+'h':'') + '</div>';
  html += '</div>';
  if (usage.count > 0) html += '<span class="tlib-row-badge">&times;' + usage.count + '</span>';
  html += '</div>';
  return html;
}

function _tmgmtSetCat(cat) { _tmgmtActiveCat = cat; _tmgmtActiveId = null; renderTemplates(); }
function _tmgmtSelectRow(id) { _tmgmtActiveId = id; _buildTmgmtList(); _buildTmgmtPreview(id); }

function _buildTmgmtPreview(id) {
  var el = document.getElementById('tmgmt-right');
  if (!el) return;
  if (!id) {
    el.innerHTML = '<div class="tlib-right-empty"><div class="tlib-right-empty-icon">📐</div><div>Select a template<br>to preview</div></div>';
    return;
  }
  var t = DB.templates.find(function(x){ return x.id===id; });
  if (!t) { el.innerHTML = '<div class="tlib-right-empty"><div>Not found.</div></div>'; return; }
  var items   = t.items||[];
  var usage   = tlibGetUsage(id);
  var estHrs  = items.reduce(function(s,i){ return s+(parseFloat(i.lh)||0)*(parseFloat(i.qty)||1); },0);
  var matCost = items.reduce(function(s,i){ return s+(parseFloat(i.mc)||0)*(parseFloat(i.qty)||1); },0);
  var envInfo = ENV_PRESETS[t.env]||{label:'Office'};
  var itemRows = '';
  if (items.length > 0) {
    items.forEach(function(i){
      itemRows += '<div class="tlib-item-row">';
      itemRows += '<span class="tlib-item-desc">' + escHtml(i.desc||'') + '</span>';
      itemRows += '<span class="tlib-item-detail">&times;' + (i.qty||1) + ' ' + escHtml(i.unit||'ea') + (i.mc>0?' &middot; $'+i.mc:'') + '</span>';
      itemRows += '</div>';
    });
  } else {
    itemRows = '<div style="color:#90a4ae;font-size:12px;padding:6px 0">No items.</div>';
  }
  var usageNote = usage.count > 0
    ? '<div class="tlib-usage-note">Used &times;' + usage.count + ' &middot; Last: ' + new Date(usage.lastUsed).toLocaleDateString() + '</div>'
    : '<div class="tlib-usage-note">Never used in a quote yet</div>';
  var html = '';
  html += '<div class="tlib-preview-head">';
  html += '<div class="tlib-preview-title">' + escHtml(t.icon||'📐') + ' ' + escHtml(t.name||'') + '</div>';
  html += '<div class="tlib-preview-cat">' + escHtml(t.cat||'') + ' &nbsp;&middot;&nbsp; ' + escHtml(envInfo.label) + '</div>';
  html += '</div>';
  html += '<div class="tlib-preview-stats">';
  html += '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (t.margin||35) + '%</div><div class="tlib-stat-lbl">Margin</div></div>';
  html += '<div class="tlib-stat-box"><div class="tlib-stat-val">' + items.length + '</div><div class="tlib-stat-lbl">Items</div></div>';
  html += '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (estHrs>0?'~'+estHrs.toFixed(1)+'h':'—') + '</div><div class="tlib-stat-lbl">Est. Hours</div></div>';
  html += '<div class="tlib-stat-box"><div class="tlib-stat-val">' + (matCost>0?'$'+Math.round(matCost):'—') + '</div><div class="tlib-stat-lbl">Mat. Cost</div></div>';
  html += '</div>';
  html += '<div class="tlib-preview-items"><div class="tlib-preview-item-head">Line Items</div>' + itemRows + '</div>';
  html += '<div class="tlib-preview-actions">';
  html += '<button class="tlib-btn-append" data-action="editTemplate" data-id="' + id + '">&#9998; Edit Template</button>';
  html += '<button class="tlib-btn-append-stay" data-action="tmgmtDuplicate" data-id="' + id + '">&#10697; Duplicate</button>';
  html += usageNote;
  html += '<button data-action="delTemplate" data-id="' + id + '" style="margin-top:4px;width:100%;padding:6px;border-radius:8px;border:1px solid #ffcdd2;background:#ffebee;color:#c62828;font-size:12px;cursor:pointer">&#128465; Delete</button>';
  html += '</div>';
  el.innerHTML = html;
}

function tmgmtDuplicate(id) {
  var t = DB.templates.find(function(x){ return x.id===id; });
  if (!t) return;
  var copy = JSON.parse(JSON.stringify(t));
  copy.id = Date.now().toString();
  copy.name = t.name + ' (Copy)';
  DB.templates.push(copy);
  saveDB();
  _tmgmtActiveId = copy.id;
  renderTemplates();
}

// ---- SAVE AS TEMPLATE FROM QUOTE ----
function saveAsTemplate() {
  if (lineItems.length === 0) { showToast('Add some line items first before saving as a template.','error'); return; }
  const jn  = (document.getElementById('qq-jn')||{}).value || '';
  const env = (document.getElementById('qq-env')||{}).value || 'office';
  const mkEl = document.getElementById('qq-mk'); const mk = (mkEl && mkEl.value!=='' && mkEl.value!==undefined) ? mkEl.value : '35';
  document.getElementById('sat-name').value   = jn ? jn + ' Template' : '';
  document.getElementById('sat-icon').value   = '📐';
  document.getElementById('sat-cat').value    = '';
  document.getElementById('sat-env').value    = env;
  document.getElementById('sat-margin').value = mk;
  const cats = [...new Set(DB.templates.map(function(t){ return t.cat||'Custom'; }))].sort();
  const dl   = document.getElementById('sat-cat-list');
  if (dl) dl.innerHTML = cats.map(function(c){ return '<option value="'+escHtml(c)+'">'; }).join('');
  const prev = document.getElementById('sat-preview');
  if (prev) prev.textContent = lineItems.length + ' items · Margin: ' + mk + '% · ' + (ENV_PRESETS[env]||{label:'Office'}).label;
  openModal('modal-save-template');
}

function confirmSaveAsTemplate() {
  const name = document.getElementById('sat-name').value.trim();
  if (!name) { showToast('Template name is required.','error'); return; }
  const t = {
    id:     Date.now().toString(),
    name:   name,
    icon:   document.getElementById('sat-icon').value.trim() || '📐',
    cat:    document.getElementById('sat-cat').value.trim() || 'Custom',
    env:    document.getElementById('sat-env').value || 'office',
    margin: (function(){ var v=parseFloat(document.getElementById('sat-margin').value); return isNaN(v)?35:v; })(),
    items:  lineItems.map(function(item){ return { desc:item.desc, cat:item.cat, qty:item.qty, unit:item.unit, mc:item.mc, lh:item.lh }; })
  };
  DB.templates.push(t);
  saveDB();
  closeModal('modal-save-template');
  renderTplLibrary();
  showToast('Template "'+name+'" saved in '+t.cat,'success');
}

// TEMPLATE LIBRARY — END
// =============================================


function newTemplate(){document.getElementById('tpl-modal-title').textContent='New Template';['m-tplname','m-tplicon','m-tplcat','m-tplid'].forEach(function(id){const el=document.getElementById(id);if(el)el.value='';});const mg=document.getElementById('m-tplmargin');if(mg)mg.value=35;const ev=document.getElementById('m-tplenv');if(ev)ev.value='office';renderTplItems([]);openModal('modal-template');}
function editTemplate(id){const t=DB.templates.find(function(x){return x.id==id});if(!t)return;document.getElementById('tpl-modal-title').textContent='Edit Template';function sv(eid,v){const el=document.getElementById(eid);if(el)el.value=v!==undefined?v:'';}sv('m-tplname',t.name);sv('m-tplicon',t.icon||'');sv('m-tplcat',t.cat||'');sv('m-tplmargin',t.margin!==undefined&&t.margin!==null?t.margin:35);sv('m-tplenv',t.env||'office');sv('m-tplid',t.id);renderTplItems(t.items||[]);openModal('modal-template');}
let tplItems = [];
function renderTplItems(items) {
  tplItems = items.map(function(i,idx){return Object.assign({_idx:idx},i);});
  const body = document.getElementById('tpl-items-body');
  if (!body) return;
  body.innerHTML = tplItems.map(function(item, i){
    return '<tr><td><input data-tplidx="'+i+'" data-tplf="desc" value="'+escHtml(item.desc||'')+'" placeholder="Description" style="min-width:120px"></td><td><input data-tplidx="'+i+'" data-tplf="cat" value="'+escHtml(item.cat||'')+'" style="width:80px" placeholder="Category"></td><td><input data-tplidx="'+i+'" data-tplf="qty" type="number" value="'+(item.qty||1)+'" style="width:50px"></td><td><input data-tplidx="'+i+'" data-tplf="unit" value="'+escHtml(item.unit||'ea')+'" style="width:45px"></td><td><input data-tplidx="'+i+'" data-tplf="mc" type="number" value="'+(item.mc||0)+'" style="width:70px"></td><td><input data-tplidx="'+i+'" data-tplf="lh" type="number" value="'+(item.lh||0)+'" style="width:60px"></td><td><button class="btn btn-danger btn-sm" data-action="delTplRow" data-id="'+i+'">×</button></td></tr>';
  }).join('');
}
function addTplRow(){tplItems.push({_idx:tplItems.length,desc:'',cat:'',qty:1,unit:'ea',mc:0,lh:0});renderTplItems(tplItems);}
function delTplRow(idx){tplItems.splice(parseInt(idx),1);renderTplItems(tplItems);}
function saveTemplate(){
  const id=document.getElementById('m-tplid').value;
  const name=document.getElementById('m-tplname').value;
  if(!name.trim()){showToast('Template name required.','error'); return;}
  const body=document.getElementById('tpl-items-body');
  const rows=body?body.querySelectorAll('tr'):[];
  const items=Array.from(rows).map(function(row){
    function gv(f){const el=row.querySelector('[data-tplf="'+f+'"]');return el?el.value:'';}
    return {desc:gv('desc'),cat:gv('cat'),qty:parseFloat(gv('qty'))||1,unit:gv('unit')||'ea',mc:parseFloat(gv('mc'))||0,lh:parseFloat(gv('lh'))||0};
  });
  const data={id:id||Date.now().toString(),name,icon:document.getElementById('m-tplicon').value||'📐',cat:document.getElementById('m-tplcat').value||'Custom',margin:(function(){ var v=parseFloat(document.getElementById('m-tplmargin').value); return isNaN(v)?35:v; })(),env:document.getElementById('m-tplenv').value||'office',items};
  if(id){const idx=DB.templates.findIndex(function(t){return t.id==id});if(idx>=0)DB.templates[idx]=data;else DB.templates.push(data);}else DB.templates.push(data);
  saveDB();closeModal('modal-template');renderTemplates();renderTplLibrary();
}
function delTemplate(id){
  if(!confirm('Delete this template?'))return;
  DB.templates=DB.templates.filter(function(t){return t.id!=id});
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.templates)DB.deletedIds.templates=[];
  if(DB.deletedIds.templates.indexOf(id)<0)DB.deletedIds.templates.push(id);
  if(_tmgmtActiveId===id)_tmgmtActiveId=null;
  saveDB();
  if(_sb&&_currentUser){ _sb.from('templates').update({is_active:false}).eq('id',id).then(function(r){ if(r&&r.error)console.warn('[Delete] template:',r.error.message); if(typeof pushAllToCloud==='function')setTimeout(pushAllToCloud,300); }); }
  renderTemplates();renderTplLibrary();
}

// ---- REPORTS ----
// =============================================
// V7 PHASE 3: REPORTS & ANALYTICS ENGINE
// =============================================

let _rptActiveTab = 'overview';
let _rptDateFilter = 'all';

function switchRptTab(tab) {
  _rptActiveTab = tab;
  document.querySelectorAll('.rpt-tab').forEach(function(b,i){
    const tabs = ['overview','pipeline','margins','jobs','techs','tools','payroll'];
    b.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.rpt-section').forEach(function(s){
    s.classList.toggle('active', s.id === 'rpt-' + tab);
  });
  renderReports();
}

function getFilteredQuotes() {
  const days = parseInt((document.getElementById('rpt-date-filter')||{}).value) || 0;
  if (!days) return DB.quotes.slice();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutStr = cutoff.toISOString().split('T')[0];
  return DB.quotes.filter(function(q){ return (q.dt||'') >= cutStr; });
}

function makeBar(label, value, maxVal, color, suffix) {
  suffix = suffix || '';
  const pctW = maxVal > 0 ? Math.max(4, Math.round(value/maxVal*100)) : 0;
  return '<div class="bar-row">' +
    '<div class="bar-label" title="'+escHtml(label)+'">'+escHtml(label)+'</div>' +
    '<div class="bar-outer"><div class="bar-inner" style="width:'+pctW+'%;background:'+color+'"></div></div>' +
    '<div class="bar-val">'+suffix+'</div>' +
  '</div>';
}

function renderReports() {
  _rptDateFilter = (document.getElementById('rpt-date-filter')||{}).value || 'all';
  const quotes = getFilteredQuotes();
  const tab    = _rptActiveTab;

  function setT(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
  const hc = function(q){ return q.pricingHealth==='Healthy'?'#2e7d32':q.pricingHealth==='Watch'?'#e65100':'#c62828'; };
  const empty = function(cols,msg){ return '<tr><td colspan="'+cols+'" class="empty-state"><p>'+(msg||'No data yet.')+'</p></td></tr>'; };

  // ---- OVERVIEW TAB ----
  if (tab === 'overview') {
    const total     = quotes.length;
    const wonQ      = quotes.filter(function(q){ return q.status==='approved'; });
    const revQ      = quotes.reduce(function(s,q){ return s+(q.total||0); },0);
    const revWon    = wonQ.reduce(function(s,q){ return s+(q.total||0); },0);
    const winRate   = total>0 ? wonQ.length/total*100 : 0;
    const avgMargin = wonQ.length>0 ? wonQ.reduce(function(s,q){ return s+(q.achievedMargin||0); },0)/wonQ.length : 0;
    const avgDeal   = wonQ.length>0 ? revWon/wonQ.length : 0;

    setT('ko-quotes', total);
    setT('ko-rev-quoted', '$'+Math.round(revQ).toLocaleString());
    setT('ko-rev-won', '$'+Math.round(revWon).toLocaleString());
    setT('ko-winrate', pct(winRate));
    setT('ko-winrate-sub', wonQ.length+' won of '+total);
    setT('ko-avgmargin', pct(avgMargin));
    setT('ko-avgdeal', '$'+Math.round(avgDeal).toLocaleString());

    // Revenue trend by month (last 12)
    const monthBuckets = {};
    quotes.forEach(function(q){
      if (!q.dt) return;
      const m = q.dt.substring(0,7);
      if (!monthBuckets[m]) monthBuckets[m] = {quoted:0,won:0};
      monthBuckets[m].quoted += q.total||0;
      if (q.status==='approved') monthBuckets[m].won += q.total||0;
    });
    const months  = Object.keys(monthBuckets).sort().slice(-12);
    const maxRev  = Math.max.apply(null, months.map(function(m){ return monthBuckets[m].quoted; }).concat([1]));
    const trendEl = document.getElementById('ko-trend');
    const lblEl   = document.getElementById('ko-trend-labels');
    if (trendEl) {
      trendEl.innerHTML = months.map(function(m){
        const v   = monthBuckets[m].quoted;
        const h   = Math.max(4, Math.round(v/maxRev*76));
        const lbl = m.substring(5)+'/'+m.substring(2,4);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0">' +
          '<div style="width:100%;background:#1565c0;border-radius:3px 3px 0 0;height:'+h+'px;cursor:default;position:relative" title="'+lbl+': $'+Math.round(v).toLocaleString()+'"></div>' +
        '</div>';
      }).join('') || '<div style="color:#90a4ae;font-size:12px;padding:20px">No dated quotes yet.</div>';
      if (lblEl) lblEl.innerHTML = months.map(function(m){ return '<div style="flex:1;text-align:center">'+m.substring(5)+'</div>'; }).join('');
    }

    // Top customers — group by customerId if available, else by name
    const custRev = {};
    const custNames = {};
    quotes.forEach(function(q){
      var key = q.customerId || q.cn || '';
      if (!key) return;
      custRev[key]  = (custRev[key]||0)+(q.total||0);
      // Store display name — prefer customer record name, fall back to q.cn
      if (!custNames[key]) {
        var cust = q.customerId ? (DB.customers||[]).find(function(c){ return c.id===q.customerId; }) : null;
        custNames[key] = cust ? cust.name : (q.cn||key);
      }
    });
    const topCust = Object.keys(custRev).sort(function(a,b){ return custRev[b]-custRev[a]; }).slice(0,6);
    const maxCR   = topCust.length>0 ? custRev[topCust[0]] : 1;
    const tcEl    = document.getElementById('ko-top-customers');
    if (tcEl) tcEl.innerHTML = topCust.length>0 ? topCust.map(function(k){
      return makeBar(escHtml(custNames[k]||k), custRev[k], maxCR, '#1565c0', '$'+Math.round(custRev[k]/1000)+'k');
    }).join('') : '<div style="color:#90a4ae;font-size:12px">No data yet.</div>';

    // All quotes table
    const rptTbl = document.getElementById('rpt-tbl');
    const cntEl  = document.getElementById('rpt-quote-count');
    if (cntEl) cntEl.textContent = total + ' quote'+(total!==1?'s':'');
    if (rptTbl) rptTbl.innerHTML = quotes.length>0 ? quotes.map(function(q){
      const envL = q.envLabel||(ENV_PRESETS[q.env]?ENV_PRESETS[q.env].label:(q.env||''));
      return '<tr><td style="color:#1565c0;font-weight:700;font-size:12px">'+escHtml(q.num||'')+'</td>' +
        '<td style="font-size:12px">'+escHtml(q.cn||'')+'</td>' +
        '<td style="font-size:12px">'+escHtml(q.jn||'')+'</td>' +
        '<td style="font-size:11px">'+escHtml(envL)+'</td>' +
        '<td style="font-weight:700">'+fmt(q.total||0)+'</td>' +
        '<td style="font-weight:700;color:'+hc(q)+'">'+pct(q.achievedMargin||0)+'</td>' +
        '<td><span style="font-size:10px;font-weight:700;color:'+hc(q)+'">'+escHtml(q.pricingHealth||'—')+'</span></td>' +
        '<td><span class="status-badge s-'+(q.status||'draft')+'" style="font-size:10px">'+(q.status||'draft')+'</span></td>' +
        '<td style="color:#90a4ae;font-size:11px">'+(q.dt||'')+'</td></tr>';
    }).join('') : empty(9);
  }

  // ---- PIPELINE TAB ----
  if (tab === 'pipeline') {
    const today = new Date().toISOString().split('T')[0];
    const pipe  = {draft:0,sent:0,followup:0,approved:0,declined:0};
    const pipeRev = {draft:0,sent:0,followup:0,approved:0,declined:0};
    let overdue = 0;
    quotes.forEach(function(q){
      const s = q.status||'draft';
      pipe[s]=(pipe[s]||0)+1;
      pipeRev[s]=(pipeRev[s]||0)+(q.total||0);
      if (isFollowupDue(q) && isFollowupOverdue(q)) overdue++;
    });
    setT('kp-draft',pipe.draft||0); setT('kp-sent',pipe.sent||0);
    setT('kp-followup',pipe.followup||0); setT('kp-won',pipe.approved||0);
    setT('kp-lost',pipe.declined||0); setT('kp-overdue',overdue);

    const maxPR = Math.max.apply(null, Object.values(pipeRev).concat([1]));
    const PCOLS = {'draft':'#607d8b','sent':'#1565c0','followup':'#6a1b9a','approved':'#2e7d32','declined':'#c62828'};
    const PLBLS = {'draft':'Draft','sent':'Sent','followup':'Follow-Up','approved':'Won','declined':'Lost'};
    const revEl = document.getElementById('kp-rev-by-stage');
    if (revEl) revEl.innerHTML = Object.keys(PLBLS).map(function(k){
      return makeBar(PLBLS[k], pipeRev[k]||0, maxPR, PCOLS[k], '$'+Math.round((pipeRev[k]||0)/1000)+'k');
    }).join('');

    // Overdue follow-ups table
    const overdueQ = quotes.filter(function(q){ return isFollowupDue(q) && isFollowupOverdue(q); });
    const odTbl = document.getElementById('kp-overdue-tbl');
    if (odTbl) odTbl.innerHTML = overdueQ.length>0 ? overdueQ.map(function(q){
      const daysOD = Math.floor((new Date(today)-new Date(q.followupDate||today))/(86400000));
      return '<tr><td style="color:#1565c0;font-weight:700;font-size:12px">'+escHtml(q.num||'')+'</td>' +
        '<td>'+escHtml(q.cn||'')+'</td><td>'+escHtml(q.jn||'')+'</td><td>'+fmt(q.total||0)+'</td>' +
        '<td style="color:#c62828">'+escHtml(q.followupDate||'')+'</td>' +
        '<td style="font-weight:700;color:#c62828">'+daysOD+' days</td>' +
        '<td><button class="btn btn-outline btn-sm" data-action="editQuote" data-id="'+q.id+'">Edit</button></td></tr>';
    }).join('') : empty(7,'No overdue follow-ups — great work!');

    // Days to close
    const daysCloseEl = document.getElementById('kp-days-close');
    if (daysCloseEl) {
      const wonWithDates = quotes.filter(function(q){ return q.status==='approved' && q.dt && q.wonDate; });
      if (wonWithDates.length > 0) {
        const totalDays = wonWithDates.reduce(function(s,q){ return s+Math.max(0,Math.floor((new Date(q.wonDate)-new Date(q.dt))/(86400000))); },0);
        const avg = (totalDays/wonWithDates.length).toFixed(1);
        daysCloseEl.innerHTML = '<div style="font-size:32px;font-weight:900;color:#2e7d32">'+avg+'</div><div style="font-size:12px;color:#607d8b">average days from quote to close (based on '+wonWithDates.length+' won quotes)</div>';
      } else {
        daysCloseEl.innerHTML = '<div style="color:#90a4ae;font-size:13px">Not enough data yet — need won quotes with dates.</div>';
      }
    }
  }

  // ---- MARGINS TAB ----
  if (tab === 'margins') {
    const allM = quotes.filter(function(q){ return q.achievedMargin>0; });
    const wonM = quotes.filter(function(q){ return q.status==='approved' && q.achievedMargin>0; });
    const avgAll = allM.length>0 ? allM.reduce(function(s,q){ return s+(q.achievedMargin||0); },0)/allM.length : 0;
    const avgWon = wonM.length>0 ? wonM.reduce(function(s,q){ return s+(q.achievedMargin||0); },0)/wonM.length : 0;
    const belowFloor = quotes.filter(function(q){ return q.belowMarginFloor; }).length;
    const lowHealth  = quotes.filter(function(q){ return q.pricingHealth==='Low'; }).length;

    setT('km-avg-all', pct(avgAll)); setT('km-avg-won', pct(avgWon));
    setT('km-below-floor', belowFloor); setT('km-low-health', lowHealth);

    // Margin by environment
    const envMap = {}; const jtMap = {};
    quotes.forEach(function(q){
      if (!q.achievedMargin) return;
      const e = q.envLabel||(ENV_PRESETS[q.env]?ENV_PRESETS[q.env].label:(q.env||'Unknown'));
      if (!envMap[e]) envMap[e]={sum:0,n:0};
      envMap[e].sum+=q.achievedMargin; envMap[e].n++;
      const j = q.jt||'Unknown';
      if (!jtMap[j]) jtMap[j]={sum:0,n:0};
      jtMap[j].sum+=q.achievedMargin; jtMap[j].n++;
    });

    function buildMarginBars(map, elId) {
      const el = document.getElementById(elId);
      if (!el) return;
      const entries = Object.keys(map).map(function(k){ return {k:k,avg:map[k].sum/map[k].n,n:map[k].n}; }).sort(function(a,b){ return b.avg-a.avg; });
      if (!entries.length) { el.innerHTML='<div style="color:#90a4ae;font-size:12px">No data yet.</div>'; return; }
      const max = Math.max.apply(null, entries.map(function(e){ return e.avg; }).concat([50]));
      el.innerHTML = entries.map(function(e){
        const color = e.avg>=35?'#2e7d32':e.avg>=25?'#e65100':'#c62828';
        return makeBar(e.k+' ('+e.n+')', e.avg, max, color, pct(e.avg));
      }).join('');
    }
    buildMarginBars(envMap, 'km-by-env');
    buildMarginBars(jtMap,  'km-by-jt');

    // Margin distribution histogram (buckets: <20, 20-25, 25-30, 30-35, 35-40, 40-45, 45-50, 50+)
    const buckets = [0,0,0,0,0,0,0,0];
    const bLabels = ['<20%','20-25','25-30','30-35','35-40','40-45','45-50','50%+'];
    allM.forEach(function(q){
      const m = q.achievedMargin||0;
      const i = m<20?0:m<25?1:m<30?2:m<35?3:m<40?4:m<45?5:m<50?6:7;
      buckets[i]++;
    });
    const maxB = Math.max.apply(null,buckets.concat([1]));
    const distEl = document.getElementById('km-distribution');
    const distLbl = document.getElementById('km-dist-labels');
    if (distEl) distEl.innerHTML = buckets.map(function(v,i){
      const h = Math.max(2,Math.round(v/maxB*76));
      const color = i<2?'#c62828':i<3?'#e65100':i<4?'#f57f17':'#2e7d32';
      return '<div style="flex:1;background:'+color+';border-radius:3px 3px 0 0;height:'+h+'px;cursor:default" title="'+bLabels[i]+': '+v+' quotes"></div>';
    }).join('');
    if (distLbl) distLbl.innerHTML = bLabels.map(function(l){ return '<div style="flex:1;text-align:center">'+l+'</div>'; }).join('');

    // Below floor quotes
    const bfTbl = document.getElementById('km-below-tbl');
    const bfQ   = quotes.filter(function(q){ return q.belowMarginFloor; });
    if (bfTbl) bfTbl.innerHTML = bfQ.length>0 ? bfQ.map(function(q){
      const gap = (q.marginFloor||35) - (q.achievedMargin||0);
      return '<tr><td style="color:#1565c0;font-weight:700;font-size:12px">'+escHtml(q.num||'')+'</td>' +
        '<td>'+escHtml(q.cn||'')+'</td><td>'+escHtml(q.jn||'')+'</td>' +
        '<td>'+pct(q.targetMargin||35)+'</td>' +
        '<td style="font-weight:700;color:#c62828">'+pct(q.achievedMargin||0)+'</td>' +
        '<td>'+pct(q.marginFloor||35)+'</td>' +
        '<td style="font-weight:700;color:#c62828">-'+pct(gap)+'</td>' +
        '<td><span class="status-badge s-'+(q.status||'draft')+'" style="font-size:10px">'+(q.status||'draft')+'</span></td></tr>';
    }).join('') : empty(8,'No below-floor quotes — margins are solid!');
  }

  // ---- JOB PERFORMANCE TAB ----
  if (tab === 'jobs') {
    const jobs   = typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[]);
    const today  = getTodayISO();
    const total  = jobs.length;
    const done   = jobs.filter(function(j){ return j.status==='Complete'||j.status==='Closed'; }).length;
    const active = jobs.filter(function(j){ return j.status==='Scheduled'||j.status==='In Progress'; }).length;
    const withHrs= jobs.filter(function(j){ return j.actualLaborHours>0 && j.estLaborHours>0; });
    const overHrs= withHrs.filter(function(j){ return j.actualLaborHours > j.estLaborHours*1.1; }).length;
    const avgVar = withHrs.length>0 ? withHrs.reduce(function(s,j){ return s+Math.abs((j.actualLaborHours-j.estLaborHours)/j.estLaborHours*100); },0)/withHrs.length : 0;

    setT('kj-total',total); setT('kj-complete',done); setT('kj-active',active);
    setT('kj-over',overHrs); setT('kj-avg-variance', pct(avgVar));

    const kjTbl = document.getElementById('kj-tbl');
    if (kjTbl) kjTbl.innerHTML = jobs.length>0 ? jobs.map(function(j){
      const est  = parseFloat(j.estLaborHours)||0;
      const act  = parseFloat(j.actualLaborHours)||0;
      // Try to get actual hours from workDays
      var actualFromWD = (DB.workDays||[]).filter(function(d){
        return d.jobId===j.id || (d.jobName&&d.jobName===j.name);
      }).reduce(function(s,d){ return s+(d.totalPaidMins||0)/60; }, 0);
      var displayAct = actualFromWD>0 ? actualFromWD : act;
      var laborRate = (DB.settings&&DB.settings.laborRate)||100;

      let varHTML='—';
      if (displayAct>0 && est>0) {
        const v   = ((displayAct-est)/est*100).toFixed(1);
        const cls = displayAct>est*1.05?'perf-over':displayAct<est*0.95?'perf-good':'perf-watch';
        const lbl = displayAct>est*1.05?'▲ Over':'▼ Under';
        varHTML   = '<span class="perf-badge '+cls+'">'+lbl+' '+Math.abs(v)+'%</span>';
      }
      // WT progress
      var wtProj = (DB.wtProjects||[]).find(function(p){ return p.jobId===j.id||(p.customer||'').toLowerCase()===(j.customer||'').toLowerCase(); });
      var wtPct  = null;
      if (wtProj) {
        var items=(DB.wtItems||[]).filter(function(i){return i.projectId===wtProj.id;});
        var wdone=items.filter(function(i){return i.status==='done';}).length;
        wtPct = items.length?Math.round(wdone/items.length*100):0;
      }
      var estCost = est * laborRate;
      var actCost = displayAct * laborRate;
      var costVar = estCost>0 ? ((actCost-estCost)/estCost*100).toFixed(0) : null;

      const sc = j.status==='Scheduled'?'s-pending':j.status==='In Progress'?'s-inprogress':j.status==='Complete'?'s-approved':'s-draft';
      return '<tr>'+
        '<td style="font-weight:700;font-size:12px">'+escHtml(j.name||'')+'</td>'+
        '<td style="font-size:12px">'+escHtml(j.customer||'')+'</td>'+
        '<td>'+est.toFixed(1)+'</td>'+
        '<td>'+(displayAct>0?displayAct.toFixed(1):'—')+'</td>'+
        '<td>'+varHTML+'</td>'+
        '<td>'+fmt(estCost)+'</td>'+
        '<td>'+(costVar!==null?'<span style="color:'+(parseFloat(costVar)>10?'#c62828':parseFloat(costVar)<-5?'#2e7d32':'#e65100')+'">'+( parseFloat(costVar)>0?'+':'')+costVar+'%</span>':'—')+'</td>'+
        '<td>'+(wtPct!==null?'<div class="wt-progress-bar" style="width:80px;height:6px;display:inline-block;vertical-align:middle"><div class="wt-progress-fill" style="width:'+wtPct+'%;height:6px"></div></div> '+wtPct+'%':'—')+'</td>'+
        '<td><span class="status-badge '+sc+'" style="font-size:10px">'+escHtml(j.status||'')+'</span></td>'+
      '</tr>';
    }).join('') : empty(9,'No jobs yet. Convert a won quote to create your first job.');

    // Update table header to match new columns
    var kjHead = document.querySelector('#kj-tbl')&&document.querySelector('#kj-tbl').closest('table')&&document.querySelector('#kj-tbl').closest('table').querySelector('thead tr');
    if (kjHead) kjHead.innerHTML = '<th>Job</th><th>Customer</th><th>Est Hrs</th><th>Actual Hrs</th><th>Hrs Var</th><th>Est Cost</th><th>Cost Var</th><th>WT %</th><th>Status</th>';
  }

  // ---- TECHNICIAN PERFORMANCE TAB ----
  if (tab === 'techs') {
    setT('kt-count', DB.team.length);

    // Pull hours from workDays (actual clock data)
    const techMap = {};
    (DB.workDays||[]).forEach(function(d){
      if (!d.techName||!d.totalPaidMins) return;
      const name = d.techName;
      if (!techMap[name]) techMap[name]={regMins:0,otMins:0,jobs:new Set(),checkoffs:0,reworks:0};
      techMap[name].regMins += d.regularMins||d.totalPaidMins||0;
      techMap[name].otMins  += d.otMins||0;
      if (d.jobName) techMap[name].jobs.add(d.jobName);
    });
    // Add check-off data from WT
    (DB.wtCheckoffs||[]).forEach(function(c){
      if (!c.techName) return;
      if (!techMap[c.techName]) techMap[c.techName]={regMins:0,otMins:0,jobs:new Set(),checkoffs:0,reworks:0};
      techMap[c.techName].checkoffs++;
    });
    // Add rework attribution
    (DB.wtReworks||[]).forEach(function(r){
      if (!r.origTech||r.fault!=='original') return;
      if (!techMap[r.origTech]) techMap[r.origTech]={regMins:0,otMins:0,jobs:new Set(),checkoffs:0,reworks:0};
      techMap[r.origTech].reworks++;
    });
    // Fall back to job assignments if no time tracking data
    jobs.forEach(function(j){
      if (!j.assignedTo) return;
      const name = j.assignedTo.trim();
      if (!techMap[name]) techMap[name]={regMins:0,otMins:0,jobs:new Set(),checkoffs:0,reworks:0};
      techMap[name].jobs.add(j.name||j.id);
    });

    const techEntries = Object.keys(techMap);
    const totalDone = jobs.filter(function(j){ return j.status==='Complete'||j.status==='Closed'; }).length;
    const avgHrsJ   = techEntries.length>0 ? (Object.values(techMap).reduce(function(s,t){ return s+(t.regMins+t.otMins)/60; },0)/Math.max(1,techEntries.length)).toFixed(1) : 0;
    setT('kt-jobs-done', totalDone); setT('kt-avg-hrs', avgHrsJ);

    const laborRate = (DB.settings&&DB.settings.laborRate)||100;
    const ktTbl = document.getElementById('kt-tbl');
    if (ktTbl) {
      if (!techEntries.length) { ktTbl.innerHTML = empty(8,'No technician data yet. Time tracking data appears here automatically.'); return; }
      // Update header
      var ktHead = ktTbl.closest('table')&&ktTbl.closest('table').querySelector('thead tr');
      if (ktHead) ktHead.innerHTML = '<th>Name</th><th>Role</th><th>Reg Hrs</th><th>OT Hrs</th><th>Check-offs</th><th>Reworks</th><th>Est Cost</th><th>Rating</th>';

      ktTbl.innerHTML = techEntries.sort(function(a,b){
        return (techMap[b].regMins+techMap[b].otMins)-(techMap[a].regMins+techMap[a].otMins);
      }).map(function(name){
        const t        = techMap[name];
        const regHrs   = (t.regMins/60).toFixed(1);
        const otHrs    = (t.otMins/60).toFixed(1);
        const estCost  = fmt((t.regMins/60)*laborRate + (t.otMins/60)*laborRate*1.5);
        const reworkRate = t.checkoffs>0 ? Math.round(t.reworks/t.checkoffs*100) : 0;
        const rating   = reworkRate>15 ? '<span class="perf-badge perf-over">High Rework</span>' :
                         reworkRate>5  ? '<span class="perf-badge perf-watch">Watch</span>' :
                         t.checkoffs>0 ? '<span class="perf-badge perf-good">Good</span>' : '—';
        const teamMember = DB.team.find(function(tm){ return tm.name===name; });
        const role = teamMember ? escHtml(teamMember.role||'Tech') : '—';
        return '<tr>'+
          '<td style="font-weight:700">'+escHtml(name)+'</td>'+
          '<td style="font-size:11px;color:#607d8b">'+role+'</td>'+
          '<td>'+regHrs+'</td>'+
          '<td style="color:'+(parseFloat(otHrs)>0?'#e65100':'inherit')+'">'+otHrs+'</td>'+
          '<td>'+t.checkoffs+'</td>'+
          '<td style="color:'+(t.reworks>0?'#c62828':'inherit')+'">'+t.reworks+'</td>'+
          '<td>'+estCost+'</td>'+
          '<td>'+rating+'</td>'+
        '</tr>';
      }).join('');
    }
  }

  // ---- TOOL UTILIZATION TAB ----
  if (tab === 'tools') {
    const tools    = DB.tools||[];
    const checkouts= DB.toolCheckouts||[];
    const today    = getTodayISO();
    const active   = checkouts.filter(function(c){ return !c.returnedAt&&c.status!=='verified'; });
    const overdue  = active.filter(function(c){ return c.expectedReturn&&c.expectedReturn<today; });

    // Utilization = tools currently out / total tools
    const utilRate = tools.length>0 ? Math.round(active.length/tools.length*100) : 0;
    setT('rtl-total', tools.length);
    setT('rtl-out', active.length);
    setT('rtl-overdue', overdue.length);
    setT('rtl-checkouts', checkouts.length);
    setT('rtl-utilization', utilRate+'%');

    // Most used tools by checkout count
    const toolUsage = {};
    checkouts.forEach(function(c){
      if (!c.toolId) return;
      toolUsage[c.toolId] = (toolUsage[c.toolId]||0)+1;
    });
    const muEl = document.getElementById('rtl-most-used');
    if (muEl) {
      const sorted = Object.keys(toolUsage).sort(function(a,b){ return toolUsage[b]-toolUsage[a]; }).slice(0,8);
      const maxU = sorted.length ? toolUsage[sorted[0]] : 1;
      muEl.innerHTML = sorted.length ? sorted.map(function(tid){
        const t = tools.find(function(x){ return x.id===tid; });
        const name = t ? t.name : tid;
        return makeBar(escHtml(name), toolUsage[tid], maxU, '#1565c0', toolUsage[tid]+' uses');
      }).join('') : '<div style="color:#90a4ae;font-size:12px">No checkout history yet.</div>';
    }

    // Checkouts by tech
    const techUsage = {};
    checkouts.forEach(function(c){
      if (!c.toName) return;
      techUsage[c.toName] = (techUsage[c.toName]||0)+1;
    });
    const btEl = document.getElementById('rtl-by-tech');
    if (btEl) {
      const sorted2 = Object.keys(techUsage).sort(function(a,b){ return techUsage[b]-techUsage[a]; }).slice(0,8);
      const maxT = sorted2.length ? techUsage[sorted2[0]] : 1;
      btEl.innerHTML = sorted2.length ? sorted2.map(function(name){
        return makeBar(escHtml(name), techUsage[name], maxT, '#2e7d32', techUsage[name]+' checkouts');
      }).join('') : '<div style="color:#90a4ae;font-size:12px">No data yet.</div>';
    }

    // Overdue table
    const odEl = document.getElementById('rtl-overdue-tbl');
    if (odEl) odEl.innerHTML = overdue.length ? overdue.map(function(c){
      const t = tools.find(function(x){ return x.id===c.toolId; });
      const days = c.expectedReturn ? Math.floor((new Date(today)-new Date(c.expectedReturn))/86400000) : '?';
      return '<tr>'+
        '<td style="font-weight:700">'+escHtml((t&&t.name)||'Unknown')+'</td>'+
        '<td>'+escHtml(c.toName||'')+'</td>'+
        '<td style="font-size:11px">'+escHtml(c.checkoutDate||'')+'</td>'+
        '<td style="color:#c62828;font-weight:700">'+escHtml(c.expectedReturn||'—')+'</td>'+
        '<td style="font-weight:700;color:#c62828">'+days+' days</td>'+
      '</tr>';
    }).join('') : empty(5,'No overdue returns — all tools accounted for!');

    // History table (last 20)
    const histEl = document.getElementById('rtl-history-tbl');
    if (histEl) {
      const hist = checkouts.slice().sort(function(a,b){ return (b.checkoutDate||'').localeCompare(a.checkoutDate||''); }).slice(0,20);
      histEl.innerHTML = hist.length ? hist.map(function(c){
        const t = tools.find(function(x){ return x.id===c.toolId; });
        const dur = c.checkoutDate&&c.returnedAt ?
          Math.round((new Date(c.returnedAt)-new Date(c.checkoutDate))/86400000)+' days' : c.returnedAt?'Same day':'—';
        return '<tr>'+
          '<td style="font-weight:700;font-size:12px">'+escHtml((t&&t.name)||'Unknown')+'</td>'+
          '<td>'+escHtml(c.toName||'')+'</td>'+
          '<td style="font-size:11px">'+escHtml(c.checkoutDate||'')+'</td>'+
          '<td style="font-size:11px">'+escHtml(c.returnedAt||'—')+'</td>'+
          '<td>'+dur+'</td>'+
          '<td style="font-size:11px">'+escHtml(c.jobName||'—')+'</td>'+
        '</tr>';
      }).join('') : empty(6,'No checkout history yet.');
    }
  }

  // ---- PAYROLL SUMMARY TAB ----
  if (tab === 'payroll') {
    var period = (document.getElementById('rpr-period-filter')||{}).value || 'current';
    var today2 = getTodayISO();

    // Determine date range
    function getPayPeriodBounds(offsetPeriods) {
      var anchor = new Date('2025-01-06');
      var now    = new Date();
      var msIn2Weeks = 14*24*60*60*1000;
      var periodsElapsed = Math.floor((now-anchor)/msIn2Weeks);
      var start = new Date(anchor.getTime()+(periodsElapsed-offsetPeriods)*msIn2Weeks);
      var end   = new Date(start.getTime()+msIn2Weeks-1);
      return {
        start: start.toISOString().split('T')[0],
        end:   end.toISOString().split('T')[0]
      };
    }
    var bounds = null;
    if (period==='current')  bounds = getPayPeriodBounds(0);
    else if (period==='last') bounds = getPayPeriodBounds(1);
    else if (period==='month') {
      var now2 = new Date();
      bounds = { start: now2.getFullYear()+'-'+(String(now2.getMonth()+1).padStart(2,'0'))+'-01', end: today2 };
    }

    // Filter workDays
    var days = (DB.workDays||[]).filter(function(d){
      if (!d.totalPaidMins) return false;
      if (bounds && d.date < bounds.start) return false;
      if (bounds && d.date > bounds.end) return false;
      return true;
    });

    // Aggregate totals
    var totalReg=0, totalOT=0;
    days.forEach(function(d){
      totalReg += d.regularMins||d.totalPaidMins||0;
      totalOT  += d.otMins||0;
    });
    var laborRate2 = (DB.settings&&DB.settings.laborRate)||100;
    var estCost = (totalReg/60)*laborRate2 + (totalOT/60)*laborRate2*1.5;
    setT('rpr-total-hrs', ((totalReg+totalOT)/60).toFixed(1));
    setT('rpr-reg-hrs',   (totalReg/60).toFixed(1));
    setT('rpr-ot-hrs',    (totalOT/60).toFixed(1));
    setT('rpr-labor-cost', fmt(estCost));

    // Per-tech summary
    var techPayMap = {};
    days.forEach(function(d){
      var n = d.techName||'Unknown';
      if (!techPayMap[n]) techPayMap[n]={reg:0,ot:0,days:0,flags:0,pto:0};
      techPayMap[n].reg  += d.regularMins||d.totalPaidMins||0;
      techPayMap[n].ot   += d.otMins||0;
      techPayMap[n].days++;
      if (d.flag) techPayMap[n].flags++;
    });
    // Add leave hours from timeOffRequests
    (DB.timeOffRequests||[]).filter(function(r){ return r.status==='approved'; }).forEach(function(r){
      if (bounds && r.startDate < bounds.start) return;
      if (bounds && r.startDate > bounds.end) return;
      var n = r.techName||'';
      if (!techPayMap[n]) techPayMap[n]={reg:0,ot:0,days:0,flags:0,pto:0};
      techPayMap[n].pto += (r.hours||8);
    });

    var rprTbl = document.getElementById('rpr-tech-tbl');
    if (rprTbl) {
      var entries = Object.keys(techPayMap);
      rprTbl.innerHTML = entries.length ? entries.sort(function(a,b){
        return (techPayMap[b].reg+techPayMap[b].ot)-(techPayMap[a].reg+techPayMap[a].ot);
      }).map(function(name){
        var t    = techPayMap[name];
        var regH = (t.reg/60).toFixed(1);
        var otH  = (t.ot/60).toFixed(1);
        var cost = fmt((t.reg/60)*laborRate2 + (t.ot/60)*laborRate2*1.5);
        var flagBadge = t.flags>0 ? '<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">'+t.flags+' flagged</span>' : '✓';
        return '<tr>'+
          '<td style="font-weight:700">'+escHtml(name)+'</td>'+
          '<td>'+regH+'</td>'+
          '<td style="color:'+(parseFloat(otH)>0?'#e65100':'inherit')+'">'+otH+'</td>'+
          '<td style="font-weight:700">'+(  (parseFloat(regH)+parseFloat(otH)).toFixed(1))+'</td>'+
          '<td style="color:#6a1b9a">'+( t.pto>0?t.pto+' hrs':'—')+'</td>'+
          '<td style="font-weight:700;color:#2e7d32">'+cost+'</td>'+
          '<td>'+flagBadge+'</td>'+
        '</tr>';
      }).join('') : empty(7,'No time tracking data for this period.');
    }

    // Daily detail (last 30 rows)
    var dailyTbl = document.getElementById('rpr-daily-tbl');
    if (dailyTbl) {
      var sorted3 = days.slice().sort(function(a,b){ return b.date.localeCompare(a.date); }).slice(0,30);
      dailyTbl.innerHTML = sorted3.length ? sorted3.map(function(d){
        var reg = ((d.regularMins||d.totalPaidMins||0)/60).toFixed(2);
        var ot  = ((d.otMins||0)/60).toFixed(2);
        var flagEl = d.flag ? '<span style="color:#e65100;font-size:10px;font-weight:700">⚠ '+escHtml(d.flagReason||'flagged')+'</span>' : '';
        return '<tr>'+
          '<td style="font-size:11px">'+escHtml(d.date||'')+'</td>'+
          '<td style="font-weight:700">'+escHtml(d.techName||'')+'</td>'+
          '<td style="font-size:11px">'+escHtml(d.clockInTime||'')+'</td>'+
          '<td style="font-size:11px">'+escHtml(d.clockOutTime||'—')+'</td>'+
          '<td>'+reg+'</td>'+
          '<td style="color:'+(parseFloat(ot)>0?'#e65100':'inherit')+'">'+ot+'</td>'+
          '<td style="font-size:11px">'+escHtml(d.jobName||'—')+'</td>'+
          '<td>'+flagEl+'</td>'+
        '</tr>';
      }).join('') : empty(8,'No daily records for this period.');
    }
  }
}

function exportPayrollCSV() {
  var days = (DB.workDays||[]).filter(function(d){ return d.totalPaidMins; });
  var laborRate = (DB.settings&&DB.settings.laborRate)||100;
  var rows = [['Date','Tech Name','Clock In','Clock Out','Regular Hrs','OT Hrs','Total Hrs','Est Cost','Job','Flagged']];
  days.sort(function(a,b){ return b.date.localeCompare(a.date); }).forEach(function(d){
    var reg = ((d.regularMins||d.totalPaidMins||0)/60).toFixed(2);
    var ot  = ((d.otMins||0)/60).toFixed(2);
    var tot = (parseFloat(reg)+parseFloat(ot)).toFixed(2);
    var cost= (parseFloat(reg)*laborRate + parseFloat(ot)*laborRate*1.5).toFixed(2);
    rows.push([d.date||'',d.techName||'',d.clockInTime||'',d.clockOutTime||'',reg,ot,tot,cost,d.jobName||'',d.flag?'Yes':'No']);
  });
  var csv = rows.map(function(r){ return r.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var blob = new Blob([csv],{type:'text/csv'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download='TCSS_Payroll_'+getTodayISO()+'.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('Payroll CSV exported','success');
}

function exportReportCSV() {
  const quotes = getFilteredQuotes();
  const rows = [['Quote#','Customer','Job','Environment','Job Type','Total','Target Margin','Achieved Margin','Health','Status','Date','Follow-Up Date','Equipment Cost','Per Diem Cost','Lump Sum']];
  quotes.forEach(function(q){
    const envL = q.envLabel||(ENV_PRESETS[q.env]?ENV_PRESETS[q.env].label:(q.env||''));
    rows.push([
      q.num||'', q.cn||'', q.jn||'', envL, q.jt||'',
      q.total||0, pct(q.targetMargin||35), pct(q.achievedMargin||0),
      q.pricingHealth||'', q.status||'', q.dt||'', q.followupDate||'',
      q.equipmentCost||0, q.perDiemCost||0,
      (q.lumpSum&&q.lumpSum.enabled)?'Yes':'No'
    ]);
  });
  const csv = rows.map(function(r){ return r.map(function(c){ return '"'+(c+'').replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tcss-report-'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
}

// =============================================
// V8 PHASE 4: INVENTORY & TOOL TRACKING
// =============================================

let _invActiveTab = 'items';

function switchInvTab(tab) {
  _invActiveTab = tab;
  document.querySelectorAll('.inv-tab').forEach(function(b,i){
    const tabs = ['items','checkout','lowstock'];
    b.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.inv-section').forEach(function(s){
    s.classList.toggle('active', s.id === 'inv-' + tab);
  });
  renderInventory();
}

// ---- ASSET TAG GENERATOR ----
function nextAssetTag() {
  DB.invSeq = (DB.invSeq || 1);
  const tag = 'TCSS -' + DB.invSeq;
  DB.invSeq++;
  return tag;
}

// ---- RENDER INVENTORY ----
function renderInventory() {
  const tab       = _invActiveTab;
  const search    = ((document.getElementById('inv-search')||{}).value || '').toLowerCase();
  const catFilter = (document.getElementById('inv-cat-filter')||{}).value || '';
  const locFilter = (document.getElementById('inv-loc-filter')||{}).value || '';

  // Build filter dropdowns
  const cats = [...new Set(DB.inventory.map(function(i){ return i.cat||'General'; }))].sort();
  const locs = [...new Set(DB.inventory.map(function(i){ return i.location||''; }).filter(Boolean))].sort();
  const catSel = document.getElementById('inv-cat-filter');
  const locSel = document.getElementById('inv-loc-filter');
  if (catSel) { const cv=catSel.value; catSel.innerHTML='<option value="">All Categories</option>'+cats.map(function(c){return '<option value="'+escHtml(c)+'"'+( c===cv?' selected':'')+'>'+escHtml(c)+'</option>';}).join(''); }
  if (locSel) { const lv=locSel.value; locSel.innerHTML='<option value="">All Locations</option>'+locs.map(function(l){return '<option value="'+escHtml(l)+'"'+(l===lv?' selected':'')+'>'+escHtml(l)+'</option>';}).join(''); }

  // Stats
  const totalItems  = DB.inventory.length;
  const coItems     = DB.checkoutLog.filter(function(c){ return !c.returnDate; }).length;
  const lowItems    = DB.inventory.filter(function(i){ return (i.qty||0) <= (i.minQty||1) && (i.qty||0) >= 0; }).length;
  const uniqueCats  = new Set(DB.inventory.map(function(i){ return i.cat||'General'; })).size;
  function setT(id,v){ const el=document.getElementById(id); if(el) el.textContent=v; }
  setT('inv-total', totalItems);
  setT('inv-checked-out', coItems);
  setT('inv-low-count', lowItems);
  setT('inv-categories', uniqueCats);

  // Low stock warning bar
  const lowWarn = document.getElementById('inv-low-warn');
  if (lowWarn) {
    const lowNames = DB.inventory.filter(function(i){ return (i.qty||0) <= (i.minQty||1); }).map(function(i){ return escHtml(i.name); }).slice(0,5);
    if (lowNames.length > 0) { lowWarn.classList.add('visible'); lowWarn.innerHTML = '⚠️ Low/out of stock: <strong>' + lowNames.join(', ') + (DB.inventory.filter(function(i){return (i.qty||0)<=(i.minQty||1);}).length>5?' + more...':'') + '</strong>'; }
    else lowWarn.classList.remove('visible');
  }

  // ---- ITEMS TAB ----
  if (tab === 'items') {
    let list = DB.inventory.slice();
    if (search) list = list.filter(function(i){ return (i.name||'').toLowerCase().includes(search)||(i.tag||'').toLowerCase().includes(search)||(i.cat||'').toLowerCase().includes(search)||(i.location||'').toLowerCase().includes(search); });
    if (catFilter) list = list.filter(function(i){ return (i.cat||'General')===catFilter; });
    if (locFilter) list = list.filter(function(i){ return (i.location||'')===locFilter; });

    const tbl = document.getElementById('inv-tbl');
    if (!tbl) return;
    if (!list.length) { tbl.innerHTML='<tr><td colspan="7" class="empty-state"><p>'+(DB.inventory.length?'No items match filter.':'No items yet. Click + Add Item to get started.')+'</p></td></tr>'; return; }

    tbl.innerHTML = list.map(function(item){
      const qty      = item.qty||0;
      const min      = item.minQty||1;
      const qtyClass = qty===0?'inv-qty-out':qty<=min?'inv-qty-low':'inv-qty-ok';
      const qtyLabel = qty===0?'Out':qty<=min?'Low':'In Stock';
      const activeCoCount = DB.checkoutLog.filter(function(c){ return c.itemId===item.id && !c.returnDate; }).length;
      return '<tr>' +
        '<td><span class="asset-tag">'+escHtml(item.tag||'—')+'</span></td>' +
        '<td><div style="font-weight:700;font-size:13px">'+escHtml(item.name||'')+'</div>'+(item.notes?'<div style="font-size:11px;color:#90a4ae">'+escHtml((typeof stripHtmlToText==='function'?stripHtmlToText(item.notes):item.notes).substring(0,60))+'</div>':'')+'</td>' +
        '<td style="font-size:12px">'+escHtml(item.cat||'General')+'</td>' +
        '<td style="font-size:12px">'+escHtml(item.location||'—')+'</td>' +
        '<td><span class="inv-qty-badge '+qtyClass+'">'+qty+' — '+qtyLabel+'</span></td>' +
        '<td>'+(activeCoCount>0?'<span class="checkout-badge co-out">'+activeCoCount+' Out</span>':'<span class="checkout-badge co-in">Available</span>')+'</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn btn-outline btn-sm" data-action="checkoutItem" data-id="'+item.id+'" title="Check Out">↗ Out</button> ' +
          '<button class="btn btn-ghost btn-sm" data-action="editInventoryItem" data-id="'+item.id+'">Edit</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="delInventoryItem" data-id="'+item.id+'">Del</button>' +
        '</td></tr>';
    }).join('');
  }

  // ---- CHECKOUTS TAB ----
  if (tab === 'checkout') {
    // Active checkouts
    const active = DB.checkoutLog.filter(function(c){ return !c.returnDate; });
    const coTbl  = document.getElementById('inv-co-tbl');
    if (coTbl) coTbl.innerHTML = active.length>0 ? active.map(function(c){
      const item    = DB.inventory.find(function(i){ return i.id===c.itemId; });
      const today   = new Date().toISOString().split('T')[0];
      const overdue = c.expectedReturn && c.expectedReturn < today;
      return '<tr style="'+(overdue?'background:#fff8f8':'')+'">'+
        '<td><span class="asset-tag">'+escHtml((item&&item.tag)||'—')+'</span></td>'+
        '<td style="font-weight:700;font-size:12px">'+escHtml((item&&item.name)||'Unknown')+'</td>'+
        '<td>'+escHtml(c.to||'')+'</td>'+
        '<td style="font-size:12px">'+escHtml(c.job||'—')+'</td>'+
        '<td>'+escHtml(c.checkoutDate||'')+'</td>'+
        '<td style="'+(overdue?'color:#c62828;font-weight:700':'')+'">'+escHtml(c.expectedReturn||'—')+(overdue?' ⚠️':'')+'</td>'+
        '<td><button class="btn-checkin" data-action="checkinItem" data-id="'+c.id+'">✓ Return</button></td>'+
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty-state"><p>No active checkouts.</p></td></tr>';

    // History (last 30 returned)
    const history = DB.checkoutLog.filter(function(c){ return !!c.returnDate; }).slice(-30).reverse();
    const histTbl = document.getElementById('inv-hist-tbl');
    if (histTbl) histTbl.innerHTML = history.length>0 ? history.map(function(c){
      const item = DB.inventory.find(function(i){ return i.id===c.itemId; });
      return '<tr>'+
        '<td><span class="asset-tag">'+escHtml((item&&item.tag)||'—')+'</span></td>'+
        '<td style="font-size:12px">'+escHtml((item&&item.name)||'Unknown')+'</td>'+
        '<td style="font-size:12px">'+escHtml(c.to||'')+'</td>'+
        '<td style="font-size:11px;color:#90a4ae">'+escHtml(c.checkoutDate||'')+'</td>'+
        '<td style="font-size:11px;color:#90a4ae">'+escHtml(c.returnDate||'')+'</td>'+
        '<td><span class="checkout-badge co-in">Returned</span></td>'+
      '</tr>';
    }).join('') : '<tr><td colspan="6" class="empty-state"><p>No checkout history.</p></td></tr>';
  }

  // ---- LOW STOCK TAB ----
  if (tab === 'lowstock') {
    const lowList = DB.inventory.filter(function(i){ return (i.qty||0) <= (i.minQty||1); });
    const lowTbl  = document.getElementById('inv-low-tbl');
    if (lowTbl) lowTbl.innerHTML = lowList.length>0 ? lowList.map(function(item){
      const gap = Math.max(0, (item.minQty||1) - (item.qty||0));
      const qtyClass = (item.qty||0)===0 ? 'inv-qty-out' : 'inv-qty-low';
      return '<tr>'+
        '<td><span class="asset-tag">'+escHtml(item.tag||'—')+'</span></td>'+
        '<td style="font-weight:700">'+escHtml(item.name||'')+'</td>'+
        '<td style="font-size:12px">'+escHtml(item.cat||'General')+'</td>'+
        '<td><span class="inv-qty-badge '+qtyClass+'">'+(item.qty||0)+'</span></td>'+
        '<td>'+( item.minQty||1)+'</td>'+
        '<td style="font-weight:700;color:#c62828">Need '+gap+' more</td>'+
        '<td><button class="btn btn-outline btn-sm" data-action="editInventoryItem" data-id="'+item.id+'">Restock</button></td>'+
      '</tr>';
    }).join('') : '<tr><td colspan="7" class="empty-state"><p>✅ All items above minimum stock levels!</p></td></tr>';
  }
}

// ---- NEW / EDIT INVENTORY ITEM ----
function newInventoryItem() {
  document.getElementById('inv-modal-title').textContent = 'New Inventory Item';
  ['inv-name','inv-cat','inv-loc','inv-item-notes','inv-id'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=''; });
  const qtyEl=document.getElementById('inv-qty'); if(qtyEl) qtyEl.value=1;
  const minEl=document.getElementById('inv-min'); if(minEl) minEl.value=1;
  const costEl=document.getElementById('inv-cost'); if(costEl) costEl.value=0;
  // Generate next tag
  const tagEl=document.getElementById('inv-tag'); if(tagEl) tagEl.value='TCSS -'+DB.invSeq;
  // Populate datalists
  populateInvDataLists();
  openModal('modal-inv-item');
}

function editInventoryItem(id) {
  const item = DB.inventory.find(function(i){ return i.id==id; });
  if (!item) return;
  document.getElementById('inv-modal-title').textContent = 'Edit: ' + (item.name||'Item');
  function sv(eid,v){ const el=document.getElementById(eid); if(el) el.value=v!==undefined&&v!==null?v:''; }
  sv('inv-name',item.name); sv('inv-tag',item.tag); sv('inv-cat',item.cat);
  sv('inv-loc',item.location); sv('inv-qty',item.qty||0); sv('inv-min',item.minQty||1);
  sv('inv-cost',item.cost||0); sv('inv-item-notes',item.notes||''); sv('inv-id',item.id);
  // Remove readonly on tag for editing
  const tagEl = document.getElementById('inv-tag'); if(tagEl) tagEl.removeAttribute('readonly');
  populateInvDataLists();
  openModal('modal-inv-item');
}

function populateInvDataLists() {
  const cats = [...new Set(DB.inventory.map(function(i){ return i.cat||'General'; }))].sort();
  const locs = [...new Set(DB.inventory.map(function(i){ return i.location||''; }).filter(Boolean))].sort();
  const cdl  = document.getElementById('inv-cat-datalist'); if(cdl) cdl.innerHTML=cats.map(function(c){return '<option value="'+escHtml(c)+'">';}).join('');
  const ldl  = document.getElementById('inv-loc-datalist'); if(ldl) ldl.innerHTML=locs.map(function(l){return '<option value="'+escHtml(l)+'">';}).join('');
}

function saveInventoryItem() {
  const id   = document.getElementById('inv-id').value;
  const name = document.getElementById('inv-name').value.trim();
  if (!name) { showToast('Item name is required.','error'); return; }

  let tag = document.getElementById('inv-tag').value.trim();
  if (!tag) { tag = nextAssetTag(); } else if (!id) { DB.invSeq++; } // advance seq if custom

  const data = {
    id:       id || Date.now().toString(),
    name:     name,
    tag:      tag,
    cat:      document.getElementById('inv-cat').value.trim() || 'General',
    location: document.getElementById('inv-loc').value.trim() || '',
    qty:      parseInt(document.getElementById('inv-qty').value) || 0,
    minQty:   parseInt(document.getElementById('inv-min').value) || 1,
    cost:     parseFloat(document.getElementById('inv-cost').value) || 0,
    notes:    document.getElementById('inv-item-notes').value.trim(),
    createdAt: id ? undefined : new Date().toISOString()
  };
  if (!id) data.createdAt = new Date().toISOString();

  if (id) {
    const idx = DB.inventory.findIndex(function(i){ return i.id==id; });
    if (idx>=0) DB.inventory[idx] = data; else DB.inventory.push(data);
  } else {
    DB.inventory.push(data);
  }
  saveDB();
  closeModal('modal-inv-item');
  // Reset tag to readonly
  const tagEl=document.getElementById('inv-tag'); if(tagEl) tagEl.setAttribute('readonly','readonly');
  renderInventory();
}

function delInventoryItem(id) {
  if (!confirm('Delete this inventory item? Checkout history will be preserved.')) return;
  DB.inventory = DB.inventory.filter(function(i){ return i.id!=id; });
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.inventory)DB.deletedIds.inventory=[];
  if(DB.deletedIds.inventory.indexOf(id)<0)DB.deletedIds.inventory.push(id);
  saveDB();
  if(_sb&&_currentUser){ _sb.from('inventory').update({is_active:false}).eq('id',id).then(function(r){ if(r&&r.error)console.warn('[Delete] inventory:',r.error.message); if(typeof pushAllToCloud==='function')setTimeout(pushAllToCloud,300); }); }
  renderInventory();
}

// ---- CHECKOUT ----
function checkoutItem(id) {
  const item = DB.inventory.find(function(i){ return i.id==id; });
  if (!item) return;
  if ((item.qty||0) <= 0) { showToast('This item is out of stock and cannot be checked out.','error'); return; }

  document.getElementById('co-item-id').value = id;
  document.getElementById('checkout-item-info').innerHTML =
    '<strong>'+escHtml(item.name)+'</strong> &nbsp;<span class="asset-tag">'+escHtml(item.tag||'')+'</span>'+
    '<br><span style="font-size:12px;color:#546e7a">Available: '+item.qty+' &nbsp;·&nbsp; Location: '+(item.location||'—')+'</span>';

  // Pre-fill form
  document.getElementById('co-to').value = DB.settings.uname || '';
  document.getElementById('co-job').value = '';
  document.getElementById('co-notes').value = '';
  const co_qty = document.getElementById('co-qty'); if(co_qty){ co_qty.value=1; co_qty.max=item.qty; }
  const retDate = document.getElementById('co-return');
  if (retDate) { const d=new Date(); d.setDate(d.getDate()+7); retDate.value=d.toISOString().split('T')[0]; }

  // Populate team datalist
  const toList = document.getElementById('co-to-list');
  if (toList) toList.innerHTML = DB.team.map(function(t){ return '<option value="'+escHtml(t.name)+'">'; }).join('');
  // Populate job datalist
  const jobList = document.getElementById('co-job-list');
  if (jobList) jobList.innerHTML = (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[])).filter(function(j){ return j.status==='Scheduled'||j.status==='In Progress'; }).map(function(j){ return '<option value="'+escHtml(j.name)+'">'; }).join('');

  openModal('modal-checkout');
}

function confirmCheckout() {
  const itemId = document.getElementById('co-item-id').value;
  const to     = document.getElementById('co-to').value.trim();
  if (!to) { showToast('Please enter who is checking this out.','error'); return; }
  const qty = parseInt(document.getElementById('co-qty').value)||1;

  const item = DB.inventory.find(function(i){ return i.id==itemId; });
  if (!item) return;
  if (item.qty < qty) { showToast('Not enough stock. Available: '+item.qty,'error'); return; }

  // Reduce qty
  item.qty -= qty;

  // Low stock alert — fire immediately if below minimum
  if (DB.settings.invLowStockWarn !== false) {
    var minQty = item.minQty || 0;
    if (minQty > 0 && item.qty < minQty) {
      if (typeof addNotification === 'function') {
        addNotification(
          'low_stock',
          '📦 Low Stock — '+item.name,
          'Qty now '+item.qty+' (minimum: '+minQty+'). Checked out by: '+to,
          'inventory'
        );
      }
    }
  }

  // Log checkout
  const log = {
    id:             Date.now().toString(),
    itemId:         itemId,
    qty:            qty,
    to:             to,
    job:            document.getElementById('co-job').value.trim(),
    notes:          document.getElementById('co-notes').value.trim(),
    checkoutDate:   new Date().toISOString().split('T')[0],
    expectedReturn: document.getElementById('co-return').value || '',
    returnDate:     null
  };
  DB.checkoutLog.push(log);
  saveDB();
  closeModal('modal-checkout');
  renderInventory();
}

function checkinItem(logId) {
  const log  = DB.checkoutLog.find(function(c){ return c.id==logId; });
  if (!log) return;
  const item = DB.inventory.find(function(i){ return i.id===log.itemId; });
  const name = item ? item.name : 'item';
  if (!confirm('Return '+log.qty+' × '+name+' from '+log.to+'?')) return;

  log.returnDate = new Date().toISOString().split('T')[0];
  if (item) item.qty += log.qty;
  saveDB();
  renderInventory();
}

function exportInventoryCSV() {
  const rows = [['Asset Tag','Item Name','Category','Location','Qty On Hand','Min Level','Unit Cost','Notes']];
  DB.inventory.forEach(function(i){
    rows.push([i.tag||'',i.name||'',i.cat||'',i.location||'',i.qty||0,i.minQty||1,i.cost||0,i.notes||'']);
  });
  const csv = rows.map(function(r){ return r.map(function(c){ return '"'+(c+'').replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tcss-inventory-'+new Date().toISOString().split('T')[0]+'.csv'; a.click();
}

