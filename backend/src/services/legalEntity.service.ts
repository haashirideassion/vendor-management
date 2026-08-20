import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

export interface EnsureDefaultLegalEntityInput {
  vendorId: string
  country?: string
  isSoloUser?: boolean
  legalName?: string | null
  registrationNumber?: string | null
  panNumber?: string | null
  gstNumber?: string | null
  bankName?: string | null
  bankAccountNumber?: string | null
  bankRoutingNumber?: string | null // IFSC
}

// create_vendor_with_categories (the RPC behind self-service /create and
// admin-onboard) predates the Legal Entity model entirely -- it only ever
// wrote to vendors/vendor_categories, so every vendor created since that
// redesign shipped has zero legal_entities rows, breaking the "every vendor
// has exactly one default entity" invariant the whole schema depends on.
//
// Rather than touching the RPC (same convention already established for
// is_solo_user/org_group_code/pan_number -- "signature predates these
// fields, set them with a follow-up update"), this is called as a
// idempotent follow-up from every route that creates or fills in a vendor.
// Mirrors the exact logic of the 053-058 migrations' backfill, just run
// per-request instead of once over legacy data.
export async function ensureDefaultLegalEntity(input: EnsureDefaultLegalEntityInput): Promise<string> {
  const country = input.country || "India"

  const { data: existing, error: existingErr } = await db()
    .from("legal_entities")
    .select("id")
    .eq("vendor_id", input.vendorId)
    .eq("is_default", true)
    .maybeSingle()
  if (existingErr) throw existingErr

  let legalEntityId: string = existing?.id

  if (!legalEntityId) {
    const { data: created, error } = await db()
      .from("legal_entities")
      .insert({
        vendor_id: input.vendorId,
        registered_country: country,
        legal_name: input.legalName || null,
        registration_number: input.registrationNumber || null,
        entity_type: input.isSoloUser ? "individual" : "company",
        is_default: true,
      })
      .select("id")
      .single()
    if (error) throw error
    legalEntityId = created.id

    const { error: countryErr } = await db()
      .from("legal_entity_operating_countries")
      .insert({ legal_entity_id: legalEntityId, country })
    if (countryErr && countryErr.code !== "23505") throw countryErr // 23505 = unique_violation, harmless race
  } else if (input.legalName || input.registrationNumber) {
    // Entity already exists (e.g. admin-onboard created it with just a
    // company name; the vendor's own /create submission is filling in the
    // rest later) -- fill in legal_name/registration_number if we now have
    // values and didn't before. Never overwrites an existing non-null value
    // with a different one here; that's an explicit edit action, not this
    // creation-time fill-in.
    const patch: Record<string, string> = {}
    if (input.legalName) patch.legal_name = input.legalName
    if (input.registrationNumber) patch.registration_number = input.registrationNumber
    if (Object.keys(patch).length > 0) {
      await db().from("legal_entities").update(patch).eq("id", legalEntityId).is("legal_name", null)
    }
  }

  // Insert-if-absent, UPDATE-if-value-changed for both PAN/GST and the
  // primary bank account -- this function is also called from
  // POST /api/vendors/update (the vendor's own self-service profile edit),
  // where the tax_registrations/bank_accounts row from initial onboarding
  // already exists and needs to stay in sync rather than going stale.
  // Nothing is currently verified through an automated provider (Phase 3 is
  // manual-only), so there's no re-verification-reset concern yet -- just
  // keeping the mirrored value correct.
  if (input.panNumber) {
    const { data: existingPan } = await db()
      .from("tax_registrations")
      .select("id, registration_value")
      .eq("legal_entity_id", legalEntityId)
      .eq("registration_type", "PAN")
      .maybeSingle()
    if (!existingPan) {
      await db().from("tax_registrations").insert({
        legal_entity_id: legalEntityId, registration_type: "PAN", country, registration_value: input.panNumber,
      })
    } else if (existingPan.registration_value !== input.panNumber) {
      await db().from("tax_registrations").update({ registration_value: input.panNumber }).eq("id", existingPan.id)
    }
  }

  if (input.gstNumber) {
    const { data: existingGst } = await db()
      .from("tax_registrations")
      .select("id, registration_value")
      .eq("legal_entity_id", legalEntityId)
      .eq("registration_type", "GSTIN")
      .maybeSingle()
    if (!existingGst) {
      await db().from("tax_registrations").insert({
        legal_entity_id: legalEntityId, registration_type: "GSTIN", country, registration_value: input.gstNumber,
      })
    } else if (existingGst.registration_value !== input.gstNumber) {
      await db().from("tax_registrations").update({ registration_value: input.gstNumber }).eq("id", existingGst.id)
    }
  }

  if (input.bankAccountNumber) {
    const { data: existingPrimary } = await db()
      .from("bank_accounts")
      .select("id, bank_name, account_number, ifsc")
      .eq("legal_entity_id", legalEntityId)
      .eq("is_primary", true)
      .maybeSingle()
    if (!existingPrimary) {
      await db().from("bank_accounts").insert({
        legal_entity_id: legalEntityId,
        country,
        currency: "INR",
        bank_name: input.bankName || null,
        account_number: input.bankAccountNumber,
        ifsc: input.bankRoutingNumber || null,
        is_primary: true,
      })
    } else if (
      existingPrimary.account_number !== input.bankAccountNumber ||
      existingPrimary.ifsc !== (input.bankRoutingNumber || null) ||
      existingPrimary.bank_name !== (input.bankName || null)
    ) {
      await db().from("bank_accounts").update({
        bank_name: input.bankName || null,
        account_number: input.bankAccountNumber,
        ifsc: input.bankRoutingNumber || null,
      }).eq("id", existingPrimary.id)
    }
  }

  return legalEntityId
}
