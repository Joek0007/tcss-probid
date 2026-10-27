// ============================================================================
// PERF PROBE — TEMPORARY diagnostic (safe to delete). Monkey-patches the sync /
// pull / save functions with timers WITHOUT editing their logic, plus a longtask
// observer that measures actual main-thread freezing. After each sync it shows an
// on-screen panel so the freeze can be profiled without opening DevTools.
// Remove this file + its <script> tag once the freeze bottleneck is identified.
// ============================================================================
(function(){
  if (window.__perfProbeInstalled) return; window.__perfProbeInstalled = true;
  var P = window.__perf = { pulls:{}, syncMs:0, saveMs:0, saveCount:0, longtaskTotal:0, longtaskMax:0, lastAt:0 };
  function now(){ return (window.performance&&performance.now)?performance.now():Date.now(); }

  // Total main-thread blocking (any task >50ms) — this IS "the UI froze".
  try {
    new PerformanceObserver(function(list){
      list.getEntries().forEach(function(e){ P.longtaskTotal += e.duration; if (e.duration > P.longtaskMax) P.longtaskMax = e.duration; });
    }).observe({ entryTypes:['longtask'] });
  } catch(e){}

  function wrap(name, isAsync){
    var orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = isAsync
      ? async function(){ var t0=now(); try { return await orig.apply(this, arguments); } finally { P['_'+name]=(P['_'+name]||0)+(now()-t0); } }
      : function(){ var t0=now(); try { return orig.apply(this, arguments); } finally { P['_'+name]=(P['_'+name]||0)+(now()-t0); } };
    return orig;
  }

  // Per-table pull timing — label from the query builder source (.from('table')).
  (function(){
    var orig = window._sbSelectAll; if (typeof orig !== 'function') return;
    window._sbSelectAll = async function(build){
      var label='query'; try { var m=String(build).match(/\.from\(['"]([^'"]+)['"]\)/); if(m) label=m[1]; } catch(e){}
      var t0=now(); var r = await orig.apply(this, arguments); var ms=now()-t0;
      var rec = P.pulls[label] || (P.pulls[label]={ms:0,rows:0,calls:0});
      rec.ms += ms; rec.rows = (r&&r.data)?r.data.length:rec.rows; rec.calls++;
      return r;
    };
  })();

  // saveDB (serialize + compress the whole DB) — a prime main-thread freeze suspect.
  (function(){
    var orig = window.saveDB; if (typeof orig !== 'function') return;
    window.saveDB = function(){ var t0=now(); try { return orig.apply(this, arguments); } finally { P.saveMs += (now()-t0); P.saveCount++; } };
  })();

  // Whole sync — reset the per-sync counters, time it, then show the panel.
  (function(){
    var orig = window.syncAllFromCloud; if (typeof orig !== 'function') return;
    window.syncAllFromCloud = async function(){
      P.pulls={}; P.saveMs=0; P.saveCount=0; P.longtaskTotal=0; P.longtaskMax=0;
      var t0=now(); try { return await orig.apply(this, arguments); }
      finally { P.syncMs = now()-t0; P.lastAt = Date.now(); try { showPerfPanel(); } catch(e){} }
    };
  })();

  function showPerfPanel(){
    var pulls = Object.keys(P.pulls).map(function(k){ return {t:k, ms:Math.round(P.pulls[k].ms), rows:P.pulls[k].rows}; }).sort(function(a,b){ return b.ms-a.ms; });
    var pullTotal = pulls.reduce(function(s,p){ return s+p.ms; }, 0);
    var top = pulls.slice(0,10).map(function(p){ return p.t+': '+p.ms+'ms ('+p.rows+')'; }).join('<br>');
    var el = document.getElementById('perf-panel') || (function(){ var d=document.createElement('div'); d.id='perf-panel'; document.body.appendChild(d); return d; })();
    el.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#0d1b2a;color:#e8f0fe;font:12px/1.5 ui-monospace,Menlo,monospace;padding:12px 14px;border-radius:10px;max-width:94vw;box-shadow:0 10px 30px rgba(0,0,0,.55)';
    el.innerHTML =
      '<div style="font-size:13px;margin-bottom:4px"><b>⏱ SYNC '+Math.round(P.syncMs)+'ms</b></div>'+
      'main-thread FROZEN: <b>'+Math.round(P.longtaskTotal)+'ms</b> (worst single '+Math.round(P.longtaskMax)+'ms)<br>'+
      'network pulls: '+Math.round(pullTotal)+'ms &nbsp;·&nbsp; saveDB: '+Math.round(P.saveMs)+'ms ×'+P.saveCount+'<br>'+
      '<div style="margin-top:6px;opacity:.9">'+top+'</div>'+
      '<div style="margin-top:8px"><span onclick="var p=document.getElementById(\'perf-panel\');if(p)p.remove()" style="cursor:pointer;background:#1565c0;padding:3px 10px;border-radius:6px">close</span></div>';
  }
  window.showPerfPanel = showPerfPanel;
  console.log('[perf-probe] installed — sync/pull/save timing + longtask freeze measurement active');
})();
