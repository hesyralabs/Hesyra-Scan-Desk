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
    
    techName TEXT DEFAULT 'Valaya',
    techPhone TEXT,
    scannerModel TEXT DEFAULT 'Medit i700',
    scanLink TEXT,
    photos TEXT,
    
    status TEXT DEFAULT 'Scanned',
    statusNotes TEXT,
    dispatchedAt TEXT,
    deliveredAt TEXT,
    googleSynced INTEGER DEFAULT 0,
    googleSyncedAt TEXT,
    isArchived INTEGER DEFAULT 0,
    archivedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    salt TEXT NOT NULL,
    fullName TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    active INTEGER DEFAULT 1,
    createdAt TEXT NOT NULL
  );

  


  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    username TEXT NOT NULL,
    fullName TEXT NOT NULL,
    role TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    expiresAt TEXT NOT NULL
  );

`);

// Migrations: Ensure isArchived and archivedAt columns exist
try {
  db.exec("ALTER TABLE orders ADD COLUMN isArchived INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE orders ADD COLUMN archivedAt TEXT");
} catch (e) {}

// Auto-archive sync helper: All cases past their 48-hour delivery deadline are archived
function syncArchivedOrders() {
  try {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE orders
      SET isArchived = 1, archivedAt = COALESCE(archivedAt, ?)
      WHERE isArchived = 0 AND deliveryDeadline < ?
    `).run(nowIso, nowIso);
  } catch (err) {
    console.warn('[Archive Sync Notice]:', err.message);
  }
}

// Run initial archive check
syncArchivedOrders();

// Database Normalization Migration: Crowns strictly Zirconia Crown or Ceramic Crown
try {
  db.prepare("UPDATE orders SET primaryProduct = 'Zirconia Crown', primaryPlan = '-' WHERE primaryProduct = 'Permanent Crown' AND (clinicalNotes LIKE '%ZC%' OR toothNumbers LIKE '%35%' OR toothNumbers LIKE '%15, 16%' OR patientName = 'Martand Raghuvanshi' OR patientName = 'Riya')").run();
  db.prepare("UPDATE orders SET primaryProduct = 'Ceramic Crown', primaryPlan = '-' WHERE primaryProduct = 'Permanent Crown'").run();
  db.prepare("UPDATE orders SET toothNumbers = REPLACE(toothNumbers, '#', '') WHERE toothNumbers LIKE '#%'").run();
} catch (e) {}


// Auto-seed default approved clinics & cases if table is empty (e.g. on fresh cloud deployment)
try {
  const fs = require('fs');
  const path = require('path');
  const seedFile = path.join(__dirname, 'seedData.json');

  if (fs.existsSync(seedFile)) {
    const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

    const clinicCount = db.prepare('SELECT COUNT(*) as cnt FROM clinics').get().cnt;
    if (clinicCount === 0 && Array.isArray(seedData.clinics)) {
      const insertClinic = db.prepare(`
        INSERT INTO clinics (
          clinicUsername, portalId, primaryDoctorName, clinicName, partnerDoctors,
          phone, email, gstin, fullAddress, city, state, pinCode, creditDays, internalNotes,
          createdAt, updatedAt
        ) VALUES (
          @clinicUsername, @portalId, @primaryDoctorName, @clinicName, @partnerDoctors,
          @phone, @email, @gstin, @fullAddress, @city, @state, @pinCode, @creditDays, @internalNotes,
          @createdAt, @updatedAt
        )
      `);
      for (const c of seedData.clinics) {
        insertClinic.run(c);
      }
      console.log(`[Database Seed] Seeded ${seedData.clinics.length} clinics.`);
    }

    const orderCount = db.prepare('SELECT COUNT(*) as cnt FROM orders').get().cnt;
    if (orderCount === 0 && Array.isArray(seedData.orders)) {
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          orderId, createdAt, updatedAt, deliveryDeadline,
          clinicId, clinicUsername, portalId, clinicName, primaryDoctorName, clinicPhone, clinicCity,
          patientName, patientAge, patientSex, patientRefId, consultantDoctor, consultantPhone,
          items, totalUnits, primaryProduct, primaryPlan, toothNumbers, shade,
          clinicalNotes, techName, techPhone, scannerModel, scanLink, photos,
          status, statusNotes, dispatchedAt, deliveredAt, googleSynced, googleSyncedAt
        ) VALUES (
          @orderId, @createdAt, @updatedAt, @deliveryDeadline,
          @clinicId, @clinicUsername, @portalId, @clinicName, @primaryDoctorName, @clinicPhone, @clinicCity,
          @patientName, @patientAge, @patientSex, @patientRefId, @consultantDoctor, @consultantPhone,
          @items, @totalUnits, @primaryProduct, @primaryPlan, @toothNumbers, @shade,
          @clinicalNotes, @techName, @techPhone, @scannerModel, @scanLink, @photos,
          @status, @statusNotes, @dispatchedAt, @deliveredAt, @googleSynced, @googleSyncedAt
        )
      `);
      for (const o of seedData.orders) {
        insertOrder.run(o);
      }
      console.log(`[Database Seed] Seeded ${seedData.orders.length} cases.`);
    }
  }
} catch (err) {
  console.warn('[Database Seed Notice]:', err.message);
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

function getSetting(key) {
  const row = getSettingStmt.get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  setSettingStmt.run(key, value);
}

module.exports = {
  db,
  getDeadline48h,
  generateOrderId,
  syncArchivedOrders,
  getSetting: (key) => getSettingStmt.get(key)?.value,
  setSetting: (key, val) => setSettingStmt.run(key, String(val))
};
