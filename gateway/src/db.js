require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function saveMessage(role, content) {
  await pool.query("INSERT INTO messages (role, content) VALUES ($1, $2)", [
    role,
    content,
  ]);
}

async function getRecentMessages(limit = 50) {
  const result = await pool.query(
    "SELECT role, content, created_at FROM messages ORDER BY id DESC LIMIT $1",
    [limit]
  );
  return result.rows.reverse();
}

module.exports = { initDb, saveMessage, getRecentMessages };