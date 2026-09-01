export type UserRole =
  | "vendor"
  | "hr_user"
  | "manager"
  | "procurement_admin"
  | "finance_ap"
  | "super_admin"
  | "admin" // legacy alias for super_admin

export type InternalRole = Exclude<UserRole, "vendor">

export type ApprovalEntityType = "purchase_request" | "purchase_order" | "invoice" | "grn" | "contract" | "category" | "service_confirmation"
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled"

export type VendorStatus =
  | "invited"
  | "pending_review"
  | "active"
  | "action_required"
  | "suspended"
  | "rejected"

export type DocumentType =
  | "tc_agreement"
  | "insurance_coi"
  | "bank_letter"
  | "tax_certificate"
  | "other"

// ─── Database Row Types ────────────────────────────────────────────────────────

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string
  mobile: string | null
  created_at: string
}

export type FulfillmentType = "goods" | "service"

export interface ServiceCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  status: "pending_approval" | "active"
  fulfillment_type: FulfillmentType
  created_at: string
  created_by: string | null
}

export type VendorVerificationStatus = "pending" | "verified" | "rejected"

export interface Vendor {
  id: string
  profile_id: string
  vendor_id_code: string | null
  company_name: string
  legal_name: string | null
  contact_name: string
  contact_email: string
  contact_phone: string | null
  tax_gst_number: string | null
  pan_number: string | null
  registration_number: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_routing_number: string | null
  status: VendorStatus
  verification_status: VendorVerificationStatus
  onboarded_via_group_id: string | null
  is_solo_user: boolean
  org_group_code: string | null
  contract_start_date: string | null
  contract_anniversary: string | null
  renewal_notified_at: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
}

export interface VendorCategory {
  id: string
  vendor_id: string
  category_id: string
  assigned_at: string
  service_categories?: ServiceCategory
}

export interface VendorService {
  id: string
  vendor_id: string
  name: string
  description: string | null
  created_at: string
}

export interface VendorDocument {
  id: string
  vendor_id: string
  document_type: DocumentType
  file_name: string
  storage_path: string
  uploaded_at: string
  expires_at: string | null
  verified: boolean
  verified_by: string | null
  verified_at: string | null
  notes: string | null
}

export type RatingDimension = "quality" | "timeliness" | "communication" | "cost_competitiveness" | "compliance"

export interface VendorRating {
  id: string
  vendor_id: string
  rated_by: string
  quality: number
  timeliness: number
  communication: number
  cost_competitiveness: number
  compliance: number
  overall: number
  comment: string | null
  created_at: string
  updated_at: string
  profiles?: Pick<Profile, "full_name" | "email">
}

export interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  performed_by: string | null
  created_at: string
  profiles?: Pick<Profile, "full_name" | "email">
}

// ─── Approval Workflow ────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string
  entity_type: ApprovalEntityType
  entity_id: string
  requested_by: string
  status: ApprovalStatus
  reviewed_by: string | null
  reviewed_at: string | null
  amount: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // joined fields
  requester?: Pick<Profile, "full_name" | "email">
  reviewer?: Pick<Profile, "full_name" | "email">
}

// ─── Contracts ────────────────────────────────────────────────────────────────

export type ContractType   = "msa" | "sow" | "nda" | "other"
export type ContractStatus = "pending_approval" | "draft" | "internal_review" | "pending_final_approval" | "active" | "expired" | "terminated"
export type ContractRiskTier = "low" | "medium" | "high"

export interface Contract {
  id: string
  contract_ref: string | null
  vendor_id: string
  parent_id: string | null                // SOW links to MSA
  contract_type: ContractType
  title: string
  status: ContractStatus
  risk_tier: ContractRiskTier | null
  version: number
  effective_date: string | null
  expiry_date: string | null
  total_value: number | null
  currency: string
  exchange_rate_to_base: number | null
  amount_in_base_currency: number | null
  auto_renew: boolean
  renewal_notice_days: number
  signed_by_vendor: boolean
  signed_by_internal: boolean
  signed_at: string | null
  storage_path: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  // joined
  vendor?: Pick<Vendor, "company_name" | "contact_name">
  parent?: Pick<Contract, "contract_ref" | "title">
  amendments?: ContractAmendment[]
}

