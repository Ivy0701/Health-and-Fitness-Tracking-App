const express = require("express");
const authRoutes = require("../modules/auth/auth.routes");
const userRoutes = require("../modules/users/users.routes");
const assessmentRoutes = require("../modules/assessments/assessments.routes");
const dashboardRoutes = require("../modules/dashboard/dashboard.routes");
const courseRoutes = require("../modules/courses/courses.routes");
const workoutRoutes = require("../modules/workouts/workouts.routes");
const dietRoutes = require("../modules/diets/diets.routes");
const scheduleRoutes = require("../modules/schedules/schedules.routes");
const favoriteRoutes = require("../modules/favorites/favorites.routes");
const feedbackRoutes = require("../modules/feedback/feedback.routes");
const vipRoutes = require("../modules/vip/vip.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/assessments", assessmentRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/courses", courseRoutes);
router.use("/workouts", workoutRoutes);
router.use("/diets", dietRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/favorites", favoriteRoutes);
router.use("/feedback", feedbackRoutes);
router.use("/vip", vipRoutes);

module.exports = router;
