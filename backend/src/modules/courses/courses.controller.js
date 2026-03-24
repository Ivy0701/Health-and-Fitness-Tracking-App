const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const list = asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM courses ORDER BY created_at DESC");
  res.json(rows);
});

const detail = asyncHandler(async (req, res) => {
  const row = await db.get("SELECT * FROM courses WHERE id = ?", [req.params.id]);
  res.json(row || null);
});

const book = asyncHandler(async (req, res) => {
  const exists = await db.get(
    "SELECT id FROM course_bookings WHERE user_id = ? AND course_id = ?",
    [req.user.id, req.params.id]
  );
  let bookingId = exists?.id || null;
  if (exists) {
    await db.run("UPDATE course_bookings SET status = 'booked' WHERE id = ?", [exists.id]);
  } else {
    const result = await db.run(
      "INSERT INTO course_bookings (user_id, course_id, status) VALUES (?, ?, 'booked')",
      [req.user.id, req.params.id]
    );
    bookingId = result.id;
  }
  res.status(201).json({ success: true, bookingId });
});

module.exports = { list, detail, book };
