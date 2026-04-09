import { AuthLayout } from "@/components/layout/AuthLayout"
import { LoginForm } from "@/components/auth/LoginForm"

export function Login() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  )
}
