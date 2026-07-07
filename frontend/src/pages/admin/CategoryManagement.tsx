import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCategories"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Edit01Icon, Delete01Icon, Add01Icon, Tag01Icon, Search01Icon,
  CheckmarkCircle01Icon, Cancel01Icon,
} from "@/components/shared/SolarIcon"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import type { ServiceCategory } from "@/lib/types"
import { format } from "date-fns"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

const PAGE_SIZE = 10

interface CategoryForm {
  name: string
  description: string
  is_active: boolean
}

function CategoryTable({
  categories,
  vendorCount,
  onEdit,
  onToggle,
  onDelete,
  toggling,
}: {
  categories: ServiceCategory[]
  vendorCount: (id: string) => number
  onEdit: (cat: ServiceCategory) => void
  onToggle: (cat: ServiceCategory) => void
  onDelete: (id: string) => void
  toggling: string | null
}) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [categories, search]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearch(v: string) {
    setSearch(v)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-xs">
        <SolarDuotoneIcon icon={Search01Icon} size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search categories…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">Description</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24">Vendors</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-24 hidden md:table-cell">Created</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <SolarDuotoneIcon icon={Tag01Icon} size={28} strokeWidth={1.5} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {search ? "No categories match your search." : "No categories here yet."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((cat, idx) => (
                <TableRow key={cat.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 ${cat.is_active ? "bg-primary/10" : "bg-muted"}`}>
                        <SolarDuotoneIcon
                          icon={Tag01Icon}
                          size={13}
                          strokeWidth={1.5}
                          className={cat.is_active ? "text-primary" : "text-muted-foreground"}
                        />
                      </div>
                      <span className="text-sm font-medium">{cat.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                      {cat.description ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums font-medium">{vendorCount(cat.id)}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(cat.created_at), "dd MMM yyyy")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => onEdit(cat)}
                        title="Edit"
                      >
                        <SolarDuotoneIcon icon={Edit01Icon} size={14} strokeWidth={1.5} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 w-7 p-0 ${cat.is_active ? "text-muted-foreground hover:text-orange-600" : "text-muted-foreground hover:text-green-600"}`}
                        onClick={() => onToggle(cat)}
                        disabled={toggling === cat.id}
                        title={cat.is_active ? "Deactivate" : "Activate"}
                      >
                        <SolarDuotoneIcon
                          icon={cat.is_active ? Cancel01Icon : CheckmarkCircle01Icon}
                          size={14}
                          strokeWidth={1.5}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(cat.id)}
                        title="Delete"
                      >
                        <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                      </Button>
                    </div>
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
        totalItems={filtered.length}
        onPageChange={setPage}
        itemLabel="category"
      />
    </div>
  )
}

export function CategoryManagement() {
  const { accessToken } = useAuth()
  const { data: categories = [], isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [sheetOpen, setSheetOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState<ServiceCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [toggling, setToggling]     = useState<string | null>(null)
  const [form, setForm]             = useState<CategoryForm>({ name: "", description: "", is_active: true })

  const { data: vcRows = [] } = useQuery({
    queryKey: ["vendor-category-counts"],
    queryFn: async () => {
      const { data } = await api.post<{ data: Array<{ category_id: string }> }>(
        "/api/categories/vendor-counts", {}, accessToken
      )
      return data ?? []
    },
  })
  const vendorCount = (catId: string) => vcRows.filter((r) => r.category_id === catId).length

  const activeCategories   = categories.filter((c) => c.is_active)
  const dormantCategories  = categories.filter((c) => !c.is_active)

  function openCreate() {
    setEditTarget(null)
    setForm({ name: "", description: "", is_active: true })
    setSheetOpen(true)
  }

  function openEdit(cat: ServiceCategory) {
    setEditTarget(cat)
    setForm({ name: cat.name, description: cat.description ?? "", is_active: cat.is_active })
    setSheetOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return }
    try {
      if (editTarget) {
        await updateCategory.mutateAsync({ id: editTarget.id, ...form })
        toast.success("Category updated")
      } else {
        await createCategory.mutateAsync({ name: form.name, description: form.description || undefined })
        toast.success("Category created")
      }
      setSheetOpen(false)
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  async function handleToggle(cat: ServiceCategory) {
    setToggling(cat.id)
    try {
      await updateCategory.mutateAsync({ id: cat.id, is_active: !cat.is_active })
      toast.success(cat.is_active ? "Category deactivated" : "Category activated")
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setToggling(null)
    }
  }

  const saving = createCategory.isPending || updateCategory.isPending

  if (isLoading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      Loading…
    </div>
  )

  return (
    <AnimatedPage>
      <div className="pt-4 space-y-4">
        {/* Tabs + Add button */}
        <Tabs defaultValue="active">
          <div className="flex items-center justify-between gap-3">
          <TabsList className="h-9">
            <TabsTrigger value="active" className="text-sm">
              Active
              {activeCategories.length > 0 && <span className="tab-count">{activeCategories.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="dormant" className="text-sm">
              Dormant
              {dormantCategories.length > 0 && <span className="tab-count">{dormantCategories.length}</span>}
            </TabsTrigger>
          </TabsList>
          <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
            <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
            Add category
          </Button>
          </div>

          <TabsContent value="active" className="mt-4">
            {activeCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed p-12 text-center">
                <SolarDuotoneIcon icon={Tag01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No active categories</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Create your first category to get started.</p>
                <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
                  <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
                  Add category
                </Button>
              </div>
            ) : (
              <CategoryTable
                categories={activeCategories}
                vendorCount={vendorCount}
                onEdit={openEdit}
                onToggle={handleToggle}
                onDelete={setDeleteTarget}
                toggling={toggling}
              />
            )}
          </TabsContent>

          <TabsContent value="dormant" className="mt-4">
            {dormantCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed p-12 text-center">
                <SolarDuotoneIcon icon={Tag01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No dormant categories</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Deactivated categories will appear here.</p>
              </div>
            ) : (
              <CategoryTable
                categories={dormantCategories}
                vendorCount={vendorCount}
                onEdit={openEdit}
                onToggle={handleToggle}
                onDelete={setDeleteTarget}
                toggling={toggling}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. IT & Software"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            {editTarget && (
              <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                <div>
                  <Label htmlFor="is_active" className="text-sm font-medium cursor-pointer">Active</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Vendors can be assigned to active categories</p>
                </div>
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editTarget ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete category"
        description="This will delete the category. Vendors already assigned to it will be unaffected."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (!deleteTarget) return
          deleteCategory.mutate(deleteTarget, {
            onSuccess: () => { setDeleteTarget(null); toast.success("Category deleted") },
            onError: (e) => toast.error(e.message),
          })
        }}
        loading={deleteCategory.isPending}
      />
    </AnimatedPage>
  )
}
