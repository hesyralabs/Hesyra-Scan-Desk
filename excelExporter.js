const ExcelJS = require('exceljs');

/**
 * Generate formatted Excel (.xlsx) workbook without patient ref ID, clinic username or portal ID
 */
async function generateOrdersExcel(orders) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hesyra Dental Labs - Field Scan Desk';
  wb.created = new Date();

  const ws = wb.addWorksheet('Field Scan Orders', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }]
  });

  const THEME = {
    brandPrimary: '1E3A8A',
    headerBg: '0F172A'
  };

  // Row 1: Title Banner
  ws.mergeCells('A1:R1');
  const title = ws.getCell('A1');
  title.value = 'HESYRA DENTAL LABS — 48-HOUR FIELD SCAN ORDERS & CLINICAL ENTRY LEDGER';
  title.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandPrimary } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 34;

  // Row 2: Subtitle
  ws.mergeCells('A2:R2');
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
    return diffHours <= 12;
  }).length;
  const activeCount = orders.filter(o => !['Dispatched', 'Delivered', 'Cancelled'].includes(o.status)).length;
  const completedCount = orders.filter(o => ['Dispatched', 'Delivered'].includes(o.status)).length;

  ws.mergeCells('A3:C4');
  setKpi(ws.getCell('A3'), `Total Cases Enrolled\n${total} Cases (${totalUnits} Units)`, 'FF0284C7');

  ws.mergeCells('D3:G4');
  setKpi(ws.getCell('D3'), `48h SLA Critical (<12h Left)\n${urgentCount} Urgent Cases`, 'FFDC2626');

  ws.mergeCells('H3:K4');
  setKpi(ws.getCell('H3'), `Active in Lab Production\n${activeCount} Cases`, 'FFD97706');

  ws.mergeCells('L3:O4');
  setKpi(ws.getCell('L3'), `Dispatched / Delivered\n${completedCount} Completed`, 'FF16A34A');

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

  // Row 5: Column Headers (NO Username, NO Portal ID, NO Patient/Chart ID)
  const columns = [
    { header: 'Order ID', width: 17 },
    { header: 'Scan Date & Time', width: 20 },
    { header: 'Promised Delivery (48h Deadline)', width: 25 },
    { header: '48h SLA Status', width: 22 },
    { header: 'Clinic Name', width: 28 },
    { header: 'Primary Doctor Name', width: 24 },
    { header: 'Clinic Phone', width: 16 },
    { header: 'City / District', width: 15 },
    { header: 'Patient Name', width: 24 },
    { header: 'Age / Sex', width: 14 },
    { header: 'Consultant Doctor', width: 24 },
    { header: 'Fabrication Items (Product & Specs)', width: 38 },
    { header: 'Total Units', width: 12 },
    { header: 'Special Shade / Remake / Delivery Notes', width: 35 },
    { header: 'Production Stage', width: 18 },
    { header: 'Field Technician', width: 18 },
    { header: 'Scanner Hardware', width: 18 },
    { header: 'Cloud Scan Link', width: 26 }
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

    if (['Dispatched', 'Delivered'].includes(o.status)) {
      timerStatus = `Completed (${o.status})`;
      timerBg = 'FFDCFCE7';
      timerFont = 'FF15803D';
    } else {
      const deadline = new Date(o.deliveryDeadline);
      const diffMs = deadline - now;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 0) {
        const overHours = Math.abs(Math.floor(diffHours));
        const overMins = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
        timerStatus = `OVERDUE by ${overHours}h ${overMins}m`;
        timerBg = 'FFFEE2E2';
        timerFont = 'FF991B1B';
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
    }

    let itemsDesc = '';
    try {
      const parsed = JSON.parse(o.items || '[]');
      if (Array.isArray(parsed) && parsed.length) {
        itemsDesc = parsed.map(item => {
          const spec = item.arch ? `Arch: ${item.arch}` : (item.toothNumbers ? `Teeth: #${item.toothNumbers}` : '');
          const shadePart = item.shade ? ` | Shade: ${item.shade}` : '';
          return `${item.product || ''} [${item.plan || ''}] - Qty: ${item.qty || 1} | ${spec}${shadePart} ${item.lineNote ? `(${item.lineNote})` : ''}`;
        }).join('; ');
      }
    } catch (e) {
      itemsDesc = `${o.primaryProduct || ''} - Teeth: #${o.toothNumbers || ''} | Shade: ${o.shade || ''}`;
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
      o.consultantDoctor || '-',
      itemsDesc,
      parseInt(o.totalUnits, 10) || 1,
      o.clinicalNotes || '-',
      o.status || 'Scanned',
      o.techName || '',
      o.scannerModel || 'Medit i700',
      o.scanLink || ''
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

      if ([1, 2, 3, 4, 10, 13, 15].includes(colNum)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      if (colNum === 1) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
      }

      if (colNum === 4) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: timerBg } };
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: timerFont } };
      }

      if (colNum === 18 && val && String(val).startsWith('http')) {
        cell.value = { text: 'Open Scan Files ↗', hyperlink: String(val) };
        cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF2563EB' }, underline: true };
      }
    });
  });

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: columns.length }
  };

  return wb;
}

module.exports = { generateOrdersExcel };
