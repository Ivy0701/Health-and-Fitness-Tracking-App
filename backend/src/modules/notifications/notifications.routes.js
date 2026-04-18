const express = require("express");
const controller = require("./notifications.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();

router.get("/", auth, controller.list);
router.post("/item/:id/read", auth, controller.markOneRead);
router.post("/read", auth, controller.markAllRead);

module.exports = router;
