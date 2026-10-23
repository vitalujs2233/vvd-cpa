-- Add Stars to the existing invoice/ledger, preserving all existing balances.
ALTER TABLE public.tool_payment_invoices DROP CONSTRAINT tool_payment_invoices_provider_check;
ALTER TABLE public.tool_payment_invoices ADD CONSTRAINT tool_payment_invoices_provider_check CHECK(provider IN ('crypto_pay','telegram_stars'));
ALTER TABLE public.tool_payment_invoices DROP CONSTRAINT tool_payment_invoices_status_check;
ALTER TABLE public.tool_payment_invoices ADD CONSTRAINT tool_payment_invoices_status_check CHECK(status IN ('draft','pending','paid','expired','cancelled','failed','refunded'));
ALTER TABLE public.tool_payment_invoices
 ADD COLUMN stars_amount INTEGER,
 ADD COLUMN stars_per_usd NUMERIC(18,6),
 ADD COLUMN request_id UUID,
 ADD COLUMN checkout_query_id TEXT,
 ADD COLUMN expires_at TIMESTAMPTZ,
 ADD COLUMN refunded_at TIMESTAMPTZ,
 ADD CONSTRAINT tool_stars_details CHECK(provider<>'telegram_stars' OR
   (stars_amount IS NOT NULL AND stars_amount BETWEEN 1 AND 100000
    AND stars_per_usd IS NOT NULL AND stars_per_usd BETWEEN 1 AND 100000
    AND stars_amount=CEIL(amount_usd*stars_per_usd)
    AND request_id IS NOT NULL AND expires_at IS NOT NULL)),
 ADD CONSTRAINT tool_stars_settled CHECK(provider<>'telegram_stars' OR status NOT IN ('paid','refunded') OR
   (provider_invoice_id IS NOT NULL AND paid_at IS NOT NULL)),
 ADD CONSTRAINT tool_stars_refunded CHECK(status<>'refunded' OR refunded_at IS NOT NULL),
 ADD CONSTRAINT tool_invoice_request_unique UNIQUE(telegram_id,request_id),
 ADD CONSTRAINT tool_invoice_owner_unique UNIQUE(id,telegram_id);
ALTER TABLE public.tool_transactions ADD COLUMN payment_invoice_id UUID,
 ADD CONSTRAINT tool_tx_invoice_owner FOREIGN KEY(payment_invoice_id,telegram_id)
 REFERENCES public.tool_payment_invoices(id,telegram_id);
CREATE UNIQUE INDEX tool_tx_invoice_kind_unique ON public.tool_transactions(payment_invoice_id,kind)
 WHERE payment_invoice_id IS NOT NULL;
ALTER TABLE public.tool_wallets ADD COLUMN refund_debt NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(refund_debt>=0);
ALTER TABLE public.tool_payment_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_payment_invoices,public.tool_transactions,public.tool_wallets FROM PUBLIC,anon,authenticated;
