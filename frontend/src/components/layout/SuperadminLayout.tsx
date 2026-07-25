import { useState } from "react"
import { Link, useLocation, Outlet } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { UserDropdown } from "@/components/shared/UserDropdown"
import { AdminNotificationBell } from "@/components/shared/AdminNotificationBell"
import { AppLogo } from "@/components/shared/AppLogo"
import { useSidebarCollapse } from "@/hooks/useSidebarCollapse"
import { cn } from "@/lib/utils"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  Building06Icon,
  UserCircleIcon,
  CheckmarkCircle01Icon,
  AuditLogIcon,
  Alert01Icon,
  Menu01Icon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
} from "@/components/shared/SolarIcon"

// Groups has no nav entry of its own (it's a tab of the Organizations page),
// so a group detail page's route (/admin/superadmin/groups/:id) still needs
// to highlight "Organizations" as the active section.
const navItems = [
  { label: "Organizations", to: "/admin/superadmin/organizations", extraMatch: "/admin/superadmin/groups", icon: Building06Icon },
  { label: "Users", to: "/admin/superadmin/users", icon: UserCircleIcon },
  { label: "Vendor Verification", to: "/admin/superadmin/vendor-verification", icon: CheckmarkCircle01Icon },
  { label: "Audit Log", to: "/admin/superadmin/audit-log", icon: AuditLogIcon },
  { label: "Break-glass Access", to: "/admin/superadmin/break-glass", icon: Alert01Icon },
]

function isNavItemActive(pathname: string, item: (typeof navItems)[number]) {
  return pathname.startsWith(item.to) || (!!item.extraMatch && pathname.startsWith(item.extraMatch))
}

function SidebarContent({
  pathname, onNavClick, collapsed, onToggleCollapse,
}: {
  pathname: string
  onNavClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className={cn("flex flex-col gap-1.5 px-4 pt-5 pb-5", collapsed ? "items-center px-2" : "items-start")}>
        <div className={cn("flex w-full items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <AppLogo className="h-10 w-auto max-w-[180px]" />}
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
        {!collapsed && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Superadmin
          </span>
        )}
      </div>
      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const { label, to, icon } = item
          const active = isNavItemActive(pathname, item)
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

export function SuperadminLayout() {
  const { profile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useSidebarCollapse()
  const currentLabel = navItems.find((n) => isNavItemActive(pathname, n))?.label ?? "Superadmin"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden md:flex skeuo-surface flex-col shrink-0 m-3 rounded-2xl border border-white/55 overflow-hidden transition-[width] duration-200 dark:border-white/10",
          collapsed ? "w-[76px]" : "w-[220px]"
        )}
      >
        <SidebarContent pathname={pathname} collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[220px] p-0 bg-card">
          <SheetHeader className="sr-only">
            <SheetTitle>Superadmin Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent pathname={pathname} onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex h-16 items-center justify-between px-6 shrink-0 lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8 rounded-lg"
              onClick={() => setMobileOpen(true)}
            >
              <SolarDuotoneIcon icon={Menu01Icon} size={18} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
            </Button>
            <span className="text-base font-semibold">{currentLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
            <ThemeToggle />
            <UserDropdown fullName={profile?.full_name} email={profile?.email} role={profile?.role} onSignOut={signOut} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-6 pb-8 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
