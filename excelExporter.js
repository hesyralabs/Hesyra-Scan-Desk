const ExcelJS = require('exceljs');

/**
 * Helper to set KPI styled cells
 */
function setKpi(cell, text, borderColor) {
  cell.value = text;
  cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'medium', color: { argb: borderColor } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };
}

/**
 * Build Sheet 2: Clinic Details & Client Doctors Directory
 */
function addClinicsWorksheet(wb, clinics = [], orders = []) {
  const ws = wb.addWorksheet('Clinic Details', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  });

  const THEME = {
    brandPrimary: '1E3A8A',
    subBar: '1E293B',
    headerBg: '0F172A'
  };

  // Row 1: Title Banner
  ws.mergeCells('A1:L1');
  const title = ws.getCell('A1');
  title.value = 'HESYRA DENTAL LABS - REGISTERED CLINICS & CLIENT DOCTORS DIRECTORY';
  title.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandPrimary } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 34;

  // Row 2: Subtitle
  ws.mergeCells('A2:L2');
  const sub = ws.getCell('A2');
  const genDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  sub.value = `Exported on: ${genDate} IST | Clinical Partner Network & Account Directory | Nagpur Central Lab`;
  sub.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FFCBD5E1' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.subBar } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;

  // Row 3 & 4: KPI Summary Cards
  const totalClinics = clinics.length;
  const uniqueDoctors = new Set(clinics.map(c => (c.primaryDoctorName || '').trim()).filter(Boolean)).size;
  const uniqueCities = new Set(clinics.map(c => (c.city || '').trim()).filter(Boolean)).size;
  const totalOrders = orders.length;

  ws.mergeCells('A3:C4');
  setKpi(ws.getCell('A3'), `Total Clinics Registered\n${totalClinics} Active Clinics`, 'FF0284C7');

  ws.mergeCells('D3:F4');
  setKpi(ws.getCell('D3'), `Registered Doctors\n${uniqueDoctors} Primary Doctors`, 'FF10B981');

  ws.mergeCells('G3:I4');
  setKpi(ws.getCell('G3'), `Network Coverage\n${uniqueCities} Cities / Districts`, 'FF8B5CF6');

  ws.mergeCells('J3:L4');
  setKpi(ws.getCell('J3'), `Associated Scan Orders\n${totalOrders} Total Orders`, 'FFF59E0B');

  // Row 5: Column Headers
  const columns = [
    { header: 'Clinic Name', width: 32 },
    { header: 'Primary Doctor Name', width: 25 },
    { header: 'Partner / Assoc Doctors', width: 26 },
    { header: 'Phone / WhatsApp', width: 18 },
    { header: 'Email Address', width: 24 },
    { header: 'Full Address', width: 42 },
    { header: 'City', width: 16 },
    { header: 'State', width: 16 },
    { header: 'PIN Code', width: 12 },
    { header: 'GSTIN', width: 18 },
    { header: 'Credit Terms', width: 15 },
    { header: 'Total Orders Logged', width: 18 }
  ];

  const headerRow = ws.getRow(5);
  headerRow.height = 28;

  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = col.header;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
    ws.getColumn(colNum).width = col.width;
  });

  // Count orders per clinic / doctor
  const ordersCountMap = {};
  orders.forEach(o => {
    const cName = (o.clinicName || '').trim().toLowerCase();
    const dName = (o.primaryDoctorName || '').trim().toLowerCase();
    if (cName) ordersCountMap[cName] = (ordersCountMap[cName] || 0) + 1;
    if (dName && dName !== cName) ordersCountMap[dName] = (ordersCountMap[dName] || 0) + 1;
  });

  clinics.forEach((c, rIdx) => {
    const rowNum = 6 + rIdx;
    const row = ws.getRow(rowNum);
    row.height = 24;
    const isEven = rIdx % 2 === 0;
    const baseBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const cKey = (c.clinicName || '').trim().toLowerCase();
    const dKey = (c.primaryDoctorName || '').trim().toLowerCase();
    const ordersPlaced = ordersCountMap[cKey] || ordersCountMap[dKey] || 0;

    const rowData = [
      c.clinicName || '',
      c.primaryDoctorName || '',
      c.partnerDoctors || '-',
      c.phone || '',
      c.email || '-',
      c.fullAddress || '',
      c.city || 'Nagpur',
      c.state || 'Maharashtra',
      c.pinCode || '',
      c.gstin || 'N/A',
      c.creditDays ? `${c.creditDays} Days` : '15 Days',
      ordersPlaced
    ];

    rowData.forEach((val, cIdx) => {
      const colNum = cIdx + 1;
      const cell = row.getCell(colNum);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (colNum === 1) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      }

      if ([4, 7, 8, 9, 10, 11, 12].includes(colNum)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      if (colNum === 12 && ordersPlaced > 0) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF15803D' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
      }
    });
  });

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5 + clinics.length, 5), column: columns.length }
  };
}

