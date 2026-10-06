// Single source for the public frontend base URL used inside emails and
// Supabase redirectTo values. A missing or malformed FRONTEND_URL used to
// silently produce links like "undefined/accept-invite" or "https://x.com//login".
export function getFrontendUrl(): string {
  const raw = (process.env.FRONTEND_URL ?? "").trim()
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error("FRONTEND_URL is not set to a valid absolute URL (e.g. https://app.example.com)")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("FRONTEND_URL must use http or https")
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "")
}

export function frontendLink(path: string): string {
  return `${getFrontendUrl()}${path.startsWith("/") ? path : `/${path}`}`
}
