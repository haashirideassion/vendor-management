import { API_BASE } from "@/lib/apiBase"

// Set by OrgContext when the active organization is known/changed. Kept as a
// module-level value (rather than threaded through every api.post/get call)
// so existing call sites don't need to pass org id explicitly.
let activeOrgId: string | null = null
export function setActiveOrgId(orgId: string | null) {
  activeOrgId = orgId
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`API returned ${res.headers.get("content-type") ?? "non-JSON"} from ${res.url}`)
  }
}

// A handful of endpoints (e.g. the group-removal/dissolution safeguards)
// return a structured 409 body -- {error, code, details} -- so callers that
// need to react to it (e.g. "requires a successor, here are the candidates")
// can, without changing the thrown-Error contract every other call site
// already relies on (e.message).
export class ApiError extends Error {
  code?: string
  details?: unknown
  constructor(message: string, code?: string, details?: unknown) {
    super(message)
    this.code = code
    this.details = details
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; orgIdOverride?: string } = {}
): Promise<T> {
  const { token, orgIdOverride, ...fetchOptions } = options
  const orgId = orgIdOverride ?? activeOrgId
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(orgId ? { "X-Org-Id": orgId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include",
  })
  const json = await readJson<{ error?: string; code?: string; details?: unknown } & T>(res)
  if (!res.ok) throw new ApiError(json.error ?? `API error ${res.status}`, json.code, json.details)
  return json as T
}

export const api = {
  post: <T>(path: string, body: unknown, token?: string | null, orgIdOverride?: string) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token: token ?? undefined, orgIdOverride }),
  get: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: "GET", token: token ?? undefined }),
}
