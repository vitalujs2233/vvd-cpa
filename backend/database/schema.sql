-- Скрипт создания базы данных VVD CPA (Gold Premium) для PostgreSQL / Supabase
-- Позволяет развернуть все 10 таблиц со связями, ограничениями и индексами в одно нажатие.

-- Включаем поддержку генерации UUID, если она еще не включена в Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ (USERS)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY, -- Telegram ID имеет большой размер, используем BIGINT
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255),
    username VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    photo_url TEXT,
    balance DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    hold DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    withdrawn DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,
    role VARCHAR(50) DEFAULT 'user' NOT NULL, -- Роли: 'user', 'admin'
    status VARCHAR(50) DEFAULT 'active' NOT NULL, -- Статусы: 'active', 'inactive' (бан)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 2. ТАБЛИЦА ОФФЕРОВ (OFFERS)
-- ==========================================
CREATE TABLE IF NOT EXISTS offers (
    id VARCHAR(100) PRIMARY KEY, -- Уникальный текстовый ID (например, "adult-dating", "crypto")
    title VARCHAR(255) NOT NULL,
    offers_count INTEGER DEFAULT 0 NOT NULL,
    icon_name VARCHAR(100) NOT NULL,
    is_top BOOLEAN DEFAULT FALSE NOT NULL,
    is_new BOOLEAN DEFAULT FALSE NOT NULL,
    geo VARCHAR(100) DEFAULT 'Worldwide' NOT NULL,
    hold_days INTEGER DEFAULT 10 NOT NULL,
    payout_range VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    allowed_traffic TEXT[] NOT NULL, -- Массив разрешенных источников трафика
    forbidden_traffic TEXT[] NOT NULL, -- Массив запрещенных источников
    smartlink_suffix VARCHAR(100) UNIQUE NOT NULL, -- Хэш суффикс (например, "jgb123")
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 3. ТАБЛИЦА СМАРТЛИНКОВ ВЕБМАСТЕРОВ (SMARTLINKS)
-- ==========================================
CREATE TABLE IF NOT EXISTS smartlinks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    offer_id VARCHAR(100) REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
    suffix VARCHAR(100) UNIQUE NOT NULL, -- Сгенерированный суффикс редиректа
    url TEXT NOT NULL, -- Итоговая укороченная ссылка редиректа
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 4. ТАБЛИЦА ЛИДОВ И КОНВЕРСИЙ (CONVERSIONS)
-- ==========================================
CREATE TABLE IF NOT EXISTS conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    click_id VARCHAR(255) UNIQUE NOT NULL, -- Хэш клика из Traforce
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    offer_id VARCHAR(100) REFERENCES offers(id) ON DELETE CASCADE NOT NULL,
    payout_gross DECIMAL(12, 4) NOT NULL, -- Сумма выплаты от Traforce нам (грязная)
    payout_net DECIMAL(12, 4) NOT NULL, -- Чистая выплата за вычетом комиссии (вебмастеру)
    status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- Статусы: 'pending' (холд), 'approved', 'declined'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ==========================================
-- 5. ТАБЛИЦА ЕЖЕДНЕВНОЙ СТАТИСТИКИ (STATISTICS)
-- ==========================================
CREATE TABLE IF NOT EXISTS statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    clicks INTEGER DEFAULT 0 NOT NULL,
    conversions INTEGER DEFAULT 0 NOT NULL,
    income DECIMAL(12, 4) DEFAULT 0.0000 NOT NULL,
    -- Уникальный составной индекс: у одного вебмастера на одну дату может быть только одна строка статистики
    CONSTRAINT unique_user_date UNIQUE (user_id, date)
);

-- ==========================================
-- 6. ТАБЛИЦА ФИНАНСОВЫХ ВЫПЛАТ (WITHDRAW_REQUESTS)
-- ==========================================
CREATE TABLE IF NOT EXISTS withdraw_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    method VARCHAR(100) DEFAULT 'USDT TRC20' NOT NULL,
    address VARCHAR(255) NOT NULL,
    tx_id VARCHAR(255) DEFAULT '—' NOT NULL, -- Хеш транзакции в блокчейне Tron
    status VARCHAR(50) DEFAULT 'pending' NOT NULL, -- Статусы: 'pending', 'completed', 'declined'
    decline_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ==========================================
-- 7. ТАБЛИЦА СООБЩЕНИЙ СОЦСЕТИ ДВИЖ (CHAT_MESSAGES)
-- ==========================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    reactions JSONB DEFAULT '{}'::jsonb NOT NULL, -- Хранит пары "Эмодзи: Количество" в формате JSONB
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 8. ТАБЛИЦА СИСТЕМНЫХ УВЕДОМЛЕНИЙ (NOTIFICATIONS)
-- ==========================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- Типы: "conversion", "payout", "system"
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 9. ТАБЛИЦА ЛИЧНЫХ НАСТРОЕК (SETTINGS)
-- ==========================================
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE UNIQUE NOT NULL, -- У каждого юзера ровно одна строка настроек
    push_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    email_enabled BOOLEAN DEFAULT FALSE NOT NULL,
    language VARCHAR(50) DEFAULT 'Русский' NOT NULL,
    currency VARCHAR(50) DEFAULT 'USD' NOT NULL,
    is_2fa_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 10. ЖУРНАЛ ДЕЙСТВИЙ АДМИНИСТРАТОРА (ADMIN_LOGS)
-- ==========================================
CREATE TABLE IF NOT EXISTS admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE NOT NULL,
    action VARCHAR(255) NOT NULL, -- Название действия (блокировка, аппрув выплаты и т.д.)
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- === СОЗДАНИЕ ИНДЕКСОВ ДЛЯ СВЕРХБЫСТРОЙ ВЫБОРКИ ДАННЫХ (ОПТИМИЗАЦИЯ И ПРОИЗВОДИТЕЛЬНОСТЬ) ===
CREATE INDEX IF NOT EXISTS idx_smartlinks_suffix ON smartlinks(suffix);
CREATE INDEX IF NOT EXISTS idx_conversions_user_status ON conversions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_statistics_user_date ON statistics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_withdraw_user_status ON withdraw_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
