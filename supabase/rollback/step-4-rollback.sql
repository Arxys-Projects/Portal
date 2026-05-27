-- Rollback Phase 3 Step 4: Remove input_state column
ALTER TABLE submissions DROP COLUMN IF EXISTS input_state;
