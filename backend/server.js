const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const { getDb, initSchema, seedData } = require('./database/schema');
const { verifyToken, verifyAdminToken, requireAdmin, JWT_SECRET, ADMIN_JWT_SECRET } = require('./middleware/auth');
const { createRecord: feishuCreateRecord } = require('./services/feishu');
const { sendTicketNotification } = require('./services/notify');
const { chat: aiChat, getAIConfig } = require('./services/ai');
const { aiQueue } = require('./services/queue');
const { rebuildIndex: rebuildRagIndex, findSimilarLearned, cleanupLearned } = require('./services/rag');
const { parseDocument } = require('./services/doc-parser');

const app = express();
const PORT = 37888;

// ===== 初始化数据库 =====
initSchema();
seedData();

// ===== 中间件 =====
const corsOptions = {
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:37888'],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(compression());  // gzip 压缩响应
app.use(express.json({ limit: '1mb' }));  // 限制 JSON body 大小

// 全局限流：每 IP 每分钟 120 次请求
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
}));

// AI 接口单独限流：每 IP 每分钟 20 次
app.use('/api/ai/chat', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI 对话请求过于频繁，请稍后再试' },
}));

// ===== 全局禁用 API 缓存（防止浏览器 304 导致前端解析失败）=====
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== 文件上传配置 =====
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const name = require('crypto').randomBytes(16).toString('hex');
    cb(null, name + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|mp4|pdf|doc|docx|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// CSV 导入专用 multer（只接受 CSV）
const csvStorage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    cb(null, 'import_' + Date.now() + '.csv');
  }
});
const uploadCSV = multer({
  storage: csvStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('请上传 CSV 文件'));
    }
  }
});

// 单个文件上传
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.originalname });
});

// ============================================================
//  认证路由 /api/auth
// ============================================================

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { phone, password, nickname } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    if (!/^1\d{10}$/.test(phone)) {
      return res.status(400).json({ error: '手机号格式不正确' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }

    const db = getDb();

    // 检查手机号是否已注册
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: '该手机号已注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)'
    ).run(phone, hashedPassword, nickname || phone);

    const userId = result.lastInsertRowid;
    const token = jwt.sign({ id: userId, phone, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: userId, phone, nickname: nickname || phone, role: 'user' }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    if (!user) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, phone: user.phone, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 管理员登录（用户名+密码，使用独立 admins 表）
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入管理员账号和密码' });
    const db = getDb();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) return res.status(401).json({ error: '管理员账号或密码错误' });
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: '管理员账号或密码错误' });
    const token = jwt.sign({ id: admin.id, username: admin.username, nickname: admin.nickname, role: admin.role }, ADMIN_JWT_SECRET, { expiresIn:'7d' });
    res.json({ token, user: { id: admin.id, username: admin.username, nickname: admin.nickname, role: admin.role } });
  } catch(err) { console.error(err); res.status(500).json({ error:'登录失败' }); }
});

// 获取当前用户信息
app.get('/api/auth/me', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT u.id, u.phone, u.nickname, u.avatar, u.vip, u.vip_expires_at, u.customer_level_id, u.created_at, cl.name as customer_level_name FROM users u LEFT JOIN customer_levels cl ON u.customer_level_id = cl.id WHERE u.id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// ============================================================
//  公开教程路由 /api/tutorials
// ============================================================

// 教程列表
app.get('/api/tutorials', (req, res) => {
  try {
    const { category, search } = req.query;
    const db = getDb();

    let sql = 'SELECT id, title, category, summary, cover, tags, views, created_at, vip_only FROM tutorials WHERE status = ?';
    const params = ['published'];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND title LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const tutorials = db.prepare(sql).all(...params);
    res.json({ tutorials });
  } catch (err) {
    console.error('获取教程列表失败:', err);
    res.status(500).json({ error: '获取教程列表失败' });
  }
});

// 教程详情
app.get('/api/tutorials/:id', (req, res) => {
  try {
    const db = getDb();
    const tutorial = db.prepare(
      'SELECT * FROM tutorials WHERE id = ? AND status = ?'
    ).get(req.params.id, 'published');

    if (!tutorial) {
      return res.status(404).json({ error: '教程不存在' });
    }

    // VIP 权限检查
    if (tutorial.vip_only === 1) {
      var userVip = 0;
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.split(' ')[1];
          const decoded = require('jsonwebtoken').verify(token, JWT_SECRET);
          const user = db.prepare('SELECT vip FROM users WHERE id = ?').get(decoded.id);
          if (user) userVip = user.vip;
        }
      } catch(e) { /* 未登录或 token 无效 */ }

      if (userVip !== 1) {
        return res.json({ tutorial: { ...tutorial, content: '', vip_locked: true, message: '此教程仅限 VIP 会员查看' } });
      }
    }

    res.json({ tutorial });
  } catch (err) {
    console.error('获取教程详情失败:', err);
    res.status(500).json({ error: '获取教程详情失败' });
  }
});

// 增加教程阅读数（客户端触发，防预取）
app.post('/api/tutorials/:id/view', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('UPDATE tutorials SET views = views + 1 WHERE id = ? AND status = ?').run(req.params.id, 'published');
    if (result.changes === 0) {
      return res.status(404).json({ error: '教程不存在' });
    }
    const tutorial = db.prepare('SELECT views FROM tutorials WHERE id = ?').get(req.params.id);
    res.json({ views: tutorial.views });
  } catch (err) {
    console.error('增加阅读数失败:', err);
    res.status(500).json({ error: '增加阅读数失败' });
  }
});

// ============================================================
//  公开 FAQ 路由 /api/faqs
// ============================================================

app.get('/api/faqs', (req, res) => {
  try {
    const { category, search } = req.query;
    const db = getDb();

    let sql = 'SELECT * FROM faqs WHERE status = ?';
    const params = ['active'];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (question LIKE ? OR answer LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY pinned DESC, sort_order ASC, created_at DESC';

    const faqs = db.prepare(sql).all(...params);
    res.json({ faqs });
  } catch (err) {
    console.error('获取 FAQ 列表失败:', err);
    res.status(500).json({ error: '获取 FAQ 列表失败' });
  }
});

// ============================================================
//  管理教程路由 /api/admin/tutorials  (需 admin)
// ============================================================

// 管理端教程列表（包含所有状态）
app.get('/api/admin/tutorials', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { category, search, status } = req.query;

    let sql = 'SELECT * FROM tutorials WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND title LIKE ?';
      params.push(`%${search}%`);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const tutorials = db.prepare(sql).all(...params);
    res.json({ tutorials });
  } catch (err) {
    console.error('获取教程列表失败:', err);
    res.status(500).json({ error: '获取教程列表失败' });
  }
});

