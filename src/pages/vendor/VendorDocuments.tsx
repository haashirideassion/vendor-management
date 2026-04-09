import { useState } from "react"
import { useVendor } from "@/hooks/useVendor"
import { useDocumentSignedUrl } from "@/hooks/useDocuments"
import { PageHeader } from "@/components/shared/PageHeader"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants"
import { format } from "date-fns"
import { CheckCircle2, Clock, ExternalLink } from "lucide-react"
import { toast } from "sonner"

export function VendorDocuments() {
  const { data: vendor, isLoading } = useVendor()
  const getSignedUrl = useDocumentSignedUrl()
  const [sheetOpen, setSheetOpen] = useState(false)

  const docs = vendor?.vendor_documents ?? []

  async function openDoc(storagePath: string) {
    try {
      const url = await getSignedUrl(storagePath)
      window.open(url, "_blank")
    } catch {
      toast.error("Could not open document")
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (!vendor) return null

  return (
    <div>
      <PageHeader title="Documents" description="Manage your uploaded documents.">
        <Button onClick={() => setSheetOpen(true)} size="sm">Upload document</Button>
      </PageHeader>

      <div className="p-6 flex flex-col gap-4">
        {docs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          </div>
        ) : (
          docs.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex items-center gap-3">
                  {doc.verified ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-yellow-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type]}</p>
                    <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                      {doc.expires_at && ` · Expires ${format(new Date(doc.expires_at), "dd MMM yyyy")}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${doc.verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {doc.verified ? "Verified" : "Pending"}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openDoc(doc.storage_path)}>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Upload New Document</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <DocumentUploader
              vendorId={vendor.id}
              onUploaded={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
