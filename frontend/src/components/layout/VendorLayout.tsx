import { useState, useEffect } from "react"
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { NotificationBell } from "@/components/shared/NotificationBell"
import { UserDropdown } from "@/components/shared/UserDropdown"
import { AppLogo } from "@/components/shared/AppLogo"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useVendor } from "@/hooks/useVendor"
import { getVendorStage, type VendorStage } from "@/components/auth/VendorStatusGuard"
import { cn } from "@/lib/utils"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  DashboardSquare01Icon,
  UserCircleIcon,
  File01Icon,
  ContractsIcon,
  Refresh01Icon,
  Menu01Icon,
  Alert01Icon,
  Invoice02Icon,
  Briefcase01Icon,
  InformationCircleIcon,
} from "@/components/shared/SolarIcon"

const allNavItems = [
  { id: "dashboard", label: "Dashboard", to: "/vendor/dashboard", icon: DashboardSquare01Icon, stages: ["APPROVED"] as VendorStage[] },
  { id: "profile",   label: "Profile",   to: "/vendor/profile",   icon: UserCircleIcon,          stages: ["REGISTERED", "ONBOARDING_COMPLETED", "APPROVED", "RESTRICTED"] as VendorStage[] },
  { id: "documents", label: "Documents", to: "/vendor/documents", icon: File01Icon,               stages: ["ONBOARDING_COMPLETED", "APPROVED"] as VendorStage[] },
  { id: "contracts", label: "Contracts", to: "/vendor/contracts", icon: ContractsIcon,            stages: ["APPROVED"] as VendorStage[] },
  { id: "rfqs",      label: "RFQs",      to: "/vendor/rfqs",      icon: Briefcase01Icon,          stages: ["APPROVED"] as VendorStage[] },
  { id: "invoices",  label: "Invoices",  to: "/vendor/invoices",  icon: Invoice02Icon,            stages: ["APPROVED"] as VendorStage[] },
]

function StageBanner({ stage, vendorStatus }: { stage: VendorStage; vendorStatus?: string }) {
  const navigate = useNavigate()

  if (stage === "REGISTERED") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3 mb-4 text-sm">
        <SolarDuotoneIcon icon={InformationCircleIcon} size={18} strokeWidth={1.5} primaryColor="rgb(59 130 246)" secondaryColor="rgb(59 130 246)" className="mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-blue-800 dark:text-blue-200">Complete your onboarding</p>
          <p className="text-blue-700 dark:text-blue-300 mt-0.5">Submit your company details to access the full vendor portal.</p>
        </div>
        <Button size="sm" className="shrink-0 h-7 text-xs" onClick={() => navigate("/onboarding")}>
          Complete Onboarding
        </Button>
      </div>
    )
  }

  if (stage === "ONBOARDING_COMPLETED") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-4 py-3 mb-4 text-sm">
        <SolarDuotoneIcon icon={InformationCircleIcon} size={18} strokeWidth={1.5} primaryColor="rgb(217 119 6)" secondaryColor="rgb(217 119 6)" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-amber-800 dark:text-amber-200">Onboarding under review</p>
          <p className="text-amber-700 dark:text-amber-300 mt-0.5">Your submission has been received and is awaiting administrator approval.</p>
        </div>
      </div>
    )
  }

  if (stage === "RESTRICTED") {
    const msg = vendorStatus === "rejected" ? "Your application has been rejected." : "Your account has been suspended."
    return (
      <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-4 py-3 mb-4 text-sm">
        <SolarDuotoneIcon icon={Alert01Icon} size={18} strokeWidth={1.5} primaryColor="rgb(220 38 38)" secondaryColor="rgb(220 38 38)" className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-red-800 dark:text-red-200">{msg}</p>
          <p className="text-red-700 dark:text-red-300 mt-0.5">Please contact support for assistance.</p>
        </div>
      </div>
    )
  }

  return null
}

function SidebarContent({
  pathname,
  stage,
  vendor,
  onNavClick,
}: {
  pathname: string
  stage: VendorStage
  vendor: { company_name: string; vendor_id_code?: string | null; status: string } | null | undefined
  onNavClick?: () => void
}) {
  const showRenewal = vendor?.status === "action_required"
  const visibleItems = allNavItems.filter((item) => item.stages.includes(stage))

  return (
    <div className="flex flex-col h-full">
      {/* Logo + vendor chip */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center mb-4">
          <AppLogo className="h-10 w-auto max-w-[180px]" />
        </div>
        {vendor && (
          <div className="rounded-xl bg-muted/60 px-3 py-2.5 space-y-1.5">
            <p className="text-xs font-semibold truncate leading-snug">{vendor.company_name}</p>
            {vendor.vendor_id_code && (
              <p className="text-[10px] text-muted-foreground font-mono">{vendor.vendor_id_code}</p>
            )}
            <StatusBadge status={vendor.status as import("@/lib/types").VendorStatus} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-0.5">
        {visibleItems.map(({ label, to, icon }) => {
          const active = pathname === to || (to !== "/vendor/dashboard" && pathname.startsWith(to))
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
            <SolarDuotoneIcon
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
    </div>
  )
}

export function VendorLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const { data: vendor } = useVendor()
  const [mobileOpen, setMobileOpen] = useState(false)

  const stage = getVendorStage(vendor)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const showRenewal = vendor?.status === "action_required"
  const visibleItems = allNavItems.filter((item) => item.stages.includes(stage))
  const currentLabel = visibleItems.find((n) => pathname.startsWith(n.to))?.label ?? "Vendor Portal"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[220px] shrink-0 m-3 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden">
        <SidebarContent pathname={pathname} stage={stage} vendor={vendor} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[220px] p-0 bg-card">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            pathname={pathname}
            stage={stage}
            vendor={vendor}
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
            {showRenewal && (
              <Link to="/vendor/renewal">
                <Button size="sm" variant="danger" className="h-7 text-xs gap-1.5 rounded-lg">
                  <SolarDuotoneIcon icon={Refresh01Icon} size={13} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                  Renew Now
                </Button>
              </Link>
            )}
            <NotificationBell />
            <ThemeToggle />
            <UserDropdown
              email={profile?.email}
              role={profile?.role}
              onSignOut={signOut}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden flex flex-col px-5 pb-5">
          <StageBanner stage={stage} vendorStatus={vendor?.status} />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
