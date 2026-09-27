const { getSetting, setSetting, db } = require('./database');

/**
 * Sync an order to Google Sheets via Webhook (Google Apps Script Web App)
 * @param {Object} order - The order record
 * @param {string} action - 'INSERT' | 'UPDATE'
 */
async function syncOrderToGoogleSheet(order, action = 'INSERT') {
  const webhookUrl = getSetting('google_sheet_webhook_url');
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, reason: 'Google Sheets Webhook URL not configured.' };
  }

  // Format row for Google Sheet
  const payload = {
    action,
    timestamp: new Date().toISOString(),
    orderId: order.orderId,
    scanDate: order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : '',
    clinicName: order.clinicName || '',
    doctorName: order.doctorName || '',
    doctorPhone: order.doctorPhone || '',
    clinicCity: order.clinicCity || 'Nagpur',
    patientName: order.patientName || '',
    patientAgeGender: [order.patientAge, order.patientGender].filter(Boolean).join(' / '),
    patientRefId: order.patientRefId || '',
    caseType: order.caseType || '',
    toothNumbers: order.toothNumbers || '',
    totalUnits: order.totalUnits || 1,
    material: order.material || '',
    shade: order.shade || '',
    stumpShade: order.stumpShade || '',
    occlusalClearance: order.occlusalClearance || 'Normal',
    contactTightness: order.contactTightness || 'Normal',
    marginType: order.marginType || 'Chamfer',
    ponticDesign: order.ponticDesign || '',
    priority: order.priority || 'Standard',
    dueDate: order.dueDate || '',
    status: order.status || 'Scanned',
    techName: order.techName || '',
    scannerModel: order.scannerModel || '',
    scanLink: order.scanLink || '',
    deliveryType: order.deliveryType || '',
    doctorInstructions: order.doctorInstructions || ''
  };

  try {
    const response = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const isOk = response.ok;
    const resText = await response.text();

    if (isOk) {
      db.prepare(`
        UPDATE orders 
        SET googleSynced = 1, googleSyncedAt = datetime('now') 
        WHERE orderId = ?
      `).run(order.orderId);
      return { success: true, message: 'Synced successfully to Google Sheets' };
    } else {
      return { success: false, reason: `HTTP ${response.status}: ${resText}` };
    }
  } catch (err) {
    console.error('Google Sheets sync error:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Test Google Sheets Webhook Connection
 */
async function testGoogleWebhook(url) {
  if (!url || !url.trim().startsWith('http')) {
    throw new Error('Please enter a valid HTTP/HTTPS Webhook URL.');
  }

  const testPayload = {
    action: 'PING_TEST',
    timestamp: new Date().toISOString(),
    message: 'Testing connection from Hesyra Field Scan Desk'
  };

  const response = await fetch(url.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error(`Webhook returned status ${response.status}`);
  }

  return { success: true, status: response.status };
}

/**
 * Returns the ready-to-paste Google Apps Script code for the user
 */
function getGoogleAppsScriptTemplate() {
  return `/**
 * HESYRA FIELD SCAN DESK — GOOGLE SHEETS LIVE SYNC
 * 1. Open Google Sheet -> Extensions -> Apps Script
 * 2. Paste this entire code replacing existing Code.gs
 * 3. Click 'Deploy' -> 'New deployment' -> Select 'Web app'
 *    - Execute as: 'Me'
 *    - Who has access: 'Anyone'
 * 4. Copy the Web App URL and paste it into Hesyra Scan Desk Settings!
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Field Scan Orders") || ss.getActiveSheet();
    
    // Auto-create styled headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Order ID", "Scan Date", "Clinic Name", "Doctor Name", "Doctor Phone", 
        "City", "Patient Name", "Age/Sex", "Patient Ref", "Case Type", 
        "Tooth # (FDI)", "Units", "Material", "Shade", "Stump Shade", 
        "Occlusion", "Contacts", "Margin", "Pontic", "Priority", 
        "Due Date", "Status", "Technician", "Scanner", "Scan Link", 
        "Delivery Mode", "Clinical Notes / Rx"
      ];
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#1E3A8A").setFontColor("#FFFFFF").setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    
    var data = JSON.parse(e.postData.contents);
    if (data.action === "PING_TEST") {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Check if order already exists (for updates)
    var orderId = data.orderId;
    var rowValues = [
      data.orderId,
      data.scanDate,
      data.clinicName,
      data.doctorName,
      data.doctorPhone,
      data.clinicCity,
      data.patientName,
      data.patientAgeGender,
      data.patientRefId,
      data.caseType,
      data.toothNumbers,
      data.totalUnits,
      data.material,
      data.shade,
      data.stumpShade,
      data.occlusalClearance,
      data.contactTightness,
      data.marginType,
      data.ponticDesign,
      data.priority,
      data.dueDate,
      data.status,
      data.techName,
      data.scannerModel,
      data.scanLink,
      data.deliveryType,
      data.doctorInstructions
    ];
    
    var existingRow = -1;
    var dataRows = sheet.getLastRow();
    if (dataRows > 1) {
      var idColumn = sheet.getRange(2, 1, dataRows - 1, 1).getValues();
      for (var i = 0; i < idColumn.length; i++) {
        if (idColumn[i][0] === orderId) {
          existingRow = i + 2;
          break;
        }
      }
    }
    
    if (existingRow > -1) {
      sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", orderId: orderId }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;
}

module.exports = {
  syncOrderToGoogleSheet,
  testGoogleWebhook,
  getGoogleAppsScriptTemplate
};
