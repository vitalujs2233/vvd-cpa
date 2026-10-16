-- Restore compatibility between legacy public.offers NOT NULL columns
-- and the stage 2 admin CRUD. Existing rows are not modified.
ALTER TABLE public.offers ALTER COLUMN payout_range SET DEFAULT 'Нет данных';
ALTER TABLE public.offers ALTER COLUMN smartlink_suffix SET DEFAULT '';
ALTER TABLE public.offers ALTER COLUMN description SET DEFAULT '';
ALTER TABLE public.offers ALTER COLUMN icon_name SET DEFAULT 'layers';
ALTER TABLE public.offers ALTER COLUMN allowed_traffic SET DEFAULT ARRAY[]::text[];
ALTER TABLE public.offers ALTER COLUMN forbidden_traffic SET DEFAULT ARRAY[]::text[];
