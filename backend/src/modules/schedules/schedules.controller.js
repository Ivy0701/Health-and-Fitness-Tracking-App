const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const list = asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM schedules WHERE user_id = ? ORDER BY start_time ASC", [req.user.id]);
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { title, schedule_type, start_time, end_time, status, remark } = req.body;
  const result = await db.run(
    `INSERT INTO schedules (user_id, title, schedule_type, start_time, end_time, status, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, title, schedule_type, start_time, end_time, status || "planned", remark || null]
  );
  res.status(201).json({ id: result.id });
});

module.exports = { list, create };
