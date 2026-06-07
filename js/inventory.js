// ============================================================
// TCSS ProBid V9 — Inventory v2: Locations, Scanner, Import
// ============================================================

// ---- LOCATION MANAGEMENT ----

var _DEFAULT_LOCATIONS = [
  { id:'loc-shop',    name:'Main Shop',   type:'shop',    isDefault:true  },
  { id:'loc-v1',      name:'Vehicle 1',   type:'vehicle', isDefault:false },
  { id:'loc-v2',      name:'Vehicle 2',   type:'vehicle', isDefault:false },
  { id:'loc-v3',      name:'Vehicle 3',   type:'vehicle', isDefault:false },
  { id:'loc-v4',      name:'Vehicle 4',   type:'vehicle', isDefault:false },
  { id:'loc-v5',      name:'Vehicle 5',   type:'vehicle', isDefault:false },
  { id:'loc-v6',      name:'Vehicle 6',   type:'vehicle', isDefault:false },
  { id:'loc-v7',      name:'Vehicle 7',   type:'vehicle', isDefault:false },
  { id:'loc-v8',      name:'Vehicle 8',   type:'vehicle', isDefault:false },
  { id:'loc-v9',      name:'Vehicle 9',   type:'vehicle', isDefault:false },
  { id:'loc-v10',     name:'Vehicle 10',  type:'vehicle', isDefault:false },
  { id:'loc-v11',     name:'Vehicle 11',  type:'vehicle', isDefault:false },
  { id:'loc-v12',     name:'Vehicle 12',  type:'vehicle', isDefault:false },
  { id:'loc-v13',     name:'Vehicle 13',  type:'vehicle', isDefault:false },
  { id:'loc-v14',     name:'Vehicle 14',  type:'vehicle', isDefault:false },
  { id:'loc-v15',     name:'Vehicle 15',  type:'vehicle', isDefault:false },
];

function getLocations() {
  if (!DB.invLocations || !DB.invLocations.length) {
    DB.invLocations = _DEFAULT_LOCATIONS.map(function(l){ return Object.assign({},l); });
  }
  return DB.invLocations;
}

function getLocationName(id) {
  var loc = getLocations().find(function(l){ return l.id===id; });
  return loc ? loc.name : id||'Unknown';
}

// ---- INVENTORY ITEM QTY BY LOCATION ----
// Each inventory item has: item.locations = { 'loc-shop': 12, 'loc-v1': 4, ... }

function getItemQtyAtLocation(item, locId) {
  if (!item.locations) return 0;
  return parseFloat(item.locations[locId]||0);
}

function getTotalQty(item) {
  if (item.locations) {
    return Object.values(item.locations).reduce(function(s,v){ return s+parseFloat(v||0); },0);
  }
  return parseFloat(item.qty||0);
}

function adjustItemQty(itemId, locId, delta) {
  var item = (DB.inventory||[]).find(function(i){ return i.id===itemId; });
  if (!item) return;
  if (!item.locations) {
    // Migrate old single-qty to locations
    item.locations = {};
    item.locations['loc-shop'] = parseFloat(item.qty||0);
  }
  if (!item.locations[locId]) item.locations[locId] = 0;
  item.locations[locId] = Math.max(0, parseFloat(item.locations[locId]) + delta);
  item.qty = getTotalQty(item);
  saveDB();
}

// ---- SCANNER PAGE ----

var _scanMode = 'checkout'; // checkout | checkin | transfer
var _scanPendingItem = null;

function renderScannerPage() {
  _populateScannerJobSelect();
  _populateScannerLocSelect();
  updateScanModeUI();
  document.getElementById('scan-input').value = '';
  document.getElementById('scan-result').innerHTML = '';
}

function updateScanModeUI() {
  ['checkout','checkin','transfer'].forEach(function(m){
    var btn = document.getElementById('scan-mode-'+m);
    if (btn) btn.className = 'btn btn-sm ' + (m===_scanMode?'btn-primary':'btn-outline');
  });
  var toLocRow = document.getElementById('scan-to-loc-row');
  var jobRow   = document.getElementById('scan-job-row');
  var personRow= document.getElementById('scan-person-row');
  if (toLocRow) toLocRow.style.display = (_scanMode==='transfer'||_scanMode==='checkin') ? '' : 'none';
  if (jobRow)   jobRow.style.display   = _scanMode==='checkout' ? '' : 'none';
  if (personRow)personRow.style.display= _scanMode==='checkout' ? '' : 'none';
}

function setScanMode(mode) {
  _scanMode = mode;
  updateScanModeUI();
  document.getElementById('scan-input').focus();
}

