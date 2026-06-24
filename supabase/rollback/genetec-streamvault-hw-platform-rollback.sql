-- Rollback for 20260624000001_genetec_streamvault_hw_platform.sql
--
-- Removes the 17 Genetec rows, restores the original vendor CHECK constraint
-- (milestone/avigilon only), and drops the hw_platform column. See ADR 0073,
-- ADR 0074.
--
-- LIMITATION: the migration also upserted the canonical Milestone/Avigilon
-- values (explicit CPU models, corrected base clocks). This rollback does NOT
-- restore the prior Milestone/Avigilon column values — re-run the relevant
-- INSERTs from 20260529000002_phase5_competitor_products.sql if those legacy
-- values are needed.

-- Remove Genetec rows so the original CHECK constraint can be reinstated.
delete from public.competitor_products where vendor = 'genetec';

-- Restore the original vendor constraint.
alter table public.competitor_products
  drop constraint if exists competitor_products_vendor_check;
alter table public.competitor_products
  add constraint competitor_products_vendor_check
  check (vendor in ('milestone', 'avigilon'));

-- Drop the competitor-only platform column.
alter table public.competitor_products drop column if exists hw_platform;
