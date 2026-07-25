import { Response, NextFunction, Request } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { AuthenticatedRequest } from "./auth"

function db(): any { return getSupabaseAdmin() }

// Platform-level gate, distinct from org-scoped requireOrg/requireAuth roles.
// Deliberately its own table (platform_admins), not reused from profiles.role
// or organization_members -- see migration 011.
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = (req as AuthenticatedRequest).user?.id
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" })
    return
  }

  try {
    const { data, error } = await db()
      .from("platform_admins")
      .select("profile_id")
      .eq("profile_id", userId)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      res.status(403).json({ error: "Platform admin access required" })
      return
    }
    next()
  } catch (err: any) {
    console.error("[requireSuperAdmin]", err.message)
    res.status(500).json({ error: "Failed to verify platform admin access" })
  }
}
