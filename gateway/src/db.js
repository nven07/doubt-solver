require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS conversation_id INTEGER
    REFERENCES conversations(id) ON DELETE CASCADE
  `);
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT FALSE
  `);

  const old = await pool.query(
    "SELECT COUNT(*)::int AS n FROM messages WHERE conversation_id IS NULL"
  );
  if (old.rows[0].n > 0) {
    const conv = await pool.query(`
      INSERT INTO conversations (title, created_at, updated_at)
      SELECT 'Earlier questions', MIN(created_at), MAX(created_at)
      FROM messages WHERE conversation_id IS NULL
      RETURNING id
    `);
    await pool.query(
      "UPDATE messages SET conversation_id = $1 WHERE conversation_id IS NULL",
      [conv.rows[0].id]
    );
  }
}

async function createConversation(title) {
  const result = await pool.query(
    "INSERT INTO conversations (title) VALUES ($1) RETURNING id, title, updated_at",
    [title]
  );
  return result.rows[0];
}

async function saveMessage(conversationId, role, content) {
  const result = await pool.query(
    "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING id",
    [conversationId, role, content]
  );
  await pool.query(
    "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
    [conversationId]
  );
  return result.rows[0].id;
}

async function listConversations(limit = 50) {
  const result = await pool.query(
    "SELECT id, title, updated_at FROM conversations ORDER BY updated_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}

async function getConversationMessages(conversationId) {
  const result = await pool.query(
    "SELECT id, role, content, saved, created_at FROM messages WHERE conversation_id = $1 ORDER BY id",
    [conversationId]
  );
  return result.rows;
}

async function toggleSaved(messageId) {
  const result = await pool.query(
    "UPDATE messages SET saved = NOT saved WHERE id = $1 AND role = 'ai' RETURNING id, saved",
    [messageId]
  );
  return result.rows[0] || null;
}

async function listSaved() {
  const result = await pool.query(`
    SELECT m.id, m.content, m.created_at, m.conversation_id,
      (SELECT q.content FROM messages q
        WHERE q.conversation_id = m.conversation_id
          AND q.id < m.id AND q.role = 'user'
        ORDER BY q.id DESC LIMIT 1) AS question
    FROM messages m
    WHERE m.saved = TRUE
    ORDER BY m.id DESC
  `);
  return result.rows;
}

module.exports = {
  initDb,
  createConversation,
  saveMessage,
  listConversations,
  getConversationMessages,
  toggleSaved,
  listSaved,
};