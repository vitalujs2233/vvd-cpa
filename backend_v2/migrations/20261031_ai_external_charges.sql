-- AI Studio external-link metered replies, $0.008 USD per successful reply.
-- Existing production wallet and transaction amounts already support six decimal places.
CREATE TABLE IF NOT EXISTS public.tool_ai_charges (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 usage_id UUID NOT NULL UNIQUE,
 model_id UUID NOT NULL REFERENCES public.tool_ai_models(id) ON DELETE CASCADE,
 telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 amount NUMERIC(14,3) NOT NULL DEFAULT 0.008 CHECK(amount=0.008),
 status TEXT NOT NULL CHECK(status IN ('reserved','settled','released')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_ai_charges_owner ON public.tool_ai_charges(telegram_id,created_at DESC);
ALTER TABLE public.tool_ai_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_ai_charges FROM PUBLIC,anon,authenticated;
