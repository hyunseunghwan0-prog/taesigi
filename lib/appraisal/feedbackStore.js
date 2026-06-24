const { pool } = require('../db');

async function save({ type, checker, description, context, finding, fileName, userId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO feedback (file_name, type, checker, description, context, finding, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [fileName, type, checker || null, description || null, context || null,
     finding ? JSON.stringify(finding) : null, userId]
  );
  return rows[0];
}

async function getStats() {
  const { rows } = await pool.query(`
    SELECT type, COUNT(*)::int AS cnt FROM feedback GROUP BY type
  `);
  const byType = { missed: 0, false_positive: 0, correct: 0 };
  rows.forEach(r => { byType[r.type] = r.cnt; });
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  return { total, byType };
}

async function loadAll() {
  const { rows } = await pool.query(
    `SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100`
  );
  return rows;
}

module.exports = { save, getStats, loadAll };
