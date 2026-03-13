const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/teams
router.get('/', requireAuth, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, COUNT(u.id) AS member_count
    FROM teams t LEFT JOIN users u ON u.team_id = t.id
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
      SELECT t.*, COUNT(u.id) AS member_count
      FROM teams t LEFT JOIN users u ON u.team_id = t.id
      WHERE t.id = ? GROUP BY t.id
    `).get(id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '小组名称已存在' });
    throw e;
  }
});

// DELETE /api/teams/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM teams WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '小组不存在' });
  }
  const mc = db.prepare('SELECT COUNT(*) AS c FROM users WHERE team_id = ?').get(id).c;
  if (mc > 0) return res.status(400).json({ error: `该小组还有 ${mc} 名成员，请先移出后再删除` });
  db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
