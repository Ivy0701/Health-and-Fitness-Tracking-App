const express = require("express");
const controller = require("./courses.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/", auth, controller.list);
router.get("/:id", auth, controller.detail);
router.post("/:id/bookings", auth, controller.book);

module.exports = router;
