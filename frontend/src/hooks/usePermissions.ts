import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import type { UserRole } from "@/lib/types"

/**
 * Legacy role bucket, still read from the unchanged profiles.role column
 * (not part of the RBAC bundle cutover -- profiles.role stays valid through
 * the transition window, dropped only in a later, separately-reviewed
 * migration). Used only for the coarse internal-vs-vendor identity check;
 * fine-grained authorization now comes from hasPermission() below.
 */
export const INTERNAL_ROLES: UserRole[] = [
  "admin",
  "super_admin",
  "hr_user",
  "manager",
  "procurement_admin",
  "finance_ap",
]

/**
 * Returns a stable set of boolean permission flags derived from the active
 * org's resolved permission-key set (org_member_roles -> role_permissions ->
 * permissions), rather than hardcoded role strings — so bundle definitions
 * live in one place (the roles/permissions tables) and editing a bundle
 * automatically propagates here.
 *
 * NOTE on behavior changes from the old role-string model, direct
 * consequences of the confirmed legacy-role -> bundle mapping (hr_user ->
 * Associate; manager, finance_ap, procurement_admin -> Manager; org_admin/
 * admin/super_admin -> Admin), not new decisions made here:
 *  - canRecordGRN: previously procurement_admin+ only: now Associate-tier
 *    too (hr_user maps here), since grns.record is an Associate permission.
 *  - canCreatePO / canApprovePO: previously procurement_admin+ only; now any
 *    Manager-tier role (manager, finance_ap, procurement_admin all map to
 *    Manager), since purchase_orders.create/approve are Manager permissions.
 *  - canApproveInvoice: previously finance_ap+admin only; now any
 *    Manager-tier role too, since invoices.approve is a Manager permission.
 *  - canRateVendors: previously manager+procurement_admin+admin; now
 *    Admin-tier only, since vendors.rate is seeded as an Admin-only
 *    permission (not included in the Manager bundle).
 * None of these have live impact today -- the only real organization_members
 * row in the live database is org_admin (-> Admin), and zero rows exist for
 * manager/procurement_admin/finance_ap/hr_user.
 */
export function usePermissions() {
  const { profile } = useAuth()
  const { activeOrg } = useOrg()

  const isVendor = profile?.role === "vendor"
  const isInternalUser = !!profile && !isVendor
  const isSuperAdmin = profile?.role === "admin" || profile?.role === "super_admin"

  const permissionKeys = activeOrg?.permissions ?? []
  function hasPermission(module: string, action: string): boolean {
    return permissionKeys.includes(`${module}.${action}`)
  }

  const approvalThreshold = activeOrg?.approvalThreshold ?? 0
  const hasUnlimitedApproval = hasPermission("purchase_orders", "approve_unlimited") || hasPermission("invoices", "approve_unlimited")

  return {
    // ── Identity ────────────────────────────────────────────────────────────
    role: profile?.role ?? null,
    isVendor,
    isInternalUser,
    isSuperAdmin,
    /** True when the active org is reached only via standing group_admin access, not direct membership -- drives the "acting as group admin" banner. */
    isActingAsGroupAdmin: activeOrg?.access === "group_admin" && !activeOrg.isLocalMember,

    // ── Vendor management ───────────────────────────────────────────────────
    canViewVendors:        isInternalUser,
    canManageVendorStatus: hasPermission("vendors", "manage_status"),
    canRateVendors:        hasPermission("vendors", "rate"),
    canManageCategories:   hasPermission("categories", "manage"),
    canVerifyDocuments:    hasPermission("documents", "verify"),

    // ── Procurement — Engagements ────────────────────────────────────────────
    canCreateEngagement: hasPermission("engagements", "draft"),
    canApproveEngagement: hasPermission("engagements", "finalize"),

    // ── Procurement — Purchase Orders ────────────────────────────────────────
    canCreatePO:  hasPermission("purchase_orders", "create"),
    canApprovePO: hasPermission("purchase_orders", "approve") || hasPermission("purchase_orders", "approve_unlimited"),

    // ── Procurement — GRN ────────────────────────────────────────────────────
    canRecordGRN: hasPermission("grns", "record"),

    // ── Procurement — Invoices ───────────────────────────────────────────────
    canSubmitInvoice:  isVendor,
    canApproveInvoice: hasPermission("invoices", "approve") || hasPermission("invoices", "approve_unlimited"),

    // ── Contracts ────────────────────────────────────────────────────────────
    // The old single boolean conflated drafting and execution/signing, which
    // the new bundle model deliberately splits (Manager drafts, Admin-only
    // executes/signs). Kept as an OR here so existing draft/list screens
    // still show for either tier; screens gating the actual sign/execute
    // action should move to hasPermission("contracts", "execute") directly.
    canManageContracts: hasPermission("contracts", "draft") || hasPermission("contracts", "execute"),

    // ── Reports ─────────────────────────────────────────────────────────────
    canViewReports: hasPermission("reports", "view"),

    // ── User management ──────────────────────────────────────────────────────
    canManageUsers: hasPermission("users", "manage"),

    // ── Approval thresholds ──────────────────────────────────────────────────
    approvalThreshold,

    /** Returns true if this user can approve an action of the given INR amount */
    canApproveAmount(amount: number): boolean {
      return hasUnlimitedApproval || amount <= approvalThreshold
    },

    /** Direct access to the resolved permission set, for new code that wants finer granularity than the boolean shims above. */
    hasPermission,
  }
}