function _populateScannerJobSelect() {
  var sel = document.getElementById('scan-job');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select WO or Job —</option>' +
    (DB.workOrders||[]).filter(function(w){ return w.status!=='Billed'&&w.status!=='Void'; }).map(function(w){
      return '<option value="wo:'+escHtml(w.id)+'">'+escHtml(w.woNumber)+' — '+escHtml(w.customerName||'')+'</option>';
    }).join('') +
    (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[])).map(function(j){
      return '<option value="job:'+escHtml(j.id)+'">'+escHtml(j.num)+' — '+escHtml(j.name||'')+'</option>';
    }).join('');
}

function _populateScannerLocSelect() {
  var fromSel = document.getElementById('scan-from-loc');
  var toSel   = document.getElementById('scan-to-loc');
  var locs    = getLocations();
  var opts    = locs.map(function(l){
    return '<option value="'+escHtml(l.id)+'">'+escHtml(l.name)+'</option>';
  }).join('');
  if (fromSel) fromSel.innerHTML = opts;
  if (toSel)   toSel.innerHTML   = opts;
  // Default from = shop
  if (fromSel) fromSel.value = 'loc-shop';
  if (toSel)   toSel.value   = 'loc-shop';
}

function onScanInput(val) {
  if (!val || !val.trim()) return;
  val = val.trim();
  // Find item by barcode, tag, or name
  var item = (DB.inventory||[]).find(function(i){
    return (i.barcode&&i.barcode===val) || (i.tag&&i.tag===val) || (i.name||'').toLowerCase()===val.toLowerCase();
  });
  if (!item) {
    // Unknown barcode — ask to identify
    document.getElementById('scan-result').innerHTML =
      '<div style="background:#fff3e0;border:1px solid #ffe082;border-radius:8px;padding:16px;margin-top:12px">'+
      '<div style="font-weight:700;color:#e65100;margin-bottom:8px">⚠️ Unknown barcode: '+escHtml(val)+'</div>'+
      '<p style="font-size:13px;margin-bottom:12px">This barcode isn\'t linked to any inventory item. Would you like to link it?</p>'+
      '<select id="scan-link-item" style="width:100%;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;margin-bottom:8px">'+
        '<option value="">— Select existing item to link —</option>'+
        (DB.inventory||[]).map(function(i){ return '<option value="'+escHtml(i.id)+'">'+escHtml(i.name)+'</option>'; }).join('')+
      '</select>'+
      '<button class="btn btn-primary btn-sm" onclick="linkBarcodeToItem(\''+escHtml(val)+'\')">Link Barcode</button>'+
      ' <button class="btn btn-outline btn-sm" onclick="createItemFromBarcode(\''+escHtml(val)+'\')">+ Create New Item</button>'+
      '</div>';
    document.getElementById('scan-input').value = '';
    return;
  }
  processScan(item);
}

function linkBarcodeToItem(barcode) {
  var selEl = document.getElementById('scan-link-item');
  var itemId = selEl ? selEl.value : '';
  if (!itemId) { showToast('Select an item to link','error'); return; }
  var item = (DB.inventory||[]).find(function(i){ return i.id===itemId; });
  if (!item) return;
  item.barcode = barcode;
  saveDB();
  showToast('Barcode linked to '+item.name,'success');
  processScan(item);
}

function createItemFromBarcode(barcode) {
  closeModal('modal-scanner-new');
  // Pre-fill the inventory modal with the barcode
  newInventoryItem();
  var bcEl = document.getElementById('inv-barcode');
  if (bcEl) bcEl.value = barcode;
  openModal('modal-inv-item');
}

