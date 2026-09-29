/**
 * Hesyra Field Scan Desk - Main Application Bootstrap & Access Control
 * Pure Vanilla JS with Session Interceptors and Dynamic Role-Based Access Control
 */

let currentUser = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

// Lucide Icon Bundle System Helper
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons({
        icons: window.lucide.icons,
        attrs: {
          'stroke-width': '2'
        }
      });
    } catch (e) {
      console.warn('Lucide icon render warning:', e);
    }
  }
}
window.refreshIcons = refreshIcons;

// ==========================================================================
// 1. UNIVERSAL FETCH INTERCEPTOR (Attaches Bearer Token to all API Calls)
// ==========================================================================
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  options = options || {};
  options.headers = options.headers || {};

  const token = localStorage.getItem('hesyra_auth_token');
  if (token) {
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(options.headers)) {
      options.headers.push(['Authorization', `Bearer ${token}`]);
    } else {
      if (!options.headers['Authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }

  const response = await originalFetch(url, options);

  // If unauthorized on a protected endpoint, force sign-in screen
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    localStorage.removeItem('hesyra_auth_token');
    localStorage.removeItem('hesyra_user');
    currentUser = null;
    window.currentUser = null;
    showLoginScreen('Your session has expired. Please sign in again.');
  }

  return response;
};

// ==========================================================================
// 2. DOM INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  refreshIcons();
  initNetworkStatus();
  initModalCloseHandlers();
  initLoginEventListeners();
  checkAuthState();
});

/**
 * Verify session token on page load
 */
