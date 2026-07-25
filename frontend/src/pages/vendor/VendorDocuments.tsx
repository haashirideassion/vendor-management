import { useState } from "react"
import { Link } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"
import { useDocumentSignedUrl } from "@/hooks/useDocuments"
import { useMyVendorRole } from "@/hooks/useVendorUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  File01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Upload01Icon,
  EyeIcon,
  UserCircleIcon,
} from "@/components/shared/SolarIcon"
import { format } from "date-fns"
import { toast } from "sonner"

export function VendorDocuments() {
  const { data: vendor, isLoading } = useVendor()
  const getSignedUrl = useDocumentSignedUrl()
  const { data: myRoleNames = [] } = useMyVendorRole()
  const isViewerAdmin = myRoleNames.includes("Admin")
  const [uploadOpen, setUploadOpen] = useState(false)

  const docs = vendor?.vendor_documents ?? []

  async function openDoc(storagePath: string) {
    try {
      const url = await getSignedUrl(storagePath)
      window.open(url, "_blank")
    } catch {
      toast.error("Could not open document")
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (!vendor) {
    return (
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <SolarDuotoneIcon icon={UserCircleIcon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No vendor account found</p>
            <p className="text-sm text-muted-foreground">Complete your onboarding first to manage documents.</p>
          </div>
          <Button asChild>
            <Link to="/onboarding">Complete onboarding</Link>
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Actions */}
        {isViewerAdmin && (
          <div className="flex items-center justify-end gap-4">
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <SolarDuotoneIcon icon={Upload01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
              Upload document
            </Button>
          </div>
        )}

        {/* Document list */}
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <SolarDuotoneIcon icon={File01Icon} size={24} strokeWidth={1.5} className="text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No documents uploaded yet</p>
              <p className="text-sm text-muted-foreground">Upload your required documents to complete verification.</p>
            </div>
            {isViewerAdmin && (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <SolarDuotoneIcon icon={Upload01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                Upload your first document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${doc.verified ? "bg-green-100" : "bg-yellow-100"
                        }`}
                    >
                      <SolarDuotoneIcon
                        icon={doc.verified ? CheckmarkCircle01Icon : Clock01Icon}
                        size={20}
                        strokeWidth={1.5}
                        className={doc.verified ? "text-green-600" : "text-yellow-600"}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {DOCUMENT_TYPE_LABELS[doc.document_type]}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                        {doc.expires_at &&
                          ` · Expires ${format(new Date(doc.expires_at), "dd MMM yyyy")}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${doc.verified
                          ? "bg-green-100 text-green-600"
                          : "bg-yellow-100 text-yellow-700"
                        }`}
                    >
                      {doc.verified ? "Verified" : "Pending"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openDoc(doc.storage_path)}
                      title="View document"
                    >
                      <SolarDuotoneIcon icon={EyeIcon} size={16} strokeWidth={1.5} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload New Document</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <DocumentUploader
              vendorId={vendor.id}
              onUploaded={() => setUploadOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
