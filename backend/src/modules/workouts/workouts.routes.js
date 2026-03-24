const express = require("express");
const controller = require("./workouts.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/", auth, controller.list);
router.post("/records", auth, controller.createRecord);

module.exports = router;
