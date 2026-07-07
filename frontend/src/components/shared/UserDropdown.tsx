import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Logout01Icon } from "@/components/shared/SolarIcon"

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  procurement_admin: "Procurement Admin",
  finance_ap: "Finance AP",
  hr_user: "HR User",
  manager: "Manager",
  vendor: "Vendor",
}

interface UserDropdownProps {
  email?: string
  role?: string
  onSignOut: () => void
}

export function UserDropdown({ email, role, onSignOut }: UserDropdownProps) {
  const initial = email?.[0]?.toUpperCase() ?? "U"
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : ""

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full p-0"
          aria-label="User menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2">
          <p className="text-xs font-semibold truncate">{email ?? "User"}</p>
          {roleLabel && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{roleLabel}</p>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/8"
        >
          <SolarDuotoneIcon
            icon={Logout01Icon}
            size={14}
            strokeWidth={1.5}
            primaryColor="currentColor"
            secondaryColor="currentColor"
          />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
