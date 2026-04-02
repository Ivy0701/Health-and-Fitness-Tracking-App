export function calculateBmiValue(weightKg, heightCm) {
  const h = Number(heightCm) / 100;
  return Number(weightKg) / (h * h);
}

export function formatBmi(n) {
  return Number(n).toFixed(2);
}

export function getBmiCategoryLabel(bmi) {
  const v = Number(bmi);
  if (!Number.isFinite(v)) return "";
  if (v < 18.5) return "Underweight";
  if (v < 25) return "Normal";
  if (v < 30) return "Overweight";
  return "Obesity";
}

export function formatBmiForDisplay(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}
