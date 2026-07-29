import type { VendorStatus, VendorVerificationStatus, DocumentType } from "./types"

export const VENDOR_STATUS_LABELS: Record<VendorStatus, string> = {
  invited: "Invited",
  pending_review: "Pending Review",
  active: "Active",
  action_required: "Action Required",
  suspended: "Suspended",
  rejected: "Rejected",
}

export const VENDOR_STATUS_COLORS: Record<VendorStatus, string> = {
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  action_required: "bg-orange-100 text-orange-800 border-orange-200",
  suspended: "bg-red-100 text-red-800 border-red-200",
  rejected: "bg-gray-100 text-gray-800 border-gray-200",
}

export const VENDOR_VERIFICATION_STATUS_LABELS: Record<VendorVerificationStatus, string> = {
  pending: "Pending Verification",
  verified: "Verified",
  rejected: "Verification Rejected",
}

export const VENDOR_VERIFICATION_STATUS_COLORS: Record<VendorVerificationStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  verified: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
}

// An org's single displayed status, folding its lifecycle status
// (organizations.status) together with its onboarding draft's state.
// Computed backend-side (superadmin.ts's computeEffectiveOrgStatus) and
// returned as `effectiveStatus` on every org row -- these are just the
// matching display labels/colors, kept in lockstep with that mapping.
export type EffectiveOrgStatus = "onboarding_pending" | "pending_verification" | "active" | "suspended" | "archived"

export const EFFECTIVE_ORG_STATUS_LABELS: Record<EffectiveOrgStatus, string> = {
  onboarding_pending: "Onboarding Pending",
  pending_verification: "Pending Verification",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
}

export const EFFECTIVE_ORG_STATUS_COLORS: Record<EffectiveOrgStatus, string> = {
  onboarding_pending: "bg-blue-100 text-blue-800 border-blue-200",
  pending_verification: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  suspended: "bg-red-100 text-red-800 border-red-200",
  archived: "bg-gray-100 text-gray-800 border-gray-200",
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  tc_agreement: "T&C Agreement",
  insurance_coi: "Insurance Certificate (COI)",
  bank_letter: "Bank Letter",
  tax_certificate: "Tax Certificate",
  other: "Other Document",
}

export const REQUIRED_DOCUMENTS: DocumentType[] = ["tc_agreement"]

export const ALL_DOCUMENT_TYPES: DocumentType[] = [
  "tc_agreement",
  "insurance_coi",
  "bank_letter",
  "tax_certificate",
  "other",
]

export const VENDOR_STATUSES: VendorStatus[] = [
  "invited",
  "pending_review",
  "active",
  "action_required",
  "suspended",
  "rejected",
]

// ─── Procurement status labels & colors ───────────────────────────────────────

import type { EngagementStatus, POStatus, GRNStatus, InvoiceStatus, MatchStatus, RFQStatus, QuotationStatus } from "./types"

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  draft:                "Draft",
  pending_approval:     "Pending Approval",
  approved:             "Approved",
  in_review:            "In Review",
  quotations_received:  "Quotations Received",
  rejected:             "Rejected",
  cancelled:            "Cancelled",
  completed:            "Completed",
}

export const ENGAGEMENT_STATUS_COLORS: Record<EngagementStatus, string> = {
  draft:               "bg-gray-100 text-gray-700 border-gray-200",
  pending_approval:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved:            "bg-blue-100 text-blue-800 border-blue-200",
  in_review:           "bg-purple-100 text-purple-800 border-purple-200",
  quotations_received: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected:            "bg-red-100 text-red-800 border-red-200",
  cancelled:           "bg-gray-100 text-gray-400 border-gray-200",
  completed:           "bg-green-100 text-green-800 border-green-200",
}

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft:              "Draft",
  issued:             "Issued",
  partially_received: "Partially Received",
  fully_received:     "Fully Received",
  cancelled:          "Cancelled",
  closed:             "Closed",
}

export const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft:              "bg-gray-100 text-gray-700 border-gray-200",
  issued:             "bg-blue-100 text-blue-800 border-blue-200",
  partially_received: "bg-yellow-100 text-yellow-800 border-yellow-200",
  fully_received:     "bg-green-100 text-green-800 border-green-200",
  cancelled:          "bg-red-100 text-red-700 border-red-200",
  closed:             "bg-gray-100 text-gray-500 border-gray-200",
}

export const GRN_STATUS_LABELS: Record<GRNStatus, string> = {
  pending_approval: "Pending Approval",
  draft:     "Draft",
  submitted: "Submitted",
  verified:  "Verified",
  rejected:  "Rejected",
}

export const GRN_STATUS_COLORS: Record<GRNStatus, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  draft:     "bg-gray-100 text-gray-700 border-gray-200",
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  verified:  "bg-green-100 text-green-800 border-green-200",
  rejected:  "bg-red-100 text-red-700 border-red-200",
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  submitted:    "Submitted",
  under_review: "Under Review",
  matched:      "Matched",
  approved:     "Approved",
  rejected:     "Rejected",
  paid:         "Paid",
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  submitted:    "bg-gray-100 text-gray-700 border-gray-200",
  under_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  matched:      "bg-blue-100 text-blue-800 border-blue-200",
  approved:     "bg-green-100 text-green-800 border-green-200",
  rejected:     "bg-red-100 text-red-700 border-red-200",
  paid:         "bg-purple-100 text-purple-800 border-purple-200",
}

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  matched:  "Matched",
  variance: "Variance",
  pending:  "Pending",
}

