// Test: checkout MUST be assigned to an active Team-roster person (fix hj, 2026-11-14)
// Mirrors the exact resolution logic added to saveCheckoutModal: office resolves the picked roster
// id; a tech resolves to their own roster record by email then name; no match => checkout blocked.

var pass=0, fail=0;
function ok(n,c){ if(c){pass++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n);} }

// ---- real helpers copied verbatim from tools.js ----
function _tlNorm(s){ return String(s==null?'':s).trim().toLowerCase(); }
function _tlTeamByAny(v, team){
  var vv=_tlNorm(v); if(!vv) return null;
  return (team||[]).find(function(m){ return String(m.id)===String(v) || _tlNorm(m.name)===vv || _tlNorm(m.email)===vv; }) || null;
}
// resolution branch copied from saveCheckoutModal (office vs tech)
function resolveCheckoutMember(opts){
  var team=opts.team, actForOthers=opts.actForOthers, selectVal=opts.selectVal, myEmail=opts.myEmail, myName=opts.myName;
  var member;
  if (actForOthers) {
    member = _tlTeamByAny(selectVal, team);
    if (!member) return { blocked:'Pick who is taking this tool' };
  } else {
    member = _tlTeamByAny(myEmail, team) || _tlTeamByAny(myName, team);
    if (!member) return { blocked:'You are not on the Team roster' };
  }
  var toName=(member.name||'').trim();
  if (!toName) return { blocked:'roster person has no name' };
  return { member:member, toName:toName, memberId:member.id };
}

var TEAM = [
  { id:'tm-1', name:'Lisa Lammonds', email:'lisal@tcss.com' },
  { id:'tm-2', name:'Perry Tech',    email:'perryt@tcss.com' }
];

// ---- OFFICE path (actForOthers = true) ----
var o_blank = resolveCheckoutMember({team:TEAM, actForOthers:true, selectVal:''});
ok('office: blank selection is BLOCKED (no checkout to no one)', !!o_blank.blocked);

var o_pick = resolveCheckoutMember({team:TEAM, actForOthers:true, selectVal:'tm-2'});
ok('office: picking a roster id resolves to that person', o_pick.toName==='Perry Tech' && o_pick.memberId==='tm-2' && !o_pick.blocked);

var o_bogus = resolveCheckoutMember({team:TEAM, actForOthers:true, selectVal:'tm-999'});
ok('office: a non-roster id is BLOCKED', !!o_bogus.blocked);

// ---- TECH path (actForOthers = false) — must be themselves AND on the roster ----
var t_ok = resolveCheckoutMember({team:TEAM, actForOthers:false, myEmail:'perryt@tcss.com', myName:'Perry Tech'});
ok('tech on roster (email match) resolves to self', t_ok.toName==='Perry Tech' && t_ok.memberId==='tm-2' && !t_ok.blocked);

var t_namematch = resolveCheckoutMember({team:TEAM, actForOthers:false, myEmail:'nomatch@x.com', myName:'Lisa Lammonds'});
ok('tech on roster (name fallback) resolves to self', t_namematch.memberId==='tm-1' && !t_namematch.blocked);

var t_notroster = resolveCheckoutMember({team:TEAM, actForOthers:false, myEmail:'ghost@x.com', myName:'Ghost Tech'});
ok('tech NOT on roster is BLOCKED', !!t_notroster.blocked);

var t_noname = resolveCheckoutMember({team:[{id:'tm-x',name:'',email:'x@x.com'}], actForOthers:false, myEmail:'x@x.com', myName:''});
ok('roster entry with no name is BLOCKED', !!t_noname.blocked);

console.log('\n'+(fail===0?'ALL PASS':fail+' FAILED')+' ('+pass+' passed)');
process.exit(fail===0?0:1);
