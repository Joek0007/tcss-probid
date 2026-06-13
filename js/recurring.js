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
  var list = document.getElementById('rc-list');
  if (!list) return;

  var search = ((document.getElementById('rc-search')||{}).value||'').trim().toLowerCase();
  var fType  = (document.getElementById('rc-filter-type')||{}).value||'';
  var fStatus= (document.getElementById('rc-filter-status')||{}).value||'';

  // Populate type filter
  var typeEl = document.getElementById('rc-filter-type');
  if (typeEl && typeEl.options.length <= 1) {
    RC_TYPES.forEach(function(t){
      var o = document.createElement('option'); o.value=t; o.textContent=t;
      typeEl.appendChild(o);
    });
  }

  var contracts = (DB.recurringContracts||[]).slice().sort(function(a,b){
    return (a.nextBillingDate||'').localeCompare(b.nextBillingDate||'');
  });

  if (search) contracts = contracts.filter(function(c){
    return (c.client||'').toLowerCase().includes(search)||
           (c.type||'').toLowerCase().includes(search)||
           (c.number||'').toLowerCase().includes(search);
  });
  if (fType)   contracts = contracts.filter(function(c){ return c.type===fType; });
  if (fStatus) contracts = contracts.filter(function(c){ return c.status===fStatus; });

  // Summary counts
  var today = getTodayISO();
  var dueCount = (DB.recurringContracts||[]).filter(function(c){ return _rcIsDue(c,today); }).length;
  var activeCount = (DB.recurringContracts||[]).filter(function(c){ return c.status==='active'; }).length;
  var monthlyTotal = (DB.recurringContracts||[]).filter(function(c){ return c.status==='active'; })
    .reduce(function(s,c){ return s+((RC_CYCLES[c.billingCycle]||{months:1}).months>0?_rcLineTotal2(c):0); },0);

  var statusColors = {active:'#2e7d32',paused:'#f57c00',cancelled:'#9e9e9e'};
  var cycleLabels = {monthly:'Monthly',quarterly:'Quarterly',biannual:'Bi-Annual',annual:'Annual'};

  // Summary bar
  var summary = '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">'
    +'<div style="background:#fff;border-radius:10px;padding:14px 20px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:2px">'
      +'<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase">Active Contracts</div>'
      +'<div style="font-size:24px;font-weight:800;color:#1565c0">'+activeCount+'</div>'
    +'</div>'
    +'<div style="background:#fff;border-radius:10px;padding:14px 20px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:2px">'
      +'<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase">Due This Run</div>'
      +'<div style="font-size:24px;font-weight:800;color:'+(dueCount>0?'#c62828':'#2e7d32')+'">'+dueCount+'</div>'
    +'</div>'
    +(dueCount>0?'<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="openBillingRun()" style="font-size:13px;padding:12px 20px">&#128184; Run Billing</button></div>':'')
  +'</div>';

  if (!contracts.length) {
    list.innerHTML = summary + '<div style="background:#fff;border-radius:10px;padding:40px;text-align:center;color:#90a4ae;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)">No managed service contracts yet. Click <strong>+ New Contract</strong> to create one.</div>';
    return;
  }

  var cols = '90px 1fr 140px 100px 130px 120px 100px 80px 36px';
  var header = '<div style="display:grid;grid-template-columns:'+cols+';padding:9px 16px;background:#f5f7fa;border-bottom:2px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;border-radius:10px 10px 0 0">'
    +'<span>Number</span><span>Client</span><span>Type</span><span>Cycle</span>'
    +'<span>Next Billing</span><span>Amount</span><span>Status</span><span>Delivery</span><span></span>'
    +'</div>';

  var rows = contracts.map(function(c){
    var amt = _rcLineTotal2(c);
    var stColor = statusColors[c.status]||'#546e7a';
    var isDue = _rcIsDue(c, today);
    var isOverdue = c.nextBillingDate && c.nextBillingDate < today && c.status==='active';

    return '<div style="display:grid;grid-template-columns:'+cols+';padding:11px 16px;border-bottom:1px solid #f0f4f8;align-items:center;cursor:pointer;transition:background .1s" onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'\'" onclick="openRCModal(\''+escHtml(c.id)+'\')">'
      +'<div style="font-weight:700;color:#1565c0;font-size:12px">'+escHtml(c.number||'')+'</div>'
      +'<div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(c.client||'')+'</div>'
      +'<div style="font-size:11px;color:#546e7a">'+escHtml(c.type||'')+'</div>'
      +'<div style="font-size:11px">'+escHtml(cycleLabels[c.billingCycle]||c.billingCycle||'')+'</div>'
      +'<div style="font-size:12px;font-weight:600;color:'+(isOverdue?'#c62828':isDue?'#f57c00':'#0d1b2a')+'">'
        +(isOverdue?'&#9888; ':isDue?'&#128310; ':'')+escHtml(c.nextBillingDate||'—')
      +'</div>'
      +'<div style="font-size:13px;font-weight:700;color:#0d1b2a">$'+amt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</div>'
      +'<div><span style="background:'+stColor+'22;color:'+stColor+';padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700;text-transform:capitalize">'+escHtml(c.status||'')+'</span></div>'
      +'<div style="font-size:13px">'+(c.deliveryMethod==='mail'?'&#128236; Mail':'&#128231; Email')+'</div>'
      +'<div style="font-size:18px;color:#90a4ae" onclick="event.stopPropagation();rcMenu(\''+escHtml(c.id)+'\')">&#8942;</div>'
    +'</div>';
  }).join('');

  list.innerHTML = summary + '<div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:hidden">'+header+rows+'</div>';
}

function _rcLineTotal2(c) {
  return (c.lineItems||[]).reduce(function(s,i){
    return s+(parseFloat(i.qty||1)*parseFloat(i.unitPrice||0));
  },0);
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
    html += '<tr style="border-bottom:1px solid #f0f0f0">'
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px" placeholder="Description (e.g. Cisco 7965 Phone Rental)" value="'+escHtml(item.desc||'')+'" oninput="_rcUpdateLine('+idx+',\'desc\',this.value)"></td>'
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px;text-align:center" type="number" min="1" step="1" value="'+parseFloat(item.qty||1)+'" oninput="_rcUpdateLine('+idx+',\'qty\',this.value)"></td>'
      +'<td style="padding:6px 8px"><input class="form-control" style="font-size:12px;text-align:right" type="number" min="0" step="0.01" placeholder="0.00" value="'+parseFloat(item.unitPrice||0).toFixed(2)+'" oninput="_rcUpdateLine('+idx+',\'unitPrice\',this.value)"></td>'
      +'<td style="padding:6px 8px;text-align:right;font-weight:600">$'+lineTotal.toFixed(2)+'</td>'
      +'<td style="padding:6px 8px;text-align:center"><span onclick="_rcRemoveLine('+idx+')" style="cursor:pointer;color:#c62828;font-size:16px;font-weight:700">&#215;</span></td>'
    +'</tr>';
  });

  html += '</tbody><tfoot><tr style="background:#e3f2fd">'
    +'<td colspan="3" style="padding:8px;font-weight:700;text-align:right;font-size:12px">'+cycleLabel+' Total:</td>'
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
  };

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
