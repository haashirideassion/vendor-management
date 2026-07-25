-- Phase F: wipe an Associate's explicit vendor_user_assignments rows the
-- moment a Manager's own assignments change at that same vendor -- per the
-- confirmed design (gap-analysis contradiction #4), dropping to ZERO access
-- until someone manually re-maps them. Do NOT auto-inherit the Manager's
-- new list -- that's a deliberately different (simpler, safer-by-default)
-- behavior than syncing.
--
-- NOTE: neither vendor_users nor vendor_user_assignments has a reports-to/
-- manager_id column -- there's no per-Associate "which Manager do they
-- report to" relationship anywhere in this schema. Absent that, "their
-- Manager" is treated as ANY Manager at the SAME vendor company (a vendor
-- is one company; 018_rbac_seed.sql's vendor bundles are company-wide, not
-- per-team) -- any Manager's assignment change wipes every Associate's
-- assignments at that vendor. If a finer per-Associate reporting line is
-- introduced later, only this function's inner SELECT needs to change.

CREATE OR REPLACE FUNCTION public.wipe_associate_assignments_on_manager_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_vendor_id  uuid := COALESCE(NEW.vendor_id, OLD.vendor_id);
  v_user_id    uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_is_manager boolean;
BEGIN
  -- Guard against recursing into the DELETE this function issues below
  -- (that DELETE re-fires this same trigger for each deleted row).
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM vendor_users vu
    JOIN vendor_user_roles vur ON vur.vendor_user_id = vu.id
    JOIN roles r ON r.id = vur.role_id
    WHERE vu.vendor_id = v_vendor_id
      AND vu.profile_id = v_user_id
      AND r.scope = 'vendor'
      AND r.name = 'Manager'
  ) INTO v_is_manager;

  IF v_is_manager THEN
    DELETE FROM vendor_user_assignments
    WHERE vendor_id = v_vendor_id
      AND user_id <> v_user_id
      AND user_id IN (
        SELECT vu.profile_id
        FROM vendor_users vu
        JOIN vendor_user_roles vur ON vur.vendor_user_id = vu.id
        JOIN roles r ON r.id = vur.role_id
        WHERE vu.vendor_id = v_vendor_id
          AND r.scope = 'vendor'
          AND r.name = 'Associate'
      );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wipe_associate_assignments_on_manager_change ON vendor_user_assignments;
CREATE TRIGGER trg_wipe_associate_assignments_on_manager_change
AFTER INSERT OR UPDATE OR DELETE ON vendor_user_assignments
FOR EACH ROW EXECUTE FUNCTION public.wipe_associate_assignments_on_manager_change();
