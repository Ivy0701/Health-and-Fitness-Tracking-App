const mongoose = require("mongoose");
const asyncHandler = require("../../utils/asyncHandler");
const scheduleTime = require("../../utils/scheduleTime");
const ScheduleItem = require("../../models/ScheduleItem");
const ScheduleSkip = require("../../models/ScheduleSkip");
const Course = require("../../models/Course");
const User = require("../../models/User");
const WorkoutDailyStatus = require("../../models/WorkoutDailyStatus");
const WorkoutPlan = require("../../models/WorkoutPlan");
const EnrolledCourse = require("../../models/EnrolledCourse");
const CourseDailyProgress = require("../../models/CourseDailyProgress");
const { buildCourseExercises, summarizeCourseExercises } = require("../../utils/courseSession");
const { applyMetBurnsToExercises } = require("../../utils/workoutCaloriesBurn");
const { runDietScheduleHygieneForUser } = require("../../utils/dietScheduleDataHygiene");

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

function normalizeItemType(value) {
  const key = String(value || "manual").trim().toLowerCase();
  if (["workout", "exercise"].includes(key)) return "workout";
  if (["course", "course_session"].includes(key)) return "course";
  if (["diet"].includes(key)) return "diet";
  if (["reminder", "personal"].includes(key)) return "reminder";
  return "manual";
}

function isPlanBackedItem(row) {
  const itemType = String(row?.itemType || "").toLowerCase();
  return Boolean(row?.planId) || Boolean(row?.courseId) || itemType === "course" || itemType === "course_session";
}

const DIET_PLAN_APPLY_SOURCE = "diet_plan_apply";
const DIET_LOG_SYNC_SOURCE = "diet_log_sync";

function isDietPlanApplyRow(row, dietPlanId) {
  const pid = String(dietPlanId || "").trim();
  if (!pid) return false;
  return (
    String(row?.itemType || "").toLowerCase() === "diet" &&
    String(row?.scheduleSource || "") === DIET_PLAN_APPLY_SOURCE &&
    String(row?.dietPlanId || "").trim() === pid
  );
}

/** True when this plan has exactly one row per breakfast/lunch/dinner/snack for the day. */
function isCompleteDietPlanApplyGroup(rows, dietPlanId) {
  const rel = (rows || []).filter((r) => isDietPlanApplyRow(r, dietPlanId));
  if (rel.length !== 4) return false;
  const meals = rel.map((r) => String(r?.meal || "").toLowerCase());
  if (new Set(meals).size !== 4) return false;
  return scheduleTime.DIET_PLAN_MEAL_ORDER.every((m) => meals.includes(m));
}

