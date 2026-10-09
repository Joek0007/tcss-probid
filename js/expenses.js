// ============================================================
// expenses.js — Expenses Review page (v2)
// ------------------------------------------------------------
// Central review-and-reimburse workspace for all work-order expenses.
// v2 rebuild (2026-10) addressing the user-seat audit:
//  • loads ALL expenses (paginated) — the old select('*') capped at 1,000 rows so
//    totals/counts were wrong.
//  • opens on the PENDING queue; clickable summary tiles switch the view.
//  • sortable columns (Amount/Date/Person/…); bulk Approve/Flag; proper in-app flag box.
//  • multi-select People filter sourced from the ACTIVE team roster (not dirty expense
//    history), with a "former/historical names" toggle.
//  • missing-receipt + flagged quick filters; date presets; amount search; right-aligned $.
// Page access gated by page.expenses (office/owner). Anyone who can open it can act.
// ============================================================
(function(){
  'use strict';

  var REIMB_PAYTYPE = 'Employee Paid Cash';

  var _expFilter = { from:'', to:'', people:[], payType:'', category:'', status:'',
                     needsReimb:false, flaggedOnly:false, missingReceipt:false, q:'' };
  var _expSort   = { col:'date', dir:'desc' };
  var _expSel    = {};            // id -> true (bulk selection, across current table view)
  var _expShowFormer = false;     // people panel: include historical names
  var _expPeoplePanel = false;    // people panel open?
  var _expLoadedOnce = false;
  var _expLoading = false;
  // The review page keeps its OWN authoritative snapshot of all expenses, SEPARATE from
  // the app's sync-managed DB.woExpenses. This is deliberate: the app lazy-loads expenses
  // per-WO and its full push (pushAllToCloud) re-uploads whatever is in DB.woExpenses, so
  // dumping all 8k rows there risks the full push clobbering the cloud with a stale copy.
  // We read from _expRows, write per-row via _pushWOExpenseToCloud (never the full push),
  // and only MIRROR a changed row into DB.woExpenses if it already happens to be loaded.
  var _expRows = [];

  function _money(n){ return '$'+(parseFloat(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function _today(){ return (typeof getTodayISO==='function') ? getTodayISO() : new Date().toISOString().slice(0,10); }
  function _esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s); }
  function _me(){ return (window._currentUser && (_currentUser.full_name||_currentUser.name)) || 'Office'; }
  function _attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  // ---------- Load ALL expenses (paginated — no 1,000-row cap) ----------
  async function loadAllExpenses(){
    var sb = window._sb; if(!sb) return;
    _expLoading = true;
    var all=[], from=0, PAGE=1000, guard=0;
    try {
      while(true){
        var r = await sb.from('wo_expenses').select('*')
          .order('expense_date',{ascending:false, nullsFirst:false})
          .range(from, from+PAGE-1);
        if (r.error){ console.warn('[Expenses load]', r.error.message); break; }
        var batch = r.data||[];
        all = all.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
        if (++guard > 60) break;   // safety: 60k rows max
      }
    } catch(e){ console.warn('[Expenses load]', e.message||e); }
    // Build our OWN authoritative snapshot from the cloud (do NOT merge into DB.woExpenses —
    // see note on _expRows). Rebuilt fresh each load, so it always matches the cloud.
    var delWE=(DB.deletedIds && DB.deletedIds.woExpenses)||[];
    _expRows = (all||[]).filter(function(e){ return delWE.indexOf(String(e.id))<0; }).map(function(e){
      return { id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount,
        paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by,
        receiptUrl:e.receipt_url, receiptDocId:e.receipt_doc_id, createdAt:e.created_at,
        reviewStatus:e.review_status||'pending', reviewNote:e.review_note||'',
        reviewedBy:e.reviewed_by||'', reviewedAt:e.reviewed_at||'',
        reimbursed:!!e.reimbursed, reimbursedAt:e.reimbursed_at||'' };
    });
    _expLoadedOnce = true; _expLoading = false;
  }

  function _woInfo(woId){
    var wo=(DB.workOrders||[]).find(function(w){ return w.id===woId; });
    if (wo) return { num:wo.woNumber||('WO '+String(woId).slice(0,6)), cust:wo.customerName||'' };
    return { num:(woId? ('WO '+String(woId).slice(0,6)) : '—'), cust:'' };
  }

  // People: active roster first; historical names from the data as a separate group.
  function _activePeople(){
    return (DB.team||[])
      .filter(function(t){ return t.active!==false && t.is_active!==false && t.status!=='inactive' && t.status!=='terminated'; })
      .map(function(t){ return t.name||t.full_name; }).filter(Boolean)
      .filter(function(v,i,a){ return a.indexOf(v)===i; }).sort();
  }
  function _historicalPeople(){
    var active=_activePeople();
    return [].concat.apply([], (_expRows||[]).map(function(e){return e.loggedBy;}))
      .filter(Boolean).filter(function(v,i,a){ return a.indexOf(v)===i; })
      .filter(function(n){ return active.indexOf(n)<0; }).sort();
  }
  function _payTypes(){ return (DB.woSettings&&DB.woSettings.expensePayTypes) || (typeof WO_EXPENSE_PAY_TYPES!=='undefined'?WO_EXPENSE_PAY_TYPES:[REIMB_PAYTYPE]); }
  function _cats(){ return (DB.woSettings&&DB.woSettings.expenseCats) || (typeof WO_EXPENSE_CATS!=='undefined'?WO_EXPENSE_CATS:[]); }

  // Base = everything EXCEPT the status/flag/receipt view filters (so the tiles always
  // show a meaningful pending/flagged/owed picture for the current date/person/etc scope).
  function _baseRows(){
    var f=_expFilter;
    return (_expRows||[]).filter(function(e){
      if (!e) return false;
      if (f.from && (e.date||'') < f.from) return false;
      if (f.to   && (e.date||'') > f.to)   return false;
      if (f.people.length && f.people.indexOf(e.loggedBy)<0) return false;
      if (f.payType && e.paymentType!==f.payType) return false;
      if (f.category&& e.category!==f.category) return false;
      if (f.needsReimb && !(e.paymentType===REIMB_PAYTYPE && !e.reimbursed)) return false;
      if (f.q){
        var info=_woInfo(e.woId);
        var hay=[e.description,e.category,e.loggedBy,info.num,info.cust,(e.amount!=null?String(e.amount):'')].join(' ').toLowerCase();
        if (hay.indexOf(f.q.toLowerCase())<0) return false;
      }
      return true;
    });
  }
  // Table rows = base + status/flag/receipt view filters, sorted.
  function _tableRows(){
    var f=_expFilter;
    var rows=_baseRows().filter(function(e){
      if (f.status && (e.reviewStatus||'pending')!==f.status) return false;
      if (f.flaggedOnly && e.reviewStatus!=='flagged') return false;
      if (f.missingReceipt && e.receiptUrl) return false;
      return true;
    });
    var c=_expSort.col, dir=_expSort.dir==='asc'?1:-1;
    rows.sort(function(a,b){
      var av,bv;
      if (c==='amount'){ av=parseFloat(a.amount||0); bv=parseFloat(b.amount||0); }
      else if (c==='person'){ av=(a.loggedBy||'').toLowerCase(); bv=(b.loggedBy||'').toLowerCase(); }
      else if (c==='category'){ av=(a.category||'').toLowerCase(); bv=(b.category||'').toLowerCase(); }
      else if (c==='status'){ av=(a.reviewStatus||'pending'); bv=(b.reviewStatus||'pending'); }
      else { av=(a.date||''); bv=(b.date||''); }    // date default
      if (av<bv) return -1*dir; if (av>bv) return 1*dir;
      // tiebreak by date desc
      return (b.date||'').localeCompare(a.date||'');
    });
    return rows;
  }

  function _statusChip(e){
    var s=e.reviewStatus||'pending';
    var map={pending:['#fff8e1','#f57f17','Pending'], approved:['#e8f5e9','#2e7d32','Approved'], flagged:['#ffebee','#c62828','🚩 Flagged']};
    var c=map[s]||map.pending;
    return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+c[0]+';color:'+c[1]+'">'+c[2]+'</span>';
  }
  function _reimbCell(e){
    if (e.paymentType!==REIMB_PAYTYPE) return '<span style="color:#cfd8dc">—</span>';
    if (e.reimbursed) return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#2e7d32">✓ '+_esc((e.reimbursedAt||'').slice(0,10))+'</span>';
    return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#fff3e0;color:#e65100">Owed</span>';
  }

  // ---------- Page shell (built once; only #exp-results re-renders) ----------
  function renderExpensesPage(){
    var page=document.getElementById('page-expenses'); if(!page) return;
    if (_expLoadedOnce){ _drawShell(); loadAllExpenses().then(_drawResults); return; }
    page.innerHTML='<div style="padding:28px;text-align:center;color:#90a4ae">Loading all expenses…</div>';
    loadAllExpenses().then(function(){ _drawShell(); });
  }

  function _opt(val,cur,label){ return '<option value="'+_attr(val)+'"'+(val===cur?' selected':'')+'>'+_esc(label||val)+'</option>'; }

  // Compute a preset's date range. Local dates (NOT toISOString — that converts to UTC and
  // rolls the day forward in western timezones, which made "This week" start on Tuesday).
  // Weeks run Monday→Sunday.
  function _presetRange(which){
    var now=new Date(), y=now.getFullYear(), m=now.getMonth();
    function iso(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
    var day=now.getDay();
    var thisMon=new Date(now); thisMon.setDate(now.getDate()-((day+6)%7));   // Monday of this week
    if (which==='thisweek') return { from:iso(thisMon), to:iso(now) };
    if (which==='lastweek'){
      var lastMon=new Date(thisMon); lastMon.setDate(thisMon.getDate()-7);
      var lastSun=new Date(thisMon); lastSun.setDate(thisMon.getDate()-1);
      return { from:iso(lastMon), to:iso(lastSun) };
    }
    if (which==='thismonth') return { from:iso(new Date(y,m,1)), to:iso(new Date(y,m+1,0)) };
    if (which==='lastmonth') return { from:iso(new Date(y,m-1,1)), to:iso(new Date(y,m,0)) };
    return { from:'', to:'' };   // 'all'
  }
  function _datePreset(which){ var r=_presetRange(which); _expFilter.from=r.from; _expFilter.to=r.to; _drawShell(); }
  // Which preset the current filter matches (to highlight it), or '' if a custom range.
  function _activeDatePreset(){
    var f=_expFilter;
    var names=['thisweek','lastweek','thismonth','lastmonth'];
    for (var i=0;i<names.length;i++){ var r=_presetRange(names[i]); if (f.from===r.from && f.to===r.to) return names[i]; }
    if (!f.from && !f.to) return 'all';
    return '';
  }

  function _drawShell(){
    var page=document.getElementById('page-expenses'); if(!page) return;
    _expPeoplePanel=false;   // shell rebuild recreates the (hidden) panel; keep state in sync
    var f=_expFilter;
    var pays=_payTypes(), cats=_cats();
    var inpCss='padding:7px 9px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px';

    var html='';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">'+
      '<h2 style="margin:0;font-size:20px;font-weight:800;color:#0d1b2a">💰 Expenses Review</h2>'+
      '<button class="btn btn-outline btn-sm" onclick="exportExpensesCSV()">⬇ Export CSV</button>'+
    '</div>';

    // Date presets — in a tinted panel with pill buttons so the quick ranges are obvious.
    var activePreset=_activeDatePreset();
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#eef4fc;border:1px solid #cfe0f5;border-radius:10px;padding:9px 12px">'+
      '<span style="font-size:12px;color:#1565c0;font-weight:800">📅 Quick date range:</span>'+
      ['thisweek:This week','lastweek:Last week','thismonth:This month','lastmonth:Last month','all:All dates'].map(function(p){
        var k=p.split(':')[0], lbl=p.split(':')[1];
        var on=activePreset===k;
        return '<button class="btn btn-sm" style="font-size:12px;font-weight:700;padding:6px 14px;border-radius:16px;cursor:pointer;border:1px solid '+(on?'#1565c0':'#90caf9')+';background:'+(on?'#1565c0':'#fff')+';color:'+(on?'#fff':'#1565c0')+'" onclick="_expDatePreset(\''+k+'\')">'+lbl+'</button>';
      }).join('')+
    '</div>';

    html+='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px">'+
      // Dates — kept together on one line (never splits)
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">'+
        '<input id="exp-f-from" type="date" value="'+_esc(f.from)+'" onchange="_expSetFilter(\'from\',this.value)" style="'+inpCss+'" title="From">'+
        '<span style="color:#90a4ae">→</span>'+
        '<input id="exp-f-to" type="date" value="'+_esc(f.to)+'" onchange="_expSetFilter(\'to\',this.value)" style="'+inpCss+'" title="To">'+
      '</div>'+
      // People / pay types / categories — kept together on one line (never splits)
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:nowrap">'+
        '<div style="position:relative">'+
          '<button id="exp-people-btn" class="btn btn-outline btn-sm" style="font-size:12px" onclick="_expTogglePeople()">👤 '+(f.people.length?('People ('+f.people.length+')'):'All people')+' ▾</button>'+
          '<div id="exp-people-panel" onclick="event.stopPropagation()" style="display:none;position:absolute;z-index:500;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #e0e7ef;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);padding:6px;max-height:300px;overflow-y:auto;width:220px"></div>'+
        '</div>'+
        '<select id="exp-f-pay" onchange="_expSetFilter(\'payType\',this.value)" style="'+inpCss+'">'+_opt('',f.payType,'All pay types')+pays.map(function(p){return _opt(p,f.payType);}).join('')+'</select>'+
        '<select id="exp-f-cat" onchange="_expSetFilter(\'category\',this.value)" style="'+inpCss+'">'+_opt('',f.category,'All categories')+cats.map(function(c){return _opt(c,f.category);}).join('')+'</select>'+
      '</div>'+
      '<input id="exp-f-q" type="text" placeholder="🔍 search (name, desc, WO, amount)" value="'+_attr(f.q)+'" oninput="_expSetFilter(\'q\',this.value)" style="'+inpCss+';min-width:170px;flex:1">'+
      '<button id="exp-f-clear" class="btn btn-ghost btn-sm" onclick="_expClearFilters()" style="display:'+(_filterActive()?'':'none')+'">✕ clear filters</button>'+
    '</div>';

    // Quick view toggles
    html+='<div id="exp-chips" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"></div>';

    // Selected-people chips
    html+='<div id="exp-people-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:'+(f.people.length?'10px':'0')+'"></div>';

    html+='<div id="exp-results"></div>';
    page.innerHTML=html;
    _drawChips(); _drawPeopleChips();
    _drawResults();
  }

  function _drawChips(){
    var box=document.getElementById('exp-chips'); if(!box) return;
    var f=_expFilter;
    function chip(active,label,onclick,clr){
      return '<button class="btn btn-sm" onclick="'+onclick+'" style="font-size:12px;font-weight:700;border-radius:16px;padding:5px 12px;border:1px solid '+(active?clr:'#e0e7ef')+';background:'+(active?clr:'#fff')+';color:'+(active?'#fff':'#546e7a')+'">'+label+'</button>';
    }
    box.innerHTML=
      '<span style="font-size:11px;color:#90a4ae;font-weight:700">SHOW:</span>'+
      chip(f.status==='pending' && !f.flaggedOnly,'Pending','_expView(\'pending\')','#f57f17')+
      chip(f.flaggedOnly,'Flagged','_expView(\'flagged\')','#c62828')+
      chip(f.status==='approved','Approved','_expView(\'approved\')','#2e7d32')+
      chip(f.needsReimb,'Needs reimbursement','_expView(\'reimb\')','#e65100')+
      chip(f.missingReceipt,'Missing receipt','_expView(\'noreceipt\')','#6a1b9a')+
      chip(!f.status && !f.flaggedOnly && !f.needsReimb && !f.missingReceipt,'All','_expView(\'all\')','#37474f');
  }

  function _drawPeopleChips(){
    var box=document.getElementById('exp-people-chips'); if(!box) return;
    var f=_expFilter;
    if (!f.people.length){ box.innerHTML=''; box.style.marginBottom='0'; return; }
    box.style.marginBottom='10px';
    box.innerHTML = f.people.map(function(n){
      return '<span style="display:inline-flex;align-items:center;gap:6px;background:#eef3fb;border:1px solid #cfe0f5;border-radius:14px;padding:3px 6px 3px 10px;font-size:12px;font-weight:600;color:#1565c0">'+
        _esc(n)+'<button onclick="_expTogglePerson(\''+_attr(n).replace(/'/g,"\\'")+'\')" style="border:none;background:#d7e6f8;color:#1565c0;border-radius:50%;width:16px;height:16px;line-height:14px;cursor:pointer;font-size:11px">×</button></span>';
    }).join('') + '<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="_expClearPeople()">clear people</button>';
  }

  function _drawResults(){
    var box=document.getElementById('exp-results'); if(!box) return;
    var base=_baseRows();
    var rows=_tableRows();
    var totalShown=rows.reduce(function(s,e){return s+parseFloat(e.amount||0);},0);
    var pending=base.filter(function(e){return (e.reviewStatus||'pending')==='pending';});
    var flagged=base.filter(function(e){return e.reviewStatus==='flagged';});
    var owedRows=base.filter(function(e){return e.paymentType===REIMB_PAYTYPE && !e.reimbursed;});
    var owed=owedRows.reduce(function(s,e){return s+parseFloat(e.amount||0);},0);
    var cb=document.getElementById('exp-f-clear'); if(cb) cb.style.display=_filterActive()?'':'none';
    var pbtn=document.getElementById('exp-people-btn'); if(pbtn) pbtn.innerHTML='👤 '+(_expFilter.people.length?('People ('+_expFilter.people.length+')'):'All people')+' ▾';

    function tile(lbl,val,clr,onclick){ return '<div onclick="'+(onclick||'')+'" style="flex:1;min-width:130px;background:#fff;border:1px solid #e0e7ef;border-radius:10px;padding:10px 14px'+(onclick?';cursor:pointer':'')+'">'+
      '<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+lbl+'</div>'+
      '<div style="font-size:20px;font-weight:800;color:'+(clr||'#0d1b2a')+'">'+val+'</div></div>'; }
    var html='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'+
      tile('Showing', _money(totalShown)+' · '+rows.length, '#0d1b2a')+
      tile('Pending review', pending.length, pending.length?'#f57f17':'#90a4ae', '_expView(\'pending\')')+
      tile('Flagged', flagged.length, flagged.length?'#c62828':'#90a4ae', '_expView(\'flagged\')')+
      tile('Owed (reimburse)', _money(owed), owed?'#e65100':'#2e7d32', '_expView(\'reimb\')')+
    '</div>';

    if (_expLoading && !rows.length){ box.innerHTML=html+'<div style="padding:24px;text-align:center;color:#90a4ae">Loading…</div>'; return; }
    if (!rows.length){
      html+='<div style="padding:40px;text-align:center;color:#90a4ae;background:#f8f9fa;border-radius:12px">'+
        ((_expRows&&_expRows.length)?'Nothing matches the current view/filters.':'No expenses logged yet. They appear here as techs add them on work orders.')+'</div>';
      box.innerHTML=html; return;
    }

    // Bulk action bar
    var selIds=Object.keys(_expSel).filter(function(id){ return _expSel[id]; });
    // keep selection limited to currently-visible rows
    var visibleIds={}; rows.forEach(function(e){ visibleIds[e.id]=1; });
    selIds=selIds.filter(function(id){ return visibleIds[id]; });
    if (selIds.length){
      html+='<div style="display:flex;gap:10px;align-items:center;background:#e3f2fd;border:1px solid #90caf9;border-radius:10px;padding:8px 14px;margin-bottom:10px">'+
        '<span style="font-weight:800;color:#1565c0">'+selIds.length+' selected</span>'+
        '<button class="btn btn-sm" style="background:#2e7d32;color:#fff;border:none;font-size:12px;font-weight:700" onclick="_expBulkApprove()">✓ Approve selected</button>'+
        '<button class="btn btn-sm" style="background:#c62828;color:#fff;border:none;font-size:12px;font-weight:700" onclick="_expBulkFlag()">🚩 Flag selected</button>'+
        '<button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="_expSelClear()">clear selection</button>'+
      '</div>';
    }

    var MAX_ROWS=500;
    var shown=rows.slice(0,MAX_ROWS);
    if (rows.length>MAX_ROWS){
      html+='<div style="font-size:12px;color:#e65100;background:#fff8e1;border:1px solid #ffe0b2;border-radius:8px;padding:8px 12px;margin-bottom:8px">'+
        'Showing '+MAX_ROWS+' of '+rows.length.toLocaleString()+' rows. Narrow with the filters or a date range.</div>';
    }

    var allShownSelected = shown.length && shown.every(function(e){ return _expSel[e.id]; });
    function sortArrow(col){ return _expSort.col===col ? (_expSort.dir==='asc'?' ▲':' ▼') : ''; }
    function th(label,col){ var sortable=!!col; return '<th onclick="'+(sortable?'_expSortBy(\''+col+'\')':'')+'" style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap'+(sortable?';cursor:pointer;user-select:none':'')+'">'+label+sortArrow(col)+'</th>'; }

    html+='<div style="overflow-x:auto;background:#fff;border:1px solid #e0e7ef;border-radius:12px">'+
      '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
      '<thead><tr style="background:#f8f9fa;text-align:left">'+
        '<th style="padding:9px 10px"><input type="checkbox" '+(allShownSelected?'checked':'')+' onclick="_expSelAll(this.checked)" title="Select all shown"></th>'+
        th('Date','date')+th('Logged by','person')+th('Category','category')+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Description</th>'+
        '<th onclick="_expSortBy(\'amount\')" style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;text-align:right;cursor:pointer;user-select:none;white-space:nowrap">Amount'+sortArrow('amount')+'</th>'+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Paid with</th>'+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Work Order</th>'+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;text-align:center">Receipt</th>'+
        th('Status','status')+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;text-align:center">Reimburse</th>'+
        '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Actions</th>'+
      '</tr></thead><tbody>';

    shown.forEach(function(e){
      var info=_woInfo(e.woId);
      var isReimb=e.paymentType===REIMB_PAYTYPE;
      var st=e.reviewStatus||'pending';
      var acts='';
      if (st!=='approved') acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#2e7d32;border-color:#a5d6a7" onclick="expApprove(\''+e.id+'\')">✓ Approve</button> ';
      if (st!=='flagged')  acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#c62828;border-color:#ef9a9a" onclick="expFlag(\''+e.id+'\')">🚩 Flag</button> ';
      else acts+='<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="expUnflag(\''+e.id+'\')">Clear flag</button> ';
      if (isReimb && !e.reimbursed) acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#e65100;border-color:#ffcc80" onclick="expMarkReimbursed(\''+e.id+'\')">$ Reimbursed</button>';
      var rcpt = e.receiptUrl ? '<a href="'+_attr(e.receiptUrl)+'" target="_blank" rel="noopener" title="View receipt" style="text-decoration:none;font-size:16px">🧾</a>'
                              : '<span title="No receipt attached" style="color:#e57373;font-weight:700">⚠</span>';
      var noteLine = (st==='flagged' && e.reviewNote) ? '<div style="font-size:11px;color:#c62828;margin-top:3px;max-width:260px;white-space:normal">🚩 '+_esc(e.reviewNote)+'</div>' : '';
      var revLine  = e.reviewedBy ? '<div style="font-size:10px;color:#b0bec5;margin-top:2px">'+_esc(e.reviewedBy)+'</div>' : '';

      html+='<tr style="border-top:1px solid #f0f4f8'+(_expSel[e.id]?';background:#f3f8ff':'')+'">'+
        '<td style="padding:9px 10px"><input type="checkbox" '+(_expSel[e.id]?'checked':'')+' onclick="_expSelToggle(\''+e.id+'\',this.checked)"></td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc((e.date||'').slice(0,10))+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc(e.loggedBy||'—')+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc(e.category||'—')+'</td>'+
        '<td style="padding:9px 10px">'+_esc(e.description||'')+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap;font-weight:700;text-align:right">'+_money(e.amount)+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+(isReimb?'<span style="color:#e65100;font-weight:600">'+_esc(e.paymentType)+'</span>':_esc(e.paymentType||'—'))+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap"><a href="javascript:void(0)" onclick="openWorkOrder(\''+_attr(e.woId)+'\')" style="color:#1565c0;font-weight:600;text-decoration:none">'+_esc(info.num)+'</a>'+(info.cust?'<div style="font-size:11px;color:#90a4ae">'+_esc(info.cust)+'</div>':'')+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+rcpt+'</td>'+
        '<td style="padding:9px 10px">'+_statusChip(e)+noteLine+revLine+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+_reimbCell(e)+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+acts+'</td>'+
      '</tr>';
    });
    html+='</tbody></table></div>';
    box.innerHTML=html;
  }

  function _filterActive(){ var f=_expFilter; return !!(f.from||f.to||f.people.length||f.payType||f.category||f.needsReimb||f.flaggedOnly||f.missingReceipt||f.q||f.status); }

  // ---------- People panel ----------
  function _drawPeoplePanel(){
    var panel=document.getElementById('exp-people-panel'); if(!panel) return;
    var act=_activePeople(), hist=_historicalPeople(), f=_expFilter;
    function row(n){ return '<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;font-size:13px;line-height:1.2;white-space:nowrap;cursor:pointer;border-radius:5px"><input type="checkbox" style="width:14px;height:14px;flex:0 0 auto;margin:0" '+(f.people.indexOf(n)>=0?'checked':'')+' onclick="_expTogglePerson(\''+_attr(n).replace(/'/g,"\\'")+'\')"><span style="overflow:hidden;text-overflow:ellipsis">'+_esc(n)+'</span></label>'; }
    var html='';
    if (f.people.length) html+='<div style="text-align:right;margin-bottom:4px"><button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="_expClearPeople()">clear</button></div>';
    html+='<div style="font-size:10px;font-weight:800;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px;margin:2px 0 4px">Active team</div>';
    html+= act.length? act.map(row).join('') : '<div style="font-size:12px;color:#b0bec5">No active team found</div>';
    if (hist.length){
      html+='<div style="border-top:1px solid #eef2f7;margin:8px 0 4px"></div>';
      html+='<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#607d8b;cursor:pointer"><input type="checkbox" '+(_expShowFormer?'checked':'')+' onclick="_expToggleFormer()"> Show former / historical names ('+hist.length+')</label>';
      if (_expShowFormer) html+='<div style="margin-top:4px">'+hist.map(row).join('')+'</div>';
    }
    panel.innerHTML=html;
  }

  // ---------- Persist + actions ----------
  function _expPersist(e){
    // Targeted per-row push ONLY — never saveDB()/pushAllToCloud, which would re-upload a
    // possibly-stale full expense array and clobber the cloud. Mirror the changed fields into
    // DB.woExpenses only if that row is already loaded there (keeps the WO Expenses tab in sync).
    if (typeof _pushWOExpenseToCloud==='function') _pushWOExpenseToCloud(e);
    var d=(DB.woExpenses||[]).find(function(x){return x.id===e.id;});
    if (d) { d.reviewStatus=e.reviewStatus; d.reviewNote=e.reviewNote; d.reviewedBy=e.reviewedBy; d.reviewedAt=e.reviewedAt; d.reimbursed=e.reimbursed; d.reimbursedAt=e.reimbursedAt; }
  }
  function _findExp(id){ return (_expRows||[]).find(function(e){return e.id===id;}); }

  function expApprove(id){ var e=_findExp(id); if(!e) return; e.reviewStatus='approved'; e.reviewNote=''; e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString(); _expPersist(e); _drawResults(); if(typeof showToast==='function') showToast('Approved','success'); }
  function expUnflag(id){ var e=_findExp(id); if(!e) return; e.reviewStatus='pending'; e.reviewNote=''; e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString(); _expPersist(e); _drawResults(); }
  function expMarkReimbursed(id){ var e=_findExp(id); if(!e) return; e.reimbursed=true; e.reimbursedAt=_today(); _expPersist(e); _drawResults(); if(typeof showToast==='function') showToast('Marked reimbursed','success'); }
  function expFlag(id){ _openFlagModal([id]); }

  function _applyFlag(ids, note){
    var touched=[];
    ids.forEach(function(id){ var e=_findExp(id); if(!e) return; e.reviewStatus='flagged'; e.reviewNote=(note||'').trim(); e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString(); _expPersist(e); touched.push(e); });
    if (touched.length){
      var sum = touched.length===1 ? (_money(touched[0].amount)+' ('+(touched[0].category||'')+', '+(touched[0].loggedBy||'')+')') : (touched.length+' expenses');
      var msg = _me()+' flagged '+sum+(note?': '+note:'');
      // Cloud feed → reaches owner/manager/back_office on their own devices.
      if (typeof notifyOfficeCloud==='function') notifyOfficeCloud('expense_flagged','🚩 Expense Flagged', msg, true);
      // Local bell for the person who flagged (immediate confirmation on this screen).
      if (typeof addNotification==='function') addNotification('expense_flagged','🚩 Expense Flagged', msg, 'wo');
    }
    _expSel={}; _drawResults();
    if (typeof showToast==='function') showToast(touched.length+' flagged for owner/manager','success');
  }

  // In-app flag box (replaces window.prompt)
  function _openFlagModal(ids){
    _closeFlagModal();
    var n=ids.length;
    var ov=document.createElement('div');
    ov.id='exp-flag-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center';
    ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:440px;width:92%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.2)">'+
      '<div style="font-size:16px;font-weight:800;color:#c62828;margin-bottom:4px">🚩 Flag '+(n>1?(n+' expenses'):'expense')+'</div>'+
      '<div style="font-size:13px;color:#546e7a;margin-bottom:12px">Why is this being flagged? Owners/managers will see this note.</div>'+
      '<textarea id="exp-flag-note" rows="3" placeholder="e.g. personal purchase, no pre-approval, missing receipt…" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #e0e7ef;border-radius:8px;font-size:13px;font-family:inherit"></textarea>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">'+
        '<button class="btn btn-outline" onclick="_expCloseFlag()">Cancel</button>'+
        '<button class="btn" style="background:#c62828;color:#fff;border:none;font-weight:700" onclick="_expConfirmFlag()">Flag it</button>'+
      '</div></div>';
    ov._ids=ids;
    document.body.appendChild(ov);
    setTimeout(function(){ var t=document.getElementById('exp-flag-note'); if(t) t.focus(); },50);
  }
  function _closeFlagModal(){ var m=document.getElementById('exp-flag-modal'); if(m) m.remove(); }
  window._expCloseFlag=_closeFlagModal;
  window._expConfirmFlag=function(){ var m=document.getElementById('exp-flag-modal'); if(!m) return; var ids=m._ids||[]; var note=(document.getElementById('exp-flag-note')||{}).value||''; _closeFlagModal(); _applyFlag(ids, note); };

  // ---------- Bulk ----------
  window._expSelToggle=function(id,on){ if(on) _expSel[id]=true; else delete _expSel[id]; _drawResults(); };
  window._expSelAll=function(on){ var rows=_tableRows().slice(0,500); rows.forEach(function(e){ if(on) _expSel[e.id]=true; else delete _expSel[e.id]; }); _drawResults(); };
  window._expSelClear=function(){ _expSel={}; _drawResults(); };
  window._expBulkApprove=function(){ Object.keys(_expSel).filter(function(id){return _expSel[id];}).forEach(function(id){ var e=_findExp(id); if(e){ e.reviewStatus='approved'; e.reviewNote=''; e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString(); _expPersist(e);} }); var n=Object.keys(_expSel).length; _expSel={}; _drawResults(); if(typeof showToast==='function') showToast(n+' approved','success'); };
  window._expBulkFlag=function(){ var ids=Object.keys(_expSel).filter(function(id){return _expSel[id];}); if(ids.length) _openFlagModal(ids); };

  // ---------- Filter/view handlers ----------
  var _qTimer=null;
  window._expSetFilter=function(k,v){ _expFilter[k]=v; if(k==='q'){ clearTimeout(_qTimer); _qTimer=setTimeout(_drawResults,180);} else _drawResults(); };
  window._expView=function(which){
    var f=_expFilter;
    f.status=''; f.flaggedOnly=false; f.needsReimb=false; f.missingReceipt=false;
    if (which==='pending') f.status='pending';
    else if (which==='approved') f.status='approved';
    else if (which==='flagged') f.flaggedOnly=true;
    else if (which==='reimb') f.needsReimb=true;
    else if (which==='noreceipt') f.missingReceipt=true;
    // 'all' leaves everything off
    _drawChips(); _drawResults();
  };
  window._expDatePreset=function(w){ _datePreset(w); };
  window._expSortBy=function(col){ if(_expSort.col===col){ _expSort.dir=_expSort.dir==='asc'?'desc':'asc'; } else { _expSort.col=col; _expSort.dir=(col==='amount'?'desc':(col==='date'?'desc':'asc')); } _drawResults(); };
  window._expTogglePeople=function(){ _expPeoplePanel=!_expPeoplePanel; var p=document.getElementById('exp-people-panel'); if(p){ p.style.display=_expPeoplePanel?'block':'none'; if(_expPeoplePanel) _drawPeoplePanel(); } };
  window._expTogglePerson=function(n){ var i=_expFilter.people.indexOf(n); if(i>=0) _expFilter.people.splice(i,1); else _expFilter.people.push(n); _drawPeoplePanel(); _drawPeopleChips(); _drawResults(); };
  window._expToggleFormer=function(){ _expShowFormer=!_expShowFormer; _drawPeoplePanel(); };
  window._expClearPeople=function(){ _expFilter.people=[]; _drawPeoplePanel(); _drawPeopleChips(); _drawResults(); };
  window._expClearFilters=function(){
    _expFilter={ from:'',to:'',people:[],payType:'',category:'',status:'',needsReimb:false,flaggedOnly:false,missingReceipt:false,q:'' };
    _expShowFormer=false; _expSel={};
    _drawShell();
  };

  // ---------- CSV ----------
  function exportExpensesCSV(){
    var rows=_tableRows();
    var cols=['Date','Logged By','Category','Description','Amount','Paid With','WO Number','Customer','Review Status','Review Note','Reviewed By','Reimbursed','Reimbursed On'];
    function q(v){ v=(v==null?'':String(v)); return '"'+v.replace(/"/g,'""')+'"'; }
    var lines=[cols.map(q).join(',')];
    rows.forEach(function(e){ var info=_woInfo(e.woId);
      lines.push([ (e.date||'').slice(0,10), e.loggedBy||'', e.category||'', e.description||'', (parseFloat(e.amount||0)).toFixed(2), e.paymentType||'', info.num, info.cust, e.reviewStatus||'pending', e.reviewNote||'', e.reviewedBy||'', (e.paymentType===REIMB_PAYTYPE?(e.reimbursed?'Yes':'No'):'n/a'), (e.reimbursedAt||'').slice(0,10) ].map(q).join(','));
    });
    var blob=new Blob([lines.join('\n')],{type:'text/csv'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download='expenses-'+_today()+'.csv'; document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },100);
    if (typeof showToast==='function') showToast('Exported '+rows.length+' rows','success');
  }

  // Close the People panel when clicking anywhere outside it (not just re-clicking the button).
  document.addEventListener('click', function(ev){
    if (!_expPeoplePanel) return;
    var panel=document.getElementById('exp-people-panel');
    var btn=document.getElementById('exp-people-btn');
    if (!panel) return;
    if (panel.contains(ev.target) || (btn && btn.contains(ev.target))) return;  // inside panel or on the button → leave it
    _expPeoplePanel=false; panel.style.display='none';
  });

  // ---------- exports ----------
  window.renderExpensesPage=renderExpensesPage;
  window.loadAllExpenses=loadAllExpenses;
  window.expApprove=expApprove; window.expFlag=expFlag; window.expUnflag=expUnflag; window.expMarkReimbursed=expMarkReimbursed;
  window.exportExpensesCSV=exportExpensesCSV;
})();
