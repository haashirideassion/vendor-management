import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SignupForm } from "@/components/auth/SignupForm"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSignUp = vi.fn()
const mockNavigate = vi.fn()

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signUp: (...args: unknown[]) => mockSignUp(...args) } },
  getRedirectUrl: (path: string) => `https://vendor-management-hazel.vercel.app${path}`,
}))

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForm() {
  return render(
    <MemoryRouter>
      <SignupForm />
    </MemoryRouter>
  )
}

function fillForm({
  full_name = "Jane Smith",
  email = "jane@company.com",
  password = "Password123",
  confirm_password = "Password123",
} = {}) {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: full_name } })
  fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: confirm_password } })
}

function submitForm(overrides = {}) {
  fillForm(overrides)
  const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
  fireEvent.submit(form)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SignupForm — rendering", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it("renders all form fields", () => {
    renderForm()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()
  })

  it("renders sign in link", () => {
    renderForm()
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument()
  })

  it("submit button is enabled by default", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /create account/i })).not.toBeDisabled()
  })
})

describe("SignupForm — validation", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it("shows error for invalid email", async () => {
    renderForm()
    fillForm({ email: "not-an-email" })
    const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
    fireEvent.submit(form)
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
  })

  it("shows error when password is too short", async () => {
    renderForm()
    fillForm({ password: "short", confirm_password: "short" })
    const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
    fireEvent.submit(form)
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it("shows error when passwords do not match", async () => {
    renderForm()
    fillForm({ password: "Password123", confirm_password: "Different456" })
    const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
    fireEvent.submit(form)
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it("shows error for full name less than 2 characters", async () => {
    renderForm()
    fillForm({ full_name: "J" })
    const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
    fireEvent.submit(form)
    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument()
  })

  it("does not call API when validation fails", async () => {
    renderForm()
    fillForm({ email: "bad" })
    const form = screen.getByRole("button", { name: /create account/i }).closest("form")!
    fireEvent.submit(form)
    await screen.findByText(/enter a valid email/i)
    expect(mockSignUp).not.toHaveBeenCalled()
  })
})

describe("SignupForm — API interaction", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it("calls supabase.auth.signUp with correct payload", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    renderForm()
    submitForm()
    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "jane@company.com",
        password: "Password123",
        options: {
          data: { full_name: "Jane Smith", role: "vendor" },
          emailRedirectTo: "https://vendor-management-hazel.vercel.app/login",
        },
      })
    })
  })

  it("navigates to /onboarding on successful signup", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    renderForm()
    submitForm()
    await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith("/onboarding") })
  })

  it("shows rate limit error on 429 response", async () => {
    const { toast } = await import("sonner")
    mockSignUp.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    submitForm()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/rate limit/i))
    })
  })

  it("rate limit error message instructs user to wait", async () => {
    const { toast } = await import("sonner")
    mockSignUp.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    submitForm()
    await waitFor(() => {
      const msg = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(msg.toLowerCase()).toMatch(/wait|second/)
    })
  })

  it("shows generic error for non-rate-limit errors", async () => {
    const { toast } = await import("sonner")
    mockSignUp.mockResolvedValueOnce({
      error: { status: 400, message: "User already registered" },
    })
    renderForm()
    submitForm()
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("User already registered")
    })
  })

  it("emailRedirectTo does not contain localhost", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null })
    renderForm()
    submitForm()
    await waitFor(() => {
      const call = mockSignUp.mock.calls[0][0]
      expect(call.options.emailRedirectTo).not.toContain("localhost")
    })
  })
})

describe("SignupForm — cooldown behaviour", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it("disables button and shows countdown after rate-limit error", async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    submitForm()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again in/i })).toBeDisabled()
    })
  })

  it("re-enables button after 60s cooldown expires", async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    submitForm()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again in/i })).toBeDisabled()
    })
    act(() => { vi.advanceTimersByTime(61_000) })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create account/i })).not.toBeDisabled()
    })
  })
})
