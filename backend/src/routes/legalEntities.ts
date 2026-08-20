import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// All routes here are vendor-scoped to the CALLER's own vendor -- there is
// no cross-vendor read/write surface. A vendor's own Legal Entity/tax/
// banking/contacts detail is exactly the kind of sensitive data that should
// never be reachable via a client-supplied vendorId (mirrors vendorUsers.ts
// and vendors.ts's own resolveVendorId(actorId) pattern throughout).

// POST /api/legal-entities/list — every Legal Entity for the caller's
// vendor, default first, with operating countries attached.
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data: entities, error } = await db()
      .from("legal_entities")
      .select("id, registered_country, legal_name, registration_number, entity_type, status, is_default")
      .eq("vendor_id", vendorId)
      .order("is_default", { ascending: false })
    if (error) throw error

    const entityIds = (entities ?? []).map((e: any) => e.id)
    const countriesByEntity = new Map<string, string[]>()
    if (entityIds.length > 0) {
      const { data: countries, error: cError } = await db()
        .from("legal_entity_operating_countries")
        .select("legal_entity_id, country")
        .in("legal_entity_id", entityIds)
      if (cError) throw cError
      for (const row of countries ?? []) {
        const list = countriesByEntity.get(row.legal_entity_id) ?? []
        list.push(row.country)
        countriesByEntity.set(row.legal_entity_id, list)
      }
    }

    const data = (entities ?? []).map((e: any) => ({
      id: e.id,
      registeredCountry: e.registered_country,
      legalName: e.legal_name,
      registrationNumber: e.registration_number,
      entityType: e.entity_type,
      status: e.status,
      isDefault: e.is_default,
      operatingCountries: countriesByEntity.get(e.id) ?? [],
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[legal-entities/list]", err.message)
    res.status(500).json({ error: "Failed to list legal entities" })
  }
})

// POST /api/legal-entities/detail — {legalEntityId} -> the full bundle
// (entity fields + operating countries + tax/compliance registrations +
// bank accounts + contacts) for a detail/edit view.
router.post("/detail", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId } = req.body as { legalEntityId?: string }
    if (!legalEntityId) return res.status(400).json({ error: "legalEntityId is required" })

    const { data: entity, error } = await db()
      .from("legal_entities")
      .select("id, registered_country, legal_name, registration_number, entity_type, status, is_default, gst_exempt, gst_exemption_reason, tds_section")
      .eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (error) throw error
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const [countriesResult, taxRegsResult, complianceRegsResult, bankAccountsResult, contactsResult] = await Promise.all([
      db().from("legal_entity_operating_countries").select("country").eq("legal_entity_id", legalEntityId),
      db().from("tax_registrations").select("id, registration_type, country, state, registration_value, status, verification_id").eq("legal_entity_id", legalEntityId),
      db().from("compliance_registrations").select("id, requirement:requirement_id(code, label), registration_value, status, verification_id").eq("legal_entity_id", legalEntityId),
      db().from("bank_accounts").select("id, country, currency, bank_name, account_number_last4, ifsc, swift_bic, iban, beneficiary_name, is_primary, status").eq("legal_entity_id", legalEntityId),
      db().from("contacts").select("id, contact_type, name, email, phone, designation, is_primary, active").eq("owner_type", "legal_entity").eq("owner_id", legalEntityId),
    ])
    if (countriesResult.error) throw countriesResult.error
    if (taxRegsResult.error) throw taxRegsResult.error
    if (complianceRegsResult.error) throw complianceRegsResult.error
    if (bankAccountsResult.error) throw bankAccountsResult.error
    if (contactsResult.error) throw contactsResult.error

    res.json({
      data: {
        id: entity.id,
        registeredCountry: entity.registered_country,
        legalName: entity.legal_name,
        registrationNumber: entity.registration_number,
        entityType: entity.entity_type,
        status: entity.status,
        isDefault: entity.is_default,
        gstExempt: entity.gst_exempt,
        gstExemptionReason: entity.gst_exemption_reason,
        tdsSection: entity.tds_section,
        operatingCountries: (countriesResult.data ?? []).map((c: any) => c.country),
        taxRegistrations: taxRegsResult.data ?? [],
        complianceRegistrations: complianceRegsResult.data ?? [],
        bankAccounts: bankAccountsResult.data ?? [],
        contacts: contactsResult.data ?? [],
      },
    })
  } catch (err: any) {
    console.error("[legal-entities/detail]", err.message)
    res.status(500).json({ error: "Failed to load legal entity" })
  }
})

