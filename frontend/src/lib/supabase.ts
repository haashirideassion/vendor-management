import { createBrowserClient } from "@supabase/ssr"

// Singleton Supabase browser client used throughout the app
export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

/**
 * Generates a dynamic redirect URL for authentication flows.
 * Prioritizes VITE_SITE_URL (env var) -> window.location.origin -> http://localhost:5173.
 */
export function getRedirectUrl(path: string = ""): string {
  let siteUrl = import.meta.env.VITE_SITE_URL || ""

  if (!siteUrl && typeof window !== "undefined") {
    siteUrl = window.location.origin
  }

  if (!siteUrl) {
    siteUrl = "http://localhost:5173"
  }

  // Normalize URLs by trimming trailing/leading slashes
  const base = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl
  const cleanPath = path.startsWith("/") ? path : `/${path}`

  return `${base}${cleanPath}`
}

