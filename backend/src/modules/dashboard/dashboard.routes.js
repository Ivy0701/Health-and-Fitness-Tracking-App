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

module.exports = router;
