import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

export interface TeamRoleAssignment { teamId: string | null; roleId: string }

// Applies a full set of Team+Role assignments for one profile within one
// org/vendor tenant -- team_members rows for teamId != null, direct_role_
// assignments rows for teamId === null (the no-team small-business path).
//
// Manual check-then-write rather than .upsert({onConflict}) throughout:
// direct_role_assignments' uniqueness is two PARTIAL indexes (uq_dra_org/
// uq_dra_vendor, 060_fix_dra_unique_constraint.sql), and Postgres only
// honors ON CONFLICT column-list inference against a partial index when the
// same WHERE predicate is repeated in the ON CONFLICT clause itself --
// something the Supabase client's upsert() has no way to express. Same
// pattern as ensureDefaultLegalEntity's idempotent inserts.
//
// `replace: true` first removes anything in this tenant not present in the
// new assignment set (used by update-roles, which is a full replace by
// existing convention); `replace: false` is purely additive (used by
// invite, where there's nothing to remove yet).
export async function applyTeamRoleAssignments(params: {
  scope: "org" | "vendor"
  tenantId: string // org_id or vendor_id depending on scope
  profileId: string
  assignments: TeamRoleAssignment[]
  replace: boolean
}): Promise<void> {
  const { scope, tenantId, profileId, assignments, replace } = params
  const tenantCol = scope === "org" ? "org_id" : "vendor_id"

  if (replace) {
    const { data: tenantTeams } = await db().from("teams").select("id").eq(tenantCol, tenantId).eq("scope", scope)
    const tenantTeamIds = (tenantTeams ?? []).map((t: any) => t.id)
    const keepTeamIds = new Set(assignments.filter((a) => a.teamId).map((a) => a.teamId as string))
    const removeTeamIds = tenantTeamIds.filter((id: string) => !keepTeamIds.has(id))
    if (removeTeamIds.length > 0) {
      await db().from("team_members").delete().eq("profile_id", profileId).in("team_id", removeTeamIds)
    }

    const keepDirectRoleIds = new Set(assignments.filter((a) => !a.teamId).map((a) => a.roleId))
    const { data: existingDirect } = await db()
      .from("direct_role_assignments").select("id, role_id")
      .eq("scope", scope).eq(tenantCol, tenantId).eq("profile_id", profileId)
    const toRemove = (existingDirect ?? []).filter((r: any) => !keepDirectRoleIds.has(r.role_id)).map((r: any) => r.id)
    if (toRemove.length > 0) {
      await db().from("direct_role_assignments").delete().in("id", toRemove)
    }
  }

  for (const a of assignments) {
    if (a.teamId) {
      const { data: existing } = await db()
        .from("team_members").select("id").eq("team_id", a.teamId).eq("profile_id", profileId).maybeSingle()
      if (existing) {
        await db().from("team_members").update({ role_id: a.roleId }).eq("id", existing.id)
      } else {
        await db().from("team_members").insert({ team_id: a.teamId, profile_id: profileId, role_id: a.roleId })
      }
    } else {
      const { data: existing } = await db()
        .from("direct_role_assignments").select("id")
        .eq("scope", scope).eq(tenantCol, tenantId).eq("profile_id", profileId).eq("role_id", a.roleId).maybeSingle()
      if (!existing) {
        await db().from("direct_role_assignments").insert({ scope, [tenantCol]: tenantId, profile_id: profileId, role_id: a.roleId })
      }
    }
  }
}

// A client-supplied teamId must always be validated against the acting
// tenant before use -- otherwise a request could assign someone into
// another org/vendor's team.
export async function validateTeamsBelongToTenant(scope: "org" | "vendor", tenantId: string, teamIds: string[]): Promise<boolean> {
  if (teamIds.length === 0) return true
  const tenantCol = scope === "org" ? "org_id" : "vendor_id"
  const { data } = await db().from("teams").select("id").eq(tenantCol, tenantId).in("id", teamIds)
  const validIds = new Set((data ?? []).map((t: any) => t.id))
  return teamIds.every((id) => validIds.has(id))
}
