-- Private storage bucket for AI character media; only backend service-role may access.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('ai-character-media','ai-character-media',false,4000000,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=4000000,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
-- No anon/authenticated storage.objects policy: browser uploads are prohibited.
