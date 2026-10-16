-- Stage 5.2 ONLY: additive, not applied to production by this PR.
-- No historical data updates, no finance scheduler, no postback integration.
ALTER TABLE public.conversions
  ADD COLUMN IF NOT EXISTS finance_eligible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finance_approved_at TIMESTAMPTZ;

-- Old rows (including the single stage-4 test) remain NULL/NULL.
ALTER TABLE public.conversions
  ADD CONSTRAINT ck_cpa_finance_scope
  CHECK (
    finance_eligible_at IS NULL OR is_test = FALSE
  );
ALTER TABLE public.conversions
  ADD CONSTRAINT ck_cpa_finance_approval
  CHECK (
    finance_approved_at IS NULL OR (
      finance_eligible_at IS NOT NULL
      AND finance_approved_at >= finance_eligible_at
      AND is_test = FALSE
    )
  );

-- Finance opt-in is INSERT-ONLY. A late postback/UPDATE can never opt in
-- an existing historical conversion. Future stage 5.3 explicitly opts in
-- newly INSERTED genuine conversions only; there is no column DEFAULT.
CREATE FUNCTION public.cpa_finance_lock_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.finance_eligible_at IS DISTINCT FROM NEW.finance_eligible_at THEN
    RAISE EXCEPTION 'Finance eligibility is immutable after insert'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.finance_approved_at IS NOT NULL
    AND OLD.finance_approved_at IS DISTINCT FROM NEW.finance_approved_at THEN
    RAISE EXCEPTION 'Finance approval timestamp is immutable once set'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cpa_finance_lock_scope
  BEFORE UPDATE ON public.conversions
  FOR EACH ROW EXECUTE FUNCTION public.cpa_finance_lock_scope();

