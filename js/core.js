
// =============================================
// TCSS PROBID v5 — Phase 1 Enhanced
// Stage 1: Margin-Based Pricing Engine (v4)
// Stage 2: Enhanced Save Structure (v4)
// Stage 3: Professional Proposal Output (v4)
// V5-P1: Equipment Rentals, Permits, Margin Floor, Expanded Templates
// =============================================

// ---- CONSTANTS ----
const DB_KEY = 'tcssv8';
const ENV_PRESETS = {
  office:   { label:'Office',          margin:35, laborMult:1.00, riskLevel:'Low' },
  mixed:    { label:'Mixed',           margin:38, laborMult:1.10, riskLevel:'Medium' },
  warehouse:{ label:'Warehouse',       margin:32, laborMult:0.95, riskLevel:'Low' },
  exterior: { label:'Exterior Heavy',  margin:42, laborMult:1.25, riskLevel:'High' },
  highcplx: { label:'High Complexity', margin:45, laborMult:1.35, riskLevel:'Very High' }
};

// V5: Equipment rental types
const EQUIPMENT_TYPES = [
  { id:'lift30art',  name:'30ft Articulating Boom Lift', daily:285 },
  { id:'lift40art',  name:'40ft Articulating Boom Lift', daily:350 },
  { id:'lift35tow',  name:'Towable Boom Lift 35ft.',     daily:245 },
  { id:'lift50tow',  name:'Towable Boom Lift 50ft.',     daily:310 },
  { id:'lift30sci',  name:'30ft Scissor Lift',           daily:195 },
  { id:'lift40sci',  name:'40ft Scissor Lift',           daily:240 },
  { id:'forklift',   name:'Forklift',                    daily:180 },
  { id:'manilift',   name:'Man Lift / Vertical Mast',    daily:145 },
  { id:'other',      name:'Other Equipment',              daily:0   }
];

// V5: Default margin floors by job type
const MF_DEFAULTS = { 'New Construction':35, 'Remodel':40, 'Service Call':50, 'Upgrade':38, 'Addition':36 };

// ---- DATABASE ----
let DB = { quotes:[], customers:[], contacts:[], jobs:[], team:[], catalog:[], templates:[], settings:{}, marginFloors:{}, quoteSeq:1000, jobSeq:1, deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]}, workOrders:[], woLabor:[], woExpenses:[], woParts:[], woChecklist:[], woSettings:null, woSeq:1000, jobPhotos:[], commsLog:[], invoicePayments:[], purchaseOrders:[], vendors:[], poSeq:1000, invLocations:[], invTransfers:[] };

/* lz-string 1.5.0 (pieroxy, MIT) — embedded for localStorage compression */
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();
function _dbPack(obj){ try { return "\u0001Z"+LZString.compressToUTF16(JSON.stringify(obj)); } catch(e){ try { return JSON.stringify(obj); } catch(_){ return ""; } } }
function _dbUnpack(raw){ if(raw==null) return null; if(raw.charAt(0)==="\u0001"){ return JSON.parse(LZString.decompressFromUTF16(raw.slice(2))); } return JSON.parse(raw); }

function saveDB() {
  try {
    localStorage.setItem(DB_KEY, _dbPack(DB));
  } catch(e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      // localStorage is full — strip large WT defaults (they're re-generatable) and retry
      try {
        var slim = Object.assign({}, DB);
        // Remove catalog/templates/buildingTypes — regenerated from defaults on demand
        if (slim.wtItemCatalog && slim.wtItemCatalog.length > 0 &&
            slim.wtItemCatalog[0].id && slim.wtItemCatalog[0].id.startsWith('itm_')) {
          delete slim.wtItemCatalog;   // default catalog, not customized
        }
        if (slim.wtRoomTemplates && slim.wtRoomTemplates.length > 0 &&
            slim.wtRoomTemplates[0].id && slim.wtRoomTemplates[0].id.startsWith('tpl_')) {
          delete slim.wtRoomTemplates; // default templates
        }
        if (slim.wtBuildingTypes) delete slim.wtBuildingTypes;
        // Also trim wizard draft from DB if somehow stored there
        localStorage.setItem(DB_KEY, _dbPack(slim));
        console.warn('saveDB: trimmed WT defaults to fit quota');
      } catch(e2) {
        console.error('saveDB: quota still exceeded after trim', e2);
        showToast && showToast('Storage full — please clear old data or use a different browser profile','error');
      }
    } else {
      console.warn('Save error', e);
    }
  }
  // Don't schedule a push if we're in the middle of a sync pull — data just came FROM Supabase
  if (window._syncInProgress) return;
  // Debounced cloud push — no recursion
  if (typeof _sb !== 'undefined' && _sb && typeof _currentUser !== 'undefined' && _currentUser && _currentUser.role !== 'field') {
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(pushAllToCloud, 2000);
  }
}

// ============================================================
// BACKUP & RESTORE  (free-tier safety net — Supabase does not
// keep automated backups on the free plan, so this is our own)
// ============================================================
var BACKUP_LASTGOOD_KEY = 'tcss_backup_lastgood';
var BACKUP_DAILY_KEY    = 'tcss_backup_daily';
var BACKUP_DL_TS_KEY    = 'tcss_backup_last_download';

function _backupPayload() {
  return {
    _backupMeta: {
      app: 'TCSS ProBid V9',
      createdAt: new Date().toISOString(),
      counts: {
        quotes:      (DB.quotes||[]).length,
        customers:   (DB.customers||[]).length,
        contacts:    (DB.contacts||[]).length,
        workOrders:  (DB.workOrders||[]).length,
        invoices:    (DB.invoices||[]).length
      }
    },
    db: DB
  };
}

// Download the entire database as a JSON file the user keeps off-site.
function downloadBackup() {
  try {
    var json = JSON.stringify(_backupPayload(), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var d = new Date();
    var p = function(n){ return (n<10?'0':'')+n; };
    var name = 'ProBid_Backup_' + d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try{ document.body.removeChild(a); URL.revokeObjectURL(url); }catch(e){} }, 1000);
    try { localStorage.setItem(BACKUP_DL_TS_KEY, d.toISOString()); } catch(e) {}
    if (typeof updateBackupInfo === 'function') updateBackupInfo();
    if (typeof showToast === 'function') showToast('Backup downloaded: ' + name, 'success', 4000);
  } catch(e) {
    console.error('[Backup] download failed', e);
    if (typeof showToast === 'function') showToast('Backup failed: ' + (e && e.message || e), 'error');
  }
}

// Additive merge: add any records present in `backupDB` that are missing now,
// matched by id, across every array collection. NEVER deletes or overwrites —
// the safest possible restore (worst case: re-adds a record you had deleted).
function _mergeBackupDB(backupDB) {
  var added = 0;
  if (!backupDB) return 0;
  Object.keys(backupDB).forEach(function(key){
    var bArr = backupDB[key];
    if (!Array.isArray(bArr)) return;               // only merge array collections
    if (!Array.isArray(DB[key])) DB[key] = [];
    var have = {};
    DB[key].forEach(function(r){ if (r && r.id != null) have[String(r.id)] = true; });
    bArr.forEach(function(r){
      if (!r || r.id == null) return;               // skip idless records (can't dedupe safely)
      if (have[String(r.id)]) return;               // already present
      DB[key].push(r); have[String(r.id)] = true; added++;
    });
  });
  return added;
}

function _restorableCount(backupDB) {
  var n = 0; if (!backupDB) return 0;
  Object.keys(backupDB).forEach(function(key){
    var bArr = backupDB[key]; if (!Array.isArray(bArr)) return;
    var cur = Array.isArray(DB[key]) ? DB[key] : [];
    var have = {}; cur.forEach(function(r){ if (r && r.id != null) have[String(r.id)] = true; });
    bArr.forEach(function(r){ if (r && r.id != null && !have[String(r.id)]) n++; });
  });
  return n;
}

// Apply a parsed backup payload (safe additive merge). Shared by json + zip restore.
function _applyRestoreObject(parsed) {
  var bdb = parsed && parsed.db ? parsed.db : parsed; // accept {db:...} or a raw DB dump
  if (!bdb || !Array.isArray(bdb.quotes)) {
    if (typeof showToast === 'function') showToast('That file is not a ProBid backup.', 'error');
    return;
  }
  var meta = parsed && parsed._backupMeta;
  var when = (meta && meta.createdAt) ? new Date(meta.createdAt).toLocaleString() : 'unknown date';
  var addN = _restorableCount(bdb);
  if (addN === 0) {
    if (typeof showToast === 'function') showToast('Nothing to restore — this backup has no records you are missing.', 'info');
    return;
  }
  if (!confirm('Restore from backup dated ' + when + '?\n\nThis is SAFE: it ONLY ADDS the ' + addN + ' record(s) from the backup that are missing now. It never deletes or overwrites your current data.\n\nA snapshot of your current data is saved first.')) return;
  _saveRestorePoint('before-restore');
  var added = _mergeBackupDB(bdb);
  saveDB();
  if (typeof showToast === 'function') showToast('Restore complete — added ' + added + ' record(s). Syncing to cloud…', 'success', 4000);
  if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 600);
  setTimeout(function(){ try { if (typeof renderDash === 'function') renderDash(); if (typeof renderQuotes === 'function') renderQuotes(); } catch(e){} }, 800);
}

// Restore from a user-selected backup file — accepts the data .json OR a full .zip
// backup (extracts probid-data.json from it). Restores RECORDS only (additive/safe);
// image files inside a full backup are your archived copies, not auto-re-uploaded.
function restoreFromBackupFile(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
  if (isZip) {
    _loadJSZip().then(function(JSZipLib){ return JSZipLib.loadAsync(file); }).then(function(zip){
      var entry = zip.file('probid-data.json');
      if (!entry) { if (typeof showToast==='function') showToast('No probid-data.json found inside that backup zip.', 'error'); return; }
      return entry.async('string').then(function(txt){ _applyRestoreObject(JSON.parse(txt)); });
    }).catch(function(e){
      console.error('[Restore zip] failed', e);
      if (typeof showToast==='function') showToast('Could not read that backup zip: ' + (e && e.message || e), 'error');
    }).then(function(){ input.value = ''; });
    return;
  }
  var reader = new FileReader();
  reader.onload = function(ev) {
    try { _applyRestoreObject(JSON.parse(ev.target.result)); }
    catch(e) { console.error('[Restore] failed', e); if (typeof showToast === 'function') showToast('Restore failed: ' + (e && e.message || e), 'error'); }
    input.value = '';
  };
  reader.readAsText(file);
}

// Snapshot the CURRENT db to localStorage before any destructive/large change.
function _saveRestorePoint(tag) {
  try { localStorage.setItem(BACKUP_LASTGOOD_KEY, _dbPack({ tag: tag||'snapshot', at: new Date().toISOString(), db: DB })); }
  catch(e) { console.warn('[Backup] restore-point skipped:', e && e.name); }
}

// Once-a-day rolling local snapshot (runs on login). Quota-guarded.
function _saveDailySnapshot() {
  try {
    var raw = localStorage.getItem(BACKUP_DAILY_KEY);
    if (raw) { var last = _dbUnpack(raw); if (last && last.at && (new Date() - new Date(last.at)) < 20*60*60*1000) return; }
    localStorage.setItem(BACKUP_DAILY_KEY, _dbPack({ at: new Date().toISOString(), db: DB }));
  } catch(e) { console.warn('[Backup] daily snapshot skipped:', e && e.name); }
}

// Emergency: restore from the most recent local snapshot (additive merge).
function restoreLastKnownGood() {
  try {
    var raw = localStorage.getItem(BACKUP_LASTGOOD_KEY) || localStorage.getItem(BACKUP_DAILY_KEY);
    if (!raw) { if (typeof showToast==='function') showToast('No local snapshot found.', 'error'); return; }
    var snap = _dbUnpack(raw); var bdb = snap.db || snap;
    var addN = _restorableCount(bdb);
    if (!confirm('Restore local snapshot from ' + (snap.at ? new Date(snap.at).toLocaleString() : 'unknown') + '?\n\nAdds ' + addN + ' missing record(s). Never deletes anything.')) return;
    var added = _mergeBackupDB(bdb); saveDB();
    if (typeof showToast==='function') showToast('Local snapshot restored — added ' + added + ' record(s).', 'success');
    if (typeof pushAllToCloud === 'function') setTimeout(pushAllToCloud, 600);
    setTimeout(function(){ try { if (typeof renderDash==='function') renderDash(); } catch(e){} }, 600);
  } catch(e) { if (typeof showToast==='function') showToast('Snapshot restore failed: ' + (e && e.message || e), 'error'); }
}

// Fill the Settings backup panel with last-backup timestamps.
function updateBackupInfo() {
  var el = document.getElementById('backup-last-info'); if (!el) return;
  var parts = [];
  try {
    var d = localStorage.getItem(BACKUP_DL_TS_KEY);
    if (d) parts.push('Last download: ' + new Date(d).toLocaleString());
    var snap = localStorage.getItem(BACKUP_DAILY_KEY);
    if (snap) { var s = _dbUnpack(snap); if (s && s.at) parts.push('Auto snapshot: ' + new Date(s.at).toLocaleString()); }
  } catch(e) {}
  el.textContent = parts.length ? parts.join('   •   ') : 'No backup taken yet — download one now to be safe.';
}

// Lazy-load JSZip (only when a full backup/restore is actually requested).
function _loadJSZip() {
  return new Promise(function(resolve, reject){
    if (window.JSZip) return resolve(window.JSZip);
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = function(){ window.JSZip ? resolve(window.JSZip) : reject(new Error('zip library failed to initialize')); };
    s.onerror = function(){ reject(new Error('could not load the zip library (need an internet connection)')); };
    document.head.appendChild(s);
  });
}

function _safeName(prefix, pathOrName) {
  var base = String(pathOrName || 'file').split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
  return (prefix != null && prefix !== '' ? String(prefix).replace(/[^a-zA-Z0-9._-]/g, '_') + '__' : '') + base;
}

function _backupProgress(msg) { var el = document.getElementById('backup-progress'); if (el) el.textContent = msg || ''; }

// Full backup: the data JSON PLUS every uploaded photo/document from cloud Storage,
// bundled into one downloadable .zip. Files are fetched via the Supabase client
// (no CORS issues); any that can't be fetched are listed in README.txt, never abort.
async function downloadFullBackup() {
  if (typeof _sb === 'undefined' || !_sb) {
    if (typeof showToast === 'function') showToast('Cloud not connected — use "Data Only" backup instead.', 'error');
    return;
  }
  try {
    _backupProgress('Loading zip library…');
    var JSZipLib = await _loadJSZip();
    var zip = new JSZipLib();
    zip.file('probid-data.json', JSON.stringify(_backupPayload(), null, 2));

    // Enumerate every stored file: job photos + WO documents/receipts.
    var files = [], idx = 0, pad = function(n){ n=String(n); while(n.length<3)n='0'+n; return n; };
    (DB.jobPhotos || []).forEach(function(p){
      var path = p.filePath || p.file_path;
      if (path || p.url) files.push({ path: path, url: p.url, zipPath: 'photos/' + pad(++idx) + '__' + _safeName(p.jobId, path || p.url) });
    });
    (DB.woDocuments || []).forEach(function(d){
      if (d && d.deleted) return;
      var path = d.path || d.file_path;
      if (path || d.url) files.push({ path: path, url: d.url, zipPath: 'documents/' + ((d.docType||'office')) + '/' + pad(++idx) + '__' + _safeName(d.woId, d.fileName || path || d.url) });
    });

    var total = files.length, done = 0, ok = 0, failed = [];
    _backupProgress(total ? ('Fetching files… 0/' + total) : 'Packaging data…');
    for (var i = 0; i < files.length; i++) {
      var f = files[i], blob = null;
      try {
        if (f.path) { var res = await _sb.storage.from('job-photos').download(f.path); if (res && res.data) blob = res.data; }
        if (!blob && f.url) { var r = await fetch(f.url); if (r.ok) blob = await r.blob(); }
      } catch(e) {
        try { if (f.url) { var r2 = await fetch(f.url); if (r2.ok) blob = await r2.blob(); } } catch(e2) {}
      }
      if (blob) { zip.file(f.zipPath, blob); ok++; } else { failed.push(f.zipPath); }
      done++; _backupProgress('Fetching files… ' + done + '/' + total);
    }

    var manifest = 'TCSS ProBid — Full Backup\r\nCreated: ' + new Date().toLocaleString() + '\r\n\r\n'
      + 'Records: ' + (DB.quotes||[]).length + ' quotes, ' + (DB.customers||[]).length + ' customers, '
      + (DB.contacts||[]).length + ' contacts, ' + (DB.workOrders||[]).length + ' work orders\r\n'
      + 'Files saved: ' + ok + ' of ' + total + '\r\n'
      + (failed.length ? ('\r\nCOULD NOT FETCH ' + failed.length + ' FILE(S):\r\n' + failed.join('\r\n') + '\r\n') : '\r\nAll files saved successfully.\r\n')
      + '\r\nTo restore your records, use Settings > Restore and pick this .zip (or the probid-data.json inside it).';
    zip.file('README.txt', manifest);

    _backupProgress('Compressing…');
    var out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    var d = new Date(), p2 = function(n){ return (n<10?'0':'')+n; };
    var name = 'ProBid_FullBackup_' + d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()) + '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.zip';
    var url = URL.createObjectURL(out);
    var a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch(e){} }, 1500);
    try { localStorage.setItem(BACKUP_DL_TS_KEY, d.toISOString()); } catch(e) {}
    if (typeof updateBackupInfo === 'function') updateBackupInfo();
    _backupProgress('');
    if (typeof showToast === 'function') showToast('Full backup downloaded (' + ok + '/' + total + ' files): ' + name + (failed.length ? ' — ' + failed.length + ' skipped, see README' : ''), failed.length ? 'warning' : 'success', 6000);
  } catch(e) {
    console.error('[FullBackup] failed', e);
    _backupProgress('');
    if (typeof showToast === 'function') showToast('Full backup failed: ' + (e && e.message || e), 'error');
  }
}

// ============================================================
// IMAGE COMPRESSION on upload. Supabase does not compress, and
// raw phone photos are 3–12MB each. We resize to a max edge and
// re-encode as JPEG before upload — typically a 5–15x reduction.
// Non-images (PDFs, SVG, etc.) and any failure pass through UNCHANGED,
// so an upload is never blocked by compression.
// ============================================================
function _isCompressibleImage(file) {
  if (!file || !file.type) return false;
  var t = file.type.toLowerCase();
  return t === 'image/jpeg' || t === 'image/jpg' || t === 'image/png' || t === 'image/webp' || t === 'image/heic' || t === 'image/heif';
}

function _fmtSize(bytes) {
  bytes = bytes || 0;
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024)    return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

async function compressImage(file, opts) {
  try {
    if (!_isCompressibleImage(file)) return file;               // leave PDFs/SVG/others alone
    opts = opts || {};
    var maxDim  = opts.maxDim  || (DB.settings && DB.settings.photoMaxDim)  || 2000;
    var quality = opts.quality || (DB.settings && DB.settings.photoQuality) || 0.82;
    var bmp;
    if (typeof createImageBitmap === 'function') {
      bmp = await createImageBitmap(file);
    } else {
      bmp = await new Promise(function(res, rej){
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload  = function(){ URL.revokeObjectURL(url); res(img); };
        img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('image load failed')); };
        img.src = url;
      });
    }
    var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;
    var scale = Math.min(1, maxDim / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th);      // flatten transparency to white (no black JPEGs)
    ctx.drawImage(bmp, 0, 0, tw, th);
    if (bmp.close) { try { bmp.close(); } catch(e){} }
    var blob = await new Promise(function(res){ canvas.toBlob(function(b){ res(b); }, 'image/jpeg', quality); });
    if (!blob || blob.size >= file.size) return file;           // no gain (already small) → keep original
    var base = ((file.name || 'photo').replace(/\.[^.]+$/, '')) || 'photo';
    try { return new File([blob], base + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }); }
    catch(e) { try { blob.name = base + '.jpg'; } catch(e2){} return blob; } // older Safari: no File ctor
  } catch(e) {
    console.warn('[compressImage] using original (compression failed):', e && e.message);
    return file;                                                // never block an upload on compression
  }
}

