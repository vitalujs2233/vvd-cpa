-- Stage 1/7. Additive and non-destructive: keep existing partner codes and CPA balances.
CREATE SEQUENCE IF NOT EXISTS public.vvd_partner_code_seq AS bigint START WITH 1;
DO $$
DECLARE latest bigint;
BEGIN
 SELECT COALESCE(MAX(SUBSTRING(partner_code FROM 4)::bigint),0)
 INTO latest FROM public.users WHERE partner_code ~ '^VVD[0-9]{6}$';
 IF latest > 0 THEN
   PERFORM setval('public.vvd_partner_code_seq', GREATEST(latest,(SELECT last_value FROM public.vvd_partner_code_seq)),true);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.vvd_assign_partner_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n bigint;
BEGIN
 IF NEW.partner_code IS NULL OR NEW.partner_code = '' THEN
   n := nextval('public.vvd_partner_code_seq');
   IF n > 999999 THEN RAISE EXCEPTION 'VVD partner code sequence exhausted'; END IF;
   NEW.partner_code := 'VVD' || LPAD(n::text,6,'0');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_vvd_partner_code_on_insert ON public.users;
CREATE TRIGGER trg_vvd_partner_code_on_insert
BEFORE INSERT ON public.users FOR EACH ROW
EXECUTE FUNCTION public.vvd_assign_partner_code();

-- Existing null codes receive codes only; never modify existing non-null codes.
UPDATE public.users SET partner_code = 'VVD' || LPAD(nextval('public.vvd_partner_code_seq')::text,6,'0')
WHERE partner_code IS NULL;

-- Both existing unique constraints remain unchanged:
-- users_pkey (telegram_id), users_partner_code_key (partner_code).
