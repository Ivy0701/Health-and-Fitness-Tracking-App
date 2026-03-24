const express = require("express");
const controller = require("./vip.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/plans", controller.plans);
router.get("/status", auth, controller.status);
router.post("/upgrade", auth, controller.upgrade);

module.exports = router;
