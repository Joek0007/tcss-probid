// ============================================================
// CRM MODULE — Customer Profile, Contact Linking, Quote-to-Job
// ============================================================

// ---- CUSTOMER PROFILE OVERLAY ----
var _cpCustomerId = null;
var _cpTab = 'overview';

function openCustomerProfile(customerId) {
  _cpCustomerId = customerId;
  _cpTab = 'overview';
  var customer = (DB.customers||[]).find(function(c){ return c.id===customerId; });
  if (!customer) return;

  // Header
  var initials = (customer.name||'?').split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
  var av = document.getElementById('cp-avatar'); if(av) av.textContent=initials;
  var nm = document.getElementById('cp-name');   if(nm) nm.textContent=customer.name||'';
  var mt = document.getElementById('cp-meta');
  if (mt) mt.textContent = [customer.phone,customer.email,customer.address].filter(Boolean).join(' · ');

  // Stats
  var quotes   = DB.quotes.filter(function(q){ return (q.cn||'').toLowerCase()===(customer.name||'').toLowerCase(); });
  var jobs     = (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[])).filter(function(j){ return (j.customer||j.customerName||'').toLowerCase()===(customer.name||'').toLowerCase(); });
  var contacts = DB.contacts.filter(function(x){ return x.customerId===customerId; });
  var wonRev   = quotes.filter(function(q){ return q.status==='approved'; }).reduce(function(s,q){ return s+(q.total||0); }, 0);

  var statsEl = document.getElementById('cp-stats');
  if (statsEl) statsEl.innerHTML =
    cpStat(quotes.length,'Quotes','📋')+
    cpStat(jobs.length,'Jobs','🔧')+
    cpStat(contacts.length,'Contacts','👤')+
    cpStat('$'+Math.round(wonRev).toLocaleString(),'Won Revenue','💰');

  // Show
  var overlay = document.getElementById('customer-profile-overlay');
  if (overlay) { overlay.style.display='block'; document.body.style.overflow='hidden'; }

  switchCPTab('overview');
}

function cpStat(val, label, icon) {
  return '<div class="cp-stat-card">'+
    '<div class="cp-stat-val">'+icon+' '+escHtml(String(val))+'</div>'+
    '<div class="cp-stat-lbl">'+escHtml(label)+'</div>'+
  '</div>';
}

function closeCustomerProfile() {
  var overlay = document.getElementById('customer-profile-overlay');
  if (overlay) overlay.style.display='none';
  document.body.style.overflow='';
}

function switchCPTab(tab) {
  _cpTab = tab;
  document.querySelectorAll('.cp-tab').forEach(function(t){ t.classList.remove('active'); });
  var btn = document.getElementById('cpt-'+tab);
  if (btn) btn.classList.add('active');
  var content = document.getElementById('cp-content');
  if (!content) return;
  var customer = (DB.customers||[]).find(function(c){ return c.id===_cpCustomerId; });
  if (!customer) return;

  var quotes   = DB.quotes.filter(function(q){ return q.customerId===_cpCustomerId || (q.cn||'').toLowerCase()===(customer.name||'').toLowerCase(); });
  var jobs     = (typeof _getActiveWOsAsJobs==="function"?_getActiveWOsAsJobs():(DB.jobs||[])).filter(function(j){ return j.customerId===_cpCustomerId || (j.customer||j.customerName||'').toLowerCase()===(customer.name||'').toLowerCase(); });
  var contacts = DB.contacts.filter(function(x){ return x.customerId===_cpCustomerId; });
  var projects = (DB.wtProjects||[]).filter(function(p){ return p.customerId===_cpCustomerId || (p.customer||'').toLowerCase()===(customer.name||'').toLowerCase(); });

  if (tab==='overview') content.innerHTML = renderCPOverview(customer, quotes, jobs, contacts, projects);
  else if (tab==='quotes')   content.innerHTML = renderCPQuotes(quotes);
  else if (tab==='jobs')     content.innerHTML = renderCPJobs(jobs);
  else if (tab==='contacts') content.innerHTML = renderCPContacts(contacts, customer);
  else if (tab==='projects') content.innerHTML = renderCPProjects(projects);
  else if (tab==='alerts')   content.innerHTML = renderCPAlerts(customer);
  else if (tab==='comms')    content.innerHTML = (typeof renderCPComms === 'function') ? renderCPComms(_cpCustomerId) : '<div style="padding:20px;color:#90a4ae">Loading...</div>';
}

