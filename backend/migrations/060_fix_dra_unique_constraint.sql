-- RBAC/Teams Redesign, fix to Phase 1: direct_role_assignments' unique
-- constraint doesn't do what it was meant to.
--
-- 059's CREATE TABLE declared UNIQUE (scope, org_id, vendor_id, profile_id,
-- role_id). vendor_id is NULL on every org-scope row (and org_id is NULL on
-- every vendor-scope row) -- standard SQL UNIQUE treats NULL as never equal
-- to another NULL, so two identical org-scope assignment attempts would
-- both insert successfully instead of conflicting. Same latent issue would
-- have hit teams/legal_entities/bank_accounts if they'd used this shape --
-- they didn't, because is_default/is_primary partial unique indexes were
-- used there instead, which don't have this problem. Applying the same
-- fix here: two partial unique indexes, one per scope, so the compared
-- columns are never null within that index's own domain.
--
-- The auto-generated constraint name isn't predictable (Postgres truncates
-- long generated names), so this looks it up rather than guessing it.

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'direct_role_assignments'::regclass AND contype = 'u';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE direct_role_assignments DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dra_org    ON direct_role_assignments(org_id, profile_id, role_id)    WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS uq_dra_vendor ON direct_role_assignments(vendor_id, profile_id, role_id) WHERE scope = 'vendor';

-- De-duplicate defensively in case the broken constraint already let
-- literal duplicates through (harmless no-op if it didn't -- this backfill
-- migration only ran once so far and each backfill statement inserted into
-- disjoint scopes, but this is cheap insurance rather than an assumption).
DELETE FROM direct_role_assignments a
USING direct_role_assignments b
WHERE a.id > b.id
  AND a.scope = b.scope
  AND a.profile_id = b.profile_id
  AND a.role_id = b.role_id
  AND ((a.org_id = b.org_id) OR (a.org_id IS NULL AND b.org_id IS NULL))
  AND ((a.vendor_id = b.vendor_id) OR (a.vendor_id IS NULL AND b.vendor_id IS NULL));
