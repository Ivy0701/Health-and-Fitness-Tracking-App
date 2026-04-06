import api from "./api";

export async function fetchCourses() {
  const { data } = await api.get("/courses");
  return data.map((course) => ({
    ...course,
    isPremium: Boolean(course.isPremium),
    duration_days: Number(course.duration_days || 7),
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

export async function fetchEnrolledCourses() {
  const { data } = await api.get("/courses/enrolled");
  return data;
}

export async function dropCourseEnrollment(courseId) {
  const { data } = await api.post("/courses/drop", { course_id: courseId });
  return data;
}
