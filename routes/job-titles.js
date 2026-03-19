const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql'); // 改用 MySQL
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/job-titles
router.get('/', requireAuth, async (req, res) => {
  try {
    const titles = await getAll('SELECT * FROM job_titles ORDER BY name');
    res.json(titles);
  } catch (error) {
    console.error('获取职称列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/job-titles
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  
  try {
    const result = await query('INSERT INTO job_titles (name) VALUES (?)', [name]);
    const title = await getOne('SELECT * FROM job_titles WHERE id = ?', [result.insertId]);
    res.status(201).json(title);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '职称已存在' });
    console.error('创建职称失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/job-titles/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id   = Number(req.params.id);
  const name = (req.body.name || '').trim();
  
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  
  const exists = await getOne('SELECT id FROM job_titles WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '职称不存在' });
  }
  
  try {
    await query('UPDATE job_titles SET name = ? WHERE id = ?', [name, id]);
    const title = await getOne('SELECT * FROM job_titles WHERE id = ?', [id]);
    res.json(title);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '职称已存在' });
    console.error('更新职称失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/job-titles/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  const exists = await getOne('SELECT id FROM job_titles WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '职称不存在' });
  }
  
  try {
    const countResult = await getOne('SELECT COUNT(*) AS c FROM users WHERE title_id = ?', [id]);
    const count = countResult.c;
    if (count > 0) return res.status(400).json({ error: `还有 ${count} 名员工使用此职称，请先修改后再删除` });
    
    await query('DELETE FROM job_titles WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('删除职称失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
