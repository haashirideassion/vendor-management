import { useState } from "react"
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCategories"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Edit01Icon, Delete01Icon, Add01Icon, Tag01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ServiceCategory } from "@/lib/types"
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

  if (isLoading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      Loading…
    </div>
  )

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Service Categories</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage the categories vendors can be registered under.
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 shrink-0">
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
            Add category
          </Button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Tag01Icon} size={14} strokeWidth={1.5} />
            <span>{categories.length} total</span>
          </span>
          <span className="text-border">·</span>
          <span>{categories.filter((c) => c.is_active).length} active</span>
          <span className="text-border">·</span>
          <span>{categories.filter((c) => !c.is_active).length} inactive</span>
        </div>

        {/* Categories list */}
        {categories.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <HugeiconsIcon icon={Tag01Icon} size={32} strokeWidth={1.5} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No categories yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Create your first category to get started.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
              Add category
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {categories.map((cat, idx) => (
              <Card key={cat.id} className={`shadow-none transition-colors hover:bg-accent/30 group ${idx % 2 === 0 ? "" : "bg-muted/15"}`}>
                <CardContent className="flex items-center justify-between gap-4 py-4 px-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${cat.is_active ? "bg-primary/10" : "bg-muted"}`}>
                      <HugeiconsIcon
                        icon={Tag01Icon}
                        size={15}
                        strokeWidth={1.5}
                        className={cat.is_active ? "text-primary" : "text-muted-foreground"}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{cat.name}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          cat.is_active
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {cat.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(cat)}
                    >
                      <HugeiconsIcon icon={Edit01Icon} size={14} strokeWidth={1.5} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(cat.id)}
                    >
                      <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
            <Button onClick={handleSave} disabled={saving} className="w-full mt-2">
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
    </AnimatedPage>
  )
}
