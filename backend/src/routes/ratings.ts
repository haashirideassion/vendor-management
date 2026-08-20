import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const DIMENSIONS = ["quality", "timeliness", "communication", "cost_competitiveness", "compliance"] as const

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "org", p_org_id: orgId, p_vendor_id: null, p_key: key })
  return data === true
}

// POST /api/ratings/by-vendor — { vendorId }
router.post("/by-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.body
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" })
    const { data, error } = await db()
      .from("vendor_ratings")
      .select("*, profiles:rated_by(full_name, email)")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
    if (error) throw error
    // Envelope now matches every other route (and what useVendorRatings
    // already expected) -- this previously returned a bare array, which
    // silently produced `undefined` on the frontend (`const { data } = ...`
    // destructuring an array has no `.data`), so ratings never actually
    // rendered.
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/ratings/create — { vendor_id, quality, timeliness, communication,
// cost_competitiveness, compliance, comment? }. A rater gets exactly ONE
// rating per vendor, ever -- this used to be an upsert (silently overwriting
// a rater's previous score), but now that a vendor can be rated from four
// different entry points (PO/GRN/Service Confirmation/Invoice detail pages,
// all writing to the same vendor_ratings row), silent overwrite meant
// re-rating from a different page could clobber an earlier rating without
// the rater necessarily meaning to change it. Once submitted, a rating is
// permanent -- attempting a second one is rejected outright.
//
// Also closes a real permission gap this route always had: no check beyond
// a valid JWT (requireAuth), and a client-supplied `rated_by` -- meaning any
// authenticated user could rate any vendor as anyone, despite vendors.rate
// being seeded Admin-tier-only. Both fixed: requireOrg + resolve_permission_as
// ("vendors.rate"), and rated_by is always the caller's own id.
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { vendor_id, comment } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id

    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const scores: Record<string, number> = {}
    for (const dim of DIMENSIONS) {
      const value = req.body[dim]
      if (value === undefined || value === null || !Number.isInteger(value) || value < 1 || value > 5) {
        return res.status(400).json({ error: `${dim} must be an integer between 1 and 5` })
      }
      scores[dim] = value
    }

    if (!(await hasOrgPermission(userId, orgId, "vendors.rate"))) {
      return res.status(403).json({ error: "You are not authorized to rate vendors" })
    }

    // This vendor must actually be associated with the caller's org --
    // otherwise any org's Admin could rate a vendor they've never engaged.
    const { data: association, error: assocError } = await db()
      .from("organization_vendors")
      .select("id")
      .eq("org_id", orgId)
      .eq("vendor_id", vendor_id)
      .maybeSingle()
    if (assocError) throw assocError
    if (!association) return res.status(404).json({ error: "Vendor not found in this organization" })

    const { data: existing, error: existingError } = await db()
      .from("vendor_ratings")
      .select("id")
      .eq("vendor_id", vendor_id)
      .eq("rated_by", userId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return res.status(409).json({ error: "You have already rated this vendor. Ratings cannot be changed once submitted.", code: "ALREADY_RATED" })
    }

    const payload: any = { vendor_id, rated_by: userId, ...scores }
    if (comment !== undefined) payload.comment = comment

    const { data, error } = await db()
      .from("vendor_ratings")
      .insert(payload)
      .select()
      .single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
