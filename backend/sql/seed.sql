INSERT INTO courses (title, description, level, duration_min, coach_name, scheduled_at, capacity) VALUES
('Morning Yoga', 'Relaxing yoga for beginners', 'beginner', 45, 'Alice', datetime('now', '+1 day'), 20),
('HIIT Blast', 'High intensity interval training', 'intermediate', 30, 'Bob', datetime('now', '+2 day'), 15);

INSERT INTO workouts (name, type, description, calories_per_hour, difficulty) VALUES
('Jogging', 'cardio', 'Light outdoor running', 450, 'easy'),
('Push-up Training', 'strength', 'Upper body training', 300, 'medium'),
('Stretch Flow', 'flexibility', 'Flexibility and mobility', 180, 'easy');
