import { createBrowserClient } from "@supabase/ssr"

// Singleton Supabase browser client used throughout the app
export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

/**
 * Generates a redirect URL, prioritizing VITE_SITE_URL environment variable,
 * and falling back to the browser's window.location.origin.
 */
export function getRedirectUrl(path: string = ""): string {
  const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
  
  const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  
  return `${baseUrl}${cleanPath}`
}
