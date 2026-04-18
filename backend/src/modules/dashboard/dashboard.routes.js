const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { isSystemStatusPublic } = require("../../config/systemStatusAccess");
const controller = require("./dashboard.controller");

const router = express.Router();

function systemStatusGate(req, res, next) {
  if (isSystemStatusPublic()) return next();
  return authMiddleware(req, res, next);
}

router.get("/", authMiddleware, controller.getDashboard);
router.get("/overview", authMiddleware, controller.getDashboard);
router.get("/system-status", systemStatusGate, controller.getSystemStatus);
router.get("/refund-requests", systemStatusGate, controller.listRefundRequests);
router.post("/refund-requests/:userId/approve", systemStatusGate, controller.approveRefundRequest);
router.post("/refund-requests/:userId/reject", systemStatusGate, controller.rejectRefundRequest);
router.get("/forum-moderation", systemStatusGate, controller.listForumModerationPosts);
router.post("/forum-moderation/:postId/warn", systemStatusGate, controller.addForumWarning);
router.post("/forum-moderation/:postId/remove-warning", systemStatusGate, controller.removeForumWarning);
router.delete("/forum-moderation/:postId", systemStatusGate, controller.removeForumPost);

module.exports = router;
