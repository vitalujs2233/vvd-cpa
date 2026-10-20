-- VVD IQ Play only. Review and apply to isolated staging before any production rollout.
CREATE TABLE IF NOT EXISTS iq_questions (
 id BIGSERIAL PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1,
 prompt TEXT NOT NULL, options JSONB NOT NULL, correct_index SMALLINT NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
 category TEXT NOT NULL, difficulty SMALLINT NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
 enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options)=4)
);
CREATE UNIQUE INDEX IF NOT EXISTS iq_question_unique_prompt ON iq_questions(prompt);
CREATE TABLE IF NOT EXISTS iq_progress (
 user_id BIGINT PRIMARY KEY REFERENCES users(telegram_id), xp BIGINT NOT NULL DEFAULT 0 CHECK(xp>=0),
 games INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
 best_correct SMALLINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iq_rounds (
 id UUID PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(telegram_id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','lost','won')),
 question_index SMALLINT NOT NULL DEFAULT 0 CHECK(question_index BETWEEN 0 AND 15),
 retry BOOLEAN NOT NULL DEFAULT FALSE, used_retry BOOLEAN NOT NULL DEFAULT FALSE, blocked_index SMALLINT,
 deadline TIMESTAMPTZ NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
 correct_count SMALLINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
 CHECK(blocked_index IS NULL OR blocked_index BETWEEN 0 AND 3)
);
CREATE UNIQUE INDEX IF NOT EXISTS iq_one_active_round ON iq_rounds(user_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS iq_round_questions (
 round_id UUID NOT NULL REFERENCES iq_rounds(id) ON DELETE CASCADE,
 position SMALLINT NOT NULL CHECK(position BETWEEN 0 AND 14),
 question_id BIGINT NOT NULL REFERENCES iq_questions(id),
 question_version INTEGER NOT NULL, prompt TEXT NOT NULL, options JSONB NOT NULL,
 correct_index SMALLINT NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
 PRIMARY KEY(round_id,position)
);
CREATE TABLE IF NOT EXISTS iq_answer_events (
 id UUID PRIMARY KEY, round_id UUID NOT NULL REFERENCES iq_rounds(id),
 position SMALLINT NOT NULL, choice SMALLINT NOT NULL,
 result TEXT NOT NULL, xp_awarded INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iq_seen_questions (
 user_id BIGINT NOT NULL REFERENCES users(telegram_id),
 question_id BIGINT NOT NULL REFERENCES iq_questions(id),
 seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,question_id)
);
CREATE TABLE IF NOT EXISTS iq_achievements (
 code TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS iq_user_achievements (
 user_id BIGINT NOT NULL REFERENCES users(telegram_id),
 code TEXT NOT NULL REFERENCES iq_achievements(code),
 unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,code)
);
INSERT INTO iq_achievements(code,title,description) VALUES
('first_correct','Первый ответ','Ответить правильно впервые'),
('first_win','Первая победа','Завершить все 15 вопросов'),
('flawless','Безупречно','Победить без ошибок'),
('survivor','Второй шанс','Победить после ошибки'),
('ten_games','Постоянный игрок','Сыграть 10 раундов'),
('five_wins','Чемпион','Победить 5 раз'),
('level_ten','Знаток','Достичь 10 уровня')
ON CONFLICT DO NOTHING;
-- Access only through backend with signed Telegram initData; no browser direct table grants.
REVOKE ALL ON iq_questions,iq_progress,iq_rounds,iq_round_questions,iq_answer_events,iq_seen_questions,iq_achievements,iq_user_achievements FROM anon,authenticated;
