const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql');
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/departments
router.get('/', requireAuth, async (req, res) => {
  try {
    const departments = await getAll(`
      SELECT d.*, COUNT(u.id) as member_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      GROUP BY d.id
      ORDER BY d.name
    `);
    res.json(departments);
  } catch (error) {
    console.error('获取职能列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/departments/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const department = await getOne(`
      SELECT d.*, COUNT(u.id) as member_count
      FROM departments d
      LEFT JOIN users u ON d.id = u.department_id
      WHERE d.id = ?
      GROUP BY d.id
    `, [Number(req.params.id)]);
    
    if (!department) return res.status(404).json({ error: '职能不存在' });
    
    // 获取该职能下的所有员工
    const members = await getAll(`
      SELECT u.id, u.employee_id, u.name, u.role, u.title_id, u.department_id, jt.name AS title_name
      FROM users u
      LEFT JOIN job_titles jt ON jt.id = u.title_id
      WHERE u.department_id = ?
      ORDER BY u.employee_id
    `, [department.id]);
    
    res.json({ ...department, members });
  } catch (error) {
    console.error('获取职能详情失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/departments
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const nm = (name || '').trim();
    
    if (!nm) return res.status(400).json({ error: '职能名称不能为空' });
    
    // 检查是否与群组名称重复
    const teams = await getAll('SELECT id, name FROM teams');
    const teamNames = teams.map(t => t.name.toLowerCase());
    if (teamNames.includes(nm.toLowerCase())) {
      return res.status(400).json({ error: '职能名称不能与群组名称相同' });
    }
    
    const result = await query(
      'INSERT INTO departments (name) VALUES (?)',
      [nm]
    );
    
    const department = await getOne('SELECT * FROM departments WHERE id = ?', [result.insertId]);
    res.status(201).json(department);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '职能名称已存在' });
    console.error('创建职能失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/departments/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = await getOne('SELECT id FROM departments WHERE id = ?', [id]);
    if (!exists) {
      return res.status(404).json({ error: '职能不存在' });
    }
    
    const { name } = req.body;
    const nm = (name || '').trim();
    
    if (!nm) return res.status(400).json({ error: '职能名称不能为空' });
    
    // 检查是否与群组名称重复（排除自己）
    const teams = await getAll('SELECT id, name FROM teams');
    const teamNames = teams.map(t => t.name.toLowerCase());
    const currentDept = await getOne('SELECT name FROM departments WHERE id = ?', [id]);
    if (teamNames.includes(nm.toLowerCase()) && nm.toLowerCase() !== currentDept.name.toLowerCase()) {
      return res.status(400).json({ error: '职能名称不能与群组名称相同' });
    }
    
    await query('UPDATE departments SET name = ? WHERE id = ?', [nm, id]);
    
    const department = await getOne('SELECT * FROM departments WHERE id = ?', [id]);
    res.json(department);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '职能名称已存在' });
    console.error('更新职能失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = await getOne('SELECT id FROM departments WHERE id = ?', [id]);
    if (!exists) {
      return res.status(404).json({ error: '职能不存在' });
    }
    
    // 检查是否有员工属于该职能
    const memberCount = await getOne('SELECT COUNT(*) as c FROM user_departments WHERE department_id = ?', [id]);
    if (memberCount.c > 0) {
      return res.status(400).json({ error: `该职能下还有 ${memberCount.c} 名员工，无法删除` });
    }
    
    await query('DELETE FROM departments WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('删除职能失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
