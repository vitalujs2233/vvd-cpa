-- VVD CPA Stage 5.2.2: protect existing withdrawals from direct Supabase Data API.
-- PREPARED ONLY. Do not apply to production without separate owner permission.
-- Run the whole file in a transaction. No data UPDATE/DELETE/INSERT.
-- Existing SQLAlchemy backend_v2 remains owner/privileged PostgreSQL client.
-- Frontend uses backend_v2 routes, NOT the Supabase withdrawals Data API.

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

-- Supabase's default ACLs on public tables grant privileges to API roles.
-- RLS alone is not enough: DELETE, UPDATE, TRUNCATE and direct reads must
-- all be denied, even if future policies are accidentally created.
REVOKE ALL PRIVILEGES ON TABLE public.withdrawals
  FROM PUBLIC, anon, authenticated;

-- The BIGSERIAL/IDENTITY-backed withdrawal ID sequence is a separate object.
-- Client roles do not require nextval(), currval(), SELECT, or setval() rights.
REVOKE ALL PRIVILEGES ON SEQUENCE public.withdrawals_id_seq
  FROM PUBLIC, anon, authenticated;

-- Intentionally retain existing owner 'postgres' and existing service_role
-- grants (service_role has BYPASSRLS). No client RLS policies are created.
-- Do not grant privileges to any other role until the live Render
-- DATABASE_URL username has been independently verified.
-- Idempotent; changes only ACL metadata and relrowsecurity, never row or sequence values.
