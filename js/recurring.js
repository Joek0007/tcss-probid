// ── TCSS ProBid V9 — Managed Services Module ─────────────────────────────────
// DB.recurringContracts = [] — each contract:
// { id, number, client, customerId, type, description, billingCycle,
//   billingDay, status, autoRenew, contractStart, contractEnd,
//   deliveryMethod, clientEmail, lineItems:[{id,desc,qty,unitPrice}],
//   nextBillingDate, lastBilledDate, notes, createdAt }

var _rcCurrentId   = null;
var _rcLineItems   = [];
var _rcRunLog      = [];   // in-memory log for current session

var RC_TYPES = [
  'Phone Equipment','VoIP','Computer Services','IT Support',
  'Security / Access Control','Camera System','Network Maintenance',
  'Cabling Maintenance','Audio / Visual','Other'
];

var RC_CYCLES = {
  monthly:    { label:'Monthly',    months:1 },
  quarterly:  { label:'Quarterly',  months:3 },
  biannual:   { label:'Bi-Annual',  months:6 },
  annual:     { label:'Annual',     months:12 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _rcNextNumber() {
  RC_TYPES = _getMSTypes();
  RC_CYCLES = _getMSCycles();
  var existing = (DB.recurringContracts||[]);
  var nums = existing.map(function(c){
    var m = (c.number||'').match(/RC-(\d+)/); return m?parseInt(m[1]):0;
  });
  return 'RC-' + String((nums.length?Math.max.apply(null,nums):0)+1).padStart(3,'0');
}

function _rcAdvanceDate(dateStr, cycle) {
  // Parse as explicit LOCAL year-month-day. `new Date("YYYY-MM-DD")` parses as UTC midnight,
  // and reading/writing it through local getMonth()/toISOString() drifts the day by one when
  // advancing 3/6 months across a DST boundary (observed: quarterly landed a day early).
  // Also clamp to the target month's length so Jan 31 + 1mo = Feb 28, not a spill into March.
  var p = String(dateStr).split('-');
  var y = parseInt(p[0],10), m = parseInt(p[1],10)-1, day = parseInt(p[2],10);
  if (isNaN(y) || isNaN(m) || isNaN(day)) return dateStr;
  var months = (RC_CYCLES[cycle]||{months:1}).months;
  var base = new Date(y, m + months, 1);                                   // first of target month (local)
  var lastDay = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return base.getFullYear()+'-'+String(base.getMonth()+1).padStart(2,'0')+'-'+String(base.getDate()).padStart(2,'0');
}

function _rcTotalMonthly(contract) {
  var items = contract.lineItems||[];
  var subtotal = items.reduce(function(s,i){ return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0)); },0);
  var months = (RC_CYCLES[contract.billingCycle]||{months:1}).months;
  return subtotal * months;
}

function _rcIsDue(contract, asOfDate) {
  if (contract.status!=='active') return false;
  if (!contract.nextBillingDate) return false;
  return contract.nextBillingDate <= asOfDate;
}

function _rcLineTotal() {
  return _rcLineItems.reduce(function(s,i){
    return s + (parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));
  }, 0);
}

// ── Render contract list ───────────────────────────────────────────────────────
// ── Ready-to-Send tray ──────────────────────────────────────────────────────
// Surfaces the DRAFT invoices the auto-biller (or a manual draft) generated into the
// unified invoice store, so the team reviews them on one friendly screen before anything
// goes to a client. Phase 1: review · preview (taxed) · hold/release. Sending is the next build.
function _rcReadyInvoices() {
  return (DB.invoices||[]).filter(function(i){
    return i && i.type==='recurring' && (i.status==='draft' || i.status==='held');
  }).sort(function(a,b){
    var ad=(a.invoiceDate||a.runDate||''), bd=(b.invoiceDate||b.runDate||'');
    if (ad!==bd) return ad<bd?-1:1;                     // oldest run first
    return (a.num||'')<(b.num||'')?-1:1;
  });
}

function _rcInvTotal(i){
  return (i.total!=null)?parseFloat(i.total):(i.amount!=null?parseFloat(i.amount):0);
}

function _rcSaveInvoice(inv){
  try { if (typeof saveDB==='function') saveDB(); } catch(e){}
  try { if (typeof _pushInvoiceToCloud==='function') _pushInvoiceToCloud(inv); } catch(e){}
}

function rcHoldInvoice(id){
  var inv=(DB.invoices||[]).find(function(i){return i.id===id;});
  if(!inv) return;
  var old=inv.status; inv.status='held';
  if(typeof auditLog==='function') auditLog('ms_invoice_held','invoice',id,{old:old,new:'held',note:'Held in Ready-to-Send tray — '+(inv.num||'')});
  _rcSaveInvoice(inv); renderRecurring();
  if(typeof showToast==='function') showToast('Invoice held — it will wait here until you release it','info',2200);
}

function rcReleaseInvoice(id){
  var inv=(DB.invoices||[]).find(function(i){return i.id===id;});
  if(!inv) return;
  var old=inv.status; inv.status='draft';
  if(typeof auditLog==='function') auditLog('ms_invoice_released','invoice',id,{old:old,new:'draft',note:'Released back to ready — '+(inv.num||'')});
  _rcSaveInvoice(inv); renderRecurring();
  if(typeof showToast==='function') showToast('Invoice released — ready to send','success',2000);
}

// ── Edit a draft invoice (before it's sent) ─────────────────────────────────
// Working copy in _msEditInv so Cancel discards. Only DRAFT/HELD invoices are editable here;
// a sent/paid invoice is never opened for edit (that would be the void+reissue path, later).
var _msEditInv = null;

