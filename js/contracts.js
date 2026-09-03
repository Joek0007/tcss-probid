// ── TCSS ProBid V9 — Contracts Module ────────────────────────────────────────
// DB.contracts = [] — each contract:
// { id, number, type, client, project, value, status, scope, notes,
//   dateCreated, dateExecuted, dateExpires, woId, parentContractId, createdAt }

var _contractCurrentId = null;

var CONTRACT_TYPES = {
  subcontractor: { label: 'Subcontractor Agreement', icon: '🤝', color: '#1565c0' },
  owner:         { label: 'Owner Service Agreement',  icon: '🏢', color: '#2e7d32' },
  tm:            { label: 'T&M Service Agreement',    icon: '⏱',  color: '#e65100' },
  msa:           { label: 'Master Service Agreement', icon: '📋', color: '#6a1b9a' },
  change_order:  { label: 'Change Order',             icon: '🔄', color: '#f57c00' },
};

var CONTRACT_STATUSES = {
  draft:    { label: 'Draft',    color: '#90a4ae', bg: '#f5f7fa' },
  sent:     { label: 'Sent',     color: '#f57c00', bg: '#fff8e1' },
  executed: { label: 'Executed', color: '#2e7d32', bg: '#e8f5e9' },
  expired:  { label: 'Expired',  color: '#c62828', bg: '#ffebee' },
  voided:   { label: 'Voided',   color: '#9e9e9e', bg: '#f5f5f5' },
};

// ── Next contract number ───────────────────────────────────────────────────────
function _nextContractNumber(type) {
  var prefix = { subcontractor:'SA', owner:'OSA', tm:'TM', msa:'MSA', change_order:'CO' }[type] || 'C';
  var existing = (DB.contracts||[]).filter(function(c){ return c.type===type; });
  var nums = existing.map(function(c){
    var m = (c.number||'').match(/\d+/);
    return m ? parseInt(m[0]) : 0;
  });
  var next = nums.length ? Math.max.apply(null, nums) + 1 : 1;
  return prefix + '-' + String(next).padStart(3,'0');
}

