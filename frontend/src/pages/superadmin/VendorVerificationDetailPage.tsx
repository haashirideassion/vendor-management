import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useVendorVerificationQueue, useSetVendorVerificationStatus } from "@/hooks/useVendorVerificationQueue"
import { useDocumentSignedUrl } from "@/hooks/useDocuments"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { EmptyState } from "@/components/shared/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Building06Icon, File01Icon, ArrowLeft01Icon, Clock01Icon, EyeIcon } from "@/components/shared/SolarIcon"
import { format } from "date-fns"
import { toast } from "sonner"

// "suspend" and "reject" both set verification_status to "rejected" on the
// backend (that enum has no separate "suspended" value) -- they're kept as
// distinct UI actions only so the confirmation dialog reads correctly for
// each: an already-verified vendor is being suspended, not rejected outright.
type PendingAction = "approve" | "reject" | "suspend" | null

export function VendorVerificationDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>()
  const navigate = useNavigate()
  const { data: vendors = [], isLoading } = useVendorVerificationQueue()
  const vendor = vendors.find((v) => v.id === vendorId)
  const setStatus = useSetVendorVerificationStatus()
  const getSignedUrl = useDocumentSignedUrl()

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [reason, setReason] = useState("")

  function closeDialog() {
    setPendingAction(null)
    setReason("")
  }

  async function handleConfirm() {
    if (!vendor || !pendingAction) return
    if ((pendingAction === "reject" || pendingAction === "suspend") && !reason.trim()) {
      return toast.error("A reason is required")
    }
    try {
      await setStatus.mutateAsync({
        vendor_id: vendor.id,
        verification_status: pendingAction === "approve" ? "verified" : "rejected",
        reason: pendingAction !== "approve" ? reason.trim() : undefined,
      })
      toast.success(
        pendingAction === "approve" ? `${vendor.companyLegalName} verified`
          : pendingAction === "suspend" ? `${vendor.companyLegalName} suspended`
          : `${vendor.companyLegalName} rejected`
      )
      closeDialog()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Action failed")
    }
  }

  async function openDoc(path: string) {
    try { window.open(await getSignedUrl(path), "_blank") }
    catch { toast.error("Could not open document") }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="p-6">
        <EmptyState
          title="Vendor not found"
          description="It may already have been reviewed."
          action={<Button onClick={() => navigate(-1)}>Go back</Button>}
        />
      </div>
    )
  }

  const docs = vendor.registrationDocuments

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
                  Vendor Verification
                </Button>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">{vendor.companyLegalName}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">{vendor.companyLegalName}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Submitted {format(new Date(vendor.submittedAt), "dd MMM yyyy")}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline">{vendor.verificationStatus}</Badge>
            </div>
          </div>
        </div>

        {/* Action bar -- an already-verified vendor only offers Suspend, not
            Approve/Reject again; everything else (pending, rejected) gets
            the normal Approve/Reject pair. */}
        <div className="border-b px-6 py-2.5 flex flex-wrap gap-2 bg-muted/30">
          {vendor.verificationStatus === "verified" ? (
            <Button variant="danger" size="sm" onClick={() => setPendingAction("suspend")}>
              Suspend
            </Button>
          ) : (
            <>
              <Button variant="success" size="sm" onClick={() => setPendingAction("approve")}>
                Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => setPendingAction("reject")}>
                Reject
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview">
            <TabsList className="mb-6 h-10 gap-1 bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={Building06Icon} size={14} strokeWidth={1.5} />
                Overview
              </TabsTrigger>
              <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={File01Icon} size={14} strokeWidth={1.5} />
                Documents
                {docs.length > 0 && <span className="tab-count">{docs.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview ── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={Building06Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Legal / Registration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    {[
                      { label: "GST Number", value: vendor.gstNumber ?? "—" },
                      { label: "PAN Number", value: vendor.panNumber ?? "—" },
                      { label: "Registration Number", value: vendor.registrationNumber ?? "—" },
                      { label: "Submitted", value: format(new Date(vendor.submittedAt), "dd MMM yyyy") },
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
                      Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    {vendor.categories.length === 0 ? (
                      <p className="text-sm text-muted-foreground">None declared</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {vendor.categories.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Documents ── */}
            <TabsContent value="documents" className="space-y-3 mt-0">
              {docs.length === 0 ? (
                <EmptyState title="No documents uploaded" description="This vendor has not uploaded any registration documents yet." />
              ) : (
                docs.map((doc) => (
                  <Card key={doc.id} className="shadow-none">
                    <CardContent className="flex items-center justify-between gap-4 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 rounded-lg shrink-0 bg-muted">
                          <SolarDuotoneIcon icon={File01Icon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{doc.document_type}</p>
                          <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                          <span className="text-xs text-muted-foreground">Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => openDoc(doc.storage_path)}
                      >
                        <SolarDuotoneIcon icon={EyeIcon} size={15} strokeWidth={1.5} />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Confirmation dialog */}
        <Dialog open={!!pendingAction} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pendingAction === "approve" ? "Verify vendor?" : pendingAction === "suspend" ? "Suspend vendor?" : "Reject vendor?"}
              </DialogTitle>
              <DialogDescription>
                {pendingAction === "approve" && `This will mark ${vendor.companyLegalName} as verified.`}
                {pendingAction === "suspend" && `This will suspend ${vendor.companyLegalName}'s verification -- it can't be used for new purchase requests until re-verified.`}
                {pendingAction === "reject" && `This will reject ${vendor.companyLegalName}'s verification.`}
              </DialogDescription>
            </DialogHeader>
            {(pendingAction === "reject" || pendingAction === "suspend") && (
              <div className="space-y-2">
                <Label className="text-sm">Reason (required)</Label>
                <Textarea placeholder="Why is this vendor being rejected?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            )}
            <Separator />
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} disabled={setStatus.isPending}>Cancel</Button>
              <Button
                variant={pendingAction === "approve" ? "success" : "danger"}
                onClick={handleConfirm}
                disabled={setStatus.isPending || ((pendingAction === "reject" || pendingAction === "suspend") && !reason.trim())}
              >
                {setStatus.isPending ? "Processing…" : pendingAction === "approve" ? "Approve" : pendingAction === "suspend" ? "Suspend" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AnimatedPage>
  )
}
