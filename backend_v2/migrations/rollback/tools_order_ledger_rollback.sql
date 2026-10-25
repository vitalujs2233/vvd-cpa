BEGIN;
LOCK TABLE public.tool_orders IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.tool_orders WHERE ledger_request_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Ledger history exists; preserve data and use a forward migration';
 END IF;
 IF EXISTS (SELECT 1 FROM public.tool_orders WHERE cost<>round(cost,2) OR abs(cost)>=1000000000000) THEN
  RAISE EXCEPTION 'Cost precision cannot be safely narrowed';
 END IF;
END $$;
DROP INDEX public.tool_order_ledger_request_unique;
ALTER TABLE public.tool_orders DROP CONSTRAINT tool_order_ledger_complete;
ALTER TABLE public.tool_orders DROP COLUMN ledger_request_id,DROP COLUMN ledger_state,
 DROP COLUMN ledger_selection,DROP COLUMN ledger_currency,DROP COLUMN ledger_markup,DROP COLUMN ledger_updated_at;
ALTER TABLE public.tool_orders ALTER COLUMN cost TYPE numeric(14,2);
COMMIT;
