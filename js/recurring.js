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
  var d = new Date(dateStr);
  var months = (RC_CYCLES[cycle]||{months:1}).months;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
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
function renderRecurring() {
  try {
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
      +(dueCount>0?'<button class="btn btn-primary" onclick="openBillingRun()">&#128184; Run Billing</button>':'')
    +'</div>';

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
      var stColors = {active:'#2e7d32',paused:'#f57c00',cancelled:'#9e9e9e'};
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
  document.getElementById('rc-type').value = c.type||'';
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
      +'<th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;width:50%">Description</th>'
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
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px;text-align:center" type="number" min="1" step="1" value="'+parseFloat(item.qty||1)+'" oninput="_rcUpdateLine('+idx+',\'qty\',this.value)"></td>'
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px;text-align:right" type="number" min="0" step="0.01" placeholder="0.00" value="'+parseFloat(item.unitPrice||0).toFixed(2)+'" oninput="_rcUpdateLine('+idx+',\'unitPrice\',this.value)"></td>'
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
      if (cells[3]) cells[3].textContent = '$'+(parseFloat(item.qty||1)*parseFloat(item.unitPrice||0)).toFixed(2);
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
  if (!confirm('Delete managed service contract '+c.number+' for '+c.client+'?\nThis cannot be undone.')) return;
  DB.recurringContracts = (DB.recurringContracts||[]).filter(function(x){return x.id!==id;});
  saveDB();
  if (typeof _sb!=='undefined'&&_sb) _sb.from('recurring_contracts').delete().eq('id',id).then(function(){});
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
  // Only run checked contracts
  var checkedIds = Array.from(document.querySelectorAll('.rc-run-chk:checked')).map(function(c){ return c.getAttribute('data-rcid'); });
  var due = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c, runDate) && checkedIds.indexOf(c.id)>=0; });
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
function executeBillingRun() {
  var runDate = document.getElementById('rc-run-date').value;
  if (!runDate) { showToast('Select a run date','warning',2000); return; }

  var due = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c, runDate); });
  if (!due.length) { showToast('No contracts due on this date','info',2000); return; }

  var generated = [];

  due.forEach(function(c) {
    // Generate invoice
    if (!DB.invoices) DB.invoices = [];
    var invNum = 'INV-RC-'+String(Date.now()).slice(-6);
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
  });

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
      +(co.phone||'')+'\n'+(co.email||'')
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
function printRCInvoice(invId) {
  var inv = (DB.invoices||[]).find(function(i){return i.id===invId;});
  if (!inv) return;
  var co = DB.settings||{};
  function esc(s){return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  var lineRows = (inv.lineItems||[]).map(function(i){
    return '<tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">'+esc(i.desc||'')+'</td>'
      +'<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:center">'+parseFloat(i.qty||1)+'</td>'
      +'<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">$'+parseFloat(i.unitPrice||0).toFixed(2)+'</td>'
      +'<td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700">$'+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0)).toFixed(2)+'</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(inv.num)+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'
    +'body{padding:30px;font-size:12px;color:#0d1b2a;}'
    +'@media print{body{padding:0;}@page{margin:20mm;}.no-print{display:none;}}'
    +'</style></head><body>'
    +'<button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#1565c0;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer">&#128424; Print / Save PDF</button>'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:16px;margin-bottom:20px">'
      +'<div><div style="font-size:20px;font-weight:800">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>'
        +'<div style="font-size:11px;color:#546e7a;margin-top:3px">'+esc(co.address||'')+(co.city?' · '+esc(co.city):'')+(co.phone?' · '+esc(co.phone):'')+'</div></div>'
      +'<div style="text-align:right"><div style="font-size:24px;font-weight:800;color:#1565c0">INVOICE</div>'
        +'<div style="font-size:14px;font-weight:700;margin-top:4px">'+esc(inv.num)+'</div>'
        +'<div style="font-size:11px;color:#546e7a;margin-top:2px">Invoice Date: '+esc(inv.invoiceDate||inv.runDate||'')+'</div>'
        +'<div style="font-size:11px;color:#546e7a">Due: Upon Receipt</div>'
      +'</div>'
    +'</div>'
    +'<div style="margin-bottom:20px"><div style="font-size:10px;font-weight:700;color:#90a4ae;text-transform:uppercase;margin-bottom:4px">Bill To</div>'
      +'<div style="font-size:14px;font-weight:700">'+esc(inv.clientName||'')+'</div>'
      +(inv.clientEmail?'<div style="font-size:12px;color:#546e7a">'+esc(inv.clientEmail)+'</div>':'')
    +'</div>'
    +'<div style="background:#f5f7fa;border-radius:4px;padding:8px 12px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;margin-bottom:4px">'+esc(inv.rcNumber||'')+' — '+(RC_CYCLES[inv.billingCycle]||{label:inv.billingCycle||''}).label+' Billing</div>'
    +'<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'
      +'<thead><tr style="background:#0d1b2a">'
        +'<th style="padding:9px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase">Description</th>'
        +'<th style="padding:9px;text-align:center;color:#fff;font-size:11px;text-transform:uppercase;width:60px">Qty</th>'
        +'<th style="padding:9px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;width:100px">Unit Price</th>'
        +'<th style="padding:9px;text-align:right;color:#fff;font-size:11px;text-transform:uppercase;width:100px">Amount</th>'
      +'</tr></thead><tbody>'+lineRows+'</tbody>'
      +'<tfoot><tr style="background:#e3f2fd">'
        +'<td colspan="3" style="padding:10px;text-align:right;font-weight:800;font-size:13px">TOTAL DUE:</td>'
        +'<td style="padding:10px;text-align:right;font-weight:800;font-size:16px;color:#1565c0">$'+parseFloat(inv.amount||0).toFixed(2)+'</td>'
      +'</tr></tfoot>'
    +'</table>'
    +(inv.notes?'<div style="font-size:11px;color:#546e7a;margin-bottom:20px"><strong>Notes:</strong> '+esc(inv.notes)+'</div>':'')
    +'<div style="border-top:1px solid #e0e7ef;padding-top:12px;font-size:10px;color:#90a4ae;text-align:center">'
      +esc(co.cname||'Total Communications Systems & Solutions, Inc.')+' · '+(co.phone||'')+' · tcssbuild.com'
      +'<br>Thank you for your business.'
    +'</div>'
    +'</body></html>';

  var win = window.open('','_blank','width=860,height=1100');
  win.document.write(html);
  win.document.close();
  win.focus();
}


// ── Managed Services Settings ─────────────────────────────────────────────────
// DB.msSettings = { types:[], statuses:[], cycles:{} }
var MS_DEFAULT_TYPES    = ['Phone Equipment','VoIP','Computer Services','IT Support','Security / Access Control','Camera System','Network Maintenance','Cabling Maintenance','Audio / Visual','Other'];
var MS_DEFAULT_STATUSES = ['active','paused','cancelled'];
var MS_DEFAULT_CYCLES   = {monthly:{label:'Monthly',months:1},quarterly:{label:'Quarterly',months:3},biannual:{label:'Bi-Annual',months:6},annual:{label:'Annual',months:12}};

function _getMSTypes()    { return (DB.msSettings&&DB.msSettings.types&&DB.msSettings.types.length)    ? DB.msSettings.types    : MS_DEFAULT_TYPES; }
function _getMSStatuses() { return (DB.msSettings&&DB.msSettings.statuses&&DB.msSettings.statuses.length) ? DB.msSettings.statuses : MS_DEFAULT_STATUSES; }
function _getMSCycles()   { return (DB.msSettings&&DB.msSettings.cycles&&Object.keys(DB.msSettings.cycles).length) ? DB.msSettings.cycles : MS_DEFAULT_CYCLES; }

function renderMSSettings() {
  var wrap = document.getElementById('ms-settings-wrap');
  if (!wrap) return;
  var types    = _getMSTypes();
  var statuses = _getMSStatuses();
  var cycles   = _getMSCycles();

  wrap.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">'

    // Types
    +'<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Service Types</div>'
    +types.map(function(t,i){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0">'
        +'<span style="font-size:13px">'+escHtml(t)+'</span>'
        +'<span onclick="msDeleteType('+i+')" style="cursor:pointer;color:#c62828;font-size:18px;font-weight:700;padding:0 4px" title="Delete">&#215;</span>'
      +'</div>';
    }).join('')
    +'<div style="display:flex;gap:6px;margin-top:10px">'
      +'<input id="ms-new-type" class="form-control" style="font-size:12px" placeholder="Add service type...">'
      +'<button class="btn btn-primary btn-sm" onclick="msAddType()">Add</button>'
    +'</div></div>'

    // Statuses
    +'<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Contract Statuses</div>'
    +statuses.map(function(s,i){
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0">'
        +'<span style="font-size:13px;text-transform:capitalize">'+escHtml(s)+'</span>'
        +(statuses.length>1?'<span onclick="msDeleteStatus('+i+')" style="cursor:pointer;color:#c62828;font-size:18px;font-weight:700;padding:0 4px" title="Delete">&#215;</span>':'<span style="font-size:10px;color:#90a4ae">required</span>')
      +'</div>';
    }).join('')
    +'<div style="display:flex;gap:6px;margin-top:10px">'
      +'<input id="ms-new-status" class="form-control" style="font-size:12px" placeholder="Add status...">'
      +'<button class="btn btn-primary btn-sm" onclick="msAddStatus()">Add</button>'
    +'</div></div>'

    // Cycles
    +'<div><div style="font-size:13px;font-weight:700;color:#0d1b2a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #1565c0">Billing Cycles</div>'
    +Object.keys(cycles).map(function(key){
      var c = cycles[key];
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0">'
        +'<span style="font-size:13px">'+escHtml(c.label)+' <span style="font-size:10px;color:#90a4ae">('+c.months+'mo)</span></span>'
        +'<span class="ms-del-cycle" data-key="'+escHtml(key)+'" onclick="msDeleteCycle(this.dataset.key)" style="cursor:pointer;color:#c62828;font-size:18px;font-weight:700;padding:0 4px">&#215;</span>'
      +'</div>';
    }).join('')
    +'<div style="display:grid;grid-template-columns:1fr 1fr 80px;gap:6px;margin-top:10px">'
      +'<input id="ms-new-cycle-label" class="form-control" style="font-size:12px" placeholder="Label (e.g. Weekly)">'
      +'<input id="ms-new-cycle-months" class="form-control" style="font-size:12px" type="number" min="1" placeholder="Months">'
      +'<button class="btn btn-primary btn-sm" onclick="msAddCycle()">Add</button>'
    +'</div></div>'

    +'</div>';
}

function _saveMSSettings() {
  if (!DB.msSettings) DB.msSettings = {};
  saveDB();
  if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  renderMSSettings();
  // Refresh type dropdown in modal if open
  var sel = document.getElementById('rc-type');
  if (sel) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">Select Type</option>';
    _getMSTypes().forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; if(t===cur)o.selected=true; sel.appendChild(o); });
  }
  showToast('Managed Services settings saved','success',2000);
}

