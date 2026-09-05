// =============================================
// TOOLS & ASSETS — Separated from Inventory
// =============================================

// DB.tools = array of tool objects
// DB.toolCheckouts = array of checkout records
// DB.toolSeq = next available tag number (starts at 1)

function getTools() { return DB.tools || []; }
function getToolCheckouts() { return DB.toolCheckouts || []; }

// ---- TAG GENERATION ----
// Format: TCSS -001 (space before dash, zero-padded to 3 digits up to 999, then 4 digits)
function formatTag(n) {
  var num = parseInt(n)||1;
  if (num > 999) return 'TCSS -' + String(num).padStart(4,'0');
  return 'TCSS -' + String(num).padStart(3,'0');
}

function nextAvailableTag() {
  var used = (DB.tools||[]).map(function(t){ return t.tag||''; });
  for (var i=1; i<=1000; i++) {
    var tag = formatTag(i);
    if (!used.includes(tag)) return tag;
  }
  return formatTag(1001); // overflow safety
}

function autoAssignTag() {
  var el = document.getElementById('tool-tag');
  if (el) el.value = nextAvailableTag();
}

// ---- RENDER TOOLS LIST ----
function renderTools() {
  try { _renderToolsInner(); } catch(e) {
    console.error('[renderTools] Error:', e);
    var tbl = document.getElementById('tool-tbl');
    if (tbl) tbl.innerHTML = '<tr><td colspan="8" style="padding:20px;color:#c62828">Error rendering tools: '+escHtml(e.message)+'. Please refresh.</td></tr>';
  }
}
function _renderToolsInner() {
  var search   = ((document.getElementById('tool-search')||{}).value||'').toLowerCase();
  var catF     = (document.getElementById('tool-cat-filter')||{}).value||'';
  var tools    = getTools().slice();
  var checkouts = getToolCheckouts();
  var active   = checkouts.filter(function(c){ return !c.returnedAt && c.status !== 'pending_verify' && c.status !== 'verified'; });
  var pending  = checkouts.filter(function(c){ return c.status === 'pending_verify'; });

  if (search) tools = tools.filter(function(t){
    return (t.name||'').toLowerCase().includes(search)||
           (t.tag||'').toLowerCase().includes(search)||
           (t.cat||'').toLowerCase().includes(search);
  });
  if (catF) tools = tools.filter(function(t){ return (t.cat||'')=== catF; });

  // Stats
  var totalOut = active.length;
  var totalPV  = pending.length;
  var totalIn  = tools.filter(function(t){ return !active.find(function(c){ return c.toolId===t.id; }) && !pending.find(function(c){ return c.toolId===t.id; }); }).length;
  var tagged   = tools.filter(function(t){ return t.tag; }).length;
  var setT = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
  setT('tool-total', tools.length);
  setT('tool-out',   totalOut);
  setT('tool-in',    totalIn);
  setT('tool-pv',    totalPV);
  setT('tool-tags',  tagged);

  // Category filter
  var cats = []; tools.forEach(function(t){ if(t.cat&&!cats.includes(t.cat)) cats.push(t.cat); });
  var cf = document.getElementById('tool-cat-filter');
  if (cf) {
    var prev = cf.value;
    cf.innerHTML = '<option value="">All Categories</option>' + cats.sort().map(function(c){ return '<option value="'+escHtml(c)+'"'+(c===prev?' selected':'')+'>'+escHtml(c)+'</option>'; }).join('');
  }

  // Table
  var tbl = document.getElementById('tool-tbl');
  if (!tbl) return;
  if (!tools.length) { tbl.innerHTML='<tr><td colspan="8" class="empty-state"><p>No tools yet. Click + Add Tool to get started.</p></td></tr>'; return; }

  tbl.innerHTML = tools.map(function(t){
    var co = checkouts.find(function(c){ return c.toolId===t.id && !c.returnedAt; });
    var isPV = co && co.status === 'pending_verify';
    var isOut = co && !isPV;

    // Status badge
    var statusBadge = isPV
      ? '<span class="ts-badge" style="background:#f9a825;color:#333">⏳ Pending Verify</span>'
      : isOut
        ? '<span class="ts-badge ts-break">🔄 Out — '+escHtml(co.toName||'')+'</span>'
        : '<span class="ts-badge ts-in">✓ Available</span>';

    // Photo thumbnail
    var photoHtml = t.photoUrl
      ? photoThumb(t.photoUrl, t.name, 32, 'vertical-align:middle')
      : '<span style="font-size:18px">🔧</span>';

    // Linked groups count
    var lgCount = (t.linkedGroups||[]).length;
    var lgBadge = lgCount > 0
      ? '<span style="background:#e3f2fd;color:#1565c0;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700">'+lgCount+'</span>'
      : '—';

    // Personal tool badge
    var personalBadge = t.ownerType==='personal'
      ? ' <span style="background:#e8eaf6;color:#3949ab;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">👤 '+escHtml(t.ownerId||'Personal')+'</span>'
      : '';

    // Unresolved flags on this tool
    var openFlags = (t.flags||[]).filter(function(f){ return !f.resolved; });
    var flagBadge = openFlags.length > 0
      ? ' <span style="background:#ffebee;color:#c62828;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700" title="'+escHtml(openFlags.map(function(f){return f.item+': '+f.type;}).join(', '))+'">⚠ '+openFlags.length+' FLAG'+(openFlags.length>1?'S':'')+'</span>'
      : '';

    // Action buttons
    var actions = '';
    var isMyPersonalTool = t.ownerType==='personal' && t.ownerId===(_currentUser&&_currentUser.full_name);
    var isPersonalOther  = t.ownerType==='personal' && !isMyPersonalTool;
    if (isPV) {
      actions = '<button class="btn btn-success btn-sm" onclick="verifyToolReturn(\''+co.id+'\')">🔍 Inspect & Verify</button> ';
    } else if (isOut) {
      actions = '<button class="btn btn-success btn-sm" data-action="checkinTool" data-id="'+co.id+'">✓ Return</button> '+
                '<button class="btn btn-sm" style="background:#e65100;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="openTransferModal(\''+t.id+'\')">⇄ Transfer</button> ';
    } else {
      actions = '<button class="btn btn-outline btn-sm" data-action="checkoutTool" data-id="'+t.id+'">Check Out</button> ';
    }
    actions += '<button class="btn btn-outline btn-sm" data-action="editTool" data-id="'+t.id+'">Edit</button> '+
               '<button class="btn btn-danger btn-sm" data-action="delTool" data-id="'+t.id+'">Del</button>';

    return '<tr>'+
      '<td><span class="asset-tag-badge">'+escHtml(t.tag||'—')+'</span></td>'+
      '<td style="display:flex;align-items:center;gap:8px;padding:8px 12px">'+photoHtml+' <div><span style="font-weight:700">'+escHtml(t.name||'')+'</span>'+personalBadge+flagBadge+'</div></td>'+
      '<td style="font-size:12px">'+escHtml(t.cat||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(t.location||'')+'</td>'+
      '<td>'+lgBadge+'</td>'+
      '<td>'+statusBadge+'</td>'+
      '<td style="font-size:12px">'+escHtml(co?co.toName:t.location||'')+'</td>'+
      '<td style="white-space:nowrap">'+actions+'</td>'+
    '</tr>';
  }).join('');

  renderToolCheckouts();
  renderPendingVerifyTab();
  renderToolHistory();
} // end _renderToolsInner

function switchToolTab(tab) {
  document.querySelectorAll('.tool-section').forEach(function(s){ s.classList.remove('active'); });
  document.querySelectorAll('#page-tools .inv-tab').forEach(function(b){ b.classList.remove('active'); });
  var section = document.getElementById('tool-'+tab);
  if (section) section.classList.add('active');
  var tabs = document.querySelectorAll('#page-tools .inv-tab');
  var map = {'assets':0,'checkouts':1,'pendingverify':2,'borrows':3,'history':4};
  var idx = map[tab];
  if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
  if (tab === 'borrows') renderToolLoansTab();
}

function renderToolCheckouts() {
  var tbl = document.getElementById('tool-co-tbl');
  if (!tbl) return;
  var active = getToolCheckouts().filter(function(c){
    return !c.returnedAt && c.status !== 'pending_verify' && c.status !== 'verified';
  });
  if (!active.length) { tbl.innerHTML='<tr><td colspan="7" class="empty-state"><p>No tools currently checked out.</p></td></tr>'; return; }
  var today = new Date().toISOString().split('T')[0];

  tbl.innerHTML = active.map(function(c){
    // Resolve tool — for group split records, use the parent tool
    var tool = (DB.tools||[]).find(function(t){ return t.id===c.toolId; });
    var parentTool = c.isGroupSplit ? (DB.tools||[]).find(function(t){ return t.id===c.splitFromToolId; }) : tool;
    var displayTool = parentTool || tool;
    var overdue = c.expectedReturn && c.expectedReturn < today;

    // Tool photo
    var toolPhotoHtml = (displayTool&&displayTool.photoUrl)
      ? photoThumb(displayTool.photoUrl, (displayTool&&displayTool.name)||'', 48, 'display:block;margin-bottom:4px')
      : '<div style="width:48px;height:48px;background:#e8eaf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:4px">🔧</div>';

    // Tool name display
    var toolNameHtml = c.isGroupSplit
      ? '<span style="font-weight:700;font-size:13px">'+escHtml((displayTool&&displayTool.name)||c.splitFromTool||'Unknown')+'</span>'+
        '<div style="font-size:10px;background:#e3f2fd;color:#1565c0;border-radius:4px;padding:1px 6px;display:inline-block;margin-top:2px">📦 Accessories only (tool with '+escHtml(c.transferredTo||'another tech')+')</div>'
      : '<span style="font-weight:700;font-size:13px">'+escHtml((displayTool&&displayTool.name)||'Unknown')+'</span>'+
        (c.transferredFrom?'<div style="font-size:10px;color:#90a4ae">Transferred from '+escHtml(c.transferredFrom)+'</div>':'');

    // Linked items with photos — pull from parent tool's linkedGroups
    var included = (c.groupsIncluded||[]).filter(function(g){ return g.included; });
    var groupsHtml = '';
    if (included.length > 0) {
      var toolGroups = (displayTool&&displayTool.linkedGroups)||[];
      groupsHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e0e0e0">'+
        '<div style="font-size:10px;font-weight:700;color:#90a4ae;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">'+
        (c.isGroupSplit ? 'Accessories held by this tech:' : 'Items checked out with this tool:')+
        '</div>'+
        included.map(function(g){
          var tg = toolGroups.find(function(x){ return x.id===g.groupId; })||{};
          var ph = tg.photoUrl
            ? photoThumb(tg.photoUrl, g.label, 40)
            : '<div style="width:40px;height:40px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📦</div>';
          var badge = g.mode==='required'
            ? '<span style="background:#c62828;color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700">REQ</span>'
            : '<span style="background:#e65100;color:#fff;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700">OPT</span>';
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f5f5f5">'+
            ph+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:12px;font-weight:700">'+escHtml(g.label)+'</div>'+
              (tg.description?'<div style="font-size:10px;color:#90a4ae">'+escHtml(tg.description)+'</div>':'')+
            '</div>'+
            badge+
          '</div>';
        }).join('')+
      '</div>';
    }

    var assetTag = (displayTool&&displayTool.tag)
      ? '<span class="asset-tag-badge">'+escHtml(displayTool.tag)+'</span>'
      : (c.isGroupSplit ? '<span style="font-size:10px;color:#90a4ae">accessories</span>' : '<span class="asset-tag-badge">—</span>');

    return '<tr>'+
      '<td>'+assetTag+'</td>'+
      '<td>'+toolPhotoHtml+toolNameHtml+groupsHtml+'</td>'+
      '<td>'+escHtml(c.toName||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.jobName||'—')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.date||'')+'</td>'+
      '<td style="font-size:12px;'+(overdue?'color:#c62828;font-weight:700':'')+'">'+escHtml(c.expectedReturn||'—')+(overdue?' ⚠️':'')+'</td>'+
      '<td><button class="btn btn-success btn-sm" data-action="checkinTool" data-id="'+c.id+'">✓ Return</button></td>'+
    '</tr>';
  }).join('');
}

