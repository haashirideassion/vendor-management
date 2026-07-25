import { Request, Response, NextFunction } from "express"
import { getSupabaseAdmin, getSupabaseClient } from "../utils/supabaseAdmin"

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" })
    return
  }

  try {
    const supabase = getSupabaseClient()
    const { data: authData, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authData.user?.email) {
      res.status(401).json({ error: "Invalid or expired token" })
      return
    }

    // req.user.role only ever drives a binary vendor-vs-internal branch
    // across the backend (grep confirms no route checks a specific
    // fine-grained role string server-side -- that logic lives in the
    // frontend's usePermissions hook and, going forward, in has_permission()/
    // has_vendor_permission()). account_type is the RBAC cutover's dedicated
    // discriminator for exactly this binary, so it replaces profiles.role
    // here; profiles.role itself is untouched and still used elsewhere
    // (frontend AuthContext, legacy role-string reads) through the
    // transition window.
    const { data: profile } = await getSupabaseAdmin()
      .from("profiles")
      .select("account_type")
      .eq("id", authData.user.id)
      .maybeSingle()
    const typedProfile = profile as { account_type?: string } | null

    ;(req as AuthenticatedRequest).user = {
      id: authData.user.id,
      email: authData.user.email,
      role: typedProfile?.account_type ?? "vendor",
    }
    next()
  } catch {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}

export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-webhook-secret"]
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" })
    return
  }
  next()
}

// Keep for any routes that still need direct Supabase user lookup
export { getSupabaseClient }
