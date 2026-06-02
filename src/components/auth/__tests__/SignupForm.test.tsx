import { vi, describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SignupForm } from "../SignupForm"
import { MemoryRouter } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn()
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the supabase client and getRedirectUrl helper
vi.mock("@/lib/supabase", () => {
  return {
    supabase: {
      auth: {
        signUp: vi.fn(),
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

describe("SignupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders signup form elements", () => {
    render(
      <MemoryRouter>
        <SignupForm />
      </MemoryRouter>
    )

    expect(screen.getByText("Create vendor account")).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()
  })

  it("validates form fields and checks for password match", async () => {
    render(
      <MemoryRouter>
        <SignupForm />
      </MemoryRouter>
    )

    // Trigger validation
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText("Enter your full name")).toBeInTheDocument()
      expect(screen.getByText("Enter a valid email")).toBeInTheDocument()
    })

    // Fill password mismatch
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "John Doe" } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "john@example.com" } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password456" } })
    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
    })
  })

  it("calls signUp with correct parameters and redirects on success", async () => {
    const mockSignUp = vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: "123" }, session: null },
      error: null,
    })

    render(
      <MemoryRouter>
        <SignupForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "John Doe" } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "john@example.com" } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password123" } })

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "john@example.com",
        password: "password123",
        options: {
          data: { full_name: "John Doe", role: "vendor" },
          emailRedirectTo: "https://test-site.com/login",
        },
      })
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Account created! Please check your email to confirm, then continue.")
      expect(mockNavigate).toHaveBeenCalledWith("/onboarding")
    })
  })

  it("handles 429 rate limit error gracefully", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        name: "AuthApiError",
        message: "email rate limit exceeded",
        status: 429,
        code: "over_email_send_rate_limit",
      },
    })

    render(
      <MemoryRouter>
        <SignupForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "John Doe" } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "john@example.com" } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password123" } })

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Email rate limit exceeded. Please wait a few minutes before trying again.")
    })
  })

  it("displays generic toast error when signup fails for other reasons", async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: {
        name: "AuthApiError",
        message: "A user with this email address has already been registered",
        status: 400,
        code: "email_exists",
      },
    })

    render(
      <MemoryRouter>
        <SignupForm />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "John Doe" } })
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: "john@example.com" } })
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "password123" } })

    fireEvent.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("A user with this email address has already been registered")
    })
  })
})
