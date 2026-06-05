import { Router, Request, Response } from "express"
import rateLimit from "express-rate-limit"
import crypto from "crypto"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { hashPassword, verifyPassword } from "../services/password.service"
import { getKeyPair, decryptPassword } from "../services/crypto.service"
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_DAYS,
} from "../services/jwt.service"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendEmail, signupConfirmationHtml, passwordResetHtml, vendorSubmittedAdminHtml } = require("../services/email.service")

const router = Router()

// Supabase client typed as any — new auth tables not in generated schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any { return getSupabaseAdmin() }

// ─── GET /api/auth/public-key ─────────────────────────────────────────────────
router.get("/public-key", (_req: Request, res: Response) => {
  res.json({ publicKey: getKeyPair().publicKeyPem })
})

// ─── POST /api/auth/profile ───────────────────────────────────────────────────
router.post("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const { data, error } = await db()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[auth/profile]", err.message)
    res.status(500).json({ error: "Failed to load profile" })
  }
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  path: "/",
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post("/register", authLimiter, async (req: Request, res: Response) => {
  const { email, password, fullName, role = "vendor" } = req.body as {
    email?: string
    password?: string
    fullName?: string
    role?: string
  }

  if (!email || !password || !fullName) {
    res.status(400).json({ error: "email, password, and fullName are required" })
    return
  }

  let plainPassword: string
  try {
    plainPassword = decryptPassword(password)
  } catch {
    res.status(400).json({ error: "Invalid password encoding" })
    return
  }
  if (plainPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" })
    return
  }

  try {
    // Check duplicate email
    const { data: existing } = await db()
      .from("users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle()

    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" })
      return
    }

    const passwordHash = await hashPassword(plainPassword)

    // Insert user
    const { data: user, error: userErr } = await db()
      .from("users")
      .insert({ email: email.toLowerCase(), password_hash: passwordHash })
      .select("id")
      .single()

    if (userErr || !user) throw userErr ?? new Error("Failed to create user")

    // Insert profile
    const { error: profileErr } = await db()
      .from("profiles")
      .insert({ id: user.id, email: email.toLowerCase(), full_name: fullName, role })

    if (profileErr) throw profileErr

    // Generate email verification token
    const raw = crypto.randomBytes(32).toString("hex")
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    await db().from("email_verification_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })

    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${raw}&id=${user.id}`

    await sendEmail({
      to: email,
      subject: "Confirm your CogniVend account",
      html: signupConfirmationHtml({ fullName, confirmationLink: verifyUrl }),
    })

    await sendEmail({
      to: process.env.ADMIN_EMAIL!,
      subject: `New vendor signup: ${fullName}`,
      html: vendorSubmittedAdminHtml({
        companyName: "Pending onboarding",
        contactName: fullName,
        contactEmail: email,
        reviewUrl: `${process.env.FRONTEND_URL}/admin/vendors`,
      }),
    })

    res.status(201).json({ ok: true, message: "Check your email to verify your account." })
  } catch (err: any) {
    console.error("[register]", err.message)
    res.status(500).json({ error: "Registration failed. Please try again." })
  }
})

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post("/verify-email", async (req: Request, res: Response) => {
  const { token, userId } = req.body as { token?: string; userId?: string }

  if (!token || !userId) {
    res.status(400).json({ error: "token and userId are required" })
    return
  }

  try {
    const tokenHash = hashToken(token)

    const { data: record, error } = await db()
      .from("email_verification_tokens")
      .select("id, expires_at, used")
      .eq("user_id", userId)
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (error || !record) {
      res.status(400).json({ error: "Invalid verification link" })
      return
    }
    if (record.used) {
      res.status(400).json({ error: "This link has already been used" })
      return
    }
    if (new Date(record.expires_at) < new Date()) {
      res.status(400).json({ error: "Verification link has expired" })
      return
    }

    await Promise.all([
      db().from("users").update({ email_verified: true }).eq("id", userId),
      db().from("email_verification_tokens").update({ used: true }).eq("id", record.id),
    ])

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[verify-email]", err.message)
    res.status(500).json({ error: "Verification failed" })
  }
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/login", authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" })
    return
  }

  let plainPassword: string
  try {
    plainPassword = decryptPassword(password)
  } catch {
    res.status(400).json({ error: "Invalid password encoding" })
    return
  }

  try {
    const { data: user } = await db()
      .from("users")
      .select("id, email, password_hash, email_verified")
      .eq("email", email.toLowerCase())
      .maybeSingle()

    // Constant-time-ish: always hash even if user not found (prevent timing attacks)
    const dummyHash = "$argon2id$v=19$m=65536,t=3,p=1$dummy"
    const valid = user
      ? await verifyPassword(user.password_hash, plainPassword)
      : await verifyPassword(dummyHash, plainPassword).catch(() => false)

    if (!user || !valid) {
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    if (!user.email_verified) {
      res.status(403).json({ error: "Please verify your email before signing in." })
      return
    }

    const { data: profile } = await db()
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single()

    const role = profile?.role ?? "vendor"

    const accessToken = signAccessToken({ sub: user.id, email: user.email, appRole: role })

    const { raw, hash, expiresAt } = generateRefreshToken()

    await db().from("refresh_tokens").insert({
      user_id: user.id,
      token_hash: hash,
      expires_at: expiresAt.toISOString(),
    })

    res.cookie(REFRESH_COOKIE_NAME, raw, cookieOpts)
    res.json({
      accessToken,
      user: { id: user.id, email: user.email, role, fullName: profile?.full_name ?? "" },
    })
  } catch (err: any) {
    console.error("[login]", err.message)
    res.status(500).json({ error: "Login failed" })
  }
})

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME]

  if (!raw) {
    res.status(401).json({ error: "No refresh token" })
    return
  }

  try {
    const tokenHash = hashToken(raw)

    const { data: record } = await db()
      .from("refresh_tokens")
      .select("id, user_id, expires_at, revoked")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!record || record.revoked || new Date(record.expires_at) < new Date()) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" })
      res.status(401).json({ error: "Refresh token invalid or expired" })
      return
    }

    const { data: user } = await db()
      .from("users")
      .select("id, email")
      .eq("id", record.user_id)
      .single()

    const { data: profile } = await db()
      .from("profiles")
      .select("role, full_name")
      .eq("id", record.user_id)
      .single()

    if (!user) {
      res.status(401).json({ error: "User not found" })
      return
    }

    const role = profile?.role ?? "vendor"

    // Rotate refresh token
    const { raw: newRaw, hash: newHash, expiresAt } = generateRefreshToken()

    await Promise.all([
      db().from("refresh_tokens").update({ revoked: true }).eq("id", record.id),
      db().from("refresh_tokens").insert({
        user_id: user.id,
        token_hash: newHash,
        expires_at: expiresAt.toISOString(),
      }),
    ])

    const accessToken = signAccessToken({ sub: user.id, email: user.email, appRole: role })

    res.cookie(REFRESH_COOKIE_NAME, newRaw, cookieOpts)
    res.json({
      accessToken,
      user: { id: user.id, email: user.email, role, fullName: profile?.full_name ?? "" },
    })
  } catch (err: any) {
    console.error("[refresh]", err.message)
    res.status(500).json({ error: "Token refresh failed" })
  }
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME]

  if (raw) {
    const tokenHash = hashToken(raw)
    await db().from("refresh_tokens").update({ revoked: true }).eq("token_hash", tokenHash)
  }

  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" })
  res.json({ ok: true })
})

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post("/forgot-password", authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string }

  // Always return ok to prevent user enumeration
  res.json({ ok: true })

  if (!email) return

  try {
    const { data: user } = await db()
      .from("users")
      .select("id, email")
      .eq("email", email.toLowerCase())
      .maybeSingle()

    if (!user) return

    const raw = crypto.randomBytes(32).toString("hex")
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1h

    // Invalidate old tokens
    await db()
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("user_id", user.id)
      .eq("used", false)

    await db().from("password_reset_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${raw}&id=${user.id}`

    await sendEmail({
      to: user.email,
      subject: "Reset your CogniVend password",
      html: passwordResetHtml({ resetLink: resetUrl }),
    })
  } catch (err: any) {
    console.error("[forgot-password]", err.message)
  }
})

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, userId, password } = req.body as {
    token?: string
    userId?: string
    password?: string
  }

  if (!token || !userId || !password) {
    res.status(400).json({ error: "token, userId, and password are required" })
    return
  }

  let plainPassword: string
  try {
    plainPassword = decryptPassword(password)
  } catch {
    res.status(400).json({ error: "Invalid password encoding" })
    return
  }
  if (plainPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" })
    return
  }

  try {
    const tokenHash = hashToken(token)

    const { data: record } = await db()
      .from("password_reset_tokens")
      .select("id, expires_at, used")
      .eq("user_id", userId)
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!record) {
      res.status(400).json({ error: "Invalid reset link" })
      return
    }
    if (record.used) {
      res.status(400).json({ error: "This reset link has already been used" })
      return
    }
    if (new Date(record.expires_at) < new Date()) {
      res.status(400).json({ error: "Reset link has expired. Please request a new one." })
      return
    }

    const passwordHash = await hashPassword(plainPassword)

    await Promise.all([
      db().from("users").update({ password_hash: passwordHash }).eq("id", userId),
      db().from("password_reset_tokens").update({ used: true }).eq("id", record.id),
      // Revoke all refresh tokens so existing sessions are invalidated
      db().from("refresh_tokens").update({ revoked: true }).eq("user_id", userId),
    ])

    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" })
    res.json({ ok: true })
  } catch (err: any) {
    console.error("[reset-password]", err.message)
    res.status(500).json({ error: "Password reset failed" })
  }
})

export default router
