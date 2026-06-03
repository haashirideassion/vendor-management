import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { AuditLog } from "@/lib/types"

export function useAuditLog(vendorId?: string) {
  return useQuery({
    queryKey: ["audit_log", vendorId],
    queryFn: async () => {
      let query = supabase
        .from("audit_log")
        .select("*, profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(50)
      if (vendorId) query = query.eq("entity_id", vendorId)
      const { data, error } = await query
      if (error) throw error
      return data as AuditLog[]
    },
  })
}
