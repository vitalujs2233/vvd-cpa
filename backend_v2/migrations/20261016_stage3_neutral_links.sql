-- Stage 3: new per-offer links without replacing legacy /go or altering balances.
-- Production currently has zero rows in smartlinks; preserve all future/legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS ux_smartlinks_user_offer ON public.smartlinks(user_id,offer_id);
ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS offer_id VARCHAR(80);
ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS network_id BIGINT;
ALTER TABLE public.clicks ADD COLUMN IF NOT EXISTS smartlink_id UUID;
CREATE INDEX IF NOT EXISTS idx_clicks_offer_id ON public.clicks(offer_id);
CREATE INDEX IF NOT EXISTS idx_clicks_network_id ON public.clicks(network_id);
-- These are optional to preserve the historical 691 records.
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS click_param VARCHAR(48);
ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS click_param_override VARCHAR(48);
-- Never expose private network parameters directly to anon/authenticated roles.
REVOKE ALL ON public.smartlinks FROM anon,authenticated;
REVOKE ALL ON public.clicks FROM anon,authenticated;