// ============================================================
// PRIVATE STORAGE — signed-URL media hydration
// The job-photos bucket can be private. Photos/documents are rendered with
// data-sp="<storage path>" plus a public-URL fallback in src/href; this swaps in
// short-lived signed URLs so private files display without exposing them publicly.
// Safe on a PUBLIC bucket too (the fallback URL already works; signing just upgrades it).
// ============================================================
async function hydrateSignedMedia(root) {
  try {
    if (typeof _sb === 'undefined' || !_sb) return;
    root = root || document;
    if (!root.querySelectorAll) return;
    var els = root.querySelectorAll('img[data-sp], a[data-sp]');
    if (!els || !els.length) return;
    var paths = [];
    for (var i = 0; i < els.length; i++) { var p = els[i].getAttribute('data-sp'); if (p && paths.indexOf(p) < 0) paths.push(p); }
    if (!paths.length) return;
    var map = {};
    var res = await _sb.storage.from('job-photos').createSignedUrls(paths, 3600);
    if (res && res.data) res.data.forEach(function(r){ if (r && r.path && r.signedUrl) map[r.path] = r.signedUrl; });
    for (var k = 0; k < els.length; k++) {
      var el = els[k], sp = el.getAttribute('data-sp'), signed = map[sp];
      if (signed) { if (el.tagName === 'IMG') el.src = signed; else el.setAttribute('href', signed); }
      el.removeAttribute('data-sp'); // processed — don't reprocess
    }
  } catch(e) { console.warn('[signedMedia]', e && e.message); }
}

// Auto-hydrate whenever photo/doc elements are added to the page.
function _initSignedMediaObserver() {
  if (window._signedMediaObserver || typeof MutationObserver === 'undefined' || !document.body) return;
  var pending = false;
  var obs = new MutationObserver(function(muts){
    if (pending) return;
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType === 1 && ((n.matches && n.matches('img[data-sp],a[data-sp]')) || (n.querySelector && n.querySelector('img[data-sp],a[data-sp]')))) {
          pending = true;
          setTimeout(function(){ pending = false; hydrateSignedMedia(document); }, 50);
          return;
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  window._signedMediaObserver = obs;
}
if (typeof document !== 'undefined') {
  if (document.body) _initSignedMediaObserver();
  else document.addEventListener('DOMContentLoaded', _initSignedMediaObserver);
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = _dbUnpack(raw);
      DB = Object.assign({quotes:[],customers:[],contacts:[],jobs:[],team:[],catalog:[],templates:[],settings:{},marginFloors:{},inventory:[],checkoutLog:[],tools:[],toolCheckouts:[],quoteSeq:1000,jobSeq:1,invSeq:1,toolSeq:1,deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]},workOrders:[],woLabor:[],woExpenses:[],woParts:[],woChecklist:[],woSettings:null,woSeq:1000,jobPhotos:[],commsLog:[],invoicePayments:[],purchaseOrders:[],vendors:[],poSeq:1000,invLocations:[],invTransfers:[],auditLog:[],woDocuments:[],timeEntries:[],contracts:[],recurringContracts:[],msSettings:{}}, parsed);
      // Ensure deletedIds sub-arrays exist even on old saved data
      if (!DB.deletedIds) DB.deletedIds = {quotes:[],team:[],customers:[],contacts:[],jobs:[]};
      if (!DB.deletedIds.quotes)    DB.deletedIds.quotes    = [];
      if (!DB.deletedIds.team)      DB.deletedIds.team      = [];
      if (!DB.deletedIds.customers) DB.deletedIds.customers = [];
      if (!DB.deletedIds.contacts)  DB.deletedIds.contacts  = [];
      if (!DB.deletedIds.jobs)      DB.deletedIds.jobs      = [];
    } else {
      const prev = localStorage.getItem('tcssv7') || localStorage.getItem('tcssv6') || localStorage.getItem('tcssv5') || localStorage.getItem('tcssv4');
      if (prev) {
        try {
          const oldData = JSON.parse(prev);
          DB = Object.assign({quotes:[],customers:[],contacts:[],jobs:[],team:[],catalog:[],templates:[],settings:{},marginFloors:{},inventory:[],checkoutLog:[],tools:[],toolCheckouts:[],quoteSeq:1000,jobSeq:1,invSeq:1,toolSeq:1,deletedIds:{quotes:[],team:[],customers:[],contacts:[],jobs:[]}}, oldData);
          console.log('Migrated data to v8');
        } catch(e) {}
      }
    }
    if (!DB.marginFloors)  DB.marginFloors  = {};
    if (!DB.inventory)     DB.inventory     = [];
    if (!DB.checkoutLog)   DB.checkoutLog   = [];
    if (!DB.invSeq)        DB.invSeq        = 1;
    if (!DB.catalogVersion) DB.catalogVersion = 1;
    if (!DB.toolLoans)     DB.toolLoans     = [];
    if (!DB.lunchFlags)    DB.lunchFlags    = [];
    if (!DB.workDays)      DB.workDays      = [];
    if (!DB.timeOffRequests) DB.timeOffRequests = [];
    if (!DB.timeCorrections) DB.timeCorrections = [];
    if (!DB.leaveForfeiture) DB.leaveForfeiture = [];
    if (!DB.payrollLog)      DB.payrollLog      = [];
    if (!DB.absences)        DB.absences        = [];
    if (!DB.wtProjects)      DB.wtProjects      = [];
    if (!DB.wtTemplates)     DB.wtTemplates     = [];
    if (!DB.wtItemCatalog)   DB.wtItemCatalog   = [];
    if (!DB.wtRoomTemplates) DB.wtRoomTemplates = [];
    if (!DB.wtBuildingTypes) DB.wtBuildingTypes = [];
    if (!DB.wtBuildings)     DB.wtBuildings     = [];
    if (!DB.wtRooms)         DB.wtRooms         = [];
    if (!DB.wtItems)         DB.wtItems         = [];
    if (!DB.wtCheckoffs)     DB.wtCheckoffs     = [];
    if (!DB.wtReworks)       DB.wtReworks       = [];

    // ONE-TIME MIGRATION: normalize quote status values to lowercase
    // Fixes Supabase Title Case values ('Draft','Sent','Approved','Lost') → app lowercase
    var statusNormMap = {
      'Draft':'draft','Sent':'sent','Review':'followup','Followup':'followup',
      'Approved':'approved','Won':'approved','Lost':'declined','Declined':'declined',
      'Rejected':'declined','Expired':'declined'
    };
    (DB.quotes||[]).forEach(function(q){
      if (q.status && statusNormMap[q.status]) q.status = statusNormMap[q.status];
    });

    // ONE-TIME MIGRATION: backfill customerId and contactId on existing quotes
    var migrated = 0;
    (DB.quotes||[]).forEach(function(q){
      if (!q.customerId && q.cn) {
        var mc = (DB.customers||[]).find(function(c){ return (c.name||'').toLowerCase()===(q.cn||'').toLowerCase(); });
        if (mc) { q.customerId = mc.id; migrated++; }
      }
      if (!q.contactId && q.contactName) {
        var mct = (DB.contacts||[]).find(function(c){ return (c.name||'').toLowerCase()===(q.contactName||'').toLowerCase(); });
        if (mct) { q.contactId = mct.id; }
      }
    });
    // Backfill customerId on contacts that have matching company name
    (DB.contacts||[]).forEach(function(c){
      if (!c.customerId && c.company) {
        var mc2 = (DB.customers||[]).find(function(x){ return (x.name||'').toLowerCase()===(c.company||'').toLowerCase(); });
        if (mc2) c.customerId = mc2.id;
      }
    });
    if (migrated > 0) { console.log('[Migration] Backfilled customerId on '+migrated+' quotes'); }
    if (!DB.settings.followupDays) DB.settings.followupDays = 7;
    // Migrate old tool checkouts that lack status field
    (DB.toolCheckouts||[]).forEach(function(co){
      if (!co.status) co.status = co.returnedAt ? 'verified' : 'checked_out';
    });
    // Migrate old tools to ensure new fields exist
    (DB.tools||[]).forEach(function(t){
      if (!t.linkedGroups) t.linkedGroups = [];
      if (t.photoUrl === undefined) t.photoUrl = '';
    });
  } catch(e) { console.warn('Load error', e); }
}

// ---- CURRENCY HELPER ----
function fmt(n) { return '$ ' + (isFinite(n) ? Math.abs(n).toFixed(2) : '0.00').replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtSigned(n) { return (n < 0 ? '-' : '') + fmt(n); }
function pct(n) { return (isFinite(n) ? n.toFixed(1) : '0.0') + '%'; }

// ---- UUID ----
function makeUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, function(c) {
    return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
  });
}

// ---- NAVIGATION ----
const PAGE_TITLES = {dash:'Dashboard',qq:'Quick Quote',quotes:'Quotes',jobs:'Active Jobs',customers:'Customers',contacts:'Contacts',team:'Team',catalog:'Price Catalog',templates:'Job Templates',reports:'Reports & Analytics',inventory:'Inventory',tools:'Tools',settings:'Settings',field:'Time Clock',timesheet:'Timesheets',worktracking:'Work Tracking',dispatch:'Dispatch Board',invoices:'Invoices',workorders:'Work Orders','wo-settings':'WO Settings',calendar:'Calendar',purchaseorders:'Purchase Orders',vendors:'Vendors',scanner:'Scanner',auditlog:'Audit Log',recyclebin:'Recycle Bin',contracts:'Contracts',recurring:'Managed Services'};

// ============================================================
// DOCUMENT PREV/NEXT NAVIGATOR
// Floating ‹ / › arrows pinned to the right edge of an open document
// (Quote, Work Order, Invoice, Contract). Steps strictly by record
// NUMBER — previous number / next number — regardless of how the
// document was reached (list, search, deep link). Openers register
// themselves via showDocNav(); pages/modals hide it via hideDocNav().
// ============================================================
var _docNav = null;
var _DOCNAV_BTN_CSS = 'width:40px;height:46px;border:none;border-radius:9px;background:#455a64;color:#fff;'
  + 'font-size:24px;font-weight:700;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.28);'
  + 'display:flex;align-items:center;justify-content:center;padding:0;transition:background .15s';

// Build the number-sorted record list for a given document type.
function _docNavList(type){
  var arr = [], numf = 'num';
  if (type === 'quote')      { arr = DB.quotes||[];      numf = 'num'; }
  else if (type === 'wo')    { arr = DB.workOrders||[];  numf = 'woNumber'; }
  else if (type === 'invoice'){ arr = DB.invoices||[];   numf = 'num'; }
  else if (type === 'contract'){ arr = DB.contracts||[]; numf = 'number'; }
  return arr.slice().sort(function(a,b){
    return String(a[numf]||'').localeCompare(String(b[numf]||''), undefined, {numeric:true, sensitivity:'base'});
  });
}

// Called by each document opener. type drives the record list; openFn reopens
// a record (same modal/page the user is in); isDirtyFn optionally guards edits;
// containerId is the modal/page element the arrows belong to — they auto-hide
// the moment it stops being open/active, no matter how it's closed.
function showDocNav(type, currentId, openFn, isDirtyFn, containerId){
  var list = _docNavList(type);
  var ids = list.map(function(r){ return r.id; });
  _docNav = { type:type, ids:ids, index:ids.indexOf(currentId), open:openFn, isDirty:isDirtyFn||null, container:containerId||null };
  _docNavWatch(_docNav.container);
  _renderDocNav();
}

// Is the document the arrows belong to still visible? Modals carry class 'open',
// pages carry class 'active'. No container registered → treat as not-open (hide).
function _docNavContainerOpen(){
  if (!_docNav) return false;
  if (!_docNav.container) return true;
  var el = document.getElementById(_docNav.container);
  if (!el) return false;
  return el.classList.contains('open') || el.classList.contains('active');
}

// Watch ONLY the current container's class attribute; hide arrows the instant it closes.
function _docNavWatch(containerId){
  if (window._docNavObs) window._docNavObs.disconnect();
  if (!containerId) return;
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!window._docNavObs){
    window._docNavObs = new MutationObserver(function(){
      if (_docNav && !_docNavContainerOpen()) hideDocNav();
    });
  }
  window._docNavObs.observe(el, {attributes:true, attributeFilter:['class']});
}

function hideDocNav(){
  _docNav = null;
  if (window._docNavObs) window._docNavObs.disconnect();
  var el = document.getElementById('doc-nav-arrows');
  if (el) el.style.display = 'none';
}

// Anchor the arrows to the RIGHT EDGE OF THE OPEN DOCUMENT (the modal box, or a
// full-width page), not the screen edge — so they always sit on the document even
// when the modal is a centered box narrower than the viewport.
function _positionDocNav(el){
  el.style.top = '150px';
  var box = null;
  if (_docNav && _docNav.container){
    var c = document.getElementById(_docNav.container);
    if (c) box = (c.querySelector && c.querySelector('.modal-box')) || c;
  }
  if (box){
    var rect = box.getBoundingClientRect();
    if (rect && rect.width){
      // sit just inside the document's right edge, hanging slightly onto it like a tab
      var right = Math.round(window.innerWidth - rect.right) - 4;
      el.style.right = Math.max(4, right) + 'px';
      el.style.left = 'auto';
      return;
    }
  }
  el.style.right = '12px';
  el.style.left = 'auto';
}

function _renderDocNav(){
  var el = document.getElementById('doc-nav-arrows');
  if (!el){
    el = document.createElement('div');
    el.id = 'doc-nav-arrows';
    el.style.cssText = 'position:fixed;right:12px;top:150px;z-index:100050;'
      + 'display:flex;flex-direction:column;gap:10px';
    el.innerHTML = '<button id="doc-nav-prev" title="Previous number" style="'+_DOCNAV_BTN_CSS+'">&#8249;</button>'
      + '<button id="doc-nav-next" title="Next number" style="'+_DOCNAV_BTN_CSS+'">&#8250;</button>';
    document.body.appendChild(el);
    el.querySelector('#doc-nav-prev').addEventListener('click', function(){ docNavGo(-1); });
    el.querySelector('#doc-nav-next').addEventListener('click', function(){ docNavGo(1); });
    // Keep the arrows glued to the document's right edge when the window resizes
    window.addEventListener('resize', function(){ var a=document.getElementById('doc-nav-arrows'); if(a && a.style.display!=='none') _positionDocNav(a); });
  }
  if (!_docNav || _docNav.index < 0 || _docNav.ids.length < 2 || !_docNavContainerOpen()){ el.style.display = 'none'; return; }
  el.style.display = 'flex';
  _positionDocNav(el);
  // Re-measure once layout settles (modal open animation / late render)
  setTimeout(function(){ var a=document.getElementById('doc-nav-arrows'); if(a && a.style.display!=='none') _positionDocNav(a); }, 40);
  var prev = document.getElementById('doc-nav-prev');
  var next = document.getElementById('doc-nav-next');
  var atFirst = _docNav.index <= 0;
  var atLast  = _docNav.index >= _docNav.ids.length - 1;
  if (prev){ prev.style.opacity = atFirst?'0.3':'1'; prev.style.cursor = atFirst?'default':'pointer'; prev.disabled = atFirst;
             prev.title = atFirst?'Already at the first number':'Previous number'; }
  if (next){ next.style.opacity = atLast?'0.3':'1'; next.style.cursor = atLast?'default':'pointer'; next.disabled = atLast;
             next.title = atLast?'Already at the last number':'Next number'; }
}

function docNavGo(dir){
  if (!_docNav) return;
  var ni = _docNav.index + dir;
  if (ni < 0 || ni >= _docNav.ids.length) return;
  if (_docNav.isDirty && _docNav.isDirty()){
    if (!confirm('This document has unsaved changes. Leave without saving?')) return;
  }
  var targetId = _docNav.ids[ni];
  var openFn = _docNav.open;
  if (typeof openFn === 'function') openFn(targetId); // opener calls showDocNav again → index updates
}

function goPage(id) {
  // Warn if leaving Work Tracking while inside a project or wizard
  var wtPage = document.getElementById('page-worktracking');
  var wtActive = wtPage && wtPage.classList.contains('active');
  if (id !== 'worktracking' && wtActive) {
    var wizOpen = !!document.getElementById('wt-wizard-modal') || !!document.getElementById('wt-abw-modal');
    var inProject = typeof WT !== 'undefined' && WT.proj && WT.view !== 'list';
    if (wizOpen) {
      if (!confirm('You are in the middle of a wizard.\n\nYour progress has been saved as a draft — you can resume it next time.\n\nLeave anyway?')) { _routeRevert(); return; }
    } else if (inProject) {
      if (!confirm('Leave Work Tracking?\n\nAll your work is saved. You can come back any time.')) { _routeRevert(); return; }
    }
  }
  // Warn if leaving Quick Quote with unsaved changes — use in-app modal not browser confirm
  var qqPage = document.getElementById('page-qq');
  var qqActive = qqPage && qqPage.classList.contains('active');
  if (id !== 'qq' && qqActive && typeof _qqDirty !== 'undefined' && _qqDirty) {
    // Show in-app modal instead of browser confirm
    _qqNavTarget = id;
    var modal = document.getElementById('modal-qq-nav-warn');
    var msg = document.getElementById('modal-qq-nav-msg');
    var idEl = document.getElementById('qq-id');
    var hasSavedStub = idEl && idEl.value;
    if (msg) msg.textContent = hasSavedStub
      ? 'Your work has been auto-saved as a draft quote. You can resume it any time from the Quotes page.'
      : 'Your draft has been saved locally in this browser. Resume it next time you open a new quote.';
    if (modal) { modal.style.display = 'flex'; }
    _routeRevert();
    return; // don't navigate yet
  }
  // Warn on unsaved Work Order changes before navigating away (mirrors the quote guard above)
  var woModalEl = document.getElementById('modal-work-order');
  if (woModalEl && woModalEl.classList.contains('open') && typeof _woDirty !== 'undefined' && _woDirty) {
    _woNavTarget = id;
    var woWarn = document.getElementById('modal-wo-nav-warn');
    if (woWarn) { woWarn.style.display = 'flex'; _routeRevert(); return; } // don't navigate yet
  }
  // Hide the document prev/next arrows when navigating pages (openers re-show them as needed)
  if (typeof hideDocNav === 'function') hideDocNav();
  // Close any open document modal when navigating via the menu, so the destination page is
  // visible instead of staying hidden behind the modal (matches how leaving the quote page works).
  ['modal-work-order','modal-invoice','modal-contract','modal-view-quote'].forEach(function(mid){
    var mm = document.getElementById(mid); if (mm) mm.classList.remove('open');
  });
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active')});
  // Enforce nav permissions on every navigation — one place, always runs
  if (typeof enforceNavPermissions === 'function') enforceNavPermissions();
  // Always close dispatch detail panel when navigating away
  var dp = document.getElementById('dispatch-detail-panel');
  if (dp) dp.style.display = 'none';
  // Stop dispatch refresh timer if leaving dispatch
  if (id !== 'dispatch' && _dispatchRefreshTimer) {
    clearInterval(_dispatchRefreshTimer);
    _dispatchRefreshTimer = null;
  }
  var pg = document.getElementById('page-'+id);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item[data-page="'+id+'"]').forEach(function(ni){ ni.classList.add('active'); });
  var tt = document.getElementById('topbar-title');
  if (tt) tt.textContent = PAGE_TITLES[id] || id;
  // Render page content
  if (id==='dash')       { renderDash(); if (typeof applyDashPrefs === 'function') applyDashPrefs(); }
  if (id==='quotes') {
    // Apply saved default sort on page visit
    var qs = document.getElementById('q-sort');
    if (qs) {
      var savedSort = (DB.settings && DB.settings.quoteDefaultSort) || 'num-desc';
      qs.value = savedSort;
    }
    renderQuotes();
  }
  if (id==='customers')  renderCustomers();
  if (id==='contracts')  renderContracts();
  if (id==='recurring')  renderRecurring();
  if (id==='contacts')   renderContacts();
  if (id==='jobs')       renderJobs();
  if (id==='team')       { renderTeam(); if (typeof renderUserAccessPanel==='function') renderUserAccessPanel(); }
  if (id==='calendar')   { if (typeof renderCalendar === 'function') renderCalendar(); }
  if (id==='workorders') { if (typeof initWorkOrdersPage === 'function') initWorkOrdersPage(); }
  if (id==='wo-settings'){ if (typeof renderWOSettingsPage === 'function') renderWOSettingsPage(); }
  if (id==='purchaseorders') { if (typeof renderPOList === 'function') renderPOList(); }
  if (id==='vendors')    { if (typeof renderVendors === 'function') renderVendors(); }
  if (id==='scanner')    { if (typeof renderScannerPage === 'function') renderScannerPage(); }
  if (id==='dash')       { if (typeof renderDashReorderAlert === 'function') setTimeout(renderDashReorderAlert, 200); }
  if (id==='auditlog')   { if (typeof loadAuditLogFromCloud === 'function') setTimeout(loadAuditLogFromCloud, 100); else if (typeof renderAuditLog === 'function') setTimeout(renderAuditLog, 100); }
  if (id==='recyclebin') { if (typeof renderRecycleBin === 'function') setTimeout(renderRecycleBin, 100); }
  if (id==='catalog')    { _pumActive=false; renderCatalog(); }
  else if (id==='templates') renderTemplates();
  if (id==='reports')    renderReports();
  if (id==='inventory')  renderInventory();
  if (id==='tools')      { setTimeout(renderTools, 50); }
  if (id==='settings')   { loadSettings(); setTimeout(function(){ renderPermissionsEditor(); switchMsTab('company'); initViewAsCard(); window.scrollTo(0,0); var p=document.getElementById('page-settings'); if(p)p.scrollTop=0; }, 150); }
  if (id==='qq')         { renderTplLibrary(); setTimeout(populateJTDropdown, 150); }
qqStage4Init();
  if (id==='field')      setTimeout(renderFieldPage, 50);
  if (id==='timesheet')  { var today=new Date().toISOString().split('T')[0]; var dtEl=document.getElementById('ts-date-filter'); if(dtEl&&!dtEl.value) dtEl.value=today; setTimeout(loadTimesheets,50); }
  if (id==='worktracking') { setTimeout(renderWorkTracking, 50); }
  if (id==='dispatch')     { setTimeout(initDispatchBoard, 50); }
  if (id==='invoices')     { setTimeout(renderInvoicesPage, 50); }
  // Sync mobile bottom nav highlight
  var mobilePages = ['dash','qq','field','jobs','inventory'];
  document.querySelectorAll('.mob-nav-item').forEach(function(item){ item.classList.remove('active'); });
  if (mobilePages.includes(id)) {
    var mob = document.getElementById('mob-'+id);
    if (mob) mob.classList.add('active');
  }
  // Close mobile sidebar after navigation
  if (document.body.classList.contains('is-mobile')) {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobile-overlay');
    if (sidebar) { sidebar.classList.remove('mobile-open'); sidebar.style.transform='translateX(-220px)'; sidebar.style.boxShadow='none'; }
    if (overlay) overlay.classList.remove('visible');
  }
  // Reflect the page we landed on in the URL (enables Back/Forward + deep links)
  _syncHash(id);
}

