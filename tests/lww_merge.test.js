// r26: last-writer-wins pull merge. Verifies the REAL _tsMs/_lwwMerge from auth.js:
//   - an offline edit (local newer) survives the pull instead of being overwritten by cloud
//   - cloud wins when it's newer (or on a tie)
//   - another user's change to a record you didn't touch comes through
//   - a brand-new local-only record is kept
//   - timestamps compare by parsed time, so "…Z" vs "…+00:00" for the same instant don't mis-order
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
const start = src.indexOf('function _tsMs(');
const endMark = 'return merged.concat(localOnly||[]);\n}';
const end = src.indexOf(endMark);
if (start < 0 || end < 0) { console.log('✗ could not locate _lwwMerge in auth.js'); process.exit(1); }
eval(src.slice(start, end + endMark.length));   // defines _tsMs + _lwwMerge

let pass=0, fail=0;
function ok(n,g,w){ if(JSON.stringify(g)===JSON.stringify(w)){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+'\n      got '+JSON.stringify(g)+'\n      want '+JSON.stringify(w));} }

// 1) Offline edit is newer than cloud → keep local (not discarded by the pull)
(function(){
  var cloud=[{id:1, v:'cloud', updatedAt:'2026-10-28T10:00:00Z'}];
  var local=[{id:1, v:'myOfflineEdit', updatedAt:'2026-10-28T11:00:00Z'}];
  var out=_lwwMerge(cloud, local, []);
  ok('offline edit (local newer) survives the pull', out[0].v, 'myOfflineEdit');
})();

// 2) Cloud is newer → cloud wins (you hadn't touched it, or your copy is older)
(function(){
  var cloud=[{id:1, v:'cloudNewer', updatedAt:'2026-10-28T12:00:00Z'}];
  var local=[{id:1, v:'localOld',   updatedAt:'2026-10-28T11:00:00Z'}];
  var out=_lwwMerge(cloud, local, []);
  ok('cloud newer → cloud wins', out[0].v, 'cloudNewer');
})();

// 3) Tie → cloud wins (no spurious local-keep)
(function(){
  var t='2026-10-28T11:00:00Z';
  var out=_lwwMerge([{id:1,v:'cloud',updatedAt:t}], [{id:1,v:'local',updatedAt:t}], []);
  ok('equal timestamps → cloud wins', out[0].v, 'cloud');
})();

// 4) Another user's change to a record you didn't touch comes through
(function(){
  var cloud=[{id:1,v:'mine',updatedAt:'2026-10-28T11:00:00Z'}, {id:2,v:'theirEdit',updatedAt:'2026-10-28T10:30:00Z'}];
  var local=[{id:1,v:'mine',updatedAt:'2026-10-28T11:00:00Z'}]; // never touched #2
  var out=_lwwMerge(cloud, local, []);
  var two=out.find(function(r){return r.id===2;});
  ok("untouched record #2 (their edit) comes through", two && two.v, 'theirEdit');
})();

// 5) Brand-new local-only record is kept
(function(){
  var out=_lwwMerge([{id:1,updatedAt:'2026-10-28T10:00:00Z'}], [{id:1,updatedAt:'2026-10-28T10:00:00Z'}], [{id:9,v:'newOffline'}]);
  var nine=out.find(function(r){return r.id===9;});
  ok('local-only new record is kept', nine && nine.v, 'newOffline');
})();

// 6) Timezone-format safety: same prefix, 1s newer local in "Z" vs cloud "+00:00"
(function(){
  var cloud=[{id:1,v:'cloud',updatedAt:'2026-10-28T10:00:00+00:00'}];
  var local=[{id:1,v:'local1sNewer',updatedAt:'2026-10-28T10:00:01Z'}];
  var out=_lwwMerge(cloud, local, []);
  ok('parsed-time compare (Z vs +00:00): newer local wins', out[0].v, 'local1sNewer');
  // and the reverse — cloud 1s newer than a Z local → cloud wins
  var out2=_lwwMerge([{id:1,v:'cloud1sNewer',updatedAt:'2026-10-28T10:00:02+00:00'}], [{id:1,v:'local',updatedAt:'2026-10-28T10:00:01Z'}], []);
  ok('parsed-time compare: newer cloud wins', out2[0].v, 'cloud1sNewer');
})();

// 7) No local edit (no updatedAt) → cloud wins, never a spurious keep
(function(){
  var out=_lwwMerge([{id:1,v:'cloud',updatedAt:'2026-10-28T10:00:00Z'}], [{id:1,v:'localNoTs'}], []);
  ok('local with no updatedAt → cloud wins', out[0].v, 'cloud');
})();

console.log('\n'+(fail? '✗ '+fail+' FAILED, '+pass+' passed' : 'ALL '+pass+' PASSED'));
process.exit(fail?1:0);