// ── Render contract list ───────────────────────────────────────────────────────
function renderContracts() {
  var list = document.getElementById('contract-list');
  if (!list) return;

  var search = ((document.getElementById('contract-search')||{}).value||'').trim().toLowerCase();
  var fType  = (document.getElementById('contract-filter-type')||{}).value||'';
  var fStatus= (document.getElementById('contract-filter-status')||{}).value||'';

  var contracts = (DB.contracts||[]).slice().sort(function(a,b){
    return (b.createdAt||'').localeCompare(a.createdAt||'');
  });

  if (search) contracts = contracts.filter(function(c){
    return (c.client||'').toLowerCase().includes(search) ||
           (c.project||'').toLowerCase().includes(search) ||
           (c.number||'').toLowerCase().includes(search) ||
           (c.scope||'').toLowerCase().includes(search);
  });
  if (fType) contracts = contracts.filter(function(c){ return c.type===fType; });
  if (fStatus) contracts = contracts.filter(function(c){ return c.status===fStatus; });

  if (!contracts.length) {
    list.innerHTML = '<div style="background:#fff;border-radius:10px;padding:40px;text-align:center;color:#90a4ae;font-size:14px;box-shadow:0 1px 4px rgba(0,0,0,.06)">'
      +'No contracts yet. Click <strong>+ New Contract</strong> to create one.</div>';
    return;
  }

  var cols = '100px 120px 1fr 1fr 130px 110px 120px 80px 40px';
  var header = '<div style="display:grid;grid-template-columns:'+cols+';padding:9px 16px;background:#f5f7fa;border-bottom:2px solid #e0e7ef;font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;border-radius:10px 10px 0 0">'
    +'<span>Number</span><span>Type</span><span>Client</span><span>Project</span>'
    +'<span>Value</span><span>Status</span><span>Dates</span><span>WO</span><span></span>'
    +'</div>';

  var rows = contracts.map(function(c) {
    var ct = CONTRACT_TYPES[c.type] || { label:c.type, icon:'📄', color:'#546e7a' };
    var cs = CONTRACT_STATUSES[c.status] || { label:c.status, color:'#90a4ae', bg:'#f5f7fa' };
    var wo = c.woId ? (DB.workOrders||[]).find(function(w){return w.id===c.woId;}) : null;
    var isExpiringSoon = c.dateExpires && !['expired','voided'].includes(c.status) &&
      (new Date(c.dateExpires) - Date.now()) < 30*24*3600*1000;

    return '<div class="contract-row" data-cid="'+escHtml(c.id)+'" style="display:grid;grid-template-columns:'+cols+';padding:11px 16px;border-bottom:1px solid #f0f4f8;align-items:center;cursor:pointer;transition:background .1s" onmouseover="this.style.background=\'#f0f4ff\'" onmouseout="this.style.background=\'\'" onclick="openContractModal(\''+escHtml(c.id)+'\')">'
      +'<div style="font-weight:700;color:#1565c0;font-size:12px">'+escHtml(c.number||'—')+'</div>'
      +'<div><span style="background:'+ct.color+'22;color:'+ct.color+';padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;white-space:nowrap">'+ct.icon+' '+escHtml(ct.label)+'</span></div>'
      +'<div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(c.client||'—')+'</div>'
      +'<div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#546e7a">'+escHtml(c.project||'—')+'</div>'
      +'<div style="font-size:12px;font-weight:600">'+( c.value ? '$'+parseFloat(c.value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—')+'</div>'
      +'<div><span style="background:'+cs.bg+';color:'+cs.color+';padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700">'+cs.label+'</span></div>'
      +'<div style="font-size:10px;color:#90a4ae">'
        +(c.dateExecuted?'✅ '+c.dateExecuted:'')
        +(c.dateExpires?'<div style="color:'+(isExpiringSoon?'#c62828':'#90a4ae')+'">Exp: '+c.dateExpires+(isExpiringSoon?' ⚠':'')+'</div>':'')
      +'</div>'
      +'<div style="font-size:11px;color:#1565c0">'+(wo?escHtml(wo.woNumber||''):'')+'</div>'
      +'<div style="font-size:18px;font-weight:700;color:#90a4ae;cursor:pointer" onclick="event.stopPropagation();contractMenu(\''+escHtml(c.id)+'\')">⋮</div>'
    +'</div>';
  }).join('');

  list.innerHTML = '<div style="background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);overflow:hidden">'+header+rows+'</div>';
}

// ── Open new contract modal ────────────────────────────────────────────────────
function openNewContract() {
  _contractCurrentId = null;
  document.getElementById('contract-modal-title').textContent = 'New Contract';
  document.getElementById('contract-type').value = '';
  document.getElementById('contract-number').value = '';
  document.getElementById('contract-client').value = '';
  document.getElementById('contract-project').value = '';
  document.getElementById('contract-value').value = '';
  document.getElementById('contract-status').value = 'draft';
  document.getElementById('contract-date-created').value = getTodayISO();
  document.getElementById('contract-date-executed').value = '';
  document.getElementById('contract-date-expires').value = '';
  document.getElementById('contract-scope').value = '';
  document.getElementById('contract-notes').value = '';
  document.getElementById('contract-wo').value = '';
  document.getElementById('contract-co-section').style.display = 'none';
  document.getElementById('contract-print-btn').style.display = 'none';
  _populateContractWOSelect();
  _populateContractParentSelect();
  openModal('modal-contract');
}

// ── Open existing contract ─────────────────────────────────────────────────────
function openContractModal(id) {
  var c = (DB.contracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  _contractCurrentId = id;
  document.getElementById('contract-modal-title').textContent = c.number || 'Contract';
  document.getElementById('contract-type').value = c.type||'';
  document.getElementById('contract-number').value = c.number||'';
  document.getElementById('contract-client').value = c.client||'';
  document.getElementById('contract-project').value = c.project||'';
  document.getElementById('contract-value').value = c.value||'';
  document.getElementById('contract-status').value = c.status||'draft';
  document.getElementById('contract-date-created').value = c.dateCreated||'';
  document.getElementById('contract-date-executed').value = c.dateExecuted||'';
  document.getElementById('contract-date-expires').value = c.dateExpires||'';
  document.getElementById('contract-scope').value = c.scope||'';
  document.getElementById('contract-notes').value = c.notes||'';
  _populateContractWOSelect(c.woId);
  _populateContractParentSelect(c.parentContractId);
  document.getElementById('contract-co-section').style.display = c.type==='change_order'?'':'none';
  document.getElementById('contract-print-btn').style.display = '';
  openModal('modal-contract');
  // Prev/next arrows — step through contracts by number
  if (typeof showDocNav === 'function') showDocNav('contract', id, openContractModal, null, 'modal-contract');
}

function _populateContractWOSelect(selectedId) {
  var sel = document.getElementById('contract-wo');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Link to WO (optional) —</option>';
  (DB.workOrders||[]).filter(function(w){ return w.status!=='Billed'&&w.status!=='Void'; })
    .forEach(function(w){
      var o = document.createElement('option');
      o.value = w.id;
      o.textContent = (w.woNumber||'') + ' — ' + (w.customerName||'') + (w.description?' · '+w.description.substring(0,30):'');
      if (selectedId && w.id===selectedId) o.selected = true;
      sel.appendChild(o);
    });
}

function _populateContractParentSelect(selectedId) {
  var sel = document.getElementById('contract-parent');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Link to Parent Agreement —</option>';
  (DB.contracts||[]).filter(function(c){ return c.type!=='change_order'; })
    .forEach(function(c){
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = (c.number||'') + ' — ' + (c.client||'') + (c.project?' · '+c.project:'');
      if (selectedId && c.id===selectedId) o.selected = true;
      sel.appendChild(o);
    });
}

function contractTypeChanged() {
  var type = document.getElementById('contract-type').value;
  var coSection = document.getElementById('contract-co-section');
  if (coSection) coSection.style.display = type==='change_order' ? '' : 'none';
  // Auto-assign number if new contract
  if (!_contractCurrentId && type) {
    document.getElementById('contract-number').value = _nextContractNumber(type);
  }
}

// ── Save contract ──────────────────────────────────────────────────────────────
function saveContract() {
  var type   = document.getElementById('contract-type').value;
  var client = document.getElementById('contract-client').value.trim();
  if (!type || !client) { showToast('Type and Client are required','warning',2500); return; }

  if (!DB.contracts) DB.contracts = [];

  var isNew = !_contractCurrentId;
  var id = _contractCurrentId || 'ctr-'+Date.now();

  var data = {
    id:               id,
    number:           document.getElementById('contract-number').value.trim(),
    type:             type,
    client:           client,
    project:          document.getElementById('contract-project').value.trim(),
    value:            parseFloat(document.getElementById('contract-value').value)||0,
    status:           document.getElementById('contract-status').value||'draft',
    scope:            document.getElementById('contract-scope').value.trim(),
    notes:            document.getElementById('contract-notes').value.trim(),
    dateCreated:      document.getElementById('contract-date-created').value,
    dateExecuted:     document.getElementById('contract-date-executed').value,
    dateExpires:      document.getElementById('contract-date-expires').value,
    woId:             document.getElementById('contract-wo').value||null,
    parentContractId: document.getElementById('contract-parent').value||null,
    createdAt:        isNew ? new Date().toISOString() : ((DB.contracts.find(function(c){return c.id===id;})||{}).createdAt||new Date().toISOString()),
  };

  if (isNew) {
    DB.contracts.push(data);
  } else {
    var idx = DB.contracts.findIndex(function(c){return c.id===id;});
    if (idx>=0) DB.contracts[idx] = data;
  }

  saveDB();
  _pushContractToSupabase(data);
  closeModal('modal-contract');
  renderContracts();
  showToast('Contract '+(data.number||'')+(isNew?' created':' updated')+' ✓','success',2500);
}

// ── Delete contract ───────────────────────────────────────────────────────────
function contractMenu(id) {
  var c = (DB.contracts||[]).find(function(x){return x.id===id;});
  if (!c) return;
  if (!confirm('Delete contract '+c.number+'? This cannot be undone.')) return;
  DB.contracts = (DB.contracts||[]).filter(function(x){return x.id!==id;});
  saveDB();
  if (typeof _sb!=='undefined'&&_sb) _sb.from('contracts').delete().eq('id',id).then(function(){});
  renderContracts();
  showToast('Contract deleted','info',2000);
}

// ── Print contract template ────────────────────────────────────────────────────
function printContractTemplate() {
  var c = (DB.contracts||[]).find(function(x){return x.id===_contractCurrentId;});
  if (!c) return;
  var ct = CONTRACT_TYPES[c.type] || {label:c.type,icon:'📄'};
  var co = DB.settings||{};

  function esc(s){return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function fld(label){return '<span style="color:#c62828;font-weight:700;text-decoration:underline">['+label+']</span>';}

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(ct.label)+' — '+esc(c.number||'')+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif;}'
    +'body{padding:24px;font-size:12px;color:#0d1b2a;}'
    +'@media print{body{padding:0;}@page{margin:20mm;}}'
    +'.no-print-btn{position:fixed;top:16px;right:16px;background:#1565c0;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;}'
    +'@media print{.no-print-btn{display:none;}}'
    +'.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1565c0;padding-bottom:14px;margin-bottom:20px;}'
    +'.badge{padding:4px 14px;border-radius:12px;font-size:12px;font-weight:700;color:#fff;background:#1565c0;}'
    +'h2{font-size:13px;font-weight:700;text-transform:uppercase;color:#546e7a;border-bottom:1px solid #e0e7ef;padding-bottom:4px;margin:20px 0 12px;letter-spacing:.4px;}'
    +'.info-row{display:grid;grid-template-columns:150px 1fr;gap:6px;margin-bottom:8px;font-size:12px;}'
    +'.info-label{font-weight:700;color:#90a4ae;}'
    +'</style></head><body>'
    +'<button class="no-print-btn" onclick="window.print()">🖨 Print / Save PDF</button>'
    +'<div class="header">'
      +'<div><div style="font-size:20px;font-weight:800">'+esc(co.cname||'Total Communications Systems & Solutions, Inc.')+'</div>'
      +'<div style="font-size:11px;color:#546e7a;margin-top:3px">'+esc(co.address||'')+(co.city?' · '+esc(co.city):'')+(co.state?' '+esc(co.state):'')+(co.phone?' · '+esc(co.phone):'')+'</div></div>'
      +'<div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#1565c0">'+esc(c.number||'')+'</div>'
      +'<div style="margin-top:4px"><span class="badge">'+esc(ct.label)+'</span></div></div>'
    +'</div>'
    +'<h2>Contract Details</h2>'
    +'<div class="info-row"><div class="info-label">Client:</div><div style="font-weight:600">'+esc(c.client||fld('Client Name'))+'</div></div>'
    +'<div class="info-row"><div class="info-label">Project:</div><div>'+esc(c.project||fld('Project Name'))+'</div></div>'
    +'<div class="info-row"><div class="info-label">Contract Value:</div><div style="font-weight:700">'+( c.value?'$'+parseFloat(c.value).toLocaleString():fld('$__________'))+'</div></div>'
    +'<div class="info-row"><div class="info-label">Date:</div><div>'+esc(c.dateCreated||fld('Date'))+'</div></div>'
    +'<div class="info-row"><div class="info-label">Executed:</div><div>'+esc(c.dateExecuted||'___________________________')+'</div></div>'
    +(c.dateExpires?'<div class="info-row"><div class="info-label">Expires:</div><div>'+esc(c.dateExpires)+'</div></div>':'')
    +'<h2>Scope of Work</h2>'
    +'<div style="background:#f9f9f9;border:1px solid #e0e7ef;border-radius:6px;padding:12px;min-height:80px;white-space:pre-wrap">'+(c.scope?(typeof rtfDisplayHTML==='function'?rtfDisplayHTML(c.scope):esc(c.scope)):fld('Describe scope of work here'))+'</div>'
    +'<h2>Terms & Conditions</h2>'
    +'<p style="font-size:11px;color:#546e7a;font-style:italic">This contract is governed by the terms of TCSS\'s standard '+esc(ct.label)+'. A complete copy of the governing terms and conditions is attached or available upon request.</p>'
    +'<div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px">'
      +'<div style="border-top:1px solid #000;padding-top:6px;font-size:11px;color:#546e7a">Client Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>'
      +'<div style="border-top:1px solid #000;padding-top:6px;font-size:11px;color:#546e7a">TCSS — Authorized Signature &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Date</div>'
    +'</div>'
    +'<div style="margin-top:24px;border-top:1px solid #e0e7ef;padding-top:10px;font-size:10px;color:#90a4ae;text-align:center">'
      +esc(co.cname||'Total Communications Systems & Solutions, Inc.')+' · tcssbuild.com'
    +'</div>'
    +'</body></html>';

  var win = window.open('','_blank','width=860,height:1100');
  win.document.write(html);
  win.document.close();
  win.focus();
}

// ── Supabase sync ─────────────────────────────────────────────────────────────
function _pushContractToSupabase(c) {
  if (typeof _sb==='undefined'||!_sb) return;
  _sb.from('contracts').upsert({
    id: c.id, number: c.number, type: c.type, client: c.client,
    project: c.project||null, value: c.value||null, status: c.status,
    scope: c.scope||null, notes: c.notes||null,
    date_created: c.dateCreated||null, date_executed: c.dateExecuted||null,
    date_expires: c.dateExpires||null, wo_id: c.woId||null,
    parent_contract_id: c.parentContractId||null, created_at: c.createdAt
  }).then(function(){});
}
