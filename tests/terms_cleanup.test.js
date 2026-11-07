// r95 — removed the dead legacy "terms" surface now that the per-quote Proposal Terms builder (r64)
// owns assumptions/exclusions/terms. Removed: the quote-editor "Terms & Conditions" box (qq-tc), the
// Settings "Proposal Defaults — Assumptions & Exclusions" editors, the "Terms & Conditions by Job Type"
// card, and the "Default Terms & Conditions" field (s-tc). Guards against re-introduction + proves the
// two still-wired save paths preserve stored data instead of blanking it.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const wt   = fs.readFileSync(__dirname + '/../js/worktracking.js', 'utf8');
const rp   = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r95 legacy proposal-terms cleanup ──');

// 1) the dead editors are gone from the page
['id="qq-tc"','id="s-tc"','id="assumptions-rich"','id="exclusions-rich"','id="jt-addendum-list"',
 'id="toggle-assumptions"','id="toggle-exclusions"'].forEach(function(frag){
  ok('removed from index.html: '+frag, html.indexOf(frag) < 0);
});
// check the actual card-title markup is gone (a removal-note comment may still mention the name)
ok('old "Proposal Defaults — Assumptions & Exclusions" card gone', html.indexOf('card-title">📄 Proposal Defaults') < 0);
ok('old "Terms & Conditions by Job Type" card gone', html.indexOf('card-title">📜 Terms') < 0);

// 2) the NEW per-quote Proposal Terms builder is still there (we only removed the OLD stuff)
ok('Proposal Terms builder card still present', /📋 Proposal Terms/.test(html));
ok('builder show/hide toggles kept (prop-show-assumptions)', /id="prop-show-assumptions"/.test(html));

// 3) settings save no longer reads the removed s-tc (so it can't blank DB.settings.tc)
ok('saveSettings no longer reads s-tc', !/tc:gv\('s-tc'\)/.test(wt));
ok('settings save still uses Object.assign over DB.settings (preserves tc)',
   /DB\.settings = Object\.assign\(\{\}, DB\.settings,/.test(wt));

// 4) getQData preserves a legacy quote's stored tc when the qq-tc box is absent (not blanked)
ok('getQData falls back to existing.tc when qq-tc is gone',
   /getElementById\('qq-tc'\) \?[^\n]*existing \? \(existing\.tc\|\|''\)/.test(rp));

// 5) legacy render fallback still intact (pre-feature quotes still print their stored terms)
const quotes = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
ok('buildPrintHTML still falls back to q.tc / DB.settings.tc for legacy quotes',
   /baseTC\s*=\s*\(q\.tc\s*&&\s*q\.tc\.trim\(\)\)\s*\?\s*q\.tc\s*:\s*\(DB\.settings\.tc\s*\|\|\s*''\)/.test(quotes));

console.log((fail===0?'✅':'❌')+' terms cleanup: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