// 管理端获取单个教程（包含所有状态）
app.get('/api/admin/tutorials/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const tutorial = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(req.params.id);

    if (!tutorial) {
      return res.status(404).json({ error: '教程不存在' });
    }

    res.json({ tutorial });
  } catch (err) {
    console.error('获取教程详情失败:', err);
    res.status(500).json({ error: '获取教程详情失败' });
  }
});

// 新建教程
app.post('/api/admin/tutorials', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { title, category, content, summary, cover, tags, status, vip_only } = req.body;

    if (!title || !category) {
      return res.status(400).json({ error: '标题和分类不能为空' });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO tutorials (title, category, content, summary, cover, tags, status, vip_only)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      category,
      content || '',
      summary || '',
      cover || '',
      tags || '[]',
      status || 'draft',
      req.body.vip_only ? 1 : 0
    );

    const tutorial = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(result.lastInsertRowid);
    try { rebuildRagIndex(true); } catch {}
    res.status(201).json({ message: '创建成功', tutorial });
  } catch (err) {
    console.error('创建教程失败:', err);
    res.status(500).json({ error: '创建教程失败' });
  }
});

// 编辑教程
app.put('/api/admin/tutorials/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { title, category, content, summary, cover, tags, status, vip_only } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM tutorials WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '教程不存在' });
    }

    db.prepare(`
      UPDATE tutorials SET
        title = COALESCE(?, title),
        category = COALESCE(?, category),
        content = COALESCE(?, content),
        summary = COALESCE(?, summary),
        cover = COALESCE(?, cover),
        tags = COALESCE(?, tags),
        status = COALESCE(?, status),
        vip_only = COALESCE(?, vip_only),
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      title || null,
      category || null,
      content ?? null,
      summary ?? null,
      cover ?? null,
      tags || null,
      status || null,
      vip_only !== undefined ? (vip_only ? 1 : 0) : null,
      req.params.id
    );

    const tutorial = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ message: '更新成功', tutorial });
  } catch (err) {
    console.error('更新教程失败:', err);
    res.status(500).json({ error: '更新教程失败' });
  }
});

// 删除教程
app.delete('/api/admin/tutorials/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM tutorials WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '教程不存在' });
    }

    db.prepare('DELETE FROM tutorials WHERE id = ?').run(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除教程失败:', err);
    res.status(500).json({ error: '删除教程失败' });
  }
});

// ============================================================
//  管理 FAQ 路由 /api/admin/faqs  (需 admin)
// ============================================================

// 管理端 FAQ 列表
app.get('/api/admin/faqs', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { category, search } = req.query;

    let sql = 'SELECT * FROM faqs WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (question LIKE ? OR answer LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY sort_order ASC, created_at DESC';

    const faqs = db.prepare(sql).all(...params);
    res.json({ faqs });
  } catch (err) {
    console.error('获取 FAQ 列表失败:', err);
    res.status(500).json({ error: '获取 FAQ 列表失败' });
  }
});

// 新建 FAQ
app.post('/api/admin/faqs', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { question, answer, category, sort_order, pinned, status } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: '问题和答案不能为空' });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO faqs (question, answer, category, sort_order, pinned, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      question,
      answer,
      category || '通用',
      sort_order || 0,
      pinned || 0,
      status || 'active'
    );

    const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid);
    try { rebuildRagIndex(true); } catch {}
    res.status(201).json({ message: '创建成功', faq });
  } catch (err) {
    console.error('创建 FAQ 失败:', err);
    res.status(500).json({ error: '创建 FAQ 失败' });
  }
});

// 编辑 FAQ
app.put('/api/admin/faqs/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { question, answer, category, sort_order, pinned, status } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM faqs WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'FAQ 不存在' });
    }

    db.prepare(`
      UPDATE faqs SET
        question = COALESCE(?, question),
        answer = COALESCE(?, answer),
        category = COALESCE(?, category),
        sort_order = COALESCE(?, sort_order),
        pinned = COALESCE(?, pinned),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      question || null,
      answer ?? null,
      category || null,
      sort_order ?? null,
      pinned ?? null,
      status || null,
      req.params.id
    );

    const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ message: '更新成功', faq });
  } catch (err) {
    console.error('更新 FAQ 失败:', err);
    res.status(500).json({ error: '更新 FAQ 失败' });
  }
});

// 删除 FAQ
app.delete('/api/admin/faqs/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const existing = db.prepare('SELECT id FROM faqs WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'FAQ 不存在' });
    }

    db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除 FAQ 失败:', err);
    res.status(500).json({ error: '删除 FAQ 失败' });
  }
});

// ============================================================
//  工单路由 /api/tickets
// ============================================================

// 提交工单（需登录）
app.post('/api/tickets', verifyToken, async (req, res) => {
  try {
    const { title, description, name, contact, type, group_name, attachments } = req.body;

    if (!title) {
      return res.status(400).json({ error: '请输入工单标题' });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO tickets (title, description, name, contact, type, group_name, attachments, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title,
      description || '',
      name || '',
      contact || '',
      type || 'consult',
      group_name || '',
      JSON.stringify(attachments || []),
      req.user.id
    );

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);

    // 同步写入飞书多维表格（如已配置）
    try {
      // 自动获取用户信息及客户身份分类
      const userInfo = db.prepare('SELECT u.*, cl.name as customer_level_name FROM users u LEFT JOIN customer_levels cl ON u.customer_level_id = cl.id WHERE u.id = ?').get(req.user.id);
      const customerLevelName = userInfo?.customer_level_name || '';
      const attachmentLinks = (attachments || []).map(function(a) { return a.url || a.filename; }).join('\n');
      await feishuCreateRecord({
        '工单标题': title,
        '工单描述': description || '',
        '提交人': name || userInfo?.nickname || '用户' + req.user.id,
        '联系方式': contact || userInfo?.phone || '',
        '客户身份分类': customerLevelName,
        '工单类型': type || 'consult',
        '状态': '待处理',
        '售后群聊': group_name || '',
        '附件链接': attachmentLinks,
        '创建时间': Date.now(),
      });
    } catch (feishuErr) {
      console.warn('飞书写入失败（不影响本地存储）:', feishuErr.message);
    }

    // 发送工单通知（飞书/企业微信 Webhook）
    try {
      await sendTicketNotification({
        ...ticket,
        name: name || '',
        contact: contact || '',
        group_name: group_name || '',
      });
    } catch (notifyErr) {
      console.warn('工单通知发送失败（不影响工单创建）:', notifyErr.message);
    }

    res.status(201).json({ message: '工单提交成功', ticket });
  } catch (err) {
    console.error('提交工单失败:', err);
    res.status(500).json({ error: '提交工单失败' });
  }
});

