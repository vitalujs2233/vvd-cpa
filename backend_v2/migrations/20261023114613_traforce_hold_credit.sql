-- Traforce status 5 represents an accrued conversion in provider hold.
-- Route it through the existing 20/80 CPA hold ledger, exactly as status 1.
-- Run the entire file in ONE transaction. No legacy/test conversion opt-in.
DO $repair$
DECLARE
  net_id bigint;
  candidate record;
  v record;
  fee numeric(18,2);
  publisher numeric(18,2);
BEGIN
  SELECT id INTO STRICT net_id FROM public.cpa_networks WHERE name='Traforce' FOR UPDATE;
  UPDATE public.cpa_networks
    SET postback_status_map=jsonb_set(postback_status_map,'{5}','"approved"'::jsonb)
    WHERE id=net_id;
  FOR candidate IN
    SELECT c.id,c.user_id FROM public.conversions c CROSS JOIN public.cpa_finance_epoch e
    WHERE e.id=1 AND e.activated_at IS NOT NULL AND c.network_id=net_id
      AND c.external_status='5' AND c.status='pending' AND NOT c.is_test
      AND c.currency='USD' AND c.finance_eligible_at>=e.activated_at
      AND c.created_at>=e.activated_at
    ORDER BY c.user_id,c.id
  LOOP
    -- Same lock ordering as live postbacks: network -> owner -> conversion.
    PERFORM 1 FROM public.users WHERE telegram_id=candidate.user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Missing conversion owner'; END IF;
    SELECT * INTO STRICT v FROM public.conversions WHERE id=candidate.id FOR UPDATE;
    IF v.status<>'pending' THEN CONTINUE; END IF;
    IF v.user_id<>candidate.user_id OR v.payout_gross<0
       OR v.payout_gross<>round(v.payout_gross,2)
       OR v.finance_approved_at IS NOT NULL OR v.payout_net<>0
       OR EXISTS(SELECT 1 FROM public.cpa_ledger WHERE conversion_id=v.id) THEN
      RAISE EXCEPTION 'Unexpected existing hold conversion state';
    END IF;
    fee=round(v.payout_gross*0.20,2);
    publisher=v.payout_gross-fee;
    UPDATE public.conversions SET status='approved',
      finance_approved_at=finance_eligible_at,payout_net=publisher,processed_at=now()
      WHERE id=v.id;
    IF v.payout_gross=0 THEN CONTINUE; END IF;
    INSERT INTO public.cpa_ledger
      (conversion_id,user_id,operation_type,event_key,amount,currency,hold_delta,
       platform_fee_delta,approved_at,hold_until,actor_type)
    VALUES
      (v.id,v.user_id,'hold_credit','cpa:v1:'||v.id||':hold_credit',publisher,'USD',publisher,
       0,v.finance_eligible_at,v.finance_eligible_at+interval '240 hours','postback'),
      (v.id,v.user_id,'platform_fee_accrual','cpa:v1:'||v.id||':platform_fee_accrual',fee,'USD',0,
       fee,v.finance_eligible_at,NULL,'postback');
    UPDATE public.users SET hold=hold+publisher WHERE telegram_id=v.user_id AND hold>=0 AND balance>=0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid owner wallet'; END IF;
  END LOOP;
END $repair$;
