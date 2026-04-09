import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useVendor } from "@/hooks/useVendor"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, User, FileText, Wrench, Tag, RefreshCw,
  Menu, LogOut, Building2, AlertCircle
} from "lucide-react"

const baseNavItems = [
  { label: "Dashboard", to: "/vendor/dashboard", icon: LayoutDashboard },
  { label: "Profile", to: "/vendor/profile", icon: User },
  { label: "Documents", to: "/vendor/documents", icon: FileText },
  { label: "Services", to: "/vendor/services", icon: Wrench },
  { label: "Categories", to: "/vendor/categories", icon: Tag },
]

function NavLinks({
  pathname,
  showRenewal,
  onClick,
}: {
  pathname: string
  showRenewal: boolean
  onClick?: () => void
}) {
  return (
    <nav className="flex-1 p-2 space-y-0.5">
      {baseNavItems.map(({ label, to, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onClick}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
            pathname === to
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </Link>
      ))}
      {showRenewal && (
        <Link
          to="/vendor/renewal"
          onClick={onClick}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors mt-1",
            pathname === "/vendor/renewal"
              ? "bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200"
              : "bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/20 dark:text-orange-300"
          )}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          Renewal Required
        </Link>
      )}
    </nav>
  )
}

export function VendorLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const { data: vendor } = useVendor()
  const [mobileOpen, setMobileOpen] = useState(false)
  const showRenewal = vendor?.status === "action_required"
  const currentLabel = baseNavItems.find((n) => pathname === n.to)?.label ?? "Vendor Portal"

  const sidebarHeader = (
    <div className="px-4 py-4 border-b">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm font-semibold leading-none">Vendor Portal</p>
      </div>
      {vendor && (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-medium truncate">{vendor.company_name}</p>
          {vendor.vendor_id_code && (
            <p className="text-xs text-muted-foreground font-mono">{vendor.vendor_id_code}</p>
          )}
          <StatusBadge status={vendor.status} />
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        {sidebarHeader}
        <NavLinks pathname={pathname} showRenewal={showRenewal} />
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
          <SheetHeader className="p-0">
            {sidebarHeader}
          </SheetHeader>
          <NavLinks pathname={pathname} showRenewal={showRenewal} onClick={() => setMobileOpen(false)} />
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
          <span className="md:hidden text-sm font-medium">{currentLabel}</span>
          <span className="hidden md:block" />
          <div className="flex items-center gap-1">
            {showRenewal && (
              <Link to="/vendor/renewal">
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5 mr-1">
                  <RefreshCw className="h-3 w-3" /> Renew Now
                </Button>
              </Link>
            )}
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
