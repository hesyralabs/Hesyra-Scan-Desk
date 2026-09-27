const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'orders.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS clinics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clinicUsername TEXT DEFAULT '',
    portalId TEXT DEFAULT '',
    primaryDoctorName TEXT NOT NULL,
    clinicName TEXT NOT NULL,
    partnerDoctors TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT DEFAULT 'N/A',
    fullAddress TEXT,
    city TEXT DEFAULT 'Nagpur',
    state TEXT DEFAULT 'Maharashtra',
    pinCode TEXT,
    creditDays TEXT DEFAULT '15',
    internalNotes TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT UNIQUE NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    deliveryDeadline TEXT NOT NULL,
    
    clinicId INTEGER,
    clinicUsername TEXT DEFAULT '',
    portalId TEXT DEFAULT '',
    clinicName TEXT NOT NULL,
    primaryDoctorName TEXT NOT NULL,
    clinicPhone TEXT,
    clinicCity TEXT,
    
    patientName TEXT NOT NULL,
    patientAge TEXT NOT NULL,
    patientSex TEXT NOT NULL,
    patientRefId TEXT DEFAULT '',
    consultantDoctor TEXT,
    consultantPhone TEXT,
    
    items TEXT NOT NULL,
    totalUnits INTEGER DEFAULT 1,
    primaryProduct TEXT,
    primaryPlan TEXT,
    toothNumbers TEXT,
    shade TEXT,
    
    clinicalNotes TEXT,
    
    techName TEXT DEFAULT 'Field Tech',
    techPhone TEXT,
    scannerModel TEXT DEFAULT 'Medit i700',
    scanLink TEXT,
    photos TEXT,
    
    status TEXT DEFAULT 'Scanned',
    statusNotes TEXT,
    dispatchedAt TEXT,
    deliveredAt TEXT,
    googleSynced INTEGER DEFAULT 0,
    googleSyncedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Auto-seed default approved clinics if table is empty (e.g. on fresh cloud deployment)
const clinicCount = db.prepare('SELECT COUNT(*) as cnt FROM clinics').get().cnt;
if (clinicCount === 0) {
  const seedClinics = [
    {
      primaryDoctorName: 'Dr Siddharth Baror',
      clinicName: 'Apollo Dental Nagpur',
      partnerDoctors: '',
      phone: '+9188558 16951',
      email: '',
      gstin: '27BMRPB4693Q1Z3',
      fullAddress: 'ground floor, plot 1A, W High Ct Rd, opposite neeri bus stop, Laxminagar, Nagpur, Maharashtra 440022',
      city: 'Nagpur',
      state: 'Maharashtra',
      pinCode: '440022',
      creditDays: '15',
      internalNotes: ''
    },
    {
      primaryDoctorName: 'Dr Rahul',
      clinicName: 'Rahul Dental Care',
      partnerDoctors: '',
      phone: '9579967420',
      email: '',
      gstin: 'N/A',
      fullAddress: '25, Mulla Sahib St, opposite to POLICE BOOTH, Sowcarpet, George Town, Greater Chennai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pinCode: '600001',
      creditDays: '15',
      internalNotes: ''
    }
  ];

  const nowIso = new Date().toISOString();
  const insertStmt = db.prepare(`
    INSERT INTO clinics (
      clinicUsername, portalId, primaryDoctorName, clinicName, partnerDoctors,
      phone, email, gstin, fullAddress, city, state, pinCode, creditDays, internalNotes,
      createdAt, updatedAt
    ) VALUES (
      '', '', @primaryDoctorName, @clinicName, @partnerDoctors,
      @phone, @email, @gstin, @fullAddress, @city, @state, @pinCode, @creditDays, @internalNotes,
      '${nowIso}', '${nowIso}'
    )
  `);

  for (const c of seedClinics) {
    insertStmt.run(c);
  }
}


function getDeadline48h(dateIso) {
  const d = dateIso ? new Date(dateIso) : new Date();
  d.setHours(d.getHours() + 48);
  return d.toISOString();
}

function generateOrderId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `HS-${yy}${mm}${dd}-`;

  const lastOrder = db.prepare('SELECT orderId FROM orders WHERE orderId LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`);
  let seq = 1;
  if (lastOrder && lastOrder.orderId) {
    const parts = lastOrder.orderId.split('-');
    if (parts.length >= 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num)) seq = num + 1;
    }
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

if (!getSettingStmt.get('google_sheet_webhook_url')) {
  setSettingStmt.run('google_sheet_webhook_url', '');
}
if (!getSettingStmt.get('company_name')) {
  setSettingStmt.run('company_name', 'Hesyra Dental Labs');
}

module.exports = {
  db,
  getDeadline48h,
  generateOrderId,
  getSetting: (key) => getSettingStmt.get(key)?.value,
  setSetting: (key, val) => setSettingStmt.run(key, String(val))
};