function _mseEscAttr(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function editMSInvoice(invId){
  var inv=(DB.invoices||[]).find(function(i){return i.id===invId;});
  if(!inv){ if(typeof showToast==='function') showToast('Invoice not found','warning',2000); return; }
  if(inv.status!=='draft' && inv.status!=='held'){
    if(typeof showToast==='function') showToast('Only draft invoices can be edited','warning',2500); return;
  }
  _msEditInv = {
    id: inv.id, num: inv.num||'', clientName: inv.clientName||'',
    taxRate: (inv.taxRate!=null)?parseFloat(inv.taxRate):0,
    taxable: (inv.taxable!==false),
    lineItems: (inv.lineItems||[]).map(function(li){
      return { desc:(li.desc||''), qty:parseFloat(li.qty||1), unitPrice:parseFloat(li.unitPrice||0) };
    })
  };
  if(!_msEditInv.lineItems.length) _msEditInv.lineItems=[{desc:'',qty:1,unitPrice:0}];
  _renderMSEditOverlay();
}

function _msEditRows(){
  return _msEditInv.lineItems.map(function(li, idx){
    var lt = (parseFloat(li.qty||1)*parseFloat(li.unitPrice||0));
    return '<tr>'
      +'<td style="padding:5px 6px"><input value="'+_mseEscAttr(li.desc)+'" oninput="_msEditUpdateLine('+idx+',\'desc\',this.value)" style="width:100%;box-sizing:border-box;border:1px solid #cfd8e3;border-radius:5px;padding:7px 8px;font-size:13px" placeholder="Description"></td>'
      +'<td style="padding:5px 6px"><input type="number" min="0" step="1" value="'+parseFloat(li.qty||1)+'" oninput="_msEditUpdateLine('+idx+',\'qty\',this.value)" style="width:60px;box-sizing:border-box;border:1px solid #cfd8e3;border-radius:5px;padding:7px 6px;font-size:13px;text-align:center"></td>'
      +'<td style="padding:5px 6px"><input type="number" min="0" step="0.01" value="'+parseFloat(li.unitPrice||0).toFixed(2)+'" oninput="_msEditUpdateLine('+idx+',\'unitPrice\',this.value)" onblur="this.value=parseFloat(this.value||0).toFixed(2)" style="width:92px;box-sizing:border-box;border:1px solid #cfd8e3;border-radius:5px;padding:7px 6px;font-size:13px;text-align:right"></td>'
      +'<td id="mse-lt-'+idx+'" style="padding:5px 8px;text-align:right;font-weight:700;font-size:13px;white-space:nowrap">$'+lt.toFixed(2)+'</td>'
      +'<td style="padding:5px 4px;text-align:center"><button onclick="_msEditRemoveLine('+idx+')" title="Remove line" style="background:#fff;border:1px solid #ffcdd2;color:#c62828;border-radius:5px;width:26px;height:26px;cursor:pointer;font-size:13px;line-height:1">&times;</button></td>'
    +'</tr>';
  }).join('');
}

function _renderMSEditOverlay(){
  var e=_msEditInv;
  var overlay=document.getElementById('ms-edit-overlay');
  if(!overlay){ overlay=document.createElement('div'); overlay.id='ms-edit-overlay'; document.body.appendChild(overlay); }
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(13,27,42,.55);z-index:10000;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:30px 16px';
  overlay.innerHTML=
    '<div style="background:#fff;border-radius:12px;max-width:680px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;font-family:Arial,sans-serif">'
    +'<div style="background:#0d1b2a;padding:14px 20px;display:flex;align-items:center;justify-content:space-between">'
      +'<div style="color:#fff"><div style="font-size:15px;font-weight:800">&#9998; Edit Invoice</div>'
        +'<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+_mseEscAttr(e.num)+' &nbsp;·&nbsp; '+_mseEscAttr(e.clientName)+'</div></div>'
      +'<button onclick="_closeMSEdit()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer">&times; Cancel</button>'
    +'</div>'
    +'<div style="padding:18px 20px">'
      +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="font-size:10px;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;text-align:left">'
          +'<th style="padding:0 6px 6px">Description</th><th style="padding:0 6px 6px;text-align:center">Qty</th>'
          +'<th style="padding:0 6px 6px;text-align:right">Unit $</th><th style="padding:0 8px 6px;text-align:right">Amount</th><th></th>'
        +'</tr></thead><tbody id="mse-tbody">'+_msEditRows()+'</tbody>'
      +'</table>'
      +'<button onclick="_msEditAddLine()" style="margin-top:8px;background:#e3f2fd;color:#1565c0;border:1px solid #bbdefb;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">+ Add line</button>'
      +'<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eef2f6;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">'
        +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#37474f;cursor:pointer">'
          +'<input type="checkbox" id="mse-taxable" '+(e.taxable?'checked':'')+' onchange="_msEditSetTaxable(this.checked)" style="width:16px;height:16px"> Taxable'
          +' &nbsp;<span style="color:#90a4ae">rate</span> <input type="number" min="0" step="0.01" id="mse-rate" value="'+parseFloat(e.taxRate||0)+'" oninput="_msEditSetRate(this.value)" '+(e.taxable?'':'disabled')+' style="width:62px;border:1px solid #cfd8e3;border-radius:5px;padding:6px;font-size:13px;text-align:right">%'
        +'</label>'
        +'<div style="text-align:right;font-size:13px;min-width:200px">'
          +'<div style="display:flex;justify-content:space-between;color:#546e7a"><span>Subtotal</span><span id="mse-subtotal">$0.00</span></div>'
          +'<div style="display:flex;justify-content:space-between;color:#546e7a;margin-top:3px"><span id="mse-taxlabel">Tax</span><span id="mse-tax">$0.00</span></div>'
          +'<div style="display:flex;justify-content:space-between;font-size:17px;font-weight:900;color:#1565c0;margin-top:6px;padding-top:6px;border-top:1px solid #eef2f6"><span>Total</span><span id="mse-total">$0.00</span></div>'
        +'</div>'
      +'</div>'
      +'<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">'
        +'<button onclick="_closeMSEdit()" style="background:#eceff1;color:#546e7a;border:none;border-radius:6px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer">Cancel</button>'
        +'<button onclick="_msEditSave()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer">&#10003; Save changes</button>'
      +'</div>'
    +'</div></div>';
  _msEditRecalc();
}

function _msEditUpdateLine(idx, field, val){
  if(!_msEditInv||!_msEditInv.lineItems[idx]) return;
  if(field==='desc') _msEditInv.lineItems[idx].desc=val;
  else _msEditInv.lineItems[idx][field]=parseFloat(val||0);
  _msEditRecalc();
}
function _msEditSetRate(val){ if(_msEditInv){ _msEditInv.taxRate=parseFloat(val||0); _msEditRecalc(); } }
function _msEditSetTaxable(c){
  if(!_msEditInv) return;
  _msEditInv.taxable=!!c;
  var rate=document.getElementById('mse-rate'); if(rate) rate.disabled=!c;
  _msEditRecalc();
}
function _msEditAddLine(){
  if(!_msEditInv) return;
  _msEditInv.lineItems.push({desc:'',qty:1,unitPrice:0});
  var tb=document.getElementById('mse-tbody'); if(tb) tb.innerHTML=_msEditRows();
  _msEditRecalc();
}
function _msEditRemoveLine(idx){
  if(!_msEditInv) return;
  _msEditInv.lineItems.splice(idx,1);
  if(!_msEditInv.lineItems.length) _msEditInv.lineItems=[{desc:'',qty:1,unitPrice:0}];
  var tb=document.getElementById('mse-tbody'); if(tb) tb.innerHTML=_msEditRows();
  _msEditRecalc();
}
function _msEditCalc(){
  var sub=_msEditInv.lineItems.reduce(function(s,i){return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));},0);
  var rate=_msEditInv.taxable?parseFloat(_msEditInv.taxRate||0):0;
  var tax=Math.round(sub*rate/100*100)/100;
  var tot=Math.round((sub+tax)*100)/100;
  return { sub:sub, rate:rate, tax:tax, tot:tot };
}
function _msEditRecalc(){
  if(!_msEditInv) return;
  var c=_msEditCalc();
  _msEditInv.lineItems.forEach(function(li,idx){
    var cell=document.getElementById('mse-lt-'+idx);
    if(cell) cell.textContent='$'+(parseFloat(li.qty||1)*parseFloat(li.unitPrice||0)).toFixed(2);
  });
  function set(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
  set('mse-subtotal','$'+c.sub.toFixed(2));
  set('mse-tax','$'+c.tax.toFixed(2));
  set('mse-total','$'+c.tot.toFixed(2));
  var lbl=document.getElementById('mse-taxlabel');
  if(lbl) lbl.textContent='Tax ('+(c.rate).toFixed(c.rate%1?2:0)+'%)';
}
function _closeMSEdit(){
  var o=document.getElementById('ms-edit-overlay'); if(o) o.style.display='none';
  _msEditInv=null;
}
function _msEditSave(){
  if(!_msEditInv) return;
  var inv=(DB.invoices||[]).find(function(i){return i.id===_msEditInv.id;});
  if(!inv){ _closeMSEdit(); return; }
  var before={ lineItems:inv.lineItems, subtotal:inv.subtotal, taxRate:inv.taxRate, taxAmt:inv.taxAmt, total:inv.total, taxable:inv.taxable };
  // drop fully-empty rows (no description and zero price)
  var items=_msEditInv.lineItems.filter(function(li){ return (li.desc&&li.desc.trim()) || parseFloat(li.unitPrice||0)!==0 || parseFloat(li.qty||0)>1; });
  if(!items.length){ if(typeof showToast==='function') showToast('Add at least one line item','warning',2500); return; }
  _msEditInv.lineItems=items;
  var c=_msEditCalc();
  inv.lineItems=items.map(function(li,idx){ return { id:'li-'+Date.now()+'-'+idx, desc:li.desc||'', qty:parseFloat(li.qty||1), unitPrice:parseFloat(li.unitPrice||0) }; });
  inv.subtotal=c.sub; inv.taxable=_msEditInv.taxable; inv.taxRate=c.rate; inv.taxAmt=c.tax; inv.amount=c.tot; inv.total=c.tot;
  inv.updatedAt=new Date().toISOString();
  var after={ lineItems:inv.lineItems, subtotal:inv.subtotal, taxRate:inv.taxRate, taxAmt:inv.taxAmt, total:inv.total, taxable:inv.taxable };
  if(typeof auditLog==='function') auditLog('ms_invoice_edited','invoice',inv.id,{old:before,new:after,note:'Edited draft '+(inv.num||'')+' before send'});
  _rcSaveInvoice(inv);
  _closeMSEdit();
  renderRecurring();
  if(typeof showToast==='function') showToast('Invoice updated — $'+c.tot.toFixed(2),'success',2200);
}

// ── Control sheet for the drafts about to go out (verify before sending) ─────
function printMSReadyControlSheet() {
  var ready = _rcReadyInvoices().filter(function(i){ return i.status==='draft'; });
  if (!ready.length){ if(typeof showToast==='function') showToast('No invoices ready to send','warning',2000); return; }
  var co = DB.settings||{};
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var today = (typeof getTodayISO==='function')?getTodayISO():new Date().toISOString().slice(0,10);
  var ctrlSeq = (DB.billingCtrlSeq||0) + 1; DB.billingCtrlSeq = ctrlSeq;
  try { if(typeof saveDB==='function') saveDB(); } catch(e){}
  var ctrlNum = 'CTRL-' + today.replace(/-/g,'') + '-' + String(ctrlSeq).padStart(3,'0');

  // group by run date
  var groups={}; ready.forEach(function(i){ var k=i.invoiceDate||i.runDate||'—'; (groups[k]=groups[k]||[]).push(i); });
  var keys=Object.keys(groups).sort();
  var gSub=0,gTax=0,gTot=0,rowNum=0,rows='';
  keys.forEach(function(k){
    var grp=groups[k];
    var sub=grp.reduce(function(s,i){return s+(i.subtotal!=null?parseFloat(i.subtotal):0);},0);
    var tax=grp.reduce(function(s,i){return s+(i.taxAmt!=null?parseFloat(i.taxAmt):0);},0);
    var tot=grp.reduce(function(s,i){return s+_rcInvTotal(i);},0);
    rows += '<tr style="background:#e3f2fd"><td colspan="7" style="padding:7px 12px;font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.4px">Run of '+esc(k)+' &nbsp;&#183;&nbsp; '+grp.length+' invoice'+(grp.length!==1?'s':'')+' &nbsp;&#183;&nbsp; $'+tot.toFixed(2)+'</td></tr>';
    grp.forEach(function(i){
      rowNum++;
      rows += '<tr style="background:'+(rowNum%2===0?'#fafafa':'#fff')+'">'
        +'<td style="padding:7px 12px;font-size:12px;color:#90a4ae;text-align:center">'+rowNum+'</td>'
        +'<td style="padding:7px 12px;font-size:12px;font-weight:700;color:#1565c0">'+esc(i.num||'')+'</td>'
        +'<td style="padding:7px 12px;font-size:12px;font-weight:600">'+esc(i.clientName||'')+'</td>'
        +'<td style="padding:7px 12px;font-size:11px;color:#546e7a">'+esc(i.rcNumber||'')+'</td>'
        +'<td style="padding:7px 12px;font-size:12px;text-align:right">$'+(i.subtotal!=null?parseFloat(i.subtotal):0).toFixed(2)+'</td>'
        +'<td style="padding:7px 12px;font-size:12px;text-align:right;color:#546e7a">$'+(i.taxAmt!=null?parseFloat(i.taxAmt):0).toFixed(2)+'</td>'
        +'<td style="padding:7px 12px;font-size:12px;font-weight:700;text-align:right">$'+_rcInvTotal(i).toFixed(2)+'</td>'
      +'</tr>';
    });
    gSub+=sub; gTax+=tax; gTot+=tot;
  });

  var head = co.logoDataUrl
    ? '<img src="'+co.logoDataUrl+'" alt="'+esc(co.cname||'')+'" style="max-height:48px;max-width:230px;object-fit:contain;display:block;margin-bottom:6px">'
    : '<div style="font-size:20px;font-weight:900">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>';

  var body = '<div style="max-width:820px;margin:0 auto;font-family:Arial,sans-serif;color:#0d1b2a">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:18px">'
      +'<div>'+head
        +'<div style="font-size:11px;color:#546e7a;margin-top:5px">'+esc(co.caddr||'')+(co.cphone?' &nbsp;&#183;&nbsp; '+esc(co.cphone):'')+'</div>'
        +'<div style="font-size:16px;font-weight:800;color:#1565c0;margin-top:10px">MANAGED SERVICES — READY-TO-SEND CONTROL SHEET</div>'
      +'</div>'
      +'<div style="text-align:right"><div style="font-size:10px;color:#90a4ae;font-weight:700;text-transform:uppercase;margin-bottom:3px">Control Number</div>'
        +'<div style="font-size:19px;font-weight:900;color:#1565c0">'+ctrlNum+'</div></div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px">'
      +['Generated:'+today, 'Invoices:'+ready.length, 'Total:$'+gTot.toFixed(2)].map(function(it){var p=it.split(':');
        return '<div style="background:#f5f7fa;border-radius:8px;padding:10px 14px"><div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;margin-bottom:3px">'+p[0]+'</div><div style="font-size:14px;font-weight:800">'+p.slice(1).join(':')+'</div></div>';}).join('')
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse">'
      +'<thead><tr style="background:#0d1b2a;color:#fff">'
        +'<th style="padding:9px 12px;text-align:center;font-size:10px;text-transform:uppercase;width:34px">#</th>'
        +'<th style="padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;width:100px">Invoice</th>'
        +'<th style="padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase">Client</th>'
        +'<th style="padding:9px 12px;text-align:left;font-size:10px;text-transform:uppercase;width:80px">Contract</th>'
        +'<th style="padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;width:90px">Subtotal</th>'
        +'<th style="padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;width:80px">Tax</th>'
        +'<th style="padding:9px 12px;text-align:right;font-size:10px;text-transform:uppercase;width:95px">Total</th>'
      +'</tr></thead><tbody>'+rows+'</tbody>'
      +'<tfoot><tr style="background:#0d1b2a;color:#fff">'
        +'<td colspan="4" style="padding:10px 12px;font-size:13px;font-weight:700;text-align:right">TOTAL — '+ready.length+' INVOICES:</td>'
        +'<td style="padding:10px 12px;font-size:12px;font-weight:700;text-align:right">$'+gSub.toFixed(2)+'</td>'
        +'<td style="padding:10px 12px;font-size:12px;font-weight:700;text-align:right">$'+gTax.toFixed(2)+'</td>'
        +'<td style="padding:10px 12px;font-size:15px;font-weight:900;text-align:right">$'+gTot.toFixed(2)+'</td>'
      +'</tr></tfoot>'
    +'</table>'
    +'<div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">'
      +['Prepared by','Verified by','Date verified'].map(function(l){return '<div><div style="border-top:1px solid #0d1b2a;padding-top:6px;font-size:10px;color:#546e7a;text-transform:uppercase;letter-spacing:.4px">'+l+'</div><div style="height:22px"></div></div>';}).join('')
    +'</div>'
    +'<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e0e7ef;font-size:10px;color:#90a4ae;text-align:center">Control Sheet '+ctrlNum+' &nbsp;&#183;&nbsp; Generated '+new Date().toLocaleString()+' &nbsp;&#183;&nbsp; RETAIN FOR RECORDS</div>'
  +'</div>';

  _rcPrintPayload = { title: ctrlNum, html: body };
  var overlay=document.getElementById('rc-invoice-overlay');
  if(!overlay){ overlay=document.createElement('div'); overlay.id='rc-invoice-overlay'; document.body.appendChild(overlay); }
  overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:#e8edf2;z-index:9999;overflow-y:auto;display:block';
  overlay.innerHTML='<div class="no-print" style="position:sticky;top:0;background:#0d1b2a;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.3)">'
    +'<span style="color:#90a4ae;font-size:13px">&#128438; Control Sheet &nbsp;&#183;&nbsp; '+ctrlNum+'</span>'
    +'<div style="display:flex;gap:10px">'
      +'<button onclick="_rcPrintCurrent()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'
      +'<button onclick="_closeRCInvoice()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:9px 16px;font-size:13px;cursor:pointer">&#10005; Close</button>'
    +'</div></div>'
    +'<div style="padding:28px 20px">'+body+'</div>';
}

// ════════════════════════════════════════════════════════════════════════════
// SEND PATH — bulk send the ready drafts as emailed invoices (PDF attachment).
// SAFETY: a sandbox (default ON) redirects EVERY send to the office inbox so the
// whole flow can be tested without a client ever receiving an email. Flip it off
// only when ready. Each send flips the invoice to 'sent' + writes an audit row.
// ════════════════════════════════════════════════════════════════════════════
var _rcSelected = {};               // invId -> true (tray checkboxes)
var _rcSendInFlight = false;

function _rcSandboxOn(){ return ((DB.settings||{}).msSendSandbox !== false); }      // default ON
function _rcSandboxTo(){ return (DB.settings||{}).msSandboxTo || (DB.settings||{}).notifSandboxTo || 'joek@tcss.com'; }
function _rcAutobillOn(){ return !!((DB.settings||{}).msAutobillOn); }

// ── Manual "generate now" — ONE billing path ────────────────────────────────
// Runs the SAME server generator the nightly cron uses (run_managed_billing), so a manual run and the
// automatic run produce identical TAXED drafts into the tray and share the same no-double-bill guard
// (ms_billing_log). Replaces the old client-side executeBillingRun (no tax, mailto). Nothing is emailed.
async function rcGenerateNow(){
  if (typeof _sb==='undefined' || !_sb){ if(typeof showToast==='function') showToast('Offline — can’t generate right now','warning',2800); return; }
  var today = (typeof getTodayISO==='function') ? getTodayISO() : new Date().toISOString().slice(0,10);
  if (!confirm('Generate draft invoices for every contract due as of today?\n\nThey land in the Ready-to-Send tray for review — nothing is emailed to a client.')) return;
  if (typeof showToast==='function') showToast('Generating draft invoices…','info',3000);
  try {
    var rr = await _sb.rpc('run_managed_billing', { p_run_date: today, p_force: true });
    if (rr.error){ if(typeof showToast==='function') showToast('Could not generate: '+(rr.error.message||rr.error),'error',6000); return; }
    var n = (rr.data && rr.data.generated) || 0;
    await _rcRefreshDrafts();
    renderRecurring();
    if (typeof showToast==='function'){
      showToast(n>0 ? ('✅ '+n+' draft invoice'+(n!==1?'s':'')+' generated — review them in the tray') : 'Nothing new is due to generate right now','success',4500);
    }
  } catch(e){ if(typeof showToast==='function') showToast('Generate error: '+(e.message||e),'error',6000); }
}
// Pull the freshly-generated recurring drafts from the cloud into DB.invoices so the tray shows them now.
async function _rcRefreshDrafts(){
  if (typeof fetchInvoicesCloud!=='function') return;
  try {
    var r = await fetchInvoicesCloud({ limit: 500 });
    if (!r || !r.data) return;
    if (!DB.invoices) DB.invoices = [];
    r.data.forEach(function(inv){
      if (!inv || inv.type!=='recurring') return;
      var idx = DB.invoices.findIndex(function(x){ return x.id===inv.id; });
      if (idx>=0) DB.invoices[idx] = inv; else DB.invoices.push(inv);
    });
    try { if (typeof saveDB==='function') saveDB(); } catch(e){}
  } catch(e){}
}

// The email shown on invoices + in the invoice email body. Prefer the explicit Billing/Invoicing Email
// (Settings); when that's blank, fall back to the ACTUAL sending address (so the contact line always
// matches the From), and only then to the general company email. Keeps "contact us at …" consistent
// with who the email came from, with zero setup.
function _rcBillingEmail(){
  var s=DB.settings||{};
  if(s.billingEmail) return s.billingEmail;
  var from=s.mgFrom||'TCSS Invoicing <invoicing@tcss.com>';
  var m=from.match(/<([^>]+)>/)||from.match(/([^\s<>]+@[^\s<>]+)/);
  if(m&&m[1]) return m[1];
  return s.cemail||'';
}

function rcToggleSel(id, on){ if(on){ _rcSelected[id]=true; } else { delete _rcSelected[id]; } _rcUpdateSendBar(); }
function rcSelectAllReady(on){
  var ready=_rcReadyInvoices().filter(function(i){return i.status==='draft';});
  _rcSelected={}; if(on){ ready.forEach(function(i){ _rcSelected[i.id]=true; }); }
  renderRecurring();
}
function _rcSelectedCount(){ return Object.keys(_rcSelected).length; }
function _rcUpdateSendBar(){
  var n=_rcSelectedCount();
  var btn=document.getElementById('rc-send-selected');
  if(btn){ btn.style.display = n>0 ? 'inline-block' : 'none'; btn.textContent='✉ Send selected ('+n+')'; }
}

// Lazy-load the PDF libraries (same CDNs the invoice email path uses).
function _rcEnsurePdfLibs(){
  return new Promise(function(resolve,reject){
    function need(cond,src){ return new Promise(function(res,rej){ if(cond()){res();return;} var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
    need(function(){return typeof html2canvas!=='undefined';},'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      .then(function(){ return need(function(){return typeof window.jspdf!=='undefined'||typeof window.jsPDF!=='undefined';},'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'); })
      .then(resolve).catch(reject);
  });
}

// Short, email-safe cover note (the full invoice rides as the PDF attachment).
function _rcEmailCoverHTML(inv, sandboxFor){
  var co=DB.settings||{};
  var billEmail=_rcBillingEmail();
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function money(n){ return '$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  // Outlook ignores CSS max-width on images and renders them at native size — so the logo MUST carry an
  // explicit width attribute (not just a style) to stay a small header mark instead of a full-width banner.
  var head = co.logoDataUrl
    ? '<img src="'+co.logoDataUrl+'" alt="'+esc(co.cname||'')+'" width="200" style="width:200px;max-width:200px;height:auto;display:block;border:0">'
    : '<div style="font-size:18px;font-weight:800;color:#0d1b2a">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>';
  return ''
    +(sandboxFor?'<div style="background:#fff3e0;border:1px solid #ffcc80;color:#e65100;padding:10px 14px;font-family:Arial;font-size:12px;border-radius:6px;margin-bottom:14px">🧪 SANDBOX TEST — this would have been sent to <b>'+esc(sandboxFor)+'</b>. No client received it.</div>':'')
    +'<div style="max-width:560px;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
    +'<div style="padding-bottom:14px;border-bottom:2px solid #1565c0;margin-bottom:16px">'+head+'</div>'
    +'<p style="font-size:14px;margin:0 0 12px">Hello '+esc(inv.clientName||'')+',</p>'
    +'<p style="font-size:13px;line-height:1.6;margin:0 0 14px">Please find attached invoice <b>'+esc(inv.num||'')+'</b> for your '+esc(inv.contractType||'managed services')+' agreement. The full invoice is attached as a PDF.</p>'
    +'<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="font-size:13px;color:#6b7280;padding:2px 18px 2px 0">Invoice</td><td style="font-size:13px;font-weight:700">'+esc(inv.num||'')+'</td></tr>'
      +'<tr><td style="font-size:13px;color:#6b7280;padding:2px 18px 2px 0">Amount due</td><td style="font-size:15px;font-weight:800;color:#1565c0">'+money(inv.total!=null?inv.total:inv.amount)+'</td></tr>'
      +'<tr><td style="font-size:13px;color:#6b7280;padding:2px 18px 2px 0">Terms</td><td style="font-size:13px">Due upon receipt</td></tr></table>'
    +'<p style="font-size:12px;color:#6b7280;line-height:1.6;margin:0">Questions about this invoice? Reply to this email'+(billEmail?' or contact us at '+esc(billEmail):'')+'.</p>'
    +'<div style="margin-top:18px;padding-top:12px;border-top:1px solid #eef1f4;font-size:11px;color:#9aa4b2">'+esc(co.cname||'')+(co.cphone?' &middot; '+esc(co.cphone):'')+(billEmail?' &middot; '+esc(billEmail):'')+'</div>'
    +'</div>';
}

// Send ONE invoice. opts={ to:<actual send addr>, sandboxFor:<real client addr or null> }. Returns {ok,error}.
async function _sendMSInvoice(inv, opts){
  var s=DB.settings||{};
  if(!s.mgKey) return { ok:false, error:'Mailgun key not set (Settings → Email)' };
  var toAddr=opts && opts.to;
  if(!toAddr) return { ok:false, error:'No recipient email' };
  var _mgFromRaw = s.mgFrom || 'TCSS Invoicing <invoicing@tcss.com>';
  var domain = s.mgDomain || ((_mgFromRaw.match(/@([^>\s]+)/)||[])[1]) || 'tcss.com';
  var billEmail = _rcBillingEmail();
  try{
    await _rcEnsurePdfLibs();
    var div=document.createElement('div');
    div.style.cssText='position:fixed;left:-9999px;top:0;width:760px;background:#fff';
    div.innerHTML=_rcInvoiceHTML(inv);
    document.body.appendChild(div);
    var canvas=await html2canvas(div.firstChild||div,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
    document.body.removeChild(div);
    var jspdf=window.jspdf||window.jsPDF;
    var pdf=new (jspdf.jsPDF||jspdf)({orientation:'p',unit:'px',format:'a4'});
    var pageW=pdf.internal.pageSize.getWidth(), pageH=pdf.internal.pageSize.getHeight();
    var imgW=pageW, imgH=(canvas.height*pageW)/canvas.width, y=0;
    while(y<imgH){ if(y>0)pdf.addPage(); pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,-y,imgW,imgH); y+=pageH; }
    var pdfBlob=pdf.output('blob');
    var emailHTML=_rcEmailCoverHTML(inv, opts.sandboxFor||null);
    var fd=new FormData();
    fd.append('from', _mgFromRaw);
    fd.append('to', toAddr);
    if(billEmail) fd.append('h:Reply-To', billEmail);
    fd.append('subject', (opts.sandboxFor?'[SANDBOX] ':'')+'Invoice '+(inv.num||'')+' from '+(s.cname||'us'));
    if(s.logoDataUrl && /^data:/.test(s.logoDataUrl) && emailHTML.indexOf(s.logoDataUrl)>=0){
      try{ var b2=await(await fetch(s.logoDataUrl)).blob(); var mime=(typeof _imgMimeFromDataUrl==='function')?_imgMimeFromDataUrl(s.logoDataUrl):(b2.type||'image/png'); emailHTML=emailHTML.split(s.logoDataUrl).join('cid:invlogo'); fd.append('inline', new File([b2],'invlogo',{type:mime})); }catch(e){}
    }
    fd.append('html', emailHTML);
    fd.append('attachment', new File([pdfBlob], (inv.num||'Invoice')+'.pdf', {type:'application/pdf'}));
    fd.append('o:tracking','yes'); fd.append('o:tracking-opens','yes');
    fd.append('v:probid_type','invoice'); fd.append('v:probid_id', String(inv.id||inv.num));
    var res=await fetch('https://api.mailgun.net/v3/'+domain+'/messages',{method:'POST',headers:{'Authorization':'Basic '+btoa('api:'+s.mgKey)},body:fd});
    var data=await res.json().catch(function(){return {};});
    if(res.ok) return { ok:true, id:data.id };
    return { ok:false, error:(data.message||('Mailgun HTTP '+res.status)) };
  }catch(e){ return { ok:false, error:(e&&e.message)||String(e) }; }
}

// Build the list for a send, then open the confirmation dialog.
function rcOpenSendConfirm(mode){
  var ready=_rcReadyInvoices().filter(function(i){return i.status==='draft';});
  var list = (mode==='selected') ? ready.filter(function(i){return _rcSelected[i.id];}) : ready;
  if(!list.length){ if(typeof showToast==='function') showToast(mode==='selected'?'Nothing selected':'Nothing ready to send','info',2000); return; }
  var sandbox=_rcSandboxOn();
  // When LIVE, invoices with no client email can't send — separate them out.
  var noEmail = sandbox ? [] : list.filter(function(i){return !i.clientEmail;});
  var sendable = sandbox ? list : list.filter(function(i){return !!i.clientEmail;});
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var total=sendable.reduce(function(s,i){return s+_rcInvTotal(i);},0);
  var sandTo=_rcSandboxTo();

  var rows=sendable.map(function(i){
    var dest = sandbox ? sandTo : i.clientEmail;
    return '<tr><td style="padding:6px 10px;font-weight:700;color:#1565c0;font-size:12px">'+esc(i.num||'')+'</td>'
      +'<td style="padding:6px 10px;font-size:12px">'+esc(i.clientName||'')+'</td>'
      +'<td style="padding:6px 10px;font-size:12px;color:#546e7a">'+esc(dest||'—')+'</td>'
      +'<td style="padding:6px 10px;font-size:12px;text-align:right;font-weight:700">$'+_rcInvTotal(i).toFixed(2)+'</td></tr>';
  }).join('');

  var banner = sandbox
    ? '<div style="background:#fff3e0;border:1px solid #ffcc80;color:#e65100;padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:14px">'
        +'<b>🧪 Sandbox is ON.</b> All '+sendable.length+' email'+(sendable.length!==1?'s':'')+' will go to <b>'+esc(sandTo)+'</b> — <b>no client will receive anything.</b>'
        +'<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;cursor:pointer"><input type="checkbox" onchange="rcSetSandbox(!this.checked)" style="width:16px;height:16px"> I’m ready to send to REAL clients (turn sandbox off)</label>'
      +'</div>'
    : '<div style="background:#ffebee;border:1px solid #ef9a9a;color:#c62828;padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:14px">'
        +'<b>⚠ LIVE — sandbox is OFF.</b> These '+sendable.length+' invoice'+(sendable.length!==1?'s':'')+' will be emailed to <b>real clients</b>. This cannot be undone.'
        +'<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12px;cursor:pointer"><input type="checkbox" onchange="rcSetSandbox(this.checked)" style="width:16px;height:16px"> Switch back to sandbox (safe) mode</label>'
      +'</div>';

  var warn = noEmail.length
    ? '<div style="background:#fff8e1;border:1px solid #ffe0b2;color:#8a6d3b;padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:14px">'+noEmail.length+' invoice'+(noEmail.length!==1?'s':'')+' skipped — no client email on file: '+esc(noEmail.map(function(i){return i.num;}).join(', '))+'</div>'
    : '';

  var ov=document.getElementById('rc-send-confirm');
  if(!ov){ ov=document.createElement('div'); ov.id='rc-send-confirm'; document.body.appendChild(ov); }
  ov.style.cssText='position:fixed;inset:0;background:rgba(13,27,42,.55);z-index:10001;overflow-y:auto;display:flex;align-items:flex-start;justify-content:center;padding:28px 16px';
  ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:640px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden;font-family:Arial,sans-serif">'
    +'<div style="background:#0d1b2a;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="color:#fff;font-size:15px;font-weight:800">✉ Send '+sendable.length+' invoice'+(sendable.length!==1?'s':'')+' &nbsp;·&nbsp; $'+total.toFixed(2)+'</div>'
      +'<button onclick="_rcCloseSendConfirm()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer">× Cancel</button>'
    +'</div>'
    +'<div style="padding:18px 20px">'+banner+warn
      +'<div style="max-height:260px;overflow:auto;border:1px solid #eef2f6;border-radius:8px"><table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:#f5f7fa;position:sticky;top:0"><th style="padding:7px 10px;text-align:left;font-size:10px;color:#90a4ae;text-transform:uppercase">Invoice</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:#90a4ae;text-transform:uppercase">Client</th><th style="padding:7px 10px;text-align:left;font-size:10px;color:#90a4ae;text-transform:uppercase">Sends to</th><th style="padding:7px 10px;text-align:right;font-size:10px;color:#90a4ae;text-transform:uppercase">Amount</th></tr></thead>'
        +'<tbody>'+rows+'</tbody></table></div>'
      +'<div style="margin-top:18px;display:flex;justify-content:flex-end;gap:10px">'
        +'<button onclick="_rcCloseSendConfirm()" style="background:#eceff1;color:#546e7a;border:none;border-radius:6px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer">Cancel</button>'
        +'<button id="rc-send-go" onclick="rcDoSend()" '+(sendable.length?'':'disabled')+' style="background:'+(sandbox?'#1565c0':'#c62828')+';color:#fff;border:none;border-radius:6px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer">'+(sandbox?'🧪 Send to sandbox':'✉ Send to clients')+' ('+sendable.length+')</button>'
      +'</div>'
    +'</div></div>';
  // stash the sendable list for rcDoSend
  _rcPendingSend = sendable.slice();
}
var _rcPendingSend = [];
function _rcCloseSendConfirm(){ var o=document.getElementById('rc-send-confirm'); if(o){ o.style.display='none'; o.innerHTML=''; } }
function rcSetSandbox(on){
  (DB.settings=DB.settings||{}).msSendSandbox = !!on;
  try{ if(typeof saveDB==='function') saveDB(); }catch(e){}
  if(typeof showToast==='function') showToast(on?'Sandbox ON — sends go to the office inbox':'Sandbox OFF — LIVE sends to clients','info',2500);
  // re-open the confirm with the new mode (keep the same list basis)
  _rcCloseSendConfirm();
  rcOpenSendConfirm(_rcSelectedCount()?'selected':'all');
}

async function rcDoSend(){
  if(_rcSendInFlight) return;
  var list=(_rcPendingSend||[]).slice();
  if(!list.length){ _rcCloseSendConfirm(); return; }
  _rcSendInFlight=true;
  var sandbox=_rcSandboxOn(), sandTo=_rcSandboxTo();
  var goBtn=document.getElementById('rc-send-go');
  var ok=0, fail=0, failMsgs=[];
  for(var k=0;k<list.length;k++){
    var inv=list[k];
    if(goBtn) goBtn.textContent='Sending '+(k+1)+' of '+list.length+'…';
    var realTo = inv.clientEmail || '';
    var sendTo = sandbox ? sandTo : realTo;
    var r = await _sendMSInvoice(inv, { to:sendTo, sandboxFor: sandbox ? (realTo||'(no client email)') : null });
    if(r.ok){
      ok++;
      inv.status='sent'; inv.sentAt=new Date().toISOString();
      inv.emailedTo=sendTo; inv.emailedAt=inv.sentAt;
      if(sandbox) inv.sandboxSent=true;
      if(typeof auditLog==='function') auditLog('ms_invoice_sent','invoice',inv.id,{ new:{num:inv.num,to:sendTo,realClient:realTo,total:_rcInvTotal(inv),sandbox:sandbox}, note:'Invoice '+(inv.num||'')+' emailed to '+sendTo+(sandbox?' (SANDBOX — real client '+(realTo||'n/a')+')':'') });
      try{ delete _rcSelected[inv.id]; }catch(e){}
      _rcSaveInvoice(inv);
    } else { fail++; failMsgs.push((inv.num||'?')+': '+r.error); }
  }
  _rcSendInFlight=false;
  _rcCloseSendConfirm();
  renderRecurring();
  if(typeof showToast==='function'){
    if(fail===0) showToast('✅ '+ok+' invoice'+(ok!==1?'s':'')+' sent'+(sandbox?' (sandbox → '+sandTo+')':''),'success',4500);
    else showToast(ok+' sent, '+fail+' failed: '+failMsgs.slice(0,2).join(' | '),'error',7000);
  }
}

function renderReadyToSend() {
  var inv = _rcReadyInvoices();
  if (!inv.length) return '';
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var ready = inv.filter(function(i){return i.status==='draft';});
  var held  = inv.filter(function(i){return i.status==='held';});
  var readyTotal = ready.reduce(function(s,i){return s+_rcInvTotal(i);},0);
  var today = (typeof getTodayISO==='function')?getTodayISO():new Date().toISOString().slice(0,10);
  // oldest ready invoice age (days) — the "don't let it rot" nudge
  var oldest = ready.reduce(function(m,i){var d=i.invoiceDate||i.runDate||today; return (d<m)?d:m;}, today);
  var ageDays = Math.max(0, Math.round((new Date(today)-new Date(oldest))/86400000));
  var sandboxOn = _rcSandboxOn();
  var selCount  = _rcSelectedCount();
  var allSel    = ready.length>0 && ready.every(function(i){return _rcSelected[i.id];});

  // group the READY ones by run date (keeps the run-batch grouping)
  var groups = {};
  ready.forEach(function(i){ var k=i.invoiceDate||i.runDate||'—'; (groups[k]=groups[k]||[]).push(i); });
  var keys = Object.keys(groups).sort();

  function rowHtml(i, isHeld){
    var tax = (i.taxAmt!=null)?parseFloat(i.taxAmt):0;
    return '<div style="display:grid;grid-template-columns:26px 84px 1fr 112px 250px;gap:10px;align-items:center;padding:9px 14px;border-bottom:1px solid #f0f4f8;font-size:12px">'
      +'<div style="text-align:center">'+(isHeld?'':'<input type="checkbox" onchange="rcToggleSel(\''+esc(i.id)+'\',this.checked)" '+(_rcSelected[i.id]?'checked':'')+' style="width:16px;height:16px;cursor:pointer">')+'</div>'
      +'<div style="font-weight:700;color:#1565c0">'+esc(i.num||'')+'</div>'
      +'<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span style="font-weight:600">'+esc(i.clientName||'')+'</span>'
        +(i.rcNumber?'<span style="color:#90a4ae"> · '+esc(i.rcNumber)+'</span>':'')+'</div>'
      +'<div style="text-align:right;font-weight:800;color:#0d1b2a">$'+_rcInvTotal(i).toFixed(2)
        +(tax>0?'<div style="font-size:10px;font-weight:600;color:#90a4ae">incl $'+tax.toFixed(2)+' tax</div>':'')+'</div>'
      +'<div style="text-align:right;white-space:nowrap">'
        +'<button class="btn btn-sm" style="font-size:11px;padding:4px 9px;background:#e3f2fd;color:#1565c0;border:1px solid #bbdefb" onclick="editMSInvoice(\''+esc(i.id)+'\')">&#9998; Edit</button> '
        +'<button class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 9px" onclick="printRCInvoice(\''+esc(i.id)+'\')">&#128065; Preview</button> '
        +(isHeld
          ? '<button class="btn btn-sm" style="font-size:11px;padding:4px 9px;background:#2e7d32;color:#fff;border:none" onclick="rcReleaseInvoice(\''+esc(i.id)+'\')">&#8635; Release</button>'
          : '<button class="btn btn-sm" style="font-size:11px;padding:4px 9px;background:#fff3e0;color:#e65100;border:1px solid #ffe0b2" onclick="rcHoldInvoice(\''+esc(i.id)+'\')">&#9208; Hold</button>')
      +'</div>'
    +'</div>';
  }

  var html = '<div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:18px;overflow:hidden;border:1px solid #e3f2fd">'
    // banner
    +'<div style="background:linear-gradient(135deg,#1565c0,#1976d2);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
      +'<div style="color:#fff">'
        +'<div style="font-size:15px;font-weight:800">&#128184; '+ready.length+' invoice'+(ready.length!==1?'s':'')+' ready to send'
          +'<span style="font-weight:700;opacity:.9"> &nbsp;·&nbsp; $'+readyTotal.toFixed(2)+'</span></div>'
        +'<div style="font-size:11px;color:#bbdefb;margin-top:2px">Auto-generated drafts — review, then send. Nothing goes to a client until you do.'
          +(ageDays>=3?' <b style="color:#fff3e0">Oldest has been waiting '+ageDays+' days.</b>':'')+'</div>'
      +'</div>'
      +'<div style="display:flex;align-items:center;gap:10px">'
        +(held.length?'<div style="background:rgba(255,255,255,.15);color:#fff;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700">'+held.length+' on hold</div>':'')
        +'<button onclick="printMSReadyControlSheet()" style="background:#fff;color:#1565c0;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">&#128438; Control sheet</button>'
      +'</div>'
    +'</div>'
    // action bar: select-all + send controls + sandbox indicator
    +'<div style="padding:9px 14px;background:#eaf2fb;border-bottom:1px solid #d6e4f5;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
      +'<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#1565c0;font-weight:700;cursor:pointer"><input type="checkbox" onchange="rcSelectAllReady(this.checked)" '+(allSel?'checked':'')+' style="width:16px;height:16px;cursor:pointer"> Select all</label>'
      +'<button id="rc-send-selected" onclick="rcOpenSendConfirm(\'selected\')" style="display:'+(selCount>0?'inline-block':'none')+';background:#1565c0;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">✉ Send selected ('+selCount+')</button>'
      +(sandboxOn
        ? '<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700">🧪 Sandbox ON → office inbox</span>'
        : '<span style="background:#ffebee;color:#c62828;border:1px solid #ef9a9a;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700">⚠ LIVE → real clients</span>')
      +'<span style="flex:1"></span>'
      +'<button onclick="rcOpenSendConfirm(\'all\')" style="background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">✉ Send all ('+ready.length+')</button>'
    +'</div>';

  keys.forEach(function(k){
    var grp = groups[k];
    var gTot = grp.reduce(function(s,i){return s+_rcInvTotal(i);},0);
    html += '<div style="padding:8px 14px;background:#f5f8fc;border-bottom:1px solid #e0e7ef;font-size:11px;font-weight:700;color:#546e7a;display:flex;justify-content:space-between">'
      +'<span>Run of '+esc(k)+' · '+grp.length+' invoice'+(grp.length!==1?'s':'')+'</span><span>$'+gTot.toFixed(2)+'</span></div>';
    grp.forEach(function(i){ html += rowHtml(i,false); });
  });

  if (held.length){
    html += '<div style="padding:8px 14px;background:#fff8e1;border-top:2px solid #ffe0b2;border-bottom:1px solid #ffe0b2;font-size:11px;font-weight:700;color:#e65100">&#9208; On Hold ('+held.length+') — released invoices rejoin the ready list</div>';
    held.forEach(function(i){ html += rowHtml(i,true); });
  }

  html += '<div style="padding:10px 14px;background:#fafbfc;font-size:11px;color:#90a4ae;text-align:center">Review each draft, hold any that aren’t ready, then <b>Send</b>. '
    +(sandboxOn?'Sandbox is ON — test sends go to your office inbox, not clients.':'<b style="color:#c62828">LIVE mode — sends go to real clients.</b>')+'</div>'
    +'</div>';
  return html;
}

function renderRecurring() {
  try {
    _rcCheckExpirations();
    var list = document.getElementById('rc-list');
    if (!list) return;

    var search = ((document.getElementById('rc-search')||{}).value||'').trim().toLowerCase();
    var fType  = (document.getElementById('rc-filter-type')||{}).value||'';
    var fStatus= (document.getElementById('rc-filter-status')||{}).value||'';
    var today  = getTodayISO();

    // Populate type filter
    var typeEl = document.getElementById('rc-filter-type');
    if (typeEl && typeEl.options.length <= 1) {
      _getMSTypes().forEach(function(t){
        var o=document.createElement('option'); o.value=t; o.textContent=t; typeEl.appendChild(o);
      });
    }

    var all = (DB.recurringContracts||[]);
    var contracts = all.slice();
    if (search) contracts = contracts.filter(function(c){ return (c.client+c.type+c.number).toLowerCase().includes(search); });
    if (fType)   contracts = contracts.filter(function(c){ return c.type===fType; });
    if (fStatus) contracts = contracts.filter(function(c){ return c.status===fStatus; });

    var dueCount    = all.filter(function(c){ return _rcIsDue(c,today); }).length;
    var activeCount = all.filter(function(c){ return c.status==='active'; }).length;

    // Summary cards
    var summary = '<div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">'
      +'<div style="background:#fff;border-radius:10px;padding:12px 20px;box-shadow:0 1px 4px rgba(0,0,0,.06)">'
        +'<div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase">Active Contracts</div>'
        +'<div style="font-size:24px;font-weight:800;color:#1565c0">'+activeCount+'</div>'
      +'</div>'
      +'<div style="background:#fff;border-radius:10px;padding:12px 20px;box-shadow:0 1px 4px rgba(0,0,0,.06)">'
        +'<div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase">Due This Run</div>'
        +'<div style="font-size:24px;font-weight:800;color:'+(dueCount>0?'#c62828':'#2e7d32')+'">'+dueCount+'</div>'
      +'</div>'
      +(dueCount>0?'<button class="btn btn-primary" onclick="rcGenerateNow()">&#128184; Generate due invoices</button>':'')
    +'</div>';

    // Ready-to-Send tray sits above everything — the drafts the auto-biller produced, waiting for review.
    summary = renderReadyToSend() + summary;

    if (!contracts.length) {
      list.innerHTML = summary+'<div style="background:#fff;border-radius:10px;padding:40px;text-align:center;color:#90a4ae;font-size:14px">No managed service contracts. Click <b>+ New Contract</b> or <b>Load Test Data</b>.</div>';
      return;
    }

    // Build table using DOM to avoid all escaping issues
    var wrap = document.createElement('div');
    wrap.style.cssText = 'background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:auto';

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:grid;grid-template-columns:24px 80px 1fr 120px 90px 110px 110px 110px 90px 80px 24px;padding:9px 16px;background:#f5f7fa;border-bottom:2px solid #e0e7ef;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;border-radius:10px 10px 0 0;white-space:nowrap';
    hdr.innerHTML = '<span></span><span>Number</span><span>Client</span><span>Type</span><span>Cycle</span><span>Next Billing</span><span>Last Invoiced</span><span>Yearly Value</span><span>Expires</span><span>Status</span><span></span>';
    wrap.appendChild(hdr);

    contracts.forEach(function(c) {
      var row = document.createElement('div');
      var stColors = {active:'#2e7d32',paused:'#f57c00',cancelled:'#c62828',expired:'#c62828'};
      var stColor  = stColors[c.status]||'#546e7a';
      var isDue    = _rcIsDue(c,today);
      var isOver   = c.nextBillingDate&&c.nextBillingDate<today&&c.status==='active';
      var dnb      = !!c.doNotBill;
      var yearly   = _rcYearlyPrice(c);
      var cycleMap = {monthly:'Monthly',quarterly:'Quarterly',biannual:'Bi-Annual',annual:'Annual'};

      row.className = 'rc-list-row';
      row.dataset.rcid = c.id;
      row.draggable = true;
      row.style.cssText = 'display:grid;grid-template-columns:24px 80px 1fr 120px 90px 110px 110px 110px 90px 80px 24px;padding:10px 16px;border-bottom:1px solid #f0f4f8;align-items:center;cursor:pointer;background:'+(dnb?'#fffde7':'');

      row.onmouseover = function(){ this.style.background='#f0f4ff'; };
      row.onmouseout  = function(){ this.style.background=dnb?'#fffde7':''; };
      row.onclick     = function(){ openRCDetail(c.id); };
      row.ondragstart = function(e){ rcDragStart(e,c.id); };
      row.ondragover  = function(e){ rcDragOver(e); };
      row.ondrop      = function(e){ rcDrop(e,c.id); };
      row.ondragend   = function(e){ rcDragEnd(e); };

      var nextHtml = dnb?'<span style="color:#f57c00;font-weight:700">\uD83D\uDEAB Skip</span>'
        :isOver?'<span style="color:#c62828">\u26A0 '+(c.nextBillingDate||'')+'</span>'
        :isDue ?'<span style="color:#e65100">\u25CF '+(c.nextBillingDate||'')+'</span>'
        :(c.nextBillingDate||'\u2014');

      row.innerHTML =
        '<div style="cursor:grab;color:#c8d0db;text-align:center" onclick="event.stopPropagation()">\u2195</div>'
        +'<div style="font-weight:700;color:#1565c0;font-size:12px">'+(c.number||'')+(dnb?' \uD83D\uDEAB':'')+'</div>'
        +'<div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(c.client||'')+'</div>'
        +'<div style="font-size:11px;color:#546e7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(c.type||'')+'</div>'
        +'<div style="font-size:11px">'+(cycleMap[c.billingCycle]||c.billingCycle||'')+'</div>'
        +'<div style="font-size:11px;font-weight:600">'+nextHtml+'</div>'
        +'<div style="font-size:11px;color:#546e7a">'+(c.lastBilledDate||'\u2014')+'</div>'
        +'<div style="font-size:12px;font-weight:700;color:#2e7d32">$'+yearly.toFixed(2)+'</div>'
        +'<div style="font-size:11px;color:'+(c.contractEnd&&c.contractEnd<today?'#c62828':'#546e7a')+'">'+(c.contractEnd||'Open')+'</div>'
        +'<div><span style="background:'+stColor+'22;color:'+stColor+';padding:3px 8px;border-radius:5px;font-size:10px;font-weight:700;text-transform:capitalize">'+(c.status||'')+'</span></div>'
        +'<div style="color:#90a4ae;font-size:16px;cursor:pointer" onclick="event.stopPropagation();rcMenu(\''+c.id+'\');">\u22EE</div>';

      wrap.appendChild(row);
    });

    list.innerHTML = summary;
    list.appendChild(wrap);

  } catch(err) {
    console.error('[Managed Services] renderRecurring error:', err);
    var list2 = document.getElementById('rc-list');
    if (list2) list2.innerHTML = '<div style="padding:20px;color:#c62828;background:#fff;border-radius:10px">Error rendering contracts: '+err.message+'</div>';
  }
}

function _rcLineTotal2(c) {
  return (c.lineItems||[]).reduce(function(s,i){
    return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));
  },0);
}

function _rcYearlyPrice(c) {
  var cycles = _getMSCycles();
  var months = (cycles[c.billingCycle]||{months:1}).months;
  var perCycle = _rcLineTotal2(c);
  return months > 0 ? perCycle * (12 / months) : perCycle * 12;
}

function _rcNextDates(c, count) {
  var dates = [];
  var d = c.nextBillingDate;
  if (!d) return dates;
  for (var i=0; i<(count||4); i++) {
    dates.push(d);
    d = _rcAdvanceDate(d, c.billingCycle);
  }
  return dates;
}

// ── Open new/edit modal ────────────────────────────────────────────────────────
function openNewRC() {
  _rcCurrentId = null;
  // Populate type select
  var rcTypeSel = document.getElementById('rc-type');
  if (rcTypeSel) { rcTypeSel.innerHTML = '<option value="">Select Type</option>'; _getMSTypes().forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; rcTypeSel.appendChild(o); }); }
  _rcLineItems = [{id:'li-'+Date.now(),desc:'',qty:1,unitPrice:0}];
  document.getElementById('rc-modal-title').textContent = 'New Managed Service Contract';
  document.getElementById('rc-number').value = _rcNextNumber();
  document.getElementById('rc-client').value = '';
  rcPopulateCustomerSelect(null);
  document.getElementById('rc-type').value = '';
  document.getElementById('rc-cycle').value = 'monthly';
  document.getElementById('rc-billing-day').value = '1';
  document.getElementById('rc-status').value = 'active';
  document.getElementById('rc-auto-renew').checked = true;
  var dnbEl2 = document.getElementById('rc-do-not-bill'); if(dnbEl2) dnbEl2.checked = false;
  document.getElementById('rc-delivery').value = 'email';
  document.getElementById('rc-client-email').value = '';
  document.getElementById('rc-contract-start').value = getTodayISO();
  document.getElementById('rc-contract-end').value = '';
  document.getElementById('rc-next-billing').value = _firstOfNextMonth();
  document.getElementById('rc-notes').value = '';
  _renderRCLineItems();
  openModal('modal-rc');
}

function openRCModal(id) {
  var c = (DB.recurringContracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  _rcCurrentId = id;
  _rcLineItems = (c.lineItems||[]).map(function(i){return Object.assign({},i);});
  if (!_rcLineItems.length) _rcLineItems = [{id:'li-'+Date.now(),desc:'',qty:1,unitPrice:0}];
  document.getElementById('rc-modal-title').textContent = c.number||'Managed Service Contract';
  document.getElementById('rc-number').value = c.number||'';
  document.getElementById('rc-client').value = c.client||'';
  rcPopulateCustomerSelect(c.customerId||null);
  var rcTypeSel2 = document.getElementById('rc-type');
  if (rcTypeSel2) {
    rcTypeSel2.innerHTML = '<option value="">Select Type</option>';
    _getMSTypes().forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; rcTypeSel2.appendChild(o); });
    rcTypeSel2.value = c.type||'';
  }
  document.getElementById('rc-cycle').value = c.billingCycle||'monthly';
  document.getElementById('rc-billing-day').value = c.billingDay||1;
  document.getElementById('rc-status').value = c.status||'active';
  document.getElementById('rc-auto-renew').checked = !!c.autoRenew;
  var dnbEl = document.getElementById('rc-do-not-bill'); if(dnbEl) dnbEl.checked = !!c.doNotBill;
  document.getElementById('rc-delivery').value = c.deliveryMethod||'email';
  document.getElementById('rc-client-email').value = c.clientEmail||'';
  document.getElementById('rc-contract-start').value = c.contractStart||'';
  document.getElementById('rc-contract-end').value = c.contractEnd||'';
  document.getElementById('rc-next-billing').value = c.nextBillingDate||'';
  document.getElementById('rc-notes').value = c.notes||'';
  _renderRCLineItems();
  openModal('modal-rc');
}

function _firstOfNextMonth() {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth()+1);
  return d.toISOString().split('T')[0];
}

