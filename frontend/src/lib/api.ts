const API_BASE = import.meta.env.VITE_API_URL as string

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
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `API error ${res.status}`)
  return json as T
}

export const api = {
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token: token ?? undefined }),
  get: <T>(path: string, token?: string | null) =>
    request<T>(path, { method: "GET", token: token ?? undefined }),
}
