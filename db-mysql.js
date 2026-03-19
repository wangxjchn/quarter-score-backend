const mysql = require('mysql2/promise');

require('dotenv').config();

let pool = null;

/**
 * 初始化数据库连接和表结构
 */
async function initializeDatabase() {
  try {
    console.log('🚀 正在连接 MySQL 数据库...');
    
    // 创建初始连接（不指定数据库）
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'quarter_admin',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });

    console.log('✅ 已连接到 MySQL 服务器');

    const dbName = process.env.DB_NAME || 'quarter_score';

    // 确保数据库存在
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ 数据库 ${dbName} 已就绪`);

    // 切换到项目数据库
    await connection.query(`USE \`${dbName}\``);

    // 禁用外键检查以允许删除表
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 创建所有表
    console.log('📋 创建数据表...');
    await connection.query(`
      -- 小组表
      CREATE TABLE IF NOT EXISTS teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- 员工表
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'employee',
        level VARCHAR(20) NOT NULL DEFAULT 'mid',
        title_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_employee_id (employee_id),
        INDEX idx_title_id (title_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- 职级系数表
      CREATE TABLE IF NOT EXISTS level_coefficients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        level VARCHAR(20) NOT NULL UNIQUE,
        coefficient DECIMAL(4,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- 员工 - 小组关系表（多对多）
      CREATE TABLE IF NOT EXISTS user_teams (
        user_id INT NOT NULL,
        team_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, team_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- 职级表（新增）
      CREATE TABLE IF NOT EXISTS job_levels (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        code VARCHAR(50) NOT NULL UNIQUE,
        base_coefficient DECIMAL(4,2) NOT NULL DEFAULT 1.0,
        description VARCHAR(500),
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

      -- 职称表
      CREATE TABLE IF NOT EXISTS job_titles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        level_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (level_id) REFERENCES job_levels(id) ON DELETE SET NULL,
        INDEX idx_level_id (level_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ 所有数据表已创建或已存在');

    // 重新启用外键检查
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    // 插入默认职级
    await connection.query(`
      INSERT INTO job_levels (name, code, base_coefficient, description, sort_order) VALUES
        ('初级', 'junior', 1.1, '初级职称，适用于入职 1-3 年的员工', 1),
        ('中级', 'mid', 1.0, '中级职称，适用于入职 3-5 年的员工', 2),
        ('高级', 'senior', 0.9, '高级职称，适用于入职 5 年以上的员工', 3)
      ON DUPLICATE KEY UPDATE name=name
    `);
    console.log('✅ 默认职级已插入');

    // 插入默认职级系数（保留向后兼容）
    await connection.query(`
      INSERT INTO level_coefficients (level, coefficient) VALUES
        ('junior', 1.1),
        ('mid', 1.0),
        ('senior', 0.9)
      ON DUPLICATE KEY UPDATE level=level
    `);

    console.log('✅ 默认职级系数已插入');

    // 迁移旧数据：如果 users 表有 team_id 字段，迁移到 user_teams
    try {
      await connection.query(`
        INSERT IGNORE INTO user_teams (user_id, team_id)
        SELECT id, team_id FROM users WHERE team_id IS NOT NULL
      `);
      console.log('✅ 历史数据已迁移到 user_teams 表');
    } catch (e) {
      console.log('ℹ️ 无需数据迁移或 team_id 字段不存在');
    }

    await connection.end();

    // 创建连接池用于后续操作
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'quarter_admin',
      password: process.env.DB_PASSWORD,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    });

    console.log('✅ 数据库连接池已创建');
    
    // 数据迁移检查 - 使用连接池
    try {
      const checkColumn = await getOne(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'job_titles' AND COLUMN_NAME = 'level_id'
      `, [dbName]);
      
      if (!checkColumn) {
        console.log('📝 为 job_titles 添加 level_id 字段...');
        // 使用 pool.execute 而不是 connection.query
        await query(`
          ALTER TABLE job_titles 
          ADD COLUMN level_id INT,
          ADD FOREIGN KEY (level_id) REFERENCES job_levels(id) ON DELETE SET NULL,
          ADD INDEX idx_level_id (level_id)
        `);
        console.log('✅ job_titles.level_id 字段已添加');
      } else {
        console.log('ℹ️ level_id 字段已存在，无需迁移');
      }
    } catch (error) {
      console.log('⚠️ 数据迁移检查完成:', error.message);
    }
    
    console.log('🎉 数据库初始化完成！\n');

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    throw error;
  }
}

/**
 * 通用查询方法
 * @param {string} sql - SQL 查询语句
 * @param {array} params - 参数数组
 * @returns {Promise<any>} 查询结果
 */
async function query(sql, params = []) {
  if (!pool) {
    throw new Error('数据库未初始化，请先调用 initializeDatabase()');
  }
  const [results] = await pool.execute(sql, params);
  return results;
}

/**
 * 获取单个记录
 * @param {string} sql - SQL 查询语句
 * @param {array} params - 参数数组
 * @returns {Promise<any|null>} 单条记录或 null
 */
async function getOne(sql, params = []) {
  const results = await query(sql, params);
  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

/**
 * 获取所有记录
 * @param {string} sql - SQL 查询语句
 * @param {array} params - 参数数组
 * @returns {Promise<Array>} 记录数组
 */
async function getAll(sql, params = []) {
  return await query(sql, params);
}

/**
 * 执行事务
 * @param {Function} callback - 事务回调函数
 * @returns {Promise<any>} 事务执行结果
 */
async function transaction(callback) {
  if (!pool) {
    throw new Error('数据库未初始化');
  }
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    console.error('事务执行失败:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  initializeDatabase,
  query,
  getOne,
  getAll,
  transaction
};
