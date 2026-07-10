import { Router, Request, Response } from "express"
import rateLimit from "express-rate-limit"
import { getSupabaseAdmin, getSupabaseClient } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { getKeyPair, decryptPassword } from "../services/crypto.service"
import { REFRESH_COOKIE_NAME, REFRESH_TTL_DAYS } from "../services/jwt.service"
import { sendEmail, signupConfirmationHtml, vendorSubmittedAdminHtml } from "../services/email.service"

const router = Router()

// Supabase client typed as any — new auth tables not in generated schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any { return getSupabaseAdmin() }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function authClient(): any { return getSupabaseClient() }

async function getProfile(userId: string) {
  const { data, error } = await db()
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function ensureProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, any> }) {
  const existing = await getProfile(user.id)
  if (existing) return existing

  const fullName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email?.split("@")[0] ??
    ""

  const { data, error } = await db()
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email?.toLowerCase() ?? "",
      full_name: fullName,
      role: "vendor",
    })
    .select("role, full_name, email")
    .single()

  if (error) throw error
  return data
}

function sendSession(res: Response, session: any, profile: any) {
  res.cookie(REFRESH_COOKIE_NAME, session.refresh_token, cookieOpts)
  res.json({
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email,
      role: profile?.role ?? "vendor",
      fullName: profile?.full_name ?? "",
    },
  })
}

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

const isProd = process.env.NODE_ENV === "production"
const cookieOpts = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "strict") as "none" | "strict",
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
    const { data: created, error: createError } = await db().auth.admin.createUser({
      email: email.toLowerCase(),
      password: plainPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    })

    if (createError) {
      const status = createError.message.toLowerCase().includes("already") ? 409 : 500
      res.status(status).json({ error: createError.message })
      return
    }

    const { error: profileErr } = await db()
      .from("profiles")
      .upsert({ id: created.user.id, email: email.toLowerCase(), full_name: fullName, role }, {
        onConflict: "id"
      })

    if (profileErr) throw profileErr

    await sendEmail({
      to: email,
      subject: "Your CogniVend account is ready",
      html: signupConfirmationHtml({ fullName, confirmationLink: `${process.env.FRONTEND_URL}/login` }),
      text: `Your CogniVend account is ready. Please login at ${process.env.FRONTEND_URL}/login`,
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
      text: `New vendor signup: ${fullName}. Please review at ${process.env.FRONTEND_URL}/admin/vendors`,
    })

    res.status(201).json({ ok: true, message: "Account created. You can now sign in." })
  } catch (err: any) {
    console.error("[register]", err.message)
    res.status(500).json({ error: "Registration failed. Please try again." })
  }
})

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
router.post("/verify-email", async (req: Request, res: Response) => {
  res.json({ ok: true })
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
    const { data, error } = await authClient().auth.signInWithPassword({
      email: email.toLowerCase(),
      password: plainPassword,
    })

    if (error || !data.session || !data.user) {
      if (error?.message?.toLowerCase().includes("email logins are disabled")) {
        res.status(503).json({ error: "Supabase email/password login is disabled for this project." })
        return
      }
      res.status(401).json({ error: "Invalid email or password" })
      return
    }

    const profile = await ensureProfile(data.user)
    sendSession(res, { ...data.session, user: data.user }, profile)
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
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: raw })

    if (error || !data.session || !data.user) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/", secure: isProd, sameSite: isProd ? "none" : "strict" })
      res.status(401).json({ error: "Refresh token invalid or expired" })
      return
    }

    const profile = await ensureProfile(data.user)
    sendSession(res, { ...data.session, user: data.user }, profile)
  } catch (err: any) {
    console.error("[refresh]", err.message)
    res.status(500).json({ error: "Token refresh failed" })
  }
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME]

  if (raw) await authClient().auth.signOut().catch(() => {})

  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/", secure: isProd, sameSite: isProd ? "none" : "strict" })
  res.json({ ok: true })
})

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post("/forgot-password", authLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string }

  // Always return ok to prevent user enumeration
  res.json({ ok: true })

  if (!email) return

  try {
    await authClient().auth.resetPasswordForEmail(email.toLowerCase(), {
      redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
    })
  } catch (err: any) {
    console.error("[forgot-password]", err.message)
  }
})

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post("/reset-password", async (req: Request, res: Response) => {
  const { token, password } = req.body as {
    token?: string
    password?: string
  }

  if (!token || !password) {
    res.status(400).json({ error: "token and password are required" })
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
    const { data: authData, error: authError } = await db().auth.getUser(token)
    if (authError || !authData.user) {
      res.status(400).json({ error: "Invalid reset link" })
      return
    }

    const { error } = await db().auth.admin.updateUserById(authData.user.id, {
      password: plainPassword,
    })

    if (error) throw error

    res.clearCookie(REFRESH_COOKIE_NAME, { path: "/", secure: isProd, sameSite: isProd ? "none" : "strict" })
    res.json({ ok: true })
  } catch (err: any) {
    console.error("[reset-password]", err.message)
    res.status(500).json({ error: "Password reset failed" })
  }
})

export default router
