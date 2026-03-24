const express = require("express");
const controller = require("./feedback.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.post("/", auth, controller.create);
router.get("/me", auth, controller.mine);

module.exports = router;
