import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link } from "react-router-dom"
import { supabase, getRedirectUrl } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

const schema = z.object({
  email: z.string().email("Enter a valid email"),
})
type FormData = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: getRedirectUrl("/reset-password"),
    })
    setLoading(false)

    if (error) {
      const isRateLimit = error.status === 429 || error.code === "over_email_send_rate_limit" || error.message?.includes("rate limit")
      if (isRateLimit) {
        toast.error("Email rate limit exceeded. Please wait a few minutes before trying again.")
      } else {
        toast.error(error.message)
      }
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Check your email</CardTitle>
          <CardDescription>
            We sent a password reset link. Check your inbox and follow the instructions.
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-0">
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Forgot password</CardTitle>
        <CardDescription>Enter your email and we'll send you a reset link.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-5 pb-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@company.com" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 pt-0">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
          <Link to="/login" className="text-sm text-muted-foreground hover:text-primary hover:underline text-center">
            Back to sign in
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
