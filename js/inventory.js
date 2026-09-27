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
  // Unified item master (Step 0): operate on the catalog master row (the single source of truth),
  // then re-derive the DB.inventory working array. Stock items are catalog rows with tracked=true.
  var m = (DB.catalog||[]).find(function(c){ return String(c.id)===String(itemId); });
  if (!m) return;
  if (!m.locations || typeof m.locations !== 'object') m.locations = {};
  if (m.locations[locId] == null) m.locations[locId] = 0;
  // Floor at 0 unless the shop has enabled negative stock (backorder), in which case a move may go
  // below zero — keeps scanner/receiving/issue behavior consistent with the Add-Item picker.
  var _floor = (DB.settings && DB.settings.allowNegativeStock) ? -Infinity : 0;
  m.locations[locId] = Math.max(_floor, parseFloat(m.locations[locId]) + delta);
  m.tracked = true;
  saveDB();
  if (typeof _deriveInventoryFromCatalog === 'function') _deriveInventoryFromCatalog();
  // Write-through so quantity changes (receiving, scanner check-in/out, transfers) reach the cloud
  // immediately. Uses the adjust_item_stock RPC (not a full catalog upsert) so FIELD TECHS can move
  // stock — catalog writes are owner/back_office-only, but the RPC lets any active user change ONLY
  // the stock columns, never price. (A full item edit still goes through the office-gated save.)
  if (typeof _pushStockQtyToCloud === 'function') _pushStockQtyToCloud(m.id, m.locations);
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
  if (!po) {
    // Open POs are always in the working set, but guard anyway: fetch on demand then retry.
    if (typeof ensurePOLoaded==='function') { ensurePOLoaded(poId).then(function(f){ if(f) openReceiving(poId); else if(typeof showToast==='function') showToast('Purchase order not found','error'); }); }
    return;
  }
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
    // Wave 2d: if this item buys in a different unit than it stocks, show the conversion so the receiver
    // knows the entered (purchase-unit) qty becomes qty×factor in stock.
    var _rlItem = (DB.inventory||[]).find(function(inv){ return (inv.name||'').toLowerCase()===(rl.desc||'').toLowerCase() || (inv.tag&&inv.tag===(rl.partNum||'')); });
    var _rlM = _rlItem ? _itemMaster(_rlItem.id) : null;
    var _rlF = (_rlM && parseFloat(_rlM.conversionFactor) > 0) ? parseFloat(_rlM.conversionFactor) : 1;
    var _convNote = (_rlF > 1 && _rlM) ? '<br><span style="font-size:11px;color:#2e7d32;font-weight:600">1 '+escHtml(_rlM.purchaseUnit||'unit')+' = '+_rlF+' '+escHtml(_rlM.unit||'ea')+' → stock gets qty × '+_rlF+'</span>' : '';
    return '<tr>'+
      '<td style="padding:10px 12px;font-size:13px;font-weight:600">'+escHtml(rl.desc)+'<br><span style="font-size:11px;color:#90a4ae">'+escHtml(rl.partNum)+'</span>'+_convNote+'</td>'+
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
  var _newParts   = [];   // wo_parts to push inline (inventory pushes via adjustItemQty)

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

    // Wave 2d: UoM conversion. Received quantities are in PURCHASE units; convert to STOCK units by the
    // item's conversion factor (1 = no conversion). Buy a box, stock/issue by the foot.
    var _master = invItem ? _itemMaster(invItem.id) : null;
    var _factor = (_master && parseFloat(_master.conversionFactor) > 0) ? parseFloat(_master.conversionFactor) : 1;

    // Add to stock location (adjustItemQty write-through pushes the item to the cloud)
    if (rl.toStock > 0) {
      if (invItem) {
        adjustItemQty(invItem.id, rl.stockLocId, rl.toStock * _factor);
      }
      // Note: if no matching inv item, stock goes untracked — user should add item first
    }

    // Add to WO (also in stock/issue units)
    if (rl.toWO > 0 && (po.woId || po.jobId)) {
      var woId = po.woId || (po.jobId && (typeof _findJobOrWO==="function"?_findJobOrWO(po.jobId):(DB.jobs||[]).find(function(j){return j.id===po.jobId;}))||{}).woId;
      if (woId) {
        if (!DB.woParts) DB.woParts = [];
        var _wp = {
          id:          'wop-'+Date.now()+'-'+i,
          woId:        woId,
          name:        rl.desc||'',
          partNum:     rl.partNum||'',
          qty:         rl.toWO * _factor,
          unitCost:    (_factor>1 && _master) ? ((parseFloat(_master.mc)||0)) : (rl.unitCost||undefined),
          status:      'received',
          requestedBy: 'PO '+po.poNumber,
          poId:        po.id,
          createdAt:   new Date().toISOString()
        };
        DB.woParts.push(_wp);
        _newParts.push(_wp);
      }
    }
  });

  // Update PO status
  if (allReceived) po.status = 'Received';
  else if (anyReceived) po.status = 'Partially Received';

  saveDB();
  // Write-through to the cloud immediately (don't wait on the slow full sync): the received
  // stock, the WO parts, and the PO's new received-qty/status each push on their own.
  try {
    _newParts.forEach(function(wp){ if(typeof _pushWOPartToCloud==='function') _pushWOPartToCloud(wp); });
    if (typeof _pushPOToCloud==='function') _pushPOToCloud(po);
  } catch(e) { console.warn('[Receiving push]', e && e.message); }

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
  // Wave 1b: reflect the global "allow negative stock" toggle when the inventory settings render.
  var neg = document.getElementById('inv-allow-negative');
  if (neg) neg.checked = !!(DB.settings && DB.settings.allowNegativeStock);
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

// ---- REORDER / BUY LIST (Wave 2a) ----
// Par-aware reorder engine. Each item can carry per-location par levels (locPars: {locId:{min,max}})
// or fall back to a global reorder point (minQty) + par (reorderMax). Reorder math runs off
// AVAILABLE (on-hand − reserved); reserved is 0 until Wave 2c wires committed stock, so this
// auto-refines when reservations land — no rework here.

// Reserved (committed to a WO) at a location. Wave 2c fills _reservedStockAt(); until then, 0.
function _reservedAtLocation(itemId, locId) {
  if (typeof _reservedStockAt === 'function') return parseFloat(_reservedStockAt(itemId, locId)) || 0;
  return 0;
}

// Wave 2c: reserved/committed stock. A wo_part with source 'stock' + status 'reserved' holds physical
// stock for a job WITHOUT decrementing on-hand — it lowers AVAILABLE (on-hand − reserved). Only counts
// reservations on OPEN work orders (a billed/void/cancelled WO no longer holds stock).
function _woIsClosed(woId) {
  var w = (DB.workOrders||[]).find(function(x){ return x.id === woId; });
  return w ? /billed|void|cancel/i.test(w.status||'') : false;
}
function _reservedStockAt(itemId, locId) {
  if (!DB.woParts) return 0;
  return DB.woParts.reduce(function(s,p){
    if (p && p.source === 'stock' && p.status === 'reserved' &&
        String(p.itemId) === String(itemId) && (p.fromLocation||'loc-shop') === locId &&
        !_woIsClosed(p.woId)) {
      return s + (parseFloat(p.qty) || 0);
    }
    return s;
  }, 0);
}
function _reservedTotal(itemId) {
  return getLocations().reduce(function(s,l){ return s + _reservedStockAt(itemId, l.id); }, 0);
}
function _availableAtLocation(item, locId) {
  return getItemQtyAtLocation(item, locId) - _reservedAtLocation(item.id, locId);
}
function _availableTotal(item) {
  var loc = item.locations || {};
  return Object.keys(loc).reduce(function(s,k){ return s + _availableAtLocation(item, k); }, 0);
}

// Resolve the item master (catalog row) for a derived inventory row or id — the master carries
// locPars / reorderMax / vendor, which the lightweight DB.inventory row does not.
function _itemMaster(idOrItem) {
  var id = (idOrItem && idOrItem.id != null) ? idOrItem.id : idOrItem;
  return (DB.catalog||[]).find(function(c){ return String(c.id) === String(id); });
}

