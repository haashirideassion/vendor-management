import { API_BASE } from "@/lib/apiBase"

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) return {} as T

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`API returned ${res.headers.get("content-type") ?? "non-JSON"} from ${res.url}`)
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include",
  })
  const json = await readJson<{ error?: string } & T>(res)
  if (!res.ok) throw new Error(json.error ?? `API error ${res.status}`)
  return json as T
}

export const api = {
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token: token ?? undefined }),
  get: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: "GET", token: token ?? undefined }),
}
