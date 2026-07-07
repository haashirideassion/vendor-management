import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useVendorById, useUpdateVendorStatus } from "@/hooks/useVendors"
import { useVerifyDocument, useDocumentSignedUrl } from "@/hooks/useDocuments"
import { useUpsertRating, useVendorRatings } from "@/hooks/useRatings"
import { useAuditLog } from "@/hooks/useAuditLog"
import { useCategories } from "@/hooks/useCategories"
import { supabase } from "@/lib/supabase"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RatingStars } from "@/components/shared/RatingStars"
import { EmptyState } from "@/components/shared/EmptyState"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog"
import { DOCUMENT_TYPE_LABELS, VENDOR_STATUS_LABELS } from "@/lib/constants"
import type { VendorStatus } from "@/lib/types"
import { format, formatDistanceToNow } from "date-fns"
import {
  Building06Icon,
  File01Icon,
  Tag01Icon,
  BarChartIcon,
  CheckmarkCircle01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Cancel01Icon,
  EyeIcon,
  Add01Icon,
  ArrowLeft01Icon,
  UserCircleIcon,
  Alert01Icon,
} from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

type ActionConfig = { label: string; status: VendorStatus; variant: "default" | "success" | "danger" | "outline" | "secondary" }

const ACTIONS_BY_STATUS: Partial<Record<VendorStatus, ActionConfig[]>> = {
  pending_review: [
    { label: "Approve", status: "active",    variant: "success" },
    { label: "Reject",  status: "rejected",  variant: "danger"  },
  ],
  active: [
    { label: "Suspend", status: "suspended", variant: "danger" },
  ],
  suspended: [
    { label: "Approve", status: "active",    variant: "success" },
    { label: "Reject",  status: "rejected",  variant: "danger"  },
  ],
  rejected: [
    { label: "Approve", status: "active",    variant: "success" },
  ],
}

