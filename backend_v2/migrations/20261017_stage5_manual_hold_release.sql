-- Stage 5.4 Draft ONLY. Apply AFTER the PR21 ledger AND PR23 finance epoch.
-- Implements evidence-gated partial manual releases. Never applies to production automatically.
-- Run complete file inside one SQL transaction. Does not touch historical rows.
CREATE TABLE IF NOT EXISTS public.cpa_network_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id UUID NOT NULL UNIQUE REFERENCES public.conversions(id) ON DELETE RESTRICT,
  settlement_reference VARCHAR(160) NOT NULL UNIQUE,
  verification_source VARCHAR(32) NOT NULL
    CHECK (verification_source IN ('bank_verified','processor_verified')),
  evidence_reference VARCHAR(200) NOT NULL,
  received_gross NUMERIC(18,2) NOT NULL CHECK (received_gross>0),
  received_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  verified_by BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_cpa_receipt_reference_nonempty CHECK (
    length(trim(settlement_reference))>=8
    AND length(trim(evidence_reference))>=8
  )
);
CREATE INDEX IF NOT EXISTS idx_cpa_receipts_conversion
  ON public.cpa_network_receipts(conversion_id);
CREATE OR REPLACE FUNCTION public.cpa_receipts_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Network receipt attestations are append-only'
    USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS trg_cpa_receipts_immutable ON public.cpa_network_receipts;
CREATE TRIGGER trg_cpa_receipts_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cpa_network_receipts
FOR EACH STATEMENT EXECUTE FUNCTION public.cpa_receipts_immutable();
ALTER TABLE public.cpa_network_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cpa_network_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.cpa_network_receipts TO postgres;
REVOKE EXECUTE ON FUNCTION public.cpa_receipts_immutable()
FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.cpa_ledger
 ADD COLUMN IF NOT EXISTS receipt_id UUID REFERENCES public.cpa_network_receipts(id)
 ON DELETE RESTRICT;
-- Retain PR21 one-time automatic hold_release indices; manual partials use unique event_key.
ALTER TABLE public.cpa_ledger DROP CONSTRAINT ck_cpa_ledger_shape;
ALTER TABLE public.cpa_ledger ADD CONSTRAINT ck_cpa_ledger_shape CHECK (

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
    OR
    (operation_type='manual_hold_release'
     AND amount>0 AND hold_delta=-amount AND balance_delta=amount
     AND platform_fee_delta=0 AND original_entry_id IS NOT NULL
     AND approved_at IS NULL AND hold_until IS NULL
     AND actor_type='admin' AND actor_id IS NOT NULL
     AND reason_code IS NOT NULL AND receipt_id IS NOT NULL)
);
-- Replacement retains all original checks and extends only release validation.
CREATE OR REPLACE FUNCTION public.cpa_finance_validate_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE
  source_conversion RECORD;
  source_entry RECORD;
  funding RECORD;
  released_amount NUMERIC(18,2);
