import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, Link } from "react-router-dom"
import { authFetch } from "@/contexts/AuthContext"
import { encryptPassword, clearPublicKeyCache } from "@/lib/crypto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
})
type FormData = z.infer<typeof schema>

export function ResetPasswordForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  // Supabase's recovery link delivers access_token/type=recovery in the URL
  // hash fragment (not the query string), so it must be parsed manually.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "")
    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const type = params.get("type")
    const errorCode = params.get("error") || params.get("error_code")

    if (errorCode || !accessToken || type !== "recovery") {
      setTokenError(true)
      return
    }

    setToken(accessToken)
    // Drop the token out of the visible URL/history once captured.
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!token) return
    setLoading(true)
    try {
      async function attempt(isRetry = false) {
        const encryptedPassword = await encryptPassword(data.password)
        const res = await authFetch("/api/auth/reset-password", {
          token,
          password: encryptedPassword,
        })
        const json = await res.json()
        if (!res.ok) {
          if (!isRetry && json.error === "Invalid password encoding") {
            clearPublicKeyCache()
            return attempt(true)
          }
          toast.error(json.error ?? "Reset failed")
          if (res.status === 400) setTokenError(true)
          return
        }
        toast.success("Password updated successfully. Please sign in.")
        navigate("/login")
      }
      await attempt()
    } catch {
      toast.error("An unexpected error occurred.")
    } finally {
      setLoading(false)
    }
  }

  if (tokenError) {
    return (
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl text-destructive">Link expired</CardTitle>
          <CardDescription>
            This password reset link has expired or is invalid.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/forgot-password" className="w-full">
            <Button variant="outline" className="w-full">Request a new reset link</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Set new password</CardTitle>
        <CardDescription>Enter your new password below.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-5 pb-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input id="confirm_password" type="password" placeholder="••••••••" {...register("confirm_password")} />
            {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
