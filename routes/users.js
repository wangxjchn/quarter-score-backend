const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

const ROLES  = ['admin', 'leader', 'employee'];
const LEVELS = ['junior', 'mid', 'senior'];
const sel    = `SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id`;

// GET /api/users
router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare(`${sel} ORDER BY u.employee_id`).all());
});

// GET /api/users/:id
router.get('/:id', requireAuth, (req, res) => {
  const user = db.prepare(`${sel} WHERE u.id = ?`).get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employee_id, name, role = 'employee', level = 'mid', team_id } = req.body;
  const eid = (employee_id || '').trim();
  const nm  = (name || '').trim();
  if (!eid)              return res.status(400).json({ error: '工号不能为空' });
  if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
  if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
  if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
  try {
    const r = db.prepare(
      'INSERT INTO users (employee_id, name, role, level, team_id) VALUES (?, ?, ?, ?, ?)'
    ).run(eid, nm, role, level, team_id || null);
    res.status(201).json(db.prepare(`${sel} WHERE u.id = ?`).get(r.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '工号已存在' });
    throw e;
  }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const { employee_id, name, role = 'employee', level = 'mid', team_id } = req.body;
  const eid = (employee_id || '').trim();
  const nm  = (name || '').trim();
  if (!eid)              return res.status(400).json({ error: '工号不能为空' });
  if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
  if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
  if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
  try {
    db.prepare(
      'UPDATE users SET employee_id=?, name=?, role=?, level=?, team_id=? WHERE id=?'
    ).run(eid, nm, role, level, team_id || null, id);
    res.json(db.prepare(`${sel} WHERE u.id = ?`).get(id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '工号已存在' });
    throw e;
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '用户不存在' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
