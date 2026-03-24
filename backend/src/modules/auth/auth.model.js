const db = require("../../config/db");

async function findByEmail(email) {
  return db.get("SELECT * FROM users WHERE email = ?", [email]);
}

async function findById(id) {
  return db.get("SELECT id, email, username, role, is_active, created_at FROM users WHERE id = ?", [id]);
}

async function createUser({ email, passwordHash, username }) {
  const result = await db.run(
    "INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)",
    [email, passwordHash, username]
  );
  return findById(result.id);
}

module.exports = { findByEmail, findById, createUser };
