import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { usePlatformAdminStatus } from "@/hooks/useSuperadmin"

export function SuperadminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  // usePlatformAdminStatus() is `enabled: !!user`, and in TanStack Query v5,
  // isLoading (isPending && isFetching) stays false for a disabled query that
  // hasn't fetched yet -- so on a cold page load (hard refresh / direct link),
  // this query's own isLoading never catches "still waiting for auth to
  // bootstrap." Gating on the auth context's own loading flag first (same
  // pattern as AuthGuard) closes that gap.
  const { data: isPlatformAdmin, isLoading: statusLoading } = usePlatformAdminStatus()

  if (authLoading || (!!user && statusLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!isPlatformAdmin) {
    return <Navigate to="/admin" replace />
  }

  return <>{children}</>
}
