import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, Link } from "react-router-dom"
import { useState } from "react"
import { authFetch } from "@/contexts/AuthContext"
import { encryptPassword, clearPublicKeyCache } from "@/lib/crypto"
import { useEmailCooldown } from "@/hooks/useEmailCooldown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
})
type FormData = z.infer<typeof schema>

export function SignupForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const { cooldown, startCooldown, isOnCooldown } = useEmailCooldown()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      async function attempt(isRetry = false) {
        const encryptedPassword = await encryptPassword(data.password)
        const res = await authFetch("/api/auth/register", {
          email: data.email,
          password: encryptedPassword,
          fullName: data.full_name,
          role: "vendor",
        })
        const json = await res.json()
        if (!res.ok) {
          if (!isRetry && json.error === "Invalid password encoding") {
            clearPublicKeyCache()
            return attempt(true)
          }
          toast.error(json.error ?? "Registration failed")
          startCooldown()
          return
        }
        startCooldown()
        toast.success("Account created! Check your email to verify, then sign in.")
        navigate("/login")
      }
      await attempt()
    } catch {
      toast.error("An unexpected error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create vendor account</CardTitle>
        <CardDescription>Register to begin the vendor onboarding process.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4 pb-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" placeholder="Jane Smith" {...register("full_name")} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" placeholder="jane@yourcompany.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm_password">Confirm password</Label>
            <Input id="confirm_password" type="password" {...register("confirm_password")} />
            {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-4">
          <Button type="submit" className="w-full" disabled={loading || isOnCooldown}>
            {loading ? "Creating account…" : isOnCooldown ? `Try again in ${cooldown}s` : "Create account"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Already registered?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
