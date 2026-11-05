require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
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
  await pool.query(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS user_id INTEGER
    REFERENCES users(id) ON DELETE CASCADE
  `);
  await pool.query(`
    ALTER TABLE IF EXISTS documents
    ADD COLUMN IF NOT EXISTS user_id INTEGER
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

async function createUser(name, email, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const count = await client.query("SELECT COUNT(*)::int AS n FROM users");
    const isFirst = count.rows[0].n === 0;

    const result = await client.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, passwordHash]
    );
    const user = result.rows[0];

    if (isFirst) {
      await client.query(
        "UPDATE conversations SET user_id = $1 WHERE user_id IS NULL",
        [user.id]
      );
      await client.query("SAVEPOINT claim_docs");
      try {
        await client.query(
          "UPDATE documents SET user_id = $1 WHERE user_id IS NULL",
          [user.id]
        );
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT claim_docs");
      }
    }

    await client.query("COMMIT");
    return user;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT id, name, email, password_hash FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

async function createConversation(userId, title) {
  const result = await pool.query(
    "INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id, title, updated_at",
    [userId, title]
  );
  return result.rows[0];
}

async function conversationOwnedBy(userId, conversationId) {
  const result = await pool.query(
    "SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId]
  );
  return result.rowCount > 0;
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

async function listConversations(userId, limit = 50) {
  const result = await pool.query(
    "SELECT id, title, updated_at FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2",
    [userId, limit]
  );
  return result.rows;
}

async function getConversationMessages(userId, conversationId) {
  const result = await pool.query(
    `SELECT m.id, m.role, m.content, m.saved, m.created_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND c.user_id = $2
     ORDER BY m.id`,
    [conversationId, userId]
  );
  return result.rows;
}

async function toggleSaved(userId, messageId) {
  const result = await pool.query(
    `UPDATE messages m SET saved = NOT m.saved
     FROM conversations c
     WHERE m.id = $1 AND m.role = 'ai'
       AND c.id = m.conversation_id AND c.user_id = $2
     RETURNING m.id, m.saved`,
    [messageId, userId]
  );
  return result.rows[0] || null;
}

async function listSaved(userId) {
  const result = await pool.query(
    `SELECT m.id, m.content, m.created_at, m.conversation_id,
       (SELECT q.content FROM messages q
         WHERE q.conversation_id = m.conversation_id
           AND q.id < m.id AND q.role = 'user'
         ORDER BY q.id DESC LIMIT 1) AS question
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.saved = TRUE AND c.user_id = $1
     ORDER BY m.id DESC`,
    [userId]
  );
  return result.rows;
}

module.exports = {
  initDb,
  createUser,
  findUserByEmail,
  findUserById,
  createConversation,
  conversationOwnedBy,
  saveMessage,
  listConversations,
  getConversationMessages,
  toggleSaved,
  listSaved,
};