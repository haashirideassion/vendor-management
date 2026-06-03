import { useVendor } from "@/hooks/useVendor"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tag01Icon } from "@hugeicons/core-free-icons"

export function VendorCategories() {
  const { data: vendor, isLoading } = useVendor()
  const categories = vendor?.vendor_categories ?? []

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight">Service Categories</h1>
          <p className="text-sm text-muted-foreground">
            The categories your company is registered under.
          </p>
        </div>

        {/* Categories list */}
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <HugeiconsIcon
                icon={Tag01Icon}
                size={24}
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No categories assigned</p>
              <p className="text-sm text-muted-foreground">
                Contact your admin to assign service categories to your account.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((vc) => (
              <Card key={vc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <HugeiconsIcon
                      icon={Tag01Icon}
                      size={18}
                      strokeWidth={1.5}
                      className="text-primary"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{vc.service_categories?.name}</p>
                    {vc.service_categories?.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {vc.service_categories.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
