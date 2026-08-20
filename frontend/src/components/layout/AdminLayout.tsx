import { useState } from "react"
import { Link, useLocation, Outlet, Navigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { AdminNotificationBell } from "@/components/shared/AdminNotificationBell"
import { UserDropdown } from "@/components/shared/UserDropdown"
import { OrgSwitcher } from "@/components/shared/OrgSwitcher"
import { ActingAsGroupAdminBanner } from "@/components/shared/ActingAsGroupAdminBanner"
import { NoActiveMemberships } from "@/components/shared/NoActiveMemberships"
import { usePlatformAdminStatus } from "@/hooks/useSuperadmin"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
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
  UserCircleIcon,
  Building06Icon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
} from "@/components/shared/SolarIcon"

type NavLink = { type: "link"; label: string; to: string; icon: typeof File01Icon }
type NavGroup = { type: "group"; label: string }
type NavEntry = NavLink | NavGroup

const navEntries: NavEntry[] = [
  { type: "link", label: "Vendors", to: "/admin/vendors", icon: UserGroup02Icon },
  { type: "link", label: "Categories", to: "/admin/categories", icon: Tag01Icon },
  { type: "link", label: "Reports", to: "/admin/reports", icon: BarChartIcon },
  { type: "group", label: "Procurement" },
  { type: "link", label: "Purchase Requests", to: "/admin/purchase-requests", icon: Briefcase01Icon },
  { type: "link", label: "Purchase Orders", to: "/admin/purchase-orders", icon: Invoice01Icon },
  { type: "link", label: "GRNs & Confirmations", to: "/admin/grns", icon: DeliveryBox01Icon },
  { type: "link", label: "Invoices", to: "/admin/invoices", icon: Invoice02Icon },
  { type: "group", label: "Legal" },
  { type: "link", label: "Contracts", to: "/admin/contracts", icon: File01Icon },
  { type: "group", label: "Organization" },
  { type: "link", label: "Team", to: "/admin/team", icon: UserCircleIcon },
  { type: "link", label: "Profile", to: "/admin/profile", icon: UserCircleIcon },
  { type: "link", label: "Org Onboarding", to: "/admin/org-onboarding", icon: Building06Icon },
]

const navLinks = navEntries.filter((e): e is NavLink => e.type === "link")

// Org Onboarding and Profile share one permanent slot in the Organization
// group -- never both at once. Org Onboarding only occupies it for an org
// that actually requires self-service onboarding AND hasn't submitted its
// draft yet; Profile takes the slot in every other case (submitted,
// approved, or an org that never required onboarding at all, e.g.
// superadmin-created) -- this is permanent, not just while modulesLocked.
function permanentOrgSlotPath(requiresOnboardingApproval: boolean, onboardingSubmitted: boolean): string {
  return requiresOnboardingApproval && !onboardingSubmitted ? "/admin/org-onboarding" : "/admin/profile"
}

// While an org's onboarding gate is active (038_org_onboarding_gate.sql),
// only that one permanent-slot item stays reachable -- every other module
// link is dropped, along with any group header left with no visible
// children. Once approved, modulesLocked flips off and the full nav
// returns (still with only one of Org Onboarding/Profile present, per the
// permanent-slot rule above).
function visibleNavEntries(locked: boolean, requiresOnboardingApproval: boolean, onboardingSubmitted: boolean): NavEntry[] {
  const slotPath = permanentOrgSlotPath(requiresOnboardingApproval, onboardingSubmitted)
  const otherSlotPath = slotPath === "/admin/org-onboarding" ? "/admin/profile" : "/admin/org-onboarding"
  const withCorrectSlot = navEntries.filter((e) => e.type !== "link" || e.to !== otherSlotPath)

  if (!locked) return withCorrectSlot.filter((e, i, arr) => e.type === "link" || arr[i + 1]?.type === "link")

  const kept = withCorrectSlot.filter((e) => e.type === "group" || e.to === slotPath)
  return kept.filter((e, i) => e.type === "link" || kept[i + 1]?.type === "link")
}

