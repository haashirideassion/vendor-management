import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Tag, BarChart2, Menu, LogOut, Building2 } from "lucide-react"

const navItems = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Vendors", to: "/admin/vendors", icon: Users },
  { label: "Categories", to: "/admin/categories", icon: Tag },
  { label: "Reports", to: "/admin/reports", icon: BarChart2 },
]

function NavLinks({ pathname, onClick }: { pathname: string; onClick?: () => void }) {
  return (
    <nav className="flex-1 p-2 space-y-0.5">
      {navItems.map(({ label, to, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onClick}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
            pathname.startsWith(to)
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <Building2 className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold leading-none">Vendor Portal</p>
            <p className="text-xs text-muted-foreground mt-0.5">Admin Console</p>
          </div>
        </div>
        <NavLinks pathname={pathname} />
        <Separator />
        <div className="p-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground truncate px-1">{profile?.email}</p>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0 flex flex-col">
          <SheetHeader className="px-4 py-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" /> Admin Console
            </SheetTitle>
          </SheetHeader>
          <NavLinks pathname={pathname} onClick={() => setMobileOpen(false)} />
          <Separator />
          <div className="p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground truncate px-1">{profile?.email}</p>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 items-center justify-between border-b bg-card px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="md:hidden text-sm font-medium">
            {navItems.find((n) => pathname.startsWith(n.to))?.label ?? "Admin"}
          </span>
          <span className="hidden md:block" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
