import { useEffect, useState } from "react"
import { useCreateRating, useMyVendorRating } from "@/hooks/useRatings"
import { RatingDimensionsForm, EMPTY_RATING_SCORES } from "@/components/shared/RatingDimensionsForm"
import { RatingStars } from "@/components/shared/RatingStars"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { RATING_DIMENSIONS, RATING_DIMENSION_LABELS } from "@/lib/constants"
import type { RatingDimension } from "@/lib/types"
import { toast } from "sonner"

// Entry point for rating a vendor from wherever the work actually happened
// (PO/GRN/Service Confirmation/Invoice detail pages) rather than only from
// Vendor Detail -- the rating itself is still one blended-per-vendor row
// (migration 075), this just relocates WHERE it can be submitted from.
//
// A rater gets exactly one rating per vendor, ever -- since the same vendor
// can now be rated from 4 different pages, this checks for an existing
// rating up front and shows it read-only instead of a form, rather than
// letting a second submission from a different entry point silently
// overwrite the first.
export function RateVendorDialog({
  open, onOpenChange, vendorId, vendorName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorId: string
  vendorName?: string
}) {
  const [scores, setScores] = useState(EMPTY_RATING_SCORES)
  const [comment, setComment] = useState("")
  const createRating = useCreateRating()
  const { myRating, isLoading: loadingMyRating } = useMyVendorRating(open ? vendorId : undefined)

  useEffect(() => {
    if (open) { setScores(EMPTY_RATING_SCORES); setComment("") }
  }, [open])

  const allScored = RATING_DIMENSIONS.every((dim) => scores[dim] > 0)

  async function handleSubmit() {
    if (!allScored) return
    try {
      await createRating.mutateAsync({ vendorId, scores, comment: comment.trim() || undefined })
      toast.success("Rating submitted")
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to submit rating")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{myRating ? `Your Rating for ${vendorName ?? "this vendor"}` : `Rate ${vendorName ?? "Vendor"}`}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {loadingMyRating ? (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            </div>
          ) : myRating ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                You've already rated this vendor. Ratings can't be changed once submitted.
              </p>
              {RATING_DIMENSIONS.map((dim) => (
                <div key={dim} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{RATING_DIMENSION_LABELS[dim]}</span>
                  <RatingStars value={myRating[dim]} size="md" />
                </div>
              ))}
              {myRating.comment && (
                <p className="text-sm text-muted-foreground border-t pt-3 mt-3">{myRating.comment}</p>
              )}
            </div>
          ) : (
            <RatingDimensionsForm
              scores={scores}
              onScoreChange={(dim: RatingDimension, value) => setScores((prev) => ({ ...prev, [dim]: value }))}
              comment={comment}
              onCommentChange={setComment}
            />
          )}
        </DialogBody>
        <DialogFooter>
          {myRating ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createRating.isPending}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!allScored || createRating.isPending || loadingMyRating}>
                {createRating.isPending ? "Submitting…" : "Submit Rating"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