// 获取我的工单列表（需登录）
app.get('/api/user/tickets', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const tickets = db.prepare('SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ tickets });
  } catch (err) {
    console.error('获取工单列表失败:', err);
    res.status(500).json({ error: '获取工单列表失败' });
  }
});

// 管理员获取所有工单
app.get('/api/admin/tickets', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    let sql = 'SELECT t.*, u.nickname, u.phone, a.username as processor_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id LEFT JOIN admins a ON t.processed_by = a.id';
    const params = [];

    if (status) {
      sql += ' WHERE t.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY t.created_at DESC';
    const tickets = db.prepare(sql).all(...params);
    res.json({ tickets });
  } catch (err) {
    console.error('获取工单列表失败:', err);
    res.status(500).json({ error: '获取工单列表失败' });
  }
});

// 管理员更新工单状态 + 回复
app.put('/api/admin/tickets/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { status, reply } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM tickets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '工单不存在' });
    }

    db.prepare(`UPDATE tickets SET status = COALESCE(?, status), reply = COALESCE(?, reply), processed_by = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status || null, reply ?? null, req.admin.id, req.params.id);

    const ticket = db.prepare(`SELECT t.*, u.nickname, u.phone,
      a.username as processor_name
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN admins a ON t.processed_by = a.id
      WHERE t.id = ?`).get(req.params.id);
    res.json({ message: '更新成功', ticket });
  } catch (err) {
    console.error('更新工单失败:', err);
    res.status(500).json({ error: '更新工单失败' });
  }
});

// 管理员工单统计
app.get('/api/admin/tickets/stats', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
    const pending = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'pending'").get().count;
    const processing = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'processing'").get().count;
    const resolved = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'resolved'").get().count;
    res.json({ stats: { total, pending, processing, resolved } });
  } catch (err) {
    console.error('获取工单统计失败:', err);
    res.status(500).json({ error: '获取工单统计失败' });
  }
});

// 用户查看单条工单详情（需登录 + 只能看自己的）
app.get('/api/tickets/:id', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!ticket) {
      return res.status(404).json({ error: '工单不存在' });
    }
    res.json({ ticket });
  } catch (err) {
    console.error('获取工单详情失败:', err);
    res.status(500).json({ error: '获取工单详情失败' });
  }
});

// ============================================================
//  管理设置路由 /api/admin/settings  (需 admin)
// ============================================================

// 获取所有设置
app.get('/api/admin/settings', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM settings').all();

    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json({ settings });
  } catch (err) {
    console.error('获取设置失败:', err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

// 批量保存设置
app.put('/api/admin/settings', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const data = req.body;
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const updateMany = db.transaction((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        upsert.run(key, String(value ?? ''));
      }
    });

    updateMany(data);

    // 返回更新后的完整设置
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json({ message: '保存成功', settings });
  } catch (err) {
    console.error('保存设置失败:', err);
    res.status(500).json({ error: '保存设置失败' });
  }
});

// ============================================================
//  用户管理路由 /api/admin/users  (需 admin)
// ============================================================

app.get('/api/admin/users', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.phone, u.nickname, u.avatar, u.vip, u.vip_expires_at, u.customer_level_id, u.created_at,
             cl.name as customer_level_name
      FROM users u
      LEFT JOIN customer_levels cl ON u.customer_level_id = cl.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// ============================================================
//  VIP 管理（需 admin）
// ============================================================

app.put('/api/admin/users/:id/vip', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { vip, vip_expires_at } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    db.prepare('UPDATE users SET vip = ?, vip_expires_at = ? WHERE id = ?')
      .run(vip ? 1 : 0, vip_expires_at || '', req.params.id);

    const updated = db.prepare('SELECT id, phone, nickname, vip, vip_expires_at FROM users WHERE id = ?').get(req.params.id);
    res.json({ message: 'VIP 状态已更新', user: updated });
  } catch (err) {
    console.error('更新 VIP 失败:', err);
    res.status(500).json({ error: '更新 VIP 失败' });
  }
});

// 更新用户信息（昵称、VIP、客户身份）
app.put('/api/admin/users/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { nickname, vip, vip_expires_at, customer_level_id } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const updates = [];
    const params = [];
    if (nickname !== undefined) { updates.push('nickname = ?'); params.push(nickname); }
    if (vip !== undefined) { updates.push('vip = ?'); params.push(vip ? 1 : 0); }
    if (vip_expires_at !== undefined) { updates.push('vip_expires_at = ?'); params.push(vip_expires_at || ''); }
    if (customer_level_id !== undefined) { updates.push('customer_level_id = ?'); params.push(customer_level_id || 0); }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare(`
      SELECT u.id, u.phone, u.nickname, u.vip, u.vip_expires_at, u.customer_level_id,
             cl.name as customer_level_name
      FROM users u LEFT JOIN customer_levels cl ON u.customer_level_id = cl.id
      WHERE u.id = ?
    `).get(req.params.id);

    res.json({ message: '用户信息已更新', user: updated });
  } catch (err) {
    console.error('更新用户失败:', err);
    res.status(500).json({ error: '更新用户失败' });
  }
});

// ============================================================
//  用户导入导出 /api/admin/users  (需 admin)
// ============================================================

// 导出用户为 CSV
app.get('/api/admin/users/export', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.phone, u.nickname, u.vip, u.customer_level_id,
             cl.name as customer_level_name, u.created_at
      FROM users u
      LEFT JOIN customer_levels cl ON u.customer_level_id = cl.id
      ORDER BY u.id ASC
    `).all();

    // CSV 头部
    const headers = ['ID','手机号','昵称','VIP','客户身份ID','客户身份','注册时间'];
    const rows = users.map(u => [
      u.id,
      u.phone,
      (u.nickname || '').replace(/,/g, '，'),
      u.vip ? '是' : '否',
      u.customer_level_id || 0,
      u.customer_level_name || '',
      u.created_at
    ]);

    let csv = '\uFEFF'; // BOM for Excel Chinese support
    csv += headers.join(',') + '\n';
    for (const row of rows) {
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=users_' + new Date().toISOString().slice(0,10) + '.csv');
    res.send(csv);
  } catch (err) {
    console.error('导出用户失败:', err);
    res.status(500).json({ error: '导出用户失败' });
  }
});

