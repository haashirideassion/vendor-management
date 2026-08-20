-- RBAC/Teams Redesign, Phase 3: Centralized backend authorization resolver.
--
-- Ties together everything built in Phases 1-2 into one authoritative,
-- server-side permission check -- closing the gap flagged repeatedly in the
-- original RBAC planning: fine-grained authorization living almost entirely
-- in the frontend's usePermissions() hook, which is a UX convenience, not a
-- security boundary (a direct API call bypasses it entirely).
--
-- resolve_permission_as(user, scope, org_id, vendor_id, key) is the single
-- DB-level function every route should eventually call through. It composes,
-- in order, the confirmed narrowing pipeline:
--   1. Feature Entitlement (Phase 2's is_feature_entitled) -- hard gate
--   2. Role permission baseline -- reuses the EXISTING has_permission_as /
--      has_vendor_permission_as functions (021_rbac_helper_functions.sql)
--      rather than re-deriving role->permission logic. Those still read the
--      legacy org_member_roles/vendor_user_roles tables, which is correct:
--      Phase 1's invite/update-roles routes dual-write into those tables
--      alongside the new team_members/direct_role_assignments, specifically
--      so existing permission resolution keeps working unchanged while the
--      new Team model is adopted incrementally.
--   3. User Restriction -- Phase 4's subtractive override slot. That table
--      doesn't exist yet; this function is written so Phase 4 only needs to
--      add one more NOT EXISTS clause here, no signature change, no caller
--      changes required.
--
-- permissions.module_code links each fine-grained permission (module=
-- 'invoices', 'purchase_orders', etc.) to the COARSE feature_modules catalog
-- from Phase 2 (module_code='finance', 'procurement', etc.) -- these are
-- deliberately two different vocabularies (a business-process taxonomy vs a
-- product-plan taxonomy), so a mapping is needed rather than reusing one
-- column for both. NULL module_code means "never entitlement-gated" --
-- applied here to purely administrative/self-management actions (a vendor
-- managing their own staff or bank details, an org managing its own users)
-- that shouldn't be capable of locking an org/vendor out of their own
-- account configuration via a billing-tier toggle. This mapping is a
-- starting point grounded in the app's real permission list, not exhaustive
-- product policy -- revisit alongside the module catalog itself.

ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module_code text REFERENCES feature_modules(code);

UPDATE permissions SET module_code = CASE module
  WHEN 'engagements'      THEN 'procurement'
  WHEN 'grns'             THEN 'procurement'
  WHEN 'quotations'       THEN 'procurement'
  WHEN 'purchase_orders'  THEN 'procurement'
  WHEN 'contracts'        THEN 'procurement'
  WHEN 'deliveries'       THEN 'procurement'
  WHEN 'categories'       THEN 'procurement'
  WHEN 'invoices'         THEN 'finance'
  WHEN 'reports'          THEN 'analytics'
  WHEN 'documents'        THEN 'compliance'
  WHEN 'vendors'          THEN 'vendor_management'
  ELSE NULL -- users, vendor_profile, vendor_bank, vendor_docs, vendor_users,
            -- organization -- administrative/self-management, never gated
END;

CREATE OR REPLACE FUNCTION resolve_permission_as(
  p_user_id   uuid,
  p_scope     text,   -- 'org' | 'vendor'
  p_org_id    uuid,
  p_vendor_id uuid,
  p_key       text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_module_code text;
  v_has_role_permission boolean;
BEGIN
  SELECT module_code INTO v_module_code FROM permissions WHERE key = p_key;

  IF v_module_code IS NOT NULL THEN
    IF NOT is_feature_entitled(p_scope, p_org_id, p_vendor_id, v_module_code) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_scope = 'org' THEN
    v_has_role_permission := has_permission_as(p_user_id, p_org_id, p_key);
  ELSIF p_scope = 'vendor' THEN
    v_has_role_permission := has_vendor_permission_as(p_user_id, p_vendor_id, p_key);
  ELSE
    RAISE EXCEPTION 'resolve_permission_as: scope must be org or vendor, got %', p_scope;
  END IF;

  IF NOT v_has_role_permission THEN
    RETURN false;
  END IF;

  -- Phase 4 slot: subtractive User Restriction check goes here once
  -- user_permission_restrictions exists -- e.g.
  --   IF EXISTS (SELECT 1 FROM user_permission_restrictions ...) THEN RETURN false; END IF;
  -- Deliberately not stubbed with a placeholder table now -- Phase 4 adds
  -- exactly one clause to this function, nothing else changes.

  RETURN true;
END;
$$;
