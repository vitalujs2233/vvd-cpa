-- Account-wide administrative blocks; existing balances and finance history remain untouched.
-- The default warning can be changed by a signed administrator.
CREATE TABLE IF NOT EXISTS public.vvd_account_block_settings (
    id smallint PRIMARY KEY CHECK (id = 1),
    title varchar(150) NOT NULL,
    message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
    version integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.vvd_account_block_settings(id,title,message)
VALUES (1,'Ваш аккаунт заблокирован',
    'Доступ к VVD CPA временно ограничен. Свяжитесь со службой поддержки для уточнения причины и рассмотрения блокировки.')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.vvd_account_block_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(telegram_id),
    admin_id bigint NOT NULL REFERENCES public.users(telegram_id),
    action varchar(10) NOT NULL CHECK (action IN ('block','unblock')),
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vvd_account_block_audit_user
    ON public.vvd_account_block_audit (user_id,created_at DESC);

-- The backend connects with the privileged PostgreSQL role.
ALTER TABLE public.vvd_account_block_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vvd_account_block_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vvd_account_block_settings, public.vvd_account_block_audit
    FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.vvd_account_block_audit_id_seq
    FROM PUBLIC,anon,authenticated;

-- Account block state is stored in existing public.users.status ('blocked').
-- Never modify balances, withdrawals, tickets, referrals or partner codes.
