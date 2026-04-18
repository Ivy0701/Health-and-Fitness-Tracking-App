const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const Notification = require("../../models/Notification");

const list = asyncHandler(async (req, res) => {
  const rows = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json(rows);
});

const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user.id, isRead: false },
    {
      $set: { isRead: true },
    }
  );
  res.json({ success: true });
});

const markOneRead = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid notification id." });
  const updated = await Notification.findOneAndUpdate(
    { _id: id, userId: req.user.id },
    { $set: { isRead: true } },
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ message: "Notification not found." });
  res.json(updated);
});

module.exports = { list, markAllRead, markOneRead };
