// Phase 4.5's zero-visible-orgs case: no organization_members rows and no
// group_admin grants at all. Explicit empty state, never a blank page or a
// 500 from downstream org-scoped requests.
export function NoActiveMemberships() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-lg font-semibold">No active organization memberships</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You don't currently have access to any organization or group. Ask an administrator to invite you.
      </p>
    </div>
  )
}
