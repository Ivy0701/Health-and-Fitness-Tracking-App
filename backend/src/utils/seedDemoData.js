const Course = require("../models/Course");
const User = require("../models/User");
const Workout = require("../models/Workout");
const Diet = require("../models/Diet");
const ScheduleItem = require("../models/ScheduleItem");

/** weekday 0=Mon … 6=Sun */
const DEFAULT_SLOTS_BY_TITLE = {
  "Morning Yoga Flow": [
    { weekday: 1, startTime: "07:30" },
    { weekday: 3, startTime: "07:30" },
    { weekday: 5, startTime: "08:00" },
  ],
  "HIIT Fat Burn": [
    { weekday: 2, startTime: "18:30" },
    { weekday: 4, startTime: "18:30" },
    { weekday: 6, startTime: "09:00" },
  ],
  "Core Strength Basics": [
    { weekday: 1, startTime: "12:00" },
    { weekday: 4, startTime: "12:00" },
  ],
  "Spin & Cycle": [
    { weekday: 2, startTime: "19:15" },
    { weekday: 4, startTime: "19:15" },
    { weekday: 0, startTime: "10:00" },
  ],
  "Pilates Fundamentals": [
    { weekday: 1, startTime: "17:00" },
    { weekday: 3, startTime: "17:00" },
    { weekday: 5, startTime: "16:30" },
  ],
  "Boxing Conditioning": [{ weekday: 5, startTime: "19:00" }],
  "Stretch & Mobility": [
    { weekday: 0, startTime: "18:00" },
    { weekday: 6, startTime: "18:00" },
  ],
  "Swim Technique (Pool)": [
    { weekday: 2, startTime: "07:00" },
    { weekday: 4, startTime: "07:00" },
  ],
  "VIP: Elite HIIT Performance": [
    { weekday: 1, startTime: "21:15" },
    { weekday: 4, startTime: "21:15" },
  ],
  "VIP: Premium Yoga Mastery": [
    { weekday: 2, startTime: "14:20" },
    { weekday: 5, startTime: "14:20" },
  ],
  "Walk & Wellness": [
    { weekday: 1, startTime: "08:00" },
    { weekday: 3, startTime: "08:00" },
  ],
  "Active Recovery & Stretch": [
    { weekday: 2, startTime: "10:00" },
    { weekday: 4, startTime: "10:00" },
  ],
  "Functional Strength 101": [
    { weekday: 1, startTime: "18:00" },
    { weekday: 5, startTime: "18:00" },
  ],
  "Athletic Conditioning": [
    { weekday: 2, startTime: "17:30" },
    { weekday: 6, startTime: "09:30" },
  ],
  "Competition Prep Skills": [
    { weekday: 4, startTime: "20:00" },
    { weekday: 6, startTime: "08:00" },
  ],
  "VIP: Mindfulness for Athletes": [
    { weekday: 2, startTime: "09:00" },
    { weekday: 6, startTime: "09:00" },
  ],
  "VIP: Recovery Toolkit": [
    { weekday: 1, startTime: "15:00" },
    { weekday: 4, startTime: "15:00" },
  ],
  "VIP: Sport-Specific Drills": [
    { weekday: 2, startTime: "16:00" },
    { weekday: 5, startTime: "16:00" },
  ],
  "VIP: High-Performance Strength": [
    { weekday: 1, startTime: "19:30" },
    { weekday: 3, startTime: "19:30" },
  ],
  "VIP: Pro Coach Mastermind": [{ weekday: 6, startTime: "11:00" }],
};

async function patchCourseWeeklySlots() {
  const courses = await Course.find().lean();
  for (const c of courses) {
    const slots = DEFAULT_SLOTS_BY_TITLE[c.title];
    if (!slots?.length) continue;
    const forceRefreshTitles = new Set([
      "VIP: Elite HIIT Performance",
      "VIP: Premium Yoga Mastery",
      "VIP: Mindfulness for Athletes",
      "VIP: Recovery Toolkit",
      "VIP: Sport-Specific Drills",
      "VIP: High-Performance Strength",
      "VIP: Pro Coach Mastermind",
    ]);
    if (forceRefreshTitles.has(c.title)) {
      await Course.updateOne({ _id: c._id }, { $set: { weeklySlots: slots } });
      continue;
    }
    const has = Array.isArray(c.weeklySlots) && c.weeklySlots.length > 0;
    if (!has) {
      await Course.updateOne({ _id: c._id }, { $set: { weeklySlots: slots } });
    }
  }
}

