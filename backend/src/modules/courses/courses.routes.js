const express = require("express");
const controller = require("./courses.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/", auth, controller.list);
router.post("/", auth, controller.create);
router.get("/:id", auth, controller.detail);

module.exports = router;

