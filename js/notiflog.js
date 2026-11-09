// ============================================================
// notiflog.js — Notification Delivery Log (Phase 4)
// ------------------------------------------------------------
// Settings → Delivery Log. A read-only window on notification_outbox: every email/
// text the rules engine sent (or queued, held, skipped, or failed), with the real
// provider outcome (delivered / bounced / failed) fed back from Mailgun webhooks.
//
// SAFETY: read-only. Keeps its OWN snapshot, selects PER-ROW via _sb, never touches
// DB.* or saveDB()/pushAllToCloud(). Gated by the central permission
// notifications.manage (owner always allowed) — same key as the rules screen; the
// DB RLS on notification_outbox also enforces it, so this can't leak to others.
// ============================================================
(function(){
  'use strict';

  var _rows=[], _loaded=false, _loading=false;
  var _chan='all', _state='all', _search='', _cssInjected=false;

  function _sb(){ return window._sb; }
  function esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function toast(m,t,d){ if(typeof showToast==='function') showToast(m,t||'info',d||2500); }
  function hasAccess(){
    if (window._currentUser && _currentUser.role==='owner') return true;
    return (typeof hasPermission==='function') ? hasPermission('notifications.manage') : false;
  }

  // ---------- data ----------
  async function nlLoad(){
    var sb=_sb(); if(!sb){ _loaded=true; return; }
    _loading=true;
    try{
      var r=await sb.from('notification_outbox').select('*').order('created_at',{ascending:false}).limit(300);
      if(r.error) throw r.error;
      _rows=r.data||[];
    }catch(e){ console.warn('[notiflog load]',(e&&e.message)||e); toast('Could not load the delivery log','error',4000); }
    _loaded=true; _loading=false;
  }

  // ---------- derive a human outcome + pill tone for a row ----------
  function outcome(row){
    var st=row.state, dv=row.delivery_state;
    if(st==='held')    return {k:'held',   tone:'hold', label:'Held',    sub:row.release_at?('until '+fmtTime(row.release_at)):'overnight'};
    if(st==='pending') return {k:'queued', tone:'wait', label:'Queued',  sub:'waiting to send'};
    if(st==='sending') return {k:'sending',tone:'wait', label:'Sending…',sub:''};
    if(st==='skipped') return {k:'skipped',tone:'mute', label:'Skipped',  sub:prettyErr(row.error)};
    if(st==='failed')  return {k:'failed', tone:'bad',  label:'Failed',   sub:prettyErr(row.error)};
    // st === 'sent' — refine by provider delivery feedback (email only)
    if(dv==='delivered')                        return {k:'delivered',tone:'good', label:'Delivered', sub:row.delivery_at?fmtTime(row.delivery_at):''};
    if(dv==='opened'||dv==='clicked')           return {k:'opened',  tone:'good',  label:'Delivered', sub:dv==='clicked'?'clicked':'opened'};
    if(dv==='failed'||dv==='bounced'||dv==='rejected') return {k:'bounced',tone:'bad',label:'Bounced', sub:prettyErr(row.delivery_detail)||'undeliverable'};
    if(dv==='complained')                       return {k:'spam',   tone:'bad',   label:'Spam report', sub:''};
    if(dv==='accepted')                         return {k:'accepted',tone:'okish', label:'Sent',  sub:'accepted by server'};
    return {k:'sent',tone:'okish', label:'Sent', sub:row.channel==='sms'?'text delivered to carrier':''};
  }
  function prettyErr(e){
    if(!e) return '';
    e=String(e);
    if(e==='sandbox_no_sms_number') return 'sandbox — no test number set';
    if(e==='empty_to')  return 'no address';
    if(e==='bad_phone') return 'bad phone number';
    return e.length>120?e.slice(0,120)+'…':e;
  }

  // ---------- time ----------
  function fmtTime(iso){ try{ return new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }catch(e){ return iso||''; } }
  function dayKey(iso){ try{ var d=new Date(iso); return d.toLocaleDateString([], {weekday:'long',month:'short',day:'numeric'}); }catch(e){ return 'Earlier'; } }
  function ago(iso){
    try{
      var s=(Date.now()-new Date(iso).getTime())/1000;
      if(s<60) return 'just now';
      if(s<3600) return Math.floor(s/60)+'m ago';
      if(s<86400) return Math.floor(s/3600)+'h ago';
      return Math.floor(s/86400)+'d ago';
    }catch(e){ return ''; }
  }

  // ---------- filtering ----------
  function visible(){
    var q=_search.trim().toLowerCase();
    return _rows.filter(function(r){
      if(_chan!=='all' && r.channel!==_chan) return false;
      if(_state!=='all'){
        var k=outcome(r).k;
        if(_state==='failed'  && !(k==='failed'||k==='bounced'||k==='spam')) return false;
        if(_state==='sent'    && !(k==='sent'||k==='accepted'||k==='delivered'||k==='opened')) return false;
        if(_state==='waiting' && !(k==='queued'||k==='held'||k==='sending')) return false;
        if(_state==='skipped' && k!=='skipped') return false;
      }
      if(q){
        var hay=((r.rule_name||'')+' '+(r.to_addr||'')+' '+(r.number||'')+' '+(r.customer||'')+' '+(r.subject||'')+' '+(r.body||'')).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
  }

  // ---------- render ----------
  function renderNotifLogPage(){
    ensureCss();
    var root=document.getElementById('nl-root'); if(!root) return;
    if(!hasAccess()){
      root.innerHTML='<div class="nl-noaccess">🔒 You don’t have access to the Delivery Log.<div>Ask an owner to grant the “Manage Notification Rules” permission (Settings → Roles &amp; Permissions).</div></div>';
      return;
    }
    root.innerHTML=shellHTML();
    if(!_loaded){ setList('<div class="nl-empty">Loading…</div>'); nlLoad().then(renderList); }
    else renderList();
  }

  function shellHTML(){
    return ''+
      '<div class="nl-head">'+
        '<div class="nl-h-t"><h2>📬 Delivery Log</h2><p>Every alert the notification rules sent, held, or couldn’t deliver — with the real result from the email provider. Read-only.</p></div>'+
        '<div class="nl-h-btns"><button class="nl-btn" onclick="nlRefresh()">↻ Refresh</button></div>'+
      '</div>'+
      '<div class="nl-stats" id="nl-stats"></div>'+
      '<div class="nl-toolbar">'+
        '<input class="nl-search" id="nl-search" placeholder="Search recipient, rule, WO #, customer…" value="'+esc(_search)+'" oninput="nlSearch(this.value)">'+
        '<div class="nl-chips" id="nl-chips"></div>'+
      '</div>'+
      '<div id="nl-list"></div>';
  }
  function setList(h){ var l=document.getElementById('nl-list'); if(l) l.innerHTML=h; }

  function renderChips(){
    var box=document.getElementById('nl-chips'); if(!box) return;
    var chans=[['all','All'],['email','✉️ Email'],['sms','💬 Text']];
    var states=[['all','Any result'],['sent','Sent / delivered'],['waiting','Queued / held'],['failed','Failed / bounced'],['skipped','Skipped']];
    var h='<div class="nl-chgrp">'+chans.map(function(c){ return '<button class="nl-chip'+(_chan===c[0]?' on':'')+'" onclick="nlChan(\''+c[0]+'\')">'+esc(c[1])+'</button>'; }).join('')+'</div>'+
          '<div class="nl-chgrp">'+states.map(function(c){ return '<button class="nl-chip'+(_state===c[0]?' on':'')+'" onclick="nlState(\''+c[0]+'\')">'+esc(c[1])+'</button>'; }).join('')+'</div>';
    box.innerHTML=h;
  }

  function renderStats(){
    var box=document.getElementById('nl-stats'); if(!box) return;
    var c={delivered:0,sent:0,failed:0,waiting:0,skipped:0};
    _rows.forEach(function(r){
      var k=outcome(r).k;
      if(k==='delivered'||k==='opened') c.delivered++;
      else if(k==='sent'||k==='accepted') c.sent++;
      else if(k==='failed'||k==='bounced'||k==='spam') c.failed++;
      else if(k==='queued'||k==='held'||k==='sending') c.waiting++;
      else if(k==='skipped') c.skipped++;
    });
    function tile(n,l,t){ return '<div class="nl-stat '+t+'"><b>'+n+'</b><span>'+l+'</span></div>'; }
    box.innerHTML=tile(c.delivered,'Delivered','good')+tile(c.sent,'Sent','okish')+tile(c.failed,'Failed / bounced','bad')+tile(c.waiting,'Queued / held','wait')+tile(c.skipped,'Skipped','mute');
  }

  function renderList(){
    renderChips(); renderStats();
    var rows=visible();
    if(!rows.length){ setList('<div class="nl-empty">'+(_rows.length?'No entries match these filters.':'Nothing has been sent yet. When a rule fires, every send shows up here.')+'</div>'); return; }
    var html='', lastDay=null;
    rows.forEach(function(r){
      var dk=dayKey(r.created_at);
      if(dk!==lastDay){ html+='<div class="nl-day">'+esc(dk)+'</div>'; lastDay=dk; }
      html+=rowHTML(r);
    });
    setList(html);
  }

  function rowHTML(r){
    var o=outcome(r);
    var chIc=r.channel==='sms'?'💬':'✉️';
    var who=esc(r.to_addr||'—');
    var ctx=[]; if(r.number) ctx.push(esc(r.number)); if(r.customer) ctx.push(esc(r.customer));
    var sub=(o.sub?('<span class="nl-osub">'+esc(o.sub)+'</span>'):'');
    var urgent=r.urgent?'<span class="nl-urgent">⚡ Urgent</span>':'';
    return ''+
      '<div class="nl-row">'+
        '<div class="nl-ch" title="'+(r.channel==='sms'?'Text':'Email')+'">'+chIc+'</div>'+
        '<div class="nl-main">'+
          '<div class="nl-line1"><b class="nl-rule">'+esc(r.rule_name||'(rule)')+'</b> '+urgent+'<span class="nl-to">→ '+who+'</span></div>'+
          '<div class="nl-line2">'+(ctx.length?('<span class="nl-ctx">'+ctx.join(' · ')+'</span> · '):'')+esc(r.subject||r.body||'')+'</div>'+
        '</div>'+
        '<div class="nl-right">'+
          '<span class="nl-pill '+o.tone+'">'+esc(o.label)+'</span>'+sub+
          '<span class="nl-time" title="'+esc(fmtTime(r.created_at))+'">'+esc(ago(r.created_at))+'</span>'+
        '</div>'+
      '</div>';
  }

  // ---------- public controls ----------
  window.renderNotifLogPage=renderNotifLogPage;
  window.nlRefresh=function(){ _loaded=false; _rows=[]; setList('<div class="nl-empty">Loading…</div>'); nlLoad().then(renderList); };
  window.nlSearch=function(v){ _search=v; renderList(); };
  window.nlChan=function(c){ _chan=c; renderList(); };
  window.nlState=function(s){ _state=s; renderList(); };

  // ---------- css ----------
  function ensureCss(){
    if(_cssInjected) return; _cssInjected=true;
    var s=document.createElement('style');
    s.textContent=[
      '#nl-root{--nla:#1565c0;--nlink:#15324a;--nlink2:#5b7488;--nlline:#e3ebf2;max-width:920px;margin:0 auto}',
      '.nl-noaccess{background:#fff;border:1px solid var(--nlline);border-radius:12px;padding:30px;text-align:center;color:#8a6d3b;font-weight:600}.nl-noaccess div{margin-top:8px;font-weight:400;color:var(--nlink2);font-size:13px}',
      '.nl-head{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px}',
      '.nl-h-t{flex:1;min-width:240px}.nl-h-t h2{margin:0 0 3px;font-size:22px;color:var(--nlink)}.nl-h-t p{margin:0;font-size:13px;color:var(--nlink2);max-width:640px}',
      '.nl-btn{font-size:13px;font-weight:600;border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid var(--nlline);background:#fff;color:var(--nlink)}.nl-btn:hover{border-color:var(--nla)}',
      '.nl-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
      '.nl-stat{flex:1;min-width:92px;background:#fff;border:1px solid var(--nlline);border-radius:11px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}',
      '.nl-stat b{font-size:22px;line-height:1;color:var(--nlink)}.nl-stat span{font-size:11px;color:var(--nlink2);font-weight:600}',
      '.nl-stat.good b{color:#15924e}.nl-stat.bad b{color:#c62828}.nl-stat.wait b{color:#b26a00}.nl-stat.mute b{color:#90a4ae}',
      '.nl-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}',
      '.nl-search{flex:1;min-width:220px;font-size:13px;padding:10px 13px;border:1px solid var(--nlline);border-radius:10px;background:#fff;color:var(--nlink)}',
      '.nl-chips{display:flex;gap:12px;flex-wrap:wrap}.nl-chgrp{display:flex;gap:5px;flex-wrap:wrap}',
      '.nl-chip{font-size:12px;font-weight:600;border:1px solid var(--nlline);background:#fff;color:var(--nlink2);border-radius:999px;padding:6px 11px;cursor:pointer}.nl-chip:hover{border-color:var(--nla)}.nl-chip.on{background:var(--nla);border-color:var(--nla);color:#fff}',
      '.nl-day{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8aa0b2;margin:16px 2px 7px}',
      '.nl-row{display:flex;gap:11px;align-items:flex-start;background:#fff;border:1px solid var(--nlline);border-radius:11px;padding:11px 13px;margin-bottom:7px}',
      '.nl-ch{font-size:17px;flex:none;width:24px;text-align:center}',
      '.nl-main{flex:1;min-width:0}',
      '.nl-line1{font-size:13.5px;color:var(--nlink);display:flex;gap:7px;align-items:center;flex-wrap:wrap}.nl-rule{font-weight:700}',
      '.nl-to{color:var(--nlink2)}',
      '.nl-line2{font-size:12px;color:var(--nlink2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nl-ctx{font-weight:600;color:var(--nlink)}',
      '.nl-urgent{font-size:10.5px;font-weight:700;color:#b26a00;background:#fff4e2;border:1px solid #ffe0b2;border-radius:5px;padding:1px 5px}',
      '.nl-right{flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:96px}',
      '.nl-pill{font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;white-space:nowrap}',
      '.nl-pill.good{background:#e6f6ec;color:#15803d}.nl-pill.okish{background:#eef4fb;color:#1565c0}.nl-pill.bad{background:#fdeaea;color:#c62828}.nl-pill.hold{background:#fff4e2;color:#b26a00}.nl-pill.wait{background:#f1f5f9;color:#5b7488}.nl-pill.mute{background:#f4f6f8;color:#90a4ae}',
      '.nl-osub{font-size:10.5px;color:var(--nlink2);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.nl-time{font-size:10.5px;color:#9fb1c0}',
      '.nl-empty{background:#fff;border:1px dashed var(--nlline);border-radius:11px;padding:28px;text-align:center;color:var(--nlink2);font-size:13px}',
      '@media(max-width:560px){.nl-line2{white-space:normal}.nl-right{min-width:78px}}'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
