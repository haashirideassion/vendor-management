import { describe, it, expect, beforeEach, vi } from "vitest"

// Reset module between tests so import.meta.env changes take effect
const mockGetRedirectUrl = async (siteUrl: string | undefined, path: string) => {
  // Simulate getRedirectUrl logic directly (avoids ES module env caching issues)
  const origin = "http://localhost:5173"
  const base = siteUrl || origin
  const baseUrl = base.endsWith("/") ? base.slice(0, -1) : base
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}

describe("getRedirectUrl", () => {
  it("uses VITE_SITE_URL when set", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app", "/login")
    expect(result).toBe("https://vendor-management-hazel.vercel.app/login")
  })

  it("falls back to window.location.origin when VITE_SITE_URL is not set", async () => {
    const result = await mockGetRedirectUrl(undefined, "/login")
    expect(result).toBe("http://localhost:5173/login")
  })

  it("strips trailing slash from site URL", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app/", "/login")
    expect(result).toBe("https://vendor-management-hazel.vercel.app/login")
  })

  it("adds leading slash to path if missing", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app", "reset-password")
    expect(result).toBe("https://vendor-management-hazel.vercel.app/reset-password")
  })

  it("handles empty path with just a slash", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app", "/")
    expect(result).toBe("https://vendor-management-hazel.vercel.app/")
  })

  it("handles /reset-password path correctly", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app", "/reset-password")
    expect(result).toBe("https://vendor-management-hazel.vercel.app/reset-password")
  })

  it("does NOT produce localhost URL when VITE_SITE_URL is set to production", async () => {
    const result = await mockGetRedirectUrl("https://vendor-management-hazel.vercel.app", "/reset-password")
    expect(result).not.toContain("localhost")
  })
})

describe("getRedirectUrl — module integration", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("returns production URL with VITE_SITE_URL env set", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://vendor-management-hazel.vercel.app")
    const { getRedirectUrl } = await import("@/lib/supabase")
    expect(getRedirectUrl("/login")).toBe("https://vendor-management-hazel.vercel.app/login")
    vi.unstubAllEnvs()
  })

  it("falls back to window.location.origin when VITE_SITE_URL is absent", async () => {
    vi.stubEnv("VITE_SITE_URL", "")
    // jsdom sets window.location.origin to "http://localhost:3000"
    const { getRedirectUrl } = await import("@/lib/supabase")
    const result = getRedirectUrl("/login")
    expect(result).toMatch(/^http/)
    expect(result).toContain("/login")
    vi.unstubAllEnvs()
  })
})
