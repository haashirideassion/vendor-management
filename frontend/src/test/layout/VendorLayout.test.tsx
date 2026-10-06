import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { VendorLayout } from "@/components/layout/VendorLayout"

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: null, signOut: vi.fn() }) }))
vi.mock("@/hooks/useVendor", () => ({ useVendor: () => ({ data: { company_name: "Acme", status: "approved" } }) }))
vi.mock("@/hooks/useVendorUsers", () => ({ useMyVendorRole: () => ({ data: [] }) }))
vi.mock("@/components/auth/VendorStatusGuard", () => ({ getVendorStage: () => "APPROVED" }))
vi.mock("@/components/shared/NotificationBell", () => ({ NotificationBell: () => null }))
vi.mock("@/components/shared/ThemeToggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/components/shared/UserDropdown", () => ({ UserDropdown: () => null }))
vi.mock("@/components/shared/AppLogo", () => ({ AppLogo: () => null }))
vi.mock("@/components/shared/StatusBadge", () => ({ StatusBadge: () => null }))

describe("VendorLayout sidebar", () => {
  afterEach(cleanup)

  it("constrains height and scrolls the nav internally", () => {
    render(<MemoryRouter initialEntries={["/vendor/dashboard"]}><VendorLayout /></MemoryRouter>)
    const nav = screen.getByTestId("vendor-sidebar-nav")
    expect(nav).toHaveClass("overflow-y-auto", "overflow-x-hidden", "min-h-0", "flex-1")
    const aside = nav.closest("aside")!
    expect(aside).toHaveClass("min-h-0", "overflow-hidden")
    expect(aside.parentElement).toHaveClass("h-dvh", "overflow-hidden")
  })
})
