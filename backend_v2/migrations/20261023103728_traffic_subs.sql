-- Optional webmaster tags on original clicks. Existing rows retain NULL tags.
ALTER TABLE public.clicks
  ADD COLUMN IF NOT EXISTS sub1 varchar(128),
  ADD COLUMN IF NOT EXISTS sub2 varchar(128),
  ADD COLUMN IF NOT EXISTS sub3 varchar(128),
  ADD COLUMN IF NOT EXISTS sub4 varchar(128),
  ADD COLUMN IF NOT EXISTS sub5 varchar(128);
CREATE INDEX IF NOT EXISTS idx_clicks_owner_created ON public.clicks(user_id, created_at);
