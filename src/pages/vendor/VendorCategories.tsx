import { useVendor } from "@/hooks/useVendor"
import { PageHeader } from "@/components/shared/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/shared/EmptyState"

export function VendorCategories() {
  const { data: vendor, isLoading } = useVendor()
  const categories = vendor?.vendor_categories ?? []

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div>
      <PageHeader title="Service Categories" description="The categories your company is registered under." />
      <div className="p-6 flex flex-col gap-3">
        {categories.length === 0 ? (
          <EmptyState title="No categories assigned" description="Contact your admin to assign service categories." />
        ) : (
          categories.map((vc) => (
            <Card key={vc.id}>
              <CardContent className="py-4">
                <p className="text-sm font-medium">{vc.service_categories?.name}</p>
                {vc.service_categories?.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{vc.service_categories.description}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