export interface ContractAmendment {
  id: string
  contract_id: string
  amendment_number: number
  title: string
  description: string | null
  effective_date: string | null
  storage_path: string | null
  created_by: string
  created_at: string
}

// ─── Contract Internal Review (CLM Phase 1) ────────────────────────────────────

export type ContractReviewerRole = "business_user" | "legal" | "finance" | "compliance" | "vp_cfo"
export type ContractReviewStatus = "pending" | "approved" | "changes_requested"

export interface ContractReviewer {
  id: string
  contract_id: string
  round: number
  reviewer_role: ContractReviewerRole
  status: ContractReviewStatus
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  reviewer?: Pick<Profile, "full_name" | "email">
}

// ─── Contract Negotiation & Redlining (CLM Phase 2) ────────────────────────────

export type ContractClauseCategory = "liability" | "indemnity" | "termination" | "ip" | "other"
export type ContractClauseStatus = "under_negotiation" | "agreed"
export type ContractClauseAuthorSide = "internal" | "vendor"

export interface ContractClauseVersion {
  id: string
  clause_id: string
  version: number
  is_current: boolean
  content: string
  change_summary: string | null
  author_side: ContractClauseAuthorSide
  authored_by: string
  created_at: string
  author?: Pick<Profile, "full_name" | "email">
}

export interface ContractClause {
  id: string
  contract_id: string
  title: string
  category: ContractClauseCategory
  status: ContractClauseStatus
  vendor_agreed: boolean
  internal_agreed: boolean
  created_by: string
  created_at: string
  updated_at: string
  // joined — always exactly one element, PostgREST returns embeds as arrays
  current_version?: ContractClauseVersion[]
}

// ─── Contract Final Approval matrix (CLM Phase 3) ──────────────────────────────

export type ContractApprovalRole = "legal" | "finance" | "vp_cfo"
export type ContractApprovalStatus = "pending" | "approved" | "rejected"

export interface ContractApproval {
  id: string
  contract_id: string
  round: number
  approver_role: ContractApprovalRole
  status: ContractApprovalStatus
  notes: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  approver?: Pick<Profile, "full_name" | "email">
}

export interface ContractApprovalThresholds {
  medium_threshold: number
  high_threshold: number
}

// ─── Contract Renewal Tracking (CLM Phase 4) ───────────────────────────────────

export type ContractRenewalDecisionType = "renew" | "amend" | "terminate"

export interface ContractRenewalDecision {
  id: string
  contract_id: string
  cycle_expiry_date: string
  decision: ContractRenewalDecisionType | null
  amendment_scope: string | null
  termination_notice_date: string | null
  decided_by: string | null
  decided_at: string | null
  escalated_at: string | null
  created_at: string
  decided_by_profile?: Pick<Profile, "full_name" | "email">
}

export interface ContractRenewalReminder {
  id: string
  contract_id: string
  expiry_date: string
  days_before: 90 | 60 | 30
  sent_at: string
}

// ─── Procurement ──────────────────────────────────────────────────────────────

export type RFQStatus = "pending" | "viewed" | "responded" | "closed"
export type QuotationStatus = "draft" | "pending_manager_review" | "submitted" | "accepted" | "rejected"

export type PurchaseRequestStatus =
  | "draft" | "pending_approval" | "approved" | "in_review" | "quotations_received" | "rejected" | "cancelled" | "completed"

export type POStatus =
  | "draft" | "issued" | "partially_received" | "fully_received" | "cancelled" | "closed"

export type GRNStatus = "pending_approval" | "draft" | "submitted" | "verified" | "rejected"

export type InvoiceStatus =
  | "submitted" | "under_review" | "matched" | "approved" | "rejected" | "paid" | "partially_paid"

export type MatchStatus = "matched" | "variance" | "pending"

export interface PurchaseRequestLineItem {
  id: string
  purchase_request_id: string
  description: string
  quantity: number
  unit_price: number | null
  unit: string | null
  created_at: string
}

export interface PurchaseRequestVendor {
  id: string
  purchase_request_id: string
  vendor_id: string
  created_at: string
  vendor?: Pick<Vendor, "company_name">
}