function processScan(item) {
  var fromLoc = (document.getElementById('scan-from-loc')||{}).value || 'loc-shop';
  var toLoc   = (document.getElementById('scan-to-loc')||{}).value   || 'loc-shop';
  var qty     = parseFloat((document.getElementById('scan-qty')||{}).value)||1;

  if (_scanMode === 'checkout') {
    var jobVal    = (document.getElementById('scan-job')||{}).value || '';
    var personVal = (document.getElementById('scan-person')||{}).value || '';
    if (!jobVal) { showToast('Select a WO or Job first','error'); return; }
    var availQty  = getItemQtyAtLocation(item, fromLoc);
    if (availQty < qty) {
      showToast('Only '+availQty+' available at '+getLocationName(fromLoc),'error');
      showScanResult(item, 'error', 'Insufficient stock at '+getLocationName(fromLoc));
      return;
    }
    // Log checkout
    if (!DB.checkoutLog) DB.checkoutLog = [];
    var isWO   = jobVal.startsWith('wo:');
    var refId  = jobVal.replace(/^(wo|job):/,'');
    var refObj = isWO ? (DB.workOrders||[]).find(function(w){return w.id===refId;}) : (typeof _findJobOrWO==="function"?_findJobOrWO(refId):(DB.jobs||[]).find(function(j){return j.id===refId;}));
    var entry  = {
      id:           'co-'+Date.now(),
      itemId:       item.id,
      itemName:     item.name,
      qty:          qty,
      fromLocation: fromLoc,
      fromLocName:  getLocationName(fromLoc),
      to:           personVal || (refObj&&refObj.customerName) || '',
      job:          refObj ? (isWO?(refObj.woNumber||''):(refObj.num||'')) : '',
      jobId:        isWO ? null : refId,
      woId:         isWO ? refId : null,
      isReturnable: !!item.returnable,
      checkoutDate: getTodayISO(),
      expectedReturn: item.returnable ? '' : null,
      returnDate:   null,
      createdAt:    new Date().toISOString()
    };
    DB.checkoutLog.push(entry);
    // Deduct from location
    adjustItemQty(item.id, fromLoc, -qty);
    // If consumable, auto-add to WO parts as "used"
    if (!item.returnable && isWO) {
      if (!DB.woParts) DB.woParts = [];
      DB.woParts.push({ id:'wop-'+Date.now(), woId:refId, name:item.name, partNum:item.tag||item.barcode||'', qty:qty, status:'used', requestedBy:'Scanner', createdAt:new Date().toISOString() });
    }
    saveDB();
    showScanResult(item, 'out', qty+' × '+item.name+' checked out from '+getLocationName(fromLoc)+' → '+entry.job);

  } else if (_scanMode === 'checkin') {
    // Find active checkout for this item
    var activeEntry = (DB.checkoutLog||[]).find(function(c){ return c.itemId===item.id && !c.returnDate; });
    adjustItemQty(item.id, toLoc, qty);
    if (activeEntry) {
      activeEntry.returnDate = getTodayISO();
      activeEntry.returnToLocation = toLoc;
    }
    saveDB();
    showScanResult(item, 'in', qty+' × '+item.name+' checked in → '+getLocationName(toLoc));

  } else if (_scanMode === 'transfer') {
    var availQtyT = getItemQtyAtLocation(item, fromLoc);
    if (availQtyT < qty) {
      showToast('Only '+availQtyT+' at '+getLocationName(fromLoc),'error');
      showScanResult(item, 'error', 'Insufficient qty at '+getLocationName(fromLoc));
      return;
    }
    adjustItemQty(item.id, fromLoc, -qty);
    adjustItemQty(item.id, toLoc, qty);
    // Log transfer
    if (!DB.invTransfers) DB.invTransfers = [];
    DB.invTransfers.push({ id:'tr-'+Date.now(), itemId:item.id, itemName:item.name, qty:qty, fromLoc:fromLoc, toLoc:toLoc, date:getTodayISO(), by:(_currentUser&&_currentUser.full_name)||'Unknown', createdAt:new Date().toISOString() });
    saveDB();
    showScanResult(item, 'transfer', qty+' × '+item.name+': '+getLocationName(fromLoc)+' → '+getLocationName(toLoc));
  }

  // Clear scan input and refocus
  var scanInp = document.getElementById('scan-input');
  if (scanInp) { scanInp.value=''; scanInp.focus(); }
}

function showScanResult(item, type, msg) {
  var colors = { out:'#fff3e0', in:'#e8f5e9', transfer:'#e3f2fd', error:'#ffebee' };
  var icons  = { out:'↗', in:'↙', transfer:'⇄', error:'⚠️' };
  var locs   = getLocations();
  var locsHtml = locs.map(function(l){
    var q = getItemQtyAtLocation(item, l.id);
    if (q===0) return '';
    return '<span style="background:#f5f5f5;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:4px">'+escHtml(l.name)+': <strong>'+q+'</strong></span>';
  }).join('');
  document.getElementById('scan-result').innerHTML =
    '<div style="background:'+colors[type]+';border-radius:8px;padding:14px 16px;margin-top:12px">'+
    '<div style="font-size:18px;margin-bottom:4px">'+icons[type]+' '+escHtml(msg)+'</div>'+
    '<div style="font-size:12px;color:#546e7a;margin-top:6px">Stock: '+locsHtml+'</div>'+
    '</div>';
}

// ---- PHONE CAMERA SCANNER ----
var _cameraStream = null;

