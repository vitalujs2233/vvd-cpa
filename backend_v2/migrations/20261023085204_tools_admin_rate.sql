-- Tools only. Preserve fractional credit: 385 Stars * .013 = 5.005 USD.
ALTER TABLE public.tool_wallets ALTER COLUMN available TYPE numeric(18,6), ALTER COLUMN reserved TYPE numeric(18,6), ALTER COLUMN refund_debt TYPE numeric(18,6);
ALTER TABLE public.tool_transactions ALTER COLUMN amount TYPE numeric(18,6);
ALTER TABLE public.tool_payment_invoices ALTER COLUMN amount_usd TYPE numeric(18,6), ADD COLUMN usd_per_star numeric(12,6), ADD COLUMN requested_amount_usd numeric(14,2);
ALTER TABLE public.tool_payment_invoices DROP CONSTRAINT tool_stars_details;
ALTER TABLE public.tool_payment_invoices ADD CONSTRAINT tool_stars_details CHECK(provider<>'telegram_stars' OR
 (stars_amount IS NOT NULL AND stars_amount BETWEEN 1 AND 100000 AND request_id IS NOT NULL AND expires_at IS NOT NULL
 AND terms_version='tools-stars-v1' AND terms_version IS NOT NULL AND terms_accepted_at IS NOT NULL AND
 ((usd_per_star IS NULL AND stars_per_usd IS NOT NULL AND stars_per_usd BETWEEN 1 AND 100000 AND stars_amount=CEIL(amount_usd*stars_per_usd)) OR
 (usd_per_star IS NOT NULL AND usd_per_star BETWEEN .000001 AND 1 AND requested_amount_usd IS NOT NULL AND requested_amount_usd BETWEEN 5 AND 10000
 AND stars_amount=CEIL(requested_amount_usd/usd_per_star) AND amount_usd=stars_amount*usd_per_star))));
CREATE TABLE public.tool_payment_settings (
 id smallint PRIMARY KEY CHECK(id=1), usd_per_star numeric(12,6) NOT NULL CHECK(usd_per_star BETWEEN .000001 AND 1),
 enabled boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 1, updated_by bigint, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.tool_payment_settings(id,usd_per_star,enabled) VALUES(1,.013,true);
CREATE TABLE public.tool_settings_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id bigint NOT NULL, old_rate numeric(12,6) NOT NULL, new_rate numeric(12,6) NOT NULL,
 old_enabled boolean NOT NULL,new_enabled boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tool_transactions ADD COLUMN admin_actor_id bigint, ADD COLUMN admin_request_id uuid, ADD COLUMN reason text,
 ADD CONSTRAINT tool_manual_credit_details CHECK(admin_request_id IS NULL OR (admin_actor_id IS NOT NULL AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 5 AND 500 AND kind='adjustment' AND amount>0 AND status='success')),
 ADD CONSTRAINT tool_manual_credit_request_unique UNIQUE(admin_actor_id,admin_request_id);
ALTER TABLE public.tool_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_settings_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_payment_settings,public.tool_settings_audit FROM PUBLIC,anon,authenticated;