// ── Line items ─────────────────────────────────────────────────────────────────
function _renderRCLineItems() {
  var wrap = document.getElementById('rc-line-items');
  if (!wrap) return;
  var subtotal = _rcLineItems.reduce(function(s,i){return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));},0);
  var cycleLabel = (RC_CYCLES[document.getElementById('rc-cycle').value||'monthly']||{label:'Monthly'}).label;

  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<thead><tr style="background:#f5f7fa">'
      +'<th style="width:28px"></th>'
      +'<th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;width:46%">Description</th>'
      +'<th style="padding:7px 8px;text-align:center;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;width:10%">Qty</th>'
      +'<th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;width:18%">Unit Price</th>'
      +'<th style="padding:7px 8px;text-align:right;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;width:18%">Line Total</th>'
      +'<th style="width:4%"></th>'
    +'</tr></thead><tbody>';

  _rcLineItems.forEach(function(item,idx){
    var lineTotal = parseFloat(item.qty||1) * parseFloat(item.unitPrice||0);
    html += '<tr class="rc-li-row" draggable="true"'
      +' ondragstart="rcLiDragStart(event,'+idx+')" ondragover="rcLiDragOver(event)" ondrop="rcLiDrop(event,'+idx+')" ondragend="rcLiDragEnd(event)"'
      +' style="border-bottom:1px solid #f0f0f0">'
      +'<td style="padding:6px 4px;text-align:center;cursor:grab;color:#c8d0db;font-size:18px" title="Drag to reorder">&#8661;</td>'
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px" placeholder="Description" value="'+escHtml(item.desc||'')+ '" oninput="_rcUpdateLine('+idx+',\'desc\',this.value)"></td>'
      +'<td style="padding:6px 8px" ondragstart="event.stopPropagation()"><input class="form-control" style="font-size:12px;text-align:center" type="number" min="1" step="1" value="'+parseFloat(item.qty||1)+'" oninput="_rcUpdateLine('+idx+',\'qty\',this.value)"></td>'
      +'<td style="padding:6px 4px" ondragstart="event.stopPropagation()"><input class="form-control" style="font-size:12px;text-align:right" type="number" min="0" step="0.01" placeholder="0.00" value="'+parseFloat(item.unitPrice||0).toFixed(2)+'" oninput="_rcUpdateLine('+idx+',\'unitPrice\',this.value)" onblur="this.value=parseFloat(this.value||0).toFixed(2)"></td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600">$'+lineTotal.toFixed(2)+'</td>'
      +'<td style="padding:6px 8px;text-align:center"><span onclick="_rcRemoveLine('+idx+')" style="cursor:pointer;color:#c62828;font-size:16px;font-weight:700">&#215;</span></td>'
      +'</tr>';
  });

  html += '</tbody><tfoot><tr style="background:#e3f2fd">'
    +'<td colspan="4" style="padding:8px;font-weight:700;text-align:right;font-size:12px">'+cycleLabel+' Total:</td>'
    +'<td style="padding:8px;text-align:right;font-weight:800;font-size:14px;color:#1565c0">$'+subtotal.toFixed(2)+'</td>'
    +'<td></td></tr></tfoot></table>';

  wrap.innerHTML = html;
}

