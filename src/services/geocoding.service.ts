// ─── Geocoding Service ────────────────────────────────────────────────────────
// Reverse geocode koordinat → nama provinsi & negara
// Menentukan wilayah_tipe: dalam_wilayah | luar_wilayah | luar_negeri
// Provider, cache, dan jarak tempuh ada di geo.service.ts.
import { config } from '../config/env'
import { db } from '../db/connection'
import { localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'
import { fetchWithTimeout } from '../utils/http'
import { reverseGeocode } from './geo.service'

// Reverse geocode (cache DB → Nominatim → BigDataCloud → Google opsional) dan
// jarak tempuh ada di geo.service.ts; diekspor ulang agar pemanggil lama tetap jalan.
export { reverseGeocode, haversineKm, travelDistance } from './geo.service'
export type { ReverseResult as GeoResult } from './geo.service'

/**
 * Dynamically determines business trip region classification (dalam_wilayah | luar_wilayah | luar_negeri)
 * by comparing home placement location and destination location globally.
 */
export function getWilayahTipe(
  penempatanProvinsi: string | null,
  tujuanProvinsi:     string | null,
  tujuanNegara:       string | null,
  lat?:               number | null,
  lng?:               number | null,
  tujuanCountryCode?: string | null,
  penempatanNegara?:  string | null,
  penempatanCountryCode?: string | null,
): 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' {
  const pCode = (penempatanCountryCode || 'ID').trim().toUpperCase()
  const pNegara = (penempatanNegara || 'Indonesia').trim().toLowerCase()

  let tCode = tujuanCountryCode ? tujuanCountryCode.trim().toUpperCase() : null
  let tNegara = tujuanNegara ? tujuanNegara.trim().toLowerCase() : null

  // Geofence check for Indonesia bounding box when countryCode is unavailable
  if (!tCode && pCode === 'ID' && lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    const nLat = Number(lat)
    const nLng = Number(lng)
    if (nLat !== 0 || nLng !== 0) {
      const isOutsideIdBox = nLat < -11.0 || nLat > 6.5 || nLng < 94.5 || nLng > 141.0
      if (isOutsideIdBox) {
        return 'luar_negeri'
      }
    }
  }

  // Cross-border country comparison
  if (tCode && pCode) {
    if (tCode !== pCode) {
      return 'luar_negeri'
    }
  } else if (tNegara) {
    const isSameCountry = normalizeCountryName(tNegara) === normalizeCountryName(pNegara) ||
                          (pCode === 'ID' && (tNegara === 'indonesia' || tNegara === 'id' || tNegara === 'republik indonesia'))
    if (!isSameCountry && tNegara !== '') {
      return 'luar_negeri'
    }
  }

  // Domestic same-province vs cross-province comparison
  if (penempatanProvinsi && tujuanProvinsi &&
      normalizeProvinceName(penempatanProvinsi) === normalizeProvinceName(tujuanProvinsi)) {
    return 'dalam_wilayah'
  }

  return 'luar_wilayah'
}

function normalizeCountryName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeProvinceName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^provinsi\s+|^prov\.\s*/i, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Resolves official placement location for an employee from SSO portal or local cache.
 */
export async function resolveEmployeePenempatan(portalUserId: string): Promise<{
  lat:         number | null
  lng:         number | null
  provinsi:    string | null
  negara:      string | null
  countryCode: string | null
  nama:        string | null
}> {
  const userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, portalUserId),
  })

  let lat  = userCache?.penempatanLat ? Number(userCache.penempatanLat) : null
  let lng  = userCache?.penempatanLng ? Number(userCache.penempatanLng) : null
  let nama = userCache?.penempatanNama ?? null

  if (userCache?.employeeId) {
    try {
      const portalRes = await fetchWithTimeout(`${config.portal.apiUrl}/api/sso/employees?id=${userCache.employeeId}`, {
        headers: { 'x-internal': config.portal.internalToken },
      })
      if (portalRes.ok) {
        const body = await portalRes.json() as { data: any[] }
        const empData = body.data?.[0]
        if (empData?.penempatanLat && empData?.penempatanLng) {
          lat  = Number(empData.penempatanLat)
          lng  = Number(empData.penempatanLng)
          nama = empData.penempatanNama ?? nama
        }
      }
    } catch (err) {
      console.error('[Geocoding] Failed to resolve placement data from SSO Portal:', err)
    }
  }

  // Nilai cache disimpan saat SSO berhasil, jadi tetap dapat menjadi acuan ketika
  // layanan reverse geocoding sedang tidak tersedia.
  let provinsi: string | null = userCache?.penempatanProvinsi ?? null
  let negara: string | null = null
  let countryCode: string | null = null

  if (lat != null && lng != null) {
    try {
      const geo = await reverseGeocode(lat, lng)
      provinsi = geo.provinsi ?? provinsi
      negara = geo.negara ?? null
      countryCode = geo.countryCode ?? null
    } catch (err) {
      console.error('[Geocoding] Failed to reverse geocode placement location:', err)
    }
  }

  return { lat, lng, provinsi, negara, countryCode, nama }
}
