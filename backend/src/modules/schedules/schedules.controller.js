const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const ScheduleItem = require("../../models/ScheduleItem");
const Diet = require("../../models/Diet");
const Course = require("../../models/Course");
const User = require("../../models/User");

async function isVipUser(userId) {
  const u = await User.findById(userId).select("vip_status isVip").lean();
  return Boolean(u?.vip_status ?? u?.isVip);
}

async function assertNotJoiningPremiumCourse({ userId, courseIds }) {
  if (!courseIds?.length) return;
  const vip = await isVipUser(userId);
  if (vip) return;

  const rows = await Course.find({ _id: { $in: courseIds } }).select("title isPremium").lean();
  const premiumTitles = rows.filter((c) => c.isPremium).map((c) => c.title);
  if (premiumTitles.length) {
    return { ok: false, premiumTitles };
  }
  return { ok: true };
}

const DIET_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundOne(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function formatDateKeyFromDate(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatTimeKeyFromDate(value) {
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "12:00";
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function formatMealTypeLabel(mealType) {
  const key = String(mealType || "").toLowerCase();
  if (key === "breakfast") return "Breakfast";
  if (key === "lunch") return "Lunch";
  if (key === "dinner") return "Dinner";
  return "Snack";
}

function formatKcal(value) {
  const n = roundOne(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

async function reconcileDietScheduleForUser(userId) {
  const dietRows = await Diet.find({ userId })
    .select("date mealType calories recordedAt createdAt")
    .sort({ recordedAt: 1, createdAt: 1 })
    .lean();

  const groupMap = new Map();
  for (const row of dietRows) {
    const meal = String(row.mealType || "").toLowerCase();
    if (!DIET_MEAL_TYPES.has(meal)) continue;
    const dateKey = formatDateKeyFromDate(row.date);
    if (!dateKey) continue;
    const key = `${dateKey}|${meal}`;
    const current = groupMap.get(key) || {
      date: dateKey,
      meal,
      totalCalories: 0,
      firstTimestamp: null,
    };
    current.totalCalories = roundOne(current.totalCalories + toNumber(row.calories));
    const ts = row.recordedAt || row.createdAt || null;
    if (ts) {
      const ms = new Date(ts).getTime();
      const curMs = current.firstTimestamp ? new Date(current.firstTimestamp).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isFinite(ms) && ms < curMs) current.firstTimestamp = ts;
    }
    groupMap.set(key, current);
  }

  const keepIds = [];
  for (const group of groupMap.values()) {
    const mealLabel = formatMealTypeLabel(group.meal);
    const ts = group.firstTimestamp || new Date(`${group.date}T12:00:00`);
    const payload = {
      userId,
      itemType: "diet",
      meal: group.meal,
      totalCalories: group.totalCalories,
      timestamp: ts,
      title: "Diet",
      subtitle: `${mealLabel} - ${formatKcal(group.totalCalories)} kcal`,
      date: group.date,
      time: formatTimeKeyFromDate(ts),
      note: "",
      durationMinutes: 15,
      overlapAccepted: true,
      courseId: null,
      linkedDietId: null,
    };
    const saved = await ScheduleItem.findOneAndUpdate(
      { userId, itemType: "diet", date: group.date, meal: group.meal },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    keepIds.push(saved._id);
  }

  const cleanupFilter = { userId, itemType: "diet" };
  if (keepIds.length) cleanupFilter._id = { $nin: keepIds };
  await ScheduleItem.deleteMany(cleanupFilter);
}

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await reconcileDietScheduleForUser(userId);
  const rows = await ScheduleItem.find({ userId })
    .populate("courseId", "isPremium")
    .sort({ date: 1, time: 1, createdAt: -1 })
    .lean();
  const out = rows.map((row) => {
    const pop = row.courseId;
    const courseIsPremium = Boolean(pop && typeof pop === "object" && pop.isPremium);
    const courseId =
      pop && typeof pop === "object" && pop._id != null
        ? String(pop._id)
        : row.courseId != null
          ? String(row.courseId)
          : null;
    return { ...row, courseId, courseIsPremium };
  });
  res.json(out);
});

const create = asyncHandler(async (req, res) => {
  const { userId, title, date, time, note, courseId, durationMinutes, overlapAccepted } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!title || !date || !time) return res.status(400).json({ message: "title, date and time are required" });

  if (courseId && mongoose.isValidObjectId(courseId)) {
    const r = await assertNotJoiningPremiumCourse({ userId: uid, courseIds: [courseId] });
    if (r && r.ok === false) {
      return res.status(403).json({
        message: "This content is for VIP members only",
        premiumCourses: r.premiumTitles,
      });
    }
  }

  const row = await ScheduleItem.create({
    userId: uid,
    title,
    date,
    time,
    note,
    courseId: courseId || null,
    durationMinutes: durationMinutes != null ? Math.max(1, Number(durationMinutes)) : 60,
    overlapAccepted: Boolean(overlapAccepted),
  });
  res.status(201).json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ScheduleItem.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  await row.deleteOne();
  res.json({ success: true });
});

const batchCreate = asyncHandler(async (req, res) => {
  const { userId, items } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }
  const LIMIT = 400;
  const slice = items.slice(0, LIMIT);

  const courseIds = Array.from(
    new Set(
      slice
        .map((x) => x?.courseId)
        .filter((id) => id && mongoose.isValidObjectId(id))
        .map(String)
    )
  );
  const r = await assertNotJoiningPremiumCourse({ userId: uid, courseIds });
  if (r && r.ok === false) {
    return res.status(403).json({
      message: "This content is for VIP members only",
      premiumCourses: r.premiumTitles,
    });
  }

  const docs = [];
  for (const it of slice) {
    if (!it.title || !it.date || !it.time) {
      return res.status(400).json({ message: "Each item needs title, date, and time" });
    }
    docs.push({
      userId: uid,
      title: String(it.title).trim(),
      date: String(it.date).trim(),
      time: String(it.time).trim().slice(0, 5),
      note: it.note != null ? String(it.note) : "",
      courseId: it.courseId || null,
      durationMinutes: it.durationMinutes != null ? Math.max(1, Number(it.durationMinutes)) : 60,
      overlapAccepted: Boolean(it.overlapAccepted),
    });
  }
  const created = await ScheduleItem.insertMany(docs);
  res.status(201).json(created);
});

const removeByCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  if (!mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ message: "Invalid course id" });
  }
  const r = await ScheduleItem.deleteMany({ userId: req.user.id, courseId });
  res.json({ deleted: r.deletedCount });
});

module.exports = { list, create, remove, batchCreate, removeByCourse };

