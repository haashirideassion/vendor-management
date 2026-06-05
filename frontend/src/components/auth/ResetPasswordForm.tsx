import { useEffect, useRef, useState } from "react"
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    // Subscribe FIRST — before getSession — so we don't miss the event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        if (timerRef.current) clearTimeout(timerRef.current)
        setRecoveryReady(true)
      }
    })

    // Also check immediately in case the event already fired (client processed hash before mount)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (timerRef.current) clearTimeout(timerRef.current)
        setRecoveryReady(true)
      }
    })

    // Generous timeout — only show error if truly nothing happens
    timerRef.current = setTimeout(() => setTokenError(true), 15000)

    return () => {
      subscription.unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
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

  // Token expired or invalid
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

  // Waiting for recovery session
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