function renderToolHistory() {
  var tbl = document.getElementById('tool-hist-tbl');
  if (!tbl) return;
  var history = getToolCheckouts().slice().reverse().slice(0,100);
  if (!history.length) { tbl.innerHTML='<tr><td colspan="7" class="empty-state"><p>No checkout history yet.</p></td></tr>'; return; }

  tbl.innerHTML = history.map(function(c){
    // Resolve tool — group splits reference parent via splitFromToolId
    var tool = (DB.tools||[]).find(function(t){ return t.id===c.toolId; });
    var parentTool = c.isGroupSplit ? (DB.tools||[]).find(function(t){ return t.id===c.splitFromToolId; }) : tool;
    var displayTool = parentTool || tool;
    var toolGroups = (displayTool&&displayTool.linkedGroups)||[];

    // Status
    var statusBadge = '';
    if (c.status === 'verified') {
      statusBadge = c.discrepancyNote
        ? '<span class="ts-badge" style="background:#ff9800;color:#fff">⚠ Issues</span>'
        : '<span class="ts-badge ts-in">✓ Verified</span>';
    } else if (c.returnedAt) {
      statusBadge = '<span class="ts-badge ts-in">Returned</span>';
    } else {
      statusBadge = '<span class="ts-badge ts-break">Out</span>';
    }

    // Transfer chain note
    var transferNote = '';
    if (c.transferredFrom) transferNote += '<div style="font-size:10px;color:#1565c0">← From: '+escHtml(c.transferredFrom)+'</div>';
    if (c.transferredTo)   transferNote += '<div style="font-size:10px;color:#e65100">→ To: '+escHtml(c.transferredTo)+'</div>';

    // Linked items summary
    var included = (c.groupsIncluded||[]).filter(function(g){ return g.included; });
    var itemsHtml = '';
    if (included.length > 0) {
      itemsHtml = '<div style="margin-top:4px">'+
        included.map(function(g){
          var tg = toolGroups.find(function(x){ return x.id===g.groupId; })||{};
          var ph = tg.photoUrl
            ? photoThumb(tg.photoUrl, g.label, 20)
            : '<span style="font-size:12px">📦</span>';
          // Check inspection result if verified
          var inspResult = '';
          if (c.itemInspection) {
            var insp = c.itemInspection.find(function(x){ return x.id===g.groupId; });
            if (insp && insp.status === 'missing') inspResult = ' <span style="color:#c62828;font-size:9px;font-weight:700">MISSING</span>';
            if (insp && insp.status === 'damaged') inspResult = ' <span style="color:#f57c00;font-size:9px;font-weight:700">DAMAGED</span>';
          }
          return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px;margin-bottom:2px;background:#f5f5f5;border-radius:4px;padding:1px 5px">'+
            ph+
            '<span style="font-size:10px">'+escHtml(g.label)+'</span>'+
            inspResult+
          '</span>';
        }).join('')+
      '</div>';
    }

    // Discrepancy note
    var discrepHtml = c.discrepancyNote
      ? '<div style="font-size:10px;color:#c62828;margin-top:2px">⚠ '+escHtml(c.discrepancyNote)+'</div>'
      : '';

    var toolPhotoHtml = (displayTool&&displayTool.photoUrl)
      ? photoThumb(displayTool.photoUrl, (displayTool&&displayTool.name)||'', 40, 'display:block;margin-bottom:4px;flex-shrink:0')
      : '<div style="width:40px;height:40px;background:#e8eaf6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:4px;flex-shrink:0">🔧</div>';

    var toolLabel = c.isGroupSplit
      ? escHtml((displayTool&&displayTool.name)||c.splitFromTool||'Unknown')+' <span style="font-size:10px;color:#90a4ae">(accessories)</span>'
      : escHtml((displayTool&&displayTool.name)||'Unknown');

    var assetTag = (displayTool&&displayTool.tag)
      ? '<span class="asset-tag-badge">'+escHtml(displayTool.tag)+'</span>'
      : '<span style="font-size:10px;color:#90a4ae">—</span>';

    return '<tr>'+
      '<td>'+assetTag+'</td>'+
      '<td><div style="display:flex;align-items:flex-start;gap:8px">'+toolPhotoHtml+'<div>'+toolLabel+transferNote+itemsHtml+discrepHtml+'</div></div></td>'+
      '<td>'+escHtml(c.toName||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.date||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.returnedAt||'—')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.jobName||'—')+'</td>'+
      '<td>'+statusBadge+'</td>'+
    '</tr>';
  }).join('');
}

