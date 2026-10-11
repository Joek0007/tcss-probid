// ============================================================
// wo-veh-selftest.js — self-test for "edit a vehicle from a Work Order → WO refreshes"
// ------------------------------------------------------------
// Verifies refreshWOVehicleFields() updates the WO's displayed vehicle label when the
// vehicle's number/name changes, honors number-over-name precedence, and no-ops when the
// WO is on a different vehicle.
//
// Zero footprint: a throwaway in-memory vehicle that is NEVER saved to disk or the cloud;
// removed afterward; the WO form's prior vehicle fields captured and restored. Synchronous.
//
// HOW TO RUN: open a Work Order (editor mounted), then in the console type:  woVehSelfTest()
// ============================================================
(function(){
  function qv(id){ var el=document.getElementById(id); return el ? (el.value||'') : '(no field)'; }
  function setv(id,v){ var el=document.getElementById(id); if(el) el.value=v; }

  function woVehSelfTest(){
    if (typeof refreshWOVehicleFields !== 'function') {
      return { error: 'refreshWOVehicleFields not loaded.' };
    }
    if (!document.getElementById('wo-vehicle-id') || !document.getElementById('wo-vehicle-name')) {
      return { error: 'Open a Work Order first (WO vehicle fields not found).' };
    }
    var R=[]; function A(label,exp,got){ R.push({ field:label, expected:String(exp), got:String(got), pass:String(got)===String(exp) }); }
    if(!DB.vehicles) DB.vehicles=[];

    var prev = { vid:qv('wo-vehicle-id'), vname:qv('wo-vehicle-name') };
    var TID='t'+Date.now();
    var veh={ id:'vehtest-'+TID, number:'TRUCK-OLD', name:'Old Name', isActive:true };
    DB.vehicles.push(veh);

    try{
      setv('wo-vehicle-id',veh.id); setv('wo-vehicle-name','STALE LABEL');

      // 1) number change propagates
      veh.number='TRUCK-99';
      refreshWOVehicleFields(veh.id);
      A('Vehicle number updates', 'TRUCK-99', qv('wo-vehicle-name'));

      // 2) number takes precedence over name
      veh.number='TRUCK-123'; veh.name='Should Not Show';
      refreshWOVehicleFields(veh.id);
      A('Number wins over name', 'TRUCK-123', qv('wo-vehicle-name'));

      // 3) falls back to name when number is blank
      veh.number=''; veh.name='Van B';
      refreshWOVehicleFields(veh.id);
      A('Falls back to name', 'Van B', qv('wo-vehicle-name'));

      // 4) no-op when the WO is on a different vehicle
      setv('wo-vehicle-id','some-other-veh'); setv('wo-vehicle-name','KEEP ME');
      refreshWOVehicleFields(veh.id);
      A('No-op when WO on other vehicle', 'KEEP ME', qv('wo-vehicle-name'));
    } catch(e){ R.push({ field:'EXCEPTION', expected:'none', got:(e&&e.message)||String(e), pass:false }); }
    finally{
      DB.vehicles = DB.vehicles.filter(function(v){ return v.id!==veh.id; });
      setv('wo-vehicle-id',prev.vid); setv('wo-vehicle-name',prev.vname);
    }

    var fails=R.filter(function(x){ return !x.pass; });
    try { console.table(R); } catch(e){}
    var out={ passed:R.length-fails.length, failed:fails.length, total:R.length,
      failures: fails.map(function(x){ return x.field+': expected "'+x.expected+'" got "'+x.got+'"'; }),
      all: R.map(function(x){ return (x.pass?'PASS ':'FAIL ')+x.field; }) };
    try { console.log('[woVehSelfTest]', out.passed+'/'+out.total+' passed'+(out.failed?(' — FAILURES: '+out.failures.join(' | ')):' — all good')); } catch(e){}
    return out;
  }
  window.woVehSelfTest = woVehSelfTest;
})();
