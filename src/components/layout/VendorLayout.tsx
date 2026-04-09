import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useVendor } from "@/hooks/useVendor"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  UserCircleIcon,
  File01Icon,
  Settings01Icon,
  Tag01Icon,
  Refresh01Icon,
  Logout01Icon,
  Menu01Icon,
  Building06Icon,
  Alert01Icon,
} from "@hugeicons/core-free-icons"

const baseNavItems = [
  { label: "Dashboard", to: "/vendor/dashboard", icon: DashboardSquare01Icon },
  { label: "Profile",   to: "/vendor/profile",   icon: UserCircleIcon },
  { label: "Documents", to: "/vendor/documents", icon: File01Icon },
  { label: "Services",  to: "/vendor/services",  icon: Settings01Icon },
  { label: "Categories",to: "/vendor/categories",icon: Tag01Icon },
]

function SidebarContent({
  pathname,
  onNavClick,
  email,
}: {
  pathname: string
  onNavClick?: () => void
  email?: string
}) {
  const { signOut } = useAuth()
  const { data: vendor } = useVendor()
  const showRenewal = vendor?.status === "action_required"

  return (
    <div className="flex flex-col h-full">
      {/* Logo + vendor chip */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <HugeiconsIcon
              icon={Building06Icon}
              size={20}
              primaryColor="oklch(0.52 0.105 223.128)"
              secondaryColor="oklch(0.52 0.105 223.128)"
              strokeWidth={1.8}
            />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none tracking-tight">Vendor Portal</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">Self-Service</p>
          </div>
        </div>
        {vendor && (
          <div className="rounded-xl bg-muted/60 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold truncate leading-snug">{vendor.company_name}</p>
            {vendor.vendor_id_code && (
              <p className="text-[10px] text-muted-foreground font-mono">{vendor.vendor_id_code}</p>
            )}
            <StatusBadge status={vendor.status} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-0.5">
        {baseNavItems.map(({ label, to, icon }) => {
          const active = pathname === to
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
              <HugeiconsIcon
                icon={icon}
                size={18}
                strokeWidth={active ? 2 : 1.5}
                primaryColor={active ? "currentColor" : "oklch(0.52 0.105 223.128)"}
                secondaryColor={active ? "currentColor" : "oklch(0.52 0.105 223.128)"}
              />
              {label}
            </Link>
          )
        })}

        {showRenewal && (
          <Link
            to="/vendor/renewal"
            onClick={onNavClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 mt-2",
              pathname === "/vendor/renewal"
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300"
            )}
          >
            <HugeiconsIcon
              icon={Alert01Icon}
              size={18}
              strokeWidth={2}
              primaryColor="currentColor"
              secondaryColor="currentColor"
            />
            Renewal Required
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2.5 pb-4 pt-3 border-t border-border/50 mt-2">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl mb-1">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-semibold">
              {email?.[0]?.toUpperCase() ?? "V"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{email ?? "Vendor"}</p>
            <p className="text-[10px] text-muted-foreground">Vendor Account</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/8 h-8 rounded-xl text-xs"
          onClick={signOut}
        >
          <HugeiconsIcon
            icon={Logout01Icon}
            size={15}
            strokeWidth={1.5}
            primaryColor="currentColor"
            secondaryColor="currentColor"
          />
          Sign out
        </Button>
      </div>
    </div>
  )
}

export function VendorLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const { data: vendor } = useVendor()
  const [mobileOpen, setMobileOpen] = useState(false)
  const showRenewal = vendor?.status === "action_required"
  const currentLabel = baseNavItems.find((n) => pathname === n.to)?.label ?? "Vendor Portal"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar — inset floating card */}
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
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar — flat, no box */}
        <header className="flex h-14 items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 rounded-lg"
              onClick={() => setMobileOpen(true)}
            >
              <HugeiconsIcon
                icon={Menu01Icon}
                size={18}
                strokeWidth={1.5}
                primaryColor="currentColor"
                secondaryColor="currentColor"
              />
            </Button>
            <span className="text-base font-semibold tracking-tight">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {showRenewal && (
              <Link to="/vendor/renewal">
                <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5 rounded-lg">
                  <HugeiconsIcon icon={Refresh01Icon} size={13} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                  Renew Now
                </Button>
              </Link>
            )}
            <ThemeToggle />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto px-5 pb-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
