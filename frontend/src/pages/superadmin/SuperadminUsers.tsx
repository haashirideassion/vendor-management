import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { usePlatformUsers, type PlatformUser } from "@/hooks/useSuperadminUsers"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SolarDuotoneIcon, Search01Icon, EyeIcon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { format } from "date-fns"

type AccountTypeFilter = PlatformUser["accountType"] | ""
type StatusFilter = "active" | "suspended" | ""
type AdminFilter = "yes" | "no" | ""

const PAGE_SIZE = 10

export function SuperadminUsers() {
  const { data: users = [], isLoading } = usePlatformUsers()
  const [search, setSearch] = useState("")
  const [accountType, setAccountType] = useState<AccountTypeFilter>("")
  const [status, setStatus] = useState<StatusFilter>("")
  const [platformAdmin, setPlatformAdmin] = useState<AdminFilter>("")

  const searched = search.trim()
    ? users.filter((u) =>
        (u.fullName ?? "").toLowerCase().includes(search.trim().toLowerCase()) ||
        u.email.toLowerCase().includes(search.trim().toLowerCase())
      )
    : users
  const byType = accountType ? searched.filter((u) => u.accountType === accountType) : searched
  const byStatus = status ? byType.filter((u) => (status === "suspended" ? u.isSuspended : !u.isSuspended)) : byType
  const filtered = platformAdmin
    ? byStatus.filter((u) => (platformAdmin === "yes" ? u.isPlatformAdmin : !u.isPlatformAdmin))
    : byStatus

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(filtered, PAGE_SIZE)
  useEffect(() => { reset() }, [search, accountType, status, platformAdmin])

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
          <Input placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={accountType || "all"} onValueChange={(v) => setAccountType(v === "all" ? "" : (v as AccountTypeFilter))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Account type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="internal">Organization</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : (v as StatusFilter))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={platformAdmin || "all"} onValueChange={(v) => setPlatformAdmin(v === "all" ? "" : (v as AdminFilter))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Platform admin" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            <SelectItem value="yes">Platform admins only</SelectItem>
            <SelectItem value="no">Non-admins only</SelectItem>
          </SelectContent>
        </Select>
        {(search || accountType || status || platformAdmin) && (
          <Button
            variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground"
            onClick={() => { setSearch(""); setAccountType(""); setStatus(""); setPlatformAdmin("") }}
          >
            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
            Clear
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Account Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Platform Admin</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && paginated.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found.</TableCell></TableRow>
            )}
            {paginated.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium whitespace-nowrap">{u.fullName || "—"}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`whitespace-nowrap ${u.accountType === "vendor" ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-purple-100 text-purple-800 border-purple-200"}`}>
                    {u.accountType === "vendor" ? "Vendor" : "Organization"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {u.isSuspended ? (
                    <Badge variant="outline" className="whitespace-nowrap bg-red-100 text-red-800 border-red-200">suspended</Badge>
                  ) : (
                    <Badge variant="outline" className="whitespace-nowrap bg-green-100 text-green-800 border-green-200">active</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {u.isPlatformAdmin ? <Badge className="whitespace-nowrap">Platform Admin</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(u.createdAt), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs whitespace-nowrap">
                    <Link to={`/admin/superadmin/users/${u.id}`}>
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

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="user" />
    </AnimatedPage>
  )
}
