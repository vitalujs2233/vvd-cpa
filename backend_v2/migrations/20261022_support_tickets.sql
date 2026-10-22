-- VVD CPA: private support tickets. Apply only after reviewing the PR.
CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  user_telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
  subject VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_owner_idx ON support_tickets(user_telegram_id, created_at DESC);
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_telegram_id BIGINT NOT NULL,
  sender_role VARCHAR(8) NOT NULL CHECK (sender_role IN ('user','admin')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages(ticket_id,id);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON support_tickets, support_ticket_messages FROM anon, authenticated;
