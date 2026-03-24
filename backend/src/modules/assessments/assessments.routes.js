const express = require("express");
const controller = require("./assessments.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();
router.post("/", authMiddleware, controller.create);
router.get("/latest", authMiddleware, controller.latest);

module.exports = router;
