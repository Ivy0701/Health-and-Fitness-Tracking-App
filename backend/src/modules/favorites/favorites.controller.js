const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const list = asyncHandler(async (req, res) => {
  const rows = await db.all("SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const type = req.body.type || req.body.fav_type;
  const itemId = req.body.item_id || req.body.target_id;
  const existing = await db.get(
    "SELECT id FROM favorites WHERE user_id = ? AND type = ? AND item_id = ?",
    [req.user.id, type, itemId]
  );
  if (existing) {
    return res.status(201).json({ id: existing.id, success: true });
  }
  const result = await db.run(
    "INSERT INTO favorites (user_id, type, item_id) VALUES (?, ?, ?)",
    [req.user.id, type, itemId]
  );
  res.status(201).json({ id: result.id, success: true });
});

module.exports = { list, create };
