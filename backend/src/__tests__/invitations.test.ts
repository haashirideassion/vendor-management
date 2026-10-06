import * as supabaseAdmin from "../utils/supabaseAdmin"

const mockSendEmail = jest.fn()
jest.mock("../services/email.service", () => ({
  sendEmail: (...a: any[]) => mockSendEmail(...a),
  inviteHtml: jest.fn().mockReturnValue("<html>invite</html>"),
  existingAccountAddedHtml: jest.fn().mockReturnValue("<html>added</html>"),
}))

import { issueInvite, sendInviteEmail, resendCooldownRemaining } from "../services/invitations"

const admin = { generateLink: jest.fn(), getUserById: jest.fn() }
let profileRow: any = null
let auditRow: any = null

function from(table: string) {
  const chain: any = {}
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = jest.fn().mockReturnValue(chain)
  chain.maybeSingle = jest.fn().mockImplementation(async () => ({ data: table === "profiles" ? profileRow : auditRow }))
  return chain
}

jest.spyOn(supabaseAdmin, "getSupabaseAdmin").mockReturnValue({ auth: { admin }, from } as any)

beforeEach(() => {
  jest.clearAllMocks()
  profileRow = null
  auditRow = null
  delete process.env.INVITE_RESEND_COOLDOWN_SECONDS
})

describe("issueInvite", () => {
  it("creates an invite link redirecting to /accept-invite for a brand-new person", async () => {
    admin.generateLink.mockResolvedValue({ data: { user: { id: "u1" }, properties: { action_link: "https://x/verify" } }, error: null })
    const r = await issueInvite({ email: "n@x.com", fullName: "N", role: "vendor" })
    expect(r).toEqual({ profileId: "u1", isNew: true, actionLink: "https://x/verify" })
    expect(admin.generateLink).toHaveBeenCalledWith(expect.objectContaining({
      type: "invite", email: "n@x.com",
      options: expect.objectContaining({ redirectTo: "http://localhost:5173/accept-invite", data: { full_name: "N", role: "vendor" } }),
    }))
  })

  it("sends no link to an already-verified account (cannot be hijacked via an invite)", async () => {
    profileRow = { id: "u2" }
    admin.getUserById.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-01-01" } }, error: null })
    const r = await issueInvite({ email: "e@x.com", fullName: "E", role: "admin" })
    expect(r).toEqual({ profileId: "u2", isNew: false, actionLink: null })
    expect(admin.generateLink).not.toHaveBeenCalled()
  })

  it("re-issues a fresh link (superseding the old one) for a never-accepted invite", async () => {
    profileRow = { id: "u3" }
    admin.getUserById.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null })
    admin.generateLink.mockResolvedValue({ data: { user: { id: "u3" }, properties: { action_link: "https://x/new" } }, error: null })
    const r = await issueInvite({ email: "p@x.com", fullName: "P", role: "admin" })
    expect(r).toEqual({ profileId: "u3", isNew: false, actionLink: "https://x/new" })
  })

  it("propagates Supabase errors so callers can roll back", async () => {
    admin.generateLink.mockResolvedValue({ data: null, error: new Error("rate limit") })
    await expect(issueInvite({ email: "n@x.com", fullName: "N", role: "vendor" })).rejects.toThrow("rate limit")
  })
})

describe("sendInviteEmail", () => {
  it("uses the invite template when there is a link and reports delivery failure", async () => {
    mockSendEmail.mockResolvedValue({ success: false, reason: "smtp_error" })
    const r = await sendInviteEmail({ to: "a@x.com", fullName: "A", entityName: "Acme", entityLabel: "a member", actionLink: "https://x/l" })
    expect(r.success).toBe(false)
    expect(mockSendEmail.mock.calls[0][0].subject).toContain("invited to join Acme")
  })

  it("uses the 'added' template when the person already has an account", async () => {
    mockSendEmail.mockResolvedValue({ success: true })
    await sendInviteEmail({ to: "a@x.com", fullName: "A", entityName: "Acme", entityLabel: "a member", actionLink: null })
    expect(mockSendEmail.mock.calls[0][0].subject).toContain("added to Acme")
  })
})

describe("resendCooldownRemaining", () => {
  it("blocks a resend inside the cooldown window", async () => {
    auditRow = { created_at: new Date(Date.now() - 10_000).toISOString() }
    const wait = await resendCooldownRemaining("m1", "member_invite_resent")
    expect(wait).toBeGreaterThan(40)
    expect(wait).toBeLessThanOrEqual(50)
  })

  it("allows a resend after the window or when never resent", async () => {
    auditRow = { created_at: new Date(Date.now() - 120_000).toISOString() }
    expect(await resendCooldownRemaining("m1", "member_invite_resent")).toBe(0)
    auditRow = null
    expect(await resendCooldownRemaining("m1", "member_invite_resent")).toBe(0)
  })

  it("can be disabled with INVITE_RESEND_COOLDOWN_SECONDS=0", async () => {
    process.env.INVITE_RESEND_COOLDOWN_SECONDS = "0"
    auditRow = { created_at: new Date().toISOString() }
    expect(await resendCooldownRemaining("m1", "member_invite_resent")).toBe(0)
  })
})
