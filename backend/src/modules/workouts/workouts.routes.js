const express = require("express");
const controller = require("./workouts.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/plan", auth, controller.listPlans);
router.post("/plan", auth, controller.createPlan);

module.exports = router;

