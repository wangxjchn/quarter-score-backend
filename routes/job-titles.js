const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/job-titles
router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM job_titles ORDER BY name').all());
});

// POST /api/job-titles
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  try {
    const r = db.prepare('INSERT INTO job_titles (name) VALUES (?)').run(name);
    res.status(201).json(db.prepare('SELECT * FROM job_titles WHERE id = ?').get(r.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '职称已存在' });
    throw e;
  }
});

// PUT /api/job-titles/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id   = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  if (!db.prepare('SELECT id FROM job_titles WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '职称不存在' });
  }
  try {
    db.prepare('UPDATE job_titles SET name = ? WHERE id = ?').run(name, id);
    res.json(db.prepare('SELECT * FROM job_titles WHERE id = ?').get(id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: '职称已存在' });
    throw e;
  }
});

// DELETE /api/job-titles/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM job_titles WHERE id = ?').get(id)) {
    return res.status(404).json({ error: '职称不存在' });
  }
  const count = db.prepare('SELECT COUNT(*) AS c FROM users WHERE title_id = ?').get(id).c;
  if (count > 0) return res.status(400).json({ error: `还有 ${count} 名员工使用此职称，请先修改后再删除` });
  db.prepare('DELETE FROM job_titles WHERE id = ?').run(id);
  res.status(204).send();
});

module.exports = router;
