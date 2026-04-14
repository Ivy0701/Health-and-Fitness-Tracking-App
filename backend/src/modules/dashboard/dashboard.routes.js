const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const controller = require("./dashboard.controller");

const router = express.Router();
router.get("/", authMiddleware, controller.getDashboard);
router.get("/overview", authMiddleware, controller.getDashboard);
router.get("/system-status", authMiddleware, controller.getSystemStatus);

module.exports = router;
