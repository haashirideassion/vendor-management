import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { CheckCircle2 } from "lucide-react"
import type { OnboardingData } from "./OnboardingWizard"

interface Props {
  data: OnboardingData
  onFinish: () => void
}

export function Step6Review({ data, onFinish }: Props) {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        </div>
        <CardTitle>Application Submitted!</CardTitle>
        <CardDescription>
          Your vendor application has been received and is under review. You will be notified by email once a decision is made.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Company</span>
            <span className="font-medium">{data.company_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contact</span>
            <span className="font-medium">{data.contact_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{data.contact_email}</span>
          </div>
          {data.contract_start_date && data.contract_end_date && (
            <div className="flex justify-between bg-primary/10 -mx-2 px-2 py-1.5 rounded-md border border-primary/20">
              <span className="text-primary font-medium">Contract Dates</span>
              <span className="font-bold text-primary">
                {data.contract_start_date} to {data.contract_end_date}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold text-yellow-700">Pending Review</span>
          </div>
        </div>

        <Button onClick={onFinish} className="w-full">Go to my dashboard</Button>
      </CardContent>
    </Card>
  )
}
