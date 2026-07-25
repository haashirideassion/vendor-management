import { useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils"
import { useAttachments, useDeleteAttachment, getAttachmentUrl, useUploadAttachments, ALLOWED_EXTENSIONS } from "@/hooks/useAttachments"
import { FileUploadZone } from "./FileUploadZone"
import type { AttachmentEntityType, Attachment } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { File01Icon, Delete01Icon, EyeIcon, Add01Icon } from "@/components/shared/SolarIcon"
import { format } from "date-fns"

interface AttachmentListProps {
  entityType: AttachmentEntityType
  entityId:   string
  /** Show a delete button on each row. */
  canDelete?: boolean
  /** Show an "Add" button to upload more files after creation. */
  canUpload?: boolean
  className?: string
}

function ExtBadge({ ext }: { ext: string }) {
  const color =
    ext === "pdf"          ? "bg-red-100 text-red-700 border-red-200"
    : ext === "jpg" || ext === "jpeg" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-blue-100 text-blue-700 border-blue-200"  // doc / docx
  return (
    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase shrink-0", color)}>
      {ext}
    </span>
  )
}

function AttachmentRow({
  attachment,
  canDelete,
  onDelete,
}: {
  attachment: Attachment
  canDelete: boolean
  onDelete: (a: Attachment) => void
}) {
  const [loadingView, setLoadingView] = useState(false)
  const [loadingDl,   setLoadingDl]   = useState(false)

  async function handleView() {
    setLoadingView(true)
    const url = await getAttachmentUrl(attachment.storage_path, false)
    setLoadingView(false)
    if (!url) { toast.error("Could not generate preview link"); return }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function handleDownload() {
    setLoadingDl(true)
    const url = await getAttachmentUrl(attachment.storage_path, true)
    setLoadingDl(false)
    if (!url) { toast.error("Could not generate download link"); return }
    const a = document.createElement("a")
    a.href = url
    a.download = attachment.original_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2">
      <SolarDuotoneIcon icon={File01Icon} size={15} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />

      <ExtBadge ext={attachment.file_extension} />

      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-medium" title={attachment.original_name}>
          {attachment.original_name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatBytes(attachment.file_size)} · {format(new Date(attachment.created_at), "dd MMM yyyy")}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleView}
          disabled={loadingView}
          title="View"
        >
          <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
          {loadingView ? "…" : "View"}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={handleDownload}
          disabled={loadingDl}
          title="Download"
        >
          {loadingDl ? "…" : "↓"}
        </Button>

        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(attachment)}
            title="Remove"
          >
            <SolarDuotoneIcon icon={Delete01Icon} size={13} strokeWidth={1.5} />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Displays the attachment list for an entity.
 * Renders inside a Card with an optional "Add files" section.
 */
export function AttachmentList({
  entityType,
  entityId,
  canDelete = false,
  canUpload = false,
  className,
}: AttachmentListProps) {
  const { data: attachments = [], isLoading } = useAttachments(entityType, entityId)
  const deleteAttachment = useDeleteAttachment()
  const uploadAttachments = useUploadAttachments()

  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null)
  const [addFiles,      setAddFiles]      = useState<File[]>([])
  const [isUploading,   setIsUploading]   = useState(false)

  async function confirmDelete() {
    if (!pendingDelete) return
    await deleteAttachment.mutateAsync({
      id:          pendingDelete.id,
      storagePath: pendingDelete.storage_path,
      entityType,
      entityId,
    })
    setPendingDelete(null)
  }

  async function handleAddUpload() {
    if (addFiles.length === 0) return
    setIsUploading(true)
    try {
      await uploadAttachments.mutateAsync({ entityType, entityId, files: addFiles })
      setAddFiles([])
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Attachments{attachments.length > 0 ? ` (${attachments.length})` : ""}
            </CardTitle>
            {canUpload && addFiles.length === 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  const inp = document.createElement("input")
                  inp.type = "file"
                  inp.multiple = true
                  inp.accept = ALLOWED_EXTENSIONS.join(",")
                  inp.onchange = (e) => {
                    const target = e.target as HTMLInputElement
                    if (target.files) setAddFiles(Array.from(target.files))
                  }
                  inp.click()
                }}
              >
                <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                Add Files
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
              Loading…
            </div>
          ) : attachments.length === 0 && addFiles.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No attachments uploaded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {attachments.map((att) => (
                <AttachmentRow
                  key={att.id}
                  attachment={att}
                  canDelete={canDelete}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}

          {/* Inline "add more files" zone (shown when canUpload is true) */}
          {canUpload && (
            <div className="space-y-2 pt-1">
              <FileUploadZone
                files={addFiles}
                onChange={setAddFiles}
                disabled={isUploading}
              />
              {addFiles.length > 0 && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setAddFiles([])}
                    disabled={isUploading}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleAddUpload}
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading…" : `Upload ${addFiles.length} file${addFiles.length !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Attachment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <span className="font-medium text-foreground">{pendingDelete?.original_name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={deleteAttachment.isPending}
            >
              {deleteAttachment.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
