-- Stage 4 protected administrative postback test marker.
-- Historical records stay real (false), and no financial values are modified.
ALTER TABLE public.conversions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stage4_single_test_offer
 ON public.conversions(offer_id) WHERE is_test = TRUE;
-- Defense in depth: test entries can never be inserted with a positive payout.
ALTER TABLE public.conversions ADD CONSTRAINT ck_stage4_test_no_payout
 CHECK (NOT is_test OR (payout_gross = 0 AND payout_net = 0 AND status = 'pending'))
 NOT VALID;
ALTER TABLE public.conversions VALIDATE CONSTRAINT ck_stage4_test_no_payout;
