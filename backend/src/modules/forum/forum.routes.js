const express = require("express");
const controller = require("./forum.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/posts", auth, controller.list);
router.post("/posts", auth, controller.create);
router.get("/posts/:id", auth, controller.detail);
router.delete("/posts/:id", auth, controller.remove);

module.exports = router;