// ============================================================
// CLIENT-SIDE HASH ROUTING  (Back/Forward + open-in-new-tab + refresh-safe)
// ------------------------------------------------------------
// goPage() stays the single navigation entry point. After it renders a page it
// records the page in the URL hash (#/<pageId>) via _syncHash(), which pushes a
// browser history entry — so the browser Back/Forward buttons walk the page
// history, links can point at #/<page> to open in a new tab, and a refresh
// re-lands on the same page. A hashchange listener drives goPage() in the other
// direction (Back/Forward/typed hash). Two flags keep the two directions from
// echoing each other: _suppressHashNav (a goPage->hash write we must ignore) and
// _navIsBack (this goPage call originated from a hash change, so a blocked
// navigation must put the hash back). Only pages in PAGE_TITLES are routable.
// ============================================================
var _suppressHashNav = false;   // true while goPage is writing the hash itself
var _navIsBack = false;         // true while goPage is running for a hashchange

// The page id of the currently-visible page (from the active .page element).
function _currentPageId() {
  var el = document.querySelector('.page.active');
  if (!el || !el.id) return '';
  return el.id.replace(/^page-/, '');
}

// Parse the page id out of the location hash: "#/invoices" -> "invoices".
function _hashPageId() {
  var h = String(location.hash || '');
  h = h.replace(/^#\/?/, '');      // drop leading "#" or "#/"
  h = h.split(/[\/?#]/)[0];        // first segment only
  return h;
}

// Write the hash to match the page we just navigated to. Only writes when it
// differs (so Back/Forward, which already changed the hash, add no extra entry),
// and flags the write so our own hashchange listener ignores it.
function _syncHash(id) {
  if (!id) return;
  var want = '#/' + id;
  if (location.hash !== want) {
    _suppressHashNav = true;
    location.hash = want;
  }
}

// A guard blocked a navigation that came from Back/Forward — the hash now points
// at a page we did NOT move to. Put it back to the page still on screen.
function _routeRevert() {
  if (!_navIsBack) return;         // click-blocked navs never moved the hash
  _syncHash(_currentPageId());
}

// Drive goPage from the URL when the user hits Back/Forward or edits the hash.
window.addEventListener('hashchange', function () {
  if (_suppressHashNav) { _suppressHashNav = false; return; } // our own write
  if (typeof _currentUser === 'undefined' || !_currentUser) return; // not signed in
  var id = _hashPageId();
  if (!id || !PAGE_TITLES[id]) return;      // unknown/empty hash — ignore
  if (id === _currentPageId()) return;      // already on that page
  _navIsBack = true;
  try { goPage(id); } finally { _navIsBack = false; }
});

// After login/refresh, land on the page named in the hash (deep link / refresh).
// No-op when there is no explicit, valid hash — leaves the default landing page.
var _bootRouteApplied = false;
function _applyBootRoute() {
  if (_bootRouteApplied) return;
  _bootRouteApplied = true;
  var id = _hashPageId();
  if (id && PAGE_TITLES[id]) {
    // Deep link / refresh: land on the page named in the hash.
    try { goPage(id); } catch (e) {}
  } else {
    // No hash on this boot — stamp the current landing page onto the ROOT history
    // entry (replace, not push) so Back walks pages cleanly and the very first
    // Back exits the app rather than landing on a hash-less in-between state.
    try {
      var cur = _currentPageId();
      if (cur) history.replaceState(null, '', '#/' + cur);
    } catch (e) {}
  }
}

// ============================================================
// PER-USER MENU CUSTOMIZATION  (favorites / hide / collapse)
// ------------------------------------------------------------
// Preferences live in the user_ui_prefs table (cloud, self-only RLS, migration
// _19) so a person's menu follows them across tabs and devices. This overlay
// ALWAYS sits on top of role permissions (enforceNavPermissions): it can only
// tidy what a role already shows — it can never reveal a page the role can't
// see. enforceNavPermissions() calls initMenuChrome() + applyUserMenuPrefs() at
// its end, so the overlay re-applies on login and on every navigation.
// ============================================================
var _uiPrefs = { favorites: [], hidden: [], collapsed: [] };
var _uiPrefsLoaded = false;
var _uiPrefsExists = false;   // true once THIS user has their own saved prefs row
var _uiPrefsSaveTimer = null;
var _menuChromeInit = false;
var _menuAnimReady = false;

function _normUiPrefs(p) {
  p = p || {};
  var io = {};
  if (p.itemOrder && typeof p.itemOrder === 'object') {
    Object.keys(p.itemOrder).forEach(function (k) { if (Array.isArray(p.itemOrder[k])) io[k] = p.itemOrder[k].slice(); });
  }
  return {
    favorites:   Array.isArray(p.favorites)   ? p.favorites.slice()   : [],
    hidden:      Array.isArray(p.hidden)      ? p.hidden.slice()      : [],
    collapsed:   Array.isArray(p.collapsed)   ? p.collapsed.slice()   : [],
    dashHidden:  Array.isArray(p.dashHidden)  ? p.dashHidden.slice()  : [],  // hidden dashboard tiles/cards
    itemOrder:   io,                                                          // { sectionKey: [pageId,...] }
    sectionOrder:Array.isArray(p.sectionOrder)? p.sectionOrder.slice(): [],   // [sectionKey,...]
    dashLayout:  Array.isArray(p.dashLayout)  ? p.dashLayout.slice()  : [],   // [{id,x,y,w,h},...] (dashboard grid)
    statOrder:   Array.isArray(p.statOrder)   ? p.statOrder.slice()   : []    // [statTileId,...] (dashboard stat strip)
  };
}

// ---- Company default menu (owner sets it; everyone inherits until they personalize) ----
// Stored in DB.settings.menuDefault, which is company-wide and already cloud-synced.
function _companyMenuDefault() {
  try { return _normUiPrefs((typeof DB !== 'undefined' && DB.settings) ? DB.settings.menuDefault : null); }
  catch (e) { return _normUiPrefs(null); }
}
// The prefs to DISPLAY: this user's own if they've personalized, else the company default.
function _effPrefs() {
  return _uiPrefsExists ? _uiPrefs : _companyMenuDefault();
}
// Before the user's first personal edit, seed their prefs from the company default so
// their first change starts from that baseline instead of a blank slate.
function _ensurePersonal() {
  if (!_uiPrefsExists) { _uiPrefs = _normUiPrefs(_companyMenuDefault()); _uiPrefsExists = true; }
}
function _companyDefaultIsSet() {
  var d = _companyMenuDefault();
  return (d.favorites.length + d.hidden.length + d.collapsed.length + d.dashHidden.length
    + Object.keys(d.itemOrder || {}).length + d.sectionOrder.length + d.dashLayout.length
    + d.statOrder.length) > 0;
}

// Load this user's saved menu prefs from the cloud (self-only row).
async function loadUiPrefs() {
  try {
    if (typeof _sb !== 'undefined' && _sb && _currentUser && _currentUser.id) {
      var res = await _sb.from('user_ui_prefs').select('prefs').eq('user_id', _currentUser.id).maybeSingle();
      var found = !!(res && !res.error && res.data && res.data.prefs);
      _uiPrefs = _normUiPrefs(found ? res.data.prefs : null);
      _uiPrefsExists = found;   // no personal row yet → inherit the company default
    } else {
      _uiPrefs = _normUiPrefs(null); _uiPrefsExists = false;
    }
  } catch (e) { _uiPrefs = _normUiPrefs(null); _uiPrefsExists = false; }
  _uiPrefsLoaded = true;
  try { initMenuChrome(); } catch (e) {}
  try { applyUserMenuPrefs(); } catch (e) {}
  try { applyDashPrefs(); } catch (e) {}
}

// Debounced save of the current prefs (upsert into the user's own row).
function saveUiPrefs() {
  if (_uiPrefsSaveTimer) clearTimeout(_uiPrefsSaveTimer);
  _uiPrefsSaveTimer = setTimeout(function () {
    _uiPrefsSaveTimer = null;
    try {
      if (typeof _sb !== 'undefined' && _sb && _currentUser && _currentUser.id) {
        _sb.from('user_ui_prefs')
          .upsert({ user_id: _currentUser.id, prefs: _uiPrefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .then(function (res) { if (res && res.error) console.warn('[uiPrefs] save error:', res.error.message); });
      }
    } catch (e) { console.warn('[uiPrefs] save failed:', e && e.message); }
  }, 600);
}

// Quick-add "+" map: menu page -> where to go + which add-function to fire. Clicking the
// "+" on a menu item jumps straight into creating that record. Quotes routes to the Quick
// Quote page (which IS the new-quote flow); the rest open the entity's "new" form/modal.
var QUICK_ADD = {
  quotes:         { go: 'qq' },
  workorders:     { go: 'workorders',     fn: 'openNewWorkOrder', title: 'New work order' },
  customers:      { go: 'customers',      fn: 'newCustomer',      title: 'New customer' },
  contacts:       { go: 'contacts',       fn: 'newContact',       title: 'New contact' },
  vendors:        { go: 'vendors',        fn: 'openNewVendor',    title: 'New vendor' },
  purchaseorders: { go: 'purchaseorders', fn: 'openNewPO',        title: 'New purchase order' },
  contracts:      { go: 'contracts',      fn: 'openNewContract',  title: 'New contract' },
  recurring:      { go: 'recurring',      fn: 'openNewRC',        title: 'New managed service' },
  catalog:        { go: 'catalog',        fn: 'newCatalogItem',   title: 'New catalog item' },
  templates:      { go: 'templates',      fn: 'newTemplate',      title: 'New template' },
  inventory:      { go: 'inventory',      fn: 'newInventoryItem', title: 'New inventory item' },
  tools:          { go: 'tools',          fn: 'newToolItem',      title: 'New tool' },
  team:           { go: 'team',           fn: 'openTeamModal',    title: 'Add team member' }
};

// Fired by a menu item's "+". Navigates to the entity's page, then opens its add form.
function quickAdd(page) {
  var m = QUICK_ADD[page]; if (!m) return;
  try { if (typeof goPage === 'function' && m.go) goPage(m.go); } catch (e) {}
  if (m.fn) setTimeout(function () { try { if (typeof window[m.fn] === 'function') window[m.fn](); } catch (e) {} }, 200);
}

// One-time: give each group a stable key + collapse caret, each item a star and
// a clean data-label. Idempotent — safe to call on every enforceNavPermissions.
function initMenuChrome() {
  if (_menuChromeInit) return;
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  _menuChromeInit = true;
  sidebar.querySelectorAll('.nav-group').forEach(function (g) {
    var title = g.querySelector('.nav-group-title');
    if (!title) return;
    var key = (title.getAttribute('data-group') || title.textContent || '').trim();
    title.setAttribute('data-group', key);
    g.setAttribute('data-group', key);
    if (!title.querySelector('.nav-caret')) {
      var car = document.createElement('span');
      car.className = 'nav-caret';
      car.textContent = '▾';
      title.appendChild(car);
    }
    // Wrap everything after the title in a body/inner pair so the section can
    // slide open/closed (grid-row 1fr↔0fr). The caret lives in the title, so it
    // stays put and rotates. Done once per group.
    if (!g._bodyWrapped) {
      g._bodyWrapped = true;
      var body = document.createElement('div'); body.className = 'nav-group-body';
      var inner = document.createElement('div'); inner.className = 'nav-group-inner';
      body.appendChild(inner);
      var node = title.nextSibling;
      while (node) { var next = node.nextSibling; inner.appendChild(node); node = next; }
      g.appendChild(body);
    }
  });
  sidebar.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
    if (el.closest('#nav-fav-items')) return;
    if (!el.closest('.nav-group')) return; // standalone items (Dashboard) get no star/label chrome
    if (!el.hasAttribute('data-label')) {
      var t = el.lastChild;
      var label = (t && t.nodeType === 3 ? t.textContent : el.textContent) || el.getAttribute('data-page');
      el.setAttribute('data-label', String(label).trim());
    }
    if (!el.querySelector('.nav-star')) {
      var s = document.createElement('span');
      s.className = 'nav-star';
      s.setAttribute('title', 'Pin to Favorites');
      el.appendChild(s);
    }
    // Quick-add "+" for pages that can create a record. Inline onclick so it survives the
    // cloneNode used to build the Favorites group; stopPropagation keeps it from navigating.
    var qa = QUICK_ADD[el.getAttribute('data-page')];
    if (qa && !el.querySelector('.nav-add')) {
      var a = document.createElement('span');
      a.className = 'nav-add';
      a.textContent = '+';
      a.setAttribute('title', qa.title || 'Add new');
      a.setAttribute('onclick', "event.stopPropagation();event.preventDefault();quickAdd('" + el.getAttribute('data-page') + "');return false;");
      el.appendChild(a);
    }
  });
}

// Overlay the user's favorites / hidden / collapsed on top of the role-based
// visibility that enforceNavPermissions() has just set.
function applyUserMenuPrefs() {
  if (!_uiPrefsLoaded) return;
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  var eff = _effPrefs();
  var fav = eff.favorites || [], hidden = eff.hidden || [], collapsed = eff.collapsed || [];

  // Clear the favorites clones first so the queries below only see real items.
  var favContainer = document.getElementById('nav-fav-items');
  if (favContainer) favContainer.innerHTML = '';

  // Stars + user-hidden (only ever hides what the role already shows; never dash).
  sidebar.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
    if (el.closest('#nav-fav-items')) return;
    var page = el.getAttribute('data-page');
    if (page !== 'dash' && hidden.indexOf(page) >= 0) {
      el.style.setProperty('display', 'none', 'important');
    }
    var star = el.querySelector('.nav-star');
    if (star) { var on = fav.indexOf(page) >= 0; star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on); }
  });

  // Rebuild the Favorites group from favorites that are currently visible.
  var favGroup = document.getElementById('nav-fav-group');
  if (favContainer && favGroup) {
    var added = 0;
    fav.forEach(function (page) {
      var src = sidebar.querySelector('.nav-item[data-page="' + page + '"]');
      if (!src || src.style.display === 'none') return; // role-hidden or user-hidden → don't surface
      var clone = src.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.removeProperty('display');
      var st = clone.querySelector('.nav-star'); if (st) { st.textContent = '★'; st.classList.add('on'); }
      _addFavGrip(clone);
      favContainer.appendChild(clone);
      added++;
    });
    favGroup.style.display = added > 0 ? '' : 'none';
    if (added > 1) _wireFavSortable(); // drag-to-reorder favorites live in the sidebar
  }

  // Reorder items within each section per saved order (unlisted items fall to the end).
  var itemOrder = eff.itemOrder || {};
  sidebar.querySelectorAll('.nav-group[data-group]').forEach(function (g) {
    if (g.id === 'nav-fav-group') return;
    var ord = itemOrder[g.getAttribute('data-group')];
    if (!ord || !ord.length) return;
    var inner = g.querySelector('.nav-group-inner') || g;
    var items = Array.prototype.slice.call(inner.querySelectorAll('.nav-item[data-page]'));
    items.sort(function (a, b) {
      var ia = ord.indexOf(a.getAttribute('data-page')); if (ia < 0) ia = 999;
      var ib = ord.indexOf(b.getAttribute('data-page')); if (ib < 0) ib = 999;
      return ia - ib;
    });
    items.forEach(function (it) { inner.appendChild(it); });
  });

  // Reorder the sections themselves per saved order (kept before the Customize button;
  // Favorites group + standalone Dashboard stay put at the top).
  var secOrder = eff.sectionOrder || [];
  if (secOrder.length) {
    var custBtn = document.getElementById('nav-customize-btn');
    var byKey = {};
    sidebar.querySelectorAll('.nav-group[data-group]').forEach(function (g) { if (g.id !== 'nav-fav-group') byKey[g.getAttribute('data-group')] = g; });
    secOrder.forEach(function (key) { var g = byKey[key]; if (g && custBtn && custBtn.parentNode) custBtn.parentNode.insertBefore(g, custBtn); });
    Object.keys(byKey).forEach(function (key) { if (secOrder.indexOf(key) < 0) { var g = byKey[key]; if (custBtn && custBtn.parentNode) custBtn.parentNode.insertBefore(g, custBtn); } });
  }

  // Collapsed groups — toggle the class; CSS slides the body and rotates the caret.
  sidebar.querySelectorAll('.nav-group[data-group]').forEach(function (g) {
    var key = g.getAttribute('data-group');
    g.classList.toggle('collapsed', collapsed.indexOf(key) >= 0);
  });

  // Hide any real group left with no visible items (keep collapsed ones — their
  // items are hidden by the slide, not inline display, so they still count).
  sidebar.querySelectorAll('.nav-group').forEach(function (g) {
    if (g.id === 'nav-fav-group') return;
    var items = g.querySelectorAll('.nav-item[data-page]');
    var anyVis = false;
    items.forEach(function (it) { if (it.style.display !== 'none') anyVis = true; });
    g.style.display = anyVis ? '' : 'none';
  });

  // Master collapse-all / expand-all toggle: label + caret reflect current state,
  // counting only sections that are actually showing.
  var allBtn = document.getElementById('nav-collapse-all');
  if (allBtn) {
    var vis = Array.prototype.filter.call(sidebar.querySelectorAll('.nav-group[data-group]'), function (g) { return g.style.display !== 'none'; });
    var keys = vis.map(function (g) { return g.getAttribute('data-group'); });
    var colCount = keys.filter(function (k) { return collapsed.indexOf(k) >= 0; }).length;
    var allCol = keys.length > 0 && colCount >= keys.length;
    allBtn.classList.toggle('all-collapsed', allCol);
    var lbl = document.getElementById('nav-collapse-all-lbl');
    if (lbl) lbl.textContent = allCol ? 'Expand all' : 'Collapse all';
  }

  // Enable slide transitions only after the first paint, so sections that load
  // already-collapsed don't animate shut on every page load.
  if (!_menuAnimReady) { _menuAnimReady = true; setTimeout(function () { document.body.classList.add('menu-anim-ready'); }, 60); }
}

