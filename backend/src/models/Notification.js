const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["like", "comment"], required: true },
    message: { type: String, required: true, trim: true },
    relatedPostId: { type: mongoose.Schema.Types.ObjectId, ref: "ForumPost", required: true, index: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Notification", notificationSchema);
