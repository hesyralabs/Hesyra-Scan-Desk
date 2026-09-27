const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const Database = require('better-sqlite3');
const { db, getSetting, setSetting } = require('./database');
const { generateOrdersExcel } = require('./excelExporter');

// Primary default path to Google Drive mounted directory
const DEFAULT_GDRIVE_PATH = 'G:\\My Drive\\Hesyra Invoices';
const LOCAL_MIRROR_PATH = path.join(__dirname, 'google_drive_sync');

// Billing DB paths for clinic synchronization
const BILLING_DB_GDRIVE = path.join(DEFAULT_GDRIVE_PATH, 'hesyra.db');
const BILLING_DB_LOCAL = 'C:\\Users\\admin\\Desktop\\Hesyra Billing System\\data\\hesyra.db';

let lastSyncStatus = {
  ok: true,
  lastSyncedAt: null,
  drivePath: DEFAULT_GDRIVE_PATH,
  isDriveConnected: false,
  masterBillingExists: false,
  scanWorkbookExists: false,
  ordersCount: 0,
  message: 'Initialized. Pending first sync.'
};

/**
 * Resolves the Google Drive folder path
 */
function getTargetDrivePath() {
  const custom = getSetting('gdrive_folder_path');
  if (custom && fs.existsSync(custom)) {
    return custom;
  }
  if (fs.existsSync(DEFAULT_GDRIVE_PATH)) {
    return DEFAULT_GDRIVE_PATH;
  }
  return LOCAL_MIRROR_PATH;
}

/**
 * Checks connection state to Google Drive
 */
function checkDriveConnection() {
  const targetDir = getTargetDrivePath();
  const isGdrive = targetDir.toLowerCase().startsWith('g:\\');
  const connected = fs.existsSync(targetDir);

  const masterBillingPath = path.join(targetDir, 'Hesyra_Master_Billing.xlsx');
  const scanOrdersPath = path.join(targetDir, 'Hesyra_Field_Scan_Orders.xlsx');

  return {
    connected,
    isGdrive,
    targetDir,
    masterBillingPath,
    masterBillingExists: fs.existsSync(masterBillingPath),
    scanOrdersPath,
    scanOrdersExists: fs.existsSync(scanOrdersPath)
  };
}

/**
 * Generate formatted text for billing system intake
 */
function buildBillingIntakeText(order) {
  const lines = [];
  const pName = (order.patientName || '').trim();
  const pAge = (order.patientAge || '').toString().trim();
  const pSex = (order.patientSex || '').toString().trim().toUpperCase();
  const sexChar = pSex.startsWith('F') ? 'F' : (pSex.startsWith('M') ? 'M' : '');
  const ageSex = (pAge && sexChar) ? `${pAge}${sexChar}` : (pAge || sexChar || '');

  if (pName) lines.push(`Patient: ${pName}${ageSex ? `, ${ageSex}` : ''}`);
  if (order.clinicName) lines.push(`Clinic: ${order.clinicName.trim()}`);
  if (order.primaryDoctorName) lines.push(`Doctor: ${order.primaryDoctorName.trim()}`);
  if (order.consultantDoctor) lines.push(`Consultant: ${order.consultantDoctor.trim()}`);
  if (order.clinicPhone) lines.push(`Phone: ${order.clinicPhone.trim()}`);
  if (order.clinicCity) lines.push(`City: ${order.clinicCity.trim()}`);

  let items = [];
  try {
    items = JSON.parse(order.items || '[]');
  } catch (e) {
    items = [];
  }

  if (!items.length) {
    items = [{
      product: order.primaryProduct || 'Crown',
      plan: order.primaryPlan || '',
      qty: order.totalUnits || 1,
      toothNumbers: order.toothNumbers || '',
      shade: order.shade || 'A2'
    }];
  }

  items.forEach((it, idx) => {
    let itemDesc = it.product || 'Dental Prosthesis';
    if (it.plan) itemDesc += ` (${it.plan})`;
    const parts = [`Item: ${itemDesc} x${it.qty || 1}`];
    if (it.shade) parts.push(`Shade: ${it.shade}`);
    if (it.toothNumbers) parts.push(`Tooth: ${it.toothNumbers}`);
    lines.push(parts.join(' | '));
  });

  if (order.clinicalNotes) {
    lines.push(`Notes: ${order.clinicalNotes.trim()}`);
  }

  return lines.join('\n');
}

