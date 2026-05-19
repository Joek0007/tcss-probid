// TCSS ProBid — Team Seed Script
// Paste this entire block into the browser console while logged into ProBid
// It will ADD employees that don't already exist (matches by email) and skip duplicates
(function() {
  var employees = [
    { name:'Joe Kucinski',         role:'Owner',              email:'joek@tcss.com',                      phone:'336-736-6507' },
    { name:'Jordan Davis',         role:'Owner',              email:'jordand@tcss.com',                   phone:'252-314-8370' },
    { name:'Dawn Brown',           role:'Office Manager',     email:'dawnb@tcss.com',                     phone:'919-214-1186' },
    { name:'Lisa Lammonds',        role:'Office Assistant',   email:'lisam@tcss.com',                     phone:'336-257-4725' },
    { name:'Victoria Davis',       role:'Financial Manager',  email:'Victoriad@tcss.com',                 phone:'336-302-3979' },
    { name:'Evan Morris',          role:'Project Management', email:'evanm@tcss.com',                     phone:'336-447-8507' },
    { name:'Chris Jackson',        role:'Lead Technician',    email:'chrisj@tcss.com',                    phone:'336-964-5476' },
    { name:'David Corona',         role:'Technician',         email:'corona.david179@icloud.com',         phone:'336-483-5677' },
    { name:'Ernie Johnson',        role:'Lead Technician',    email:'erniej@tcss.com',                    phone:'336-736-6490' },
    { name:'Aron Smith',           role:'Technician',         email:'thescavenger514@gmail.com',          phone:'336-615-2690' },
    { name:'Tyler Turner',         role:'Technician',         email:'tylergsp@aol.com',                   phone:'781-361-2724' },
    { name:'Caleb Thomas',         role:'Technician',         email:'icvleb@gmail.com',                   phone:'336-257-2456' },
    { name:'John Wilson',          role:'Technician',         email:'spam3@tcss.com',                     phone:'828-747-8116' },
    { name:'Chad Fulghum',         role:'Technician',         email:'cfulghum1497@gmail.com',             phone:'336-780-0434' },
    { name:'Irving Velazquez-Luna',role:'Technician',         email:'irvingvelazquezluna@gmail.com',      phone:'336-521-2942' },
    { name:'Isai Ramirez',         role:'Technician',         email:'isaikitzapata@gmail.com',            phone:'336-624-2372' },
    { name:'Jonathan Scarberry',   role:'Technician',         email:'jscarberry20190@yahoo.com',          phone:'336-523-8881' },
    { name:'Michael Collins',      role:'Technician',         email:'michaelcollins1781799@gmail.com',    phone:'336-906-3693' },
    { name:'Rashun Allmond',       role:'Technician',         email:'rashunallmond33@icloud.com',         phone:'336-460-5158' },
    { name:'Marcus Pineda',        role:'Technician',         email:'pinedmarcus45@yahoo.com',            phone:'830-499-2470' },
    { name:'Larry Voncannon',      role:'Maintenance',        email:'larry.voncannon@gmail.com',          phone:'336-267-1403' }
  ];

  if (!window.DB || !Array.isArray(DB.team)) {
    console.error('ProBid DB not found — make sure you are logged in first.');
    return;
  }

  var added = 0, skipped = 0;
  employees.forEach(function(emp) {
    var exists = DB.team.find(function(t) {
      return (t.email||'').toLowerCase() === (emp.email||'').toLowerCase();
    });
    if (exists) { skipped++; return; }
    DB.team.push({
      id:          'tm-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
      name:        emp.name,
      role:        emp.role,
      phone:       emp.phone,
      email:       emp.email,
      rate:        65,
      hireDate:    '',
      showVacation: false,
      showPTO:      false
    });
    added++;
  });

  if (typeof saveDB === 'function') saveDB();
  if (typeof renderTeam === 'function') renderTeam();
  console.log('✅ Team seed complete — Added: ' + added + ', Skipped (already exist): ' + skipped);
  if (typeof showToast === 'function') showToast('Team loaded — ' + added + ' added, ' + skipped + ' skipped', 'success');
})();