function SidebarContent({
  pathname, onNavClick, locked, requiresOnboardingApproval, onboardingSubmitted, collapsed, onToggleCollapse,
}: {
  pathname: string
  onNavClick?: () => void
  locked: boolean
  requiresOnboardingApproval: boolean
  onboardingSubmitted: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center px-4 pt-5 pb-5", collapsed ? "flex-col gap-2 px-2" : "justify-between")}>
        {collapsed ? (
          <AppLogo variant="color" className="h-8 w-8" />
        ) : (
          <AppLogo className="h-10 w-auto max-w-[180px]" />
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          >
            <SolarDuotoneIcon icon={collapsed ? SidebarExpandIcon : SidebarCollapseIcon} size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {visibleNavEntries(locked, requiresOnboardingApproval, onboardingSubmitted).map((entry) => {
          if (entry.type === "group") {
            if (collapsed) return null
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
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                collapsed && "justify-center px-0",
                active
                  ? "bg-[image:var(--brand-gradient)] text-white shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground hover:shadow-[var(--shadow-soft)]"
              )}
            >
              <SolarDuotoneIcon
                icon={icon}
                size={18}
                strokeWidth={active ? 2 : 1.5}
                primaryColor={active ? "currentColor" : "var(--icon-nav-inactive)"}
                secondaryColor={active ? "currentColor" : "var(--icon-nav-inactive)"}
              />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function AdminLayout() {
  const { profile, signOut } = useAuth()
  const { orgs, groups, activeOrg, loading: orgsLoading } = useOrg()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useSidebarCollapse()
  const currentLabel = navLinks.find((n) => pathname.startsWith(n.to))?.label ?? "Admin"
  const { data: isPlatformAdmin } = usePlatformAdminStatus()
  // Platform admins reach the app through the superadmin routes regardless
  // of org membership, so the empty state is scoped to everyone else.
  const hasNoMemberships = !orgsLoading && orgs.length === 0 && groups.length === 0 && !isPlatformAdmin
  const modulesLocked = !!activeOrg?.modulesLocked
  const onboardingSubmitted = !!activeOrg?.onboardingSubmitted
  const requiresOnboardingApproval = !!activeOrg?.requiresOnboardingApproval

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar — inset floating card */}
      <aside
        className={cn(
          "hidden md:flex skeuo-surface flex-col shrink-0 m-3 rounded-2xl border border-white/55 overflow-hidden transition-[width] duration-200 dark:border-white/10",
          collapsed ? "w-[76px]" : "w-[220px]"
        )}
      >
        <SidebarContent
          pathname={pathname}
          locked={modulesLocked}
          requiresOnboardingApproval={requiresOnboardingApproval}
          onboardingSubmitted={onboardingSubmitted}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[220px] p-0 bg-card">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            pathname={pathname}
            locked={modulesLocked}
            requiresOnboardingApproval={requiresOnboardingApproval}
            onboardingSubmitted={onboardingSubmitted}
            onNavClick={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between px-6 shrink-0 lg:px-8">
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
            {isPlatformAdmin && (
              <Link to="/admin/superadmin">
                <Button variant="outline" size="sm" className="h-8 text-xs">Superadmin</Button>
              </Link>
            )}
            <OrgSwitcher />
            <AdminNotificationBell />
            <ThemeToggle />
            <UserDropdown
              fullName={profile?.full_name}
              email={profile?.email}
              role={profile?.role}
              roleNames={activeOrg?.roleNames}
              onSignOut={signOut}
            />
          </div>
        </header>

        {/* Page content — scrollable area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-6 pb-8 lg:px-8 lg:pb-10">
          {hasNoMemberships ? (
            <NoActiveMemberships />
          ) : modulesLocked && !pathname.startsWith(permanentOrgSlotPath(requiresOnboardingApproval, onboardingSubmitted)) ? (
            <Navigate to={permanentOrgSlotPath(requiresOnboardingApproval, onboardingSubmitted)} replace />
          ) : (
            <>
              <ActingAsGroupAdminBanner />
              {modulesLocked && (
                <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  Complete and get your organisation's onboarding approved to unlock the rest of the platform.
                </div>
              )}
              <Outlet />
            </>
          )}
        </main>
      </div>
    </div>
  )
}
