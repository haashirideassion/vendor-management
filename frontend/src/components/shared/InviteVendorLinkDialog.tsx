import { useEffect, useState } from "react"
import { useCreateVendorInviteLink } from "@/hooks/useVendorInviteLinks"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { SolarDuotoneIcon, CopyIcon, Tick02Icon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"
import { format } from "date-fns"

type InviteTarget = { scope: "org" } | { scope: "group"; groupId: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: InviteTarget
  targetName?: string
}

export function InviteVendorLinkDialog({ open, onOpenChange, target, targetName }: Props) {
  const createLink = useCreateVendorInviteLink()
  const [result, setResult] = useState<{ token: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setResult(null)
      setCopied(false)
      return
    }
    createLink.mutate(target, {
      onSuccess: (data) => setResult(data),
      onError: (e: unknown) => toast.error((e as Error).message ?? "Failed to create invite link"),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const link = result ? `${window.location.origin}/signup?invite=${result.token}` : ""

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy to clipboard — copy the link manually")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite via Link</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
            Share this link with a vendor to sign up. Their{" "}
            {target.scope === "org" ? `Organisation Code${targetName ? ` for ${targetName}` : ""}` : `Group Code${targetName ? ` for ${targetName}` : ""}`}
            {" "}will be prefilled and locked automatically.
          </p>
          {createLink.isPending || !result ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
              Generating link…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" size="icon" variant="outline" onClick={handleCopy} title="Copy link">
                  <SolarDuotoneIcon icon={copied ? Tick02Icon : CopyIcon} size={16} strokeWidth={1.5} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {format(new Date(result.expiresAt), "dd MMM yyyy, h:mm a")}
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
