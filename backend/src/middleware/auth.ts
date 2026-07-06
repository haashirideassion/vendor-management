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

    const { data: profile } = await getSupabaseAdmin()
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle()
    const typedProfile = profile as { role?: string } | null

    ;(req as AuthenticatedRequest).user = {
      id: authData.user.id,
      email: authData.user.email,
      role: typedProfile?.role ?? "vendor",
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
