import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { VendorStatusGuard } from "@/components/auth/VendorStatusGuard"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { VendorLayout } from "@/components/layout/VendorLayout"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { INTERNAL_ROLES } from "@/hooks/usePermissions"

// Auth pages
import { LoginForm } from "@/components/auth/LoginForm"
import { SignupForm } from "@/components/auth/SignupForm"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"
import { NotFound } from "@/pages/NotFound"
import { VerifyEmailPage } from "@/pages/VerifyEmailPage"

// Onboarding
import { OnboardingPage } from "@/pages/onboarding/OnboardingPage"

// Vendor pages
import { VendorDashboard } from "@/pages/vendor/VendorDashboard"
import { VendorProfile } from "@/pages/vendor/VendorProfile"
import { VendorDocuments } from "@/pages/vendor/VendorDocuments"
import { VendorContracts } from "@/pages/vendor/VendorContracts"
import { VendorRenewal } from "@/pages/vendor/VendorRenewal"
import { VendorRFQ } from "@/pages/vendor/VendorRFQ"
import { VendorRFQDetail } from "@/pages/vendor/VendorRFQDetail"

// Admin pages
import { VendorList } from "@/pages/admin/VendorList"
import { VendorDetail } from "@/pages/admin/VendorDetail"
import { CategoryManagement } from "@/pages/admin/CategoryManagement"
import { Reports } from "@/pages/admin/Reports"

// Procurement pages
import { EngagementList } from "@/pages/admin/EngagementList"
import { EngagementDetail } from "@/pages/admin/EngagementDetail"
import { PurchaseOrderList } from "@/pages/admin/PurchaseOrderList"
import { PurchaseOrderDetail } from "@/pages/admin/PurchaseOrderDetail"
import { GRNList } from "@/pages/admin/GRNList"
import { InvoiceList } from "@/pages/admin/InvoiceList"
import { VendorInvoices } from "@/pages/vendor/VendorInvoices"
import { ContractList } from "@/pages/admin/ContractList"
import { ContractDetail } from "@/pages/admin/ContractDetail"

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
                <Route path="/forgot-password" element={<ForgotPasswordForm />} />
                <Route path="/reset-password" element={<ResetPasswordForm />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
              </Route>

              {/* Onboarding — vendor accounts only */}
              <Route path="/onboarding" element={<AuthGuard role="vendor"><OnboardingPage /></AuthGuard>} />

              {/* Vendor portal */}
              <Route path="/vendor" element={<AuthGuard role="vendor"><VendorLayout /></AuthGuard>}>
                <Route index element={<Navigate to="/vendor/dashboard" replace />} />
                <Route path="dashboard" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorDashboard />
                  </VendorStatusGuard>
                } />
                <Route path="profile" element={<VendorProfile />} />
                <Route path="documents" element={
                  <VendorStatusGuard allowedStages={["ONBOARDING_COMPLETED", "APPROVED"]}>
                    <VendorDocuments />
                  </VendorStatusGuard>
                } />
                <Route path="contracts" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorContracts />
                  </VendorStatusGuard>
                } />
                <Route path="contracts/:id" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <ContractDetail />
                  </VendorStatusGuard>
                } />
                <Route path="renewal" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorRenewal />
                  </VendorStatusGuard>
                } />
                <Route path="rfqs" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorRFQ />
                  </VendorStatusGuard>
                } />
                <Route path="rfqs/:id" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorRFQDetail />
                  </VendorStatusGuard>
                } />
                <Route path="invoices" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorInvoices />
                  </VendorStatusGuard>
                } />
              </Route>

              {/* Admin portal — all internal roles (hr_user, manager, procurement_admin, finance_ap, super_admin, admin) */}
              <Route path="/admin" element={<AuthGuard role={INTERNAL_ROLES}><AdminLayout /></AuthGuard>}>
                <Route index element={<Navigate to="/admin/vendors" replace />} />
                <Route path="dashboard"  element={<Navigate to="/admin/vendors" replace />} />
                <Route path="vendors"    element={<VendorList />} />
                <Route path="vendors/:id" element={<VendorDetail />} />
                <Route path="categories" element={<CategoryManagement />} />
                <Route path="reports"    element={<Reports />} />
                <Route path="engagements"    element={<EngagementList />} />
                <Route path="engagements/:id" element={<EngagementDetail />} />
                <Route path="purchase-orders"    element={<PurchaseOrderList />} />
                <Route path="purchase-orders/:id" element={<PurchaseOrderDetail />} />
                <Route path="grns"        element={<GRNList />} />
                <Route path="invoices"    element={<InvoiceList />} />
                <Route path="contracts"      element={<ContractList />} />
                <Route path="contracts/:id"  element={<ContractDetail />} />
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
