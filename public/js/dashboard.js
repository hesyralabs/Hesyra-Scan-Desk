/**
 * Back-Office Order Tracker with Live 48-Hour Countdown Timers & Excel Export
 * Role-Based Access Control: Admin has full status/delete/sync power; Field Tech has read-only tracking.
 */
let currentOrders = [];
let activeFilters = { search: '', status: 'all', clinicId: 'all', datePreset: 'all', archive: 'all' };
let timerInterval = null;

function getStatusIcon(status) {
  switch (status) {
    case 'Scanned': return '<i data-lucide="inbox"></i>';
    case 'In CAD': return '<i data-lucide="box"></i>';
    case 'In Milling': return '<i data-lucide="cog"></i>';
    case 'Sintering/Glaze': return '<i data-lucide="flame"></i>';
    case 'QC Passed': return '<i data-lucide="shield-check"></i>';
    case 'Dispatched': return '<i data-lucide="truck"></i>';
    case 'Delivered': return '<i data-lucide="check-circle-2"></i>';
    default: return '<i data-lucide="package"></i>';
  }
}

async function initDashboard() {
  setupFilterListeners();
  setupExcelExport();
  setupGoogleSheetsConfig();
  setupGoogleDriveSync();
  setupLiveLedgerStream();
  await refreshDashboardStats();
  await loadOrders();
  if (window.currentUser?.role === 'admin') {
    await checkGoogleDriveStatus();
  }

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
      const elTotal = document.getElementById('stat-total-cases') || document.getElementById('stat-today-cases');
      if (elTotal) elTotal.textContent = s.totalOrders || 0;

      const elUrgent = document.getElementById('stat-sla-urgent') || document.getElementById('stat-urgent-cases');
      if (elUrgent) elUrgent.textContent = s.urgentCount || 0;

      const elActive = document.getElementById('stat-active-cases');
      if (elActive) elActive.textContent = s.activeCases || 0;

      const elArchived = document.getElementById('stat-archived-cases');
      if (elArchived) elArchived.textContent = s.archivedCount || 0;

      const elDispatched = document.getElementById('stat-dispatched-today');
      if (elDispatched) elDispatched.textContent = s.dispatchedCount || 0;

      // Update segmented pill count tags
      const pillActive = document.getElementById('pill-active-count');
      if (pillActive) pillActive.textContent = s.activeCases || 0;

      const pillArchived = document.getElementById('pill-archived-count');
      if (pillArchived) pillArchived.textContent = s.archivedCount || 0;

      const pillAll = document.getElementById('pill-all-count');
      if (pillAll) pillAll.textContent = s.totalOrders || 0;
    }
  } catch (err) {}
}

