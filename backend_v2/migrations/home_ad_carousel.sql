-- Additive carousel storage; no existing financial or user tables modified.
CREATE TABLE IF NOT EXISTS public.home_ad_banners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(160) NOT NULL,
 image_data bytea NOT NULL,
 image_mime varchar(32) NOT NULL DEFAULT 'image/webp',
 target_url varchar(2048) NOT NULL DEFAULT '',
 position integer NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT home_ad_image_size CHECK (octet_length(image_data) BETWEEN 1 AND 1500000)
);
CREATE INDEX IF NOT EXISTS home_ad_banners_order_idx ON public.home_ad_banners(position,created_at);
CREATE TABLE IF NOT EXISTS public.home_ad_settings (
 id smallint PRIMARY KEY CHECK (id=1),
 autoplay boolean NOT NULL DEFAULT false
);
INSERT INTO public.home_ad_settings(id,autoplay) VALUES(1,false) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.home_ad_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_ad_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.home_ad_banners FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.home_ad_settings FROM PUBLIC, anon, authenticated;
