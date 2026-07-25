import { useEffect, useState } from "react"

const STORAGE_KEY = "vms_sidebar_collapsed"

// Shared across all three portal layouts (admin/vendor/superadmin) so the
// preference is a single "I like a compact sidebar" choice, not one the
// user has to repeat per portal.
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1" } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0") } catch { /* storage unavailable */ }
  }, [collapsed])

  return [collapsed, setCollapsed] as const
}
