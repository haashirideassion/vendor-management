import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  usePlatformUsers, useSuspendUser, useReactivateUser, useForceReauth,
  useGrantPlatformAdmin, useRevokePlatformAdmin, useUpdateUser,
} from "@/hooks/useSuperadminUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SolarDuotoneIcon, ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { format } from "date-fns"
import { toast } from "sonner"

// Super Admin is deliberately excluded -- platform-admin status is its own
// thing (the Grant/Revoke admin buttons below, backed by the platform_admins
// table), not a value of this legacy role field.
const ROLE_LABELS: Record<string, string> = {
  vendor: "Vendor",
  hr_user: "HR User",
  manager: "Manager",
  procurement_admin: "Procurement Admin",
  finance_ap: "Finance (AP)",
  admin: "Admin",
}

async function run(mutation: { mutateAsync: (id: string) => Promise<unknown> }, userId: string, successMsg: string, failMsg: string) {
  try {
    await mutation.mutateAsync(userId)
    toast.success(successMsg)
  } catch (e: unknown) {
    toast.error((e as Error).message ?? failMsg)
  }
}

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const { data: users = [], isLoading } = usePlatformUsers()
  const user = users.find((u) => u.id === userId)

  const suspend = useSuspendUser()
  const reactivate = useReactivateUser()
  const forceReauth = useForceReauth()
  const grantAdmin = useGrantPlatformAdmin()
  const revokeAdmin = useRevokePlatformAdmin()
  const updateUser = useUpdateUser()

  const [fullName, setFullName] = useState(user?.fullName ?? "")
  const [role, setRole] = useState(user?.role ?? "")

  async function handleSave() {
    if (!user) return
    try {
      await updateUser.mutateAsync({ userId: user.id, fullName: fullName.trim(), role })
      toast.success("User updated")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update user")
    }
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <Link to="/admin/superadmin/users" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
          <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
          Users
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{user?.fullName || user?.email || "User"}</h1>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !user && <p className="text-sm text-muted-foreground">User not found.</p>}

      {user && (
        <div className="w-full space-y-6 rounded-xl border bg-card p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0">
              <Label>Email</Label>
              <Input value={user.email} disabled />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Account type</p><p>{user.accountType === "vendor" ? "Vendor" : "Organization"}</p></div>
            <div><p className="text-xs text-muted-foreground">Joined</p><p>{format(new Date(user.createdAt), "dd MMM yyyy")}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              {user.isSuspended ? (
                <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">suspended</Badge>
              ) : (
                <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">active</Badge>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Platform admin</p>
              {user.isPlatformAdmin ? <Badge>Platform Admin</Badge> : <span className="text-muted-foreground">—</span>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => run(forceReauth, user.id, "User will need to sign in again", "Failed to force re-authentication")}>
              Force re-auth
            </Button>
            {user.isSuspended ? (
              <Button variant="outline" size="sm" onClick={() => run(reactivate, user.id, "User reactivated", "Failed to reactivate user")}>Reactivate</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => run(suspend, user.id, "User suspended", "Failed to suspend user")}>Suspend</Button>
            )}
            {user.isPlatformAdmin ? (
              <Button variant="destructive" size="sm" onClick={() => run(revokeAdmin, user.id, "Platform admin revoked", "Failed to revoke platform admin")}>Revoke admin</Button>
            ) : (
              <Button size="sm" onClick={() => run(grantAdmin, user.id, "Platform admin granted", "Failed to grant platform admin")}>Grant admin</Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={updateUser.isPending}>
              {updateUser.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </AnimatedPage>
  )
}
