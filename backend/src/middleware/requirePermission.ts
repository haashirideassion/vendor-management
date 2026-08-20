import { Response, NextFunction, Request } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { AuthenticatedRequest } from "./auth"
import { resolveVendorId, OrgScopedRequest } from "./org"

function db(): any { return getSupabaseAdmin() }

// Centralized, authoritative permission check -- the Phase 3 piece that
// closes the "enforcement lives mostly in the frontend" gap flagged
// throughout the RBAC planning. Wraps resolve_permission_as
// (062_authorization_resolver.sql), which composes, in order: Feature
// Entitlement (hard gate) -> role permission baseline -> (Phase 4, not yet
// built) subtractive user restriction. The frontend's usePermissions() hook
// remains a UX convenience only -- hiding a button is not security; this is
// the actual gate a direct API call cannot bypass.
//
// Scope is resolved the same way resolveListScope (middleware/org.ts)
// already does for routes shared between vendor and org callers:
// vendor-role callers resolve via resolveVendorId; everyone else needs
// requireOrg to have already run so req.orgId is set. Place this AFTER
// requireAuth (and requireOrg, for org-scoped routes) in a route's
// middleware chain -- e.g. router.post("/approve", requireAuth, requireOrg,
// requirePermission("purchase_orders.approve"), handler).
//
// This is new, additive infrastructure -- adopting it across the many
// routes that currently do their own bespoke checks (isOrgAdmin,
// requireVendorManagePermission, etc.) is a separate, incremental effort,
// not a forced rewrite bundled into this phase.
export function requirePermission(key: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user

    try {
      let scope: "org" | "vendor"
      let orgId: string | null = null
      let vendorId: string | null = null

      if (role === "vendor") {
        vendorId = await resolveVendorId(userId)
        if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
        scope = "vendor"
      } else {
        orgId = (req as OrgScopedRequest).orgId ?? null
        if (!orgId) {
          console.error("[requirePermission]", key, "used on an org-scoped route without requireOrg running first")
          return res.status(500).json({ error: "Server misconfiguration" })
        }
        scope = "org"
      }

      const { data: allowed, error } = await db().rpc("resolve_permission_as", {
        p_user_id: userId, p_scope: scope, p_org_id: orgId, p_vendor_id: vendorId, p_key: key,
      })
      if (error) throw error

      if (!allowed) {
        return res.status(403).json({ error: `Missing permission: ${key}` })
      }
      next()
    } catch (err: any) {
      console.error("[requirePermission]", key, err.message)
      res.status(500).json({ error: "Failed to verify permission" })
    }
  }
}
