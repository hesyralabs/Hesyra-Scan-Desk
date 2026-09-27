/**
 * Back-Office Order Tracker with Live 48-Hour Countdown Timers & Excel Export
 * (No Patient Chart ID, No Clinic Username, No Portal ID)
 */
let currentOrders = [];
let activeFilters = { search: '', status: 'all', clinicId: 'all', datePreset: 'all' };
let timerInterval = null;

async function initDashboard() {
  setupFilterListeners();
  setupExcelExport();
  setupGoogleSheetsConfig();
  setupGoogleDriveSync();
  await refreshDashboardStats();
  await loadOrders();
  await checkGoogleDriveStatus();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateAllCountdowns();
  }, 10000);
}

async function refreshDashboardStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('stat-today-cases').textContent = s.todayOrders || 0;
      document.getElementById('stat-today-units').textContent = `${s.todayUnits || 0} Units`;
      document.getElementById('stat-urgent-cases').textContent = s.urgentCount || 0;
      document.getElementById('stat-crown-cases').textContent = s.crownsCount || 0;
      document.getElementById('stat-active-cases').textContent = s.activeCases || 0;
      document.getElementById('stat-dispatched-today').textContent = s.dispatchedCount || 0;
    }
  } catch (err) {}
}

async function loadOrders() {
  const tableBody = document.getElementById('orders-table-body');
  if (!tableBody) return;

  try {
    const p = new URLSearchParams();
    if (activeFilters.search) p.set('search', activeFilters.search);
    if (activeFilters.status !== 'all') p.set('status', activeFilters.status);
    if (activeFilters.clinicId !== 'all') p.set('clinicId', activeFilters.clinicId);
    if (activeFilters.datePreset !== 'all') p.set('datePreset', activeFilters.datePreset);

    const res = await fetch(`/api/orders?${p.toString()}`);
    const data = await res.json();

    if (data.success) {
      currentOrders = data.orders || [];
      renderOrdersTable(currentOrders);
    }
  } catch (err) {
    console.error('loadOrders error:', err);
  }
}

