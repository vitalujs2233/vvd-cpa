-- Isolated home ticker data, no changes to existing tables.
CREATE TABLE IF NOT EXISTS public.home_ticker_settings (
 id smallint PRIMARY KEY CHECK(id=1),
 enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.home_ticker_settings(id,enabled) VALUES(1,false) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.home_ticker_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 body varchar(500) NOT NULL CHECK(length(trim(body))>0),
 color varchar(8) NOT NULL DEFAULT 'gold' CHECK(color IN ('gold','green','red')),
 target_url varchar(2048) NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT true,
 position integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS home_ticker_messages_position_idx ON public.home_ticker_messages(position,created_at);
ALTER TABLE public.home_ticker_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_ticker_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.home_ticker_settings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.home_ticker_messages FROM PUBLIC,anon,authenticated;
