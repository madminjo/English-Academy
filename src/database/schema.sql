CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,

    level TEXT DEFAULT 'A1',
    current_day INTEGER DEFAULT 1,

    xp INTEGER DEFAULT 0,
    words_learned INTEGER DEFAULT 0,
    lessons_completed INTEGER DEFAULT 0,
    exams_passed INTEGER DEFAULT 0,

    streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);