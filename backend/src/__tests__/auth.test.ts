import request from "supertest"
import app from "../server"
import * as supabaseAdmin from "../utils/supabaseAdmin"

jest.mock("../services/crypto.service", () => ({
  getKeyPair: jest.fn().mockReturnValue({ publicKeyPem: "mock-pem" }),
  decryptPassword: jest.fn((s: string) => s),
}))

jest.mock("../services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  signupConfirmationHtml: jest.fn().mockReturnValue("<html>confirm</html>"),
  vendorSubmittedAdminHtml: jest.fn().mockReturnValue("<html>admin</html>"),
  passwordResetHtml: jest.fn().mockReturnValue("<html>reset</html>"),
}), { virtual: true })

const mockAdminAuth = {
  admin: {
    createUser: jest.fn(),
    updateUserById: jest.fn(),
    generateLink: jest.fn(),
  },
  getUser: jest.fn(),
  signOut: jest.fn(),
}

const mockClientAuth = {
  signInWithPassword: jest.fn(),
  refreshSession: jest.fn(),
  getUser: jest.fn(),
  signOut: jest.fn(),
}

const mockFrom = jest.fn()

jest.spyOn(supabaseAdmin, "getSupabaseAdmin").mockReturnValue({
  auth: mockAdminAuth,
  from: mockFrom,
} as any)

jest.spyOn(supabaseAdmin, "getSupabaseClient").mockReturnValue({
  auth: mockClientAuth,
} as any)

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
  return chain
}

const authUser = {
  id: "uid-1",
  email: "a@b.com",
  user_metadata: { full_name: "Test User" },
}

const session = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  user: authUser,
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health")
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe("POST /api/auth/register", () => {
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@b.com" })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })

  it("returns 409 when Supabase reports an existing user", async () => {
    mockAdminAuth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    })

    const res = await request(app).post("/api/auth/register").send({
      email: "exists@b.com",
      password: "password123",
      fullName: "Existing User",
    })

    expect(res.status).toBe(409)
  })

  it("creates a Supabase Auth user and profile", async () => {
    mockAdminAuth.admin.createUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    })
    mockFrom.mockReturnValue(buildChain({ data: {}, error: null }))

    const res = await request(app).post("/api/auth/register").send({
      email: "new@b.com",
      password: "password123",
      fullName: "New User",
    })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(mockAdminAuth.admin.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "new@b.com",
      password: "password123",
      email_confirm: true,
    }))
  })
})

describe("POST /api/auth/login", () => {
  it("returns 400 when fields are missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" })
    expect(res.status).toBe(400)
  })

  it("returns 401 when Supabase rejects credentials", async () => {
    mockClientAuth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    })

    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@b.com",
      password: "password123",
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Invalid email or password/)
  })

  it("returns accessToken and sets cookie on valid login", async () => {
    mockClientAuth.signInWithPassword.mockResolvedValue({
      data: { session, user: authUser },
      error: null,
    })
    mockFrom.mockReturnValue(buildChain({
      data: { role: "vendor", full_name: "Test User", email: "a@b.com" },
      error: null,
    }))

    const res = await request(app).post("/api/auth/login").send({
      email: "a@b.com",
      password: "password123",
    })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe("access-token")
    expect(res.body.user.role).toBe("vendor")
    expect(res.headers["set-cookie"]).toBeDefined()
  })
})

describe("POST /api/auth/refresh", () => {
  it("returns 401 when no cookie exists", async () => {
    const res = await request(app).post("/api/auth/refresh")
    expect(res.status).toBe(401)
  })

  it("refreshes a Supabase session", async () => {
    mockClientAuth.refreshSession.mockResolvedValue({
      data: { session, user: authUser },
      error: null,
    })
    mockFrom.mockReturnValue(buildChain({
      data: { role: "vendor", full_name: "Test User", email: "a@b.com" },
      error: null,
    }))

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", "refresh_token=refresh-token")

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe("access-token")
  })
})

describe("POST /api/auth/forgot-password", () => {
  it("always returns ok and emails a self-hosted reset link instead of using Supabase's mailer", async () => {
    mockAdminAuth.admin.generateLink.mockResolvedValue({
      data: { properties: { action_link: "https://example.com/verify?type=recovery" } },
      error: null,
    })

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "a@b.com" })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(mockAdminAuth.admin.generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recovery",
        email: "a@b.com",
        options: expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password") }),
      })
    )
  })
})

describe("POST /api/auth/verify-email", () => {
  it("is a no-op for Supabase Auth-backed accounts", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({})
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })
})

describe("requireAuth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const { requireAuth } = await import("../middleware/auth")
    const mockReq: any = { headers: {} }
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const mockNext = jest.fn()

    await requireAuth(mockReq, mockRes, mockNext)

    expect(mockRes.status).toHaveBeenCalledWith(401)
    expect(mockNext).not.toHaveBeenCalled()
  })

  it("loads the user and role from Supabase", async () => {
    const { requireAuth } = await import("../middleware/auth")
    mockClientAuth.getUser.mockResolvedValue({ data: { user: authUser }, error: null })
    mockFrom.mockReturnValue(buildChain({ data: { role: "admin" }, error: null }))
    const mockReq: any = { headers: { authorization: "Bearer access-token" } }
    const mockRes: any = { status: jest.fn().mockReturnThis(), json: jest.fn() }
    const mockNext = jest.fn()

    await requireAuth(mockReq, mockRes, mockNext)

    expect(mockNext).toHaveBeenCalled()
    expect(mockReq.user).toMatchObject({ id: "uid-1", role: "admin" })
  })
})
