import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  UserGroup02Icon,
  Tag01Icon,
  BarChartIcon,
  Logout01Icon,
  Menu01Icon,
  Building06Icon,
} from "@hugeicons/core-free-icons"

const navItems = [
  { label: "Dashboard", to: "/admin/dashboard", icon: DashboardSquare01Icon },
  { label: "Vendors", to: "/admin/vendors", icon: UserGroup02Icon },
  { label: "Categories", to: "/admin/categories", icon: Tag01Icon },
  { label: "Reports", to: "/admin/reports", icon: BarChartIcon },
]

function SidebarContent({ pathname, onNavClick, email }: { pathname: string; onNavClick?: () => void; email?: string }) {
  const { signOut } = useAuth()
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <HugeiconsIcon icon={Building06Icon} size={18} className="text-primary" strokeWidth={1.8} />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">Vendor Portal</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">Admin Console</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ label, to, icon }) => {
          const active = pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <HugeiconsIcon icon={icon} size={18} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 pt-3 border-t border-border/60 mt-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {email?.[0]?.toUpperCase() ?? "A"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{email ?? "Admin"}</p>
            <p className="text-[10px] text-muted-foreground">Administrator</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 mt-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9 rounded-xl"
          onClick={signOut}
        >
          <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} />
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function AdminLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentLabel = navItems.find((n) => pathname.startsWith(n.to))?.label ?? "Admin"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar - inset */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0 m-3 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden">
        <SidebarContent pathname={pathname} email={profile?.email} />
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
            email={profile?.email}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 my-3 mr-3">
        {/* Top bar */}
        <header className="flex h-12 items-center justify-between rounded-2xl bg-card border border-border/60 shadow-sm px-4 mb-3 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setMobileOpen(true)}
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.5} />
            </Button>
            <span className="text-sm font-semibold">{currentLabel}</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto rounded-2xl bg-card border border-border/60 shadow-sm">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
