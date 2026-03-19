const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql'); // 改用 MySQL
const { requireAuth, requireAdmin } = require('./auth');

// GET /api/teams
router.get('/', requireAuth, async (req, res) => {
  try {
    const teams = await getAll(`
      SELECT t.*, COUNT(DISTINCT ut.user_id) AS member_count
      FROM teams t LEFT JOIN user_teams ut ON ut.team_id = t.id
      GROUP BY t.id ORDER BY t.name
    `);
    res.json(teams);
  } catch (error) {
    console.error('获取小组列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/teams
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '小组名称不能为空' });
  
  try {
    const result = await query('INSERT INTO teams (name) VALUES (?)', [name]);
    const team = await getOne(
      'SELECT t.*, 0 AS member_count FROM teams t WHERE t.id = ?',
      [result.insertId]
    );
    res.status(201).json(team);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '小组名称已存在' });
    console.error('创建小组失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/teams/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id   = Number(req.params.id);
  const name = (req.body.name || '').trim();
  
  if (!name) return res.status(400).json({ error: '小组名称不能为空' });
  
  const exists = await getOne('SELECT id FROM teams WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '小组不存在' });
  }
  
  try {
    await query('UPDATE teams SET name = ? WHERE id = ?', [name, id]);
    const team = await getAll(`
      SELECT t.*, COUNT(DISTINCT ut.user_id) AS member_count
      FROM teams t LEFT JOIN user_teams ut ON ut.team_id = t.id
      WHERE t.id = ? GROUP BY t.id
    `, [id]);
    res.json(team[0]);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '小组名称已存在' });
    console.error('更新小组失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/teams/:id/members
router.get('/:id/members', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  
  const exists = await getOne('SELECT id FROM teams WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '小组不存在' });
  }
  
  try {
    const members = await getAll(`
      SELECT u.id, u.employee_id, u.name, u.role, u.level, jt.name AS title_name
      FROM users u
      JOIN user_teams ut ON ut.user_id = u.id
      LEFT JOIN job_titles jt ON jt.id = u.title_id
      WHERE ut.team_id = ?
      ORDER BY u.name
    `, [id]);
    res.json(members);
  } catch (error) {
    console.error('获取小组成员失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/teams/:id/members  { user_id }
router.post('/:id/members', requireAuth, requireAdmin, async (req, res) => {
  const teamId = Number(req.params.id);
  const userId = Number(req.body.user_id);
  
  if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(userId) || userId <= 0)
    return res.status(400).json({ error: '参数无效' });
  
  const teamExists = await getOne('SELECT id FROM teams WHERE id = ?', [teamId]);
  if (!teamExists)
    return res.status(404).json({ error: '小组不存在' });
  
  const userExists = await getOne('SELECT id FROM users WHERE id = ?', [userId]);
  if (!userExists)
    return res.status(404).json({ error: '用户不存在' });
  
  try {
    await query('INSERT IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)', [userId, teamId]);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('添加成员失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/teams/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireAdmin, async (req, res) => {
  const teamId = Number(req.params.id);
  const userId = Number(req.params.userId);
  
  try {
    await query('DELETE FROM user_teams WHERE team_id = ? AND user_id = ?', [teamId, userId]);
    res.status(204).send();
  } catch (error) {
    console.error('移除成员失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  
  const exists = await getOne('SELECT id FROM teams WHERE id = ?', [id]);
  if (!exists) {
    return res.status(404).json({ error: '小组不存在' });
  }
  
  try {
    const mcResult = await getOne('SELECT COUNT(*) AS c FROM user_teams WHERE team_id = ?', [id]);
    const mc = mcResult.c;
    if (mc > 0) return res.status(400).json({ error: `该小组还有 ${mc} 名成员，请先移出后再删除` });
    
    await query('DELETE FROM teams WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('删除小组失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
