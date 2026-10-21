-- DEMO TOP-UP: separate ledger; never use tool_wallets or tool_transactions.
CREATE TABLE IF NOT EXISTS public.tool_demo_topups (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
 amount NUMERIC(14,2) NOT NULL CHECK(amount BETWEEN 5 AND 10000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_demo_topups_user_created ON public.tool_demo_topups(telegram_id,created_at DESC);
ALTER TABLE public.tool_demo_topups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_demo_topups FROM PUBLIC,anon,authenticated;
-- Only authenticated FastAPI backend uses this table.
