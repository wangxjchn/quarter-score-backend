const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql'); // 改用 MySQL
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/job-titles
router.get('/', requireAuth, async (req, res) => {
  try {
    const titles = await getAll(`
      SELECT jt.*, jl.name as level_name, jl.code as level_code
      FROM job_titles jt
      LEFT JOIN job_levels jl ON jt.level_id = jl.id
      ORDER BY jt.name
    `);
    res.json(titles);
  } catch (error) {
    console.error('获取职称列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/job-titles
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, level_id } = req.body;
  
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  
  try {
    // 如果提供了 level_id，验证其存在性
    if (level_id) {
      const levelExists = await getOne('SELECT id FROM job_levels WHERE id = ?', [level_id]);
      if (!levelExists) {
        return res.status(400).json({ error: '指定的职级不存在' });
      }
    }
    
    const result = await query('INSERT INTO job_titles (name, level_id) VALUES (?, ?)', [name, level_id || null]);
    const title = await getOne(`
      SELECT jt.*, jl.name as level_name, jl.code as level_code
      FROM job_titles jt
      LEFT JOIN job_levels jl ON jt.level_id = jl.id
      WHERE jt.id = ?
    `, [result.insertId]);
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
  const { name, level_id } = req.body;
  
  if (!name) return res.status(400).json({ error: '职称名称不能为空' });
  
  const exists = await getOne('SELECT id FROM job_titles WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '职称不存在' });
  }
  
  try {
    // 如果提供了 level_id，验证其存在性
    if (level_id) {
      const levelExists = await getOne('SELECT id FROM job_levels WHERE id = ?', [level_id]);
      if (!levelExists) {
        return res.status(400).json({ error: '指定的职级不存在' });
      }
    }
    
    await query('UPDATE job_titles SET name = ?, level_id = ? WHERE id = ?', [name, level_id || null, id]);
    const title = await getOne(`
      SELECT jt.*, jl.name as level_name, jl.code as level_code
      FROM job_titles jt
      LEFT JOIN job_levels jl ON jt.level_id = jl.id
      WHERE jt.id = ?
    `, [id]);
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
