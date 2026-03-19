const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/job-levels
router.get('/', requireAuth, async (req, res) => {
  try {
    const levels = await getAll(`
      SELECT * FROM job_levels
      ORDER BY sort_order, id
    `);
    res.json(levels);
  } catch (error) {
    console.error('获取职级列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/job-levels
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '职级名称不能为空' });
  }
  
  try {
    // 自动生成编码（拼音首字母或简单处理）
    const code = name.toLowerCase().replace(/\s+/g, '_');
    
    const result = await query(
      'INSERT INTO job_levels (name, code, base_coefficient) VALUES (?, ?, ?)',
      [name.trim(), code, 1.0]
    );
    const level = await getOne('SELECT * FROM job_levels WHERE id = ?', [result.insertId]);
    res.status(201).json(level);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '职级名称已存在' });
    }
    console.error('创建职级失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/job-levels/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '职级名称不能为空' });
  }
  
  const exists = await getOne('SELECT id FROM job_levels WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '职级不存在' });
  }
  
  try {
    await query('UPDATE job_levels SET name = ? WHERE id = ?', [name.trim(), id]);
    const level = await getOne('SELECT * FROM job_levels WHERE id = ?', [id]);
    res.json(level);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '职级名称已存在' });
    }
    console.error('更新职级失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/job-levels/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  const exists = await getOne('SELECT id FROM job_levels WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '职级不存在' });
  }
  
  try {
    // 检查是否有职称使用该职级
    const countResult = await getOne('SELECT COUNT(*) AS c FROM job_titles WHERE level_id = ?', [id]);
    const count = countResult.c;
    if (count > 0) {
      return res.status(400).json({ error: `还有 ${count} 个职称使用此职级，请先修改后再删除` });
    }
    
    await query('DELETE FROM job_levels WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('删除职级失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
