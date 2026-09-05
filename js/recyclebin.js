// ============================================================================
// Recycle Bin — owner/manager view of soft-deleted records, with one-click restore.
// Deleted records are excluded from every normal pull, so this page queries the
// cloud directly for them and restores through the authorized restore_* RPCs
// (migrations 2026-09-03_01 / _02). Nothing here can bypass the DB role check.
// ============================================================================

function _rbEsc(s){
  return String(s==null?'':s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
  });
}
function _rbDate(iso){
  if(!iso) return '';
  try { var d=new Date(iso); return d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return String(iso).split('T')[0]; }
}

async function renderRecycleBin(){
  var el = document.getElementById('recyclebin-content');
  if (!el) return;

  var myRole = _currentUser ? _currentUser.role : '';
  if (myRole !== 'owner' && myRole !== 'manager') {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">The Recycle Bin is available to owners and managers.</div>';
    return;
  }
  if (!_sb || !_currentUser) {
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">The Recycle Bin needs a cloud connection.</div>';
    return;
  }

  el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#90a4ae">Loading deleted records…</div>';

  try {
    var res = await Promise.all([
      _sb.from('quotes').select('id,quote_number,customer_name,job_name,total_sell,deleted_at,deleted_by').not('deleted_at','is',null).order('deleted_at',{ascending:false}),
      _sb.from('customers').select('id,name,company,deleted_at,deleted_by').eq('is_active',false).order('deleted_at',{ascending:false}),
      _sb.from('contacts').select('id,name,deleted_at,deleted_by').eq('is_active',false).order('deleted_at',{ascending:false}),
      _sb.from('jobs').select('id,name,deleted_at,deleted_by').eq('is_active',false).order('deleted_at',{ascending:false}),
      _sb.from('profiles').select('id,full_name'),
      _sb.from('time_entries').select('id,tech_name,entry_date,entry_type,total_hours,deleted_at,deleted_by').eq('deleted',true).order('deleted_at',{ascending:false})
    ]);
    var firstErr = res.find(function(r){ return r && r.error; });
    if (firstErr) { el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#c62828">Could not load the Recycle Bin: '+_rbEsc(firstErr.error.message)+'</div>'; return; }

    var quotes=res[0].data||[], custs=res[1].data||[], conts=res[2].data||[], jobs=res[3].data||[];
    var tents=res[5].data||[];
    var who={}; (res[4].data||[]).forEach(function(p){ who[p.id]=p.full_name; });
    var by=function(uid){ return uid ? (who[uid]||'—') : '—'; };

    var total = quotes.length+custs.length+conts.length+jobs.length+tents.length;
    if (total === 0) {
      el.innerHTML = '<div class="card" style="text-align:center;padding:48px;color:#90a4ae">'
        + '<div style="font-size:40px;margin-bottom:8px">♻️</div>'
        + '<div style="font-weight:700;color:#607d8b">The Recycle Bin is empty.</div>'
        + '<div style="font-size:12px;margin-top:6px">Deleted quotes, customers, contacts, and jobs will appear here and can be restored.</div>'
        + '</div>';
      return;
    }

    function section(title, icon, kind, rows, cols, cellFns){
      if (!rows.length) return '';
      var head = '<tr>'+cols.map(function(c){ return '<th style="text-align:left;padding:8px 10px;font-size:11px;color:#607d8b;border-bottom:2px solid #eceff1">'+_rbEsc(c)+'</th>'; }).join('')
        + '<th style="padding:8px 10px;border-bottom:2px solid #eceff1"></th></tr>';
      var body = rows.map(function(r){
        var tds = cellFns.map(function(fn){ return '<td style="padding:8px 10px;border-bottom:1px solid #f0f3f5;font-size:13px">'+fn(r)+'</td>'; }).join('');
        return '<tr>'+tds
          + '<td style="padding:8px 10px;border-bottom:1px solid #f0f3f5;text-align:right">'
          + '<button class="btn btn-success btn-sm" onclick="rbRestore(\''+kind+'\',\''+_rbEsc(r.id)+'\',this)">↩ Restore</button></td></tr>';
      }).join('');
      return '<div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">'
        + '<div style="padding:12px 14px;font-weight:700;border-bottom:1px solid #eceff1">'+icon+' '+_rbEsc(title)+' <span style="color:#90a4ae;font-weight:600">('+rows.length+')</span></div>'
        + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'
        + '</div>';
    }

    var html = ''
      + '<div style="color:#607d8b;font-size:13px;margin-bottom:14px">'+total+' deleted record'+(total===1?'':'s')+'. Restoring returns a record to the app for everyone.</div>';

    html += section('Quotes','💰','quote', quotes,
      ['Quote #','Customer','Job','Total','Deleted','By'],
      [ function(r){ return '<b style="color:#1565c0">'+_rbEsc(r.quote_number||'')+'</b>'; },
        function(r){ return _rbEsc(r.customer_name||''); },
        function(r){ return _rbEsc(r.job_name||''); },
        function(r){ return r.total_sell!=null ? '$'+Number(r.total_sell).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : ''; },
        function(r){ return _rbEsc(_rbDate(r.deleted_at)); },
        function(r){ return _rbEsc(by(r.deleted_by)); } ]);

    html += section('Customers','🏢','customer', custs,
      ['Name','Company','Deleted','By'],
      [ function(r){ return '<b>'+_rbEsc(r.name||'')+'</b>'; },
        function(r){ return _rbEsc(r.company||''); },
        function(r){ return _rbEsc(_rbDate(r.deleted_at)); },
        function(r){ return _rbEsc(by(r.deleted_by)); } ]);

    html += section('Contacts','👤','contact', conts,
      ['Name','Deleted','By'],
      [ function(r){ return '<b>'+_rbEsc(r.name||'')+'</b>'; },
        function(r){ return _rbEsc(_rbDate(r.deleted_at)); },
        function(r){ return _rbEsc(by(r.deleted_by)); } ]);

    html += section('Jobs','🧰','job', jobs,
      ['Name','Deleted','By'],
      [ function(r){ return '<b>'+_rbEsc(r.name||'')+'</b>'; },
        function(r){ return _rbEsc(_rbDate(r.deleted_at)); },
        function(r){ return _rbEsc(by(r.deleted_by)); } ]);

    // SD-6: deleted time entries. Note deleted_by here is stored as a NAME string (set by
    // deleteTimeEntry), not a profile uuid, so it's shown directly rather than via by().
    html += section('Time Entries','⏱','timeEntry', tents,
      ['Tech','Date','Type','Hours','Deleted','By'],
      [ function(r){ return '<b>'+_rbEsc(r.tech_name||'')+'</b>'; },
        function(r){ return _rbEsc(r.entry_date||''); },
        function(r){ return _rbEsc(r.entry_type||''); },
        function(r){ return r.total_hours!=null ? _rbEsc(r.total_hours)+' h' : ''; },
        function(r){ return _rbEsc(_rbDate(r.deleted_at)); },
        function(r){ return _rbEsc(r.deleted_by||'—'); } ]);

    el.innerHTML = html;
  } catch(e){
    el.innerHTML = '<div class="card" style="text-align:center;padding:40px;color:#c62828">Could not load the Recycle Bin: '+_rbEsc(String(e))+'</div>';
  }
}

// One-click restore via the authorized RPC. Also clears any local tombstone so the
// next pull doesn't re-hide the record, then pulls so it reappears in the app.
async function rbRestore(kind, id, btn){
  var rpcMap  = { quote:'restore_quote', customer:'restore_customer', contact:'restore_contact', job:'restore_job', timeEntry:'restore_time_entry' };
  var tombMap = { quote:'quotes', customer:'customers', contact:'contacts', job:'jobs', timeEntry:'timeEntries' };
  var rpc = rpcMap[kind]; if (!rpc || !_sb) return;
  if (btn){ btn.disabled = true; btn.textContent = 'Restoring…'; }
  try {
    var r = await _sb.rpc(rpc, { p_id: id });
    if (r && r.error) {
      if (btn){ btn.disabled=false; btn.textContent='↩ Restore'; }
      showToast('Restore failed: '+r.error.message, 'error', 6000);
      return;
    }
    var tomb = tombMap[kind];
    if (DB.deletedIds && DB.deletedIds[tomb]) {
      DB.deletedIds[tomb] = DB.deletedIds[tomb].filter(function(x){ return String(x) !== String(id); });
    }
    saveDB();
    showToast('Restored ✓', 'success');
    if (typeof syncAllFromCloud === 'function') { try { await syncAllFromCloud(true); } catch(e){} }
    renderRecycleBin();
  } catch(e){
    if (btn){ btn.disabled=false; btn.textContent='↩ Restore'; }
    showToast('Restore failed: '+String(e), 'error', 6000);
  }
}
