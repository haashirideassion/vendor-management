import { Navigate } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"

export type VendorStage = "REGISTERED" | "ONBOARDING_COMPLETED" | "APPROVED" | "RESTRICTED"

export function getVendorStage(vendor: { status: string } | null | undefined): VendorStage {
  if (!vendor) return "REGISTERED"
  if (vendor.status === "active" || vendor.status === "action_required") return "APPROVED"
  if (vendor.status === "pending_review") return "ONBOARDING_COMPLETED"
  return "RESTRICTED"
}

function stageRedirect(_stage: VendorStage): string {
  return "/vendor/profile"
}

interface Props {
  allowedStages: VendorStage[]
  children: React.ReactNode
}

export function VendorStatusGuard({ allowedStages, children }: Props) {
  const { data: vendor, isLoading } = useVendor()

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const stage = getVendorStage(vendor)
  if (!allowedStages.includes(stage)) {
    return <Navigate to={stageRedirect(stage)} replace />
  }

  return <>{children}</>
}
