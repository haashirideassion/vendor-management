import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useVendor } from "@/hooks/useVendor"
import { supabase } from "@/lib/supabase"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import type { VendorService } from "@/lib/types"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

export function VendorServices() {
  const { data: vendor } = useVendor()
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["vendor_services", vendor?.id],
    enabled: !!vendor?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_services")
        .select("*")
        .eq("vendor_id", vendor!.id)
        .order("created_at")
      if (error) throw error
      return data as VendorService[]
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("vendor_services")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ vendor_id: vendor!.id, name, description: description || null } as any)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_services"] })
      setSheetOpen(false)
      setName("")
      setDescription("")
      toast.success("Service added")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_services").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor_services"] })
      setDeleteTarget(null)
      toast.success("Service removed")
    },
  })

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div>
      <PageHeader title="Services" description="List the specific services your company offers.">
        <Button size="sm" onClick={() => setSheetOpen(true)}>Add service</Button>
      </PageHeader>

      <div className="p-6 flex flex-col gap-3">
        {services.length === 0 ? (
          <EmptyState
            title="No services listed yet"
            description="Add the specific services you offer to help admins and procurement teams understand your capabilities."
            action={<Button size="sm" onClick={() => setSheetOpen(true)}>Add your first service</Button>}
          />
        ) : (
          services.map((svc) => (
            <Card key={svc.id}>
              <CardContent className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="text-sm font-medium">{svc.name}</p>
                  {svc.description && <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(svc.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Service</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Service name *</Label>
              <Input
                placeholder="e.g. Network Infrastructure Setup"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the service…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Button onClick={() => add.mutate()} disabled={!name.trim() || add.isPending}>
              {add.isPending ? "Adding…" : "Add service"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove service"
        description="Are you sure you want to remove this service from your profile?"
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
        loading={remove.isPending}
      />
    </div>
  )
}
