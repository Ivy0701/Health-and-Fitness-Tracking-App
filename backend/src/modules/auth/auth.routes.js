const express = require("express");
const controller = require("./auth.controller");
const authMiddleware = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.get("/verify", authMiddleware, controller.verify);

module.exports = router;