function renderOrdersTable(orders) {
  const tableBody = document.getElementById('orders-table-body');
  const countEl = document.getElementById('table-results-count');

  if (countEl) countEl.textContent = `${orders.length} Case${orders.length === 1 ? '' : 's'} Listed`;

  if (!orders || orders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div>
          <div style="font-weight: 700; color: var(--text-main);">No cases found</div>
          <div style="font-size: 0.85rem;">Technicians can enroll cases chairside using the "Field Scanner" tab.</div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = orders.map(o => {
    let items = [];
    try {
      items = JSON.parse(o.items || '[]');
    } catch (e) {
      items = [];
    }

    const itemsSummaryHtml = items.map(it => `
      <div style="margin-bottom: 3px;">
        <span style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">${escapeHtml(it.product || o.primaryProduct)}</span>
        <span style="font-size: 0.75rem; color: var(--text-muted);">[${escapeHtml(it.plan || o.primaryPlan)}]</span>
        ${it.toothNumbers ? `<span class="teeth-pill">#${escapeHtml(it.toothNumbers)}</span>` : ''}
        <span style="font-size: 0.75rem; background: #0f172a; color: #fff; padding: 1px 5px; border-radius: 4px; font-weight: 700;">${escapeHtml(it.shade || o.shade)}</span>
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">x${it.qty || 1}</span>
      </div>
    `).join('');

    return `
      <tr data-order-id="${o.orderId}" data-deadline="${o.deliveryDeadline}" data-status="${o.status}">
        <td class="order-id-cell">
          <div>${escapeHtml(o.orderId)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">
            Scan: ${new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </td>

        <td class="timer-cell" id="timer-${o.orderId}">
          ${getTimerBadgeHtml(o.deliveryDeadline, o.status)}
        </td>

        <td class="clinic-cell">
          <div style="font-weight: 700;">${escapeHtml(o.clinicName)}</div>
          <div class="doctor-sub">
            ${escapeHtml(o.primaryDoctorName)} ${o.clinicPhone ? `(${escapeHtml(o.clinicPhone)})` : ''}
          </div>
        </td>

        <td class="patient-cell">
          <div style="font-weight: 700;">${escapeHtml(o.patientName)}</div>
          <div class="patient-sub">
            ${[o.patientAge ? `${o.patientAge} Yrs` : '', o.patientSex].filter(Boolean).join(' • ')}
          </div>
          ${o.consultantDoctor ? `<div style="font-size: 0.72rem; color: #2563eb;">Consultant: ${escapeHtml(o.consultantDoctor)}</div>` : ''}
        </td>

        <td>
          ${itemsSummaryHtml}
          ${o.clinicalNotes ? `<div style="font-size: 0.72rem; color: #64748b; font-style: italic; margin-top: 2px;">Note: ${escapeHtml(o.clinicalNotes)}</div>` : ''}
        </td>

        <td>
          <select class="status-select-inline status-${o.status.toLowerCase().replace(/[^a-z]/g, '')}" onchange="updateOrderStatus('${o.orderId}', this.value)">
            <option value="Scanned" ${o.status === 'Scanned' ? 'selected' : ''}>📥 Scanned</option>
            <option value="In CAD" ${o.status === 'In CAD' ? 'selected' : ''}>💻 In CAD</option>
            <option value="In Milling" ${o.status === 'In Milling' ? 'selected' : ''}>⚙️ In Milling</option>
            <option value="Sintering/Glaze" ${o.status === 'Sintering/Glaze' ? 'selected' : ''}>🔥 Sintering/Glaze</option>
            <option value="QC Passed" ${o.status === 'QC Passed' ? 'selected' : ''}>✅ QC Passed</option>
            <option value="Dispatched" ${o.status === 'Dispatched' ? 'selected' : ''}>🚚 Dispatched</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>🎉 Delivered</option>
          </select>
        </td>

        <td>
          <div style="font-size: 0.8rem; font-weight: 600;">${escapeHtml(o.techName || '-')}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(o.scannerModel || 'Scanner')}</div>
        </td>

        <td>
          <div class="action-btns-group">
            <button type="button" class="btn-icon-action" title="View Details" onclick="viewOrderDetails('${o.orderId}')">🔍</button>
            <button type="button" class="btn-icon-action" title="Print Lab Job Card" onclick="printJobTicket('${o.orderId}')">🖨️</button>
            ${o.scanLink ? `<a href="${escapeHtml(o.scanLink)}" target="_blank" rel="noopener noreferrer" class="btn-icon-action" title="Open Scan Link">☁️</a>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getTimerBadgeHtml(deadlineIso, status) {
  if (['Dispatched', 'Delivered'].includes(status)) {
    return `<span class="badge badge-delivered" style="font-size: 0.78rem;">✓ Delivered (${status})</span>`;
  }

  const deadline = new Date(deadlineIso);
  const now = new Date();
  const diffMs = deadline - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 0) {
    const overH = Math.abs(Math.floor(diffHours));
    const overM = Math.abs(Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
    return `
      <div class="timer-badge timer-overdue">
        <span class="timer-icon">⏰</span>
        <div>
          <div style="font-weight: 800; font-size: 0.85rem; line-height: 1;">OVERDUE</div>
          <div style="font-size: 0.7rem;">by ${overH}h ${overM}m</div>
        </div>
      </div>
    `;
  }

  const leftH = Math.floor(diffHours);
  const leftM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let timerClass = 'timer-ok';
  let icon = '⏳';
  let label = '48h Promised';

  if (leftH <= 4) {
    timerClass = 'timer-critical';
    icon = '🚨';
    label = 'CRITICAL';
  } else if (leftH <= 12) {
    timerClass = 'timer-warning';
    icon = '⚡';
    label = 'DUE SOON';
  }

  return `
    <div class="timer-badge ${timerClass}">
      <span class="timer-icon">${icon}</span>
      <div>
        <div style="font-weight: 800; font-size: 0.88rem; line-height: 1.1;">${leftH}h ${leftM}m left</div>
        <div style="font-size: 0.68rem; opacity: 0.85;">${label}</div>
      </div>
    </div>
  `;
}

function updateAllCountdowns() {
  document.querySelectorAll('tr[data-order-id]').forEach(row => {
    const orderId = row.getAttribute('data-order-id');
    const deadline = row.getAttribute('data-deadline');
    const status = row.getAttribute('data-status');
    const cell = document.getElementById(`timer-${orderId}`);
    if (cell && deadline) {
      cell.innerHTML = getTimerBadgeHtml(deadline, status);
    }
  });
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Case ${orderId} moved to ${newStatus}`, 'success');
      refreshDashboardStats();
      await loadOrders();
    }
  } catch (e) {}
}

function setupFilterListeners() {
  document.getElementById('dashboard-search-input')?.addEventListener('input', (e) => {
    activeFilters.search = e.target.value.trim();
    loadOrders();
  });
  document.getElementById('filter-status')?.addEventListener('change', (e) => {
    activeFilters.status = e.target.value;
    loadOrders();
  });
  document.getElementById('filter-date')?.addEventListener('change', (e) => {
    activeFilters.datePreset = e.target.value;
    loadOrders();
  });
}

function setupExcelExport() {
  document.getElementById('btn-export-excel')?.addEventListener('click', () => {
    window.location.href = '/api/export/excel';
    showToast('Downloading 48-Hour Case Ledger (.xlsx)...', 'success');
  });
}

function setupGoogleSheetsConfig() {
  const btnOpen = document.getElementById('btn-open-google-settings');
  const modal = document.getElementById('google-settings-modal');
  const btnSave = document.getElementById('btn-save-google-settings');
  const btnTest = document.getElementById('btn-test-google-sync');
  const inputUrl = document.getElementById('input-google-webhook');

  btnOpen?.addEventListener('click', async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/settings/google-script').then(r => r.json())
      ]);
      if (r1.success && inputUrl) inputUrl.value = r1.settings.google_sheet_webhook_url || '';
      if (r2.success) document.getElementById('google-script-code').textContent = r2.script;
      modal.classList.add('open');
    } catch (e) {}
  });

  btnSave?.addEventListener('click', async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_sheet_webhook_url: inputUrl.value.trim() })
    });
    showToast('Google Sheet webhook saved!', 'success');
    modal.classList.remove('open');
  });

  btnTest?.addEventListener('click', async () => {
    btnTest.textContent = 'Testing...';
    try {
      const res = await fetch('/api/settings/test-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl.value.trim() })
      });
      const data = await res.json();
      if (data.success) showToast('✅ Google Sheet is verified and connected!', 'success');
      else showToast('❌ ' + data.error, 'error');
    } catch (e) {
      showToast('❌ Test failed: ' + e.message, 'error');
    } finally {
      btnTest.textContent = 'Test Connection';
    }
  });

  document.getElementById('btn-copy-script')?.addEventListener('click', () => {
    const c = document.getElementById('google-script-code')?.textContent;
    if (c) {
      navigator.clipboard.writeText(c);
      showToast('Google Apps Script copied to clipboard!', 'info');
    }
  });
}

