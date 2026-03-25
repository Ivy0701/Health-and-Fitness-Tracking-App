const express = require("express");
const controller = require("./health.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/save", authMiddleware, controller.save);
router.get("/history/:userId", authMiddleware, controller.history);

module.exports = router;

