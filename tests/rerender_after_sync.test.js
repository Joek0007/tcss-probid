// post-sync redraw: verifies the REAL _rerenderActivePage from core.js:
//   - redraws the list for the currently-active page (the bug: sync pulled data but never
//     redrew the list, so a new contact only showed after a full app reload)
//   - picks the renderer that matches the active page, not some other page's
//   - does NOT redraw while a modal/editor is open (so it can't clobber an in-progress edit)
//   - does nothing for pages it intentionally leaves alone (qq/settings/workorders/etc.)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/core.js', 'utf8');
const start = src.indexOf('function _rerenderActivePage(');
const endMark = '  } catch(e){ /* a redraw must never break the sync */ }\n}';
const end = src.indexOf(endMark);
if (start < 0 || end < 0) { console.log('✗ could not locate _rerenderActivePage in core.js'); process.exit(1); }

// test-controlled state the function reads
let _page = '';
let _modalOpen = false;
let calls = [];
global._currentPageId  = function(){ return _page; };
global._anyModalVisible = function(){ return _modalOpen; };
// stub every renderer the map can reach; each records that it ran
['renderContacts','renderCustomers','renderQuotes','renderJobs','renderTeam','renderVendors',
 'renderContracts','renderRecurring','renderCatalog','renderTemplates','renderInventory',
 'renderPOList','renderInvoicesPage','renderReports','renderExpensesPage']
  .forEach(function(n){ global[n] = function(){ calls.push(n); }; });

eval(src.slice(start, end + endMark.length));   // defines _rerenderActivePage

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

// 1) On Contacts, a sync redraws the contacts list (the actual reported bug)
(function(){ calls=[]; _page='contacts'; _modalOpen=false; _rerenderActivePage();
  ok('contacts page → renderContacts()', calls, ['renderContacts']); })();

// 2) It redraws the RIGHT page's list, not another
(function(){ calls=[]; _page='quotes'; _modalOpen=false; _rerenderActivePage();
  ok('quotes page → renderQuotes() only', calls, ['renderQuotes']); })();
(function(){ calls=[]; _page='customers'; _modalOpen=false; _rerenderActivePage();
  ok('customers page → renderCustomers() only', calls, ['renderCustomers']); })();

// 3) Modal/editor open → NO redraw (don't disturb an in-progress edit)
(function(){ calls=[]; _page='contacts'; _modalOpen=true; _rerenderActivePage();
  ok('modal open → no redraw', calls, []); })();

// 4) Pages intentionally left out do nothing (form/own-refresh pages)
(function(){ calls=[]; _page='qq';        _modalOpen=false; _rerenderActivePage();
  ok('qq (quote editor) → no list redraw', calls, []); })();
(function(){ calls=[]; _page='settings';  _modalOpen=false; _rerenderActivePage();
  ok('settings → no list redraw', calls, []); })();
(function(){ calls=[]; _page='workorders';_modalOpen=false; _rerenderActivePage();
  ok('workorders (own refresh) → not forced here', calls, []); })();

// 5) Empty / unknown page id → safe no-op
(function(){ calls=[]; _page=''; _modalOpen=false; _rerenderActivePage();
  ok('no active page → no-op', calls, []); })();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
