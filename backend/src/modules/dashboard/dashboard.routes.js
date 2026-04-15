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

module.exports = router;