function _rcUpdateLine(idx, field, val) {
  if (_rcLineItems[idx]) _rcLineItems[idx][field] = val;
  // Refresh totals without re-rendering inputs (just update total cell)
  var subtotal = _rcLineItems.reduce(function(s,i){return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));},0);
  var cycleLabel = (RC_CYCLES[document.getElementById('rc-cycle').value||'monthly']||{label:'Monthly'}).label;
  // Update line total cells
  var rows = document.querySelectorAll('#rc-line-items tbody tr');
  rows.forEach(function(row,i){
    var item = _rcLineItems[i];
    if (item) {
      var cells = row.querySelectorAll('td');
      if (cells[4]) cells[4].textContent = '$'+(parseFloat(item.qty||1)*parseFloat(item.unitPrice||0)).toFixed(2);
    }
  });
  // Update footer total
  var footer = document.querySelector('#rc-line-items tfoot td:nth-child(2)');
  if (footer) footer.textContent = '$'+subtotal.toFixed(2);
  var footerLabel = document.querySelector('#rc-line-items tfoot td:nth-child(1)');
  if (footerLabel) footerLabel.textContent = cycleLabel+' Total:';
}

function _rcRemoveLine(idx) {
  if (_rcLineItems.length <= 1) { showToast('At least one line item required','warning',2000); return; }
  _rcLineItems.splice(idx, 1);
  _renderRCLineItems();
}

function rcAddLine() {
  _rcLineItems.push({id:'li-'+Date.now(),desc:'',qty:1,unitPrice:0});
  _renderRCLineItems();
  // Focus the new description input
  setTimeout(function(){
    var rows = document.querySelectorAll('#rc-line-items tbody tr');
    if (rows.length) {
      var last = rows[rows.length-1];
      var input = last.querySelector('input');
      if (input) input.focus();
    }
  },50);
}

