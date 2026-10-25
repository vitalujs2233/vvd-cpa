-- Additive ledger metadata for future approved tools. Existing orders remain untouched.
ALTER TABLE public.tool_orders ALTER COLUMN cost TYPE numeric(20,8);
ALTER TABLE public.tool_orders
 ADD COLUMN IF NOT EXISTS ledger_request_id uuid,
 ADD COLUMN IF NOT EXISTS ledger_state text CHECK(ledger_state IN ('reserved','submitting','unknown','settled','released','refunded')),
 ADD COLUMN IF NOT EXISTS ledger_selection jsonb,
 ADD COLUMN IF NOT EXISTS ledger_currency text CHECK(ledger_currency='USD'),
 ADD COLUMN IF NOT EXISTS ledger_markup numeric(10,4) CHECK(ledger_markup>=0 AND ledger_markup<=1000),
 ADD COLUMN IF NOT EXISTS ledger_updated_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS tool_order_ledger_request_unique ON public.tool_orders(telegram_id,ledger_request_id);
ALTER TABLE public.tool_orders ADD CONSTRAINT tool_order_ledger_complete CHECK(
 ledger_request_id IS NULL OR (ledger_state IS NOT NULL AND ledger_selection IS NOT NULL AND
 ledger_currency IS NOT NULL AND ledger_markup IS NOT NULL AND ledger_updated_at IS NOT NULL AND
 cost>0 AND cost IS NOT NULL AND amount>0 AND provider_id IS NOT NULL));
-- RLS and backend-only table grants are already enabled; no client grants are added.