async function checkAuthState() {
  const token = localStorage.getItem('hesyra_auth_token');
  if (!token) {
    showLoginScreen();
    return;
  }

  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      window.currentUser = currentUser;
      localStorage.setItem('hesyra_user', JSON.stringify(currentUser));
      hideLoginScreen(currentUser);
      bootstrapApp();
    } else {
      localStorage.removeItem('hesyra_auth_token');
      localStorage.removeItem('hesyra_user');
      currentUser = null;
      window.currentUser = null;
      showLoginScreen();
    }
  } catch (err) {
    console.warn('Auth check network warning:', err);
    const cached = localStorage.getItem('hesyra_user');
    if (cached) {
      try {
        currentUser = JSON.parse(cached);
        window.currentUser = currentUser;
        hideLoginScreen(currentUser);
        bootstrapApp();
      } catch (e) {
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  }
}

/**
 * Boots the application features after successful authentication
 */
function bootstrapApp() {
  initAppNavigation();
  window.initFieldForm?.();
  window.initDashboard?.();

  // Role-based initial view
  if (currentUser?.role === 'admin') {
    window.switchView?.('dashboard');
  } else {
    window.switchView?.('scanner');
  }
}

/**
 * Displays the Login Screen
 */
function showLoginScreen(errorMessage = '') {
  const loginOverlay = document.getElementById('login-screen');
  const userBadge = document.getElementById('header-user-badge');
  const logoutBtn = document.getElementById('btn-header-logout');
  const errorAlert = document.getElementById('login-error');

  if (loginOverlay) {
    loginOverlay.classList.remove('hidden');
    loginOverlay.style.display = 'flex';
  }
  if (userBadge) userBadge.style.display = 'none';
  if (logoutBtn) logoutBtn.style.display = 'none';

  if (errorAlert) {
    if (errorMessage) {
      errorAlert.textContent = errorMessage;
      errorAlert.style.display = 'block';
    } else {
      errorAlert.style.display = 'none';
    }
  }

  setTimeout(() => {
    document.getElementById('login-username')?.focus();
  }, 100);
}

/**
 * Hides the Login Screen and updates role-specific UI and badges
 */
function hideLoginScreen(user) {
  const loginOverlay = document.getElementById('login-screen');
  const userBadge = document.getElementById('header-user-badge');
  const logoutBtn = document.getElementById('btn-header-logout');
  const avatarEl = document.getElementById('header-user-avatar');
  const nameEl = document.getElementById('header-user-name');
  const roleTagEl = document.getElementById('header-user-role');

  if (loginOverlay) {
    loginOverlay.classList.add('hidden');
    setTimeout(() => {
      if (loginOverlay.classList.contains('hidden')) {
        loginOverlay.style.display = 'none';
      }
    }, 300);
  }

  // 1. Set body role classes for CSS display control (.admin-only)
  document.body.classList.remove('role-admin', 'role-tech');
  document.body.classList.add(user.role === 'admin' ? 'role-admin' : 'role-tech');

  // 2. Header user profile badge
  if (userBadge) userBadge.style.display = 'inline-flex';
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';

  if (user) {
    if (avatarEl) avatarEl.textContent = (user.fullName || user.username || 'U').charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.fullName || user.username;
    if (roleTagEl) {
      roleTagEl.textContent = user.role === 'admin' ? 'Admin' : 'Field Tech';
      roleTagEl.className = `user-role-tag role-tag-${user.role}`;
    }
    if (userBadge) {
      userBadge.title = user.role === 'admin'
        ? 'Central Lab Administrator'
        : 'Field Scan Technician';
    }
  }

  // 3. Update Hub Pill Text
  const hubPill = document.getElementById('hub-pill-text') || document.querySelector('.hub-pill');
  if (hubPill) {
    hubPill.textContent = user.role === 'admin' ? 'Nagpur Central Lab' : 'Chairside Mobile Scanner';
  }

  // 4. Update Segmented Nav Titles
  const navScanner = document.getElementById('nav-btn-scanner') || document.querySelector('.nav-segment[data-view="scanner"]');
  const navDashboard = document.getElementById('nav-btn-dashboard') || document.querySelector('.nav-segment[data-view="dashboard"]');
  if (user.role === 'admin') {
    if (navScanner) navScanner.innerHTML = '<i data-lucide="scan-line"></i><span>Field Scanner</span>';
    if (navDashboard) navDashboard.innerHTML = '<i data-lucide="layout-dashboard"></i><span>Lab Ledger &amp; 48h SLA</span>';
  } else {
    if (navScanner) navScanner.innerHTML = '<i data-lucide="scan-line"></i><span>Field Scanner</span>';
    if (navDashboard) navDashboard.innerHTML = '<i data-lucide="layout-dashboard"></i><span>My Scans</span>';
  }
  refreshIcons();
}

/**
 * Setup Login Form listeners
 */
function initLoginEventListeners() {
  const form = document.getElementById('login-form');
  const errorAlert = document.getElementById('login-error');
  const submitBtn = document.getElementById('btn-submit-login');
  const btnText = document.getElementById('btn-login-text');
  const togglePwdBtn = document.getElementById('btn-toggle-pwd');
  const pwdInput = document.getElementById('login-password');
  const logoutBtn = document.getElementById('btn-header-logout');

  // Toggle password visibility
  if (togglePwdBtn && pwdInput) {
    togglePwdBtn.addEventListener('click', () => {
      const isPwd = pwdInput.type === 'password';
      pwdInput.type = isPwd ? 'text' : 'password';
      togglePwdBtn.innerHTML = `<i data-lucide="${isPwd ? 'eye' : 'eye-off'}"></i>`;
      refreshIcons();
    });
  }

  // Login Form Submission
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorAlert) errorAlert.style.display = 'none';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('login-remember')?.checked !== false;

    if (!username || !password) {
      if (errorAlert) {
        errorAlert.textContent = 'Please enter both username and password.';
        errorAlert.style.display = 'block';
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Verifying credentials...';

    try {
      const res = await originalFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe })
      });

      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('hesyra_auth_token', data.token);
        localStorage.setItem('hesyra_user', JSON.stringify(data.user));
        currentUser = data.user;
        window.currentUser = currentUser;

        hideLoginScreen(currentUser);
        showToast(`Welcome, ${data.user.fullName}!`, 'success');
        bootstrapApp();
      } else {
        if (errorAlert) {
          errorAlert.textContent = data.error || 'Invalid username or password.';
          errorAlert.style.display = 'block';
        }
      }
    } catch (err) {
      if (errorAlert) {
        errorAlert.textContent = 'Network connection error: ' + err.message;
        errorAlert.style.display = 'block';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Sign In to Scan Desk';
    }
  });

  // Logout Handler
  logoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}

    localStorage.removeItem('hesyra_auth_token');
    localStorage.removeItem('hesyra_user');
    currentUser = null;
    window.currentUser = null;
    showToast('You have signed out successfully.', 'info');
    showLoginScreen();
  });
}

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

    refreshIcons();
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

  window.switchView = switchView;

  navSegments.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const v = btn.getAttribute('data-view') || (btn.id === 'switch-to-dashboard' ? 'dashboard' : 'scanner');
      switchView(v);
    });
  });

  document.getElementById('btn-quick-new-scan')?.addEventListener('click', () => switchView('scanner'));

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
    success: '<i data-lucide="check-circle-2" style="color: #16a34a;"></i>',
    error: '<i data-lucide="alert-circle" style="color: #dc2626;"></i>',
    warning: '<i data-lucide="alert-triangle" style="color: #d97706;"></i>',
    info: '<i data-lucide="info" style="color: #0284c7;"></i>'
  };

  toast.innerHTML = `
    <span class="toast-icon-wrap" style="display: flex; align-items: center; justify-content: center;">${iconMap[type] || '<i data-lucide="info"></i>'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

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
window.getCurrentUser = () => currentUser;