// ---- NEW / EDIT / SAVE / DELETE TOOL ----
function newToolItem() {
  var title = document.getElementById('tool-modal-title');
  if (title) title.textContent = 'New Tool / Asset';
  ['tool-name','tool-tag','tool-serial','tool-notes','tool-id','tool-photo-url'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  var costEl=document.getElementById('tool-cost'); if(costEl) costEl.value=0;
  var catEl=document.getElementById('tool-cat'); if(catEl) catEl.value='Power Tools';
  var locEl=document.getElementById('tool-loc'); if(locEl) locEl.value='';
  var pdEl=document.getElementById('tool-purchase-date'); if(pdEl) pdEl.value='';
  var tagEl=document.getElementById('tool-tag'); if(tagEl) tagEl.value=nextAvailableTag();
  var locDl=document.getElementById('tool-loc-list');
  if(locDl) locDl.innerHTML='<option value="Shop"><option value="Warehouse">'+
    (DB.team||[]).map(function(t){return '<option value="'+escHtml(t.name)+'">'; }).join('');
  // Reset ownership
  var companyRadio = document.getElementById('tool-owner-company');
  if (companyRadio) companyRadio.checked = true;
  var ownerRow = document.getElementById('tool-owner-name-row');
  if (ownerRow) ownerRow.style.display = 'none';
  var ownerName = document.getElementById('tool-owner-name');
  if (ownerName) ownerName.value = '';
  var reqPhoto = document.getElementById('tool-require-return-photo');
  if (reqPhoto) reqPhoto.checked = false;
  // Populate owner datalist from team
  var ownerDl = document.getElementById('tool-owner-list');
  if (ownerDl) ownerDl.innerHTML = (DB.team||[]).map(function(t){ return '<option value="'+escHtml(t.name)+'">'; }).join('');
  // Reset photo preview
  var preview=document.getElementById('tool-photo-preview'); if(preview) preview.innerHTML='📷';
  var clr=document.getElementById('tool-photo-clear'); if(clr) clr.style.display='none';
  // Reset linked groups
  window._editingToolGroups=[];
  renderLinkedGroupsEditor();
  openModal('modal-tool-item');
}

function editTool(id) {
  var t=(DB.tools||[]).find(function(x){return x.id==id}); if(!t) return;
  var title=document.getElementById('tool-modal-title'); if(title) title.textContent='Edit Tool';
  function sv(eid,v){var el=document.getElementById(eid);if(el)el.value=v||'';}
  sv('tool-name',t.name); sv('tool-tag',t.tag); sv('tool-cat',t.cat||'Power Tools');
  sv('tool-loc',t.location); sv('tool-cost',t.cost||0); sv('tool-serial',t.serial);
  sv('tool-notes',t.notes); sv('tool-id',t.id);
  var pd=document.getElementById('tool-purchase-date'); if(pd) pd.value=t.purchaseDate||'';
  // Load ownership
  var isPersonal = t.ownerType === 'personal';
  var companyR = document.getElementById('tool-owner-company');
  var personalR = document.getElementById('tool-owner-personal');
  if (companyR) companyR.checked = !isPersonal;
  if (personalR) personalR.checked = isPersonal;
  var ownerRow = document.getElementById('tool-owner-name-row');
  if (ownerRow) ownerRow.style.display = isPersonal ? 'block' : 'none';
  var ownerNameEl = document.getElementById('tool-owner-name');
  if (ownerNameEl) ownerNameEl.value = t.ownerId||'';
  var reqPhotoEl = document.getElementById('tool-require-return-photo');
  if (reqPhotoEl) reqPhotoEl.checked = t.requireReturnPhoto||false;
  var ownerDl = document.getElementById('tool-owner-list');
  if (ownerDl) ownerDl.innerHTML = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  // Load photo
  var urlEl=document.getElementById('tool-photo-url'); if(urlEl) urlEl.value=t.photoUrl||'';
  var preview=document.getElementById('tool-photo-preview');
  if(preview) preview.innerHTML=t.photoUrl?'<img src="'+escHtml(t.photoUrl)+'" style="width:100%;height:100%;object-fit:cover">':'📷';
  var clr=document.getElementById('tool-photo-clear'); if(clr) clr.style.display=t.photoUrl?'block':'none';
  // Load linked groups
  window._editingToolGroups=JSON.parse(JSON.stringify(t.linkedGroups||[]));
  renderLinkedGroupsEditor();
  openModal('modal-tool-item');
}

function saveToolItem() {
  if (typeof hasPermission==='function' && !hasPermission('tool.edit')) { showToast('You do not have permission to add or edit tools','error'); return; }
  var id   = document.getElementById('tool-id').value;
  var name = document.getElementById('tool-name').value.trim();
  if (!name) { showToast('Tool name is required.','error'); return; }
  var tag  = (document.getElementById('tool-tag').value||'').trim();
  // Validate tag format
  if (tag && !/^TCSS -\d+$/.test(tag)) {
    showToast('Asset tag must be in format: TCSS -001','error'); return;
  }
  // Check for duplicate tag
  var dupe = (DB.tools||[]).find(function(t){ return t.tag===tag && t.id!==id; });
  if (dupe) { showToast('Asset tag '+tag+' already assigned to: '+dupe.name,'error'); return; }

  var data = {
    id:           id || Date.now().toString(),
    name:         name,
    tag:          tag,
    cat:          document.getElementById('tool-cat').value||'Other',
    location:     document.getElementById('tool-loc').value||'',
    cost:         parseFloat(document.getElementById('tool-cost').value)||0,
    serial:       document.getElementById('tool-serial').value||'',
    notes:        document.getElementById('tool-notes').value||'',
    purchaseDate: document.getElementById('tool-purchase-date').value||'',
    photoUrl:     (document.getElementById('tool-photo-url')||{}).value||'',
    linkedGroups: window._editingToolGroups||[],
    ownerType:    document.getElementById('tool-owner-personal').checked ? 'personal' : 'company',
    ownerId:      (document.getElementById('tool-owner-name')||{}).value||'',
    requireReturnPhoto: (document.getElementById('tool-require-return-photo')||{}).checked||false,
    personalShareRequests: id ? ((DB.tools||[]).find(function(t){return t.id===id;})||{}).personalShareRequests||[] : [],
    createdAt:    id ? undefined : new Date().toISOString()
  };

  if (!DB.tools) DB.tools=[];
  if (id) {
    var idx=DB.tools.findIndex(function(t){return t.id==id});
    if(idx>=0) DB.tools[idx]=data; else DB.tools.push(data);
  } else {
    DB.tools.push(data);
  }
  saveDB();
  closeModal('modal-tool-item');
  renderTools();
  showToast('Tool saved — '+data.tag, 'success');
}

function delTool(id) {
  var t=(DB.tools||[]).find(function(x){return x.id==id}); if(!t) return;
  var active=(DB.toolCheckouts||[]).find(function(c){ return c.toolId===id && !c.returnedAt; });
  if(active){showToast('Cannot delete — checked out to '+active.toName+'. Return it first.','error');return;}
  if (!confirm('Delete '+t.name+' ('+t.tag+')? This cannot be undone.')) return;
  DB.tools=DB.tools.filter(function(x){return x.id!=id});
  saveDB(); renderTools();
}

// ---- CHECKOUT / CHECKIN ----
function checkoutTool(toolId) {
  if (typeof hasPermission==='function' && !hasPermission('tool.checkout')) { showToast('You do not have permission to check out tools','error'); return; }
  var tool=(DB.tools||[]).find(function(t){return t.id==toolId}); if(!tool) return;
  // Show flag warning if tool has unresolved issues
  var openFlags = (tool.flags||[]).filter(function(f){ return !f.resolved; });
  var flagWarningHtml = '';
  if (openFlags.length > 0) {
    flagWarningHtml = '<div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:8px;padding:10px;margin-bottom:14px">'+
      '<div style="font-weight:700;color:#e65100;font-size:13px">⚠ This tool has '+openFlags.length+' unresolved issue'+(openFlags.length>1?'s':'')+':</div>'+
      '<ul style="margin:4px 0 0 16px;padding:0;font-size:12px;color:#555">'+
      openFlags.map(function(f){
        return '<li><strong>'+escHtml(f.item)+'</strong>: '+escHtml(f.type)+(f.note?' — '+escHtml(f.note):'')+'</li>';
      }).join('')+
      '</ul>'+
      '<div style="font-size:11px;color:#90a4ae;margin-top:4px">Back office can resolve these flags in the tool\'s edit screen.</div>'+
    '</div>';
  }
  var teamOpts = (DB.team||[]).map(function(m){
    return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>';
  }).join('');
  var today = new Date(); var ret = new Date(today); ret.setDate(ret.getDate()+7);
  var retStr = ret.toISOString().split('T')[0];

  // Build linked groups section
  var groupsHtml = '';
  if ((tool.linkedGroups||[]).length > 0) {
    groupsHtml = '<div style="margin-top:14px"><label style="font-size:12px;font-weight:700;color:#546e7a;display:block;margin-bottom:6px">LINKED GROUPS / ADD-ON KITS</label>'+
      '<div style="background:#f8f9fa;border-radius:8px;padding:10px">'+
      tool.linkedGroups.map(function(g){
        var req = g.mode === 'required';
        var badge = req
          ? '<span style="background:#c62828;color:#fff;border-radius:6px;padding:1px 7px;font-size:10px;font-weight:700">REQUIRED</span>'
          : '<span style="background:#e65100;color:#fff;border-radius:6px;padding:1px 7px;font-size:10px;font-weight:700">OPTIONAL</span>';
        var photoHtml = g.photoUrl
          ? photoThumb(g.photoUrl, g.label, 40)
          : '<div style="width:40px;height:40px;background:#e8eaf6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📦</div>';
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e8e8e8">'+
          '<input type="checkbox" id="cog-'+escHtml(g.id)+'"'+(req?' checked disabled':' checked')+' style="width:16px;height:16px;flex-shrink:0">'+
          photoHtml+
          '<div style="flex:1">'+
            '<div style="font-weight:700;font-size:13px">'+escHtml(g.label)+'</div>'+
            (g.description?'<div style="font-size:11px;color:#546e7a">'+escHtml(g.description)+'</div>':'')+
          '</div>'+
          badge+'</div>';
      }).join('')+
      '<p style="font-size:11px;color:#90a4ae;margin-top:6px">Required groups always travel with the tool. Uncheck optional groups to leave them behind.</p>'+
    '</div></div>';
  }

  // Photo header
  var photoHtml = tool.photoUrl
    ? '<img src="'+escHtml(tool.photoUrl)+'" style="width:44px;height:44px;object-fit:cover;border-radius:8px">'
    : '<span style="font-size:28px">🔧</span>';

  // Build and open a simple inline modal using the existing modal system
  // We'll reuse modal-tool-item's body approach but for checkout
  var modalId = 'modal-tool-co-dyn';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'modal-overlay'; div.id = modalId; div.style.display='flex';
  div.innerHTML =
    '<div class="modal-box">'+
      '<div class="modal-head"><h3>Check Out Tool</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        flagWarningHtml+
        '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px;display:flex;align-items:center;gap:10px">'+
          photoHtml+
          '<div><div style="font-weight:800;font-size:15px">'+escHtml(tool.name)+'</div>'+
          '<span class="asset-tag-badge">'+escHtml(tool.tag||'Untagged')+'</span>'+
          ' <span style="font-size:12px;color:#546e7a">'+escHtml(tool.cat||'')+(tool.location?' · '+escHtml(tool.location):'')+'</span></div>'+
        '</div>'+
        '<div class="form-row cols2">'+
          '<div><label>Checked Out To *</label>'+
            '<input id="tool-co-to" list="tool-co-team" placeholder="Technician name">'+
            '<datalist id="tool-co-team">'+teamOpts+'</datalist></div>'+
          '<div><label>Expected Return</label>'+
            '<input id="tool-co-ret" type="date" value="'+retStr+'"></div>'+
        '</div>'+
        '<div style="margin-top:10px"><label>Job / Purpose</label><input id="tool-co-job" placeholder="Job name or purpose (optional)"></div>'+
        groupsHtml+
      '</div>'+
      '<div class="modal-foot">'+
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
        '<button class="btn btn-success" onclick="saveCheckoutModal(\''+toolId+'\',\''+modalId+'\')">✓ Check Out</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}

function saveCheckoutModal(toolId, modalId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id==toolId; }); if(!tool) return;
  var toName = (document.getElementById('tool-co-to')||{}).value||'';
  if (!toName.trim()) { showToast('Please enter who is checking this out','error'); return; }
  var groupsIncluded = (tool.linkedGroups||[]).map(function(g){
    var cb = document.getElementById('cog-'+g.id);
    return { groupId:g.id, label:g.label, included: g.mode==='required'||(cb&&cb.checked), mode:g.mode };
  });
  if (!DB.toolCheckouts) DB.toolCheckouts=[];
  DB.toolCheckouts.push({
    id:             Date.now().toString(),
    toolId:         toolId,
    toName:         toName.trim(),
    jobName:        (document.getElementById('tool-co-job')||{}).value||'',
    date:           new Date().toISOString().split('T')[0],
    expectedReturn: (document.getElementById('tool-co-ret')||{}).value||'',
    returnedAt:     null,
    status:         'checked_out',
    groupsIncluded: groupsIncluded
  });
  saveDB();
  var m = document.getElementById(modalId); if(m) m.remove();
  renderTools();
  showToast((tool.tag||tool.name)+' checked out to '+toName.trim(),'success');
}