/**
 * Generate formatted Excel (.xlsx) workbook with Orders and Clinic Details sheets
 */
async function generateOrdersExcel(orders = [], clinics = null) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hesyra Dental Labs - Field Scan Desk';
  wb.created = new Date();

  // If clinics not provided, query from database
  if (!clinics) {
    try {
      const { db } = require('./database');
      clinics = db.prepare('SELECT * FROM clinics ORDER BY clinicName ASC').all();
    } catch (e) {
      clinics = [];
    }
  }

  // --- SHEET 1: Field Scan Orders ---
  const ws = wb.addWorksheet('Field Scan Orders', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  });

  const THEME = {
    brandPrimary: '1E3A8A',
    headerBg: '0F172A'
  };

  // Row 1: Title Banner
  ws.mergeCells('A1:T1');
  const title = ws.getCell('A1');
  title.value = 'HESYRA DENTAL LABS - 48-HOUR FIELD SCAN ORDERS & CLINICAL ENTRY LEDGER';
  title.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandPrimary } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 34;

  // Row 2: Subtitle
  ws.mergeCells('A2:T2');
  const sub = ws.getCell('A2');
  const genDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  sub.value = `Exported on: ${genDate} IST | 48-Hour Crown Delivery SLA Tracking | Nagpur Central Lab`;
  sub.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FFCBD5E1' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;

  // Row 3 & 4: KPI Summary
  const total = orders.length;
  const totalUnits = orders.reduce((acc, o) => acc + (parseInt(o.totalUnits, 10) || 1), 0);
  const now = new Date();
  const urgentCount = orders.filter(o => {
    if (['Dispatched', 'Delivered', 'Cancelled'].includes(o.status)) return false;
    const diffHours = (new Date(o.deliveryDeadline) - now) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 12;
  }).length;
  const activeCount = orders.filter(o => !['Dispatched', 'Delivered', 'Cancelled'].includes(o.status)).length;
  const completedCount = orders.filter(o => ['Dispatched', 'Delivered'].includes(o.status)).length;

  ws.mergeCells('A3:D4');
  setKpi(ws.getCell('A3'), `Total Cases Enrolled\n${total} Cases (${totalUnits} Units)`, 'FF0284C7');

  ws.mergeCells('E3:H4');
  setKpi(ws.getCell('E3'), `48h SLA Critical (<12h Left)\n${urgentCount} Urgent Cases`, 'FFDC2626');

  ws.mergeCells('I3:L4');
  setKpi(ws.getCell('I3'), `Active in Lab Production\n${activeCount} Cases`, 'FFD97706');

  ws.mergeCells('M3:T4');
  setKpi(ws.getCell('M3'), `Dispatched / Delivered\n${completedCount} Completed`, 'FF16A34A');

  // Row 5: Enhanced Granular Columns (Dedicated Tooth, Shade, Arch/Sets columns!)
  const columns = [
    { header: 'Order / Case Ref', width: 22 },
    { header: 'Scan Date & Time', width: 20 },
    { header: 'Promised Delivery (48h)', width: 22 },
    { header: '48h SLA Status', width: 20 },
    { header: 'Clinic Name', width: 28 },
    { header: 'Primary Doctor Name', width: 24 },
    { header: 'Clinic Phone / WhatsApp', width: 18 },
    { header: 'City / District', width: 15 },
    { header: 'Patient Name', width: 22 },
    { header: 'Age / Gender', width: 14 },
    { header: 'Prosthesis / Category', width: 24 },
    { header: 'Material / Plan Tier', width: 28 },
    { header: 'Tooth Number(s) [FDI]', width: 19 },
    { header: 'Target Arch / Sets Count', width: 22 },
    { header: 'Color Shade (VITA)', width: 16 },
    { header: 'Units / Qty', width: 13 },
    { header: 'Special Notes / Job Ref', width: 34 },
    { header: 'Production Stage', width: 18 },
    { header: 'Field Technician', width: 18 },
    { header: 'Scanner Hardware', width: 18 }
  ];

  const headerRow = ws.getRow(5);
  headerRow.height = 28;

  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = col.header;
    cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
    ws.getColumn(colNum).width = col.width;
  });

  orders.forEach((o, rIdx) => {
    const rowNum = 6 + rIdx;
    const row = ws.getRow(rowNum);
    row.height = 24;
    const isEven = rIdx % 2 === 0;
    const baseBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    // Calculate 48h timer status
    let timerStatus = '';
    let timerBg = baseBg;
    let timerFont = 'FF0F172A';

    const deadline = new Date(o.deliveryDeadline);
    const diffMs = deadline - now;
    const diffHours = diffMs / (1000 * 60 * 60);
    const isPast48h = Boolean(o.isArchived || diffHours < 0);

    if (['Dispatched', 'Delivered'].includes(o.status)) {
      if (isPast48h) {
        timerStatus = `Archived (${o.status})`;
        timerBg = 'FFF1F5F9';
        timerFont = 'FF475569';
      } else {
        timerStatus = `Completed (${o.status})`;
        timerBg = 'FFDCFCE7';
        timerFont = 'FF15803D';
      }
    } else if (isPast48h) {
      timerStatus = 'Archived (>48h SLA)';
      timerBg = 'FFF1F5F9';
      timerFont = 'FF475569';
    } else {
      const leftH = Math.floor(diffHours);
      const leftM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      timerStatus = `${leftH}h ${leftM}m left`;

      if (leftH < 12) {
        timerBg = 'FFFEF3C7';
        timerFont = 'FFB45309';
      } else {
        timerBg = 'FFE0F2FE';
        timerFont = 'FF0369A1';
      }
    }

    // Parse granular items
    let prodCategory = o.primaryProduct || 'Prosthesis';
    let prodPlan = o.primaryPlan || '-';
    let toothNum = o.toothNumbers || '-';
    let archSets = '-';
    let shadeVal = o.shade || '-';
    let qtyVal = parseInt(o.totalUnits, 10) || 1;

    try {
      const parsed = JSON.parse(o.items || '[]');
      if (Array.isArray(parsed) && parsed.length) {
        const it = parsed[0];
        if (it.product) prodCategory = it.product;
        if (it.plan) prodPlan = it.plan;
        if (it.toothNumbers && it.toothNumbers !== '-') toothNum = it.toothNumbers;
        if (it.archTarget && it.archTarget !== '-') archSets = it.archTarget;
        else if (it.arch) archSets = `${it.arch} Arch`;
        if (it.shade && it.shade !== '-') shadeVal = it.shade;
        if (it.qty) qtyVal = it.qty;
      }
    } catch (e) {}

    // Retainers, Splints, Clear Aligners are transparent appliances — never have a tooth VITA shade
    const prodLower = prodCategory.toLowerCase();
    const isClearAppliance = prodLower.includes('retainer') || prodLower.includes('aligner') || prodLower.includes('splint') || prodLower.includes('guard') || prodLower.includes('appliance');
    if (isClearAppliance) {
      shadeVal = '-';
      toothNum = '-';
    }

    if (prodLower.includes('aligner') && (!archSets || archSets === '-')) {
      archSets = `${qtyVal} Sets`;
    }

    const rowData = [
      o.orderId || '',
      o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : '',
      o.deliveryDeadline ? new Date(o.deliveryDeadline).toLocaleString('en-IN') : '',
      timerStatus,
      o.clinicName || '',
      o.primaryDoctorName || '',
      o.clinicPhone || '',
      o.clinicCity || 'Nagpur',
      o.patientName || '',
      `${o.patientAge || ''} / ${o.patientSex || ''}`,
      prodCategory,
      prodPlan,
      toothNum,
      archSets,
      shadeVal,
      qtyVal,
      o.clinicalNotes || '-',
      o.status || 'Scanned',
      o.techName || 'Valaya',
      o.scannerModel || 'Medit i700'
    ];

    rowData.forEach((val, cIdx) => {
      const colNum = cIdx + 1;
      const cell = row.getCell(colNum);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: baseBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Alignment rules
      if ([1, 2, 3, 4, 7, 8, 10, 13, 14, 15, 16, 18, 19, 20].includes(colNum)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      if (colNum === 1) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
      }

      if (colNum === 4) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: timerBg } };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: timerFont } };
      }

      // Highlight tooth numbers
      if (colNum === 13 && val && val !== '-') {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      }

      // Highlight Arch / Sets
      if (colNum === 14 && val && val !== '-') {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0284C7' } };
      }

      // Highlight Shade
      if (colNum === 15 && val && val !== '-') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB45309' } };
      }

      // Highlight Units
      if (colNum === 16) {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      }
    });
  });

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5 + orders.length, 5), column: columns.length }
  };

  // --- SHEET 2: Clinic Details ---
  addClinicsWorksheet(wb, clinics, orders);

  return wb;
}

module.exports = { generateOrdersExcel };
