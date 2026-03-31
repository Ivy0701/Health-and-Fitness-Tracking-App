const Course = require("../models/Course");
const ForumPost = require("../models/ForumPost");
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
};

async function patchCourseWeeklySlots() {
  const courses = await Course.find().lean();
  for (const c of courses) {
    const slots = DEFAULT_SLOTS_BY_TITLE[c.title];
    if (!slots?.length) continue;
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
    const [workoutCount, dietCount, scheduleCount, forumCount] = await Promise.all([
      Workout.countDocuments({ userId: anyUser._id }),
      Diet.countDocuments({ userId: anyUser._id }),
      ScheduleItem.countDocuments({ userId: anyUser._id }),
      ForumPost.countDocuments({ userId: anyUser._id }),
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
    if (forumCount === 0) {
      await ForumPost.insertMany([
        {
          userId: anyUser._id,
          authorName: anyUser.username,
          title: "Best post-workout meals?",
          content: "What meals do you usually eat after evening training?",
        },
        {
          userId: anyUser._id,
          authorName: anyUser.username,
          title: "How to stay consistent?",
          content: "Share your routine tips for keeping healthy habits during busy weeks.",
        },
      ]);
    }
  }
}

module.exports = seedDemoData;
