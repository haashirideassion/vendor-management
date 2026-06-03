import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useEmailCooldown } from "@/hooks/useEmailCooldown"

describe("useEmailCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts with cooldown at 0 and isOnCooldown false", () => {
    const { result } = renderHook(() => useEmailCooldown(60))
    expect(result.current.cooldown).toBe(0)
    expect(result.current.isOnCooldown).toBe(false)
  })

  it("sets cooldown to specified seconds when startCooldown is called", () => {
    const { result } = renderHook(() => useEmailCooldown(60))
    act(() => { result.current.startCooldown() })
    expect(result.current.cooldown).toBe(60)
    expect(result.current.isOnCooldown).toBe(true)
  })

  it("decrements cooldown by 1 each second", () => {
    const { result } = renderHook(() => useEmailCooldown(60))
    act(() => { result.current.startCooldown() })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.cooldown).toBe(59)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.cooldown).toBe(58)
  })

  it("resets to 0 when countdown completes", () => {
    const { result } = renderHook(() => useEmailCooldown(3))
    act(() => { result.current.startCooldown() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.cooldown).toBe(0)
    expect(result.current.isOnCooldown).toBe(false)
  })

  it("can be restarted — resets timer from full duration", () => {
    const { result } = renderHook(() => useEmailCooldown(60))
    act(() => { result.current.startCooldown() })
    act(() => { vi.advanceTimersByTime(20000) })
    expect(result.current.cooldown).toBe(40)

    // Restart
    act(() => { result.current.startCooldown() })
    expect(result.current.cooldown).toBe(60)
  })

  it("uses default 60s when no argument given", () => {
    const { result } = renderHook(() => useEmailCooldown())
    act(() => { result.current.startCooldown() })
    expect(result.current.cooldown).toBe(60)
  })

  it("clears interval on unmount to prevent memory leaks", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval")
    const { result, unmount } = renderHook(() => useEmailCooldown(60))
    act(() => { result.current.startCooldown() })
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it("isOnCooldown is false after cooldown expires", () => {
    const { result } = renderHook(() => useEmailCooldown(2))
    act(() => { result.current.startCooldown() })
    expect(result.current.isOnCooldown).toBe(true)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.isOnCooldown).toBe(false)
  })
})
