CREATE TABLE IF NOT EXISTS public.vvd_info_versions (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('draft','published','archived')), content JSONB NOT NULL, created_by BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ);
CREATE UNIQUE INDEX IF NOT EXISTS vvd_info_one_published_idx ON public.vvd_info_versions(status) WHERE status='published';
ALTER TABLE public.vvd_info_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vvd_info_versions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.vvd_info_images (id UUID PRIMARY KEY, mime TEXT NOT NULL, image BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.vvd_info_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vvd_info_images FROM anon, authenticated;
