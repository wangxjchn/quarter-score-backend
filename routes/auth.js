const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql'); // 改用 MySQL

const BOOTSTRAP_CODE = 'engineer@cygia.com';

const userSql = `
  SELECT u.id, u.employee_id, u.name, u.role, u.level, u.created_at
  FROM users u
`;

async function withTeams(user) {
  if (!user) return null;
  const teams = await getAll(`
    SELECT t.id, t.name
    FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id
    WHERE ut.user_id = ?
    ORDER BY t.name
  `, [user.id]);

  const team_ids = teams.map((t) => t.id);
  const team_names = teams.map((t) => t.name);

  return {
    ...user,
    teams,
    team_ids,
    team_names,
    team_name: team_names[0] || null,
  };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const eid  = (req.body.employee_id || '').trim();
  const name = (req.body.name || '').trim();
  const code = req.body.security_code || '';

  if (!eid) return res.status(400).json({ error: '工号不能为空' });

  try {
    const totalResult = await getOne('SELECT COUNT(*) as c FROM users');
    const total = totalResult.c;

    if (total === 0) {
      // 系统无账号 - bootstrap 模式
      if (!code) {
        return res.status(401).json({ needSecurityCode: true, error: '系统暂无账号，请输入安全码初始化管理员' });
      }
      if (code !== BOOTSTRAP_CODE) {
        return res.status(401).json({ needSecurityCode: true, error: '安全码错误' });
      }
      const adminName = name || eid;
      const result = await query(
        "INSERT INTO users (employee_id, name, role, level) VALUES (?, ?, 'admin', 'mid')",
        [eid, adminName]
      );
      const user = await withTeams(await getOne(`${userSql} WHERE u.id = ?`, [result.insertId]));
      return res.status(201).json({ user });
    }

    const user = await withTeams(await getOne(`${userSql} WHERE u.employee_id = ?`, [eid]));
    if (!user) return res.status(401).json({ error: '工号不存在，请联系管理员添加账号' });

    res.json({ user });
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.currentUser });
});

// ─── middleware ───────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const eid = req.headers['x-employee-id'];
  if (!eid) return res.status(401).json({ error: '未登录' });
  
  try {
    const user = await withTeams(await getOne(`${userSql} WHERE u.employee_id = ?`, [eid]));
    if (!user) return res.status(401).json({ error: '账号不存在' });
    req.currentUser = user;
    next();
  } catch (error) {
    console.error('认证失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
}

function requireAdmin(req, res, next) {
  if (req.currentUser.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

module.exports = { router, requireAuth, requireAdmin };
