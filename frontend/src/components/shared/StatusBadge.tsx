import { cn } from "@/lib/utils"
import { VENDOR_STATUS_LABELS, VENDOR_STATUS_COLORS } from "@/lib/constants"
import type { VendorStatus } from "@/lib/types"

interface StatusBadgeProps {
  status: VendorStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        VENDOR_STATUS_COLORS[status],
        className
      )}
    >
      {VENDOR_STATUS_LABELS[status]}
    </span>
  )
}
