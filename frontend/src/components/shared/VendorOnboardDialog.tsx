import { useState } from "react"
import { useAdminOnboardVendor, useInvitePortalUser } from "@/hooks/useVendors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { toast } from "sonner"

interface VendorOnboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The org this submission is made "as" -- required by requireOrg on the backend regardless of entry point. */
  actingOrgId: string
  /** Present when launched from a Group Overview screen -- grants access across every org currently in the group (snapshot). Omitted for a standalone org's own vendor list (org-only reach). */
  groupId?: string
  groupName?: string
}

const EMPTY_FORM = { companyName: "", adminName: "", workEmail: "" }

// Simplified "New Vendor" flow (Phase 6.3): only the minimum needed to create
// a vendor stub and invite its first admin -- everything else (tax/bank
// details, categories, documents) is filled in by that invited admin
// themselves once they accept and log in, mirroring how org self-signup
// already separates "create the account" from "fill in the rest".
export function VendorOnboardDialog({ open, onOpenChange, actingOrgId, groupId, groupName }: VendorOnboardDialogProps) {
  const onboard = useAdminOnboardVendor()
  const invitePortalUser = useInvitePortalUser()
  const [form, setForm] = useState(EMPTY_FORM)

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleClose() {
    onOpenChange(false)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit() {
    if (!form.companyName.trim() || !form.adminName.trim() || !form.workEmail.trim()) {
      return toast.error("Company name, admin name, and work email are required")
    }
    try {
      const result = await onboard.mutateAsync({
        company_name: form.companyName.trim(),
        contact_name: form.adminName.trim(),
        contact_email: form.workEmail.trim(),
        groupId,
        actingOrgId,
      })
      const invite = await invitePortalUser.mutateAsync(result.id)
      toast.success(
        invite.inviteSent
          ? `Vendor created — invite sent to ${invite.email}`
          : `Vendor created — ${invite.email} already had an account, linked to this vendor's portal`
      )
      handleClose()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to onboard vendor")
    }
  }

  const submitting = onboard.isPending || invitePortalUser.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Vendor</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
            {groupId
              ? `This vendor will be usable across every organization currently in ${groupName ?? "this group"}. Orgs that join the group later won't automatically gain access — that's a separate action.`
              : "This vendor will be usable only for this organization."}
            {" "}An invite to complete their profile will be sent to the work email below — if that email already has an account, it's linked to this vendor's portal instead.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="Acme Supplies Pvt Ltd" />
            </div>
            <div className="space-y-1.5">
              <Label>Initial admin name</Label>
              <Input value={form.adminName} onChange={(e) => set("adminName", e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Work email</Label>
              <Input type="email" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} placeholder="jane@acme.com" />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create & Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