/**
 * Helper to compute 48-Hour SLA countdown text & status
 */
function calculateSla(order, now = new Date()) {
  if (['Dispatched', 'Delivered'].includes(order.status)) {
    return {
      text: `Delivered (${order.status})`,
      category: 'completed',
      hoursLeft: 0,
      badgeColor: 'FF16A34A',
      bgColor: 'FFDCFCE7'
    };
  }

  const deadline = new Date(order.deliveryDeadline);
  const diffMs = deadline - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    const overHours = Math.abs(Math.floor(diffHours));
    const overMins = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    return {
      text: `OVERDUE by ${overHours}h ${overMins}m`,
      category: 'overdue',
      hoursLeft: diffHours,
      badgeColor: 'FFDC2626',
      bgColor: 'FFFEE2E2'
    };
  }

  const leftH = Math.floor(diffHours);
  const leftM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const text = `${leftH}h ${leftM}m remaining`;

  if (leftH < 12) {
    return {
      text: `URGENT: ${text}`,
      category: 'urgent',
      hoursLeft: diffHours,
      badgeColor: 'FFD97706',
      bgColor: 'FFFEF3C7'
    };
  }

  return {
    text: text,
    category: 'active',
    hoursLeft: diffHours,
    badgeColor: 'FF0284C7',
    bgColor: 'FFE0F2FE'
  };
}

/**
 * Update the 'Chairside_Scan_Desk' sheet inside Hesyra_Master_Billing.xlsx
 */
