import { Router, Request, Response } from "express"
import rateLimit from "express-rate-limit"
import { getSupabaseAdmin, getSupabaseClient } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { getKeyPair, decryptPassword } from "../services/crypto.service"
import { REFRESH_COOKIE_NAME, REFRESH_TTL_DAYS } from "../services/jwt.service"
import { sendEmail, signupConfirmationHtml, vendorSubmittedAdminHtml, passwordResetHtml } from "../services/email.service"

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

// A profile can hold 'invited' organization_members rows from the
// create-with-admin onboarding flow (superadmin invited them before they'd
// ever logged in). The first time that profile successfully authenticates,
// flip those memberships to 'active' -- this is a no-op once already active.
async function activateInvitedMemberships(profileId: string) {
  await db()
    .from("organization_members")
    .update({ status: "active" })
    .eq("profile_id", profileId)
    .eq("status", "invited")
}

// Mirrors activateInvitedMemberships for the vendor side (vendor_users.invite
// and vendors/invite-portal-user both create rows with status: 'invited').
// Without this, resolveVendorId() -- which every vendor-scoped list endpoint
// and vendor-users.ts depend on -- would never resolve for an invited vendor
// user even after they accept their invite and log in, since it only
// matches status: 'active'.
async function activateInvitedVendorUsers(profileId: string) {
  await db()
    .from("vendor_users")
    .update({ status: "active" })
    .eq("profile_id", profileId)
    .eq("status", "invited")
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

// POST /api/auth/update-my-profile — personal fields (name + mobile) that
// any authenticated user (vendor or org staff, any role) can edit for
// themselves. Deliberately excludes email -- it's the Supabase Auth login
// identifier, and changing it needs a real re-verification flow this doc
// didn't ask for, so it's shown read-only wherever this is surfaced.
router.post("/update-my-profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const { fullName, mobile } = req.body as { fullName?: string; mobile?: string }
    if (!fullName?.trim()) return res.status(400).json({ error: "fullName is required" })

    const { data, error } = await db()
      .from("profiles")
      .update({ full_name: fullName.trim(), mobile: mobile?.trim() || null })
      .eq("id", userId)
      .select("*")
      .single()
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[auth/update-my-profile]", err.message)
    res.status(500).json({ error: "Failed to update profile" })
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
    const { error: createError } = await db().auth.admin.createUser({
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

    // handle_new_user() (020_rbac_backfill.sql) already inserts a fully-formed
    // profiles row -- including account_type, derived from this same
    // user_metadata -- the instant createUser() commits the auth.users row.
    // An explicit .upsert() here used to "make sure a profile exists" from
    // before that trigger existed, but Supabase's upsert (merge-duplicates)
    // nulls out every column NOT in the payload on conflict, including the
    // NOT NULL account_type -- so this call was clobbering the trigger's own
    // row and hard-failing every signup with a 500. Removed rather than
    // fixed-in-place: the trigger already does this job, correctly.

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

const ORG_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── POST /api/auth/register-organization ────────────────────────────────────
// The "Organisation" tab of the signup screen (the "Vendor" tab is /register
// above). Self-service equivalent of superadmin.ts's /organizations/create-
// with-admin -- same org + first-Admin-membership creation, but the signer-
// upper IS the admin (createUser + a password they set themselves, not an
// email invite), and both rows go straight to 'active'/'active' since there's
// no separate invitee to wait on. Lands the caller in the org-onboarding
// wizard after they log in.
router.post("/register-organization", authLimiter, async (req: Request, res: Response) => {
  const { email, password, fullName, companyName } = req.body as {
    email?: string; password?: string; fullName?: string; companyName?: string
  }

  if (!email?.trim() || !password || !fullName?.trim() || !companyName?.trim()) {
    return res.status(400).json({ error: "email, password, fullName, and companyName are required" })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!ORG_EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: "email is not a valid email address" })
  }

  let plainPassword: string
  try {
    plainPassword = decryptPassword(password)
  } catch {
    return res.status(400).json({ error: "Invalid password encoding" })
  }
  if (plainPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" })
  }

  // Auto-derived from companyName, mirroring the frontend's own slugify()
  // convention used elsewhere (SuperadminOrganizations.tsx's create dialog).
  const slug = companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  const { data: slugClash } = await db().from("organizations").select("id").eq("slug", slug).maybeSingle()
  if (slugClash) {
    return res.status(409).json({ error: "An organization with this name is already registered" })
  }

  // Same compensating-cleanup pattern as create-with-admin: no cross-table
  // transaction via supabase-js, so undo everything created so far if a
  // later step fails, rather than leaving an org with no admin.
  let orgId: string | null = null
  let profileId: string | null = null

  try {
    const { data: org, error: orgError } = await db()
      .from("organizations")
      .insert({ name: companyName.trim(), slug, status: "active", requires_onboarding_approval: true })
      .select()
      .single()
    if (orgError) throw orgError
    orgId = org.id

    const { data: created, error: createError } = await db().auth.admin.createUser({
      email: normalizedEmail,
      password: plainPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName.trim(), role: "admin" },
    })
    if (createError) {
      const status = createError.message.toLowerCase().includes("already") ? 409 : 500
      throw Object.assign(new Error(createError.message), { status })
    }
    profileId = created.user.id
    // handle_new_user() (020_rbac_backfill.sql) already inserts the profiles
    // row from this same user_metadata the instant the auth.users row commits.

    const { data: newMember, error: memberError } = await db()
      .from("organization_members")
      .insert({ org_id: orgId, profile_id: profileId, org_role: "org_admin", status: "active", is_primary: true })
      .select("id")
      .single()
    if (memberError) throw memberError

    const { data: adminRole, error: adminRoleError } = await db()
      .from("roles")
      .select("id")
      .eq("scope", "org")
      .eq("name", "Admin")
      .single()
    if (adminRoleError) throw adminRoleError

    const { error: memberRoleError } = await db()
      .from("org_member_roles")
      .insert({ org_member_id: newMember.id, role_id: adminRole.id })
    if (memberRoleError) throw memberRoleError

    await db().from("audit_log").insert({
      entity_type: "organization", entity_id: orgId, action: "organization_self_registered",
      new_value: { name: companyName.trim(), slug, admin_email: normalizedEmail },
      performed_by: profileId, org_id: orgId,
    })

    await sendEmail({
      to: normalizedEmail,
      subject: "Your CogniVend account is ready",
      html: signupConfirmationHtml({ fullName: fullName.trim(), confirmationLink: `${process.env.FRONTEND_URL}/login` }),
      text: `Your CogniVend account is ready. Please login at ${process.env.FRONTEND_URL}/login`,
    })

    res.status(201).json({ ok: true, message: "Organization created. You can now sign in." })
  } catch (err: any) {
    console.error("[register-organization]", err.message)
    try {
      if (profileId) {
        await db().from("profiles").delete().eq("id", profileId)
        await db().auth.admin.deleteUser(profileId)
      }
      if (orgId) await db().from("organizations").delete().eq("id", orgId)
    } catch (cleanupErr: any) {
      console.error("[register-organization] cleanup failed", cleanupErr.message)
    }
    res.status(err.status ?? 500).json({ error: err.message || "Registration failed. Please try again." })
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
    await activateInvitedMemberships(data.user.id)
    await activateInvitedVendorUsers(data.user.id)
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
    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await db().auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo: `${process.env.FRONTEND_URL}/reset-password` },
    })
    if (error) throw error

    await sendEmail({
      to: normalizedEmail,
      subject: "Reset your CogniVend password",
      html: passwordResetHtml({ resetLink: data.properties.action_link }),
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
