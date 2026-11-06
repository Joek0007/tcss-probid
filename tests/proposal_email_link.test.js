// r87 regression — the proposal email's "Approve Proposal" link must NOT be rewritten through
// Mailgun click-tracking. Click-tracking routes every link through the tracking domain
// (email.tcss.com); when that domain isn't resolving the approval link dies at the redirect
// ("can't reach page") before it reaches the portal. A customer's approval can't depend on the
// tracking CNAME, so the proposal send disables click-tracking (open-tracking stays on).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r87 proposal approval link (no click-tracking rewrite) ──');

// The Mailgun send block (fireEmailQuote) must set o:tracking-clicks to 'no'
ok("proposal send disables click-tracking (o:tracking-clicks = 'no')",
   /fd\.append\('o:tracking-clicks','no'\)/.test(src));
// Open tracking stays on (delivery/opens still reported)
ok("open-tracking stays on (o:tracking-opens = 'yes')",
   /fd\.append\('o:tracking-opens','yes'\)/.test(src));
// The approval link itself is the raw portal URL (built from baseUrl), not a tracker
ok("approval link is the raw portal URL",
   /portalUrl\s*=\s*baseUrl\s*\+\s*'\/portal\.html\?token='/.test(src));

console.log((fail===0?'✅':'❌')+' proposal approval link: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