function renderCPAlerts(customer) {
  var alerts = customer.moduleAlerts || {};
  var modules = [
    { key:'customer',      icon:'👥', label:'Customer Alert',      desc:'Fires when this customer\'s profile is opened' },
    { key:'quote',         icon:'📋', label:'Quote Alert',         desc:'Fires when a new quote is started for this customer' },
    { key:'workorder',     icon:'🔨', label:'Work Order Alert',    desc:'Fires when a work order is opened for this customer' },
    { key:'invoice',       icon:'🧾', label:'Invoice Alert',       desc:'Fires when an invoice is opened for this customer' },
    { key:'purchaseorder', icon:'📦', label:'Purchase Order Alert',desc:'Fires when a PO is created for this customer' },
  ];

  var canEdit = typeof _currentUser !== 'undefined' && _currentUser &&
    ['owner','manager'].includes(_currentUser.role);

  var html = '<div style="max-width:680px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">';
  html += '<div class="cp-section-title" style="margin:0">Module Alerts</div>';
  if (canEdit) {
    html += '<button class="btn btn-primary btn-sm" onclick="saveCPAlerts()">💾 Save Alerts</button>';
  }
  html += '</div>';
  html += '<p style="font-size:12px;color:#90a4ae;margin-bottom:18px">Each alert fires automatically when that module is accessed for this customer. Leave blank to disable.</p>';

  modules.forEach(function(m) {
    var val = alerts[m.key] || '';
    var hasAlert = val.trim().length > 0;
    html +=
      '<div style="margin-bottom:14px;background:#fff;border-radius:10px;border:1.5px solid '+(hasAlert?'#ffb300':'#e0e7ef')+';overflow:hidden">'+
        '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:'+(hasAlert?'#fff8e1':'#f8f9fa')+';border-bottom:1px solid '+(hasAlert?'#ffe082':'#f0f0f0')+'">'+
          '<span style="font-size:18px">'+m.icon+'</span>'+
          '<div style="flex:1">'+
            '<div style="font-size:13px;font-weight:700;color:#0d1b2a">'+m.label+'</div>'+
            '<div style="font-size:11px;color:#90a4ae">'+m.desc+'</div>'+
          '</div>'+
          (hasAlert ? '<span style="background:#e65100;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">ACTIVE</span>' : '<span style="background:#e0e7ef;color:#90a4ae;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">INACTIVE</span>')+
        '</div>'+
        '<div style="padding:10px 14px">'+
          (canEdit
            ? '<textarea id="cp-alert-'+m.key+'" rows="2" placeholder="Type alert message... (leave blank to disable)" style="width:100%;padding:8px 10px;border:1.5px solid #e0e7ef;border-radius:7px;font-size:13px;color:#1a1a2e;resize:vertical;outline:none" oninput="this.closest(\'div[style*=border]\').style.borderColor=this.value.trim()?\'#ffb300\':\'#e0e7ef\'">'+escHtml(val)+'</textarea>'
            : (val ? '<div style="font-size:13px;color:#37474f;background:#fff8e1;border-radius:7px;padding:10px 12px;border-left:3px solid #e65100">'+escHtml(val)+'</div>' : '<div style="font-size:12px;color:#c0c0c0;font-style:italic">No alert set</div>')+
          '</div>'+
      '</div>';
  });

  html += '</div>';
  return html;
}

function saveCPAlerts() {
  var customer = (DB.customers||[]).find(function(c){ return c.id===_cpCustomerId; });
  if (!customer) return;
  var keys = ['customer','quote','workorder','invoice','purchaseorder'];
  customer.moduleAlerts = {};
  keys.forEach(function(k) {
    var el = document.getElementById('cp-alert-'+k);
    customer.moduleAlerts[k] = el ? el.value.trim() : '';
  });
  saveDB();
  if (typeof _pushCustomerToSupabase === 'function') _pushCustomerToSupabase(customer);
  showToast('Alerts saved ✓','success');
  switchCPTab('alerts');
}
  var wonQuotes   = quotes.filter(function(q){ return q.status==='approved'; });
  var openQuotes  = quotes.filter(function(q){ return q.status!=='approved'&&q.status!=='declined'; });
  var activeJobs  = jobs.filter(function(j){ return j.status==='Scheduled'||j.status==='In Progress'; });
  var wonRev      = wonQuotes.reduce(function(s,q){ return s+(q.total||0); }, 0);
  var winRate     = quotes.length ? Math.round(wonQuotes.length/quotes.length*100) : 0;
  var recentQuote = quotes.slice().sort(function(a,b){ return (b.dt||'').localeCompare(a.dt||''); })[0];
  var recentJob   = jobs.slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); })[0];

  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

  // Left: quick facts
  html += '<div>'+
    '<div class="cp-section-title">Customer Details</div>'+
    '<div style="background:#f8f9fa;border-radius:10px;padding:14px;font-size:13px;line-height:2">'+
      (customer.phone?'<div>📞 <a href="tel:'+escHtml(customer.phone)+'" style="color:#1565c0">'+escHtml(customer.phone)+'</a></div>':'')+
      (customer.email?'<div>✉️ <a href="mailto:'+escHtml(customer.email)+'" style="color:#1565c0">'+escHtml(customer.email)+'</a></div>':'')+
      (customer.address?'<div>📍 '+escHtml(customer.address)+'</div>':'')+
      '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e0e7ef;display:flex;gap:10px;flex-wrap:wrap">'+
        '<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:8px 14px;min-width:120px">'+
          '<span style="font-size:10px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:.5px">💳 Payment Terms</span><br>'+
          '<span style="font-size:14px;font-weight:700;color:#0d47a1">'+escHtml(customer.defaultTerms||'Due on Receipt')+'</span>'+
        '</div>'+
        (customer.taxExempt
          ? '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:8px 14px;min-width:100px">'+
              '<span style="font-size:10px;font-weight:700;color:#2e7d32;text-transform:uppercase;letter-spacing:.5px">🏷 Tax Status</span><br>'+
              '<span style="font-size:14px;font-weight:700;color:#1b5e20">✓ Tax Exempt</span>'+
            '</div>'
          : '<div style="background:#fff3e0;border:1px solid #ffb74d;border-radius:8px;padding:8px 14px;min-width:100px">'+
              '<span style="font-size:10px;font-weight:700;color:#e65100;text-transform:uppercase;letter-spacing:.5px">🏷 Tax Status</span><br>'+
              '<span style="font-size:14px;font-weight:700;color:#e65100">Taxable</span>'+
            '</div>')+
      '</div>'+
      (customer.notes?'<div style="margin-top:8px;color:#546e7a;font-size:12px;font-style:italic">'+escHtml(customer.notes)+'</div>':'')+
    '</div>'+
    '<div style="margin-top:12px;display:flex;gap:8px">'+
      '<button class="btn btn-primary btn-sm" onclick="editCustomer(\''+_cpCustomerId+'\')">✏ Edit</button>'+
      '<button class="btn btn-outline btn-sm" onclick="openQuoteForCustomer(\''+escHtml(customer.name)+'\')">+ New Quote</button>'+
      '<button class="btn btn-outline btn-sm" onclick="openNewWOForCustomer(\''+escHtml(customer.id)+'\',\''+escHtml(customer.name)+'\')">+ New Work Order</button>'+
    '</div>'+
  '</div>';

  // Right: activity summary
  html += '<div>'+
    '<div class="cp-section-title">Activity Summary</div>'+
    '<div style="background:#f8f9fa;border-radius:10px;padding:14px">'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">'+
        miniStat(wonRev,'$','Won Revenue','#2e7d32')+
        miniStat(winRate,'%','Win Rate','#1565c0')+
        miniStat(openQuotes.length,'','Open Quotes','#e65100')+
        miniStat(activeJobs.length,'','Active Jobs','#6a1b9a')+
      '</div>'+
      (recentQuote?'<div style="font-size:12px;color:#546e7a">Last quote: <strong>'+escHtml(recentQuote.jn||recentQuote.num||'')+'</strong> '+escHtml(recentQuote.dt||'')+'</div>':'')+
      (recentJob?'<div style="font-size:12px;color:#546e7a;margin-top:2px">Last job: <strong>'+escHtml(recentJob.name||'')+'</strong></div>':'')+
    '</div>'+
    // Primary contact quick view
    (contacts.length?
      '<div class="cp-section-title" style="margin-top:14px">Primary Contact</div>'+
      '<div class="cp-contact-card">'+
        '<div class="cp-contact-avatar">'+escHtml((contacts[0].name||'?')[0].toUpperCase())+'</div>'+
        '<div><div style="font-weight:700;font-size:13px">'+escHtml(contacts[0].name||'')+'</div>'+
        '<div style="font-size:12px;color:#546e7a">'+escHtml(contacts[0].role||contacts[0].title||'')+'</div>'+
        (contacts[0].phone?'<div style="font-size:12px;color:#1565c0">'+escHtml(contacts[0].phone)+'</div>':'')+
      '</div></div>':'')+
  '</div>';

  html += '</div>';
  return html;
}

