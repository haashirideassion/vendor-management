import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useContracts, useCreateContract } from "@/hooks/useContracts"
import { useVendors } from "@/hooks/useVendors"
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
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_SHORT,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPES,
  CONTRACT_STATUSES,
  CURRENCIES,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { ContractType, ContractStatus } from "@/lib/types"
import { format } from "date-fns"
import { Search01Icon, Cancel01Icon, Add01Icon, EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const createSchema = z.object({
  vendor_id:           z.string().uuid("Select a vendor"),
  contract_type:       z.string().min(1, "Select a contract type"),
  title:               z.string().min(1, "Title is required"),
  parent_id:           z.string().optional(),
  effective_date:      z.string().optional(),
  expiry_date:         z.string().optional(),
  total_value:         z.preprocess(
    (v) => (v === "" || v === undefined || v === null) ? undefined : v,
    z.coerce.number().positive().optional()
  ),
  currency:            z.string().default("INR"),
  auto_renew:          z.boolean().default(false),
  renewal_notice_days: z.coerce.number().int().min(1).default(30),
  notes:               z.string().optional(),
})
type CreateForm = z.infer<typeof createSchema>

function TypeBadge({ type }: { type: ContractType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_TYPE_COLORS[type]}`}>
      {CONTRACT_TYPE_SHORT[type]}
    </span>
  )
}

function StatusChip({ status }: { status: ContractStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_STATUS_COLORS[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  )
}

export function ContractList() {
  const [search, setSearch]             = useState("")
  const [typeFilter, setTypeFilter]     = useState<ContractType | "">("")
  const [statusFilter, setStatusFilter] = useState<ContractStatus | "">("")
  const [creating, setCreating]         = useState(false)

  const { canManageContracts } = usePermissions()

  const { data: allContracts = [], isLoading } = useContracts({
    contract_type: typeFilter || undefined,
    status:        statusFilter || undefined,
  })
  const { data: vendors = [] } = useVendors({ status: "active" })
  const { data: msas = [] }    = useContracts({ contract_type: "msa" })
  const createContract = useCreateContract()

  const contracts = search
    ? allContracts.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        (c.contract_ref ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (c.vendor?.company_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allContracts

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { currency: "INR", auto_renew: false, renewal_notice_days: 30 },
  })

  const watchedType = form.watch("contract_type")
  const hasFilters  = search || typeFilter || statusFilter

  async function onSubmit(data: CreateForm) {
    await createContract.mutateAsync({
      vendor_id:           data.vendor_id,
      contract_type:       data.contract_type as ContractType,
      title:               data.title,
      parent_id:           data.parent_id || null,
      effective_date:      data.effective_date || null,
      expiry_date:         data.expiry_date || null,
      total_value:         data.total_value ?? null,
      currency:            data.currency,
      auto_renew:          data.auto_renew,
      renewal_notice_days: data.renewal_notice_days,
      notes:               data.notes ?? null,
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
            <h1 className="text-xl font-bold tracking-tight">Contracts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${contracts.length} contract${contracts.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canManageContracts && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              New Contract
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by title, ref, or vendor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select
            value={typeFilter || "all"}
            onValueChange={(v) => setTypeFilter(v === "all" ? "" : v as ContractType)}
          >
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONTRACT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) => setStatusFilter(v === "all" ? "" : v as ContractStatus)}
          >
            <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CONTRACT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{CONTRACT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground"
              onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter("") }}
            >
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
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref / Title</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expiry</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</TableHead>
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
              ) : contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No contracts found</p>
                    {hasFilters && <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>}
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((c, idx) => (
                  <TableRow key={c.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{c.title}</p>
                      {c.contract_ref && (
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{c.contract_ref}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{c.vendor?.company_name ?? "—"}</p>
                    </TableCell>
                    <TableCell><TypeBadge type={c.contract_type} /></TableCell>
                    <TableCell><StatusChip status={c.status} /></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {c.expiry_date ? format(new Date(c.expiry_date), "dd MMM yyyy") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">
                        {c.total_value != null ? formatCurrency(c.total_value, c.currency) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/admin/contracts/${c.id}`}>
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
            <DialogTitle>New Contract</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="create-contract" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Vendor <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => form.setValue("vendor_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select active vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.vendor_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.vendor_id.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contract Type <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => form.setValue("contract_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {CONTRACT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.contract_type && (
                    <p className="text-xs text-destructive">{form.formState.errors.contract_type.message}</p>
                  )}
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

              {watchedType === "sow" && (
                <div className="space-y-1.5">
                  <Label>Parent MSA</Label>
                  <Select onValueChange={(v) => form.setValue("parent_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Link to parent MSA (optional)" /></SelectTrigger>
                    <SelectContent>
                      {msas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input {...form.register("title")} placeholder="Master Service Agreement with Acme Corp…" />
                {form.formState.errors.title && (
                  <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Effective Date</Label>
                  <Input type="date" {...form.register("effective_date")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Expiry Date</Label>
                  <Input type="date" {...form.register("expiry_date")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Total Value</Label>
                  <Input type="number" min={0} step="0.01" {...form.register("total_value")} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Notice Period (days)</Label>
                  <Input type="number" min={1} {...form.register("renewal_notice_days")} placeholder="30" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto_renew"
                  {...form.register("auto_renew")}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="auto_renew" className="font-normal cursor-pointer text-sm">
                  Auto-renew on expiry
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea {...form.register("notes")} placeholder="Additional terms or context…" rows={2} />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setCreating(false); form.reset() }}>
              Cancel
            </Button>
            <Button type="submit" form="create-contract" disabled={createContract.isPending}>
              {createContract.isPending ? "Creating…" : "Create Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