// ── Save contract ──────────────────────────────────────────────────────────────
function saveRC() {
  var client = document.getElementById('rc-client').value.trim();
  var type   = document.getElementById('rc-type').value;
  if (!client || !type) { showToast('Client and Type are required','warning',2500); return; }

  if (!DB.recurringContracts) DB.recurringContracts = [];
  var isNew = !_rcCurrentId;
  var id = _rcCurrentId || 'rc-'+Date.now();

  var data = {
    id:             id,
    number:         document.getElementById('rc-number').value.trim(),
    client:         client,
    type:           type,
    billingCycle:   document.getElementById('rc-cycle').value,
    billingDay:     parseInt(document.getElementById('rc-billing-day').value)||1,
    status:         document.getElementById('rc-status').value,
    autoRenew:      document.getElementById('rc-auto-renew').checked,
    deliveryMethod: document.getElementById('rc-delivery').value,
    clientEmail:    document.getElementById('rc-client-email').value.trim(),
    contractStart:  document.getElementById('rc-contract-start').value,
    contractEnd:    document.getElementById('rc-contract-end').value,
    nextBillingDate:document.getElementById('rc-next-billing').value,
    notes:          document.getElementById('rc-notes').value.trim(),
    lineItems:      _rcLineItems.filter(function(i){return (i.desc||'').trim();}).map(function(i){
      return {id:i.id||'li-'+Date.now(),desc:i.desc,qty:parseFloat(i.qty||1),unitPrice:parseFloat(i.unitPrice||0)};
    }),
    lastBilledDate: isNew ? null : ((DB.recurringContracts.find(function(c){return c.id===id;})||{}).lastBilledDate||null),
    createdAt:      isNew ? new Date().toISOString() : ((DB.recurringContracts.find(function(c){return c.id===id;})||{}).createdAt||new Date().toISOString()),
    priceHistory:   isNew ? [] : ((DB.recurringContracts.find(function(c){return c.id===id;})||{}).priceHistory||[]),
    doNotBill:      !!(document.getElementById('rc-do-not-bill')&&document.getElementById('rc-do-not-bill').checked),
    sortOrder:      isNew ? (DB.recurringContracts||[]).length : ((DB.recurringContracts.find(function(c){return c.id===id;})||{}).sortOrder||0),
  };
  // Check for price change and log it
  if (!isNew) { var _oldC = (DB.recurringContracts||[]).find(function(c){return c.id===id;}); _rcCheckPriceChange(_oldC, data); }

  if (isNew) { DB.recurringContracts.push(data); }
  else {
    var idx = DB.recurringContracts.findIndex(function(c){return c.id===id;});
    if (idx>=0) DB.recurringContracts[idx]=data;
  }

  saveDB();
  _pushRCToSupabase(data);
  closeModal('modal-rc');
  renderRecurring();
  showToast('Contract '+(data.number||'')+(isNew?' created':' updated')+' ✓','success',2500);
}

// ── Delete ─────────────────────────────────────────────────────────────────────
function rcMenu(id) {
  var c = (DB.recurringContracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  if (typeof _canDeleteOfficeRecords==='function' && !_canDeleteOfficeRecords()) { showToast('Only owner, manager, or office staff can delete contracts','error'); return; }
  if (!confirm('Delete managed service contract '+c.number+' for '+c.client+'?\nThis cannot be undone.')) return;
  DB.recurringContracts = (DB.recurringContracts||[]).filter(function(x){return x.id!==id;});
  // Single-writer delete: tombstone + hand off to pushAllToCloud (reliable .select('id')
  // delete, tombstone cleared only on confirm). Old fire-and-forget delete could be
  // silently RLS-blocked and resurrect on pull. (SF-5)
  if(!DB.deletedIds)DB.deletedIds={};
  if(!DB.deletedIds.recurringContracts)DB.deletedIds.recurringContracts=[];
  if(DB.deletedIds.recurringContracts.indexOf(id)<0)DB.deletedIds.recurringContracts.push(id);
  saveDB();
  if (typeof _sb!=='undefined'&&_sb&&typeof _currentUser!=='undefined'&&_currentUser&&typeof pushAllToCloud==='function') setTimeout(pushAllToCloud,300);
  renderRecurring();
  showToast('Contract deleted','info',2000);
}

// ── BILLING RUN ────────────────────────────────────────────────────────────────
function openBillingRun() {
  var today = getTodayISO();
  document.getElementById('rc-run-date').value = today;
  // Default invoice date to 1st of current month
  var d = new Date();
  d.setDate(1);
  document.getElementById('rc-invoice-date').value = d.toISOString().split('T')[0];
  renderBillingRunPreview(today);
  openModal('modal-billing-run');
}

function renderBillingRunPreview(runDate) {
  // Show all due contracts — checkboxes let user select which to run
  var due = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c, runDate); });
  var preview = document.getElementById('rc-run-preview');
  if (!preview) return;

  if (!due.length) {
    preview.innerHTML = '<div style="text-align:center;padding:32px;color:#90a4ae;font-size:14px">No contracts due on this date.</div>';
    document.getElementById('rc-run-btn').disabled = true;
    return;
  }
  document.getElementById('rc-run-btn').disabled = false;

  // Group by type for summary pills
  var byType = {};
  due.forEach(function(c){ var t=c.type||'Other'; if(!byType[t]) byType[t]=[]; byType[t].push(c); });

  var html = '';

  // Summary pills — clickable to check/uncheck all of that type
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  Object.keys(byType).forEach(function(type){
    var cs = byType[type];
    var total = cs.reduce(function(s,c){return s+_rcLineTotal2(c);},0);
    html += '<div class="rc-type-pill" data-type="'+escHtml(type)+'" onclick="rcRunToggleType(this.dataset.type)" style="background:#e3f2fd;border-radius:8px;padding:8px 14px;cursor:pointer">'
      +'<div style="font-size:11px;font-weight:700;color:#1565c0">'+escHtml(type)+'</div>'
      +'<div style="font-size:12px;font-weight:800;color:#0d1b2a">'+cs.length+' · $'+total.toFixed(2)+'</div>'
    +'</div>';
  });
  html += '</div>';

  // Select all / none controls
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:8px 10px;background:#f5f7fa;border-radius:8px">'
    +'<label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer">'
      +'<input type="checkbox" id="rc-select-all" onchange="rcRunSelectAll(this.checked)" checked style="width:15px;height:15px"> Select All</label>'
    +'<span style="font-size:11px;color:#546e7a">— or click type pills / individual rows to choose which contracts to run</span>'
  +'</div>';

  // Detail table with checkboxes
  html += '<div style="max-height:340px;overflow-y:auto;border:1px solid #e0e7ef;border-radius:8px">'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<thead style="position:sticky;top:0;z-index:1"><tr style="background:#0d1b2a">'
      +'<th style="padding:8px;width:32px"></th>'
      +'<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Contract</th>'
      +'<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Client</th>'
      +'<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Type</th>'
      +'<th style="padding:8px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Cycle</th>'
      +'<th style="padding:8px;text-align:right;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Amount</th>'
      +'<th style="padding:8px;text-align:center;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase">Delivery</th>'
    +'</tr></thead><tbody>';

  due.forEach(function(c){
    var amt = _rcLineTotal2(c);
    html += '<tr class="rc-run-row" data-rcid="'+escHtml(c.id)+'" data-type="'+escHtml(c.type||'')+'" '
      +'style="border-bottom:1px solid #f0f0f0;cursor:pointer" '
      +'onclick="rcRunToggleRow(this)">'
      +'<td style="padding:8px;text-align:center" onclick="event.stopPropagation()">'
        +'<input type="checkbox" class="rc-run-chk" data-rcid="'+escHtml(c.id)+'" checked onchange="rcRunUpdateTotal()" style="width:15px;height:15px;cursor:pointer">'
      +'</td>'
      +'<td style="padding:8px;font-weight:700;color:#1565c0">'+escHtml(c.number||'')+'</td>'
      +'<td style="padding:8px;font-weight:600">'+escHtml(c.client||'')+'</td>'
      +'<td style="padding:8px;color:#546e7a;font-size:11px">'+escHtml(c.type||'')+'</td>'
      +'<td style="padding:8px;color:#546e7a;font-size:11px">'+escHtml((RC_CYCLES[c.billingCycle]||{label:c.billingCycle||''}).label)+'</td>'
      +'<td style="padding:8px;text-align:right;font-weight:700">$'+amt.toFixed(2)+'</td>'
      +'<td style="padding:8px;text-align:center">'+(c.deliveryMethod==='mail'?'&#128236; Mail':'&#128231; Email')+'</td>'
    +'</tr>';
  });

  html += '</tbody></table></div>';

  // Running total bar
  var grandTotal = due.reduce(function(s,c){return s+_rcLineTotal2(c);},0);
  html += '<div style="display:flex;align-items:center;justify-content:space-between;background:#e3f2fd;border-radius:8px;padding:12px 16px;margin-top:10px">'
    +'<span style="font-size:12px;color:#546e7a" id="rc-run-count">'+due.length+' contracts selected</span>'
    +'<span style="font-size:15px;font-weight:800;color:#1565c0">TOTAL THIS RUN: <span id="rc-run-total">$'+grandTotal.toFixed(2)+'</span></span>'
  +'</div>';

  preview.innerHTML = html;
}

function rcRunToggleRow(tr) {
  var chk = tr.querySelector('.rc-run-chk');
  if (chk) { chk.checked = !chk.checked; rcRunUpdateTotal(); }
}

function rcRunSelectAll(checked) {
  document.querySelectorAll('.rc-run-chk').forEach(function(c){ c.checked = checked; });
  rcRunUpdateTotal();
}

function rcRunToggleType(type) {
  var rows = document.querySelectorAll('.rc-run-row[data-type="'+type+'"]');
  // If all checked → uncheck all; otherwise → check all
  var allChecked = Array.from(rows).every(function(r){ return r.querySelector('.rc-run-chk').checked; });
  rows.forEach(function(r){ r.querySelector('.rc-run-chk').checked = !allChecked; });
  rcRunUpdateTotal();
}

function rcRunUpdateTotal() {
  var chks = Array.from(document.querySelectorAll('.rc-run-chk'));
  var checked = chks.filter(function(c){ return c.checked; });
  var total = 0;
  checked.forEach(function(chk){
    var rcid = chk.getAttribute('data-rcid');
    var c = (DB.recurringContracts||[]).find(function(x){ return x.id===rcid; });
    if (c) total += _rcLineTotal2(c);
  });
  var countEl = document.getElementById('rc-run-count');
  var totalEl = document.getElementById('rc-run-total');
  if (countEl) countEl.textContent = checked.length+' contract'+(checked.length!==1?'s':'')+' selected';
  if (totalEl) totalEl.textContent = '$'+total.toFixed(2);
  // Update select-all checkbox state
  var allChk = document.getElementById('rc-select-all');
  if (allChk) {
    allChk.checked = checked.length === chks.length;
    allChk.indeterminate = checked.length > 0 && checked.length < chks.length;
  }
  var runBtn = document.getElementById('rc-run-btn');
  if (runBtn) runBtn.disabled = checked.length === 0;
}

// ── Execute billing run ────────────────────────────────────────────────────────
async function executeBillingRun() {
  var runDate = document.getElementById('rc-run-date').value;
  if (!runDate) { showToast('Select a run date','warning',2000); return; }
  // Warn about contracts with no invoicing email
  var noEmail = (DB.recurringContracts||[]).filter(function(c){
    return _rcIsDue(c,runDate) && !c.clientEmail && c.deliveryMethod!=='mail';
  });
  if (noEmail.length) {
    var msg = noEmail.length+' contract(s) have no invoicing email: '+noEmail.map(function(c){return c.client+' ('+c.number+')'}).join(', ')+'. Continue anyway?';
    if (!confirm(msg)) return;
  }

  // Only run contracts the user has checked
  var checkedIds = Array.from(document.querySelectorAll('.rc-run-chk:checked')).map(function(el){ return el.getAttribute('data-rcid'); });
  var due = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c, runDate) && (checkedIds.length===0 || checkedIds.indexOf(c.id)>=0); });
  if (!due.length) { showToast('No contracts selected to run','info',2000); return; }

  var generated = [];

  for (var c of due) {
    // Generate invoice — server-authoritative number (migration _17), shares the
    // 'invoice' sequence with WO/manual invoices but keeps the INV-MSC- prefix.
    if (!DB.invoices) DB.invoices = [];
    var _mscFloor = _maxNum(DB.invoices, function(i){ return i.num; }, /INV-(?:MSC-)?(\d+)/);
    var _mscN = await allocNumber('invoice', _mscFloor);
    var invNum = 'INV-MSC-' + _mscN;
    var amt = _rcLineTotal2(c);
    var invoiceDate = document.getElementById('rc-invoice-date').value || runDate;
    var inv = {
      id:          'inv-rc-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
      num:         invNum,
      type:        'recurring',
      clientName:  c.client,
      clientEmail: c.clientEmail||'',
      rcId:        c.id,
      rcNumber:    c.number,
      lineItems:   (c.lineItems||[]).map(function(i){ return Object.assign({},i); }),
      amount:      amt,
      status:      'pending',
      deliveryMethod: c.deliveryMethod||'email',
      billingCycle: c.billingCycle,
      runDate:     runDate,
      invoiceDate: invoiceDate,
      dueDate:     invoiceDate,
      notes:       c.notes||'',
      createdAt:   new Date().toISOString(),
    };
    DB.invoices.push(inv);
    generated.push(inv);

    // Advance next billing date
    c.nextBillingDate = _rcAdvanceDate(c.nextBillingDate, c.billingCycle);
    c.lastBilledDate  = runDate;

    // Push to Supabase
    _pushRCToSupabase(c);
    _pushRCInvoiceToSupabase(inv);
  }

  saveDB();
  closeModal('modal-billing-run');
  renderRecurring();

  // Show results and handle email delivery
  _showRunResults(generated, runDate);
}

function _showRunResults(invoices, runDate) {
  var emailQueue = invoices.filter(function(i){ return i.deliveryMethod==='email' && i.clientEmail; });
  var mailQueue  = invoices.filter(function(i){ return i.deliveryMethod==='mail'; });
  var noEmail    = invoices.filter(function(i){ return i.deliveryMethod==='email' && !i.clientEmail; });

  var msg = '&#10003; Billing run complete for '+runDate+'\n'
    + invoices.length + ' invoice'+(invoices.length!==1?'s':'')+' generated\n';
  if (emailQueue.length) msg += emailQueue.length+' ready to email\n';
  if (mailQueue.length)  msg += mailQueue.length+' flagged for mail\n';
  if (noEmail.length)    msg += noEmail.length+' missing email address\n';

  showToast('Billing run complete — '+invoices.length+' invoices generated','success',4000);

  // Open email delivery for email clients
  if (emailQueue.length) {
    setTimeout(function(){
      if (confirm(emailQueue.length+' invoice(s) ready to email. Open email queue now?')) {
        openRCEmailQueue(emailQueue);
      }
    }, 500);
  }
}

function openRCEmailQueue(invoices) {
  var panel = document.getElementById('rc-email-queue');
  if (!panel) return;
  var html = '<div style="padding:16px">'
    +'<div style="font-size:14px;font-weight:700;margin-bottom:12px">&#128231; Email Queue — '+invoices.length+' Invoice'+(invoices.length!==1?'s':'')+' to Send</div>';

  invoices.forEach(function(inv){
    var co = DB.settings||{};
    var subject = encodeURIComponent('Invoice '+inv.num+' — '+(inv.billingCycle||'')+(inv.billingCycle?' billing':''));
    var body = encodeURIComponent(
      'Dear '+inv.clientName+',\n\n'
      +'Please find your invoice details below.\n\n'
      +'Invoice Number: '+inv.num+'\n'
      +'Amount Due: $'+inv.amount.toFixed(2)+'\n'
      +'Invoice Date: '+(inv.invoiceDate||inv.runDate)+'\n\n'
      +'Payment is due upon receipt. Please contact us with any questions.\n\n'
      +'Thank you for your business.\n\n'
      +(co.cname||'Total Communications Systems & Solutions, Inc.')+'\n'
      +(co.cphone||'')+'\n'+(co.cemail||'')
    );
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #f0f0f0">'
      +'<div><div style="font-weight:700;font-size:13px">'+escHtml(inv.clientName)+'</div>'
        +'<div style="font-size:11px;color:#546e7a">'+escHtml(inv.num)+' · $'+inv.amount.toFixed(2)+' · '+escHtml(inv.clientEmail||'No email')+'</div>'
      +'</div>'
      +'<div style="display:flex;gap:8px">'
        +'<button class="btn btn-outline btn-sm" onclick="printRCInvoice(\''+escHtml(inv.id)+'\')">&#128424; Print</button>'
        +(inv.clientEmail?'<a href="mailto:'+escHtml(inv.clientEmail)+'?subject='+subject+'&body='+body+'" class="btn btn-primary btn-sm">Send Email</a>':'<span style="font-size:11px;color:#c62828">No email on file</span>')
      +'</div>'
    +'</div>';
  });

  html += '</div>';
  panel.innerHTML = html;
  panel.style.display = 'block';
}

