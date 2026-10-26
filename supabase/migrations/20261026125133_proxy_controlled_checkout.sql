-- Empty control tables: applying this migration does not authorize a purchase.
CREATE TABLE public.tool_proxy_control_permits (
    order_id uuid PRIMARY KEY REFERENCES public.tool_proxy_order_intents(id),
    permit_id uuid NOT NULL UNIQUE,
    max_amount_usd numeric(14,2) NOT NULL CHECK(max_amount_usd>0),
    expires_at timestamptz NOT NULL,
    actor_id bigint NOT NULL,
    evidence_ref text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    consumed_at timestamptz,
    revoked_at timestamptz,
    CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);
CREATE TABLE public.tool_proxy_financial_resolutions (
    decision_id uuid PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.tool_proxy_order_intents(id),
    outcome text NOT NULL CHECK(outcome IN ('paid','rejected','refunded')),
    actor_id bigint NOT NULL,
    payload jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(order_id,outcome)
);
ALTER TABLE public.tool_proxy_control_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_proxy_financial_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_proxy_control_permits,public.tool_proxy_financial_resolutions FROM PUBLIC,anon,authenticated;
-- Keep permits, decisions and ownership history on rollback. Never clear consumed_at.
