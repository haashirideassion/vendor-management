import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockResetPassword = vi.fn()

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => mockResetPassword(...args),
    },
  },
  getRedirectUrl: (path: string) => `https://vendor-management-hazel.vercel.app${path}`,
}))

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderForm() {
  return render(
    <MemoryRouter>
      <ForgotPasswordForm />
    </MemoryRouter>
  )
}

async function submitWithEmail(email: string) {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } })
  fireEvent.click(screen.getByRole("button", { name: /send reset link/i }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ForgotPasswordForm — rendering", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it("renders email field and submit button", () => {
    renderForm()
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument()
  })

  it("renders back to sign in link", () => {
    renderForm()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toBeInTheDocument()
  })

  it("submit button is enabled by default", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /send reset link/i })).not.toBeDisabled()
  })
})

describe("ForgotPasswordForm — validation", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it("shows error for invalid email format", async () => {
    renderForm()
    const emailInput = screen.getByLabelText(/^email$/i)
    fireEvent.change(emailInput, { target: { value: "not-valid" } })
    fireEvent.submit(emailInput.closest("form")!)
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
  })

  it("does not call API when email is invalid", async () => {
    renderForm()
    const emailInput = screen.getByLabelText(/^email$/i)
    fireEvent.change(emailInput, { target: { value: "bad" } })
    fireEvent.submit(emailInput.closest("form")!)
    await screen.findByText(/enter a valid email/i)
    expect(mockResetPassword).not.toHaveBeenCalled()
  })
})

describe("ForgotPasswordForm — API interaction", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it("calls resetPasswordForEmail with correct email and redirectTo", async () => {
    mockResetPassword.mockResolvedValueOnce({ error: null })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith("jane@company.com", {
        redirectTo: "https://vendor-management-hazel.vercel.app/reset-password",
      })
    })
  })

  it("redirectTo does NOT contain localhost", async () => {
    mockResetPassword.mockResolvedValueOnce({ error: null })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      const options = mockResetPassword.mock.calls[0][1]
      expect(options.redirectTo).not.toContain("localhost")
    })
  })

  it("shows check email screen after successful submission", async () => {
    mockResetPassword.mockResolvedValueOnce({ error: null })
    renderForm()
    await submitWithEmail("jane@company.com")
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument()
  })

  it("shows rate limit error on 429 response", async () => {
    const { toast } = await import("sonner")
    mockResetPassword.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/rate limit/i))
    })
  })

  it("rate limit error message mentions waiting", async () => {
    const { toast } = await import("sonner")
    mockResetPassword.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      const msg = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(msg.toLowerCase()).toMatch(/wait|second/)
    })
  })

  it("shows generic error for non-rate-limit failures", async () => {
    const { toast } = await import("sonner")
    mockResetPassword.mockResolvedValueOnce({
      error: { status: 400, message: "User not found" },
    })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("User not found")
    })
  })
})

describe("ForgotPasswordForm — cooldown behaviour", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it("disables button and shows countdown after rate-limit error", async () => {
    mockResetPassword.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again in/i })).toBeDisabled()
    })
  })

  it("re-enables button after 60s cooldown expires", async () => {
    mockResetPassword.mockResolvedValueOnce({
      error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" },
    })
    renderForm()
    await submitWithEmail("jane@company.com")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again in/i })).toBeDisabled()
    })
    act(() => { vi.advanceTimersByTime(61_000) })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /send reset link/i })).not.toBeDisabled()
    })
  })
})