function toggleFavorite(page) {
  if (!page) return;
  _ensurePersonal();
  var i = _uiPrefs.favorites.indexOf(page);
  if (i >= 0) _uiPrefs.favorites.splice(i, 1); else _uiPrefs.favorites.push(page);
  saveUiPrefs();
  if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
  _refreshCustomizeMenuIfOpen();
}

// ---- Favorites drag-to-reorder (live in the sidebar) ----------------------------------
// Each favorite row gets a small ⠿ grip; only the grip drags (a tap on the row still
// navigates). The new order is written back into prefs.favorites. Favorites that aren't
// currently visible (role-hidden) are preserved after the visible ones.
var _favSortable = null;

function _addFavGrip(row) {
  if (!row || row.querySelector('.nav-fav-grip')) return;
  var g = document.createElement('span');
  g.className = 'nav-fav-grip'; g.textContent = '⠿'; g.title = 'Drag to reorder';
  g.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); });
  row.appendChild(g);
}

function _wireFavSortable() {
  var c = document.getElementById('nav-fav-items'); if (!c) return;
  if (typeof Sortable === 'undefined') return;            // library absent → favorites still work, just no drag
  if (_favSortable && _favSortable.el === c) return;      // already wired (container persists across rebuilds)
  try {
    _favSortable = Sortable.create(c, {
      handle: '.nav-fav-grip', draggable: '.nav-item', animation: 150, forceFallback: true,
      onEnd: function () {
        var order = Array.prototype.map.call(c.querySelectorAll('.nav-item'), function (a) { return a.getAttribute('data-page'); })
          .filter(function (p) { return !!p; });
        _ensurePersonal();
        var rest = (_uiPrefs.favorites || []).filter(function (p) { return order.indexOf(p) < 0; }); // keep hidden favs
        _uiPrefs.favorites = order.concat(rest);
        saveUiPrefs();
        if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
      }
    });
  } catch (e) { _favSortable = null; console.warn('[favSortable] init failed:', e && e.message); }
}

function toggleHidden(page) {
  if (!page || page === 'dash') return; // Dashboard is home — never hideable
  _ensurePersonal();
  var i = _uiPrefs.hidden.indexOf(page);
  if (i >= 0) _uiPrefs.hidden.splice(i, 1); else _uiPrefs.hidden.push(page);
  saveUiPrefs();
  if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
  _refreshCustomizeMenuIfOpen();
}

// Master toggle: if every visible section is collapsed, expand them all;
// otherwise collapse them all.
function toggleCollapseAll() {
  var sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  _ensurePersonal();
  var vis = Array.prototype.filter.call(sidebar.querySelectorAll('.nav-group[data-group]'), function (g) { return g.style.display !== 'none'; });
  var keys = vis.map(function (g) { return g.getAttribute('data-group'); });
  var colCount = keys.filter(function (k) { return _uiPrefs.collapsed.indexOf(k) >= 0; }).length;
  if (keys.length > 0 && colCount >= keys.length) {
    // all collapsed → expand all (drop these keys from collapsed)
    _uiPrefs.collapsed = _uiPrefs.collapsed.filter(function (k) { return keys.indexOf(k) < 0; });
  } else {
    // collapse all visible sections (union with any already stored)
    keys.forEach(function (k) { if (_uiPrefs.collapsed.indexOf(k) < 0) _uiPrefs.collapsed.push(k); });
  }
  saveUiPrefs();
  applyUserMenuPrefs();
}

function toggleGroupCollapsed(titleEl) {
  var g = titleEl && titleEl.closest ? titleEl.closest('.nav-group') : null;
  if (!g) return;
  _ensurePersonal();
  var key = (g.getAttribute('data-group') || (titleEl.textContent || '')).trim();
  var i = _uiPrefs.collapsed.indexOf(key);
  if (i >= 0) _uiPrefs.collapsed.splice(i, 1); else _uiPrefs.collapsed.push(key);
  saveUiPrefs();
  applyUserMenuPrefs();
}

function resetMenuPrefs() {
  // Reset returns the menu to the company default (or the built-in default if the
  // owner hasn't set one). The user gets their own copy of it to tweak from.
  _uiPrefs = _normUiPrefs(_companyMenuDefault());
  _uiPrefsExists = true;
  saveUiPrefs();
  if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
  _refreshCustomizeMenuIfOpen();
}

// Owner-only: save the current menu (favorites / hidden / collapsed) as the company
// default that new users inherit and anyone can Reset to.
function saveAsCompanyDefault() {
  if (!(_currentUser && _currentUser.role === 'owner')) {
    if (typeof showToast === 'function') showToast('Only the owner can set the company default menu.', 'warning', 3000);
    return;
  }
  try {
    if (typeof DB !== 'undefined') { DB.settings = DB.settings || {}; DB.settings.menuDefault = _normUiPrefs(_effPrefs()); }
    if (typeof saveDB === 'function') saveDB();
    if (typeof showToast === 'function') showToast('Saved as the company default menu for everyone.', 'success', 3000);
  } catch (e) {
    if (typeof showToast === 'function') showToast('Could not save the company default.', 'error', 3000);
  }
  _refreshCustomizeMenuIfOpen();
}

function _refreshCustomizeMenuIfOpen() {
  var m = document.getElementById('modal-customize-menu');
  if (m && getComputedStyle(m).display !== 'none') openCustomizeMenu();
}

// Build + open the Customize Menu panel from the pages this role can see. Rows and
// section blocks are drag-sortable (SortableJS, touch-capable) via their grip handles;
// dragging reorders the live sidebar and saves per-user.
function openCustomizeMenu() {
  if (typeof initMenuChrome === 'function') initMenuChrome();
  var modal = document.getElementById('modal-customize-menu');
  var body = document.getElementById('cm-body');
  var sidebar = document.getElementById('sidebar');
  if (!modal || !body || !sidebar) return;
  var eff = _effPrefs();
  var esc = (typeof escHtml === 'function') ? escHtml : function (x) { return x; };
  var html = '<div class="cm-hint">Drag the ⠿ handles to reorder pages within a section, or reorder the sections themselves.</div><div id="cm-sortwrap">';
  sidebar.querySelectorAll('.nav-group').forEach(function (g) {
    if (g.id === 'nav-fav-group') return;
    var titleEl = g.querySelector('.nav-group-title');
    var groupKey = titleEl ? (titleEl.getAttribute('data-group') || titleEl.textContent || '') : '';
    var rowsHtml = '';
    g.querySelectorAll('.nav-item[data-page]').forEach(function (it) {
      var page = it.getAttribute('data-page');
      var userHidden = (eff.hidden || []).indexOf(page) >= 0;
      var roleVisible = (it.style.display !== 'none') || userHidden; // include user-hidden, exclude role-hidden
      if (!roleVisible) return;
      var label = it.getAttribute('data-label') || page;
      var fav = (eff.favorites || []).indexOf(page) >= 0;
      var locked = (page === 'dash');
      rowsHtml += '<div class="cm-row" data-page="' + page + '">'
        + '<span class="cm-grip cm-row-grip" title="Drag to reorder">⠿</span>'
        + '<label class="cm-show"><input type="checkbox" ' + (userHidden ? '' : 'checked') + (locked ? ' disabled' : '')
        + ' onchange="toggleHidden(\'' + page + '\')"> Show</label>'
        + '<button class="cm-fav' + (fav ? ' on' : '') + '" title="Pin to Favorites" onclick="toggleFavorite(\'' + page + '\')">' + (fav ? '★' : '☆') + '</button>'
        + '<span class="cm-label">' + esc(label) + '</span>'
        + '</div>';
    });
    if (rowsHtml) {
      html += '<div class="cm-section" data-group="' + esc(groupKey) + '">'
        + '<div class="cm-group"><span class="cm-grip cm-sec-grip" title="Drag to reorder section">⠿</span>' + esc(groupKey) + '</div>'
        + '<div class="cm-rows" data-group="' + esc(groupKey) + '">' + rowsHtml + '</div>'
        + '</div>';
    }
  });
  html += '</div>';
  body.innerHTML = html;
  _wireMenuSortables();
  // Owner-only "Save as company default"; reset label reflects whether one is set.
  var saveDefBtn = document.getElementById('cm-save-default');
  if (saveDefBtn) saveDefBtn.style.display = (_currentUser && _currentUser.role === 'owner') ? '' : 'none';
  var resetBtn = document.getElementById('cm-reset-btn');
  if (resetBtn) resetBtn.textContent = _companyDefaultIsSet() ? '↺ Reset to company default' : '↺ Reset to default';
  modal.style.display = 'flex';
}

// Wire SortableJS on the panel: sections reorder via their grip, items reorder within
// their section via row grips. On drop we persist and re-apply to the live sidebar.
function _wireMenuSortables() {
  if (typeof Sortable === 'undefined') return; // library not loaded → panel still works, just no drag
  var wrap = document.getElementById('cm-sortwrap');
  if (!wrap) return;
  Sortable.create(wrap, {
    handle: '.cm-sec-grip', draggable: '.cm-section', animation: 150,
    ghostClass: 'cm-ghost', chosenClass: 'cm-chosen',
    onEnd: function () {
      _ensurePersonal();
      _uiPrefs.sectionOrder = Array.prototype.map.call(wrap.querySelectorAll('.cm-section'), function (s) { return s.getAttribute('data-group'); });
      saveUiPrefs();
      if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
    }
  });
  wrap.querySelectorAll('.cm-rows').forEach(function (rows) {
    Sortable.create(rows, {
      handle: '.cm-row-grip', draggable: '.cm-row', animation: 150,
      ghostClass: 'cm-ghost', chosenClass: 'cm-chosen',
      onEnd: function () {
        var key = rows.getAttribute('data-group');
        _ensurePersonal();
        _uiPrefs.itemOrder = _uiPrefs.itemOrder || {};
        _uiPrefs.itemOrder[key] = Array.prototype.map.call(rows.querySelectorAll('.cm-row'), function (r) { return r.getAttribute('data-page'); });
        saveUiPrefs();
        if (typeof enforceNavPermissions === 'function') enforceNavPermissions(); else applyUserMenuPrefs();
      }
    });
  });
}

function closeCustomizeMenu() {
  var modal = document.getElementById('modal-customize-menu');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// DASHBOARD PERSONALIZATION  (per-user show/hide of stat tiles + cards)
// Reuses the same user_ui_prefs row (prefs.dashHidden) and the same company
// default. Tiles/cards are tagged at runtime with data-dash / data-dash-label.
// ============================================================
var _dashChromeInit = false;

function initDashChrome() {
  if (_dashChromeInit) return;
  var page = document.getElementById('page-dash');
  if (!page) return;
  _dashChromeInit = true;
  // Stat tiles — keyed by position (order is fixed), labelled from their own text.
  var strip = document.getElementById('dash-stat-strip');
  if (strip) Array.prototype.forEach.call(strip.querySelectorAll('.dash-stat-tile'), function (t, i) {
    if (t.getAttribute('data-dash')) return;
    t.setAttribute('data-dash', 'stat-' + i);
    var lbl = t.querySelector('.dash-stat-lbl');
    t.setAttribute('data-dash-label', ((lbl ? lbl.textContent : 'Stat ' + (i + 1)) || '').trim());
  });
  // Main panels — keyed by a slug of their title. Skip the conditional alert cards
  // (Out Today / Follow-Ups Due) which show themselves only when there's something.
  var skip = { 'dash-absence-card': 1, 'dash-followup-card': 1 };
  Array.prototype.forEach.call(page.querySelectorAll('.dash-main-grid .dash-card'), function (c) {
    if ((c.id && skip[c.id]) || c.getAttribute('data-dash')) return;
    var t = c.querySelector('.dash-card-title');
    var label = ((t ? t.textContent : 'Card') || '').trim();
    var slug = 'card-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    c.setAttribute('data-dash', slug);
    c.setAttribute('data-dash-label', label);
  });
}

// Apply the user's (or company-default) hidden tiles/cards, and build the drag/resize
// grid when the engine is available. Stat tiles are always show/hide by display; the
// panels are owned by the grid when it's active, else fall back to display show/hide.
function applyDashPrefs() {
  if (!_uiPrefsLoaded) return;
  initDashChrome();
  var page = document.getElementById('page-dash');
  if (!page) return;
  var hidden = _effPrefs().dashHidden || [];
  if (typeof GridStack !== 'undefined') {
    try {
      initDashGrid();
      // A build was requested while the page was hidden; now that we're on the visible
      // dash page, build it cleanly at full width.
      if (_dashGridPending && _dashHostVisible()) buildDashGrid();
    } catch (e) {}
  }
  var strip = document.getElementById('dash-stat-strip');
  if (strip) strip.querySelectorAll('[data-dash]').forEach(function (el) {
    if (hidden.indexOf(el.getAttribute('data-dash')) >= 0) el.style.setProperty('display', 'none', 'important');
    else el.style.removeProperty('display');
  });
  // Stat strip drag-to-reorder: apply saved order + (re)attach grips & the Sortable.
  // Done here (runs after every renderDash) so the OPEN-WOs tile, whose innerHTML renderDash
  // rewrites, gets its grip back each visit.
  _applyStatOrder();
  _wireStatSortable();
  if (!_dashGrid) { // no grid engine → fallback: show/hide the panels by display
    page.querySelectorAll('.dash-main-grid [data-dash]').forEach(function (el) {
      if (hidden.indexOf(el.getAttribute('data-dash')) >= 0) el.style.setProperty('display', 'none', 'important');
      else el.style.removeProperty('display');
    });
  }
}

function toggleDashHidden(id) {
  if (!id) return;
  _ensurePersonal();
  _uiPrefs.dashHidden = _uiPrefs.dashHidden || [];
  var i = _uiPrefs.dashHidden.indexOf(id);
  if (i >= 0) _uiPrefs.dashHidden.splice(i, 1); else _uiPrefs.dashHidden.push(id);
  saveUiPrefs();
  if (_dashGrid && String(id).indexOf('card-') === 0) { try { buildDashGrid(); } catch (e) {} } // panel add/remove → rebuild grid
  applyDashPrefs();
  _refreshCustomizeDashIfOpen();
}

function resetDashPrefs() {
  _ensurePersonal();
  var cd = _companyMenuDefault();
  _uiPrefs.dashHidden = (cd.dashHidden || []).slice(); // company default (or empty)
  _uiPrefs.dashLayout = (cd.dashLayout || []).slice();
  _uiPrefs.statOrder  = (cd.statOrder  || []).slice();
  saveUiPrefs();
  if (_dashGrid) { try { buildDashGrid(); } catch (e) {} }
  applyDashPrefs();
  _refreshCustomizeDashIfOpen();
}

function _refreshCustomizeDashIfOpen() {
  var m = document.getElementById('modal-customize-dash');
  if (m && getComputedStyle(m).display !== 'none') openCustomizeDash();
}

function _cmDashRow(id, label, hidden) {
  return '<div class="cm-row">'
    + '<label class="cm-show"><input type="checkbox" ' + (hidden ? '' : 'checked')
    + ' onchange="toggleDashHidden(\'' + id + '\')"> Show</label>'
    + '<span class="cm-label">' + (typeof escHtml === 'function' ? escHtml(label) : label) + '</span>'
    + '</div>';
}

function openCustomizeDash() {
  initDashChrome();
  var modal = document.getElementById('modal-customize-dash');
  var body = document.getElementById('cd-body');
  var page = document.getElementById('page-dash');
  if (!modal || !body || !page) return;
  var hidden = _effPrefs().dashHidden || [];
  body.innerHTML = '';
  var strip = document.getElementById('dash-stat-strip');
  var statsHtml = '';
  if (strip) strip.querySelectorAll('[data-dash]').forEach(function (el) {
    var id = el.getAttribute('data-dash');
    statsHtml += _cmDashRow(id, el.getAttribute('data-dash-label') || id, hidden.indexOf(id) >= 0);
  });
  if (statsHtml) body.innerHTML += '<div class="cm-group">Stat tiles</div>' + statsHtml;
  var panelsHtml = '';
  page.querySelectorAll('.dash-main-grid [data-dash]').forEach(function (el) {
    var id = el.getAttribute('data-dash');
    panelsHtml += _cmDashRow(id, el.getAttribute('data-dash-label') || id, hidden.indexOf(id) >= 0);
  });
  if (panelsHtml) body.innerHTML += '<div class="cm-group">Cards</div>' + panelsHtml;
  var sd = document.getElementById('cd-save-default');
  if (sd) sd.style.display = (_currentUser && _currentUser.role === 'owner') ? '' : 'none';
  var rb = document.getElementById('cd-reset-btn');
  if (rb) rb.textContent = _companyDefaultIsSet() ? '↺ Reset to company default' : '↺ Reset to default';
  modal.style.display = 'flex';
}

function closeCustomizeDash() {
  var modal = document.getElementById('modal-customize-dash');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// DASHBOARD DRAG + SNAP-RESIZE GRID  (Gridstack, progressive enhancement)
// The 6 always-on panels become a draggable/resizable grid: drag a card's ⠿ handle
// to move it, drag its left/right edge to widen and its bottom edge/corners to stretch
// it taller (snaps to the grid). Untouched cards snug to their content; a card you resize
// keeps that size (shrink past the content and it scrolls inside). Reset restores snug.
// Layout persists per-user (prefs.dashLayout) + company default. If the grid
// engine isn't available the dashboard falls back to its normal stacked layout and the
// show/hide still works — so it can never break.
// ============================================================
var _dashGrid = null;
var _dashGridInit = false;
var _dashGridPending = false; // set when a build was requested while the page was hidden (0 width)
var _dashApplyingLayout = false; // true during a programmatic (build/snug) pass so it isn't persisted
var _dashPanelEls = null;

// GridStack must never init/rebuild while its container has no width (dash page hidden).
// At 0 width its responsive-column engine caches a broken 1-column layout that then
// renders right-shifted when the page becomes visible. Returns true only if buildable now.
function _dashHostVisible() {
  var page = document.getElementById('page-dash'); if (!page) return false;
  var host = page.querySelector('.dash-main-grid'); if (!host) return false;
  if (host.offsetParent === null) return false;            // self/ancestor display:none
  var w = host.getBoundingClientRect().width;
  return w >= 50;                                          // real, laid-out width
}

function _captureDashPanels() {
  if (_dashPanelEls) return _dashPanelEls;
  var page = document.getElementById('page-dash'); if (!page) return null;
  initDashChrome();
  _dashPanelEls = {};
  page.querySelectorAll('.dash-main-grid .dash-card[data-dash]').forEach(function (c) { _dashPanelEls[c.getAttribute('data-dash')] = c; });
  return _dashPanelEls;
}

// Two-column default (12-col grid). y seeds order; float:false compacts upward.
function _dashDefaultLayout() {
  return {
    'card-field-activity':   { x: 0, y: 0, w: 6 },
    'card-quote-pipeline':   { x: 6, y: 0, w: 6 },
    'card-active-jobs':      { x: 0, y: 2, w: 6 },
    'card-project-progress': { x: 6, y: 2, w: 6 },
    'card-tools':            { x: 0, y: 4, w: 6 },
    'card-team-journal':     { x: 6, y: 4, w: 6 }
  };
}

function _addDashDragHandle(card) {
  if (!card) return;
  var head = card.querySelector('.dash-card-head');
  if (head && !head.querySelector('.dash-drag-handle')) {
    var g = document.createElement('span');
    g.className = 'dash-drag-handle'; g.title = 'Drag to move'; g.textContent = '⠿';
    head.insertBefore(g, head.firstChild);
  }
}

// (Re)build the dashboard grid from the current hidden set + saved layout.
function buildDashGrid() {
  if (typeof GridStack === 'undefined') return false;
  var page = document.getElementById('page-dash'); if (!page) return false;
  var host = page.querySelector('.dash-main-grid'); if (!host) return false;
  // Defer building until the page is actually visible with a real width — building at
  // 0 width poisons GridStack's column layout (the right-shift bug). Leave any existing
  // good grid untouched; applyDashPrefs rebuilds when we next land on the dash page.
  if (!_dashHostVisible()) { _dashGridPending = true; return false; }
  var panels = _captureDashPanels(); if (!panels) return false;

  if (_dashGrid) { try { _dashGrid.off('change'); _dashGrid.destroy(false); } catch (e) {} _dashGrid = null; }

  var eff = _effPrefs();
  var hidden = eff.dashHidden || [];
  var layById = {}; (eff.dashLayout || []).forEach(function (l) { if (l && l.id) layById[l.id] = l; });
  var defaults = _dashDefaultLayout();

  var alerts = document.createElement('div'); alerts.id = 'dash-alerts';
  ['dash-absence-card', 'dash-followup-card'].forEach(function (cid) { var c = document.getElementById(cid); if (c) alerts.appendChild(c); });
  var grid = document.createElement('div'); grid.className = 'grid-stack'; grid.id = 'dash-grid';
  var parked = document.createElement('div'); parked.id = 'dash-parked'; parked.style.display = 'none';

  // Place panels in saved/default order so packing is deterministic.
  var ids = Object.keys(panels).sort(function (a, b) {
    var la = layById[a] || defaults[a] || { x: 0, y: 999 }, lb = layById[b] || defaults[b] || { x: 0, y: 999 };
    return ((la.y || 0) * 100 + (la.x || 0)) - ((lb.y || 0) * 100 + (lb.x || 0));
  });
  ids.forEach(function (id) {
    var card = panels[id];
    if (hidden.indexOf(id) >= 0) { parked.appendChild(card); return; }
    var pos = layById[id] || defaults[id] || { x: 0, w: 6 };
    var item = document.createElement('div'); item.className = 'grid-stack-item'; item.setAttribute('gs-id', id);
    if (pos.x != null) item.setAttribute('gs-x', pos.x);
    if (pos.y != null) item.setAttribute('gs-y', pos.y);
    item.setAttribute('gs-w', pos.w || 6);
    if (pos.h) item.setAttribute('gs-h', pos.h);
    var content = document.createElement('div'); content.className = 'grid-stack-item-content';
    _addDashDragHandle(card);
    content.appendChild(card);
    item.appendChild(content);
    grid.appendChild(item);
  });

  host.innerHTML = '';
  host.classList.add('dash-gridded'); // neutralize the old 2-col grid so #dash-grid spans full width
  host.appendChild(alerts);
  host.appendChild(grid);
  host.appendChild(parked);

  try {
    // No global sizeToContent: that mode auto-forces height and snaps back any manual
    // vertical resize. Instead we snug each card to its content ONCE below, which leaves
    // the user free to drag a card's bottom edge (s / se / sw handles) to stretch it.
    _dashGrid = GridStack.init({
      column: 12, margin: 10, cellHeight: 8, float: false, animate: true,
      handle: '.dash-drag-handle', resizable: { handles: 'e, w, s, se, sw' },
      columnOpts: { breakpoints: [{ w: 720, c: 1 }] }
    }, grid);
    // Snug default heights: a card the user hasn't manually sized fits its content on each
    // build (so it adapts to data); a card with a saved height keeps it. Guarded so this
    // programmatic pass is NOT persisted as a custom layout — only the user's own drags save.
    _dashApplyingLayout = true;
    try {
      if (_dashGrid.batchUpdate) _dashGrid.batchUpdate();
      if (typeof _dashGrid.resizeToContent === 'function') {
        Array.prototype.forEach.call(grid.querySelectorAll('.grid-stack-item'), function (itemEl) {
          var gid = itemEl.getAttribute('gs-id');
          var saved = layById[gid];
          if (saved && saved.h) return;              // user-set height → respect it
          try { _dashGrid.resizeToContent(itemEl); } catch (e) {}
        });
      }
      // Re-assert the column count against the settled full width (belt-and-suspenders vs
      // the right-shift bug, in case init measured a transient width during a rebuild).
      if (typeof _dashGrid.checkDynamicColumn === 'function') _dashGrid.checkDynamicColumn();
      if (_dashGrid.commit) _dashGrid.commit();
    } catch (e) {}
    // Now that heights are measured, switch cards to fill their slots so a stretched panel
    // grows its content (more employees in Field Activity, etc.) instead of blank space.
    // (Applied AFTER the snug measure — the fill flexbox would otherwise break the measure.)
    grid.classList.add('dash-fill');
    _dashApplyingLayout = false;
    _dashGrid.on('change', _saveDashLayout);
  } catch (e) { _dashGrid = null; console.warn('[dashGrid] init failed:', e && e.message); return false; }
  _dashGridPending = false;
  return true;
}

function initDashGrid() {
  if (_dashGridInit) return;
  if (typeof GridStack === 'undefined') return;
  var page = document.getElementById('page-dash'); if (!page) return;
  if (!page.querySelector('.dash-main-grid')) return;
  // Only mark initialized once a real build succeeds; a deferred (hidden-page) build
  // leaves _dashGridInit false so the next visit retries cleanly.
  if (buildDashGrid()) _dashGridInit = true;
}

function _saveDashLayout() {
  if (!_dashGrid) return;
  if (_dashApplyingLayout) return; // programmatic build/snug pass — not a user change
  try {
    var nodes = (_dashGrid.engine && _dashGrid.engine.nodes) || [];
    var lay = nodes.map(function (n) {
      var id = (n.el && n.el.getAttribute) ? n.el.getAttribute('gs-id') : n.id;
      return { id: id, x: n.x, y: n.y, w: n.w, h: n.h };
    }).filter(function (l) { return l.id; });
    _ensurePersonal();
    _uiPrefs.dashLayout = lay;
    saveUiPrefs();
  } catch (e) { console.warn('[dashLayout] save failed:', e && e.message); }
}

// ============================================================
// DASHBOARD STAT-STRIP DRAG-TO-REORDER  (SortableJS, progressive enhancement)
// The 9 KPI tiles are uniform and click-to-navigate, so each gets a small ⠿ grip and
// only the grip drags (the tile body still navigates on tap). Order persists per-user
// (prefs.statOrder) + company default. If SortableJS is absent the tiles are simply
// fixed — nothing breaks.
// ============================================================
var _statSortable = null;

// Add the drag grip to a stat tile (idempotent). Clicking the grip must not navigate.
function _addTileGrip(tile) {
  if (!tile || tile.querySelector('.dash-tile-grip')) return;
  var g = document.createElement('span');
  g.className = 'dash-tile-grip'; g.title = 'Drag to reorder'; g.textContent = '⠿';
  g.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); });
  tile.insertBefore(g, tile.firstChild);
}

