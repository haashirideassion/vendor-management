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

// A fresh client per call, carrying the caller's own JWT. Needed for RPCs
// like support_view_entity() that rely on auth.uid() inside a SECURITY
// DEFINER function -- getSupabaseAdmin()'s service-role client has no
// per-request user JWT, so auth.uid() would resolve to NULL and any
// is_platform_admin()-style check inside the function would always fail.
export function getSupabaseAsUser(accessToken: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { ...serverClientOpts, global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
}
