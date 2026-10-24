-- Additive CyberYozh preparation. No wallet balance updates or existing data changes.
CREATE UNIQUE INDEX IF NOT EXISTS tool_orders_id_owner_idx ON public.tool_orders(id,telegram_id);
CREATE TABLE IF NOT EXISTS public.tool_cyberyozh_orders (
  order_id UUID PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  request_id UUID NOT NULL,
  selection JSONB NOT NULL,
  wholesale NUMERIC(20,6) NOT NULL CHECK (wholesale >= 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN
    ('reserved','dispatched','awaiting_provider','unknown','issued','rejected','refunded')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(telegram_id,request_id),
  FOREIGN KEY(order_id,telegram_id) REFERENCES public.tool_orders(id,telegram_id)
);
CREATE TABLE IF NOT EXISTS public.tool_cyberyozh_items (
  provider_order_id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.tool_cyberyozh_orders(order_id)
);
CREATE INDEX IF NOT EXISTS tool_cyberyozh_items_order_idx ON public.tool_cyberyozh_items(order_id);
CREATE INDEX IF NOT EXISTS tool_cyberyozh_pending_idx ON public.tool_cyberyozh_orders(updated_at)
 WHERE state IN ('dispatched','awaiting_provider','unknown');
ALTER TABLE public.tool_cyberyozh_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_cyberyozh_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tool_cyberyozh_orders,public.tool_cyberyozh_items FROM PUBLIC,anon,authenticated;
-- Telegram ownership is checked by the existing backend; no direct browser policies.
INSERT INTO public.tool_providers(id,title,kind,status,config_reference)
VALUES ('cyberyozh','CyberYozh','numbers_proxy','unavailable','CYBERYOZH_API_KEY')
ON CONFLICT(id) DO NOTHING;
