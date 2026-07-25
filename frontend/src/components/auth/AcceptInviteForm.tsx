import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
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

export function AcceptInviteForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [tokenError, setTokenError] = useState(false)
  const [email, setEmail] = useState<string | null>(null)

  // Supabase's invite link delivers access_token/refresh_token/type=invite in
  // the URL hash fragment (not the query string), so it must be parsed
  // manually -- same shape as the password-recovery link ResetPasswordForm
  // handles, but establishing a live session rather than a one-off token.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "")
    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const type = params.get("type")
    const errorCode = params.get("error") || params.get("error_code")

    if (errorCode || !accessToken || !refreshToken || type !== "invite") {
      setTokenError(true)
      return
    }

    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error }) => {
        if (error || !data.user?.email) {
          setTokenError(true)
          return
        }
        setEmail(data.user.email)
        // Drop the tokens out of the visible URL/history once captured.
        window.history.replaceState(null, "", window.location.pathname)
      })
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    if (!email) return
    setLoading(true)
    try {
      // Supabase sets the password directly on its own side -- our backend
      // never sees the plaintext password at this step.
      const { error } = await supabase.auth.updateUser({ password: data.password })
      if (error) {
        toast.error(error.message ?? "Failed to set password")
        return
      }

      // Establish the app's own session the same way every other login
      // does (encrypted-in-transit, decrypted server-side, exchanged for a
      // Supabase session there) -- this also activates any 'invited'
      // organization_members rows for this profile.
      await login(email, data.password)
      toast.success("Password set. Welcome aboard!")
      navigate("/")
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
          <CardTitle className="text-xl text-destructive">Invite link expired</CardTitle>
          <CardDescription>
            This invite link has expired or is invalid. Ask whoever invited you to send a new one.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/login" className="w-full">
            <Button variant="outline" className="w-full">Back to login</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Set your password</CardTitle>
        <CardDescription>
          {email ? `Finish setting up ${email} by choosing a password.` : "Verifying your invite…"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-5 pb-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="••••••••" disabled={!email} {...register("password")} />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm_password">Confirm password</Label>
            <Input id="confirm_password" type="password" placeholder="••••••••" disabled={!email} {...register("confirm_password")} />
            {errors.confirm_password && <p className="text-xs text-destructive">{errors.confirm_password.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="pt-0">
          <Button type="submit" className="w-full" disabled={loading || !email}>
            {loading ? "Setting up…" : "Set password & sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
