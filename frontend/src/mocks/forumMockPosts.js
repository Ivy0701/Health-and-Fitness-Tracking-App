const TAG_MAP = {
  "#Diet": "diet",
  "#Training": "training",
  "#Fat loss": "fat_loss",
  "#Recovery": "recovery",
  "#Notes": "notes",
};

const COMMENT_AUTHORS = ["FitNova", "GymPanda", "LeanAlex", "CoreMia", "RunJay", "MacroLily"];
const COMMENT_TEXTS = [
  "Great point. This helped me too.",
  "I had a similar issue last week.",
  "Keep going, your progress is solid.",
  "Try a smaller change and track for 7 days.",
  "This routine looks very practical.",
  "Thanks for sharing this update.",
];

function buildInitialComments(index, createdAtIso) {
  const baseTime = new Date(createdAtIso).getTime();
  const count = (index % 2) + 1; // 1-2 comments
  return Array.from({ length: count }).map((_, commentIndex) => {
    const authorName = COMMENT_AUTHORS[(index + commentIndex) % COMMENT_AUTHORS.length];
    const text = COMMENT_TEXTS[(index * 2 + commentIndex) % COMMENT_TEXTS.length];
    const offsetMinutes = (commentIndex + 1) * 12;
    return {
      id: `mock-${index + 1}-comment-${commentIndex + 1}`,
      authorName,
      text,
      createdAt: new Date(baseTime + offsetMinutes * 60 * 1000).toISOString(),
    };
  });
}

