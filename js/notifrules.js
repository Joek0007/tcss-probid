// ============================================================
// notifrules.js — Notification Rules engine (Phase 1B UI, bell-safe)
// ------------------------------------------------------------
// Settings → Notification Rules. One engine for every alert: a rule fires when
// something happens in a module → notifies chosen people (team, role, the person
// on the record, a customer contact, or an outside address) → by email / text /
// in-app → with an editable message. Instant by default; texts after 9pm hold to
// 6:30am (Phase 3); Urgent bypasses; digest is a noisy-rule opt-in.
//
// SAFETY (same discipline as perdiem.js / expenses.js): this module keeps its OWN
// snapshot of the notification_rules table and writes PER-ROW directly via _sb. It
// NEVER touches DB.* record arrays or calls saveDB()/pushAllToCloud(), so it can't
// clobber the synced blob. The rules list is rebuilt fresh from the cloud on open.
//
// PHASE 1B is authoring only — nothing fires yet (no triggers, no sends). Access is
// gated by the central permission notifications.manage (owner always allowed).
// ============================================================
(function(){
  'use strict';

  // ---------- reference data ----------
  var MODULES = [
    {key:'wo',   label:'Work Order',     emoji:'🔧', statuses:['New','Scheduled','In Progress','Ready for Review','On Hold','Closed']},
    {key:'po',   label:'Purchase Order', emoji:'📦', statuses:['Draft','Ordered','Partially Received','Received','Closed']},
    {key:'inv',  label:'Invoice',        emoji:'🧾', statuses:['Draft','Sent','Partially Paid','Paid','Overdue','Void']},
    {key:'quote',label:'Quote',          emoji:'📄', statuses:['Draft','Sent','Approved','Changes Requested','Won','Lost']},
    {key:'job',  label:'Job / Project',  emoji:'🏗️', statuses:['Open','In Progress','On Hold','Complete']},
    {key:'ct',   label:'Contract',       emoji:'📜', statuses:['Draft','Active','Expiring','Expired']},
    {key:'any',  label:'Anything',       emoji:'✨', statuses:[]}
  ];
  var EVENTS = [
    {key:'status',  label:'is set to a status…',       needsStatus:true},
    {key:'created', label:'is created'},
    {key:'updated', label:'is edited (a field changes)'},
    {key:'comment', label:'gets an internal comment'},
    {key:'assigned',label:'is assigned to someone'},
    {key:'date',    label:'hits a date / goes overdue'}
  ];
  var VARS = ['{number}','{module}','{status}','{old_status}','{customer}','{contact}','{address}','{phone}',
    '{assigned}','{rep}','{author}','{comment}','{amount}','{balance}','{due_date}','{date}','{job_name}','{priority}','{link}'];
  var CATMETA = {team:'Team',role:'Role',ctx:'Contextual',cust:'Customer',ext:'Outside'};

  // ---------- state ----------
  var _rules=[], _loaded=false, _loading=false;
  var _search='', _group='module', _filter='all', _collapsed={};
  var editing=null, pickSel={}, _cssInjected=false;

  // ---------- helpers ----------
  function _sb(){ return window._sb; }
  function esc(s){ return (typeof escHtml==='function') ? escHtml(s==null?'':String(s)) : String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function toast(m,t,d){ if(typeof showToast==='function') showToast(m,t||'info',d||2500); }
  function _me(){ return (window._currentUser && (_currentUser.full_name||_currentUser.name||_currentUser.email)) || 'Office'; }
  function hasAccess(){
    if (window._currentUser && _currentUser.role==='owner') return true;
    return (typeof hasPermission==='function') ? hasPermission('notifications.manage') : false;
  }
  function mod(k){ for(var i=0;i<MODULES.length;i++){ if(MODULES[i].key===k) return MODULES[i]; } return MODULES[0]; }
  function evt(k){ for(var i=0;i<EVENTS.length;i++){ if(EVENTS[i].key===k) return EVENTS[i]; } return EVENTS[0]; }
  function initials(s){ var w=(s||'?').replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).slice(0,2).map(function(x){return x[0];}).join('').toUpperCase(); return w||'•'; }
  function sVal(k,d){ return (window.DB && DB.settings && DB.settings[k]!=null) ? DB.settings[k] : d; }
  function sSet(k,v){ if(!window.DB) return; if(!DB.settings) DB.settings={}; DB.settings[k]=v; try{ if(typeof saveDB==='function') saveDB(); }catch(e){} try{ if(typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase(); }catch(e){} }

  // recipient catalog — team + roles pulled LIVE from the app
  function catalog(){
    var team = ((window.DB&&DB.team)||[])
      .filter(function(t){ return t.active!==false && t.is_active!==false && t.status!=='inactive' && t.status!=='terminated'; })
      .map(function(t){ return {id:String(t.id||t.name||''), label:t.name||t.full_name||''}; })
      .filter(function(x){ return x.label; });
    var roleIds = (typeof getRoles==='function') ? getRoles()
      : ['owner','manager','back_office','estimator','lead_tech','helper_tech','project_manager','subcontractor'];
    var roles = roleIds.map(function(r){ return {id:r, label:(typeof getRoleLabel==='function')?getRoleLabel(r):r}; });
    return [
      {group:'Your team — everyone on the roster', cat:'team', items:team},
      {group:'Roles — your configured roles',       cat:'role', items:roles},
      {group:'Contextual — whoever it is on THIS record', cat:'ctx', items:[
        {id:'assigned',label:'Assigned tech'},{id:'owner_rec',label:'Record owner / creator'},
        {id:'rep',label:'Quote rep'},{id:'editor',label:'Last person who edited it'}]},
      {group:'Customer side', cat:'cust', items:[
        {id:'customer',label:'Customer (primary)'},{id:'default_contact',label:'Default contact'},
        {id:'invoice_contact',label:'Invoicing contact'}]},
      {group:'Outside the system', cat:'ext', items:[
        {id:'ext_email',label:'Type an email address…',ext:'email'},
        {id:'ext_sms',label:'Type a phone number…',ext:'sms'}]}
    ];
  }
  function rcp(id,label,cat,ch,extval){ return {id:id,label:label,cat:cat,ch:Object.assign({email:0,sms:0,bell:0},ch||{}),extval:extval||''}; }

  // ---------- data layer (per-row, own snapshot) ----------
  function _fromRow(r){
    return { id:r.id, name:r.name||'', enabled:r.enabled!==false, module:r.module||'wo', event:r.event||'status',
      status:r.status||'', conditions:r.conditions||[], recipients:r.recipients||[], subject:r.subject||'', body:r.body||'',
      simple:r.simple!==false, urgent:!!r.urgent, digest:!!r.digest, sortOrder:r.sort_order||0 };
  }
  function _toRow(ru){
    return { name:ru.name||'', enabled:!!ru.enabled, module:ru.module, event:ru.event, status:ru.status||'',
      conditions:ru.conditions||[], recipients:ru.recipients||[], subject:ru.subject||'', body:ru.body||'',
      simple:!!ru.simple, urgent:!!ru.urgent, digest:!!ru.digest, updated_at:new Date().toISOString() };
  }
  function _replace(ru){ for(var i=0;i<_rules.length;i++){ if(_rules[i].id===ru.id){ _rules[i]=ru; return; } } _rules.push(ru); }

  async function nrLoad(){
    var sb=_sb(); if(!sb){ _loaded=true; return; }
    _loading=true;
    try{
      var r=await sb.from('notification_rules').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:true});
      if(r.error) throw r.error;
      _rules=(r.data||[]).map(_fromRow);
    }catch(e){ console.warn('[notifrules load]',(e&&e.message)||e); }
    _loaded=true; _loading=false;
  }
  async function nrSaveRule(ru){
    var sb=_sb(); if(!sb){ toast('No cloud connection','error'); return false; }
    var row=_toRow(ru);
    try{
      if(ru.id){
        var up=await sb.from('notification_rules').update(row).eq('id',ru.id).select().single();
        if(up.error) throw up.error; _replace(_fromRow(up.data));
      } else {
        row.created_by=_me();
        var ins=await sb.from('notification_rules').insert(row).select().single();
        if(ins.error) throw ins.error; _rules.push(_fromRow(ins.data));
      }
      return true;
    }catch(e){ console.warn('[notifrules save]',e); toast('Save failed: '+((e&&e.message)||e),'error',4500); return false; }
  }
  async function nrDeleteRule(id){
    var sb=_sb(); if(!sb) return;
    try{ var r=await sb.from('notification_rules').delete().eq('id',id); if(r.error) throw r.error; _rules=_rules.filter(function(x){return x.id!==id;}); }
    catch(e){ console.warn('[notifrules delete]',e); toast('Delete failed','error',4000); }
  }
  async function nrSetEnabled(id,on){
    var sb=_sb(); if(!sb) return;
    try{ var r=await sb.from('notification_rules').update({enabled:on,updated_at:new Date().toISOString()}).eq('id',id); if(r.error) throw r.error; }
    catch(e){ console.warn('[notifrules toggle]',e); }
  }

  // ---------- derived ----------
  function whenText(ru){
    var m=mod(ru.module), e=evt(ru.event), subj=(m.key==='any'?'anything':'a '+m.label);
    if(e.key==='status')  return subj+' is set to <b>'+esc(ru.status||'any status')+'</b>';
    if(e.key==='comment') return subj+' <b>gets an internal comment</b>';
    if(e.key==='created') return subj+' <b>is created</b>';
    if(e.key==='updated') return subj+' <b>is edited</b>';
    if(e.key==='assigned')return subj+' <b>is assigned</b>';
    if(e.key==='date')    return subj+' <b>hits a date / goes overdue</b>';
    return subj;
  }
  function channelsOf(ru){ var s={email:0,sms:0,bell:0}; (ru.recipients||[]).forEach(function(x){ if(x.ch.email)s.email=1; if(x.ch.sms)s.sms=1; if(x.ch.bell)s.bell=1; }); return s; }

  // ============================================================
  // RENDER — page
  // ============================================================
  function renderNotifRulesPage(){
    ensureCss();
    var root=document.getElementById('nr-root'); if(!root) return;
    if(!hasAccess()){
      root.innerHTML='<div class="nr-noaccess">🔒 You don’t have access to Notification Rules.<div>Ask an owner to grant the “Manage Notification Rules” permission (Settings → Roles &amp; Permissions).</div></div>';
      return;
    }
    root.innerHTML = shellHTML();
    if(!_loaded){ root.querySelector('#nr-list').innerHTML='<div class="nr-empty">Loading rules…</div>'; nrLoad().then(renderList); }
    else renderList();
  }

  function shellHTML(){
    var masterOn = sVal('notifMasterOn', true)!==false;
    var holdAfter = sVal('notifHoldAfter','9:00 PM'), holdRelease = sVal('notifHoldRelease','6:30 AM');
    function opt(v,cur){ return '<option'+(v===cur?' selected':'')+'>'+v+'</option>'; }
    return ''+
    '<div class="nr-head">'+
      '<div class="nr-h-t"><h2>🔔 Notification Rules</h2><p>One engine for every alert. Each rule fires when something happens, notifies the people you choose — on your team or outside it — by email, text, or in-app, with a message you control.</p></div>'+
      '<div class="nr-h-btns">'+
        '<button class="nr-btn" onclick="nrOpenAccess()">🔒 Who can edit</button>'+
        '<button class="nr-btn pri" onclick="nrOpenBuilder(null)">+ New rule</button>'+
      '</div>'+
    '</div>'+
    '<div class="nr-master '+(masterOn?'':'off')+'" id="nr-master">'+
      '<div class="nr-mi">'+(masterOn?'🔔':'🔕')+'</div>'+
      '<div class="nr-mt"><b>'+(masterOn?'Notifications are ON':'Notifications are OFF (nothing will send)')+'</b><div>'+(masterOn?'The master switch — turn everything off instantly if a rule ever misfires (the safety kill-switch).':'Every rule is paused. Flip this back on to resume all alerts.')+'</div></div>'+
      '<button class="nr-switch '+(masterOn?'':'off')+'" onclick="nrToggleMaster()" aria-label="Master switch"></button>'+
    '</div>'+
    '<div class="nr-sched">'+
      '<div class="nr-sb"><span class="nr-sbic">⚡</span><div><b>Alerts fire instantly</b><br>the moment the event happens</div></div>'+
      '<div class="nr-sb"><span class="nr-sbic">🌙</span><div><b>Overnight text hold</b><br>after '+
        '<select class="nr-time" onchange="nrSetSched(\'notifHoldAfter\',this.value)">'+['8:00 PM','9:00 PM','10:00 PM'].map(function(v){return opt(v,holdAfter);}).join('')+'</select> → release '+
        '<select class="nr-time" onchange="nrSetSched(\'notifHoldRelease\',this.value)">'+['6:00 AM','6:30 AM','7:00 AM','7:30 AM'].map(function(v){return opt(v,holdRelease);}).join('')+'</select></div></div>'+
      '<div class="nr-sb"><span class="nr-sbic">🌎</span><div><b>Time zone</b><br>Eastern — your local time</div></div>'+
    '</div>'+
    '<div class="nr-note"><b>Everything fires the moment it happens.</b> Email and the in-app bell always deliver instantly, day or night. Only <b>texts</b> are held when they’d fire after 9:00 PM — those wait until 6:30 AM. A rule can mark itself <b>Urgent</b> to override even that. <i>(Phase 1: authoring only — live sending turns on in the next build, with guardrails.)</i></div>'+
    '<div class="nr-toolbar">'+
      '<input class="nr-in" id="nr-search" placeholder="🔍  Search rules — name, module, recipient…" oninput="nrSetSearch(this.value)">'+
      '<label class="nr-gb">Group by <select onchange="nrSetGroup(this.value)">'+
        ['module|Module','status|On / Off','channel|Channel','recipient|Recipient','none|Nothing (A–Z)'].map(function(p){var a=p.split('|');return '<option value="'+a[0]+'"'+(a[0]===_group?' selected':'')+'>'+a[1]+'</option>';}).join('')+
      '</select></label>'+
    '</div>'+
    '<div class="nr-chips" id="nr-chips">'+
      ['all|All','on|On','off|Off','|','email|✉️ Email','sms|💬 Text','bell|🔔 In-app','ext|↗ Reaches outside'].map(function(p){
        if(p==='|') return '<span class="nr-cdiv"></span>';
        var a=p.split('|'); return '<button class="nr-chip'+(a[0]===_filter?' on':'')+'" data-f="'+a[0]+'" onclick="nrSetFilter(\''+a[0]+'\')">'+a[1]+(a[0]==='all'?' <span id="nr-all-n"></span>':'')+'</button>';
      }).join('')+
    '</div>'+
    '<div id="nr-list"></div>';
  }

  function renderList(){
    var host=document.getElementById('nr-list'); if(!host) return;
    var an=document.getElementById('nr-all-n'); if(an) an.textContent=_rules.length;
    if(!_rules.length){ host.innerHTML='<div class="nr-empty">No rules yet. Click <b>+ New rule</b> to create your first alert.</div>'; return; }
    var list=_rules.filter(function(ru){ return matchSearch(ru)&&matchFilter(ru); });
    if(!list.length){ host.innerHTML='<div class="nr-empty">No rules match your search or filter.</div>'; return; }
    if(_group==='none'){ host.innerHTML=list.slice().sort(function(a,b){return (a.name||'').localeCompare(b.name||'');}).map(ruleCardHTML).join(''); return; }
    var groups=[], idx={};
    function gpush(key,label,icon,ru){ var g=idx[key]; if(!g){g={key:key,label:label,icon:icon,rules:[]};idx[key]=g;groups.push(g);} g.rules.push(ru); }
    var chMeta={email:['Email','✉️'],sms:['Text','💬'],bell:['In-app','🔔'],none:['No channel yet','—']};
    var recIcon={team:'👤',role:'🏷️',ctx:'🎯',cust:'🧑',ext:'↗'};
    list.forEach(function(ru){
      if(_group==='module'){ var m=mod(ru.module); gpush(m.key,(m.key==='any'?'Anything':m.label+'s'),m.emoji,ru); }
      else if(_group==='status'){ ru.enabled?gpush('on','On','🟢',ru):gpush('off','Off','⚪',ru); }
      else if(_group==='channel'){ var c=channelsOf(ru),parts=[]; if(c.email)parts.push('email'); if(c.sms)parts.push('sms'); if(c.bell)parts.push('bell'); (parts.length?parts:['none']).forEach(function(k){ gpush(k,chMeta[k][0],chMeta[k][1],ru); }); }
      else if(_group==='recipient'){ (ru.recipients||[]).forEach(function(x){ var key=x.cat+':'+x.id; var lab=x.cat==='ext'?(x.extval||'Outside'):x.label; gpush(key,lab,recIcon[x.cat]||'•',ru); }); }
    });
    if(_group==='module'){ var ord=MODULES.map(function(m){return m.key;}); groups.sort(function(a,b){return ord.indexOf(a.key)-ord.indexOf(b.key);}); }
    else if(_group==='recipient'){ groups.sort(function(a,b){return b.rules.length-a.rules.length;}); }
    host.innerHTML=groups.map(function(g){
      var col=!!_collapsed[g.key];
      return '<div class="nr-grp'+(col?' collapsed':'')+'">'+
        '<div class="nr-gh" onclick="nrToggleGroup(\''+String(g.key).replace(/\\/g,'').replace(/'/g,'')+'\')"><span class="nr-ghic">'+g.icon+'</span><span class="nr-ght">'+esc(g.label)+'</span><span class="nr-ghn">'+g.rules.length+'</span><span class="nr-ghc">▾</span></div>'+
        '<div class="nr-gb-body">'+g.rules.map(ruleCardHTML).join('')+'</div></div>';
    }).join('');
  }
  function matchSearch(ru){ if(!_search) return true; var hay=((ru.name||'')+' '+mod(ru.module).label+' '+(ru.status||'')+' '+(ru.recipients||[]).map(function(x){return x.cat==='ext'?x.extval:x.label;}).join(' ')).toLowerCase(); return hay.indexOf(_search)>=0; }
  function matchFilter(ru){ if(_filter==='all') return true; if(_filter==='on') return ru.enabled; if(_filter==='off') return !ru.enabled;
    if(_filter==='ext') return (ru.recipients||[]).some(function(x){return x.cat==='ext'||x.cat==='cust';});
    return (ru.recipients||[]).some(function(x){return x.ch[_filter];}); }
  function ruleCardHTML(ru){
    var m=mod(ru.module), ch=channelsOf(ru);
    var chips=(ru.recipients||[]).map(function(x){ var lab=(x.cat==='ext')?(x.extval||'outside…'):x.label; return '<span class="nr-chipr '+x.cat+'"><span class="nr-cdot"></span>'+esc(lab)+'</span>'; }).join('');
    var chIc=(ch.email?'✉️':'')+(ch.sms?' 💬':'')+(ch.bell?' 🔔':'');
    return '<div class="nr-rule'+(ru.enabled?'':' off')+'" onclick="nrOpenBuilder(\''+ru.id+'\')" title="Click to edit this rule">'+
      '<button class="nr-edit" onclick="event.stopPropagation();nrOpenBuilder(\''+ru.id+'\')" title="Edit">✏️</button>'+
      '<button class="nr-switch sm '+(ru.enabled?'':'off')+'" onclick="event.stopPropagation();nrToggleRule(\''+ru.id+'\')" aria-label="Enable"></button>'+
      '<div class="nr-rtop"><span class="nr-ric">'+m.emoji+'</span><span class="nr-rname">'+esc(ru.name||'(unnamed rule)')+'</span></div>'+
      '<div class="nr-rwhen">When '+whenText(ru)+'</div>'+
      '<div class="nr-rmeta"><div class="nr-chipwrap">'+chips+'</div><span class="nr-chic">'+chIc+'</span></div>'+
    '</div>';
  }

  // list controls
  window.nrSetSearch=function(v){ _search=(v||'').toLowerCase(); renderList(); };
  window.nrSetGroup=function(v){ _group=v; _collapsed={}; renderList(); };
  window.nrSetFilter=function(f){ _filter=f; (document.querySelectorAll('.nr-chip')||[]).forEach(function(c){ c.classList.toggle('on',c.getAttribute('data-f')===f); }); renderList(); };
  window.nrToggleGroup=function(k){ _collapsed[k]=!_collapsed[k]; renderList(); };
  window.nrToggleRule=function(id){ var ru=_rules.filter(function(x){return x.id===id;})[0]; if(!ru) return; ru.enabled=!ru.enabled; nrSetEnabled(id,ru.enabled); renderList(); };
  window.nrToggleMaster=function(){ var on=sVal('notifMasterOn',true)!==false; sSet('notifMasterOn',!on); renderNotifRulesPage(); };
  window.nrSetSched=function(k,v){ sSet(k,v); };

  // ============================================================
  // BUILDER
  // ============================================================
  function overlay(){ var o=document.getElementById('nr-overlay'); if(!o){ o=document.createElement('div'); o.id='nr-overlay'; o.className='nr-overlay'; o.onclick=function(e){ if(e.target===o) nrCloseBuilder(); }; o.innerHTML='<div class="nr-builder" id="nr-builder"></div>'; document.body.appendChild(o); } return o; }
  window.nrOpenBuilder=function(id){
    var src = (id==null||id==='null') ? {id:null,name:'',enabled:true,module:'wo',event:'status',status:'Ready for Review',recipients:[],conditions:[],subject:'',body:'',simple:true,urgent:false,digest:false}
      : JSON.parse(JSON.stringify(_rules.filter(function(x){return x.id===id;})[0]||{}));
    if(src.simple===undefined) src.simple=false;
    if(!src.recipients) src.recipients=[];
    editing=src;
    overlay().classList.add('show');   // create/show the overlay first (it builds #nr-builder)
    renderBuilder();                   // now #nr-builder exists to render into
    document.body.style.overflow='hidden';
  };
  window.nrCloseBuilder=function(){ var o=document.getElementById('nr-overlay'); if(o) o.classList.remove('show'); document.body.style.overflow=''; editing=null; };
  window.nrSetMode=function(simple){ editing.simple=simple; renderBuilder(); };

  function renderBuilder(){
    var b=document.getElementById('nr-builder'); if(!b) return;
    var ru=editing, m=mod(ru.module), e=evt(ru.event);
    var modOpts=MODULES.map(function(x){return '<option value="'+x.key+'"'+(x.key===ru.module?' selected':'')+'>'+x.emoji+' '+x.label+'</option>';}).join('');
    var evOpts=EVENTS.map(function(x){return '<option value="'+x.key+'"'+(x.key===ru.event?' selected':'')+'>'+x.label+'</option>';}).join('');
    var statusSel = e.needsStatus&&m.statuses.length ? '<select id="nr-b-status">'+['<option value="">any status</option>'].concat(m.statuses.map(function(s){return '<option'+(s===ru.status?' selected':'')+'>'+esc(s)+'</option>';})).join('')+'</select>' : '';
    b.innerHTML=''+
      '<div class="nr-bhead"><input class="nr-bname" id="nr-b-name" placeholder="Name this rule…" value="'+attr(ru.name)+'"><button class="nr-x" onclick="nrCloseBuilder()">×</button></div>'+
      '<div class="nr-bbody">'+
        '<div class="nr-modetog"><button class="nr-mt'+(ru.simple?' on':'')+'" onclick="nrSetMode(true)">⚡ Simple</button><button class="nr-mt'+(ru.simple?'':' on')+'" onclick="nrSetMode(false)">⚙️ Advanced</button></div>'+
        '<div class="nr-step"><div class="nr-slbl"><span class="nr-n">1</span>When this happens</div>'+
          '<div class="nr-row"><select id="nr-b-module">'+modOpts+'</select><select id="nr-b-event">'+evOpts+'</select>'+statusSel+'</div></div>'+
        '<div class="nr-step"><div class="nr-slbl"><span class="nr-n">2</span>Notify these people</div>'+
          '<div id="nr-b-recips">'+(ru.recipients||[]).map(recipRow).join('')+'</div>'+
          '<button class="nr-addr" onclick="nrOpenPicker()">+ Add recipient</button></div>'+
        (ru.simple
          ? '<div class="nr-step"><div class="nr-simplenote">⚡ <b>Simple mode</b> — this rule uses a smart default message and sends instantly. Switch to <b>Advanced</b> any time to write your own wording, add a condition, urgent, or digest.</div></div>'
          : ('<div class="nr-step"><div class="nr-slbl"><span class="nr-n">3</span>With this message</div>'+
              '<div class="nr-fld"><label>Subject (email)</label><input class="nr-in" id="nr-b-subject" value="'+attr(ru.subject)+'" placeholder="e.g. WO {number} is ready for review"></div>'+
              '<div class="nr-fld"><label>Message</label><textarea id="nr-b-body" placeholder="Write the default message…">'+esc(ru.body)+'</textarea>'+
                '<div class="nr-vars">'+VARS.map(function(v){return '<button class="nr-varc" onclick="nrInsertVar(\''+v+'\')">'+v+'</button>';}).join('')+'</div>'+
                '<div class="nr-hint">Click a tag to drop it in — ProBid fills it with the real value when the alert sends.</div></div></div>'+
            '<div class="nr-step"><div class="nr-slbl"><span class="nr-n">4</span>Options</div>'+
              '<div class="nr-opt"><div class="nr-ot">⚡ Urgent — ignore the overnight text hold<div>This rule’s texts go out immediately even after 9pm. Use only for things that truly can’t wait.</div></div><button class="nr-switch sm'+(ru.urgent?'':' off')+'" onclick="nrFlag(\'urgent\',this)"></button></div>'+
              '<div class="nr-opt"><div class="nr-ot">Batch into a digest (noisy rules only)<div>For a high-volume, low-urgency rule: hold alerts and send one summary. Off by default — most rules fire instantly.</div></div><button class="nr-switch sm'+(ru.digest?'':' off')+'" onclick="nrFlag(\'digest\',this)"></button></div></div>'))+
        '<div class="nr-step"><div class="nr-summary" id="nr-b-summary"></div></div>'+
      '</div>'+
      '<div class="nr-bfoot">'+
        '<button class="nr-test" onclick="nrTest()">✈️ Send a test to me</button>'+
        (ru.id?'<button class="nr-btn danger" onclick="nrDeleteFromBuilder()">Delete</button>':'')+
        '<button class="nr-btn" onclick="nrCloseBuilder()">Cancel</button>'+
        '<button class="nr-btn pri" id="nr-save-btn" onclick="nrSaveFromBuilder()">Save rule</button>'+
      '</div>';
    document.getElementById('nr-b-module').addEventListener('change',function(){ editing.module=this.value; var mm=mod(this.value); if(mm.statuses.indexOf(editing.status)<0) editing.status=''; renderBuilder(); });
    document.getElementById('nr-b-event').addEventListener('change',function(){ editing.event=this.value; renderBuilder(); });
    var st=document.getElementById('nr-b-status'); if(st) st.addEventListener('change',function(){ editing.status=this.value; updateSummary(); });
    document.getElementById('nr-b-name').addEventListener('input',function(){ editing.name=this.value; });
    var bs=document.getElementById('nr-b-subject'); if(bs) bs.addEventListener('input',function(){ editing.subject=this.value; });
    var bb=document.getElementById('nr-b-body'); if(bb) bb.addEventListener('input',function(){ editing.body=this.value; });
    updateSummary();
  }
  function recipRow(x,i){
    var isExt=x.cat==='ext';
    var ext = x.id==='ext_sms' ? 'name@outside.com or (555) 555-1234' : 'name@outside.com';
    var who = isExt
      ? '<span class="nr-who"><span class="nr-av ext">↗</span><input class="nr-extin" placeholder="'+ext+'" value="'+attr(x.extval)+'" oninput="nrSetExt('+i+',this.value)"></span>'
      : '<span class="nr-who"><span class="nr-av '+x.cat+'">'+esc(initials(x.label))+'</span>'+esc(x.label)+' <span class="nr-kind '+x.cat+'">'+CATMETA[x.cat]+'</span></span>';
    var bellDis = (x.cat==='cust'||x.cat==='ext');
    function tog(c,l){ return '<button class="nr-ctog'+(x.ch[c]?' on':'')+(c==='bell'&&bellDis?' dis':'')+'" '+(c==='bell'&&bellDis?'':'onclick="nrToggleCh('+i+',\''+c+'\')"')+'>'+l+'</button>'; }
    return '<div class="nr-recip">'+who+'<div class="nr-ctoggles">'+tog('email','✉️')+tog('sms','💬')+tog('bell','🔔')+'</div><button class="nr-rm" onclick="nrRmRecip('+i+')">✕</button></div>';
  }
  window.nrToggleCh=function(i,c){ editing.recipients[i].ch[c]=editing.recipients[i].ch[c]?0:1; document.getElementById('nr-b-recips').innerHTML=editing.recipients.map(recipRow).join(''); updateSummary(); };
  window.nrRmRecip=function(i){ editing.recipients.splice(i,1); document.getElementById('nr-b-recips').innerHTML=editing.recipients.map(recipRow).join(''); updateSummary(); };
  window.nrSetExt=function(i,v){ editing.recipients[i].extval=v; updateSummary(); };
  window.nrInsertVar=function(v){ var t=document.getElementById('nr-b-body'); if(!t) return; var s=t.selectionStart||t.value.length; t.value=t.value.slice(0,s)+v+t.value.slice(s); editing.body=t.value; t.focus(); };
  window.nrFlag=function(k,el){ editing[k]=!editing[k]; el.classList.toggle('off',!editing[k]); };
  function updateSummary(){
    var el=document.getElementById('nr-b-summary'); if(!el) return; var ru=editing;
    var names=(ru.recipients||[]).map(function(x){return x.cat==='ext'?(x.extval||'someone outside'):x.label;});
    var ch=channelsOf(ru),chs=[]; if(ch.email)chs.push('email'); if(ch.sms)chs.push('text'); if(ch.bell)chs.push('in-app');
    el.innerHTML='<span class="nr-sk">When</span> '+whenText(ru)+', <span class="nr-sk">notify</span> <b>'+esc(names.length?names.join(', '):'…')+'</b> <span class="nr-sk">by</span> <b>'+esc(chs.length?chs.join(' + '):'no channel yet')+'</b>.';
  }
  window.nrSaveFromBuilder=async function(){
    var ru=editing; if(!ru) return;
    if(!(ru.name||'').trim()) ru.name=mod(ru.module).label+' alert';
    var btn=document.getElementById('nr-save-btn'); if(btn){ btn.disabled=true; btn.textContent='Saving…'; }
    var ok=await nrSaveRule(ru);
    if(ok){ toast('Rule saved','success',2000); nrCloseBuilder(); renderList(); }
    else if(btn){ btn.disabled=false; btn.textContent='Save rule'; }
  };
  window.nrDeleteFromBuilder=async function(){
    var ru=editing; if(!ru||!ru.id) return;
    if(typeof confirm==='function' && !confirm('Delete this notification rule?')) return;
    await nrDeleteRule(ru.id); toast('Rule deleted','info',2000); nrCloseBuilder(); renderList();
  };
  window.nrTest=function(){ toast('(Phase 1) A test of this alert will go to you — the logged-in user — once live sending is on in the next build.','info',4500); };

  // ---------- recipient picker ----------
  function picker(){ var p=document.getElementById('nr-picker'); if(!p){ p=document.createElement('div'); p.id='nr-picker'; p.className='nr-picker'; p.onclick=function(e){ if(e.target===p) nrClosePicker(); }; p.innerHTML='<div class="nr-pk" id="nr-pk"></div>'; document.body.appendChild(p); } return p; }
  function has(cat,id){ return (editing.recipients||[]).some(function(x){return x.cat===cat&&x.id===id;}); }
  window.nrOpenPicker=function(){
    pickSel={}; var pk=picker().querySelector('#nr-pk');
    pk.innerHTML='<div class="nr-pkh">Add recipients <span id="nr-pkcount"></span></div>'+
      '<input class="nr-in" id="nr-pksearch" placeholder="🔍  Search people, roles…" oninput="nrPkFilter(this.value)">'+
      catalog().map(function(grp){
        if(grp.cat==='ext'){
          return '<div class="nr-pkgrp"><div class="nr-pkg"><span class="nr-cdot2 '+grp.cat+'"></span>'+esc(grp.group)+'</div>'+
            grp.items.map(function(it){ return '<button class="nr-pki" data-lbl="'+attr((it.label||'').toLowerCase())+'" onclick="nrAddExt(\''+it.ext+'\')"><span class="nr-av ext">↗</span>'+esc(it.label)+'<span class="nr-pkd">Outside</span></button>'; }).join('')+'</div>';
        }
        return '<div class="nr-pkgrp"><div class="nr-pkg"><span class="nr-cdot2 '+grp.cat+'"></span>'+esc(grp.group)+'</div>'+
          grp.items.map(function(it){ var already=has(grp.cat,it.id);
            return '<label class="nr-pki chk" data-lbl="'+attr((it.label||'').toLowerCase())+'"><input type="checkbox"'+(already?' checked disabled':'')+' onchange="nrPkToggle(\''+grp.cat+'\',\''+attr(it.id)+'\',\''+attr(it.label).replace(/'/g,"\\'")+'\',this.checked)"><span class="nr-av '+grp.cat+'">'+esc(initials(it.label))+'</span>'+esc(it.label)+'<span class="nr-pkd">'+(already?'added':CATMETA[grp.cat])+'</span></label>'; }).join('')+'</div>';
      }).join('')+
      '<div class="nr-pkfoot"><button class="nr-btn pri" id="nr-pkadd" style="width:100%" onclick="nrApplyPicked()">Add selected</button></div>';
    picker().classList.add('show'); nrPkCount();
  };
  window.nrClosePicker=function(){ var p=document.getElementById('nr-picker'); if(p) p.classList.remove('show'); };
  window.nrPkToggle=function(cat,id,label,on){ var k=cat+':'+id; if(on) pickSel[k]={cat:cat,id:id,label:label}; else delete pickSel[k]; nrPkCount(); };
  function nrPkCount(){ var n=Object.keys(pickSel).length; var c=document.getElementById('nr-pkcount'); if(c) c.textContent=n?('· '+n+' selected'):''; var b=document.getElementById('nr-pkadd'); if(b) b.textContent=n?('Add '+n+' recipient'+(n>1?'s':'')):'Add selected'; }
  window.nrPkFilter=function(q){ q=(q||'').toLowerCase(); (document.querySelectorAll('#nr-pk .nr-pki')||[]).forEach(function(it){ it.style.display=(!q||(it.getAttribute('data-lbl')||'').indexOf(q)>=0)?'':'none'; }); (document.querySelectorAll('#nr-pk .nr-pkgrp')||[]).forEach(function(g){ var any=[].some.call(g.querySelectorAll('.nr-pki'),function(i){return i.style.display!=='none';}); g.style.display=any?'':'none'; }); };
  window.nrApplyPicked=function(){ Object.keys(pickSel).forEach(function(k){ var s=pickSel[k]; if(!has(s.cat,s.id)) editing.recipients.push(rcp(s.id,s.label,s.cat,{email:1},'')); }); document.getElementById('nr-b-recips').innerHTML=editing.recipients.map(recipRow).join(''); updateSummary(); nrClosePicker(); };
  window.nrAddExt=function(kind){ editing.recipients.push(rcp(kind==='sms'?'ext_sms':'ext_email','','ext',kind==='sms'?{sms:1}:{email:1},'')); document.getElementById('nr-b-recips').innerHTML=editing.recipients.map(recipRow).join(''); updateSummary(); nrClosePicker(); };

  // ---------- access (points at the central permission) ----------
  window.nrOpenAccess=function(){
    var o=document.getElementById('nr-overlay2'); if(!o){ o=document.createElement('div'); o.id='nr-overlay2'; o.className='nr-overlay'; o.onclick=function(e){ if(e.target===o) o.classList.remove('show'); }; document.body.appendChild(o); }
    var roleIds=(typeof getRoles==='function')?getRoles():['owner','manager','back_office','estimator','lead_tech','helper_tech','project_manager','subcontractor'];
    o.innerHTML='<div class="nr-builder" style="max-width:480px"><div class="nr-bhead"><div style="flex:1;font-weight:700;font-size:16px">🔒 Who can manage notification rules</div><button class="nr-x" onclick="document.getElementById(\'nr-overlay2\').classList.remove(\'show\')">×</button></div>'+
      '<div class="nr-bbody"><p class="nr-hint" style="margin:10px 0 8px">This is <b>one permission</b> — <code>notifications.manage</code> — that lives in your central <b>Roles &amp; Permissions</b> matrix, right next to every other permission. Set it there, next to everything else — access is governed in one place, never per-feature. Owner always has it.</p>'+
      '<div class="nr-permkey">Permission · <code>notifications.manage</code> · across your configured roles</div>'+
      roleIds.map(function(r){ var lbl=(typeof getRoleLabel==='function')?getRoleLabel(r):r; var on=(r==='owner')||(typeof roleHasPermission==='function'&&roleHasPermission(r,'notifications.manage')); return '<div class="nr-accrow"><span class="nr-av role">◆</span><div class="nr-at"><b>'+esc(lbl)+'</b></div>'+(r==='owner'?'<span class="nr-locked">🔒 Always</span>':'<span class="nr-accstate">'+(on?'✓ can manage':'—')+'</span>')+'</div>'; }).join('')+
      '<button class="nr-addr" style="margin-top:12px" onclick="goPage&&goPage(\'settings\');document.getElementById(\'nr-overlay2\').classList.remove(\'show\')">Open Roles &amp; Permissions →</button></div></div>';
    o.classList.add('show');
  };

  // ---------- CSS (injected once) ----------
  function ensureCss(){
    if(_cssInjected) return; _cssInjected=true;
    var s=document.createElement('style'); s.id='nr-css';
    s.textContent = [
      '#page-notifrules{--nra:#1565c0;--nrline:#e4ebf2;--nrink:#15314e;--nrink2:#5a7085;--nrbg:#f5f8fc;--nrcard:#fff}',
      '#nr-root{max-width:900px;margin:0 auto}',
      '.nr-head{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px}',
      '.nr-h-t{flex:1;min-width:240px}.nr-h-t h2{margin:0 0 3px;font-size:22px;color:var(--nrink)}.nr-h-t p{margin:0;font-size:13px;color:var(--nrink2);max-width:620px}',
      '.nr-h-btns{display:flex;gap:8px;flex-wrap:wrap}',
      '.nr-btn{font-size:13px;font-weight:600;border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid var(--nrline);background:#fff;color:var(--nrink)}',
      '.nr-btn:hover{border-color:var(--nra)}.nr-btn.pri{background:var(--nra);border-color:var(--nra);color:#fff}.nr-btn.danger{color:#c62828;border-color:#f3c0c0;margin-right:auto}',
      '.nr-master{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--nrline);border-radius:12px;padding:13px 16px;margin-bottom:10px}',
      '.nr-mi{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;background:#e6f4ec;color:#15924e;font-size:17px}.nr-master.off .nr-mi{background:#fdf1e3;color:#b45309}',
      '.nr-mt{flex:1;min-width:0}.nr-mt b{font-size:14px;color:var(--nrink)}.nr-mt div{font-size:12px;color:var(--nrink2)}',
      '.nr-switch{width:44px;height:26px;border-radius:999px;background:#15924e;position:relative;flex:none;cursor:pointer;border:none;padding:0;transition:background .15s}.nr-switch.off{background:#cfd8e0}',
      '.nr-switch::after{content:"";position:absolute;top:3px;left:21px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.3)}.nr-switch.off::after{left:3px}',
      '.nr-switch.sm{width:38px;height:22px}.nr-switch.sm::after{width:16px;height:16px;top:3px;left:19px}.nr-switch.sm.off::after{left:3px}',
      '.nr-sched{display:flex;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--nrline);border-radius:12px;padding:12px 14px;margin-bottom:7px}',
      '.nr-sb{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--nrink2);flex:1;min-width:190px}.nr-sb b{color:var(--nrink)}',
      '.nr-sbic{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#f1f5f9;font-size:14px;flex:none}',
      '.nr-time{font-size:12.5px;padding:4px 7px;border:1px solid var(--nrline);border-radius:7px;background:#f1f5f9}',
      '.nr-note{font-size:11.5px;color:var(--nrink2);margin:0 2px 16px;line-height:1.55}',
      '.nr-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:11px}',
      '.nr-in{font-size:13px;color:var(--nrink);background:#f1f5f9;border:1px solid var(--nrline);border-radius:9px;padding:9px 11px}',
      '#nr-search{flex:1;min-width:200px}.nr-gb{font-size:12px;color:var(--nrink2);font-weight:600;display:inline-flex;align-items:center;gap:6px}.nr-gb select{font-size:12.5px;padding:7px 9px;border:1px solid var(--nrline);border-radius:8px;background:#fff}',
      '.nr-chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:14px}',
      '.nr-chip{font-size:12px;font-weight:600;border:1px solid var(--nrline);background:#fff;color:var(--nrink2);border-radius:20px;padding:5px 12px;cursor:pointer}.nr-chip:hover{border-color:var(--nra);color:var(--nra)}.nr-chip.on{background:var(--nra);border-color:var(--nra);color:#fff}',
      '.nr-cdiv{width:1px;height:18px;background:var(--nrline);margin:0 3px}',
      '.nr-grp .nr-gh{display:flex;align-items:center;gap:9px;margin:18px 2px 10px;cursor:pointer;user-select:none}.nr-ghic{font-size:15px}.nr-ght{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--nrink2)}',
      '.nr-ghn{font-size:11px;font-weight:700;color:#8aa0b2;background:#f1f5f9;border-radius:10px;padding:1px 8px}.nr-ghc{margin-left:auto;color:#8aa0b2;transition:transform .2s}.nr-grp.collapsed .nr-ghc{transform:rotate(-90deg)}.nr-grp.collapsed .nr-gb-body{display:none}',
      '.nr-gb-body{display:flex;flex-direction:column;gap:11px}',
      '.nr-rule{position:relative;background:#fff;border:1px solid var(--nrline);border-radius:12px;padding:15px 16px;margin-bottom:11px;cursor:pointer;box-shadow:0 1px 2px rgba(15,30,46,.05)}.nr-rule:hover{border-color:var(--nra)}.nr-rule.off{opacity:.62}',
      '.nr-edit{position:absolute;top:14px;right:50px;border:none;background:#f1f5f9;color:var(--nrink2);width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:13px}.nr-edit:hover{background:#e8f0fe;color:var(--nra)}',
      '.nr-rule .nr-switch.sm{position:absolute;top:15px;right:15px}',
      '.nr-rtop{display:flex;align-items:center;gap:11px}.nr-ric{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:#f1f5f9}.nr-rname{font-weight:700;font-size:15px;color:var(--nrink)}',
      '.nr-rwhen{font-size:12.5px;color:var(--nrink2);margin:9px 0 0;padding-left:45px}.nr-rwhen b{color:var(--nrink)}',
      '.nr-rmeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:11px 0 0;padding-left:45px}.nr-chipwrap{display:flex;gap:6px;flex-wrap:wrap}.nr-chic{margin-left:auto;font-size:12px}',
      '.nr-chipr{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;border-radius:7px;padding:3px 8px}.nr-chipr .nr-cdot{width:7px;height:7px;border-radius:2px}',
      '.nr-chipr.team{color:#1565c0;background:#e8f0fe}.nr-chipr.team .nr-cdot{background:#1565c0}.nr-chipr.role{color:#7c3aed;background:#f0e9fe}.nr-chipr.role .nr-cdot{background:#7c3aed}',
      '.nr-chipr.ctx{color:#0e8aa6;background:#e2f4f8}.nr-chipr.ctx .nr-cdot{background:#0e8aa6}.nr-chipr.cust{color:#c2710c;background:#fbeedb}.nr-chipr.cust .nr-cdot{background:#c2710c}.nr-chipr.ext{color:#d6332b;background:#fde9e8}.nr-chipr.ext .nr-cdot{background:#d6332b}',
      '.nr-empty,.nr-noaccess{text-align:center;color:var(--nrink2);font-size:13px;padding:28px 16px;border:1.5px dashed var(--nrline);border-radius:12px;background:#fff}.nr-noaccess div{font-size:12px;margin-top:6px}',
      // overlays
      '.nr-overlay,.nr-picker{position:fixed;inset:0;background:rgba(12,19,27,.5);z-index:9000;display:none;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto}',
      '.nr-overlay.show,.nr-picker.show{display:flex}.nr-picker{align-items:flex-end}@media(min-width:620px){.nr-picker{align-items:center}}',
      '.nr-builder{background:#fff;border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.3);width:100%;max-width:620px;margin:auto}',
      '.nr-bhead{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--nrline)}.nr-bname{flex:1;min-width:0;font-size:16px;font-weight:700;border:none;padding:4px 2px;color:var(--nrink)}.nr-bname:focus{outline:none;border-bottom:2px solid var(--nra)}',
      '.nr-x{border:none;background:#f1f5f9;color:var(--nrink2);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:17px}',
      '.nr-bbody{padding:6px 18px 2px}.nr-step{padding:16px 0;border-bottom:1px solid #eef3f8}.nr-step:last-child{border-bottom:none}',
      '.nr-slbl{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--nra);margin-bottom:11px}.nr-n{width:19px;height:19px;border-radius:5px;background:#e8f0fe;display:grid;place-items:center;font-size:11px}',
      '.nr-row{display:flex;gap:9px;flex-wrap:wrap}.nr-row select{flex:1;min-width:120px;font-size:13.5px;padding:9px 11px;border:1px solid var(--nrline);border-radius:9px;background:#f1f5f9;cursor:pointer}',
      '.nr-modetog{display:inline-flex;background:#f1f5f9;border-radius:9px;padding:3px;gap:3px;margin:12px 0 2px}.nr-mt{font-size:12.5px;font-weight:600;border:none;background:none;color:var(--nrink2);padding:6px 13px;border-radius:7px;cursor:pointer}.nr-mt.on{background:#fff;color:var(--nrink);box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      '.nr-simplenote{font-size:12.5px;color:var(--nrink2);background:#f1f5f9;border-radius:9px;padding:11px 13px;line-height:1.5}',
      '.nr-recip{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 11px;border:1px solid var(--nrline);border-radius:10px;margin-bottom:8px}',
      '.nr-who{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:13px}.nr-av{width:24px;height:24px;border-radius:6px;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;color:#fff}',
      '.nr-av.team{background:#1565c0}.nr-av.role{background:#7c3aed}.nr-av.ctx{background:#0e8aa6}.nr-av.cust{background:#c2710c}.nr-av.ext{background:#d6332b}',
      '.nr-kind{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:5px;color:#fff;opacity:.9}.nr-kind.team{background:#1565c0}.nr-kind.role{background:#7c3aed}.nr-kind.ctx{background:#0e8aa6}.nr-kind.cust{background:#c2710c}.nr-kind.ext{background:#d6332b}',
      '.nr-extin{flex:1;min-width:120px;font-size:12.5px;padding:6px 9px;border:1px solid var(--nrline);border-radius:7px}',
      '.nr-ctoggles{display:flex;gap:5px;margin-left:auto}.nr-ctog{font-size:12px;border:1px solid var(--nrline);background:#f1f5f9;color:#8aa0b2;border-radius:7px;padding:5px 8px;cursor:pointer}.nr-ctog.on{background:var(--nra);border-color:var(--nra);color:#fff}.nr-ctog.dis{opacity:.35;cursor:not-allowed}',
      '.nr-rm{border:none;background:none;color:#8aa0b2;cursor:pointer;font-size:14px}.nr-rm:hover{color:#c62828}',
      '.nr-addr{font-size:13px;font-weight:600;color:var(--nra);background:#e8f0fe;border:none;border-radius:9px;padding:9px 13px;cursor:pointer;margin-top:2px}',
      '.nr-fld{margin-bottom:10px}.nr-fld label{display:block;font-size:11.5px;font-weight:600;color:var(--nrink2);margin-bottom:5px}.nr-fld .nr-in,.nr-fld textarea{width:100%}.nr-fld textarea{min-height:66px;resize:vertical;font-family:inherit;font-size:13.5px;border:1px solid var(--nrline);border-radius:9px;padding:9px 11px;background:#f1f5f9;line-height:1.5}',
      '.nr-vars{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.nr-varc{font-size:11px;font-weight:600;font-family:ui-monospace,monospace;color:#0e8aa6;background:#e2f4f8;border:none;border-radius:6px;padding:4px 8px;cursor:pointer}',
      '.nr-hint{font-size:11.5px;color:#8aa0b2;margin-top:6px}.nr-opt{display:flex;align-items:center;gap:10px;padding:8px 0}.nr-ot{flex:1;min-width:0;font-size:13px;color:var(--nrink)}.nr-ot div{font-size:11.5px;color:var(--nrink2)}',
      '.nr-summary{background:#e8f0fe;border-radius:10px;padding:12px 14px;font-size:13.5px;color:var(--nrink);line-height:1.55}.nr-summary .nr-sk{color:#8aa0b2;font-weight:600}.nr-summary b{color:var(--nra)}',
      '.nr-bfoot{display:flex;gap:9px;align-items:center;padding:14px 18px;border-top:1px solid var(--nrline);position:sticky;bottom:0;background:#fff;border-radius:0 0 16px 16px}.nr-test{margin-right:auto;font-size:12.5px;color:var(--nrink2);background:none;border:none;cursor:pointer}.nr-test:hover{color:var(--nra)}',
      '.nr-pk{background:#fff;border-radius:16px 16px 0 0;box-shadow:0 14px 44px rgba(0,0,0,.3);width:100%;max-width:620px;max-height:78vh;overflow:auto;padding:14px 0 16px}@media(min-width:620px){.nr-pk{border-radius:16px;max-height:84vh}}',
      '.nr-pkh{font-size:14px;font-weight:700;padding:4px 18px 4px}#nr-pkcount{color:#8aa0b2;font-weight:500;font-size:12px}#nr-pksearch{width:calc(100% - 36px);margin:6px 18px 8px}',
      '.nr-pkgrp{padding:10px 18px 2px}.nr-pkg{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8aa0b2;margin-bottom:7px;display:flex;align-items:center;gap:6px}.nr-cdot2{width:9px;height:9px;border-radius:3px}.nr-cdot2.team{background:#1565c0}.nr-cdot2.role{background:#7c3aed}.nr-cdot2.ctx{background:#0e8aa6}.nr-cdot2.cust{background:#c2710c}.nr-cdot2.ext{background:#d6332b}',
      '.nr-pki{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;background:none;cursor:pointer;padding:9px 8px;border-radius:9px;font-size:13.5px;color:var(--nrink)}.nr-pki:hover{background:#f1f5f9}.nr-pki.chk{cursor:pointer}.nr-pki input{width:18px;height:18px;flex:none;margin:0 2px 0 4px}.nr-pki input:disabled{opacity:.5}.nr-pkd{font-size:11.5px;color:var(--nrink2);margin-left:auto}',
      '.nr-pkfoot{padding:12px 18px 2px}',
      '.nr-permkey{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#8aa0b2;margin:2px 0 8px}.nr-overlay code,#nr-root code{font-family:ui-monospace,monospace;font-size:11.5px;background:#f1f5f9;border:1px solid var(--nrline);border-radius:5px;padding:1px 6px;color:var(--nrink2);text-transform:none;letter-spacing:0}',
      '.nr-accrow{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid #eef3f8}.nr-accrow:last-of-type{border-bottom:none}.nr-at{flex:1}.nr-at b{font-size:13.5px}.nr-locked{font-size:11px;color:#8aa0b2}.nr-accstate{font-size:12px;color:var(--nrink2)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // expose entry point
  window.renderNotifRulesPage = renderNotifRulesPage;
})();
