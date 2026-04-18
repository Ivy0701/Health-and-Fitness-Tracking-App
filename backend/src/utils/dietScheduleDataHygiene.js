const mongoose = require("mongoose");
const ScheduleItem = require("../models/ScheduleItem");

const DIET_LOG_SYNC_SOURCE = "diet_log_sync";
const EXPECTED_DURATION = 15;

function toObjectId(userId) {
  const s = String(userId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * One schedule row per linked Diet record for diet_log_sync.
 * Dedupe key is linkedDietId (strict); legacy rows without linkedDietId are ignored here.
 * @returns {{ duplicateGroups: number, deletedRows: number }}
 */
async function dedupeDietLogSyncForUser(userId, options = {}) {
  const uid = toObjectId(userId);
  if (!uid) return { duplicateGroups: 0, deletedRows: 0 };
  const keepIdStr =
    options.keepScheduleItemId != null ? String(options.keepScheduleItemId).trim() : "";

  const rows = await ScheduleItem.find({
    userId: uid,
    itemType: "diet",
    scheduleSource: DIET_LOG_SYNC_SOURCE,
  })
    .select("_id userId linkedDietId createdAt")
    .lean();

  const groups = new Map();
  for (const r of rows) {
    const linkedId = String(r?.linkedDietId || "").trim();
    if (!linkedId) continue;
    const key = linkedId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let duplicateGroups = 0;
  let deletedRows = 0;
  for (const [, group] of groups) {
    if (group.length <= 1) continue;
    duplicateGroups += 1;
    group.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a._id).localeCompare(String(b._id));
    });
    let keeper = group[0];
    if (keepIdStr) {
      const preferred = group.find((x) => String(x._id) === keepIdStr);
      if (preferred) {
        keeper = preferred;
      } else {
        /**
         * PUT may pass keepScheduleItemId for the row being edited. If that id is not in this
         * duplicate group, do not delete anyone here — otherwise we would fall back to "oldest"
         * keeper and can delete the very document the client is PUTing (404).
         */
        if (String(process.env.DEBUG_SCHEDULE_PUT_TRACE || "").trim() === "1") {
          // eslint-disable-next-line no-console
          console.warn(
            "[dedupeDietLogSync] skip group: keepScheduleItemId not in duplicate group",
            JSON.stringify({ keepIdStr, groupIds: group.map((g) => String(g._id)), linkedDietId: String(group[0]?.linkedDietId || "") })
          );
        }
        continue;
      }
    }
    const keepMongoId = keeper._id;
    let dupIds = group.filter((x) => String(x._id) !== String(keepMongoId)).map((x) => x._id);
    if (keepIdStr) {
      dupIds = dupIds.filter((id) => String(id) !== keepIdStr);
    }
    if (!dupIds.length) continue;
    const res = await ScheduleItem.deleteMany({ _id: { $in: dupIds }, userId: uid });
    deletedRows += res.deletedCount || 0;
  }
  return { duplicateGroups, deletedRows };
}

/**
 * diet_log_sync blocks are always 15m; fix legacy rows that stored a larger duration.
 * @returns {{ modified: number }} approximate matched count
 */
async function normalizeDietLogSyncDurationsForUser(userId) {
  const uid = toObjectId(userId);
  if (!uid) return { modified: 0 };
  const res = await ScheduleItem.updateMany(
    {
      userId: uid,
      itemType: "diet",
      scheduleSource: DIET_LOG_SYNC_SOURCE,
      durationMinutes: { $ne: EXPECTED_DURATION },
    },
    { $set: { durationMinutes: EXPECTED_DURATION } }
  );
  return { modified: res.modifiedCount || 0 };
}

/**
 * Run safe hygiene for one user (idempotent). Intended from GET /schedules list.
 * @param {object} [options] see dedupeDietLogSyncForUser (e.g. keepScheduleItemId on PUT).
 */
async function runDietScheduleHygieneForUser(userId, options = {}) {
  const dedupe = await dedupeDietLogSyncForUser(userId, options);
  const norm = await normalizeDietLogSyncDurationsForUser(userId);
  return { ...dedupe, durationNormalized: norm.modified };
}

module.exports = {
  dedupeDietLogSyncForUser,
  normalizeDietLogSyncDurationsForUser,
  runDietScheduleHygieneForUser,
};
