const mongoose = require("mongoose");

const forumPostSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true },
    tags: { type: [String], default: [] },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        authorName: { type: String, required: true, trim: true },
        content: { type: String, required: true, trim: true },
        parentCommentId: { type: mongoose.Schema.Types.ObjectId, default: null },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ["normal", "warned", "removed"], default: "normal", index: true },
    warningMessage: { type: String, trim: true, default: "" },
    moderatedAt: { type: Date, default: null },
    moderatedBy: { type: String, trim: true, default: "" },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("ForumPost", forumPostSchema);