async function updateMasterBillingWorkbook(masterFilePath, orders) {
  if (!fs.existsSync(masterFilePath)) {
    return { updated: false, reason: 'File not found' };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(masterFilePath);

  const sheetName = 'Chairside_Scan_Desk';
  let ws = wb.getWorksheet(sheetName);

  if (ws) {
    wb.removeWorksheet(ws.id);
  }

  ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  });

  const THEME = {
    brandNavy: '001A33',
    subBar: '0E3B4A',
    headerBg: '0F172A',
    border: 'D9D9D9'
  };

  // Row 1: Title Banner
  ws.mergeCells('A1:V1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'HESYRA LABS — FIELD CHAIRSIDE SCAN INTAKE & 48-HOUR SLA TRACKER';
  titleCell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandNavy } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 30;

  // Row 2: Subtitle
  ws.mergeCells('A2:V2');
  const subCell = ws.getCell('A2');
  const genTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  subCell.value = `Live Synced: ${genTime} IST | Connected with Hesyra Field Scan Desk & Billing Engine | 48-Hour Promised Crown Turnaround`;
  subCell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFE2E8F0' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subBar } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 18;

  // Row 3-4: KPI Summary Cards
  const now = new Date();
  const totalCases = orders.length;
  const totalUnits = orders.reduce((acc, o) => acc + (parseInt(o.totalUnits, 10) || 1), 0);
  const urgentCount = orders.filter(o => {
    if (['Dispatched', 'Delivered', 'Cancelled'].includes(o.status)) return false;
    const diffHours = (new Date(o.deliveryDeadline) - now) / (1000 * 60 * 60);
    return diffHours <= 12;
  }).length;
  const activeCount = orders.filter(o => !['Dispatched', 'Delivered', 'Cancelled'].includes(o.status)).length;
  const completedCount = orders.filter(o => ['Dispatched', 'Delivered'].includes(o.status)).length;

  ws.mergeCells('A3:E4');
  setKpi(ws.getCell('A3'), `FIELD SCAN INTAKE\n${totalCases} Cases (${totalUnits} Units)`, 'FF0284C7');

  ws.mergeCells('F3:J4');
  setKpi(ws.getCell('F3'), `48h SLA URGENT (<12h Left)\n${urgentCount} Cases Priority`, 'FFDC2626');

  ws.mergeCells('K3:O4');
  setKpi(ws.getCell('K3'), `ACTIVE IN LAB FABRICATION\n${activeCount} Cases In Progress`, 'FFD97706');

  ws.mergeCells('P3:V4');
  setKpi(ws.getCell('P3'), `DISPATCHED & DELIVERED\n${completedCount} Cases Delivered`, 'FF16A34A');

  function setKpi(cell, text, borderColor) {
    cell.value = text;
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'medium', color: { argb: borderColor } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  }

  // Row 5: Column Headers
  const columns = [
    { key: 'orderId', header: 'Order / Job Ref', width: 18 },
    { key: 'createdAt', header: 'Scan Intake Time', width: 19 },
    { key: 'deliveryDeadline', header: '48H Delivery Deadline', width: 22 },
    { key: 'slaStatus', header: '48H SLA Status', width: 22 },
    { key: 'status', header: 'Production Stage', width: 18 },
    { key: 'primaryDoctorName', header: 'Doctor / Client', width: 22 },
    { key: 'clinicName', header: 'Host Clinic Name', width: 26 },
    { key: 'clinicPhone', header: 'Clinic Phone', width: 16 },
    { key: 'clinicCity', header: 'City', width: 14 },
    { key: 'patientName', header: 'Patient Name', width: 22 },
    { key: 'patientAgeSex', header: 'Age / Sex', width: 13 },
    { key: 'consultantDoctor', header: 'Visiting Consultant', width: 20 },
    { key: 'primaryProduct', header: 'Item / Prosthesis', width: 22 },
    { key: 'primaryPlan', header: 'Plan / Tier', width: 24 },
    { key: 'toothNumbers', header: 'Tooth #s', width: 14 },
    { key: 'shade', header: 'Shade', width: 11 },
    { key: 'totalUnits', header: 'Units', width: 10 },
    { key: 'clinicalNotes', header: 'Clinical & Margin Notes', width: 32 },
    { key: 'techName', header: 'Field Technician', width: 18 },
    { key: 'scannerModel', header: 'Scanner Hardware', width: 18 },
    { key: 'scanLink', header: 'Cloud Scan Link', width: 26 },
    { key: 'billingIntakeText', header: 'Billing 1-Click Intake Text', width: 45 }
  ];

  const headerRow = ws.getRow(5);
  headerRow.height = 26;

  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = col.header;
    cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandNavy } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF404040' } },
      bottom: { style: 'thin', color: { argb: 'FF404040' } },
      left: { style: 'thin', color: { argb: 'FF404040' } },
      right: { style: 'thin', color: { argb: 'FF404040' } }
    };
    ws.getColumn(colNum).width = col.width;
  });

  // Populate data rows
  orders.forEach((o, rIdx) => {
    const rowNum = 6 + rIdx;
    const row = ws.getRow(rowNum);
    row.height = 24;

    const isEven = rIdx % 2 === 0;
    const baseBg = isEven ? 'FFFFFFFF' : 'FFF9FAFB';

    const sla = calculateSla(o, now);
    const ageSex = [o.patientAge, o.patientSex].filter(Boolean).join(' / ');
    const billingText = buildBillingIntakeText(o);

    const values = [
      o.orderId,
      (o.createdAt || '').slice(0, 19).replace('T', ' '),
      (o.deliveryDeadline || '').slice(0, 19).replace('T', ' '),
      sla.text,
      o.status,
      o.primaryDoctorName,
      o.clinicName,
      o.clinicPhone || '',
      o.clinicCity || '',
      o.patientName,
      ageSex,
      o.consultantDoctor || '',
      o.primaryProduct || 'Crown',
      o.primaryPlan || '',
      o.toothNumbers || '',
      o.shade || '',
      parseInt(o.totalUnits, 10) || 1,
      o.clinicalNotes || '',
      o.techName || '',
      o.scannerModel || '',
      o.scanLink || '',
      billingText
    ];

    values.forEach((val, cIdx) => {
      const colNum = cIdx + 1;
      const cell = row.getCell(colNum);
      cell.value = val;
      cell.font = { name: 'Arial', size: 9 };
      cell.border = {
        top: { style: 'thin', color: { argb: THEME.border } },
        bottom: { style: 'thin', color: { argb: THEME.border } },
        left: { style: 'thin', color: { argb: THEME.border } },
        right: { style: 'thin', color: { argb: THEME.border } }
      };

      // Column-specific alignment and highlight
      if (colNum === 4) {
        // SLA Status
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sla.bgColor } };
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: sla.badgeColor } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNum === 5) {
        // Status
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
        cell.font = { name: 'Arial', size: 9, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNum === 17) {
        // Units
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        cell.numFmt = '#,##0';
      } else if (colNum === 22) {
        // Billing Text
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
        const centerCols = [1, 2, 3, 8, 9, 11, 15, 16];
        cell.alignment = { vertical: 'middle', horizontal: centerCols.includes(colNum) ? 'center' : 'left' };
      }
    });
  });

  // Enable AutoFilter on header row
  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5 + orders.length, 5), column: columns.length }
  };

  // Safe atomic save
  const tempPath = `${masterFilePath}.tmp`;
  await wb.xlsx.writeFile(tempPath);
  try {
    fs.copyFileSync(tempPath, masterFilePath);
    fs.unlinkSync(tempPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw err;
  }

  return { updated: true, sheet: sheetName, orderCount: orders.length };
}

