import { Request, Response, NextFunction } from "express"
import { verifyAccessToken } from "../services/jwt.service"
import { getSupabaseClient } from "../utils/supabaseAdmin"

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
    const payload = verifyAccessToken(token)
    ;(req as AuthenticatedRequest).user = { id: payload.sub, email: payload.email, role: payload.app_role }
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
