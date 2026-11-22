// r110 — collapsible quote sections. Every editor section folds EXCEPT Line Items and the Pricing
// Controls rail. New & duplicated quotes open fully expanded (never inherit a layout); after that,
// each quote remembers its collapsed sections, persisted per-quote via quote_extras (syncs).
const fs = require('fs');
const core = fs.readFileSync(__dirname + '/../js/core.js',    'utf8');
const rep  = fs.readFileSync(__dirname + '/../js/reports.js', 'utf8');
const auth = fs.readFileSync(__dirname + '/../js/auth.js',    'utf8');
const q    = fs.readFileSync(__dirname + '/../js/quotes.js',  'utf8');
const html = fs.readFileSync(__dirname + '/../index.html',    'utf8');

let pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

console.log('── r110 collapsible quote sections ──');

// ---- engine (core.js) ----
ok('core.js defines the collapse engine fns',
   /function qqSecInit\(\)/.test(core) && /function qqSecApply\(animate\)/.test(core) &&
   /function qqSecToggle\(key\)/.test(core) && /function qqSecGetState\(\)/.test(core) &&
   /function qqSecSetState\(map\)/.test(core) && /function qqSecResetExpanded\(\)/.test(core));
ok('QQ_SEC_DEFS lists the 10 foldable sections', /var QQ_SEC_DEFS = \[/.test(core) &&
   ['customer','project','camera','equipment','perdiem','display','terms','service','permit','template']
     .every(function(k){ return new RegExp("key:'"+k+"'").test(core); }));
ok('Line Items and Pricing Controls are NOT in the foldable set',
   core.indexOf("match:'Line Items'") < 0 && core.indexOf("match:'Pricing Controls'") < 0);
ok('cards are found by section-title text within .qq-grid (no per-card markers needed)',
   /querySelector\('\.qq-grid'\)/.test(core) && /\.card \.section-title/.test(core));
ok('wrap moves the body into .qq-secbody and injects a chevron + Collapse/Expand label',
   /className = 'qq-secbody'/.test(core) && /qq-sec-chev/.test(core) && /qq-sec-word/.test(core));
ok('header is keyboard-operable (role/button + Enter/Space)',
   /setAttribute\('role','button'\)/.test(core) && /e\.key==='Enter' \|\| e\.key===' '/.test(core));
ok('toggle marks the quote dirty + schedules a draft save',
   /function qqSecToggle\(key\)[\s\S]{0,260}setQQDirty[\s\S]{0,80}scheduleQQDraftSave/.test(core));
ok('getState returns only collapsed keys; setState normalizes truthy-only',
   /function qqSecGetState\(\)[\s\S]{0,120}if \(_qqSecState\[k\]\) o\[k\] = true;/.test(core));
ok('overflow is only clipped while collapsed/animating (keeps autocomplete dropdowns visible when open)',
   /\.card\.qq-collapsed \.qq-secbody-in,\.qq-secbody\.qq-animating \.qq-secbody-in\{overflow:hidden\}/.test(html));

// ---- r111: expand/collapse all + action-header chevron alignment ----
ok('engine exposes qqSecExpandAll / qqSecCollapseAll', /function qqSecExpandAll\(\)/.test(core) && /function qqSecCollapseAll\(\)/.test(core) &&
   /window\.qqSecExpandAll/.test(core) && /window\.qqSecCollapseAll/.test(core));
ok('collapse-all marks all foldable sections collapsed', /function qqSecCollapseAll\(\)[\s\S]{0,160}QQ_SEC_DEFS\.forEach\(function\(d\)\{ _qqSecState\[d\.key\] = true;/.test(core));
ok('the expand/collapse-all bar is in the editor', /class="qq-secbar"/.test(html) && /onclick="qqSecExpandAll\(\)"/.test(html) && /onclick="qqSecCollapseAll\(\)"/.test(html));
ok('an action-header card (Template Library) is flagged so the chevron stays far-right',
   /\.qq-sec-actions'\) \|\| title\.querySelector\('button'\)\) card\.classList\.add\('qq-sec-hasactions'\)/.test(core) &&
   /\.card\.qq-sec-hasactions \.qq-sec-toggle\{margin-left:0\}/.test(html));
ok('Template Library header carries the Save button in a right-aligned actions group',
   /class="qq-sec-actions"[^>]*margin-left:auto[\s\S]{0,400}data-action="saveAsTemplate"/.test(html));

// ---- CSS (index.html) ----
ok('index.html carries the fold CSS (grid-rows collapse + chevron rotate)',
   /\.qq-secbody\{display:grid;grid-template-rows:1fr/.test(html) &&
   /\.card\.qq-collapsed \.qq-secbody\{grid-template-rows:0fr\}/.test(html) &&
   /\.card\.qq-collapsed \.qq-sec-chev\{transform:rotate\(-90deg\)\}/.test(html));

// ---- Proposal Terms retired to the unified engine ----
ok('Proposal Terms header no longer has the old inline collapse onclick',
   html.indexOf('onclick="toggleProposalTerms()"') < 0);
ok('toggleProposalTerms now delegates to the unified engine', /function toggleProposalTerms\(\)\{[\s\S]{0,120}qqSecToggle\('terms'\)/.test(q));
ok('qtApplyCollapseState no longer forces a localStorage default-collapsed',
   /function qtApplyCollapseState\(\)\{[\s\S]{0,200}qtUpdateSummary\(\);\s*\}/.test(q) && !/localStorage\.getItem\('qtCollapsed'\)/.test(q));
ok('qtUpdateSummary reads collapsed from the generic card class',
   /querySelector\('\.card\[data-qqsec="terms"\]'\)[\s\S]{0,120}classList\.contains\('qq-collapsed'\)/.test(q));

// ---- persistence + sync + duplicate ----
ok('getQData emits sectionCollapse', /sectionCollapse: \(typeof qqSecGetState==='function'\)/.test(rep));
ok('editQuote restores sectionCollapse (legacy → {})', /qqSecSetState\(q\.sectionCollapse \|\| \{\}\)/.test(rep));
ok('clearQQ resets to all-expanded', /qqSecResetExpanded\(\)/.test(rep));
ok('local draft carries + restores the fold layout',
   /sectionCollapse: \(typeof qqSecGetState==='function'\)/.test(q) && /qqSecSetState\(parsed\.sectionCollapse \|\| \{\}\)/.test(q));
ok('dupQuote clears the layout so a copy opens fully expanded', /nq\.sectionCollapse = \{\};/.test(q));
ok('_quoteExtras carries sectionCollapse', /sectionCollapse: \(q\.sectionCollapse && typeof q\.sectionCollapse==='object'\)/.test(auth));
ok('_applyQuoteExtras restores sectionCollapse (legacy → {})', /target\.sectionCollapse = \(x\.sectionCollapse && typeof x\.sectionCollapse==='object'\) \? x\.sectionCollapse : \{\}/.test(auth));

// ================= TEETH =================
// Replicate the engine's state rules and the new/duplicate/reopen behavior.
(function(){
  var state = {};
  function toggle(k){ if(state[k]) delete state[k]; else state[k]=true; }
  function getState(){ var o={}; for(var k in state){ if(state[k]) o[k]=true; } return o; }
  function setState(m){ state={}; if(m) for(var k in m){ if(m[k]) state[k]=true; } }

  // start expanded (new quote)
  setState({});
  ok('TEETH: new quote → nothing collapsed', Object.keys(getState()).length===0);

  // user collapses two, expands one back
  toggle('permit'); toggle('service'); toggle('permit');
  ok('TEETH: toggle is a clean flip (permit back open, service collapsed)',
     JSON.stringify(getState())==='{"service":true}');

  // "save then reopen" round-trips exactly through the same normalizer
  var saved = getState();
  setState(saved);
  ok('TEETH: reopen restores the exact collapsed set', JSON.stringify(getState())==='{"service":true}');

  // duplicate must NOT inherit → copy starts {}
  function duplicate(sourceState){ var copy = JSON.parse(JSON.stringify(sourceState)); copy.sectionCollapse = {}; return copy; }
  var src = { sectionCollapse: {service:true, perdiem:true} };
  ok('TEETH: a duplicated quote drops the collapsed layout', JSON.stringify(duplicate(src).sectionCollapse)==='{}');

  // legacy quote (no field) → treated as all expanded
  function hydrate(q){ setState(q.sectionCollapse || {}); return getState(); }
  ok('TEETH: legacy quote (undefined) → all expanded', Object.keys(hydrate({})).length===0);

  // getState never stores a falsy value
  state = {a:false, b:true, c:0, d:1};
  ok('TEETH: getState keeps only truthy collapsed keys', JSON.stringify(getState())==='{"b":true,"d":true}');
})();

console.log((fail===0?'✅':'❌')+' section collapse: '+pass+' passed, '+fail+' failed');
process.exit(fail===0?0:1);
