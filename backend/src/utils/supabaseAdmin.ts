import { createClient } from "@supabase/supabase-js"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = typeof WebSocket === "undefined" ? require("ws") : undefined
const serverClientOpts = {
  ...(ws ? { realtime: { transport: ws as any } } : {}),
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}

let _admin: ReturnType<typeof createClient> | null = null
export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      serverClientOpts
    )
  }
  return _admin
}

let _client: ReturnType<typeof createClient> | null = null
export function getSupabaseClient() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      serverClientOpts
    )
  }
  return _client
}
