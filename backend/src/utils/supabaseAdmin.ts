import { createClient } from "@supabase/supabase-js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = typeof WebSocket === "undefined" ? require("ws") : undefined
const wsOpts = ws ? { realtime: { transport: ws as any } } : {}

let _admin: ReturnType<typeof createClient> | null = null
export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      wsOpts
    )
  }
  return _admin
}

let _client: ReturnType<typeof createClient> | null = null
export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      wsOpts
    )
  }
  return _client
}
