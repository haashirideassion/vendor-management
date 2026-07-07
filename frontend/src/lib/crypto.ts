import { API_BASE } from "@/lib/apiBase"

let _cachedKey: CryptoKey | null = null
let _cacheTime = 0
const KEY_TTL_MS = 5 * 60 * 1000

async function getPublicKey(): Promise<CryptoKey> {
  if (_cachedKey && Date.now() - _cacheTime < KEY_TTL_MS) return _cachedKey

  const res = await fetch(`${API_BASE}/api/auth/public-key`)
  if (!res.ok) throw new Error("Failed to fetch public key")
  const text = await res.text()
  let payload: { publicKey?: string }
  try {
    payload = JSON.parse(text) as { publicKey?: string }
  } catch {
    throw new Error(`Auth API returned ${res.headers.get("content-type") ?? "non-JSON"} instead of JSON`)
  }
  const pem = payload.publicKey
  if (!pem) throw new Error("Auth API did not return a public key")

  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "")
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

  _cachedKey = await window.crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  )
  _cacheTime = Date.now()
  return _cachedKey
}

export async function encryptPassword(plain: string): Promise<string> {
  const key = await getPublicKey()
  const encoded = new TextEncoder().encode(plain)
  const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoded)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

export function clearPublicKeyCache() {
  _cachedKey = null
  _cacheTime = 0
}
