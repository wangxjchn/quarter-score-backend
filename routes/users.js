const express = require('express');
const router  = express.Router();
const { query, getOne, getAll } = require('../db-mysql');
const { requireAuth, requireAdmin } = require('./auth');

const ROLES  = ['admin', 'leader', 'employee'];
const LEVELS = ['junior', 'mid', 'senior'];
const sel    = `SELECT u.id, u.employee_id, u.name, u.role, u.level, u.title_id, u.department_id, u.created_at FROM users u`;

async function withDepartment(user) {
  if (!user) return null;
  let department_name = null;
  let department_code = null;
  if (user.department_id) {
    const dept = await getOne('SELECT name FROM departments WHERE id = ?', [user.department_id]);
    department_name = dept?.name || null;
  }
  return {
    ...user,
    department_name,
  };
}

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
  let title_name = null;
  if (user.title_id) {
    const jt = await getOne('SELECT name FROM job_titles WHERE id = ?', [user.title_id]);
    title_name = jt?.name || null;
  }
  return {
    ...user,
    teams,
    team_ids,
    team_names,
    team_name: team_names[0] || null,
    title_name,
    ...await withDepartment(user),
  };
}

async function listUsersWithTeams() {
  const users = await getAll(`${sel} ORDER BY u.employee_id`);
  const result = [];
  for (const user of users) {
    result.push(await withTeams(user));
  }
  return result;
}

function normalizeTeamIds(body) {
  let source = body.team_ids;
  if (!Array.isArray(source) && body.team_id !== undefined && body.team_id !== null && body.team_id !== '') {
    source = [body.team_id];
  }
  if (source === undefined || source === null) return [];
  if (!Array.isArray(source)) return null;

  const normalized = [];
  for (const item of source) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
}

async function validateTeamIds(teamIds) {
  if (teamIds.length === 0) return true;
  const placeholders = teamIds.map(() => '?').join(',');
  const result = await getOne(`SELECT COUNT(*) AS c FROM teams WHERE id IN (${placeholders})`, teamIds);
  return Number(result.c) === teamIds.length;
}

async function syncUserTeams(userId, teamIds) {
  await query('DELETE FROM user_teams WHERE user_id = ?', [userId]);
  for (const teamId of teamIds) {
    await query('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)', [userId, teamId]);
  }
}

// GET /api/users
router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await listUsersWithTeams());
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// GET /api/users/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const user = await withTeams(await getOne(`${sel} WHERE u.id = ?`, [Number(req.params.id)]));
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json(user);
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { employee_id, name, role = 'employee', level = 'mid', title_id, department_id } = req.body;
    const eid     = (employee_id || '').trim();
    const nm      = (name || '').trim();
    const titleId = title_id ? Number(title_id) : null;
    const deptId = department_id ? Number(department_id) : null;
    const teamIds = normalizeTeamIds(req.body);
    
    if (!eid)              return res.status(400).json({ error: '工号不能为空' });
    if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
    if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
    if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
    if (teamIds === null)         return res.status(400).json({ error: '小组参数无效' });
    if (!await validateTeamIds(teamIds)) return res.status(400).json({ error: '存在无效的小组' });
    
    // 验证职能是否存在（如果指定了）
    if (deptId) {
      const deptExists = await getOne('SELECT id FROM departments WHERE id = ?', [deptId]);
      if (!deptExists) {
        return res.status(400).json({ error: '指定的职能不存在' });
      }
    }
    
    const result = await query(
      'INSERT INTO users (employee_id, name, role, level, title_id, department_id) VALUES (?, ?, ?, ?, ?, ?)',
      [eid, nm, role, level, titleId, deptId]
    );
    
    await syncUserTeams(Number(result.insertId), teamIds);
    const user = await withTeams(await getOne(`${sel} WHERE u.id = ?`, [result.insertId]));
    res.status(201).json(user);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '工号已存在' });
    console.error('创建用户失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = await getOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!exists) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const { employee_id, name, role = 'employee', level = 'mid', title_id, department_id } = req.body;
    const eid     = (employee_id || '').trim();
    const nm      = (name || '').trim();
    const titleId = title_id ? Number(title_id) : null;
    const deptId = department_id ? Number(department_id) : null;
    
    if (!eid)              return res.status(400).json({ error: '工号不能为空' });
    if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
    if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
    if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
    
    // 验证职能是否存在（如果指定了）
    if (deptId) {
      const deptExists = await getOne('SELECT id FROM departments WHERE id = ?', [deptId]);
      if (!deptExists) {
        return res.status(400).json({ error: '指定的职能不存在' });
      }
    }
    
    await query(
      'UPDATE users SET employee_id=?, name=?, role=?, level=?, title_id=?, department_id=? WHERE id=?',
      [eid, nm, role, level, titleId, deptId, id]
    );
    
    // 仅当请求中提供了 team_ids 参数时才更新群组关系
    if ('team_ids' in req.body) {
      const teamIds = normalizeTeamIds(req.body);
      if (teamIds === null) return res.status(400).json({ error: '小组参数无效' });
      if (!await validateTeamIds(teamIds)) return res.status(400).json({ error: '存在无效的小组' });
      await syncUserTeams(id, teamIds);
    }
    
    const user = await withTeams(await getOne(`${sel} WHERE u.id = ?`, [id]));
    res.json(user);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: '工号已存在' });
    console.error('更新用户失败:', e);
    res.status(500).json({ error: '服务器错误' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exists = await getOne('SELECT id FROM users WHERE id = ?', [id]);
    if (!exists) {
      return res.status(404).json({ error: '用户不存在' });
    }
    await query('DELETE FROM users WHERE id = ?', [id]);
    res.status(204).send();
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
