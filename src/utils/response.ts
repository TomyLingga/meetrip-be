// ─── Response Helpers ──────────────────────────────────────────────────────────
export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return meta ? { success: true as const, data, meta } : { success: true as const, data }
}

export function paginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
) {
  return {
    success: true as const,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  }
}

/**
 * Safely parse & clamp pagination query params.
 * page ≥ 1, limit within [1, maxLimit] (default max 100) to avoid unbounded scans.
 */
export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  opts: { defaultLimit?: number; maxLimit?: number } = {},
) {
  const defaultLimit = opts.defaultLimit ?? 20
  const maxLimit = opts.maxLimit ?? 100

  const rawPage = Number(query.page)
  const rawLimit = Number(query.limit)

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(Math.floor(rawLimit), maxLimit)
    : defaultLimit

  return { page, limit }
}
