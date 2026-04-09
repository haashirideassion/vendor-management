import type { VendorStatus, DocumentType } from "./types"

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  pending_review: "Pending Review",
  active: "Active",
  action_required: "Action Required",
  suspended: "Suspended",
  rejected: "Rejected",
}

export const VENDOR_STATUS_COLORS: Record<VendorStatus, string> = {
  pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  action_required: "bg-orange-100 text-orange-800 border-orange-200",
  suspended: "bg-red-100 text-red-800 border-red-200",
  rejected: "bg-gray-100 text-gray-800 border-gray-200",
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tc_agreement: "T&C Agreement",
  insurance_coi: "Insurance Certificate (COI)",
  bank_letter: "Bank Letter",
  tax_certificate: "Tax Certificate",
  other: "Other Document",
}

export const REQUIRED_DOCUMENTS: DocumentType[] = ["tc_agreement", "insurance_coi"]

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  "tc_agreement",
  "insurance_coi",
  "bank_letter",
  "tax_certificate",
  "other",
]

export const VENDOR_STATUSES: VendorStatus[] = [
  "pending_review",
  "active",
  "action_required",
  "suspended",
  "rejected",
]
