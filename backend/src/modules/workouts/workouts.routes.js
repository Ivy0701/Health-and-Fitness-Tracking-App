const express = require("express");
const controller = require("./workouts.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();
router.get("/plan", auth, controller.listPlans);
router.get("/task/:id", auth, controller.getTaskDetail);
router.post("/plan", auth, controller.createPlan);
router.post("/plan/skip-day", auth, controller.skipPlanForDay);
router.delete("/plan/:id", auth, controller.stopPlan);
router.get("/today", auth, controller.getTodayPlan);
router.get("/day", auth, controller.getTodayPlan);
router.post("/today/status", auth, controller.updateTodayStatus);

module.exports = router;

