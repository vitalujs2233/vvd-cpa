-- AI Studio v2: additive schema, existing CPA tables untouched.
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS chat_style TEXT NOT NULL DEFAULT 'friendly';
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS reply_length TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS photo_mode TEXT NOT NULL DEFAULT 'combined';
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS link_kind TEXT NOT NULL DEFAULT 'external';
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS smartlink_id UUID REFERENCES public.smartlinks(id) ON DELETE SET NULL;
ALTER TABLE public.tool_ai_models ADD COLUMN IF NOT EXISTS spend_limit NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.tool_ai_models ADD CONSTRAINT tool_ai_spend_nonnegative CHECK(spend_limit >= 0);
CREATE TABLE IF NOT EXISTS public.tool_ai_photos (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), model_id UUID NOT NULL REFERENCES public.tool_ai_models(id) ON DELETE CASCADE,
 owner_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 object_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', auto_allowed BOOLEAN NOT NULL DEFAULT false,
 send_rule TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tool_ai_sessions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 model_id UUID NOT NULL REFERENCES public.tool_ai_models(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
 messages_count INTEGER NOT NULL DEFAULT 0 CHECK(messages_count >= 0),
 ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS tool_ai_sessions_model_date ON public.tool_ai_sessions(model_id,created_at);
CREATE TABLE IF NOT EXISTS public.tool_ai_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id UUID NOT NULL REFERENCES public.tool_ai_sessions(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')),
 content TEXT NOT NULL CHECK(length(content) <= 4000),
 photo_id UUID REFERENCES public.tool_ai_photos(id) ON DELETE SET NULL,
 input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
 output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_ai_messages_session_date ON public.tool_ai_messages(session_id,created_at);
CREATE TABLE IF NOT EXISTS public.tool_ai_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 model_id UUID NOT NULL REFERENCES public.tool_ai_models(id) ON DELETE CASCADE,
 session_id UUID REFERENCES public.tool_ai_sessions(id) ON DELETE SET NULL,
 kind TEXT NOT NULL CHECK(kind IN ('visit','conversation','message','offer_click','offer_view')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_ai_events_model_kind ON public.tool_ai_events(model_id,kind);
CREATE TABLE IF NOT EXISTS public.tool_ai_usage (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 model_id UUID NOT NULL REFERENCES public.tool_ai_models(id) ON DELETE CASCADE,
 session_id UUID NOT NULL REFERENCES public.tool_ai_sessions(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, input_tokens INTEGER NOT NULL CHECK(input_tokens >= 0),
 output_tokens INTEGER NOT NULL CHECK(output_tokens >= 0),
 cost_usd NUMERIC(14,6) NOT NULL DEFAULT 0 CHECK(cost_usd >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_ai_usage_model ON public.tool_ai_usage(model_id);
ALTER TABLE public.tool_ai_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ai_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_ai_photos,public.tool_ai_sessions,public.tool_ai_messages,public.tool_ai_events,public.tool_ai_usage FROM PUBLIC, anon, authenticated;
