const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth, requireAdmin } = require('./auth');

const ROLES  = ['admin', 'leader', 'employee'];
const LEVELS = ['junior', 'mid', 'senior'];
const sel    = `SELECT u.id, u.employee_id, u.name, u.role, u.level, u.title_id, u.created_at FROM users u`;

function withTeams(user) {
  if (!user) return null;
  const teams = db.prepare(`
    SELECT t.id, t.name
    FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id
    WHERE ut.user_id = ?
    ORDER BY t.name
  `).all(user.id);
  const team_ids = teams.map((t) => t.id);
  const team_names = teams.map((t) => t.name);
  let title_name = null;
  if (user.title_id) {
    const jt = db.prepare('SELECT name FROM job_titles WHERE id = ?').get(user.title_id);
    title_name = jt?.name || null;
  }
  return {
    ...user,
    teams,
    team_ids,
    team_names,
    team_name: team_names[0] || null,
    title_name,
  };
}

function listUsersWithTeams() {
  return db.prepare(`${sel} ORDER BY u.employee_id`).all().map(withTeams);
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

function validateTeamIds(teamIds) {
  if (teamIds.length === 0) return true;
  const placeholders = teamIds.map(() => '?').join(',');
  const count = db.prepare(`SELECT COUNT(*) AS c FROM teams WHERE id IN (${placeholders})`).get(...teamIds).c;
  return count === teamIds.length;
}

function syncUserTeams(userId, teamIds) {
  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
  const add = db.prepare('INSERT INTO user_teams (user_id, team_id) VALUES (?, ?)');
  for (const teamId of teamIds) add.run(userId, teamId);
}

// GET /api/users
router.get('/', requireAuth, (req, res) => {
  res.json(listUsersWithTeams());
});

// GET /api/users/:id
router.get('/:id', requireAuth, (req, res) => {
  const user = withTeams(db.prepare(`${sel} WHERE u.id = ?`).get(Number(req.params.id)));
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

// POST /api/users
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { employee_id, name, role = 'employee', level = 'mid', title_id } = req.body;
  const eid     = (employee_id || '').trim();
  const nm      = (name || '').trim();
  const titleId = title_id ? Number(title_id) : null;
  const teamIds = normalizeTeamIds(req.body);
  if (!eid)              return res.status(400).json({ error: '工号不能为空' });
  if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
  if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
  if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
  if (teamIds === null)         return res.status(400).json({ error: '小组参数无效' });
  if (!validateTeamIds(teamIds)) return res.status(400).json({ error: '存在无效的小组' });
  try {
    const tx = db.transaction(() => {
      const r = db.prepare(
        'INSERT INTO users (employee_id, name, role, level, title_id) VALUES (?, ?, ?, ?, ?)'
      ).run(eid, nm, role, level, titleId);
      syncUserTeams(Number(r.lastInsertRowid), teamIds);
      return Number(r.lastInsertRowid);
    });
    const id = tx();
    res.status(201).json(withTeams(db.prepare(`${sel} WHERE u.id = ?`).get(id)));
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
  const { employee_id, name, role = 'employee', level = 'mid', title_id } = req.body;
  const eid     = (employee_id || '').trim();
  const nm      = (name || '').trim();
  const titleId = title_id ? Number(title_id) : null;
  const teamIds = normalizeTeamIds(req.body);
  if (!eid)              return res.status(400).json({ error: '工号不能为空' });
  if (!nm)               return res.status(400).json({ error: '姓名不能为空' });
  if (!ROLES.includes(role))   return res.status(400).json({ error: '角色值无效' });
  if (!LEVELS.includes(level)) return res.status(400).json({ error: '职级值无效' });
  if (teamIds === null)         return res.status(400).json({ error: '小组参数无效' });
  if (!validateTeamIds(teamIds)) return res.status(400).json({ error: '存在无效的小组' });
  try {
    db.transaction(() => {
      db.prepare(
        'UPDATE users SET employee_id=?, name=?, role=?, level=?, title_id=? WHERE id=?'
      ).run(eid, nm, role, level, titleId, id);
      syncUserTeams(id, teamIds);
    })();
    res.json(withTeams(db.prepare(`${sel} WHERE u.id = ?`).get(id)));
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
