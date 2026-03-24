const db = require("../../config/db");

async function createAssessment(userId, payload) {
  const result = await db.run(
    `INSERT INTO assessments (user_id, gender, height_cm, weight_kg, age, target_weight_kg, bmi, bmi_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      payload.gender,
      payload.height_cm,
      payload.weight_kg,
      payload.age,
      payload.target_weight_kg,
      payload.bmi,
      payload.bmi_category
    ]
  );
  await db.run(
    "INSERT INTO bmi_records (user_id, height_cm, weight_kg, bmi, bmi_category, recorded_date) VALUES (?, ?, ?, ?, ?, date('now'))",
    [userId, payload.height_cm, payload.weight_kg, payload.bmi, payload.bmi_category]
  );
  await db.run(
    `UPDATE users
     SET gender = ?, height_cm = ?, weight_kg = ?, age = ?, target_weight_kg = ?
     WHERE id = ?`,
    [payload.gender, payload.height_cm, payload.weight_kg, payload.age, payload.target_weight_kg, userId]
  );
  return db.get("SELECT * FROM assessments WHERE id = ?", [result.id]);
}

async function getLatestAssessment(userId) {
  const row = await db.get(
    "SELECT * FROM assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  return row || null;
}

module.exports = { createAssessment, getLatestAssessment };
