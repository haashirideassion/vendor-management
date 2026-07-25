import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { resolveAccessContext } from "../middleware/org"

function db(): any { return getSupabaseAdmin() }

export interface AuditWriteInput {
  entityType: string
  entityId: string
  action: string
  oldValue?: unknown
  newValue?: unknown
  performedBy: string | null
  orgId?: string | null
  actingAs?: "group_admin" | "superadmin" | null
}

// The single place audit_log gets written from application code (as opposed
// to the handful of remaining DB triggers, e.g. vendor status changes, whose
// auth.uid()-based performed_by is a separate, pre-existing limitation not
// touched here). Every route that writes audit_log calls this, so acting_as
// tagging is computed once, consistently, not re-derived ad hoc per route.
export async function writeAudit(input: AuditWriteInput): Promise<void> {
  const { error } = await db().from("audit_log").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    performed_by: input.performedBy,
    org_id: input.orgId,
    acting_as: input.actingAs ?? null,
  })
  if (error) console.error("[writeAudit]", error.message)
}

// Resolves acting_as for a (userId, orgId) pair independent of whether the
// route ran through requireOrg (several of the status-change routes this
// feeds don't -- they take an entity id and look up its org_id directly,
// per-entity, rather than requiring an X-Org-Id header).
export async function resolveActingAs(userId: string, orgId: string): Promise<"group_admin" | null> {
  const ctx = await resolveAccessContext(userId, orgId)
  return ctx.access === "group_admin" ? "group_admin" : null
}
