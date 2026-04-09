import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { VendorLayout } from "@/components/layout/VendorLayout"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"

// Auth pages
import { LoginForm } from "@/components/auth/LoginForm"
import { SignupForm } from "@/components/auth/SignupForm"
import { NotFound } from "@/pages/NotFound"

// Onboarding
import { OnboardingPage } from "@/pages/onboarding/OnboardingPage"

// Vendor pages
import { VendorDashboard } from "@/pages/vendor/VendorDashboard"
import { VendorProfile } from "@/pages/vendor/VendorProfile"
import { VendorDocuments } from "@/pages/vendor/VendorDocuments"
import { VendorServices } from "@/pages/vendor/VendorServices"
import { VendorCategories } from "@/pages/vendor/VendorCategories"
import { VendorRenewal } from "@/pages/vendor/VendorRenewal"

// Admin pages
import { AdminDashboard } from "@/pages/admin/AdminDashboard"
import { VendorList } from "@/pages/admin/VendorList"
import { VendorDetail } from "@/pages/admin/VendorDetail"
import { CategoryManagement } from "@/pages/admin/CategoryManagement"
import { Reports } from "@/pages/admin/Reports"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginForm />} />
                <Route path="/signup" element={<SignupForm />} />
              </Route>

              {/* Onboarding (authenticated, any role) */}
              <Route path="/onboarding" element={<AuthGuard><OnboardingPage /></AuthGuard>} />

              {/* Vendor portal */}
              <Route path="/vendor" element={<AuthGuard role="vendor"><VendorLayout /></AuthGuard>}>
                <Route index element={<Navigate to="/vendor/dashboard" replace />} />
                <Route path="dashboard"  element={<VendorDashboard />} />
                <Route path="profile"    element={<VendorProfile />} />
                <Route path="documents"  element={<VendorDocuments />} />
                <Route path="services"   element={<VendorServices />} />
                <Route path="categories" element={<VendorCategories />} />
                <Route path="renewal"    element={<VendorRenewal />} />
              </Route>

              {/* Admin portal */}
              <Route path="/admin" element={<AuthGuard role="admin"><AdminLayout /></AuthGuard>}>
                <Route index element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="dashboard"  element={<AdminDashboard />} />
                <Route path="vendors"    element={<VendorList />} />
                <Route path="vendors/:id" element={<VendorDetail />} />
                <Route path="categories" element={<CategoryManagement />} />
                <Route path="reports"    element={<Reports />} />
              </Route>

              {/* Catch-all */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
