const express = require("express");
const controller = require("./schedules.controller");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();

router.post("/diet-plan", auth, controller.applyDietPlan);
router.delete("/diet-plan", auth, controller.removeDietPlanApply);
router.post("/batch", auth, controller.batchCreate);
router.delete("/course/:courseId", auth, controller.removeByCourse);
router.get("/:userId", auth, controller.list);
router.post("/", auth, controller.create);
router.patch("/:id", auth, controller.update);
router.delete("/:id", auth, controller.remove);

module.exports = router;
