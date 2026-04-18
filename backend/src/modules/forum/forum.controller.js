const asyncHandler = require("../../utils/asyncHandler");
const ForumPost = require("../../models/ForumPost");
const User = require("../../models/User");
const Notification = require("../../models/Notification");
const { isLegacyDemoForumTitle } = require("../../utils/forumLegacyDemoTitles");
const { forumPostsUserVisibleFilter } = require("../../utils/forumUserVisibleFilter");

const LEGACY_TAG_TO_EN = {
  饮食: "diet",
  训练: "training",
  减脂: "fat_loss",
  恢复: "recovery",
  心得: "notes",
  综合: "general",
};

function toEnglishTag(t) {
  const s = String(t || "").trim();
  return LEGACY_TAG_TO_EN[s] || s;
}

function sanitizeTagSlug(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const next = [...new Set(raw.map((t) => sanitizeTagSlug(toEnglishTag(t))).filter(Boolean))];
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
    status: ["normal", "warned", "removed"].includes(String(obj.status || "")) ? String(obj.status) : "normal",
    warningMessage: String(obj.warningMessage || "").trim(),
    moderatedAt: obj.moderatedAt || null,
    moderatedBy: String(obj.moderatedBy || "").trim(),
    likeCount: likedBy.length,
    commentCount: normalizedComments.length,
    likedByMe: likedBy.some((id) => String(id) === String(userId)),
    comments: normalizedComments,
  };
}

async function createPostNotification({ receiverUserId, actorUserId, type, message, relatedPostId }) {
  if (!receiverUserId || !relatedPostId) return;
  if (String(receiverUserId) === String(actorUserId)) return;
  await Notification.create({
    userId: receiverUserId,
    type,
    message,
    relatedPostId,
    isRead: false,
  });
}

const list = asyncHandler(async (req, res) => {
  const rows = await ForumPost.find(forumPostsUserVisibleFilter()).sort({ createdAt: -1 });
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
  if (String(row.status || "normal") === "removed") return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });
  res.json(serializePost(row, req.user.id));
});

const toggleLike = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (String(row.status || "normal") === "removed") return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });

  const userId = String(req.user.id);
  const likedBy = Array.isArray(row.likedBy) ? row.likedBy.map((id) => String(id)) : [];
  const hasLiked = likedBy.includes(userId);
  const becameLiked = !hasLiked;

  if (hasLiked) {
    row.likedBy = row.likedBy.filter((id) => String(id) !== userId);
  } else {
    row.likedBy.push(req.user.id);
  }
  row.likeCount = row.likedBy.length;
  await row.save();
  if (becameLiked) {
    await createPostNotification({
      receiverUserId: row.userId,
      actorUserId: req.user.id,
      type: "like",
      message: "Someone liked your post",
      relatedPostId: row._id,
    });
  }

  res.json(serializePost(row, req.user.id));
});

const addComment = asyncHandler(async (req, res) => {
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ message: "comment content is required" });
  const parentCommentId = String(req.body?.parentCommentId || "").trim();

  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (String(row.status || "normal") === "removed") return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });

  const user = await User.findById(req.user.id).select("username").lean();
  let parentComment = null;
  if (parentCommentId) {
    parentComment = row.comments.id(parentCommentId);
    if (!parentComment) return res.status(400).json({ message: "Parent comment not found" });
    if (parentComment.parentCommentId) {
      return res.status(400).json({ message: "Only one-level reply is allowed" });
    }
  }
  row.comments.push({
    userId: req.user.id,
    authorName: user?.username || "User",
    content,
    parentCommentId: parentComment ? parentComment._id : null,
  });
  row.commentCount = row.comments.length;
  await row.save();
  if (parentComment) {
    await createPostNotification({
      receiverUserId: parentComment.userId,
      actorUserId: req.user.id,
      type: "comment",
      message: `${user?.username || "Someone"} replied to your comment`,
      relatedPostId: row._id,
    });
  } else {
    await createPostNotification({
      receiverUserId: row.userId,
      actorUserId: req.user.id,
      type: "comment",
      message: "Someone commented on your post",
      relatedPostId: row._id,
    });
  }

  res.status(201).json(serializePost(row, req.user.id));
});

const updateComment = asyncHandler(async (req, res) => {
  const content = String(req.body?.content || "").trim();
  if (!content) return res.status(400).json({ message: "comment content is required" });

  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (String(row.status || "normal") === "removed") return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });

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
  if (String(row.status || "normal") === "removed") return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });

  const comment = row.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (String(comment.userId) !== String(req.user.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const deletingCommentId = String(comment._id);
  const isRootComment = !comment.parentCommentId;
  comment.deleteOne();
  if (isRootComment) {
    row.comments = row.comments.filter((item) => String(item?.parentCommentId || "") !== deletingCommentId);
  }
  row.commentCount = row.comments.length;
  await row.save();

  res.json(serializePost(row, req.user.id));
});

const remove = asyncHandler(async (req, res) => {
  const row = await ForumPost.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Post not found" });
  if (isLegacyDemoForumTitle(row?.title)) return res.status(404).json({ message: "Post not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

module.exports = { list, create, detail, remove, toggleLike, addComment, updateComment, deleteComment };

