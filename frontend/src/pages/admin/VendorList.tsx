import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { useVendors } from "@/hooks/useVendors"
import { useCategories } from "@/hooks/useCategories"
import { usePagination } from "@/hooks/usePagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RatingStars } from "@/components/shared/RatingStars"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import { Search01Icon, Cancel01Icon, EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { VendorStatus } from "@/lib/types"
import { format } from "date-fns"

type TabValue = "active" | "dormant"

const PAGE_SIZE = 10

const ACTIVE_STATUSES: VendorStatus[] = ["active", "pending_review", "action_required"]
const DORMANT_STATUSES: VendorStatus[] = ["suspended", "rejected"]

export function VendorList() {
  const [tab, setTab] = useState<TabValue>("active")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<VendorStatus | "">("")
  const [category, setCategory] = useState("")

  // Fetch all vendors (no implicit status filter — we filter by tab below)
  const { data: allVendors = [], isLoading } = useVendors({ search, category })
  const { data: categories = [] } = useCategories()

  // Tab-based filtering
  const vendors =
    tab === "active"
      ? allVendors.filter((v) => ACTIVE_STATUSES.includes(v.status))
      : allVendors.filter((v) => DORMANT_STATUSES.includes(v.status))

  // Additional status filter within each tab
  const filtered = status ? vendors.filter((v) => v.status === status) : vendors

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(filtered, PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => { reset() }, [search, status, category, tab])

  const hasFilters = search || status || category

  const activeCount  = allVendors.filter((v) => ACTIVE_STATUSES.includes(v.status)).length
  const dormantCount = allVendors.filter((v) => DORMANT_STATUSES.includes(v.status)).length

  return (
    <AnimatedPage>
      <div className="pt-4 space-y-4">
        {/* Active / Dormant tabs */}
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabValue); setStatus("") }}>
          <TabsList className="h-9">
            <TabsTrigger value="active" className="text-sm gap-1.5">
              Active
              {activeCount > 0 && (
                <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[11px] font-semibold">
                  {activeCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="dormant" className="text-sm gap-1.5">
              Dormant
              {dormantCount > 0 && (
                <span className="rounded-full bg-muted text-muted-foreground px-1.5 py-0.5 text-[11px] font-semibold">
                  {dormantCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card shadow-none">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <HugeiconsIcon
              icon={Search01Icon}
              size={15}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="Search by name, email, or vendor ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as VendorStatus)}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {VENDOR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(""); setStatus(""); setCategory("") }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden shadow-none">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-28">Vendor ID</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categories</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rating</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Renewal</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm">Loading vendors…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    <div className="flex flex-col items-center gap-1">
                      <HugeiconsIcon icon={Search01Icon} size={24} strokeWidth={1.5} className="text-muted-foreground/40 mb-1" />
                      <p className="text-sm font-medium">No vendors found</p>
                      {hasFilters && (
                        <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((v, idx) => (
                  <TableRow
                    key={v.id}
                    className={`transition-colors hover:bg-accent/50 ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                  >
                    <TableCell>
                      {v.vendor_id_code ? (
                        <span className="inline-flex items-center font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5 text-muted-foreground font-medium">
                          {v.vendor_id_code}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{v.company_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.contact_email}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.vendor_categories?.map((vc) => (
                          <span
                            key={vc.id}
                            className="rounded-full bg-primary/8 border border-primary/15 px-2 py-0.5 text-xs font-medium text-foreground/80"
                          >
                            {vc.service_categories?.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {v.avg_rating ? (
                        <div className="flex items-center gap-1.5">
                          <RatingStars value={Math.round(v.avg_rating)} size="sm" />
                          <span className="text-xs text-muted-foreground tabular-nums">({v.avg_rating.toFixed(1)})</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {v.contract_anniversary
                          ? format(new Date(v.contract_anniversary), "dd MMM yyyy")
                          : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/admin/vendors/${v.id}`}>
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

        {/* Pagination */}
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
          itemLabel="vendor"
        />
      </div>
    </AnimatedPage>
  )
}
