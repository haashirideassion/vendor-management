const API = import.meta.env.VITE_API_URL as string

let _cachedKey: CryptoKey | null = null

async function getPublicKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey

  const res = await fetch(`${API}/api/auth/public-key`)
  const { publicKey: pem } = await res.json()

  // Strip PEM headers and decode base64
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
  return _cachedKey
}

export async function encryptPassword(plain: string): Promise<string> {
  const key = await getPublicKey()
  const encoded = new TextEncoder().encode(plain)
  const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, encoded)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

// Call on logout or key rotation to force re-fetch of public key
export function clearPublicKeyCache() {
  _cachedKey = null
}
