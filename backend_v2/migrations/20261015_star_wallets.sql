-- Dedicated non-withdrawable Telegram Stars wallet; never change users.balance.
-- Server-side PostgreSQL connections only (bot + FastAPI).
CREATE TABLE IF NOT EXISTS public.star_wallets (
    telegram_id BIGINT PRIMARY KEY REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    stars BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.star_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
    stars_amount INTEGER NOT NULL CHECK (stars_amount > 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    telegram_payment_charge_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_star_orders_user_time
    ON public.star_orders(telegram_id, created_at DESC);

ALTER TABLE public.star_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.star_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.star_wallets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.star_orders FROM PUBLIC, anon, authenticated;
-- All writes are from the trusted backend PostgreSQL connection.
