-- VVD Dvizh replies and mentions only. Apply before deploying backend changes.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS mention_ids bigint[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS chat_messages_reply_to_idx ON public.chat_messages(reply_to_id);
CREATE TABLE IF NOT EXISTS public.chat_interaction_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id bigint NOT NULL,
  actor_id bigint NOT NULL,
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reply','mention')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id, message_id)
);
CREATE INDEX IF NOT EXISTS chat_interaction_notifications_recipient_idx
  ON public.chat_interaction_notifications (recipient_id, created_at DESC);
ALTER TABLE public.chat_interaction_notifications ENABLE ROW LEVEL SECURITY;
-- No direct client grants. Routes use the existing authenticated FastAPI backend.
REVOKE ALL ON public.chat_interaction_notifications FROM anon, authenticated;
