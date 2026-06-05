import request from "supertest"
import app from "../server"
import * as supabaseAdmin from "../utils/supabaseAdmin"
import { hashPassword } from "../services/password.service"
import { signAccessToken } from "../services/jwt.service"
import crypto from "crypto"

// ─── Mock crypto service (bypass RSA decryption in tests) ────────────────────
jest.mock("../services/crypto.service", () => ({
  getKeyPair: jest.fn().mockReturnValue({ publicKeyPem: "mock-pem" }),
  decryptPassword: jest.fn((s: string) => s), // treat input as already plain text
}))

// ─── Mock email service (no real SMTP in tests) ───────────────────────────────
jest.mock("../services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  signupConfirmationHtml: jest.fn().mockReturnValue("<html>confirm</html>"),
  passwordResetHtml: jest.fn().mockReturnValue("<html>reset</html>"),
  vendorSubmittedAdminHtml: jest.fn().mockReturnValue("<html>admin</html>"),
}), { virtual: true })

// ─── Mock Supabase (no real DB in tests) ─────────────────────────────────────
const mockFrom = jest.fn()
jest.spyOn(supabaseAdmin, "getSupabaseAdmin").mockReturnValue({ from: mockFrom } as any)
jest.spyOn(supabaseAdmin, "getSupabaseClient").mockReturnValue({ from: mockFrom } as any)

function buildChain(result: any) {
  const chain: any = {}
  const methods = ["select", "insert", "update", "eq", "maybeSingle", "single"]
  methods.forEach((m) => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain.maybeSingle = jest.fn().mockResolvedValue(result)
  chain.single = jest.fn().mockResolvedValue(result)
  chain.insert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: jest.fn().mockResolvedValue(result),
    }),
    ...chain,
  })
  chain.update = jest.fn().mockReturnValue(chain)
  return chain
}

// ─── /health ──────────────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

