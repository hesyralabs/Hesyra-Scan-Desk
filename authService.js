const crypto = require('crypto');
const { db } = require('./database');

/**
 * Hash password with PBKDF2 and random salt
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

/**
 * Verify plaintext password against stored hash and salt
 */
function verifyPassword(password, storedHash, salt) {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

/**
 * Seed default accounts if users table is empty
 */
function seedDefaultUsers() {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    if (userCount === 0) {
      const nowIso = new Date().toISOString();
      const insertStmt = db.prepare(`
        INSERT INTO users (username, passwordHash, salt, fullName, role, active, createdAt)
        VALUES (@username, @passwordHash, @salt, @fullName, @role, 1, '${nowIso}')
      `);

      // 1. Central Lab Admin
      const adminCreds = hashPassword('Hesyra@2026');
      insertStmt.run({
        username: 'admin',
        passwordHash: adminCreds.hash,
        salt: adminCreds.salt,
        fullName: 'Central Lab Administrator',
        role: 'admin'
      });

      // 2. Field Scan Technician
      const techCreds = hashPassword('Scan@48h');
      insertStmt.run({
        username: 'tech',
        passwordHash: techCreds.hash,
        salt: techCreds.salt,
        fullName: 'Field Scan Technician',
        role: 'tech'
      });

      console.log('[Auth Service] Seeded default users: admin / Hesyra@2026 and tech / Scan@48h');
    }
  } catch (err) {
    console.warn('[Auth Service] Seed users notice:', err.message);
  }
}

/**
 * Authenticate username & password, create session token
 */
function loginUser(username, password, rememberMe = true) {
  if (!username || !password) {
    return { success: false, error: 'Please enter both username and password.' };
  }

  const cleanUser = String(username).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ? AND active = 1').get(cleanUser);

  if (!user) {
    return { success: false, error: 'Invalid username or password.' };
  }

  const isValid = verifyPassword(password, user.passwordHash, user.salt);
  if (!isValid) {
    return { success: false, error: 'Invalid username or password.' };
  }

  // Generate cryptographically random session token (64 hex characters)
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now);

  // 30 days for rememberMe, 24 hours otherwise
  if (rememberMe) {
    expires.setDate(expires.getDate() + 30);
  } else {
    expires.setHours(expires.getHours() + 24);
  }

  const insertSession = db.prepare(`
    INSERT INTO sessions (token, userId, username, fullName, role, createdAt, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertSession.run(
    token,
    user.id,
    user.username,
    user.fullName,
    user.role,
    now.toISOString(),
    expires.toISOString()
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    }
  };
}

/**
 * Validate session token
 */
function validateSession(token) {
  if (!token || typeof token !== 'string') return null;

  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token.trim());
  if (!session) return null;

  const nowIso = new Date().toISOString();
  if (session.expiresAt <= nowIso) {
    // Session expired, clean it up
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token.trim());
    } catch (e) {}
    return null;
  }

  return {
    userId: session.userId,
    username: session.username,
    fullName: session.fullName,
    role: session.role,
    token: session.token
  };
}

/**
 * Log out and destroy session
 */
function destroySession(token) {
  if (!token) return;
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token.trim());
  } catch (e) {}
}

/**
 * Change user password
 */
function changePassword(userId, oldPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: 'New password must be at least 6 characters.' };
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }

  const isOldValid = verifyPassword(oldPassword, user.passwordHash, user.salt);
  if (!isOldValid) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const newCreds = hashPassword(newPassword);
  db.prepare('UPDATE users SET passwordHash = ?, salt = ? WHERE id = ?').run(
    newCreds.hash,
    newCreds.salt,
    userId
  );

  return { success: true, message: 'Password updated successfully.' };
}

/**
 * Express Middleware to require authentication on protected API endpoints
 */
function requireAuth(req, res, next) {
  // Public paths exempt from auth check
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/check'
  ];

  if (publicPaths.includes(req.path)) {
    return next();
  }

  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please sign in to access Hesyra Scan Desk.'
    });
  }

  const session = validateSession(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Session expired or invalid. Please sign in again.'
    });
  }

  req.user = session;
  next();
}

/**
 * Express Middleware to require Central Lab Administrator role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Central Lab Administrator privileges required for this action.'
    });
  }
  next();
}

// Seed on startup
seedDefaultUsers();

module.exports = {
  hashPassword,
  verifyPassword,
  seedDefaultUsers,
  loginUser,
  validateSession,
  destroySession,
  changePassword,
  requireAuth,
  requireAdmin
};
