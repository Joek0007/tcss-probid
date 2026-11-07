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
const e = rp.indexOf("'</div></div></td>'", s);
const cell = rp.slice(s-160, e+24);

// every action now has a readable label
[['viewQuote','👁 View'],['editQuote','✏️ Edit'],['dupQuote','⧉ Copy'],
 ['emailSavedQuote','📧 Send'],['copyPortalLink','✍️ Approve'],['deleteQuote','🗑 Del']].forEach(function(p){
  ok(p[0]+' labeled "'+p[1]+'"', cell.indexOf(p[1])>=0 && cell.indexOf('data-action="'+p[0]+'"')>=0);
});
ok('convert button labeled (▶ Job / ✓ Job)', cell.indexOf('▶ Job')>=0 && cell.indexOf('✓ Job')>=0);

// no more icon-only squares in the quote action cell
ok('no btn-ico icon-only buttons left in the action cell', cell.indexOf('btn-ico')<0);
// handlers unchanged (still data-action delegation, not onclick)
ok('actions still use data-action delegation', /data-action="convertToJob"/.test(cell) && cell.indexOf('onclick=')<0);
// r99 layout: 3 buttons on the top line, 4 on the bottom line (two .qa-line rows in a column)
ok('two .qa-line rows in the action cell', (cell.match(/<div class="qa-line">/g)||[]).length === 2);
// top line = View, Edit, Copy (before the first line closes); bottom line = Job, Send, Approve, Del
const line1 = cell.slice(cell.indexOf('<div class="qa-line">'), cell.indexOf("'</div>'+"));
ok('top line holds View+Edit+Copy', line1.indexOf('👁 View')>=0 && line1.indexOf('✏️ Edit')>=0 && line1.indexOf('⧉ Copy')>=0 && line1.indexOf('Approve')<0);
ok('bottom line holds Job+Send+Approve+Del', cell.indexOf('✍️ Approve')>=0 && cell.indexOf('📧 Send')>=0 && cell.indexOf('🗑 Del')>=0);
ok('.qa-actions stacks the two lines (flex-direction:column)', /\.qa-actions\{[^}]*flex-direction:column/.test(html));
ok('.qa-line is a nowrap flex row', /\.qa-actions \.qa-line\{[^}]*display:flex/.test(html));
ok('.qa-btn compacted (smaller padding/font)', /\.qa-actions \.qa-btn\{[^}]*font-size:11px/.test(html));

console.log((fail===0?'✅':'❌')+' quote-list actions: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