function openCameraScanner() {
  var overlay = document.getElementById('camera-scan-overlay');
  if (overlay) overlay.style.display = 'flex';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function(stream) {
      _cameraStream = stream;
      var video = document.getElementById('camera-video');
      if (video) { video.srcObject = stream; video.play(); }
      _startBarcodeDetection();
    })
    .catch(function(e) {
      showToast('Camera not available: '+e.message,'error');
      closeCameraScanner();
    });
}

function closeCameraScanner() {
  if (_cameraStream) { _cameraStream.getTracks().forEach(function(t){ t.stop(); }); _cameraStream=null; }
  var overlay = document.getElementById('camera-scan-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _startBarcodeDetection() {
  if (!('BarcodeDetector' in window)) {
    // Fallback — use ZXing via CDN if available, otherwise manual entry
    showToast('Camera scan ready — point at barcode','info',3000);
    return;
  }
  var detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'] });
  var video = document.getElementById('camera-video');
  function detect() {
    if (!_cameraStream) return;
    detector.detect(video).then(function(codes) {
      if (codes.length > 0) {
        var code = codes[0].rawValue;
        closeCameraScanner();
        var scanInp = document.getElementById('scan-input');
        if (scanInp) { scanInp.value = code; onScanInput(code); }
      } else {
        requestAnimationFrame(detect);
      }
    }).catch(function(){ requestAnimationFrame(detect); });
  }
  video.addEventListener('playing', detect);
}

// ---- SPLIT RECEIVING (PO) ----

var _receivingPOId = null;
var _receivingLines = [];

function openReceiving(poId) {
  var po = (DB.purchaseOrders||[]).find(function(p){ return p.id===poId; });
  if (!po) return;
  _receivingPOId = poId;
  _receivingLines = (po.items||[]).map(function(li,i){
    var remaining = Math.max(0, parseFloat(li.qtyOrdered||1) - parseFloat(li.qtyReceived||0));
    return {
      _idx:       i,
      desc:       li.desc||'',
      partNum:    li.partNum||'',
      qtyOrdered: parseFloat(li.qtyOrdered||1),
      qtyReceived:parseFloat(li.qtyReceived||0),
      arriving:   remaining,
      toWO:       0,
      toStock:    remaining,
      stockLocId: 'loc-shop'
    };
  });
  renderReceivingModal(po);
  openModal('modal-receiving');
}

function renderReceivingModal(po) {
  var titleEl = document.getElementById('receiving-po-title');
  if (titleEl) titleEl.textContent = 'Receiving: '+(po.poNumber||'')+' — '+(po.vendorName||'');
  var locs = getLocations();
  var locOpts = locs.map(function(l){ return '<option value="'+escHtml(l.id)+'">'+escHtml(l.name)+'</option>'; }).join('');
  var hasWO = !!(po.woId || po.jobId);
  var woLabel = '';
  if (po.woId) { var wo=(DB.workOrders||[]).find(function(w){return w.id===po.woId;}); if(wo) woLabel=wo.woNumber||''; }
  else if (po.jobId) { var j=(typeof _findJobOrWO==="function"?_findJobOrWO(po.jobId):(DB.jobs||[]).find(function(x){return x.id===po.jobId;})); if(j) woLabel=j.num||''; }

  var rows = _receivingLines.map(function(rl,i){
    return '<tr>'+
      '<td style="padding:10px 12px;font-size:13px;font-weight:600">'+escHtml(rl.desc)+'<br><span style="font-size:11px;color:#90a4ae">'+escHtml(rl.partNum)+'</span></td>'+
      '<td style="padding:10px 12px;text-align:center;font-size:13px">'+rl.qtyOrdered+'</td>'+
      '<td style="padding:10px 12px;text-align:center">'+
        '<input type="number" value="'+rl.arriving+'" min="0" max="'+(rl.qtyOrdered-rl.qtyReceived)+'" step="1" '+
        'oninput="updateReceivingLine('+i+',\'arriving\',this.value)" '+
        'style="width:70px;padding:6px;border:1px solid #e0e7ef;border-radius:4px;text-align:center;font-size:13px">'+
      '</td>'+
      (hasWO?
        '<td style="padding:10px 12px;text-align:center">'+
          '<input type="number" value="'+rl.toWO+'" min="0" step="1" '+
          'oninput="updateReceivingLine('+i+',\'toWO\',this.value)" '+
          'style="width:70px;padding:6px;border:1px solid #e0e7ef;border-radius:4px;text-align:center;font-size:13px;color:#1565c0">'+
        '</td>':'')+
      '<td style="padding:10px 12px;text-align:center">'+
        '<input type="number" value="'+rl.toStock+'" min="0" step="1" '+
        'oninput="updateReceivingLine('+i+',\'toStock\',this.value)" '+
        'style="width:70px;padding:6px;border:1px solid #e0e7ef;border-radius:4px;text-align:center;font-size:13px;color:#2e7d32">'+
      '</td>'+
      '<td style="padding:10px 12px">'+
        '<select oninput="updateReceivingLine('+i+',\'stockLocId\',this.value)" style="padding:6px;border:1px solid #e0e7ef;border-radius:4px;font-size:12px">'+locOpts+'</select>'+
      '</td>'+
    '</tr>';
  }).join('');

  var tbl = document.getElementById('receiving-lines-table');
  if (tbl) tbl.innerHTML =
    '<table style="width:100%;border-collapse:collapse">'+
    '<thead><tr style="background:#f8f9fa">'+
      '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Item</th>'+
      '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Ordered</th>'+
      '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Arriving</th>'+
      (hasWO?'<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#1565c0;text-transform:uppercase">→ '+escHtml(woLabel)+'</th>':'')+
      '<th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#2e7d32;text-transform:uppercase">→ Stock</th>'+
      '<th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Stock Location</th>'+
    '</tr></thead><tbody>'+rows+'</tbody></table>';
}

function updateReceivingLine(idx, field, val) {
  _receivingLines[idx][field] = field==='stockLocId' ? val : parseFloat(val)||0;
  // Auto-balance: if arriving changes, update toStock to match
  if (field==='arriving') {
    var rl = _receivingLines[idx];
    var remainder = rl.arriving - rl.toWO;
    _receivingLines[idx].toStock = Math.max(0, remainder);
    // Re-render just that row's toStock input
    var inputs = document.querySelectorAll('#receiving-lines-table input[type="number"]');
    // Find toStock input for this row (3rd or 4th number input in row)
    // Re-render the whole table instead for simplicity
    var po = (DB.purchaseOrders||[]).find(function(p){ return p.id===_receivingPOId; });
    if (po) renderReceivingModal(po);
  }
}

function confirmReceiving() {
  var po = (DB.purchaseOrders||[]).find(function(p){ return p.id===_receivingPOId; });
  if (!po) return;
  var today = getTodayISO();
  var allReceived = true;
  var anyReceived = false;

  _receivingLines.forEach(function(rl, i) {
    if (rl.arriving <= 0) return;
    anyReceived = true;
    // Update PO line item received qty
    if (po.items[i]) {
      po.items[i].qtyReceived = parseFloat(po.items[i].qtyReceived||0) + rl.arriving;
      if (po.items[i].qtyReceived < po.items[i].qtyOrdered) allReceived = false;
    }

    // Find inventory item by name or part number
    var invItem = (DB.inventory||[]).find(function(inv){
      return (inv.name||'').toLowerCase()===(rl.desc||'').toLowerCase() ||
             (inv.tag&&inv.tag===(rl.partNum||''));
    });

    // Add to stock location
    if (rl.toStock > 0) {
      if (invItem) {
        adjustItemQty(invItem.id, rl.stockLocId, rl.toStock);
      }
      // Note: if no matching inv item, stock goes untracked — user should add item first
    }

    // Add to WO
    if (rl.toWO > 0 && (po.woId || po.jobId)) {
      var woId = po.woId || (po.jobId && (typeof _findJobOrWO==="function"?_findJobOrWO(po.jobId):(DB.jobs||[]).find(function(j){return j.id===po.jobId;}))||{}).woId;
      if (woId) {
        if (!DB.woParts) DB.woParts = [];
        DB.woParts.push({
          id:          'wop-'+Date.now()+'-'+i,
          woId:        woId,
          name:        rl.desc||'',
          partNum:     rl.partNum||'',
          qty:         rl.toWO,
          status:      'received',
          requestedBy: 'PO '+po.poNumber,
          poId:        po.id,
          createdAt:   new Date().toISOString()
        });
      }
    }
  });

  // Update PO status
  if (allReceived) po.status = 'Received';
  else if (anyReceived) po.status = 'Partially Received';

  saveDB();
  closeModal('modal-receiving');
  renderPOList();
  showToast('Receiving confirmed — inventory updated ✓','success',4000);
}

// ---- PRICE BOOK CSV IMPORT ----

var _importRows     = [];
var _importMapping  = {};
var _importVendor   = '';

function openPriceBookImport() {
  _importRows = []; _importMapping = {}; _importVendor = '';
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-step1').style.display = '';
  document.getElementById('import-step2').style.display = 'none';
  document.getElementById('import-step3').style.display = 'none';
  openModal('modal-import');
}

function onImportFileChange(input) {
  var file = input.files[0];
  if (!file) return;
  _importVendor = (document.getElementById('import-vendor-name')||{}).value || '';
  var reader = new FileReader();
  reader.onload = function(e) {
    var text = e.target.result;
    parseImportCSV(text);
  };
  reader.readAsText(file);
}

function parseImportCSV(text) {
  // Parse CSV properly handling quoted fields
  var rows = [];
  var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); });
  lines.forEach(function(line) {
    var row = [];
    var inQuote = false;
    var cur = '';
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch==='"') { inQuote = !inQuote; }
      else if (ch===',' && !inQuote) { row.push(cur.trim()); cur=''; }
      else { cur += ch; }
    }
    row.push(cur.trim());
    rows.push(row);
  });

  if (rows.length < 2) { showToast('CSV appears empty or invalid','error'); return; }

  var headers = rows[0];
  _importRows  = rows.slice(1).filter(function(r){ return r.some(function(c){ return c; }); });

  // Show column mapper
  document.getElementById('import-step1').style.display = 'none';
  document.getElementById('import-step2').style.display = '';

  var fields = [
    { id:'name',     label:'Item Name *' },
    { id:'partNum',  label:'Part / Item #' },
    { id:'barcode',  label:'Barcode / UPC' },
    { id:'cat',      label:'Category' },
    { id:'mc',       label:'Unit Cost (your cost)' },
    { id:'desc',     label:'Description' },
    { id:'unit',     label:'Unit of Measure' },
  ];

  var mapHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
    fields.map(function(f){
      var autoMatch = headers.findIndex(function(h){
        return h.toLowerCase().replace(/[^a-z0-9]/g,'').includes(f.id.toLowerCase()) ||
               (f.id==='mc'&&h.toLowerCase().includes('cost')) ||
               (f.id==='mc'&&h.toLowerCase().includes('price')) ||
               (f.id==='name'&&h.toLowerCase().includes('desc')) ||
               (f.id==='partNum'&&(h.toLowerCase().includes('part')||h.toLowerCase().includes('sku')||h.toLowerCase().includes('item')));
      });
      return '<div>'+
        '<label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:4px">'+escHtml(f.label)+'</label>'+
        '<select id="map-'+f.id+'" style="width:100%;padding:8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
          '<option value="">— Skip —</option>'+
          headers.map(function(h,i){
            return '<option value="'+i+'"'+(i===autoMatch?' selected':'')+'>'+escHtml(h)+'</option>';
          }).join('')+
        '</select>'+
      '</div>';
    }).join('') +
  '</div>';

  var mapEl = document.getElementById('import-column-map');
  if (mapEl) mapEl.innerHTML = mapHtml;

  // Show preview of first 5 rows
  var previewHtml = '<div style="overflow-x:auto;font-size:11px"><table style="border-collapse:collapse;width:100%">'+
    '<tr>'+headers.map(function(h){ return '<th style="padding:4px 8px;background:#f8f9fa;border:1px solid #e0e7ef;font-weight:700">'+escHtml(h)+'</th>'; }).join('')+'</tr>'+
    _importRows.slice(0,5).map(function(r){
      return '<tr>'+r.map(function(c){ return '<td style="padding:4px 8px;border:1px solid #f0f0f0">'+escHtml((c||'').substring(0,30))+'</td>'; }).join('')+'</tr>';
    }).join('')+
  '</table></div>';
  var prevEl = document.getElementById('import-preview');
  if (prevEl) prevEl.innerHTML = '<div style="margin-top:12px"><strong>Preview (first 5 rows):</strong></div>'+previewHtml;
}

