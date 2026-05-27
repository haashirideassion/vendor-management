import { useState } from "react"

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  function reset() {
    setPage(1)
  }

  return { page: safePage, setPage, totalPages, totalItems: items.length, paginated, reset }
}