// 导入用户 CSV
app.post('/api/admin/users/import', verifyAdminToken, requireAdmin, uploadCSV.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传 CSV 文件' });

    const fs = require('fs');
    const content = fs.readFileSync(req.file.path, 'utf8').replace(/^\uFEFF/, '');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'CSV 文件为空或缺少数据行' });
    }

    // 解析头部
    const headerLine = lines[0].toLowerCase().replace(/"/g, '');
    const headers = headerLine.split(',').map(h => h.trim());

    const phoneIdx = headers.findIndex(h => h.includes('手机') || h === 'phone');
    const nickIdx = headers.findIndex(h => h.includes('昵称') || h === 'nickname');
    const pwdIdx = headers.findIndex(h => h.includes('密码') || h === 'password');
    const vipIdx = headers.findIndex(h => h.includes('vip') || h.includes('会员'));
    const levelIdx = headers.findIndex(h => h.includes('客户身份ID') || h.includes('level_id') || h.includes('客户身份'));

    if (phoneIdx === -1) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'CSV 文件中没有找到手机号列。请确保包含“手机号”或“phone”列' });
    }

    const db = getDb();
    const levels = db.prepare('SELECT id, name FROM customer_levels').all();
    const levelMap = {};
    for (const l of levels) levelMap[l.name] = l.id;

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const phone = vals[phoneIdx];
      if (!phone) { skipped++; continue; }
      if (!/^1\d{10}$/.test(phone)) { errors.push(`第${i+1}行: 手机号格式不正确 (${phone})`); continue; }

      try {
        const nickname = nickIdx >= 0 ? vals[nickIdx] || '' : '';
        const vip = vipIdx >= 0 ? (vals[vipIdx] === '是' || vals[vipIdx] === '1' ? 1 : 0) : 0;

        // 查找或推断客户身份ID
        let levelId = 0;
        if (levelIdx >= 0) {
          const levelVal = vals[levelIdx];
          if (/^\d+$/.test(levelVal)) {
            levelId = parseInt(levelVal);
          } else if (levelMap[levelVal]) {
            levelId = levelMap[levelVal];
          }
        }

        // 检查手机号是否已存在
        const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
        if (existing) {
          // 更新
          const updates = ['nickname = ?', 'vip = ?', 'customer_level_id = ?'];
          const params = [nickname, vip, levelId, existing.id];
          db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        } else {
          // 新增（默认密码为手机号后6位）
          const password = pwdIdx >= 0 ? vals[pwdIdx] : phone.slice(-6);
          const hashed = await bcrypt.hash(password, 10);
          db.prepare('INSERT INTO users (phone, password, nickname, vip, customer_level_id) VALUES (?, ?, ?, ?, ?)')
            .run(phone, hashed, nickname, vip, levelId);
        }
        imported++;
      } catch (rowErr) {
        errors.push(`第 ${i + 1} 行: ${rowErr.message}`);
      }
    }

    fs.unlinkSync(req.file.path);

    res.json({
      message: `导入完成：成功 ${imported} 条，跳过 ${skipped} 条${errors.length ? '，' + errors.length + ' 条错误' : ''}`,
      imported,
      skipped,
      errors: errors.slice(0, 10)
    });
  } catch (err) {
    console.error('导入用户失败:', err);
    res.status(500).json({ error: '导入用户失败: ' + err.message });
  }
});

// ============================================================
//  管理统计 /api/admin/stats  (需 admin)
// ============================================================

app.get('/api/admin/stats', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const tutorialCount = db.prepare("SELECT COUNT(*) as count FROM tutorials").get().count;
    const faqCount = db.prepare("SELECT COUNT(*) as count FROM faqs").get().count;
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    const publishedTutorials = db.prepare("SELECT COUNT(*) as count FROM tutorials WHERE status = 'published'").get().count;
    const todayViews = db.prepare("SELECT COALESCE(SUM(views),0) as count FROM tutorials WHERE DATE(created_at) = DATE('now','localtime')").get().count;
    const ticketTotal = db.prepare("SELECT COUNT(*) as count FROM tickets").get().count;
    const ticketPending = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'pending'").get().count;
    const ticketProcessing = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'processing'").get().count;
    const ticketResolved = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'resolved'").get().count;
    res.json({ stats: { tutorials: tutorialCount, published: publishedTutorials, faqs: faqCount, users: userCount, todayViews, tickets: ticketTotal, ticketsPending: ticketPending, ticketsProcessing: ticketProcessing, ticketsResolved: ticketResolved } });
  } catch (err) {
    console.error('获取统计失败:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// ============================================================
//  AI 客服路由 /api/ai
// ============================================================

// 队列状态（管理员）
app.get('/api/admin/queue/status', verifyAdminToken, requireAdmin, (req, res) => {
  const status = aiQueue.getStatus();
  res.json(status);
});

// 创建对话
app.post('/api/ai/conversations', (req, res) => {
  try {
    const db = getDb();
    // 可选认证：有 token 就解析，没有就当游客
    let userId = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try { userId = jwt.verify(token, JWT_SECRET).id; } catch {}
    }
    const guestName = req.body?.guest_name || '';
    const result = db.prepare('INSERT INTO ai_conversations (user_id, guest_name) VALUES (?, ?)').run(userId, guestName);
    const conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ conversation: conv });
  } catch (err) {
    console.error('创建对话失败:', err);
    res.status(500).json({ error: '创建对话失败' });
  }
});

