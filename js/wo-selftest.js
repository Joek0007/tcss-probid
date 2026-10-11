// ============================================================
// wo-selftest.js — self-test for "edit customer from a Work Order → WO fields refresh"
// ------------------------------------------------------------
// Verifies refreshWOCustomerFields() does the right thing when a customer is edited from the
// WO customer dropdown's ✏️ Edit button:
//   • the WO's customer NAME updates to the edited value
//   • the per-WO Site Address is NOT clobbered (it is intentionally independent of the
//     customer's billing address — selectWOCustomer only seeds it when empty)
//   • the always-visible contact bar reflects the selected contact's CURRENT db values
//     (phone/email), so an edited contact shows through on the WO
//   • the contacts list is re-populated (renamed contacts show)
//
// Zero footprint: throwaway in-memory customer+contact that are NEVER saved to disk or the
// cloud; removed afterward; the WO form's prior field values are captured and restored.
// Synchronous, so it can't hang.
//
// HOW TO RUN: open a Work Order (so the WO editor is mounted), then in the console type:
//   woSelfTest()
// Returns { passed, failed, total, failures:[...], all:[...] } and console.tables it.
// ============================================================
(function(){
  function qv(id){ var el=document.getElementById(id); return el ? (el.value||'') : '(no field)'; }
  function setv(id,v){ var el=document.getElementById(id); if(el) el.value=v; }

  function woSelfTest(){
    if (typeof refreshWOCustomerFields !== 'function' || typeof _populateWOContacts !== 'function') {
      return { error: 'Open a Work Order first (the WO editor must be loaded).' };
    }
    if (!document.getElementById('wo-customer-id') || !document.getElementById('wo-customer-name')) {
      return { error: 'Open a Work Order first (WO customer fields not found).' };
    }
    var R=[]; function A(label,exp,got){ R.push({ field:label, expected:String(exp), got:String(got), pass:String(got)===String(exp) }); }
    function AC(label,substr,hay){ R.push({ field:label, expected:'contains "'+substr+'"', got:String(hay), pass:String(hay).indexOf(substr)>=0 }); }
    if(!DB.customers) DB.customers=[]; if(!DB.contacts) DB.contacts=[];

    // capture prior WO form state
    var prev = {
      custId:qv('wo-customer-id'), custName:qv('wo-customer-name'),
      contact:qv('wo-contact'), contactName:qv('wo-contact-name'),
      siteAddr:qv('wo-site-addr'), siteCity:qv('wo-site-city'),
      siteState:qv('wo-site-state'), siteZip:qv('wo-site-zip')
    };
    var barEl = document.getElementById('wo-contact-bar-info');
    var prevBar = barEl ? barEl.innerHTML : null;
    var nameElPrevContacts = (document.getElementById('wo-contact-name')||{})._woContacts;

    var TID='t'+Date.now();
    var cust={ id:'wo-selftest-cust-'+TID, name:'ZZ WO Self-Test Co', phone:'(336) 555-2000',
      email:'cust@woselftest.zz', street:'1 Billing St', city:'Asheboro', state:'NC', zip:'27205' };
    var ct={ id:'wo-selftest-ct-'+TID, name:'ZZ WO Self-Test Contact', customerId:cust.id,
      title:'Site Super', role:'Site Super', phone:'(336) 555-7777', email:'ct@woselftest.zz',
      street:'5 Field Rd', city:'Durham', state:'NC', zip:'27701' };
    DB.customers.push(cust); DB.contacts.push(ct);

    try{
      // Put the WO on the throwaway customer + contact, with a deliberately custom per-WO site.
      setv('wo-customer-id',cust.id); setv('wo-customer-name','OLD NAME (stale)');
      setv('wo-contact',ct.id); setv('wo-contact-name',ct.name);
      setv('wo-site-addr','999 Custom Jobsite Blvd'); // a per-WO override, must survive refresh
      setv('wo-site-city','Greensboro'); setv('wo-site-state','NC'); setv('wo-site-zip','27401');

      // ---- Edit #1: customer name changes ----
      cust.name='ZZ WO Self-Test Co (RENAMED)';
      refreshWOCustomerFields(cust.id);
      A('Customer name updated', cust.name, qv('wo-customer-name'));
      // Per-WO site address must NOT be clobbered by the customer's billing address
      A('Site addr preserved',  '999 Custom Jobsite Blvd', qv('wo-site-addr'));
      A('Site city preserved',  'Greensboro', qv('wo-site-city'));
      A('Site state preserved', 'NC',         qv('wo-site-state'));
      A('Site zip preserved',   '27401',      qv('wo-site-zip'));

      // ---- Edit #2: selected contact's phone/email change → contact bar reflects it ----
      ct.phone='(336) 555-8888'; ct.email='renamed@woselftest.zz';
      refreshWOCustomerFields(cust.id);
      var barHtml = (document.getElementById('wo-contact-bar-info')||{}).innerHTML || '';
      AC('Contact bar phone', '(336) 555-8888', barHtml);
      AC('Contact bar email', 'renamed@woselftest.zz', barHtml);

      // ---- contacts list repopulated with the throwaway contact ----
      var nameEl=document.getElementById('wo-contact-name');
      var hasCt = !!(nameEl && nameEl._woContacts && nameEl._woContacts.some(function(x){ return x.id===ct.id; }));
      A('Contacts list repopulated', 'true', String(hasCt));

      // ---- guard: refresh does nothing when the WO is on a DIFFERENT customer ----
      setv('wo-customer-id','some-other-cust'); setv('wo-customer-name','KEEP ME');
      refreshWOCustomerFields(cust.id); // id mismatch → must early-return
      A('No-op when WO on other cust', 'KEEP ME', qv('wo-customer-name'));
    } catch(e){ R.push({ field:'EXCEPTION', expected:'none', got:(e&&e.message)||String(e), pass:false }); }
    finally{
      // remove throwaway records (in-memory only) and restore the WO form + contact bar
      DB.customers = DB.customers.filter(function(c){ return c.id!==cust.id; });
      DB.contacts  = DB.contacts.filter(function(x){ return x.id!==ct.id; });
      setv('wo-customer-id',prev.custId); setv('wo-customer-name',prev.custName);
      setv('wo-contact',prev.contact); setv('wo-contact-name',prev.contactName);
      setv('wo-site-addr',prev.siteAddr); setv('wo-site-city',prev.siteCity);
      setv('wo-site-state',prev.siteState); setv('wo-site-zip',prev.siteZip);
      var nEl=document.getElementById('wo-contact-name'); if(nEl) nEl._woContacts=nameElPrevContacts;
      if (barEl) barEl.innerHTML = (prevBar==null?'':prevBar);
    }

    var fails=R.filter(function(x){ return !x.pass; });
    try { console.table(R); } catch(e){}
    var out={ passed:R.length-fails.length, failed:fails.length, total:R.length,
      failures: fails.map(function(x){ return x.field+': expected '+x.expected+' got "'+x.got+'"'; }),
      all: R.map(function(x){ return (x.pass?'PASS ':'FAIL ')+x.field; }) };
    try { console.log('[woSelfTest]', out.passed+'/'+out.total+' passed'+(out.failed?(' — FAILURES: '+out.failures.join(' | ')):' — all good')); } catch(e){}
    return out;
  }
  window.woSelfTest = woSelfTest;
})();
