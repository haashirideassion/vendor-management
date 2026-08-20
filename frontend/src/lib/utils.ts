import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a byte count as a human-readable string (e.g. "2.4 MB") */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Locale drives digit-grouping (e.g. lakh/crore for INR vs. thousands for
// USD/EUR) -- was hardcoded to "en-IN" for every currency, which rendered a
// USD amount as "$1,00,000" (Indian grouping) instead of "$100,000".
const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN", USD: "en-US", GBP: "en-GB", EUR: "en-IE", JPY: "ja-JP",
  AUD: "en-AU", CAD: "en-CA", SGD: "en-SG", AED: "en-AE", CNY: "zh-CN",
}
// Currencies conventionally shown with no decimal places -- everything else
// gets the usual 2.
const ZERO_DECIMAL_CURRENCIES = new Set(["INR", "JPY", "KRW", "VND"])

/** Format a numeric amount as a currency string (default INR) */
export function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2,
  }).format(amount)
}
