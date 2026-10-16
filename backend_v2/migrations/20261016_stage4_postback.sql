-- Stage 4/7: additive neutral CPA postback metadata. Never alter old rows.
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_key_hash VARCHAR(64);
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_params JSONB NOT NULL DEFAULT '{"click":"click_id","transaction":"transaction_id","status":"status","amount":"amount","currency":"currency"}'::jsonb;
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_status_map JSONB NOT NULL DEFAULT '{"pending":"pending","approved":"approved","rejected":"rejected"}'::jsonb;
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_last_received_at TIMESTAMPTZ;
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS network_id BIGINT;
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS vertical_slug VARCHAR(80);
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS partner_code VARCHAR(60);
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS postback_source VARCHAR(20);
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS external_status VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_conversions_network_id ON public.conversions(network_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_stage4_network_transaction ON public.conversions(network_id,transaction_id) WHERE postback_source='stage4';
-- Unique legacy conversions.click_id and the existing unique index are retained.
-- No changes to balances, conversion totals, holds or pre-existing statuses.
REVOKE ALL ON public.conversions FROM anon, authenticated;
