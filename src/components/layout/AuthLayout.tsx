import { Outlet } from "react-router-dom"
import { ThemeToggle } from "@/components/shared/ThemeToggle"
import { HugeiconsIcon } from "@hugeicons/react"
import { Building06Icon } from "@hugeicons/core-free-icons"

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <HugeiconsIcon icon={Building06Icon} size={18} className="text-primary" strokeWidth={1.8} />
          </div>
          <span className="text-sm font-semibold tracking-tight">Vendor Portal</span>
        </div>
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
