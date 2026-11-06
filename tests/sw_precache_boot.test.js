// r85 (deploy smoothness) — two guards:
//  1. The SW install precache (_precacheAppJS) reads the REAL index.html and caches every same-origin
//     js/*.js?v=… it references (and NO cross-origin CDN script), so a post-deploy reload serves the
//     whole app from cache instead of downloading ~1.5MB on a blank page. It must also be crash-proof:
//     a failed fetch/add can never reject (that would abort the SW install).
//  2. The boot splash lifts via _hideBootSplash on the real auth-ready moments and a safety timeout.
const fs = require('fs');
const path = require('path');
const swSrc   = fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
const htmlSrc = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const authSrc = fs.readFileSync(path.join(__dirname,'../js/auth.js'),'utf8');

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'  got '+JSON.stringify(g)+' want '+JSON.stringify(w));} }
function okTrue(n,g){ ok(n,!!g,true); }

// ── 1) SW precache: load the real _precacheAppJS and drive it against the real index.html ──
// slice just the _precacheAppJS function (up to the install listener) so no `self.*` code is eval'd
function precacheFn(src){ var s=src.indexOf('function _precacheAppJS('); var e=src.indexOf("self.addEventListener('install'"); return src.slice(s, e); }
global.console = console;
global.Request = function(url, opts){ this.url=url; this.opts=opts; };
var added = [];
var fakeCache = { add: function(req){ var u=(typeof req==='string')?req:req.url; added.push(u); return Promise.resolve(); } };
// fetch returns the real index.html text for ./index.html
global.fetch = function(req){
  var u = (typeof req==='string')?req:req.url;
  if (/index\.html/.test(u)) return Promise.resolve({ status:200, text:function(){ return Promise.resolve(htmlSrc); } });
  return Promise.resolve({ status:200 });
};
eval(precacheFn(swSrc));

(async function(){
  await _precacheAppJS(fakeCache);
  okTrue('precache cached the app JS (>= 20 files)', added.length >= 20);
  okTrue('precache cached a KNOWN app script (field.js)', added.some(function(u){ return /js\/field\.js\?v=/.test(u); }));
  ok('precache cached NO cross-origin CDN script', added.filter(function(u){ return /^https?:/.test(u); }).length, 0);
  okTrue('every cached url is a versioned app script (js/…?v=)', added.every(function(u){ return /^(\.\/)?js\/.+\?v=/.test(u); }));

  // crash-proofing: a fetch that REJECTS must not reject _precacheAppJS (would abort SW install)
  var threw=false;
  global.fetch = function(){ return Promise.reject(new Error('network down during install')); };
  try { await _precacheAppJS(fakeCache); } catch(e){ threw=true; }
  ok('precache swallows a failed index fetch (install never aborts)', threw, false);

  // a cache.add that REJECTS for one file must not reject the whole precache
  threw=false; added=[];
  global.fetch = function(req){ var u=(typeof req==='string')?req:req.url; if(/index\.html/.test(u)) return Promise.resolve({status:200,text:function(){return Promise.resolve(htmlSrc);}}); return Promise.resolve({status:200}); };
  var flaky = { add: function(req){ var u=(typeof req==='string')?req:req.url; if(/core\.js/.test(u)) return Promise.reject(new Error('402')); added.push(u); return Promise.resolve(); } };
  try { await _precacheAppJS(flaky); } catch(e){ threw=true; }
  ok('precache swallows a single failed cache.add', threw, false);
  okTrue('precache still cached the other files despite one failure', added.length >= 20);

  // ── 2) static guards: install calls the precache + skipWaiting; splash wired up ──
  okTrue('install handler calls _precacheAppJS', /addEventListener\('install'[\s\S]{0,400}_precacheAppJS\(cache\)/.test(swSrc));
  okTrue('install still calls skipWaiting (even if precache errors)', /_precacheAppJS[\s\S]{0,200}skipWaiting\(\)[\s\S]{0,200}catch[\s\S]{0,120}skipWaiting\(\)/.test(swSrc));
  okTrue('index.html has the boot splash element', /id="boot-splash"/.test(htmlSrc));
  okTrue('boot splash paints by default (no display:none)', /id="boot-splash"[^>]*position:fixed/.test(htmlSrc) && !/id="boot-splash"[^>]*display:none/.test(htmlSrc));
  okTrue('_hideBootSplash is defined inline + has a safety timeout', /window\._hideBootSplash *= *function/.test(htmlSrc) && /setTimeout\(function\(\)\{ *try *\{ *window\._hideBootSplash\(\)/.test(htmlSrc));
  okTrue('auth shows login → lifts splash', /showAuthModal[\s\S]{0,200}_hideBootSplash\(\)/.test(authSrc));
  okTrue('auth hides modal → lifts splash', /hideAuthModal[\s\S]{0,160}_hideBootSplash\(\)/.test(authSrc));
  okTrue('logged-in path (loadCurrentUserProfile) lifts splash', /loadCurrentUserProfile\(\)\.then\(function\(\)\{ *if *\(typeof window\._hideBootSplash/.test(authSrc));

  console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
  process.exit(fail?1:0);
})();
