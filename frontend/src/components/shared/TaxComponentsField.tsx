import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SolarDuotoneIcon, Add01Icon, Delete01Icon } from "@/components/shared/SolarIcon"
import type { TaxComponentInput } from "@/lib/types"

interface TaxComponentsFieldProps {
  flatRate: number
  onFlatRateChange: (rate: number) => void
  components: TaxComponentInput[]
  onComponentsChange: (components: TaxComponentInput[]) => void
}

// Manual tax breakdown entry for one line item -- e.g. CGST 9% + SGST 9%
// instead of a single flat 18%. Collapsed by default to a plain Tax %
// input; expanding replaces it with named rate rows whose sum becomes the
// line item's effective tax_rate (computed server-side on submit).
export function TaxComponentsField({ flatRate, onFlatRateChange, components, onComponentsChange }: TaxComponentsFieldProps) {
  const [expanded, setExpanded] = useState(components.length > 0)
  const total = components.reduce((sum, c) => sum + (Number(c.rate) || 0), 0)

  if (!expanded) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number" min={0} step="any" placeholder="Tax" className="h-8 text-xs"
          value={flatRate}
          onChange={(e) => onFlatRateChange(Number(e.target.value))}
        />
        <button
          type="button"
          title="Add named tax breakdown"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1 rounded-md border border-border/60 p-1.5 bg-muted/30">
      {components.map((c, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <Input
            placeholder="Name (CGST)" className="h-7 text-xs"
            value={c.name}
            onChange={(e) => {
              const next = [...components]
              next[idx] = { ...next[idx], name: e.target.value }
              onComponentsChange(next)
            }}
          />
          <Input
            type="number" min={0} step="any" placeholder="%" className="h-7 text-xs w-16"
            value={c.rate}
            onChange={(e) => {
              const next = [...components]
              next[idx] = { ...next[idx], rate: Number(e.target.value) }
              onComponentsChange(next)
            }}
          />
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onComponentsChange(components.filter((_, i) => i !== idx))}
          >
            <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <Button
          type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-1"
          onClick={() => onComponentsChange([...components, { name: "", rate: 0 }])}
        >
          <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} />
          Add component
        </Button>
        {components.length > 0 ? (
          <span className="text-[11px] text-muted-foreground pr-1">Total {total}%</span>
        ) : (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground pr-1"
            onClick={() => { onComponentsChange([]); setExpanded(false) }}
          >
            Use flat rate
          </button>
        )}
      </div>
    </div>
  )
}
