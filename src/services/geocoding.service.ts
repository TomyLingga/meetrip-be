// ─── Geocoding Service ────────────────────────────────────────────────────────
// Reverse geocode koordinat → nama provinsi & negara
// Menentukan wilayah_tipe: dalam_wilayah | luar_wilayah | luar_negeri
import { config } from '../config/env'

interface GeoResult {
  alamat:   string
  provinsi: string | null
  negara:   string | null
}

// ─── Reverse geocode via Google Maps API ─────────────────────────────────────
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  if (!config.googleMaps.apiKey) {
    return { alamat: `${lat},${lng}`, provinsi: null, negara: null }
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${config.googleMaps.apiKey}&language=id`
  const res  = await fetch(url)
  const json = await res.json()

  if (json.status !== 'OK' || !json.results?.length) {
    return { alamat: `${lat},${lng}`, provinsi: null, negara: null }
  }

  const result     = json.results[0]
  const components = result.address_components as Array<{ long_name: string; types: string[] }>

  const provinsi = components.find(c => c.types.includes('administrative_area_level_1'))?.long_name ?? null
  const negara   = components.find(c => c.types.includes('country'))?.long_name ?? null

  return {
    alamat:   result.formatted_address ?? `${lat},${lng}`,
    provinsi,
    negara,
  }
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
      penempatanProvinsi.toLowerCase() === tujuanProvinsi.toLowerCase()) {
    return 'dalam_wilayah'
  }
  // Beda provinsi tapi masih Indonesia = luar_wilayah
  return 'luar_wilayah'
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