function miniStat(val, prefix, label, color) {
  var display = prefix==='$' ? '$'+Math.round(val).toLocaleString() : (prefix==='%' ? val+'%' : val);
  return '<div style="text-align:center;background:#fff;border-radius:8px;padding:8px">'+
    '<div style="font-weight:800;font-size:15px;color:'+color+'">'+escHtml(String(display))+'</div>'+
    '<div style="font-size:10px;color:#90a4ae;text-transform:uppercase;letter-spacing:.4px">'+escHtml(label)+'</div>'+
  '</div>';
}

function renderCPQuotes(quotes) {
  if (!quotes.length) return '<div style="color:#90a4ae;padding:20px;text-align:center">No quotes yet for this customer.</div>';
  var statusColors = {draft:'#546e7a',sent:'#1565c0',approved:'#2e7d32',declined:'#c62828',followup:'#e65100'};
  var sorted = quotes.slice().sort(function(a,b){ return (b.dt||'').localeCompare(a.dt||''); });
  return '<div class="cp-section-title">All Quotes ('+quotes.length+')</div>'+
    sorted.map(function(q){
      var sc = statusColors[q.status||'draft']||'#546e7a';
      return '<div class="cp-quote-row" onclick="closeCustomerProfile();editQuote(\''+q.id+'\')">'+
        '<div>'+
          '<div style="font-weight:700;font-size:13px">'+escHtml(q.jn||q.num||'Untitled')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(q.num||'')+' · '+escHtml(q.dt||'')+(q.contactName?' · '+escHtml(q.contactName):'')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="font-weight:700;font-size:14px">$'+Math.round(q.total||0).toLocaleString()+'</div>'+
          '<span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">'+escHtml(q.status||'draft')+'</span>'+
        '</div>'+
      '</div>';
    }).join('');
}