/**
 * Perform complete synchronization to Google Drive
 */
async function syncAllToGoogleDrive() {
  const connInfo = checkDriveConnection();
  const targetDir = connInfo.targetDir;
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Fetch current orders
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();

  // 2. Generate and write Hesyra_Field_Scan_Orders.xlsx
  const scanOrdersWb = await generateOrdersExcel(orders);
  const scanOrdersTarget = path.join(targetDir, 'Hesyra_Field_Scan_Orders.xlsx');
  const scanOrdersLocalMirror = path.join(LOCAL_MIRROR_PATH, 'Hesyra_Field_Scan_Orders.xlsx');

  if (!fs.existsSync(LOCAL_MIRROR_PATH)) {
    fs.mkdirSync(LOCAL_MIRROR_PATH, { recursive: true });
  }

  await scanOrdersWb.xlsx.writeFile(scanOrdersTarget);
  // Mirror locally
  try {
    await scanOrdersWb.xlsx.writeFile(scanOrdersLocalMirror);
  } catch (e) {}

  // 3. Inject into Hesyra_Master_Billing.xlsx if available
  let masterUpdated = false;
  let masterNotice = '';
  const masterPath = path.join(targetDir, 'Hesyra_Master_Billing.xlsx');

  if (fs.existsSync(masterPath)) {
    try {
      await updateMasterBillingWorkbook(masterPath, orders);
      masterUpdated = true;
      masterNotice = 'Injected into Hesyra_Master_Billing.xlsx';
    } catch (mErr) {
      console.warn('[Google Drive Sync] Master Billing write lock/busy:', mErr.message);
      masterNotice = `Master Billing busy/locked: ${mErr.message}`;
    }
  } else {
    masterNotice = 'Hesyra_Master_Billing.xlsx not found in target folder (standalone ledger created)';
  }

  // 4. Update sync timestamp in database & memory
  const nowIso = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gdrive_last_sync_time', ?)").run(nowIso);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gdrive_last_sync_count', ?)").run(String(orders.length));

  lastSyncStatus = {
    ok: true,
    lastSyncedAt: nowIso,
    drivePath: targetDir,
    isDriveConnected: connInfo.connected,
    masterBillingExists: fs.existsSync(masterPath),
    scanWorkbookExists: fs.existsSync(scanOrdersTarget),
    ordersCount: orders.length,
    masterUpdated,
    message: masterUpdated
      ? `Successfully synchronized ${orders.length} cases to Hesyra_Master_Billing.xlsx and Hesyra_Field_Scan_Orders.xlsx in Google Drive.`
      : `Synchronized ${orders.length} cases to Hesyra_Field_Scan_Orders.xlsx. (${masterNotice})`
  };

  return lastSyncStatus;
}