// Reorder the stat tiles in the DOM to match saved statOrder. With no saved order
// (e.g. after Reset) restore the built-in order — the tiles were tagged stat-0..stat-N
// by their original position, so ascending numeric IS the default layout.
function _applyStatOrder() {
  var strip = document.getElementById('dash-stat-strip'); if (!strip) return;
  var tiles = [].slice.call(strip.querySelectorAll('.dash-stat-tile[data-dash]'));
  if (!tiles.length) return;
  var order = (_effPrefs().statOrder) || [];
  if (!order.length) {
    // default: sort by the numeric suffix of the data-dash id (stat-0, stat-1, ...)
    tiles.sort(function (a, b) {
      var na = parseInt((a.getAttribute('data-dash') || '').replace(/\D+/g, ''), 10) || 0;
      var nb = parseInt((b.getAttribute('data-dash') || '').replace(/\D+/g, ''), 10) || 0;
      return na - nb;
    });
    tiles.forEach(function (t) { strip.appendChild(t); });
    return;
  }
  var byId = {};
  tiles.forEach(function (t) { byId[t.getAttribute('data-dash')] = t; });
  order.forEach(function (id) { var t = byId[id]; if (t) strip.appendChild(t); }); // saved order first
  // any tile not in the saved order (new tile) stays after, in its current position
}

// Persist the current DOM order of the stat tiles.
function _saveStatOrder() {
  var strip = document.getElementById('dash-stat-strip'); if (!strip) return;
  try {
    var order = [].map.call(strip.querySelectorAll('.dash-stat-tile[data-dash]'),
      function (t) { return t.getAttribute('data-dash'); });
    _ensurePersonal();
    _uiPrefs.statOrder = order;
    saveUiPrefs();
  } catch (e) { console.warn('[statOrder] save failed:', e && e.message); }
}

// Attach grips + the Sortable to the stat strip (idempotent — safe to call every visit).
function _wireStatSortable() {
  var strip = document.getElementById('dash-stat-strip'); if (!strip) return;
  strip.querySelectorAll('.dash-stat-tile[data-dash]').forEach(_addTileGrip);
  if (typeof Sortable === 'undefined') return;      // progressive enhancement
  if (_statSortable && _statSortable.el === strip) return; // already wired
  try {
    _statSortable = Sortable.create(strip, {
      handle: '.dash-tile-grip', draggable: '.dash-stat-tile', animation: 150,
      forceFallback: true, onEnd: _saveStatOrder
    });
  } catch (e) { _statSortable = null; console.warn('[statSortable] init failed:', e && e.message); }
}

// ---- LINE ITEMS ----
let lineItems = [];
let liSeq = Date.now(); // Start from timestamp so IDs are always unique across sessions

function nextLiId() {
  return ++liSeq; // Still sequential but starting from a large unique base
}

// ---- V6: PER DIEM / TRAVEL STATE ----
let perDiemData = { men:0, days:0, rate:75, rooms:0, nights:0, lodgingRate:120, trips:0, travelRate:0, travelDesc:'' };

// =============================================
// V6: SECTION TOGGLE FUNCTIONS
// =============================================
function toggleEquipment() {
  const cb    = document.getElementById('equipment-enabled');
  const body  = document.getElementById('equipment-body');
  const label = document.getElementById('equipment-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  // If turning off, clear equipment rows and recalc
  if (!on) {
    equipmentRows = [];
    renderEquipRows();
    calcTotals();
  }
}

function togglePerDiem() {
  const cb    = document.getElementById('perdiem-enabled');
  const body  = document.getElementById('perdiem-body');
  const label = document.getElementById('perdiem-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  if (!on) { clearPerDiem(false); }
}

// ---- PROPOSAL SECTION TOGGLES ----
var PROP_SECTIONS = ['exec-summary','assumptions','exclusions','terms'];

function toggleProposalSection(section) {
  var idMap = {
    'exec-summary': 'prop-show-exec',
    'assumptions':  'prop-show-assumptions',
    'exclusions':   'prop-show-exclusions',
    'terms':        'prop-show-terms'
  };
  var cbId = idMap[section];
  var cb   = document.getElementById(cbId);
  var lbl  = document.getElementById(cbId + '-label');
  if (!cb) return;
  var on = cb.checked;
  if (lbl) { lbl.textContent = on ? 'YES' : 'NO'; lbl.className = 'toggle-value-label' + (on ? ' on' : ''); }
}

function getProposalSections() {
  return {
    showExecSummary:  (document.getElementById('prop-show-exec')||{checked:true}).checked,
    showAssumptions:  (document.getElementById('prop-show-assumptions')||{checked:true}).checked,
    showExclusions:   (document.getElementById('prop-show-exclusions')||{checked:true}).checked,
    showTerms:        (document.getElementById('prop-show-terms')||{checked:true}).checked
  };
}

function resetProposalSectionToggles() {
  PROP_SECTIONS.forEach(function(s) {
    var idMap = {'exec-summary':'prop-show-exec','assumptions':'prop-show-assumptions','exclusions':'prop-show-exclusions','terms':'prop-show-terms'};
    var cb  = document.getElementById(idMap[s]);
    var lbl = document.getElementById(idMap[s] + '-label');
    if (cb)  cb.checked = true;
    if (lbl) { lbl.textContent = 'YES'; lbl.className = 'toggle-value-label on'; }
  });
}

function restoreProposalSectionToggles(sections) {
  if (!sections) return;
  var map = {
    showExecSummary: 'prop-show-exec',
    showAssumptions: 'prop-show-assumptions',
    showExclusions:  'prop-show-exclusions',
    showTerms:       'prop-show-terms'
  };
  Object.keys(map).forEach(function(key) {
    var on  = sections[key] !== false;
    var cb  = document.getElementById(map[key]);
    var lbl = document.getElementById(map[key] + '-label');
    if (cb)  cb.checked = on;
    if (lbl) { lbl.textContent = on ? 'YES' : 'NO'; lbl.className = 'toggle-value-label' + (on ? ' on' : ''); }
  });
}

function toggleLumpSum() {
  const cb    = document.getElementById('lumpsum-toggle');
  const body  = document.getElementById('lumpsum-body');
  const label = document.getElementById('lumpsum-toggle-label');
  if (!cb || !body) return;
  const on = cb.checked;
  body.classList.toggle('expanded', on);
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  updateLumpSumPreview();
}

function toggleLaborBanner() {
  const cb    = document.getElementById('labor-banner-toggle');
  const label = document.getElementById('labor-banner-label');
  if (!cb) return;
  const on = cb.checked;
  if (label) { label.textContent = on ? 'YES' : 'NO'; label.className = 'toggle-value-label' + (on ? ' on' : ''); }
  calcTotals();
}

function getLaborBannerOn() {
  const cb = document.getElementById('labor-banner-toggle');
  return cb ? cb.checked : true; // default ON
}

// =============================================
// V6: PER DIEM / TRAVEL FUNCTIONS
// =============================================
function getPerDiemMarkup() {
  return (parseFloat(DB.settings.perDiemMarkup) || 0) / 100;
}

function calcPerDiem() {
  function gn(id) { return parseFloat(document.getElementById(id) && document.getElementById(id).value) || 0; }
  function gs(id) { return (document.getElementById(id)||{}).value || ''; }

  const men         = gn('pd-men');
  const days        = gn('pd-days');
  const rate        = gn('pd-rate');
  const rooms       = gn('pd-rooms');
  const nights      = gn('pd-nights');
  const lodgingRate = gn('pd-lodging-rate');
  const trips       = gn('pd-trips');
  const travelRate  = gn('pd-travel-rate');

  const pdCost      = men * days * rate;
  const lodgingCost = rooms * nights * lodgingRate;
  const travelCost  = trips * travelRate;
  const subtotal    = pdCost + lodgingCost + travelCost;
  const markup      = getPerDiemMarkup();
  const afterMarkup = subtotal * (1 + markup);

  // Update display fields
  function setVal(id, val) { const el=document.getElementById(id); if(el) el.value = val > 0 ? fmt(val) : ''; }
  setVal('pd-cost-display', pdCost);
  setVal('pd-lodging-display', lodgingCost);
  setVal('pd-travel-display', travelCost);

  const sub = document.getElementById('pd-subtotal');
  if (sub) sub.textContent = fmt(subtotal);

  const markupNote = document.getElementById('pd-markup-note');
  const afterEl    = document.getElementById('pd-total-after-markup');
  if (markup > 0) {
    if (markupNote) markupNote.textContent = (markup * 100).toFixed(0) + '% markup applied per Settings';
    if (afterEl)   afterEl.textContent = 'After markup: ' + fmt(afterMarkup);
  } else {
    if (markupNote) markupNote.textContent = 'No markup (0%) — pass-through at cost';
    if (afterEl)    afterEl.textContent = '';
  }

  // Persist to state
  perDiemData = { men, days, rate, rooms, nights, lodgingRate, trips, travelRate, travelDesc: gs('pd-travel-desc'), subtotal, afterMarkup };

  return { subtotal, afterMarkup, pdCost, lodgingCost, travelCost };
}

function getPerDiemCost() {
  // Returns the marked-up total to include in quote pricing
  return perDiemData.afterMarkup || 0;
}

function clearPerDiem(skipCalc) {
  ['pd-men','pd-days','pd-rooms','pd-nights','pd-trips'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=0; });
  const rateEl = document.getElementById('pd-rate'); if(rateEl) rateEl.value = 75;
  const lodgEl = document.getElementById('pd-lodging-rate'); if(lodgEl) lodgEl.value = 120;
  const travEl = document.getElementById('pd-travel-rate'); if(travEl) travEl.value = 0;
  const descEl = document.getElementById('pd-travel-desc'); if(descEl) descEl.value = '';
  perDiemData = { men:0, days:0, rate:75, rooms:0, nights:0, lodgingRate:120, trips:0, travelRate:0, travelDesc:'', subtotal:0, afterMarkup:0 };
  if (!skipCalc) calcPerDiem();
}

function loadPerDiemData(d) {
  if (!d) return;
  function sv(id,v){ const el=document.getElementById(id); if(el) el.value = v||0; }
  sv('pd-men', d.men); sv('pd-days', d.days); sv('pd-rate', d.rate||75);
  sv('pd-rooms', d.rooms); sv('pd-nights', d.nights); sv('pd-lodging-rate', d.lodgingRate||120);
  sv('pd-trips', d.trips); sv('pd-travel-rate', d.travelRate||0);
  const descEl = document.getElementById('pd-travel-desc'); if(descEl) descEl.value = d.travelDesc||'';
  calcPerDiem();
}

// =============================================
// V6: LUMP SUM FUNCTIONS
// =============================================
function toggleLumpSumItems() {
  var cb  = document.getElementById('lumpsum-show-items');
  var lbl = document.getElementById('lumpsum-show-items-label');
  if (!cb || !lbl) return;
  var on = cb.checked;
  lbl.textContent = on ? 'YES' : 'NO';
  lbl.className = 'toggle-value-label' + (on ? ' on' : '');
}

function getLumpSumState() {
  const toggle    = document.getElementById('lumpsum-toggle');
  const label     = document.getElementById('lumpsum-label');
  const showItems = document.getElementById('lumpsum-show-items');
  return {
    enabled:   !!(toggle && toggle.checked),
    label:     label ? label.value.trim() || 'Complete Low Voltage Installation' : 'Complete Low Voltage Installation',
    showItems: showItems ? showItems.checked : true
  };
}

function updateLumpSumPreview() {
  const state = getLumpSumState();
  const text  = document.getElementById('lumpsum-preview-text');
  if (!text) return;
  const totalEl = document.getElementById('ps-total');
  const total   = totalEl ? totalEl.textContent : '$0.00';
  text.textContent = state.label + ' — ' + total;
}

// =============================================
// V6: ALSO INCLUDE PER DIEM IN QUOTE SAVE
// =============================================

// ---- V5: EQUIPMENT RENTALS ----
let equipmentRows = [];
let eqSeq = 1;
function newLI(desc, cat, qty, unit, mc, lh) {
  return { _id: nextLiId(), desc:desc||'', cat:cat||'General', qty:qty||1, unit:unit||'ea', mc:parseFloat(mc)||0, lh:parseFloat(lh)||0 };
}
function addRow(item) {
  lineItems.push(item || newLI('','',1,'ea',0,0));
  renderLI();
  calcTotals();
  clearQQDraft();
  setQQDirty(false, 'Fresh quote started');
  updateQQStage3UI();
}
function delRow(id) {
  lineItems = lineItems.filter(function(x){return x._id != id});
  renderLI();
  calcTotals();
}
function renderLI() {
  const body = document.getElementById('li-body');
  if (!body) return;
  if (lineItems.length === 0) {
    body.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#90a4ae;padding:20px">No items yet. Click &ldquo;+ Add Row&rdquo; or select a template above.</td></tr>';
    return;
  }
  // Determine pricing mode and rate ONCE per render
  const _isMarkupMode = currentPricingMode() === 'markup';
  const _rate = getMarginDecimal();
  // In markup mode, compute equivalent margin %: margin = markup / (1 + markup)
  // 25% markup ≈ 20% margin; 35% markup ≈ 25.9% margin; 100% markup = 50% margin
  const _equivMargin = _isMarkupMode && _rate > 0 ? (_rate / (1 + _rate)) * 100 : null;
  const _equivMarginLabel = _equivMargin != null
    ? '<span class="li-equiv-margin">≈ ' + (Math.round(_equivMargin * 10) / 10).toFixed(1) + '% margin</span>'
    : '';
  let html = '';
  lineItems.forEach(function(item, i) {
    let unitMS;
    if (!item.mc) {
      unitMS = item.mc;
    } else if (_isMarkupMode) {
      // Markup: sell = cost × (1 + markup rate)
      unitMS = item.mc * (1 + Math.max(_rate, 0));
    } else {
      // Margin: sell = cost / (1 - margin rate)
      unitMS = (_rate < 1) ? (item.mc / (1 - _rate)) : item.mc;
    }
    const totalMS = unitMS * item.qty;
    html += '<tr>';
    html += '<td style="color:#90a4ae;font-size:11px">' + (i+1) + '</td>';
    html += '<td><input data-li="'+item._id+'" data-field="desc" value="'+escHtml(item.desc)+'" style="min-width:140px" placeholder="Description"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="cat" value="'+escHtml(item.cat)+'" style="width:90px" placeholder="Category"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="qty" type="number" value="'+item.qty+'" min="0" style="width:60px"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="unit" value="'+escHtml(item.unit)+'" style="width:50px" placeholder="ea"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="mc" type="number" value="'+item.mc+'" min="0" step="0.01" style="width:80px"></td>';
    html += '<td><input data-li="'+item._id+'" data-field="lh" type="number" value="'+item.lh+'" min="0" step="0.25" style="width:65px"></td>';
    html += '<td style="color:#546e7a;font-size:12px">'+fmt(unitMS)+(i===0?_equivMarginLabel:'')+'</td>';
    html += '<td style="color:#1565c0;font-weight:700;font-size:12px">'+fmt(totalMS)+'</td>';
    html += '<td style="color:#2e7d32;font-size:12px">'+fmt(item.lh*item.qty*getLaborRate())+'</td>';
    html += '<td><button class="btn btn-danger btn-sm" data-action="delRow" data-id="'+item._id+'">×</button></td>';
    html += '</tr>';
  });
  body.innerHTML = html;
}
function getLaborRate() {
  const el = document.getElementById('qq-lr');
  return el ? parseFloat(el.value)||100 : 100;
}
function getMarginDecimal() {
  const el = document.getElementById('qq-mk');
  if (!el) return 0;
  // A BLANK/cleared field means ZERO (no margin/markup). Previously an empty field
  // was NaN and silently fell back to 35%, so clearing the % (instead of typing 0)
  // priced the quote at 35% and every recalc — including one a dropdown change
  // triggered — re-applied it. Blank now = 0; only a real number is used as-is.
  const raw = String(el.value == null ? '' : el.value).trim();
  const _mv = parseFloat(raw);
  const v = (raw === '' || isNaN(_mv)) ? 0 : _mv;
  // In markup mode, allow rates up to 500% (5.0). In margin mode, cap at 99% (0.99).
  if (currentPricingMode() === 'markup') {
    return Math.min(Math.max(v,0),500) / 100;
  }
  return Math.min(Math.max(v,0),99) / 100;
}

// ---- NO MARGIN (price at cost) — permission quote.bypass ----
// Distinct from the "Lump Sum" customer-presentation feature. When on, the quote
// prices at cost (no margin/markup) and the margin-floor warning/approval is
// suppressed for that quote — an intentional, recorded owner/manager decision.
function isNoMarginOn() {
  var cb = document.getElementById('qq-nomargin');
  return !!(cb && cb.checked);
}
function _currentUserName() {
  var u = (typeof _currentUser !== 'undefined') ? _currentUser : null;
  return (u && (u.full_name || u.name || u.email)) || 'owner';
}
// Apply only the VISUAL state of the No-Margin switch (grey/disable the margin
// field, show/hide the stamp) — no recalc, no dirty flag. Safe to call on load/reset.
function applyNoMarginVisual() {
  var cb    = document.getElementById('qq-nomargin');
  var mk    = document.getElementById('qq-mk');
  var stamp = document.getElementById('qq-nomargin-stamp');
  var on = !!(cb && cb.checked);
  if (mk) {
    mk.disabled = on;
    mk.style.opacity = on ? '0.45' : '';
    if (on) { if (mk.value !== '') mk.setAttribute('data-prev', mk.value); mk.value = ''; mk.placeholder = '—'; }
    else { mk.placeholder = ''; if (mk.value === '' && mk.getAttribute('data-prev') != null) mk.value = mk.getAttribute('data-prev'); }
  }
  if (stamp) { stamp.style.display = on ? 'block' : 'none'; if (!on) stamp.textContent = ''; }
}
// User flipped the switch: apply visual, stamp with the current user, recalc, mark dirty.
function onNoMarginToggle() {
  applyNoMarginVisual();
  var stamp = document.getElementById('qq-nomargin-stamp');
  if (stamp && isNoMarginOn()) stamp.textContent = 'At cost — set by ' + _currentUserName();
  if (typeof calcTotals === 'function') calcTotals();
  if (typeof setQQDirty === 'function') setQQDirty(true, 'No-margin toggled');
}
// Show/enable the No-Margin row only for users allowed to bypass the margin floor
// (permission quote.bypass), and set its default from the company setting for a
// fresh quote. Called when a quote is opened/reset.
function applyNoMarginRowVisibility() {
  var row = document.getElementById('qq-nomargin-row');
  if (!row) return;
  var allowed = (typeof hasPermission !== 'function') || hasPermission('quote.bypass');
  row.style.display = allowed ? 'flex' : 'none';
}

// Current pricing mode for the active quote.
// Returns 'margin' (default) or 'markup'.
// Reads from the toggle's hidden state via the active button.
function currentPricingMode() {
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle) return 'margin';
  const active = toggle.querySelector('.pmt-btn.active');
  return active ? (active.getAttribute('data-pmt-mode') || 'margin') : 'margin';
}

