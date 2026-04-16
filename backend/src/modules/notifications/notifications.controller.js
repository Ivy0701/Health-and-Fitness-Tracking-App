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

module.exports = { list, markAllRead };