function renderCPJobs(jobs) {
  if (!jobs.length) return '<div style="color:#90a4ae;padding:20px;text-align:center">No jobs yet for this customer.</div>';
  var statusColors={'Scheduled':'#1565c0','In Progress':'#2e7d32','Complete':'#546e7a','Closed':'#90a4ae','On Hold':'#e65100'};
  return '<div class="cp-section-title">All Jobs ('+jobs.length+')</div>'+
    jobs.map(function(j){
      var sc = statusColors[j.status]||'#546e7a';
      var items = (DB.wtItems||[]).filter(function(i){ return i.projectId && (DB.wtProjects||[]).find(function(p){ return p.id===i.projectId&&(p.jobId===j.id||(p.customer||'').toLowerCase()===(j.customer||'').toLowerCase()); }); });
      var done  = items.filter(function(i){ return i.status==='done'; }).length;
      var pct   = items.length ? Math.round(done/items.length*100) : null;
      return '<div class="cp-quote-row">'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:13px">'+escHtml(j.name||'')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">'+escHtml(j.num||'')+' · Started: '+escHtml(j.startDate||j.createdAt&&j.createdAt.split('T')[0]||'—')+(j.assignedTo?' · '+escHtml(j.assignedTo):'')+'</div>'+
          (pct!==null?'<div class="wt-progress-bar" style="width:160px;margin-top:4px"><div class="wt-progress-fill" style="width:'+pct+'%"></div></div>':'')+''+
        '</div>'+
        '<span style="background:'+sc+'20;color:'+sc+';border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">'+escHtml(j.status)+'</span>'+
      '</div>';
    }).join('');
}