// 发送消息 & 获取 AI 回复（通过请求队列控制并发）
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { conversation_id, message, image_url } = req.body;
    if (!conversation_id || !message) {
      return res.status(400).json({ error: '缺少 conversation_id 或 message' });
    }
    const db = getDb();
    const conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(conversation_id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });

    // 保存用户消息
    db.prepare('INSERT INTO ai_messages (conversation_id, role, content, image_url) VALUES (?, ?, ?, ?)').run(conversation_id, 'user', message, image_url || '');

    // 获取对话历史
    const history = db.prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id').all(conversation_id);

    // 通过队列调用 AI（控制并发）
    const queueStatus = aiQueue.getStatus();
    const queuePosition = queueStatus.queued;

    const { result: reply, waitMs, processMs } = await aiQueue.enqueue(
      () => aiChat(history.slice(0, -1), message, image_url),
      { priority: conv.user_id ? 5 : 10 }  // 登录用户优先级略高
    );

    // 保存 AI 回复
    const replyResult = db.prepare('INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversation_id, 'assistant', reply);

    // 更新对话时间
    db.prepare('UPDATE ai_conversations SET updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(conversation_id);

    res.json({
      reply,
      message_id: replyResult.lastInsertRowid,
      _queue: { waitMs, processMs, position: queuePosition },
    });
  } catch (err) {
    console.error('AI 对话失败:', err);
    const statusCode = err.message.includes('超时') || err.message.includes('繁忙') ? 503 : 500;
    res.status(statusCode).json({ error: err.message || 'AI 回复失败' });
  }
});

// 获取对话历史
// 获取当前用户的对话列表
app.get('/api/ai/conversations', (req, res) => {
  try {
    const db = getDb();
    const token = req.headers.authorization?.replace('Bearer ', '');
    let userId = null;
    if (token) {
      try { userId = jwt.verify(token, JWT_SECRET).id; } catch {}
    }
    let conversations;
    if (userId) {
      conversations = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count,
          (SELECT content FROM ai_messages WHERE conversation_id = c.id AND role = 'user' ORDER BY id LIMIT 1) as first_message
        FROM ai_conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC LIMIT 20
      `).all(userId);
    } else {
      conversations = [];
    }
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

app.get('/api/ai/conversations/:id/messages', (req, res) => {
  try {
    const db = getDb();
    // 验证权限：管理员可看所有，普通用户只能看自己的
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: '未登录' });
    const token = authHeader.split(' ')[1];
    let isAdmin = false;
    let userId = null;
    try {
      const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
      isAdmin = true;
    } catch {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch {
        return res.status(401).json({ error: '令牌无效' });
      }
    }
    if (!isAdmin) {
      const conv = db.prepare('SELECT user_id FROM ai_conversations WHERE id = ?').get(req.params.id);
      if (!conv || (conv.user_id && conv.user_id !== userId)) {
        return res.status(403).json({ error: '无权访问此对话' });
      }
    }
    const messages = db.prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id').all(req.params.id);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: '获取消息失败' });
  }
});

// 消息评分 — 👍 自动沉淀优秀回答到知识库
app.post('/api/ai/messages/:id/rate', (req, res) => {
  try {
    const { rating } = req.body; // 1 = 👍, -1 = 👎
    if (rating !== 1 && rating !== -1 && rating !== 0) {
      return res.status(400).json({ error: 'rating 必须是 1, -1 或 0' });
    }
    const db = getDb();
    db.prepare('UPDATE ai_messages SET rating = ? WHERE id = ?').run(rating, req.params.id);

    // 👍 好评 → 自动保存到 ai_knowledge，让 AI 越来越聪明
    if (rating === 1) {
      try {
        const msg = db.prepare('SELECT id, conversation_id, role, content FROM ai_messages WHERE id = ?').get(req.params.id);
        if (msg && msg.role === 'assistant' && msg.content) {
          // 找到这条回复对应的用户问题
          const userMsg = db.prepare(
            'SELECT content FROM ai_messages WHERE conversation_id = ? AND role = ? AND id < ? ORDER BY id DESC LIMIT 1'
          ).get(msg.conversation_id, 'user', msg.id);

          const question = userMsg?.content?.trim() || '';
          const answer = msg.content.trim();

          if (question && answer && answer.length > 10) {
            const title = question.slice(0, 80);

            // 智能去重：查找相似的已有条目
            const similar = findSimilarLearned(question);

            if (similar) {
              // 相似问题已存在 → 追加新回答作为补充
              const newAnswer = answer;
              if (!similar.content.includes(newAnswer.slice(0, 50))) {
                db.prepare("UPDATE ai_knowledge SET content = content || ?, updated_at = datetime('now','localtime') WHERE id = ?")
                  .run('\n\n补充回答：' + newAnswer, similar.id);
                try { rebuildRagIndex(true); } catch {}
                console.log('🧠 AI自学习: 追加回答到相似条目 "' + similar.title + '" (相似度:' + similar.score.toFixed(2) + ')');
              }
            } else {
              // 全新问题 → 新建条目
              db.prepare(
                'INSERT INTO ai_knowledge (title, content, category, tags) VALUES (?, ?, ?, ?)'
              ).run(
                title,
                '用户问题：' + question + '\n\n参考回答：' + answer,
                '自动学习',
                JSON.stringify(['auto_learned', '用户好评'])
              );
              try { rebuildRagIndex(true); } catch {}
              console.log('🧠 AI自学习: 保存优秀回答 "' + title + '"');
            }
          }
        }
      } catch (e) {
        console.warn('AI自学习保存失败:', e.message);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '评分失败' });
  }
});

// 转人工工单（从对话创建工单）
app.post('/api/ai/conversations/:id/transfer', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const conv = db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });

    // 获取对话消息，拼接为工单描述
    const messages = db.prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id').all(req.params.id);
    let description = '【AI 对话记录】\n\n';
    for (const msg of messages) {
      const prefix = msg.role === 'user' ? '用户' : 'AI助手';
      description += `${prefix}: ${msg.content}\n\n`;
    }

    const { title, type, group_name } = req.body;
    const userInfo = db.prepare('SELECT nickname, phone FROM users WHERE id = ?').get(req.user.id);

    const result = db.prepare(`
      INSERT INTO tickets (title, description, name, contact, type, group_name, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      title || 'AI 无法解答的问题',
      description,
      userInfo?.nickname || '',
      userInfo?.phone || '',
      type || 'consult',
      group_name || '',
      req.user.id
    );

    // 标记对话已转人工
    db.prepare('UPDATE ai_conversations SET status = \'transferred\' WHERE id = ?').run(req.params.id);

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: '已转人工客服', ticket });
  } catch (err) {
    console.error('转人工失败:', err);
    res.status(500).json({ error: '转人工失败' });
  }
});

