import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/lib/types"

/** All non-vendor roles that access the admin portal */
export const INTERNAL_ROLES: UserRole[] = [
  "admin",
  "super_admin",
  "hr_user",
  "manager",
  "procurement_admin",
  "finance_ap",
]

/**
 * Maximum INR amount each role can approve unilaterally.
 * Amounts above the threshold require a higher-privilege approver.
 */
export const APPROVAL_THRESHOLDS: Partial<Record<UserRole, number>> = {
  manager: 100_000,
  procurement_admin: 500_000,
  finance_ap: 1_000_000,
  super_admin: Infinity,
  admin: Infinity,
}

/**
 * Returns a stable set of boolean permission flags derived from the
 * current user's role. Use these in components instead of hardcoding
 * role strings — so permission logic lives in one place.
 */
export function usePermissions() {
  const { profile } = useAuth()
  const role = profile?.role ?? null

  function hasRole(roles: UserRole[]): boolean {
    return role !== null && roles.includes(role)
  }

  return {
    // ── Identity ────────────────────────────────────────────────────────────
    role,
    isVendor: role === "vendor",
    isInternalUser: hasRole(INTERNAL_ROLES),
    isSuperAdmin: hasRole(["admin", "super_admin"]),

    // ── Vendor management ───────────────────────────────────────────────────
    canViewVendors:        hasRole(INTERNAL_ROLES),
    canManageVendorStatus: hasRole(["admin", "super_admin"]),        // approve/reject/suspend
    canRateVendors:        hasRole(["manager", "procurement_admin", "admin", "super_admin"]),
    canManageCategories:   hasRole(["admin", "super_admin"]),
    canVerifyDocuments:    hasRole(["admin", "super_admin"]),

    // ── Procurement — Engagements ────────────────────────────────────────────
    canCreateEngagement: hasRole(["hr_user", "manager", "procurement_admin", "admin", "super_admin"]),
    canApproveEngagement: hasRole(["manager", "procurement_admin", "admin", "super_admin"]),

    // ── Procurement — Purchase Orders ────────────────────────────────────────
    canCreatePO:  hasRole(["procurement_admin", "admin", "super_admin"]),
    canApprovePO: hasRole(["procurement_admin", "admin", "super_admin"]),

    // ── Procurement — GRN ────────────────────────────────────────────────────
    canRecordGRN: hasRole(["procurement_admin", "admin", "super_admin"]),

    // ── Procurement — Invoices ───────────────────────────────────────────────
    canSubmitInvoice:  role === "vendor",
    canApproveInvoice: hasRole(["finance_ap", "admin", "super_admin"]),

    // ── Contracts ────────────────────────────────────────────────────────────
    canManageContracts: hasRole(["procurement_admin", "admin", "super_admin"]),

    // ── Reports ─────────────────────────────────────────────────────────────
    canViewReports: hasRole(["manager", "procurement_admin", "finance_ap", "admin", "super_admin"]),

    // ── User management ──────────────────────────────────────────────────────
    canManageUsers: hasRole(["admin", "super_admin"]),

    // ── Approval thresholds ──────────────────────────────────────────────────
    approvalThreshold: role ? (APPROVAL_THRESHOLDS[role] ?? 0) : 0,

    /** Returns true if this user can approve an action of the given INR amount */
    canApproveAmount(amount: number): boolean {
      const threshold = role ? (APPROVAL_THRESHOLDS[role] ?? 0) : 0
      return amount <= threshold
    },
  }
}
