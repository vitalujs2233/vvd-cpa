-- Records authorization for already-submitted production orders. No activation,
-- backfill, wallet change, public grant or new purchase is performed by this DDL.
ALTER TABLE public.tool_proxy_order_intents ADD COLUMN fulfillment_authority jsonb;
ALTER TABLE public.tool_proxy_order_intents ADD CONSTRAINT proxy_production_authority_valid CHECK (
  fulfillment_authority IS NULL OR (
    jsonb_typeof(fulfillment_authority)='object'
    AND proxy_type IN ('ipv4','isp','mobile')
    AND fulfillment_authority @> '{"mode":"production","exclusive_account":true}'::jsonb
    AND fulfillment_authority->>'proxy_type'=proxy_type
    AND coalesce(fulfillment_authority->>'financial_acceptance_ref','') ~ '^[A-Za-z0-9_.:/#-]{3,120}$'
  ) IS TRUE
);
CREATE INDEX proxy_production_pending_idx ON public.tool_proxy_order_intents(supplier_submitted_at)
  WHERE fulfillment_authority IS NOT NULL AND status IN ('submitting','uncertain','fulfilled');
