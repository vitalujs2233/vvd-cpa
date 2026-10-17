-- Stage 5.5 draft only. AFTER PR21, PR23 and PR24 migrations. No data backfill.
-- NO changes to existing historic payouts/balances or withdrawals RLS.
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS cpa_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS ux_cpa_withdrawals_request
 ON public.withdrawals(user_id,cpa_request_id) WHERE cpa_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cpa_payout_proofs (
  withdrawal_id BIGINT PRIMARY KEY REFERENCES public.withdrawals(id) ON DELETE RESTRICT,
  external_transfer_id VARCHAR(160) NOT NULL UNIQUE,
  evidence_reference VARCHAR(200) NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL,
  confirmed_by BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT ck_cpa_paid_evidence CHECK (
    length(trim(external_transfer_id))>=8 AND length(trim(evidence_reference))>=8
  )
);

CREATE TABLE IF NOT EXISTS public.cpa_conversion_disputes (
  conversion_id UUID PRIMARY KEY REFERENCES public.conversions(id) ON DELETE RESTRICT,
  case_reference VARCHAR(140) NOT NULL UNIQUE,
  reason VARCHAR(60) NOT NULL CHECK (length(trim(reason))>=12),
  evidence_reference VARCHAR(200) NOT NULL CHECK (length(trim(evidence_reference))>=8),
  opened_by BIGINT NOT NULL REFERENCES public.users(telegram_id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolution VARCHAR(20) CHECK (resolution IN ('cancelled','cleared')),
  resolved_by BIGINT REFERENCES public.users(telegram_id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  resolution_reference VARCHAR(200),
  CONSTRAINT ck_cpa_dispute_resolution CHECK (
    (resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL AND resolution_reference IS NULL)
    OR (resolution IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL
        AND length(trim(resolution_reference))>=8)
  )
);
-- One-way status transition. Log every resolution in immutable ledger if funds touched.
CREATE OR REPLACE FUNCTION public.cpa_guard_dispute_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.conversion_id IS DISTINCT FROM NEW.conversion_id
 OR OLD.case_reference IS DISTINCT FROM NEW.case_reference
 OR OLD.reason IS DISTINCT FROM NEW.reason
 OR OLD.evidence_reference IS DISTINCT FROM NEW.evidence_reference
 OR OLD.opened_by IS DISTINCT FROM NEW.opened_by
 OR OLD.opened_at IS DISTINCT FROM NEW.opened_at
 OR OLD.resolution IS NOT NULL
 OR (NEW.resolution IS NULL OR NEW.resolved_by IS NULL OR NEW.resolved_at IS NULL
 OR NEW.resolution_reference IS NULL) THEN
  RAISE EXCEPTION 'Immutable dispute: only first supported resolution allowed'
  USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cpa_guard_dispute ON public.cpa_conversion_disputes;
CREATE TRIGGER trg_cpa_guard_dispute BEFORE UPDATE OR DELETE
 ON public.cpa_conversion_disputes FOR EACH ROW
 EXECUTE FUNCTION public.cpa_guard_dispute_transition();

CREATE OR REPLACE FUNCTION public.cpa_finance_proof_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 RAISE EXCEPTION 'CPA payout proofs are immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS trg_cpa_payout_proofs_immutable ON public.cpa_payout_proofs;
CREATE TRIGGER trg_cpa_payout_proofs_immutable
 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.cpa_payout_proofs
 FOR EACH STATEMENT EXECUTE FUNCTION public.cpa_finance_proof_immutable();

-- Enforce proof requirement for ANY paid status transition, regardless of API.
CREATE OR REPLACE FUNCTION public.cpa_guard_paid_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status='paid' AND OLD.cpa_real_epoch_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.cpa_payout_proofs p
                 WHERE p.withdrawal_id=OLD.id) THEN
   RAISE EXCEPTION 'Real payout requires immutable verified external transfer proof'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cpa_paid_proof ON public.withdrawals;
CREATE TRIGGER trg_cpa_paid_proof BEFORE UPDATE ON public.withdrawals
 FOR EACH ROW EXECUTE FUNCTION public.cpa_guard_paid_proof();

-- Disallow ledger release when a dispute is unresolved; no hidden auto-debt.
-- Before insert trigger shares immutable validation function, so add a second guard.
CREATE OR REPLACE FUNCTION public.cpa_guard_disputed_release() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.operation_type IN ('hold_release','manual_hold_release') AND EXISTS(
  SELECT 1 FROM public.cpa_conversion_disputes d
   WHERE d.conversion_id=NEW.conversion_id
     AND (d.resolution IS NULL OR d.resolution='cancelled')
 ) THEN
  RAISE EXCEPTION 'Disputed or cancelled conversion cannot release hold'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cpa_guard_disputed_release ON public.cpa_ledger;
CREATE TRIGGER trg_cpa_guard_disputed_release
 BEFORE INSERT ON public.cpa_ledger FOR EACH ROW
 EXECUTE FUNCTION public.cpa_guard_disputed_release();

DO $$
DECLARE t TEXT;
BEGIN
 FOREACH t IN ARRAY ARRAY['cpa_payout_proofs','cpa_conversion_disputes'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO postgres',t);
 END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.cpa_guard_dispute_transition(),
 public.cpa_finance_proof_immutable(),public.cpa_guard_paid_proof(),
 public.cpa_guard_disputed_release()
 FROM PUBLIC,anon,authenticated,service_role;
