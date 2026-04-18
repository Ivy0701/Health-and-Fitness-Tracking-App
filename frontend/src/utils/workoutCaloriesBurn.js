/**
 * Unified MET-based calories OUT (exercise burn).
 * Formula: round(MET × weightKg × durationMinutes / 60)
 * Keep in sync with backend/src/utils/workoutCaloriesBurn.js
 */

export const DEFAULT_WEIGHT_KG = 60;
export const DEFAULT_MET = 4.0;

const MET_BY_NORMALIZED_KEY = {
  walking: 3.5,
  running: 8.0,
  jogging: 7.0,
  jump_rope: 12.3,
  swimming: 6.0,
  pilates: 3.0,
  yoga: 3.0,
  stretching: 2.5,
  recovery: 2.5,
  mobility: 2.5,
  weight_lifting: 3.5,
  strength: 5.0,
  cardio: 6.0,
  hiit: 8.0,
  cycling: 6.0,
  workout_default: DEFAULT_MET,
  basketball: 8.0,
  football: 8.0,
  badminton: 7.0,
  tennis: 7.0,
  walk: 3.5,
  run: 8.0,
  swim: 6.0,
  rope: 12.3,
  lifting: 3.5,
  stretch: 2.5,
  cycle: 6.0,
  bike: 6.0,
  spin: 6.0,
};

const KEYWORD_RULES = [
  { re: /jump\s*rope|jumping\s*rope|\bskipping\b/i, met: 12.3 },
  { re: /\bswimming\b|\bswim\b/i, met: 6.0 },
  { re: /\bjogging\b|\bjog\b/i, met: 7.0 },
  { re: /\brunning\b|\brun\b/i, met: 8.0 },
  { re: /\bwalking\b|\bwalk\b/i, met: 3.5 },
  { re: /\bhiit\b/i, met: 8.0 },
  { re: /\bpilates\b/i, met: 3.0 },
  { re: /\byoga\b/i, met: 3.0 },
  { re: /\bstretching\b|\bstretch\b/i, met: 2.5 },
  { re: /\brecovery\b/i, met: 2.5 },
  { re: /\bmobility\b/i, met: 2.5 },
  { re: /\bdeadlift\b|\bsquat\b|\bstrength\b/i, met: 5.0 },
  { re: /weight\s*lifting|\blifting\b/i, met: 3.5 },
  { re: /\bcardio\b/i, met: 6.0 },
  { re: /\bcycling\b|\bcycle\b|\bbike\b|\bspinning\b|\bspin\b/i, met: 6.0 },
  { re: /\bpush[\s-]?up\b|\bpull[\s-]?up\b/i, met: 5.0 },
  { re: /\bbasketball\b/i, met: 8.0 },
  { re: /\bfootball\b|\bsoccer\b/i, met: 8.0 },
  { re: /\bbadminton\b/i, met: 7.0 },
  { re: /\btennis\b/i, met: 7.0 },
];

function normalizeKeyToken(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_");
}

function buildBlob(category, title) {
  return `${String(category || "")} ${String(title || "")}`.trim().toLowerCase();
}

export function resolveMetWithSource(category, title) {
  const blob = buildBlob(category, title);
  const titleKey = normalizeKeyToken(title);
  if (titleKey && MET_BY_NORMALIZED_KEY[titleKey] != null) {
    return { met: MET_BY_NORMALIZED_KEY[titleKey], usedDefault: false };
  }
  const catKey = normalizeKeyToken(category);
  if (catKey && MET_BY_NORMALIZED_KEY[catKey] != null) {
    return { met: MET_BY_NORMALIZED_KEY[catKey], usedDefault: false };
  }
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(blob)) return { met: rule.met, usedDefault: false };
  }
  return { met: DEFAULT_MET, usedDefault: true };
}

export function resolveWeightKg(weightKg) {
  const w = Number(weightKg);
  if (Number.isFinite(w) && w > 0) return w;
  return DEFAULT_WEIGHT_KG;
}

export function exerciseEffectiveDurationMinutes(exercise) {
  const minutes = Number(exercise?.duration_minutes ?? exercise?.durationMinutes ?? 0);
  if (Number.isFinite(minutes) && minutes > 0) return Math.max(1, Math.round(minutes));
  const holdSeconds = Number(exercise?.hold_seconds ?? exercise?.holdSeconds ?? 0);
  if (Number.isFinite(holdSeconds) && holdSeconds > 0) return Math.max(1, Math.ceil(holdSeconds / 60));
  return 1;
}

/**
 * @param {{ durationMinutes: number, category?: string, title?: string, weightKg?: number|null|undefined }} p
 */
export function calculateWorkoutCaloriesBurned(p) {
  const durationMinutes = Math.max(0, Number(p?.durationMinutes) || 0);
  if (durationMinutes <= 0) return 0;
  const weightKg = resolveWeightKg(p?.weightKg);
  const { met } = resolveMetWithSource(p?.category, p?.title);
  return Math.round(met * weightKg * (durationMinutes / 60));
}

export function taskUsesAssumedMetForBurn(category, exerciseName) {
  return resolveMetWithSource(category, exerciseName).usedDefault;
}