BEGIN
  SELECT user_id,is_test,finance_eligible_at,finance_approved_at,status,
         currency,payout_gross
    INTO source_conversion FROM public.conversions
    WHERE id=NEW.conversion_id FOR SHARE;
  IF NOT FOUND OR source_conversion.user_id<>NEW.user_id
    OR source_conversion.is_test OR source_conversion.finance_eligible_at IS NULL
    OR source_conversion.currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION 'Ledger requires eligible real USD conversion with matching owner'
      USING ERRCODE='23514';
  END IF;
  IF NEW.operation_type IN
    ('hold_credit','platform_fee_accrual','hold_release','manual_hold_release')
    AND (source_conversion.status<>'approved'
      OR source_conversion.finance_approved_at IS NULL) THEN
    RAISE EXCEPTION 'Release requires confirmed real CPA conversion'
      USING ERRCODE='23514';
  END IF;
  IF NEW.operation_type IN ('hold_credit','platform_fee_accrual')
    AND NEW.approved_at IS DISTINCT FROM source_conversion.finance_approved_at THEN
    RAISE EXCEPTION 'Ledger approval time must match conversion'
      USING ERRCODE='23514';
  END IF;
  IF NEW.operation_type IN ('hold_credit','platform_fee_accrual') THEN
    IF source_conversion.payout_gross<=0
      OR source_conversion.payout_gross<>round(source_conversion.payout_gross,2)
      OR (NEW.operation_type='platform_fee_accrual' AND
        NEW.amount<>round(source_conversion.payout_gross*0.20,2))
      OR (NEW.operation_type='hold_credit' AND
        NEW.amount<>source_conversion.payout_gross -
            round(source_conversion.payout_gross*0.20,2)) THEN
      RAISE EXCEPTION 'Ledger amount differs from USD 80/20 gross'
        USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.original_entry_id IS NOT NULL THEN
    SELECT id,user_id,conversion_id,operation_type,amount,hold_until
      INTO source_entry FROM public.cpa_ledger
      WHERE id=NEW.original_entry_id FOR UPDATE;
    IF NOT FOUND OR source_entry.user_id<>NEW.user_id
      OR source_entry.conversion_id<>NEW.conversion_id THEN
      RAISE EXCEPTION 'Origin owner or conversion mismatch' USING ERRCODE='23514';
    END IF;
    IF (NEW.operation_type IN
         ('hold_release','manual_hold_release','hold_reversal') AND
         source_entry.operation_type<>'hold_credit')
      OR (NEW.operation_type='platform_fee_reversal' AND
         source_entry.operation_type<>'platform_fee_accrual')
      OR (NEW.operation_type IN ('balance_reversal','recovery_pending') AND
         source_entry.operation_type NOT IN ('hold_release','manual_hold_release')) THEN
      RAISE EXCEPTION 'Incorrect ledger source event' USING ERRCODE='23514';
    END IF;
    IF NEW.operation_type IN ('hold_release','manual_hold_release') THEN
      SELECT COALESCE(sum(amount),0) INTO released_amount
      FROM public.cpa_ledger
      WHERE original_entry_id=NEW.original_entry_id
        AND operation_type IN ('hold_release','manual_hold_release');
      IF released_amount+NEW.amount>source_entry.amount OR
        EXISTS(SELECT 1 FROM public.cpa_ledger
          WHERE original_entry_id=NEW.original_entry_id
            AND operation_type='hold_reversal') THEN
        RAISE EXCEPTION 'Hold already released or reversed'
          USING ERRCODE='23514';
      END IF;
      IF NEW.operation_type='hold_release' AND (
          source_entry.hold_until IS NULL
          OR clock_timestamp()<source_entry.hold_until
          OR NEW.amount<>source_entry.amount-released_amount
      ) THEN
        RAISE EXCEPTION 'Automatic release must be matured remaining hold'
          USING ERRCODE='23514';
      END IF;
      IF NEW.operation_type='manual_hold_release' THEN
        SELECT conversion_id,received_gross,verified_by,verified_at
          INTO funding FROM public.cpa_network_receipts
          WHERE id=NEW.receipt_id;
        IF NOT FOUND OR funding.conversion_id<>NEW.conversion_id
          OR funding.verified_by IS NULL OR funding.verified_at IS NULL
          OR funding.received_gross<source_conversion.payout_gross THEN
          RAISE EXCEPTION 'Verified full CPA network receipt required for early release'
            USING ERRCODE='23514';
        END IF;
      END IF;
    END IF;
    IF NEW.operation_type='hold_reversal' AND EXISTS(
        SELECT 1 FROM public.cpa_ledger
        WHERE original_entry_id=NEW.original_entry_id
          AND operation_type IN ('hold_release','manual_hold_release')
    ) THEN
      RAISE EXCEPTION 'Released hold cannot be reversed as unreleased'
        USING ERRCODE='23514';
    END IF;
    IF NEW.operation_type IN
        ('hold_reversal','platform_fee_reversal','balance_reversal')
      AND NEW.amount<>source_entry.amount THEN
      RAISE EXCEPTION 'Correction must match original event amount'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- Trigger created by PR21 already points at function: no new trigger needed.
