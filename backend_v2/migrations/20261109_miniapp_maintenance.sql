-- Optional pre-provisioning migration for Mini App maintenance notice.
-- Only the new settings table is touched. Existing CPA and payout tables stay unchanged.
CREATE TABLE IF NOT EXISTS public.vvd_miniapp_maintenance (
    id INTEGER PRIMARY KEY CHECK (id=1),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    title VARCHAR(150) NOT NULL DEFAULT 'Технические работы',
    message TEXT NOT NULL,
    support_url VARCHAR(2048) NOT NULL,
    support_label VARCHAR(80) NOT NULL DEFAULT 'Связаться с поддержкой',
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.vvd_miniapp_maintenance (id,enabled,title,message,support_url,support_label)
VALUES (1,FALSE,'Технические работы',
        'В VVD CPA ведутся технические работы. За подробностями обращайтесь в службу поддержки.',
        'https://t.me/vvd_cpa_bot','Связаться с поддержкой')
ON CONFLICT (id) DO NOTHING;