function renderCPContacts(contacts, customer) {
  return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'+
      '<div class="cp-section-title" style="margin:0">Contacts ('+contacts.length+')</div>'+
      '<button class="btn btn-primary btn-sm" onclick="newContactForCustomer(\''+_cpCustomerId+'\',\''+escHtml(customer.name)+'\')">+ Add Contact</button>'+
    '</div>'+
    (contacts.length?
      contacts.map(function(c){
        return '<div class="cp-contact-card">'+
          '<div class="cp-contact-avatar">'+escHtml((c.name||'?')[0].toUpperCase())+'</div>'+
          '<div style="flex:1">'+
            '<div style="font-weight:700;font-size:13px">'+escHtml(c.name||'')+'</div>'+
            '<div style="font-size:12px;color:#546e7a">'+escHtml(c.role||c.title||'')+(c.company?' · '+escHtml(c.company):'')+'</div>'+
            '<div style="font-size:12px;margin-top:2px;display:flex;gap:12px">'+
              (c.phone?'<a href="tel:'+escHtml(c.phone)+'" style="color:#1565c0">'+escHtml(c.phone)+'</a>':'')+
              (c.email?'<a href="mailto:'+escHtml(c.email)+'" style="color:#1565c0">'+escHtml(c.email)+'</a>':'')+
            '</div>'+
          '</div>'+
          '<div style="display:flex;gap:4px">'+
            '<button class="btn btn-outline btn-sm" onclick="editContact(\''+c.id+'\')">Edit</button>'+
          '</div>'+
        '</div>';
      }).join('') :
      '<div style="color:#90a4ae;font-size:13px;padding:12px 0">No contacts linked to this customer yet. Add one above.</div>');
}

function renderCPProjects(projects) {
  if (!projects.length) return '<div style="color:#90a4ae;padding:20px;text-align:center">No work tracking projects for this customer yet.</div>';
  return '<div class="cp-section-title">Work Tracking Projects ('+projects.length+')</div>'+
    projects.map(function(p){
      var items = (DB.wtItems||[]).filter(function(i){ return i.projectId===p.id; });
      var done  = items.filter(function(i){ return i.status==='done'; }).length;
      var pct   = items.length ? Math.round(done/items.length*100) : 0;
      return '<div class="cp-quote-row" onclick="loadWTProject(\''+p.id+'\');closeCustomerProfile();goPage(\'worktracking\')">'+
        '<div style="flex:1">'+
          '<div style="font-weight:700;font-size:13px">'+escHtml(p.name||'')+'</div>'+
          '<div style="font-size:11px;color:#546e7a">Lead: '+escHtml(p.leadTech||'—')+' · '+escHtml(p.startDate||'')+'</div>'+
          '<div class="wt-progress-bar" style="width:200px;margin-top:4px"><div class="wt-progress-fill" style="width:'+pct+'%"></div></div>'+
        '</div>'+
        '<div style="font-weight:800;font-size:14px;color:#1565c0">'+pct+'%</div>'+
      '</div>';
    }).join('');
}

// ---- CONTACT LINKING ----
function newContactForCustomer(customerId, customerName) {
  newContact();
  var custSel = document.getElementById('m-ct-custid');
  if (custSel) custSel.value = customerId;
  var coEl = document.getElementById('m-ctco');
  if (coEl) coEl.value = customerName||'';
}

