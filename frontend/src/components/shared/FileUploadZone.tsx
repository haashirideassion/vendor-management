import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { formatBytes } from "@/lib/utils"
import { validateFile, ALLOWED_EXT_LABEL } from "@/hooks/useAttachments"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Upload01Icon, File01Icon, Cancel01Icon } from "@/components/shared/SolarIcon"

export interface FileUploadZoneProps {
  /** Currently staged files (controlled). */
  files: File[]
  /** Called when the staged file list changes. */
  onChange: (files: File[]) => void
  /** Max number of files; additional files are ignored. Defaults to 10. */
  maxFiles?: number
  /** Disable the zone (e.g. while submitting). */
  disabled?: boolean
  className?: string
}

/**
 * Reusable drag-and-drop file staging zone.
 * Does NOT upload anything — it only manages the in-memory File list.
 * The parent is responsible for the actual upload after entity creation.
 */
export function FileUploadZone({
  files,
  onChange,
  maxFiles = 10,
  disabled = false,
  className,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Add incoming File objects after deduplication and validation. */
  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming)
      const accepted: File[] = []

      for (const file of list) {
        // Validate type / size
        const err = validateFile(file)
        if (err) {
          toast.error(err)
          continue
        }
        // Deduplicate by name + size
        const isDupe = files.some((f) => f.name === file.name && f.size === file.size)
        if (isDupe) {
          toast.warning(`"${file.name}" is already added`)
          continue
        }
        accepted.push(file)
      }

      if (accepted.length === 0) return

      const combined = [...files, ...accepted]
      if (combined.length > maxFiles) {
        toast.warning(`Maximum ${maxFiles} files allowed`)
      }
      onChange(combined.slice(0, maxFiles))
    },
    [files, maxFiles, onChange]
  )

  const removeFile = useCallback(
    (index: number) => {
      onChange(files.filter((_, i) => i !== index))
    },
    [files, onChange]
  )

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    addFiles(e.dataTransfer.files)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
    // Reset input so the same file can be re-selected after removal
    e.target.value = ""
  }

  function handleZoneClick() {
    if (!disabled) inputRef.current?.click()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-2", className)}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={handleZoneClick}
        onKeyDown={(e) => e.key === "Enter" && handleZoneClick()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/40",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".doc,.docx,.jpg,.jpeg,.pdf"
          className="hidden"
          disabled={disabled}
          onChange={handleInputChange}
        />
        <SolarDuotoneIcon
          icon={Upload01Icon}
          size={22}
          strokeWidth={1.5}
          className={cn("transition-colors", isDragging ? "text-primary" : "text-muted-foreground")}
        />
        <div>
          <p className="text-sm text-muted-foreground">
            Drag & drop files here, or{" "}
            <span className="font-medium text-primary">browse</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">
            {ALLOWED_EXT_LABEL} · max 20 MB per file
          </p>
        </div>
      </div>

      {/* Staged file list */}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${i}`}
              className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2"
            >
              <SolarDuotoneIcon
                icon={File01Icon}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none"
                aria-label={`Remove ${file.name}`}
              >
                <SolarDuotoneIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  )
}
