// r23: a field tech (no wo.edit / wo.view_financial) must be able to READ the Work Order
// Description and Resolution but NOT change them — and must not see financial fields / invoice.
// These are contenteditable rich-text divs, so the fix sets contenteditable=false (readOnly is a
// no-op on them). Drives the REAL _applyWOPermissions from workorders.js against a minimal WO DOM.
const { chromium } = require('playwright');
const fs = require('fs');
const WORKORD = fs.readFileSync(__dirname + '/../js/workorders.js', 'utf8');

const DOM = `
  <div><div><input id="wo-labor-rate"></div></div>
  <div><div><input id="wo-tax-rate"></div></div>
  <button id="wo-btn-invoice">Invoice</button>
  <button id="wo-btn-invoice-top">Invoice</button>
  <button id="wo-btn-co">Change Order</button>
  <input id="wo-site-addr"><input id="wo-ref-num">
  <select id="wo-service-type"><option>Installation</option></select>
  <select id="wo-status"><option>New</option></select>
  <div id="wo-description-toolbar" style="display:none"></div>
  <div id="wo-description" contenteditable="true">Install 8 cameras per plan</div>
  <div id="wo-work-performed-toolbar" style="display:none"></div>
  <div id="wo-work-performed" contenteditable="true">Resolution notes here</div>
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await page.route('https://tcss-test.local/', r => r.fulfill({ contentType:'text/html', body:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+DOM+'</body></html>' }));
  await page.goto('https://tcss-test.local/');
  await page.addScriptTag({ content: `
    window.showToast=function(){}; window.saveDB=function(){}; window.escHtml=function(s){return String(s==null?'':s);};
    window.stripHtmlToText=function(s){return String(s==null?'':s);};
    window.DB={ workOrders:[], woParts:[], woLabor:[], woExpenses:[], settings:{}, team:[] };
    window._currentUser={ id:'u-tech', full_name:'Pretend Technician Dawn', role:'helper_tech' };
    window.__grants={};
    window.hasPermission=function(k){ return !!window.__grants[k]; };
  `});
  await page.addScriptTag({ content: WORKORD });
  if (errs.length){ console.log('LOAD ERRORS:\n  '+errs.join('\n  ')); await browser.close(); process.exit(1); }

  let pass=0, fail=0;
  function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

  // ── Tech: no wo.edit / wo.view_financial / wo.invoice / wo.change_status ──────────────
  const tech = await page.evaluate(async () => {
    window.__grants={}; // field tech: nothing granted
    _applyWOPermissions();
    await new Promise(r=>setTimeout(r,400)); // let the 320ms gate run
    var $=function(id){return document.getElementById(id);};
    return {
      descEditable: $('wo-description').getAttribute('contenteditable'),
      resolEditable: $('wo-work-performed').getAttribute('contenteditable'),
      descToolbar: $('wo-description-toolbar').style.display,
      resolToolbar: $('wo-work-performed-toolbar').style.display,
      laborHidden: $('wo-labor-rate').closest('div').style.display,
      invoiceHidden: $('wo-btn-invoice').style.display,
      statusDisabled: $('wo-status').disabled
    };
  });
  ok('tech -> Description is read-only (contenteditable=false)', tech.descEditable, 'false');
  ok('tech -> Resolution is read-only (contenteditable=false)', tech.resolEditable, 'false');
  ok('tech -> Description formatting toolbar hidden', tech.descToolbar, 'none');
  ok('tech -> Resolution formatting toolbar hidden', tech.resolToolbar, 'none');
  ok('tech -> labor rate (financial) hidden', tech.laborHidden, 'none');
  ok('tech -> invoice button hidden', tech.invoiceHidden, 'none');
  ok('tech -> status control disabled', tech.statusDisabled, true);

  // ── Office/editor: full edit retained ─────────────────────────────────────────────────
  const office = await page.evaluate(async () => {
    // reset the DOM editability, then grant edit perms
    document.getElementById('wo-description').setAttribute('contenteditable','true');
    document.getElementById('wo-work-performed').setAttribute('contenteditable','true');
    document.getElementById('wo-status').disabled=false;
    window.__grants={ 'wo.edit':true, 'wo.view_financial':true, 'wo.invoice':true, 'wo.change_order':true, 'wo.change_status':true };
    _applyWOPermissions();
    await new Promise(r=>setTimeout(r,400));
    var $=function(id){return document.getElementById(id);};
    return {
      descEditable: $('wo-description').getAttribute('contenteditable'),
      laborVisible: $('wo-labor-rate').closest('div').style.display,
      invoiceVisible: $('wo-btn-invoice').style.display,
      statusDisabled: $('wo-status').disabled
    };
  });
  ok('editor -> Description stays editable', office.descEditable, 'true');
  ok('editor -> labor rate visible', office.laborVisible, '');
  ok('editor -> invoice button visible', office.invoiceVisible, '');
  ok('editor -> status control enabled', office.statusDisabled, false);

  await browser.close();
  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