// POST /api/legal-entities/create — adds an ADDITIONAL, non-default Legal
// Entity to the caller's vendor (the MNC "operates through more than one
// legal entity" case). The vendor's one default entity is created
// automatically at signup (ensureDefaultLegalEntity); never through here.
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const {
      registeredCountry, legalName, registrationNumber, entityType,
      operatingCountries, taxRegistrations, bankAccounts,
    } = req.body as {
      registeredCountry?: string; legalName?: string; registrationNumber?: string; entityType?: string
      operatingCountries?: string[]
      taxRegistrations?: { registrationType: string; country: string; state?: string; registrationValue: string }[]
      bankAccounts?: { country: string; currency?: string; bankName?: string; accountNumber: string; ifsc?: string; swiftBic?: string; iban?: string; beneficiaryName?: string; isPrimary?: boolean }[]
    }

    if (!registeredCountry?.trim()) return res.status(400).json({ error: "registeredCountry is required" })

    const { data: legalEntityId, error } = await db().rpc("create_legal_entity_full", {
      p_vendor_id: vendorId,
      p_registered_country: registeredCountry.trim(),
      p_legal_name: legalName || null,
      p_registration_number: registrationNumber || null,
      p_entity_type: entityType || "company",
      p_operating_countries: operatingCountries ?? [],
      p_tax_registrations: (taxRegistrations ?? []).map((t) => ({
        registration_type: t.registrationType, country: t.country, state: t.state ?? null, registration_value: t.registrationValue,
      })),
      p_bank_accounts: (bankAccounts ?? []).map((b) => ({
        country: b.country, currency: b.currency ?? "INR", bank_name: b.bankName ?? null,
        account_number: b.accountNumber, ifsc: b.ifsc ?? null, swift_bic: b.swiftBic ?? null, iban: b.iban ?? null,
        beneficiary_name: b.beneficiaryName ?? null, is_primary: !!b.isPrimary,
      })),
    })
    if (error) throw error

    res.status(201).json({ data: { legalEntityId } })
  } catch (err: any) {
    console.error("[legal-entities/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create legal entity" })
  }
})

// POST /api/legal-entities/update — basic entity fields only. Tax/
// compliance/banking/contacts each have their own focused endpoints below
// rather than being folded into one large "update everything" call.
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, legalName, registrationNumber, tdsSection } = req.body as {
      legalEntityId?: string; legalName?: string; registrationNumber?: string; tdsSection?: string | null
    }
    if (!legalEntityId) return res.status(400).json({ error: "legalEntityId is required" })

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const patch: Record<string, string | null> = {}
    if (legalName !== undefined) patch.legal_name = legalName ?? null
    if (registrationNumber !== undefined) patch.registration_number = registrationNumber ?? null
    if (tdsSection !== undefined) patch.tds_section = tdsSection ?? null

    const { error } = await db().from("legal_entities").update(patch).eq("id", legalEntityId)
    if (error) throw error

    res.json({ data: { legalEntityId } })
  } catch (err: any) {
    console.error("[legal-entities/update]", err.message)
    res.status(500).json({ error: err.message || "Failed to update legal entity" })
  }
})

// POST /api/legal-entities/operating-countries/add — {legalEntityId, country}
router.post("/operating-countries/add", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, country } = req.body as { legalEntityId?: string; country?: string }
    if (!legalEntityId || !country?.trim()) return res.status(400).json({ error: "legalEntityId and country are required" })

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const { error } = await db().from("legal_entity_operating_countries").insert({ legal_entity_id: legalEntityId, country: country.trim() })
    if (error && error.code !== "23505") throw error // 23505 = already an operating country, harmless
    res.status(201).json({ data: { legalEntityId, country: country.trim() } })
  } catch (err: any) {
    console.error("[legal-entities/operating-countries/add]", err.message)
    res.status(500).json({ error: "Failed to add operating country" })
  }
})

// POST /api/legal-entities/operating-countries/remove — {legalEntityId, country}
// Cannot remove the entity's own registered country -- it's always an
// operating country by definition.
router.post("/operating-countries/remove", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, country } = req.body as { legalEntityId?: string; country?: string }
    if (!legalEntityId || !country?.trim()) return res.status(400).json({ error: "legalEntityId and country are required" })

    const { data: entity } = await db().from("legal_entities").select("id, registered_country").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })
    if (entity.registered_country === country.trim()) {
      return res.status(400).json({ error: "Cannot remove the entity's registered country from its operating countries" })
    }

    const { error } = await db().from("legal_entity_operating_countries").delete().eq("legal_entity_id", legalEntityId).eq("country", country.trim())
    if (error) throw error
    res.json({ data: { legalEntityId, country: country.trim() } })
  } catch (err: any) {
    console.error("[legal-entities/operating-countries/remove]", err.message)
    res.status(500).json({ error: "Failed to remove operating country" })
  }
})

// POST /api/legal-entities/tax-registrations/create
router.post("/tax-registrations/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, registrationType, country, state, registrationValue } = req.body as {
      legalEntityId?: string; registrationType?: string; country?: string; state?: string; registrationValue?: string
    }
    if (!legalEntityId || !registrationType || !country?.trim() || !registrationValue?.trim()) {
      return res.status(400).json({ error: "legalEntityId, registrationType, country, and registrationValue are required" })
    }

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const { data, error } = await db()
      .from("tax_registrations")
      .insert({ legal_entity_id: legalEntityId, registration_type: registrationType, country: country.trim(), state: state?.trim() || null, registration_value: registrationValue.trim() })
      .select("id").single()
    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[legal-entities/tax-registrations/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to add tax registration" })
  }
})

