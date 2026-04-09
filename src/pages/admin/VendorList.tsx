import { useState } from "react"
import { Link } from "react-router-dom"
import { useVendors } from "@/hooks/useVendors"
import { useCategories } from "@/hooks/useCategories"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RatingStars } from "@/components/shared/RatingStars"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import type { VendorStatus } from "@/lib/types"
import { format } from "date-fns"

export function VendorList() {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<VendorStatus | "">("")
  const [category, setCategory] = useState("")

  const { data: vendors = [], isLoading } = useVendors({ search, status, category })
  const { data: categories = [] } = useCategories()

  return (
    <div>
      <PageHeader title="Vendors" description={`${vendors.length} vendor${vendors.length !== 1 ? "s" : ""} found`} />

      <div className="p-6 flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search by name, email, or vendor ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as VendorStatus | "")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {VENDOR_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{VENDOR_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || status || category) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatus(""); setCategory("") }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor ID</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Renewal</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              ) : vendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No vendors found.</TableCell>
                </TableRow>
              ) : (
                vendors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.vendor_id_code ?? "—"}</TableCell>
                    <TableCell>
                      <p className="font-medium">{v.company_name}</p>
                      <p className="text-xs text-muted-foreground">{v.contact_email}</p>
                    </TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.vendor_categories?.map((vc) => (
                          <span key={vc.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {vc.service_categories?.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {v.avg_rating ? (
                        <div className="flex items-center gap-1">
                          <RatingStars value={Math.round(v.avg_rating)} size="sm" />
                          <span className="text-xs text-muted-foreground">({v.avg_rating.toFixed(1)})</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.contract_anniversary
                        ? format(new Date(v.contract_anniversary), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/vendors/${v.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
