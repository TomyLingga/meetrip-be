import { config } from '../config/env'
import { db } from '../db/connection'
import { localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'
import { fetchWithTimeout } from '../utils/http'

export interface GeoResult {
  alamat:      string
  provinsi:    string | null
  negara:      string | null
  countryCode: string | null
}

interface GoogleGeocodeResponse {
  status: string
  results?: Array<{
    formatted_address?: string
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>
  }>
}

/**
 * Perform reverse geocoding to resolve address, province, country, and ISO country code
 * using Google Maps API with BigDataCloud & OpenStreetMap Nominatim fallbacks.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  // Primary Provider: Google Maps API
  if (config.googleMaps.apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleMaps.apiKey}&language=id`
      const res  = await fetchWithTimeout(url)
      const json = await res.json() as GoogleGeocodeResponse

      if (json.status === 'OK' && json.results?.length) {
        const result     = json.results[0]
        const components = result.address_components

        const provinsiObj = components.find(c => c.types.includes('administrative_area_level_1'))
        const negaraObj   = components.find(c => c.types.includes('country'))

        return {
          alamat:      result.formatted_address ?? '',
          provinsi:    provinsiObj?.long_name ?? null,
          negara:      negaraObj?.long_name ?? null,
          countryCode: negaraObj?.short_name ?? null,
        }
      }
    } catch (err) {
      console.error('[Geocoding] Google Maps Reverse Geocode error:', err)
    }
  }

  // High-performance Fallback Provider: BigDataCloud API
  try {
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`
    const bdcRes = await fetchWithTimeout(bdcUrl, { headers: { 'User-Agent': 'MeeTrip-SSO/1.0 (contact@inl.co.id)' } }, 3000)
    if (bdcRes.ok) {
      const bdc = await bdcRes.json() as any
      if (bdc && (bdc.countryName || bdc.countryCode)) {
        const alamat = [bdc.locality || bdc.city, bdc.principalSubdivision, bdc.countryName].filter(Boolean).join(', ')
        return {
          alamat:      alamat || bdc.countryName || '',
          provinsi:    bdc.principalSubdivision || null,
          negara:      bdc.countryName || null,
          countryCode: bdc.countryCode || null,
        }
      }
    }
  } catch (err) {
    console.error('[Geocoding] BigDataCloud Reverse Geocode error:', err)
  }

  // OpenStreetMap Nominatim Fallback
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'MeeTrip-SSO/1.0 (contact@inl.co.id)' } }, 4000)
    if (res.ok) {
      const json = await res.json() as any
      if (json && json.address) {
        return {
          alamat:      json.display_name || '',
          provinsi:    json.address.state || json.address.province || json.address.region || null,
          negara:      json.address.country || json.address.country_name || null,
          countryCode: json.address.country_code ? json.address.country_code.toUpperCase() : null,
        }
      }
    }
  } catch (err) {
    console.error('[Geocoding] OSM Nominatim Reverse Geocode error:', err)
  }

  return { alamat: '', provinsi: null, negara: null, countryCode: null }
}

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

/**
 * Calculates Haversine distance in kilometers between two geographic points.
 */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return deg * Math.PI / 180
}
