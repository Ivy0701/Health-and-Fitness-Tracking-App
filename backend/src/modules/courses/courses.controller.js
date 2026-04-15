const asyncHandler = require("../../utils/asyncHandler");
const Course = require("../../models/Course");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");

function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeWeeklySlots(raw) {
  if (!Array.isArray(raw)) return [];
  const timeOk = (t) => {
    const s = String(t || "").trim().slice(0, 5);
    return /^\d{1,2}:\d{2}$/.test(s);
  };
  return raw
    .filter((s) => s && Number.isFinite(Number(s.weekday)) && timeOk(s.startTime))
    .map((s) => {
      const [h, m] = String(s.startTime).trim().slice(0, 5).split(":");
      const hh = String(Math.min(23, Math.max(0, Number(h)))).padStart(2, "0");
      const mm = String(Math.min(59, Math.max(0, Number(m || 0)))).padStart(2, "0");
      return {
        weekday: Math.max(0, Math.min(6, Number(s.weekday))),
        startTime: `${hh}:${mm}`,
      };
    });
}

const list = asyncHandler(async (req, res) => {
  const rows = await Course.find().sort({ createdAt: -1 });
  res.json(rows);
});

const create = asyncHandler(async (req, res) => {
  const { title, description, difficulty, duration, duration_days, category, isFeatured, isPremium, weeklySlots } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });
  const slots = normalizeWeeklySlots(weeklySlots);
  const row = await Course.create({
    title,
    description,
    difficulty,
    duration,
    duration_days: Number(duration_days) > 0 ? Number(duration_days) : 7,
    category,
    isFeatured,
    isPremium,
    weeklySlots: slots,
  });
  res.status(201).json(row);
});

const detail = asyncHandler(async (req, res) => {
  const row = await Course.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Course not found" });
  res.json(row);
});

const listEnrolled = asyncHandler(async (req, res) => {
  const rows = await EnrolledCourse.find({
    user_id: req.user.id,
    status: { $in: ["active", "completed"] },
  })
    .populate("course_id")
    .sort({ enrolled_at: -1 });
  res.json(rows);
});

const enroll = asyncHandler(async (req, res) => {
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ message: "course_id is required" });
  const course = await Course.findById(course_id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const today = toDateKey(new Date());
  const existing = await EnrolledCourse.findOne({ user_id: req.user.id, course_id });
  if (existing) {
    if (existing.status === "active") {
      return res.status(409).json({
        message: "You are already enrolled in this course.",
        status: existing.status,
      });
    }

    // Allow re-enroll when previous enrollment is cancelled or completed.
    if (existing.status === "completed" || existing.status === "cancelled") {
      existing.status = "active";
      existing.is_completed = false;
      existing.start_date = today;
      existing.current_day = 1;
      await existing.save();
      await CourseDailyProgress.deleteMany({ user_id: req.user.id, enrolled_course_id: existing._id });
      return res.json(existing);
    }
  }

  const row = await EnrolledCourse.create({
    user_id: req.user.id,
    course_id,
    enrolled_at: new Date(),
    start_date: today,
    current_day: 1,
    is_completed: false,
    status: "active",
  });
  res.status(201).json(row);
});

const drop = asyncHandler(async (req, res) => {
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ message: "course_id is required" });
  const row = await EnrolledCourse.findOne({ user_id: req.user.id, course_id });
  if (!row) return res.json({ ok: true, changed: false });
  if (row.status !== "cancelled") {
    row.status = "cancelled";
    row.is_completed = false;
    row.current_day = 1;
    await row.save();
  }
  res.json({ ok: true, changed: true });
});

const updateProgress = asyncHandler(async (req, res) => {
  const { enrolled_course_id, date, is_completed } = req.body;
  if (!enrolled_course_id || typeof is_completed !== "boolean") {
    return res.status(400).json({ message: "enrolled_course_id and is_completed are required" });
  }
  const enrolled = await EnrolledCourse.findOne({ _id: enrolled_course_id, user_id: req.user.id });
  if (!enrolled) return res.status(404).json({ message: "Enrolled course not found" });

  const targetDate = date || toDateKey(new Date());
  const row = await CourseDailyProgress.findOneAndUpdate(
    { user_id: req.user.id, enrolled_course_id, date: targetDate },
    { $set: { is_completed, completed_at: is_completed ? new Date() : null } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const enrolledWithCourse = await EnrolledCourse.findById(enrolled._id).populate("course_id", "duration_days");
  const targetDays = Number(enrolledWithCourse?.course_id?.duration_days || 7);
  const doneCount = await CourseDailyProgress.countDocuments({ enrolled_course_id: enrolled._id, is_completed: true });
  const finished = doneCount >= targetDays;

  await EnrolledCourse.findByIdAndUpdate(enrolled._id, {
    $set: {
      current_day: Math.min(targetDays, doneCount + 1),
      is_completed: finished,
      status: finished ? "completed" : "active",
    },
  });

  res.json(row);
});

module.exports = { list, create, detail, listEnrolled, enroll, drop, updateProgress };

