const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const list = asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM workouts ORDER BY created_at DESC");
  res.json(rows);
});

const createRecord = asyncHandler(async (req, res) => {
  const { workout_id, duration_min, calories_burned, record_date, note } = req.body;
  const result = await db.run(
    `INSERT INTO workout_records (user_id, workout_id, duration_min, calories_burned, record_date, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, workout_id, duration_min, calories_burned || null, record_date, note || null]
  );
  res.status(201).json({ id: result.id });
});

module.exports = { list, createRecord };
