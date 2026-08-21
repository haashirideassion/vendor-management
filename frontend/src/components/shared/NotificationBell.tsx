import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useVendorRFQs } from "@/hooks/useRFQs"
import {
  useAdminNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Notification01Icon, Briefcase01Icon, Invoice02Icon } from "@/components/shared/SolarIcon"
import { formatDistanceToNow } from "date-fns"
import type { Notification } from "@/lib/types"
import { cn } from "@/lib/utils"

// Vendors don't have a per-invoice detail route, so invoice_status_update
// falls back to the invoice list -- the "if the respective page isn't
// available, redirect to the main page" rule.
function notificationHref(type: Notification["type"]): string {
  switch (type) {
    case "invoice_status_update": return "/vendor/invoices"
    case "grn_decision": return "/vendor/purchase-orders"
    default: return "/vendor/dashboard"
  }
}

export function NotificationBell() {
  const { data: rfqs = [] } = useVendorRFQs()
  const { data: notifications = [] } = useAdminNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const pending = rfqs.filter((r) => r.status === "pending")
  const unreadNotifCount = notifications.filter((n) => !n.is_read).length
  const count = pending.length + unreadNotifCount

  function handleNotificationClick(n: Notification) {
    if (!n.is_read) markRead.mutate(n.id)
    setOpen(false)
    navigate(notificationHref(n.type))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-lg">
          <SolarDuotoneIcon
            icon={Notification01Icon}
            size={18}
            strokeWidth={1.5}
            primaryColor="currentColor"
            secondaryColor="currentColor"
          />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white leading-none">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadNotifCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
          {notifications.length === 0 && pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <SolarDuotoneIcon icon={Notification01Icon} size={28} strokeWidth={1.5} className="text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No new notifications</p>
            </div>
          ) : (
            <>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors",
                    !n.is_read && "bg-primary/3"
                  )}
                >
                  <div className="mt-0.5 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <SolarDuotoneIcon icon={Invoice02Icon} size={14} strokeWidth={1.5} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-medium leading-snug">{n.title}</p>
                      {!n.is_read && <span className="mt-0.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {n.message && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}
              {pending.map((rfq) => (
                <Link
                  key={rfq.id}
                  to={`/vendor/rfqs/${rfq.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="mt-0.5 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <SolarDuotoneIcon icon={Briefcase01Icon} size={14} strokeWidth={1.5} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-snug truncate">
                      {rfq.purchase_request?.title ?? "New RFQ"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Quotation requested — tap to respond
                    </p>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
        {pending.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border/60">
            <Link
              to="/vendor/rfqs"
              onClick={() => setOpen(false)}
              className="text-xs text-primary font-medium hover:underline"
            >
              View all RFQs →
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
