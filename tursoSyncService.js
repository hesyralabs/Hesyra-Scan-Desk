const { createClient } = require('@libsql/client');
const { db } = require('./database');
const fs = require('fs');
const path = require('path');

function getTursoConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;
  return { url, authToken, enabled: Boolean(url && authToken) };
}

let client = null;

function getClient() {
  const config = getTursoConfig();
  if (!config.enabled) return null;
  if (!client) {
    client = createClient({
      url: config.url,
      authToken: config.authToken
    });
  }
  return client;
}

/**
 * Initialize cloud schema in Turso
 */
async function initTursoSchema() {
  const turso = getClient();
  if (!turso) return false;

  try {
    await turso.execute(`
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
        patientAge TEXT,
        patientSex TEXT,
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
      )
    `);

    await turso.execute(`
      CREATE TABLE IF NOT EXISTS clinics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clinicCode TEXT UNIQUE,
        clinicName TEXT NOT NULL,
        primaryDoctorName TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        city TEXT,
        fullAddress TEXT,
        pinCode TEXT,
        createdAt TEXT
      )
    `);

    console.log('[Turso Cloud] Schema verified.');
    return true;
  } catch (err) {
    console.warn('[Turso Cloud Schema Warning]:', err.message);
    return false;
  }
}

/**
 * On Server Cold Boot: Pull all orders from Turso and restore into local SQLite
 */
async function syncFromTursoOnBoot() {
  const turso = getClient();
  if (!turso) {
    console.log('[Turso Cloud] Not configured. Operating with local SQLite + seedData.json.');
    return { enabled: false };
  }

  try {
    await initTursoSchema();

    const rs = await turso.execute('SELECT * FROM orders ORDER BY id ASC');
    const cloudOrders = rs.rows || [];
    console.log(`[Turso Cloud] Fetched ${cloudOrders.length} orders from cloud database.`);

    if (cloudOrders.length === 0) {
      // If Turso is brand new, push existing local orders up to populate it!
      await pushLocalOrdersToTurso();
      return { enabled: true, restored: 0, seededToTurso: true };
    }

    // Upsert into local SQLite orders table
    const cols = Object.keys(cloudOrders[0]).filter(k => k !== 'id');
    const colStr = cols.join(', ');
    const placeholderStr = cols.map(c => `@${c}`).join(', ');
    const insertStmt = db.prepare(`INSERT OR REPLACE INTO orders (${colStr}) VALUES (${placeholderStr})`);

    let newCount = 0;
    const upsertMany = db.transaction((rows) => {
      for (const row of rows) {
        const obj = {};
        for (const c of cols) {
          obj[c] = row[c] !== undefined ? row[c] : null;
        }
        insertStmt.run(obj);
        newCount++;
      }
    });

    upsertMany(cloudOrders);
    console.log(`[Turso Cloud] Restored ${newCount} orders into local SQLite.`);

    // Also update seedData.json on disk as a local redundancy snapshot
    try {
      const allOrders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
      const allClinics = db.prepare('SELECT * FROM clinics ORDER BY id ASC').all();
      const seedFile = path.join(__dirname, 'seedData.json');
      fs.writeFileSync(seedFile, JSON.stringify({ orders: allOrders, clinics: allClinics }, null, 2), 'utf8');
    } catch (e) {}

    return { enabled: true, restored: newCount };
  } catch (err) {
    console.error('[Turso Sync Error]:', err.message);
    return { enabled: true, error: err.message };
  }
}

/**
 * Push an individual order to Turso Cloud (non-blocking)
 */
async function pushOrderToTurso(order) {
  const turso = getClient();
  if (!turso || !order || !order.orderId) return;

  try {
    const keys = [
      'orderId', 'createdAt', 'updatedAt', 'deliveryDeadline', 'clinicId', 'clinicUsername',
      'portalId', 'clinicName', 'primaryDoctorName', 'clinicPhone', 'clinicCity',
      'patientName', 'patientAge', 'patientSex', 'patientRefId', 'consultantDoctor',
      'consultantPhone', 'items', 'totalUnits', 'primaryProduct', 'primaryPlan',
      'toothNumbers', 'shade', 'clinicalNotes', 'techName', 'techPhone', 'scannerModel',
      'scanLink', 'photos', 'status', 'statusNotes', 'dispatchedAt', 'deliveredAt',
      'googleSynced', 'googleSyncedAt', 'isArchived', 'archivedAt'
    ];

    const colsStr = keys.join(', ');
    const valPlaceholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => (order[k] !== undefined && order[k] !== null) ? order[k] : null);

    await turso.execute({
      sql: `INSERT INTO orders (${colsStr}) VALUES (${valPlaceholders})
            ON CONFLICT(orderId) DO UPDATE SET
              status = excluded.status,
              statusNotes = excluded.statusNotes,
              updatedAt = excluded.updatedAt,
              dispatchedAt = excluded.dispatchedAt,
              deliveredAt = excluded.deliveredAt,
              isArchived = excluded.isArchived,
              archivedAt = excluded.archivedAt`,
      args: values
    });

    console.log(`[Turso Cloud] Synced scan ${order.orderId} (${order.patientName}) to cloud volume.`);
  } catch (err) {
    console.warn(`[Turso Cloud Push Warning ${order.orderId}]:`, err.message);
  }
}

/**
 * Seed all current local orders up to Turso Cloud
 */
async function pushLocalOrdersToTurso() {
  const turso = getClient();
  if (!turso) return;

  try {
    const localOrders = db.prepare('SELECT * FROM orders').all();
    console.log(`[Turso Cloud] Populating cloud database with ${localOrders.length} local orders...`);
    for (const o of localOrders) {
      await pushOrderToTurso(o);
    }
    console.log('[Turso Cloud] Cloud population complete.');
  } catch (e) {
    console.warn('[Turso Cloud Initial Push Warning]:', e.message);
  }
}

module.exports = {
  getTursoConfig,
  syncFromTursoOnBoot,
  pushOrderToTurso,
  pushLocalOrdersToTurso
};
