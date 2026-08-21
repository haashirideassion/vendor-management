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

import type { PurchaseRequestStatus, POStatus, POType, GRNStatus, ServiceConfirmationStatus, InvoiceStatus, MatchStatus, RFQStatus, QuotationStatus, PaymentMethod, RatingDimension } from "./types"

export const PURCHASE_REQUEST_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  draft:                "Draft",
  pending_approval:     "Pending Approval",
  approved:             "Approved",
  in_review:            "In Review",
  quotations_received:  "Quotations Received",
  rejected:             "Rejected",
  cancelled:            "Cancelled",
  completed:            "Completed",
}

export const PURCHASE_REQUEST_STATUS_COLORS: Record<PurchaseRequestStatus, string> = {
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

export const PO_TYPE_LABELS: Record<POType, string> = {
  standard: "Standard",
  blanket:  "Blanket PO",
  release:  "Release Order",
}

export const PO_TYPE_COLORS: Record<POType, string> = {
  standard: "bg-gray-100 text-gray-700 border-gray-200",
  blanket:  "bg-purple-100 text-purple-800 border-purple-200",
  release:  "bg-blue-100 text-blue-800 border-blue-200",
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

export const SERVICE_CONFIRMATION_STATUS_LABELS: Record<ServiceConfirmationStatus, string> = {
  pending_approval: "Pending Approval",
  draft:     "Draft",
  submitted: "Submitted",
  verified:  "Verified",
  rejected:  "Rejected",
}

export const SERVICE_CONFIRMATION_STATUS_COLORS: Record<ServiceConfirmationStatus, string> = {
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
  partially_paid: "Partially Paid",
}

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  submitted:    "bg-gray-100 text-gray-700 border-gray-200",
  under_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  matched:      "bg-blue-100 text-blue-800 border-blue-200",
  approved:     "bg-green-100 text-green-800 border-green-200",
  rejected:     "bg-red-100 text-red-700 border-red-200",
  paid:         "bg-purple-100 text-purple-800 border-purple-200",
  partially_paid: "bg-orange-100 text-orange-800 border-orange-200",
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  other: "Other",
}

export const RATING_DIMENSIONS: RatingDimension[] = [
  "quality", "timeliness", "communication", "cost_competitiveness", "compliance",
]

export const RATING_DIMENSION_LABELS: Record<RatingDimension, string> = {
  quality: "Quality",
  timeliness: "Timeliness",
  communication: "Communication",
  cost_competitiveness: "Cost Competitiveness",
  compliance: "Compliance",
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

// Currencies selectable anywhere a transaction picks its own currency
// (purchase request/PO/contract/invoice). Conversion to an org's base currency
// (migration 077) is handled server-side via a live FX rate lookup --
// this list just needs to cover what an org might actually transact in.
export const CURRENCIES = [
  { code: "INR", label: "INR — Indian Rupee" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "JPY", label: "JPY — Japanese Yen" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "AED", label: "AED — UAE Dirham" },
  { code: "CNY", label: "CNY — Chinese Yuan" },
] as const

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

import type { ContractType, ContractStatus, ContractRiskTier, ContractReviewerRole, ContractReviewStatus, ContractClauseCategory, ContractClauseStatus, ContractApprovalRole, ContractApprovalStatus } from "./types"

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
  pending_approval:       "Pending Approval",
  draft:                  "Draft",
  internal_review:        "Internal Review",
  pending_final_approval: "Pending Final Approval",
  active:                 "Active",
  expired:                "Expired",
  terminated:             "Terminated",
}

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  pending_approval:       "bg-yellow-100 text-yellow-800 border-yellow-200",
  draft:                  "bg-gray-100 text-gray-700 border-gray-200",
  internal_review:        "bg-blue-100 text-blue-800 border-blue-200",
  pending_final_approval: "bg-purple-100 text-purple-800 border-purple-200",
  active:                 "bg-green-100 text-green-800 border-green-200",
  expired:                "bg-orange-100 text-orange-700 border-orange-200",
  terminated:             "bg-red-100 text-red-700 border-red-200",
}