async function loadOrders() {
  const tableBody = document.getElementById('orders-table-body');
  if (!tableBody) return;

  try {
    const p = new URLSearchParams();
    p.set('archive', activeFilters.archive || 'all');
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
  const isAdmin = window.currentUser?.role === 'admin';

  if (countEl) countEl.textContent = `${orders.length} Case${orders.length === 1 ? '' : 's'} Listed`;

  if (!orders || orders.length === 0) {
    if (activeFilters.archive === 'active') {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3.5rem 1rem; color: var(--text-muted);">
            <div style="margin-bottom: 0.75rem;"><i data-lucide="shield-check" class="lucide-hero" style="stroke-width: 1.5px; opacity: 0.7; color: #0d9488;"></i></div>
            <div style="font-weight: 800; color: var(--text-main); font-size: 1.05rem;">All Active Cases Cleared!</div>
            <div style="font-size: 0.86rem; margin-top: 5px; color: var(--text-muted); max-width: 480px; margin-left: auto; margin-right: auto;">
              No pending cases within the 48-hour SLA turnaround window. Cases older than 48 hours have been archived.
            </div>
            <div style="margin-top: 1.25rem; display: flex; gap: 0.75rem; justify-content: center;">
              <button type="button" class="btn btn-secondary" style="font-size: 0.82rem;" onclick="switchToArchiveView()">
                <i data-lucide="archive"></i> View Archived Cases (&gt;48h)
              </button>
            </div>
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <div style="margin-bottom: 0.65rem;"><i data-lucide="clipboard-list" class="lucide-hero" style="stroke-width: 1.5px; opacity: 0.5;"></i></div>
            <div style="font-weight: 700; color: var(--text-main);">No cases found in this view</div>
            <div style="font-size: 0.85rem;">Try clearing your filters or select a different view mode.</div>
          </td>
        </tr>
      `;
    }
    return;
  }

  tableBody.innerHTML = orders.map(o => {
    const isCaseArchived = Boolean(o.isArchived || new Date(o.deliveryDeadline) < new Date());

    let items = [];
    try {
      items = JSON.parse(o.items || '[]');
    } catch (e) {
      items = [];
    }

    const itemsSummaryHtml = items.map(it => {
      let prodName = it.product || o.primaryProduct || 'Prosthesis';
      if (prodName === 'Permanent Crown') {
        const isZirconia = (it.unitPrice >= 1200) || (o.clinicalNotes && o.clinicalNotes.includes('ZC')) || (it.toothNumbers && (it.toothNumbers.includes('35') || it.toothNumbers.includes('15, 16')));
        prodName = isZirconia ? 'Zirconia Crown' : 'Ceramic Crown';
      }

      let planName = it.plan || o.primaryPlan || '';
      if (planName === '-' || planName.includes('Warranty') || planName.includes('Hesyra') || planName.toLowerCase().includes('tier')) {
        planName = '';
      }

      let rawTeeth = (it.toothNumbers && it.toothNumbers !== '-') ? String(it.toothNumbers).replace(/^#+/, '').trim() : '';
      let rawShade = (it.shade && it.shade !== '-') ? String(it.shade).trim() : '';
      let rawArch = (it.archTarget && it.archTarget !== '-') ? String(it.archTarget).trim() : '';

      return `
        <div style="margin-bottom: 4px; line-height: 1.4;">
          <span style="font-weight: 750; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(prodName)}</span>
          ${planName ? `<span style="font-size: 0.75rem; color: var(--text-muted); margin-left: 2px;">[${escapeHtml(planName)}]</span>` : ''}
          ${rawArch ? `<span style="font-size: 0.72rem; background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px; font-weight: 600; margin-left: 4px;">${escapeHtml(rawArch)}</span>` : ''}
          ${rawTeeth ? `<span class="teeth-pill" style="font-size: 0.75rem; background: #e0f2fe; color: #0284c7; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;">#${escapeHtml(rawTeeth)}</span>` : ''}
          ${rawShade ? `<span class="shade-pill" style="font-size: 0.72rem; background: #0f172a; color: #fff; padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;">${escapeHtml(rawShade)}</span>` : ''}
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--primary); margin-left: 4px;">x${it.qty || 1}</span>
        </div>
      `;
    }).join('');

    // Production Stage Cell: Admin gets editable select; Tech gets read-only badge
    let stageCellHtml = '';
    if (isAdmin) {
      stageCellHtml = `
        <select class="status-select-inline status-${o.status.toLowerCase().replace(/[^a-z]/g, '')}" onchange="updateOrderStatus('${o.orderId}', this.value)" title="Central Lab Admin: Advance Production Stage">
          <option value="Scanned" ${o.status === 'Scanned' ? 'selected' : ''}>Scanned</option>
          <option value="In CAD" ${o.status === 'In CAD' ? 'selected' : ''}>In CAD</option>
          <option value="In Milling" ${o.status === 'In Milling' ? 'selected' : ''}>In Milling</option>
          <option value="Sintering/Glaze" ${o.status === 'Sintering/Glaze' ? 'selected' : ''}>Sintering / Glaze</option>
          <option value="QC Passed" ${o.status === 'QC Passed' ? 'selected' : ''}>QC Passed</option>
          <option value="Dispatched" ${o.status === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
          <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
        </select>
      `;
    } else {
      stageCellHtml = `
        <span class="status-badge-readonly status-${o.status.toLowerCase().replace(/[^a-z]/g, '')}" title="Lab Stage Managed by Central Lab">
          ${getStatusIcon(o.status)} ${escapeHtml(o.status)}
        </span>
      `;
    }

    // Actions Cell: Admin gets archive toggle & delete button; Tech gets read-only
    let actionsHtml = `
      <div class="action-btns-group">
        <button type="button" class="btn-icon-action" title="View Details" onclick="viewOrderDetails('${o.orderId}')"><i data-lucide="eye"></i></button>
        <button type="button" class="btn-icon-action" title="Print Lab Job Card" onclick="printJobTicket('${o.orderId}')"><i data-lucide="printer"></i></button>
        ${isAdmin ? `
          <button type="button" class="btn-icon-action" title="${isCaseArchived ? 'Restore to Active SLA' : 'Archive Case (>48h)'}" onclick="toggleArchiveOrder('${o.orderId}', ${isCaseArchived ? 0 : 1})" style="color: #64748b;">
            <i data-lucide="${isCaseArchived ? 'archive-restore' : 'archive'}"></i>
          </button>
          <button type="button" class="btn-icon-action btn-delete-order" title="Delete Case (Admin Only)" onclick="confirmDeleteOrder('${o.orderId}')" style="color: #dc2626;">
            <i data-lucide="trash-2"></i>
          </button>
        ` : ''}
        ${o.scanLink ? `<a href="${escapeHtml(o.scanLink)}" target="_blank" rel="noopener noreferrer" class="btn-icon-action" title="Open Scan Link"><i data-lucide="external-link"></i></a>` : ''}
      </div>
    `;

    return `
      <tr data-order-id="${o.orderId}" data-deadline="${o.deliveryDeadline}" data-status="${o.status}" data-archived="${isCaseArchived ? '1' : '0'}">
        <td class="order-id-cell">
          <div style="font-weight: 800; color: #0284c7;">${escapeHtml(o.orderId)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">
            Scan: ${new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
        </td>

        <td class="timer-cell" id="timer-${o.orderId}">
          ${getTimerBadgeHtml(o.deliveryDeadline, o.status, isCaseArchived)}
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
          ${stageCellHtml}
        </td>

        <td>
          <div style="font-size: 0.8rem; font-weight: 600;">${escapeHtml(o.techName || '-')}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(o.scannerModel || 'Scanner')}</div>
        </td>

        <td>
          ${actionsHtml}
        </td>
      </tr>
    `;
  }).join('');
  if (window.refreshIcons) window.refreshIcons();
  else if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
}

function getTimerBadgeHtml(deadlineIso, status, isArchived) {
  const deadline = new Date(deadlineIso);
  const now = new Date();
  const diffMs = deadline - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  const past48h = Boolean(isArchived || diffHours < 0);

  // If past 48h SLA window, render clean neutral archive badge
  if (past48h) {
    if (['Dispatched', 'Delivered'].includes(status)) {
      return `
        <div class="timer-badge timer-archived timer-archived-delivered" title="Archived: Delivered &gt;48h ago">
          <span class="timer-icon"><i data-lucide="check-check" class="lucide-sm"></i></span>
          <div>
            <div style="font-weight: 800; font-size: 0.82rem; line-height: 1;">Archived</div>
            <div style="font-size: 0.68rem; opacity: 0.85;">Delivered &bull; &gt;48h</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="timer-badge timer-archived" title="Archived: Case older than 48h SLA">
        <span class="timer-icon"><i data-lucide="archive" class="lucide-sm"></i></span>
        <div>
          <div style="font-weight: 800; font-size: 0.82rem; line-height: 1;">Archived</div>
          <div style="font-size: 0.68rem; opacity: 0.85;">&gt;48h Turnaround</div>
        </div>
      </div>
    `;
  }

  if (['Dispatched', 'Delivered'].includes(status)) {
    return `<span class="badge badge-delivered" style="font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="check-circle-2" class="lucide-xs"></i> Delivered (${status})</span>`;
  }

  const leftH = Math.floor(diffHours);
  const leftM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  let timerClass = 'timer-ok';
  let icon = '<i data-lucide="clock" class="lucide-sm"></i>';
  let label = '48h Promised';

  if (leftH <= 4) {
    timerClass = 'timer-critical';
    icon = '<i data-lucide="alert-triangle" class="lucide-sm"></i>';
    label = 'CRITICAL';
  } else if (leftH <= 12) {
    timerClass = 'timer-warning';
    icon = '<i data-lucide="clock-4" class="lucide-sm"></i>';
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
  let updated = false;
  document.querySelectorAll('tr[data-order-id]').forEach(row => {
    const orderId = row.getAttribute('data-order-id');
    const deadline = row.getAttribute('data-deadline');
    const status = row.getAttribute('data-status');
    const isArchived = row.getAttribute('data-archived') === '1';
    const cell = document.getElementById(`timer-${orderId}`);
    if (cell && deadline) {
      cell.innerHTML = getTimerBadgeHtml(deadline, status, isArchived);
      updated = true;
    }
  });
  if (updated) {
    if (window.refreshIcons) window.refreshIcons();
    else if (window.lucide) window.lucide.createIcons({ icons: window.lucide.icons });
  }
}

/**
 * Update case stage (Admin Only)
 */
async function updateOrderStatus(orderId, newStatus) {
  if (window.currentUser?.role !== 'admin') {
    showToast('Permission Denied: Only Central Lab Administrators can change production stages.', 'error');
    await loadOrders();
    return;
  }

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
    } else {
      showToast(result.error || 'Failed to update status', 'error');
      await loadOrders();
    }
  } catch (e) {
    showToast('Network error while updating status', 'error');
  }
}

/**
 * Permanently delete case (Admin Only)
 */
async function confirmDeleteOrder(orderId) {
  if (window.currentUser?.role !== 'admin') {
    showToast('Permission Denied: Only Central Lab Administrators can delete cases.', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete case ${orderId}?\nThis cannot be undone and will remove it from the lab ledger.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (result.success) {
      showToast(`Case ${orderId} deleted permanently.`, 'success');
      refreshDashboardStats();
      await loadOrders();
    } else {
      showToast(result.error || 'Failed to delete order', 'error');
    }
  } catch (err) {
    showToast('Error deleting case: ' + err.message, 'error');
  }
}


/**
 * Real-Time Live Ledger Stream (SSE + 5s Heartbeat Sync)
 * Instantly reflects chairside scans submitted by Valaya
 */
let sseConnection = null;
let livePollInterval = null;
let lastKnownTotal = 0;

function setupLiveLedgerStream() {
  if (window.EventSource) {
    if (sseConnection) {
      try { sseConnection.close(); } catch (e) {}
    }

    try {
      sseConnection = new EventSource('/api/events');

      sseConnection.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_ORDER') {
            const o = data.order || {};
            const tech = data.techName || o.techName || 'Valaya';
            const patient = data.patientName || o.patientName || 'Patient';
            const orderId = data.orderId || o.orderId || '';

            // Real-time toast alert
            showToast(`Live Scan: ${tech} enrolled new scan for ${patient} (${orderId})`, 'success');

            // Refresh ledger and KPI cards immediately
            refreshDashboardStats();
            loadOrders();
          } else if (['STATUS_UPDATE', 'ARCHIVE_UPDATE', 'ORDER_DELETED'].includes(data.type)) {
            refreshDashboardStats();
            loadOrders();
          }
        } catch (e) {}
      };
    } catch (err) {
      console.warn('SSE stream init notice:', err);
    }
  }

  // Active 5-second polling fallback
  if (livePollInterval) clearInterval(livePollInterval);
  livePollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        const currentTotal = data.stats.totalOrders || 0;
        if (lastKnownTotal > 0 && currentTotal !== lastKnownTotal) {
          loadOrders();
        }
        lastKnownTotal = currentTotal;
      }
    } catch (e) {}
  }, 5000);
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
  document.querySelectorAll('.archive-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.archive-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.archive = btn.getAttribute('data-archive') || 'active';
      loadOrders();
    });
  });
}