export function VendorDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: vendor, isLoading } = useVendorById(id)
  const updateStatus = useUpdateVendorStatus()
  const verifyDoc = useVerifyDocument()
  const upsertRating = useUpsertRating()
  const { data: ratings = [] } = useVendorRatings(id)
  const { data: auditLog = [] } = useAuditLog(id)
  const { data: categories = [] } = useCategories()
  const getSignedUrl = useDocumentSignedUrl()

  // Status action dialog
  const [actionDialog, setActionDialog] = useState<ActionConfig | null>(null)
  const [adminNotes, setAdminNotes] = useState("")

  function closeDialog() {
    setActionDialog(null)
    setAdminNotes("")
  }

  // Rating
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingComment, setRatingComment] = useState("")

  // Category assignment
  const [categoryId, setCategoryId] = useState("")

  const addCategory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("vendor_categories").insert({ vendor_id: id!, category_id: categoryId })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor", id] }); setCategoryId(""); toast.success("Category assigned") },
    onError: (e: Error) => toast.error(e.message),
  })

  const removeCategory = useMutation({
    mutationFn: async (vcId: string) => {
      const { error } = await supabase.from("vendor_categories").delete().eq("id", vcId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor", id] }); toast.success("Category removed") },
  })

  async function handleStatusChange() {
    if (!actionDialog || !id) return
    try {
      await updateStatus.mutateAsync({ id, status: actionDialog.status, admin_notes: adminNotes || undefined })
      toast.success(`Vendor ${actionDialog.label.toLowerCase()}d`)
      closeDialog()
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function handleRate() {
    if (!ratingScore || !id) return
    try {
      await upsertRating.mutateAsync({ vendorId: id, score: ratingScore, comment: ratingComment || undefined })
      toast.success("Rating submitted")
      setRatingScore(0); setRatingComment("")
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  async function openDoc(path: string) {
    try { window.open(await getSignedUrl(path), "_blank") }
    catch { toast.error("Could not open document") }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!vendor) return (
    <div className="p-6">
      <EmptyState
        title="Vendor not found"
        description="This vendor may have been removed."
        action={<Button onClick={() => navigate(-1)}>Go back</Button>}
      />
    </div>
  )

  const assignedCategoryIds = new Set(vendor.vendor_categories?.map((vc) => vc.category_id) ?? [])
  const availableCategories = categories.filter((c) => !assignedCategoryIds.has(c.id) && c.is_active)
  const actions = ACTIONS_BY_STATUS[vendor.status] ?? []
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0
  const docs = vendor.vendor_documents ?? []
  const verifiedCount = docs.filter((d) => d.verified).length

  return (
    <AnimatedPage>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="px-6 pt-6 pb-4 border-b bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
                  <SolarDuotoneIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} className="mr-1" />
                  Vendors
                </Button>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">{vendor.company_name}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">{vendor.company_name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{vendor.vendor_id_code ?? "Vendor ID pending activation"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={vendor.status} />
              {vendor.status === "active" && avgRating > 0 && (
                <div className="flex items-center gap-1.5 ml-1">
                  <RatingStars value={Math.round(avgRating)} size="sm" />
                  <span className="text-sm text-muted-foreground tabular-nums">{avgRating.toFixed(1)} ({ratings.length})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="border-b px-6 py-2.5 flex flex-wrap gap-2 bg-muted/30">
          {actions.map((a) => (
            a.variant === "success" ? (
              <button
                key={a.status}
                className="btn-grad h-8 text-xs !m-0 !py-0 !px-4 cursor-pointer"
                onClick={() => setActionDialog(a)}
              >
                {a.label}
              </button>
            ) : a.variant === "danger" ? (
              <button
                key={a.status}
                className="btn-grad-danger h-8 text-xs !m-0 !py-0 !px-4 cursor-pointer"
                onClick={() => setActionDialog(a)}
              >
                {a.label}
              </button>
            ) : (
            <Button
              key={a.status}
              size="sm"
              variant={a.variant}
              className="h-8 text-xs"
              onClick={() => setActionDialog(a)}
            >
              {a.label}
            </Button>
            )
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview">
            <TabsList className="mb-6 h-10 gap-1 bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={Building06Icon} size={14} strokeWidth={1.5} />
                Overview
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={File01Icon} size={14} strokeWidth={1.5} />
                Documents
                {docs.length > 0 && (
                  <span className="tab-count">{verifiedCount}/{docs.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="categories" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={Tag01Icon} size={14} strokeWidth={1.5} />
                Categories
              </TabsTrigger>
              <TabsTrigger value="rating" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={BarChartIcon} size={14} strokeWidth={1.5} />
                Rating & History
              </TabsTrigger>
            </TabsList>

            {/* ── Overview ── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={Building06Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Company Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    {[
                      { icon: Building06Icon, label: "Company", value: vendor.company_name },
                      { icon: UserCircleIcon, label: "Contact", value: vendor.contact_name },
                      { icon: UserCircleIcon, label: "Email",   value: vendor.contact_email },
                      { icon: UserCircleIcon, label: "Phone",   value: vendor.contact_phone ?? "—" },
                    ].map(({ icon, label, value }) => (
                      <div key={label} className="flex items-center gap-3">
                        <SolarDuotoneIcon icon={icon} size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                        <div className="flex justify-between w-full gap-2">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium text-right">{value}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={File01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Tax & Banking
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    {[
                      { label: "Tax / GST", value: vendor.tax_gst_number ?? "—" },
                      { label: "Bank",      value: vendor.bank_name ?? "—" },
                      { label: "Account",   value: vendor.bank_account_number ? `••••${vendor.bank_account_number.slice(-4)}` : "—" },
                      { label: "Routing",   value: vendor.bank_routing_number ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium font-mono text-right">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={Clock01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Contract Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    {[
                      { label: "Status",      value: <StatusBadge status={vendor.status} /> },
                      { label: "Vendor ID",   value: vendor.vendor_id_code ? <span className="font-mono font-semibold">{vendor.vendor_id_code}</span> : "Pending" },
                      { label: "Start Date",  value: vendor.contract_start_date ? format(new Date(vendor.contract_start_date), "dd MMM yyyy") : "—" },
                      { label: "Anniversary", value: vendor.contract_anniversary ? format(new Date(vendor.contract_anniversary), "dd MMM yyyy") : "—" },
                      { label: "Joined",      value: format(new Date(vendor.created_at), "dd MMM yyyy") },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {vendor.admin_notes && (
                  <Card className="shadow-none md:col-span-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                        <SolarDuotoneIcon icon={Alert01Icon} size={15} strokeWidth={1.5} />
                        Admin Notes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">{vendor.admin_notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ── Documents ── */}
            <TabsContent value="documents" className="space-y-3 mt-0">
              {docs.length === 0 ? (
                <EmptyState title="No documents uploaded" description="The vendor has not uploaded any documents yet." />
              ) : (
                docs.map((doc) => (
                  <Card key={doc.id} className="shadow-none">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-1.5 rounded-lg shrink-0 ${doc.verified ? "bg-green-100 dark:bg-green-900/30" : "bg-yellow-100 dark:bg-yellow-900/30"}`}>
                          {doc.verified
                            ? <SolarDuotoneIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.5} className="text-green-600 dark:text-green-400" />
                            : <SolarDuotoneIcon icon={Clock01Icon} size={16} strokeWidth={1.5} className="text-yellow-600 dark:text-yellow-400" />
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type]}</p>
                          <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                          <div className="flex gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                            </span>
                            {doc.expires_at && (
                              <span className="text-xs text-muted-foreground">
                                · Expires {format(new Date(doc.expires_at), "dd MMM yyyy")}
                              </span>
                            )}
                          </div>
                          {doc.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{doc.notes}"</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Checkbox
                            id={`verify-${doc.id}`}
                            checked={doc.verified}
                            onCheckedChange={(c) => verifyDoc.mutate({ docId: doc.id, verified: !!c })}
                          />
                          <Label htmlFor={`verify-${doc.id}`} className="text-xs cursor-pointer select-none">
                            {doc.verified ? "Verified" : "Mark verified"}
                          </Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => openDoc(doc.storage_path)}
                        >
                          <SolarDuotoneIcon icon={EyeIcon} size={15} strokeWidth={1.5} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ── Categories ── */}
            <TabsContent value="categories" className="space-y-4 mt-0">
              <div className="flex gap-2 p-4 rounded-xl border bg-card shadow-none">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder={availableCategories.length ? "Assign a category…" : "All categories assigned"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!categoryId || addCategory.isPending}
                  onClick={() => addCategory.mutate()}
                  className="gap-1.5"
                >
                  <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
                  Assign
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {vendor.vendor_categories?.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No categories assigned yet.</p>
                )}
                {vendor.vendor_categories?.map((vc) => (
                  <div key={vc.id} className="flex items-center gap-1.5 rounded-full bg-primary/8 border border-primary/15 px-3 py-1.5 text-sm font-medium">
                    <span>{vc.service_categories?.name}</span>
                    <button
                      onClick={() => removeCategory.mutate(vc.id)}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors leading-none"
                      aria-label={`Remove ${vc.service_categories?.name}`}
                    >
                      <SolarDuotoneIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Rating & History ── */}
            <TabsContent value="rating" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Submit rating */}
                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={BarChartIcon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Submit Rating
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Score</Label>
                      <RatingStars value={ratingScore} onChange={setRatingScore} size="lg" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Comment (optional)</Label>
                      <Textarea
                        placeholder="Add a comment about this vendor…"
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRate}
                      disabled={!ratingScore || upsertRating.isPending}
                      className="w-full"
                    >
                      {upsertRating.isPending ? "Submitting…" : "Submit rating"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Rating summary */}
                {ratings.length > 0 && (
                  <Card className="shadow-none">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                        Rating Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl font-bold tracking-tight">{avgRating.toFixed(1)}</span>
                        <div>
                          <RatingStars value={Math.round(avgRating)} size="md" />
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ratings.length} rating{ratings.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = ratings.filter((r) => r.score === star).length
                        const pct = ratings.length ? (count / ratings.length) * 100 : 0
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs">
                            <span className="w-3 text-right tabular-nums">{star}</span>
                            <span className="text-yellow-400">★</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-yellow-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-4 text-muted-foreground tabular-nums">{count}</span>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Individual ratings */}
              {ratings.length > 0 && (
                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold">All Ratings</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-3">
                    {ratings.map((r) => (
                      <div key={r.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 text-muted-foreground">
                          {(r.profiles?.full_name ?? "A").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <RatingStars value={r.score} size="sm" />
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {r.comment && <p className="text-sm mt-1 text-muted-foreground">{r.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Audit / Status history */}
              <Card className="shadow-none">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-sm font-semibold">Status History</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
                  ) : (
                    <div className="relative pl-5">
                      <div className="absolute left-2 top-1 bottom-1 w-px bg-border" />
                      {auditLog.map((log) => {
                        const newStatus = (log.new_value as Record<string, string> | null)?.status as VendorStatus | undefined
                        const oldStatus = (log.old_value as Record<string, string> | null)?.status as VendorStatus | undefined
                        return (
                          <div key={log.id} className="relative mb-5 last:mb-0">
                            <div className="absolute -left-3.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/50 ring-2 ring-background" />
                            <div>
                              <p className="text-sm leading-snug">
                                <span className="text-muted-foreground">Changed from </span>
                                <span className="font-medium">{oldStatus ? VENDOR_STATUS_LABELS[oldStatus] : "—"}</span>
                                <span className="text-muted-foreground"> to </span>
                                {newStatus && <StatusBadge status={newStatus} />}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                {log.profiles?.full_name && ` · by ${log.profiles.full_name}`}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Status action dialog */}
        <Dialog open={!!actionDialog} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{actionDialog?.label} vendor?</DialogTitle>
              <DialogDescription>
                This will change {vendor.company_name}'s status to{" "}
                <strong>{actionDialog ? VENDOR_STATUS_LABELS[actionDialog.status] : ""}</strong>.
                {actionDialog?.status === "active" && " A welcome email will be sent automatically."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-sm">
                Admin notes {actionDialog?.variant === "danger" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                placeholder="Add a note for the vendor or internal records…"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
            <Separator />
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} disabled={updateStatus.isPending}>
                Cancel
              </Button>
              <button
                className={`${actionDialog?.variant === "success" ? "btn-grad" : "btn-grad-danger"} !m-0 !py-2 !px-5 cursor-pointer disabled:opacity-50`}
                onClick={handleStatusChange}
                disabled={
                  updateStatus.isPending ||
                  (actionDialog?.variant === "danger" && !adminNotes.trim())
                }
              >
                {updateStatus.isPending ? "Processing…" : actionDialog?.label}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AnimatedPage>
  )
}