const RAW_MOCK_POSTS = [
  {
    id: "post-1",
    author: { name: "IronLifter" },
    title: "Stuck at the same bench press for 3 weeks",
    content: "I keep failing my last set at 75kg. Should I deload now or just add more rest between sessions?",
    tags: ["#Training", "#Notes"],
    likes: 36,
    comments: 9,
  },
  {
    id: "post-2",
    author: { name: "CardioQueen" },
    title: "Morning fasted walk progress update",
    content: "Did 45 minutes before breakfast for 10 days straight. Energy is better than I expected.",
    tags: ["#Fat loss"],
    likes: 84,
    comments: 14,
  },
  {
    id: "post-3",
    author: { name: "MealPrepMike" },
    title: "Easy high-protein lunch ideas?",
    content: "I need meals that take under 15 minutes to prep. Looking for something around 40g protein.",
    tags: ["#Diet"],
    likes: 52,
    comments: 21,
  },
  {
    id: "post-4",
    author: { name: "SleepySprinter" },
    title: "How much sleep is enough for recovery?",
    content: "I train 5 days a week and average 6 hours. Feeling sore all the time lately.",
    tags: ["#Recovery", "#Training"],
    likes: 29,
    comments: 18,
  },
  {
    id: "post-5",
    author: { name: "CoreBuilder" },
    title: "30-day plank challenge day 12",
    content: "Started at 45 seconds and now I can hold 1:35. Core stability is improving fast.",
    tags: ["#Training", "#Notes"],
    likes: 61,
    comments: 12,
  },
  {
    id: "post-6",
    author: { name: "LeanNina" },
    title: "Scale not moving but waist is smaller",
    content: "Body weight stayed the same this week, but my jeans fit better. Recomp maybe?",
    tags: ["#Fat loss", "#Notes"],
    likes: 47,
    comments: 16,
  },
  {
    id: "post-7",
    author: { name: "GymRookieTom" },
    title: "First week in gym completed!",
    content: "I was nervous on day one, but now I actually enjoy the routine. Any beginner tips for week 2?",
    tags: ["#Training"],
    likes: 88,
    comments: 27,
  },
  {
    id: "post-8",
    author: { name: "ProteinPanda" },
    title: "Best snack to hit daily protein goal?",
    content: "I'm always short by 20g at night. Need low-calorie snack suggestions.",
    tags: ["#Diet", "#Fat loss"],
    likes: 45,
    comments: 20,
  },
  {
    id: "post-9",
    author: { name: "RestDayRay" },
    title: "Do you train through muscle soreness?",
    content: "Leg day destroyed me and I'm still sore after 48 hours. Push through or recover longer?",
    tags: ["#Recovery"],
    likes: 34,
    comments: 11,
  },
  {
    id: "post-10",
    author: { name: "KetoKris" },
    title: "Low-carb dinner that actually tastes good",
    content: "Made chicken thigh bowls with avocado and greens. Kept me full for hours.",
    tags: ["#Diet", "#Notes"],
    likes: 73,
    comments: 19,
  },
  {
    id: "post-11",
    author: { name: "TempoTina" },
    title: "Tried tempo squats for the first time",
    content: "3-second lowering phase made 40kg feel heavy. Form feels much more controlled now.",
    tags: ["#Training"],
    likes: 25,
    comments: 8,
  },
  {
    id: "post-12",
    author: { name: "HydrationHero" },
    title: "Water intake changed my workouts",
    content: "I started tracking water and my afternoon sessions feel way less sluggish.",
    tags: ["#Recovery", "#Notes"],
    likes: 40,
    comments: 15,
  },
  {
    id: "post-13",
    author: { name: "BulkModeBen" },
    title: "Clean bulk breakfast ideas?",
    content: "Need calorie-dense meals that are not just peanut butter. What works for you?",
    tags: ["#Diet", "#Training"],
    likes: 57,
    comments: 17,
  },
  {
    id: "post-14",
    author: { name: "YogaLuna" },
    title: "Mobility routine before lifting",
    content: "Added 8 minutes of hip and thoracic drills. Squat depth improved immediately.",
    tags: ["#Recovery", "#Training"],
    likes: 64,
    comments: 10,
  },
  {
    id: "post-15",
    author: { name: "DeskToDeadlift" },
    title: "From office chair to 100kg deadlift",
    content: "Took me 5 months with consistent training and sleep. Don't rush the process.",
    tags: ["#Training", "#Notes"],
    likes: 91,
    comments: 26,
  },
  {
    id: "post-16",
    author: { name: "CutPhaseZoe" },
    title: "Late-night cravings during fat loss",
    content: "Cravings hit hard after 10pm. Any tricks to stay consistent without bingeing?",
    tags: ["#Fat loss", "#Diet"],
    likes: 58,
    comments: 22,
  },
  {
    id: "post-17",
    author: { name: "StepCountSam" },
    title: "10k steps challenge check-in",
    content: "Hit my target 6 days in a row and my mood is noticeably better.",
    tags: ["#Fat loss", "#Notes"],
    likes: 31,
    comments: 7,
  },
  {
    id: "post-18",
    author: { name: "RehabRex" },
    title: "Back pain after rows - advice?",
    content: "I may be overextending at the top. Should I switch to chest-supported rows for now?",
    tags: ["#Recovery", "#Training"],
    likes: 44,
    comments: 13,
  },
  {
    id: "post-19",
    author: { name: "MacroMaya" },
    title: "How strict are you with macros on weekends?",
    content: "I track weekdays closely but relax on Saturdays. Curious how others balance consistency.",
    tags: ["#Diet", "#Notes"],
    likes: 69,
    comments: 24,
  },
  {
    id: "post-20",
    author: { name: "NightRunnerJay" },
    title: "Evening runs helping my sleep",
    content: "A light 20-minute jog after work reduced my stress and improved sleep quality.",
    tags: ["#Recovery", "#Training"],
    likes: 50,
    comments: 12,
  },
];

export function buildForumMockPosts() {
  const now = Date.now();
  return RAW_MOCK_POSTS.map((item, index) => {
    const offsetMs = ((index * 7 + 3) % (7 * 24)) * 60 * 60 * 1000;
    const createdAt = new Date(now - offsetMs).toISOString();
    return {
      _id: `mock-${item.id}`,
      userId: `mock-user-${index + 1}`,
      authorName: item.author.name,
      title: item.title,
      content: item.content,
      tags: item.tags.map((tag) => TAG_MAP[tag]).filter(Boolean),
      likeCount: item.likes,
      comments: buildInitialComments(index, createdAt),
      isLiked: false,
      likedByMe: false,
      createdAt,
    };
  });
}
