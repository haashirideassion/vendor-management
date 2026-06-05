import crypto from "crypto"

interface KeyPair {
  publicKey: crypto.KeyObject
  privateKey: crypto.KeyObject
  publicKeyPem: string
}

let _keyPair: KeyPair | null = null

export function getKeyPair(): KeyPair {
  if (_keyPair) return _keyPair

  const envPublic  = process.env.RSA_PUBLIC_KEY
  const envPrivate = process.env.RSA_PRIVATE_KEY

  if (envPublic && envPrivate) {
    // Vercel stores newlines as \n literals in env vars — restore them
    const publicPem  = envPublic.replace(/\\n/g, "\n")
    const privatePem = envPrivate.replace(/\\n/g, "\n")
    _keyPair = {
      publicKey:    crypto.createPublicKey(publicPem),
      privateKey:   crypto.createPrivateKey(privatePem),
      publicKeyPem: publicPem,
    }
  } else {
    // Local dev: generate an ephemeral pair (single process, no cold-start issue)
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding:  { type: "spki",   format: "pem" },
      privateKeyEncoding: { type: "pkcs8",  format: "pem" },
    })
    _keyPair = {
      publicKey:    crypto.createPublicKey(publicKey as unknown as string),
      privateKey:   crypto.createPrivateKey(privateKey as unknown as string),
      publicKeyPem: publicKey as unknown as string,
    }
  }

  return _keyPair
}

export function decryptPassword(encryptedBase64: string): string {
  const { privateKey } = getKeyPair()
  const buffer = Buffer.from(encryptedBase64, "base64")
  const decrypted = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    buffer
  )
  return decrypted.toString("utf8")
}
