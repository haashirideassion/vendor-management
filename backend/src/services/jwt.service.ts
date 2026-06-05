import jwt from "jsonwebtoken"
import crypto from "crypto"

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!
const ACCESS_TTL = "15m"
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface AccessTokenPayload {
  sub: string   // user id
  email: string
  role: string
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL })
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload
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
