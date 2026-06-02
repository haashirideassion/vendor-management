import { vi, describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { ForgotPasswordForm } from "../ForgotPasswordForm"
import { MemoryRouter } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

// Mock the supabase client and getRedirectUrl helper
vi.mock("@/lib/supabase", () => {
  return {
    supabase: {
      auth: {
        resetPasswordForEmail: vi.fn(),
      },
    },
    getRedirectUrl: (path: string) => `https://test-site.com${path}`,
  }
})

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders forgot password form elements", () => {
    render(
      <MemoryRouter>
        <ForgotPasswordForm />
      </MemoryRouter>
    )

    expect(screen.getByText("Forgot password")).toBeInTheDocument()
    expect(screen.getByText("Enter your email and we'll send you a reset link.")).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toBeInTheDocument()
  })

  it("validates empty email submission", async () => {
    render(
      <MemoryRouter>
        <ForgotPasswordForm />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email")).toBeInTheDocument()
    })
  })

  it("calls resetPasswordForEmail with correct arguments and shows check email state", async () => {
    const mockReset = vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    } as any)

    render(
      <MemoryRouter>
        <ForgotPasswordForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith("test@example.com", {
        redirectTo: "https://test-site.com/reset-password",
      })
    })

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument()
      expect(screen.getByText(/we sent a password reset link/i)).toBeInTheDocument()
    })
  })

  it("displays custom toast error when email rate limit (429) is exceeded", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        name: "AuthApiError",
        message: "email rate limit exceeded",
        status: 429,
        code: "over_email_send_rate_limit",
      },
    } as any)

    render(
      <MemoryRouter>
        <ForgotPasswordForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Email rate limit exceeded. Please wait a few minutes before trying again.")
    })
  })

  it("displays generic toast error when request fails for another reason", async () => {
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        name: "AuthApiError",
        message: "Unable to find user",
        status: 400,
        code: "user_not_found",
      },
    } as any)

    render(
      <MemoryRouter>
        <ForgotPasswordForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Unable to find user")
    })
  })
})
