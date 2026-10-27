// Reusable in-memory stand-in for the Supabase client, for proving handlers through without a
// real backend. It stores rows, supports the query chains the app uses
// (.from().insert()/.update()/.delete()/.select().eq().is().gte().lte().order().limit().single()),
// and records every operation for assertions. Browser global: window.makeFakeSupabase.
//
// NOTE: this fakes the CALL SHAPE and in-memory data only. It does NOT enforce RLS, constraints,
// triggers, or types — real DB behavior still needs a live check. Its job is to catch handler
// logic bugs (missing/incorrect writes, bad round-trips), which is where this app's pain has been.
(function(global){
  function makeFakeSupabase(seed){
    var store = {};                 // { tableName: [row, ...] }
    (seed && Object.keys(seed) || []).forEach(function(t){ store[t] = (seed[t]||[]).map(function(r){ return Object.assign({}, r); }); });
    var ops = [];                   // recorded operations, in order
    var idCounter = 0;

    function matches(row, filters){
      return filters.every(function(f){
        var v = row[f.col];
        if (f.kind==='eq')  return v === f.val;
        if (f.kind==='is')  return v === f.val;       // used for IS NULL (f.val === null)
        if (f.kind==='gte') return v != null && v >= f.val;
        if (f.kind==='lte') return v != null && v <= f.val;
        if (f.kind==='neq') return v !== f.val;
        return true;
      });
    }

    function Query(table){
      this.table = table;
      this._op = null;              // 'insert' | 'update' | 'delete' | 'select'
      this._payload = null;
      this._filters = [];
      this._order = null;
      this._limit = null;
      this._single = false;
      this._returning = false;      // .select() was called on a write
    }
    Query.prototype.insert = function(rows){ this._op='insert'; this._payload = Array.isArray(rows)?rows:[rows]; return this; };
    Query.prototype.update = function(patch){ this._op='update'; this._payload = patch; return this; };
    Query.prototype.delete = function(){ this._op='delete'; return this; };
    Query.prototype.select = function(cols){ if(!this._op) this._op='select'; this._returning=true; this._cols=cols; return this; };
    Query.prototype.eq  = function(c,v){ this._filters.push({kind:'eq', col:c, val:v}); return this; };
    Query.prototype.is  = function(c,v){ this._filters.push({kind:'is', col:c, val:v}); return this; };
    Query.prototype.neq = function(c,v){ this._filters.push({kind:'neq',col:c, val:v}); return this; };
    Query.prototype.gte = function(c,v){ this._filters.push({kind:'gte',col:c, val:v}); return this; };
    Query.prototype.lte = function(c,v){ this._filters.push({kind:'lte',col:c, val:v}); return this; };
    Query.prototype.order = function(c,opts){ this._order={col:c, asc: !opts || opts.ascending!==false}; return this; };
    Query.prototype.limit = function(n){ this._limit=n; return this; };
    Query.prototype.single = function(){ this._single=true; return this; };

    Query.prototype._run = function(){
      if(!store[this.table]) store[this.table]=[];
      var rows = store[this.table];
      var result = {data:null, error:null};
      var opRec = {table:this.table, type:this._op, filters:this._filters.slice()};

      if (this._op==='insert'){
        var inserted = this._payload.map(function(r){
          var row = Object.assign({}, r);
          if (row.id===undefined || row.id===null) row.id = 'row_'+(++idCounter);
          rows.push(row);
          return row;
        });
        opRec.rows = inserted;
        if (this._returning) result.data = this._single ? inserted[0] : inserted;
      } else if (this._op==='update'){
        var self=this, changed=[];
        rows.forEach(function(row){ if(matches(row, self._filters)){ Object.assign(row, self._payload); changed.push(row); } });
        opRec.patch = this._payload; opRec.changed = changed.length;
        if (this._returning) result.data = this._single ? (changed[0]||null) : changed;
      } else if (this._op==='delete'){
        var before=rows.length, keep=[]; var f=this._filters;
        store[this.table] = rows.filter(function(row){ return !matches(row, f); });
        opRec.deleted = before - store[this.table].length;
      } else { // select
        var self2=this;
        var out = rows.filter(function(row){ return matches(row, self2._filters); });
        if (this._order){ var o=this._order; out = out.slice().sort(function(a,b){ var av=a[o.col], bv=b[o.col]; if(av===bv) return 0; return (av>bv?1:-1)*(o.asc?1:-1); }); }
        if (this._limit!=null) out = out.slice(0, this._limit);
        result.data = this._single ? (out[0]||null) : out;
      }
      ops.push(opRec);
      return result;
    };
    // thenable: `await _sb.from(t)...` resolves {data,error}
    Query.prototype.then = function(resolve, reject){
      try { resolve(this._run()); } catch(e){ if(reject) reject(e); else throw e; }
    };

    return {
      from: function(table){ return new Query(table); },
      _store: store,
      _ops: ops,
      _rows: function(t){ return (store[t]||[]).slice(); },
      _reset: function(){ ops.length=0; }
    };
  }
  global.makeFakeSupabase = makeFakeSupabase;
  if (typeof module!=='undefined' && module.exports) module.exports = { makeFakeSupabase: makeFakeSupabase };
})(typeof window!=='undefined'?window:globalThis);