// POST /api/legal-entities/compliance-registrations/create
router.post("/compliance-registrations/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, requirementId, registrationValue } = req.body as {
      legalEntityId?: string; requirementId?: string; registrationValue?: string
    }
    if (!legalEntityId || !requirementId || !registrationValue?.trim()) {
      return res.status(400).json({ error: "legalEntityId, requirementId, and registrationValue are required" })
    }

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const { data, error } = await db()
      .from("compliance_registrations")
      .insert({ legal_entity_id: legalEntityId, requirement_id: requirementId, registration_value: registrationValue.trim() })
      .select("id").single()
    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[legal-entities/compliance-registrations/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to add compliance registration" })
  }
})

// POST /api/legal-entities/bank-accounts/create
router.post("/bank-accounts/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, country, currency, bankName, accountNumber, ifsc, swiftBic, iban, beneficiaryName, isPrimary } = req.body as {
      legalEntityId?: string; country?: string; currency?: string; bankName?: string
      accountNumber?: string; ifsc?: string; swiftBic?: string; iban?: string; beneficiaryName?: string; isPrimary?: boolean
    }
    if (!legalEntityId || !country?.trim() || !accountNumber?.trim()) {
      return res.status(400).json({ error: "legalEntityId, country, and accountNumber are required" })
    }

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    // Only one primary per entity -- if this is requested as primary,
    // demote the existing one first rather than letting the partial
    // unique index (uq_bank_accounts_one_primary_per_entity) reject the
    // insert.
    if (isPrimary) {
      await db().from("bank_accounts").update({ is_primary: false }).eq("legal_entity_id", legalEntityId).eq("is_primary", true)
    }

    const { data, error } = await db()
      .from("bank_accounts")
      .insert({
        legal_entity_id: legalEntityId, country: country.trim(), currency: currency || "INR", bank_name: bankName || null,
        account_number: accountNumber.trim(), ifsc: ifsc || null, swift_bic: swiftBic || null, iban: iban || null,
        beneficiary_name: beneficiaryName || null, is_primary: !!isPrimary,
      })
      .select("id").single()
    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[legal-entities/bank-accounts/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to add bank account" })
  }
})

// POST /api/legal-entities/bank-accounts/set-primary — {legalEntityId, bankAccountId}
router.post("/bank-accounts/set-primary", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, bankAccountId } = req.body as { legalEntityId?: string; bankAccountId?: string }
    if (!legalEntityId || !bankAccountId) return res.status(400).json({ error: "legalEntityId and bankAccountId are required" })

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    const { data: account } = await db().from("bank_accounts").select("id").eq("id", bankAccountId).eq("legal_entity_id", legalEntityId).maybeSingle()
    if (!account) return res.status(404).json({ error: "Bank account not found for this legal entity" })

    await db().from("bank_accounts").update({ is_primary: false }).eq("legal_entity_id", legalEntityId).eq("is_primary", true)
    const { error } = await db().from("bank_accounts").update({ is_primary: true }).eq("id", bankAccountId)
    if (error) throw error

    res.json({ data: { legalEntityId, bankAccountId } })
  } catch (err: any) {
    console.error("[legal-entities/bank-accounts/set-primary]", err.message)
    res.status(500).json({ error: "Failed to set primary bank account" })
  }
})

// POST /api/legal-entities/contacts/create — legal-entity-scoped contacts
// (Vendor-Group-level contacts are managed via vendors.ts, not here).
router.post("/contacts/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { legalEntityId, contactType, name, email, phone, designation, isPrimary } = req.body as {
      legalEntityId?: string; contactType?: string; name?: string; email?: string; phone?: string; designation?: string; isPrimary?: boolean
    }
    if (!legalEntityId || !contactType || !name?.trim()) {
      return res.status(400).json({ error: "legalEntityId, contactType, and name are required" })
    }

    const { data: entity } = await db().from("legal_entities").select("id").eq("id", legalEntityId).eq("vendor_id", vendorId).maybeSingle()
    if (!entity) return res.status(404).json({ error: "Legal entity not found for this vendor" })

    if (isPrimary) {
      await db().from("contacts").update({ is_primary: false }).eq("owner_type", "legal_entity").eq("owner_id", legalEntityId).eq("is_primary", true)
    }

    const { data, error } = await db()
      .from("contacts")
      .insert({
        owner_type: "legal_entity", owner_id: legalEntityId, contact_type: contactType,
        name: name.trim(), email: email || null, phone: phone || null, designation: designation || null, is_primary: !!isPrimary,
      })
      .select("id").single()
    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[legal-entities/contacts/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to add contact" })
  }
})

export default router