// ── Print invoice ──────────────────────────────────────────────────────────────
function _closeRCInvoice() {
  var ov = document.getElementById('rc-invoice-overlay');
  if (ov) { ov.style.display = 'none'; ov.innerHTML = ''; }
}

// Print the previewed invoice/control-sheet in an ISOLATED window so (a) it prints ONCE
// (the on-screen overlay is position:fixed, which Chrome reprints on every page of the long
// app page behind it — that was the "14 copies" bug) and (b) the saved-PDF filename comes
// from this window's <title> (the invoice/control number), not the app's page title.
var _rcPrintPayload = null;
function _rcPrintCurrent(){
  // Open the invoice / control sheet in a dedicated print WINDOW — the exact proven pattern the
  // rest of the app uses for POs/quotes/WOs: window.open WITH width/height (a real window, which
  // pop-up blockers allow on a click; a plain '_blank' with no size gets tab-blocked). The window
  // holds ONLY this document, so it prints once, and its <title> sets the saved-PDF filename.
  var payload = _rcPrintPayload || {};
  if (!payload.html){ try{ window.print(); }catch(e){} return; }
  var title = String(payload.title||'Document').replace(/[<>]/g,'').trim() || 'Document';
  var win = window.open('', '_blank', 'width=900,height=700');
  if (!win){
    if (typeof showToast==='function') showToast('Allow pop-ups for this site, then Print again','warning',4000);
    return;
  }
  var doc = '<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title>'
    +'<style>@page{margin:14mm}*{box-sizing:border-box}html,body{margin:0;padding:0}'
    +'body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
    +'@media print{.rc-print-bar{display:none!important}}</style></head><body>'
    +'<div class="rc-print-bar" style="padding:10px 16px;background:#f5f7fa;border-bottom:1px solid #e0e0e0;display:flex;gap:10px">'
      +'<button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'
      +'<button onclick="window.close()" style="background:#fff;border:1px solid #cfd8e3;color:#546e7a;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer">Close</button>'
    +'</div>'
    +payload.html
    +'</body></html>';
  win.document.write(doc);
  win.document.close();
  setTimeout(function(){ try{ win.focus(); win.print(); }catch(e){} }, 500);
}

// Reusable invoice HTML (shared by the on-screen preview AND the PDF that gets emailed) so the
// client sees exactly what the team previews.
function _rcInvoiceHTML(inv) {
  var co = DB.settings||{};
  // Invoices use the Billing/Invoicing email (Settings); falls back to the general company email.
  var billEmail = _rcBillingEmail();
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var lineItems = inv.lineItems||[];
  var _liSum = lineItems.reduce(function(s,i){ return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0)); },0);
  // Tax breakout: prefer stored fields (auto-billing writes subtotal/taxRate/taxAmt/total); fall back
  // to the line-item sum for legacy/untaxed invoices so older invoices render exactly as before.
  var subtotal = (inv.subtotal != null) ? parseFloat(inv.subtotal) : _liSum;
  var taxRate  = (inv.taxRate  != null) ? parseFloat(inv.taxRate)  : 0;
  var taxAmt   = (inv.taxAmt   != null) ? parseFloat(inv.taxAmt)   : 0;
  var total    = (inv.total != null) ? parseFloat(inv.total)
                 : (inv.amount != null && inv.taxAmt != null) ? parseFloat(inv.amount)
                 : (subtotal + taxAmt);
  if (!total) total = parseFloat(inv.amount||0) || _liSum;
  var _hasTax = (taxAmt > 0) || (taxRate > 0);
  var cycles = _getMSCycles();
  var cycleLabel = (cycles[inv.billingCycle]||{label:inv.billingCycle||'Recurring'}).label;
  var lineRows = lineItems.map(function(i){
    var lt = parseFloat(i.qty||1)*parseFloat(i.unitPrice||0);
    return '<tr>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:13px">'+esc(i.desc||'')+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px">'+parseFloat(i.qty||1)+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px">$'+parseFloat(i.unitPrice||0).toFixed(2)+'</td>'
      +'<td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:700">$'+lt.toFixed(2)+'</td>'
    +'</tr>';
  }).join('');

  var html = '<div style="max-width:760px;margin:30px auto;font-family:Arial,sans-serif;color:#0d1b2a">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #1565c0">'
      +'<div>'
        // Logo-first (DB.settings.logoDataUrl), styled company name is the fallback when no logo is set.
        +(co.logoDataUrl
          ? '<img src="'+co.logoDataUrl+'" alt="'+esc(co.cname||'')+'" style="max-height:56px;max-width:260px;object-fit:contain;display:block;margin-bottom:6px">'
          : '<div style="font-size:22px;font-weight:900;color:#0d1b2a;letter-spacing:-.3px">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>')
        +'<div style="margin-top:8px;font-size:12px;color:#546e7a;line-height:1.8">'+esc(co.caddr||'')
          +(co.cphone?'<br>'+esc(co.cphone):'')
          +(billEmail?'<br>'+esc(billEmail):'')
        +'</div>'
      +'</div>'
      +'<div style="text-align:right">'
        +'<div style="font-size:38px;font-weight:900;color:#1565c0;letter-spacing:-1px">INVOICE</div>'
        +'<div style="font-size:14px;font-weight:700;color:#0d1b2a;margin-top:6px">'+esc(inv.num||'')+'</div>'
        +'<div style="font-size:12px;color:#546e7a;margin-top:4px">Date: <strong>'+esc(inv.invoiceDate||inv.runDate||'')+'</strong></div>'
        +'<div style="font-size:12px;color:#546e7a">Due: <strong>Upon Receipt</strong></div>'
      +'</div>'
    +'</div>'
    +'<div style="background:#1565c0;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">'
      +'<div>'
        +'<div style="font-size:14px;font-weight:800;color:#fff">'+esc(inv.contractType||'Managed Service')+' &#8212; Managed Services Contract</div>'
        +'<div style="font-size:11px;color:#bbdefb;margin-top:3px">'+esc(inv.rcNumber||'')+' &nbsp;&#183;&nbsp; '+esc(cycleLabel)+' Billing</div>'
      +'</div>'
      +'<div style="background:rgba(255,255,255,.15);padding:8px 16px;border-radius:6px;font-size:12px;font-weight:800;color:#fff">'+cycleLabel.toUpperCase()+'</div>'
    +'</div>'
    +'<div style="margin-bottom:24px;background:#f8f9fb;border-radius:8px;padding:14px 18px">'
      +'<div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">Bill To</div>'
      +'<div style="font-size:16px;font-weight:700">'+esc(inv.clientName||'')+'</div>'
      +(inv.clientEmail?'<div style="font-size:12px;color:#546e7a;margin-top:2px">'+esc(inv.clientEmail)+'</div>':'')
    +'</div>'
    +'<table style="width:100%;border-collapse:collapse">'
      +'<thead><tr style="background:#0d1b2a">'
        +'<th style="padding:11px 14px;text-align:left;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:.4px">Description</th>'
        +'<th style="padding:11px 14px;text-align:center;font-size:11px;color:#fff;text-transform:uppercase;width:60px">Qty</th>'
        +'<th style="padding:11px 14px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;width:110px">Unit Price</th>'
        +'<th style="padding:11px 14px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;width:110px">Amount</th>'
      +'</tr></thead><tbody>'+lineRows+'</tbody>'
      +'<tfoot>'
        +(_hasTax
          ? '<tr><td colspan="3" style="padding:8px 14px 2px;text-align:right;font-size:13px;color:#546e7a">Subtotal:</td>'
              +'<td style="padding:8px 14px 2px;text-align:right;font-size:13px;color:#546e7a">$'+subtotal.toFixed(2)+'</td></tr>'
            +'<tr><td colspan="3" style="padding:2px 14px;text-align:right;font-size:13px;color:#546e7a">Tax ('+(taxRate).toFixed(taxRate%1?2:0)+'%):</td>'
              +'<td style="padding:2px 14px;text-align:right;font-size:13px;color:#546e7a">$'+taxAmt.toFixed(2)+'</td></tr>'
          : '')
        +'<tr style="background:#e3f2fd">'
          +'<td colspan="3" style="padding:14px;text-align:right;font-size:14px;font-weight:700">Total Due:</td>'
          +'<td style="padding:14px;text-align:right;font-size:22px;font-weight:900;color:#1565c0">$'+total.toFixed(2)+'</td>'
        +'</tr>'
      +'</tfoot>'
    +'</table>'
    +''
    +'<div style="margin-top:30px;padding-top:14px;border-top:1px solid #e0e7ef;text-align:center;font-size:11px;color:#90a4ae">'
      +esc(co.cname||'Total Communications Systems & Solutions, Inc.')
      +(co.cphone?' &nbsp;&#183;&nbsp; '+esc(co.cphone):'')
      +(billEmail?' &nbsp;&#183;&nbsp; '+esc(billEmail):'')
      +'<br>Thank you for your business.'
    +'</div>'
  +'</div>';

  return html;
}

function printRCInvoice(invId) {
  var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
  if (!inv) { if(typeof showToast==='function') showToast('Invoice not found','warning',2000); return; }
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var html = _rcInvoiceHTML(inv);
  _rcPrintPayload = { title: (inv.num||'Invoice'), html: html };
  var overlay = document.getElementById('rc-invoice-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rc-invoice-overlay';
    document.body.appendChild(overlay);
  }
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#e8edf2;z-index:9999;overflow-y:auto;display:block';
  overlay.innerHTML =
    '<div class="no-print" style="position:sticky;top:0;background:#0d1b2a;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.3)">'
      +'<span style="color:#90a4ae;font-size:13px">&#128196; '+esc(inv.num||'')+' &nbsp;&#183;&nbsp; '+esc(inv.clientName||'')+'</span>'
      +'<div style="display:flex;gap:10px">'
        +'<button onclick="_rcPrintCurrent()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'
        +'<button onclick="_closeRCInvoice()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:9px 16px;font-size:13px;cursor:pointer">&#10005; Close</button>'
      +'</div>'
    +'</div>'
    +'<div style="padding:30px 20px">'+html+'</div>';
}


// ── Managed Services Settings ─────────────────────────────────────────────────
// DB.msSettings = { types:[], statuses:[], cycles:{} }
var MS_DEFAULT_TYPES    = ['Phone Equipment','VoIP','Computer Services','IT Support','Security / Access Control','Camera System','Network Maintenance','Cabling Maintenance','Audio / Visual','Other'];
var MS_DEFAULT_STATUSES = ['active','paused','cancelled']; // 'expired' is system-driven only
var MS_DEFAULT_CYCLES   = {monthly:{label:'Monthly',months:1},quarterly:{label:'Quarterly',months:3},biannual:{label:'Bi-Annual',months:6},annual:{label:'Annual',months:12}};

function _getMSTypes()    { return (DB.msSettings&&DB.msSettings.types&&DB.msSettings.types.length)    ? DB.msSettings.types    : MS_DEFAULT_TYPES; }
function _getMSStatuses() { return (DB.msSettings&&DB.msSettings.statuses&&DB.msSettings.statuses.length) ? DB.msSettings.statuses : MS_DEFAULT_STATUSES; }
function _getMSCycles()   { return (DB.msSettings&&DB.msSettings.cycles&&Object.keys(DB.msSettings.cycles).length) ? DB.msSettings.cycles : MS_DEFAULT_CYCLES; }

// ── Line item drag to reorder ─────────────────────────────────────────────────
var _rcLiDragIdx = null;

function rcLiDragStart(e, idx) {
  _rcLiDragIdx = idx;
  e.stopPropagation();
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(function(){
    var rows = document.querySelectorAll('.rc-li-row');
    if (rows[idx]) rows[idx].style.opacity = '0.4';
  }, 0);
}

function rcLiDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  var tr = e.target.closest ? e.target.closest('.rc-li-row') : null;
  if (tr) tr.style.borderTop = '3px solid #1565c0';
}

function rcLiDragEnd(e) {
  e.stopPropagation();
  document.querySelectorAll('.rc-li-row').forEach(function(r){
    r.style.opacity = '1';
    r.style.borderTop = '';
  });
  _rcLiDragIdx = null;
}

function rcLiDrop(e, toIdx) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.rc-li-row').forEach(function(r){ r.style.borderTop = ''; });
  if (_rcLiDragIdx === null || _rcLiDragIdx === toIdx) return;
  var moved = _rcLineItems.splice(_rcLiDragIdx, 1)[0];
  _rcLineItems.splice(toIdx, 0, moved);
  _rcLiDragIdx = null;
  _renderRCLineItems();
}


// ── Managed Services Settings ─────────────────────────────────────────────────
function toggleMSSettings() {
  var panel = document.getElementById('ms-settings-panel');
  if (!panel) return;
  var opening = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = opening ? 'block' : 'none';
  if (opening) renderMSSettings();
}

function renderMSSettings() {
  var wrap = document.getElementById('ms-settings-wrap');
  if (!wrap) return;
  var types    = _getMSTypes();
  var statuses = _getMSStatuses();
  var cycles   = _getMSCycles();

  function makeList(items, deleteFn) {
    return items.map(function(t, i) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0">'
        + '<span style="font-size:13px">' + escHtml(t) + '</span>'
        + '<span onclick="' + deleteFn + '(' + i + ')" style="cursor:pointer;color:#c62828;font-size:18px;font-weight:700;padding:0 6px">&#215;</span>'
        + '</div>';
    }).join('');
  }

  var cycleHtml = Object.keys(cycles).map(function(key) {
    var c = cycles[key];
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0">'
      + '<span style="font-size:13px">' + escHtml(c.label) + ' <span style="font-size:10px;color:#90a4ae">(' + c.months + ' mo)</span></span>'
      + '<span class="ms-del-cycle" data-key="' + escHtml(key) + '" onclick="msDeleteCycle(this.dataset.key)" style="cursor:pointer;color:#c62828;font-size:18px;font-weight:700;padding:0 6px">&#215;</span>'
      + '</div>';
  }).join('');

  wrap.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">'

    + '<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Service Types</div>'
    + makeList(types, 'msDeleteType')
    + '<div style="display:flex;gap:6px;margin-top:10px">'
    + '<input id="ms-new-type" class="form-control" style="font-size:12px" placeholder="Add type...">'
    + '<button class="btn btn-primary btn-sm" onclick="msAddType()">Add</button>'
    + '</div></div>'

    + '<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Statuses</div>'
    + makeList(statuses, 'msDeleteStatus')
    + '<div style="display:flex;gap:6px;margin-top:10px">'
    + '<input id="ms-new-status" class="form-control" style="font-size:12px" placeholder="Add status...">'
    + '<button class="btn btn-primary btn-sm" onclick="msAddStatus()">Add</button>'
    + '</div></div>'

    + '<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Billing Cycles</div>'
    + cycleHtml
    + '<div style="display:grid;grid-template-columns:1fr 60px 50px;gap:6px;margin-top:10px">'
    + '<input id="ms-new-cycle-label" class="form-control" style="font-size:12px" placeholder="Label">'
    + '<input id="ms-new-cycle-months" class="form-control" style="font-size:12px" type="number" min="1" placeholder="Mo">'
    + '<button class="btn btn-primary btn-sm" onclick="msAddCycle()">Add</button>'
    + '</div></div>'

    + '</div>';
}

function _saveMSSettings() {
  if (!DB.msSettings) DB.msSettings = {};
  saveDB();
  if (typeof _pushSettingsToSupabase === 'function') _pushSettingsToSupabase();
  renderMSSettings();
  showToast('Settings saved', 'success', 2000);
}

function msAddType() {
  var v = (document.getElementById('ms-new-type').value || '').trim();
  if (!v) return;
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.types) DB.msSettings.types = _getMSTypes().slice();
  if (DB.msSettings.types.indexOf(v) >= 0) { showToast('Already exists', 'warning', 2000); return; }
  DB.msSettings.types.push(v);
  document.getElementById('ms-new-type').value = '';
  _saveMSSettings();
}

function msDeleteType(idx) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.types) DB.msSettings.types = _getMSTypes().slice();
  if (DB.msSettings.types.length <= 1) { showToast('Must keep at least one', 'warning', 2000); return; }
  DB.msSettings.types.splice(idx, 1);
  _saveMSSettings();
}

function msAddStatus() {
  var v = (document.getElementById('ms-new-status').value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!v) return;
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.statuses) DB.msSettings.statuses = _getMSStatuses().slice();
  if (DB.msSettings.statuses.indexOf(v) >= 0) { showToast('Already exists', 'warning', 2000); return; }
  DB.msSettings.statuses.push(v);
  document.getElementById('ms-new-status').value = '';
  _saveMSSettings();
}

