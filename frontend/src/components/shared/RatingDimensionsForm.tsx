import { RatingStars } from "@/components/shared/RatingStars"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RATING_DIMENSIONS, RATING_DIMENSION_LABELS } from "@/lib/constants"
import type { RatingDimension } from "@/lib/types"

// The 5-dimension star input, shared between VendorDetail's inline "Submit
// Rating" card and RateVendorDialog (used from PO/GRN/Service Confirmation/
// Invoice detail pages) -- one definition of what a rating submission looks
// like, reused wherever a vendor can be rated.
export function RatingDimensionsForm({
  scores, onScoreChange, comment, onCommentChange,
}: {
  scores: Record<RatingDimension, number>
  onScoreChange: (dim: RatingDimension, value: number) => void
  comment: string
  onCommentChange: (value: string) => void
}) {
  return (
    <div className="space-y-3">
      {RATING_DIMENSIONS.map((dim) => (
        <div key={dim} className="flex items-center justify-between gap-3">
          <Label className="text-xs text-muted-foreground">{RATING_DIMENSION_LABELS[dim]}</Label>
          <RatingStars value={scores[dim]} onChange={(v) => onScoreChange(dim, v)} size="md" />
        </div>
      ))}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Comment (optional)</Label>
        <Textarea
          placeholder="Add a comment about this vendor…"
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}

export const EMPTY_RATING_SCORES: Record<RatingDimension, number> = {
  quality: 0, timeliness: 0, communication: 0, cost_competitiveness: 0, compliance: 0,
}