export const MATCH_STATUS_COLORS: Record<MatchStatus, string> = {
  matched:  "bg-green-100 text-green-800 border-green-200",
  variance: "bg-orange-100 text-orange-800 border-orange-200",
  pending:  "bg-gray-100 text-gray-600 border-gray-200",
}

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const

export const RFQ_STATUS_LABELS: Record<RFQStatus, string> = {
  pending:   "Pending",
  viewed:    "Viewed",
  responded: "Responded",
  closed:    "Closed",
}

export const RFQ_STATUS_COLORS: Record<RFQStatus, string> = {
  pending:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  viewed:    "bg-blue-100 text-blue-800 border-blue-200",
  responded: "bg-green-100 text-green-800 border-green-200",
  closed:    "bg-gray-100 text-gray-500 border-gray-200",
}

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft:                   "Draft",
  pending_manager_review:  "Pending Manager Review",
  submitted:               "Submitted",
  accepted:                "Accepted",
  rejected:                "Rejected",
}

export const QUOTATION_STATUS_COLORS: Record<QuotationStatus, string> = {
  draft:                  "bg-gray-100 text-gray-700 border-gray-200",
  pending_manager_review: "bg-blue-100 text-blue-800 border-blue-200",
  submitted:              "bg-yellow-100 text-yellow-800 border-yellow-200",
  accepted:               "bg-green-100 text-green-800 border-green-200",
  rejected:               "bg-red-100 text-red-700 border-red-200",
}

// ─── Contract labels & colors ─────────────────────────────────────────────────

import type { ContractType, ContractStatus } from "./types"

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  msa:   "Master Service Agreement",
  sow:   "Statement of Work",
  nda:   "Non-Disclosure Agreement",
  other: "Other",
}

export const CONTRACT_TYPE_SHORT: Record<ContractType, string> = {
  msa:   "MSA",
  sow:   "SOW",
  nda:   "NDA",
  other: "Other",
}

export const CONTRACT_TYPE_COLORS: Record<ContractType, string> = {
  msa:   "bg-blue-100 text-blue-800 border-blue-200",
  sow:   "bg-violet-100 text-violet-800 border-violet-200",
  nda:   "bg-slate-100 text-slate-700 border-slate-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  pending_approval: "Pending Approval",
  draft:      "Draft",
  active:     "Active",
  expired:    "Expired",
  terminated: "Terminated",
}

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  draft:      "bg-gray-100 text-gray-700 border-gray-200",
  active:     "bg-green-100 text-green-800 border-green-200",
  expired:    "bg-orange-100 text-orange-700 border-orange-200",
  terminated: "bg-red-100 text-red-700 border-red-200",
}

export const CONTRACT_TYPES: ContractType[]   = ["msa", "sow", "nda", "other"]
export const CONTRACT_STATUSES: ContractStatus[] = ["pending_approval", "draft", "active", "expired", "terminated"]

// ─── Organisation onboarding labels & constants ───────────────────────────────

import type {
  LegalEntityType, EmployeeCountRange, NatureOfOperations, OrgOnboardingDocumentType, OrgOnboardingStatus,
} from "./types"

export const LEGAL_ENTITY_TYPE_LABELS: Record<LegalEntityType, string> = {
  pvt_ltd: "Private Limited",
  llp: "Limited Liability Partnership (LLP)",
  proprietorship: "Proprietorship",
  partnership: "Partnership",
}

export const LEGAL_ENTITY_TYPES: LegalEntityType[] = ["pvt_ltd", "llp", "proprietorship", "partnership"]

export const EMPLOYEE_COUNT_RANGES: EmployeeCountRange[] = ["1-10", "11-50", "51-200", "201-500", "500+"]

export const NATURE_OF_OPERATIONS_LABELS: Record<NatureOfOperations, string> = {
  office: "Office",
  factory: "Factory",
  warehouse: "Warehouse",
  retail: "Retail",
}

export const NATURE_OF_OPERATIONS: NatureOfOperations[] = ["office", "factory", "warehouse", "retail"]

export const ORG_ONBOARDING_DOCUMENT_LABELS: Record<OrgOnboardingDocumentType, string> = {
  certificate_of_incorporation: "Certificate of Incorporation",
  pan_copy: "PAN Copy",
  memorandum_of_association: "Memorandum of Association (MOA)",
  articles_of_association: "Articles of Association (AOA)",
  board_resolution: "Board Resolution",
  bank_proof: "Bank Account Proof",
  gst_certificate: "GST Registration Certificate",
  authorized_signatory_signature: "Authorized Signatory Signature",
}

export const REQUIRED_ORG_ONBOARDING_DOCUMENTS: OrgOnboardingDocumentType[] = [
  "certificate_of_incorporation", "pan_copy", "memorandum_of_association",
  "articles_of_association", "board_resolution", "bank_proof",
]

export const OPTIONAL_ORG_ONBOARDING_DOCUMENTS: OrgOnboardingDocumentType[] = ["gst_certificate"]

export const ORG_ONBOARDING_STATUS_LABELS: Record<OrgOnboardingStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
}

export const ORG_ONBOARDING_STATUS_COLORS: Record<OrgOnboardingStatus, string> = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  submitted: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
}
