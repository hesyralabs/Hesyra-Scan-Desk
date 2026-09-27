/**
 * Hesyra Field Scan Desk - Main Application Bootstrap
 * Clean, lightweight, professional navigation & connectivity
 */

document.addEventListener('DOMContentLoaded', () => {
  initAppNavigation();
  initNetworkStatus();
  initModalCloseHandlers();

  // Initialize form and dashboard
  window.initFieldForm?.();
  window.initDashboard?.();
});

/**
 * View Switcher (Field Scanner vs Lab Ledger)
 */
function initAppNavigation() {
  const viewScanner = document.getElementById('view-scanner');
  const viewDashboard = document.getElementById('view-dashboard');
  const navSegments = document.querySelectorAll('.nav-segment, [data-view]');

  const switchView = (viewName) => {
    navSegments.forEach(btn => {
      const v = btn.getAttribute('data-view') || (btn.id === 'switch-to-dashboard' ? 'dashboard' : 'scanner');
      if (v === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (viewName === 'dashboard') {
      if (viewScanner) viewScanner.style.display = 'none';
      if (viewDashboard) viewDashboard.style.display = 'block';
      window.loadOrders?.();
      window.refreshDashboardStats?.();
    } else {
      if (viewDashboard) viewDashboard.style.display = 'none';
      if (viewScanner) viewScanner.style.display = 'block';
    }
  };

  navSegments.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const v = btn.getAttribute('data-view') || (btn.id === 'switch-to-dashboard' ? 'dashboard' : 'scanner');
      switchView(v);
    });
  });

  // Quick switch button from table empty state or header
  document.getElementById('btn-quick-new-scan')?.addEventListener('click', () => switchView('scanner'));

  // Detect URL hash or default
  if (window.location.hash === '#dashboard') {
    switchView('dashboard');
  }
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <span style="font-weight: 800; font-size: 1rem;">${iconMap[type] || 'ℹ️'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

/**
 * Network Connectivity Monitor
 */
function initNetworkStatus() {
  const statusEl = document.getElementById('connection-status-pill');

  const updateStatus = () => {
    if (!statusEl) return;
    if (navigator.onLine) {
      statusEl.innerHTML = `<span class="status-dot"></span><span>Online</span>`;
    } else {
      statusEl.innerHTML = `<span class="status-dot" style="background: #ef4444; box-shadow: 0 0 6px #ef4444;"></span><span>Offline</span>`;
      showToast('You are offline. Forms will sync when back online.', 'warning');
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

/**
 * Close modal handlers
 */
function initModalCloseHandlers() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.querySelectorAll('.btn-close, .btn-modal-dismiss, #btn-close-billing-modal, #btn-close-tooth-modal').forEach(btn => {
      btn.addEventListener('click', () => modal.classList.remove('open'));
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  });
}

window.showToast = showToast;
