/**
 * Titles that were shipped as frontend mock posts or demo seed posts.
 * Excluded from API responses so only genuine user-created content is shown.
 * (Collisions: a real user would need the exact same title string.)
 */
const LEGACY_DEMO_FORUM_TITLES = [
  // seedDemoData.js (first-user forum seed)
  "Best post-workout meals?",
  "How to stay consistent?",
  // frontend/src/mocks/forumMockPosts.js (RAW_MOCK_POSTS)
  "Stuck at the same bench press for 3 weeks",
  "Morning fasted walk progress update",
  "Easy high-protein lunch ideas?",
  "How much sleep is enough for recovery?",
  "30-day plank challenge day 12",
  "Scale not moving but waist is smaller",
  "First week in gym completed!",
  "Best snack to hit daily protein goal?",
  "Do you train through muscle soreness?",
  "Low-carb dinner that actually tastes good",
  "Tried tempo squats for the first time",
  "Water intake changed my workouts",
  "Clean bulk breakfast ideas?",
  "Mobility routine before lifting",
  "From office chair to 100kg deadlift",
  "Late-night cravings during fat loss",
  "10k steps challenge check-in",
  "Back pain after rows - advice?",
  "How strict are you with macros on weekends?",
  "Evening runs helping my sleep",
];

const LEGACY_DEMO_FORUM_TITLE_SET = new Set(LEGACY_DEMO_FORUM_TITLES);

function isLegacyDemoForumTitle(title) {
  return LEGACY_DEMO_FORUM_TITLE_SET.has(String(title || "").trim());
}

module.exports = {
  LEGACY_DEMO_FORUM_TITLES,
  LEGACY_DEMO_FORUM_TITLE_SET,
  isLegacyDemoForumTitle,
};
