import { useEffect, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface AppLogoProps {
  className?: string
  variant?: "theme" | "color"
}

function getResolvedDark(theme: string): boolean {
  if (theme === "dark") return true
  if (theme === "light") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function AppLogo({ className, variant = "theme" }: AppLogoProps) {
  const { theme } = useTheme()
  const [isDark, setIsDark] = useState(() => getResolvedDark(theme))

  useEffect(() => {
    if (theme !== "system") {
      setIsDark(theme === "dark")
      return
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => setIsDark(mq.matches)
    handler()
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  const src = variant === "color" ? ( isDark ? "/sidelogo-dark.png" : "/logo-color.png" ) : isDark ? "/logo-dark.png" : "/logo-light.png"

  return (
    <img
      src={src}
      alt="Cognivend"
      className={cn("object-contain", className)}
      draggable={false}
    />
  )
}