// 关闭对话
app.post('/api/ai/conversations/:id/close', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const conv = db.prepare('SELECT id FROM ai_conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
    db.prepare("UPDATE ai_conversations SET status = 'closed', updated_at = datetime('now','localtime') WHERE id = ?").run(req.params.id);
    res.json({ message: '对话已关闭' });
  } catch (err) {
    console.error('关闭对话失败:', err);
    res.status(500).json({ error: '关闭失败' });
  }
});

// 用户主动结束对话
app.post('/api/ai/conversations/:id/end', (req, res) => {
  try {
    const db = getDb();
    const conv = db.prepare('SELECT id, status FROM ai_conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
    if (conv.status === 'closed') return res.json({ message: '对话已结束' });
    db.prepare("UPDATE ai_conversations SET status = 'closed', updated_at = datetime('now','localtime') WHERE id = ?").run(req.params.id);
    res.json({ message: '对话已结束' });
  } catch (err) {
    console.error('结束对话失败:', err);
    res.status(500).json({ error: '结束失败' });
  }
});

// 管理员查看 AI 对话列表
app.get('/api/admin/ai/conversations', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const conversations = db.prepare(`
      SELECT c.*, u.nickname, u.phone,
        (SELECT COUNT(*) FROM ai_messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM ai_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) as last_message
      FROM ai_conversations c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.updated_at DESC
      LIMIT 100
    `).all();
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

// AI 知识库管理
app.get('/api/admin/ai/knowledge', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM ai_knowledge ORDER BY category, id DESC').all();
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: '获取知识库失败' });
  }
});

app.post('/api/admin/ai/knowledge', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { title, content, category, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容必填' });
    const db = getDb();
    // 检查重复
    const existing = db.prepare('SELECT id FROM ai_knowledge WHERE title = ?').get(title);
    if (existing) return res.status(409).json({ error: '已存在同名知识：' + title });
    const result = db.prepare('INSERT INTO ai_knowledge (title, content, category, tags) VALUES (?, ?, ?, ?)').run(title, content, category || '', JSON.stringify(tags || []));
    const item = db.prepare('SELECT * FROM ai_knowledge WHERE id = ?').get(result.lastInsertRowid);
    try { rebuildRagIndex(true); } catch {}
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: '创建知识库条目失败' });
  }
});

app.put('/api/admin/ai/knowledge/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { title, content, category, tags, status } = req.body;
    const db = getDb();
    db.prepare('UPDATE ai_knowledge SET title = COALESCE(?, title), content = COALESCE(?, content), category = COALESCE(?, category), tags = COALESCE(?, tags), status = COALESCE(?, status), updated_at = datetime(\'now\',\'localtime\') WHERE id = ?')
      .run(title || null, content || null, category || null, tags ? JSON.stringify(tags) : null, status || null, req.params.id);
    const item = db.prepare('SELECT * FROM ai_knowledge WHERE id = ?').get(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: '更新知识库条目失败' });
  }
});

app.delete('/api/admin/ai/knowledge/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM ai_knowledge WHERE id = ?').run(req.params.id);
    try { rebuildRagIndex(true); } catch {}
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: '删除知识库条目失败' });
  }
});

// 文档导入 multer
const docStorage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    cb(null, 'doc_' + Date.now() + path.extname(file.originalname));
  }
});
const uploadDoc = multer({
  storage: docStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.docx', '.csv', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式，支持: ' + allowed.join(' ')));
    }
  }
});

// 预览文档（不入库，但提取图片保存到本地）
app.post('/api/admin/ai/knowledge/preview', verifyAdminToken, requireAdmin, uploadDoc.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const uploadsDir = path.join(__dirname, 'uploads');
    const baseUrl = '/uploads';
    const items = await parseDocument(req.file.path, uploadsDir, baseUrl);
    try { fs.unlinkSync(req.file.path); } catch {}
    res.json({ items, count: items.length });
  } catch (err) {
    if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: err.message || '解析失败' });
  }
});

// 下载导入模板
app.get('/api/admin/ai/knowledge/template', verifyAdminToken, requireAdmin, (req, res) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const data = [
    ['标题', '内容', '分类'],
    ['抖音养号第一步：完善资料', '注册后先完善个人资料：\n1. 上传清晰头像\n2. 昵称简洁好记\n3. 简介说明你是做什么的\n4. 绑定手机号', '养号技巧'],
    ['抖音流量池机制', '抖音采用层级递进的流量池：\n- 初始池：200-500播放\n- 完播率>30%进入下一级\n- 逐级递增至百万级', '短视频运营'],
    ['产品定价方案', '（在此填写您的产品定价信息）', '收费相关'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 60 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, '知识库模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="AI_knowledge_template.xlsx"; filename*=UTF-8\'\'AI%E7%9F%A5%E8%AF%86%E5%BA%93%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx');
  res.send(buf);
});

