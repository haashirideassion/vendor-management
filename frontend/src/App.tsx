import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queryClient"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider } from "@/contexts/AuthContext"
import { OrgProvider } from "@/contexts/OrgContext"
import { VENDOR_INVITE_TOKEN_KEY } from "@/hooks/useVendorInviteLinks"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { SuperadminGuard } from "@/components/auth/SuperadminGuard"
import { VendorStatusGuard } from "@/components/auth/VendorStatusGuard"
import { AdminLayout } from "@/components/layout/AdminLayout"
import { SuperadminLayout } from "@/components/layout/SuperadminLayout"
import { VendorLayout } from "@/components/layout/VendorLayout"
import { AuthLayout } from "@/components/layout/AuthLayout"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"
import { INTERNAL_ROLES } from "@/hooks/usePermissions"

// Auth pages
import { LoginForm } from "@/components/auth/LoginForm"
import { SignupTabs } from "@/components/auth/SignupTabs"
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm"
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm"
import { AcceptInviteForm } from "@/components/auth/AcceptInviteForm"
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
import { OrgOnboardingPage } from "@/pages/admin/OrgOnboardingPage"
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
import { GRNDetail } from "@/pages/admin/GRNDetail"
import { InvoiceList } from "@/pages/admin/InvoiceList"
import { InvoiceDetail } from "@/pages/admin/InvoiceDetail"
import { VendorInvoices } from "@/pages/vendor/VendorInvoices"
import { ContractList } from "@/pages/admin/ContractList"
import { ContractDetail } from "@/pages/admin/ContractDetail"

// Superadmin pages
import { SuperadminOrganizations } from "@/pages/superadmin/SuperadminOrganizations"
import { OrgDetailPage } from "@/pages/superadmin/OrgDetailPage"
import { GroupDetailPage } from "@/pages/superadmin/GroupDetailPage"
import { SuperadminUsers } from "@/pages/superadmin/SuperadminUsers"
import { UserDetailPage } from "@/pages/superadmin/UserDetailPage"
import { SuperadminVendorVerification } from "@/pages/superadmin/SuperadminVendorVerification"
import { VendorVerificationDetailPage } from "@/pages/superadmin/VendorVerificationDetailPage"
import { SuperadminAuditLog } from "@/pages/superadmin/SuperadminAuditLog"
import { SuperadminBreakGlass } from "@/pages/superadmin/SuperadminBreakGlass"

// Groups + Team
import { GroupOverview } from "@/pages/admin/GroupOverview"
import { OrgTeam } from "@/pages/admin/OrgTeam"
import { Profile } from "@/pages/admin/Profile"

// Vendor team
import { VendorTeam } from "@/pages/vendor/VendorTeam"

export default function App() {
  // Capture a `?invite=TOKEN` param (from a vendor invite link, see
  // useVendorInviteLinks.ts) into sessionStorage on first load, regardless
  // of which page it lands on -- it needs to survive signup -> login ->
  // /onboarding, and sessionStorage is the only thing that reliably
  // outlives those redirects in the same tab. Strips the param from the
  // visible URL afterward so it doesn't linger in the address bar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get("invite")
    if (invite) {
      try { sessionStorage.setItem(VENDOR_INVITE_TOKEN_KEY, invite) } catch { /* storage unavailable */ }
      params.delete("invite")
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`
      window.history.replaceState(null, "", next)
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
          <ErrorBoundary>
            <Routes>
              {/* Public */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginForm />} />
                <Route path="/signup" element={<SignupTabs />} />
                <Route path="/forgot-password" element={<ForgotPasswordForm />} />
                <Route path="/reset-password" element={<ResetPasswordForm />} />
                <Route path="/accept-invite" element={<AcceptInviteForm />} />
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
                <Route path="invoices/:id" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <InvoiceDetail />
                  </VendorStatusGuard>
                } />
                <Route path="team" element={
                  <VendorStatusGuard allowedStages={["APPROVED"]}>
                    <VendorTeam />
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
                <Route path="grns/:id"    element={<GRNDetail />} />
                <Route path="invoices"    element={<InvoiceList />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="contracts"      element={<ContractList />} />
                <Route path="contracts/:id"  element={<ContractDetail />} />
                <Route path="team"          element={<OrgTeam />} />
                <Route path="profile"       element={<Profile />} />
                <Route path="org-onboarding" element={<OrgOnboardingPage />} />
                <Route path="groups/:groupId" element={<GroupOverview />} />
              </Route>

              {/* Superadmin panel — its own layout/nav, entered via a link from
                  the regular admin header. Guarded once at the root. */}
              <Route path="/admin/superadmin" element={<SuperadminGuard><SuperadminLayout /></SuperadminGuard>}>
                <Route index element={<Navigate to="organizations" replace />} />
                <Route path="organizations" element={<SuperadminOrganizations />} />
                <Route path="organizations/:orgId" element={<OrgDetailPage />} />
                <Route path="groups/:groupId" element={<GroupDetailPage />} />
                <Route path="users" element={<SuperadminUsers />} />
                <Route path="users/:userId" element={<UserDetailPage />} />
                <Route path="vendor-verification" element={<SuperadminVendorVerification />} />
                <Route path="vendor-verification/:vendorId" element={<VendorVerificationDetailPage />} />
                <Route path="audit-log" element={<SuperadminAuditLog />} />
                <Route path="break-glass" element={<SuperadminBreakGlass />} />
              </Route>

              {/* Catch-all */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
