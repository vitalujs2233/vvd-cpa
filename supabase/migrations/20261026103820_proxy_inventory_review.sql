-- Isolated delivery metadata only. No wallet, price or payment changes.
CREATE TABLE public.tool_proxy_reviews (
    order_id uuid PRIMARY KEY REFERENCES public.tool_proxy_order_intents(id),
    state text NOT NULL CHECK (state IN ('waiting','partial','manual_review','approved')),
    report jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tool_proxy_assignments (
    proxy_type text NOT NULL CHECK (proxy_type IN ('ipv4','isp','mobile')),
    proxy_id text NOT NULL CHECK (length(proxy_id)>0),
    order_id uuid NOT NULL REFERENCES public.tool_proxy_order_intents(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(proxy_type,proxy_id)
);
CREATE INDEX tool_proxy_assignments_order_idx ON public.tool_proxy_assignments(order_id);
CREATE TABLE public.tool_proxy_review_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.tool_proxy_order_intents(id),
    actor_id bigint,
    action text NOT NULL,
    report jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tool_proxy_review_audit_order_idx ON public.tool_proxy_review_audit(order_id,created_at);
ALTER TABLE public.tool_proxy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_proxy_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_proxy_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_proxy_reviews,public.tool_proxy_assignments,public.tool_proxy_review_audit FROM PUBLIC,anon,authenticated;
-- Backend SQL connection is privileged; client access is exclusively through signed routes.
-- Rollback: deploy the previous backend first; archive audit/assignments before removing
-- these three tables. Never discard ownership history to release a supplier lane.