function openQuoteForCustomer(customerName) {
  closeCustomerProfile();
  goPage('qq');
  setTimeout(function(){
    var cnEl = document.getElementById('qq-cn');
    if (cnEl) { cnEl.value=customerName; cnEl.dispatchEvent(new Event('input')); }
  }, 200);
}

// Patch newContact and editContact to populate customer dropdown
var _origNewContact = newContact;
function newContact() {
  // Clear all fields
  ['m-ctname','m-ctph','m-ctem','m-ctco','m-ct-notes','m-ctid'].forEach(function(fid){
    var e=document.getElementById(fid); if(e) e.value='';
  });
  ['m-ctrole','m-ct-type','m-ct-pref'].forEach(function(fid){
    var e=document.getElementById(fid); if(e) e.value='';
  });
  var titleEl=document.getElementById('modal-ct-title'); if(titleEl) titleEl.textContent='New Contact';
  populateContactCustomerDropdown('');
  var dl = document.getElementById('m-ctco-list');
  if (dl) dl.innerHTML=(DB.customers||[]).map(function(c){ return '<option value="'+escHtml(c.name)+'">'; }).join('');
  openModal('modal-contact');
}

var _origEditContact = editContact;
function editContact(id) {
  var c=(DB.contacts||[]).find(function(x){ return x.id==id; });
  if (!c) return;
  function sv(eid,v){ var e=document.getElementById(eid); if(e) e.value=v||''; }
  sv('m-ctname', c.name);
  sv('m-ctco',   c.company);
  sv('m-ctph',   c.phone);
  sv('m-ctem',   c.email);
  sv('m-ctrole', c.role||c.title);
  sv('m-ct-type',c.contactType);
  sv('m-ct-pref',c.contactPref);
  sv('m-ct-notes',c.notes);
  sv('m-ctid',   c.id);
  var titleEl=document.getElementById('modal-ct-title'); if(titleEl) titleEl.textContent='Edit Contact';
  populateContactCustomerDropdown(c.customerId||'');
  var dl = document.getElementById('m-ctco-list');
  if (dl) dl.innerHTML=(DB.customers||[]).map(function(cx){ return '<option value="'+escHtml(cx.name)+'">'; }).join('');
  openModal('modal-contact');
}

function populateContactCustomerDropdown(selectedId) {
  var sel = document.getElementById('m-ct-custid'); if(!sel) return;
  sel.innerHTML='<option value="">— Not linked —</option>';
  (DB.customers||[]).forEach(function(c){
    var opt=document.createElement('option');
    opt.value=c.id; opt.textContent=c.name;
    if(c.id===selectedId) opt.selected=true;
    sel.appendChild(opt);
  });
}

// Patch saveContact to save customerId
var _origSaveContact = saveContact;
function saveContact() {
  var id   = document.getElementById('m-ctid').value;
  var name = (document.getElementById('m-ctname')||{}).value||'';
  if (!name.trim()) { showToast('Name required','error'); return; }
  var custId = (document.getElementById('m-ct-custid')||{}).value||'';
  // Use UUID from creation so ID never changes during Supabase push
  var newId = id || (typeof makeUUID==='function' ? makeUUID() : 'ct-'+Date.now());
  var data = {
    id:          newId,
    name:        name.trim(),
    company:     (document.getElementById('m-ctco')||{}).value||'',
    phone:       (document.getElementById('m-ctph')||{}).value||'',
    email:       (document.getElementById('m-ctem')||{}).value||'',
    role:        (document.getElementById('m-ctrole')||{}).value||'',
    title:       (document.getElementById('m-ctrole')||{}).value||'',
    contactType: (document.getElementById('m-ct-type')||{}).value||'',
    contactPref: (document.getElementById('m-ct-pref')||{}).value||'',
    notes:       (document.getElementById('m-ct-notes')||{}).value||'',
    customerId:  custId
  };
  if (id) { var idx=DB.contacts.findIndex(function(c){ return c.id==id; }); if(idx>=0) DB.contacts[idx]=data; else DB.contacts.push(data); }
  else DB.contacts.push(data);
  saveDB(); closeModal('modal-contact'); renderContacts();
  if (_cpCustomerId) switchCPTab(_cpTab);
  showToast('"'+name+'" saved','success');
}

