-- One-level rewards paid by the platform, separate from webmaster CPA funds.
CREATE TABLE public.referral_rewards (
 id BIGSERIAL PRIMARY KEY,
 inviter_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
 invitee_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
 withdrawal_id BIGINT NOT NULL UNIQUE REFERENCES public.withdrawals(id),
 amount NUMERIC(12,2) NOT NULL CHECK (amount>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(inviter_id<>invitee_id)
);
CREATE INDEX referral_rewards_inviter ON public.referral_rewards(inviter_id,invitee_id);
CREATE TABLE public.referral_withdrawals (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES public.users(telegram_id),
 request_id UUID NOT NULL,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>=50 AND amount<'Infinity'::numeric),
 wallet TEXT NOT NULL CHECK(wallet ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
 payment_method TEXT NOT NULL DEFAULT 'USDT TRC20' CHECK(payment_method='USDT TRC20'),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 processed_at TIMESTAMPTZ,
 processed_by BIGINT REFERENCES public.users(telegram_id),
 UNIQUE(user_id,request_id),
 CHECK((status='pending' AND processed_at IS NULL AND processed_by IS NULL)
    OR (status<>'pending' AND processed_at IS NOT NULL AND processed_by IS NOT NULL))
);
CREATE INDEX referral_withdrawals_user ON public.referral_withdrawals(user_id,status);
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_rewards,public.referral_withdrawals FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.referral_rewards_id_seq,public.referral_withdrawals_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.referral_credit_paid() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE inviter BIGINT;
BEGIN
 IF OLD.status='pending' AND NEW.status='paid' AND EXISTS(
   SELECT 1 FROM public.cpa_finance_epoch e WHERE e.id=1
    AND e.activated_at=NEW.cpa_real_epoch_at AND NEW.id>e.legacy_max_withdrawal_id
 ) THEN
   SELECT invited_by INTO inviter FROM public.users WHERE telegram_id=NEW.user_id;
   IF inviter IS NOT NULL AND inviter<>NEW.user_id THEN
     INSERT INTO public.referral_rewards(inviter_id,invitee_id,withdrawal_id,amount)
      VALUES(inviter,NEW.user_id,NEW.id,round(NEW.amount*0.05,2))
      ON CONFLICT(withdrawal_id) DO NOTHING;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER referral_credit_paid AFTER UPDATE OF status ON public.withdrawals
 FOR EACH ROW EXECUTE FUNCTION public.referral_credit_paid();
REVOKE EXECUTE ON FUNCTION public.referral_credit_paid() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.referral_immutable_reward() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'Referral rewards are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER referral_immutable_reward BEFORE UPDATE OR DELETE ON public.referral_rewards
 FOR EACH ROW EXECUTE FUNCTION public.referral_immutable_reward();
REVOKE EXECUTE ON FUNCTION public.referral_immutable_reward() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.referral_guard_withdrawal() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Referral withdrawal history is immutable'; END IF;
 IF OLD.status<>'pending' OR NEW.status NOT IN ('paid','rejected')
 OR (OLD.id,OLD.user_id,OLD.request_id,OLD.amount,OLD.wallet,OLD.payment_method,OLD.created_at)
 IS DISTINCT FROM (NEW.id,NEW.user_id,NEW.request_id,NEW.amount,NEW.wallet,NEW.payment_method,NEW.created_at)
 THEN RAISE EXCEPTION 'Invalid referral withdrawal transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER referral_guard_withdrawal BEFORE UPDATE OR DELETE ON public.referral_withdrawals
 FOR EACH ROW EXECUTE FUNCTION public.referral_guard_withdrawal();
REVOKE EXECUTE ON FUNCTION public.referral_guard_withdrawal() FROM PUBLIC,anon,authenticated,service_role;