/**
 * Toggle Archive Status for an Order (Admin Only)
 */
async function toggleArchiveOrder(orderId, setArchived) {
  if (window.currentUser?.role !== 'admin') {
    showToast('Permission Denied: Only Central Lab Administrators can manage case archive status.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: setArchived ? 1 : 0 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(setArchived ? `Case ${orderId} moved to Archive.` : `Case ${orderId} restored to Active.`, 'success');
      await refreshDashboardStats();
      await loadOrders();
    } else {
      showToast('Archive action failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Network error while updating archive status.', 'error');
  }
}
window.toggleArchiveOrder = toggleArchiveOrder;

function switchToArchiveView() {
  const pill = document.querySelector('.archive-pill[data-archive="archived"]');
  if (pill) pill.click();
}
window.switchToArchiveView = switchToArchiveView;


function setupExcelExport() {
  document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
    if (window.currentUser?.role !== 'admin') {
      showToast('Permission Denied: Master database export is restricted to Central Lab Administrators.', 'error');
      return;
    }
    const token = localStorage.getItem('hesyra_auth_token') || '';
    const btn = document.getElementById('btn-export-excel');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block animate-spin mr-1">⌛</span> Exporting...';
    }
    showToast('Generating 48-Hour Case Ledger (.xlsx)...', 'info');

    try {
      const res = await fetch(`/api/export/excel?token=${encodeURIComponent(token)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed with status ' + res.status }));
        throw new Error(err.error || 'Server rejected export request');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Hesyra-Crown-Scan-Orders-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      showToast('Case Ledger downloaded successfully!', 'success');
    } catch (err) {
      showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        if (window.refreshIcons) window.refreshIcons();
      }
    }
  });
}

function setupGoogleSheetsConfig() {
  const btnOpen = document.getElementById('btn-open-google-settings');
  const modal = document.getElementById('google-settings-modal');
  const btnSave = document.getElementById('btn-save-google-settings');
  const btnTest = document.getElementById('btn-test-google-sync');
  const inputUrl = document.getElementById('input-google-webhook');

  btnOpen?.addEventListener('click', async () => {
    if (window.currentUser?.role !== 'admin') {
      showToast('Permission Denied: Google Sheets integration is restricted to Central Lab Administrators.', 'error');
      return;
    }
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/settings').then(r => r.json()),
        fetch('/api/settings/google-script').then(r => r.json())
      ]);
      if (r1.success && inputUrl) inputUrl.value = r1.settings.google_sheet_webhook_url || '';
      if (r2.success) document.getElementById('google-script-code').textContent = r2.script;
      modal.classList.add('open');
  if (window.refreshIcons) window.refreshIcons();
    } catch (e) {}
  });

  btnSave?.addEventListener('click', async () => {
    if (window.currentUser?.role !== 'admin') {
      showToast('Administrative privileges required.', 'error');
      return;
    }
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
      if (data.success) showToast('Google Sheet is verified and connected!', 'success');
      else showToast(data.error, 'error');
    } catch (e) {
      showToast('Test failed: ' + e.message, 'error');
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
  const isCaseArchived = Boolean(o.isArchived || new Date(o.deliveryDeadline) < new Date());

  document.getElementById('detail-modal-title').textContent = `Case ${o.orderId} - ${o.patientName}`;

  let items = [];
  try { items = JSON.parse(o.items || '[]'); } catch (e) {}

  document.getElementById('detail-modal-body').innerHTML = `
    <div style="background: #0f172a; color: #fff; padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">48-Hour Delivery Commitment</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #38bdf8;">Promised By: ${new Date(o.deliveryDeadline).toLocaleString('en-IN')}</div>
        </div>
        <div>${getTimerBadgeHtml(o.deliveryDeadline, o.status, isCaseArchived)}</div>
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
        Fabrication Work &amp; Specifications (${o.totalUnits} Units)
      </div>
      ${items.map((it, idx) => `
        <div style="padding: 0.4rem 0; border-bottom: 1px solid var(--border-color);">
          <strong>#${idx + 1} ${escapeHtml(it.product)}</strong> [${escapeHtml(it.plan)}] - 
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
  if (window.refreshIcons) window.refreshIcons();
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
          <div style="font-size: 0.85rem; color: #475569;">Central Milling &amp; CAD Centre, Nagpur • 48-Hour Delivery Commitment</div>
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
              <strong>${escapeHtml(it.product)}</strong> (${escapeHtml(it.plan)}) | Teeth: <strong>#${escapeHtml(it.toothNumbers || '')}</strong> | Shade: <strong>${escapeHtml(it.shade)}</strong> | Qty: ${it.qty || 1}
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

window.initDashboard = initDashboard;
window.refreshDashboardStats = refreshDashboardStats;
window.loadOrders = loadOrders;
window.updateOrderStatus = updateOrderStatus;
window.confirmDeleteOrder = confirmDeleteOrder;
window.viewOrderDetails = viewOrderDetails;
window.printJobTicket = printJobTicket;

/* ==========================================================================
   GOOGLE DRIVE CLIENT SYNCHRONIZATION (Admin Only)
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
  if (window.currentUser?.role !== 'admin') return;
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
  if (window.currentUser?.role !== 'admin') {
    showToast('Permission Denied: Google Drive sync is restricted to Central Lab Administrators.', 'error');
    return;
  }

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
        window.showToast('Synced to Google Drive! Master Billing & Field Scan Ledgers updated.', 'success');
      }
      await refreshDashboardStats();
      await loadOrders();
    } else {
      if (window.showToast) {
        window.showToast('Google Drive notice: ' + (data.error || data.message || 'Check drive connection'), 'warning');
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

async function resetAllFilters() {
  activeFilters.search = '';
  activeFilters.status = 'all';
  activeFilters.clinicId = 'all';
  activeFilters.datePreset = 'all';
  activeFilters.archive = 'all';

  const searchInput = document.getElementById('search-orders');
  if (searchInput) searchInput.value = '';
  const statusFilter = document.getElementById('filter-status');
  if (statusFilter) statusFilter.value = 'all';
  const clinicFilter = document.getElementById('filter-clinic');
  if (clinicFilter) clinicFilter.value = 'all';
  const dateFilter = document.getElementById('filter-date');
  if (dateFilter) dateFilter.value = 'all';

  document.querySelectorAll('.btn-archive-filter').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-filter-all')?.classList.add('active');

  showToast('Filters reset. Showing all cases.', 'info');
  await loadOrders();
}
window.resetAllFilters = resetAllFilters;