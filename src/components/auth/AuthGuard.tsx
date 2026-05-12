import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/lib/types"

interface AuthGuardProps {
  children: React.ReactNode
  /** Single role or list of allowed roles. Omit to allow any authenticated user. */
  role?: UserRole | UserRole[]
}

export function AuthGuard({ children, role }: AuthGuardProps) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (role && profile) {
    const allowed = Array.isArray(role)
      ? role.includes(profile.role)
      : profile.role === role

    if (!allowed) {
      const dest = profile.role === "vendor" ? "/vendor/dashboard" : "/admin/dashboard"
      return <Navigate to={dest} replace />
    }
  }

  return <>{children}</>
}