function msAddType() {
  var v = (document.getElementById('ms-new-type').value||'').trim();
  if (!v) return;
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.types) DB.msSettings.types = _getMSTypes().slice();
  if (DB.msSettings.types.includes(v)) { showToast('Type already exists','warning',2000); return; }
  DB.msSettings.types.push(v);
  document.getElementById('ms-new-type').value = '';
  _saveMSSettings();
}

function msDeleteType(idx) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.types) DB.msSettings.types = _getMSTypes().slice();
  if (DB.msSettings.types.length <= 1) { showToast('Must keep at least one type','warning',2000); return; }
  DB.msSettings.types.splice(idx,1);
  _saveMSSettings();
}

function msAddStatus() {
  var v = (document.getElementById('ms-new-status').value||'').trim().toLowerCase().replace(/\s+/g,'_');
  if (!v) return;
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.statuses) DB.msSettings.statuses = _getMSStatuses().slice();
  if (DB.msSettings.statuses.includes(v)) { showToast('Status already exists','warning',2000); return; }
  DB.msSettings.statuses.push(v);
  document.getElementById('ms-new-status').value = '';
  _saveMSSettings();
}

function msDeleteStatus(idx) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.statuses) DB.msSettings.statuses = _getMSStatuses().slice();
  if (DB.msSettings.statuses.length <= 1) { showToast('Must keep at least one status','warning',2000); return; }
  DB.msSettings.statuses.splice(idx,1);
  _saveMSSettings();
}

function msAddCycle() {
  var label  = (document.getElementById('ms-new-cycle-label').value||'').trim();
  var months = parseInt(document.getElementById('ms-new-cycle-months').value)||0;
  if (!label || months < 1) { showToast('Enter label and months','warning',2000); return; }
  var key = label.toLowerCase().replace(/\s+/g,'_');
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.cycles) DB.msSettings.cycles = Object.assign({},_getMSCycles());
  DB.msSettings.cycles[key] = {label:label,months:months};
  document.getElementById('ms-new-cycle-label').value = '';
  document.getElementById('ms-new-cycle-months').value = '';
  _saveMSSettings();
}

function msDeleteCycle(key) {
  if (!DB.msSettings) DB.msSettings = {};
  if (!DB.msSettings.cycles) DB.msSettings.cycles = Object.assign({},_getMSCycles());
  if (Object.keys(DB.msSettings.cycles).length <= 1) { showToast('Must keep at least one cycle','warning',2000); return; }
  delete DB.msSettings.cycles[key];
  _saveMSSettings();
}


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
  }).then(function(){});
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

  var stColor = ({active:'#2e7d32',paused:'#f57c00',cancelled:'#9e9e9e'})[c.status]||'#546e7a';

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

