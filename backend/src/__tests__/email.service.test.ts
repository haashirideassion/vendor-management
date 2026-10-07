const sendMail = jest.fn()
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail, verify: jest.fn() })) },
}))

import nodemailer from "nodemailer"
import {
  sendEmail, readSmtpConfig, resetTransporter, isConfigured, escapeHtml, inviteHtml, signupConfirmationHtml,
} from "../services/email.service"

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "user@example.test", SMTP_PASS: "secret-pass",
  SMTP_FROM_EMAIL: "noreply@example.test", SMTP_FROM_NAME: "CogniVend",
}

function setEnv(env: Record<string, string | undefined>) {
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "SMTP_FROM", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "SMTP_TLS_REJECT_UNAUTHORIZED", "SMTP_USERNAME", "SMTP_PASSWORD"]) delete process.env[k]
  Object.assign(process.env, env)
  resetTransporter()
}

beforeEach(() => {
  jest.clearAllMocks()
  setEnv(SMTP_ENV)
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "log").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe("SMTP configuration", () => {
  it("reports every missing variable instead of defaulting silently", () => {
    setEnv({})
    expect(readSmtpConfig().missing).toEqual(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"])
    expect(isConfigured()).toBe(false)
  })

  it("accepts SMTP_USERNAME / SMTP_PASSWORD as aliases for the credentials", () => {
    setEnv({ SMTP_HOST: "h", SMTP_USERNAME: "alias-user", SMTP_PASSWORD: "alias-pass" })
    const { config, missing } = readSmtpConfig()
    expect(missing).toEqual([])
    expect(config?.user).toBe("alias-user")
    expect(config?.pass).toBe("alias-pass")
  })

  it("picks implicit TLS for 465 and STARTTLS for 587", () => {
    setEnv({ ...SMTP_ENV, SMTP_PORT: "465" })
    expect(readSmtpConfig().config?.security).toBe("ssl")
    setEnv({ ...SMTP_ENV, SMTP_PORT: "587" })
    expect(readSmtpConfig().config?.security).toBe("starttls")
    setEnv({ ...SMTP_ENV, SMTP_PORT: "2525", SMTP_SECURE: "ssl" })
    expect(readSmtpConfig().config?.security).toBe("ssl")
  })

  it("verifies TLS certificates unless explicitly disabled", () => {
    expect(readSmtpConfig().config?.rejectUnauthorized).toBe(true)
    setEnv({ ...SMTP_ENV, SMTP_TLS_REJECT_UNAUTHORIZED: "false" })
    expect(readSmtpConfig().config?.rejectUnauthorized).toBe(false)
  })
})

describe("sendEmail", () => {
  it("returns not_configured (and never throws) when SMTP env is missing", async () => {
    setEnv({})
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    expect(r).toEqual({ success: false, reason: "not_configured" })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("rejects an invalid recipient", async () => {
    const r = await sendEmail({ to: "not-an-email", subject: "s", html: "<p>x</p>" })
    expect(r.reason).toBe("invalid_recipient")
  })

  it("sends HTML plus a plain-text part that still contains the action link", async () => {
    sendMail.mockResolvedValue({ messageId: "id-1" })
    const html = inviteHtml({ fullName: "Ann", entityName: "Acme", inviteLink: "https://app.test/verify?token=abc" })
    const r = await sendEmail({ to: "ann@acme.test", subject: "Hi", html })
    expect(r.success).toBe(true)
    const opts = sendMail.mock.calls[0][0]
    expect(opts.from).toEqual({ name: "CogniVend", address: "noreply@example.test" })
    expect(opts.text).toContain("https://app.test/verify?token=abc")
  })

  it("does not retry permanent failures such as bad credentials (535)", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("auth failed"), { responseCode: 535, code: "EAUTH" }))
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    expect(r).toEqual({ success: false, reason: "smtp_error" })
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it("retries transient failures then succeeds", async () => {
    sendMail
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce({ messageId: "id-2" })
    const r = await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    expect(r.success).toBe(true)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it("never logs the SMTP password or the message body", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("boom"), { responseCode: 550 }))
    const html = signupConfirmationHtml({ fullName: "Ann", confirmationLink: "https://app.test/verify?token=SECRETTOKEN" })
    await sendEmail({ to: "a@b.com", subject: "s", html })
    const logged = JSON.stringify([...(console.error as jest.Mock).mock.calls, ...(console.log as jest.Mock).mock.calls])
    expect(logged).not.toContain("secret-pass")
    expect(logged).not.toContain("SECRETTOKEN")
  })

  it("builds the transport with TLS validation and timeouts", async () => {
    sendMail.mockResolvedValue({ messageId: "x" })
    await sendEmail({ to: "a@b.com", subject: "s", html: "<p>x</p>" })
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: "smtp.example.test", secure: false, requireTLS: true,
      tls: { rejectUnauthorized: true }, connectionTimeout: expect.any(Number),
    }))
  })
})

describe("templates", () => {
  it("escapes user-controlled values", () => {
    expect(escapeHtml(`<img src=x onerror="a">`)).not.toContain("<img")
    const html = inviteHtml({ fullName: "<script>x</script>", entityName: "A&B", inviteLink: "https://app.test/?a=1&b=2" })
    expect(html).not.toContain("<script>")
    expect(html).toContain("A&amp;B")
  })
})
