import { AuthLayout } from "@/components/layout/AuthLayout"
import { SignupForm } from "@/components/auth/SignupForm"

export function Signup() {
  return (
    <AuthLayout>
      <SignupForm />
    </AuthLayout>
  )
}