function msDeleteStatus(idx) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.statuses) DB.msSettings.statuses = _getMSStatuses().slice();
  if (DB.msSettings.statuses.length <= 1) { showToast('Must keep at least one', 'warning', 2000); return; }
  DB.msSettings.statuses.splice(idx, 1);
  _saveMSSettings();
}

function msAddCycle() {
  var label  = (document.getElementById('ms-new-cycle-label').value || '').trim();
  var months = parseInt(document.getElementById('ms-new-cycle-months').value) || 0;
  if (!label || months < 1) { showToast('Enter label and months', 'warning', 2000); return; }
  var key = label.toLowerCase().replace(/\s+/g, '_');
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.cycles) DB.msSettings.cycles = Object.assign({}, _getMSCycles());
  DB.msSettings.cycles[key] = { label: label, months: months };
  document.getElementById('ms-new-cycle-label').value = '';
  document.getElementById('ms-new-cycle-months').value = '';
  _saveMSSettings();
}

function msDeleteCycle(key) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.cycles) DB.msSettings.cycles = Object.assign({}, _getMSCycles());
  if (Object.keys(DB.msSettings.cycles).length <= 1) { showToast('Must keep at least one', 'warning', 2000); return; }
  delete DB.msSettings.cycles[key];
  _saveMSSettings();
}


// ── System-driven contract expiration check ───────────────────────────────────
function _rcCheckExpirations() {
  var today = getTodayISO();
  var changed = false;
  (DB.recurringContracts||[]).forEach(function(c) {
    if (c.status !== 'active' && c.status !== 'paused') return;
    if (!c.contractEnd) return;
    if (c.contractEnd > today) return;
    if (c.autoRenew) {
      // Advance one year using LOCAL Y-M-D (avoids the UTC round-trip day-drift).
      var _p = String(c.contractEnd).split('-');
      var d = new Date(parseInt(_p[0],10)+1, parseInt(_p[1],10)-1, parseInt(_p[2],10));
      c.contractEnd = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      changed = true;
      _pushRCToSupabase(c);
    } else {
      c.status = 'expired';
      changed = true;
      _pushRCToSupabase(c);
    }
  });
  if (changed) { saveDB(); }
}


// ── MS Invoice History ────────────────────────────────────────────────────────
function toggleMSInvoiceHistory() {
  var panel = document.getElementById('ms-invoice-history');
  if (!panel) return;
  var opening = panel.style.display === 'none';
  panel.style.display = opening ? '' : 'none';
  if (opening) renderMSInvoiceHistory();
}

function renderMSInvoiceHistory() {
  var body = document.getElementById('ms-invoice-history-body');
  if (!body) return;

  var rcInvoices = (DB.invoices||[]).filter(function(i){
    return i.type==='recurring' || (i.num||'').includes('INV-RC') || (i.num||'').includes('INV-MSC');
  }).sort(function(a,b){
    return (b.invoiceDate||b.runDate||'').localeCompare(a.invoiceDate||a.runDate||'');
  });

  // Populate client filter
  var clientSel = document.getElementById('ms-inv-filter-client');
  if (clientSel && clientSel.options.length <= 1) {
    var clients = [...new Set(rcInvoices.map(function(i){ return i.clientName||''; }).filter(Boolean))].sort();
    clients.forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; clientSel.appendChild(o); });
  }
  var fClient = (clientSel||{}).value||'';
  if (fClient) rcInvoices = rcInvoices.filter(function(i){ return i.clientName===fClient; });

  if (!rcInvoices.length) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#90a4ae;font-size:13px">No invoices found.</div>';
    return;
  }

  // Group by run date
  var byDate = {};
  rcInvoices.forEach(function(i){
    var d = i.invoiceDate||i.runDate||'Unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(i);
  });

  var html = '';
  Object.keys(byDate).sort().reverse().forEach(function(date){
    var invs = byDate[date];
    var runTotal = invs.reduce(function(s,i){ return s+parseFloat(i.amount||0); },0);
    var runGroupId = 'rungrp-'+date.replace(/-/g,'');
    html += '<div style="padding:10px 18px;background:#f5f7fa;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e0e7ef;display:flex;align-items:center;justify-content:space-between">'
      + '<span>Run Date: ' + date + ' &nbsp;&#183;&nbsp; ' + invs.length + ' invoice' + (invs.length!==1?'s':'') + ' &nbsp;&#183;&nbsp; $' + runTotal.toFixed(2)+'</span>'
      + '<button data-runid="'+runGroupId+'" onclick="batchPrintMSRun(this.getAttribute(\'data-runid\'))" style="background:#1565c0;color:#fff;border:none;border-radius:5px;padding:4px 12px;font-size:10px;font-weight:700;cursor:pointer">&#128424; Print All</button>'
    +'</div>';
    invs.forEach(function(inv){
      html += '<div class="ms-inv-row" data-runid="'+runGroupId+'" data-invid="'+inv.id+'" style="display:grid;grid-template-columns:120px 1fr 130px 90px 80px 80px;padding:10px 18px;border-bottom:1px solid #f5f5f5;align-items:center;gap:8px">'
        +'<div style="font-size:12px;font-weight:700;color:#1565c0">' + (inv.num||'') + '</div>'
        +'<div style="font-size:12px;font-weight:600">' + (inv.clientName||'') + '</div>'
        +'<div style="font-size:11px;color:#546e7a">' + (inv.contractType||inv.rcNumber||'') + '</div>'
        +'<div style="font-size:12px;font-weight:700">$' + parseFloat(inv.amount||0).toFixed(2) + '</div>'
        +'<div style="font-size:11px">' + (inv.deliveryMethod==='mail'?'&#128236; Mail':'&#128231; Email') + '</div>'
        +'<div style="display:flex;gap:6px">'
        +'<button data-invid="'+inv.id+'" onclick="var id=this.getAttribute(\'data-invid\');printRCInvoice(id)" style="background:#f0f4ff;color:#1565c0;border:1px solid #d0dcff;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">Print</button>'
        +'</div>'
      +'</div>';
    });
  });

  body.innerHTML = html;
}


// ── Batch Print MS Run ────────────────────────────────────────────────────────
function batchPrintMSRun(runGroupId) {
  // Find all invoice rows for this run
  var rows = Array.from(document.querySelectorAll('.ms-inv-row[data-runid="'+runGroupId+'"]'));
  var invIds = rows.map(function(r){ return r.getAttribute('data-invid'); }).filter(Boolean);

  if (!invIds.length) { showToast('No invoices found for this run','warning',2000); return; }

  var co = DB.settings||{};
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  var allPages = invIds.map(function(invId) {
    var inv = (DB.invoices||[]).find(function(i){ return i.id===invId; });
    if (!inv) return '';
    var lineItems = inv.lineItems||[];
    var total = lineItems.reduce(function(s,i){ return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0)); },0);
    if (!total) total = parseFloat(inv.amount||0);
    var cycles = _getMSCycles();
    var cycleLabel = (cycles[inv.billingCycle]||{label:inv.billingCycle||'Recurring'}).label;
    var lineRows = lineItems.map(function(i){
      var lt = parseFloat(i.qty||1)*parseFloat(i.unitPrice||0);
      return '<tr><td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">'+esc(i.desc||'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:12px">'+parseFloat(i.qty||1)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px">$'+parseFloat(i.unitPrice||0).toFixed(2)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:12px;font-weight:700">$'+lt.toFixed(2)+'</td>'
      +'</tr>';
    }).join('');

    return '<div style="page-break-after:always;page-break-inside:avoid;font-family:Arial,sans-serif;color:#0d1b2a;padding:20px;max-width:760px;margin:0 auto">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #1565c0">'
        +'<div>'
          +'<div style="font-size:20px;font-weight:900;color:#0d1b2a">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>'
          +'<div style="margin-top:6px;font-size:11px;color:#546e7a;line-height:1.8">'+esc(co.caddr||'')+(co.cphone?'<br>'+esc(co.cphone):'')+(co.cemail?'<br>'+esc(co.cemail):'')+'</div>'
        +'</div>'
        +'<div style="text-align:right">'
          +'<div style="font-size:32px;font-weight:900;color:#1565c0">INVOICE</div>'
          +'<div style="font-size:13px;font-weight:700;margin-top:4px">'+esc(inv.num||'')+'</div>'
          +'<div style="font-size:11px;color:#546e7a;margin-top:3px">Date: '+esc(inv.invoiceDate||inv.runDate||'')+'</div>'
          +'<div style="font-size:11px;color:#546e7a">Due: Upon Receipt</div>'
        +'</div>'
      +'</div>'
      +'<div style="background:#1565c0;border-radius:6px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">'
        +'<div>'
          +'<div style="font-size:13px;font-weight:800;color:#fff">'+esc(inv.contractType||'Managed Service')+' &#8212; Managed Services Contract</div>'
          +'<div style="font-size:10px;color:#bbdefb;margin-top:2px">'+esc(inv.rcNumber||'')+' &nbsp;&#183;&nbsp; '+esc(cycleLabel)+' Billing</div>'
        +'</div>'
      +'</div>'
      +'<div style="margin-bottom:16px;background:#f8f9fb;border-radius:6px;padding:12px 14px">'
        +'<div style="font-size:9px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Bill To</div>'
        +'<div style="font-size:15px;font-weight:700">'+esc(inv.clientName||'')+'</div>'
        +(inv.clientEmail?'<div style="font-size:11px;color:#546e7a;margin-top:1px">'+esc(inv.clientEmail)+'</div>':'')
        +(inv.clientAddress?'<div style="font-size:11px;color:#546e7a;margin-top:1px">'+esc(inv.clientAddress)+'</div>':'')
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse">'
        +'<thead><tr style="background:#0d1b2a">'
          +'<th style="padding:9px 12px;text-align:left;font-size:10px;color:#fff;text-transform:uppercase">Description</th>'
          +'<th style="padding:9px 12px;text-align:center;font-size:10px;color:#fff;text-transform:uppercase;width:50px">Qty</th>'
          +'<th style="padding:9px 12px;text-align:right;font-size:10px;color:#fff;text-transform:uppercase;width:100px">Unit Price</th>'
          +'<th style="padding:9px 12px;text-align:right;font-size:10px;color:#fff;text-transform:uppercase;width:100px">Amount</th>'
        +'</tr></thead>'
        +'<tbody>'+lineRows+'</tbody>'
        +'<tfoot><tr style="background:#e3f2fd">'
          +'<td colspan="3" style="padding:12px;text-align:right;font-size:13px;font-weight:700">Total Due:</td>'
          +'<td style="padding:12px;text-align:right;font-size:20px;font-weight:900;color:#1565c0">$'+total.toFixed(2)+'</td>'
        +'</tr></tfoot>'
      +'</table>'
      +'<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e0e7ef;text-align:center;font-size:10px;color:#90a4ae">'
        +esc(co.cname||'Total Communications Systems & Solutions, Inc.')
        +(co.cphone?' &nbsp;&#183;&nbsp; '+esc(co.cphone):'')
        +(co.cemail?' &nbsp;&#183;&nbsp; '+esc(co.cemail):'')
        +'<br>Thank you for your business.'
      +'</div>'
    +'</div>';
  }).join('');

  // Show all invoices in overlay with one print action
  var overlay = document.getElementById('rc-invoice-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'rc-invoice-overlay'; document.body.appendChild(overlay); }
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#e8edf2;z-index:9999;overflow-y:auto;display:block';

  var runDate = rows.length ? (DB.invoices||[]).find(function(i){ return i.id===invIds[0]; }) : null;
  var dateLabel = runDate ? (runDate.invoiceDate||runDate.runDate||'') : '';

  overlay.innerHTML = '<div style="position:sticky;top:0;background:#0d1b2a;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.3)">'
    +'<span style="color:#90a4ae;font-size:13px">&#128196; Batch Print &nbsp;&#183;&nbsp; '+invIds.length+' invoices &nbsp;&#183;&nbsp; Run: '+dateLabel+'</span>'
    +'<div style="display:flex;gap:10px">'
      +'<button onclick="_batchPrintNow()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print All / Save PDF</button>'
      +'<button onclick="_closeRCInvoice()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:9px 16px;font-size:13px;cursor:pointer">&#10005; Close</button>'
    +'</div>'
  +'</div>'
  +'<div style="padding:20px">'+allPages+'</div>';
}


// ── Customer linkage ──────────────────────────────────────────────────────────
function rcPopulateCustomerSelect(selectedId) {
  var sel = document.getElementById('rc-customer-id');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Customer...</option>';
  (DB.customers||[]).slice().sort(function(a,b){
    return (a.company||a.name||'').localeCompare(b.company||b.name||'');
  }).forEach(function(c){
    var o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.company||c.name||'';
    if (selectedId && c.id===selectedId) o.selected = true;
    sel.appendChild(o);
  });
}

function rcCustomerSelected(customerId) {
  if (!customerId) return;
  var c = (DB.customers||[]).find(function(x){ return x.id===customerId; });
  if (!c) return;
  var nameEl = document.getElementById('rc-client');
  if (nameEl) nameEl.value = c.company||c.name||'';
  var emailEl = document.getElementById('rc-client-email');
  if (emailEl) {
    // Invoicing email takes priority, fall back to general email
    emailEl.value = c.invoicingEmail||c.email||'';
  }
}


