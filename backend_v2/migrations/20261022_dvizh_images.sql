-- Isolated Dvizh chat image attachments. Existing messages are preserved.
CREATE TABLE IF NOT EXISTS public.dvizh_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id bigint NOT NULL,
 message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
 mime_type text NOT NULL DEFAULT 'image/webp',
 image_data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT dvizh_image_size CHECK (octet_length(image_data) BETWEEN 1 AND 1500000)
);
CREATE INDEX IF NOT EXISTS dvizh_images_by_message ON public.dvizh_images(message_id);
CREATE INDEX IF NOT EXISTS dvizh_images_pending ON public.dvizh_images(owner_id,created_at) WHERE message_id IS NULL;
ALTER TABLE public.dvizh_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dvizh_images FROM anon, authenticated;
