import { Router, Request, Response } from "express"
import { createClient } from "@supabase/supabase-js"
// @ts-ignore
import { sendEmail, signupConfirmationHtml, passwordResetHtml, vendorSubmittedAdminHtml } from "../services/email.service"

const router = Router()

let _supabaseAdmin: ReturnType<typeof createClient> | null = null
const getSupabaseAdmin = () => {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}


router.post("/signup-notification", async (req: Request, res: Response) => {
  const { email, fullName } = req.body as { email?: string; fullName?: string }

  if (!email || !fullName) {
    res.status(400).json({ error: "email and fullName are required" })
    return
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type: "signup",
      email,
      password: "",
      options: { redirectTo: `${process.env.FRONTEND_URL}/login` },
    })
    if (error) throw error

    await sendEmail({
      to: email,
      subject: "Confirm your CogniVend account",
      html: signupConfirmationHtml({
        fullName,
        confirmationLink: data.properties.action_link,
      }),
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

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[signup-notification]", err.message)
    res.status(500).json({ error: err.message })
  }
})

router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string }

  if (!email) {
    res.status(400).json({ error: "email is required" })
    return
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${process.env.FRONTEND_URL}/reset-password` },
    })
    if (error) throw error

    await sendEmail({
      to: email,
      subject: "Reset your CogniVend password",
      html: passwordResetHtml({ resetLink: data.properties.action_link }),
    })
  } catch (err: any) {
    console.error("[forgot-password]", err.message)
    // Intentionally swallowed — always return ok to prevent user enumeration
  }

  res.json({ ok: true })
})

export default router
