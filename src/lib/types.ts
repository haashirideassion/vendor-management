export type UserRole =
  | "vendor"
  | "hr_user"
  | "manager"
  | "procurement_admin"
  | "finance_ap"
  | "super_admin"
  | "admin" // legacy alias for super_admin

export type InternalRole = Exclude<UserRole, "vendor">

export type ApprovalEntityType = "engagement" | "purchase_order" | "invoice" | "grn"
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled"

export type VendorStatus =
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
  created_at: string
}

export interface ServiceCategory {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface Vendor {
  id: string
  profile_id: string
  vendor_id_code: string | null
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string | null
  tax_gst_number: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_routing_number: string | null
  status: VendorStatus
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

export interface VendorRating {
  id: string
  vendor_id: string
  rated_by: string
  score: number
  comment: string | null
  created_at: string
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
export type ContractStatus = "draft" | "active" | "expired" | "terminated"

export interface Contract {
  id: string
  contract_ref: string | null
  vendor_id: string
  parent_id: string | null                // SOW links to MSA
  contract_type: ContractType
  title: string
  status: ContractStatus
  version: number
  effective_date: string | null
  expiry_date: string | null
  total_value: number | null
  currency: string
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

// ─── Procurement ──────────────────────────────────────────────────────────────

export type EngagementStatus =
  | "draft" | "pending_approval" | "approved" | "rejected" | "cancelled" | "completed"

export type POStatus =
  | "draft" | "issued" | "partially_received" | "fully_received" | "cancelled" | "closed"

export type GRNStatus = "draft" | "submitted" | "verified" | "rejected"

export type InvoiceStatus =
  | "submitted" | "under_review" | "matched" | "approved" | "rejected" | "paid"

export type MatchStatus = "matched" | "variance" | "pending"

export interface Engagement {
  id: string
  title: string
  description: string | null
  vendor_id: string
  category_id: string | null
  estimated_value: number
  currency: string
  start_date: string | null
  end_date: string | null
  status: EngagementStatus
  notes: string | null
  created_by: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
  contract_id: string | null
  // joined
  vendor?: Pick<Vendor, "company_name" | "contact_name">
  category?: Pick<ServiceCategory, "name">
  creator?: Pick<Profile, "full_name" | "email">
  contract?: Pick<Contract, "contract_ref" | "title">
}

export interface PurchaseOrder {
  id: string
  po_number: string | null
  engagement_id: string | null
  vendor_id: string
  total_value: number
  currency: string
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
  // joined
  vendor?: Pick<Vendor, "company_name" | "contact_name">
  engagement?: Pick<Engagement, "title">
  contract?: Pick<Contract, "contract_ref" | "title">
  line_items?: POLineItem[]
}

export interface POLineItem {
  id: string
  po_id: string
  description: string
  quantity: number
  unit_price: number
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
  // joined
  vendor?: Pick<Vendor, "company_name">
  purchase_order?: Pick<PurchaseOrder, "po_number">
  line_items?: GRNLineItem[]
}

export interface GRNLineItem {
  id: string
  grn_id: string
  po_line_item_id: string | null
  description: string
  quantity_received: number
  unit_price: number
  unit: string | null
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
  total_amount: number
  currency: string
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
  // joined
  vendor?: Pick<Vendor, "company_name">
  purchase_order?: Pick<PurchaseOrder, "po_number">
  grn?: Pick<GRN, "grn_number">
  contract?: Pick<Contract, "contract_ref" | "title">
}

// ─── Vendor with joins ────────────────────────────────────────────────────────

export interface VendorWithDetails extends Vendor {
  vendor_categories?: (VendorCategory & { service_categories: ServiceCategory })[]
  vendor_services?: VendorService[]
  vendor_documents?: VendorDocument[]
  vendor_ratings?: VendorRating[]
  avg_rating?: number
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
      engagements: {
        Row: Engagement
        Insert: Omit<Engagement, "id" | "created_at" | "updated_at" | "vendor" | "category" | "creator">
        Update: Partial<Omit<Engagement, "id" | "created_at" | "vendor" | "category" | "creator">>
      }
      purchase_orders: {
        Row: PurchaseOrder
        Insert: Omit<PurchaseOrder, "id" | "po_number" | "created_at" | "updated_at" | "vendor" | "engagement" | "line_items">
        Update: Partial<Omit<PurchaseOrder, "id" | "po_number" | "created_at" | "vendor" | "engagement" | "line_items">>
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
        Insert: Omit<Invoice, "id" | "invoice_ref" | "created_at" | "updated_at" | "vendor" | "purchase_order" | "grn">
        Update: Partial<Omit<Invoice, "id" | "invoice_ref" | "created_at" | "vendor" | "purchase_order" | "grn">>
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
    }
  }
}
