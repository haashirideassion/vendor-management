import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

interface PaginationBarProps {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
  itemLabel?: string
}

export function PaginationBar({
  page,
  totalPages,
  totalItems,
  onPageChange,
  itemLabel = "result",
}: PaginationBarProps) {
  if (totalPages <= 1 && totalItems === 0) return null

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs">
        {totalItems} {totalItems !== 1 ? `${itemLabel}s` : itemLabel}
        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  )
}