export interface RFQ {
  id: string
  rfq_number: string | null
  purchase_request_id: string
  vendor_id: string
  status: RFQStatus
  created_at: string
  updated_at: string
  response_deadline: string | null
  team_id: string | null
  purchase_request?: Pick<PurchaseRequest, "title" | "description" | "start_date" | "end_date" | "estimated_value" | "currency"> & {
    line_items?: PurchaseRequestLineItem[]
  }
  vendor?: Pick<Vendor, "company_name">
  team?: { name: string }
}

// Manual, named tax breakdown for a line item (e.g. CGST 9% + SGST 9%
// instead of one flat 18%) -- optional; tax_rate is always the sum of a line
// item's components when any are present, or its own flat value otherwise.
export interface TaxComponent {
  id: string
  name: string
  rate: number
}
export interface TaxComponentInput {
  name: string
  rate: number
}

export type QuotationLineItemAvailability = "available" | "partially_available" | "not_available"

export interface QuotationLineItem {
  id: string
  quotation_id: string
  description: string
  availability_status: QuotationLineItemAvailability
  quantity: number | null
  unit_price: number | null
  tax_rate: number | null
  tax_components?: TaxComponent[]
  total: number
  remarks: string | null
  created_at: string
  purchase_request_line_item_id: string | null
}

export interface Quotation {
  id: string
  quot_number: string | null
  rfq_id: string
  purchase_request_id: string
  vendor_id: string
  status: QuotationStatus
  version: number
  is_current: boolean
  notes: string | null
  total_amount: number | null
  submitted_at: string | null
  manager_review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  vendor?: Pick<Vendor, "company_name">
  line_items?: QuotationLineItem[]
}

export interface PurchaseRequest {
  id: string
  title: string
  description: string | null
  vendor_id: string | null
  category_id: string | null
  estimated_value: number | null
  currency: string
  exchange_rate_to_base: number | null
  amount_in_base_currency: number | null
  start_date: string | null
  end_date: string | null
  status: PurchaseRequestStatus
  notes: string | null
  created_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  contract_id: string | null
  team_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name" | "contact_name">
  category?: Pick<ServiceCategory, "name">
  creator?: Pick<Profile, "full_name" | "email">
  contract?: Pick<Contract, "contract_ref" | "title">
  team?: { name: string }
  line_items?: PurchaseRequestLineItem[]
  purchase_request_vendors?: { vendor: { id: string; company_name: string } | null }[]
}

export type POType = "standard" | "blanket" | "release"

export interface PurchaseOrder {
  id: string
  po_number: string | null
  purchase_request_id: string | null
  vendor_id: string
  total_value: number
  currency: string
  exchange_rate_to_base: number | null
  amount_in_base_currency: number | null
  status: POStatus
  issue_date: string | null
  expected_delivery_date: string | null
  delivery_address: string | null
  payment_terms: string | null
  contract_id: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
  fulfillment_type: FulfillmentType
  po_type: POType
  parent_po_id: string | null
  valid_from: string | null
  valid_until: string | null
  team_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name" | "contact_name">
  purchase_request?: Pick<PurchaseRequest, "title">
  contract?: Pick<Contract, "contract_ref" | "title">
  parent_po?: Pick<PurchaseOrder, "po_number" | "total_value">
  team?: { name: string }
  line_items?: POLineItem[]
}

export interface POLineItem {
  id: string
  po_id: string
  description: string
  quantity: number
  unit_price: number
  tax_rate: number
  tax_components?: TaxComponent[]
  unit: string | null
  created_at: string
}

export interface GRN {
  id: string
  grn_number: string | null
  po_id: string
  vendor_id: string
  received_date: string
  status: GRNStatus
  notes: string | null
  created_by: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
  team_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name">
  purchase_order?: Pick<PurchaseOrder, "po_number">
  team?: { name: string }
  line_items?: GRNLineItem[]
}

export interface GRNLineItem {
  id: string
  grn_id: string
  po_line_item_id: string | null
  description: string
  quantity_received: number
  unit_price: number
  tax_rate: number
  tax_components?: TaxComponent[]
  unit: string | null
  rejected_quantity: number | null
  rejection_reason: string | null
  created_at: string
}