// Set the pricing mode programmatically. Updates the toggle visual,
// updates labels/help text, recalculates totals, re-renders line items.
function setPricingMode(newMode, opts) {
  opts = opts || {};
  if (newMode !== 'margin' && newMode !== 'markup') newMode = 'margin';
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle) return;
  const oldMode = currentPricingMode();
  if (oldMode === newMode && !opts.force) return;

  // Capture old total before switching, for the banner
  let oldTotal = 0;
  if (!opts.silent && lineItems.length > 0) {
    try { const t = calcTotals(); oldTotal = t.totalSell || 0; } catch(e) {}
  }

  // Update toggle visual
  Array.prototype.forEach.call(toggle.querySelectorAll('.pmt-btn'), function(b){
    const isActive = b.getAttribute('data-pmt-mode') === newMode;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Update mode badge
  const badge = document.getElementById('pricing-mode-badge');
  if (badge) {
    badge.textContent = newMode === 'markup'
      ? '💰 Pricing Mode: T&M / Markup'
      : '💰 Pricing Mode: Margin-Based';
  }

  // Update label
  const label = document.getElementById('qq-mk-label');
  if (label) {
    label.textContent = newMode === 'markup' ? 'Markup (%)' : 'Target Margin (%)';
  }

  // Update input constraints
  const mk = document.getElementById('qq-mk');
  if (mk) {
    if (newMode === 'markup') { mk.min='0'; mk.max='500'; mk.step='1'; }
    else { mk.min='0'; mk.max='99'; mk.step='1'; }
  }

  // Update help text
  const help = document.getElementById('pmt-help-text');
  if (help) {
    help.textContent = newMode === 'markup'
      ? 'T&M / Markup mode: Material × (1 + markup %). Labor, equipment, and per diem PASS THROUGH at cost. True time-and-materials behavior — best for service calls and small jobs.'
      : 'Margin-Based mode: Sell = Cost ÷ (1 - margin %). Targets a profit margin as a percentage of the sell price. Best for project work.';
  }

  // Update the small note at the bottom of the pricing card
  const modeNote = document.getElementById('pricing-mode-note');
  if (modeNote) {
    modeNote.textContent = newMode === 'markup'
      ? 'Quote pricing driven by markup on top of cost'
      : 'Quote pricing driven by target margin, not markup';
  }

  // Re-render line items with new mode-aware math
  renderLI();
  // Recalculate totals
  let newTotal = 0;
  try { const t = calcTotals(); newTotal = t.totalSell || 0; } catch(e) {}

  // Show the switch banner if total changed meaningfully
  if (!opts.silent && oldTotal > 0 && Math.abs(newTotal - oldTotal) > 0.5) {
    showPmtSwitchBanner(oldMode, newMode, oldTotal, newTotal);
  }
}

function showPmtSwitchBanner(oldMode, newMode, oldTotal, newTotal) {
  const banner = document.getElementById('pmt-switch-banner');
  if (!banner) return;
  const fmtMoney = function(n){ return '$' + (Math.round((n||0)*100)/100).toFixed(2); };
  const oldLabel = oldMode === 'markup' ? 'T&M / Markup' : 'Margin-Based';
  const newLabel = newMode === 'markup' ? 'T&M / Markup' : 'Margin-Based';
  const diff = newTotal - oldTotal;
  const dirWord = diff > 0 ? 'up' : 'down';
  banner.innerHTML = ''
    + '<button class="pmt-close" type="button" aria-label="Dismiss">×</button>'
    + '⚠️ Switched from <strong>' + oldLabel + '</strong> to <strong>' + newLabel + '</strong>. '
    + 'Total Sell changed from <strong>' + fmtMoney(oldTotal) + '</strong> to <strong>' + fmtMoney(newTotal) + '</strong> '
    + '(' + dirWord + ' ' + fmtMoney(Math.abs(diff)) + '). Review pricing before sending.';
  banner.classList.add('show');
  const closeBtn = banner.querySelector('.pmt-close');
  if (closeBtn) closeBtn.onclick = function(){ banner.classList.remove('show'); };
}

// Wire up the toggle buttons (called once on DOM ready)
function initPricingModeToggle() {
  const toggle = document.getElementById('pmt-toggle');
  if (!toggle || toggle._pmtWired) return;
  Array.prototype.forEach.call(toggle.querySelectorAll('.pmt-btn'), function(b){
    b.addEventListener('click', function(ev){
      ev.preventDefault();
      const newMode = b.getAttribute('data-pmt-mode');
      setPricingMode(newMode);
    });
  });
  toggle._pmtWired = true;
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Convert rich-text/HTML (from the WO & quote editors) into clean plain text for
// list/summary previews. Strips tags, turns block breaks into spaces, decodes the
// common entities, and collapses whitespace. Use this — NOT escHtml — whenever a
// stored description/notes field is shown as a short text preview.
function stripHtmlToText(s) {
  if (!s) return '';
  return String(s)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, ' ')  // block ends -> space
    .replace(/<[^>]*>/g, '')                                       // drop remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}


// =============================================
// V5 PHASE 1: EQUIPMENT RENTAL FUNCTIONS
// =============================================
function addEquipRow() {
  equipmentRows.push({ _id: eqSeq++, type: EQUIPMENT_TYPES[0].id, days: 1, dailyRate: EQUIPMENT_TYPES[0].daily, notes: '' });
  renderEquipRows();
  calcTotals();
}
function delEquipRow(id) {
  equipmentRows = equipmentRows.filter(function(r){ return r._id != id; });
  renderEquipRows();
  calcTotals();
}
function renderEquipRows() {
  const cont = document.getElementById('eq-rows');
  if (!cont) return;
  if (equipmentRows.length === 0) {
    cont.innerHTML = '<div style="font-size:12px;color:#90a4ae;padding:4px 0">No equipment added. Click below to add lifts or rentals.</div>';
    updateEquipTotal();
    return;
  }
  cont.innerHTML = equipmentRows.map(function(row) {
    const typeOpts = EQUIPMENT_TYPES.map(function(t){
      return '<option value="'+t.id+'"'+(row.type===t.id?' selected':'')+'>'+escHtml(t.name)+'</option>';
    }).join('');
    return '<div class="eq-row" data-eqid="'+row._id+'" style="margin-bottom:8px">' +
      '<div><label>Equipment Type</label><select data-eqfield="type" data-eqid="'+row._id+'">'+typeOpts+'</select></div>' +
      '<div><label>Days</label><input type="number" min="1" value="'+row.days+'" data-eqfield="days" data-eqid="'+row._id+'" style="width:70px"></div>' +
      '<div><label>Daily Rate ($)</label><input type="number" min="0" value="'+row.dailyRate+'" data-eqfield="dailyRate" data-eqid="'+row._id+'" style="width:90px"></div>' +
      '<div><button class="btn btn-danger btn-sm" data-action="delEquipRow" data-id="'+row._id+'" style="margin-top:16px">×</button></div>' +
    '</div>';
  }).join('');
  updateEquipTotal();
}
function updateEquipTotal() {
  let total = equipmentRows.reduce(function(s, r){ return s + (parseFloat(r.days)||0) * (parseFloat(r.dailyRate)||0); }, 0);
  const el = document.getElementById('eq-total');
  if (el) el.textContent = fmt(total);
  return total;
}
function getEquipmentCost() {
  return equipmentRows.reduce(function(s, r){ return s + (parseFloat(r.days)||0) * (parseFloat(r.dailyRate)||0); }, 0);
}
function checkEquipWarn(equipCost, totalSell) {
  const warn = document.getElementById('eq-warn');
  if (!warn) return;
  if (totalSell > 0 && equipCost / totalSell > 0.15) {
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}

// =============================================
// V5 PHASE 1: PERMIT COMPLIANCE FUNCTIONS
// =============================================
function updatePermitStatus() {
  const lv    = document.getElementById('permit-lv');
  const elec  = document.getElementById('permit-elec');
  const other = document.getElementById('permit-other');
  const none  = document.getElementById('permit-none');
  const badge = document.getElementById('permit-status-badge');
  const otherDesc = document.getElementById('permit-other-desc');
  if (!badge) return;

  // "No Permit Required" is mutually exclusive with specific permits
  if (none && none.checked) {
    if (lv)    lv.checked = false;
    if (elec)  elec.checked = false;
    if (other) other.checked = false;
    if (otherDesc) otherDesc.style.display = 'none';
    badge.className = 'permit-status permit-ok';
    badge.textContent = '✓ No permit required — confirmed for this job';
    return;
  }

  // Checking a specific permit unchecks "none"
  const anySpecific = (lv && lv.checked) || (elec && elec.checked) || (other && other.checked);
  if (anySpecific && none) none.checked = false;

  if (other && otherDesc) {
    otherDesc.style.display = other.checked ? 'block' : 'none';
  }

  if (anySpecific) {
    const parts = [];
    if (lv && lv.checked)    parts.push('Low Voltage');
    if (elec && elec.checked) parts.push('Electrical');
    if (other && other.checked) parts.push('Other');
    badge.className = 'permit-status permit-ok';
    badge.textContent = '✓ Permits identified: ' + parts.join(', ');
  } else {
    badge.className = 'permit-status permit-pending';
    badge.textContent = '⚠️ No permits selected — verify requirements before sending quote';
  }
}
function getPermitData() {
  return {
    lv:       !!(document.getElementById('permit-lv')   && document.getElementById('permit-lv').checked),
    elec:     !!(document.getElementById('permit-elec') && document.getElementById('permit-elec').checked),
    other:    !!(document.getElementById('permit-other')&& document.getElementById('permit-other').checked),
    none:     !!(document.getElementById('permit-none') && document.getElementById('permit-none').checked),
    otherText: (document.getElementById('permit-other-text')||{}).value || '',
    coord:     (document.getElementById('permit-coord')||{}).value || ''
  };
}
function loadPermitData(p) {
  if (!p) return;
  function sc(id, v) { const el = document.getElementById(id); if(el) el.checked = !!v; }
  function sv(id, v) { const el = document.getElementById(id); if(el) el.value = v||''; }
  sc('permit-lv', p.lv); sc('permit-elec', p.elec); sc('permit-other', p.other); sc('permit-none', p.none);
  sv('permit-other-text', p.otherText); sv('permit-coord', p.coord);
  updatePermitStatus();
}

// =============================================
// MARGIN FLOOR FUNCTIONS — dynamic, editable
// =============================================

// Default floors as array — used when DB.marginFloors is empty or legacy object
var MF_DEFAULT_LIST = [
  { jobType:'New Construction', floor:35, notes:'Standard residential/commercial builds' },
  { jobType:'Remodel',          floor:40, notes:'Higher floor — unknown conditions add risk' },
  { jobType:'Service Call',     floor:42, notes:'High margin — small ticket, high overhead' },
  { jobType:'Upgrade',          floor:38, notes:'Existing system additions' },
  { jobType:'Addition',         floor:36, notes:'Project expansions' }
];

function _getMFList() {
  // Support both old object format and new array format
  var mf = DB.marginFloors;
  if (!mf) return MF_DEFAULT_LIST.map(function(x){ return Object.assign({},x); });
  if (Array.isArray(mf)) return mf;
  // Migrate old object format to array
  var arr = MF_DEFAULT_LIST.map(function(def) {
    return { jobType:def.jobType, floor: mf[def.jobType]!==undefined ? parseFloat(mf[def.jobType]) : def.floor, notes:def.notes };
  });
  // Add any extra keys not in defaults
  Object.keys(mf).forEach(function(k) {
    if (!arr.find(function(x){ return x.jobType===k; })) {
      var _f=parseFloat(mf[k]); arr.push({ jobType:k, floor:!isNaN(_f)?_f:35, notes:'' });
    }
  });
  return arr;
}

function getMarginFloor(jobType) {
  var list = _getMFList();
  var entry = list.find(function(x){ return x.jobType===jobType; });
  if (entry) return parseFloat(entry.floor);
  return MF_DEFAULTS[jobType] || 35;
}

function checkMarginFloor(achievedMarginPct, jobType) {
  const floor = getMarginFloor(jobType);
  const badge = document.getElementById('mf-floor-badge');
  const approval = document.getElementById('mf-approval');
  if (!badge) return false;
  badge.style.display = 'inline-block';
  const belowFloor = achievedMarginPct < floor;
  if (belowFloor) {
    badge.className = 'margin-floor-badge mf-warn';
    badge.textContent = '⚠️ Below Floor: ' + pct(achievedMarginPct) + ' < ' + pct(floor) + ' (' + (jobType||'Job') + ')';
    if (approval) approval.classList.add('visible');
  } else {
    badge.className = 'margin-floor-badge mf-ok';
    badge.textContent = '✓ Margin Floor OK: ' + pct(achievedMarginPct) + ' ≥ ' + pct(floor) + ' (' + (jobType||'Job') + ')';
    if (approval) approval.classList.remove('visible');
  }
  return belowFloor;
}

function renderMarginFloorsEditor() {
  var el = document.getElementById('ms-margin-floors-container');
  if (!el) return;
  var list = _getMFList();

  var html =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'+
      '<div>'+
        '<div class="card-title" style="margin:0">🎯 Margin Floor Settings</div>'+
        '<p style="font-size:12px;color:#546e7a;margin:4px 0 0">Minimum acceptable margin per job type. Quotes below floor are flagged and require approval.</p>'+
      '</div>'+
      '<button class="btn btn-primary btn-sm" onclick="addMarginFloorRow()">+ Add Job Type</button>'+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Job Type</th>'+
      '<th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase;width:130px">Min Margin %</th>'+
      '<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Notes / Description</th>'+
      '<th style="width:40px"></th>'+
    '</tr></thead><tbody id="mf-tbody">';

  list.forEach(function(row, i) {
    html +=
      '<tr style="border-bottom:1px solid #f0f4f8" data-mf-idx="'+i+'">'+
        '<td style="padding:6px 8px">'+
          '<input value="'+escHtml(row.jobType||'')+'" onchange="mfUpdateRow('+i+',\'jobType\',this.value)" '+
          'style="width:100%;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;font-weight:600;box-sizing:border-box">'+
        '</td>'+
        '<td style="padding:6px 8px;text-align:center">'+
          '<div style="display:flex;align-items:center;justify-content:center;gap:4px">'+
            '<input type="number" value="'+escHtml(String(row.floor!==undefined&&row.floor!==null?row.floor:35))+'" min="0" max="999" step="0.5" '+
            'onchange="mfUpdateRow('+i+',\'floor\',parseFloat(this.value))" '+
            'style="width:64px;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:13px;font-weight:700;text-align:center">'+
            '<span style="font-size:13px;color:#546e7a">%</span>'+
          '</div>'+
        '</td>'+
        '<td style="padding:6px 8px">'+
          '<input value="'+escHtml(row.notes||'')+'" placeholder="Optional description..." onchange="mfUpdateRow('+i+',\'notes\',this.value)" '+
          'style="width:100%;padding:6px 8px;border:1px solid #e0e7ef;border-radius:6px;font-size:12px;color:#546e7a;box-sizing:border-box">'+
        '</td>'+
        '<td style="padding:6px 8px;text-align:center">'+
          '<button onclick="mfDeleteRow('+i+')" style="background:none;border:none;color:#c62828;font-size:16px;cursor:pointer;padding:0" title="Remove">×</button>'+
        '</td>'+
      '</tr>';
  });

  html += '</tbody></table>'+
    '<div style="margin-top:12px;display:flex;gap:10px;align-items:center">'+
      '<button class="btn btn-primary" onclick="saveMarginFloors()">💾 Save Margin Floors</button>'+
      '<span id="mf-saved-note" style="font-size:12px;color:#2e7d32;display:none">✓ Saved!</span>'+
    '</div>';

  el.innerHTML = html;
}

function mfUpdateRow(idx, field, value) {
  var list = _getMFList();
  if (list[idx]) {
    if (field === 'floor') {
      var fv = parseFloat(value);
      list[idx].floor = !isNaN(fv) ? fv : 35;
    } else {
      list[idx][field] = value;
    }
  }
  DB.marginFloors = list;
  // Don't saveDB on every keystroke — save button handles final save
}

function mfDeleteRow(idx) {
  var list = _getMFList();
  var name = list[idx] ? list[idx].jobType : 'this row';
  if (!confirm('Remove "'+name+'" floor? Any quotes using this job type will fall back to the default 35% floor.')) return;
  list.splice(idx, 1);
  DB.marginFloors = list;
  saveDB();
  renderMarginFloorsEditor();
  showToast('"'+name+'" removed','info');
}

function addMarginFloorRow() {
  if (typeof hasPermission==='function' && !hasPermission('settings.margin')) { showToast('You do not have permission to change margin floors','error'); return; }
  var list = _getMFList();
  list.push({ jobType:'New Job Type', floor:35, notes:'' });
  DB.marginFloors = list;
  saveDB();
  renderMarginFloorsEditor();
  // Focus the new name input
  var rows = document.querySelectorAll('#mf-tbody tr');
  if (rows.length) {
    var lastInput = rows[rows.length-1].querySelector('input');
    if (lastInput) { lastInput.focus(); lastInput.select(); }
  }
}

function saveMarginFloors() {
  if (typeof hasPermission==='function' && !hasPermission('settings.margin')) { showToast('You do not have permission to change margin floors','error'); return; }
  // Read current values from DOM and save
  var list = _getMFList();
  var rows = document.querySelectorAll('#mf-tbody tr[data-mf-idx]');
  rows.forEach(function(row) {
    var idx = parseInt(row.getAttribute('data-mf-idx'));
    var inputs = row.querySelectorAll('input');
    if (inputs[0] && list[idx]) list[idx].jobType = inputs[0].value.trim() || list[idx].jobType;
    if (inputs[1] && list[idx]) { var fv = parseFloat(inputs[1].value); list[idx].floor = (!isNaN(fv)) ? fv : 35; }
    if (inputs[2] && list[idx]) list[idx].notes   = inputs[2].value.trim();
  });
  DB.marginFloors = list;
  saveDB();
  var note = document.getElementById('mf-saved-note');
  if (note) { note.style.display='inline'; setTimeout(function(){ note.style.display='none'; }, 2000); }
  showToast('Margin floors saved ✓','success',2000);
}

function loadMarginFloors() {
  // With the new dynamic renderer this is a no-op when on the quoting tab
  // Kept for backward compatibility with calls from loadSettings()
  renderMarginFloorsEditor();
}


// ============================================================
// AUDIT LOG SYSTEM
// ============================================================

// Central audit function — call this from anywhere
function auditLog(event, recordType, recordId, details) {
  if (!_currentUser) return;

  var entry = {
    id:          'al-' + Date.now() + '-' + Math.random().toString(36).slice(2,5),
    event:       event,
    recordType:  recordType,
    recordId:    recordId || null,
    actorId:     _currentUser.id,
    actorName:   _currentUser.full_name || _currentUser.email || 'Unknown',
    actorRole:   _currentUser.role || 'unknown',
    oldValue:    details && details.old !== undefined ? JSON.stringify(details.old) : null,
    newValue:    details && details.new !== undefined ? JSON.stringify(details.new) : null,
    note:        details && details.note ? details.note : null,
    ts:          new Date().toISOString(),
    // Track if this was done in View As mode
    viewAsMode:  typeof _viewAsActive !== 'undefined' && _viewAsActive,
    realActorName: typeof _realUser !== 'undefined' && _realUser ? _realUser.full_name : null
  };

  // Store locally
  if (!DB.auditLog) DB.auditLog = [];
  DB.auditLog.push(entry);

  // Keep local log trimmed to last 500 entries (full history in Supabase)
  if (DB.auditLog.length > 500) DB.auditLog = DB.auditLog.slice(-500);

  // Push to Supabase async — never blocks UI
  _pushAuditEntry(entry);

  return entry;
}

async function _pushAuditEntry(entry) {
  if (!_sb || !_currentUser) return;
  try {
    await _sb.from('probid_audit').insert({
      id:           entry.id,
      event:        entry.event,
      record_type:  entry.recordType,
      record_id:    entry.recordId,
      actor_id:     entry.actorId,
      actor_name:   entry.actorName,
      actor_role:   entry.actorRole,
      old_value:    entry.oldValue,
      new_value:    entry.newValue,
      note:         entry.note,
      view_as_mode: entry.viewAsMode,
      real_actor:   entry.realActorName,
      created_at:   entry.ts
    });
  } catch(e) {
    // Fail silently — audit log should never break the app
    console.warn('[Audit]', e.message);
  }
}

// Convenience wrappers for common events
function auditWOStatus(woId, woNumber, oldStatus, newStatus) {
  auditLog('wo_status_changed', 'work_order', woId, {
    old: oldStatus, new: newStatus,
    note: woNumber + ': ' + oldStatus + ' → ' + newStatus
  });
}

function auditWOTechAssigned(woId, woNumber, techName) {
  auditLog('wo_tech_assigned', 'work_order', woId, {
    new: techName,
    note: woNumber + ': assigned ' + techName
  });
}

function auditWOTechUnassigned(woId, woNumber, techName) {
  auditLog('wo_tech_unassigned', 'work_order', woId, {
    old: techName,
    note: woNumber + ': unassigned ' + techName
  });
}

function auditTimeEntry(action, entryId, techName, details) {
  auditLog('time_entry_' + action, 'time_entry', entryId, {
    note: techName + ': ' + (details||'')
  });
}

function auditPermChange(roleId, permKey, oldVal, newVal) {
  auditLog('role_permission_changed', 'settings', roleId, {
    old: oldVal, new: newVal,
    note: roleId + ' — ' + permKey + ': ' + (oldVal?'ON':'OFF') + ' → ' + (newVal?'ON':'OFF')
  });
}

// ============================================================
// AUDIT LOG RENDER
// ============================================================

// Pull the latest audit_log from the cloud, then render. Ensures the page reflects
// events (like a delete that just happened) without waiting for the next full sync.
// Falls back to whatever is local if the fetch fails (offline).
async function loadAuditLogFromCloud() {
  var el = document.getElementById('audit-log-content');
  if (el && !(DB.auditLog && DB.auditLog.length)) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">Loading audit history…</div>';
  }
  try {
    if (_sb && _currentUser) {
      var { data: rows } = await _sb.from('probid_audit').select('*').order('created_at', { ascending: false }).limit(500);
      if (rows) {
        DB.auditLog = rows.map(function(a){ return {
          id:a.id, event:a.event, recordType:a.record_type, recordId:a.record_id,
          actorId:a.actor_id, actorName:a.actor_name, actorRole:a.actor_role,
          oldValue:a.old_value, newValue:a.new_value, note:a.note,
          ts:a.created_at || '', viewAsMode:a.view_as_mode, realActorName:a.real_actor
        }; });
      }
    }
  } catch(e) { /* offline or transient — render whatever we have locally */ }
  renderAuditLog();
}

function renderAuditLog() {
  var el = document.getElementById('audit-log-content');
  if (!el) return;

  var myRole = _currentUser ? _currentUser.role : '';
  var isAdmin = myRole==='owner'||myRole==='office'||myRole==='manager';
  if (!isAdmin) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:#90a4ae">Access restricted to owner and office.</div>';
    return;
  }

  // Filters
  var filterType  = (document.getElementById('al-filter-type')||{}).value  || '';
  var filterActor = (document.getElementById('al-filter-actor')||{}).value || '';
  var filterFrom  = (document.getElementById('al-filter-from')||{}).value  || '';
  var filterTo    = (document.getElementById('al-filter-to')||{}).value    || '';

  // Populate actor filter
  var actorSel = document.getElementById('al-filter-actor');
  if (actorSel && actorSel.options.length <= 1) {
    var actors = [...new Set((DB.auditLog||[]).map(function(e){ return e.actorName; }))].sort();
    actors.forEach(function(a){
      var o = document.createElement('option'); o.value=a; o.textContent=a; actorSel.appendChild(o);
    });
  }

  // Set default date range to last 7 days
  var fromEl = document.getElementById('al-filter-from');
  var toEl   = document.getElementById('al-filter-to');
  if (fromEl && !fromEl.value) {
    var d = new Date(); d.setDate(d.getDate()-7);
    fromEl.value = d.toISOString().split('T')[0];
  }
  if (toEl && !toEl.value) {
    toEl.value = new Date().toISOString().split('T')[0];
  }
  filterFrom = (document.getElementById('al-filter-from')||{}).value || '';
  filterTo   = (document.getElementById('al-filter-to')||{}).value   || '';

  var entries = (DB.auditLog||[]).filter(function(e){
    if (filterType  && e.recordType !== filterType)  return false;
    if (filterActor && e.actorName  !== filterActor) return false;
    if (filterFrom  && e.ts.split('T')[0] < filterFrom) return false;
    if (filterTo    && e.ts.split('T')[0] > filterTo)   return false;
    return true;
  }).sort(function(a,b){ return b.ts.localeCompare(a.ts); }); // newest first

  if (!entries.length) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">No audit entries for the selected filters.</div>';
    return;
  }

  var typeColors = {
    work_order:'#e3f2fd', time_entry:'#e8f5e9', settings:'#f3e5f5',
    quote:'#fff3e0', invoice:'#fce4ec', purchase_order:'#fff8e1', inventory:'#e0f2f1',
    customer:'#e8eaf6', contact:'#e0f7fa', job:'#fbe9e7'
  };
  var typeIcons = {
    work_order:'🔨', time_entry:'⏱', settings:'⚙️',
    quote:'💰', invoice:'📄', purchase_order:'📦', inventory:'🏪',
    customer:'🏢', contact:'👤', job:'🧰'
  };

  var html = '<div class="card" style="padding:0;overflow:hidden">'+
    '<table style="width:100%;border-collapse:collapse;font-size:13px">'+
    '<thead><tr style="background:#f0f4f8">'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">When</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Who</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">What</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Record</th>'+
      '<th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#546e7a;text-transform:uppercase">Detail</th>'+
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    var ts   = new Date(e.ts);
    var when = ts.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' +
               ts.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    var bg   = typeColors[e.recordType] || '#f8f9fa';
    var icon = typeIcons[e.recordType]  || '•';
    var eventLabel = (e.event||'').replace(/_/g,' ');
    var detail = '';
    if (e.oldValue && e.newValue) detail = e.oldValue + ' → ' + e.newValue;
    else if (e.newValue) detail = e.newValue;
    else if (e.oldValue) detail = e.oldValue;
    if (e.note) detail = e.note;

    html += '<tr style="border-bottom:1px solid #f0f4f8">'+
      '<td style="padding:10px 14px;font-size:11px;color:#546e7a;white-space:nowrap">'+escHtml(when)+'</td>'+
      '<td style="padding:10px 14px">'+
        '<div style="font-weight:600;font-size:12px">'+escHtml(e.actorName||'')+'</div>'+
        '<div style="font-size:10px;color:#90a4ae">'+escHtml(e.actorRole||'')+'</div>'+
        (e.viewAsMode?'<div style="font-size:9px;color:#e65100;font-weight:700">VIEW AS MODE</div>':'')+
      '</td>'+
      '<td style="padding:10px 14px">'+
        '<span style="background:'+bg+';padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">'+
          icon+' '+escHtml(eventLabel)+
        '</span>'+
      '</td>'+
      '<td style="padding:10px 14px;font-size:12px;color:#546e7a">'+escHtml(e.recordId||'')+'</td>'+
      '<td style="padding:10px 14px;font-size:12px;color:#37474f;max-width:300px">'+escHtml(detail||'')+'</td>'+
    '</tr>';
  });

  html += '</tbody></table>'+
    '<div style="padding:10px 14px;font-size:11px;color:#90a4ae;border-top:1px solid #f0f4f8">'+
      entries.length+' entries shown · Full history in Supabase'+
    '</div>'+
  '</div>';

  el.innerHTML = html;
}

