const express = require("express");
const authRoutes = require("../modules/auth/auth.routes");
const userRoutes = require("../modules/users/users.routes");
const healthRoutes = require("../modules/health/health.routes");
const assessmentRoutes = require("../modules/assessments/assessments.routes");
const dashboardRoutes = require("../modules/dashboard/dashboard.routes");
const coursesRoutes = require("../modules/courses/courses.routes");
const workoutsRoutes = require("../modules/workouts/workouts.routes");
const dietsRoutes = require("../modules/diets/diets.routes");
const schedulesRoutes = require("../modules/schedules/schedules.routes");
const favoritesRoutes = require("../modules/favorites/favorites.routes");
const forumRoutes = require("../modules/forum/forum.routes");
const vipRoutes = require("../modules/vip/vip.routes");
const notificationsRoutes = require("../modules/notifications/notifications.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/user", userRoutes);
router.use("/health", healthRoutes);
router.use("/assessments", assessmentRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/courses", coursesRoutes);
router.use("/workouts", workoutsRoutes);
router.use("/workout", workoutsRoutes);
router.use("/diets", dietsRoutes);
router.use("/schedules", schedulesRoutes);
router.use("/favorites", favoritesRoutes);
router.use("/forum", forumRoutes);
router.use("/vip", vipRoutes);
router.use("/notifications", notificationsRoutes);

module.exports = router;