// 确认导入文档到知识库
app.post('/api/admin/ai/knowledge/import', verifyAdminToken, requireAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '没有要导入的数据' });
    }
    const db = getDb();
    const existingTitles = new Set(db.prepare('SELECT title FROM ai_knowledge').all().map(r => r.title));
    const insert = db.prepare('INSERT INTO ai_knowledge (title, content, category) VALUES (?, ?, ?)');
    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      if (!item.title && !item.content) continue;
      const title = item.title || '未命名';
      if (existingTitles.has(title)) { skipped++; continue; }
      insert.run(title, item.content || '', item.category || '');
      existingTitles.add(title);
      imported++;
    }
    try { rebuildRagIndex(true); } catch {}
    const msg = skipped > 0 ? `成功导入 ${imported} 条知识，跳过 ${skipped} 条重复` : `成功导入 ${imported} 条知识`;
    res.json({ message: msg, count: imported, skipped });
  } catch (err) {
    console.error('导入失败:', err);
    res.status(500).json({ error: err.message || '导入失败' });
  }
});

// 手动重建 RAG 索引
app.post('/api/admin/ai/rebuild-index', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const count = rebuildRagIndex(true);
    res.json({ ok: true, count, message: `索引已重建，共 ${count} 条知识` });
  } catch (err) {
    res.status(500).json({ error: '重建索引失败: ' + err.message });
  }
});

// RAG 向量块列表
app.get('/api/admin/ai/rag-chunks', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const knowledge = db.prepare(
      "SELECT id, title, content, category, 'knowledge' as source FROM ai_knowledge WHERE status = 'active'"
    ).all();
    const tutorials = db.prepare(
      "SELECT 100000 + id as id, title, content, category, 'tutorial' as source FROM tutorials WHERE status = 'published'"
    ).all();
    const faqs = db.prepare(
      "SELECT 200000 + id as id, question as title, answer as content, category, 'faq' as source FROM faqs WHERE status = 'active'"
    ).all();
    const all = [...knowledge, ...tutorials, ...faqs];
    res.json({ chunks: all, total: all.length });
  } catch (err) {
    res.status(500).json({ error: '获取向量块失败: ' + err.message });
  }
});

// RAG 检索测试
const { retrieve: ragRetrieve } = require('./services/rag');
app.post('/api/admin/ai/rag-search', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) return res.status(400).json({ error: '请输入查询内容' });
    const results = ragRetrieve(query, topK);
    res.json({ results, query });
  } catch (err) {
    res.status(500).json({ error: '检索失败: ' + err.message });
  }
});

// ============================================================
//  健康检查
// ============================================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================================
//  分类管理 /api/admin/categories  (需 admin)
// ============================================================

app.get('/api/admin/categories', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    res.json({ categories: cats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取分类失败' });
  }
});

app.post('/api/admin/categories', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: '分类名不能为空' });
    const db = getDb();
    const r = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)').run(name, icon || '', sort_order || 0);
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json({ category: cat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建分类失败' });
  }
});

app.put('/api/admin/categories/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    const db = getDb();
    db.prepare('UPDATE categories SET name=COALESCE(?,name), icon=COALESCE(?,icon), sort_order=COALESCE(?,sort_order) WHERE id=?')
      .run(name||null, icon??null, sort_order??null, req.params.id);
    const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
    res.json({ category: cat });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新分类失败' });
  }
});

app.delete('/api/admin/categories/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除分类失败' });
  }
});

// ============================================================
//  公开分类路由
// ============================================================

app.get('/api/categories', (req, res) => {
  try {
    const db = getDb();
    const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
    res.json({ categories: cats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取分类失败' });
  }
});

// ============================================================
//  知识库管理 /api/admin/knowledge  (需 admin)
// ============================================================

app.get('/api/admin/knowledge', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare('SELECT * FROM knowledge_base ORDER BY created_at DESC').all();
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取知识库失败' });
  }
});

app.post('/api/admin/knowledge', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { title, content, tags, category } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    const db = getDb();
    const r = db.prepare('INSERT INTO knowledge_base (title, content, tags, category) VALUES (?,?,?,?)')
      .run(title, content||'', JSON.stringify(tags||[]), category||'');
    const item = db.prepare('SELECT * FROM knowledge_base WHERE id=?').get(r.lastInsertRowid);
    try { rebuildRagIndex(true); } catch {}
    res.status(201).json({ item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建失败' });
  }
});

app.delete('/api/admin/knowledge/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM knowledge_base WHERE id=?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ============================================================
//  AI 问答接口（预留，对接外部 AI API）
// ============================================================

app.post('/api/ai/ask', (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: '请输入问题' });

    const db = getDb();
    // 简单的关键词匹配（后续对接 AI API）
    const items = db.prepare('SELECT title, content FROM knowledge_base WHERE status = ? AND (title LIKE ? OR content LIKE ?)').all('active', '%' + question + '%', '%' + question + '%');

    if (items.length > 0) {
      res.json({ answer: items[0].content, source: items[0].title, matched: true });
    } else {
      res.json({ answer: '暂无匹配的答案，建议提交工单让技术团队帮您处理。', matched: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败' });
  }
});

// ============================================================
//  前台用户管理（管理员）
// ============================================================

app.post('/api/admin/users', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { phone, password, nickname } = req.body;
    if (!phone || !password) return res.status(400).json({ error: '手机号和密码不能为空' });
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE phone=?').get(phone);
    if (existing) return res.status(409).json({ error: '手机号已存在' });
    const hash = require('bcryptjs').hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (phone,password,nickname) VALUES (?,?,?)').run(phone, hash, nickname||'');
    const user = db.prepare('SELECT id,phone,nickname,created_at FROM users WHERE id=?').get(r.lastInsertRowid);
    res.status(201).json({ message: '创建成功', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// ============================================================
//  管理员账号管理（超级管理员）
// ============================================================

app.get('/api/admin/admins', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const admins = db.prepare('SELECT id, username, nickname, role, created_at FROM admins ORDER BY created_at DESC').all();
    res.json({ admins });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取管理员列表失败' });
  }
});

app.post('/api/admin/admins', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { username, password, nickname, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    const db = getDb();
    const existing = db.prepare('SELECT id FROM admins WHERE username=?').get(username);
    if (existing) return res.status(409).json({ error: '用户名已存在' });
    const hash = require('bcryptjs').hashSync(password, 10);
    const r = db.prepare('INSERT INTO admins (username,password,nickname,role) VALUES (?,?,?,?)').run(username, hash, nickname||'', role||'editor');
    const admin = db.prepare('SELECT id,username,nickname,role,created_at FROM admins WHERE id=?').get(r.lastInsertRowid);
    res.status(201).json({ message: '创建成功', admin });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建管理员失败' });
  }
});

app.delete('/api/admin/admins/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const admin = db.prepare('SELECT id FROM admins WHERE id=?').get(req.params.id);
    if (!admin) return res.status(404).json({ error: '管理员不存在' });
    // 防止删除最后一个超级管理员
    const count = db.prepare("SELECT COUNT(*) as count FROM admins WHERE role='admin'").get().count;
    if (count <= 1 && req.params.id == req.admin.id) {
      return res.status(400).json({ error: '不能删除最后一个超级管理员' });
    }
    db.prepare('DELETE FROM admins WHERE id=?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除失败' });
  }
});

