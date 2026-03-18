const express = require('express');
const cors    = require('cors');

require('./db'); // 初始化数据库与表结构

const { router: authRouter } = require('./routes/auth');
const teamsRouter      = require('./routes/teams');
const usersRouter      = require('./routes/users');
const jobTitlesRouter  = require('./routes/job-titles');

const app = express();
app.use(cors());
app.use(express.json());

// ─── 认证 ────────────────────────────────────────────
app.use('/api/auth',  authRouter);

// ─── 小组 / 员工 ─────────────────────────────────────
app.use('/api/teams',      teamsRouter);
app.use('/api/users',      usersRouter);
app.use('/api/job-titles', jobTitlesRouter);

// ─── 健康检查 ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