function viewOrderDetails(orderId) {
  const o = currentOrders.find(x => x.orderId === orderId);
  if (!o) return;
  const modal = document.getElementById('order-detail-modal');
  if (!modal) return;

  document.getElementById('detail-modal-title').textContent = `Case ${o.orderId} — ${o.patientName}`;

  let items = [];
  try { items = JSON.parse(o.items || '[]'); } catch (e) {}

  document.getElementById('detail-modal-body').innerHTML = `
    <div style="background: #0f172a; color: #fff; padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">48-Hour Delivery Commitment</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #38bdf8;">Promised By: ${new Date(o.deliveryDeadline).toLocaleString('en-IN')}</div>
        </div>
        <div>${getTimerBadgeHtml(o.deliveryDeadline, o.status)}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem;">
      <div>
        <strong>Clinic:</strong> ${escapeHtml(o.clinicName)}<br>
        <strong>Primary Doctor:</strong> ${escapeHtml(o.primaryDoctorName)}<br>
        <strong>Phone:</strong> ${escapeHtml(o.clinicPhone || '-')}<br>
        <strong>City:</strong> ${escapeHtml(o.clinicCity || 'Nagpur')}
      </div>
      <div>
        <strong>Patient Name:</strong> ${escapeHtml(o.patientName)}<br>
        <strong>Age / Sex:</strong> ${escapeHtml(o.patientAge)} Yrs / ${escapeHtml(o.patientSex)}<br>
        <strong>Consultant:</strong> ${escapeHtml(o.consultantDoctor || 'None')} (${escapeHtml(o.consultantPhone || '-')})
      </div>
    </div>

    <div style="background: var(--bg-card-subtle); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 0.5rem; text-transform: uppercase; color: var(--primary);">
        Fabrication Work & Specifications (${o.totalUnits} Units)
      </div>
      ${items.map((it, idx) => `
        <div style="padding: 0.4rem 0; border-bottom: 1px solid var(--border-color);">
          <strong>#${idx + 1} ${escapeHtml(it.product)}</strong> [${escapeHtml(it.plan)}] — 
          Teeth: <span class="tooth-tag">#${escapeHtml(it.toothNumbers || 'N/A')}</span> | 
          Shade: <strong>${escapeHtml(it.shade || 'A2')}</strong> | 
          Qty: <strong>${it.qty || 1}</strong>
          ${it.lineNote ? `<div style="font-size: 0.8rem; color: #64748b;">Note: ${escapeHtml(it.lineNote)}</div>` : ''}
        </div>
      `).join('')}
    </div>

    ${o.clinicalNotes ? `
      <div style="padding: 0.75rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-md); font-size: 0.85rem; margin-bottom: 1rem;">
        <strong>Special Shade / Remake / Delivery Notes:</strong><br>
        ${escapeHtml(o.clinicalNotes)}
      </div>
    ` : ''}

    <div style="font-size: 0.82rem; color: var(--text-muted);">
      Scanned by <strong>${escapeHtml(o.techName)}</strong> on ${new Date(o.createdAt).toLocaleString('en-IN')} using ${escapeHtml(o.scannerModel || 'Intraoral Scanner')}.
    </div>
  `;

  modal.classList.add('open');
}

