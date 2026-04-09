import { ThemeToggle } from "@/components/shared/ThemeToggle"

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">V</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Portal</h1>
        </div>
        <p className="text-sm text-muted-foreground">Powered by Ideasion</p>
      </div>
      {children}
    </div>
  )
}
