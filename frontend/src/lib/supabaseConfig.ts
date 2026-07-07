const FALLBACK_SUPABASE_URL = "https://qxvudwuspapheknxpziy.supabase.co"
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WCI-cGQRq-SIVfYFudev0A_p_8cXv4U"

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || FALLBACK_SUPABASE_URL
export const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || FALLBACK_SUPABASE_PUBLISHABLE_KEY
