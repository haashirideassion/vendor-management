import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { frontendLink } from "../utils/appUrl"
import { sendEmail, inviteHtml, existingAccountAddedHtml, SendEmailResult } from "./email.service"

// Shared by every invitation endpoint (org members, vendor staff, vendor
// portal admin, org-with-admin). Tokens are Supabase Auth's own invite OTPs:
// unpredictable, stored hashed by GoTrue, single-use, time-limited, and bound
// to the invited user's email -- so a link can only ever complete the account
// it was issued for, and issuing a new one for the same user supersedes the
// previous link.

function db(): any { return getSupabaseAdmin() }

export interface IssuedInvite {
  profileId: string
  /** true when this call created the auth user (so failure cleanup may delete it) */
  isNew: boolean
  /** null when the person already has a verified account and just needs to sign in */
  actionLink: string | null
}

export async function issueInvite(params: {
  email: string
  fullName: string
  role: "admin" | "vendor"
}): Promise<IssuedInvite> {
  const { email, fullName, role } = params
  const redirectTo = frontendLink("/accept-invite")

  const { data: existingProfile } = await db().from("profiles").select("id").eq("email", email).maybeSingle()

  if (existingProfile) {
    const { data: authData, error: authError } = await db().auth.admin.getUserById(existingProfile.id)
    if (authError) throw authError
    if (authData?.user?.email_confirmed_at) {
      return { profileId: existingProfile.id, isNew: false, actionLink: null }
    }
    // Invited earlier (e.g. by another organization) but never accepted:
    // re-issue the invite link, which invalidates the previous one.
    const { data: relinked, error: linkError } = await db().auth.admin.generateLink({
      type: "invite", email, options: { redirectTo, data: { full_name: fullName, role } },
    })
    if (linkError) throw linkError
    return { profileId: existingProfile.id, isNew: false, actionLink: relinked.properties.action_link }
  }

  const { data: invited, error: inviteError } = await db().auth.admin.generateLink({
    type: "invite", email, options: { redirectTo, data: { full_name: fullName, role } },
  })
  if (inviteError) throw inviteError
  return { profileId: invited.user.id, isNew: true, actionLink: invited.properties.action_link }
}

export async function sendInviteEmail(params: {
  to: string
  fullName: string
  entityName: string
  entityLabel: string
  actionLink: string | null
  reminder?: boolean
}): Promise<SendEmailResult> {
  const { to, fullName, entityName, entityLabel, actionLink, reminder } = params
  if (!actionLink) {
    return sendEmail({
      to,
      subject: `You've been added to ${entityName} on CogniVend`,
      html: existingAccountAddedHtml({ fullName, entityName, entityLabel, loginLink: frontendLink("/login") }),
    })
  }
  return sendEmail({
    to,
    subject: `${reminder ? "Reminder: you've" : "You've"} been invited to join ${entityName} on CogniVend`,
    html: inviteHtml({ fullName, entityName, entityLabel, inviteLink: actionLink }),
  })
}

const RESEND_COOLDOWN_SECONDS = () => {
  const n = parseInt(process.env.INVITE_RESEND_COOLDOWN_SECONDS || "", 10)
  return Number.isFinite(n) && n >= 0 ? n : 60
}

/**
 * DB-backed (audit_log) so it holds across serverless instances. Returns the
 * number of seconds the caller must still wait, or 0 if resending is allowed.
 */
export async function resendCooldownRemaining(entityId: string, action: string): Promise<number> {
  const cooldown = RESEND_COOLDOWN_SECONDS()
  if (cooldown === 0) return 0
  const { data } = await db()
    .from("audit_log")
    .select("created_at")
    .eq("entity_id", entityId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.created_at) return 0
  const elapsed = (Date.now() - new Date(data.created_at).getTime()) / 1000
  return elapsed < cooldown ? Math.ceil(cooldown - elapsed) : 0
}
