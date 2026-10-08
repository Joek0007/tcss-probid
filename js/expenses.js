// ============================================================
// expenses.js — Expenses Review page
// ------------------------------------------------------------
// One central list of every expense logged across all work orders, so the office
// can REVIEW what techs logged, FLAG off-policy items up to owners/managers, and
// track REIMBURSEMENT for anything not bought on a TCSS card (payment type
// "Employee Paid Cash").
//
// Expenses are normally lazy-loaded per-WO (ensureWOExpensesLoaded); this page needs
// them all, so loadAllExpenses() pulls the whole wo_expenses table into DB.woExpenses
// (merging, not clobbering). Row edits persist via the same targeted push every other
// expense write uses (_pushWOExpenseToCloud), which now carries the review/reimburse
// columns added by the 2026-10 schema change.
//
// Page access is gated by page.expenses (office/owner by default — see PERM_DEFS).
// "Anyone in the office" who can open the page can approve/flag/reimburse.
// ============================================================
(function(){
  'use strict';

  var REIMB_PAYTYPE = 'Employee Paid Cash';   // the out-of-pocket bucket that needs paying back

  var _expFilter = { from:'', to:'', person:'', payType:'', category:'', status:'', needsReimb:false, q:'' };
  var _expLoadedOnce = false;

  function _money(n){ return '$'+(parseFloat(n||0)).toFixed(2); }
  function _today(){ return (typeof getTodayISO==='function') ? getTodayISO() : new Date().toISOString().slice(0,10); }
  function _esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s); }
  function _me(){ return (window._currentUser && (_currentUser.full_name||_currentUser.name)) || 'Office'; }

  // ---- Load the FULL wo_expenses table (review needs all of them) ----
  async function loadAllExpenses(){
    var sb = window._sb; if(!sb) return;
    var r;
    try { r = await sb.from('wo_expenses').select('*').order('expense_date',{ascending:false}); }
    catch(e){ console.warn('[Expenses load]', e.message||e); return; }
    if (r.error){ console.warn('[Expenses load]', r.error.message); return; }
    if (!DB.woExpenses) DB.woExpenses = [];
    var byId = {}; DB.woExpenses.forEach(function(e){ if(e&&e.id) byId[e.id]=e; });
    var delWE = (DB.deletedIds && DB.deletedIds.woExpenses) || [];
    (r.data||[]).forEach(function(e){
      if (delWE.indexOf(String(e.id))>=0) return;
      var obj = {
        id:e.id, woId:e.wo_id, category:e.category, description:e.description, amount:e.amount,
        paymentType:e.payment_type, date:e.expense_date, loggedBy:e.logged_by,
        receiptUrl:e.receipt_url, receiptDocId:e.receipt_doc_id, createdAt:e.created_at,
        reviewStatus:e.review_status||'pending', reviewNote:e.review_note||'',
        reviewedBy:e.reviewed_by||'', reviewedAt:e.reviewed_at||'',
        reimbursed:!!e.reimbursed, reimbursedAt:e.reimbursed_at||''
      };
      if (byId[e.id]) Object.assign(byId[e.id], obj); else { DB.woExpenses.push(obj); byId[e.id]=obj; }
    });
    _expLoadedOnce = true;
  }

  function _woInfo(woId){
    var wo = (DB.workOrders||[]).find(function(w){ return w.id===woId; });
    if (wo) return { num:wo.woNumber||('WO '+String(woId).slice(0,6)), cust:wo.customerName||'' };
    return { num:(woId? ('WO '+String(woId).slice(0,6)) : '—'), cust:'' };
  }

  function _people(){
    var s={}; (DB.woExpenses||[]).forEach(function(e){ if(e.loggedBy) s[e.loggedBy]=1; });
    return Object.keys(s).sort();
  }
  function _payTypes(){
    return (DB.woSettings && DB.woSettings.expensePayTypes) ||
           (typeof WO_EXPENSE_PAY_TYPES!=='undefined' ? WO_EXPENSE_PAY_TYPES : [REIMB_PAYTYPE]);
  }
  function _cats(){
    return (DB.woSettings && DB.woSettings.expenseCats) ||
           (typeof WO_EXPENSE_CATS!=='undefined' ? WO_EXPENSE_CATS : []);
  }

  function _filtered(){
    var f=_expFilter;
    return (DB.woExpenses||[]).filter(function(e){
      if (!e) return false;
      if (f.from && (e.date||'') < f.from) return false;
      if (f.to   && (e.date||'') > f.to)   return false;
      if (f.person  && e.loggedBy   !== f.person)  return false;
      if (f.payType && e.paymentType!== f.payType) return false;
      if (f.category&& e.category   !== f.category) return false;
      if (f.status  && (e.reviewStatus||'pending') !== f.status) return false;
      if (f.needsReimb && !(e.paymentType===REIMB_PAYTYPE && !e.reimbursed)) return false;
      if (f.q){
        var info=_woInfo(e.woId);
        var hay=[e.description,e.category,e.loggedBy,info.num,info.cust].join(' ').toLowerCase();
        if (hay.indexOf(f.q.toLowerCase())<0) return false;
      }
      return true;
    }).sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
  }

  function _statusChip(e){
    var s=e.reviewStatus||'pending';
    var map={pending:['#fff8e1','#f57f17','Pending'], approved:['#e8f5e9','#2e7d32','Approved'], flagged:['#ffebee','#c62828','🚩 Flagged']};
    var c=map[s]||map.pending;
    var note = (s==='flagged' && e.reviewNote) ? ' title="'+_esc(e.reviewNote)+'"' : '';
    return '<span'+note+' style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+c[0]+';color:'+c[1]+'">'+c[2]+'</span>';
  }
  function _reimbCell(e){
    if (e.paymentType!==REIMB_PAYTYPE) return '<span style="color:#cfd8dc">—</span>';
    if (e.reimbursed) return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#e8f5e9;color:#2e7d32">✓ '+_esc((e.reimbursedAt||'').slice(0,10))+'</span>';
    return '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:#fff3e0;color:#e65100">Owed</span>';
  }

  function renderExpensesPage(){
    var page=document.getElementById('page-expenses'); if(!page) return;
    if (!_expLoadedOnce){
      page.innerHTML='<div style="padding:28px;text-align:center;color:#90a4ae">Loading expenses…</div>';
      loadAllExpenses().then(_drawExpenses);
    } else {
      _drawExpenses();
      loadAllExpenses().then(_drawExpenses); // refresh in background
    }
  }

  function _opt(val,cur,label){ return '<option value="'+_esc(val)+'"'+(val===cur?' selected':'')+'>'+_esc(label||val)+'</option>'; }

  // Build the page SHELL once (header + filters + an empty results container). The filter
  // controls are never rebuilt after this, so typing in the search keeps focus — only
  // #exp-results re-renders on a filter/action change (via _drawResults).
  function _drawExpenses(){
    var page=document.getElementById('page-expenses'); if(!page) return;
    var f=_expFilter;
    var people=_people(), pays=_payTypes(), cats=_cats();
    var inpCss='padding:7px 9px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px';

    var html='';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'+
      '<h2 style="margin:0;font-size:20px;font-weight:800;color:#0d1b2a">💰 Expenses Review</h2>'+
      '<button class="btn btn-outline btn-sm" onclick="exportExpensesCSV()">⬇ Export CSV</button>'+
    '</div>';

    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'+
      '<input id="exp-f-from" type="date" value="'+_esc(f.from)+'" onchange="_expSetFilter(\'from\',this.value)" style="'+inpCss+'" title="From">'+
      '<span style="color:#90a4ae">→</span>'+
      '<input id="exp-f-to" type="date" value="'+_esc(f.to)+'" onchange="_expSetFilter(\'to\',this.value)" style="'+inpCss+'" title="To">'+
      '<select id="exp-f-person" onchange="_expSetFilter(\'person\',this.value)" style="'+inpCss+'">'+_opt('',f.person,'All people')+people.map(function(p){return _opt(p,f.person);}).join('')+'</select>'+
      '<select id="exp-f-pay" onchange="_expSetFilter(\'payType\',this.value)" style="'+inpCss+'">'+_opt('',f.payType,'All pay types')+pays.map(function(p){return _opt(p,f.payType);}).join('')+'</select>'+
      '<select id="exp-f-cat" onchange="_expSetFilter(\'category\',this.value)" style="'+inpCss+'">'+_opt('',f.category,'All categories')+cats.map(function(c){return _opt(c,f.category);}).join('')+'</select>'+
      '<select id="exp-f-status" onchange="_expSetFilter(\'status\',this.value)" style="'+inpCss+'">'+_opt('',f.status,'All statuses')+_opt('pending',f.status,'Pending')+_opt('approved',f.status,'Approved')+_opt('flagged',f.status,'Flagged')+'</select>'+
      '<label style="font-size:12px;font-weight:700;color:#e65100;display:flex;align-items:center;gap:5px;cursor:pointer;background:#fff3e0;border:1px solid #ffe0b2;border-radius:6px;padding:6px 10px">'+
        '<input id="exp-f-reimb" type="checkbox" '+(f.needsReimb?'checked':'')+' onchange="_expSetFilter(\'needsReimb\',this.checked)">Needs reimbursement</label>'+
      '<input id="exp-f-q" type="text" placeholder="🔍 search" value="'+_esc(f.q)+'" oninput="_expSetFilter(\'q\',this.value)" style="'+inpCss+';min-width:150px;flex:1">'+
      '<button id="exp-f-clear" class="btn btn-ghost btn-sm" onclick="_expClearFilters()" style="display:'+(_filterActive()?'':'none')+'">✕ clear</button>'+
    '</div>';

    html+='<div id="exp-results"></div>';
    page.innerHTML=html;
    _drawResults();
  }

  // Re-render ONLY the totals + table (leaves the filter inputs untouched so focus/caret stay put).
  function _drawResults(){
    var box=document.getElementById('exp-results'); if(!box) return;
    var rows=_filtered();
    var total=rows.reduce(function(s,e){return s+parseFloat(e.amount||0);},0);
    var pending=rows.filter(function(e){return (e.reviewStatus||'pending')==='pending';}).length;
    var flagged=rows.filter(function(e){return e.reviewStatus==='flagged';}).length;
    var owed=rows.filter(function(e){return e.paymentType===REIMB_PAYTYPE && !e.reimbursed;})
                 .reduce(function(s,e){return s+parseFloat(e.amount||0);},0);
    var cb=document.getElementById('exp-f-clear'); if(cb) cb.style.display=_filterActive()?'':'none';

    function tile(lbl,val,clr){ return '<div style="flex:1;min-width:130px;background:#fff;border:1px solid #e0e7ef;border-radius:10px;padding:10px 14px">'+
      '<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+lbl+'</div>'+
      '<div style="font-size:20px;font-weight:800;color:'+(clr||'#0d1b2a')+'">'+val+'</div></div>'; }
    var html='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'+
      tile('Showing', _money(total)+' · '+rows.length, '#0d1b2a')+
      tile('Pending review', pending, pending?'#f57f17':'#90a4ae')+
      tile('Flagged', flagged, flagged?'#c62828':'#90a4ae')+
      tile('Owed (reimburse)', _money(owed), owed?'#e65100':'#2e7d32')+
    '</div>';

    if (!rows.length){
      html+='<div style="padding:40px;text-align:center;color:#90a4ae;background:#f8f9fa;border-radius:12px">'+
        ((DB.woExpenses&&DB.woExpenses.length)?'No expenses match these filters.':'No expenses logged yet. They appear here as techs add them on work orders.')+'</div>';
      box.innerHTML=html; return;
    }

    var MAX_ROWS = 400;
    var shown = rows.slice(0, MAX_ROWS);
    if (rows.length > MAX_ROWS){
      html+='<div style="font-size:12px;color:#e65100;background:#fff8e1;border:1px solid #ffe0b2;border-radius:8px;padding:8px 12px;margin-bottom:8px">'+
        'Showing the '+MAX_ROWS+' most recent of '+rows.length.toLocaleString()+' matching expenses. Use the filters above to narrow down.</div>';
    }

    html+='<div style="overflow-x:auto;background:#fff;border:1px solid #e0e7ef;border-radius:12px">'+
      '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
      '<thead><tr style="background:#f8f9fa;text-align:left">'+
        ['Date','Logged by','Category','Description','Amount','Paid with','Work Order','Receipt','Status','Reimburse','Actions']
          .map(function(h){return '<th style="padding:9px 10px;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap">'+h+'</th>';}).join('')+
      '</tr></thead><tbody>';

    shown.forEach(function(e){
      var info=_woInfo(e.woId);
      var isReimb = e.paymentType===REIMB_PAYTYPE;
      var st=e.reviewStatus||'pending';
      var acts='';
      if (st!=='approved') acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#2e7d32;border-color:#a5d6a7" onclick="expApprove(\''+e.id+'\')">✓ Approve</button> ';
      if (st!=='flagged')  acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#c62828;border-color:#ef9a9a" onclick="expFlag(\''+e.id+'\')">🚩 Flag</button> ';
      else acts+='<button class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px" onclick="expUnflag(\''+e.id+'\')">Clear flag</button> ';
      if (isReimb && !e.reimbursed) acts+='<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:11px;color:#e65100;border-color:#ffcc80" onclick="expMarkReimbursed(\''+e.id+'\')">$ Mark reimbursed</button>';

      var rcpt = e.receiptUrl ? '<a href="'+_esc(e.receiptUrl)+'" target="_blank" rel="noopener" title="View receipt" style="text-decoration:none;font-size:16px">🧾</a>' : '<span style="color:#cfd8dc">—</span>';

      html+='<tr style="border-top:1px solid #f0f4f8">'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc((e.date||'').slice(0,10))+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc(e.loggedBy||'—')+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+_esc(e.category||'—')+'</td>'+
        '<td style="padding:9px 10px">'+_esc(e.description||'')+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap;font-weight:700">'+_money(e.amount)+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+(isReimb?'<span style="color:#e65100;font-weight:600">'+_esc(e.paymentType)+'</span>':_esc(e.paymentType||'—'))+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap"><a href="javascript:void(0)" onclick="openWorkOrder(\''+_esc(e.woId)+'\')" style="color:#1565c0;font-weight:600;text-decoration:none">'+_esc(info.num)+'</a>'+(info.cust?'<div style="font-size:11px;color:#90a4ae">'+_esc(info.cust)+'</div>':'')+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+rcpt+'</td>'+
        '<td style="padding:9px 10px">'+_statusChip(e)+(e.reviewedBy?'<div style="font-size:10px;color:#b0bec5;margin-top:2px">'+_esc(e.reviewedBy)+'</div>':'')+'</td>'+
        '<td style="padding:9px 10px;text-align:center">'+_reimbCell(e)+'</td>'+
        '<td style="padding:9px 10px;white-space:nowrap">'+acts+'</td>'+
      '</tr>';
    });
    html+='</tbody></table></div>';

    box.innerHTML=html;
  }

  function _filterActive(){ var f=_expFilter; return !!(f.from||f.to||f.person||f.payType||f.category||f.status||f.needsReimb||f.q); }

  // ---- Persist one expense's change to the cloud (targeted push + local save) ----
  function _expPersist(e){
    if (typeof _pushWOExpenseToCloud==='function') _pushWOExpenseToCloud(e);
    if (typeof saveDB==='function') saveDB();
  }
  function _findExp(id){ return (DB.woExpenses||[]).find(function(e){return e.id===id;}); }

  function expApprove(id){
    var e=_findExp(id); if(!e) return;
    e.reviewStatus='approved'; e.reviewNote=''; e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString();
    _expPersist(e); _drawResults();
    if (typeof showToast==='function') showToast('Expense approved','success');
  }

  function expFlag(id){
    var e=_findExp(id); if(!e) return;
    var note = window.prompt('Why is this flagged? (owners/managers will see this note)', e.reviewNote||'');
    if (note===null) return;           // cancelled
    e.reviewStatus='flagged'; e.reviewNote=(note||'').trim(); e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString();
    _expPersist(e); _drawResults();
    // Notify owners/managers
    var info=_woInfo(e.woId);
    if (typeof addNotification==='function'){
      addNotification('expense_flagged',
        '🚩 Expense Flagged — '+info.num,
        _me()+' flagged '+_money(e.amount)+' ('+(e.category||'')+', '+(e.loggedBy||'')+')'+(e.reviewNote?': '+e.reviewNote:''),
        'wo');
    }
    if (typeof showToast==='function') showToast('Flagged for owner/manager','success');
  }

  function expUnflag(id){
    var e=_findExp(id); if(!e) return;
    e.reviewStatus='pending'; e.reviewNote=''; e.reviewedBy=_me(); e.reviewedAt=new Date().toISOString();
    _expPersist(e); _drawResults();
  }

  function expMarkReimbursed(id){
    var e=_findExp(id); if(!e) return;
    e.reimbursed=true; e.reimbursedAt=_today();
    _expPersist(e); _drawResults();
    if (typeof showToast==='function') showToast('Marked reimbursed','success');
  }

  function exportExpensesCSV(){
    var rows=_filtered();
    var cols=['Date','Logged By','Category','Description','Amount','Paid With','WO Number','Customer','Review Status','Review Note','Reviewed By','Reimbursed','Reimbursed On'];
    function q(v){ v=(v==null?'':String(v)); return '"'+v.replace(/"/g,'""')+'"'; }
    var lines=[cols.map(q).join(',')];
    rows.forEach(function(e){
      var info=_woInfo(e.woId);
      lines.push([ (e.date||'').slice(0,10), e.loggedBy||'', e.category||'', e.description||'',
        (parseFloat(e.amount||0)).toFixed(2), e.paymentType||'', info.num, info.cust,
        e.reviewStatus||'pending', e.reviewNote||'', e.reviewedBy||'',
        (e.paymentType===REIMB_PAYTYPE ? (e.reimbursed?'Yes':'No') : 'n/a'),
        (e.reimbursedAt||'').slice(0,10) ].map(q).join(','));
    });
    var blob=new Blob([lines.join('\n')],{type:'text/csv'});
    var url=URL.createObjectURL(blob); var a=document.createElement('a');
    a.href=url; a.download='expenses-'+_today()+'.csv'; document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },100);
  }

  // ---- exports ----
  window.renderExpensesPage = renderExpensesPage;
  window.loadAllExpenses    = loadAllExpenses;
  window.expApprove         = expApprove;
  window.expFlag            = expFlag;
  window.expUnflag          = expUnflag;
  window.expMarkReimbursed  = expMarkReimbursed;
  window.exportExpensesCSV  = exportExpensesCSV;
  var _qTimer=null;
  window._expSetFilter = function(k,v){
    _expFilter[k]=v;
    // Debounce the free-text search so fast typing doesn't re-render per keystroke;
    // other filters apply immediately. Only #exp-results re-renders, so the input keeps focus.
    if (k==='q'){ clearTimeout(_qTimer); _qTimer=setTimeout(_drawResults, 180); }
    else _drawResults();
  };
  window._expClearFilters = function(){
    _expFilter={from:'',to:'',person:'',payType:'',category:'',status:'',needsReimb:false,q:''};
    ['from','to','q'].forEach(function(id){ var el=document.getElementById('exp-f-'+id); if(el) el.value=''; });
    ['person','pay','cat','status'].forEach(function(id){ var el=document.getElementById('exp-f-'+id); if(el) el.value=''; });
    var rb=document.getElementById('exp-f-reimb'); if(rb) rb.checked=false;
    _drawResults();
  };
})();
