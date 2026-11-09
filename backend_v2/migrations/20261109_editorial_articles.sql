-- VVD CPA editorial section only. No changes to CPA, postback or finance tables.
CREATE TABLE IF NOT EXISTS public.vvd_editorial (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.vvd_editorial (id,version,content)
VALUES (1,1,'{"categories":[],"articles":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vvd_editorial_images (
  image_id VARCHAR(64) PRIMARY KEY,
  image_data BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
