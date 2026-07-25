import { cn } from "@/lib/utils"
import { VENDOR_VERIFICATION_STATUS_LABELS, VENDOR_VERIFICATION_STATUS_COLORS } from "@/lib/constants"
import type { VendorVerificationStatus } from "@/lib/types"

interface VerificationStatusBadgeProps {
  status: VendorVerificationStatus
  className?: string
}

// Distinct from StatusBadge (VendorStatus, the operational suspended/active
// lifecycle) -- this covers the separate superadmin-only legal/compliance
// verification gate a vendor must clear before it's usable in new engagements.
export function VerificationStatusBadge({ status, className }: VerificationStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        VENDOR_VERIFICATION_STATUS_COLORS[status],
        className
      )}
    >
      {VENDOR_VERIFICATION_STATUS_LABELS[status]}
    </span>
  )
}
