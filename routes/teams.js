const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/teams
router.get('/', requireAuth, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, COUNT(DISTINCT ut.user_id) AS member_count
    FROM teams t LEFT JOIN user_teams ut ON ut.team_id = t.id
    GROUP BY t.id ORDER BY t.name
  `).all();
  res.json(teams);
});

// POST /api/teams
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '小组名称不能为空' });
  try {
    const r = db.prepare('INSERT INTO teams (name) VALUES (?)').run(name);
    const team = db.prepare(`
      SELECT t.*, 0 AS member_count FROM teams t WHERE t.id = ?
    `).get(r.lastInsertRowid);
    res.status(201).json(team);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '小组名称已存在' });
    throw e;
  }
});

// PUT /api/teams/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id   = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '小组名称不能为空' });
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '小组不存在' });
  }
  try {
    db.prepare('UPDATE teams SET name = ? WHERE id = ?').run(name, id);
    res.json(db.prepare(`
      SELECT t.*, COUNT(DISTINCT ut.user_id) AS member_count
      FROM teams t LEFT JOIN user_teams ut ON ut.team_id = t.id
      WHERE t.id = ? GROUP BY t.id
    `).get(id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '小组名称已存在' });
    throw e;
  }
});

// GET /api/teams/:id/members
router.get('/:id/members', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '小组不存在' });
  }
  const members = db.prepare(`
    SELECT u.id, u.employee_id, u.name, u.role, u.level, jt.name AS title_name
    FROM users u
    JOIN user_teams ut ON ut.user_id = u.id
    LEFT JOIN job_titles jt ON jt.id = u.title_id
    WHERE ut.team_id = ?
    ORDER BY u.name
  `).all(id);
  res.json(members);
});

// POST /api/teams/:id/members  { user_id }
router.post('/:id/members', requireAuth, requireAdmin, (req, res) => {
  const teamId = Number(req.params.id);
  const userId = Number(req.body.user_id);
  if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(userId) || userId <= 0)
    return res.status(400).json({ error: '参数无效' });
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(teamId))
    return res.status(404).json({ error: '小组不存在' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId))
    return res.status(404).json({ error: '用户不存在' });
  db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)').run(userId, teamId);
  res.status(201).json({ ok: true });
});

// DELETE /api/teams/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireAdmin, (req, res) => {
  const teamId = Number(req.params.id);
  const userId = Number(req.params.userId);
  db.prepare('DELETE FROM user_teams WHERE team_id = ? AND user_id = ?').run(teamId, userId);
  res.status(204).send();
});

// DELETE /api/teams/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '小组不存在' });
  }
  const mc = db.prepare('SELECT COUNT(*) AS c FROM user_teams WHERE team_id = ?').get(id).c;
  if (mc > 0) return res.status(400).json({ error: `该小组还有 ${mc} 名成员，请先移出后再删除` });
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