export const CONTRACT_TYPES: ContractType[]   = ["msa", "sow", "nda", "other"]
export const CONTRACT_STATUSES: ContractStatus[] = ["pending_approval", "draft", "internal_review", "pending_final_approval", "active", "expired", "terminated"]

// ─── Contract risk tier & Internal Review labels/colors ────────────────────────

export const CONTRACT_RISK_TIER_LABELS: Record<ContractRiskTier, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
}

export const CONTRACT_RISK_TIER_COLORS: Record<ContractRiskTier, string> = {
  low:    "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high:   "bg-red-100 text-red-700 border-red-200",
}

export const CONTRACT_RISK_TIERS: ContractRiskTier[] = ["low", "medium", "high"]

export const CONTRACT_REVIEWER_ROLE_LABELS: Record<ContractReviewerRole, string> = {
  business_user: "Business User",
  legal:         "Legal",
  finance:       "Finance",
  compliance:    "Compliance",
  vp_cfo:        "VP / CFO",
}

export const CONTRACT_REVIEW_STATUS_LABELS: Record<ContractReviewStatus, string> = {
  pending:           "Pending",
  approved:          "Approved",
  changes_requested: "Changes Requested",
}

export const CONTRACT_REVIEW_STATUS_COLORS: Record<ContractReviewStatus, string> = {
  pending:           "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved:          "bg-green-100 text-green-800 border-green-200",
  changes_requested: "bg-red-100 text-red-700 border-red-200",
}

// ─── Contract clause negotiation/redlining labels/colors (CLM Phase 2) ─────────

export const CONTRACT_CLAUSE_CATEGORY_LABELS: Record<ContractClauseCategory, string> = {
  liability:   "Liability",
  indemnity:   "Indemnity",
  termination: "Termination",
  ip:          "IP",
  other:       "Other",
}

// Categories the confirmed spec flags as high-priority for Legal whenever
// a redline touches them (liability/indemnity/termination/IP).
export const CONTRACT_CLAUSE_HIGH_PRIORITY_CATEGORIES: ContractClauseCategory[] = [
  "liability", "indemnity", "termination", "ip",
]

export const CONTRACT_CLAUSE_CATEGORIES: ContractClauseCategory[] = ["liability", "indemnity", "termination", "ip", "other"]

export const CONTRACT_CLAUSE_STATUS_LABELS: Record<ContractClauseStatus, string> = {
  under_negotiation: "Under Negotiation",
  agreed:            "Agreed",
}

export const CONTRACT_CLAUSE_STATUS_COLORS: Record<ContractClauseStatus, string> = {
  under_negotiation: "bg-yellow-100 text-yellow-800 border-yellow-200",
  agreed:            "bg-green-100 text-green-800 border-green-200",
}

// ─── Contract final approval matrix labels/colors (CLM Phase 3) ───────────────

export const CONTRACT_APPROVAL_ROLE_LABELS: Record<ContractApprovalRole, string> = {
  legal:   "Legal Head",
  finance: "Finance Controller",
  vp_cfo:  "VP / CFO",
}

export const CONTRACT_APPROVAL_STATUS_LABELS: Record<ContractApprovalStatus, string> = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
}

export const CONTRACT_APPROVAL_STATUS_COLORS: Record<ContractApprovalStatus, string> = {
  pending:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
}

// ─── Contract renewal tracking labels/colors (CLM Phase 4) ────────────────────

import type { ContractRenewalDecisionType } from "./types"

export const CONTRACT_RENEWAL_DECISION_LABELS: Record<ContractRenewalDecisionType, string> = {
  renew:     "Renew",
  amend:     "Amend",
  terminate: "Terminate",
}

export const CONTRACT_RENEWAL_DECISION_COLORS: Record<ContractRenewalDecisionType, string> = {
  renew:     "bg-green-100 text-green-800 border-green-200",
  amend:     "bg-blue-100 text-blue-800 border-blue-200",
  terminate: "bg-red-100 text-red-700 border-red-200",
}

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
  "certificate_of_incorporation", "pan_copy",
]

export const OPTIONAL_ORG_ONBOARDING_DOCUMENTS: OrgOnboardingDocumentType[] = [
  "memorandum_of_association", "articles_of_association", "board_resolution",
  "bank_proof", "gst_certificate",
]

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
