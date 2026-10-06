import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { authFetch } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

type Status = "verifying" | "success" | "error"

// The emailed link points at Supabase's own /auth/v1/verify endpoint, which
// consumes the single-use token, marks the email confirmed, then redirects here
// with the outcome in the URL hash: either a session (access_token + type) on
// success, or error / error_code / error_description on a bad link. That
// session is deliberately discarded -- the app signs in through its own
// /api/auth/login -- so we only read the outcome and scrub the hash.
const SUCCESS_TYPES = new Set(["signup", "magiclink", "email", "invite"])

export function VerifyEmailPage() {
  const [status, setStatus] = useState<Status>("verifying")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""))
    const errorCode = params.get("error_code") || params.get("error")
    const type = params.get("type")
    const hasToken = Boolean(params.get("access_token"))
    window.history.replaceState(null, "", window.location.pathname)

    if (errorCode) {
      setStatus("error")
      setMessage(
        errorCode === "otp_expired"
          ? "This verification link has expired or has already been used."
          : "This verification link is invalid.",
      )
    } else if (hasToken && type && SUCCESS_TYPES.has(type)) {
      setStatus("success")
    } else {
      setStatus("error")
      setMessage("This verification link is missing or invalid.")
    }
  }, [])

  async function resend(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setResending(true)
    try {
      const res = await authFetch("/api/auth/resend-verification", { email: email.trim() })
      const json = await res.json().catch(() => ({}))
      if (res.ok) toast.success(json.message ?? "If that account is awaiting verification, a new email has been sent.")
      else toast.error(json.error ?? "Could not send a new verification email.")
    } catch {
      toast.error("An unexpected error occurred.")
    } finally {
      setResending(false)
    }
  }

  if (status === "verifying") {
    return (
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Verifying your email…</CardTitle>
          <CardDescription>Please wait.</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    )
  }

  if (status === "success") {
    return (
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Email verified!</CardTitle>
          <CardDescription>Your account is now active. You can sign in.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/login" className="w-full">
            <Button className="w-full">Sign in</Button>
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl text-destructive">Verification failed</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <form onSubmit={resend}>
        <CardContent className="flex flex-col gap-2 pb-4">
          <Label htmlFor="verify-email-address">Send me a new verification email</Label>
          <Input
            id="verify-email-address"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </CardContent>
        <CardFooter className="flex flex-col gap-2 pt-0">
          <Button type="submit" className="w-full" disabled={resending || !email.trim()}>
            {resending ? "Sending…" : "Resend verification email"}
          </Button>
          <Link to="/login" className="w-full">
            <Button type="button" variant="outline" className="w-full">Back to sign in</Button>
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
