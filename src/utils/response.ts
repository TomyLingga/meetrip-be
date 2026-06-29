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
