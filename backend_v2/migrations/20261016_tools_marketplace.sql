-- USD tools marketplace. Separate from all CPA accounting.
CREATE TABLE IF NOT EXISTS public.tool_wallets (
 telegram_id BIGINT PRIMARY KEY REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 available NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available >= 0),
 reserved NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
 currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.tool_services (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 category TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'unavailable' CHECK(status IN ('unavailable','connecting','available')),
 price NUMERIC(14,2) CHECK(price >= 0),
 provider_id TEXT
);
CREATE TABLE IF NOT EXISTS public.tool_providers (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'unavailable',
 config_reference TEXT
);
CREATE TABLE IF NOT EXISTS public.tool_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 service_id TEXT NOT NULL REFERENCES public.tool_services(id),
 provider_id TEXT,
 provider_order_id TEXT,
 cost NUMERIC(14,2),
 amount NUMERIC(14,2) NOT NULL CHECK(amount >= 0),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','active','failed','cancelled','refunded')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider_id, provider_order_id)
);
CREATE TABLE IF NOT EXISTS public.tool_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 order_id UUID REFERENCES public.tool_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('topup','purchase','refund','adjustment')),
 amount NUMERIC(14,2) NOT NULL,
 currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 status TEXT NOT NULL CHECK(status IN ('pending','processing','success','failed','refunded')),
 external_payment_id TEXT UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.tool_ai_models (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 slug TEXT NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
 description TEXT NOT NULL DEFAULT '',
 language TEXT NOT NULL DEFAULT 'ru',
 persona TEXT NOT NULL DEFAULT '',
 greeting TEXT NOT NULL DEFAULT '',
 offer_description TEXT NOT NULL DEFAULT '',
 knowledge TEXT NOT NULL DEFAULT '',
 goal TEXT NOT NULL DEFAULT '',
 restrictions TEXT NOT NULL DEFAULT '',
 photo_url TEXT,
 affiliate_url TEXT,
 button_label TEXT NOT NULL DEFAULT 'Узнать больше',
 extra_url TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','disabled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_tx_user_created ON public.tool_transactions(telegram_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_orders_user_created ON public.tool_orders(telegram_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_models_user ON public.tool_ai_models(telegram_id);
INSERT INTO public.tool_services(id,title,category,description,status) VALUES
 ('ai','AI-модели','ai','Создание и управление AI-персонажами','connecting'),
 ('numbers','Виртуальные номера','numbers','Номера для разрешённых сервисов','unavailable'),
 ('proxy','Прокси','proxy','Доступ к прокси через поставщика','unavailable')
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.tool_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ai_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_wallets,public.tool_services,public.tool_providers,public.tool_orders,public.tool_transactions,public.tool_ai_models FROM PUBLIC,anon,authenticated;
-- API accessed ONLY through signed-Telegram backend; public profiles use a filtered FastAPI view.
