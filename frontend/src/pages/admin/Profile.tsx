import { useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import { useUpdateMyProfile } from "@/hooks/useMyProfile"
import { useOrgOnboardingSummary } from "@/hooks/useOrgOnboarding"
import { useOrgOnboardingDocumentSignedUrl } from "@/hooks/useDocuments"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  UserCircleIcon, Building06Icon, Edit01Icon, File01Icon, EyeIcon,
} from "@/components/shared/SolarIcon"
import { ORG_ONBOARDING_DOCUMENT_LABELS, NATURE_OF_OPERATIONS_LABELS } from "@/lib/constants"
import type { NatureOfOperations } from "@/lib/types"
import { toast } from "sonner"

export function Profile() {
  const { profile, refreshProfile } = useAuth()
  const { activeOrg } = useOrg()
  const updateMyProfile = useUpdateMyProfile()
  const isAdmin = !!activeOrg?.roleNames.includes("Admin")
  const { data: draft } = useOrgOnboardingSummary()
  const getOnboardingDocUrl = useOrgOnboardingDocumentSignedUrl()

  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? "")
  const [mobile, setMobile] = useState(profile?.mobile ?? "")

  function startEditing() {
    setFullName(profile?.full_name ?? "")
    setMobile(profile?.mobile ?? "")
    setEditing(true)
  }

  async function handleSave() {
    if (!fullName.trim()) return toast.error("Name is required")
    try {
      await updateMyProfile.mutateAsync({ fullName: fullName.trim(), mobile: mobile.trim() })
      await refreshProfile()
      toast.success("Your details were updated")
      setEditing(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update your details")
    }
  }

  async function openOnboardingDoc(path: string) {
    try { window.open(await getOnboardingDocUrl(path), "_blank") }
    catch { toast.error("Could not open document") }
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SolarDuotoneIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">My Details</CardTitle>
              </div>
              {!editing ? (
                <Button type="button" size="sm" variant="outline" onClick={startEditing}>
                  <SolarDuotoneIcon icon={Edit01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button type="button" size="sm" onClick={handleSave} disabled={updateMyProfile.isPending}>
                    {updateMyProfile.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</Label>
              {editing ? (
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9" />
              ) : (
                <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
              <p className="text-sm font-medium">{profile?.email ?? "—"}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mobile</Label>
              {editing ? (
                <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9" placeholder="+91XXXXXXXXXX" />
              ) : (
                <p className="text-sm font-medium">{profile?.mobile ?? "—"}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <SolarDuotoneIcon icon={Building06Icon} size={16} strokeWidth={1.5} className="text-primary" />
              <CardTitle className="text-base">Organization Details</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {activeOrg ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organization name</Label>
                  <p className="text-sm font-medium">{activeOrg.name}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organization code</Label>
                  <p className="text-sm font-medium">
                    {activeOrg.orgCode ?? <span className="text-muted-foreground font-normal">Pending superadmin approval</span>}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Slug</Label>
                  <p className="text-sm font-medium">{activeOrg.slug}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role mode</Label>
                  <p className="text-sm font-medium capitalize">{activeOrg.roleMode}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your role</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeOrg.roleNames.length > 0
                      ? activeOrg.roleNames.map((r) => <Badge key={r} variant="outline">{r}</Badge>)
                      : <p className="text-sm text-muted-foreground">—</p>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active organization selected.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
              {isAdmin && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/team">Manage Team</Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/org-onboarding">Org Onboarding</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && draft && (
          <>
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={Building06Icon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Locations ({(draft.locations ?? []).length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {(draft.locations ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">None recorded.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {draft.locations!.map((loc) => (
                      <div key={loc.id} className="rounded-lg border p-3 text-sm space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{loc.location_name}</p>
                          {loc.is_registered_office && <Badge className="h-4 px-1 text-[9px]">Registered Office</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {[loc.address, loc.city, loc.state, loc.pincode].filter(Boolean).join(", ") || "No address on file"}
                        </p>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <span>Employees: {loc.employee_count ?? "—"}</span>
                          <span>Nature: {loc.nature_of_operations ? NATURE_OF_OPERATIONS_LABELS[loc.nature_of_operations as NatureOfOperations] : "—"}</span>
                          <span>Women employees: {loc.has_women_employees === null ? "—" : loc.has_women_employees ? "Yes" : "No"}</span>
                          <span>Contract labour: {loc.has_contract_labour === null ? "—" : loc.has_contract_labour ? "Yes" : "No"}</span>
                          <span>Shift operations: {loc.has_shift_operations === null ? "—" : loc.has_shift_operations ? "Yes" : "No"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={File01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Documents ({(draft.documents ?? []).length})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(draft.documents ?? []).length === 0 && <p className="text-sm text-muted-foreground">None uploaded.</p>}
                {(draft.documents ?? []).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg shrink-0 bg-muted">
                        <SolarDuotoneIcon icon={File01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{ORG_ONBOARDING_DOCUMENT_LABELS[doc.document_type]}</p>
                        <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => openOnboardingDoc(doc.storage_path)}
                    >
                      <SolarDuotoneIcon icon={EyeIcon} size={15} strokeWidth={1.5} />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Authorized Signatory</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</Label>
                  <p className="text-sm font-medium">{draft.signatory_name ?? "—"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Designation</Label>
                  <p className="text-sm font-medium">{draft.signatory_designation ?? "—"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
                  <p className="text-sm font-medium">{draft.signatory_email ?? "—"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mobile</Label>
                  <p className="text-sm font-medium">{draft.signatory_mobile ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AnimatedPage>
  )
}
