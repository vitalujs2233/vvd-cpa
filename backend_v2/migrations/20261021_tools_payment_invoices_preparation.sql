-- Prepared real-payment invoice storage. No API routes or credits enabled by this migration.
-- Isolated from demo top-ups and from the real wallet until a reviewed settlement flow exists.
CREATE TABLE IF NOT EXISTS public.tool_payment_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('crypto_pay')),
  provider_invoice_id TEXT,
  amount_usd NUMERIC(14,2) NOT NULL CHECK (amount_usd BETWEEN 5 AND 10000),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','paid','expired','cancelled','failed')),
  payment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  CONSTRAINT tool_invoice_provider_id_unique UNIQUE(provider,provider_invoice_id),
  CONSTRAINT tool_invoice_paid_timestamp CHECK (status <> 'paid' OR paid_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_tool_payment_invoices_owner ON public.tool_payment_invoices(telegram_id,created_at DESC);
ALTER TABLE public.tool_payment_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_payment_invoices FROM PUBLIC,anon,authenticated;
-- Settlement must be atomic and idempotent, using a unique external_payment_id
-- in tool_transactions, and must never trust a browser-supplied paid status.
