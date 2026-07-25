import { useOrg } from "@/contexts/OrgContext"
import { usePermissions } from "@/hooks/usePermissions"
import { SolarDuotoneIcon, InformationCircleIcon } from "@/components/shared/SolarIcon"

// Persistent, driven entirely by the already-fetched /api/access/context
// payload (via useOrg/usePermissions) -- no extra fetch. Shown whenever the
// active org is reached only through standing group_admin access, not
// direct membership.
export function ActingAsGroupAdminBanner() {
  const { activeOrg } = useOrg()
  const { isActingAsGroupAdmin } = usePermissions()

  if (!isActingAsGroupAdmin || !activeOrg) return null

  return (
    <div className="mt-6 mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <SolarDuotoneIcon icon={InformationCircleIcon} size={16} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
      <span>
        Acting as group admin in <strong>{activeOrg.name}</strong> — not a local member of this organization.
      </span>
    </div>
  )
}