function checkinTool(checkoutId) {
  var co=(DB.toolCheckouts||[]).find(function(c){return c.id==checkoutId}); if(!co) return;
  var tool=(DB.tools||[]).find(function(t){return t.id==co.toolId});
  var toolName = tool ? tool.name : 'tool';
  var toolTag  = tool ? (tool.tag||'Untagged') : '';

  // Build dynamic return modal
  var modalId = 'modal-tool-ret-dyn';
  var existing = document.getElementById(modalId); if(existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'modal-overlay'; div.id = modalId; div.style.display = 'flex';
  div.innerHTML =
    '<div class="modal-box">'+
      '<div class="modal-head"><h3>Return Tool</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px">'+
          '<div style="font-weight:800;font-size:15px">'+escHtml(toolName)+'</div>'+
          '<span class="asset-tag-badge">'+escHtml(toolTag)+'</span>'+
          ' <span style="font-size:12px;color:#546e7a">Currently assigned to '+escHtml(co.toName||'')+'.</span>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+
          '<div id="ret-opt-now" onclick="selectReturnOpt(\'now\')" style="border:2px solid #1565c0;background:#e3f2fd;border-radius:10px;padding:14px;cursor:pointer">'+
            '<div style="font-weight:800;font-size:14px;color:#1565c0">Verify Now</div>'+
            '<div style="font-size:11px;color:#546e7a;margin-top:4px">Office verifies immediately and closes the custody record.</div>'+
          '</div>'+
          '<div id="ret-opt-later" onclick="selectReturnOpt(\'later\')" style="border:2px solid #e0e0e0;border-radius:10px;padding:14px;cursor:pointer">'+
            '<div style="font-weight:800;font-size:14px">Verify Later</div>'+
            '<div style="font-size:11px;color:#546e7a;margin-top:4px">Submit return now, move to Pending Verify for office review.</div>'+
          '</div>'+
        '</div>'+
        '<div id="ret-now-fields">'+
          '<label>Verifier Name *</label>'+
          '<input id="ret-verifier" value="'+((_currentUser&&_currentUser.full_name)||'')+'">'+
        '</div>'+
        '<div id="ret-later-fields" style="display:none">'+
          '<label>Submitted By *</label><input id="ret-submitter" placeholder="Person dropping it off">'+
          '<div style="margin-top:10px"><label>Drop-Off Location / Note</label>'+
          '<input id="ret-dropoff" placeholder="Front office / shop shelf"></div>'+
        '</div>'+
        '<input type="hidden" id="ret-co-id" value="'+escHtml(checkoutId)+'">'+
        '<input type="hidden" id="ret-opt" value="now">'+
      '</div>'+
      '<div class="modal-foot">'+
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
        '<button class="btn btn-success" onclick="confirmReturn(\''+modalId+'\')">Confirm Return</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}

function selectReturnOpt(opt) {
  document.getElementById('ret-opt').value = opt;
  var nowCard = document.getElementById('ret-opt-now');
  var latCard = document.getElementById('ret-opt-later');
  var nowF    = document.getElementById('ret-now-fields');
  var latF    = document.getElementById('ret-later-fields');
  if (opt === 'now') {
    nowCard.style.border='2px solid #1565c0'; nowCard.style.background='#e3f2fd';
    latCard.style.border='2px solid #e0e0e0'; latCard.style.background='';
    nowF.style.display='block'; latF.style.display='none';
  } else {
    latCard.style.border='2px solid #1565c0'; latCard.style.background='#e3f2fd';
    nowCard.style.border='2px solid #e0e0e0'; nowCard.style.background='';
    nowF.style.display='none'; latF.style.display='block';
  }
}

function confirmReturn(modalId) {
  var coId = (document.getElementById('ret-co-id')||{}).value||'';
  var opt  = (document.getElementById('ret-opt')||{}).value||'now';
  var co   = (DB.toolCheckouts||[]).find(function(c){ return c.id===coId; }); if(!co) return;
  var tool = (DB.tools||[]).find(function(t){ return t.id===co.toolId; });
  var now  = new Date().toISOString().split('T')[0];

  if (opt === 'now') {
    // Close this modal and open the full per-item inspection
    // Mark as pending_verify temporarily so verifyToolReturn can find it
    co.status            = 'pending_verify';
    co.returnedAt        = now;
    co.returnSubmittedAt = now;
    co.returnSubmittedBy = (document.getElementById('ret-verifier')||{}).value||(_currentUser&&_currentUser.full_name)||'Office';
    co.dropoffLocation   = 'Direct verify';
    saveDB();
    var m = document.getElementById(modalId); if(m) m.remove();
    // Open inspection modal immediately
    verifyToolReturn(coId);
  } else {
    var submitter = ((document.getElementById('ret-submitter')||{}).value||'').trim();
    if (!submitter) { showToast('Please enter who is dropping it off','error'); return; }
    co.returnedAt         = now;
    co.status             = 'pending_verify';
    co.returnSubmittedAt  = now;
    co.returnSubmittedBy  = submitter;
    co.dropoffLocation    = (document.getElementById('ret-dropoff')||{}).value||'';
    showToast((tool&&tool.tag||'Tool')+' return submitted — pending verification','info');
    saveDB();
    var m = document.getElementById(modalId); if(m) m.remove();
    renderTools();
  }
}

// ---- TRANSFER ----
function openTransferModal(toolId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id==toolId; }); if(!tool) return;
  var co   = (DB.toolCheckouts||[]).find(function(c){ return c.toolId===toolId && !c.returnedAt && c.status !== 'pending_verify'; }); if(!co) return;
  var teamOpts = (DB.team||[]).map(function(m){
    return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>';
  }).join('');
  var groupsHtml = '';
  if ((co.groupsIncluded||[]).filter(function(g){return g.included;}).length > 0) {
    groupsHtml = '<div style="margin-top:12px"><label style="font-size:12px;font-weight:700;color:#546e7a">WHICH PIECES TRAVEL WITH THIS TRANSFER?</label>'+
      '<div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-top:6px">'+
      co.groupsIncluded.filter(function(g){return g.included;}).map(function(g){
        var req = g.mode === 'required';
        return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0">'+
          '<input type="checkbox" id="trg-'+escHtml(g.groupId)+'"'+(req?' checked disabled':' checked')+' style="width:15px;height:15px">'+
          '<span style="font-weight:600;font-size:13px;flex:1">'+escHtml(g.label)+'</span>'+
          (req?'<span style="background:#c62828;color:#fff;border-radius:6px;padding:1px 6px;font-size:10px">REQUIRED</span>':
               '<span style="background:#e65100;color:#fff;border-radius:6px;padding:1px 6px;font-size:10px">OPTIONAL</span>')+
        '</div>';
      }).join('')+'</div></div>';
  }
  var modalId = 'modal-tool-tr-dyn';
  var existing = document.getElementById(modalId); if(existing) existing.remove();
  var div = document.createElement('div');
  div.className = 'modal-overlay'; div.id = modalId; div.style.display='flex';
  div.innerHTML =
    '<div class="modal-box">'+
      '<div class="modal-head"><h3>Transfer Tool</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px">'+
          '<div style="font-weight:800">'+escHtml(tool.name)+'</div>'+
          '<span class="asset-tag-badge">'+escHtml(tool.tag||'Untagged')+'</span>'+
          ' <span style="font-size:12px;color:#546e7a">Currently with: '+escHtml(co.toName||'')+'</span>'+
        '</div>'+
        '<label>Transfer To *</label>'+
        '<input id="tr-to" list="tr-team" placeholder="Receiving technician">'+
        '<datalist id="tr-team">'+teamOpts+'</datalist>'+
        '<div style="margin-top:10px"><label>Reason / Note</label>'+
        '<input id="tr-note" placeholder="Field handoff, job change..."></div>'+
        groupsHtml+
        '<input type="hidden" id="tr-tool-id" value="'+escHtml(toolId)+'">'+
        '<input type="hidden" id="tr-co-id" value="'+escHtml(co.id)+'">'+
      '</div>'+
      '<div class="modal-foot">'+
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
        '<button class="btn btn-primary" onclick="confirmTransfer(\''+modalId+'\')">Send Transfer</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);
}

function confirmTransfer(modalId) {
  if (typeof hasPermission==='function' && !hasPermission('tool.transfer')) { showToast('You do not have permission to transfer tools','error'); return; }
  var toolId = (document.getElementById('tr-tool-id')||{}).value||'';
  var coId   = (document.getElementById('tr-co-id')||{}).value||'';
  var toName = ((document.getElementById('tr-to')||{}).value||'').trim();
  if (!toName) { showToast('Please enter who is receiving this tool','error'); return; }
  var co   = (DB.toolCheckouts||[]).find(function(c){ return c.id===coId; }); if(!co) return;
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; });
  var now  = new Date().toISOString().split('T')[0];

  // Determine which groups travel and which stay
  var travelGroups = [];
  var stayGroups   = [];
  (co.groupsIncluded||[]).filter(function(g){ return g.included; }).forEach(function(g){
    var cb = document.getElementById('trg-'+g.groupId);
    var travels = g.mode==='required' || (cb&&cb.checked);
    if (travels) {
      travelGroups.push({ groupId:g.groupId, label:g.label, included:true, mode:g.mode });
    } else {
      stayGroups.push({ groupId:g.groupId, label:g.label, included:true, mode:g.mode });
    }
  });

  // Close current checkout for the tool
  // Update groupsIncluded to only the items that traveled — history accurately shows what left with the tool
  co.returnedAt      = now;
  co.status          = 'verified';
  co.transferredTo   = toName;
  co.groupsIncluded  = travelGroups.map(function(g){ return Object.assign({}, g, {included:true}); });

  // New checkout for receiver — only groups that traveled
  DB.toolCheckouts.push({
    id:              Date.now().toString(),
    toolId:          toolId,
    toName:          toName,
    jobName:         co.jobName||'',
    date:            now,
    expectedReturn:  co.expectedReturn||'',
    notes:           (document.getElementById('tr-note')||{}).value||'',
    status:          'checked_out',
    returnedAt:      null,
    groupsIncluded:  travelGroups,
    transferredFrom: co.toName||''
  });

  // If any optional groups stayed behind, create a separate custody record for original holder
  if (stayGroups.length > 0) {
    DB.toolCheckouts.push({
      id:              (Date.now()+1).toString(),
      toolId:          toolId + '_groups',  // virtual — groups only, not the parent tool
      toName:          co.toName||'',
      jobName:         co.jobName||'',
      date:            now,
      expectedReturn:  co.expectedReturn||'',
      notes:           'Group split from transfer to '+toName+' — these items remain with '+co.toName,
      status:          'checked_out',
      returnedAt:      null,
      groupsIncluded:  stayGroups,
      isGroupSplit:    true,
      splitFromToolId: toolId,
      splitFromTool:   tool ? (tool.name||'') : ''
    });
    showToast((tool&&tool.tag||'Tool')+' transferred to '+toName+'. '+stayGroups.length+' item(s) remain with '+co.toName,'info',4000);
  } else {
    showToast((tool&&tool.tag||'Tool')+' transferred to '+toName,'success');
  }

  saveDB();
  var m = document.getElementById(modalId); if(m) m.remove();
  renderTools();
}

