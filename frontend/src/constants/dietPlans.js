function toTagSlug(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export const PLAN_DEFINITIONS = [
  {
    id: "hot",
    name: "Hot Meal Plans",
    type: "hot",
    description: "Popular daily meals with balanced macros.",
    suitableFor: ["Fitness Beginners", "Busy Office Workers", "General Health Maintenance"],
    notSuitableFor: ["Severe Food Allergy Users", "Users needing strict medical diets"],
    recipeTags: ["Balanced", "Easy Prep", "Daily Routine"],
  },
  {
    id: "fat_loss",
    name: "Fat Loss Plan",
    type: "fat_loss",
    description: "Lower-calorie, high-protein and vegetable-focused meals.",
    suitableFor: ["Weight Loss", "Body Fat Reduction", "Sedentary Workers"],
    notSuitableFor: ["Underweight Users", "Pregnant Women"],
    recipeTags: ["Low Fat", "High Protein", "Low Sugar"],
  },
  {
    id: "weight_loss",
    name: "Weight Loss Plan",
    type: "weight_loss",
    description: "Controlled calories with practical meal portions.",
    suitableFor: ["Weight Loss", "Portion Control Beginners", "Busy Office Workers"],
    notSuitableFor: ["Teenagers in Growth Spurts", "Users with Eating Disorder History"],
    recipeTags: ["Low Calorie", "Balanced", "Portion Control"],
  },
  {
    id: "muscle_gain",
    name: "Muscle Gain Plan",
    type: "muscle_gain",
    description: "Higher calories and more protein/carb support for training.",
    suitableFor: ["Muscle Gain", "Strength Training Users", "High Activity Users"],
    notSuitableFor: ["Sedentary Users", "Users needing strict calorie restriction"],
    recipeTags: ["High Protein", "Energy Dense", "Recovery Fuel"],
  },
  {
    id: "high_protein",
    name: "High Protein Plan",
    type: "high_protein",
    description: "Raise protein intake while keeping calories manageable.",
    suitableFor: ["Muscle Maintenance", "Fat Loss", "Fitness Beginners"],
    notSuitableFor: ["Users with Kidney Issues", "Users on medically restricted protein diets"],
    recipeTags: ["High Protein", "Clean Eating", "Low Sugar"],
  },
  {
    id: "balanced",
    name: "Balanced Plan",
    type: "balanced",
    description: "Even macro structure for long-term consistency.",
    suitableFor: ["General Health Maintenance", "Family Users", "Fitness Beginners"],
    notSuitableFor: ["Users requiring strict therapeutic diets"],
    recipeTags: ["Balanced", "Whole Foods", "Daily Routine"],
  },
  {
    id: "keto",
    name: "Keto Plan",
    type: "fat_loss",
    description: "Very low-carb meals with moderate protein and healthy fats.",
    suitableFor: ["Weight Loss", "Low Carb Users", "Experienced Diet Followers"],
    notSuitableFor: ["Pregnant Women", "People with Diabetes", "Users with Kidney Issues"],
    recipeTags: ["Keto", "Low Carb", "High Fat"],
  },
  {
    id: "vegetarian",
    name: "Vegetarian Plan",
    type: "balanced",
    description: "Plant-forward meal combinations with balanced daily macros.",
    suitableFor: ["Vegetarians", "Clean Eating Users", "General Health Maintenance"],
    notSuitableFor: ["People with Soy Allergy", "Users needing high animal-protein intake"],
    recipeTags: ["Vegetarian", "Balanced", "Plant Based"],
  },
  {
    id: "low_sugar",
    name: "Low Sugar Plan",
    type: "weight_loss",
    description: "Reduce added sugar while keeping stable energy through the day.",
    suitableFor: ["Weight Loss", "People with Diabetes", "Low Sugar Preference"],
    notSuitableFor: ["Users needing rapid carb-loading for endurance events"],
    recipeTags: ["Low Sugar", "Balanced", "High Fiber"],
  },
  {
    id: "low_fat",
    name: "Low Fat Plan",
    type: "weight_loss",
    description: "Lower-fat food picks with controlled portions and lighter cooking.",
    suitableFor: ["Weight Loss", "Cardio-focused Users", "People with High Cholesterol Risk"],
    notSuitableFor: ["Keto Users", "Very Low Carb Users"],
    recipeTags: ["Low Fat", "Clean Eating", "Light Cooking"],
  },
  {
    id: "athlete",
    name: "Athlete Plan",
    type: "muscle_gain",
    description: "Higher fuel support for training volume and recovery demands.",
    suitableFor: ["Athletes", "Muscle Gain", "High Activity Users"],
    notSuitableFor: ["Sedentary Users", "Users requiring strict low-calorie intake"],
    recipeTags: ["Performance", "High Protein", "Recovery Fuel"],
  },
  {
    id: "clean_eating",
    name: "Clean Eating Plan",
    type: "high_protein",
    description: "Whole-food focused plan with practical prep and clean ingredients.",
    suitableFor: ["Clean Eating Users", "Fitness Beginners", "General Health Maintenance"],
    notSuitableFor: ["Users requiring highly specialized therapeutic diets"],
    recipeTags: ["Clean Eating", "Whole Foods", "Low Sugar"],
  },
];

export const FORUM_TAG_OPTIONS_FROM_DIET = Array.from(
  PLAN_DEFINITIONS.flatMap((plan) => (Array.isArray(plan.recipeTags) ? plan.recipeTags : []))
    .reduce((map, label) => {
      const clean = String(label || "").trim();
      const value = toTagSlug(clean);
      if (clean && value && !map.has(value)) map.set(value, clean);
      return map;
    }, new Map())
)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));
