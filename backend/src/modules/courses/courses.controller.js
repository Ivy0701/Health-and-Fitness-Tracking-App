const asyncHandler = require("../../utils/asyncHandler");
const Course = require("../../models/Course");

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
  const { title, description, difficulty, duration, category, isFeatured, isPremium, weeklySlots } = req.body;
  if (!title) return res.status(400).json({ message: "title is required" });
  const slots = normalizeWeeklySlots(weeklySlots);
  const row = await Course.create({
    title,
    description,
    difficulty,
    duration,
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

module.exports = { list, create, detail };