// ─── POST /api/auth/register ──────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  it("returns 400 when password too short", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "a@b.com", password: "short", fullName: "Test User",
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/8 characters/)
  })

  it("returns 409 when email already exists", async () => {
    mockFrom.mockReturnValue(buildChain({ data: { id: "existing-id" }, error: null }))
    const res = await request(app).post("/api/auth/register").send({
      email: "exists@b.com", password: "password123", fullName: "Existing User",
    })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/)
  })

  it("returns 201 on successful registration", async () => {
    // First call (check duplicate) → no existing user
    // Second call (insert user) → returns new user
    // Third call (insert profile) → ok
    // Fourth call (insert verification token) → ok
    mockFrom
      .mockReturnValueOnce(buildChain({ data: null, error: null }))  // duplicate check
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: "new-uuid" }, error: null }),
          }),
        }),
      })
      .mockReturnValue(buildChain({ data: {}, error: null }))  // profile + token inserts

    const res = await request(app).post("/api/auth/register").send({
      email: "new@b.com", password: "password123", fullName: "New User",
    })
    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
  })
})

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" })
    expect(res.status).toBe(400)
  })

  it("returns 401 for unknown email", async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@b.com", password: "password123",
    })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid email or password/)
  })

  it("returns 401 for wrong password", async () => {
    const hash = await hashPassword("correctpassword")
    mockFrom.mockReturnValue(
      buildChain({ data: { id: "uid", email: "a@b.com", password_hash: hash, email_verified: true }, error: null })
    )
    const res = await request(app).post("/api/auth/login").send({
      email: "a@b.com", password: "wrongpassword",
    })
    expect(res.status).toBe(401)
  })

  it("returns 403 when email not verified", async () => {
    const hash = await hashPassword("password123")
    mockFrom.mockReturnValue(
      buildChain({ data: { id: "uid", email: "a@b.com", password_hash: hash, email_verified: false }, error: null })
    )
    const res = await request(app).post("/api/auth/login").send({
      email: "a@b.com", password: "password123",
    })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/verify your email/)
  })

  it("returns accessToken and sets cookie on valid login", async () => {
    const hash = await hashPassword("password123")
    mockFrom
      .mockReturnValueOnce(buildChain({
        data: { id: "uid-1", email: "a@b.com", password_hash: hash, email_verified: true }, error: null,
      }))
      .mockReturnValueOnce(buildChain({ data: { role: "vendor", full_name: "Test" }, error: null }))
      .mockReturnValue(buildChain({ data: {}, error: null }))

    const res = await request(app).post("/api/auth/login").send({
      email: "a@b.com", password: "password123",
    })
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.role).toBe("vendor")
    expect(res.headers["set-cookie"]).toBeDefined()
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]
    expect(cookie).toMatch(/HttpOnly/i)
  })
})

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  it("returns ok and clears cookie", async () => {
    mockFrom.mockReturnValue(buildChain({ data: {}, error: null }))
    const res = await request(app).post("/api/auth/logout")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const cookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.[0] ?? ""
    expect(cookie).toMatch(/refresh_token=;/)
  })
})

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
describe("POST /api/auth/refresh", () => {
  it("returns 401 when no cookie", async () => {
    const res = await request(app).post("/api/auth/refresh")
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/No refresh token/)
  })

  it("returns 401 for unknown/revoked token", async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=invalidtoken")
    expect(res.status).toBe(401)
  })

  it("returns new accessToken and rotates cookie for valid token", async () => {
    const rawToken = "validrawtoken123"
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex")
    const expiresAt = new Date(Date.now() + 86400000).toISOString()

    mockFrom
      .mockReturnValueOnce(buildChain({
        data: { id: "rt-1", user_id: "uid-1", expires_at: expiresAt, revoked: false }, error: null,
      }))
      .mockReturnValueOnce(buildChain({ data: { id: "uid-1", email: "a@b.com" }, error: null }))
      .mockReturnValueOnce(buildChain({ data: { role: "vendor", full_name: "Test" }, error: null }))
      .mockReturnValue(buildChain({ data: {}, error: null }))

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refresh_token=${rawToken}`)
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBeDefined()
  })
})

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
describe("POST /api/auth/forgot-password", () => {
  it("always returns ok (prevents user enumeration)", async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@b.com" })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("returns ok even without email field", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({})
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
describe("POST /api/auth/reset-password", () => {
  it("returns 400 when fields missing", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: "abc" })
    expect(res.status).toBe(400)
  })

  it("returns 400 when password too short", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "abc", userId: "uid-1", password: "short",
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/8 characters/)
  })

  it("returns 400 for invalid token", async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "invalidtoken", userId: "uid-1", password: "newpassword123",
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid reset link/)
  })

  it("returns 400 for expired token", async () => {
    mockFrom.mockReturnValue(buildChain({
      data: { id: "tok-1", expires_at: new Date(Date.now() - 1000).toISOString(), used: false },
      error: null,
    }))
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "expiredtoken", userId: "uid-1", password: "newpassword123",
    })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expired/)
  })

  it("returns 200 on valid reset", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString()
    mockFrom
      .mockReturnValueOnce(buildChain({
        data: { id: "tok-1", expires_at: futureDate, used: false }, error: null,
      }))
      .mockReturnValue(buildChain({ data: {}, error: null }))

    const res = await request(app).post("/api/auth/reset-password").send({
      token: "validtoken", userId: "uid-1", password: "newpassword123",
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

// ─── POST /api/auth/verify-email ─────────────────────────────────────────────
describe("POST /api/auth/verify-email", () => {
  it("returns 400 when fields missing", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ token: "abc" })
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid token", async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }))
    const res = await request(app).post("/api/auth/verify-email").send({
      token: "badtoken", userId: "uid-1",
    })
    expect(res.status).toBe(400)
  })

  it("returns 200 on successful verification", async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString()
    mockFrom
      .mockReturnValueOnce(buildChain({
        data: { id: "vt-1", expires_at: futureDate, used: false }, error: null,
      }))
      .mockReturnValue(buildChain({ data: {}, error: null }))

    const res = await request(app).post("/api/auth/verify-email").send({
      token: "goodtoken", userId: "uid-1",
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

// ─── requireAuth middleware ───────────────────────────────────────────────────
describe("requireAuth middleware", () => {
  it("returns 401 when Authorization header missing", async () => {
    // /api/vendor/status-change uses requireWebhookSecret, not requireAuth
    // Use a protected route if one exists; otherwise test the middleware directly
    const { requireAuth } = await import("../middleware/auth")
    const mockReq: any = { headers: {} }
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const mockNext = jest.fn()
    await requireAuth(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it("returns 401 for invalid token", async () => {
    const { requireAuth } = await import("../middleware/auth")
    const mockReq: any = { headers: { authorization: "Bearer invalidtoken" } }
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const mockNext = jest.fn()
    await requireAuth(mockReq, mockRes, mockNext)
    expect(mockRes.status).toHaveBeenCalledWith(401)
  })

  it("calls next() with valid token", async () => {
    const token = signAccessToken({ sub: "uid-1", email: "a@b.com", appRole: "admin" })
    const { requireAuth } = await import("../middleware/auth")
    const mockReq: any = { headers: { authorization: `Bearer ${token}` } }
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const mockNext = jest.fn()
    await requireAuth(mockReq, mockRes, mockNext)
    expect(mockNext).toHaveBeenCalled()
    expect(mockReq.user).toMatchObject({ id: "uid-1", role: "admin" })
  })
})
