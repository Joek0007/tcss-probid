// r96 — Proposal Terms builder: (a) ▲▼ move buttons replaced by a click-drag handle that works on
// mouse AND touch (pointer events); (b) the misleading "edit wording" link/hint on the
// Assumptions/Exclusions/Terms include-toggles removed (Exec Summary's real edit link kept).
const fs = require('fs');
const q = fs.readFileSync(__dirname + '/../js/quotes.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

let pass=0, fail=0;
function ok(n, cond){ if (cond){ pass++; console.log('  ✓ '+n); } else { fail++; console.log('  ✗ '+n); } }

console.log('── r96 Proposal Terms drag-reorder + dead-link cleanup ──');

// --- (b) dead link/hint cleanup on the include-in-proposal toggles ---
ok('Assumptions toggle no longer shows "edit wording in Proposal Terms below"',
   html.indexOf('Assumptions section <span') < 0 && /class="toggle-label">Assumptions section<\/span>/.test(html));
ok('Exclusions toggle cleaned', /class="toggle-label">Exclusions section<\/span>/.test(html));
ok('Terms toggle cleaned', /class="toggle-label">Terms &amp; Conditions<\/span>/.test(html));
ok('tip no longer implies all section names are clickable', html.indexOf('click a section name to edit') < 0);
ok('Executive Summary edit link KEPT (not removed)', /openSectionEditor\('exec'\)/.test(html));

// --- (a) drag handle replaces the arrows ---
ok('▲ Move up / ▼ Move down buttons removed from the builder', q.indexOf('title="Move up"') < 0 && q.indexOf('title="Move down"') < 0);
ok('non-locked rows get a drag handle', /it\.locked \? '' : '<span class="qt-grip"/.test(q));
ok('rows carry data-qt-card + data-qt-idx for the drag target math', /data-qt-card="'\+escHtml\(card\)\+'" data-qt-idx="'\+i\+'"/.test(q));
ok('qtWireDrag + qtReorder exist', /function qtWireDrag\(\)/.test(q) && /function qtReorder\(card, from, to\)/.test(q));
ok('qtRender wires the drag (idempotent)', /qtWireDrag\(\);/.test(q));
ok('drag uses pointer events (mouse+touch unified)', /addEventListener\('pointerdown'/.test(q) && /addEventListener\('pointermove'/.test(q) && /setPointerCapture/.test(q));
ok('reorder is constrained to the same card', /getAttribute\('data-qt-card'\) !== _qtDrag\.card/.test(q));
ok('grip CSS present with touch-action:none (no page scroll while dragging on a tablet)', /\.qt-grip\{[^}]*touch-action:none/.test(html));
ok('drop-indicator CSS present', /\.qt-row\.qt-drop-before/.test(html) && /\.qt-row\.qt-drop-after/.test(html));

// --- reorder MATH (teeth): slice qtReorder and run it against a real array ---
(function(){
  const s = q.indexOf('function qtReorder(card, from, to){');
  const e = q.indexOf('\n}', s) + 2;
  let rendered = 0;
  global.QT = { items: { terms: ['A','B','C','D'] }, editing: null };
  global.qtMarkDirty = function(){};
  global.qtRender = function(){ rendered++; };
  eval(q.slice(s, e));  // defines qtReorder
  // move 'A'(0) to after 'C' → drop target idx 2, after=true → to=3
  qtReorder('terms', 0, 3);
  ok('drag down: A moved after C', QT.items.terms.join('') === 'BCAD');
  // move 'D'(3) to before 'B'(now idx 1) → to=1
  qtReorder('terms', 3, 1);
  ok('drag up: D moved before B', QT.items.terms.join('') === 'BDCA' || QT.items.terms.join('')==='BDCA');
  // drop on itself → no change, no re-render churn
  const before = QT.items.terms.join('');
  const r0 = rendered;
  qtReorder('terms', 2, 2);
  ok('drop-on-self is a no-op (array unchanged)', QT.items.terms.join('') === before);
  ok('drop-on-self did not trigger a re-render', rendered === r0);
})();

console.log((fail===0?'✅':'❌')+' qt drag-reorder: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
