import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useEngagements, useCreateEngagement } from "@/hooks/useEngagements"
import { useVendors } from "@/hooks/useVendors"
import { useVendorCategories } from "@/hooks/useCategories"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { Search01Icon, Cancel01Icon, Add01Icon, EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const STATUSES: EngagementStatus[] = [
  "draft", "pending_approval", "approved", "rejected", "cancelled", "completed",
]

const createSchema = z.object({
  title:           z.string().min(1, "Title is required"),
  description:     z.string().optional(),
  vendor_id:       z.string().uuid("Select a vendor"),
  category_id:     z.string().optional(),
  estimated_value: z.coerce.number().positive("Must be greater than 0"),
  currency:        z.string().default("INR"),
  start_date:      z.string().optional(),
  end_date:        z.string().optional(),
  notes:           z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

function StatusChip({ status }: { status: EngagementStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${ENGAGEMENT_STATUS_COLORS[status]}`}>
      {ENGAGEMENT_STATUS_LABELS[status]}
    </span>
  )
}

export function EngagementList() {
  const [search, setSearch]   = useState("")
  const [status, setStatus]   = useState<EngagementStatus | "">("")
  const [creating, setCreating] = useState(false)

  const { canCreateEngagement } = usePermissions()
  const { data: engagements = [], isLoading } = useEngagements({ status: status || undefined, search })
  const { data: vendors = [] }    = useVendors({ status: "active" })
  const createEngagement = useCreateEngagement()

  const form = useForm<CreateForm>({ resolver: zodResolver(createSchema) })
  const watchedVendorId = form.watch("vendor_id")
  const { data: vendorCategories = [], isLoading: catLoading } = useVendorCategories(watchedVendorId)

  useEffect(() => {
    form.setValue("category_id", "")
  }, [watchedVendorId, form])

  const hasFilters = search || status

  async function onSubmit(data: CreateForm) {
    await createEngagement.mutateAsync({
      title:           data.title,
      description:     data.description ?? null,
      vendor_id:       data.vendor_id,
      category_id:     data.category_id || null,
      estimated_value: data.estimated_value,
      currency:        data.currency,
      start_date:      data.start_date || null,
      end_date:        data.end_date || null,
      notes:           data.notes ?? null,
    })
    setCreating(false)
    form.reset()
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Engagements</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${engagements.length} engagement${engagements.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canCreateEngagement && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              New Engagement
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
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
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : engagements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No engagements found</p>
                    {hasFilters && <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>}
                  </TableCell>
                </TableRow>
              ) : (
                engagements.map((e, idx) => (
                  <TableRow key={e.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{e.title}</p>
                      {e.category?.name && <p className="text-xs text-muted-foreground mt-0.5">{e.category.name}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{e.vendor?.company_name ?? "—"}</p>
                    </TableCell>
                    <TableCell><StatusChip status={e.status} /></TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{formatCurrency(e.estimated_value, e.currency)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {e.start_date ? format(new Date(e.start_date), "dd MMM yyyy") : "—"}
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
                          <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
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
      </div>

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
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
                <Label>Vendor <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => form.setValue("vendor_id", v, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Select active vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.formState.errors.vendor_id && <p className="text-xs text-destructive">{form.formState.errors.vendor_id.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.watch("category_id") ?? ""}
                  onValueChange={(v) => form.setValue("category_id", v)}
                  disabled={!watchedVendorId || catLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !watchedVendorId ? "Select vendor first" : catLoading ? "Loading…" : "Select category (optional)"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorCategories.length === 0 && watchedVendorId && !catLoading ? (
                      <SelectItem value="__none__" disabled>No categories assigned to vendor</SelectItem>
                    ) : (
                      vendorCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estimated Value <span className="text-destructive">*</span></Label>
                  <Input type="number" min={0} {...form.register("estimated_value")} placeholder="50000" />
                  {form.formState.errors.estimated_value && <p className="text-xs text-destructive">{form.formState.errors.estimated_value.message}</p>}
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
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setCreating(false); form.reset() }}>
              Cancel
            </Button>
            <Button type="submit" form="create-engagement" disabled={createEngagement.isPending}>
              {createEngagement.isPending ? "Creating…" : "Create Engagement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