CREATE TABLE public.cpa_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id UUID NOT NULL REFERENCES public.conversions(id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE RESTRICT,
  operation_type VARCHAR(40) NOT NULL,
  event_key VARCHAR(180) NOT NULL UNIQUE,
  amount NUMERIC(18,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  hold_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
  platform_fee_delta NUMERIC(18,2) NOT NULL DEFAULT 0,
  original_entry_id UUID REFERENCES public.cpa_ledger(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  hold_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type VARCHAR(20) NOT NULL,
  actor_id BIGINT,
  reason_code VARCHAR(60),
  CONSTRAINT ck_cpa_ledger_currency CHECK (currency = 'USD'),
  CONSTRAINT ck_cpa_ledger_amount CHECK (amount >= 0),
  CONSTRAINT ck_cpa_ledger_actor CHECK (
    actor_type IN ('postback','scheduler','admin')
    AND (actor_type <> 'admin' OR (actor_id IS NOT NULL AND reason_code IS NOT NULL))
  ),
  CONSTRAINT ck_cpa_ledger_shape CHECK (
    (operation_type = 'hold_credit'
      AND amount > 0 AND hold_delta = amount AND balance_delta = 0
      AND platform_fee_delta = 0 AND original_entry_id IS NULL
      AND approved_at IS NOT NULL
      AND hold_until = approved_at + INTERVAL '240 hours'
      AND actor_type = 'postback')
    OR
    (operation_type = 'platform_fee_accrual'
      AND hold_delta = 0 AND balance_delta = 0
      AND platform_fee_delta = amount AND original_entry_id IS NULL
      AND approved_at IS NOT NULL AND hold_until IS NULL
      AND actor_type = 'postback')
    OR
    (operation_type = 'hold_release'
      AND amount > 0 AND hold_delta = -amount
      AND balance_delta = amount AND platform_fee_delta = 0
      AND original_entry_id IS NOT NULL AND approved_at IS NULL
      AND hold_until IS NULL AND actor_type = 'scheduler')
    OR
    (operation_type = 'hold_reversal'
      AND amount > 0 AND hold_delta = -amount
      AND balance_delta = 0 AND platform_fee_delta = 0
      AND original_entry_id IS NOT NULL AND actor_type = 'admin'
      AND approved_at IS NULL AND hold_until IS NULL)
    OR
    (operation_type = 'platform_fee_reversal'
      AND hold_delta = 0 AND balance_delta = 0
      AND platform_fee_delta = -amount AND original_entry_id IS NOT NULL
      AND actor_type = 'admin' AND approved_at IS NULL AND hold_until IS NULL)
    OR
    (operation_type = 'balance_reversal'
      AND amount > 0 AND hold_delta = 0 AND balance_delta = -amount
      AND platform_fee_delta = 0 AND original_entry_id IS NOT NULL
      AND actor_type = 'admin' AND approved_at IS NULL AND hold_until IS NULL)
    OR
    (operation_type = 'recovery_pending'
      AND amount > 0 AND hold_delta = 0 AND balance_delta = 0
      AND platform_fee_delta = 0 AND original_entry_id IS NOT NULL
      AND actor_type = 'admin' AND approved_at IS NULL AND hold_until IS NULL)
  )
);
CREATE INDEX idx_cpa_ledger_conversion_time ON public.cpa_ledger(conversion_id,created_at);
CREATE INDEX idx_cpa_ledger_user_time ON public.cpa_ledger(user_id,created_at);
CREATE INDEX idx_cpa_ledger_matured ON public.cpa_ledger(hold_until)
  WHERE operation_type = 'hold_credit';
CREATE UNIQUE INDEX ux_cpa_ledger_single_event ON public.cpa_ledger(conversion_id,operation_type)
  WHERE operation_type IN (
    'hold_credit','platform_fee_accrual','hold_release',
    'hold_reversal','platform_fee_reversal','balance_reversal'
  );
CREATE UNIQUE INDEX ux_cpa_ledger_single_release ON public.cpa_ledger(original_entry_id)
  WHERE operation_type = 'hold_release';

-- Guard against direct insertion for old/test/foreign conversions; check
-- that references to a source ledger event belong to the same owner.
CREATE FUNCTION public.cpa_finance_validate_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  source_conversion RECORD;
  source_entry RECORD;
BEGIN
  SELECT user_id,is_test,finance_eligible_at,finance_approved_at,status,currency
    INTO source_conversion
    FROM public.conversions WHERE id = NEW.conversion_id FOR SHARE;
  IF NOT FOUND OR source_conversion.user_id <> NEW.user_id
    OR source_conversion.is_test OR source_conversion.finance_eligible_at IS NULL
    OR source_conversion.currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'Ledger requires a new eligible real conversion with matching owner'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.operation_type IN ('hold_credit','platform_fee_accrual','hold_release') THEN
    IF source_conversion.status <> 'approved'
      OR source_conversion.finance_approved_at IS NULL THEN
      RAISE EXCEPTION 'Ledger credit/release requires an approved real conversion'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.operation_type IN ('hold_credit','platform_fee_accrual')
    AND NEW.approved_at IS DISTINCT FROM source_conversion.finance_approved_at THEN
    RAISE EXCEPTION 'Ledger approval time must match conversion'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.original_entry_id IS NOT NULL THEN
    SELECT user_id,conversion_id,operation_type INTO source_entry
      FROM public.cpa_ledger WHERE id=NEW.original_entry_id FOR KEY SHARE;
    IF NOT FOUND OR source_entry.user_id <> NEW.user_id
      OR source_entry.conversion_id <> NEW.conversion_id THEN
      RAISE EXCEPTION 'Ledger reversal/release must refer to same owner and conversion'
        USING ERRCODE = '23514';
    END IF;
    IF (NEW.operation_type IN ('hold_release','hold_reversal')
        AND source_entry.operation_type <> 'hold_credit')
      OR (NEW.operation_type='platform_fee_reversal'
        AND source_entry.operation_type <> 'platform_fee_accrual')
      OR (NEW.operation_type IN ('balance_reversal','recovery_pending')
        AND source_entry.operation_type <> 'hold_release') THEN
      RAISE EXCEPTION 'Incorrect ledger origin operation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cpa_finance_validate_entry
  BEFORE INSERT ON public.cpa_ledger FOR EACH ROW
  EXECUTE FUNCTION public.cpa_finance_validate_entry();

CREATE FUNCTION public.cpa_finance_immutable_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'CPA ledger is append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER trg_cpa_finance_no_update_delete
  BEFORE UPDATE OR DELETE ON public.cpa_ledger FOR EACH ROW
  EXECUTE FUNCTION public.cpa_finance_immutable_ledger();
CREATE TRIGGER trg_cpa_finance_no_truncate
  BEFORE TRUNCATE ON public.cpa_ledger FOR EACH STATEMENT
  EXECUTE FUNCTION public.cpa_finance_immutable_ledger();

ALTER TABLE public.cpa_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cpa_ledger FROM PUBLIC, anon, authenticated;
-- No anon/authenticated policies. Existing trusted backend PostgreSQL role
-- remains the only intended writer. Production rollout needs separate approval.
