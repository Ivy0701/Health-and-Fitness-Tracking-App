const db = require("../../config/db");

async function getMe(userId) {
  return db.get(
    `SELECT id, email, username, gender, height_cm, weight_kg, age, target_weight_kg
     FROM users
     WHERE id = ?`,
    [userId]
  );
}

async function updateMe(userId, payload) {
  await db.run(
    `UPDATE users
     SET username = ?, gender = ?, height_cm = ?, weight_kg = ?, age = ?, target_weight_kg = ?
     WHERE id = ?`,
    [
      payload.username,
      payload.gender,
      payload.height_cm,
      payload.weight_kg,
      payload.age,
      payload.target_weight_kg,
      userId
    ]
  );
  return getMe(userId);
}

module.exports = { getMe, updateMe };
