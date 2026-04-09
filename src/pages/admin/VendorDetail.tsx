import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useVendorById, useUpdateVendorStatus } from "@/hooks/useVendors"
import { useVerifyDocument, useDocumentSignedUrl } from "@/hooks/useDocuments"
import { useUpsertRating, useVendorRatings } from "@/hooks/useRatings"
import { useAuditLog } from "@/hooks/useAuditLog"
import { useCategories } from "@/hooks/useCategories"
import { supabase } from "@/lib/supabase"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RatingStars } from "@/components/shared/RatingStars"
import { EmptyState } from "@/components/shared/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog"
import { DOCUMENT_TYPE_LABELS, VENDOR_STATUS_LABELS } from "@/lib/constants"
import type { VendorStatus } from "@/lib/types"
import { format, formatDistanceToNow } from "date-fns"
import {
  ExternalLink, ChevronLeft, CheckCircle2, Clock, XCircle,
  Building2, Mail, Phone, CreditCard, Hash, Calendar
} from "lucide-react"
import { toast } from "sonner"

type ActionConfig = { label: string; status: VendorStatus; variant: "default" | "destructive" | "outline" | "secondary" }

const ALL_ACTIONS: ActionConfig[] = [
  { label: "Approve",      status: "active",          variant: "default" },
  { label: "Request Info", status: "pending_review",  variant: "outline" },
  { label: "Suspend",      status: "suspended",       variant: "destructive" },
  { label: "Reject",       status: "rejected",        variant: "destructive" },
]

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
      setActionDialog(null)
      setAdminNotes("")
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
        {[1,2,3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
      </div>
    )
  }
  if (!vendor) return (
    <div className="p-6">
      <EmptyState title="Vendor not found" description="This vendor may have been removed." action={<Button onClick={() => navigate(-1)}>Go back</Button>} />
    </div>
  )

  const assignedCategoryIds = new Set(vendor.vendor_categories?.map((vc) => vc.category_id) ?? [])
  const availableCategories = categories.filter((c) => !assignedCategoryIds.has(c.id) && c.is_active)
  const actions = ALL_ACTIONS.filter((a) => a.status !== vendor.status)
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0
  const docs = vendor.vendor_documents ?? []
  const verifiedCount = docs.filter((d) => d.verified).length

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={vendor.company_name} description={vendor.vendor_id_code ?? "Vendor ID pending activation"}>
        <StatusBadge status={vendor.status} />
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </PageHeader>

      {/* Action bar */}
      <div className="border-b px-6 py-3 flex flex-wrap gap-2 bg-card">
        {actions.map((a) => (
          <Button key={a.status} size="sm" variant={a.variant} onClick={() => { setAdminNotes(vendor.admin_notes ?? ""); setActionDialog(a) }}>
            {a.label}
          </Button>
        ))}
        {vendor.status === "active" && avgRating > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <RatingStars value={Math.round(avgRating)} size="sm" />
            <span className="text-sm text-muted-foreground">{avgRating.toFixed(1)} ({ratings.length})</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs defaultValue="overview">
          <TabsList className="mb-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">
              Documents
              {docs.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs">{verifiedCount}/{docs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="rating">Rating & History</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Details</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { icon: Building2, label: "Company",  value: vendor.company_name },
                    { icon: Hash,      label: "Contact",  value: vendor.contact_name },
                    { icon: Mail,      label: "Email",    value: vendor.contact_email },
                    { icon: Phone,     label: "Phone",    value: vendor.contact_phone ?? "—" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex justify-between w-full">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Tax & Banking</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { label: "Tax / GST",  value: vendor.tax_gst_number ?? "—" },
                    { label: "Bank",       value: vendor.bank_name ?? "—" },
                    { label: "Account",    value: vendor.bank_account_number ? `••••${vendor.bank_account_number.slice(-4)}` : "—" },
                    { label: "Routing",    value: vendor.bank_routing_number ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Contract Info</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {[
                    { label: "Status",      value: <StatusBadge status={vendor.status} /> },
                    { label: "Vendor ID",   value: vendor.vendor_id_code ? <span className="font-mono font-semibold">{vendor.vendor_id_code}</span> : "Pending" },
                    { label: "Start Date",  value: vendor.contract_start_date ? format(new Date(vendor.contract_start_date), "dd MMM yyyy") : "—" },
                    { label: "Anniversary", value: vendor.contract_anniversary ? format(new Date(vendor.contract_anniversary), "dd MMM yyyy") : "—" },
                    { label: "Joined",      value: format(new Date(vendor.created_at), "dd MMM yyyy") },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {vendor.admin_notes && (
                <Card className="md:col-span-2 border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-amber-700 dark:text-amber-400">Admin Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{vendor.admin_notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Documents ── */}
          <TabsContent value="documents" className="space-y-3">
            {docs.length === 0 ? (
              <EmptyState title="No documents uploaded" description="The vendor has not uploaded any documents yet." />
            ) : (
              docs.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3">
                      {doc.verified
                        ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        : <Clock className="h-5 w-5 text-yellow-500 shrink-0" />
                      }
                      <div>
                        <p className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type]}</p>
                        <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                        <div className="flex gap-3 mt-0.5">
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
                    <div className="flex items-center gap-2 shrink-0">
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDoc(doc.storage_path)}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Services ── */}
          <TabsContent value="services" className="space-y-3">
            {!vendor.vendor_services?.length ? (
              <EmptyState title="No services listed" description="This vendor hasn't added any services yet." />
            ) : (
              vendor.vendor_services.map((svc) => (
                <Card key={svc.id}>
                  <CardContent className="py-4">
                    <p className="text-sm font-medium">{svc.name}</p>
                    {svc.description && <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Categories ── */}
          <TabsContent value="categories" className="space-y-4">
            <div className="flex gap-2">
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
              <Button size="sm" disabled={!categoryId || addCategory.isPending} onClick={() => addCategory.mutate()}>
                Assign
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {vendor.vendor_categories?.length === 0 && (
                <p className="text-sm text-muted-foreground">No categories assigned yet.</p>
              )}
              {vendor.vendor_categories?.map((vc) => (
                <div key={vc.id} className="flex items-center gap-1 rounded-full bg-muted border px-3 py-1 text-sm">
                  <span>{vc.service_categories?.name}</span>
                  <button
                    onClick={() => removeCategory.mutate(vc.id)}
                    className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove ${vc.service_categories?.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Rating & History ── */}
          <TabsContent value="rating" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Submit / update rating */}
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Submit Rating</CardTitle></CardHeader>
                <CardContent className="space-y-3">
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
                  <Button size="sm" onClick={handleRate} disabled={!ratingScore || upsertRating.isPending} className="w-full">
                    {upsertRating.isPending ? "Submitting…" : "Submit rating"}
                  </Button>
                </CardContent>
              </Card>

              {/* Average rating summary */}
              {ratings.length > 0 && (
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Rating Summary</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-bold">{avgRating.toFixed(1)}</span>
                      <div>
                        <RatingStars value={Math.round(avgRating)} size="md" />
                        <p className="text-xs text-muted-foreground mt-0.5">{ratings.length} rating{ratings.length !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    {[5,4,3,2,1].map((star) => {
                      const count = ratings.filter((r) => r.score === star).length
                      const pct = ratings.length ? (count / ratings.length) * 100 : 0
                      return (
                        <div key={star} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-right">{star}</span>
                          <span className="text-yellow-400">★</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-4 text-muted-foreground">{count}</span>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Individual ratings */}
            {ratings.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">All Ratings</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {ratings.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
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

            {/* Audit log */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Status History</CardTitle></CardHeader>
              <CardContent>
                {auditLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
                ) : (
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                    {auditLog.map((log) => {
                      const newStatus = (log.new_value as Record<string, string> | null)?.status as VendorStatus | undefined
                      const oldStatus = (log.old_value as Record<string, string> | null)?.status as VendorStatus | undefined
                      return (
                        <div key={log.id} className="relative mb-4 last:mb-0">
                          <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground" />
                          <div className="pl-4">
                            <p className="text-sm">
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
      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
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
            <Label className="text-sm">Admin notes {actionDialog?.variant === "destructive" ? "(required)" : "(optional)"}</Label>
            <Textarea
              placeholder="Add a note for the vendor or internal records…"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>
          <Separator />
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={actionDialog?.variant === "destructive" ? "destructive" : "default"}
              onClick={handleStatusChange}
              disabled={updateStatus.isPending || (actionDialog?.variant === "destructive" && !adminNotes.trim())}
            >
              {updateStatus.isPending ? "Processing…" : actionDialog?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject confirmation guard */}
      {actionDialog?.status === "rejected" && (
        <div className="hidden">
          <XCircle />
        </div>
      )}
    </div>
  )
}
