-- Stage 5 draft ONLY. Depends on PR #21 cpa_ledger.
-- Additive schema. Applying it does NOT activate real accounting.
-- NEVER run cpa_activate_finance_epoch without separate production approval.
-- A cutover is irreversible: preserves pre-existing clicks, conversions and withdrawals.
CREATE TABLE IF NOT EXISTS public.cpa_finance_epoch (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  activated_at TIMESTAMPTZ,
  legacy_max_withdrawal_id BIGINT,
  legacy_max_click_row_id BIGINT,
  CONSTRAINT ck_cpa_epoch_all_or_none CHECK (
    (activated_at IS NULL AND legacy_max_withdrawal_id IS NULL
      AND legacy_max_click_row_id IS NULL)
    OR (activated_at IS NOT NULL AND legacy_max_withdrawal_id IS NOT NULL
      AND legacy_max_click_row_id IS NOT NULL)
  )
);
INSERT INTO public.cpa_finance_epoch (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cpa_guard_finance_epoch()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Finance epoch cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF OLD.id<>NEW.id OR OLD.activated_at IS NOT NULL
     OR (NEW.activated_at IS NULL AND (
           NEW.legacy_max_withdrawal_id IS NOT NULL
           OR NEW.legacy_max_click_row_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Finance epoch cannot be moved or modified' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DO $ddl$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.cpa_finance_epoch'::regclass
                 AND tgname='trg_cpa_guard_finance_epoch' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_cpa_guard_finance_epoch BEFORE UPDATE OR DELETE
    ON public.cpa_finance_epoch FOR EACH ROW
    EXECUTE FUNCTION public.cpa_guard_finance_epoch();
  END IF;
END $ddl$;

-- TRUNCATE bypasses row-level DELETE triggers, so block it explicitly.
CREATE OR REPLACE FUNCTION public.cpa_guard_finance_epoch_truncate()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Finance epoch cannot be truncated' USING ERRCODE='23514';
END $$;
DO $ddl$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.cpa_finance_epoch'::regclass
                 AND tgname='trg_cpa_guard_finance_epoch_truncate' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_cpa_guard_finance_epoch_truncate BEFORE TRUNCATE
    ON public.cpa_finance_epoch FOR EACH STATEMENT
    EXECUTE FUNCTION public.cpa_guard_finance_epoch_truncate();
  END IF;
END $ddl$;

-- Manual future launch only: call inside its OWN dedicated authorized transaction.
-- Lock click, conversion and withdrawal writes while capturing one immutable boundary.
CREATE OR REPLACE FUNCTION public.cpa_activate_finance_epoch()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
BEGIN
  LOCK TABLE public.clicks,public.conversions,public.withdrawals
    IN SHARE ROW EXCLUSIVE MODE;
  UPDATE public.cpa_finance_epoch
     SET activated_at=clock_timestamp(),
         legacy_max_withdrawal_id=COALESCE((SELECT MAX(id) FROM public.withdrawals),0),
         legacy_max_click_row_id=COALESCE((SELECT MAX(id) FROM public.clicks),0)
   WHERE id=1 AND activated_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance epoch already activated' USING ERRCODE='23514';
  END IF;
END $$;

ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS cpa_real_epoch_at TIMESTAMPTZ;

-- No historical row may ever be reclassified as a real claim.
-- Real claim status transitions are pending -> paid/rejected only.
CREATE OR REPLACE FUNCTION public.cpa_guard_real_withdrawal()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE epoch RECORD;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.cpa_real_epoch_at IS DISTINCT FROM NEW.cpa_real_epoch_at
       OR OLD.id IS DISTINCT FROM NEW.id
       OR OLD.user_id IS DISTINCT FROM NEW.user_id
       OR OLD.amount IS DISTINCT FROM NEW.amount
       OR OLD.partner_code IS DISTINCT FROM NEW.partner_code THEN
      RAISE EXCEPTION 'Withdrawal identity/real classification is immutable'
        USING ERRCODE='23514';
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status AND
       (OLD.cpa_real_epoch_at IS NULL OR OLD.status<>'pending'
        OR NEW.status NOT IN ('paid','rejected')) THEN
      RAISE EXCEPTION 'Legacy/final withdrawal status cannot change'
        USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT activated_at,legacy_max_withdrawal_id
    INTO epoch FROM public.cpa_finance_epoch WHERE id=1 FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance epoch absent' USING ERRCODE='23514';
  END IF;
  IF NEW.cpa_real_epoch_at IS NULL THEN
    IF epoch.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy withdrawal creation disabled after cutover'
        USING ERRCODE='23514';
    END IF;
  ELSIF epoch.activated_at IS NULL OR
        NEW.cpa_real_epoch_at IS DISTINCT FROM epoch.activated_at
        OR NEW.id <= epoch.legacy_max_withdrawal_id
        OR NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Invalid real withdrawal classification'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DO $ddl$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.withdrawals'::regclass
                 AND tgname='trg_cpa_guard_real_withdrawal' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_cpa_guard_real_withdrawal BEFORE INSERT OR UPDATE
    ON public.withdrawals FOR EACH ROW
    EXECUTE FUNCTION public.cpa_guard_real_withdrawal();
  END IF;
END $ddl$;

ALTER TABLE public.cpa_finance_epoch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cpa_finance_epoch FROM PUBLIC,anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.cpa_activate_finance_epoch(),
 public.cpa_guard_finance_epoch(),public.cpa_guard_finance_epoch_truncate(),
 public.cpa_guard_real_withdrawal()
 FROM PUBLIC,anon,authenticated,service_role;
-- Do NOT weaken previously applied PR #22 withdrawals RLS/ACLs.
-- No UPDATE/DELETE of historical finance rows and no balance credit or release.