// Populate job type dropdown from dynamic margin floor list
function populateJTDropdown() {
  var sel = document.getElementById('qq-jt');
  if (!sel) return;
  var current = sel.value;
  var list = _getMFList();
  sel.innerHTML = list.map(function(row) {
    return '<option value="'+escHtml(row.jobType)+'"'+(row.jobType===current?' selected':'')+'>'+escHtml(row.jobType)+'</option>';
  }).join('');
  if (!sel.value && list.length) sel.value = list[0].jobType;
}

// ============================================================
// APP-WIDE BROWSER BACK BUTTON GUARD
// ============================================================
var _probidBackGuardInstalled = false;
var _probidAllowLeave         = false;
var _probidLeaveCallback      = null;

function probidInstallBackGuard() {
  // RETIRED (build aw): this used to TRAP the browser Back button — it pushed a
  // sentinel history state on load and cancelled every Back press with a re-push
  // + "Leave ProBid?" dialog. That is exactly what left staff unable to go back
  // to the previous screen. Client-side hash routing (see goPage/_syncHash and
  // the hashchange listener) now owns Back/Forward: each page is a real history
  // entry, so Back returns to the previous page. Unsaved-work protection is
  // preserved by the per-page dirty guards inside goPage() and by the
  // beforeunload handlers that still fire when the app is actually being closed.
  // Left as a no-op (rather than deleted) so the DOMContentLoaded caller and the
  // legacy probid* helpers below remain harmless.
  return;
}

function probidActuallyLeave() {
  _probidAllowLeave = true;
  history.back();
}

function probidShowBackDialog() {
  var wizOpen = document.getElementById('wt-wizard-modal') || document.getElementById('wt-abw-modal');
  if (wizOpen) {
    probidLeaveModal('Wizard in Progress',
      'Your progress is saved as a draft. Resume it next time you open the wizard.',
      'Stay in Wizard', 'Close Wizard',
      function(leave) { if (leave) wizOpen.remove(); });
    return;
  }
  var wtPage = document.getElementById('page-worktracking');
  var wtActive = wtPage && wtPage.classList.contains('active');
  if (wtActive && typeof WT !== 'undefined' && WT.proj && WT.view !== 'list') {
    probidLeaveModal('Where do you want to go?',
      'Use the app navigation buttons. The browser back button exits ProBid entirely.',
      '<- Back to Projects', 'Leave ProBid',
      function(leave) {
        if (!leave) {
          if (typeof wtRenderProjectList === 'function') {
            WT.view = 'list'; WT.proj = null; wtRenderProjectList();
          }
        } else { probidActuallyLeave(); }
      });
    return;
  }
  var qqPage  = document.getElementById('page-qq');
  var qqActive = qqPage && qqPage.classList.contains('active');
  if (qqActive && typeof _qqDirty !== 'undefined' && _qqDirty) {
    probidLeaveModal('Unsaved Quote Changes',
      'You have unsaved changes. Leaving now will lose them.',
      'Stay & Save', 'Leave Anyway',
      function(leave) { if (leave) probidActuallyLeave(); });
    return;
  }
  probidLeaveModal('Leave ProBid?', 'You are about to exit the ProBid application.',
    'Stay in ProBid', 'Leave ProBid',
    function(leave) { if (leave) probidActuallyLeave(); });
}

function probidLeaveModal(title, message, stayLabel, leaveLabel, callback) {
  var ex = document.getElementById('probid-leave-modal');
  if (ex) ex.remove();
  _probidLeaveCallback = callback;
  var el = document.createElement('div');
  el.id = 'probid-leave-modal';
  el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
    'background:rgba(13,27,42,.65);z-index:999999;display:flex;' +
    'align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
  el.innerHTML =
    '<div style="background:#fff;border-radius:20px;max-width:440px;width:100%;' +
    'padding:36px 32px;box-shadow:0 32px 80px rgba(0,0,0,.3);text-align:center">' +
    '<div style="font-size:44px;margin-bottom:16px">&#9888;</div>' +
    '<div style="font-size:20px;font-weight:800;color:#0d1b2a;margin-bottom:10px">' + title + '</div>' +
    '<div style="font-size:14px;color:#546e7a;margin-bottom:30px;line-height:1.6">' + message + '</div>' +
    '<div style="display:flex;gap:12px">' +
    '<button id="plm-stay" style="flex:1;padding:14px;font-size:14px;font-weight:800;' +
    'background:#1565c0;color:#fff;border:none;border-radius:10px;cursor:pointer">' + stayLabel + '</button>' +
    '<button id="plm-leave" style="flex:1;padding:14px;font-size:14px;font-weight:700;' +
    'border:2px solid #e0e0e0;border-radius:10px;background:#fff;color:#546e7a;cursor:pointer">' + leaveLabel + '</button>' +
    '</div></div>';
  document.body.appendChild(el);
  el.querySelector('#plm-stay').addEventListener('click', function(){ probidLeaveChoice(false); });
  el.querySelector('#plm-leave').addEventListener('click', function(){ probidLeaveChoice(true); });
}

function probidLeaveChoice(leave) {
  var modal = document.getElementById('probid-leave-modal');
  if (modal) modal.remove();
  if (_probidLeaveCallback) { var cb=_probidLeaveCallback; _probidLeaveCallback=null; cb(leave); }
}

// Install on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', probidInstallBackGuard);
} else {
  probidInstallBackGuard();
}


// ============================================================
// SETTINGS DRAWER ENGINE — Final Design
// ============================================================
var _settingsDrawerModule = null;

// Module config: icon emoji, header subtitle, master settings tab + banner text
var _sdConfig = {
  quotes:     { icon:'📋', sub:'Quotes module',              masterTab:'quoting',      masterLabel:'Quoting & pricing settings',      masterSub:'Margin floors, terms, proposal defaults' },
  workorders: { icon:'🔨', sub:'Work orders module',         masterTab:'workorders',   masterLabel:'Work order statuses & types',      masterSub:'Custom statuses, service types, categories' },
  dispatch:   { icon:'🗂', sub:'Dispatch board',             masterTab:'integrations', masterLabel:'Company & integration settings',   masterSub:'ClickSend SMS credentials and config' },
  team:       { icon:'👷', sub:'Team module',                masterTab:'roles',        masterLabel:'Roles & permissions',              masterSub:'Access control for all modules and pages' },
  field:      { icon:'⏱', sub:'Field / time clock module',  masterTab:'company',      masterLabel:'Full geofence & payroll settings', masterSub:'Pay periods, overtime rules, holidays' },
  inventory:  { icon:'📦', sub:'Inventory module',           masterTab:'inventory',    masterLabel:'Inventory locations & alerts',     masterSub:'Locations, low-stock rules, categories' },
  recurring:  { icon:'🔄', sub:'Managed services module',   masterTab:'company',      masterLabel:'Company settings',                 masterSub:'Billing cycles, delivery defaults' },
  customers:  { icon:'👥', sub:'Customers module',           masterTab:'company',      masterLabel:'Company & defaults',               masterSub:'Payment terms, follow-up rules' }
};

function openSettingsDrawer(moduleKey) {
  _settingsDrawerModule = moduleKey;

  // Permission gate
  var role = typeof _currentUser !== 'undefined' && _currentUser ? _currentUser.role : null;
  if (role === 'helper_tech' || role === 'lead_tech') return;

  var cfg     = _sdConfig[moduleKey] || {};
  var titles  = { quotes:'Quotes settings', workorders:'Work orders settings', dispatch:'Dispatch settings', team:'Team settings', field:'Time clock settings', inventory:'Inventory settings', recurring:'Managed services settings', customers:'Customer settings' };

  // Update header
  var elIcon  = document.getElementById('sd-header-icon');
  var elTitle = document.getElementById('sd-header-title');
  var elSub   = document.getElementById('sd-header-sub');
  if (elIcon)  elIcon.textContent  = cfg.icon  || '⚙️';
  if (elTitle) elTitle.textContent = titles[moduleKey] || 'Settings';
  if (elSub)   elSub.textContent   = cfg.sub   || '';

  // Update master banner
  var elML = document.getElementById('sd-master-banner-label');
  var elMS = document.getElementById('sd-master-banner-sub');
  var elMI = document.getElementById('sd-master-banner-icon');
  if (elML) elML.textContent = cfg.masterLabel || 'Master settings';
  if (elMS) elMS.textContent = cfg.masterSub   || 'View all settings';
  if (elMI) elMI.textContent = cfg.icon || '⚙️';

  // Render body
  var body = document.getElementById('settings-drawer-body');
  if (body) body.innerHTML = _sdBuildBody(moduleKey);

  // Open
  var overlay = document.getElementById('settings-drawer-overlay');
  var drawer  = document.getElementById('settings-drawer');
  if (!drawer) return;
  overlay.style.display = 'block';
  requestAnimationFrame(function() {
    overlay.classList.add('open');
    drawer.classList.add('open');
  });

  // Escape to close
  document._sdKeyHandler = function(e) { if (e.key === 'Escape') closeSettingsDrawer(); };
  document.addEventListener('keydown', document._sdKeyHandler);
}

