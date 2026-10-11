// ============================================================
// qq-selftest.js — self-test for "edit customer/contact from a quote → quote fields refresh"
// ------------------------------------------------------------
// Verifies refreshQuoteCustomerFields() maps EVERY field correctly, in both modes:
//   • customer selected, NO contact  → customer values flow to the quote
//   • contact selected               → contact values take priority (name, title, phone,
//                                       email, and address), with customer as the fallback
// Zero footprint: it uses throwaway in-memory records that are NEVER saved to disk or the
// cloud, removes them afterward, and restores the quote's original selection. Synchronous,
// so it can't hang.
//
// HOW TO RUN: open a Quote, then in the browser console type:   qqSelfTest()
// It returns { passed, failed, total, failures:[...], all:[...] } and also console.tables it.
// ============================================================
(function(){
  function qv(id){ var el=document.getElementById(id); return el ? (el.value||'') : '(no field)'; }
  function setv(id,v){ var el=document.getElementById(id); if(el) el.value=v; }

  function qqSelfTest(){
    if (typeof refreshQuoteCustomerFields !== 'function' || typeof selectContact !== 'function') {
      return { error: 'Open a Quote first (the quote editor must be loaded).' };
    }
    var R=[]; function A(label,exp,got){ R.push({ field:label, expected:String(exp), got:String(got), pass:String(got)===String(exp) }); }
    if(!DB.customers) DB.customers=[]; if(!DB.contacts) DB.contacts=[];
    var prevCust=qv('qq-customer-id'), prevContact=qv('qq-contact-id');
    var TID='t'+Date.now();
    var cust={ id:'selftest-cust-'+TID, name:'ZZ Self-Test Co', phone:'(336) 555-1000', email:'cust@selftest.zz',
      street:'1 Customer St', city:'Asheboro', state:'NC', zip:'27205', defaultTerms:'Net 45' };
    var ct={ id:'selftest-ct-'+TID, name:'ZZ Self-Test Contact', company:'ZZ Self-Test Co',
      title:'Operations Director', role:'Operations Director', phone:'(336) 555-9999', email:'newcontact@selftest.zz',
      street:'3 New Rd', city:'Durham', state:'NC', zip:'27701', customerId:'selftest-cust-'+TID };
    cust.defaultContactId=ct.id; DB.customers.push(cust); DB.contacts.push(ct);
    try{
      // A) customer-level — no contact selected: customer values flow to the quote
      setv('qq-customer-id',cust.id); setv('qq-contact-id',''); setv('qq-contact-name','');
      refreshQuoteCustomerFields(cust.id);
      A('Customer name',  cust.name,         qv('qq-cn'));
      A('Customer phone', cust.phone,        qv('qq-ph'));
      A('Customer email', cust.email,        qv('qq-em'));
      A('Customer street',cust.street,       qv('qq-ad'));
      A('Customer city',  cust.city,         qv('qq-city'));
      A('Customer state', cust.state,        qv('qq-state'));
      A('Customer zip',   cust.zip,          qv('qq-zip'));
      A('Customer terms', cust.defaultTerms, qv('qq-pt'));
      // B) contact selected — contact values take priority
      setv('qq-customer-id',cust.id); setv('qq-contact-id',ct.id); setv('qq-contact-name',ct.name);
      refreshQuoteCustomerFields(cust.id);
      A('Contact name',  ct.name,  qv('qq-contact-name'));
      A('Contact title', ct.title, qv('qq-contact-title'));
      A('Contact phone', ct.phone, qv('qq-ph'));
      A('Contact email', ct.email, qv('qq-em'));
      A('Contact street',ct.street,qv('qq-ad'));
      A('Contact city',  ct.city,  qv('qq-city'));
      A('Contact state', ct.state, qv('qq-state'));
      A('Contact zip',   ct.zip,   qv('qq-zip'));
    } catch(e){ R.push({ field:'EXCEPTION', expected:'none', got:(e&&e.message)||String(e), pass:false }); }
    finally{
      // remove the throwaway records (in-memory only) and restore the quote's selection
      DB.customers = DB.customers.filter(function(c){ return c.id!==cust.id; });
      DB.contacts  = DB.contacts.filter(function(x){ return x.id!==ct.id; });
      setv('qq-customer-id',prevCust); setv('qq-contact-id',prevContact);
      if(!prevCust){ ['qq-cn','qq-ph','qq-em','qq-ad','qq-city','qq-state','qq-zip','qq-contact-name','qq-contact-title'].forEach(function(id){ setv(id,''); }); }
    }
    var fails=R.filter(function(x){ return !x.pass; });
    try { console.table(R); } catch(e){}
    var out={ passed:R.length-fails.length, failed:fails.length, total:R.length,
      failures: fails.map(function(x){ return x.field+': expected "'+x.expected+'" got "'+x.got+'"'; }),
      all: R.map(function(x){ return (x.pass?'PASS ':'FAIL ')+x.field; }) };
    try { console.log('[qqSelfTest]', out.passed+'/'+out.total+' passed'+(out.failed?(' — FAILURES: '+out.failures.join(' | ')):' — all good')); } catch(e){}
    return out;
  }
  window.qqSelfTest = qqSelfTest;
})();
