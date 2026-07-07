const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

export const API_BASE =
  configuredApiUrl && !configuredApiUrl.includes("your-backend-vercel-url")
    ? configuredApiUrl.replace(/\/$/, "")
    : ""