// Build the reorder list. Returns one row per shortfall:
//   {itemId,name,cat,vendor,cost,partNum,scope('total'|locId),locName,onHand,available,
//    reorderPoint,par,onOrder,suggested}
function getReorderList() {
  var rows = [];
  (DB.catalog||[]).forEach(function(m){
    if (!m || !m.tracked || m.active === false) return;
    var vendor  = m.vendor || '';
    var cost    = (m.mc != null ? m.mc : (m.cost || 0));
    var onOrder = (typeof _invOnOrder === 'function') ? _invOnOrder(m) : 0;
    var pars    = m.locPars || {};
    var parLocs = Object.keys(pars).filter(function(k){ var p=pars[k]||{}; return (parseFloat(p.min)||0) > 0 || (parseFloat(p.max)||0) > 0; });

    if (parLocs.length) {
      // Per-location evaluation: each location with a par is checked independently.
      parLocs.forEach(function(locId){
        var p    = pars[locId] || {};
        var min  = parseFloat(p.min) || 0;
        var par  = parseFloat(p.max) || 0;
        var avail= _availableAtLocation(m, locId);
        var trip = (par > 0 ? par : min);           // reorder when at/below the reorder point
        if (avail <= min && trip > avail) {
          rows.push({ itemId:m.id, name:m.name||'', cat:m.cat||'General', vendor:vendor, cost:cost,
            partNum:m.partNum||m.part||'', scope:locId, locName:getLocationName(locId),
            onHand:getItemQtyAtLocation(m, locId), available:avail, reorderPoint:min, par:trip,
            onOrder:onOrder, suggested:Math.max(0, Math.round((trip - avail) * 100) / 100) });
        }
      });
    } else {
      // Total (all-locations) evaluation against the global reorder point.
      var min = parseFloat(m.minQty) || 0;
      if (min <= 0) return;
      var avail = _availableTotal(m);
      if (avail <= min) {
        var par  = (parseFloat(m.reorderMax) || 0) > 0 ? parseFloat(m.reorderMax) : min;
        var need = Math.max(0, par - avail - onOrder);   // don't re-order what's already on a PO
        rows.push({ itemId:m.id, name:m.name||'', cat:m.cat||'General', vendor:vendor, cost:cost,
          partNum:m.partNum||m.part||'', scope:'total', locName:'All locations',
          onHand:getTotalQty(m), available:avail, reorderPoint:min, par:par,
          onOrder:onOrder, suggested:Math.round(need * 100) / 100 });
      }
    }
  });
  return rows;
}

// Legacy name kept for callers (dashboard etc.): distinct items needing reorder.
function getLowStockItems() {
  var ids = {}; var out = [];
  getReorderList().forEach(function(r){ if (!ids[r.itemId]) { ids[r.itemId]=1; var m=_itemMaster(r.itemId); if(m) out.push(m); } });
  return out;
}

function renderDashReorderAlert() {
  var rows = getReorderList();
  var el = document.getElementById('dash-reorder-alert');
  if (!el) return;
  var names = [...new Set(rows.map(function(r){ return r.name; }))];
  if (!names.length) { el.style.display='none'; return; }
  el.style.display = '';
  el.innerHTML =
    '<div style="background:#fff3e0;border:1px solid #ffe082;border-radius:10px;padding:14px 18px;cursor:pointer" onclick="goPage(\'inventory\');if(typeof switchInvTab===\'function\')switchInvTab(\'lowstock\')">'+
      '<div style="font-weight:700;color:#e65100;margin-bottom:6px">🛒 '+names.length+' Item'+(names.length!==1?'s':'')+' Below Reorder Point</div>'+
      '<div style="font-size:12px;color:#546e7a">'+
        names.slice(0,5).map(function(n){ return escHtml(n); }).join(' · ')+
        (names.length>5?' + '+(names.length-5)+' more...':'')+
      '</div>'+
    '</div>';
}

