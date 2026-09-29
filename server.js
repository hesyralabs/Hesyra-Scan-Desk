const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { db, getDeadline48h, generateOrderId, getSetting, setSetting } = require('./database');
const { generateOrdersExcel } = require('./excelExporter');
const { syncOrderToGoogleSheet, testGoogleWebhook, getGoogleAppsScriptTemplate } = require('./googleSheetsSync');
const {
  syncAllToGoogleDrive,
  syncClinicsFromBillingDb,
  getDriveStatus,
  startPeriodicSync
} = require('./gdriveSyncService');
const {
  loginUser,
  validateSession,
  destroySession,
  changePassword,
  requireAuth,
  requireAdmin
} = require('./authService');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));


// --- AUTHENTICATION API (Public endpoints) ---

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;
    const result = loginUser(username, password, rememberMe !== false);
    if (!result.success) {
      return res.status(401).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  const session = validateSession(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  res.json({ success: true, user: session });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token) destroySession(token);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const result = changePassword(req.user.userId, oldPassword, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Protect all following /api routes with requireAuth middleware
app.use('/api', requireAuth);

// --- CLINICS API (No username or portal ID asked) ---

app.get('/api/clinics', (req, res) => {
  try {
    let clinics = db.prepare('SELECT * FROM clinics ORDER BY id DESC').all();
    if (clinics.length === 0) {
      // Automatically attempt import from Billing System database
      syncClinicsFromBillingDb();
      clinics = db.prepare('SELECT * FROM clinics ORDER BY id DESC').all();
    }
    res.json({ success: true, clinics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/clinics', (req, res) => {
  try {
    const b = req.body;
    if (!b.primaryDoctorName || !b.primaryDoctorName.trim()) {
      return res.status(400).json({ success: false, error: 'Primary Doctor Name is required.' });
    }

    const nowIso = new Date().toISOString();

    const stmt = db.prepare(`
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

    const info = stmt.run({
      clinicUsername: '',
      portalId: '',
      primaryDoctorName: b.primaryDoctorName.trim(),
      clinicName: b.clinicName ? b.clinicName.trim() : `Clinic of ${b.primaryDoctorName.trim()}`,
      partnerDoctors: b.partnerDoctors || '',
      phone: b.phone || '',
      email: b.email || '',
      gstin: b.gstin || 'N/A',
      fullAddress: b.fullAddress || '',
      city: b.city || 'Nagpur',
      state: b.state || 'Maharashtra',
      pinCode: b.pinCode || '',
      creditDays: b.creditDays || '15',
      internalNotes: b.internalNotes || '',
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const savedClinic = db.prepare('SELECT * FROM clinics WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, clinic: savedClinic });
  } catch (err) {
    console.error('POST /api/clinics error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ORDERS API (No patientRefId / chart ID asked) ---

app.get('/api/orders', (req, res) => {
  try {
    const { search, status, clinicId, datePreset } = req.query;
    let conditions = [];
    let params = [];

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(`(
        orderId LIKE ? OR patientName LIKE ? OR clinicName LIKE ? OR
        primaryDoctorName LIKE ? OR toothNumbers LIKE ?
      )`);
      params.push(q, q, q, q, q);
    }

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (clinicId && clinicId !== 'all') {
      conditions.push('clinicId = ?');
      params.push(clinicId);
    }

    const now = new Date();
    if (datePreset === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      conditions.push("createdAt >= ?");
      params.push(`${todayStr} 00:00:00`);
    } else if (datePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      conditions.push("createdAt >= ? AND createdAt <= ?");
      params.push(`${yStr} 00:00:00`, `${yStr} 23:59:59`);
    } else if (datePreset === 'last7') {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      conditions.push("createdAt >= ?");
      params.push(s.toISOString());
    } else if (datePreset === 'thisMonth') {
      conditions.push("createdAt LIKE ?");
      params.push(`${now.toISOString().slice(0, 7)}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orders = db.prepare(`SELECT * FROM orders ${whereClause} ORDER BY id DESC LIMIT 300`).all(...params);

    res.json({ success: true, count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', upload.array('photos', 6), async (req, res) => {
  try {
    const b = req.body;
    const nowIso = new Date().toISOString();
    const orderId = generateOrderId();
    const deliveryDeadline = getDeadline48h(nowIso);

    let photoUrls = [];
    if (req.files && req.files.length) {
      photoUrls = req.files.map(f => `/uploads/${f.filename}`);
    }

    let items = [];
    try {
      items = JSON.parse(b.items || '[]');
    } catch (e) {
      items = [];
    }

    if (!items.length) {
      items = [{
        product: b.primaryProduct || 'Permanent Crown',
        plan: b.primaryPlan || 'Ceramic Crown — 950',
        qty: parseInt(b.qty, 10) || 1,
        toothNumbers: b.toothNumbers || '',
        shade: b.shade || 'A2',
        lineNote: b.lineNote || ''
      }];
    }

    const totalUnits = items.reduce((acc, it) => acc + (parseInt(it.qty, 10) || 1), 0);
    const primaryProduct = items[0]?.product || 'Crown';
    const primaryPlan = items[0]?.plan || '';
    const toothNumbers = items.map(it => it.toothNumbers).filter(Boolean).join(', ');
    const shade = items[0]?.shade || 'A2';

    const stmt = db.prepare(`
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

    const orderRecord = {
      orderId,
      createdAt: nowIso,
      updatedAt: nowIso,
      deliveryDeadline,
      clinicId: parseInt(b.clinicId, 10) || null,
      clinicUsername: '',
      portalId: '',
      clinicName: b.clinicName || 'Clinic',
      primaryDoctorName: b.primaryDoctorName || 'Doctor',
      clinicPhone: b.clinicPhone || '',
      clinicCity: b.clinicCity || 'Nagpur',
      patientName: b.patientName || 'Patient',
      patientAge: b.patientAge || '',
      patientSex: b.patientSex || 'Male',
      patientRefId: '',
      consultantDoctor: b.consultantDoctor || '',
      consultantPhone: b.consultantPhone || '',
      items: JSON.stringify(items),
      totalUnits,
      primaryProduct,
      primaryPlan,
      toothNumbers,
      shade,
      clinicalNotes: b.clinicalNotes || '',
      techName: (req.user && req.user.role === 'tech') ? req.user.fullName : (b.techName || req.user?.fullName || 'Field Scan Tech'),
      techPhone: b.techPhone || '',
      scannerModel: b.scannerModel || 'Medit i700',
      scanLink: b.scanLink || '',
      photos: JSON.stringify(photoUrls),
      status: 'Scanned',
      statusNotes: 'Case enrolled chairside by field technician'
    };

    const info = stmt.run(orderRecord);
    const savedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);

    // Sync to Google Drive Master Excel & Standalone Ledger
    syncAllToGoogleDrive().catch(err => console.warn('[GDrive Sync on Create Notice]:', err.message));
    // Optional Google Webhook
    syncOrderToGoogleSheet(savedOrder, 'INSERT').catch(() => {});

    res.status(201).json({ success: true, order: savedOrder });
  } catch (err) {
    console.error('POST /api/orders error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch('/api/orders/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    const nowIso = new Date().toISOString();
    let extra = '';
    if (status === 'Dispatched') extra = `, dispatchedAt = '${nowIso}'`;
    if (status === 'Delivered') extra = `, deliveredAt = '${nowIso}'`;

    db.prepare(`UPDATE orders SET status = ?, updatedAt = ? ${extra} WHERE id = ? OR orderId = ?`).run(status, nowIso, req.params.id, req.params.id);
    const updated = db.prepare('SELECT * FROM orders WHERE id = ? OR orderId = ?').get(req.params.id, req.params.id);

    // Live update Google Drive Excel workbook
    syncAllToGoogleDrive().catch(err => console.warn('[GDrive Sync on Status Notice]:', err.message));
    syncOrderToGoogleSheet(updated, 'UPDATE').catch(() => {});

    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE id = ? OR orderId = ?').run(req.params.id, req.params.id);
    syncAllToGoogleDrive().catch(err => console.warn('[GDrive Sync on Delete Notice]:', err.message));
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- GOOGLE DRIVE & MASTER EXCEL API ---

app.get('/api/gdrive/status', requireAdmin, (req, res) => {
  try {
    const status = getDriveStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gdrive/sync', requireAdmin, async (req, res) => {
  try {
    const status = await syncAllToGoogleDrive();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/gdrive/import-clinics', requireAdmin, (req, res) => {
  try {
    const result = syncClinicsFromBillingDb();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- EXCEL EXPORT (DOWNLOAD) ---

app.get('/api/export/excel', requireAdmin, async (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    const wb = await generateOrdersExcel(orders);
    const filename = `Hesyra-Crown-Scan-Orders-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- STATS API ---

app.get('/api/stats', (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const totalToday = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(totalUnits), 0) as units FROM orders WHERE createdAt >= ?").get(`${todayStr} 00:00:00`);
    const totalOverall = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(totalUnits), 0) as units FROM orders").get();
    const activeCases = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status NOT IN ('Dispatched', 'Delivered', 'Cancelled')").get();
    const crownsCount = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE primaryProduct LIKE '%Crown%'").get();
    const dispatchedCount = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('Dispatched', 'Delivered')").get();

    const activeOrders = db.prepare("SELECT deliveryDeadline FROM orders WHERE status NOT IN ('Dispatched', 'Delivered', 'Cancelled')").all();
    const now = new Date();
    const urgentCount = activeOrders.filter(o => {
      const diffHours = (new Date(o.deliveryDeadline) - now) / (1000 * 60 * 60);
      return diffHours <= 12;
    }).length;

    res.json({
      success: true,
      stats: {
        todayOrders: totalToday.cnt,
        todayUnits: totalToday.units,
        totalOrders: totalOverall.cnt,
        totalUnits: totalOverall.units,
        activeCases: activeCases.cnt,
        urgentCount,
        crownsCount: crownsCount.cnt,
        dispatchedCount: dispatchedCount.cnt
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- SETTINGS API ---

app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({
    success: true,
    settings: {
      google_sheet_webhook_url: getSetting('google_sheet_webhook_url') || '',
      company_name: getSetting('company_name') || 'Hesyra Dental Labs',
      gdrive_folder_path: getSetting('gdrive_folder_path') || 'G:\\My Drive\\Hesyra Invoices'
    }
  });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { google_sheet_webhook_url, gdrive_folder_path } = req.body;
  if (google_sheet_webhook_url !== undefined) setSetting('google_sheet_webhook_url', google_sheet_webhook_url);
  if (gdrive_folder_path !== undefined) setSetting('gdrive_folder_path', gdrive_folder_path);
  res.json({ success: true });
});

app.get('/api/settings/google-script', (req, res) => {
  res.json({ success: true, script: getGoogleAppsScriptTemplate() });
});

app.post('/api/settings/test-google', requireAdmin, async (req, res) => {
  try {
    await testGoogleWebhook(req.body.url);
    res.json({ success: true, message: 'Google Sheets reachable!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Start background recurring sync (every 5 minutes)
startPeriodicSync(5);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Hesyra Scan Desk running at http://localhost:${PORT}`);
  console.log(`Google Drive Sync target: G:\\My Drive\\Hesyra Invoices`);
});