function printJobTicket(orderId) {
  const o = currentOrders.find(x => x.orderId === orderId);
  if (!o) return;
  const printArea = document.getElementById('print-ticket-area');
  if (!printArea) return;

  let items = [];
  try { items = JSON.parse(o.items || '[]'); } catch (e) {}

  printArea.innerHTML = `
    <div class="job-ticket-card">
      <div class="ticket-header">
        <div>
          <h2 style="margin: 0; font-size: 1.4rem;">HESYRA DENTAL LABS</h2>
          <div style="font-size: 0.85rem; color: #475569;">Central Milling & CAD Centre, Nagpur • 48-Hour Delivery Commitment</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.4rem; font-weight: 800; color: #1e3a8a;">${escapeHtml(o.orderId)}</div>
          <div style="font-size: 0.85rem; font-weight: 700; color: #dc2626;">
            MUST DELIVER BY: ${new Date(o.deliveryDeadline).toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div class="ticket-grid">
        <div class="ticket-item"><div class="ticket-item-label">Clinic</div><div class="ticket-item-val">${escapeHtml(o.clinicName)}</div></div>
        <div class="ticket-item"><div class="ticket-item-label">Doctor</div><div class="ticket-item-val">${escapeHtml(o.primaryDoctorName)}</div></div>
        <div class="ticket-item"><div class="ticket-item-label">Patient</div><div class="ticket-item-val">${escapeHtml(o.patientName)} (${o.patientAge}y / ${o.patientSex})</div></div>
        <div class="ticket-item"><div class="ticket-item-label">Consultant Doctor</div><div class="ticket-item-val">${escapeHtml(o.consultantDoctor || 'None')}</div></div>
      </div>

      <div style="border: 1px solid #0f172a; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem;">
        <div style="font-weight: 800; font-size: 0.9rem; margin-bottom: 0.4rem;">FABRICATION WORK (${o.totalUnits} UNITS):</div>
        ${items.map(it => `
          <div style="font-size: 0.9rem; margin-bottom: 3px;">
            • <strong>${escapeHtml(it.product)}</strong> (${escapeHtml(it.plan)}) | Teeth: <strong>#${escapeHtml(it.toothNumbers || '')}</strong> | Shade: <strong>${escapeHtml(it.shade)}</strong> | Qty: ${it.qty || 1}
            ${it.lineNote ? `<span style="font-style: italic; color: #475569;"> - ${escapeHtml(it.lineNote)}</span>` : ''}
          </div>
        `).join('')}
      </div>

      ${o.clinicalNotes ? `
        <div style="border: 1px dashed #64748b; padding: 0.6rem; border-radius: 4px; font-size: 0.85rem; margin-bottom: 1rem;">
          <strong>CLINICAL NOTES:</strong> ${escapeHtml(o.clinicalNotes)}
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 0.5rem;">
        <div>Scan: ${new Date(o.createdAt).toLocaleString('en-IN')}</div>
        <div>Milling Sign: _______________</div>
        <div>QC Inspector: _______________</div>
      </div>
    </div>
  `;

  window.print();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.initDashboard = initDashboard;
window.refreshDashboardStats = refreshDashboardStats;
window.loadOrders = loadOrders;
window.updateOrderStatus = updateOrderStatus;
window.viewOrderDetails = viewOrderDetails;
window.printJobTicket = printJobTicket;


window.copyBillingTextForOrder = async function(orderId) {
  const o = allOrders.find(item => item.orderId === orderId);
  if (!o) return;
  let items = [];
  try { items = JSON.parse(o.items || '[]'); } catch (e) {}

  const text = window.generateBillingText ? window.generateBillingText({
    patientName: o.patientName,
    patientAge: o.patientAge,
    patientSex: o.patientSex,
    clinicName: o.clinicName,
    primaryDoctorName: o.primaryDoctorName,
    consultantDoctor: o.consultantDoctor,
    consultantPhone: o.consultantPhone,
    clinicPhone: o.clinicPhone,
    clinicCity: o.clinicCity,
    items,
    clinicalNotes: o.clinicalNotes
  }) : `Patient: ${o.patientName}\nClinic: ${o.clinicName}`;

  if (window.copyBillingTextToClipboard) {
    await window.copyBillingTextToClipboard(text);
  } else {
    try {
      await navigator.clipboard.writeText(text);
    } catch(err) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('📋 Copied for Billing System! Ready to 1-click paste.', 'success');
  }
};


/* ==========================================================================
   GOOGLE DRIVE CLIENT SYNCHRONIZATION
   ========================================================================== */

function setupGoogleDriveSync() {
  const btnHeader = document.getElementById('btn-header-gdrive');
  const btnToolbar = document.getElementById('btn-sync-gdrive');
  const btnMini = document.getElementById('btn-gdrive-sync-now');

  if (btnHeader) btnHeader.addEventListener('click', () => triggerDriveSync());
  if (btnToolbar) btnToolbar.addEventListener('click', () => triggerDriveSync());
  if (btnMini) btnMini.addEventListener('click', () => triggerDriveSync());
}

async function checkGoogleDriveStatus() {
  try {
    const res = await fetch('/api/gdrive/status');
    const data = await res.json();
    if (data.success) {
      updateDriveStatusUI(data);
    }
  } catch (err) {
    console.warn('checkGoogleDriveStatus error:', err);
  }
}

function updateDriveStatusUI(status) {
  const headerText = document.getElementById('header-gdrive-text');
  const headerDot = document.getElementById('header-gdrive-dot');
  const bannerDot = document.getElementById('gdrive-banner-dot');
  const bannerPath = document.getElementById('gdrive-path-label');
  const bannerTime = document.getElementById('gdrive-last-sync-label');

  if (headerText) {
    headerText.textContent = status.isDriveConnected ? 'GDrive Active' : 'Drive Offline';
  }
  if (headerDot) {
    headerDot.className = `gdrive-dot ${status.isDriveConnected ? 'online' : 'offline'}`;
  }
  if (bannerDot) {
    bannerDot.className = `gdrive-banner-dot ${status.isDriveConnected ? 'online' : 'offline'}`;
  }
  if (bannerPath) {
    bannerPath.textContent = `Folder: ${status.drivePath || 'G:\\My Drive\\Hesyra Invoices'}`;
  }
  if (bannerTime) {
    if (status.lastSyncedAt) {
      const timeStr = new Date(status.lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      bannerTime.textContent = `Last synced: ${timeStr}`;
    } else {
      bannerTime.textContent = 'Last synced: Just now';
    }
  }
}

async function triggerDriveSync() {
  const btnToolbar = document.getElementById('btn-sync-gdrive');
  const btnMini = document.getElementById('btn-gdrive-sync-now');
  const syncIcon = document.getElementById('sync-icon-spin');
  const btnText = document.getElementById('btn-sync-gdrive-text');

  if (btnToolbar) btnToolbar.disabled = true;
  if (btnMini) btnMini.disabled = true;
  if (syncIcon) syncIcon.classList.add('spin');
  if (btnText) btnText.textContent = 'Syncing...';

  try {
    const res = await fetch('/api/gdrive/sync', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      updateDriveStatusUI(data);
      if (window.showToast) {
        window.showToast('✅ Synced to Google Drive! Hesyra_Master_Billing.xlsx & Hesyra_Field_Scan_Orders.xlsx updated.', 'success');
      }
      await refreshDashboardStats();
      await loadOrders();
    } else {
      if (window.showToast) {
        window.showToast('⚠️ Google Drive notice: ' + (data.message || 'Check drive connection'), 'warning');
      }
    }
  } catch (err) {
    if (window.showToast) {
      window.showToast('Error syncing to Google Drive: ' + err.message, 'error');
    }
  } finally {
    if (btnToolbar) btnToolbar.disabled = false;
    if (btnMini) btnMini.disabled = false;
    if (syncIcon) syncIcon.classList.remove('spin');
    if (btnText) btnText.textContent = 'Sync Google Drive';
  }
}

window.setupGoogleDriveSync = setupGoogleDriveSync;
window.checkGoogleDriveStatus = checkGoogleDriveStatus;
window.triggerDriveSync = triggerDriveSync;
