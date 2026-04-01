const express = require("express");
const controller = require("./vip.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/status/:userId", auth, controller.status);
router.post("/upgrade", auth, controller.upgrade);
router.post("/cancel", auth, controller.cancel);

module.exports = router;

