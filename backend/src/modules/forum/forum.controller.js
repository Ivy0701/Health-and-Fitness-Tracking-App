const asyncHandler = require("../../utils/asyncHandler");
const ForumPost = require("../../models/ForumPost");
const User = require("../../models/User");

const LEGACY_TAG_TO_EN = {
  饮食: "diet",
  训练: "training",
  减脂: "fat_loss",
  恢复: "recovery",
  心得: "notes",
  综合: "general",
};
const ALLOWED_TAGS = new Set(["diet", "training", "fat_loss", "recovery", "notes", "general"]);

function toEnglishTag(t) {
  const s = String(t || "").trim();
  return LEGACY_TAG_TO_EN[s] || s;
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const next = [
    ...new Set(raw.map((t) => toEnglishTag(t)).filter((t) => ALLOWED_TAGS.has(t))),
  ];
  return next;
}

function tagsForResponse(raw) {
  return normalizeTags(Array.isArray(raw) ? raw : []);
}

function serializePost(row, userId) {
  const obj = row.toObject ? row.toObject() : row;
  const likedBy = Array.isArray(obj.likedBy) ? obj.likedBy : [];
  const comments = Array.isArray(obj.comments) ? obj.comments : [];
  const normalizedComments = comments
    .filter((c) => c && c.content)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    ...obj,
    tags: tagsForResponse(obj.tags),
    likeCount: likedBy.length,
    commentCount: normalizedComments.length,
    likedByMe: likedBy.some((id) => String(id) === String(userId)),
    comments: normalizedComments,
  };
}

const list = asyncHandler(async (req, res) => {
  const rows = await ForumPost.find().sort({ createdAt: -1 });
  res.json(rows.map((row) => serializePost(row, req.user.id)));
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
  res.status(201).json(serializePost(row, req.user.id));
});

const detail = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  res.json(serializePost(row, req.user.id));
});

const toggleLike = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });

  const userId = String(req.user.id);
  const likedBy = Array.isArray(row.likedBy) ? row.likedBy.map((id) => String(id)) : [];
  const hasLiked = likedBy.includes(userId);

  if (hasLiked) {
    row.likedBy = row.likedBy.filter((id) => String(id) !== userId);
  } else {
    row.likedBy.push(req.user.id);
  }
  row.likeCount = row.likedBy.length;
  await row.save();

  res.json(serializePost(row, req.user.id));
});

const addComment = asyncHandler(async (req, res) => {
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ message: "comment content is required" });

  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });

  const user = await User.findById(req.user.id).select("username").lean();
  row.comments.push({
    userId: req.user.id,
    authorName: user?.username || "User",
    content,
  });
  row.commentCount = row.comments.length;
  await row.save();

  res.status(201).json(serializePost(row, req.user.id));
});

const updateComment = asyncHandler(async (req, res) => {
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ message: "comment content is required" });

  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });

  const comment = row.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (String(comment.userId) !== String(req.user.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  comment.content = content;
  await row.save();

  res.json(serializePost(row, req.user.id));
});

const deleteComment = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });

  const comment = row.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (String(comment.userId) !== String(req.user.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  comment.deleteOne();
  row.commentCount = row.comments.length;
  await row.save();

  res.json(serializePost(row, req.user.id));
});

const remove = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, detail, remove, toggleLike, addComment, updateComment, deleteComment };