function saveContactAndAnother() {
  var name = (document.getElementById('m-ctname')||{}).value||'';
  if (!name.trim()) { showToast('Name required','error'); return; }
  var custId = (document.getElementById('m-ct-custid')||{}).value||'';
  var data = {
    id:          (typeof makeUUID==='function' ? makeUUID() : 'ct-'+Date.now()),
    name:        name.trim(),
    company:     (document.getElementById('m-ctco')||{}).value||'',
    phone:       (document.getElementById('m-ctph')||{}).value||'',
    email:       (document.getElementById('m-ctem')||{}).value||'',
    role:        (document.getElementById('m-ctrole')||{}).value||'',
    title:       (document.getElementById('m-ctrole')||{}).value||'',
    contactType: (document.getElementById('m-ct-type')||{}).value||'',
    contactPref: (document.getElementById('m-ct-pref')||{}).value||'',
    notes:       (document.getElementById('m-ct-notes')||{}).value||'',
    customerId:  custId
  };
  DB.contacts.push(data);
  saveDB(); renderContacts();
  // Clear fields but keep company/customer for next contact at same company
  var keepCo = (document.getElementById('m-ctco')||{}).value||'';
  var keepCustId = custId;
  ['m-ctname','m-ctph','m-ctem','m-ct-notes'].forEach(function(fid){
    var e=document.getElementById(fid); if(e) e.value='';
  });
  ['m-ctrole','m-ct-type','m-ct-pref'].forEach(function(fid){
    var e=document.getElementById(fid); if(e) e.value='';
  });
  document.getElementById('m-ctid').value='';
  var coEl=document.getElementById('m-ctco'); if(coEl) coEl.value=keepCo;
  var cidEl=document.getElementById('m-ct-custid'); if(cidEl) cidEl.value=keepCustId;
  var nameEl=document.getElementById('m-ctname'); if(nameEl) nameEl.focus();
  showToast('"'+name+'" saved — ready for next contact','success');
}

// ---- UPGRADED CONVERT-TO-JOB ----
// Patch the openConvertToJob trigger to populate new fields

function prepareConvertModal(qid) {
  var q=(DB.quotes||[]).find(function(x){return x.id==qid;});
  if(!q) return;
  var el=document.getElementById('ctj-qid'); if(el) el.value=qid;
  var nm=document.getElementById('ctj-name'); if(nm) nm.value=q.jn||'';
  var cu=document.getElementById('ctj-customer'); if(cu) cu.value=q.cn||'';
  var ad=document.getElementById('ctj-address'); if(ad) ad.value=q.ad||'';
  var st=document.getElementById('ctj-start'); if(st) st.value=new Date().toISOString().split('T')[0];
  // Populate customer datalist
  var cdl=document.getElementById('ctj-cust-list'); if(cdl) cdl.innerHTML=(DB.customers||[]).map(function(c){ return '<option value="'+escHtml(c.name)+'">'; }).join('');
  // Populate tech datalist
  var tdl=document.getElementById('ctj-tech-list'); if(tdl) tdl.innerHTML=(DB.team||[]).map(function(m){ return '<option value="'+escHtml(m.name)+'">'; }).join('');
  // Populate contacts for this customer
  var contactSel=document.getElementById('ctj-contact'); if(contactSel){
    contactSel.innerHTML='<option value="">— None —</option>';
    var custContacts=(DB.contacts||[]).filter(function(c){ return (c.company||'').toLowerCase()===(q.cn||'').toLowerCase()||c.customerId===((DB.customers||[]).find(function(x){ return (x.name||'').toLowerCase()===(q.cn||'').toLowerCase(); })||{}).id; });
    custContacts.forEach(function(c){ var o=document.createElement('option');o.value=c.id;o.textContent=c.name+(c.role?' ('+c.role+')':'');contactSel.appendChild(o); });
    // Pre-select if quote already has a contact
    if(q.contactId) contactSel.value=q.contactId;
  }
}

