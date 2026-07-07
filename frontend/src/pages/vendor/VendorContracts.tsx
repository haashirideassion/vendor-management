import { useState } from "react"
import { Link } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"
import { useContracts } from "@/hooks/useContracts"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  ContractsIcon,
  Search01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  EyeIcon,
} from "@/components/shared/SolarIcon"
import { formatCurrency } from "@/lib/utils"
import { differenceInDays, format } from "date-fns"
import type { Contract, ContractStatus } from "@/lib/types"

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border/60",
  active: "bg-green-100 text-green-600 border-green-200",
  expired: "bg-orange-100 text-orange-700 border-orange-200",
  terminated: "bg-red-100 text-red-700 border-red-200",
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
}

const PAGE_SIZE = 10

function renewalStatus(contract: Contract): string {
  if (!contract.expiry_date) return "—"
  const days = differenceInDays(new Date(contract.expiry_date), new Date())
  if (days < 0) return "Expired"
  if (contract.auto_renew && days <= (contract.renewal_notice_days ?? 30)) return "Renewal Pending"
  return "—"
}

function ContractTable({
  contracts,
  showRenewal,
}: {
  contracts: Contract[]
  showRenewal: boolean
}) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)

  const filtered = contracts.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.contract_ref ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="relative">
        <SolarDuotoneIcon
          icon={Search01Icon}
          size={15}
          strokeWidth={1.5}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder="Search by name or contract ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
        />
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract ID</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Start Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">End Date</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</TableHead>
              {showRenewal && (
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Renewal</TableHead>
              )}
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showRenewal ? 8 : 7} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <SolarDuotoneIcon icon={ContractsIcon} size={20} strokeWidth={1.5} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {search ? "No contracts match your search." : "No contracts found."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((contract, idx) => (
                <TableRow
                  key={contract.id}
                  className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}
                >
                  <TableCell>
                    <p className="text-sm font-medium">{contract.title}</p>
                    <p className="text-xs text-muted-foreground uppercase">{contract.contract_type}</p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                      {contract.contract_ref ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {contract.effective_date ? format(new Date(contract.effective_date), "dd MMM yyyy") : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {contract.expiry_date ? format(new Date(contract.expiry_date), "dd MMM yyyy") : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${STATUS_COLORS[contract.status as ContractStatus]}`}>
                      {STATUS_LABELS[contract.status as ContractStatus]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium tabular-nums">
                      {contract.total_value != null
                        ? formatCurrency(contract.total_value, contract.currency ?? "INR")
                        : "—"}
                    </span>
                  </TableCell>
                  {showRenewal && (
                    <TableCell>
                      {(() => {
                        const r = renewalStatus(contract)
                        if (r === "Renewal Pending") {
                          return (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                              Renewal Pending
                            </span>
                          )
                        }
                        return <span className="text-xs text-muted-foreground">{r}</span>
                      })()}
                    </TableCell>
                  )}
                  <TableCell>
                    <Button asChild variant="ghost" size="sm" className="h-8 px-2 gap-1.5 text-xs">
                      <Link to={`/vendor/contracts/${contract.id}`}>
                        <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <SolarDuotoneIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <TableRow key={i}>
          {[1, 2, 3, 4, 5, 6, 7].map((j) => (
            <TableCell key={j}>
              <div className="h-4 rounded bg-muted animate-pulse" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

export function VendorContracts() {
  const { data: vendor } = useVendor()
  const { data: contracts = [], isLoading } = useContracts(
    vendor?.id ? { vendor_id: vendor.id } : undefined
  )

  const active = contracts.filter((c) => c.status === "active")
  const dormant = contracts.filter((c) => c.status === "expired" || c.status === "terminated")

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View all contracts associated with your vendor account.
          </p>
        </div>

        <Tabs defaultValue="active">
          <TabsList className="mb-4">
            <TabsTrigger value="active">
              Active Contracts
              <span className="tab-count">{isLoading ? "…" : active.length}</span>
            </TabsTrigger>
            <TabsTrigger value="dormant">
              Dormant Contracts
              <span className="tab-count">{isLoading ? "…" : dormant.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {isLoading ? (
              <Card>
                <CardContent className="p-0">
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableBody><SkeletonRows /></TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ContractTable contracts={active} showRenewal />
            )}
          </TabsContent>

          <TabsContent value="dormant">
            {isLoading ? (
              <Card>
                <CardContent className="p-0">
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableBody><SkeletonRows /></TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <ContractTable contracts={dormant} showRenewal={false} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AnimatedPage>
  )
}
