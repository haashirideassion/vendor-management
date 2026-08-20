import type { TaxComponent } from "@/lib/types"

interface TaxComponentsDisplayProps {
  taxRate: number | null
  components?: TaxComponent[]
}

// Read-only display of a line item's tax_rate, with its named breakdown (if
// any) shown underneath in small print -- e.g. "18%" / "CGST 9% + SGST 9%".
export function TaxComponentsDisplay({ taxRate, components }: TaxComponentsDisplayProps) {
  return (
    <div>
      <div>{taxRate ?? 0}%</div>
      {components && components.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {components.map((c) => `${c.name} ${c.rate}%`).join(" + ")}
        </div>
      )}
    </div>
  )
}