function runImport() {
  var mode   = (document.getElementById('import-mode')||{}).value || 'merge';
  var fields = ['name','partNum','barcode','cat','mc','desc','unit'];
  var mapping = {};
  fields.forEach(function(f){
    var sel = document.getElementById('map-'+f);
    if (sel && sel.value !== '') mapping[f] = parseInt(sel.value);
  });

  if (mapping.name === undefined) { showToast('Must map at least the Item Name column','error'); return; }

  var imported = 0, updated = 0, skipped = 0;

  _importRows.forEach(function(row) {
    var name = (row[mapping.name]||'').trim();
    if (!name) { skipped++; return; }
    var partNum = mapping.partNum !== undefined ? (row[mapping.partNum]||'').trim() : '';
    var barcode = mapping.barcode !== undefined ? (row[mapping.barcode]||'').trim() : '';
    var cat     = mapping.cat     !== undefined ? (row[mapping.cat]||'').trim()     : 'General';
    var mc      = mapping.mc      !== undefined ? parseFloat(row[mapping.mc]||0)    : 0;
    var desc    = mapping.desc    !== undefined ? (row[mapping.desc]||'').trim()    : '';
    var unit    = mapping.unit    !== undefined ? (row[mapping.unit]||'').trim()    : 'EA';

    // Find existing by partNum or name
    var existing = null;
    if (partNum) existing = (DB.catalog||[]).find(function(c){ return (c.part||c.partNum||'')===partNum; });
    if (!existing) existing = (DB.catalog||[]).find(function(c){ return (c.name||'').toLowerCase()===name.toLowerCase(); });

    var data = {
      id:      existing ? existing.id : 'cat-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
      name:    name,
      desc:    desc || name,
      part:    partNum,
      partNum: partNum,
      barcode: barcode,
      cat:     cat || 'General',
      mc:      mc,
      lh:      existing ? (existing.lh||0) : 0,
      unit:    unit || 'EA',
      vendor:  _importVendor || '',
      notes:   existing ? (existing.notes||'') : ''
    };

    if (!DB.catalog) DB.catalog = [];

    if (existing) {
      if (mode === 'add-only') { skipped++; return; }
      var idx = DB.catalog.findIndex(function(c){ return c.id===existing.id; });
      if (idx>=0) DB.catalog[idx] = data;
      updated++;
    } else {
      if (mode === 'update-only') { skipped++; return; }
      DB.catalog.push(data);
      imported++;
    }
  });

  saveDB();
  closeModal('modal-import');

  // Show results
  document.getElementById('import-step2').style.display = 'none';
  showToast('Import complete: '+imported+' added, '+updated+' updated, '+skipped+' skipped','success',6000);
  if (typeof renderCatalog === 'function') renderCatalog();
}