// ---- PENDING VERIFY TAB ----
function renderPendingVerifyTab() {
  var tbl = document.getElementById('tool-pv-tbl'); if(!tbl) return;
  var pending = getToolCheckouts().filter(function(c){ return c.status === 'pending_verify'; });
  if (!pending.length) { tbl.innerHTML='<tr><td colspan="6" class="empty-state"><p>No returns pending verification.</p></td></tr>'; return; }
  tbl.innerHTML = pending.map(function(c){
    var tool = (DB.tools||[]).find(function(t){ return t.id===c.toolId; });
    var toolPhotoHtml = (tool&&tool.photoUrl)
      ? photoThumb(tool.photoUrl, (tool&&tool.name)||'', 36, 'vertical-align:middle;margin-right:6px')
      : '<span style="font-size:20px;margin-right:6px">🔧</span>';
    // Show flags if tool has outstanding issues
    var flagHtml = '';
    if (tool&&tool.flags&&tool.flags.filter(function(f){return !f.resolved;}).length > 0) {
      flagHtml = ' <span style="background:#ffebee;color:#c62828;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">⚠ FLAGS</span>';
    }
    return '<tr>'+
      '<td><span class="asset-tag-badge">'+escHtml((tool&&tool.tag)||'—')+'</span></td>'+
      '<td>'+toolPhotoHtml+'<span style="font-weight:700">'+escHtml((tool&&tool.name)||'Unknown')+'</span>'+flagHtml+'</td>'+
      '<td>'+escHtml(c.returnSubmittedBy||c.toName||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.returnSubmittedAt||c.returnedAt||'')+'</td>'+
      '<td style="font-size:12px">'+escHtml(c.dropoffLocation||'—')+'</td>'+
      '<td>'+
        '<button class="btn btn-success btn-sm" onclick="verifyToolReturn(\''+c.id+'\')">🔍 Inspect & Verify</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}

function verifyToolReturn(coId) {
  if (typeof hasPermission==='function' && !hasPermission('tool.inspect')) { showToast('You do not have permission to inspect returned tools','error'); return; }
  var co = (DB.toolCheckouts||[]).find(function(c){ return c.id===coId; }); if(!co) return;
  var tool = (DB.tools||[]).find(function(t){ return t.id===co.toolId; });
  var included = (co.groupsIncluded||[]).filter(function(g){ return g.included; });
  var toolGroups = (tool&&tool.linkedGroups)||[];

  // Tool's own photo header
  var toolPhotoHtml = (tool&&tool.photoUrl)
    ? photoThumb(tool.photoUrl, (tool&&tool.name)||'', 64)
    : '<div style="width:64px;height:64px;background:#e8eaf6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0">🔧</div>';

  // Build per-item inspection cards
  // Each item (parent tool + each linked group) gets a card with large photo and 3-state status
  var allItems = [];

  // Parent tool is first item to inspect
  allItems.push({
    id:          'parent',
    label:       (tool&&tool.name)||'Tool',
    description: (tool&&tool.tag)||'',
    photoUrl:    (tool&&tool.photoUrl)||'',
    mode:        'required',
    isParent:    true
  });

  // Then linked groups
  included.forEach(function(g){
    var tg = toolGroups.find(function(x){ return x.id===g.groupId; })||{};
    allItems.push({
      id:          g.groupId,
      label:       g.label,
      description: tg.description||'',
      photoUrl:    tg.photoUrl||'',
      mode:        g.mode,
      isParent:    false
    });
  });

  var itemCardsHtml = allItems.map(function(item){
    var photoHtml = item.photoUrl
      ? photoThumb(item.photoUrl, item.label, 72, 'display:block')
      : '<div style="width:72px;height:72px;background:#e8eaf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0">'+(item.isParent?'🔧':'📦')+'</div>';

    var reqBadge = item.mode==='required'
      ? '<span style="background:#c62828;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">REQUIRED</span>'
      : '<span style="background:#e65100;color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">OPTIONAL</span>';

    return '<div style="background:#fff;border:2px solid #e0e0e0;border-radius:10px;padding:12px;margin-bottom:10px" id="vrf-card-'+escHtml(item.id)+'">'+
      '<div style="display:flex;gap:12px;align-items:flex-start">'+
        photoHtml+
        '<div style="flex:1">'+
          '<div style="font-weight:800;font-size:14px">'+escHtml(item.label)+'</div>'+
          (item.description?'<div style="font-size:11px;color:#546e7a;margin-top:2px">'+escHtml(item.description)+'</div>':'')+
          '<div style="margin-top:4px">'+reqBadge+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">'+
        '<button onclick="setItemStatus(\''+escHtml(item.id)+'\',\'present\')" id="vrf-btn-present-'+escHtml(item.id)+'" '+
          'style="padding:8px 4px;border:2px solid #2e7d32;background:#e8f5e9;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;color:#2e7d32">'+
          '✓ Present</button>'+
        '<button onclick="setItemStatus(\''+escHtml(item.id)+'\',\'damaged\')" id="vrf-btn-damaged-'+escHtml(item.id)+'" '+
          'style="padding:8px 4px;border:2px solid #e0e0e0;background:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;color:#555">'+
          '⚠ Damaged</button>'+
        '<button onclick="setItemStatus(\''+escHtml(item.id)+'\',\'missing\')" id="vrf-btn-missing-'+escHtml(item.id)+'" '+
          'style="padding:8px 4px;border:2px solid #e0e0e0;background:#fff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700;color:#555">'+
          '✗ Missing</button>'+
      '</div>'+
      '<div id="vrf-note-'+escHtml(item.id)+'" style="display:none;margin-top:8px">'+
        '<input placeholder="Describe damage or note where item was left..." style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #e0e0e0;border-radius:6px;font-size:12px" id="vrf-note-text-'+escHtml(item.id)+'">'+
      '</div>'+
    '</div>';
  }).join('');

  var modalId = 'modal-tool-vrf-dyn';
  var existing = document.getElementById(modalId); if(existing) existing.remove();
  var div = document.createElement('div');
  div.className='modal-overlay'; div.id=modalId; div.style.display='flex';
  div.innerHTML =
    '<div class="modal-box" style="max-width:560px">'+
      '<div class="modal-head"><h3>Verify Return — Inspect All Items</h3>'+
        '<button class="close-btn" onclick="document.getElementById(\''+modalId+'\').remove()">×</button></div>'+
      '<div class="modal-body">'+
        '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px;display:flex;align-items:center;gap:12px">'+
          toolPhotoHtml+
          '<div>'+
            '<div style="font-weight:800;font-size:15px">'+escHtml(tool&&tool.name||'Tool')+'</div>'+
            '<span class="asset-tag-badge">'+escHtml(tool&&tool.tag||'—')+'</span>'+
            '<div style="font-size:12px;color:#546e7a;margin-top:2px">Returned by <strong>'+escHtml(co.returnSubmittedBy||co.toName||'')+'</strong></div>'+
            (co.dropoffLocation?'<div style="font-size:11px;color:#546e7a">Drop-off: '+escHtml(co.dropoffLocation)+'</div>':'')+
            (co.isPersonalBorrow?'<div style="font-size:11px;background:#fff3e0;border-radius:4px;padding:3px 8px;margin-top:4px;color:#e65100">👤 Personal tool on loan — owner: <strong>'+escHtml(co.ownerName||'')+'</strong>. Borrowing tech is responsible for any damage.</div>':'')+
          '</div>'+
        '</div>'+
        '<div style="font-size:12px;color:#546e7a;margin-bottom:10px;font-weight:600">Tap each item\'s photo to enlarge. Mark each item as Present, Damaged, or Missing:</div>'+
        itemCardsHtml+
        '<input type="hidden" id="vrf-co-id" value="'+escHtml(coId)+'">'+
        '<input type="hidden" id="vrf-items-json" value="'+escHtml(JSON.stringify(allItems.map(function(i){return {id:i.id,label:i.label,status:'present'};})))+'">'+
      '</div>'+
      '<div class="modal-foot">'+
        '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\''+modalId+'\').remove()">Cancel</button>'+
        '<button class="btn btn-success" onclick="confirmVerifyReturn(\''+modalId+'\')">Complete Verification</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(div);

  // Default all to "present" on open
  allItems.forEach(function(item){ setItemStatus(item.id,'present'); });
}

function setItemStatus(itemId, status) {
  // Update button styles
  var states = ['present','damaged','missing'];
  var colors = {present:'#2e7d32', damaged:'#f57c00', missing:'#c62828'};
  var bgs    = {present:'#e8f5e9', damaged:'#fff3e0', missing:'#ffebee'};
  var labels = {present:'✓ Present', damaged:'⚠ Damaged', missing:'✗ Missing'};
  states.forEach(function(s){
    var btn = document.getElementById('vrf-btn-'+s+'-'+itemId);
    if (!btn) return;
    if (s === status) {
      btn.style.border = '2px solid '+colors[status];
      btn.style.background = bgs[status];
      btn.style.color = colors[status];
    } else {
      btn.style.border = '2px solid #e0e0e0';
      btn.style.background = '#fff';
      btn.style.color = '#555';
    }
  });
  // Show/hide note field
  var noteDiv = document.getElementById('vrf-note-'+itemId);
  if (noteDiv) noteDiv.style.display = (status==='damaged'||status==='missing') ? 'block' : 'none';
  // Update card border
  var card = document.getElementById('vrf-card-'+itemId);
  if (card) {
    card.style.border = status==='present' ? '2px solid #c8e6c9' :
                        status==='damaged' ? '2px solid #ffcc02' :
                        '2px solid #ffcdd2';
  }
  // Store in hidden field
  var hiddenEl = document.getElementById('vrf-items-json');
  if (hiddenEl) {
    try {
      var items = JSON.parse(hiddenEl.value);
      var item = items.find(function(i){ return i.id===itemId; });
      if (item) item.status = status;
      hiddenEl.value = JSON.stringify(items);
    } catch(e){}
  }
}

function confirmVerifyReturn(modalId) {
  var coId = (document.getElementById('vrf-co-id')||{}).value||'';
  var co   = (DB.toolCheckouts||[]).find(function(c){ return c.id===coId; }); if(!co) return;
  var tool = (DB.tools||[]).find(function(t){ return t.id===co.toolId; });
  var now  = new Date().toISOString().split('T')[0];

  // Read inspection results
  var items = [];
  try { items = JSON.parse((document.getElementById('vrf-items-json')||{}).value||'[]'); } catch(e){}

  // Collect notes for non-present items
  var issues = [];
  items.forEach(function(item){
    if (item.status !== 'present') {
      var noteEl = document.getElementById('vrf-note-text-'+item.id);
      var note = noteEl ? noteEl.value.trim() : '';
      issues.push({ id:item.id, label:item.label, status:item.status, note:note });
    }
  });

  co.status     = 'verified';
  co.verifiedAt = now;
  co.verifiedBy = (_currentUser&&_currentUser.full_name)||'Office';
  co.itemInspection = items;

  if (issues.length > 0) {
    co.discrepancyNote = issues.map(function(i){
      return i.label+': '+i.status+(i.note?' ('+i.note+')':'');
    }).join(' | ');

    // Flag the tool with any issues so next checkout shows the warning
    if (tool) {
      if (!tool.flags) tool.flags = [];
      issues.forEach(function(issue){
        tool.flags.push({
          date:    now,
          type:    issue.status,  // 'damaged' or 'missing'
          item:    issue.label,
          note:    issue.note,
          coId:    coId,
          holder:  co.toName||'',
          resolved:false
        });
      });
    }
  }

  saveDB();
  var m = document.getElementById(modalId); if(m) m.remove();
  renderTools();

  if (issues.length > 0) {
    showToast('Return verified with issues — '+issues.length+' item(s) flagged','warning',5000);
  } else {
    showToast((tool&&tool.tag||'Tool')+' return verified — all items present ✓','success');
  }
}

// ---- PHOTO VIEWER ----
// Photo cache — stores base64 URLs by key so onclick attrs don't embed huge strings
var _photoCache = {};
function cachePhoto(key, url) { _photoCache[key] = url; return key; }
function viewPhotoById(key, caption) { if(_photoCache[key]) viewPhoto(_photoCache[key], caption); }

// Build a safe photo thumbnail — uses data attributes to avoid base64 in onclick
function photoThumb(url, caption, size, extraStyle) {
  if (!url) return '';
  var key = 'p' + Math.random().toString(36).substr(2,8);
  _photoCache[key] = url;
  var s = size || 40;
  return '<img src="'+escHtml(url)+'" '+
    'style="width:'+s+'px;height:'+s+'px;object-fit:cover;border-radius:'+(s>50?'10':'6')+'px;cursor:pointer;flex-shrink:0'+(extraStyle?';'+extraStyle:'')+'" '+
    'data-photo-key="'+key+'" data-photo-caption="'+escHtml(caption||'')+'" '+
    'title="Tap to enlarge">';
}

function viewPhoto(url, caption) {
  var existing = document.getElementById('photo-viewer-overlay');
  if (existing) existing.remove();
  var div = document.createElement('div');
  div.id = 'photo-viewer-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer';
  div.onclick = function(){ div.remove(); };
  div.innerHTML =
    '<img src="'+escHtml(url)+'" style="max-width:90vw;max-height:80vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)">'+
    (caption?'<div style="color:#fff;font-size:13px;margin-top:12px;text-align:center;max-width:80vw">'+escHtml(caption)+'</div>':'')+
    '<div style="color:rgba(255,255,255,.5);font-size:11px;margin-top:8px">Tap anywhere to close</div>';
  document.body.appendChild(div);
}

// ---- PHOTO HANDLERS ----
function onToolPhotoSelected(input) {
  var file = input.files[0]; if(!file) return;
  if (file.size > 5*1024*1024) { showToast('Photo must be under 5MB','error'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var url = e.target.result;
    document.getElementById('tool-photo-url').value = url;
    var preview = document.getElementById('tool-photo-preview');
    if (preview) preview.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover">';
    var clr = document.getElementById('tool-photo-clear'); if(clr) clr.style.display='block';
  };
  reader.readAsDataURL(file);
}

function clearToolPhoto() {
  document.getElementById('tool-photo-url').value = '';
  var preview = document.getElementById('tool-photo-preview'); if(preview) preview.innerHTML='📷';
  var clr = document.getElementById('tool-photo-clear'); if(clr) clr.style.display='none';
  var inp = document.getElementById('tool-photo-input'); if(inp) inp.value='';
}

// ---- LINKED GROUPS EDITOR ----
window._editingToolGroups = [];

function renderLinkedGroupsEditor() {
  var container = document.getElementById('linked-groups-editor'); if(!container) return;
  var groups = window._editingToolGroups || [];
  if (!groups.length) { container.innerHTML='<div style="color:#90a4ae;font-size:13px;padding:8px 0">No linked groups yet.</div>'; return; }
  container.innerHTML = groups.map(function(g,i){
    var groupThumbHtml = g.photoUrl
      ? photoThumb(g.photoUrl, g.label, 32)
      : '<div onclick="addGroupPhoto('+i+')" style="width:32px;height:32px;background:#e8eaf6;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer" title="Add photo">📷</div>';
    return '<div style="background:#f8f9fa;border-radius:8px;padding:10px;margin-bottom:6px;display:flex;align-items:center;gap:10px">'+
      groupThumbHtml+
      '<div style="flex:1">'+
        '<div style="font-weight:700;font-size:13px">'+escHtml(g.label)+'</div>'+
        (g.description?'<div style="font-size:11px;color:#546e7a">'+escHtml(g.description)+'</div>':'')+
      '</div>'+
      '<select onchange="updateGroupMode('+i+',this.value)" style="font-size:11px;padding:2px 6px;border:1px solid #e0e0e0;border-radius:6px">'+
        '<option value="optional"'+(g.mode==='optional'?' selected':'')+'>Optional</option>'+
        '<option value="required"'+(g.mode==='required'?' selected':'')+'>Required</option>'+
      '</select>'+
      '<button onclick="removeLinkedGroup('+i+')" style="background:#ffebee;border:none;color:#c62828;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:13px">×</button>'+
    '</div>';
  }).join('');
}

function addLinkedGroup() {
  var label = prompt('Accessory / group name:',''); if(!label||!label.trim()) return;
  var desc  = prompt('Description (optional, e.g. "Should contain 2 items"):','')||'';
  var newGroup = { id:'g'+Date.now(), label:label.trim(), description:desc.trim(), mode:'optional', photoUrl:'' };
  if (!window._editingToolGroups) window._editingToolGroups=[];
  window._editingToolGroups.push(newGroup);
  renderLinkedGroupsEditor();
  // Offer photo upload after adding
  if (confirm('Add a photo for "'+label.trim()+'"? (Recommended — helps techs identify the item in the field)')) {
    var inp = document.createElement('input');
    inp.type='file'; inp.accept='image/*';
    inp.onchange = function() {
      var file = inp.files[0]; if(!file) return;
      if(file.size > 5*1024*1024){showToast('Photo must be under 5MB','error');return;}
      var reader = new FileReader();
      reader.onload = function(e){
        newGroup.photoUrl = e.target.result;
        renderLinkedGroupsEditor();
        showToast('Photo added for '+label.trim(),'success');
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  }
}

function addGroupPhoto(idx) {
  var inp = document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  inp.onchange = function() {
    var file = inp.files[0]; if(!file) return;
    if(file.size > 5*1024*1024){showToast('Photo must be under 5MB','error');return;}
    var reader = new FileReader();
    reader.onload = function(e){
      if(window._editingToolGroups&&window._editingToolGroups[idx]){
        window._editingToolGroups[idx].photoUrl = e.target.result;
        renderLinkedGroupsEditor();
        showToast('Photo added','success');
      }
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

function removeLinkedGroup(idx) {
  if (window._editingToolGroups) window._editingToolGroups.splice(idx,1);
  renderLinkedGroupsEditor();
}

function updateGroupMode(idx,mode) {
  if (window._editingToolGroups&&window._editingToolGroups[idx]) window._editingToolGroups[idx].mode=mode;
}

function onOwnerTypeChange() {
  var isPersonal = document.getElementById('tool-owner-personal').checked;
  var row = document.getElementById('tool-owner-name-row');
  if (row) row.style.display = isPersonal ? 'block' : 'none';
}

// ---- TOOL LOAN SYSTEM ----
// Two entry points:
// A) Post a Need — tech asks team if anyone has a tool
// B) Offer a Loan — lender initiates, recipient accepts and takes responsibility
// Both end at the same loan record with photo, accountability, and return tracking.

// DB.toolLoans = [{
//   id, type ('need'|'offer'),
//   status ('open'|'offered'|'accepted'|'active'|'returned'|'cancelled'),
//   postedBy, postedAt,
//   itemDescription, whenNeeded, jobName,
//   offeredBy, offeredAt, offeredToolId, offeredToolName, offeredPhotoUrl,
//   recipientName, acceptedAt, expectedReturn,
//   checkoutId (once accepted → creates a checkout record),
//   declinedBy, declineReason
// }]

function getToolLoans() { return DB.toolLoans || []; }

function renderToolLoansTab() {
  var container = document.getElementById('tool-loans-list');
  if (!container) return;
  var loans = getToolLoans().slice().reverse();
  if (!loans.length) {
    container.innerHTML =
      '<div style="text-align:center;padding:32px;color:#90a4ae">'+
        '<div style="font-size:40px;margin-bottom:8px">🤝</div>'+
        '<div style="font-weight:700;margin-bottom:4px">No active loans</div>'+
        '<div style="font-size:12px">Use <strong>Post a Need</strong> to ask the team, or <strong>Offer a Loan</strong> to send one directly.</div>'+
      '</div>';
    return;
  }

  var active   = loans.filter(function(l){ return l.status==='open'||l.status==='offered'||l.status==='accepted'||l.status==='active'; });
  var finished = loans.filter(function(l){ return l.status==='returned'||l.status==='cancelled'; });

  function renderLoan(l) {
    var isNeed  = l.type === 'need';
    var typeTag = isNeed
      ? '<span style="background:#e3f2fd;color:#1565c0;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">📢 NEED</span>'
      : '<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">🤝 OFFER</span>';

    var statusBadge = {
      open:      '<span style="background:#ff9800;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Open</span>',
      offered:   '<span style="background:#1565c0;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Offer Sent</span>',
      accepted:  '<span style="background:#2e7d32;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Accepted</span>',
      active:    '<span style="background:#2e7d32;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">🔄 Out on Loan</span>',
      returned:  '<span style="background:#546e7a;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Returned</span>',
      cancelled: '<span style="background:#546e7a;color:#fff;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Cancelled</span>'
    }[l.status] || '';

    // Photo
    var photoHtml = l.offeredPhotoUrl
      ? photoThumb(l.offeredPhotoUrl, l.offeredToolName||l.itemDescription, 48)
      : '<div style="width:48px;height:48px;background:#e8eaf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🔧</div>';

    // Main description
    var desc = isNeed
      ? '<strong>'+escHtml(l.postedBy||'')+'</strong> needs a <strong>'+escHtml(l.itemDescription||'')+'</strong>'
      : '<strong>'+escHtml(l.offeredBy||'')+'</strong> is offering to loan a <strong>'+escHtml(l.offeredToolName||l.itemDescription||'')+'</strong> to <strong>'+escHtml(l.recipientName||'')+'</strong>';

    var meta = [];
    if (l.whenNeeded)    meta.push('📅 '+l.whenNeeded);
    if (l.jobName)       meta.push('📍 '+l.jobName);
    if (l.expectedReturn) meta.push('Return by: '+l.expectedReturn);
    if (l.offeredBy && isNeed && l.status==='offered') meta.push('Offer from: '+l.offeredBy);

    // Actions
    var actions = '';
    var myName = _currentUser && _currentUser.full_name;
    if (l.status === 'open' && !isNeed) {
      // Recipient hasn't accepted yet
      if (l.recipientName === myName) {
        actions = '<button class="btn btn-success btn-sm" onclick="openAcceptLoanModal(\''+l.id+'\')">✓ Accept & Take Responsibility</button> '+
                  '<button class="btn btn-outline btn-sm" onclick="declineLoan(\''+l.id+'\')">Decline</button>';
      }
    } else if (l.status === 'open' && isNeed) {
      // Anyone can offer
      actions = '<button class="btn btn-primary btn-sm" onclick="openOfferOnNeedModal(\''+l.id+'\')">🤝 Offer My Tool</button>';
      if (l.postedBy === myName) {
        actions += ' <button class="btn btn-outline btn-sm" onclick="cancelLoan(\''+l.id+'\')">Cancel Need</button>';
      }
    } else if (l.status === 'offered' && isNeed) {
      // Need has an offer — poster accepts or declines
      if (l.postedBy === myName) {
        actions = '<button class="btn btn-success btn-sm" onclick="openAcceptLoanModal(\''+l.id+'\')">✓ Accept Offer</button> '+
                  '<button class="btn btn-outline btn-sm" onclick="declineLoan(\''+l.id+'\')">Decline Offer</button>';
      }
    } else if (l.status === 'accepted') {
      actions = '<button class="btn btn-outline btn-sm" onclick="activateLoan(\''+l.id+'\')">📦 Mark as Picked Up</button>';
    } else if (l.status === 'active') {
      actions = '<button class="btn btn-success btn-sm" onclick="returnLoan(\''+l.id+'\')">✓ Mark Returned</button>';
    }

    return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:14px;margin-bottom:10px">'+
      '<div style="display:flex;align-items:flex-start;gap:12px">'+
        (l.offeredPhotoUrl ? photoHtml : '<div style="width:48px;height:48px;background:#e8eaf6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🔧</div>')+
        '<div style="flex:1">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+typeTag+statusBadge+'</div>'+
          '<div style="font-size:13px;margin-bottom:4px">'+desc+'</div>'+
          (meta.length?'<div style="font-size:11px;color:#90a4ae">'+meta.join(' · ')+'</div>':'')+
          (actions?'<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">'+actions+'</div>':'')+
        '</div>'+
      '</div>'+
    '</div>';
  }

  var html = '';
  if (active.length) html += active.map(renderLoan).join('');
  if (finished.length) {
    html += '<div style="font-weight:700;font-size:12px;color:#90a4ae;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.5px">Past Loans</div>';
    html += finished.slice(0,10).map(renderLoan).join('');
  }
  container.innerHTML = html;
}

// SCENARIO A — Post a Need
function openNeedPostModal() {
  var teamOpts = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  var el = document.getElementById('need-team-list');
  if (el) el.innerHTML = teamOpts;
  ['need-item','need-requester','need-when','need-job'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
  openModal('modal-post-need');
}

function submitNeedPost() {
  var item      = ((document.getElementById('need-item')||{}).value||'').trim();
  var requester = ((document.getElementById('need-requester')||{}).value||'').trim();
  if (!item)      { showToast('Please describe what you need','error'); return; }
  if (!requester) { showToast('Please enter your name','error'); return; }
  if (!DB.toolLoans) DB.toolLoans = [];
  DB.toolLoans.push({
    id:              'tl-'+Date.now(),
    type:            'need',
    status:          'open',
    postedBy:        requester,
    postedAt:        new Date().toISOString().split('T')[0],
    itemDescription: item,
    whenNeeded:      (document.getElementById('need-when')||{}).value||'',
    jobName:         (document.getElementById('need-job')||{}).value||''
  });
  saveDB();
  closeModal('modal-post-need');
  switchToolTab('borrows');
  showToast('Need posted — the team can now offer their tools','success');
}

// SCENARIO B — Initiate a Loan Offer (lender starts it)
function openInitiateLoanModal() {
  var teamOpts = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  // List personal tools owned by current user
  var myTools = (DB.tools||[]).filter(function(t){ return t.ownerType==='personal' && t.ownerId===(_currentUser&&_currentUser.full_name); });
  var myToolOpts = myTools.length
    ? '<optgroup label="Your Personal Tools">'+myTools.map(function(t){ return '<option value="'+escHtml(t.id)+'">'+escHtml(t.name)+(t.tag?' ('+t.tag+')':'')+'</option>'; }).join('')+'</optgroup>'
    : '';

  document.getElementById('modal-offer-loan-body').innerHTML =
    '<p style="font-size:13px;color:#546e7a;margin-bottom:14px">You\'re offering to loan a tool to a colleague. They\'ll need to accept and take responsibility before it\'s official.</p>'+
    '<label>Who are you loaning to? *</label>'+
    '<input id="offer-recipient" list="offer-team-list" placeholder="Colleague\'s name">'+
    '<datalist id="offer-team-list">'+teamOpts+'</datalist>'+
    '<div style="margin-top:12px"><label>What are you loaning? *</label>'+
    (myTools.length
      ? '<div style="margin-bottom:6px"><select id="offer-tool-select" onchange="onOfferToolSelect(this)" style="width:100%;padding:8px;border:1px solid #e0e0e0;border-radius:6px"><option value="">— Select from your tools or describe below —</option>'+myToolOpts+'</select></div>'
      : '')+
    '<input id="offer-tool-name" placeholder="Tool name / description (e.g. Klein wire stripper)"></div>'+
    '<div style="margin-top:12px"><label>Tool Photo</label>'+
    '<div style="display:flex;align-items:center;gap:10px;margin-top:6px">'+
      '<div id="offer-photo-preview" onclick="document.getElementById(\'offer-photo-input\').click()" style="width:64px;height:64px;border:2px dashed #e0e0e0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;overflow:hidden;background:#f8f9fa">📷</div>'+
      '<div>'+
        '<button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById(\'offer-photo-input\').click()">📷 Take or Upload Photo</button>'+
        '<input type="file" id="offer-photo-input" accept="image/*" capture="environment" style="display:none" onchange="onOfferPhotoSelected(this)">'+
        '<div style="font-size:11px;color:#90a4ae;margin-top:4px">A photo helps the recipient confirm they got the right item.</div>'+
      '</div>'+
    '</div>'+
    '<input type="hidden" id="offer-photo-url"></div>'+
    '<div style="margin-top:12px"><label>Return Expected By</label>'+
    '<input id="offer-return" type="date" value="'+new Date(Date.now()+7*86400000).toISOString().split('T')[0]+'"></div>'+
    '<div style="margin-top:10px"><label>Note (optional)</label>'+
    '<input id="offer-note" placeholder="Any conditions or details..."></div>';

  openModal('modal-offer-loan');
}

function onOfferToolSelect(sel) {
  if (!sel.value) return;
  var tool = (DB.tools||[]).find(function(t){ return t.id===sel.value; });
  if (!tool) return;
  var nameEl = document.getElementById('offer-tool-name');
  if (nameEl) nameEl.value = tool.name + (tool.tag?' ('+tool.tag+')':'');
  if (tool.photoUrl) {
    document.getElementById('offer-photo-url').value = tool.photoUrl;
    var preview = document.getElementById('offer-photo-preview');
    if (preview) preview.innerHTML = '<img src="'+escHtml(tool.photoUrl)+'" style="width:100%;height:100%;object-fit:cover">';
  }
}

function onOfferPhotoSelected(input) {
  var file=input.files[0]; if(!file) return;
  if(file.size>5*1024*1024){showToast('Photo must be under 5MB','error');return;}
  var reader=new FileReader();
  reader.onload=function(e){
    document.getElementById('offer-photo-url').value=e.target.result;
    var preview=document.getElementById('offer-photo-preview');
    if(preview) preview.innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
  };
  reader.readAsDataURL(file);
}

function submitLoanOffer() {
  var recipient = ((document.getElementById('offer-recipient')||{}).value||'').trim();
  var toolName  = ((document.getElementById('offer-tool-name')||{}).value||'').trim();
  var photoUrl  = (document.getElementById('offer-photo-url')||{}).value||'';
  if (!recipient) { showToast('Please enter who you are loaning to','error'); return; }
  if (!toolName)  { showToast('Please describe the tool','error'); return; }
  if (!DB.toolLoans) DB.toolLoans=[];
  DB.toolLoans.push({
    id:              'tl-'+Date.now(),
    type:            'offer',
    status:          'open',  // waiting for recipient to accept
    offeredBy:       (_currentUser&&_currentUser.full_name)||'',
    offeredAt:       new Date().toISOString().split('T')[0],
    offeredToolName: toolName,
    offeredPhotoUrl: photoUrl,
    recipientName:   recipient,
    expectedReturn:  (document.getElementById('offer-return')||{}).value||'',
    note:            (document.getElementById('offer-note')||{}).value||''
  });
  saveDB();
  closeModal('modal-offer-loan');
  switchToolTab('borrows');
  showToast('Loan offer sent to '+recipient+' — waiting for acceptance','success');
}

// Someone offers on a posted need
function openOfferOnNeedModal(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  // Pre-fill the offer modal targeting the person who posted the need
  openInitiateLoanModal();
  setTimeout(function(){
    var recip = document.getElementById('offer-recipient');
    if (recip) recip.value = loan.postedBy;
    var note = document.getElementById('offer-note');
    if (note) note.value = 'Responding to need: '+loan.itemDescription;
    // Store the need loan id so we can link them on submit
    document.getElementById('modal-offer-loan-body').setAttribute('data-need-id', loanId);
  }, 100);
}

// Recipient accepts the loan offer
function openAcceptLoanModal(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  var photoHtml = loan.offeredPhotoUrl
    ? photoThumb(loan.offeredPhotoUrl, loan.offeredToolName||'', 72)
    : '<div style="width:72px;height:72px;background:#e8eaf6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:32px">🔧</div>';

  document.getElementById('modal-accept-loan-body').innerHTML =
    '<div style="background:#f8f9fa;border-radius:8px;padding:14px;margin-bottom:14px;display:flex;align-items:center;gap:14px">'+
      photoHtml+
      '<div>'+
        '<div style="font-weight:800;font-size:16px">'+escHtml(loan.offeredToolName||loan.itemDescription||'Tool')+'</div>'+
        '<div style="font-size:13px;color:#546e7a;margin-top:2px">Offered by <strong>'+escHtml(loan.offeredBy||'')+'</strong></div>'+
        (loan.expectedReturn?'<div style="font-size:12px;color:#546e7a">Return by: '+escHtml(loan.expectedReturn)+'</div>':'')+
        (loan.note?'<div style="font-size:12px;color:#546e7a;margin-top:2px;font-style:italic">'+escHtml(loan.note)+'</div>':'')+
      '</div>'+
    '</div>'+
    '<div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:8px;padding:12px;font-size:13px">'+
      '<strong>⚠ By accepting, you agree:</strong><br>'+
      '<ul style="margin:6px 0 0 16px;padding:0;font-size:12px;color:#555">'+
        '<li>You are responsible for this tool while it\'s in your possession</li>'+
        '<li>Any damage or loss is your responsibility, not the company\'s</li>'+
        '<li>You will return it by '+escHtml(loan.expectedReturn||'the agreed date')+'</li>'+
      '</ul>'+
    '</div>'+
    '<input type="hidden" id="accept-loan-id" value="'+escHtml(loanId)+'">';

  openModal('modal-accept-loan');
}

function acceptLoanOffer() {
  var loanId = (document.getElementById('accept-loan-id')||{}).value||'';
  var loan   = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  loan.status     = 'accepted';
  loan.acceptedAt = new Date().toISOString().split('T')[0];
  saveDB();
  closeModal('modal-accept-loan');
  renderToolLoansTab();
  showToast('Loan accepted — click Mark as Picked Up when you have it','success');
}

function declineLoan(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  loan.status = loan.type==='need' ? 'open' : 'cancelled';
  if (loan.type==='need') { loan.offeredBy=''; loan.offeredPhotoUrl=''; loan.offeredToolName=''; loan.status='open'; }
  else loan.status = 'cancelled';
  saveDB();
  renderToolLoansTab();
  showToast('Offer declined','info');
}

function cancelLoan(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  if (!confirm('Cancel this loan/need?')) return;
  loan.status='cancelled';
  saveDB();
  renderToolLoansTab();
}

function activateLoan(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  loan.status='active';
  loan.pickedUpAt=new Date().toISOString().split('T')[0];
  saveDB();
  renderToolLoansTab();
  showToast('Marked as picked up — loan is now active','success');
}

function returnLoan(loanId) {
  var loan = getToolLoans().find(function(l){ return l.id===loanId; }); if(!loan) return;
  loan.status='returned';
  loan.returnedAt=new Date().toISOString().split('T')[0];
  saveDB();
  renderToolLoansTab();
  showToast('Loan returned ✓','success');
}

// ---- END TOOL LOAN SYSTEM ----

function renderBorrowRequestsTab() {
  var container = document.getElementById('borrow-requests-list');
  if (!container) return;
  var allRequests = [];
  (DB.tools||[]).forEach(function(t) {
    if (t.ownerType !== 'personal') return;
    (t.personalShareRequests||[]).forEach(function(r) {
      allRequests.push(Object.assign({}, r, { toolId:t.id, toolName:t.name, toolTag:t.tag, ownerName:t.ownerId, toolPhotoUrl:t.photoUrl }));
    });
  });
  if (!allRequests.length) {
    container.innerHTML = '<div style="text-align:center;color:#90a4ae;padding:24px">No loan requests yet.</div>';
    return;
  }
  var pending  = allRequests.filter(function(r){ return r.status==='pending'; });
  var approved = allRequests.filter(function(r){ return r.status==='approved'||r.status==='picked_up'; });
  var denied   = allRequests.filter(function(r){ return r.status==='denied'; });

  function renderRequest(r) {
    var ph = r.toolPhotoUrl ? photoThumb(r.toolPhotoUrl, r.toolName, 40) : '<div style="width:40px;height:40px;background:#e8eaf6;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px">🔧</div>';
    var statusBadge = r.status==='pending'   ? '<span style="background:#ff9800;color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">⏳ Pending</span>'
                    : r.status==='approved'  ? '<span style="background:#2e7d32;color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">✓ Approved</span>'
                    : r.status==='picked_up' ? '<span style="background:#1565c0;color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">📦 Out</span>'
                    : '<span style="background:#c62828;color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">✗ Denied</span>';
    var isOwnerOrAdmin = r.ownerName===(_currentUser&&_currentUser.full_name) || (_currentUser&&(_currentUser.role==='owner'||_currentUser.role==='manager'));
    var actions = '';
    if (r.status==='pending' && isOwnerOrAdmin) {
      actions = '<div style="display:flex;gap:6px;margin-top:8px">'+
        '<button class="btn btn-success btn-sm" onclick="approveBorrowRequest(\''+escHtml(r.toolId)+'\',\''+escHtml(r.id)+'\')">✓ Approve</button>'+
        '<button class="btn btn-danger btn-sm" onclick="denyBorrowRequest(\''+escHtml(r.toolId)+'\',\''+escHtml(r.id)+'\')">✗ Deny</button>'+
      '</div>';
    }
    if (r.status==='approved') {
      actions = '<div style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="convertBorrowToCheckout(\''+escHtml(r.toolId)+'\',\''+escHtml(r.id)+'\')">📦 Mark as Picked Up</button></div>';
    }
    return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px;margin-bottom:10px">'+
      '<div style="display:flex;align-items:center;gap:10px">'+ph+
        '<div style="flex:1"><div style="font-weight:800;font-size:14px">'+escHtml(r.toolName)+'</div>'+
        '<div style="font-size:11px;color:#546e7a">Owner: <strong>'+escHtml(r.ownerName||'')+'</strong></div></div>'+
        statusBadge+'</div>'+
      '<div style="margin-top:8px;font-size:12px;color:#546e7a"><strong>'+escHtml(r.requesterName||'')+'</strong> is requesting a loan'+
        (r.duration?' for <strong>'+escHtml(r.duration)+'</strong>':'')+' · '+escHtml(r.requestedAt||'')+'</div>'+
      (r.note?'<div style="font-size:12px;color:#546e7a;margin-top:4px;font-style:italic">'+escHtml(r.note)+'</div>':'')+
      (r.denyReason?'<div style="font-size:12px;color:#c62828;margin-top:4px">Denied: '+escHtml(r.denyReason)+'</div>':'')+
      actions+'</div>';
  }
  var html = '';
  if (pending.length)  html += '<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:#e65100">⏳ Pending ('+pending.length+')</div>'+pending.map(renderRequest).join('');
  if (approved.length) html += '<div style="font-weight:700;font-size:13px;margin:12px 0 8px;color:#2e7d32">✓ Approved / Out</div>'+approved.map(renderRequest).join('');
  if (denied.length)   html += '<div style="font-weight:700;font-size:13px;margin:12px 0 8px;color:#c62828">✗ Denied</div>'+denied.map(renderRequest).join('');
  container.innerHTML = html;
}

function openBorrowRequestModal(toolId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; }); if(!tool) return;
  var teamOpts = (DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'+escHtml(m.name)+'</option>'; }).join('');
  var ph = tool.photoUrl ? photoThumb(tool.photoUrl, tool.name, 48) : '<span style="font-size:30px">🔧</span>';
  document.getElementById('modal-borrow-body').innerHTML =
    '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:14px;display:flex;align-items:center;gap:12px">'+
      ph+'<div><div style="font-weight:800;font-size:15px">'+escHtml(tool.name)+'</div>'+
      '<div style="font-size:12px;color:#546e7a">Personal tool owned by <strong>'+escHtml(tool.ownerId||'')+'</strong></div>'+
      (tool.tag?'<span class="asset-tag-badge">'+escHtml(tool.tag)+'</span>':'')+'</div></div>'+
    '<div style="background:#fff3e0;border:1px solid #ffcc02;border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px">'+
      '⚠ <strong>Your responsibility:</strong> You are accountable for any damage to this tool during the loan period.</div>'+
    '<label>Your Name *</label>'+
    '<input id="borrow-requester" list="borrow-team-list" placeholder="Your name">'+
    '<datalist id="borrow-team-list">'+teamOpts+'</datalist>'+
    '<div style="margin-top:10px"><label>How Long Do You Need It? *</label>'+
    '<input id="borrow-duration" placeholder="e.g. 2 days, this week, until Friday"></div>'+
    '<div style="margin-top:10px"><label>Reason / Note</label>'+
    '<input id="borrow-note" placeholder="What job or purpose? (optional)"></div>'+
    '<input type="hidden" id="borrow-tool-id" value="'+escHtml(toolId)+'">';
  openModal('modal-borrow-request');
}

function submitBorrowRequest() {
  var toolId    = (document.getElementById('borrow-tool-id')||{}).value||'';
  var requester = ((document.getElementById('borrow-requester')||{}).value||'').trim();
  var duration  = ((document.getElementById('borrow-duration')||{}).value||'').trim();
  if (!requester) { showToast('Please enter your name','error'); return; }
  if (!duration)  { showToast('Please enter how long you need it','error'); return; }
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; }); if(!tool) return;
  if (requester===tool.ownerId) { showToast('You own this tool!','info'); return; }
  if (!tool.personalShareRequests) tool.personalShareRequests=[];
  tool.personalShareRequests.push({
    id:            'br-'+Date.now(),
    requesterId:   requester,
    requesterName: requester,
    duration:      duration,
    note:          (document.getElementById('borrow-note')||{}).value||'',
    status:        'pending',
    requestedAt:   new Date().toISOString().split('T')[0]
  });
  saveDB();
  closeModal('modal-borrow-request');
  renderTools();
  showToast('Loan request sent to '+tool.ownerId,'success');
}

function approveBorrowRequest(toolId, requestId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; }); if(!tool) return;
  var req  = (tool.personalShareRequests||[]).find(function(r){ return r.id===requestId; }); if(!req) return;
  req.status='approved'; req.approvedAt=new Date().toISOString().split('T')[0];
  saveDB(); renderBorrowRequestsTab();
  showToast('Loan approved — '+req.requesterName+' can pick it up','success');
}

function denyBorrowRequest(toolId, requestId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; }); if(!tool) return;
  var req  = (tool.personalShareRequests||[]).find(function(r){ return r.id===requestId; }); if(!req) return;
  var reason = prompt('Reason for denying (optional):','')||'';
  req.status='denied'; req.denyReason=reason; req.deniedAt=new Date().toISOString().split('T')[0];
  saveDB(); renderBorrowRequestsTab(); showToast('Request denied','info');
}

function convertBorrowToCheckout(toolId, requestId) {
  var tool = (DB.tools||[]).find(function(t){ return t.id===toolId; }); if(!tool) return;
  var req  = (tool.personalShareRequests||[]).find(function(r){ return r.id===requestId; }); if(!req) return;
  if (!DB.toolCheckouts) DB.toolCheckouts=[];
  var ret=new Date(); ret.setDate(ret.getDate()+7);
  DB.toolCheckouts.push({
    id:'co-'+Date.now(), toolId:toolId, toName:req.requesterName, jobName:req.note||'',
    date:new Date().toISOString().split('T')[0], expectedReturn:ret.toISOString().split('T')[0],
    returnedAt:null, status:'checked_out', groupsIncluded:[],
    isPersonalBorrow:true, ownerName:tool.ownerId||'', borrowRequestId:requestId
  });
  req.status='picked_up'; req.pickedUpAt=new Date().toISOString().split('T')[0];
  saveDB(); renderTools();
  showToast(req.requesterName+' picked up '+tool.name,'success');
}

// ---- END PERSONAL TOOL SHARING ----

var _barcodeInterval = null;

function openBarcodeScanner() {
  var bar = document.getElementById('barcode-scan-bar');
  if (bar) {
    bar.style.display = bar.style.display==='none' ? 'block' : 'none';
    if (bar.style.display==='block') {
      setTimeout(function(){
        var inp=document.getElementById('barcode-input');
        if(inp){inp.value='';inp.focus();}
      },100);
    } else {
      closeBarcodeScanner();
    }
  }
}

function closeBarcodeScanner() {
  stopCamera();
  var bar=document.getElementById('barcode-scan-bar'); if(bar) bar.style.display='none';
  var res=document.getElementById('barcode-result'); if(res) res.innerHTML='';
}

function onBarcodeInput(val) {
  // USB barcode readers send the full barcode then Enter — auto-lookup on Enter is handled by onkeydown
  // For typed input, show suggestions after 3 chars
  if (val.length >= 3) {
    var matches=(DB.tools||[]).filter(function(t){
      return (t.tag||'').toLowerCase().includes(val.toLowerCase())||
             (t.name||'').toLowerCase().includes(val.toLowerCase());
    }).slice(0,5);
    if (matches.length===1) lookupBarcode(matches[0].tag);
  }
}

function lookupBarcode(val) {
  var tag=(val||'').trim();
  if (!tag) return;
  var result=document.getElementById('barcode-result'); if(!result) return;

  var tool=(DB.tools||[]).find(function(t){
    return (t.tag||'').toLowerCase()===tag.toLowerCase()||
           t.id===tag;
  });

  if (!tool) {
    result.innerHTML='<div style="background:#ffebee;border-radius:8px;padding:12px;color:#c62828;font-weight:700">❌ Tag not found: '+escHtml(tag)+'<br><span style="font-size:11px;font-weight:400">This tag is not assigned to any tool. Add the tool first.</span></div>';
    return;
  }

  var co=(DB.toolCheckouts||[]).find(function(c){return c.toolId===tool.id&&!c.returnedAt;});
  var statusHtml=co
    ? '<span class="barcode-result-status brs-checked-out">🔄 Checked Out to '+escHtml(co.toName||'')+'</span>'
    : '<span class="barcode-result-status brs-available">✓ Available</span>';

  result.innerHTML='<div class="barcode-result-card">'+
    '<div class="barcode-result-tag">'+escHtml(tool.tag||'')+'</div>'+
    '<div class="barcode-result-name">'+escHtml(tool.name||'')+'</div>'+
    '<div class="barcode-result-meta">'+escHtml(tool.cat||'')+(tool.location?' · '+escHtml(tool.location):'')+'</div>'+
    statusHtml+
    (co
      ? '<br><button class="btn btn-success btn-sm" onclick="checkinTool(\''+co.id+'\');closeBarcodeScanner()">✓ Return Now</button>'
      : '<br><button class="btn btn-primary btn-sm" onclick="checkoutTool(\''+tool.id+'\')">Check Out</button>')+
    ' <button class="btn btn-outline btn-sm" onclick="editTool(\''+tool.id+'\')">Edit</button>'+
  '</div>';
}

async function toggleCamera() {
  var wrap=document.getElementById('barcode-camera-wrap');
  if (!wrap) return;
  if (_cameraStream) {
    stopCamera();
    wrap.style.display='none';
    var btn=document.getElementById('btn-toggle-camera'); if(btn) btn.textContent='📷 Camera';
  } else {
    try {
      _cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      var video=document.getElementById('barcode-video');
      if(video){video.srcObject=_cameraStream;}
      wrap.style.display='block';
      var btn=document.getElementById('btn-toggle-camera'); if(btn) btn.textContent='⏹ Stop Camera';
      showToast('Camera active — point at barcode. USB scanner also works.','info',3000);
      // Note: Full barcode decoding requires a library like ZXing
      // For now, camera view is shown and user can type/scan via USB
    } catch(e) {
      showToast('Camera access denied — use USB scanner or type tag manually','warning',3000);
    }
  }
}

function stopCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(function(t){t.stop();});
    _cameraStream=null;
  }
  clearInterval(_barcodeInterval);
}

// =============================================
// END TOOLS & ASSETS
// =============================================

