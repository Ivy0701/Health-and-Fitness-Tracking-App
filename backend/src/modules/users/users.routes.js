const express = require("express");
const controller = require("./users.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/me", authMiddleware, controller.me);
router.put("/me", authMiddleware, controller.updateMe);
router.get("/profile", authMiddleware, controller.me);
router.put("/profile", authMiddleware, controller.updateMe);

module.exports = router;
