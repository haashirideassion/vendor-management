import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LEGAL_ENTITY_TYPES, LEGAL_ENTITY_TYPE_LABELS, EMPLOYEE_COUNT_RANGES } from "@/lib/constants"
import { useGroupCodeLookup } from "@/hooks/useGroups"
import type { OrgOnboardingDraft, LegalEntityType, EmployeeCountRange } from "@/lib/types"

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  saving: boolean
  onNext: (fields: Record<string, unknown>) => void
  onBack: () => void
}

export function Step2Establishment({ draft, readOnly, saving, onNext, onBack }: Props) {
  const [legalEntityType, setLegalEntityType] = useState<LegalEntityType | "">(draft.legal_entity_type ?? "")
  const [dateOfIncorporation, setDateOfIncorporation] = useState(draft.date_of_incorporation ?? "")
  const [employeeCountRange, setEmployeeCountRange] = useState<EmployeeCountRange | "">(draft.employee_count_range ?? "")
  const [isGroupCompany, setIsGroupCompany] = useState(draft.is_group_company)
  const [groupCode, setGroupCode] = useState(draft.group_code ?? "")
  const { data: groupLookup, isFetching: groupLookupLoading } = useGroupCodeLookup(isGroupCompany ? groupCode : "")

  const valid = !!legalEntityType && !!dateOfIncorporation && !!employeeCountRange
    && (!isGroupCompany || !!groupLookup)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onNext({
      legal_entity_type: legalEntityType,
      date_of_incorporation: dateOfIncorporation,
      employee_count_range: employeeCountRange,
      is_group_company: isGroupCompany,
      group_code: isGroupCompany ? groupCode.trim() : null,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Establishment / Company Basics</CardTitle>
        <CardDescription>Legal and structural details of your organisation.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Company / Establishment Name</Label>
            <Input value={draft.company_name ?? ""} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Legal Entity Type</RequiredLabel></Label>
            <Select value={legalEntityType} onValueChange={(v) => setLegalEntityType(v as LegalEntityType)} disabled={readOnly}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select entity type" /></SelectTrigger>
              <SelectContent>
                {LEGAL_ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{LEGAL_ENTITY_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Date of Incorporation</RequiredLabel></Label>
            <Input type="date" value={dateOfIncorporation} onChange={(e) => setDateOfIncorporation(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Total Employee Count</RequiredLabel></Label>
            <Select value={employeeCountRange} onValueChange={(v) => setEmployeeCountRange(v as EmployeeCountRange)} disabled={readOnly}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a range" /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_COUNT_RANGES.map((r) => (
                  <SelectItem key={r} value={r}>{r} employees</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isGroupCompany} onCheckedChange={(c) => setIsGroupCompany(c === true)} disabled={readOnly} />
            This organisation is part of a group company
          </label>
          {isGroupCompany && (
            <div className="flex flex-col gap-1.5">
              <Label><RequiredLabel>Group Code</RequiredLabel></Label>
              <Input
                placeholder="e.g. ACMEGRP-4F2A"
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value)}
                disabled={readOnly}
              />
              {groupCode.trim().length >= 3 && !groupLookupLoading && (
                groupLookup
                  ? <p className="text-xs text-green-600">{groupLookup.name}</p>
                  : <p className="text-xs text-destructive">Code not found</p>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
            <Button type="submit" className="flex-1" disabled={!valid || saving || readOnly}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
