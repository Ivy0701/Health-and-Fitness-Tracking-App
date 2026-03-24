function calculateBmi(weightKg, heightCm) {
  const heightM = Number(heightCm) / 100;
  if (!heightM || heightM <= 0) {
    return 0;
  }
  return Number((Number(weightKg) / (heightM * heightM)).toFixed(2));
}

function getBmiCategory(bmi) {
  if (bmi < 18.5) return "underweight";
  if (bmi < 24) return "normal";
  if (bmi < 28) return "overweight";
  return "obese";
}

module.exports = { calculateBmi, getBmiCategory };
