// ── Managed Services Test Data Seed ──────────────────────────────────────────
// Run seedManagedServices() from the browser console or via the seed button
function seedManagedServices() {
  if (!DB.recurringContracts) DB.recurringContracts = [];

  var today = new Date();
  var firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  var firstNextMonth = new Date(today.getFullYear(), today.getMonth()+1, 1).toISOString().split('T')[0];
  var firstNextQ    = new Date(today.getFullYear(), today.getMonth()+3, 1).toISOString().split('T')[0];
  var firstJan      = new Date(today.getFullYear()+1, 0, 1).toISOString().split('T')[0];

  var contracts = [

    // ── PHONE EQUIPMENT ────────────────────────────────────────────────────────
    {
      id:'rc-seed-001', number:'RC-001', client:'Randolph County Schools',
      type:'Phone Equipment', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'billing@randolphcountyschools.org',
      contractStart:'2024-01-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'12 Cisco 7965 phones across 3 locations',
      lineItems:[
        {id:'li-001a', desc:'Cisco 7965 IP Phone Rental (x12)', qty:12, unitPrice:18.50},
        {id:'li-001b', desc:'Phone System Maintenance Fee',      qty:1,  unitPrice:45.00},
      ]
    },
    {
      id:'rc-seed-002', number:'RC-002', client:'Pinecrest Warehouse LLC',
      type:'Phone Equipment', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'accounting@pinecrestwarehouse.com',
      contractStart:'2023-06-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Polycom conference rooms + desk phones',
      lineItems:[
        {id:'li-002a', desc:'Polycom VVX 411 Desk Phone Rental (x8)', qty:8,  unitPrice:22.00},
        {id:'li-002b', desc:'Polycom Trio 8500 Conference Phone (x2)', qty:2,  unitPrice:55.00},
        {id:'li-002c', desc:'Phone System Support',                    qty:1,  unitPrice:60.00},
      ]
    },
    {
      id:'rc-seed-003', number:'RC-003', client:'Oasis at Surfside',
      type:'Phone Equipment', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:false, deliveryMethod:'mail',
      clientEmail:'', contractStart:'2022-03-01', contractEnd:'',
      nextBillingDate:firstThisMonth, lastBilledDate:'',
      notes:'Month-to-month — client requested paper invoices',
      lineItems:[
        {id:'li-003a', desc:'Cisco 8841 IP Phone Rental (x6)', qty:6, unitPrice:24.00},
        {id:'li-003b', desc:'Auto-Attendant / IVR Hosting',    qty:1, unitPrice:35.00},
      ]
    },
    {
      id:'rc-seed-004', number:'RC-004', client:'Blue Ridge Medical Center',
      type:'Phone Equipment', billingCycle:'quarterly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'ap@blueridgemedical.com',
      contractStart:'2023-01-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Large clinic — 24 phones + overhead paging',
      lineItems:[
        {id:'li-004a', desc:'Cisco 7965 IP Phone Rental (x24)',  qty:24, unitPrice:18.50},
        {id:'li-004b', desc:'Overhead Paging System Maintenance', qty:1,  unitPrice:120.00},
        {id:'li-004c', desc:'Quarterly On-Site Support Visit',    qty:1,  unitPrice:250.00},
      ]
    },
    {
      id:'rc-seed-005', number:'RC-005', client:'Uwharrie National Bank — Asheboro',
      type:'Phone Equipment', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'facilities@uwharriebank.com',
      contractStart:'2021-09-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Branch location — check with main branch before any changes',
      lineItems:[
        {id:'li-005a', desc:'Polycom VVX 501 Phone Rental (x10)', qty:10, unitPrice:26.00},
        {id:'li-005b', desc:'Call Recording Module',              qty:1,  unitPrice:40.00},
        {id:'li-005c', desc:'Monthly Maintenance',                qty:1,  unitPrice:55.00},
      ]
    },

    // ── VOIP ───────────────────────────────────────────────────────────────────
    {
      id:'rc-seed-006', number:'RC-006', client:'Randolph County Schools',
      type:'VoIP', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'billing@randolphcountyschools.org',
      contractStart:'2024-01-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'SIP trunking — 30 concurrent call paths',
      lineItems:[
        {id:'li-006a', desc:'SIP Trunk Lines (x30)',        qty:30, unitPrice:8.50},
        {id:'li-006b', desc:'DID Numbers (x45)',            qty:45, unitPrice:1.50},
        {id:'li-006c', desc:'VoIP Platform Management Fee', qty:1,  unitPrice:75.00},
      ]
    },
    {
      id:'rc-seed-007', number:'RC-007', client:'Asheboro City Hall',
      type:'VoIP', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'mail',
      clientEmail:'', contractStart:'2022-07-01', contractEnd:'',
      nextBillingDate:firstThisMonth, lastBilledDate:'',
      notes:'Government account — paper invoice required by procurement policy',
      lineItems:[
        {id:'li-007a', desc:'VoIP Business Lines (x20)',    qty:20, unitPrice:12.00},
        {id:'li-007b', desc:'Emergency 911 Compliance Fee', qty:1,  unitPrice:25.00},
        {id:'li-007c', desc:'VoIP Support & Monitoring',    qty:1,  unitPrice:95.00},
      ]
    },
    {
      id:'rc-seed-008', number:'RC-008', client:'Triad Dental Group',
      type:'VoIP', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'office@triaddental.com',
      contractStart:'2023-11-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Multi-location — 2 offices on same trunk group',
      lineItems:[
        {id:'li-008a', desc:'VoIP Lines (x12)',             qty:12, unitPrice:11.00},
        {id:'li-008b', desc:'Voicemail-to-Email (x12)',     qty:12, unitPrice:2.00},
        {id:'li-008c', desc:'Auto-Attendant Hosting',       qty:1,  unitPrice:30.00},
      ]
    },
    {
      id:'rc-seed-009', number:'RC-009', client:'Heartland Church Ministries',
      type:'VoIP', billingCycle:'quarterly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'admin@heartlandchurch.org',
      contractStart:'2023-04-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Non-profit rate applied',
      lineItems:[
        {id:'li-009a', desc:'VoIP Lines (x8)',             qty:8, unitPrice:9.00},
        {id:'li-009b', desc:'Quarterly Support',           qty:1, unitPrice:85.00},
      ]
    },

    // ── COMPUTER SERVICES ──────────────────────────────────────────────────────
    {
      id:'rc-seed-010', number:'RC-010', client:'Piedmont Manufacturing Co.',
      type:'Computer Services', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'it@piedmontmfg.com',
      contractStart:'2023-08-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Server monitoring + workstation patching — 40 endpoints',
      lineItems:[
        {id:'li-010a', desc:'Managed Endpoint Protection (x40)',   qty:40, unitPrice:8.00},
        {id:'li-010b', desc:'Server Monitoring (x3 servers)',      qty:3,  unitPrice:45.00},
        {id:'li-010c', desc:'Patch Management & Updates',          qty:1,  unitPrice:75.00},
        {id:'li-010d', desc:'Cloud Backup — 2TB',                  qty:1,  unitPrice:40.00},
      ]
    },
    {
      id:'rc-seed-011', number:'RC-011', client:'First Choice Realty',
      type:'Computer Services', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'broker@firstchoicerealty.com',
      contractStart:'2024-03-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Small office — 8 workstations + Office 365',
      lineItems:[
        {id:'li-011a', desc:'Microsoft 365 Business (x8)',      qty:8, unitPrice:22.00},
        {id:'li-011b', desc:'Managed Antivirus (x8)',           qty:8, unitPrice:5.00},
        {id:'li-011c', desc:'Remote Support Subscription',      qty:1, unitPrice:65.00},
      ]
    },
    {
      id:'rc-seed-012', number:'RC-012', client:'Uwharrie National Bank — Asheboro',
      type:'Computer Services', billingCycle:'annual', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'facilities@uwharriebank.com',
      contractStart:'2024-01-01', contractEnd:'2024-12-31',
      nextBillingDate:firstJan, lastBilledDate:'2024-01-01',
      notes:'Annual contract — next renewal Jan 1',
      lineItems:[
        {id:'li-012a', desc:'Annual IT Infrastructure Assessment', qty:1, unitPrice:1200.00},
        {id:'li-012b', desc:'Network Documentation Update',        qty:1, unitPrice:450.00},
        {id:'li-012c', desc:'Security Audit Report',               qty:1, unitPrice:850.00},
      ]
    },

    // ── IT SUPPORT ─────────────────────────────────────────────────────────────
    {
      id:'rc-seed-013', number:'RC-013', client:'Randolph Community College',
      type:'IT Support', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'mail',
      clientEmail:'', contractStart:'2022-01-01', contractEnd:'',
      nextBillingDate:firstThisMonth, lastBilledDate:'',
      notes:'State institution — requires mailed invoices with PO number',
      lineItems:[
        {id:'li-013a', desc:'Help Desk Support — 20 hrs/month', qty:20, unitPrice:75.00},
        {id:'li-013b', desc:'On-Site Tech Visits (included x2)', qty:2, unitPrice:0.00},
        {id:'li-013c', desc:'After-Hours Emergency Support',     qty:1, unitPrice:125.00},
      ]
    },
    {
      id:'rc-seed-014', number:'RC-014', client:'High Point Furniture Group',
      type:'IT Support', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'ap@highpointfurniture.com',
      contractStart:'2023-02-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Showroom + warehouse — different needs each location',
      lineItems:[
        {id:'li-014a', desc:'Monthly IT Support Block — 15 hrs', qty:15, unitPrice:85.00},
        {id:'li-014b', desc:'Network Monitoring',                 qty:1,  unitPrice:60.00},
      ]
    },
    {
      id:'rc-seed-015', number:'RC-015', client:'Asheboro Pediatrics',
      type:'IT Support', billingCycle:'quarterly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'office@asheboroped.com',
      contractStart:'2023-10-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'HIPAA-compliant support — document all access',
      lineItems:[
        {id:'li-015a', desc:'Quarterly System Health Check',  qty:1, unitPrice:350.00},
        {id:'li-015b', desc:'HIPAA Compliance Review',        qty:1, unitPrice:200.00},
        {id:'li-015c', desc:'Staff Security Training (online)',qty:1, unitPrice:150.00},
      ]
    },

    // ── SECURITY / ACCESS CONTROL ──────────────────────────────────────────────
    {
      id:'rc-seed-016', number:'RC-016', client:'Piedmont Manufacturing Co.',
      type:'Security / Access Control', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'it@piedmontmfg.com',
      contractStart:'2023-08-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'LenelS2 system — 6 doors + 24 cameras',
      lineItems:[
        {id:'li-016a', desc:'Access Control Monitoring (6 doors)',  qty:6,  unitPrice:15.00},
        {id:'li-016b', desc:'Camera System Monitoring (24 cameras)',qty:24, unitPrice:5.00},
        {id:'li-016c', desc:'Software License — LenelS2 OnGuard',  qty:1,  unitPrice:95.00},
        {id:'li-016d', desc:'24/7 Alert Response Service',          qty:1,  unitPrice:75.00},
      ]
    },
    {
      id:'rc-seed-017', number:'RC-017', client:'Blue Ridge Medical Center',
      type:'Security / Access Control', billingCycle:'biannual', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'ap@blueridgemedical.com',
      contractStart:'2023-07-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Bi-annual preventive maintenance visit',
      lineItems:[
        {id:'li-017a', desc:'Access Control Preventive Maintenance', qty:1, unitPrice:450.00},
        {id:'li-017b', desc:'Badge Reader Cleaning & Testing',        qty:8, unitPrice:25.00},
        {id:'li-017c', desc:'Door Hardware Inspection (x8 doors)',   qty:8, unitPrice:20.00},
      ]
    },

    // ── CAMERA SYSTEM ──────────────────────────────────────────────────────────
    {
      id:'rc-seed-018', number:'RC-018', client:'Asheboro City Hall',
      type:'Camera System', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'mail',
      clientEmail:'', contractStart:'2022-11-01', contractEnd:'',
      nextBillingDate:firstThisMonth, lastBilledDate:'',
      notes:'32-camera Axis system — cloud storage included',
      lineItems:[
        {id:'li-018a', desc:'Axis Camera Cloud Storage — 30-day (x32)', qty:32, unitPrice:6.50},
        {id:'li-018b', desc:'VMS License — Milestone XProtect',         qty:1,  unitPrice:85.00},
        {id:'li-018c', desc:'Camera System Health Monitoring',           qty:1,  unitPrice:55.00},
      ]
    },

    // ── NETWORK MAINTENANCE ────────────────────────────────────────────────────
    {
      id:'rc-seed-019', number:'RC-019', client:'Heartland Church Ministries',
      type:'Network Maintenance', billingCycle:'annual', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'admin@heartlandchurch.org',
      contractStart:'2024-01-01', contractEnd:'2024-12-31',
      nextBillingDate:firstJan, lastBilledDate:'2024-01-01',
      notes:'Annual network equipment refresh check',
      lineItems:[
        {id:'li-019a', desc:'Annual Network Equipment Audit',    qty:1, unitPrice:600.00},
        {id:'li-019b', desc:'Switch & AP Firmware Updates',      qty:1, unitPrice:300.00},
        {id:'li-019c', desc:'Wireless Coverage Assessment',      qty:1, unitPrice:400.00},
      ]
    },
    {
      id:'rc-seed-020', number:'RC-020', client:'Triad Dental Group',
      type:'Network Maintenance', billingCycle:'monthly', billingDay:1,
      status:'active', autoRenew:true, deliveryMethod:'email',
      clientEmail:'office@triaddental.com',
      contractStart:'2024-02-01', contractEnd:'', nextBillingDate:firstThisMonth,
      lastBilledDate:'', notes:'Managed router + firewall + 8 APs across 2 offices',
      lineItems:[
        {id:'li-020a', desc:'Managed Firewall — Fortinet (x1)',  qty:1, unitPrice:65.00},
        {id:'li-020b', desc:'Managed Switches (x4)',             qty:4, unitPrice:20.00},
        {id:'li-020c', desc:'Wireless AP Management (x8)',       qty:8, unitPrice:12.00},
        {id:'li-020d', desc:'Network Monitoring & Alerting',     qty:1, unitPrice:45.00},
      ]
    },
  ];

  // Always replace — ensures clean 20 contract test set
  contracts.forEach(function(c){
    c.createdAt = c.createdAt || new Date().toISOString();
  });

  // Remove any existing seed contracts and replace with fresh set
  DB.recurringContracts = (DB.recurringContracts||[]).filter(function(c){
    return !c.id.startsWith('rc-seed-');
  });
  contracts.forEach(function(c){ DB.recurringContracts.push(c); });

  saveDB();
  renderRecurring();
  showToast('Loaded 20 managed service contracts ✓','success',3000);
}