async function repairDietOverlapsForUser(userId, dayRows) {
  if (!Array.isArray(dayRows) || !dayRows.length) return;
  const dateKey = String(dayRows[0]?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

  for (let pass = 0; pass < 16; pass += 1) {
    const diets = dayRows.filter((r) => String(r?.itemType || "").toLowerCase() === "diet");
    let changed = false;
    for (const drow of diets) {
      if (!drow?._id) continue;
      if (!scheduleTime.hasScheduleConflict(drow, dayRows, String(drow._id))) continue;
      const newTime = scheduleTime.resolveDietRowOverlap(dateKey, drow, dayRows);
      if (newTime && newTime !== String(drow.time || "").slice(0, 5)) {
        await ScheduleItem.updateOne({ _id: drow._id, userId }, { $set: { time: newTime, overlapAccepted: false } });
        drow.time = newTime;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

async function removeSingleItemAndLinkedState({ row, userId }) {
  await row.deleteOne();

  if (row.planId) {
    await WorkoutDailyStatus.deleteMany({
      user_id: userId,
      workout_plan_id: row.planId,
      date: row.date,
      is_completed: { $ne: true },
    });
    await ScheduleSkip.updateOne(
      { userId, date: row.date, planId: row.planId },
      { $setOnInsert: { userId, date: row.date, planId: row.planId } },
      { upsert: true }
    );
  }

  if (row.courseId) {
    const activeEnrollment = await EnrolledCourse.findOne({
      user_id: userId,
      course_id: row.courseId,
      status: "active",
    }).select("_id");
    if (activeEnrollment?._id) {
      await CourseDailyProgress.deleteMany({
        user_id: userId,
        enrolled_course_id: activeEnrollment._id,
        date: row.date,
        is_completed: { $ne: true },
      });
    }
    await ScheduleSkip.updateOne(
      { userId, date: row.date, courseId: row.courseId },
      { $setOnInsert: { userId, date: row.date, courseId: row.courseId } },
      { upsert: true }
    );
  }
}

function parseDateKeyForCourseBurn(dateKey) {
  const s = String(dateKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffInDaysInclusiveForCourseBurn(startDateKey, targetDateKey) {
  const start = parseDateKeyForCourseBurn(startDateKey);
  const target = parseDateKeyForCourseBurn(targetDateKey);
  if (!start || !target) return 1;
  const diff = Math.floor((target - start) / 86400000);
  return diff + 1;
}

/** Aligns with getTodayPlan course_tasks: planned burn from synthesized or saved exercises + MET table. */
async function attachPlannedBurnKcalForCourseRows(userId, rows) {
  const courseRows = rows.filter((r) => {
    const t = String(r?.itemType || "").toLowerCase();
    return (t === "course" || t === "course_session") && r.courseId && mongoose.isValidObjectId(String(r.courseId));
  });
  if (!courseRows.length) return;

  const user = await User.findById(userId).select("weight").lean();
  const weightKg = user?.weight;

  const oidList = [
    ...new Set(courseRows.map((r) => String(r.courseId)).filter((id) => mongoose.isValidObjectId(id))),
  ].map((id) => new mongoose.Types.ObjectId(id));
  if (!oidList.length) return;

  const enrollments = await EnrolledCourse.find({
    user_id: userId,
    status: "active",
    course_id: { $in: oidList },
  })
    .populate("course_id", "title duration category duration_days exercises_preview")
    .lean();
  if (!enrollments.length) return;

  const enrolledIds = enrollments.map((e) => e._id);
  const dateSet = [
    ...new Set(courseRows.map((r) => String(r.date || "").trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))),
  ];
  const progressDocs = await CourseDailyProgress.find({
    user_id: userId,
    enrolled_course_id: { $in: enrolledIds },
    date: { $in: dateSet },
  }).lean();
  const progressMap = new Map(progressDocs.map((p) => [`${p.enrolled_course_id}:${p.date}`, p]));
  const enrollmentByCourseId = new Map(enrollments.map((e) => [String(e.course_id?._id || e.course_id || ""), e]));

  for (const row of rows) {
    const t = String(row?.itemType || "").toLowerCase();
    if (t !== "course" && t !== "course_session") continue;
    const cid = String(row.courseId || "");
    if (!mongoose.isValidObjectId(cid)) continue;
    const enr = enrollmentByCourseId.get(cid);
    if (!enr) continue;
    const dateKey = String(row.date || "").trim();
    const progress = progressMap.get(`${enr._id}:${dateKey}`);
    let exercises = Array.isArray(progress?.exercises) ? progress.exercises : [];
    const courseMeta = enr.course_id && typeof enr.course_id === "object" ? enr.course_id : {};
    const day = diffInDaysInclusiveForCourseBurn(enr.start_date, dateKey);
    if (!exercises.length) {
      exercises = buildCourseExercises(
        {
          title: String(courseMeta.title || row.title || ""),
          duration: Number(courseMeta.duration || row.durationMinutes || 30),
          category: String(courseMeta.category || ""),
        },
        day,
        weightKg
      );
    }
    const courseCategory = String(courseMeta.category || "");
    const withBurn = applyMetBurnsToExercises(exercises, courseCategory, weightKg);
    const summary = summarizeCourseExercises(withBurn);
    const burn = Number(summary?.estimated_burn || 0);
    if (Number.isFinite(burn) && burn > 0) row.plannedBurnKcal = burn;

    let names = (withBurn || []).map((ex) => String(ex?.title || "").trim()).filter(Boolean);
    if (!names.length && Array.isArray(courseMeta.exercises_preview) && courseMeta.exercises_preview.length) {
      names = courseMeta.exercises_preview.map((x) => String(x || "").trim()).filter(Boolean);
    }
    row.courseExerciseNames = names;
  }
}

const list = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  if (String(userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  /** Safe DB hygiene: duplicate diet_log_sync per day+meal, fix wrong durationMinutes (no localStorage involved). */
  try {
    const h = await runDietScheduleHygieneForUser(req.user.id);
    if (String(process.env.DEBUG_SCHEDULE_HYGIENE || "").trim() === "1" && (h.deletedRows > 0 || h.durationNormalized > 0)) {
      // eslint-disable-next-line no-console
      console.log("[schedule list hygiene]", JSON.stringify(h));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[schedule list hygiene] skipped:", err?.message || err);
  }
  let rows = await ScheduleItem.find({ userId })
    .populate("courseId", "isPremium")
    .sort({ date: 1, time: 1, createdAt: -1 })
    .lean();

  const byDate = new Map();
  for (const r of rows) {
    const d = String(r?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }
  for (const [, dayRows] of byDate) {
    await repairDietOverlapsForUser(req.user.id, dayRows);
  }

  rows = await ScheduleItem.find({ userId })
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
  await attachPlannedBurnKcalForCourseRows(req.user.id, out);
  res.json(out);
});

const applyDietPlan = asyncHandler(async (req, res) => {
  const uid = req.body.userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const dateKey = String(req.body.date || "").trim();
  const dietPlanId = String(req.body.dietPlanId || "").trim();
  const planName = String(req.body.planName || "").trim();
  const planType = String(req.body.planType || "").trim();
  const meals = Array.isArray(req.body.meals) ? req.body.meals : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !dietPlanId || !planName) {
    return res.status(400).json({ message: "date, dietPlanId and planName are required" });
  }

  const mealSpecs = scheduleTime.DIET_PLAN_MEAL_ORDER.map((key) => {
    const m = meals.find((x) => String(x?.mealType || "").toLowerCase() === key) || {};
    const label = key.charAt(0).toUpperCase() + key.slice(1);
    const kcal = Math.max(0, Number(m.calories) || 0);
    return {
      mealType: key,
      title: `${label} · ${planName}`,
      subtitle: `${planName} · ${label} · ${kcal ? `${kcal} kcal` : "Planned"}`,
      totalCalories: kcal,
      durationMinutes: 30,
    };
  });

  const existing = await ScheduleItem.find({ userId: uid, date: dateKey }).lean();

  if (isCompleteDietPlanApplyGroup(existing, dietPlanId)) {
    const items = existing.filter((r) => isDietPlanApplyRow(r, dietPlanId));
    return res.status(200).json({ alreadyScheduled: true, items });
  }

  const baseline = existing.filter((r) => !isDietPlanApplyRow(r, dietPlanId));

  const sim = scheduleTime.simulateDietPlanApply(dateKey, baseline, mealSpecs);
  if (!sim.ok) {
    return res.status(400).json({ message: sim.message || scheduleTime.DIET_PLAN_APPLY_FAIL });
  }

  await ScheduleItem.deleteMany({
    userId: uid,
    date: dateKey,
    itemType: "diet",
    scheduleSource: DIET_PLAN_APPLY_SOURCE,
    dietPlanId,
  });

  const docs = sim.placements.map((p) => ({
    userId: uid,
    itemType: "diet",
    title: p.title,
    subtitle: p.subtitle,
    meal: p.meal,
    planName,
    dietPlanId,
    scheduleSource: DIET_PLAN_APPLY_SOURCE,
    totalCalories: p.totalCalories,
    date: dateKey,
    time: p.time,
    durationMinutes: p.durationMinutes,
    note: "",
    courseId: null,
    planId: null,
    linkedDietId: null,
    overlapAccepted: false,
    is_completed: false,
    completed_at: null,
    category: planType || "",
  }));

  const created = await ScheduleItem.insertMany(docs);
  res.status(201).json(created);
});

const removeDietPlanApply = asyncHandler(async (req, res) => {
  const dateKey = String(req.query.date || "").trim();
  const dietPlanId = String(req.query.dietPlanId || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return res.status(400).json({ message: "date (YYYY-MM-DD) is required" });
  }
  if (!dietPlanId) {
    return res.status(400).json({ message: "dietPlanId is required to remove a meal plan from the schedule" });
  }
  const r = await ScheduleItem.deleteMany({
    userId: req.user.id,
    date: dateKey,
    itemType: "diet",
    scheduleSource: DIET_PLAN_APPLY_SOURCE,
    dietPlanId,
  });
  res.json({ deleted: r.deletedCount || 0 });
});

const create = asyncHandler(async (req, res) => {
  const {
    userId,
    title,
    planName,
    taskName,
    date,
    time,
    note,
    courseId,
    planId,
    durationMinutes,
    itemType,
    subtitle,
    category,
    meal,
    mealType,
    totalCalories,
    linkedDietId,
    dietPlanId: bodyDietPlanId,
    scheduleSource: bodyScheduleSource,
  } = req.body;
  const uid = userId || req.user.id;
  if (String(uid) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const resolvedTitle = String(title || planName || taskName || "").trim();
  const dateKey = String(date || "").trim();
  if (!resolvedTitle || !dateKey) return res.status(400).json({ message: "title and date are required" });

  if (courseId && mongoose.isValidObjectId(courseId)) {
    const r = await assertNotJoiningPremiumCourse({ userId: uid, courseIds: [courseId] });
    if (r && r.ok === false) {
      return res.status(403).json({
        message: "This content is for VIP members only",
        premiumCourses: r.premiumTitles,
      });
    }
  }

  const nType = normalizeItemType(itemType);
  const mealKey = String(meal || mealType || "").trim().toLowerCase();
  const kcal = totalCalories != null ? Math.max(0, Number(totalCalories)) : 0;
  const durFromBody = durationMinutes != null ? Math.max(1, Number(durationMinutes)) : null;
  const duration =
    durFromBody && Number.isFinite(durFromBody)
      ? durFromBody
      : scheduleTime.defaultDurationMinutes(nType, { durationMinutes: durFromBody, itemType: nType });

  const existing = await ScheduleItem.find({ userId: uid, date: dateKey }).lean();
  const hadExplicitTime = String(time || "").trim().length > 0;
  let resolvedTime = String(time || "").trim().slice(0, 5);
  if (!resolvedTime) {
    resolvedTime = scheduleTime.findNextAvailableTimeSlot(dateKey, duration, existing, {
      itemType: nType,
      mealType: mealKey || (nType === "diet" ? "lunch" : undefined),
    });
    if (!resolvedTime) {
      return res.status(400).json({ message: "No available time slots were found for this day." });
    }
  }

  const candidate = {
    date: dateKey,
    time: resolvedTime,
    durationMinutes: duration,
    itemType: nType,
    title: resolvedTitle,
  };
  if (scheduleTime.hasScheduleConflict(candidate, existing, null)) {
    return res.status(409).json({
      message: scheduleTime.SCHEDULE_CONFLICT_MESSAGE,
      code: "schedule_conflict",
    });
  }

  const row = await ScheduleItem.create({
    userId: uid,
    itemType: nType,
    category: category != null ? String(category).trim() : "",
    meal: nType === "diet" ? mealKey || "lunch" : meal != null ? String(meal).trim().toLowerCase() : "",
    totalCalories: Number.isFinite(kcal) ? kcal : 0,
    title: resolvedTitle,
    subtitle: subtitle != null ? String(subtitle).trim() : "",
    planId: planId || null,
    date: dateKey,
    time: resolvedTime,
    note: note != null ? String(note) : "",
    courseId: courseId || null,
    linkedDietId: mongoose.isValidObjectId(linkedDietId) ? linkedDietId : null,
    durationMinutes: duration,
    overlapAccepted: false,
    planName: planName != null ? String(planName).trim() : "",
    dietPlanId: bodyDietPlanId != null ? String(bodyDietPlanId).trim() : "",
    scheduleSource:
      bodyScheduleSource != null
        ? String(bodyScheduleSource).trim()
        : nType === "diet"
          ? "manual"
          : "",
  });
  if (row.planId || row.courseId) {
    const or = [];
    if (row.planId) or.push({ planId: row.planId });
    if (row.courseId) or.push({ courseId: row.courseId });
    await ScheduleSkip.deleteMany({
      userId: uid,
      date: row.date,
      ...(or.length ? { $or: or } : {}),
    });
  }
  const payload = row.toObject ? row.toObject() : row;
  if (!hadExplicitTime) {
    payload.scheduleNotice = `No time selected. Scheduled automatically at ${resolvedTime}.`;
  }
  res.status(201).json(payload);
});

const update = asyncHandler(async (req, res) => {
  const qid = mongoose.Types.ObjectId.isValid(String(req.params.id || "").trim())
    ? new mongoose.Types.ObjectId(String(req.params.id).trim())
    : null;
  if (!qid) return res.status(400).json({ message: "Invalid schedule item id" });

  const logPutEntry =
    String(process.env.DEBUG_SCHEDULE_PUT_ENTRY || "").trim() === "1" ||
    String(process.env.DEBUG_SCHEDULE_PUT_TRACE || "").trim() === "1" ||
    String(process.env.DEBUG_SCHEDULE_CONFLICT || "").trim() === "1";
  if (logPutEntry) {
    const probe = await ScheduleItem.findOne({ _id: qid, userId: req.user.id })
      .select("_id itemType scheduleSource meal date time durationMinutes")
      .lean();
    // eslint-disable-next-line no-console
    console.log(
      "[schedule PUT entry]",
      JSON.stringify({
        paramsId: String(qid),
        userId: String(req.user.id),
        body: req.body,
        findOneExists: Boolean(probe),
        probe: probe
          ? {
              _id: String(probe._id),
              itemType: probe.itemType,
              scheduleSource: probe.scheduleSource,
              meal: probe.meal,
              date: probe.date,
              time: probe.time,
              durationMinutes: probe.durationMinutes,
            }
          : null,
      })
    );
  }

  let row = await ScheduleItem.findById(qid);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });

  const logPutTrace =
    String(process.env.DEBUG_SCHEDULE_PUT_TRACE || "").trim() === "1" ||
    String(process.env.DEBUG_SCHEDULE_CONFLICT || "").trim() === "1";

  const patch = {};
  if (req.body.title != null) patch.title = String(req.body.title).trim();
  if (req.body.note != null) patch.note = String(req.body.note);
  if (req.body.date != null) patch.date = String(req.body.date).trim();
  if (req.body.time != null) patch.time = String(req.body.time).trim().slice(0, 5);
  if (req.body.durationMinutes != null) patch.durationMinutes = Math.max(1, Number(req.body.durationMinutes));
  if (req.body.itemType != null) patch.itemType = normalizeItemType(req.body.itemType);
  if (req.body.category != null) patch.category = String(req.body.category).trim();
  if (req.body.subtitle != null) patch.subtitle = String(req.body.subtitle).trim();
  if (req.body.meal != null) patch.meal = String(req.body.meal).trim().toLowerCase();
  if (req.body.totalCalories != null) patch.totalCalories = Math.max(0, Number(req.body.totalCalories));

  Object.assign(row, patch);
  const dateKey = String(row.date || "").trim();
  const nType = normalizeItemType(row.itemType);
  const isDietLogSyncRow =
    nType === "diet" && String(row.scheduleSource || "").trim() === DIET_LOG_SYNC_SOURCE;

  if (logPutTrace) {
    // eslint-disable-next-line no-console
    console.log(
      "[schedule PUT trace]",
      JSON.stringify({
        phase: "before hygiene",
        userId: String(req.user.id),
        paramsId: String(qid),
        exists: true,
        keepScheduleItemIdPassedToHygiene: isDietLogSyncRow ? String(qid) : null,
        isDietLogSyncRow,
        itemType: row.itemType,
        scheduleSource: String(row.scheduleSource || ""),
        meal: String(row.meal || ""),
        dateKey,
      })
    );
  }

  /**
   * Align with GET /schedules list: normalize diet_log_sync durations + dedupe duplicates
   * before conflict reads `existing`. When editing diet_log_sync, keep this row id so it is not deleted.
   */
  try {
    await runDietScheduleHygieneForUser(req.user.id, isDietLogSyncRow ? { keepScheduleItemId: qid } : {});
    const rel = await ScheduleItem.findById(qid);
    if (logPutTrace) {
      // eslint-disable-next-line no-console
      console.log(
        "[schedule PUT trace]",
        JSON.stringify({
          phase: "after hygiene + findById(paramsId)",
          userId: String(req.user.id),
          paramsId: String(qid),
          exists: Boolean(rel),
          note: rel
            ? "document still present"
            : "MISSING — row was likely removed during dedupe (keepScheduleItemId not matched in duplicate group, or other delete); enable DEBUG_SCHEDULE_PUT_TRACE on dedupe for skip warnings",
        })
      );
    }
    if (!rel || String(rel.userId) !== String(req.user.id)) {
      return res.status(404).json({ message: "Schedule item not found" });
    }
    Object.assign(rel, patch);
    row = rel;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[schedule PUT hygiene] skipped:", err?.message || err);
  }

  const duration =
    patch.durationMinutes != null && Number(patch.durationMinutes) >= 1
      ? Math.max(1, Math.round(Number(patch.durationMinutes)))
      : row.durationMinutes != null && Number(row.durationMinutes) >= 1
        ? Math.max(1, Math.round(Number(row.durationMinutes)))
        : scheduleTime.defaultDurationMinutes(nType, row);

  let resolvedTime = String(row.time || "").trim().slice(0, 5);
  const rowIdStr = String(row._id);

  if (isDietLogSyncRow) {
    const mealKey = String(row.meal || "").toLowerCase();
    const siblingDupes = await ScheduleItem.find({
      userId: req.user.id,
      date: dateKey,
      itemType: "diet",
      scheduleSource: DIET_LOG_SYNC_SOURCE,
      _id: { $ne: qid },
    }).lean();
    const dupIds = siblingDupes.filter((d) => String(d.meal || "").toLowerCase() === mealKey).map((d) => d._id);
    if (dupIds.length) await ScheduleItem.deleteMany({ _id: { $in: dupIds }, userId: req.user.id });
  }

  let existing = await ScheduleItem.find({ userId: req.user.id, date: dateKey, _id: { $ne: qid } }).lean();
  existing = (existing || []).filter((e) => String(e?._id || "") !== rowIdStr);

  if (isDietLogSyncRow) {
    existing = existing.filter((e) => {
      const src = String(e?.scheduleSource || "").trim();
      if (src === DIET_PLAN_APPLY_SOURCE) return false;
      if (src === DIET_LOG_SYNC_SOURCE) return true;
      const pid = String(e?.dietPlanId || "").trim();
      if (pid && String(e?.itemType || "").toLowerCase() === "diet") return false;
      return true;
    });
  }

  if (!resolvedTime) {
    resolvedTime = scheduleTime.findNextAvailableTimeSlot(dateKey, duration, existing, {
      itemType: nType,
      mealType: row.meal || (nType === "diet" ? "lunch" : undefined),
    });
    if (!resolvedTime) {
      return res.status(400).json({ message: "No available time slots were found for this day." });
    }
    row.time = resolvedTime;
  }

  const merged = {
    date: dateKey,
    time: String(row.time).slice(0, 5),
    durationMinutes: Math.max(1, Math.round(Number(duration) || 1)),
    itemType: nType,
    title: String(row.title || "").trim() || "Item",
    scheduleSource: String(row.scheduleSource || "").trim(),
    meal: String(row.meal || "").trim().toLowerCase(),
  };
  const conflictDetail = scheduleTime.findScheduleConflictDetail(merged, existing, rowIdStr);
  if (String(process.env.DEBUG_SCHEDULE_CONFLICT || "").trim() === "1") {
    const classifyRow = (h) => {
      if (!h) return null;
      const src = String(h.scheduleSource || "").trim();
      if (src === DIET_LOG_SYNC_SOURCE) return "diet_log_sync";
      if (src === DIET_PLAN_APPLY_SOURCE) return "diet_plan_apply";
      return src ? `scheduleSource=${src}` : `itemType=${h.itemType || ""}`;
    };
    const cr = conflictDetail.candidateRange || {};
    const audit = (existing || []).map((e) => {
      const eid = String(e?._id || "");
      const countable = scheduleTime.isCountableBlock(e);
      let range = null;
      if (countable) {
        const nb = scheduleTime.normalizeScheduleItemTimeRange(e);
        range = {
          startMin: nb.start,
          endMin: nb.end,
          durationMinutesUsed: nb.durationMinutes,
          startTime: scheduleTime.minutesToHHmm(nb.start),
          endTime: scheduleTime.minutesToHHmm(nb.end),
        };
      }
      return {
        id: eid,
        itemType: e?.itemType,
        scheduleSource: e?.scheduleSource,
        meal: e?.meal,
        title: e?.title,
        date: e?.date,
        startTimeDb: String(e?.time || "").slice(0, 5),
        durationMinutesDb: e?.durationMinutes,
        range,
        isCurrentEditingRow: eid === rowIdStr,
        countable,
        rowClass: classifyRow(e),
      };
    });
    const hit = conflictDetail.hit || null;
    // eslint-disable-next-line no-console
    console.log(
      "[schedule PUT conflict-debug]",
      JSON.stringify(
        {
          userId: String(req.user.id),
          dataPipelineNote:
            "PUT runs runDietScheduleHygieneForUser (duration normalize + diet_log_sync dedupe; keepScheduleItemId when editing diet_log_sync), reloads row, then queries `existing` for conflict — same hygiene as GET /schedules list (except list uses oldest-keeper dedupe; PUT keeps edited id).",
          isDietLogSyncRow,
          currentEditingId: rowIdStr,
          dateCompared: dateKey,
          mergedCandidate: merged,
          candidate: {
            startMin: cr.startMin,
            endMin: cr.endMin,
            startTime: Number.isFinite(cr.startMin) ? scheduleTime.minutesToHHmm(cr.startMin) : null,
            endTime: Number.isFinite(cr.endMin) ? scheduleTime.minutesToHHmm(cr.endMin) : null,
            durationMinutes: cr.durationMinutes,
          },
          excludeId: rowIdStr,
          existingContainsSelf: audit.some((x) => x.isCurrentEditingRow),
          existingCount: audit.length,
          existingItems: audit,
          overlapRule: "candidate.startMin < hit.endMin && candidate.endMin > hit.startMin (touching allowed)",
          conflict: conflictDetail.conflict,
          firstHit: hit,
          firstHitClassification: classifyRow(hit),
        },
        null,
        2
      )
    );
  }
  if (conflictDetail.conflict) {
    return res.status(409).json({ message: scheduleTime.SCHEDULE_CONFLICT_MESSAGE, code: "schedule_conflict" });
  }

  row.durationMinutes = merged.durationMinutes;
  row.overlapAccepted = false;
  await row.save();
  res.json(row);
});

const remove = asyncHandler(async (req, res) => {
  const row = await ScheduleItem.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Schedule item not found" });
  if (String(row.userId) !== String(req.user.id)) return res.status(403).json({ message: "Forbidden" });
  const scope = String(req.query.scope || "single").trim().toLowerCase();
  if (!["single", "future"].includes(scope)) {
    return res.status(400).json({ message: "Invalid scope. Use single or future." });
  }

  const isPlanItem = isPlanBackedItem(row);
  if (!isPlanItem || scope === "single") {
    await removeSingleItemAndLinkedState({ row, userId: req.user.id });
    return res.json({ success: true, scope: "single" });
  }

  const fromDate = String(row.date || "").trim();
  const baseFilter = {
    userId: req.user.id,
    date: { $gte: fromDate },
    is_completed: { $ne: true },
  };

  if (row.planId) {
    const deletedSchedules = await ScheduleItem.deleteMany({
      ...baseFilter,
      planId: row.planId,
    });
    const deletedStatuses = await WorkoutDailyStatus.deleteMany({
      user_id: req.user.id,
      workout_plan_id: row.planId,
      date: { $gte: fromDate },
      is_completed: { $ne: true },
    });
    await ScheduleSkip.deleteMany({
      userId: req.user.id,
      planId: row.planId,
      date: { $gte: fromDate },
    });

    const remainingFuturePending = await ScheduleItem.exists({
      userId: req.user.id,
      planId: row.planId,
      date: { $gte: fromDate },
      is_completed: { $ne: true },
    });
    if (!remainingFuturePending) {
      await WorkoutPlan.deleteOne({ _id: row.planId, user_id: req.user.id });
    }
    return res.json({
      success: true,
      scope: "future",
      deletedSchedules: deletedSchedules.deletedCount || 0,
      deletedWorkoutTasks: deletedStatuses.deletedCount || 0,
    });
  }

  const courseId = row.courseId || null;
  if (courseId) {
    const deletedSchedules = await ScheduleItem.deleteMany({
      ...baseFilter,
      courseId,
    });
    await ScheduleSkip.deleteMany({
      userId: req.user.id,
      courseId,
      date: { $gte: fromDate },
    });

    const activeEnrollment = await EnrolledCourse.findOne({
      user_id: req.user.id,
      course_id: courseId,
      status: "active",
    });
    let deletedCourseProgress = 0;
    if (activeEnrollment?._id) {
      const progressDeleted = await CourseDailyProgress.deleteMany({
        user_id: req.user.id,
        enrolled_course_id: activeEnrollment._id,
        date: { $gte: fromDate },
        is_completed: { $ne: true },
      });
      deletedCourseProgress = progressDeleted.deletedCount || 0;
      activeEnrollment.status = "cancelled";
      activeEnrollment.is_completed = false;
      await activeEnrollment.save();
    }

    return res.json({
      success: true,
      scope: "future",
      deletedSchedules: deletedSchedules.deletedCount || 0,
      deletedWorkoutTasks: deletedCourseProgress,
    });
  }

  await removeSingleItemAndLinkedState({ row, userId: req.user.id });
  res.json({ success: true, scope: "single" });
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

  const dateKeys = Array.from(new Set(slice.map((it) => String(it?.date || "").trim()).filter(Boolean)));
  const existingAll = await ScheduleItem.find({ userId: uid, date: { $in: dateKeys } }).lean();
  const accumulated = [...existingAll];

  const docs = [];
  for (const it of slice) {
    const resolvedTitle = String(it.title || it.planName || it.taskName || "").trim();
    const dateStr = String(it.date || "").trim();
    if (!resolvedTitle || !dateStr) {
      return res.status(400).json({ message: "Each item needs title and date" });
    }
    const nType = normalizeItemType(it.itemType);
    const dur =
      it.durationMinutes != null && Number.isFinite(Number(it.durationMinutes))
        ? Math.max(1, Number(it.durationMinutes))
        : scheduleTime.defaultDurationMinutes(nType, it);

    let timeStr = String(it.time || "").trim().slice(0, 5);
    const sameDay = accumulated.filter((r) => String(r.date) === dateStr);
    if (!timeStr) {
      timeStr = scheduleTime.findNextAvailableTimeSlot(dateStr, dur, sameDay, { itemType: nType });
      if (!timeStr) {
        return res.status(400).json({
          message: "No available time slots were found for this day.",
          code: "no_slot",
          date: dateStr,
          title: resolvedTitle,
        });
      }
    }

    const candidate = { date: dateStr, time: timeStr, durationMinutes: dur, itemType: nType, title: resolvedTitle };
    if (scheduleTime.hasScheduleConflict(candidate, accumulated, null)) {
      return res.status(409).json({
        message: scheduleTime.SCHEDULE_CONFLICT_MESSAGE,
        code: "schedule_conflict",
        date: dateStr,
        time: timeStr,
        title: resolvedTitle,
      });
    }

    const doc = {
      userId: uid,
      itemType: nType,
      category: it.category != null ? String(it.category).trim() : "",
      title: resolvedTitle,
      subtitle: it.subtitle != null ? String(it.subtitle).trim() : "",
      planId: it.planId || null,
      date: dateStr,
      time: timeStr,
      note: it.note != null ? String(it.note) : "",
      courseId: it.courseId || null,
      durationMinutes: dur,
      overlapAccepted: false,
      planName: it.planName != null ? String(it.planName).trim() : "",
      dietPlanId: it.dietPlanId != null ? String(it.dietPlanId).trim() : "",
      scheduleSource: it.scheduleSource != null ? String(it.scheduleSource).trim() : nType === "diet" ? "manual" : "",
    };
    docs.push(doc);
    accumulated.push({ ...doc, _id: new mongoose.Types.ObjectId() });
  }
  const created = await ScheduleItem.insertMany(docs);
  await Promise.all(
    created.map((row) => {
      if (!row.planId && !row.courseId) return null;
      const or = [];
      if (row.planId) or.push({ planId: row.planId });
      if (row.courseId) or.push({ courseId: row.courseId });
      return ScheduleSkip.deleteMany({
        userId: uid,
        date: row.date,
        ...(or.length ? { $or: or } : {}),
      });
    })
  );
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

module.exports = { list, create, update, remove, batchCreate, removeByCourse, applyDietPlan, removeDietPlanApply };

