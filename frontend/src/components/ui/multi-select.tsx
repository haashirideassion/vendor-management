import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandSeparator } from "@/components/ui/command"

export interface MultiSelectOption {
  id: string
  label: string
  // Optional secondary line rendered under the label (e.g. a category's
  // description) -- omit for a plain label-only option.
  description?: string
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  disabled?: boolean
  searchPlaceholder?: string
  // Shows a "Loading…" row instead of "No Options" while the source data
  // for `options` is still being fetched -- an empty array on first render
  // isn't the same as a genuinely empty list.
  loading?: boolean
}

function MultiSelectOptionLabel({ option }: { option: MultiSelectOption }) {
  if (!option.description) return <>{option.label}</>
  return (
    <div>
      <p className="text-sm">{option.label}</p>
      <p className="text-xs text-muted-foreground">{option.description}</p>
    </div>
  )
}

// Shared multi-select dropdown (Popover + Command + Checkbox) -- selected
// options are always rendered first, above a separator, so a long list
// doesn't bury what's already picked. Toggling a checkbox re-sorts
// immediately since both groups are recomputed from `value` on every
// render; relative order within each group is preserved from `options`.
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  searchPlaceholder,
  loading = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  const selectedOptions = options.filter((o) => value.includes(o.id))
  const unselectedOptions = options.filter((o) => !value.includes(o.id))
  const selectedLabels = selectedOptions.map((o) => o.label)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-start font-normal h-9 text-sm truncate"
        >
          {selectedLabels.length === 0
            ? <span className="text-muted-foreground">{placeholder}</span>
            : <span className="truncate">{selectedLabels.join(", ")}</span>
          }
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "Search…"} />
          <CommandList className="max-h-56 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            <CommandEmpty>{loading ? "Loading…" : options.length === 0 ? "No Options" : "No results found."}</CommandEmpty>
            {selectedOptions.map((opt) => (
              <CommandItem key={opt.id} value={opt.label} onSelect={() => toggle(opt.id)}>
                <Checkbox
                  checked
                  className="mr-2 h-4 w-4"
                  onCheckedChange={() => toggle(opt.id)}
                />
                <MultiSelectOptionLabel option={opt} />
              </CommandItem>
            ))}
            {selectedOptions.length > 0 && unselectedOptions.length > 0 && <CommandSeparator />}
            {unselectedOptions.map((opt) => (
              <CommandItem key={opt.id} value={opt.label} onSelect={() => toggle(opt.id)}>
                <Checkbox
                  checked={false}
                  className="mr-2 h-4 w-4"
                  onCheckedChange={() => toggle(opt.id)}
                />
                <MultiSelectOptionLabel option={opt} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
