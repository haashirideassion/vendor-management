-- Procurement Lifecycle Enhancement, Phase 1 (part 2): amount-tiered
-- approval thresholds.
--
-- Extends the EXISTING role-based gate (services/approvalGate.ts) rather
-- than replacing it -- the "Associate always needs approval, no exceptions"
-- hard floor is UNCHANGED; this only adds an amount check for roles whose
-- self-approval is otherwise unconditional (Manager/Admin, and now custom
-- roles from the RBAC redesign's Phase 7a).
--
-- Reads approval_requests.amount, which has existed since 006_approval_
-- workflow.sql but was never actually used for anything until now.
--
-- CONFIRMED default: capture a default during org onboarding is NOT how
-- this is configured -- it's a live "Approval Policy" settings screen an
-- Org Admin can revisit any time, since financial policy changes over time
-- and shouldn't be locked to a one-time onboarding field.
--
-- Absence of ANY configured threshold for a role preserves TODAY'S EXACT
-- BEHAVIOR for that role (unconditional self-approval for Manager/Admin,
-- always-gated for Associate) -- this migration adds zero new friction for
-- every org that never touches the new settings screen. Only once an Admin
-- explicitly sets a threshold does the amount check start to matter for
-- that specific role.

CREATE TABLE IF NOT EXISTS approval_policies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id          uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  -- NULL = explicitly unlimited (self-approve regardless of amount) --
  -- distinct from "no row exists," which also means unlimited but via the
  -- "nothing configured yet" default rather than an explicit choice.
  threshold_amount numeric,
  set_by           uuid REFERENCES profiles(id),
  set_at           timestamptz DEFAULT now(),
  UNIQUE (org_id, role_id)
);

ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approval_policies: platform admins manage" ON approval_policies
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "approval_policies: org member reads own org's policy" ON approval_policies
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM organization_members om WHERE om.org_id = approval_policies.org_id AND om.profile_id = auth.uid()
    )
  );
