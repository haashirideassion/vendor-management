import { useState, useRef, useCallback, useEffect } from "react"

export const EMAIL_COOLDOWN_SECONDS = 60

export function useEmailCooldown(seconds = EMAIL_COOLDOWN_SECONDS) {
  const [cooldown, setCooldown] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCooldown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    setCooldown(seconds)
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [seconds])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  return { cooldown, startCooldown, isOnCooldown: cooldown > 0 }
}
