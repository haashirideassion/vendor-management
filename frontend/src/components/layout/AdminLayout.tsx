import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { AdminNotificationBell } from "@/components/shared/AdminNotificationBell"
import { UserDropdown } from "@/components/shared/UserDropdown"
import { AppLogo } from "@/components/shared/AppLogo"
import { cn } from "@/lib/utils"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  UserGroup02Icon,
  Tag01Icon,
  BarChartIcon,
  Menu01Icon,
  Briefcase01Icon,
  Invoice01Icon,
  DeliveryBox01Icon,
  Invoice02Icon,
  File01Icon,
} from "@/components/shared/SolarIcon"

type NavLink = { type: "link"; label: string; to: string; icon: typeof File01Icon }
type NavGroup = { type: "group"; label: string }
type NavEntry = NavLink | NavGroup

const navEntries: NavEntry[] = [
  { type: "link", label: "Vendors", to: "/admin/vendors", icon: UserGroup02Icon },
  { type: "link", label: "Categories", to: "/admin/categories", icon: Tag01Icon },
  { type: "link", label: "Reports", to: "/admin/reports", icon: BarChartIcon },
  { type: "group", label: "Procurement" },
  { type: "link", label: "Engagements", to: "/admin/engagements", icon: Briefcase01Icon },
  { type: "link", label: "Purchase Orders", to: "/admin/purchase-orders", icon: Invoice01Icon },
  { type: "link", label: "GRNs", to: "/admin/grns", icon: DeliveryBox01Icon },
  { type: "link", label: "Invoices", to: "/admin/invoices", icon: Invoice02Icon },
  { type: "group", label: "Legal" },
  { type: "link", label: "Contracts", to: "/admin/contracts", icon: File01Icon },
]

const navLinks = navEntries.filter((e): e is NavLink => e.type === "link")

function SidebarContent({ pathname, onNavClick }: { pathname: string; onNavClick?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center px-4 pt-5 pb-5">
        <AppLogo className="h-10 w-auto max-w-[180px]" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {navEntries.map((entry) => {
          if (entry.type === "group") {
            return (
              <p
                key={entry.label}
                className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
              >
                {entry.label}
              </p>
            )
          }
          const { label, to, icon } = entry
          const active = pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <SolarDuotoneIcon
                icon={icon}
                size={18}
                strokeWidth={active ? 2 : 1.5}
                primaryColor={active ? "currentColor" : "var(--icon-nav-inactive)"}
                secondaryColor={active ? "currentColor" : "var(--icon-nav-inactive)"}
              />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentLabel = navLinks.find((n) => pathname.startsWith(n.to))?.label ?? "Admin"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar — inset floating card */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0 m-3 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[220px] p-0 bg-card">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            pathname={pathname}
            onNavClick={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 rounded-lg"
              onClick={() => setMobileOpen(true)}
            >
              <SolarDuotoneIcon
                icon={Menu01Icon}
                size={18}
                strokeWidth={1.5}
                primaryColor="currentColor"
                secondaryColor="currentColor"
              />
            </Button>
            <span className="text-base font-semibold">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
            <ThemeToggle />
            <UserDropdown
              email={profile?.email}
              role={profile?.role}
              onSignOut={signOut}
            />
          </div>
        </header>

        {/* Page content — scrollable area */}
        <main className="flex-1 overflow-hidden flex flex-col px-5 pb-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
