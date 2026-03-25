const express = require("express");
const controller = require("./schedules.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/:userId", auth, controller.list);
router.post("/", auth, controller.create);
router.delete("/:id", auth, controller.remove);

module.exports = router;

