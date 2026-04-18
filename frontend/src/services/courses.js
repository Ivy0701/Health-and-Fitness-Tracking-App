import api from "./api";
import { pickSuggestedDailyTimeHHmm } from "../utils/courseSuggestedTime";

function shouldHideInvalidCourse(course) {
  const title = String(course?.title || course?.name || "").trim().toLowerCase();
  const minutesPerDay = Number(course?.duration || course?.minutesPerDay || 0);
  return title === "run" && minutesPerDay <= 1;
}

export async function fetchCourses() {
  const { data } = await api.get("/courses");
  return data
    .filter((course) => !shouldHideInvalidCourse(course))
    .map((course) => ({
      ...course,
      suggestedDailyTime: pickSuggestedDailyTimeHHmm(course),
      id: String(course._id || course.id || ""),
      title: String(course.title || "").trim(),
      category: String(course.category || "General").trim() || "General",
      difficulty: Number(course.difficulty_value || 1),
      durationDays: Number(course.duration_days || 7),
      minutesPerDay: Number(course.duration || 30),
      description: String(course.description || "").trim(),
      targetUsers: String(course.target_users || course.difficulty || "beginner").trim(),
      isVipOnly: Boolean(course.isPremium),
      exercisesPreview: Array.isArray(course.exercises_preview) ? course.exercises_preview.filter(Boolean) : [],
      isFeatured: Boolean(course.isFeatured),
      rawDifficulty: course.difficulty,
    }));
}

export async function createCourse(payload) {
  const { data } = await api.post("/courses", {
    ...payload,
    isPremium: Boolean(payload.isPremium),
  });
  return data;
}

export async function enrollCourse(courseId) {
  const { data } = await api.post("/courses/enroll", { course_id: courseId });
  return data;
}

/** Enroll + place schedule rows with server-side conflict resolution (single outcome). */
export async function enrollCourseAndSchedule(courseId) {
  const { data } = await api.post("/courses/enroll-and-schedule", { course_id: courseId });
  return data;
}

export async function fetchEnrolledCourses() {
  const { data } = await api.get("/courses/enrolled");
  return data;
}

export async function dropCourseEnrollment(courseId) {
  const { data } = await api.post("/courses/drop", { course_id: courseId });
  return data;
}
