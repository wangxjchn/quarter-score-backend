# MySQL 迁移完成指南

## ✅ 已完成的修改

### 1. 安装依赖
- ✅ mysql2 (MySQL 驱动)
- ✅ dotenv (环境变量管理)

### 2. 创建的文件
- ✅ `.env` - 数据库配置（需要修改密码）
- ✅ `db-mysql.js` - MySQL 数据库连接和初始化
- ✅ `routes/users.js` - 用户路由（已改为 MySQL）
- ✅ `routes/auth.js` - 认证路由（已改为 MySQL）

### 3. 修改的文件
- ✅ `server.js` - 改为异步启动，调用数据库初始化

---

## ⚠️ 还需要您手动完成的事

### 1. 配置数据库连接信息

编辑 `.env` 文件，修改为您的实际数据库信息：

```env
DB_HOST=你的数据库地址
DB_PORT=3306
DB_USER=quarter_admin
DB_PASSWORD=你的密码
DB_NAME=quarter_score
PORT=3000
```

### 2. 在数据库中创建数据库

登录 MySQL 执行：

```sql
CREATE DATABASE quarter_score CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'quarter_admin'@'%' IDENTIFIED BY 'YourPassword@2026';
GRANT ALL PRIVILEGES ON quarter_score.* TO 'quarter_admin'@'%';
FLUSH PRIVILEGES;
```

**注意**：如果是公网访问，使用 `'%'` 而不是 `'localhost'`

### 3. 修改 teams.js 和 job-titles.js

这两个文件还需要从 SQLite 语法改为 MySQL 语法。主要改动：

#### routes/teams.js 修改要点：

```javascript
// 将
const db = require('../db');
// 改为
const { query, getOne, getAll } = require('../db-mysql');

// 将所有同步方法改为异步
// 例如：
// db.prepare('SELECT ...').all() → await getAll('SELECT ...')
// db.prepare('INSERT ...').run() → await query('INSERT ...')
```

#### routes/job-titles.js 同样修改

---

## 🚀 测试步骤

### 1. 启动后端

```bash
cd quarter-score-backend
npm start
```

应该看到：
```
🚀 正在连接 MySQL 数据库...
✅ 已连接到 MySQL 服务器
✅ 数据库 quarter_score 已就绪
📋 创建数据表...
✅ 所有数据表已创建或已存在
✅ 默认职级系数已插入
✅ 数据库连接池已创建
🎉 数据库初始化完成！
数据库初始化成功，启动 Express 服务器...
🚀 服务器运行在端口 3000
💾 数据库：MySQL - quarter_score
```

### 2. 测试健康检查

访问：`http://localhost:3000/api/health`

应该返回：
```json
{ "status": "ok" }
```

### 3. 测试登录

访问前端，使用工号登录即可。

---

## 📝 SQLite vs MySQL 主要差异

| SQLite | MySQL | 说明 |
|--------|-------|------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT AUTO_INCREMENT PRIMARY KEY` | 自增主键 |
| `TEXT` | `VARCHAR(n)` | 文本类型 |
| `REAL` | `DECIMAL(4,2)` | 小数类型 |
| `datetime('now','localtime')` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | 时间戳 |
| `.run()` 返回 `lastInsertRowid` | `.execute()` 返回 `insertId` | 插入 ID |
| `.get()` | `getOne()` | 单条记录 |
| `.all()` | `getAll()` | 多条记录 |

---

## 🔧 常见问题

### 问题 1: 连接失败

**错误**: `ER_ACCESS_DENIED_ERROR`

**解决**: 检查 `.env` 中的用户名密码是否正确

### 问题 2: 无法创建数据库

**错误**: `ER_DB_CREATE_EXISTS`

**解决**: 手动在 MySQL 中创建数据库并授权

### 问题 3: 外键约束失败

**解决**: 确保表创建顺序正确，或临时禁用外键检查

---

## 📦 下一步

1. **修改剩余的路由文件** (`teams.js`, `job-titles.js`)
2. **测试所有 API 端点**
3. **验证前端能正常连接**
4. **部署到生产环境**

---

## 💡 生产环境建议

### 环境变量（Render 部署）

在 Render Dashboard 中添加：

```
DB_HOST=你的 Neon/外部数据库地址
DB_USER=quarter_admin
DB_PASSWORD=强密码
DB_NAME=quarter_score
PORT=3000
NODE_ENV=production
```

### 安全加固

1. 使用强密码（至少 16 位）
2. 限制数据库远程访问 IP
3. 启用 SSL 连接
4. 定期备份数据库

---

## ✅ 检查清单

- [ ] `.env` 文件已创建并配置正确
- [ ] 数据库已创建并授权
- [ ] 后端能正常启动
- [ ] 能看到"数据库初始化完成"日志
- [ ] 健康检查端点正常
- [ ] 前端能正常登录
- [ ] 所有管理功能正常

完成以上步骤后，您的项目就成功从 SQLite 迁移到 MySQL 8.0 了！🎉
