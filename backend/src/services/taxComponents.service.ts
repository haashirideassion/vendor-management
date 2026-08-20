import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

export type LineItemType = "quotation" | "po" | "grn" | "service_confirmation"

export interface TaxComponentInput { name: string; rate: number }
export interface TaxComponent extends TaxComponentInput { id: string }

// A line item's tax_rate is simply the sum of its named components -- if
// none were submitted, the caller's existing flat tax_rate value passes
// through unchanged (migration 078: fully additive, not a replacement).
export function sumTaxComponents(components: TaxComponentInput[] | undefined, fallbackRate: number | null | undefined): number | null {
  if (!components || components.length === 0) return fallbackRate ?? null
  return components.reduce((sum, c) => sum + Number(c.rate), 0)
}

// Inserts the named breakdown for one newly-created line item. No-op when
// the line item was submitted with a plain flat tax_rate and no components.
export async function insertTaxComponents(
  lineItemType: LineItemType,
  lineItemId: string,
  components: TaxComponentInput[] | undefined
): Promise<void> {
  if (!components || components.length === 0) return
  const { error } = await db()
    .from("line_item_tax_components")
    .insert(components.map((c) => ({ line_item_type: lineItemType, line_item_id: lineItemId, name: c.name, rate: c.rate })))
  if (error) throw error
}

// Attaches each line item's tax component breakdown (if any) as
// `.tax_components`. Line items with no components get an empty array --
// the frontend already treats "no breakdown" as "just show the flat
// tax_rate", same as before this migration existed.
export async function attachTaxComponents<T extends { id: string }>(
  lineItemType: LineItemType,
  items: T[]
): Promise<(T & { tax_components: TaxComponent[] })[]> {
  if (items.length === 0) return []
  const { data, error } = await db()
    .from("line_item_tax_components")
    .select("id, line_item_id, name, rate")
    .eq("line_item_type", lineItemType)
    .in("line_item_id", items.map((i) => i.id))
  if (error) throw error

  const byLineItemId = new Map<string, TaxComponent[]>()
  for (const row of data ?? []) {
    const list = byLineItemId.get(row.line_item_id) ?? []
    list.push({ id: row.id, name: row.name, rate: row.rate })
    byLineItemId.set(row.line_item_id, list)
  }
  return items.map((item) => ({ ...item, tax_components: byLineItemId.get(item.id) ?? [] }))
}
