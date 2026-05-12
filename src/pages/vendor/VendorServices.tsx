import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useVendor } from "@/hooks/useVendor"
import { supabase } from "@/lib/supabase"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Delete01Icon,
  ChartBarIncreasingIcon,
} from "@hugeicons/core-free-icons"
import type { VendorService } from "@/lib/types"
import { toast } from "sonner"

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

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Services</h1>
            <p className="text-sm text-muted-foreground">
              List the specific services your company offers.
            </p>
          </div>
          <Button size="sm" onClick={() => setSheetOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
            Add service
          </Button>
        </div>

        {/* Service list */}
        {services.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <HugeiconsIcon
                icon={ChartBarIncreasingIcon}
                size={24}
                strokeWidth={1.5}
                className="text-muted-foreground"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No services listed yet</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Add the specific services you offer to help admins and procurement teams understand your capabilities.
              </p>
            </div>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
              Add your first service
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((svc) => (
              <Card key={svc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-start justify-between gap-3 py-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <HugeiconsIcon
                        icon={ChartBarIncreasingIcon}
                        size={16}
                        strokeWidth={1.5}
                        className="text-primary"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{svc.name}</p>
                      {svc.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          {svc.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(svc.id)}
                    title="Remove service"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.5} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add service sheet */}
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
            <Button
              onClick={() => add.mutate()}
              disabled={!name.trim() || add.isPending}
            >
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
        variant="danger"
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
        loading={remove.isPending}
      />
    </AnimatedPage>
  )
}