// ── Billing Run Control Sheet ─────────────────────────────────────────────────
function printBillingControlSheet() {
  var runDate     = (document.getElementById('rc-run-date')||{}).value || getTodayISO();
  var invoiceDate = (document.getElementById('rc-invoice-date')||{}).value || getTodayISO();
  var due = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c, runDate); });

  if (!due.length) { showToast('No contracts due on this date', 'warning', 2000); return; }

  // Generate control number: CTRL-YYYYMMDD-NNN
  var ctrlSeq = (DB.billingCtrlSeq||0) + 1;
  DB.billingCtrlSeq = ctrlSeq;
  saveDB();
  var ctrlNum = 'CTRL-' + runDate.replace(/-/g,'') + '-' + String(ctrlSeq).padStart(3,'0');

  var co = DB.settings||{};
  function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  var cycles = _getMSCycles();

  // Group by type
  var byType = {};
  due.forEach(function(c){
    var t = c.type||'Other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(c);
  });

  var grandTotal = due.reduce(function(s,c){ return s+_rcLineTotal2(c); }, 0);
  var rowNum = 0;

  var rows = '';
  Object.keys(byType).sort().forEach(function(type) {
    var typeContracts = byType[type];
    var typeTotal = typeContracts.reduce(function(s,c){ return s+_rcLineTotal2(c); }, 0);

    // Type sub-header
    rows += '<tr style="background:#e3f2fd">'
      +'<td colspan="5" style="padding:7px 14px;font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.4px">'
        +esc(type)+' &nbsp;&#183;&nbsp; '+typeContracts.length+' contract'+(typeContracts.length!==1?'s':'')+' &nbsp;&#183;&nbsp; $'+typeTotal.toFixed(2)
      +'</td>'
    +'</tr>';

    typeContracts.forEach(function(c) {
      rowNum++;
      var amt = _rcLineTotal2(c);
      var cycleLabel = (cycles[c.billingCycle]||{label:c.billingCycle||''}).label;
      rows += '<tr style="background:'+(rowNum%2===0?'#fafafa':'#fff')+'">'
        +'<td style="padding:8px 14px;font-size:12px;color:#90a4ae;text-align:center">'+rowNum+'</td>'
        +'<td style="padding:8px 14px;font-size:12px;font-weight:700;color:#1565c0">'+esc(c.number||'')+'</td>'
        +'<td style="padding:8px 14px;font-size:12px;font-weight:600">'+esc(c.client||'')+'</td>'
        +'<td style="padding:8px 14px;font-size:11px;color:#546e7a">'+esc(cycleLabel)+'</td>'
        +'<td style="padding:8px 14px;font-size:12px;font-weight:700;text-align:right">$'+amt.toFixed(2)+'</td>'
      +'</tr>';
    });
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    +'<title>'+ctrlNum+'</title>'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'
    +'body{padding:28px;color:#0d1b2a;font-size:12px;}'
    +'@media print{body{padding:0;}@page{margin:18mm;}.no-print{display:none;}}'
    +'table{width:100%;border-collapse:collapse;}'
    +'th{background:#0d1b2a;color:#fff;padding:9px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px;}'
    +'th:last-child{text-align:right;}'
    +'</style></head><body>'
    +'<button class="no-print" onclick="var t=document.title;window.print();document.title=t;" style="position:fixed;top:14px;right:14px;background:#1565c0;color:#fff;border:none;border-radius:7px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'

    // Header
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:18px">'
      +'<div>'
        +'<div style="font-size:20px;font-weight:900">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>'
        +'<div style="font-size:11px;color:#546e7a;margin-top:5px">'+esc(co.caddr||'')+(co.cphone?' &nbsp;&#183;&nbsp; '+esc(co.cphone):'')+'</div>'
        +'<div style="font-size:16px;font-weight:800;color:#1565c0;margin-top:10px">MANAGED SERVICES BILLING CONTROL SHEET</div>'
      +'</div>'
      +'<div style="text-align:right">'
        +'<div style="font-size:11px;color:#90a4ae;font-weight:700;text-transform:uppercase;margin-bottom:3px">Control Number</div>'
        +'<div style="font-size:20px;font-weight:900;color:#1565c0;letter-spacing:-0.5px">'+ctrlNum+'</div>'
      +'</div>'
    +'</div>'

    // Run info
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-bottom:20px">'
      +['Run Date:'+runDate, 'Invoice Date:'+invoiceDate, 'Contracts:'+due.length, 'Total:$'+grandTotal.toFixed(2)].map(function(item){
        var parts = item.split(':');
        return '<div style="background:#f5f7fa;border-radius:8px;padding:10px 14px">'
          +'<div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;margin-bottom:3px">'+parts[0]+'</div>'
          +'<div style="font-size:14px;font-weight:800;color:#0d1b2a">'+parts.slice(1).join(':')+'</div>'
        +'</div>';
      }).join('')
    +'</div>'

    // Contract table
    +'<table>'
      +'<thead><tr>'
        +'<th style="width:40px;text-align:center">#</th>'
        +'<th style="width:110px">Contract</th>'
        +'<th>Client</th>'
        +'<th style="width:100px">Cycle</th>'
        +'<th style="width:110px;text-align:right">Amount</th>'
      +'</tr></thead>'
      +'<tbody>'+rows+'</tbody>'
      +'<tfoot><tr style="background:#0d1b2a">'
        +'<td colspan="4" style="padding:11px 14px;font-size:13px;font-weight:700;color:#fff;text-align:right">TOTAL — '+due.length+' CONTRACTS:</td>'
        +'<td style="padding:11px 14px;font-size:16px;font-weight:900;color:#fff;text-align:right">$'+grandTotal.toFixed(2)+'</td>'
      +'</tr></tfoot>'
    +'</table>'

    // Verification footer
    +'<div style="margin-top:30px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">'
      +['Prepared by', 'Verified by', 'Date Verified'].map(function(label){
        return '<div>'
          +'<div style="border-top:1px solid #0d1b2a;padding-top:6px;font-size:10px;color:#546e7a;text-transform:uppercase;letter-spacing:.4px">'+label+'</div>'
          +'<div style="height:24px"></div>'
        +'</div>';
      }).join('')
    +'</div>'

    +'<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e0e7ef;font-size:10px;color:#90a4ae;text-align:center">'
      +'Control Sheet '+ctrlNum+' &nbsp;&#183;&nbsp; Generated '+new Date().toLocaleString()+' &nbsp;&#183;&nbsp; RETAIN FOR RECORDS'
    +'</div>'
    +'</body></html>';

  var overlay = document.getElementById('rc-invoice-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.id = 'rc-invoice-overlay'; document.body.appendChild(overlay); }
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#e8edf2;z-index:9999;overflow-y:auto;display:block';
  overlay.setAttribute('data-ctrl', ctrlNum);
  overlay.innerHTML = '<div style="position:sticky;top:0;background:#0d1b2a;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:1;box-shadow:0 2px 8px rgba(0,0,0,.3)">'
    +'<span style="color:#90a4ae;font-size:13px">&#128438; Control Sheet &nbsp;&#183;&nbsp; '+ctrlNum+'</span>'
    +'<div style="display:flex;gap:10px">'
      +'<button onclick="_printControlSheet()" style="background:#1565c0;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'
      +'<button onclick="_closeRCInvoice()" style="background:#546e7a;color:#fff;border:none;border-radius:6px;padding:9px 16px;font-size:13px;cursor:pointer">&#10005; Close</button>'
    +'</div>'
  +'</div>'
  +'<div style="padding:24px">'+html.replace(/<!DOCTYPE html>.*?<body>/s,'').replace('</body></html>','')+'</div>';
}

// ── Supabase sync ──────────────────────────────────────────────────────────────
function _pushRCToSupabase(c) {
  if (typeof _sb==='undefined'||!_sb) return;
  _sb.from('recurring_contracts').upsert({
    id:c.id, number:c.number, client:c.client, type:c.type,
    billing_cycle:c.billingCycle, billing_day:c.billingDay,
    status:c.status, auto_renew:c.autoRenew,
    delivery_method:c.deliveryMethod, client_email:c.clientEmail||null,
    contract_start:c.contractStart||null, contract_end:c.contractEnd||null,
    next_billing_date:c.nextBillingDate||null, last_billed_date:c.lastBilledDate||null,
    line_items:c.lineItems||[], notes:c.notes||null,
    do_not_bill:!!c.doNotBill, sort_order:c.sortOrder||0,
    price_history:c.priceHistory||[],
    created_at:c.createdAt
  }).then(function(r){
    // Record the synced hash so the office sweep treats this just-pushed contract as clean
    // (same changed-only model as invoices/WOs) — a user edit syncs here, the sweep won't re-push it.
    if (!(r && r.error) && typeof _officeMarkSynced==='function') { try { _officeMarkSynced('recurring_contracts', c); } catch(e){} }
  });
}

function _pushRCInvoiceToSupabase(inv) {
  if (typeof _sb==='undefined'||!_sb) return;
  _sb.from('recurring_invoices').upsert({
    id:inv.id, num:inv.num, rc_id:inv.rcId, rc_number:inv.rcNumber,
    client_name:inv.clientName, client_email:inv.clientEmail||null,
    amount:inv.amount, status:inv.status,
    delivery_method:inv.deliveryMethod, billing_cycle:inv.billingCycle,
    run_date:inv.runDate, due_date:inv.dueDate,
    line_items:inv.lineItems||[], notes:inv.notes||null,
    created_at:inv.createdAt
  }).then(function(){});
}

// ── Drag to reorder ───────────────────────────────────────────────────────────
var _rcDragId = null;

function rcDragStart(e, id) {
  _rcDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(function(){ var el=document.querySelector('.rc-list-row[data-rcid="'+id+'"]'); if(el) el.style.opacity='0.4'; },0);
}

function rcDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var row = e.currentTarget;
  row.style.borderTop = '3px solid #1565c0';
}

function rcDragEnd(e) {
  _rcDragId = null;
  document.querySelectorAll('.rc-list-row').forEach(function(r){
    r.style.opacity = '1';
    r.style.borderTop = '';
  });
}

function rcDrop(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('.rc-list-row').forEach(function(r){ r.style.borderTop=''; });
  if (!_rcDragId || _rcDragId === targetId) return;
  var list = DB.recurringContracts||[];
  var fromIdx = list.findIndex(function(c){return c.id===_rcDragId;});
  var toIdx   = list.findIndex(function(c){return c.id===targetId;});
  if (fromIdx<0||toIdx<0) return;
  var moved = list.splice(fromIdx,1)[0];
  list.splice(toIdx,0,moved);
  DB.recurringContracts = list;
  saveDB();
  // Persist order to Supabase by adding sortOrder field
  list.forEach(function(c,i){ c.sortOrder=i; _pushRCToSupabase(c); });
  renderRecurring();
}

// ── Do Not Bill toggle ────────────────────────────────────────────────────────
function rcToggleDoNotBill(id) {
  var c = (DB.recurringContracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  c.doNotBill = !c.doNotBill;
  saveDB();
  _pushRCToSupabase(c);
  renderRecurring();
  showToast(c.doNotBill?'Contract marked Do Not Bill':'Contract billing restored','info',2500);
}

// ── Price change log ──────────────────────────────────────────────────────────
function _rcCheckPriceChange(oldContract, newData) {
  if (!oldContract) return;
  var oldTotal = _rcLineTotal2(oldContract);
  var newTotal = newData.lineItems.reduce(function(s,i){return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));},0);
  if (Math.abs(oldTotal - newTotal) < 0.01) return; // no change
  var reason = prompt('Price changed from $'+oldTotal.toFixed(2)+' to $'+newTotal.toFixed(2)+'.\nEnter reason for change (optional):','');
  if (!newData.priceHistory) newData.priceHistory = (oldContract.priceHistory||[]).slice();
  newData.priceHistory.unshift({
    date:   getTodayISO(),
    oldAmt: oldTotal,
    newAmt: newTotal,
    reason: reason||'',
    changedBy: (_currentUser&&_currentUser.full_name)||'Joe'
  });
}

// ── Contract detail view ──────────────────────────────────────────────────────
function openRCDetail(id) {
  var c = (DB.recurringContracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  var cycles = _getMSCycles();
  var cycleLabel = (cycles[c.billingCycle]||{label:c.billingCycle||''}).label;
  var yearly = _rcYearlyPrice(c);
  var perCycle = _rcLineTotal2(c);

  // Past invoices
  var pastInvoices = (DB.invoices||[]).filter(function(i){return i.rcId===id;})
    .sort(function(a,b){return (b.invoiceDate||b.runDate||'').localeCompare(a.invoiceDate||a.runDate||'');});

  // Projected upcoming dates
  var upcoming = _rcNextDates(c, 6);

  var stColor = ({active:'#2e7d32',paused:'#f57c00',cancelled:'#c62828',expired:'#c62828'})[c.status]||'#546e7a';

  function infoRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f5f5f5">'
      +'<span style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase">'+label+'</span>'
      +'<span style="font-size:13px;font-weight:600;color:#0d1b2a">'+value+'</span>'
    +'</div>';
  }

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'

    // Left — contract info
    +'<div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      +'<span style="font-size:18px;font-weight:800;color:#1565c0">'+escHtml(c.number||'')+'</span>'
      +'<span style="background:'+stColor+'22;color:'+stColor+';padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;text-transform:capitalize">'+escHtml(c.status||'')+'</span>'
      +(c.doNotBill?'<span style="background:#fff3e0;color:#f57c00;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700">&#128683; Do Not Bill</span>':'')
    +'</div>'
    +infoRow('Client', escHtml(c.client||''))
    +infoRow('Service Type', escHtml(c.type||''))
    +infoRow('Billing Cycle', escHtml(cycleLabel))
    +infoRow('Per-Cycle Amount', '$'+perCycle.toFixed(2))
    +infoRow('Annual Value', '$'+yearly.toFixed(2))
    +infoRow('Next Billing', escHtml(c.nextBillingDate||'—'))
    +infoRow('Last Invoiced', escHtml(c.lastBilledDate||'—'))
    +infoRow('Contract Start', escHtml(c.contractStart||'—'))
    +infoRow('Contract End', escHtml(c.contractEnd||'Open'))
    +infoRow('Auto-Renew', c.autoRenew?'Yes':'No')
    +infoRow('Delivery', c.deliveryMethod==='mail'?'&#128236; Mail':'&#128231; Email')
    +(c.clientEmail?infoRow('Email', escHtml(c.clientEmail)):'')
    +'<div style="display:flex;gap:8px;margin-top:14px">'
      +'<button class="btn btn-primary btn-sm" onclick="closeModal(\'modal-rc-detail\');openRCModal(\''+escHtml(c.id)+'\')">&#9998; Edit Contract</button>'
      +'<button class="btn btn-outline btn-sm" onclick="rcToggleDoNotBill(\''+escHtml(c.id)+'\');closeModal(\'modal-rc-detail\')">'+(c.doNotBill?'&#9989; Resume Billing':'&#128683; Do Not Bill')+'</button>'
    +'</div>'
    +'</div>'

    // Right — line items + upcoming + price history
    +'<div>'

    // Line items
    +'<div style="font-size:12px;font-weight:700;color:#0d1b2a;margin-bottom:8px">Line Items</div>'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">'
    +'<thead><tr style="background:#f5f7fa"><th style="padding:6px 8px;text-align:left;font-size:10px;color:#90a4ae;text-transform:uppercase">Description</th><th style="padding:6px 8px;text-align:center;font-size:10px;color:#90a4ae">Qty</th><th style="padding:6px 8px;text-align:right;font-size:10px;color:#90a4ae;text-transform:uppercase">Unit</th><th style="padding:6px 8px;text-align:right;font-size:10px;color:#90a4ae;text-transform:uppercase">Total</th></tr></thead>'
    +'<tbody>'
    +(c.lineItems||[]).map(function(i){
      return '<tr style="border-bottom:1px solid #f0f0f0">'
        +'<td style="padding:6px 8px">'+escHtml(i.desc||'')+'</td>'
        +'<td style="padding:6px 8px;text-align:center">'+parseFloat(i.qty||1)+'</td>'
        +'<td style="padding:6px 8px;text-align:right">$'+parseFloat(i.unitPrice||0).toFixed(2)+'</td>'
        +'<td style="padding:6px 8px;text-align:right;font-weight:700">$'+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0)).toFixed(2)+'</td>'
      +'</tr>';
    }).join('')
    +'<tr style="background:#e3f2fd"><td colspan="3" style="padding:7px 8px;font-weight:700;text-align:right">'+cycleLabel+' Total</td>'
    +'<td style="padding:7px 8px;text-align:right;font-weight:800;color:#1565c0">$'+perCycle.toFixed(2)+'</td></tr>'
    +'</tbody></table>'

    // Price history
    +((c.priceHistory&&c.priceHistory.length)?
      '<div style="font-size:12px;font-weight:700;color:#0d1b2a;margin-bottom:8px">Price Change History</div>'
      +'<div style="border:1px solid #e0e7ef;border-radius:8px;overflow:hidden;margin-bottom:16px">'
      +c.priceHistory.slice(0,5).map(function(h,i){
        var up = h.newAmt > h.oldAmt;
        return '<div style="display:grid;grid-template-columns:90px 80px 80px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid #f5f5f5;align-items:center">'
          +'<span style="font-size:11px;color:#90a4ae">'+escHtml(h.date||'')+'</span>'
          +'<span style="font-size:11px;color:#c62828;text-decoration:line-through">$'+parseFloat(h.oldAmt||0).toFixed(2)+'</span>'
          +'<span style="font-size:11px;font-weight:700;color:'+(up?'#c62828':'#2e7d32')+'">'+(up?'&#9650;':'&#9660;')+' $'+parseFloat(h.newAmt||0).toFixed(2)+'</span>'
          +'<span style="font-size:10px;color:#546e7a">'+escHtml(h.reason||h.changedBy||'')+'</span>'
        +'</div>';
      }).join('')
      +'</div>'
    :'')

    // Upcoming invoices
    +(c.status==='active'&&!c.doNotBill?
      '<div style="font-size:12px;font-weight:700;color:#0d1b2a;margin-bottom:8px">Upcoming Invoices</div>'
      +'<div style="border:1px solid #e0e7ef;border-radius:8px;overflow:hidden;margin-bottom:16px">'
      +upcoming.map(function(d,i){
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid #f5f5f5">'
          +'<span style="font-size:12px'+(i===0?';font-weight:700;color:#1565c0':'')+'">'+escHtml(d)+'</span>'
          +'<span style="font-size:12px;font-weight:600">$'+perCycle.toFixed(2)+'</span>'
        +'</div>';
      }).join('')
      +'</div>'
    :'')

    // Past invoices
    +(pastInvoices.length?
      '<div style="font-size:12px;font-weight:700;color:#0d1b2a;margin-bottom:8px">Past Invoices</div>'
      +'<div style="border:1px solid #e0e7ef;border-radius:8px;overflow:hidden;max-height:200px;overflow-y:auto">'
      +pastInvoices.map(function(inv){
        return '<div style="display:grid;grid-template-columns:100px 1fr 80px 80px;gap:8px;padding:7px 12px;border-bottom:1px solid #f5f5f5;align-items:center">'
          +'<span style="font-size:11px;font-weight:700;color:#1565c0">'+escHtml(inv.num||'')+'</span>'
          +'<span style="font-size:11px;color:#546e7a">'+escHtml(inv.invoiceDate||inv.runDate||'')+'</span>'
          +'<span style="font-size:11px;font-weight:700">$'+parseFloat(inv.amount||0).toFixed(2)+'</span>'
          +'<span onclick="printRCInvoice(\''+escHtml(inv.id)+'\')" style="font-size:11px;color:#1565c0;cursor:pointer;text-decoration:underline">Print</span>'
        +'</div>';
      }).join('')
      +'</div>'
    :'<div style="font-size:12px;color:#90a4ae;font-style:italic">No invoices run yet.</div>')

    +'</div>'
  +'</div>';

  var modal = document.getElementById('modal-rc-detail');
  if (!modal) return;
  document.getElementById('rc-detail-title').textContent = (c.number||'') + ' — ' + (c.client||'');
  document.getElementById('rc-detail-body').innerHTML = html;
  openModal('modal-rc-detail');
}

