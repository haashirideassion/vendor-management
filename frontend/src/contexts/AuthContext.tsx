import { createContext, useContext, useEffect, useRef, useState } from "react"
import { setSupabaseAccessToken } from "@/lib/supabase"
import { encryptPassword } from "@/lib/crypto"
import { api } from "@/lib/api"
import type { Profile, UserRole } from "@/lib/types"
import { INTERNAL_ROLES } from "@/hooks/usePermissions"

const API = import.meta.env.VITE_API_URL as string

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName: string
}

interface AuthContextValue {
  user: AuthUser | null
  profile: Profile | null
  role: UserRole | null
  isInternalUser: boolean
  loading: boolean
  accessToken: string | null
  login: (email: string, password: string) => Promise<AuthUser>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function authFetch(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  return fetch(`${API}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function applySession(data: { accessToken: string; user: AuthUser }) {
    setAccessTokenState(data.accessToken)
    setSupabaseAccessToken(data.accessToken)
    setUser(data.user)

    // Schedule silent refresh at 13 min (token lifetime is 15 min)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(silentRefresh, 13 * 60 * 1000)

    const { data: prof } = await api.post<{ data: Profile | null }>(
      "/api/auth/profile", {}, data.accessToken
    )
    setProfile(prof ?? null)
  }

  async function silentRefresh() {
    try {
      const res = await fetch(`${API}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) { clearSession(); return }
      const data = await res.json()
      await applySession(data)
    } catch {
      clearSession()
    }
  }

  function clearSession() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    setAccessTokenState(null)
    setUser(null)
    setProfile(null)
    setSupabaseAccessToken(null)
  }

  useEffect(() => {
    silentRefresh().finally(() => setLoading(false))
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email: string, password: string): Promise<AuthUser> {
    const encryptedPassword = await encryptPassword(password)
    const res = await authFetch("/api/auth/login", { email, password: encryptedPassword })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Login failed")
    await applySession(data)
    return data.user as AuthUser
  }

  async function signOut() {
    await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {})
    clearSession()
  }

  const role = user?.role ?? null

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isInternalUser: role ? INTERNAL_ROLES.includes(role) : false,
        loading,
        accessToken,
        login,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
