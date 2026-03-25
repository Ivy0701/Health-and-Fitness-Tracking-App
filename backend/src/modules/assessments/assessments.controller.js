const asyncHandler = require("../../utils/asyncHandler");
const { calculateBmi, getBmiCategory } = require("../../utils/bmi.util");
const model = require("./assessments.model");

const create = asyncHandler(async (req, res) => {
  const { gender, height_cm, weight_kg, age, target_weight_kg, bmi: inputBmi } = req.body;
  if (height_cm == null || weight_kg == null) {
    return res.status(400).json({ message: "height_cm and weight_kg are required" });
  }

  const bmi = inputBmi ?? calculateBmi(weight_kg, height_cm);
  const bmi_category = getBmiCategory(bmi);
  const data = await model.createAssessment(req.user.id, {
    gender,
    height_cm,
    weight_kg,
    age,
    target_weight_kg,
    bmi,
    bmi_category
  });
  res.status(201).json(data);
});

const latest = asyncHandler(async (req, res) => {
  const data = await model.getLatestAssessment(req.user.id);
  res.json(data);
});

module.exports = { create, latest };