// ---- LOCATION SETTINGS ----

function renderLocationSettings() {
  var locs = getLocations();
  var el   = document.getElementById('inv-locations-list');
  if (!el) return;
  el.innerHTML = locs.map(function(l,i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f0f4f8">'+
      '<input value="'+escHtml(l.name)+'" onchange="updateLocation(\''+l.id+'\',this.value)" style="flex:1;padding:6px 10px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px"'+
      (l.isDefault?' title="Default location — cannot delete"':'')+'>'+
      '<span style="font-size:11px;color:#90a4ae;min-width:60px">'+escHtml(l.type)+'</span>'+
      (!l.isDefault?'<button onclick="deleteLocation(\''+l.id+'\')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:16px">×</button>':'<span style="width:24px"></span>')+
    '</div>';
  }).join('');
}

function updateLocation(id, name) {
  var locs = getLocations();
  var loc  = locs.find(function(l){ return l.id===id; });
  if (loc) { loc.name=name; DB.invLocations=locs; saveDB(); }
}

function addLocation() {
  var name = (document.getElementById('new-location-name')||{}).value||'';
  if (!name.trim()) return;
  var locs = getLocations();
  locs.push({ id:'loc-'+Date.now(), name:name.trim(), type:'vehicle', isDefault:false });
  DB.invLocations = locs;
  document.getElementById('new-location-name').value = '';
  saveDB();
  renderLocationSettings();
}

