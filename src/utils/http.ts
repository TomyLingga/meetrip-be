// ─── HTTP helper ──────────────────────────────────────────────────────────────
// Semua panggilan keluar (Portal API, geocoding) WAJIB lewat sini.
//
// Tanpa timeout, satu dependensi yang menggantung (Portal lambat, Nominatim
// tanpa SLA) membuat request MeeTrip ikut menggantung sampai koneksi pool habis —
// server tampak mati total padahal databasenya sehat.
const DEFAULT_TIMEOUT_MS = 8_000

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Versi yang tidak melempar: mengembalikan null bila gagal/timeout. */
export async function fetchJsonSafe<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, init, timeoutMs)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
