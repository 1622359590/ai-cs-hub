const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'imai-work-dev-key-2024';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'imai-admin-secret-key-2024';

// ===== 前台用户 JWT 验证 =====
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '令牌无效或已过期' });
  }
}

// ===== 管理员 JWT 验证 =====
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    // 验证管理员是否仍然存在
    const { getDb } = require('../database/schema');
    const admin = getDb().prepare('SELECT id FROM admins WHERE id = ?').get(decoded.id);
    if (!admin) return res.status(401).json({ error: '管理员账号已失效' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '管理员令牌无效或已过期' });
  }
}

// ===== 管理员权限验证（需配合 verifyAdminToken 使用）=====
function requireAdmin(req, res, next) {
  if (!req.admin || !req.admin.role) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { verifyToken, verifyAdminToken, requireAdmin, JWT_SECRET, ADMIN_JWT_SECRET };
