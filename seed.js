const { db, getDeadline48h } = require('./database');

// Clear older orders to ensure clean schema alignment
db.exec('DELETE FROM orders');

const clinic = db.prepare('SELECT * FROM clinics LIMIT 1').get();

const now = new Date();
// Order 1: scanned 4 hours ago (44 hours left)
const t1 = new Date(now.getTime() - 4 * 60 * 60 * 1000);
// Order 2: scanned 26 hours ago (22 hours left)
const t2 = new Date(now.getTime() - 26 * 60 * 60 * 1000);
// Order 3: scanned 45 hours ago (3 hours left - URGENT)
const t3 = new Date(now.getTime() - 45 * 60 * 60 * 1000);
// Order 4: scanned 50 hours ago (OVERDUE by 2h)
const t4 = new Date(now.getTime() - 50 * 60 * 60 * 1000);

const sampleOrders = [
  {
    orderId: 'HS-260927-001',
    createdAt: t1.toISOString(),
    updatedAt: t1.toISOString(),
    deliveryDeadline: getDeadline48h(t1.toISOString()),
    clinicId: clinic?.id || 1,
    clinicUsername: clinic?.clinicUsername || 'MH312',
    portalId: clinic?.portalId || 'DOC-003',
    clinicName: clinic?.clinicName || 'Smile Dental Studio',
    primaryDoctorName: clinic?.primaryDoctorName || 'Dr. Aarav Deshmukh',
    clinicPhone: clinic?.phone || '+91 98221 44556',
    clinicCity: clinic?.city || 'Nagpur',
    patientName: 'Kavita Joshi',
    patientAge: '34',
    patientSex: 'Female',
    patientRefId: 'HL-PT-0004',
    consultantDoctor: 'Dr. Neha Rao (Orthodontist)',
    consultantPhone: '+91 98230 99887',
    items: JSON.stringify([
      {
        product: 'Full Contour Zirconia Crown',
        plan: 'Ultra-Translucent Monolithic (1200 MPa)',
        qty: 1,
        toothNumbers: '16',
        shade: 'A2',
        lineNote: 'Tight distal contact with #17, gentle buccal contour'
      }
    ]),
    totalUnits: 1,
    primaryProduct: 'Full Contour Zirconia Crown',
    primaryPlan: 'Ultra-Translucent Monolithic (1200 MPa)',
    toothNumbers: '16',
    shade: 'A2',
    clinicalNotes: '48h express delivery promised to patient. Shade verified chairside with VITA tab.',
    techName: 'Rahul Sharma',
    techPhone: '+91 98230 11223',
    scannerModel: 'Medit i700',
    scanLink: 'https://drive.google.com/drive/folders/hesyra-scan-16',
    photos: '[]',
    status: 'In CAD',
    statusNotes: 'CAD design in progress'
  },
  {
    orderId: 'HS-260927-002',
    createdAt: t2.toISOString(),
    updatedAt: t2.toISOString(),
    deliveryDeadline: getDeadline48h(t2.toISOString()),
    clinicId: clinic?.id || 1,
    clinicUsername: 'MH108',
    portalId: 'DOC-001',
    clinicName: 'Bansod Dental Care & Implant Clinic',
    primaryDoctorName: 'Dr. Anand Bansod',
    clinicPhone: '+91 98221 00011',
    clinicCity: 'Nagpur',
    patientName: 'Sunil Deshpande',
    patientAge: '48',
    patientSex: 'Male',
    patientRefId: 'HL-PT-0005',
    consultantDoctor: '',
    consultantPhone: '',
    items: JSON.stringify([
      {
        product: 'Zirconia Multi-Layer Crown (Aesthetic)',
        plan: 'Aesthetic Multi-Layer Gradient',
        qty: 3,
        toothNumbers: '24, 25, 26',
        shade: 'A3',
        lineNote: '24 Abutment, 25 Pontic, 26 Abutment (Bridge)'
      }
    ]),
    totalUnits: 3,
    primaryProduct: 'Zirconia Multi-Layer Crown (Aesthetic)',
    primaryPlan: 'Aesthetic Multi-Layer Gradient',
    toothNumbers: '24, 25, 26',
    shade: 'A3',
    clinicalNotes: 'Check tight occlusion. Modified ridge lap pontic design.',
    techName: 'Amit Wankhede',
    techPhone: '+91 98231 44556',
    scannerModel: '3Shape TRIOS',
    scanLink: 'https://drive.google.com/drive/folders/hesyra-scan-24-26',
    photos: '[]',
    status: 'In Milling',
    statusNotes: 'Nested on VHF milling disc'
  },
  {
    orderId: 'HS-260926-003',
    createdAt: t3.toISOString(),
    updatedAt: t3.toISOString(),
    deliveryDeadline: getDeadline48h(t3.toISOString()),
    clinicId: clinic?.id || 1,
    clinicUsername: 'MH205',
    portalId: 'DOC-002',
    clinicName: 'Smile Ortho & Aesthetic Centre',
    primaryDoctorName: 'Dr. Arushi Beri',
    clinicPhone: '+91 98221 00022',
    clinicCity: 'Nagpur',
    patientName: 'Rohan Mehra',
    patientAge: '27',
    patientSex: 'Male',
    patientRefId: 'HL-PT-0006',
    consultantDoctor: '',
    consultantPhone: '',
    items: JSON.stringify([
      {
        product: 'IPS e.max CAD Crown / Veneer',
        plan: 'Premium High-Aesthetic',
        qty: 2,
        toothNumbers: '11, 21',
        shade: 'BL2',
        lineNote: 'Anterior smile makeover, follow natural mamelons'
      }
    ]),
    totalUnits: 2,
    primaryProduct: 'IPS e.max CAD Crown / Veneer',
    primaryPlan: 'Premium High-Aesthetic',
    toothNumbers: '11, 21',
    shade: 'BL2',
    clinicalNotes: 'URGENT: Patient trial scheduled tomorrow at 11 AM.',
    techName: 'Rahul Sharma',
    techPhone: '+91 98230 11223',
    scannerModel: 'Shining 3D Aoralscan',
    scanLink: 'https://drive.google.com/drive/folders/hesyra-veneer-11-21',
    photos: '[]',
    status: 'QC Passed',
    statusNotes: 'QC passed, glaze completed'
  }
];

const insertOrder = db.prepare(`
  INSERT INTO orders (
    orderId, createdAt, updatedAt, deliveryDeadline,
    clinicId, clinicUsername, portalId, clinicName, primaryDoctorName, clinicPhone, clinicCity,
    patientName, patientAge, patientSex, patientRefId, consultantDoctor, consultantPhone,
    items, totalUnits, primaryProduct, primaryPlan, toothNumbers, shade,
    clinicalNotes, techName, techPhone, scannerModel, scanLink, photos,
    status, statusNotes
  ) VALUES (
    @orderId, @createdAt, @updatedAt, @deliveryDeadline,
    @clinicId, @clinicUsername, @portalId, @clinicName, @primaryDoctorName, @clinicPhone, @clinicCity,
    @patientName, @patientAge, @patientSex, @patientRefId, @consultantDoctor, @consultantPhone,
    @items, @totalUnits, @primaryProduct, @primaryPlan, @toothNumbers, @shade,
    @clinicalNotes, @techName, @techPhone, @scannerModel, @scanLink, @photos,
    @status, @statusNotes
  )
`);

for (const o of sampleOrders) {
  insertOrder.run(o);
}

console.log('Seeded sample orders with 48h timers.');
