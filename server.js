const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initializeDatabase } = require('./db-mysql'); // 改用 MySQL

const { router: authRouter } = require('./routes/auth');
const departmentsRouter   = require('./routes/departments'); // 新增职能管理
const teamsRouter       = require('./routes/teams');
const usersRouter       = require('./routes/users');
const jobTitlesRouter   = require('./routes/job-titles');
const jobLevelsRouter   = require('./routes/job-levels'); // 新增职级管理

// 异步启动函数
async function startServer() {
  try {
    // 1. 初始化数据库（自动创建表）
    await initializeDatabase();
    
    console.log('数据库初始化成功，启动 Express 服务器...');
    
    const app = express();
    app.use(cors());
    app.use(express.json());

// ─── 认证 ────────────────────────────────────────────
app.use('/api/auth',        authRouter);

// ─── 职能 / 小组 / 员工 ───────────────────────────────
app.use('/api/departments', departmentsRouter); // 新增职能管理
app.use('/api/teams',       teamsRouter);
app.use('/api/users',       usersRouter);
app.use('/api/job-titles',  jobTitlesRouter);
app.use('/api/job-levels',  jobLevelsRouter); // 新增职级管理

// ─── 健康检查 ─────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在端口 ${PORT}`);
  console.log(`📡 API 地址：http://localhost:${PORT}`);
  console.log(`💾 数据库：MySQL - ${process.env.DB_NAME}`);
});

  } catch (error) {
    console.error('💥 服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();
