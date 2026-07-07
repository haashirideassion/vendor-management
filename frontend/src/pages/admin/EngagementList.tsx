import { useState, useEffect, useRef, useCallback } from "react"
import { Link } from "react-router-dom"
import { useForm, Controller, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useEngagements, useCreateEngagement } from "@/hooks/useEngagements"
import { useCategories } from "@/hooks/useCategories"
import { useVendorsByCategories } from "@/hooks/useVendors"
import { usePermissions } from "@/hooks/usePermissions"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_STATUS_COLORS,
  CURRENCIES,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { EngagementStatus } from "@/lib/types"
import { format } from "date-fns"
import { Search01Icon, Cancel01Icon, Add01Icon, EyeIcon, Delete01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { FileUploadZone } from "@/components/shared/FileUploadZone"
import { useUploadAttachments } from "@/hooks/useAttachments"

const STATUSES: EngagementStatus[] = [
  "draft", "pending_approval", "approved", "in_review", "quotations_received", "rejected", "cancelled", "completed",
]

const lineItemSchema = z.object({
  description: z.string().min(1, "Description required"),
  quantity:    z.coerce.number().positive("Must be > 0"),
  unit:        z.string().optional(),
})

const createSchema = z.object({
  title:           z.string().min(1, "Title is required"),
  description:     z.string().optional(),
  category_ids:    z.array(z.string()).min(1, "Select at least one category"),
  vendor_ids:      z.array(z.string().uuid()).min(1, "Select at least one vendor"),
  estimated_value: z.coerce.number().min(0).optional().nullable(),
  currency:        z.string().default("INR"),
  start_date:      z.string().optional(),
  end_date:        z.string().optional(),
  notes:           z.string().optional(),
  line_items:      z.array(lineItemSchema).optional().default([]),
})
type CreateForm = z.infer<typeof createSchema>

function StatusChip({ status }: { status: EngagementStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${ENGAGEMENT_STATUS_COLORS[status]}`}>
      {ENGAGEMENT_STATUS_LABELS[status]}
    </span>
  )
}

function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  searchPlaceholder,
}: {
  options: { id: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder: string
  disabled?: boolean
  searchPlaceholder?: string
}) {
  const [open, setOpen] = useState(false)
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  const selectedLabels = options.filter((o) => value.includes(o.id)).map((o) => o.label)

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
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? "Search…"} />
          <CommandList className="max-h-56 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            <CommandEmpty>No results found.</CommandEmpty>
            {options.map((opt) => (
              <CommandItem key={opt.id} value={opt.label} onSelect={() => toggle(opt.id)}>
                <Checkbox
                  checked={value.includes(opt.id)}
                  className="mr-2 h-4 w-4"
                  onCheckedChange={() => toggle(opt.id)}
                />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function EngagementList() {
  const [search, setSearch]   = useState("")
  const [status, setStatus]   = useState<EngagementStatus | "">("")
  const [creating,       setCreating]       = useState(false)
  const [stagedFiles,    setStagedFiles]    = useState<File[]>([])

  const { canCreateEngagement } = usePermissions()
  const { data: engagements = [], isLoading } = useEngagements({ status: status || undefined, search })
  const { data: categories = [] }  = useCategories(true)
  const createEngagement   = useCreateEngagement()
  const uploadAttachments  = useUploadAttachments()

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema) as unknown as Resolver<CreateForm>,
    defaultValues: { category_ids: [], vendor_ids: [], currency: "INR", line_items: [] },
  })

  const { fields: lineItemFields, append: appendLineItem, remove: removeLineItem } =
    useFieldArray({ control: form.control, name: "line_items" })

  const watchedCategoryIds = form.watch("category_ids") ?? []
  const { data: vendors = [], isFetching: vendorsFetching } = useVendorsByCategories(watchedCategoryIds)

  // Auto-select all vendors when the fetched vendor list changes after a category pick.
  // A ref tracks whether we've already auto-selected for the current category set so that
  // manual deselections are not overridden on background refetches.
  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    if (vendors.length > 0 && !didAutoSelectRef.current && watchedCategoryIds.length > 0) {
      form.setValue("vendor_ids", vendors.map((v) => v.id), { shouldValidate: true })
      didAutoSelectRef.current = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors])

  const hasFilters = search || status

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(engagements, 10)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resetPage = useCallback(() => reset(), [])
  useEffect(() => { resetPage() }, [search, status, resetPage])

  function closeDialog() {
    setCreating(false)
    setStagedFiles([])
    form.reset({
      title:           "",
      description:     "",
      category_ids:    [],
      vendor_ids:      [],
      estimated_value: undefined,
      currency:        "INR",
      start_date:      "",
      end_date:        "",
      notes:           "",
      line_items:      [],
    })
    didAutoSelectRef.current = false
  }

  async function onSubmit(data: CreateForm) {
    let engagementId: string
    try {
      const engagement = await createEngagement.mutateAsync({
        title:           data.title,
        description:     data.description ?? null,
        category_ids:    data.category_ids,
        vendor_ids:      data.vendor_ids,
        estimated_value: data.estimated_value ?? null,
        currency:        data.currency,
        start_date:      data.start_date || null,
        end_date:        data.end_date || null,
        notes:           data.notes ?? null,
        line_items:      (data.line_items ?? []).map((li) => ({
          description: li.description,
          quantity:    li.quantity,
          unit_price:  0,
          unit:        li.unit ?? null,
        })),
      })
      engagementId = engagement.id
    } catch {
      return
    }
    if (stagedFiles.length > 0) {
      try {
        await uploadAttachments.mutateAsync({ entityType: "engagement", entityId: engagementId, files: stagedFiles })
      } catch { /* hook toasts its own error */ }
    }
    closeDialog()
  }

  return (
    <AnimatedPage>
      <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
        {/* Filters + action */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <SolarDuotoneIcon icon={Search01Icon} size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search by title…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
          </div>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as EngagementStatus)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{ENGAGEMENT_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { setSearch(""); setStatus("") }}>
              <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear
            </Button>
          )}
          {canCreateEngagement && (
            <Button size="sm" className="h-8 gap-1.5 text-xs ml-auto" onClick={() => setCreating(true)}>
              <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              New Engagement
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : engagements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No engagements found</p>
                    {hasFilters && <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((e, idx) => (
                  <TableRow key={e.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{e.title}</p>
                      {e.category?.name && <p className="text-xs text-muted-foreground mt-0.5">{e.category.name}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {(e.engagement_vendors ?? []).map(ev => ev.vendor?.company_name).filter(Boolean).join(", ")
                          || e.vendor?.company_name || "—"}
                      </p>
                    </TableCell>
                    <TableCell><StatusChip status={e.status} /></TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">
                        {e.estimated_value != null ? formatCurrency(e.estimated_value, e.currency) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(e.created_at), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/admin/engagements/${e.id}`}>
                          <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
          itemLabel="engagement"
        />
      </div>

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>New Engagement</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="create-engagement" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input {...form.register("title")} placeholder="Website redesign, IT support Q3…" />
                {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea {...form.register("description")} placeholder="Scope of work…" rows={2} />
              </div>

              <div className="space-y-1.5">
                <Label>Categories <span className="text-destructive">*</span></Label>
                <Controller
                  control={form.control}
                  name="category_ids"
                  render={({ field }) => (
                    <MultiSelect
                      options={categories.map((c) => ({ id: c.id, label: c.name }))}
                      value={field.value ?? []}
                      onChange={(ids) => {
                        field.onChange(ids)
                        form.setValue("vendor_ids", [])
                        didAutoSelectRef.current = false
                      }}
                      placeholder="Select categories"
                      searchPlaceholder="Search categories…"
                    />
                  )}
                />
                {form.formState.errors.category_ids && (
                  <p className="text-xs text-destructive">{form.formState.errors.category_ids.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Vendors <span className="text-destructive">*</span></Label>
                  {vendorsFetching && watchedCategoryIds.length > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="h-3 w-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Loading vendors…
                    </span>
                  )}
                </div>
                <Controller
                  control={form.control}
                  name="vendor_ids"
                  render={({ field }) => (
                    <MultiSelect
                      options={vendors.map((v) => ({ id: v.id, label: v.company_name }))}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      placeholder={watchedCategoryIds.length === 0 ? "Select categories first" : "Select vendors to invite"}
                      disabled={watchedCategoryIds.length === 0}
                      searchPlaceholder="Search vendors…"
                    />
                  )}
                />
                {form.formState.errors.vendor_ids && (
                  <p className="text-xs text-destructive">{form.formState.errors.vendor_ids.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estimated Value</Label>
                  <Input type="number" min={0} {...form.register("estimated_value")} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select defaultValue="INR" onValueChange={(v) => form.setValue("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" {...form.register("start_date")} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input type="date" {...form.register("end_date")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea {...form.register("notes")} placeholder="Additional context…" rows={2} />
              </div>

              {/* Line Items */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">Line Items</Label>
                    <p className="text-xs text-muted-foreground">Requested items/services (optional). Vendors will see these when quoting.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => appendLineItem({ description: "", quantity: 1, unit: "" })}
                  >
                    <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                    Add Item
                  </Button>
                </div>

                {lineItemFields.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                      <span className="col-span-7">Description</span>
                      <span className="col-span-2">Qty</span>
                      <span className="col-span-2">Unit</span>
                      <span className="col-span-1" />
                    </div>
                    {lineItemFields.map((field, i) => (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                        <div className="col-span-7">
                          <Input
                            {...form.register(`line_items.${i}.description`)}
                            placeholder="Item description"
                            className="h-8 text-xs"
                          />
                          {form.formState.errors.line_items?.[i]?.description && (
                            <p className="text-xs text-destructive mt-0.5">
                              {form.formState.errors.line_items[i]?.description?.message}
                            </p>
                          )}
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number" min={0.01} step="any"
                            {...form.register(`line_items.${i}.quantity`)}
                            placeholder="1"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            {...form.register(`line_items.${i}.unit`)}
                            placeholder="e.g. hrs"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => removeLineItem(i)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments */}
              <Separator />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold">Attachments</p>
                  <p className="text-xs text-muted-foreground">Optional files to attach (added after creation).</p>
                </div>
                <FileUploadZone
                  files={stagedFiles}
                  onChange={setStagedFiles}
                  disabled={createEngagement.isPending || uploadAttachments.isPending}
                />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-engagement"
              disabled={createEngagement.isPending || uploadAttachments.isPending}
            >
              {createEngagement.isPending
                ? "Creating…"
                : uploadAttachments.isPending
                ? "Uploading…"
                : "Create Engagement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
