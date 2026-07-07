import { createClient } from "@supabase/supabase-js"
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabaseConfig"

// Module-level token — set by AuthContext after login/refresh, cleared on logout.
// Custom fetch injects it so RLS policies (auth.uid() reads the `sub` claim) keep working.
let _accessToken: string | null = null

export function setSupabaseAccessToken(token: string | null) {
  _accessToken = token
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    global: {
      fetch: (url, options = {}) => {
        const headers = new Headers((options as RequestInit).headers)
        if (_accessToken) {
          headers.set("Authorization", `Bearer ${_accessToken}`)
        }
        return fetch(url, { ...(options as RequestInit), headers })
      },
    },
    auth: {
      // Disable Supabase's own session management — we handle auth ourselves
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)