// Services-equivalent of a GRN -- see backend/migrations/072_service_confirmations.sql
export type ServiceConfirmationStatus = "pending_approval" | "draft" | "submitted" | "verified" | "rejected"

export interface ServiceConfirmation {
  id: string
  confirmation_number: string | null
  po_id: string
  vendor_id: string
  confirmed_date: string
  status: ServiceConfirmationStatus
  notes: string | null
  created_by: string
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
  team_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name">
  purchase_order?: Pick<PurchaseOrder, "po_number">
  team?: { name: string }
  line_items?: ServiceConfirmationLineItem[]
}

export interface ServiceConfirmationLineItem {
  id: string
  service_confirmation_id: string
  po_line_item_id: string | null
  description: string
  quantity_confirmed: number
  unit_price: number
  tax_rate: number
  tax_components?: TaxComponent[]
  unit: string | null
  rejected_quantity: number | null
  rejection_reason: string | null
  created_at: string
}

export interface Invoice {
  id: string
  invoice_ref: string | null
  vendor_invoice_number: string
  vendor_id: string
  po_id: string | null
  grn_id: string | null
  contract_id: string | null
  purchase_request_id: string | null
  total_amount: number
  currency: string
  exchange_rate_to_base: number | null
  amount_in_base_currency: number | null
  invoice_date: string
  due_date: string | null
  status: InvoiceStatus
  match_status: MatchStatus | null
  match_variance: number | null
  storage_path: string | null
  notes: string | null
  submitted_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  team_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name">
  purchase_order?: Pick<PurchaseOrder, "po_number">
  grn?: Pick<GRN, "grn_number">
  // Every GRN raised against this invoice's PO (not just the single grn_id
  // picked at submission) -- a PO can have several GRNs for partial
  // deliveries.
  grns?: { id: string; grn_number: string | null }[]
  contract?: Pick<Contract, "contract_ref" | "title">
  purchase_request?: Pick<PurchaseRequest, "title">
  team?: { name: string }
}

// ─── Payments ────────────────────────────────────────────────────────────────

export type PaymentMethod = "bank_transfer" | "cheque" | "cash" | "card" | "upi" | "other"

export interface InvoicePayment {
  id: string
  invoice_id: string
  org_id: string
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  paid_date: string
  notes: string | null
  recorded_by: string
  created_at: string
}

// ─── 3-way match tolerance + Exceptions ─────────────────────────────────────

export type MatchToleranceType = "amount" | "percentage"

export interface MatchToleranceSettings {
  tolerance_type: MatchToleranceType
  tolerance_value: number
}

export type InvoiceExceptionStatus = "open" | "resolved" | "waived"

