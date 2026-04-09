import { useState } from "react"
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCategories"
import { PageHeader } from "@/components/shared/PageHeader"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import type { ServiceCategory } from "@/lib/types"
import { Pencil, Trash2, Plus } from "lucide-react"
import { toast } from "sonner"

interface CategoryForm {
  name: string
  description: string
  is_active: boolean
}

export function CategoryManagement() {
  const { data: categories = [], isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ServiceCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState<CategoryForm>({ name: "", description: "", is_active: true })

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

  const saving = createCategory.isPending || updateCategory.isPending

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div>
      <PageHeader title="Service Categories" description="Manage the categories vendors can be registered under.">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Add category
        </Button>
      </PageHeader>

      <div className="p-6 flex flex-col gap-3">
        {categories.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          </div>
        ) : (
          categories.map((cat) => (
            <Card key={cat.id}>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{cat.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${cat.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {cat.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(cat.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editTarget ? "Edit Category" : "New Category"}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name *</Label>
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
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editTarget ? "Save changes" : "Create category"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete category"
        description="This will delete the category. Vendors already assigned to it will be unaffected."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return
          deleteCategory.mutate(deleteTarget, {
            onSuccess: () => { setDeleteTarget(null); toast.success("Category deleted") },
            onError: (e) => toast.error(e.message),
          })
        }}
        loading={deleteCategory.isPending}
      />
    </div>
  )
}
