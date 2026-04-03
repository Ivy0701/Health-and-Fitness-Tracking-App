const asyncHandler = require("../../utils/asyncHandler");
const ForumPost = require("../../models/ForumPost");
const User = require("../../models/User");

const ALLOWED_TAGS = new Set(["饮食", "训练", "减脂", "恢复", "心得", "综合"]);

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const next = [...new Set(raw.map((t) => String(t || "").trim()).filter((t) => ALLOWED_TAGS.has(t)))];
  return next;
}

const list = asyncHandler(async (req, res) => {
  const rows = await ForumPost.find().sort({ createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { title, content, tags: tagsBody } = req.body;
  if (!title || !content) return res.status(400).json({ message: "title and content are required" });
  const user = await User.findById(req.user.id).select("username").lean();
  const tags = normalizeTags(tagsBody);
  const row = await ForumPost.create({
    userId: req.user.id,
    authorName: user?.username || "User",
    title,
    content,
    tags,
  });
  res.status(201).json(row);
});

const detail = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  res.json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, detail, remove };

