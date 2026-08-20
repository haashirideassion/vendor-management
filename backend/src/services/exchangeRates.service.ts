import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000 // 24h

// Frankfurter (ECB reference rates) -- free, no API key required. Rates are
// cached in exchange_rates and only re-fetched once the cached value is
// more than 24h old, so a normal request rate never hits the external API
// directly.
async function fetchLiveRate(fromCurrency: string, toCurrency: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`)
  if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`)
  const json: any = await res.json()
  const rate = json?.rates?.[toCurrency]
  if (!rate) throw new Error(`No exchange rate available for ${fromCurrency} -> ${toCurrency}`)
  return Number(rate)
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return 1

  const { data: cached } = await db()
    .from("exchange_rates")
    .select("rate, fetched_at")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const isFresh = cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_FRESHNESS_MS
  if (isFresh) return Number(cached.rate)

  try {
    const rate = await fetchLiveRate(fromCurrency, toCurrency)
    await db().from("exchange_rates").insert({ from_currency: fromCurrency, to_currency: toCurrency, rate })
    return rate
  } catch (fetchErr: any) {
    // A stale cached rate is still far better than blocking the request --
    // only hard-fail when we have genuinely nothing to fall back on.
    if (cached) {
      console.error(`[exchangeRates] Live fetch failed (${fetchErr.message}); using stale rate from ${cached.fetched_at}`)
      return Number(cached.rate)
    }
    throw new Error(`Unable to fetch exchange rate for ${fromCurrency} -> ${toCurrency}: ${fetchErr.message}`)
  }
}

// Resolves the rate from `currency` to this org's base_currency -- the one
// snapshot every money-bearing entity (purchase request/PO/invoice/contract)
// stores at creation time. Returns 1 (no-op) when the transaction is
// already in the org's base currency.
export async function resolveExchangeRateToBase(orgId: string, currency: string | null | undefined): Promise<number> {
  if (!currency) return 1
  const { data: org } = await db().from("organizations").select("base_currency").eq("id", orgId).maybeSingle()
  const baseCurrency = org?.base_currency ?? "INR"
  if (currency === baseCurrency) return 1
  return getExchangeRate(currency, baseCurrency)
}
