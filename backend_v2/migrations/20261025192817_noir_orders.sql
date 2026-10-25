-- Private delivery metadata; existing wallets and other providers are unchanged.
ALTER TABLE public.tool_orders ADD COLUMN IF NOT EXISTS noir_delivery jsonb;
ALTER TABLE public.tool_orders ADD COLUMN IF NOT EXISTS noir_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS tool_noir_pending ON public.tool_orders(ledger_updated_at) WHERE provider_id='noir_sms' AND ledger_state IN ('submitting','unknown','settled');
