/**
 * Browser-only audit: Schedule / Diet timeline data are NOT persisted in this app’s localStorage
 * (they come from the API). This helper lists keys that might look related so you can confirm
 * nothing unexpected is cached under similar names.
 *
 * Usage (dev): in DevTools console after app load:
 *   import { printScheduleRelatedLocalStorage } from "./utils/scheduleLocalStorageAudit.js"
 *   printScheduleRelatedLocalStorage()
 *
 * Or from any component in dev: import and call printScheduleRelatedLocalStorage().
 */
const SUBSTRINGS = [
  "schedule",
  "timeline",
  "planner",
  "mealblock",
  "meal_block",
  "dietrecord",
  "diet_record",
  "scheduleitem",
  "courseschedule",
  "diet:",
  "workout_session",
  "assessment_draft",
];

export function printScheduleRelatedLocalStorage() {
  if (typeof localStorage === "undefined") {
    // eslint-disable-next-line no-console
    console.log("No localStorage (non-browser).");
    return { keys: [], tokenPresent: false };
  }
  const all = Object.keys(localStorage);
  const lower = all.map((k) => k.toLowerCase());
  const matched = [];
  for (let i = 0; i < all.length; i += 1) {
    const k = all[i];
    const L = lower[i];
    if (SUBSTRINGS.some((s) => L.includes(s))) matched.push(k);
  }
  const tokenPresent = Boolean(localStorage.getItem("token"));

  // eslint-disable-next-line no-console
  console.group("[HF] localStorage keys possibly related to schedule / diet / planner");
  // eslint-disable-next-line no-console
  console.log("Total keys:", all.length);
  // eslint-disable-next-line no-console
  console.log("Matched by heuristic:", matched.length ? matched : "(none)");
  for (const key of matched) {
    const raw = localStorage.getItem(key);
    let countHint = "";
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) countHint = `array length ${parsed.length}`;
      else if (parsed && typeof parsed === "object") countHint = `object keys ${Object.keys(parsed).length}`;
    } catch {
      countHint = `string length ${String(raw || "").length}`;
    }
    // eslint-disable-next-line no-console
    console.log(` - ${key}: ${countHint}`);
  }
  // eslint-disable-next-line no-console
  console.log("Auth token key present:", tokenPresent);
  // eslint-disable-next-line no-console
  console.groupEnd();

  return { keys: matched, tokenPresent, allKeyCount: all.length };
}