function deleteLocation(id) {
  if (!confirm('Delete this location? Items assigned here will remain but show no location.')) return;
  DB.invLocations = getLocations().filter(function(l){ return l.id!==id; });
  saveDB();
  renderLocationSettings();
}

// ---- REORDER DASHBOARD ALERTS ----

function getLowStockItems() {
  return (DB.inventory||[]).filter(function(item){
    return getTotalQty(item) <= (item.minQty||0) && (item.minQty||0) > 0;
  });
}

function renderDashReorderAlert() {
  var lowItems = getLowStockItems();
  var el = document.getElementById('dash-reorder-alert');
  if (!el) return;
  if (!lowItems.length) { el.style.display='none'; return; }
  el.style.display = '';
  el.innerHTML =
    '<div style="background:#fff3e0;border:1px solid #ffe082;border-radius:10px;padding:14px 18px;cursor:pointer" onclick="goPage(\'inventory\')">'+
      '<div style="font-weight:700;color:#e65100;margin-bottom:6px">⚠️ '+lowItems.length+' Item'+(lowItems.length!==1?'s':'')+' Below Reorder Point</div>'+
      '<div style="font-size:12px;color:#546e7a">'+
        lowItems.slice(0,5).map(function(i){ return escHtml(i.name)+' ('+getTotalQty(i)+' left)'; }).join(' · ')+
        (lowItems.length>5?' + '+(lowItems.length-5)+' more...':'')+
      '</div>'+
    '</div>';
}

