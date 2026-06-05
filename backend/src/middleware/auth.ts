import { Request, Response, NextFunction } from "express"
import { createClient } from "@supabase/supabase-js"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = typeof WebSocket === "undefined" ? require("ws") : undefined

let _supabase: ReturnType<typeof createClient> | null = null
const getSupabase = () => {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      ws ? { realtime: { transport: ws as any } } : {}
    )
  }
  return _supabase
}

// Verifies a Supabase JWT from the Authorization: Bearer <token> header.
// Attaches the authenticated user object to req for downstream handlers.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) {
    res.status(401).json({ error: "Missing authorization token" })
    return
  }

  const { data: { user }, error } = await getSupabase().auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired token" })
    return
  }

  ;(req as any).user = user
  next()
}

// Validates the shared secret Supabase sends in the x-webhook-secret header.
// Must match WEBHOOK_SECRET in backend .env.
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["x-webhook-secret"]
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" })
    return
  }
  next()
}