// ============================================================
//  文件上传（带 OSS 支持）
// ============================================================

app.post('/api/upload/file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择文件' });
  }
  try {
    const config = getDb().prepare('SELECT key, value FROM settings WHERE key LIKE ? OR key LIKE ?').all('oss_%', 'storage_%');
    const settings = {};
    for (const row of config) settings[row.key] = row.value;

    if (settings.storage_type === 'oss' && settings.oss_bucket) {
      // OSS 上传（预留）
      res.json({ url: '/uploads/' + req.file.filename, filename: req.file.originalname, storage: 'local' });
    } else {
      const url = '/uploads/' + req.file.filename;
      res.json({ url, filename: req.file.originalname, size: req.file.size, storage: 'local' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});

// 批量上传图片（一键上传本地图片）
app.post('/api/admin/upload/images', verifyAdminToken, requireAdmin, upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '请选择文件' });
    }
    const results = req.files.map(f => ({
      url: '/uploads/' + f.filename,
      filename: f.originalname,
      size: f.size,
    }));
    res.json({ message: `成功上传 ${results.length} 张图片`, files: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '上传失败' });
  }
});

// 删除单张图片
app.delete('/api/admin/upload/images/:filename', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
    // 防止路径穿越
    if (!filePath.startsWith(path.join(__dirname, 'uploads'))) return res.status(400).json({ error: '非法路径' });
    fs.unlinkSync(filePath);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 获取已上传图片列表
app.get('/api/admin/upload/images', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) return res.json({ images: [] });
    const allFiles = fs.readdirSync(uploadsDir);
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
    const files = allFiles
      .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      .map(f => {
        const stat = fs.statSync(path.join(uploadsDir, f));
        return { url: '/uploads/' + f, filename: f, size: stat.size };
      });
    res.json({ images: files, count: files.length });
  } catch (err) {
    console.error('获取图片列表失败:', err);
    res.status(500).json({ error: '获取图片列表失败: ' + err.message });
  }
});

// ============================================================
//  客户身份分类管理 /api/admin/customer-levels  (需 admin)
// ============================================================

app.get('/api/admin/customer-levels', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const levels = db.prepare('SELECT * FROM customer_levels ORDER BY sort_order ASC').all();
    res.json({ levels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取客户分类失败' });
  }
});

app.post('/api/admin/customer-levels', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '分类名称不能为空' });
    const db = getDb();
    const r = db.prepare('INSERT INTO customer_levels (name, description, sort_order) VALUES (?, ?, ?)')
      .run(name.trim(), (description || '').trim(), sort_order || 0);
    const level = db.prepare('SELECT * FROM customer_levels WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json({ level });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '该分类名称已存在' });
    }
    console.error(err);
    res.status(500).json({ error: '创建客户分类失败' });
  }
});

app.put('/api/admin/customer-levels/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    const db = getDb();
    const existing = db.prepare('SELECT id FROM customer_levels WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '客户分类不存在' });
    if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: '分类名称不能为空' });
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE customer_levels SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    const level = db.prepare('SELECT * FROM customer_levels WHERE id = ?').get(req.params.id);
    res.json({ level });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: '该分类名称已存在' });
    }
    console.error(err);
    res.status(500).json({ error: '更新客户分类失败' });
  }
});

app.delete('/api/admin/customer-levels/:id', verifyAdminToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM customer_levels WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '客户分类不存在' });
    // 解除引用了该分类的用户
    db.prepare('UPDATE users SET customer_level_id = 0 WHERE customer_level_id = ?').run(req.params.id);
    db.prepare('DELETE FROM customer_levels WHERE id = ?').run(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '删除客户分类失败' });
  }
});

// ============================================================
//  全局错误处理
// ============================================================

// 404
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 全局异常兜底（防止进程崩溃）
app.use((err, req, res, next) => {
  console.error('未捕获错误:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: '请求体过大' });
  }
  res.status(500).json({ error: '服务器内部错误' });
});

// 未捕获 Promise 异常 → 打日志但不崩溃
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 异常:', reason);
});

// ============================================================
//  启动服务
// ============================================================

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════╗
  ║   imai.work Backend Server      ║
  ║   Port: ${PORT}                      ║
  ║   Env: development              ║
  ╚══════════════════════════════════╝
  `);
  // 启动时重建 RAG 索引（包含教程和FAQ）
  try { rebuildRagIndex(); } catch (e) { console.warn('启动时 RAG 索引重建失败:', e.message); }

  // 每 5 分钟自动关闭超过 30 分钟无新消息的对话
  setInterval(() => {
    try {
      const db = getDb();
      const result = db.prepare(
        "UPDATE ai_conversations SET status = 'closed', updated_at = datetime('now','localtime') WHERE status = 'active' AND updated_at < datetime('now','localtime','-30 minutes')"
      ).run();
      if (result.changes > 0) {
        console.log('🧹 自动关闭 ' + result.changes + ' 个超时对话');
      }
    } catch (e) { console.warn('自动关闭对话失败:', e.message); }
  }, 5 * 60 * 1000);

  // 每天凌晨 3 点清理自动学习知识库（合并相似、淘汰超限）
  setInterval(() => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() < 5) {
      try {
        const result = cleanupLearned(200);
        if (result.merged > 0 || result.removed > 0) {
          rebuildRagIndex();
          console.log('🧠 自动学习清理: 合并 ' + result.merged + ' 条, 淘汰 ' + result.removed + ' 条');
        }
      } catch (e) { console.warn('自动学习清理失败:', e.message); }
    }
  }, 5 * 60 * 1000);
});
