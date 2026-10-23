CREATE TABLE IF NOT EXISTS public.home_info_blocks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(180) NOT NULL,
 subtitle varchar(180) NOT NULL DEFAULT '',
 description varchar(1200) NOT NULL DEFAULT '',
 image_data bytea,
 target_url varchar(2048) NOT NULL DEFAULT '',
 is_active boolean NOT NULL DEFAULT false,
 position integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT home_info_image_size CHECK (image_data IS NULL OR octet_length(image_data) BETWEEN 1 AND 1500000)
);
CREATE INDEX IF NOT EXISTS home_info_blocks_order_idx ON public.home_info_blocks(position,created_at);
ALTER TABLE public.home_info_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.home_info_blocks FROM PUBLIC,anon,authenticated;
INSERT INTO public.home_info_blocks(title,subtitle,description,is_active,position)
SELECT 'РАБОТАЕМ ПО ВСЕМУ МИРУ','🌏 VVD CPA','Глобальная монетизация трафика через смартлинки. Доступность предложений зависит от GEO и условий рекламодателей.',true,0
WHERE NOT EXISTS (SELECT 1 FROM public.home_info_blocks);
