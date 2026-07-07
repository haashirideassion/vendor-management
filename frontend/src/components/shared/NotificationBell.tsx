import { useState } from "react"
import { Link } from "react-router-dom"
import { useVendorRFQs } from "@/hooks/useRFQs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Notification01Icon, Briefcase01Icon } from "@/components/shared/SolarIcon"

export function NotificationBell() {
  const { data: rfqs = [] } = useVendorRFQs()
  const [open, setOpen] = useState(false)

  const pending = rfqs.filter((r) => r.status === "pending")
  const count   = pending.length

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
          {count > 0 && (
            <span className="text-xs text-muted-foreground">{count} pending RFQ{count !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <SolarDuotoneIcon icon={Notification01Icon} size={28} strokeWidth={1.5} className="text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No new notifications</p>
            </div>
          ) : (
            pending.map((rfq) => (
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
                    {rfq.engagement?.title ?? "New RFQ"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Quotation requested — tap to respond
                  </p>
                </div>
              </Link>
            ))
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