// ---- HOOK INTO EXISTING renderInventory TO ADD LOCATION COLUMNS ----
// Override the items table rendering to show qty-by-location

function renderInventoryLocationBreakdown(item) {
  var locs = getLocations();
  var html = '';
  locs.forEach(function(l){
    var q = getItemQtyAtLocation(item, l.id);
    if (q > 0) {
      html += '<span style="display:inline-block;background:#f0f4f8;padding:1px 6px;border-radius:8px;font-size:10px;margin-right:3px;margin-bottom:2px">'+
        escHtml(l.name)+': <strong>'+q+'</strong></span>';
    }
  });
  return html || '<span style="font-size:11px;color:#bdbdbd">No stock</span>';
}

// ---- SAVE INVENTORY ITEM V2 (with barcode, returnable, location qty) ----

function saveInventoryItemV2() {
  var id   = (document.getElementById('inv-id')||{}).value||'';
  var name = ((document.getElementById('inv-name')||{}).value||'').trim();
  if (!name) { showToast('Item name is required','error'); return; }

  function gv(eid){ var el=document.getElementById(eid); return el?el.value.trim():''; }

  var existing = id ? (DB.inventory||[]).find(function(i){ return i.id==id; }) : null;
  var shopQty  = parseFloat((document.getElementById('inv-qty-shop')||{}).value)||0;

  // Build locations — preserve existing, update shop qty
  var locations = existing && existing.locations ? Object.assign({},existing.locations) : {};
  locations['loc-shop'] = shopQty;

  var data = {
    id:         id || 'inv-'+Date.now(),
    name:       name,
    tag:        gv('inv-tag') || (existing&&existing.tag) || nextAssetTag(),
    cat:        gv('inv-cat') || 'General',
    partNum:    gv('inv-part-num'),
    barcode:    gv('inv-barcode'),
    returnable: !!(document.getElementById('inv-returnable')||{}).checked,
    locations:  locations,
    qty:        Object.values(locations).reduce(function(s,v){return s+parseFloat(v||0);},0),
    minQty:     parseInt((document.getElementById('inv-min')||{}).value)||0,
    cost:       parseFloat((document.getElementById('inv-cost')||{}).value)||0,
    notes:      gv('inv-item-notes'),
    location:   'Main Shop',
    createdAt:  existing ? existing.createdAt : new Date().toISOString()
  };

  if (!DB.inventory) DB.inventory = [];
  if (id) {
    var idx = DB.inventory.findIndex(function(i){ return i.id==id; });
    if (idx>=0) DB.inventory[idx]=data; else DB.inventory.push(data);
  } else {
    DB.inventory.push(data);
  }
  saveDB();
  closeModal('modal-inv-item');
  renderInventory();
  showToast('"'+name+'" saved ✓','success');
}

// Override editInventoryItem to populate new fields
var _origEditInventoryItem = typeof editInventoryItem !== 'undefined' ? editInventoryItem : null;
function editInventoryItem(id) {
  var item = (DB.inventory||[]).find(function(i){ return i.id==id; });
  if (!item) return;
  document.getElementById('inv-modal-title').textContent = 'Edit: '+(item.name||'Item');
  function sv(eid,v){ var el=document.getElementById(eid); if(el) el.value=v!==undefined&&v!==null?v:''; }
  sv('inv-name',    item.name);
  sv('inv-tag',     item.tag);
  sv('inv-cat',     item.cat);
  sv('inv-part-num',item.partNum||'');
  sv('inv-barcode', item.barcode||'');
  sv('inv-qty-shop',getItemQtyAtLocation(item,'loc-shop'));
  sv('inv-qty',     item.qty||0);
  sv('inv-min',     item.minQty||0);
  sv('inv-cost',    item.cost||0);
  sv('inv-item-notes',item.notes||'');
  sv('inv-id',      item.id);
  var retEl = document.getElementById('inv-returnable');
  if (retEl) retEl.checked = !!item.returnable;
  if (typeof populateInvDataLists === 'function') populateInvDataLists();
  openModal('modal-inv-item');
}

// Show import run button when step 2 appears
var _origParseImportCSV = parseImportCSV;
parseImportCSV = function(text) {
  _origParseImportCSV(text);
  var runBtn = document.getElementById('import-run-btn');
  if (runBtn) runBtn.style.display = '';
};

// Add "Receive Items" button to PO list rows — hook into renderPOList
var _origRenderPOList = typeof renderPOList !== 'undefined' ? renderPOList : null;
