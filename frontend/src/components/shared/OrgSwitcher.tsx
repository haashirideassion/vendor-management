import { useNavigate } from "react-router-dom"
import { useOrg } from "@/contexts/OrgContext"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

const GROUP_VALUE_PREFIX = "group:"

// Shown for internal users with at least one org membership or group_admin
// grant. Groups are listed above standalone orgs (Phase 5.1); picking a
// group navigates to its overview screen rather than setting an active org
// directly, since a group isn't itself something requests get scoped to.
export function OrgSwitcher() {
  const { orgs, groups, activeOrg, setActiveOrg, loading } = useOrg()
  const navigate = useNavigate()

  if (loading || (orgs.length === 0 && groups.length === 0)) return null

  function handleChange(value: string) {
    if (value.startsWith(GROUP_VALUE_PREFIX)) {
      navigate(`/admin/groups/${value.slice(GROUP_VALUE_PREFIX.length)}`)
      return
    }
    setActiveOrg(value)
  }

  return (
    <Select value={activeOrg?.id} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-auto max-w-[220px] gap-1.5 rounded-lg border-none bg-transparent text-sm font-medium shadow-none hover:bg-accent">
        <SelectValue placeholder="Select organization" />
      </SelectTrigger>
      <SelectContent>
        {groups.length > 0 && (
          <>
            <SelectGroup>
              <SelectLabel>Groups</SelectLabel>
              {groups.map((group) => (
                <SelectItem key={group.id} value={`${GROUP_VALUE_PREFIX}${group.id}`}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
          </>
        )}
        {orgs.length > 0 && (
          <SelectGroup>
            <SelectLabel>Organizations</SelectLabel>
            {orgs.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                <span className="flex items-center gap-1.5">
                  {org.name}
                  {org.isPrimary && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium">Primary</Badge>
                  )}
                  {org.access === "group_admin" && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium text-muted-foreground">
                      Group admin
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  )
}
