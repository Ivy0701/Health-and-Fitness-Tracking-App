const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const create = asyncHandler(async (req, res) => {
  const { rating, content, contact_email } = req.body;
  const result = await db.run(
    "INSERT INTO feedback (user_id, rating, content, contact_email) VALUES (?, ?, ?, ?)",
    [req.user.id, rating, content, contact_email || null]
  );
  res.status(201).json({ id: result.id });
});

const mine = asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM feedback WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json(rows);
});

module.exports = { create, mine };
