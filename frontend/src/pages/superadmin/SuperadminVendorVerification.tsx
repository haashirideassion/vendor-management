import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { useVendorVerificationQueue, type VerificationQueueVendor } from "@/hooks/useVendorVerificationQueue"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SolarDuotoneIcon, Search01Icon, EyeIcon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { VENDOR_VERIFICATION_STATUS_LABELS, VENDOR_VERIFICATION_STATUS_COLORS } from "@/lib/constants"
import { format } from "date-fns"

// Deliberately blind to reach and financials: the query behind this page
// (POST /api/superadmin/vendors/verification-queue) selects ONLY legal/
// registration columns at the database level -- no bank details, no other
// compliance documents, no org/group that onboarded the vendor, and no
// onboarding-org admin identity either. Verify this against the actual
// hook/query, not just this component's rendering.

const PAGE_SIZE = 10

export function SuperadminVendorVerification() {
  const { data: vendors = [], isLoading } = useVendorVerificationQueue()
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState<VerificationQueueVendor["verificationStatus"] | "">("")

  const allCategories = useMemo(
    () => [...new Set(vendors.flatMap((v) => v.categories))].sort(),
    [vendors]
  )

  const searched = search.trim()
    ? vendors.filter((v) => v.companyLegalName.toLowerCase().includes(search.trim().toLowerCase()))
    : vendors
  const byCategory = category ? searched.filter((v) => v.categories.includes(category)) : searched
  const filtered = status ? byCategory.filter((v) => v.verificationStatus === status) : byCategory

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(filtered, PAGE_SIZE)
  useEffect(() => { reset() }, [search, category, status])

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <SolarDuotoneIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input placeholder="Search by company name" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {allCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : (v as VerificationQueueVendor["verificationStatus"]))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending Verification</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="rejected">Verification Rejected</SelectItem>
          </SelectContent>
        </Select>
        {(search || category || status) && (
          <Button
            variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground"
            onClick={() => { setSearch(""); setCategory(""); setStatus("") }}
          >
            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
            Clear
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Company Legal Name</TableHead>
              <TableHead className="w-[13%]">GST Number</TableHead>
              <TableHead className="w-[27%]">Category</TableHead>
              <TableHead className="w-[14%]">Status</TableHead>
              <TableHead className="w-[13%]">Submitted</TableHead>
              <TableHead className="w-[13%]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && paginated.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No vendors found.</TableCell></TableRow>
            )}
            {paginated.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium truncate" title={v.companyLegalName}>{v.companyLegalName}</TableCell>
                <TableCell className="text-muted-foreground truncate">{v.gstNumber ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground truncate" title={v.categories.join(", ")}>
                  {v.categories.length > 0 ? v.categories.join(", ") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`whitespace-nowrap ${VENDOR_VERIFICATION_STATUS_COLORS[v.verificationStatus]}`}>
                    {VENDOR_VERIFICATION_STATUS_LABELS[v.verificationStatus]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(v.submittedAt), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                    <Link to={`/admin/superadmin/vendor-verification/${v.id}`}>
                      <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                      View
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="vendor" />
    </AnimatedPage>
  )
}
