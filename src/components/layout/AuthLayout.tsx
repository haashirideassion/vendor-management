import { Outlet } from "react-router-dom"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { AppLogo } from "@/components/shared/AppLogo"

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <AppLogo className="h-10 w-auto" />
        <ThemeToggle />
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
