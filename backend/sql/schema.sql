CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'user',
  is_active INTEGER DEFAULT 1,
  gender TEXT,
  height_cm REAL,
  weight_kg REAL,
  age INTEGER,
  target_weight_kg REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  gender TEXT NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  age INTEGER NOT NULL,
  target_weight_kg REAL NOT NULL,
  bmi REAL NOT NULL,
  bmi_category TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  calories_per_hour INTEGER,
  difficulty TEXT DEFAULT 'easy',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  workout_id INTEGER NOT NULL,
  duration_min INTEGER NOT NULL,
  calories_burned INTEGER,
  record_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diet_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  meal_type TEXT NOT NULL,
  food_name TEXT NOT NULL,
  calories INTEGER,
  protein_g REAL,
  carb_g REAL,
  fat_g REAL,
  record_date TEXT NOT NULL,
  advice TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  schedule_type TEXT NOT NULL,
  related_id INTEGER,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT DEFAULT 'planned',
  remark TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forum_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_name TEXT DEFAULT 'monthly',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Additional MVP tables used by existing APIs
CREATE TABLE IF NOT EXISTS bmi_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  bmi REAL NOT NULL,
  bmi_category TEXT NOT NULL,
  recorded_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT DEFAULT 'beginner',
  duration_min INTEGER NOT NULL,
  coach_name TEXT,
  scheduled_at TEXT,
  capacity INTEGER DEFAULT 20,
  cover_image TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  status TEXT DEFAULT 'booked',
  booked_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
