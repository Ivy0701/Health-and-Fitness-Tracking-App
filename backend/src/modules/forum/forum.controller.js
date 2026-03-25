const asyncHandler = require("../../utils/asyncHandler");
const db = require("../../config/db");

const create = asyncHandler(async (req, res) => {
  const { title, content } = req.body;

  const t = String(title || "").trim();
  const c = String(content || "").trim();

  if (!t || !c) {
    return res.status(400).json({ message: "title and content are required" });
  }

  const result = await db.run(
    "INSERT INTO forum_posts (user_id, title, content) VALUES (?, ?, ?)",
    [req.user.id, t, c]
  );

  res.status(201).json({ id: result.id });
});

const mine = asyncHandler(async (req, res) => {
  const rows = await db.all(
    "SELECT * FROM forum_posts WHERE user_id = ? ORDER BY created_at DESC",
    [req.user.id]
  );
  res.json(rows);
});

module.exports = { create, mine };

