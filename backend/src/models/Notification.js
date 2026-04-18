const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["like", "comment", "post_removed", "post_warning"],
      required: true,
      index: true,
    },
    /** Short heading for moderation / richer UI (optional for legacy like/comment). */
    title: { type: String, trim: true, default: "" },
    message: { type: String, required: true, trim: true },
    /** Moderator explanation (e.g. removal reason). */
    reason: { type: String, trim: true, default: "" },
    relatedPostId: { type: mongoose.Schema.Types.ObjectId, ref: "ForumPost", required: true, index: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Notification", notificationSchema);
