import { cn } from "@/lib/utils"

interface RatingStarsProps {
  value: number
  max?: number
  onChange?: (value: number) => void
  size?: "sm" | "md" | "lg"
  className?: string
}

export function RatingStars({ value, max = 5, onChange, size = "md", className }: RatingStarsProps) {
  const sizeClass = { sm: "text-sm", md: "text-xl", lg: "text-2xl" }[size]

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          className={cn(
            sizeClass,
            "leading-none transition-colors",
            onChange ? "cursor-pointer hover:scale-110" : "cursor-default",
            star <= value ? "text-yellow-400" : "text-muted-foreground/30"
          )}
          disabled={!onChange}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
