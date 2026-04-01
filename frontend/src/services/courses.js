import api from "./api";

export async function fetchCourses() {
  const { data } = await api.get("/courses");
  return data.map((course) => ({
    ...course,
    isPremium: Boolean(course.isPremium),
  }));
}

export async function createCourse(payload) {
  const { data } = await api.post("/courses", {
    ...payload,
    isPremium: Boolean(payload.isPremium),
  });
  return data;
}
