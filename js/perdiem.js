// ============================================================
// perdiem.js — Per-Diem tracker
// ------------------------------------------------------------
// Back-office workspace for per-diem owed to techs on overnight trips.
// Model: flat rate per overnight stay (default $40). nights × rate = owed.
// Partial payments are tracked individually (amount, date, method: Paper Check /
// Digital / Cash), and the running balance = owed − sum(payments). So if a tech was
// paid for 10 nights by check but stayed 13, the entry shows 3 nights still owed; log
// a second payment (e.g. Digital) and the balance clears.
//
// SAFETY (same discipline as expenses.js): this module keeps its OWN snapshot of the
// per_diem / per_diem_payments tables and writes PER-ROW directly via _sb. It NEVER
// touches DB.* or calls saveDB()/pushAllToCloud(), so it cannot clobber the app's
// synced blob. Rebuilt fresh from the cloud on each page open.
// ============================================================
(function(){
  'use strict';

  var METHODS = ['Paper Check','Digital','Cash'];
  var DEFAULT_RATE = 40;

  var _pdRows = [];        // per_diem entries
  var _pdPays = {};        // per_diem_id -> [payments]
  var _pdLoadedOnce = false;
  var _pdLoading = false;
  var _pdFilterTech = '';  // '' = all
  var _pdShowCleared = false;

  function _money(n){ return '$'+(parseFloat(n||0)).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function _today(){ return (typeof getTodayISO==='function') ? getTodayISO() : new Date().toISOString().slice(0,10); }
  function _esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s); }
  function _attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function _me(){ return (window._currentUser && (_currentUser.full_name||_currentUser.name)) || 'Office'; }
  function _num(v,d){ var n=parseFloat(v); return isNaN(n)?(d||0):n; }

  function _activePeople(){
    return (DB.team||[])
      .filter(function(t){ return t.active!==false && t.is_active!==false && t.status!=='inactive' && t.status!=='terminated'; })
      .map(function(t){ return t.name||t.full_name; }).filter(Boolean)
      .filter(function(v,i,a){ return a.indexOf(v)===i; }).sort();
  }
  // Work orders for the optional link selector — newest WO number first.
  function _woList(){
    return (DB.workOrders||[]).map(function(w){
      return { id:w.id, label:(w.woNumber||('WO '+String(w.id).slice(0,6)))+(w.customerName?' · '+w.customerName:'') };
    }).sort(function(a,b){ return String(b.label).localeCompare(String(a.label)); });
  }
  function _woLabelFor(woId){
    var w=(DB.workOrders||[]).find(function(x){ return x.id===woId; });
    if (w) return (w.woNumber||('WO '+String(woId).slice(0,6)))+(w.customerName?' · '+w.customerName:'');
    return woId ? ('WO '+String(woId).slice(0,6)) : '';
  }

  // ---------- Load ----------
  async function loadAllPerDiem(){
    var sb=window._sb; if(!sb){ _pdLoadedOnce=true; return; }
    _pdLoading=true;
    try {
      var pd = await sb.from('per_diem').select('*').order('created_at',{ascending:false});
      if (pd.error) throw pd.error;
      _pdRows = (pd.data||[]).map(function(r){
        return { id:r.id, techName:r.tech_name, techUserId:r.tech_user_id, tripLabel:r.trip_label||'',
          startDate:r.start_date||'', endDate:r.end_date||'', nights:parseInt(r.nights||0,10)||0,
          rate:(r.rate==null?DEFAULT_RATE:parseFloat(r.rate)), notes:r.notes||'', woId:r.wo_id||'',
          createdAt:r.created_at, createdBy:r.created_by||'' };
      });
      var pay = await sb.from('per_diem_payments').select('*').order('paid_on',{ascending:true,nullsFirst:true});
      if (pay.error) throw pay.error;
      _pdPays={};
      (pay.data||[]).forEach(function(p){
        var k=p.per_diem_id; if(!_pdPays[k]) _pdPays[k]=[];
        _pdPays[k].push({ id:p.id, perDiemId:k, amount:parseFloat(p.amount||0), paidOn:p.paid_on||'',
          method:p.method||'', note:p.note||'' });
      });
    } catch(e){ console.warn('[PerDiem load]', (e&&e.message)||e); }
    _pdLoadedOnce=true; _pdLoading=false;
  }

  function _owed(e){ return (e.nights||0)*(e.rate||0); }
  function _paid(e){ return (_pdPays[e.id]||[]).reduce(function(s,p){return s+(p.amount||0);},0); }
  function _balance(e){ return _owed(e)-_paid(e); }
  // Age stamp from the entry's creation date — so on multi-week jobs you can see how old
  // a per-diem is at a glance. Returns {text, days}. Goes amber past 14 days.
  var _MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function _ageStamp(iso){
    if(!iso) return null;
    var d=new Date(iso); if(isNaN(d.getTime())) return null;
    var days=Math.floor((Date.now()-d.getTime())/86400000);
    var ago = days<=0 ? 'today' : (days===1?'1 day ago':days+' days ago');
    return { text:'Added '+_MON[d.getMonth()]+' '+d.getDate()+' · '+ago, days:days };
  }

  // ---------- Render ----------
  function renderPerDiemPage(){
    var page=document.getElementById('page-perdiem'); if(!page) return;
    if (_pdLoadedOnce){ loadAllPerDiem().then(_pdDraw); _pdDraw(); return; }
    page.innerHTML='<div style="padding:28px;text-align:center;color:#90a4ae">Loading per-diem…</div>';
    loadAllPerDiem().then(_pdDraw);
  }

  function _pdRowsFiltered(){
    return _pdRows.filter(function(e){
      if (_pdFilterTech && e.techName!==_pdFilterTech) return false;
      if (!_pdShowCleared && _balance(e)<=0 && _paid(e)>0) return false; // hide fully-paid unless toggled
      return true;
    });
  }

  function _pdDraw(){
    var page=document.getElementById('page-perdiem'); if(!page) return;
    var people=_activePeople();
    var allRows=_pdRows.slice();
    var totalOwed=allRows.reduce(function(s,e){ var b=_balance(e); return s+(b>0?b:0); },0);
    var openCount=allRows.filter(function(e){ return _balance(e)>0; }).length;

    var html='';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'+
      '<h2 style="margin:0;font-size:20px;font-weight:800;color:#0d1b2a">🧳 Per-Diem</h2>'+
      '<button class="btn btn-primary btn-sm" onclick="_pdOpenEntry()">+ New per-diem</button>'+
    '</div>';

    // Tiles
    function tile(lbl,val,clr){ return '<div style="flex:1;min-width:150px;background:#fff;border:1px solid #e0e7ef;border-radius:10px;padding:10px 14px">'+
      '<div style="font-size:11px;font-weight:700;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+lbl+'</div>'+
      '<div style="font-size:20px;font-weight:800;color:'+(clr||'#0d1b2a')+'">'+val+'</div></div>'; }
    html+='<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'+
      tile('Total owed', _money(totalOwed), totalOwed>0?'#e65100':'#2e7d32')+
      tile('Open entries', openCount, openCount?'#e65100':'#2e7d32')+
      tile('All entries', allRows.length, '#0d1b2a')+
    '</div>';

    // Controls
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'+
      '<select onchange="_pdSetTech(this.value)" style="padding:7px 9px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px">'+
        '<option value=""'+(_pdFilterTech===''?' selected':'')+'>All techs</option>'+
        people.map(function(n){ return '<option value="'+_attr(n)+'"'+(n===_pdFilterTech?' selected':'')+'>'+_esc(n)+'</option>'; }).join('')+
      '</select>'+
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#607d8b;cursor:pointer"><input type="checkbox" '+(_pdShowCleared?'checked':'')+' onclick="_pdToggleCleared()"> Show paid-off</label>'+
    '</div>';

    var rows=_pdRowsFiltered();
    if (_pdLoading && !_pdRows.length){ page.innerHTML=html+'<div style="padding:24px;text-align:center;color:#90a4ae">Loading…</div>'; return; }
    if (!rows.length){
      html+='<div style="padding:40px;text-align:center;color:#90a4ae;background:#f8f9fa;border-radius:12px">'+
        (_pdRows.length ? 'Nothing matches — try "Show paid-off" or a different tech.' : 'No per-diem entries yet. Click “+ New per-diem” to add one.')+'</div>';
      page.innerHTML=html; return;
    }

    html+='<div style="display:flex;flex-direction:column;gap:10px">';
    rows.forEach(function(e){
      var owed=_owed(e), paid=_paid(e), bal=_balance(e);
      var pays=_pdPays[e.id]||[];
      var balClr = bal>0 ? '#e65100' : '#2e7d32';
      var balLbl = bal>0 ? _money(bal)+' owed' : (paid>0 ? 'Paid in full' : _money(0));
      var dateRange = (e.startDate||e.endDate) ? (_esc((e.startDate||'?').slice(0,10))+' → '+_esc((e.endDate||'?').slice(0,10))) : '';
      html+='<div style="background:#fff;border:1px solid #e0e7ef;border-radius:12px;padding:14px 16px">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">'+
          '<div>'+
            '<div style="font-size:15px;font-weight:800;color:#0d1b2a">'+_esc(e.techName||'—')+(e.tripLabel?' <span style="font-weight:600;color:#607d8b">· '+_esc(e.tripLabel)+'</span>':'')+'</div>'+
            '<div style="font-size:12px;color:#90a4ae;margin-top:2px">'+
              e.nights+' night'+(e.nights===1?'':'s')+' × '+_money(e.rate)+' = <b style="color:#37474f">'+_money(owed)+'</b>'+
              (dateRange?' &nbsp;·&nbsp; '+dateRange:'')+
            '</div>'+
            (e.woId?'<div style="font-size:12px;margin-top:4px">🔧 <a href="javascript:void(0)" onclick="openWorkOrder(\''+_attr(e.woId)+'\')" style="color:#1565c0;font-weight:600;text-decoration:none">'+_esc(_woLabelFor(e.woId))+'</a></div>':'')+
            (function(){ var a=_ageStamp(e.createdAt); return a?'<div style="font-size:11px;margin-top:4px;color:'+(a.days>14?'#e65100':'#b0bec5')+';font-weight:'+(a.days>14?'700':'400')+'">🕒 '+_esc(a.text)+'</div>':''; })()+
            (e.notes?'<div style="font-size:12px;color:#607d8b;margin-top:4px;max-width:520px">'+_esc(e.notes)+'</div>':'')+
          '</div>'+
          '<div style="text-align:right">'+
            '<div style="font-size:18px;font-weight:800;color:'+balClr+'">'+balLbl+'</div>'+
            '<div style="font-size:11px;color:#90a4ae">paid '+_money(paid)+' of '+_money(owed)+'</div>'+
          '</div>'+
        '</div>'+
        // payments list
        (pays.length ? '<div style="margin-top:10px;border-top:1px solid #f0f4f8;padding-top:8px;display:flex;flex-direction:column;gap:4px">'+
          pays.map(function(p){
            return '<div style="display:flex;align-items:center;gap:10px;font-size:12px;color:#546e7a">'+
              '<span style="font-weight:700;color:#2e7d32;min-width:80px">'+_money(p.amount)+'</span>'+
              '<span style="min-width:90px">'+_esc((p.paidOn||'').slice(0,10)||'—')+'</span>'+
              '<span style="background:#eef3fb;border-radius:10px;padding:1px 8px;color:#1565c0;font-weight:600">'+_esc(p.method||'—')+'</span>'+
              (p.note?'<span style="color:#90a4ae">'+_esc(p.note)+'</span>':'')+
              '<button title="Remove payment" onclick="_pdDelPay(\''+p.id+'\',\''+e.id+'\')" style="margin-left:auto;background:none;border:none;color:#c62828;cursor:pointer;font-size:14px">×</button>'+
            '</div>';
          }).join('')+
        '</div>' : '')+
        // actions
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'+
          (bal>0 ? '<button class="btn btn-outline btn-sm" style="font-size:12px;color:#2e7d32;border-color:#a5d6a7" onclick="_pdOpenPay(\''+e.id+'\')">$ Record payment</button>' : '')+
          '<button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="_pdOpenEntry(\''+e.id+'\')">Edit</button>'+
          '<button class="btn btn-ghost btn-sm" style="font-size:12px;color:#c62828" onclick="_pdDelEntry(\''+e.id+'\')">Delete</button>'+
        '</div>'+
      '</div>';
    });
    html+='</div>';
    page.innerHTML=html;
  }

  function _find(id){ return _pdRows.find(function(e){return e.id===id;}); }

  // ---------- Entry modal (new / edit) ----------
  function _pdOpenEntry(id){
    _pdCloseModal();
    var e = id ? _find(id) : null;
    var people=_activePeople();
    var wos=_woList();
    var cur = e ? e.techName : '';
    if (cur && people.indexOf(cur)<0) people.unshift(cur); // keep an existing (maybe former) name selectable
    var ov=document.createElement('div');
    ov.id='pdm-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    var inpCss='width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e7ef;border-radius:8px;font-size:13px;font-family:inherit';
    ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:480px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.2);max-height:90vh;overflow:auto">'+
      '<div style="font-size:17px;font-weight:800;color:#0d1b2a;margin-bottom:14px">'+(e?'Edit per-diem':'New per-diem')+'</div>'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Tech</label>'+
      '<select id="pdm-tech" style="'+inpCss+';margin:4px 0 12px">'+
        '<option value="">— select —</option>'+
        people.map(function(n){ return '<option value="'+_attr(n)+'"'+(e&&e.techName===n?' selected':'')+'>'+_esc(n)+'</option>'; }).join('')+
      '</select>'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Trip / reason (optional)</label>'+
      '<input id="pdm-trip" type="text" placeholder="e.g. Dallas install" value="'+_attr(e?e.tripLabel:'')+'" style="'+inpCss+';margin:4px 0 12px">'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Work order (optional — adds to that job\'s cost)</label>'+
      '<select id="pdm-wo" style="'+inpCss+';margin:4px 0 12px">'+
        '<option value="">— none —</option>'+
        wos.map(function(w){ return '<option value="'+_attr(w.id)+'"'+(e&&e.woId===w.id?' selected':'')+'>'+_esc(w.label)+'</option>'; }).join('')+
      '</select>'+
      '<div style="display:flex;gap:10px;margin-bottom:12px">'+
        '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#546e7a">Start</label><input id="pdm-start" type="date" value="'+_attr(e?(e.startDate||'').slice(0,10):'')+'" onchange="_pdSuggestNights()" style="'+inpCss+';margin-top:4px"></div>'+
        '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#546e7a">End</label><input id="pdm-end" type="date" value="'+_attr(e?(e.endDate||'').slice(0,10):'')+'" onchange="_pdSuggestNights()" style="'+inpCss+';margin-top:4px"></div>'+
      '</div>'+
      '<div style="display:flex;gap:10px;margin-bottom:12px">'+
        '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#546e7a">Nights</label><input id="pdm-nights" type="number" min="0" step="1" value="'+(e?e.nights:0)+'" oninput="_pdCalcPreview()" style="'+inpCss+';margin-top:4px"></div>'+
        '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#546e7a">Rate / night</label><input id="pdm-rate" type="number" min="0" step="1" value="'+(e?e.rate:DEFAULT_RATE)+'" oninput="_pdCalcPreview()" style="'+inpCss+';margin-top:4px"></div>'+
      '</div>'+
      '<div id="pdm-preview" style="font-size:13px;font-weight:700;color:#37474f;margin-bottom:12px"></div>'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Notes (optional)</label>'+
      '<textarea id="pdm-notes" rows="2" style="'+inpCss+';margin:4px 0 14px">'+_esc(e?e.notes:'')+'</textarea>'+
      '<div style="display:flex;justify-content:flex-end;gap:10px">'+
        '<button class="btn btn-outline" onclick="_pdCloseModal()">Cancel</button>'+
        '<button class="btn btn-primary" onclick="_pdSaveEntry('+(e?'\''+e.id+'\'':'null')+')">Save</button>'+
      '</div></div>';
    document.body.appendChild(ov);
    _pdCalcPreview();
  }
  function _pdSuggestNights(){
    var s=(document.getElementById('pdm-start')||{}).value, en=(document.getElementById('pdm-end')||{}).value;
    var nEl=document.getElementById('pdm-nights'); if(!nEl) return;
    if (s && en){
      var d1=new Date(s+'T00:00:00'), d2=new Date(en+'T00:00:00');
      var diff=Math.round((d2-d1)/86400000);
      if (diff>=0 && (!nEl.value || parseInt(nEl.value,10)===0)) nEl.value=diff;
    }
    _pdCalcPreview();
  }
  function _pdCalcPreview(){
    var n=_num((document.getElementById('pdm-nights')||{}).value,0);
    var r=_num((document.getElementById('pdm-rate')||{}).value,0);
    var box=document.getElementById('pdm-preview'); if(box) box.innerHTML='Owed: '+_money(n*r)+' &nbsp;<span style="font-weight:500;color:#90a4ae">('+n+' × '+_money(r)+')</span>';
  }
  async function _pdSaveEntry(id){
    var tech=(document.getElementById('pdm-tech')||{}).value||'';
    if (!tech){ if(typeof showToast==='function') showToast('Pick a tech','error'); return; }
    var nights=Math.max(0, Math.round(_num((document.getElementById('pdm-nights')||{}).value,0)));
    var rate=_num((document.getElementById('pdm-rate')||{}).value,DEFAULT_RATE);
    var member=(DB.team||[]).find(function(m){ return (m.name||m.full_name)===tech; });
    var row={
      tech_name: tech,
      tech_user_id: (member&&member.userId)||null,
      trip_label: (document.getElementById('pdm-trip')||{}).value||'',
      start_date: (document.getElementById('pdm-start')||{}).value||null,
      end_date: (document.getElementById('pdm-end')||{}).value||null,
      nights: nights,
      rate: rate,
      wo_id: (document.getElementById('pdm-wo')||{}).value||null,
      notes: (document.getElementById('pdm-notes')||{}).value||''
    };
    var sb=window._sb;
    try {
      if (id){
        row.id=id;
        var up=await sb.from('per_diem').update(row).eq('id',id).select().single();
        if (up.error) throw up.error;
        _applyEntry(up.data);
      } else {
        row.created_by=_me();
        var ins=await sb.from('per_diem').insert(row).select().single();
        if (ins.error) throw ins.error;
        _applyEntry(ins.data, true);
      }
      _pdCloseModal(); _pdDraw();
      if (typeof showToast==='function') showToast('Saved','success');
    } catch(err){ if(typeof showToast==='function') showToast('Error: '+((err&&err.message)||err),'error'); console.warn('[PerDiem save]',err); }
  }
  function _applyEntry(r, isNew){
    var mapped={ id:r.id, techName:r.tech_name, techUserId:r.tech_user_id, tripLabel:r.trip_label||'',
      startDate:r.start_date||'', endDate:r.end_date||'', nights:parseInt(r.nights||0,10)||0,
      rate:(r.rate==null?DEFAULT_RATE:parseFloat(r.rate)), notes:r.notes||'', woId:r.wo_id||'', createdAt:r.created_at, createdBy:r.created_by||'' };
    var i=_pdRows.findIndex(function(e){return e.id===r.id;});
    if (i>=0) _pdRows[i]=mapped; else _pdRows.unshift(mapped);
  }

  // ---------- Payment modal ----------
  function _pdOpenPay(entryId){
    _pdCloseModal();
    var e=_find(entryId); if(!e) return;
    var bal=_balance(e);
    var ov=document.createElement('div');
    ov.id='pdm-modal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px';
    var inpCss='width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e0e7ef;border-radius:8px;font-size:13px;font-family:inherit';
    ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.2)">'+
      '<div style="font-size:17px;font-weight:800;color:#0d1b2a;margin-bottom:2px">Record payment</div>'+
      '<div style="font-size:12px;color:#90a4ae;margin-bottom:14px">'+_esc(e.techName)+(e.tripLabel?' · '+_esc(e.tripLabel):'')+' — '+_money(bal)+' owed</div>'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Amount</label>'+
      '<input id="pdm-pay-amt" type="number" min="0" step="0.01" value="'+(bal>0?bal:0)+'" style="'+inpCss+';margin:4px 0 12px">'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Date paid</label>'+
      '<input id="pdm-pay-date" type="date" value="'+_attr(_today())+'" style="'+inpCss+';margin:4px 0 12px">'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Method</label>'+
      '<select id="pdm-pay-method" style="'+inpCss+';margin:4px 0 12px">'+
        METHODS.map(function(m){ return '<option value="'+_attr(m)+'">'+_esc(m)+'</option>'; }).join('')+
      '</select>'+
      '<label style="font-size:12px;font-weight:700;color:#546e7a">Note (optional)</label>'+
      '<input id="pdm-pay-note" type="text" placeholder="e.g. check #1042" style="'+inpCss+';margin:4px 0 14px">'+
      '<div style="display:flex;justify-content:flex-end;gap:10px">'+
        '<button class="btn btn-outline" onclick="_pdCloseModal()">Cancel</button>'+
        '<button class="btn btn-primary" onclick="_pdSavePay(\''+entryId+'\')">Record</button>'+
      '</div></div>';
    document.body.appendChild(ov);
    setTimeout(function(){ var a=document.getElementById('pdm-pay-amt'); if(a){a.focus();a.select();} },50);
  }
  async function _pdSavePay(entryId){
    var amt=_num((document.getElementById('pdm-pay-amt')||{}).value,0);
    if (!(amt>0)){ if(typeof showToast==='function') showToast('Enter an amount','error'); return; }
    var row={
      per_diem_id: entryId,
      amount: amt,
      paid_on: (document.getElementById('pdm-pay-date')||{}).value||_today(),
      method: (document.getElementById('pdm-pay-method')||{}).value||'',
      note: (document.getElementById('pdm-pay-note')||{}).value||'',
      created_by: _me()
    };
    try {
      var ins=await window._sb.from('per_diem_payments').insert(row).select().single();
      if (ins.error) throw ins.error;
      var p=ins.data;
      if(!_pdPays[entryId]) _pdPays[entryId]=[];
      _pdPays[entryId].push({ id:p.id, perDiemId:entryId, amount:parseFloat(p.amount||0), paidOn:p.paid_on||'', method:p.method||'', note:p.note||'' });
      _pdCloseModal(); _pdDraw();
      if (typeof showToast==='function') showToast('Payment recorded','success');
    } catch(err){ if(typeof showToast==='function') showToast('Error: '+((err&&err.message)||err),'error'); console.warn('[PerDiem pay]',err); }
  }
  async function _pdDelPay(payId, entryId){
    if (!confirm('Remove this payment?')) return;
    try {
      var r=await window._sb.from('per_diem_payments').delete().eq('id',payId);
      if (r.error) throw r.error;
      _pdPays[entryId]=(_pdPays[entryId]||[]).filter(function(p){return p.id!==payId;});
      _pdDraw();
    } catch(err){ if(typeof showToast==='function') showToast('Error: '+((err&&err.message)||err),'error'); }
  }
  async function _pdDelEntry(id){
    var e=_find(id); if(!e) return;
    if (!confirm('Delete this per-diem entry for '+(e.techName||'')+'? This also removes its payments.')) return;
    try {
      var r=await window._sb.from('per_diem').delete().eq('id',id);
      if (r.error) throw r.error;
      _pdRows=_pdRows.filter(function(x){return x.id!==id;});
      delete _pdPays[id];
      _pdDraw();
      if (typeof showToast==='function') showToast('Deleted','success');
    } catch(err){ if(typeof showToast==='function') showToast('Error: '+((err&&err.message)||err),'error'); }
  }

  function _pdCloseModal(){ var m=document.getElementById('pdm-modal'); if(m) m.remove(); }

  // ---------- Work-order rollup (internal cost; NOT billed) ----------
  // Fetch per-diem entries linked to a work order. Returns [{name,nights,rate,amount}].
  async function _woPerDiemFetch(woId){
    var sb=window._sb; if(!sb || !woId) return [];
    try {
      var r=await sb.from('per_diem').select('tech_name,nights,rate').eq('wo_id',woId);
      if (r.error) return [];
      return (r.data||[]).map(function(x){
        var n=parseInt(x.nights||0,10)||0, rt=(x.rate==null?DEFAULT_RATE:parseFloat(x.rate));
        return { name:x.tech_name||'—', nights:n, rate:rt, amount:n*rt };
      });
    } catch(e){ return []; }
  }

  // Called by the WO Expenses tab. Shows each linked per-diem WITH the tech's name, and folds
  // it into the job's total. Display-only; never touches the invoice. Fills #wo-perdiem-rollup.
  async function woPerDiemRollup(woId, expenseTotal){
    var box=document.getElementById('wo-perdiem-rollup'); if(!box) return;
    if(!woId){ box.innerHTML=''; return; }
    var rows=await _woPerDiemFetch(woId);
    if (!rows.length){ box.innerHTML=''; return; }
    var pd=rows.reduce(function(s,x){ return s+x.amount; },0);
    var combined=(parseFloat(expenseTotal||0))+pd;
    var lines=rows.map(function(x){
      return '<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#8a6d3b;padding:1px 0">'+
        '<span>'+_esc(x.name)+' <span style="color:#b08d57">· '+x.nights+' night'+(x.nights===1?'':'s')+' × '+_money(x.rate)+'</span></span>'+
        '<b>'+_money(x.amount)+'</b></div>';
    }).join('');
    box.innerHTML='<div style="background:#fff3e0;border:1px solid #ffe0b2;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px">'+
      '<div style="font-weight:800;color:#8a6d3b;margin-bottom:4px">🧳 Per-Diem (linked) — '+_money(pd)+' · '+rows.length+' entr'+(rows.length===1?'y':'ies')+'</div>'+
      lines+
      '<div style="border-top:1px solid #ffe0b2;margin-top:6px;padding-top:6px;font-size:13px;color:#5d4037">Total job cost incl. per-diem: <b>'+_money(combined)+'</b> <span style="font-weight:500;color:#8a6d3b">(internal — not billed to customer)</span></div>'+
    '</div>';
  }

  // Fold per-diem into the WO summary EXPENSES tile so it doesn't misleadingly read $0.
  async function woPerDiemTile(woId, expenseTotal, expenseCount){
    if(!woId) return;
    var rows=await _woPerDiemFetch(woId);
    if(!rows.length) return;  // nothing linked — leave the tile as the plain expense total
    var pd=rows.reduce(function(s,x){ return s+x.amount; },0);
    var totEl=document.getElementById('wo-expense-total');
    var cntEl=document.getElementById('wo-expense-count');
    if (totEl) totEl.textContent=_money((parseFloat(expenseTotal||0))+pd);
    if (cntEl) cntEl.textContent=(expenseCount||0)+' exp · +'+_money(pd)+' per-diem';
  }

  // ---------- exports ----------
  window.woPerDiemRollup=woPerDiemRollup;
  window.woPerDiemTile=woPerDiemTile;
  window.renderPerDiemPage=renderPerDiemPage;
  window.loadAllPerDiem=loadAllPerDiem;
  window._pdOpenEntry=_pdOpenEntry; window._pdSaveEntry=_pdSaveEntry;
  window._pdOpenPay=_pdOpenPay; window._pdSavePay=_pdSavePay;
  window._pdDelPay=_pdDelPay; window._pdDelEntry=_pdDelEntry;
  window._pdCloseModal=_pdCloseModal; window._pdSuggestNights=_pdSuggestNights; window._pdCalcPreview=_pdCalcPreview;
  window._pdSetTech=function(v){ _pdFilterTech=v; _pdDraw(); };
  window._pdToggleCleared=function(){ _pdShowCleared=!_pdShowCleared; _pdDraw(); };
})();
