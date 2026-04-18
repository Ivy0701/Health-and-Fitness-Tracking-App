const mongoose = require("mongoose");
const ScheduleItem = require("../models/ScheduleItem");
const ScheduleSkip = require("../models/ScheduleSkip");
const CourseDailyProgress = require("../models/CourseDailyProgress");
const Workout = require("../models/Workout");
const Course = require("../models/Course");

/**
 * Remove all user data tied to a course enrollment (schedule, skips, daily progress, course-linked workouts).
 * Schedule rows: match by courseId and/or enrolledCourseId so all creation paths stay consistent.
 */
async function cascadeDeleteCoursePlanData({ userId, courseId, enrolledCourseId }) {
  const raw = String(courseId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    return {
      ok: false,
      error: "invalid_course_id",
      deletedScheduleItems: 0,
      deletedSkips: 0,
      deletedProgressRows: 0,
      deletedWorkouts: 0,
    };
  }
  const courseOid = new mongoose.Types.ObjectId(raw);
  const enrollmentOid =
    enrolledCourseId && mongoose.Types.ObjectId.isValid(String(enrolledCourseId))
      ? new mongoose.Types.ObjectId(String(enrolledCourseId))
      : null;

  const courseLean = await Course.findById(courseOid).select("title").lean();
  const courseTitle = String(courseLean?.title || "").trim();

  const scheduleOr = [{ courseId: courseOid }];
  if (enrollmentOid) scheduleOr.push({ enrolledCourseId: enrollmentOid });

  const workoutOr = [{ courseId: courseOid }];
  if (courseTitle) {
    workoutOr.push({ note: "Completed from course task", type: courseTitle });
  }

  const [scheduleRes, skipRes, progressRes, workoutRes] = await Promise.all([
    ScheduleItem.deleteMany({ userId, $or: scheduleOr }),
    ScheduleSkip.deleteMany({ userId, courseId: courseOid }),
    enrollmentOid
      ? CourseDailyProgress.deleteMany({ user_id: userId, enrolled_course_id: enrollmentOid })
      : Promise.resolve({ deletedCount: 0 }),
    Workout.deleteMany({ userId, $or: workoutOr }),
  ]);

  const out = {
    ok: true,
    courseId: String(courseOid),
    enrolledCourseId: enrollmentOid ? String(enrollmentOid) : "",
    deletedScheduleItems: scheduleRes?.deletedCount ?? 0,
    deletedSkips: skipRes?.deletedCount ?? 0,
    deletedProgressRows: progressRes?.deletedCount ?? 0,
    deletedWorkouts: workoutRes?.deletedCount ?? 0,
  };

  if (process.env.DEBUG_COURSE_DROP === "1") {
    // eslint-disable-next-line no-console
    console.info("[course-drop:cascade]", out);
  }

  return out;
}

module.exports = { cascadeDeleteCoursePlanData };
