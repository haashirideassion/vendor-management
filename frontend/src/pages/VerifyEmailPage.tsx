import { useEffect, useState } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { authFetch } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const token = searchParams.get("token")
    const userId = searchParams.get("id")

    if (!token || !userId) {
      setStatus("error")
      setMessage("Invalid verification link.")
      return
    }

    authFetch("/api/auth/verify-email", { token, userId })
      .then(async (res) => {
        const json = await res.json()
        if (res.ok) {
          setStatus("success")
        } else {
          setStatus("error")
          setMessage(json.error ?? "Verification failed.")
        }
      })
      .catch(() => {
        setStatus("error")
        setMessage("An unexpected error occurred.")
      })
  }, [searchParams])

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
      <CardFooter>
        <Link to="/signup" className="w-full">
          <Button variant="outline" className="w-full">Back to sign up</Button>
        </Link>
      </CardFooter>
    </Card>
  )
}
