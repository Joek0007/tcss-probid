// r97 — quote-list action buttons were tiny icon-only squares ("too small to read"). Now every action
// carries a readable text label (View/Edit/Copy/To Job/Send/Approve/Del), same handlers (data-action),
// and the row wraps instead of forcing a horizontal scroll.
const fs = require('fs');
const rp = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let pass=0, fail=0;
function ok(n, c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r97 quote-list action buttons (labeled + readable) ──');

// slice just the quote-list action cell
const s = rp.indexOf("data-action=\"viewQuote\"");
const e = rp.indexOf("'</div></td>'", s);
const cell = rp.slice(s-120, e+20);

// every action now has a readable label
[['viewQuote','👁 View'],['editQuote','✏️ Edit'],['dupQuote','⧉ Copy'],
 ['emailSavedQuote','📧 Send'],['copyPortalLink','✍️ Approve'],['deleteQuote','🗑 Del']].forEach(function(p){
  ok(p[0]+' labeled "'+p[1]+'"', cell.indexOf(p[1])>=0 && cell.indexOf('data-action="'+p[0]+'"')>=0);
});
ok('convert button labeled (▶ To Job / ✓ Job)', cell.indexOf('▶ To Job')>=0 && cell.indexOf('✓ Job')>=0);

// no more icon-only squares in the quote action cell
ok('no btn-ico icon-only buttons left in the action cell', cell.indexOf('btn-ico')<0);
// handlers unchanged (still data-action delegation, not onclick)
ok('actions still use data-action delegation', /data-action="convertToJob"/.test(cell) && cell.indexOf('onclick=')<0);
// wrap container + CSS so the labeled row doesn't force a horizontal scroll
ok('buttons wrapped in .qa-actions flex container', /<div class="qa-actions">/.test(rp) && rp.indexOf("'</div></td>'")>=0);
ok('.qa-actions wrap CSS present', /\.qa-actions\{[^}]*flex-wrap:wrap/.test(html));

console.log((fail===0?'✅':'❌')+' quote-list actions: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
