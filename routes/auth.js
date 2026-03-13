const express = require('express');
const router  = express.Router();
const db      = require('../db');

const BOOTSTRAP_CODE = 'engineer@cygia.com';

const userSql = `
  SELECT u.*, t.name AS team_name
  FROM users u LEFT JOIN teams t ON t.id = u.team_id
`;

// POST /api/auth/login
router.post('/login', (req, res) => {
  const eid  = (req.body.employee_id || '').trim();
  const name = (req.body.name || '').trim();
  const code = req.body.security_code || '';

  if (!eid) return res.status(400).json({ error: '工号不能为空' });

  const total = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

  if (total === 0) {
    // 系统无账号 - bootstrap 模式
    if (!code) {
      return res.status(401).json({ needSecurityCode: true, error: '系统暂无账号，请输入安全码初始化管理员' });
    }
    if (code !== BOOTSTRAP_CODE) {
      return res.status(401).json({ needSecurityCode: true, error: '安全码错误' });
    }
    const adminName = name || eid;
    const r = db.prepare("INSERT INTO users (employee_id, name, role, level) VALUES (?, ?, 'admin', 'mid')").run(eid, adminName);
    const user = db.prepare(`${userSql} WHERE u.id = ?`).get(r.lastInsertRowid);
    return res.status(201).json({ user });
  }

  const user = db.prepare(`${userSql} WHERE u.employee_id = ?`).get(eid);
  if (!user) return res.status(401).json({ error: '工号不存在，请联系管理员添加账号' });

  res.json({ user });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.currentUser });
});

// ─── middleware ───────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const eid = req.headers['x-employee-id'];
  if (!eid) return res.status(401).json({ error: '未登录' });
  const user = db.prepare(`${userSql} WHERE u.employee_id = ?`).get(eid);
  if (!user) return res.status(401).json({ error: '账号不存在' });
  req.currentUser = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { router, requireAuth, requireAdmin };
