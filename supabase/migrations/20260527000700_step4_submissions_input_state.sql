-- Phase 3 Step 4: Add input_state JSONB column to submissions
-- Stores the full calculator input state at submission time.
-- Write-only in Step 4; consumed by future features.

ALTER TABLE submissions
ADD COLUMN input_state JSONB DEFAULT NULL;

COMMENT ON COLUMN submissions.input_state IS
  'Full calculator input state at submission time. JSON blob containing camera groups, VMS, project name. Null for pre-Step-4 submissions.';