function closeSettingsDrawer() {
  var overlay = document.getElementById('settings-drawer-overlay');
  var drawer  = document.getElementById('settings-drawer');
  if (!drawer) return;
  overlay.classList.remove('open');
  drawer.classList.remove('open');
  setTimeout(function() { overlay.style.display = 'none'; }, 260);
  if (document._sdKeyHandler) {
    document.removeEventListener('keydown', document._sdKeyHandler);
    document._sdKeyHandler = null;
  }
}

function _sdGoMaster() {
  var cfg = _sdConfig[_settingsDrawerModule] || {};
  var tab = cfg.masterTab || 'company';
  closeSettingsDrawer();
  goPage('settings');
  setTimeout(function() { if (typeof switchMsTab === 'function') switchMsTab(tab); }, 200);
}

function saveSettingsDrawer() {
  if (!_settingsDrawerModule) return;
  var handlers = {
    quotes:     _saveDrawerQuotes,
    workorders: _saveDrawerWorkOrders,
    dispatch:   _saveDrawerDispatch,
    team:       _saveDrawerTeam,
    field:      _saveDrawerField,
    inventory:  _saveDrawerInventory,
    recurring:  _saveDrawerRecurring,
    customers:  _saveDrawerCustomers
  };
  if (handlers[_settingsDrawerModule]) handlers[_settingsDrawerModule]();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _sdGv(id)    { var el=document.getElementById(id); return el ? el.value : ''; }
function _sdCv(id)    { var el=document.getElementById(id); return el ? el.checked : false; }

function _sdSection(iconEmoji, title, rows) {
  return '<div class="sdrawer-section">' +
    '<div class="sdrawer-section-title">' + iconEmoji + ' ' + title + '</div>' +
    rows.join('') +
    '</div>';
}
function _sdRow(label, inputHtml) {
  return '<div class="sdrawer-row"><label>' + label + '</label>' + inputHtml + '</div>';
}
function _sdToggle(label, id, checked) {
  return '<div class="sdrawer-toggle-row"><label>' + label + '</label>' +
    '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '></div>';
}
function _sdInput(id, val, type, placeholder) {
  type = type || 'text';
  var v = (val !== undefined && val !== null) ? String(val).replace(/"/g,'&quot;') : '';
  var ph = placeholder ? ' placeholder="' + placeholder + '"' : '';
  return '<input type="' + type + '" id="' + id + '" value="' + v + '"' + ph + '>';
}
function _sdSelect(id, options, selected) {
  return '<select id="' + id + '">' +
    options.map(function(o) {
      return '<option value="' + o.v + '"' + (String(o.v) === String(selected) ? ' selected' : '') + '>' + o.l + '</option>';
    }).join('') +
    '</select>';
}

// ── Body builder ─────────────────────────────────────────────────────────────
function _sdBuildBody(moduleKey) {
  var s  = DB.settings  || {};
  var ws = DB.woSettings || {};

  switch (moduleKey) {

    case 'quotes':
      return _sdSection('📐', 'Defaults', [
        _sdRow('Default labor rate ($/hr)', _sdInput('sd-q-labor',   s.laborRate     || 100, 'number')),
        _sdRow('Target margin (%)',          _sdInput('sd-q-margin',  s.targetMargin  || 35,  'number')),
        _sdRow('Default tax rate (%)',       _sdInput('sd-q-tax',     s.taxRate       || 0,   'number')),
        _sdRow('Quote valid for (days)',     _sdInput('sd-q-valid',   s.validDays     || 30,  'number')),
        _sdRow('Default payment terms',      _sdInput('sd-q-terms',   s.payTerms      || 'Net 30')),
        _sdRow('Follow-up reminder (days)',  _sdInput('sd-q-followup',s.followupDays  || 7,   'number')),
        _sdRow('Per diem markup (%)',        _sdInput('sd-q-perdiem', s.perDiemMarkup !== undefined ? s.perDiemMarkup : 15, 'number')),
      ]) +
      _sdSection('🖥', 'Display', [
        _sdRow('Default sort order', _sdSelect('sd-q-sort', [
          {v:'num-desc', l:'Quote # — newest first'},
          {v:'num-asc',  l:'Quote # — oldest first'},
          {v:'dt-desc',  l:'Date — newest first'},
          {v:'dt-asc',   l:'Date — oldest first'},
        ], s.quoteDefaultSort || 'num-desc')),
      ]);

    case 'workorders':
      return _sdSection('💵', 'Default rates', [
        _sdRow('Default labor rate ($/hr)', _sdInput('sd-wo-labor', ws.defaultLaborRate || 125, 'number')),
        _sdRow('Default tax rate (%)',       _sdInput('sd-wo-tax',   ws.defaultTaxRate   || 0,   'number')),
      ]) +
      _sdSection('🔔', 'Notifications', [
        _sdToggle('Send SMS when tech is assigned', 'sd-wo-sms', s.woSmsOnAssign !== false),
        _sdToggle('Alert office when tech logs an expense', 'sd-wo-notif-expense', s.notifExpenseEnabled !== false),
      ]);

    case 'dispatch':
      return _sdSection('💬', 'SMS notifications', [
        _sdToggle('Send SMS when job is dispatched',    'sd-dp-sms',         s.dispatchSmsEnabled !== false),
        _sdToggle('Require confirmation before sending','sd-dp-sms-confirm', s.dispatchSmsConfirm !== false),
      ]) +
      _sdSection('🗂', 'Board defaults', [
        _sdRow('Default pool filter', _sdSelect('sd-dp-filter', [
          {v:'all',        l:'All work'},
          {v:'needs_tech', l:'⚠ Needs a tech'},
          {v:'scheduled',  l:'Scheduled'},
        ], s.dispatchDefaultFilter || 'all')),
      ]);

    case 'team':
      return _sdSection('💬', 'SMS notifications', [
        _sdToggle('SMS enabled for new members by default', 'sd-tm-sms-default', s.teamSmsDefault !== false),
      ]) +
      _sdSection('👤', 'New member defaults', [
        _sdRow('Default hourly rate ($/hr)', _sdInput('sd-tm-rate', s.teamDefaultRate || 65, 'number')),
        _sdRow('Default role', _sdSelect('sd-tm-role', [
          {v:'field',       l:'Field technician'},
          {v:'lead_tech',   l:'Lead technician'},
          {v:'helper_tech', l:'Helper'},
        ], s.teamDefaultRole || 'field')),
      ]);

    case 'field':
      return _sdSection('📍', 'Clock-in rules', [
        _sdToggle('Enforce geofence (block if off-site)', 'sd-fi-geofence',   s.geofenceEnforce),
        _sdToggle('Auto-detect job site arrivals',         'sd-fi-autodetect', s.autoDetectArrivals),
        _sdRow('Clock-in reminder time', _sdInput('sd-fi-reminder', s.clockInReminderTime || '', 'time')),
      ]) +
      _sdSection('🏢', 'Office location', [
        _sdRow('Office address', _sdInput('sd-fi-addr', s.officeAddr || '', 'text', '123 Main St, Asheboro, NC')),
      ]) +
      _sdSection('🔔', 'Clock-in anomaly alerts', [
        _sdToggle('Alert when tech hasn\'t clocked in by threshold time', 'sd-fi-notif-enabled', s.notifClockInEnabled !== false),
        _sdRow('Alert threshold time', _sdInput('sd-fi-notif-time', s.notifClockInTime || '07:00', 'time')),
      ]);

    case 'inventory':
      return _sdSection('⚠️', 'Low stock alerts', [
        _sdToggle('Alert when item drops below minimum at checkout', 'sd-inv-warn', s.invLowStockWarn !== false),
        _sdToggle('Daily reminder if items are still below minimum',  'sd-inv-daily', s.invLowStockDaily !== false),
      ]) +
      _sdSection('📝', 'Notes', [
        _sdRow('Inventory notes (shown on checkout screen)',
          '<textarea id="sd-inv-notes" rows="3">' + (s.invNotes || '').replace(/</g,'&lt;') + '</textarea>'),
      ]);

    case 'recurring':
      return _sdSection('📆', 'Billing defaults', [
        _sdRow('Default billing cycle', _sdSelect('sd-rc-cycle', [
          {v:'monthly',   l:'Monthly'},
          {v:'quarterly', l:'Quarterly'},
          {v:'annually',  l:'Annually'},
        ], s.rcDefaultCycle || 'monthly')),
        _sdRow('Default delivery method', _sdSelect('sd-rc-delivery', [
          {v:'email',  l:'Email'},
          {v:'print',  l:'Print'},
          {v:'manual', l:'Manual'},
        ], s.rcDefaultDelivery || 'email')),
        _sdRow('Default billing day of month', _sdInput('sd-rc-day', s.rcDefaultBillingDay || 1, 'number')),
      ]) +
      _sdSection('🔄', 'Auto-renew', [
        _sdToggle('Auto-renew contracts by default', 'sd-rc-autorenew', s.rcAutoRenewDefault !== false),
      ]);

    case 'customers':
      return _sdSection('📋', 'Defaults', [
        _sdRow('Default payment terms',     _sdInput('sd-cu-terms',    s.payTerms     || 'Net 30')),
        _sdRow('Follow-up reminder (days)', _sdInput('sd-cu-followup', s.followupDays || 7, 'number')),
      ]);

    default:
      return '<div class="sdrawer-section" style="color:#90a4ae;font-size:13px">No settings available.</div>';
  }
}

// ── Save handlers ─────────────────────────────────────────────────────────────
function _saveDrawerQuotes() {
  DB.settings = Object.assign({}, DB.settings, {
    laborRate:        parseFloat(_sdGv('sd-q-labor'))   || 100,
    targetMargin:     parseFloat(_sdGv('sd-q-margin'))  || 35,
    taxRate:          parseFloat(_sdGv('sd-q-tax'))     || 0,
    validDays:        parseInt(_sdGv('sd-q-valid'))     || 30,
    payTerms:         _sdGv('sd-q-terms')               || 'Net 30',
    followupDays:     parseInt(_sdGv('sd-q-followup'))  || 7,
    perDiemMarkup:    parseFloat(_sdGv('sd-q-perdiem')) || 0,
    quoteDefaultSort: _sdGv('sd-q-sort')                || 'num-desc',
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Quotes settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerWorkOrders() {
  if (!DB.woSettings) DB.woSettings = {};
  DB.woSettings.defaultLaborRate = parseFloat(_sdGv('sd-wo-labor')) || 125;
  DB.woSettings.defaultTaxRate   = parseFloat(_sdGv('sd-wo-tax'))   || 0;
  DB.settings = Object.assign({}, DB.settings, {
    woSmsOnAssign:       _sdCv('sd-wo-sms'),
    notifExpenseEnabled: _sdCv('sd-wo-notif-expense'),
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Work orders settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerDispatch() {
  DB.settings = Object.assign({}, DB.settings, {
    dispatchSmsEnabled:    _sdCv('sd-dp-sms'),
    dispatchSmsConfirm:    _sdCv('sd-dp-sms-confirm'),
    dispatchDefaultFilter: _sdGv('sd-dp-filter') || 'all',
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Dispatch settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerTeam() {
  DB.settings = Object.assign({}, DB.settings, {
    teamSmsDefault:  _sdCv('sd-tm-sms-default'),
    teamDefaultRate: parseFloat(_sdGv('sd-tm-rate')) || 65,
    teamDefaultRole: _sdGv('sd-tm-role') || 'field',
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Team settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerField() {
  DB.settings = Object.assign({}, DB.settings, {
    geofenceEnforce:      _sdCv('sd-fi-geofence'),
    autoDetectArrivals:   _sdCv('sd-fi-autodetect'),
    clockInReminderTime:  _sdGv('sd-fi-reminder') || '',
    officeAddr:           _sdGv('sd-fi-addr')     || '',
    notifClockInEnabled:  _sdCv('sd-fi-notif-enabled'),
    notifClockInTime:     _sdGv('sd-fi-notif-time') || '07:00',
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Time clock settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerInventory() {
  DB.settings = Object.assign({}, DB.settings, {
    invLowStockWarn:  _sdCv('sd-inv-warn'),
    invLowStockDaily: _sdCv('sd-inv-daily'),
    invNotes:         _sdGv('sd-inv-notes') || '',
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Inventory settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerRecurring() {
  DB.settings = Object.assign({}, DB.settings, {
    rcDefaultCycle:      _sdGv('sd-rc-cycle')    || 'monthly',
    rcDefaultDelivery:   _sdGv('sd-rc-delivery') || 'email',
    rcDefaultBillingDay: parseInt(_sdGv('sd-rc-day')) || 1,
    rcAutoRenewDefault:  _sdCv('sd-rc-autorenew'),
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Managed services settings saved ✓','success'); closeSettingsDrawer();
}

function _saveDrawerCustomers() {
  DB.settings = Object.assign({}, DB.settings, {
    payTerms:     _sdGv('sd-cu-terms')              || 'Net 30',
    followupDays: parseInt(_sdGv('sd-cu-followup')) || 7,
  });
  saveDB(); if (typeof _pushSettingsToSupabase==='function') _pushSettingsToSupabase();
  showToast('Customer settings saved ✓','success'); closeSettingsDrawer();
}

// ── formatTimeAgo ─────────────────────────────────────────────────────────────
// Returns a human-readable relative time string for a given timestamp.
// Used by the notification panel in worktracking.js.
function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  var now  = Date.now();
  var then = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  if (isNaN(then)) return '';
  var diff = Math.floor((now - then) / 1000); // seconds ago

  if (diff < 60)           return 'Just now';
  if (diff < 3600)         return Math.floor(diff / 60) + ' min ago';
  if (diff < 7200)         return '1 hr ago';
  if (diff < 86400)        return Math.floor(diff / 3600) + ' hrs ago';
  if (diff < 172800)       return 'Yesterday';
  if (diff < 604800)       return Math.floor(diff / 86400) + ' days ago';
  // Older than a week — show actual date
  return new Date(then).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ============================================================
// NOTIFICATION SETTINGS — Master Settings page save
// ============================================================
function saveNotificationSettings() {
  var clockInEnabled = (document.getElementById('ms-notif-clockin-enabled')||{}).value;
  var clockInTime    = (document.getElementById('ms-notif-clockin-time')||{}).value || '07:00';
  var expenseEnabled = (document.getElementById('ms-notif-expense-enabled')||{}).value;
  var invEnabled     = (document.getElementById('ms-notif-inv-enabled')||{}).value;

  DB.settings = Object.assign({}, DB.settings, {
    notifClockInEnabled:  clockInEnabled !== '0',
    notifClockInTime:     clockInTime,
    notifExpenseEnabled:  expenseEnabled !== '0',
    invLowStockWarn:      invEnabled !== '0',
    invLowStockDaily:     invEnabled !== '0',
  });
  saveDB();
  if (typeof _pushSettingsToSupabase === 'function') _pushSettingsToSupabase();
  showToast('Notification settings saved ✓', 'success');
}

// Load notification settings into Master Settings page
function loadNotificationSettings() {
  var s = DB.settings || {};
  var clockInEl  = document.getElementById('ms-notif-clockin-enabled');
  var clockTime  = document.getElementById('ms-notif-clockin-time');
  var expenseEl  = document.getElementById('ms-notif-expense-enabled');
  var invEl      = document.getElementById('ms-notif-inv-enabled');
  if (clockInEl)  clockInEl.value  = s.notifClockInEnabled  !== false ? '1' : '0';
  if (clockTime)  clockTime.value  = s.notifClockInTime || '07:00';
  if (expenseEl)  expenseEl.value  = s.notifExpenseEnabled  !== false ? '1' : '0';
  if (invEl)      invEl.value      = (s.invLowStockWarn !== false)    ? '1' : '0';
}

// ============================================================
// DAILY LOW STOCK CHECK
// Runs once per day on app load — fires notification if any
// items are still below minimum and invLowStockDaily is ON
// ============================================================
function _checkLowStockDaily() {
  if (DB.settings.invLowStockWarn === false) return;
  if (DB.settings.invLowStockDaily === false) return;

  // Only run once per calendar day
  var today = new Date().toISOString().split('T')[0];
  var lastCheck = localStorage.getItem('tcss_inv_daily_check');
  if (lastCheck === today) return;
  localStorage.setItem('tcss_inv_daily_check', today);

  var lowItems = (DB.inventory||[]).filter(function(item) {
    return (item.minQty||0) > 0 && (item.qty||0) < item.minQty;
  });
  if (!lowItems.length) return;

  var isOffice = typeof _currentUser !== 'undefined' && _currentUser &&
    ['owner','manager','back_office'].includes(_currentUser.role);
  if (!isOffice) return;

  if (typeof addNotification === 'function') {
    var names = lowItems.slice(0,3).map(function(i){
      return i.name+' ('+i.qty+'/'+i.minQty+')';
    }).join(', ');
    var extra = lowItems.length > 3 ? ' +' + (lowItems.length-3) + ' more' : '';
    addNotification(
      'low_stock',
      '📦 Daily Stock Alert — '+lowItems.length+' item'+(lowItems.length>1?'s':'')+' below minimum',
      names + extra,
      'inventory'
    );
  }
}

// ============================================================
// CLOCK-IN ANOMALY CHECK
// Runs every 5 minutes — fires once at threshold time if a
// tech has a WO scheduled today but hasn't clocked in
// ============================================================
function _checkClockInAnomalies() {
  if (DB.settings.notifClockInEnabled === false) return;

  var isOffice = typeof _currentUser !== 'undefined' && _currentUser &&
    ['owner','manager','back_office'].includes(_currentUser.role);
  if (!isOffice) return;

  var now       = new Date();
  var today     = now.toISOString().split('T')[0];
  var threshold = DB.settings.notifClockInTime || '07:00';
  var parts     = threshold.split(':');
  var threshH   = parseInt(parts[0])||7;
  var threshM   = parseInt(parts[1])||0;

  // Only fire after threshold time
  if (now.getHours() < threshH || (now.getHours() === threshH && now.getMinutes() < threshM)) return;

  // Only fire once per day per threshold time
  var checkKey = 'tcss_clockin_check_' + today + '_' + threshold.replace(':','');
  if (localStorage.getItem(checkKey)) return;
  localStorage.setItem(checkKey, '1');

  // Find techs scheduled today
  var todayWOs = (DB.workOrders||[]).filter(function(wo) {
    return (wo.scheduledDate||'') === today && wo.assignedTechs && wo.assignedTechs.length;
  });
  if (!todayWOs.length) return;

  // Find who hasn't clocked in
  var clockedIn = (DB.clockLogs||[])
    .filter(function(l){ return (l.clockIn||'').startsWith(today); })
    .map(function(l){ return (l.techName||'').toLowerCase(); });

  var missing = [];
  todayWOs.forEach(function(wo) {
    (wo.assignedTechs||[]).forEach(function(t) {
      var name = typeof t === 'string' ? t : (t.name||'');
      if (!name) return;
      if (missing.indexOf(name) >= 0) return;
      if (clockedIn.indexOf(name.toLowerCase()) < 0) missing.push(name);
    });
  });

  if (!missing.length) return;

  if (typeof addNotification === 'function') {
    addNotification(
      'clockin_anomaly',
      '⏰ Not Clocked In — ' + missing.length + ' tech' + (missing.length > 1 ? 's' : ''),
      missing.slice(0,3).join(', ') + (missing.length > 3 ? ' +' + (missing.length-3) + ' more' : '') + ' scheduled today but not clocked in as of ' + threshold,
      'timeclock'
    );
  }
}

// Start the clock-in anomaly check interval — runs every 5 min
function _startNotificationChecks() {
  // Run daily low stock check on load
  setTimeout(_checkLowStockDaily, 3000);
  // Run clock-in anomaly check every 5 minutes
  setInterval(_checkClockInAnomalies, 300000);
  // Also check immediately on load (in case threshold already passed today)
  setTimeout(_checkClockInAnomalies, 5000);
}
