import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import type { UserRole } from "@/lib/types"

interface AuthGuardProps {
  children: React.ReactNode
  role?: UserRole
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

  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === "admin" ? "/admin/dashboard" : "/vendor/dashboard"} replace />
  }

  return <>{children}</>
}