// ---- BUY LIST VIEW (inventory "Buy List" tab) ----
function renderBuyList() {
  var host = document.getElementById('inv-buylist');
  if (!host) return;
  var rows = getReorderList();
  if (!rows.length) {
    host.innerHTML = '<div class="card"><div class="empty-state" style="padding:40px"><p style="font-size:15px">✅ Everything is at or above its reorder point.</p><p style="font-size:12px;color:#90a4ae">Set a reorder point (and optional par) on an item, or per-location levels for trucks, to have it show up here when it runs low.</p></div></div>';
    return;
  }
  // Group by vendor (blank vendor → "Unassigned").
  var groups = {};
  rows.forEach(function(r){ var v = r.vendor || '— No preferred vendor —'; (groups[v]=groups[v]||[]).push(r); });
  var vendorNames = Object.keys(groups).sort(function(a,b){ return a.localeCompare(b); });
  var totalItems = new Set(rows.map(function(r){ return r.itemId; })).size;
  var estCost = rows.reduce(function(s,r){ return s + (r.suggested * r.cost); }, 0);

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'+
      '<div style="font-size:13px;color:#546e7a">'+totalItems+' item'+(totalItems!==1?'s':'')+' to reorder across '+vendorNames.length+' vendor group'+(vendorNames.length!==1?'s':'')+' · est. <strong>$'+estCost.toFixed(2)+'</strong></div>'+
    '</div>';

  vendorNames.forEach(function(vname){
    var list = groups[vname];
    var vendorCost = list.reduce(function(s,r){ return s + (r.suggested*r.cost); }, 0);
    var hasVendor = vname !== '— No preferred vendor —';
    html += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:14px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f7f9fc;border-bottom:1px solid #eceff1">'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(vname)+' <span style="color:#90a4ae;font-weight:400">· '+list.length+' line'+(list.length!==1?'s':'')+' · $'+vendorCost.toFixed(2)+'</span></div>'+
        (hasVendor ? '<button class="btn btn-primary btn-sm" onclick="createPOFromBuyList('+JSON.stringify(vname).replace(/"/g,'&quot;')+')">➜ Create Draft PO</button>' : '')+
      '</div>'+
      '<table><thead><tr>'+
        '<th>Item</th><th>Location</th><th>Avail</th><th>Reorder&nbsp;pt</th><th>Par</th><th>On&nbsp;order</th><th>Suggest&nbsp;order</th><th></th>'+
      '</tr></thead><tbody>'+
      list.map(function(r){
        return '<tr>'+
          '<td><div style="font-weight:700;font-size:13px">'+escHtml(r.name)+'</div>'+(r.partNum?'<div style="font-size:11px;color:#90a4ae">'+escHtml(r.partNum)+'</div>':'')+'</td>'+
          '<td style="font-size:12px">'+escHtml(r.locName)+'</td>'+
          '<td><span class="inv-qty-badge '+(r.available<=0?'inv-qty-out':'inv-qty-low')+'">'+r.available+'</span></td>'+
          '<td style="font-size:12px">'+r.reorderPoint+'</td>'+
          '<td style="font-size:12px">'+r.par+'</td>'+
          '<td style="font-size:12px;color:'+(r.onOrder>0?'#1565c0':'#b0bec5')+'">'+(r.onOrder>0?r.onOrder:'—')+'</td>'+
          '<td style="font-weight:700;color:#2e7d32">'+r.suggested+'</td>'+
          '<td><button class="btn btn-ghost btn-sm" data-action="editInventoryItem" data-id="'+r.itemId+'">Edit</button></td>'+
        '</tr>';
      }).join('')+
      '</tbody></table>'+
    '</div>';
  });
  host.innerHTML = html;
}

// Spin up a Draft PO pre-filled with a vendor group's suggested lines, reusing the PO module.
function createPOFromBuyList(vendorName) {
  if (typeof openNewPO !== 'function') { showToast('Purchase orders unavailable','error'); return; }
  var rows = getReorderList().filter(function(r){ return (r.vendor||'') === vendorName; });
  if (!rows.length) { showToast('Nothing to order for this vendor','error'); return; }
  openNewPO();
  // Match a saved vendor to preselect the dropdown. Item vendor is a free-text name (e.g. "Graybar")
  // that may not equal the vendor record ("Graybar Electric"), so try exact (case-insensitive) first,
  // then a contains match either direction (guarded to 3+ chars so short names don't cross-match).
  var _vn = vendorName.trim().toLowerCase();
  var actives = (DB.vendors||[]).filter(function(x){ return x.active!==false; });
  var v = actives.find(function(x){ return (x.name||'').trim().toLowerCase() === _vn; });
  if (!v && _vn.length >= 3) {
    v = actives.find(function(x){ var n=(x.name||'').trim().toLowerCase(); return n && (n.indexOf(_vn)>=0 || _vn.indexOf(n)>=0); });
  }
  var vSel = document.getElementById('po-vendor');
  if (v && vSel) { vSel.value = v.id; if (typeof onPOVendorChange==='function') onPOVendorChange(v.id); }
  // Collapse multiple location shortfalls for the same item into one PO line.
  var byItem = {};
  rows.forEach(function(r){
    var e = byItem[r.itemId] || (byItem[r.itemId] = { desc:r.name, partNum:r.partNum, qtyOrdered:0, qtyReceived:0, unitCost:r.cost });
    e.qtyOrdered += r.suggested;
  });
  if (typeof _poItems === 'undefined') { window._poItems = []; }
  _poItems = Object.keys(byItem).map(function(id, i){ var e=byItem[id]; e._eid=i; e.qtyOrdered=Math.round(e.qtyOrdered*100)/100; return e; });
  if (typeof renderPOItems === 'function') renderPOItems();
  if (typeof refreshPOTotals === 'function') refreshPOTotals();
  showToast(_poItems.length+' line'+(_poItems.length!==1?'s':'')+' added — review & save the PO','success');
}

// ---- PER-LOCATION REORDER LEVELS (item modal, Wave 2a) ----
function toggleInvLocPars() {
  var panel = document.getElementById('inv-locpars-panel');
  var btn = document.getElementById('inv-locpars-toggle');
  if (!panel) return;
  var isHidden = (panel.style.display === 'none' || panel.style.display === '');
  panel.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = (isHidden ? '▾' : '▸') + ' Per-location reorder levels (trucks)';
}

// Render the per-location min/par editor. Shows every location; pre-fills saved overrides.
function _renderInvLocParsEditor(pars) {
  var panel = document.getElementById('inv-locpars-panel');
  var btn = document.getElementById('inv-locpars-toggle');
  if (!panel) return;
  pars = pars || {};
  panel.style.display = 'none';                 // always collapsed on open — keeps the quick path clean
  if (btn) btn.textContent = '▸ Per-location reorder levels (trucks)';
  var locs = getLocations();
  panel.innerHTML =
    '<div style="font-size:11px;color:#90a4ae;margin-bottom:6px">Optional. Set a reorder point and par (bring-to level) for specific trucks/locations. Leave blank to use the global reorder point above. Truck replenishment restocks to par.</div>'+
    '<table style="width:100%;font-size:12px"><thead><tr style="color:#607d8b;text-align:left">'+
      '<th style="padding:2px 6px">Location</th><th style="padding:2px 6px;width:90px">Reorder at</th><th style="padding:2px 6px;width:90px">Par (max)</th></tr></thead><tbody>'+
    locs.map(function(l){
      var p = pars[l.id] || {};
      return '<tr>'+
        '<td style="padding:2px 6px">'+escHtml(l.name)+'</td>'+
        '<td style="padding:2px 6px"><input type="number" min="0" step="0.01" id="inv-locpar-min-'+escHtml(l.id)+'" value="'+(p.min!=null&&p.min!==0?p.min:'')+'" placeholder="—" style="width:80px;padding:3px 5px;border:1px solid #e0e7ef;border-radius:4px"></td>'+
        '<td style="padding:2px 6px"><input type="number" min="0" step="0.01" id="inv-locpar-max-'+escHtml(l.id)+'" value="'+(p.max!=null&&p.max!==0?p.max:'')+'" placeholder="—" style="width:80px;padding:3px 5px;border:1px solid #e0e7ef;border-radius:4px"></td>'+
      '</tr>';
    }).join('')+
    '</tbody></table>';
}

// Read the per-location editor back into a locPars map. Only keeps locations with a min or par set.
function _readInvLocParsFromForm() {
  var out = {};
  getLocations().forEach(function(l){
    var minEl = document.getElementById('inv-locpar-min-'+l.id);
    var maxEl = document.getElementById('inv-locpar-max-'+l.id);
    var min = minEl ? (parseFloat(minEl.value)||0) : 0;
    var max = maxEl ? (parseFloat(maxEl.value)||0) : 0;
    if (min > 0 || max > 0) out[l.id] = { min:min, max:max };
  });
  return out;
}

// ---- TRUCK REPLENISHMENT "TO PAR" (Wave 2b) ----
// Restock a truck to its per-location par using shop stock. Anything the shop can't cover is flagged
// short (and can seed a draft PO). Builds directly on 2a's loc_pars.
var _replenishRows = [];

// Pure planner: for the given truck, one row per item whose truck par exceeds its on-truck qty.
// protectShop=true keeps the shop from being drained below its own reorder point (per-location shop
// min, else the global minQty).
function _replenishPlan(truckId, protectShop) {
  var rows = [];
  (DB.catalog||[]).forEach(function(m){
    if (!m || !m.tracked || m.active === false) return;
    var pars = m.locPars || {};
    var p = pars[truckId];
    if (!p) return;
    var par = parseFloat(p.max) || 0;
    if (par <= 0) return;
    var onTruck = getItemQtyAtLocation(m, truckId);
    var need = par - onTruck;
    if (need <= 0) return;
    var shopAvail = _availableAtLocation(m, 'loc-shop');
    var shopFloor = 0;
    if (protectShop) {
      var sp = pars['loc-shop'] || {};
      shopFloor = parseFloat(sp.min) || parseFloat(m.minQty) || 0;
    }
    var spare = Math.max(0, shopAvail - shopFloor);
    var transfer = Math.min(need, spare);
    transfer = Math.round(transfer * 100) / 100;
    need = Math.round(need * 100) / 100;
    rows.push({ itemId:m.id, name:m.name||'', partNum:m.partNum||m.part||'', vendor:m.vendor||'',
      cost:(m.mc!=null?m.mc:(m.cost||0)), onTruck:onTruck, par:par, need:need, shopAvail:shopAvail,
      transfer:transfer, short:Math.round((need-transfer)*100)/100 });
  });
  return rows;
}

function openReplenish() {
  var sel = document.getElementById('replenish-loc');
  if (!sel) return;
  var trucks = getLocations().filter(function(l){ return l.id !== 'loc-shop'; });
  sel.innerHTML = trucks.map(function(l){ return '<option value="'+escHtml(l.id)+'">'+escHtml(l.name)+'</option>'; }).join('');
  var mk = document.getElementById('replenish-make-po'); if (mk) mk.checked = false;
  var ps = document.getElementById('replenish-protect-shop'); if (ps) ps.checked = true;
  renderReplenishPlan();
  if (typeof openModal === 'function') openModal('modal-replenish');
}

function renderReplenishPlan() {
  var host = document.getElementById('replenish-plan');
  if (!host) return;
  var truckId = (document.getElementById('replenish-loc')||{}).value || '';
  var protect = !!(document.getElementById('replenish-protect-shop')||{}).checked;
  var btn = document.getElementById('replenish-commit-btn');
  if (!truckId) { host.innerHTML = ''; return; }
  var rows = _replenishPlan(truckId, protect);
  _replenishRows = rows;
  if (!rows.length) {
    host.innerHTML = '<div class="empty-state" style="padding:24px"><p>✅ '+escHtml(getLocationName(truckId))+' is at par for every item that has a truck par set.</p><p style="font-size:12px;color:#90a4ae">No par levels for this truck yet? Set them on an item under Edit → Per-location reorder levels.</p></div>';
    if (btn) btn.disabled = true;
    return;
  }
  if (btn) btn.disabled = false;
  var anyShort = rows.some(function(r){ return r.short > 0; });
  host.innerHTML =
    '<table style="width:100%;font-size:12px"><thead><tr style="text-align:left;color:#607d8b">'+
      '<th style="padding:4px 6px">Item</th><th style="padding:4px 6px">On truck</th><th style="padding:4px 6px">Par</th><th style="padding:4px 6px">Shop avail</th><th style="padding:4px 6px;width:92px">Transfer</th><th style="padding:4px 6px">Still short</th></tr></thead><tbody>'+
    rows.map(function(r,i){
      return '<tr>'+
        '<td style="padding:4px 6px"><div style="font-weight:700">'+escHtml(r.name)+'</div>'+(r.partNum?'<div style="font-size:10px;color:#90a4ae">'+escHtml(r.partNum)+'</div>':'')+'</td>'+
        '<td style="padding:4px 6px">'+r.onTruck+'</td>'+
        '<td style="padding:4px 6px">'+r.par+'</td>'+
        '<td style="padding:4px 6px">'+r.shopAvail+'</td>'+
        '<td style="padding:4px 6px"><input type="number" min="0" step="0.01" value="'+r.transfer+'" oninput="_onReplenishTransferEdit('+i+',this.value)" style="width:80px;padding:4px;border:1px solid #e0e7ef;border-radius:4px"></td>'+
        '<td style="padding:4px 6px;font-weight:700;color:'+(r.short>0?'#c62828':'#90a4ae')+'">'+(r.short>0?r.short:'—')+'</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table>'+
    (anyShort ? '<div style="font-size:12px;color:#c62828;margin-top:8px">⚠️ Some items need more than the shop has on hand — tick "start a draft PO" below to order the shortfall, or restock the shop first.</div>' : '');
}

function _onReplenishTransferEdit(i, val) {
  if (!_replenishRows[i]) return;
  var t = Math.max(0, parseFloat(val) || 0);
  t = Math.min(t, _replenishRows[i].need);           // never transfer past par
  _replenishRows[i].transfer = Math.round(t * 100) / 100;
  _replenishRows[i].short = Math.round((_replenishRows[i].need - _replenishRows[i].transfer) * 100) / 100;
  var tr = document.querySelectorAll('#replenish-plan tbody tr')[i];
  if (tr && tr.children[5]) {
    tr.children[5].textContent = _replenishRows[i].short > 0 ? _replenishRows[i].short : '—';
    tr.children[5].style.color = _replenishRows[i].short > 0 ? '#c62828' : '#90a4ae';
  }
}

function commitReplenish() {
  var truckId = (document.getElementById('replenish-loc')||{}).value || '';
  if (!truckId || !_replenishRows || !_replenishRows.length) { showToast('Nothing to replenish','error'); return; }
  var allowNeg = !!(DB.settings && DB.settings.allowNegativeStock);
  var movedItems = 0, movedUnits = 0, shortRows = [];
  _replenishRows.forEach(function(r){
    var m = (DB.catalog||[]).find(function(c){ return String(c.id) === String(r.itemId); });
    if (!m) return;
    var shopNow = getItemQtyAtLocation(m, 'loc-shop');
    var xfer = r.transfer;
    // Don't let the truck gain more than the shop can give (would otherwise create phantom stock,
    // since adjustItemQty floors the shop at 0 when negative stock is off).
    if (!allowNeg) xfer = Math.min(xfer, shopNow);
    xfer = Math.round(xfer * 100) / 100;
    if (xfer > 0) {
      adjustItemQty(m.id, 'loc-shop', -xfer);
      adjustItemQty(m.id, truckId, xfer);
      if (!DB.invTransfers) DB.invTransfers = [];
      DB.invTransfers.push({ id:'tr-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), itemId:m.id,
        itemName:m.name, qty:xfer, fromLoc:'loc-shop', toLoc:truckId, date:getTodayISO(),
        by:(_currentUser&&_currentUser.full_name)||'Replenish', reason:'Replenish to par',
        createdAt:new Date().toISOString() });
      movedItems++; movedUnits += xfer;
    }
    var actualShort = Math.round((r.need - xfer) * 100) / 100;
    if (actualShort > 0) shortRows.push(Object.assign({}, r, { short:actualShort }));
  });
  saveDB();
  var makePO = !!(document.getElementById('replenish-make-po')||{}).checked;
  var truckName = getLocationName(truckId);
  if (typeof closeModal === 'function') closeModal('modal-replenish');
  if (typeof renderInventory === 'function') renderInventory();
  showToast(movedItems ? ('Transferred '+movedItems+' item'+(movedItems!==1?'s':'')+' ('+(Math.round(movedUnits*100)/100)+' units) to '+truckName) : 'No transfers made','success');

  if (makePO && shortRows.length && typeof openNewPO === 'function') {
    openNewPO();
    var vn = (shortRows[0].vendor||'').trim().toLowerCase();
    if (vn) {
      var actives = (DB.vendors||[]).filter(function(x){ return x.active!==false; });
      var v = actives.find(function(x){ return (x.name||'').trim().toLowerCase() === vn; });
      if (!v && vn.length >= 3) v = actives.find(function(x){ var n=(x.name||'').trim().toLowerCase(); return n && (n.indexOf(vn)>=0 || vn.indexOf(n)>=0); });
      var vSel = document.getElementById('po-vendor');
      if (v && vSel) { vSel.value = v.id; if (typeof onPOVendorChange==='function') onPOVendorChange(v.id); }
    }
    if (typeof _poItems === 'undefined') { window._poItems = []; }
    _poItems = shortRows.map(function(r,i){ return { _eid:i, desc:r.name, partNum:r.partNum, qtyOrdered:r.short, qtyReceived:0, unitCost:r.cost }; });
    if (typeof renderPOItems === 'function') renderPOItems();
    if (typeof refreshPOTotals === 'function') refreshPOTotals();
    showToast(shortRows.length+' shortfall line'+(shortRows.length!==1?'s':'')+' added to a draft PO — review & save','success');
  }
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

  // Unified item master. Find the master by id (edit) or create a new one. Wave 1d: the item type
  // (stock/non-stock/service) drives whether it's tracked; non-stock/service carry no stock qty.
  if (!DB.catalog) DB.catalog = [];
  var master = id ? (DB.catalog||[]).find(function(c){ return String(c.id)==String(id); }) : null;
  var itemType = (document.getElementById('inv-type')||{}).value || 'stock';
  var isStock  = (itemType === 'stock');

  if (!master) {
    master = {
      // catalog.id is a UUID column — new items must use a real UUID or the sync upsert is rejected.
      id:        (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'inv-'+Date.now()),
      lh: 0, hours: 0, locations: {},
      createdAt: new Date().toISOString()
    };
    DB.catalog.push(master);
  }
  // Stock qty applies only to stock items; non-stock/service keep an empty location map.
  var locations = master.locations ? Object.assign({}, master.locations) : {};
  if (isStock) { locations['loc-shop'] = parseFloat((document.getElementById('inv-qty-shop')||{}).value)||0; }
  else { locations = {}; }

  master.name         = name;
  master.itemType     = itemType;
  master.tracked      = isStock;
  master.active       = !!(document.getElementById('inv-active')||{checked:true}).checked;
  master.cat          = gv('inv-cat') || master.cat || 'General';
  master.unit         = gv('inv-uom') || master.unit || 'ea';
  master.manufacturer = gv('inv-mfr');
  master.mfrPart      = gv('inv-mfr-part');
  master.vendor       = gv('inv-vendor');
  master.photos       = (typeof _readInvPhotos === 'function') ? _readInvPhotos() : (master.photos||[]);
  master.photoUrl     = master.photos[0] || (document.getElementById('inv-photo-url')||{}).value || '';
  master.partNum      = gv('inv-part-num'); master.part = master.partNum;
  master.barcode      = gv('inv-barcode');
  master.returnable   = isStock && !!(document.getElementById('inv-returnable')||{}).checked;
  master.locations    = locations;
  master.minQty       = isStock ? (parseFloat((document.getElementById('inv-min')||{}).value)||0) : 0;
  master.reorderMax   = isStock ? (parseFloat((document.getElementById('inv-reorder-max')||{}).value)||0) : 0;
  master.locPars      = isStock ? _readInvLocParsFromForm() : {};
  // Wave 2d: UoM purchase→stock conversion. purchaseUnit = how you buy; unit (above) = stock/issue unit;
  // conversionFactor = stock units per one purchase unit (1 = buy & stock the same).
  master.purchaseUnit     = isStock ? gv('inv-purchase-unit') : '';
  master.conversionFactor = isStock ? (parseFloat((document.getElementById('inv-conv-factor')||{}).value)||1) : 1;
  if (!(master.conversionFactor > 0)) master.conversionFactor = 1;
  // Wave 2e: kits carry a component list and are never stock-tracked.
  master.kitComponents = (itemType === 'kit') ? ((typeof _kitDraft !== 'undefined' ? _kitDraft : []) || []).slice() : [];
  master.mc           = parseFloat((document.getElementById('inv-cost')||{}).value)||0;
  master.cost         = master.mc;
  master.notes        = gv('inv-item-notes');
  if (gv('inv-tag')) master.tag = gv('inv-tag');

  saveDB();
  if (typeof _deriveInventoryFromCatalog === 'function') _deriveInventoryFromCatalog();
  if (typeof _pushInventoryToCloud === 'function') {
    _pushInventoryToCloud({ id:master.id, name:master.name, cat:master.cat, unit:master.unit,
      partNum:master.partNum, barcode:master.barcode, manufacturer:master.manufacturer, mfrPart:master.mfrPart,
      vendor:master.vendor, photoUrl:master.photoUrl, returnable:master.returnable, locations:master.locations,
      minQty:master.minQty, reorderMax:master.reorderMax, locPars:master.locPars,
      purchaseUnit:master.purchaseUnit, conversionFactor:master.conversionFactor,
      kitComponents:master.kitComponents, photos:master.photos,
      cost:master.mc, notes:master.notes, itemType:master.itemType,
      tracked:master.tracked, active:master.active });
  }
  closeModal('modal-inv-item');
  renderInventory();
  showToast('"'+name+'" saved'+(isStock?' ✓':' (non-stock — kept in Price Catalog) ✓'),'success');
}

// Override editInventoryItem to populate new fields
var _origEditInventoryItem = typeof editInventoryItem !== 'undefined' ? editInventoryItem : null;
function editInventoryItem(id) {
  // Wave 1d: read from the item MASTER (catalog), which carries the full field set (type, unit,
  // manufacturer, vendor, photo, active) — the derived DB.inventory row only has stock basics.
  var m = (DB.catalog||[]).find(function(c){ return String(c.id)==String(id); });
  if (!m) { var iv=(DB.inventory||[]).find(function(i){ return i.id==id; }); if(iv) m=(DB.catalog||[]).find(function(c){return String(c.id)==String(iv.id);}); }
  if (!m) return;
  document.getElementById('inv-modal-title').textContent = 'Edit: '+(m.name||'Item');
  function sv(eid,v){ var el=document.getElementById(eid); if(el) el.value=v!==undefined&&v!==null?v:''; }
  sv('inv-name',    m.name);
  sv('inv-tag',     m.tag||'');
  sv('inv-cat',     m.cat||'');
  sv('inv-uom',     m.unit||'EA');
  sv('inv-mfr',     m.manufacturer||'');
  sv('inv-mfr-part',m.mfrPart||'');
  sv('inv-vendor',  m.vendor||'');
  sv('inv-part-num',m.partNum||m.part||'');
  sv('inv-barcode', m.barcode||'');
  sv('inv-qty-shop',getItemQtyAtLocation(m,'loc-shop'));
  sv('inv-min',     m.minQty||0);
  sv('inv-reorder-max', m.reorderMax||0);
  sv('inv-purchase-unit', m.purchaseUnit||'');
  sv('inv-conv-factor', (m.conversionFactor!=null?m.conversionFactor:1));
  sv('inv-cost',    (m.mc!=null?m.mc:(m.cost||0)));
  sv('inv-item-notes',m.notes||'');
  sv('inv-id',      m.id);
  var typeEl = document.getElementById('inv-type'); if (typeEl) typeEl.value = m.itemType || (m.tracked ? 'stock' : 'nonstock');
  var retEl = document.getElementById('inv-returnable'); if (retEl) retEl.checked = !!m.returnable;
  var actEl = document.getElementById('inv-active'); if (actEl) actEl.checked = (m.active !== false);
  var phUrl = document.getElementById('inv-photo-url'); if (phUrl) phUrl.value = m.photoUrl || '';
  var _seedPhotos = (m.photos && m.photos.length) ? m.photos : (m.photoUrl ? [m.photoUrl] : []);
  _renderInvPhotoPreview(_seedPhotos);
  if (typeof populateInvDataLists === 'function') populateInvDataLists();
  if (typeof _populateInvVendorList === 'function') _populateInvVendorList();
  if (typeof invTypeChanged === 'function') invTypeChanged();
  _renderInvOnOrder(m);
  _renderInvLocParsEditor(m.locPars || {});   // reset panel collapsed, populated from saved pars
  if (typeof _updateConvHint === 'function') _updateConvHint();
  if (typeof _populateKitDatalist === 'function') _populateKitDatalist();
  if (typeof renderKitEditor === 'function') renderKitEditor(m.kitComponents || []);
  openModal('modal-inv-item');
}

// Wave 2d: live conversion hint in the item modal, e.g. "1 Box = 100 ft".
function _updateConvHint() {
  var hint = document.getElementById('inv-conv-hint'); if (!hint) return;
  var pu = ((document.getElementById('inv-purchase-unit')||{}).value||'').trim();
  var f  = parseFloat((document.getElementById('inv-conv-factor')||{}).value)||1;
  var su = ((document.getElementById('inv-uom')||{}).value||'ea').trim() || 'ea';
  if (pu && f > 0 && (f !== 1 || pu.toLowerCase() !== su.toLowerCase())) {
    hint.textContent = '1 ' + pu + ' = ' + f + ' ' + su;
  } else {
    hint.textContent = '';
  }
}

// Show/hide the stock-only fields based on the selected item type.
function invTypeChanged() {
  var t = (document.getElementById('inv-type')||{}).value || 'stock';
  var sf = document.getElementById('inv-stock-fields');
  if (sf) sf.style.display = (t === 'stock') ? '' : 'none';
  var kf = document.getElementById('inv-kit-fields');
  if (kf) kf.style.display = (t === 'kit') ? '' : 'none';
  if (t === 'kit' && typeof _populateKitDatalist === 'function') _populateKitDatalist();
}

// ---- KIT / BUNDLE COMPONENT EDITOR (Wave 2e) ----
var _kitDraft = [];   // [{itemId, name, qty}]

function _populateKitDatalist() {
  var dl = document.getElementById('inv-kit-datalist'); if (!dl) return;
  dl.innerHTML = (DB.catalog||[]).filter(function(c){ return c && c.active!==false && c.itemType!=='kit'; })
    .map(function(c){ return '<option value="'+escHtml(c.name||'')+'">'+escHtml(c.partNum||c.part||'')+'</option>'; }).join('');
}

function renderKitEditor(components) {
  _kitDraft = (components || []).slice();
  var host = document.getElementById('inv-kit-list'); if (!host) return;
  if (!_kitDraft.length) { host.innerHTML = '<div style="font-size:12px;color:#bdbdbd;padding:6px 0">No components yet.</div>'; return; }
  host.innerHTML = '<table style="width:100%;font-size:12px"><tbody>' + _kitDraft.map(function(c,i){
    return '<tr style="border-top:1px solid #f0f4f8">'+
      '<td style="padding:5px 6px;font-weight:600">'+escHtml(c.name||'')+'</td>'+
      '<td style="padding:5px 6px;text-align:right;color:#546e7a">× '+c.qty+'</td>'+
      '<td style="padding:5px 6px;text-align:right;width:32px"><button type="button" onclick="removeKitComponent('+i+')" style="background:none;border:none;color:#c62828;cursor:pointer;font-size:16px;line-height:1">×</button></td>'+
    '</tr>';
  }).join('') + '</tbody></table>';
}

function addKitComponent() {
  var name = ((document.getElementById('inv-kit-search')||{}).value||'').trim();
  var qty  = parseFloat((document.getElementById('inv-kit-qty')||{}).value)||0;
  if (!name) { showToast('Pick a component item','error'); return; }
  if (qty <= 0) { showToast('Enter a component quantity','error'); return; }
  var c = (DB.catalog||[]).find(function(x){ return (x.name||'').toLowerCase()===name.toLowerCase() && x.itemType!=='kit'; });
  if (!c) { showToast('No catalog item named "'+name+'"','error'); return; }
  _kitDraft.push({ itemId:c.id, name:c.name, qty:qty });
  renderKitEditor(_kitDraft);
  var s=document.getElementById('inv-kit-search'); if(s) s.value='';
  var q=document.getElementById('inv-kit-qty'); if(q) q.value='1';
  if (s) s.focus();
}

function removeKitComponent(idx) {
  _kitDraft.splice(idx,1);
  renderKitEditor(_kitDraft);
}

// Compute qty currently on open purchase orders (Sent / Partially Received) for this item.
function _invOnOrder(item) {
  var pos = (DB.purchaseOrders||[]).filter(function(p){ return p && (p.status==='Sent' || p.status==='Partially Received'); });
  var pn = (item.partNum||item.part||'').toLowerCase();
  var nm = (item.name||'').toLowerCase();
  var total = 0;
  pos.forEach(function(p){ (p.items||[]).forEach(function(li){
    var lpn=(li.partNum||'').toLowerCase(), ld=(li.desc||'').toLowerCase();
    if ((pn && lpn===pn) || (nm && ld===nm)) {
      total += Math.max(0, (parseFloat(li.qtyOrdered||0) - parseFloat(li.qtyReceived||0)));
    }
  }); });
  return total;
}
function _renderInvOnOrder(item) {
  var row = document.getElementById('inv-onorder-row'); if (!row) return;
  var oo = _invOnOrder(item);
  if (oo > 0) { row.style.display=''; row.textContent = '📦 On order: ' + oo + ' (open POs)'; }
  else { row.style.display='none'; row.textContent=''; }
}

// Photos (Wave 2f): multiple resized thumbnails per item. _photoDraft holds the working set; the first
// image is also mirrored to inv-photo-url as the PRIMARY photo (row thumbnails, back-compat).
var _photoDraft = [];
var INV_MAX_PHOTOS = 6;

// url arg kept for back-compat callers; when passed, it seeds the draft (edit/new paths call the
// dedicated setter below, so this just re-renders whatever seeds it gets).
function _renderInvPhotoPreview(seed) {
  if (typeof seed === 'string') { _photoDraft = seed ? [seed] : []; }
  else if (Array.isArray(seed)) { _photoDraft = seed.slice(); }
  var el = document.getElementById('inv-photo-preview'); if (!el) return;
  if (!_photoDraft.length) { el.innerHTML = ''; _syncPrimaryPhoto(); return; }
  el.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' + _photoDraft.map(function(u,i){
    return '<div style="position:relative;display:inline-block">'+
      '<img src="'+u+'" style="height:64px;border-radius:6px;border:1px solid '+(i===0?'#1565c0':'#e0e7ef')+'">'+
      (i===0?'<span style="position:absolute;bottom:2px;left:2px;background:#1565c0;color:#fff;font-size:9px;padding:0 4px;border-radius:6px">main</span>':'')+
      '<button type="button" onclick="removeInvPhoto('+i+')" title="Remove" style="position:absolute;top:-6px;right:-6px;background:#c62828;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:12px;line-height:1;cursor:pointer">×</button>'+
    '</div>';
  }).join('') + '</div>';
  _syncPrimaryPhoto();
}
function _syncPrimaryPhoto() {
  var ph = document.getElementById('inv-photo-url'); if (ph) ph.value = _photoDraft[0] || '';
}
function removeInvPhoto(i) {
  _photoDraft.splice(i,1);
  _renderInvPhotoPreview();
}
function onInvPhotoChange(input) {
  var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
  if (!files.length) return;
  files.forEach(function(f){
    if (_photoDraft.length >= INV_MAX_PHOTOS) { showToast('Up to '+INV_MAX_PHOTOS+' photos per item','error'); return; }
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var max=240, w=img.width, h=img.height;
        if (w>h && w>max){ h=Math.round(h*max/w); w=max; } else if (h>max){ w=Math.round(w*max/h); h=max; }
        var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        if (_photoDraft.length < INV_MAX_PHOTOS) _photoDraft.push(cv.toDataURL('image/jpeg',0.72));
        _renderInvPhotoPreview();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(f);
  });
  if (input) input.value = '';
}
// Read the current photo draft (for save).
function _readInvPhotos() { return (_photoDraft||[]).slice(); }

// Vendor autocomplete from known vendors + catalog vendors.
function _populateInvVendorList() {
  var set = {};
  (DB.vendors||[]).forEach(function(v){ if(v&&v.name) set[v.name]=1; });
  (DB.catalog||[]).forEach(function(c){ if(c&&c.vendor) set[c.vendor]=1; });
  var dl = document.getElementById('inv-vendor-datalist');
  if (dl) dl.innerHTML = Object.keys(set).sort().map(function(v){ return '<option value="'+escHtml(v)+'"></option>'; }).join('');
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

// ============================================================
// Wave 1a — Quantity Correction modal (dedicated stock adjust)
// ============================================================
// Corrects on-hand at ANY location with a required reason, writes an audit trail, and syncs via the
// record_stock_adjustment RPC (active-user-safe; the button itself is gated by the inv.adjust
// permission — owner auto, others grantable in Settings → Customize Access).

function openAdjustQty(itemId) {
  if (typeof hasPermission === 'function' && !hasPermission('inv.adjust')) {
    showToast('You don’t have permission to adjust stock counts.', 'error'); return;
  }
  var m = (DB.catalog || []).find(function(c){ return String(c.id) === String(itemId); });
  if (!m) { showToast('Item not found', 'error'); return; }
  var titleEl = document.getElementById('inv-adjust-title');
  var subEl   = document.getElementById('inv-adjust-sub');
  if (titleEl) titleEl.textContent = 'Adjust Quantity';
  if (subEl)   subEl.innerHTML = '<strong>' + escHtml(m.name || '') + '</strong>' +
    (m.partNum ? ' <span style="color:#90a4ae">· ' + escHtml(m.partNum) + '</span>' : '');
  var idEl = document.getElementById('inv-adjust-id'); if (idEl) idEl.value = m.id;
  var reasonEl = document.getElementById('inv-adjust-reason'); if (reasonEl) reasonEl.value = 'Count correction';

  var locs = getLocations();
  var rowsEl = document.getElementById('inv-adjust-rows');
  if (rowsEl) rowsEl.innerHTML = locs.map(function(l){
    var cur = getItemQtyAtLocation(m, l.id);
    return '<div style="display:grid;grid-template-columns:1fr 90px 110px;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f4f8">' +
      '<div style="font-size:13px">' + escHtml(l.name) + '</div>' +
      '<div style="font-size:12px;color:#607d8b;text-align:right">on hand: <strong>' + cur + '</strong></div>' +
      '<div><input type="number" step="any" min="0" value="' + cur + '" ' +
        'id="adj-' + escHtml(l.id) + '" data-loc="' + escHtml(l.id) + '" data-old="' + cur + '" ' +
        'style="width:100%;padding:6px;border:1px solid #e0e7ef;border-radius:6px;text-align:right;font-size:13px"></div>' +
    '</div>';
  }).join('');
  openModal('modal-inv-adjust');
}

async function saveAdjustQty() {
  var id = (document.getElementById('inv-adjust-id') || {}).value || '';
  var m  = (DB.catalog || []).find(function(c){ return String(c.id) === String(id); });
  if (!m) { showToast('Item not found', 'error'); return; }
  if (typeof hasPermission === 'function' && !hasPermission('inv.adjust')) {
    showToast('You don’t have permission to adjust stock counts.', 'error'); return;
  }
  var reason = (document.getElementById('inv-adjust-reason') || {}).value || 'Count correction';
  var locs = getLocations();
  var locName = {}; locs.forEach(function(l){ locName[l.id] = l.name; });

  var newLocations = Object.assign({}, m.locations || {});
  var lines = [];
  var inputs = document.querySelectorAll('#inv-adjust-rows input[data-loc]');
  inputs.forEach(function(inp){
    var locId = inp.getAttribute('data-loc');
    var oldVal = parseFloat(inp.getAttribute('data-old')) || 0;
    var newVal = parseFloat(inp.value);
    if (isNaN(newVal) || newVal < 0) newVal = 0;
    newLocations[locId] = newVal;
    if (newVal !== oldVal) {
      lines.push({ location: locId, location_name: locName[locId] || locId,
                   old: oldVal, new: newVal, delta: (newVal - oldVal) });
    }
  });

  if (!lines.length) { showToast('No changes to save', 'info'); return; }

  // Update the master + re-derive locally.
  m.locations = newLocations; m.tracked = true;
  saveDB();
  if (typeof _deriveInventoryFromCatalog === 'function') _deriveInventoryFromCatalog();

  // Persist through the audited RPC.
  if (_sb && _currentUser) {
    try {
      var byName = (_currentUser && (_currentUser.full_name || _currentUser.name)) || 'Unknown';
      var r = await _sb.rpc('record_stock_adjustment', {
        p_id: id, p_locations: newLocations, p_reason: reason, p_by_name: byName, p_lines: lines
      });
      if (r && r.error) { showToast('Saved locally, cloud sync failed: ' + r.error.message, 'error', 6000); }
    } catch (e) { showToast('Saved locally, cloud sync failed: ' + (e.message || e), 'error', 6000); }
  }
  closeModal('modal-inv-adjust');
  if (typeof renderInventory === 'function') renderInventory();
  showToast('Stock adjusted ✓', 'success');
}

// ============================================================
// Wave 1b — Add-Item picker (WO parts): stock / order / non-stock / one-off
// ============================================================
var _woAISelected = null;

function _addWOPartRecord(part) {
  var woId = _woCurrentId;
  if (!woId) { showToast('Save the work order first', 'error'); return null; }
  if (!DB.woParts) DB.woParts = [];
  var rec = Object.assign({
    id: 'wop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
    woId: woId,
    requestedBy: (_currentUser && (_currentUser.full_name || _currentUser.name)) || 'Unknown',
    createdAt: new Date().toISOString()
  }, part);
  DB.woParts.push(rec);
  if (typeof _pushWOPartToCloud === 'function') _pushWOPartToCloud(rec);
  saveDB();
  return rec;
}

function openWOAddItem() {
  if (!_woCurrentId) { showToast('Save the work order first', 'error'); return; }
  _woAISelected = null;
  var s = document.getElementById('wo-ai-search'); if (s) s.value = '';
  var d = document.getElementById('wo-ai-detail'); if (d) d.style.display = 'none';
  var on = document.getElementById('wo-ai-oneoff-name'); if (on) on.value = '';
  var oc = document.getElementById('wo-ai-oneoff-cost'); if (oc) oc.value = '';
  var oq = document.getElementById('wo-ai-oneoff-qty'); if (oq) oq.value = '1';
  var os = document.getElementById('wo-ai-oneoff-save'); if (os) os.checked = false;
  renderWOItemResults('');
  openModal('modal-wo-additem');
  setTimeout(function(){ var s2 = document.getElementById('wo-ai-search'); if (s2) s2.focus(); }, 120);
}

function _woItemOnHand(c) {
  if (!c.tracked) return null;
  var locs = c.locations || {};
  return Object.keys(locs).reduce(function(s, k){ return s + (parseFloat(locs[k]) || 0); }, 0);
}
function _woItemCost(c) { return (c.mc != null ? c.mc : (c.cost || 0)); }

function renderWOItemResults(term) {
  term = (term || '').toLowerCase().trim();
  var list = (DB.catalog || []).filter(function(c){ return c && c.active !== false; });
  if (term) list = list.filter(function(c){
    return (c.name || '').toLowerCase().indexOf(term) >= 0 ||
           (c.partNum || c.part || '').toLowerCase().indexOf(term) >= 0 ||
           (c.barcode || '').toLowerCase().indexOf(term) >= 0;
  });
  // Favorites first, then tracked (stock) items, then by name.
  list.sort(function(a,b){
    return (_isInvFav(b.id)?1:0) - (_isInvFav(a.id)?1:0)
        || (b.tracked?1:0) - (a.tracked?1:0)
        || String(a.name||'').localeCompare(String(b.name||''));
  });
  list = list.slice(0, 30);
  var el = document.getElementById('wo-ai-results'); if (!el) return;
  if (!list.length) { el.innerHTML = '<div style="color:#90a4ae;font-size:13px;padding:10px">No matching items — use the one-off form below to add a custom item.</div>'; return; }
  el.innerHTML = list.map(function(c){
    var oh = _woItemOnHand(c);
    return '<div onclick="selectWOAIItem(\'' + escHtml(c.id) + '\')" style="padding:8px 10px;border-bottom:1px solid #f0f4f8;cursor:pointer;display:flex;justify-content:space-between;gap:10px">' +
      '<div><div style="font-weight:600;font-size:13px">' + (_isInvFav(c.id)?'<span style="color:#f9a825">★</span> ':'') + escHtml(c.name || '') + '</div>' +
      '<div style="font-size:11px;color:#90a4ae">' + escHtml(c.partNum || c.part || '') + (c.itemType==='kit' ? ' · 📦 kit' : (c.tracked ? '' : ' · non-stock')) + '</div></div>' +
      '<div style="text-align:right;font-size:12px;white-space:nowrap">$' + Number(_woItemCost(c)).toFixed(2) + '<br>' +
        (c.tracked ? '<span style="color:' + (oh > 0 ? '#2e7d32' : '#c62828') + '">' + oh + ' on hand</span>' : '<span style="color:#90a4ae">—</span>') +
      '</div></div>';
  }).join('');
}

function selectWOAIItem(id) {
  var c = (DB.catalog || []).find(function(x){ return String(x.id) === String(id); });
  if (!c) return;
  _woAISelected = c.id;
  var d = document.getElementById('wo-ai-detail'); if (!d) return;

  // Wave 2e: a kit expands to its component lines in one click.
  if (c.itemType === 'kit') {
    var comps = c.kitComponents || [];
    d.style.display = '';
    d.innerHTML =
      '<div style="font-weight:700;font-size:14px;margin-bottom:2px">📦 ' + escHtml(c.name || '') + '</div>' +
      '<div style="font-size:12px;color:#607d8b;margin-bottom:8px">Kit / bundle · ' + comps.length + ' component' + (comps.length!==1?'s':'') + '</div>' +
      (comps.length
        ? '<div style="border:1px solid #eceff1;border-radius:6px;margin-bottom:10px">' + comps.map(function(k){
            var ci = (DB.catalog||[]).find(function(x){ return String(x.id)===String(k.itemId); });
            var oh = (ci && ci.tracked) ? _availableAtLocation(ci,'loc-shop') : null;
            return '<div style="display:flex;justify-content:space-between;padding:5px 8px;border-top:1px solid #f4f6f8;font-size:12px">'+
              '<span>'+escHtml(k.name||(ci&&ci.name)||'')+' <span style="color:#90a4ae">× '+k.qty+'</span></span>'+
              '<span style="color:'+(ci&&ci.tracked?(oh>0?'#2e7d32':'#c62828'):'#90a4ae')+'">'+(ci&&ci.tracked?(oh+' avail'):'non-stock')+'</span>'+
            '</div>';
          }).join('') + '</div>'
        : '<div style="font-size:12px;color:#c62828;margin-bottom:10px">This kit has no components. Add some on the item first.</div>') +
      '<div style="display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center;margin-bottom:10px">' +
        '<label style="font-size:12px;font-weight:700;color:#546e7a">Kit qty</label>' +
        '<input type="number" id="wo-ai-qty" min="0" step="any" value="1" style="width:110px;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        (comps.length ? '<button class="btn btn-primary btn-sm" onclick="addKitToWO()">📦 Add Kit — expands to ' + comps.length + ' item' + (comps.length!==1?'s':'') + '</button>' : '') +
      '</div>';
    return;
  }

  var locs = getLocations();
  var chips = c.tracked ? locs.map(function(l){ var q = getItemQtyAtLocation(c, l.id); return q > 0 ? '<span style="background:#e8f5e9;color:#2e7d32;padding:1px 8px;border-radius:10px;font-size:11px;margin:2px 3px 0 0;display:inline-block">' + escHtml(l.name) + ': ' + q + '</span>' : ''; }).join('') : '';
  var locOpts = locs.map(function(l){ var oh=getItemQtyAtLocation(c,l.id); var av=_availableAtLocation(c,l.id); return '<option value="' + escHtml(l.id) + '">' + escHtml(l.name) + ' (' + av + ' avail' + (av!==oh?(' / '+oh+' on hand'):'') + ')</option>'; }).join('');
  var _oh = c.tracked ? (_woItemOnHand(c)||0) : 0;
  var _res = c.tracked ? _reservedTotal(c.id) : 0;
  var _stockLabel = c.tracked
    ? '<span style="color:#2e7d32">stock item</span> · ' + (_oh - _res) + ' available' + (_res>0 ? ' <span style="color:#e65100">('+_res+' reserved of '+_oh+')</span>' : ' of ' + _oh)
    : '<span style="color:#e65100">non-stock</span>';
  d.style.display = '';
  d.innerHTML =
    '<div style="font-weight:700;font-size:14px;margin-bottom:2px">' + escHtml(c.name || '') + '</div>' +
    '<div style="font-size:12px;color:#607d8b;margin-bottom:8px">' + escHtml(c.partNum || c.part || '') + ' · $' + Number(_woItemCost(c)).toFixed(2) + ' · ' + _stockLabel + '</div>' +
    (chips ? '<div style="margin-bottom:8px">' + chips + '</div>' : '') +
    '<div style="display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center;margin-bottom:10px">' +
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Qty</label>' +
      '<input type="number" id="wo-ai-qty" min="0" step="any" value="1" style="width:110px;padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px">' +
      (c.tracked ? '<label style="font-size:12px;font-weight:700;color:#546e7a">From</label><select id="wo-ai-loc" style="padding:7px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px">' + locOpts + '</select>' : '') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (c.tracked ? '<button class="btn btn-primary btn-sm" onclick="addPickedItemToWO(\'stock\')">↓ Add from Stock</button>' : '') +
      (c.tracked ? '<button class="btn btn-outline btn-sm" onclick="addPickedItemToWO(\'reserve\')" title="Hold this stock for the job without using it yet">◷ Reserve</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="addPickedItemToWO(\'order\')">Request for PO</button>' +
      '<button class="btn btn-outline btn-sm" onclick="addPickedItemToWO(\'nonstock\')">Add as Non-stock</button>' +
    '</div>';
  var sel = document.getElementById('wo-ai-loc');
  if (sel) { var best = locs.find(function(l){ return getItemQtyAtLocation(c, l.id) > 0; }); if (best) sel.value = best.id; }
}

function addPickedItemToWO(mode) {
  var c = (DB.catalog || []).find(function(x){ return String(x.id) === String(_woAISelected); });
  if (!c) { showToast('Pick an item first', 'error'); return; }
  var qty = parseFloat((document.getElementById('wo-ai-qty') || {}).value) || 0;
  if (qty <= 0) { showToast('Enter a quantity', 'error'); return; }
  var base = { name: c.name, partNum: c.partNum || c.part || '', qty: qty, unit: c.unit || 'ea', unitCost: _woItemCost(c), itemId: c.id };

  if (mode === 'stock') {
    var fromLoc = (document.getElementById('wo-ai-loc') || {}).value || 'loc-shop';
    // Wave 2c: issue against AVAILABLE (on-hand − reserved), so stock committed to other jobs isn't
    // double-issued.
    var avail = _availableAtLocation(c, fromLoc);
    var allowNeg = !!(DB.settings && DB.settings.allowNegativeStock);
    if (qty > avail && !allowNeg) {
      showToast('Only ' + avail + ' available at ' + getLocationName(fromLoc) + (avail<getItemQtyAtLocation(c,fromLoc)?' (some is reserved)':'') + '. Enable "Allow negative stock", or use Reserve / Request for PO / Non-stock.', 'error', 7000);
      return;
    }
    adjustItemQty(c.id, fromLoc, -qty); // RPC-backed decrement + re-derive
    _addWOPartRecord(Object.assign({}, base, { status: 'used', source: 'stock', fromLocation: fromLoc }));
    showToast(qty + ' × ' + c.name + ' issued from ' + getLocationName(fromLoc) + ' ✓', 'success');
  } else if (mode === 'reserve') {
    // Wave 2c: hold stock for the job without consuming it. No decrement; it lowers AVAILABLE until the
    // part is Used (which then decrements) or Released.
    var rLoc = (document.getElementById('wo-ai-loc') || {}).value || 'loc-shop';
    var rAvail = _availableAtLocation(c, rLoc);
    var rAllowNeg = !!(DB.settings && DB.settings.allowNegativeStock);
    if (qty > rAvail && !rAllowNeg) {
      showToast('Only ' + rAvail + ' available to reserve at ' + getLocationName(rLoc) + '. Enable "Allow negative stock", or reserve less.', 'error', 7000);
      return;
    }
    _addWOPartRecord(Object.assign({}, base, { status: 'reserved', source: 'stock', fromLocation: rLoc }));
    showToast(qty + ' × ' + c.name + ' reserved from ' + getLocationName(rLoc) + ' ◷', 'success');
  } else if (mode === 'order') {
    _addWOPartRecord(Object.assign({}, base, { status: 'requested', source: 'order' }));
    showToast(c.name + ' added to parts to order', 'success');
  } else {
    _addWOPartRecord(Object.assign({}, base, { status: 'used', source: 'nonstock' }));
    showToast(c.name + ' added (non-stock)', 'success');
  }
  if (typeof switchWOTab === 'function') switchWOTab('parts');
  _woAISelected = null;
  var d = document.getElementById('wo-ai-detail'); if (d) d.style.display = 'none';
  var s = document.getElementById('wo-ai-search'); if (s) { s.value = ''; s.focus(); }
  renderWOItemResults('');
}

// Wave 2e: expand a kit into its component wo_parts (component qty × kit qty). Tracked components issue
// from shop stock when available (decrement); otherwise land as non-stock. Nested kits are not recursed.
function addKitToWO() {
  var kit = (DB.catalog || []).find(function(x){ return String(x.id) === String(_woAISelected); });
  if (!kit || kit.itemType !== 'kit') { showToast('Pick a kit first', 'error'); return; }
  var kitQty = parseFloat((document.getElementById('wo-ai-qty') || {}).value) || 0;
  if (kitQty <= 0) { showToast('Enter a kit quantity', 'error'); return; }
  var comps = kit.kitComponents || [];
  if (!comps.length) { showToast('This kit has no components', 'error'); return; }
  var allowNeg = !!(DB.settings && DB.settings.allowNegativeStock);
  var added = 0;
  comps.forEach(function(k){
    var ci = (DB.catalog || []).find(function(x){ return String(x.id) === String(k.itemId); });
    var qty = (parseFloat(k.qty) || 0) * kitQty;
    if (qty <= 0) return;
    var name = k.name || (ci && ci.name) || 'Component';
    var base = { name:name, partNum:(ci && (ci.partNum||ci.part))||'', qty:qty, unit:(ci && ci.unit)||'ea',
                 unitCost: ci ? _woItemCost(ci) : 0, itemId: ci ? ci.id : null };
    if (ci && ci.tracked && ci.itemType !== 'kit') {
      var avail = _availableAtLocation(ci, 'loc-shop');
      if (qty <= avail || allowNeg) {
        adjustItemQty(ci.id, 'loc-shop', -qty);
        _addWOPartRecord(Object.assign({}, base, { status:'used', source:'stock', fromLocation:'loc-shop', notes:'Kit: '+kit.name }));
      } else {
        _addWOPartRecord(Object.assign({}, base, { status:'used', source:'nonstock', notes:'Kit: '+kit.name+' (short on stock)' }));
      }
    } else {
      _addWOPartRecord(Object.assign({}, base, { status:'used', source:'nonstock', notes:'Kit: '+kit.name }));
    }
    added++;
  });
  showToast(kit.name + ' added — ' + added + ' component' + (added!==1?'s':'') + ' on the job ✓', 'success');
  if (typeof switchWOTab === 'function') switchWOTab('parts');
  _woAISelected = null;
  var d = document.getElementById('wo-ai-detail'); if (d) d.style.display = 'none';
  var s = document.getElementById('wo-ai-search'); if (s) { s.value = ''; s.focus(); }
  renderWOItemResults('');
}

function addOneOffToWO() {
  var name = ((document.getElementById('wo-ai-oneoff-name') || {}).value || '').trim();
  var qty  = parseFloat((document.getElementById('wo-ai-oneoff-qty') || {}).value) || 0;
  var cost = parseFloat((document.getElementById('wo-ai-oneoff-cost') || {}).value) || 0;
  if (!name) { showToast('Enter a description', 'error'); return; }
  if (qty <= 0) { showToast('Enter a quantity', 'error'); return; }
  var saveToCatalog = !!((document.getElementById('wo-ai-oneoff-save') || {}).checked);
  var itemId = null;
  if (saveToCatalog) {
    var newId = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'cat-' + Date.now());
    var newItem = { id: newId, name: name, cat: 'General', unit: 'ea', mc: cost, cost: cost, lh: 0, hours: 0,
                    itemType: 'nonstock', tracked: false, active: true, locations: {}, createdAt: new Date().toISOString() };
    if (!DB.catalog) DB.catalog = [];
    DB.catalog.push(newItem);
    if (_sb && _currentUser) {
      _sb.from('catalog').upsert({ id: newId, name: name, category: 'General', unit: 'ea', default_cost: cost,
        default_hours: 0, item_type: 'nonstock', tracked: false, is_active: true }, { onConflict: 'id' })
        .then(function(r){ if (r && r.error) console.warn('[one-off catalog]', r.error.message); });
    }
    itemId = newId;
  }
  _addWOPartRecord({ name: name, partNum: '', qty: qty, unit: 'ea', unitCost: cost, status: 'used',
                     source: 'oneoff', itemId: itemId, notes: 'One-off item' });
  showToast('One-off "' + name + '" added', 'success');
  if (typeof switchWOTab === 'function') switchWOTab('parts');
  var on = document.getElementById('wo-ai-oneoff-name'); if (on) on.value = '';
  var oc = document.getElementById('wo-ai-oneoff-cost'); if (oc) oc.value = '';
  var oq = document.getElementById('wo-ai-oneoff-qty'); if (oq) oq.value = '1';
  var os = document.getElementById('wo-ai-oneoff-save'); if (os) os.checked = false;
}

// Global setup toggle — allow issuing stock below on-hand (backorder / negative).
function setAllowNegativeStock(v) {
  if (!DB.settings) DB.settings = {};
  DB.settings.allowNegativeStock = !!v;
  saveDB();
  if (typeof _pushSettingsToSupabase === 'function') _pushSettingsToSupabase();
  showToast('Inventory setting saved', 'success', 1500);
}

// ============================================================
// Wave 1e — Favorites (company-wide "our common items")
// ============================================================
// Stored in DB.settings.invFavorites (array of item ids) — syncs via settings_json, no migration.
// Favorited items sort to the top of the Add-Item picker (one-tap add) and get a ★ marker.
function _invFavs() { return (DB.settings && Array.isArray(DB.settings.invFavorites)) ? DB.settings.invFavorites : []; }
function _isInvFav(id) { return _invFavs().indexOf(String(id)) >= 0; }
function toggleInvFavorite(id, ev) {
  if (ev) { try { ev.stopPropagation(); ev.preventDefault(); } catch(e){} }
  if (!DB.settings) DB.settings = {};
  var f = (Array.isArray(DB.settings.invFavorites) ? DB.settings.invFavorites : []).slice();
  var i = f.indexOf(String(id));
  var added;
  if (i >= 0) { f.splice(i, 1); added = false; } else { f.push(String(id)); added = true; }
  DB.settings.invFavorites = f;
  saveDB();
  if (typeof _pushSettingsToSupabase === 'function') _pushSettingsToSupabase();
  if (typeof renderInventory === 'function') renderInventory();
  if (typeof showToast === 'function') showToast(added ? '★ Added to favorites' : 'Removed from favorites', 'info', 1500);
}
