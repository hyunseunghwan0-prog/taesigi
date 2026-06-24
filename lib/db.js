const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway PostgreSQL은 SSL 필요, 로컬은 불필요
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

/**
 * DB 초기화 — 앱 시작 시 테이블이 없으면 생성
 */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      file_name   TEXT,
      type        TEXT NOT NULL,        -- 'missed' | 'false_positive' | 'correct'
      checker     TEXT,
      description TEXT,
      context     TEXT,
      finding     JSONB,
      user_id     TEXT                  -- 나중에 회사 ID 로그인 시 사용
    )
  `);
}

module.exports = { pool, initDb };
