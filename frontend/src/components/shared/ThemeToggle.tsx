import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Sun01Icon, Moon01Icon, ComputerActivityIcon, CheckmarkCircle01Icon } from "@/components/shared/SolarIcon"

export function ThemeToggle({ size = "icon" }: { size?: "icon" | "sm" }) {
  const { theme, setTheme } = useTheme()

  const icon =
    theme === "dark"
      ? Moon01Icon
      : theme === "light"
        ? Sun01Icon
        : ComputerActivityIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} aria-label="Toggle theme" className="h-8 w-8 rounded-lg">
          <SolarDuotoneIcon icon={icon} size={16} strokeWidth={1.6} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2.5">
          <SolarDuotoneIcon icon={Sun01Icon} size={15} strokeWidth={1.5} className="text-amber-500" />
          <span>Light</span>
          {theme === "light" && <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.5} className="ml-auto text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2.5">
          <SolarDuotoneIcon icon={Moon01Icon} size={15} strokeWidth={1.5} className="text-indigo-400" />
          <span>Dark</span>
          {theme === "dark" && <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.5} className="ml-auto text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2.5">
          <SolarDuotoneIcon icon={ComputerActivityIcon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
          <span>System</span>
          {theme === "system" && <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={1.5} className="ml-auto text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
