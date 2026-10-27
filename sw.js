// TCSS ProBid service worker — makes the app LOAD with no signal (field techs with no bars).
// Strategy:
//   • App shell (index.html, manifest, icons) is precached on install.
//   • index.html / navigations are NETWORK-FIRST so the in-app auto-updater still sees new builds
//     online, and fall back to the cached shell when offline.
//   • Everything else same-origin (js/*.js, css) + the CDN libraries are CACHE-FIRST and
//     runtime-cached on first successful fetch, so after one online visit the whole app works offline.
//   • Supabase API/auth requests (*.supabase.co) are NEVER intercepted or cached — they must stay
//     live; offline they fail and the app's own offline queues take over.
// Bump SHELL_VERSION on each deploy that changes the shell; old shell caches are pruned on activate.
var SHELL_VERSION = 'r17';
var SHELL_CACHE   = 'tcss-shell-' + SHELL_VERSION;
var RUNTIME_CACHE = 'tcss-runtime';           // stable across versions (versioned js URLs self-prune by use)
var SHELL_ASSETS  = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache){
      // Don't let one missing asset abort the whole precache.
      return Promise.all(SHELL_ASSETS.map(function(u){
        return cache.add(u).catch(function(err){ console.warn('[sw] precache skip', u, err && err.message); });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        // Keep the current shell cache and the stable runtime cache; drop old shell versions.
        if (k === SHELL_CACHE || k === RUNTIME_CACHE) return null;
        if (k.indexOf('tcss-shell-') === 0) return caches.delete(k);
        return null;
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;                 // never touch writes (Supabase POST/PATCH/DELETE)
  var url;
  try { url = new URL(req.url); } catch(_e){ return; }

  // Supabase REST/auth/realtime/storage — always go to network, never cache (live data + auth).
  if (url.hostname.indexOf('.supabase.co') >= 0 || url.hostname.indexOf('.supabase.in') >= 0) return;

  var isHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  if (isHTML) {
    // NETWORK-FIRST: online always gets the freshest index.html (auto-updater works); offline → cached shell.
    e.respondWith(
      fetch(req).then(function(res){
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(SHELL_CACHE).then(function(c){ c.put('./index.html', copy); });
        }
        return res;
      }).catch(function(){
        return caches.match(req).then(function(m){
          return m || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // CACHE-FIRST for js/css/icons/CDN libs; runtime-cache on first fetch.
  e.respondWith(
    caches.match(req).then(function(hit){
      if (hit) return hit;
      return fetch(req).then(function(res){
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          var copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){ return hit; });   // offline + uncached → undefined (lets the request fail normally)
    })
  );
});
