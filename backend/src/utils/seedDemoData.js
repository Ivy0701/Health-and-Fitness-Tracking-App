const Course = require("../models/Course");
const ForumPost = require("../models/ForumPost");
const User = require("../models/User");
const Workout = require("../models/Workout");
const Diet = require("../models/Diet");
const ScheduleItem = require("../models/ScheduleItem");

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
      },
      {
        title: "HIIT Fat Burn",
        description: "Short and intense interval training for calorie burning.",
        difficulty: "intermediate",
        duration: 25,
        category: "cardio",
        isFeatured: true,
      },
      {
        title: "Core Strength Basics",
        description: "Build a stronger core with guided low-impact movements.",
        difficulty: "beginner",
        duration: 30,
        category: "strength",
      },
    ]);
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
        { userId: anyUser._id, title: "Morning Run", date: "2026-03-26", time: "07:30", note: "5 km easy run" },
        { userId: anyUser._id, title: "Meal Prep", date: "2026-03-26", time: "19:00", note: "Prep for 3 days" },
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

