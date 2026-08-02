// ─── Geocoding Service ────────────────────────────────────────────────────────
// Reverse geocode koordinat → nama provinsi & negara
// Menentukan wilayah_tipe: dalam_wilayah | luar_wilayah | luar_negeri
import { config } from '../config/env'
import { db } from '../db/connection'
import { localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'

interface GeoResult {
  alamat:   string
  provinsi: string | null
  negara:   string | null
}

interface GoogleGeocodeResponse {
  status: string
  results?: Array<{
    formatted_address?: string
    address_components: Array<{ long_name: string; types: string[] }>
  }>
}

// ─── Reverse geocode via Google Maps API ─────────────────────────────────────
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  // 1. Coba Google Maps jika API Key tersedia
  if (config.googleMaps.apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleMaps.apiKey}&language=id`
      const res  = await fetch(url)
      const json = await res.json() as {
        status: string
        results: Array<{ formatted_address: string; address_components: Array<{ long_name: string; types: string[] }> }>
      }

      if (json.status === 'OK' && json.results?.length) {
        const result     = json.results[0]
        const components = result.address_components

        const provinsi = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name ?? null
        const negara   = components.find(c => c.types.includes('country'))?.long_name ?? null

        return {
          alamat:   result.formatted_address ?? '',
          provinsi,
          negara,
        }
      }
    } catch (err) {
      console.error('Google Maps Reverse Geocode failed:', err)
    }
  }

  // 2. Fallback menggunakan OpenStreetMap Nominatim (Gratis, tanpa API Key)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`
    const res = await fetch(url, { headers: { 'User-Agent': 'MeeTrip-SSO/1.0' } })
    if (res.ok) {
      const json = await res.json() as any
      if (json && json.address) {
        return {
          alamat:   json.display_name || '',
          provinsi: json.address.state || json.address.province || json.address.region || null,
          negara:   json.address.country || null,
        }
      }
    }
  } catch (err) {
    console.error('OSM Nominatim Reverse Geocode failed:', err)
  }

  return { alamat: '', provinsi: null, negara: null }
}

// ─── Tentukan wilayah_tipe ────────────────────────────────────────────────────
// Indonesia = default home country
export function getWilayahTipe(
  penempatanProvinsi: string | null,
  tujuanProvinsi:     string | null,
  tujuanNegara:       string | null,
): 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' {
  // Kalau beda negara
  if (tujuanNegara && tujuanNegara.toLowerCase() !== 'indonesia') {
    return 'luar_negeri'
  }
  // Sama provinsi = dalam_wilayah
  if (penempatanProvinsi && tujuanProvinsi &&
      normalizeProvinceName(penempatanProvinsi) === normalizeProvinceName(tujuanProvinsi)) {
    return 'dalam_wilayah'
  }
  // Beda provinsi tapi masih Indonesia = luar_wilayah
  return 'luar_wilayah'
}

function normalizeProvinceName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^provinsi\s+|^prov\.\s*/i, '')
    .replace(/[^a-z0-9]/g, '')
}

// ─── Resolve lokasi penempatan RESMI karyawan (bukan lokasi GPS real-time) ───
// Sumber kebenaran selalu di-refresh dari Portal SSO (ref_penempatan_area) agar
// tidak bergantung pada cache lokal yang bisa saja belum tersinkron. Nilai cache
// lokal (local_user_cache) hanya dipakai sebagai fallback jika Portal tak terjangkau.
export async function resolveEmployeePenempatan(portalUserId: string): Promise<{
  lat:      number | null
  lng:      number | null
  provinsi: string | null
  nama:     string | null
}> {
  const userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, portalUserId),
  })

  let lat  = userCache?.penempatanLat ? Number(userCache.penempatanLat) : null
  let lng  = userCache?.penempatanLng ? Number(userCache.penempatanLng) : null
  let nama = userCache?.penempatanNama ?? null

  if (userCache?.employeeId) {
    try {
      const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/employees?id=${userCache.employeeId}`, {
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
      console.error('Gagal mengambil data penempatan resmi dari Portal:', err)
    }
  }

  // Nilai cache disimpan saat SSO berhasil, jadi tetap dapat menjadi acuan ketika
  // Google Geocoding sedang tidak tersedia atau API key belum dikonfigurasi.
  let provinsi: string | null = userCache?.penempatanProvinsi ?? null
  if (lat != null && lng != null) {
    try {
      const geo = await reverseGeocode(lat, lng)
      provinsi = geo.provinsi ?? provinsi
    } catch (err) {
      console.error('Gagal reverse geocode lokasi penempatan:', err)
    }
  }

  return { lat, lng, provinsi, nama }
}

// ─── Hitung jarak (Haversine, meter) ────────────────────────────────────────
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6371 // km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number) { return deg * Math.PI / 180 }
