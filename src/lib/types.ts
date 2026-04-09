export type UserRole = "admin" | "vendor"

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
    }
  }
}
