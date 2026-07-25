import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SignupForm } from "@/components/auth/SignupForm"
import { OrgSignupForm } from "@/components/auth/OrgSignupForm"

// /signup entry point -- two tabs, one per identity this app supports
// signing up as: a Vendor (SignupForm, existing) or an Organisation
// (OrgSignupForm, new). Each tab is a fully self-contained form/Card; this
// component only switches between them.
export function SignupTabs() {
  return (
    <Tabs defaultValue="vendor" className="w-full max-w-sm items-center">
      <TabsList>
        <TabsTrigger value="vendor">Vendor</TabsTrigger>
        <TabsTrigger value="organisation">Organisation</TabsTrigger>
      </TabsList>
      <TabsContent value="vendor" className="w-full">
        <SignupForm />
      </TabsContent>
      <TabsContent value="organisation" className="w-full">
        <OrgSignupForm />
      </TabsContent>
    </Tabs>
  )
}
