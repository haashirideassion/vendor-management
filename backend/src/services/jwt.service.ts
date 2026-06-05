import jwt from "jsonwebtoken"
import crypto from "crypto"

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const ACCESS_TTL = "15m"
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface AccessTokenPayload {
  sub: string       // user id — Supabase auth.uid() reads this
  email: string
  role: string      // must be "authenticated" for Supabase PostgREST
  aud: string       // must be "authenticated" for Supabase
  app_role: string  // our actual app role (admin, vendor, etc.)
}

export function signAccessToken(params: { sub: string; email: string; appRole: string }): string {
  return jwt.sign(
    {
      sub: params.sub,
      email: params.email,
      role: "authenticated",   // required by Supabase PostgREST
      aud: "authenticated",    // required by Supabase
      app_role: params.appRole,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  )
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET, { audience: "authenticated" }) as AccessTokenPayload
}

export function generateRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = crypto.randomBytes(48).toString("hex")
  const hash = crypto.createHash("sha256").update(raw).digest("hex")
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS)
  return { raw, hash, expiresAt }
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex")
}

export const REFRESH_COOKIE_NAME = "refresh_token"
export const REFRESH_TTL_DAYS = 7
