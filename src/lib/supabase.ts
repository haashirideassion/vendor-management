import { createBrowserClient } from "@supabase/ssr"

// Singleton Supabase browser client used throughout the app
export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
)
