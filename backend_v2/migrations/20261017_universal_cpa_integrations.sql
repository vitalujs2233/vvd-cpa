-- Additive universal CPA integration controls. NEVER apply to production without approval.
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS postback_method VARCHAR(16) NOT NULL DEFAULT 'POST_JSON';
ALTER TABLE public.cpa_networks DROP CONSTRAINT IF EXISTS cpa_networks_postback_method_check;
ALTER TABLE public.cpa_networks ADD CONSTRAINT cpa_networks_postback_method_check
    CHECK (postback_method IN ('POST_JSON','GET_QUERY'));
ALTER TABLE public.cpa_verticals ADD COLUMN IF NOT EXISTS cpa_link_allowed BOOLEAN NOT NULL DEFAULT FALSE;
-- Preserve previously approved neutral vertical behavior; new/renamed categories are denied by default.
UPDATE public.cpa_verticals SET cpa_link_allowed=TRUE
WHERE slug IN ('utilities','education','productivity','software','technology') AND cpa_link_allowed=FALSE;

-- Optional external report label, distinct from per-click UUID; existing rows remain unchanged.
ALTER TABLE public.cpa_networks ADD COLUMN IF NOT EXISTS partner_param VARCHAR(48);
