const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ===== JWT 密钥管理 =====
// 优先使用环境变量，其次从 .jwt-secrets 文件读取，最后随机生成并持久化
const SECRETS_FILE = path.join(__dirname, '..', 'data', '.jwt-secrets');

function loadOrCreateSecrets() {
  // 1. 环境变量优先
  if (process.env.JWT_SECRET && process.env.ADMIN_JWT_SECRET) {
    return { jwt: process.env.JWT_SECRET, admin: process.env.ADMIN_JWT_SECRET };
  }

  // 2. 尝试从文件读取
  try {
    const saved = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8'));
    if (saved.jwt && saved.admin) {
      return {
        jwt: process.env.JWT_SECRET || saved.jwt,
        admin: process.env.ADMIN_JWT_SECRET || saved.admin,
      };
    }
  } catch {}

  // 3. 随机生成并持久化
  const secrets = {
    jwt: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    admin: process.env.ADMIN_JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  };
  try {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2));
    console.log('🔐 已生成新的 JWT 密钥并保存到', SECRETS_FILE);
  } catch (e) {
    console.warn('⚠️ 无法保存 JWT 密钥文件，重启后 token 将失效:', e.message);
  }
  return secrets;
}

const { jwt: JWT_SECRET, admin: ADMIN_JWT_SECRET } = loadOrCreateSecrets();

// ===== 前台用户 JWT 验证 =====
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // 验证用户是否仍然存在
    const { getDb } = require('../database/schema');
    const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: '用户账号已失效' });
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