/**
 * Synchronize clinics and doctors from Hesyra Billing System database
 */
function syncClinicsFromBillingDb() {
  let billingDbPath = null;
  if (fs.existsSync(BILLING_DB_GDRIVE)) {
    billingDbPath = BILLING_DB_GDRIVE;
  } else if (fs.existsSync(BILLING_DB_LOCAL)) {
    billingDbPath = BILLING_DB_LOCAL;
  }

  if (!billingDbPath) {
    return { success: false, message: 'Billing database not found at G:\\ or local directory' };
  }

  try {
    const billingDb = new Database(billingDbPath, { readonly: true });
    const doctors = billingDb.prepare(`
      SELECT name, clinic, partner_doctors, phone, email, gstin, address, city, state_name, pincode, credit_days, notes
      FROM doctors
      WHERE active = 1 OR active IS NULL
    `).all();
    billingDb.close();

    const nowIso = new Date().toISOString();
    let imported = 0;

    const findClinicStmt = db.prepare('SELECT id FROM clinics WHERE primaryDoctorName = ? OR clinicName = ?');
    const insertClinicStmt = db.prepare(`
      INSERT INTO clinics (
        clinicUsername, portalId, primaryDoctorName, clinicName, partnerDoctors,
        phone, email, gstin, fullAddress, city, state, pinCode, creditDays, internalNotes,
        createdAt, updatedAt
      ) VALUES (
        '', '', @primaryDoctorName, @clinicName, @partnerDoctors,
        @phone, @email, @gstin, @fullAddress, @city, @state, @pinCode, @creditDays, @internalNotes,
        @createdAt, @updatedAt
      )
    `);

    for (const d of doctors) {
      const docName = (d.name || '').trim();
      const clinicName = (d.clinic || '').trim() || `Clinic of ${docName}`;
      if (!docName) continue;

      const existing = findClinicStmt.get(docName, clinicName);
      if (!existing) {
        insertClinicStmt.run({
          primaryDoctorName: docName,
          clinicName: clinicName,
          partnerDoctors: d.partner_doctors || '',
          phone: d.phone || '',
          email: d.email || '',
          gstin: d.gstin || 'N/A',
          fullAddress: d.address || '',
          city: d.city || 'Nagpur',
          state: d.state_name || 'Maharashtra',
          pinCode: d.pincode || '',
          creditDays: String(d.credit_days || '15'),
          internalNotes: d.notes || '',
          createdAt: nowIso,
          updatedAt: nowIso
        });
        imported++;
      }
    }

    return { success: true, count: doctors.length, imported, dbSource: billingDbPath };
  } catch (err) {
    console.error('syncClinicsFromBillingDb error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get current Drive Sync status
 */
function getDriveStatus() {
  const conn = checkDriveConnection();
  return {
    ...lastSyncStatus,
    drivePath: conn.targetDir,
    isDriveConnected: conn.connected,
    masterBillingExists: conn.masterBillingExists,
    scanWorkbookExists: conn.scanOrdersExists,
    masterBillingPath: conn.masterBillingPath,
    scanOrdersPath: conn.scanOrdersPath
  };
}

/**
 * Start background recurring sync
 */
function startPeriodicSync(intervalMinutes = 5) {
  // Sync once after 2 seconds
  setTimeout(async () => {
    try {
      syncClinicsFromBillingDb();
      await syncAllToGoogleDrive();
      console.log(`[Google Drive Sync] Initial sync complete. Path: ${getTargetDrivePath()}`);
    } catch (e) {
      console.warn('[Google Drive Sync] Initial sync error:', e.message);
    }
  }, 2000);

  // Periodic timer
  setInterval(async () => {
    try {
      await syncAllToGoogleDrive();
    } catch (e) {
      console.warn('[Google Drive Sync] Periodic sync error:', e.message);
    }
  }, intervalMinutes * 60 * 1000);
}

module.exports = {
  DEFAULT_GDRIVE_PATH,
  getTargetDrivePath,
  checkDriveConnection,
  syncAllToGoogleDrive,
  syncClinicsFromBillingDb,
  getDriveStatus,
  startPeriodicSync
};