export interface InvoiceException {
  id: string
  invoice_id: string
  org_id: string
  po_id: string | null
  expected_amount: number
  invoiced_amount: number
  variance: number
  variance_pct: number | null
  tolerance_type: MatchToleranceType | null
  tolerance_value: number | null
  status: InvoiceExceptionStatus
  resolution_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // joined
  invoice?: Pick<Invoice, "invoice_ref" | "vendor_invoice_number" | "status"> & { vendor?: Pick<Vendor, "company_name"> }
  purchase_order?: Pick<PurchaseOrder, "po_number">
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export type AttachmentEntityType = "purchase_request" | "purchase_order" | "grn" | "contract" | "invoice" | "service_confirmation"

export interface Attachment {
  id: string
  entity_type: AttachmentEntityType
  entity_id: string
  file_name: string
  original_name: string
  file_extension: string
  mime_type: string
  file_size: number
  storage_path: string
  uploaded_by: string
  created_at: string
  is_deleted: boolean
}

// ─── Vendor with joins ────────────────────────────────────────────────────────

export interface VendorWithDetails extends Vendor {
  vendor_categories?: (VendorCategory & { service_categories: ServiceCategory })[]
  vendor_services?: VendorService[]
  vendor_documents?: VendorDocument[]
  vendor_ratings?: VendorRating[]
  avg_rating?: number
  /** Only present on /api/vendors/get (admin-facing) — whether any vendor_users row exists yet. */
  hasPortalUsers?: boolean
}

// ─── Organisation Onboarding ──────────────────────────────────────────────────

export type OrgOnboardingStatus = "draft" | "submitted" | "approved" | "rejected"
export type LegalEntityType = "pvt_ltd" | "llp" | "proprietorship" | "partnership"
export type EmployeeCountRange = "1-10" | "11-50" | "51-200" | "201-500" | "500+"
export type LocationSetup = "single" | "multiple"
export type NatureOfOperations = "office" | "factory" | "warehouse" | "retail"

export type OrgOnboardingDocumentType =
  | "certificate_of_incorporation"
  | "pan_copy"
  | "memorandum_of_association"
  | "articles_of_association"
  | "board_resolution"
  | "bank_proof"
  | "gst_certificate"
  | "authorized_signatory_signature"

export interface OrgOnboardingLocation {
  id: string
  draft_id: string
  org_id: string
  location_name: string
  address: string | null
  state: string | null
  city: string | null
  pincode: string | null
  employee_count: number | null
  nature_of_operations: NatureOfOperations | null
  is_registered_office: boolean
  has_women_employees: boolean | null
  has_contract_labour: boolean | null
  has_shift_operations: boolean | null
  created_at: string
  updated_at: string
}

export interface OrgOnboardingDocument {
  id: string
  draft_id: string
  org_id: string
  document_type: OrgOnboardingDocumentType
  file_name: string
  storage_path: string
  uploaded_by: string | null
  uploaded_at: string
}

export interface OrgOnboardingDraft {
  id: string
  org_id: string
  created_by: string
  status: OrgOnboardingStatus
  current_step: number
  // Step 1
  full_name: string | null
  designation: string | null
  work_email: string | null
  mobile: string | null
  accepted_terms: boolean
  is_solo_user: boolean
  // Step 2
  legal_entity_type: LegalEntityType | null
  date_of_incorporation: string | null
  employee_count_range: EmployeeCountRange | null
  is_group_company: boolean
  group_code: string | null
  // Step 3
  location_setup: LocationSetup | null
  // Step 5 (non-file fields)
  pan_number: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  // Step 6
  signatory_name: string | null
  signatory_designation: string | null
  signatory_email: string | null
  signatory_mobile: string | null
  signatory_same_for_all_locations: boolean
  // Review lifecycle
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
  // present on /get and the superadmin detail endpoint, not on every write response
  company_name?: string | null
  locations?: OrgOnboardingLocation[]
  documents?: OrgOnboardingDocument[]
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | "new_vendor" | "new_invoice" | "new_quotation"
  | "grn_pending_approval" | "purchase_request_pending_approval" | "contract_pending_approval" | "category_pending_approval"
  | "grn_decision" | "purchase_request_decision" | "contract_decision" | "category_decision"
  | "invoice_status_update"
  | "invoice_match_exception"
  | "rfq_raised" | "rfq_invited"

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string | null
  module_reference_id: string | null
  is_read: boolean
  created_at: string
}

// ─── Supabase Database Type Map ───────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, "created_at">
        Update: Partial<Omit<Profile, "id">>
      }
      service_categories: {
        Row: ServiceCategory
        Insert: Omit<ServiceCategory, "id" | "created_at">
        Update: Partial<Omit<ServiceCategory, "id" | "created_at">>
      }
      vendors: {
        Row: Vendor
        Insert: Omit<Vendor, "id" | "created_at" | "updated_at" | "vendor_id_code">
        Update: Partial<Omit<Vendor, "id" | "created_at">>
      }
      vendor_categories: {
        Row: VendorCategory
        Insert: Omit<VendorCategory, "id" | "assigned_at">
        Update: Partial<VendorCategory>
      }
      vendor_services: {
        Row: VendorService
        Insert: Omit<VendorService, "id" | "created_at">
        Update: Partial<Omit<VendorService, "id" | "created_at">>
      }
      vendor_documents: {
        Row: VendorDocument
        Insert: Omit<VendorDocument, "id" | "uploaded_at">
        Update: Partial<Omit<VendorDocument, "id">>
      }
      vendor_ratings: {
        Row: VendorRating
        Insert: Omit<VendorRating, "id" | "created_at">
        Update: Partial<Omit<VendorRating, "id" | "created_at">>
      }
      audit_log: {
        Row: AuditLog
        Insert: Omit<AuditLog, "id" | "created_at">
        Update: never
      }
      approval_requests: {
        Row: ApprovalRequest
        Insert: Omit<ApprovalRequest, "id" | "created_at" | "updated_at" | "requester" | "reviewer">
        Update: Partial<Pick<ApprovalRequest, "status" | "reviewed_by" | "reviewed_at" | "notes">>
      }
      purchase_requests: {
        Row: PurchaseRequest
        Insert: Omit<PurchaseRequest, "id" | "created_at" | "updated_at" | "vendor" | "category" | "creator" | "line_items">
        Update: Partial<Omit<PurchaseRequest, "id" | "created_at" | "vendor" | "category" | "creator" | "line_items">>
      }
      purchase_request_line_items: {
        Row: PurchaseRequestLineItem
        Insert: Omit<PurchaseRequestLineItem, "id" | "created_at">
        Update: Partial<Omit<PurchaseRequestLineItem, "id" | "created_at">>
      }
      purchase_request_vendors: {
        Row: PurchaseRequestVendor
        Insert: Omit<PurchaseRequestVendor, "id" | "created_at" | "vendor">
        Update: never
      }
      rfqs: {
        Row: RFQ
        Insert: Omit<RFQ, "id" | "rfq_number" | "created_at" | "updated_at" | "purchase_request" | "vendor">
        Update: Partial<Pick<RFQ, "status">>
      }
      quotations: {
        Row: Quotation
        Insert: Omit<Quotation, "id" | "quot_number" | "created_at" | "updated_at" | "vendor" | "line_items">
        Update: Partial<Omit<Quotation, "id" | "quot_number" | "created_at" | "vendor" | "line_items">>
      }
      quotation_line_items: {
        Row: QuotationLineItem
        Insert: Omit<QuotationLineItem, "id" | "total" | "created_at">
        Update: Partial<Omit<QuotationLineItem, "id" | "total" | "created_at">>
      }
      purchase_orders: {
        Row: PurchaseOrder
        Insert: Omit<PurchaseOrder, "id" | "po_number" | "created_at" | "updated_at" | "vendor" | "purchase_request" | "line_items">
        Update: Partial<Omit<PurchaseOrder, "id" | "po_number" | "created_at" | "vendor" | "purchase_request" | "line_items">>
      }
      po_line_items: {
        Row: POLineItem
        Insert: Omit<POLineItem, "id" | "created_at">
        Update: Partial<Omit<POLineItem, "id" | "created_at">>
      }
      grns: {
        Row: GRN
        Insert: Omit<GRN, "id" | "grn_number" | "created_at" | "updated_at" | "vendor" | "purchase_order" | "line_items">
        Update: Partial<Omit<GRN, "id" | "grn_number" | "created_at" | "vendor" | "purchase_order" | "line_items">>
      }
      grn_line_items: {
        Row: GRNLineItem
        Insert: Omit<GRNLineItem, "id" | "created_at">
        Update: Partial<Omit<GRNLineItem, "id" | "created_at">>
      }
      invoices: {
        Row: Invoice
        Insert: Omit<Invoice, "id" | "invoice_ref" | "created_at" | "updated_at" | "vendor" | "purchase_order" | "grn" | "purchase_request">
        Update: Partial<Omit<Invoice, "id" | "invoice_ref" | "created_at" | "vendor" | "purchase_order" | "grn" | "purchase_request">>
      }
      contracts: {
        Row: Contract
        Insert: Omit<Contract, "id" | "contract_ref" | "created_at" | "updated_at" | "vendor" | "parent" | "amendments">
        Update: Partial<Omit<Contract, "id" | "contract_ref" | "created_at" | "vendor" | "parent" | "amendments">>
      }
      contract_amendments: {
        Row: ContractAmendment
        Insert: Omit<ContractAmendment, "id" | "created_at">
        Update: Partial<Omit<ContractAmendment, "id" | "created_at">>
      }
      attachments: {
        Row: Attachment
        Insert: Omit<Attachment, "id" | "created_at">
        Update: Partial<Pick<Attachment, "is_deleted">>
      }
    }
  }
}