async function seedDemoData() {
  const courseCount = await Course.countDocuments();
  if (courseCount === 0) {
    await Course.insertMany([
      {
        title: "Morning Yoga Flow",
        description: "A gentle full-body session to improve flexibility and focus.",
        difficulty: "beginner",
        duration: 35,
        category: "yoga",
        isFeatured: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Morning Yoga Flow"],
      },
      {
        title: "HIIT Fat Burn",
        description: "Short and intense interval training for calorie burning.",
        difficulty: "intermediate",
        duration: 25,
        category: "cardio",
        isFeatured: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["HIIT Fat Burn"],
      },
      {
        title: "Core Strength Basics",
        description: "Build a stronger core with guided low-impact movements.",
        difficulty: "beginner",
        duration: 30,
        category: "strength",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Core Strength Basics"],
      },
      {
        title: "Spin & Cycle",
        description: "Rhythm-based indoor cycling with climbs and sprints.",
        difficulty: "intermediate",
        duration: 45,
        category: "cardio",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Spin & Cycle"],
      },
      {
        title: "Pilates Fundamentals",
        description: "Low-impact control and alignment for posture and core.",
        difficulty: "beginner",
        duration: 50,
        category: "pilates",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Pilates Fundamentals"],
      },
      {
        title: "Boxing Conditioning",
        description: "Bag work, footwork, and conditioning rounds.",
        difficulty: "advanced",
        duration: 55,
        category: "boxing",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Boxing Conditioning"],
      },
      {
        title: "Stretch & Mobility",
        description: "Release tightness and improve range of motion.",
        difficulty: "beginner",
        duration: 40,
        category: "mobility",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Stretch & Mobility"],
      },
      {
        title: "Swim Technique (Pool)",
        description: "Stroke drills and efficiency in the water.",
        difficulty: "intermediate",
        duration: 60,
        category: "swim",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Swim Technique (Pool)"],
      },
      {
        title: "VIP: Elite HIIT Performance",
        description: "VIP-only: pro-level interval programming and performance tracking.",
        difficulty: "advanced",
        duration: 40,
        category: "fitness",
        isPremium: true,
        isFeatured: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Elite HIIT Performance"],
      },
      {
        title: "VIP: Premium Yoga Mastery",
        description: "VIP-only: advanced flexibility, breathwork, and deep recovery routines.",
        difficulty: "advanced",
        duration: 50,
        category: "mind-body",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Premium Yoga Mastery"],
      },
      {
        title: "Walk & Wellness",
        description: "Low-impact walking blocks to build a daily movement habit.",
        difficulty: "beginner",
        duration: 25,
        category: "wellness",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Walk & Wellness"],
      },
      {
        title: "Active Recovery & Stretch",
        description: "Light movement and guided stretching between harder training days.",
        difficulty: "easy",
        duration: 30,
        category: "mobility",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Active Recovery & Stretch"],
      },
      {
        title: "Functional Strength 101",
        description: "Squat, hinge, push, and carry patterns with technique-first coaching.",
        difficulty: "intermediate",
        duration: 45,
        category: "strength",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Functional Strength 101"],
      },
      {
        title: "Athletic Conditioning",
        description: "Speed, agility, and repeat-effort conditioning for team-sport athletes.",
        difficulty: "hard",
        duration: 50,
        category: "conditioning",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Athletic Conditioning"],
      },
      {
        title: "Competition Prep Skills",
        description: "Peak-week pacing, strategy reps, and mental routines before events.",
        difficulty: "expert",
        duration: 60,
        category: "performance",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Competition Prep Skills"],
      },
      {
        title: "VIP: Mindfulness for Athletes",
        description: "VIP-only: breathwork, focus drills, and down-regulation for better recovery.",
        difficulty: "beginner",
        duration: 30,
        category: "mind-body",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Mindfulness for Athletes"],
      },
      {
        title: "VIP: Recovery Toolkit",
        description: "VIP-only: soft-tissue, sleep hygiene, and active recovery sequencing.",
        difficulty: "easy",
        duration: 35,
        category: "recovery",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Recovery Toolkit"],
      },
      {
        title: "VIP: Sport-Specific Drills",
        description: "VIP-only: position-specific skills and small-sided game scenarios.",
        difficulty: "intermediate",
        duration: 45,
        category: "skills",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Sport-Specific Drills"],
      },
      {
        title: "VIP: High-Performance Strength",
        description: "VIP-only: periodized heavy lifting with velocity and RPE tracking.",
        difficulty: "hard",
        duration: 55,
        category: "strength",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: High-Performance Strength"],
      },
      {
        title: "VIP: Pro Coach Mastermind",
        description: "VIP-only: elite programming review, video analysis, and progress audits.",
        difficulty: "expert",
        duration: 90,
        category: "coaching",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Pro Coach Mastermind"],
      },
    ]);
  } else {
    await patchCourseWeeklySlots();
    const titles = new Set((await Course.find().select("title").lean()).map((x) => x.title));
    const extras = [
      {
        title: "Spin & Cycle",
        description: "Rhythm-based indoor cycling with climbs and sprints.",
        difficulty: "intermediate",
        duration: 45,
        category: "cardio",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Spin & Cycle"],
      },
      {
        title: "Pilates Fundamentals",
        description: "Low-impact control and alignment for posture and core.",
        difficulty: "beginner",
        duration: 50,
        category: "pilates",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Pilates Fundamentals"],
      },
      {
        title: "Boxing Conditioning",
        description: "Bag work, footwork, and conditioning rounds.",
        difficulty: "advanced",
        duration: 55,
        category: "boxing",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Boxing Conditioning"],
      },
      {
        title: "Stretch & Mobility",
        description: "Release tightness and improve range of motion.",
        difficulty: "beginner",
        duration: 40,
        category: "mobility",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Stretch & Mobility"],
      },
      {
        title: "Swim Technique (Pool)",
        description: "Stroke drills and efficiency in the water.",
        difficulty: "intermediate",
        duration: 60,
        category: "swim",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Swim Technique (Pool)"],
      },
      {
        title: "VIP: Elite HIIT Performance",
        description: "VIP-only: pro-level interval programming and performance tracking.",
        difficulty: "advanced",
        duration: 40,
        category: "fitness",
        isPremium: true,
        isFeatured: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Elite HIIT Performance"],
      },
      {
        title: "VIP: Premium Yoga Mastery",
        description: "VIP-only: advanced flexibility, breathwork, and deep recovery routines.",
        difficulty: "advanced",
        duration: 50,
        category: "mind-body",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Premium Yoga Mastery"],
      },
      {
        title: "Walk & Wellness",
        description: "Low-impact walking blocks to build a daily movement habit.",
        difficulty: "beginner",
        duration: 25,
        category: "wellness",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Walk & Wellness"],
      },
      {
        title: "Active Recovery & Stretch",
        description: "Light movement and guided stretching between harder training days.",
        difficulty: "easy",
        duration: 30,
        category: "mobility",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Active Recovery & Stretch"],
      },
      {
        title: "Functional Strength 101",
        description: "Squat, hinge, push, and carry patterns with technique-first coaching.",
        difficulty: "intermediate",
        duration: 45,
        category: "strength",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Functional Strength 101"],
      },
      {
        title: "Athletic Conditioning",
        description: "Speed, agility, and repeat-effort conditioning for team-sport athletes.",
        difficulty: "hard",
        duration: 50,
        category: "conditioning",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Athletic Conditioning"],
      },
      {
        title: "Competition Prep Skills",
        description: "Peak-week pacing, strategy reps, and mental routines before events.",
        difficulty: "expert",
        duration: 60,
        category: "performance",
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["Competition Prep Skills"],
      },
      {
        title: "VIP: Mindfulness for Athletes",
        description: "VIP-only: breathwork, focus drills, and down-regulation for better recovery.",
        difficulty: "beginner",
        duration: 30,
        category: "mind-body",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Mindfulness for Athletes"],
      },
      {
        title: "VIP: Recovery Toolkit",
        description: "VIP-only: soft-tissue, sleep hygiene, and active recovery sequencing.",
        difficulty: "easy",
        duration: 35,
        category: "recovery",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Recovery Toolkit"],
      },
      {
        title: "VIP: Sport-Specific Drills",
        description: "VIP-only: position-specific skills and small-sided game scenarios.",
        difficulty: "intermediate",
        duration: 45,
        category: "skills",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Sport-Specific Drills"],
      },
      {
        title: "VIP: High-Performance Strength",
        description: "VIP-only: periodized heavy lifting with velocity and RPE tracking.",
        difficulty: "hard",
        duration: 55,
        category: "strength",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: High-Performance Strength"],
      },
      {
        title: "VIP: Pro Coach Mastermind",
        description: "VIP-only: elite programming review, video analysis, and progress audits.",
        difficulty: "expert",
        duration: 90,
        category: "coaching",
        isPremium: true,
        weeklySlots: DEFAULT_SLOTS_BY_TITLE["VIP: Pro Coach Mastermind"],
      },
    ];
    for (const doc of extras) {
      if (!titles.has(doc.title)) {
        await Course.create(doc);
        titles.add(doc.title);
      }
    }
  }

  const anyUser = await User.findOne().select("_id username").lean();
  if (anyUser) {
    const [workoutCount, dietCount, scheduleCount] = await Promise.all([
      Workout.countDocuments({ userId: anyUser._id }),
      Diet.countDocuments({ userId: anyUser._id }),
      ScheduleItem.countDocuments({ userId: anyUser._id }),
    ]);

    if (workoutCount === 0) {
      await Workout.insertMany([
        { userId: anyUser._id, type: "Jogging", duration: 30, caloriesBurned: 260, note: "Easy pace" },
        { userId: anyUser._id, type: "Bodyweight Training", duration: 40, caloriesBurned: 320, note: "Core + legs" },
      ]);
    }
    if (dietCount === 0) {
      await Diet.insertMany([
        { userId: anyUser._id, foodName: "Oatmeal + Banana", calories: 320, mealType: "breakfast" },
        { userId: anyUser._id, foodName: "Chicken Salad", calories: 460, mealType: "lunch" },
      ]);
    }
    if (scheduleCount === 0) {
      await ScheduleItem.insertMany([
        {
          userId: anyUser._id,
          title: "Morning Run",
          date: "2026-03-26",
          time: "07:30",
          note: "5 km easy run",
          durationMinutes: 45,
        },
        {
          userId: anyUser._id,
          title: "Meal Prep",
          date: "2026-03-26",
          time: "19:00",
          note: "Prep for 3 days",
          durationMinutes: 60,
        },
      ]);
    }
    // Forum: do not seed demo posts — real posts only (see forumLegacyDemoTitles for legacy title filtering).
  }
}

module.exports = seedDemoData;