// Override confirmConvertJob to use new fields
function confirmConvertJob() {
  const qid  = document.getElementById('ctj-qid').value;
  const name = document.getElementById('ctj-name').value.trim();
  if (!name) { showToast('Job name is required','error'); return; }
  const q = DB.quotes.find(function(x){ return x.id == qid; });
  if (!q) return;

  const contactId  = (document.getElementById('ctj-contact')||{}).value||'';
  const contactName= contactId ? ((DB.contacts||[]).find(function(c){ return c.id===contactId; })||{}).name||'' : '';
  const leadTech   = (document.getElementById('ctj-assign')||{}).value||'';
  const address    = (document.getElementById('ctj-address')||{}).value||'';
  const customer   = (document.getElementById('ctj-customer')||{}).value||q.cn||'';
  const createWTP  = (document.getElementById('ctj-create-wtp')||{}).checked||false;

  // Mark quote Won
  q.status    = 'approved';
  q.wonDate   = new Date().toISOString().split('T')[0];
  q.contactId = contactId;

  // Create job
  const job = {
    id:              Date.now().toString(),
    num:             'J-' + (++DB.jobSeq),
    name:            name,
    customer:        customer,
    contactId:       contactId,
    contactName:     contactName,
    qid:             qid,
    qnum:            q.num||'',
    env:             q.env||'office',
    envLabel:        q.envLabel||'',
    jt:              q.jt||'',
    address:         address||q.ad||'',
    assignedTo:      leadTech,
    estLaborHours:   q.totalLaborHours||0,
    actualLaborHours:0,
    estCost:         q.totalCost||0,
    estTotal:        q.total||0,
    achievedMargin:  q.achievedMargin||0,
    items:           q.items ? JSON.parse(JSON.stringify(q.items)) : [],
    status:          'Scheduled',
    startDate:       (document.getElementById('ctj-start')||{}).value||'',
    notes:           (document.getElementById('ctj-notes')||{}).value||'',
    createdAt:       new Date().toISOString()
  };

  DB.jobs.unshift(job);

  // Optionally create WT project
  if (createWTP) {
    if (!DB.wtProjects) DB.wtProjects=[];
    DB.wtProjects.push({
      id:        'wtp-'+Date.now(),
      name:      name,
      customer:  customer,
      leadTech:  leadTech,
      startDate: job.startDate,
      address:   address,
      jobId:     job.id,
      systems:   [],
      createdAt: new Date().toISOString()
    });
  }

  saveDB();
  closeModal('modal-convert-job');

  // Auto-create Work Order linked to this job
  if (!DB.workOrders) DB.workOrders = [];
  if (!DB.woSeq) DB.woSeq = 1000;
  DB.woSeq++;
  var wo = {
    id:           'wo-'+Date.now(),
    woNumber:     'WO-'+DB.woSeq,
    customerId:   (DB.customers||[]).find(function(c){ return (c.name||'').toLowerCase()===(customer||'').toLowerCase(); }) ? (DB.customers.find(function(c){ return (c.name||'').toLowerCase()===(customer||'').toLowerCase(); })).id : null,
    customerName: customer,
    contactId:    contactId||null,
    description:  q.notes||q.scope||name,
    workPerformed:'',
    status:       'New',
    serviceType:  q.jt||'Installation',
    priority:     'Normal',
    serviceRep:   leadTech||null,
    siteAddr:     address||q.ad||'',
    siteCity:     q.adCity||'',
    siteState:    q.adState||'',
    siteZip:      q.adZip||'',
    laborRate:    q.laborRate||125,
    taxRate:      q.taxRate||0,
    dateRequested:job.startDate||'',
    jobId:        job.id,
    quoteId:      qid,
    invoiceId:    null,
    createdBy:    (_currentUser&&_currentUser.id)||null,
    createdByName:(_currentUser&&_currentUser.full_name)||'System',
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString()
  };
  DB.workOrders.unshift(wo);

  // Link WO back to job
  job.woId = wo.id;
  job.woNumber = wo.woNumber;

  saveDB();
  showToast('Job '+job.num+' + Work Order '+wo.woNumber+' created ✓','success',5000);
  renderDash();
  renderJobs();
}

// Wire prepareConvertModal into the convertToJob action

// ============================================================
// END CRM MODULE
