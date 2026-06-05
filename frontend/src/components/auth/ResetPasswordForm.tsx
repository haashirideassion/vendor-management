import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "@/lib/supabase"
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
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [tokenError, setTokenError] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    async function initRecovery() {
      // PKCE flow: Supabase redirects with ?code= query param
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get("code")

      // Implicit flow: Supabase redirects with #access_token= hash fragment
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get("access_token")
      const refreshToken = hashParams.get("refresh_token") ?? ""
      const type = hashParams.get("type")

      if (code) {
        // PKCE: exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) setTokenError(true)
        else setRecoveryReady(true)
        return
      }

      if (accessToken && type === "recovery") {
        // Implicit: set session directly from hash tokens
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (error) setTokenError(true)
        else setRecoveryReady(true)
        return
      }

      // No recovery params in URL — check if session already exists (page refresh)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setRecoveryReady(true)
      } else {
        setTokenError(true)
      }
    }

    initRecovery()
  }, [])

  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    setLoading(false)

    if (error) {
      toast.error(error.message)
      return
    }

    await supabase.auth.signOut()
    toast.success("Password updated successfully. Please sign in.")
    navigate("/login")
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

  if (!recoveryReady) {
    return (
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Verifying reset link…</CardTitle>
          <CardDescription>Please wait while we verify your reset link.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
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
