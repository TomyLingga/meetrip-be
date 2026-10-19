// ─── Geo Service ──────────────────────────────────────────────────────────────
// Pencarian tempat, reverse geocode, link Google Maps, dan jarak tempuh.
//
// Jalur utama seluruhnya gratis (data OpenStreetMap), tanpa API berbayar:
//   • Pencarian / autocomplete : cache DB (tempat yang pernah dipilih) → Photon
//   • Reverse geocode          : cache DB → Nominatim → BigDataCloud → Google (opsional)
//   • Link Google Maps         : koordinat diambil dari URL yang ditempel user
//   • Jarak tempuh             : OSRM (bila OSRM_URL diisi) → garis lurus (haversine)
//
// Google Geocoding hanya dipanggil bila GOOGLE_MAPS_API_KEY diisi DAN Nominatim
// serta BigDataCloud gagal, supaya deteksi provinsi (acuan wilayah & pagu) tetap jalan.
import { and, desc, eq, like, sql } from 'drizzle-orm'
import { db } from '../db/connection'
import { geoPlaceCache, geoReverseCache } from '../db/schema'
import { config } from '../config/env'

export interface GeoPlace {
  id:       string
  nama:     string
  alamat:   string
  lat:      number
  lng:      number
  kategori: string | null
  sumber:   'tersimpan' | 'osm'
}

export interface ReverseResult {
  alamat:      string
  provinsi:    string | null
  negara:      string | null
  countryCode: string | null // ISO 3166-1 alpha-2, mis. 'ID'
}

const EMPTY_REVERSE: ReverseResult = { alamat: '', provinsi: null, negara: null, countryCode: null }

export interface LatLng {
  lat: number
  lng: number
}

// ─── Cache in-memory sederhana (TTL + batas jumlah entri) ────────────────────
class TtlCache<V> {
  private store = new Map<string, { value: V; expiresAt: number }>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(ttlMs: number, maxEntries: number) {
    this.ttlMs = ttlMs
    this.maxEntries = maxEntries
  }

  get(key: string): V | undefined {
    const hit = this.store.get(key)
    if (!hit) return undefined
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return hit.value
  }

  set(key: string, value: V) {
    this.store.delete(key)
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
    if (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
  }
}

// Hasil Photon per query — ketikan yang sama tidak dikirim ulang ke provider.
const photonMemo = new TtlCache<GeoPlace[]>(10 * 60_000, 300)
// Tempat yang pernah dikirim ke client. /select hanya menerima id dari sini,
// jadi isi cache DB selalu berasal dari provider, bukan dari body request.
const issuedPlaces = new TtlCache<GeoPlace>(60 * 60_000, 2000)
const routeMemo = new TtlCache<{ km: number; metode: 'jalan' | 'garis_lurus' }>(24 * 60 * 60_000, 500)
const inflightReverse = new Map<string, Promise<ReverseResult>>()

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function fetchJson<T>(url: string, timeoutMs = 8000, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.geo.userAgent, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`)
  return res.json() as Promise<T>
}

function errMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

// Kegagalan tabel cache (mis. migrasi belum dijalankan) tidak boleh mematikan
// alur BTO — cukup dicatat, lalu lanjut ke provider.
async function safeCache<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task()
  } catch (err) {
    console.error(`[geo] Cache ${label} gagal:`, errMessage(err))
    return fallback
  }
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function searchTerms(query: string) {
  return normalizeText(query)
    .split(/[^a-z0-9]+/)
    .filter(term => term.length >= 2)
    .slice(0, 6)
}

function uniqueParts(parts: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const part of parts) {
    const value = part?.trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

// ─── Jarak garis lurus (Haversine, km) ───────────────────────────────────────
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

// ═══ Pencarian tempat ═════════════════════════════════════════════════════════

// Label kategori OSM yang sering muncul di pencarian perjalanan dinas.
const KATEGORI_LABEL: Record<string, string> = {
  hotel: 'Hotel', guest_house: 'Penginapan', hostel: 'Penginapan', motel: 'Penginapan', apartment: 'Apartemen',
  aerodrome: 'Bandara', terminal: 'Terminal Bandara', station: 'Stasiun', halt: 'Stasiun', bus_station: 'Terminal Bus',
  ferry_terminal: 'Pelabuhan', harbour: 'Pelabuhan', port: 'Pelabuhan',
  government: 'Kantor Pemerintah', townhall: 'Kantor Pemerintah', administrative: 'Kantor Pemerintah',
  company: 'Kantor', office: 'Kantor', commercial: 'Gedung Komersial', industrial: 'Kawasan Industri',
  hospital: 'Rumah Sakit', clinic: 'Klinik', university: 'Universitas', college: 'Kampus', school: 'Sekolah',
  restaurant: 'Restoran', cafe: 'Kafe', bank: 'Bank', mall: 'Mal', marketplace: 'Pasar',
  city: 'Kota', town: 'Kota', village: 'Desa', suburb: 'Kelurahan', hamlet: 'Dusun', county: 'Kabupaten', state: 'Provinsi',
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    osm_type?: string
    osm_id?: number
    osm_value?: string
    name?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    county?: string
    state?: string
    country?: string
  }
}

function photonToPlace(feature: PhotonFeature): GeoPlace | null {
  const p = feature.properties ?? {}
  const [lng, lat] = feature.geometry?.coordinates ?? []
  if (lat == null || lng == null || !isValidLatLng(lat, lng)) return null

  const jalan = uniqueParts([p.street, p.housenumber]).join(' ')
  const nama = p.name || jalan || p.city || p.county || p.state
  if (!nama) return null

  const alamat = uniqueParts([jalan, p.district ?? p.locality, p.city, p.county, p.state, p.country])
    .filter(part => part !== nama)
    .join(', ')

  return {
    id: p.osm_type && p.osm_id != null ? `osm:${p.osm_type}${p.osm_id}` : `osm:${lat.toFixed(5)},${lng.toFixed(5)}`,
    nama,
    alamat,
    lat,
    lng,
    kategori: (p.osm_value && KATEGORI_LABEL[p.osm_value]) || null,
    sumber: 'osm',
  }
}

async function searchPhoton(query: string, bias: LatLng | null, limit: number): Promise<GeoPlace[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  if (bias) {
    params.set('lat', bias.lat.toFixed(4))
    params.set('lon', bias.lng.toFixed(4))
  }
  const json = await fetchJson<{ features?: PhotonFeature[] }>(`${config.geo.photonUrl}/api/?${params}`, 6000)
  return (json.features ?? [])
    .map(photonToPlace)
    .filter((place): place is GeoPlace => place !== null)
}

async function searchCachedPlaces(query: string, limit: number): Promise<GeoPlace[]> {
  const terms = searchTerms(query)
  if (terms.length === 0) return []
  const rows = await db.select().from(geoPlaceCache)
    .where(and(...terms.map(term => like(geoPlaceCache.searchText, `%${term}%`))))
    .orderBy(desc(geoPlaceCache.hitCount), desc(geoPlaceCache.lastUsedAt))
    .limit(limit)
  return rows.map(row => ({
    id:       row.placeKey,
    nama:     row.nama,
    alamat:   row.alamat,
    lat:      Number(row.lat),
    lng:      Number(row.lng),
    kategori: row.kategori,
    sumber:   'tersimpan' as const,
  }))
}

// Photon sering mengembalikan objek yang sama dua kali (node + way gedung).
function dedupePlaces(items: GeoPlace[]) {
  const seen = new Set<string>()
  return items.filter(item => {
    const byName = `${normalizeText(item.nama)}@${item.lat.toFixed(3)},${item.lng.toFixed(3)}`
    if (seen.has(item.id) || seen.has(byName)) return false
    seen.add(item.id)
    seen.add(byName)
    return true
  })
}

/**
 * Autocomplete tempat. Minimal 3 karakter; hasil tersimpan (paling sering
 * dipilih) tampil lebih dulu, lalu hasil OpenStreetMap via Photon.
 */
export async function searchPlaces(rawQuery: string, bias: LatLng | null): Promise<{ items: GeoPlace[]; providerError: boolean }> {
  const query = rawQuery.trim().slice(0, 120)
  if (query.length < 3) return { items: [], providerError: false }

  const cached = await safeCache('cari tempat', () => searchCachedPlaces(query, 5), [] as GeoPlace[])

  const memoKey = `${normalizeText(query)}|${bias ? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}` : '-'}`
  let remote = photonMemo.get(memoKey)
  let providerError = false
  if (!remote) {
    try {
      remote = await searchPhoton(query, bias, 8)
      photonMemo.set(memoKey, remote)
    } catch (err) {
      providerError = true
      remote = []
      console.error('[geo] Pencarian Photon gagal:', errMessage(err))
    }
  }

  const items = dedupePlaces([...cached, ...remote]).slice(0, 10)
  items.forEach(item => issuedPlaces.set(item.id, item))
  return { items, providerError }
}

/** Catat tempat yang dipilih user agar pencarian berikutnya dilayani dari cache. */
export async function recordPlaceSelection(id: string): Promise<boolean> {
  const place = issuedPlaces.get(id)
  if (!place) return false

  const now = new Date()
  return safeCache('simpan tempat', async () => {
    await db.insert(geoPlaceCache).values({
      placeKey:   place.id,
      source:     place.id.split(':')[0],
      nama:       place.nama.slice(0, 255),
      alamat:     place.alamat,
      kategori:   place.kategori,
      lat:        place.lat.toFixed(7),
      lng:        place.lng.toFixed(7),
      // Kategori ikut diindeks: "bandara kualanamu" tetap cocok dengan "Bandar Udara …".
      searchText: normalizeText(`${place.nama} ${place.kategori ?? ''} ${place.alamat}`),
      hitCount:   1,
      lastUsedAt: now,
    }).onConflictDoUpdate({
      target: geoPlaceCache.placeKey,
      set: {
        hitCount:   sql`${geoPlaceCache.hitCount} + 1`,
        lastUsedAt: now,
        searchText: sql`excluded.search_text`,
      },
    })
    return true
  }, false)
}

// ═══ Reverse geocode ═════════════════════════════════════════════════════════

// ISO 3166-2:ID → nama provinsi baku. Nominatim tidak selalu mengisi `state`
// (contoh: Jakarta), tetapi kode ISO-nya konsisten, jadi perbandingan
// provinsi penempatan vs tujuan tetap akurat.
const PROVINSI_ISO: Record<string, string> = {
  'ID-AC': 'Aceh',
  'ID-SU': 'Sumatera Utara',
  'ID-SB': 'Sumatera Barat',
  'ID-RI': 'Riau',
  'ID-KR': 'Kepulauan Riau',
  'ID-JA': 'Jambi',
  'ID-SS': 'Sumatera Selatan',
  'ID-BB': 'Kepulauan Bangka Belitung',
  'ID-BE': 'Bengkulu',
  'ID-LA': 'Lampung',
  'ID-JK': 'DKI Jakarta',
  'ID-JB': 'Jawa Barat',
  'ID-BT': 'Banten',
  'ID-JT': 'Jawa Tengah',
  'ID-YO': 'DI Yogyakarta',
  'ID-JI': 'Jawa Timur',
  'ID-BA': 'Bali',
  'ID-NB': 'Nusa Tenggara Barat',
  'ID-NT': 'Nusa Tenggara Timur',
  'ID-KB': 'Kalimantan Barat',
  'ID-KT': 'Kalimantan Tengah',
  'ID-KS': 'Kalimantan Selatan',
  'ID-KI': 'Kalimantan Timur',
  'ID-KU': 'Kalimantan Utara',
  'ID-SA': 'Sulawesi Utara',
  'ID-ST': 'Sulawesi Tengah',
  'ID-SN': 'Sulawesi Selatan',
  'ID-SG': 'Sulawesi Tenggara',
  'ID-GO': 'Gorontalo',
  'ID-SR': 'Sulawesi Barat',
  'ID-MA': 'Maluku',
  'ID-MU': 'Maluku Utara',
  'ID-PA': 'Papua',
  'ID-PB': 'Papua Barat',
  'ID-PD': 'Papua Barat Daya',
  'ID-PT': 'Papua Tengah',
  'ID-PE': 'Papua Pegunungan',
  'ID-PS': 'Papua Selatan',
}

// Kebijakan Nominatim publik: maksimal 1 request/detik per aplikasi.
let nominatimQueue: Promise<unknown> = Promise.resolve()
let nominatimLastAt = 0

function throttleNominatim<T>(task: () => Promise<T>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const wait = nominatimLastAt + 1100 - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    nominatimLastAt = Date.now()
    return task()
  })
  nominatimQueue = run.catch(() => undefined)
  return run
}

interface NominatimReverse {
  error?: string
  display_name?: string
  address?: Record<string, string | undefined>
}

async function reverseNominatim(lat: number, lng: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    'accept-language': 'id',
  })
  const json = await throttleNominatim(() =>
    fetchJson<NominatimReverse>(`${config.geo.nominatimUrl}/reverse?${params}`, 8000),
  )
  if (!json || json.error || !json.address) return null

  const address = json.address
  const provinsiKode = address['ISO3166-2-lvl4'] ?? null
  const negaraKode = address.country_code ? address.country_code.toUpperCase().slice(0, 2) : null
  return {
    alamat:       json.display_name ?? '',
    provinsi:     (provinsiKode && PROVINSI_ISO[provinsiKode]) || address.state || address.province || address.region || null,
    provinsiKode,
    negara:       negaraKode === 'ID' ? 'Indonesia' : (address.country ?? null),
    negaraKode,
  }
}

// Cadangan gratis kedua. Provinsinya hanya dipakai bila kodenya provinsi ISO yang
// sah: untuk Jakarta BigDataCloud mengembalikan "Jawa" (ID-JW), yang bukan provinsi.
async function reverseBigDataCloud(lat: number, lng: number): Promise<ReverseResult | null> {
  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lng), localityLanguage: 'id' })
  const json = await fetchJson<{
    principalSubdivisionCode?: string
    countryName?: string
    countryCode?: string
    city?: string
    locality?: string
  }>(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, 4000)
  if (!json?.countryCode && !json?.countryName) return null

  const countryCode = json.countryCode ? json.countryCode.toUpperCase().slice(0, 2) : null
  const provinsi = (json.principalSubdivisionCode && PROVINSI_ISO[json.principalSubdivisionCode]) || null
  const negara = countryCode === 'ID' ? 'Indonesia' : (json.countryName ?? null)
  return {
    alamat: uniqueParts([json.locality, json.city, provinsi, negara]).join(', '),
    provinsi,
    negara,
    countryCode,
  }
}

async function reverseGoogle(lat: number, lng: number): Promise<ReverseResult | null> {
  const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: config.googleMaps.apiKey, language: 'id' })
  const json = await fetchJson<{
    status: string
    results?: Array<{
      formatted_address?: string
      address_components: Array<{ long_name: string; short_name: string; types: string[] }>
    }>
  }>(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, 8000)
  const result = json.status === 'OK' ? json.results?.[0] : undefined
  if (!result) return null
  const components = result.address_components
  const country = components.find(c => c.types.includes('country'))
  return {
    alamat:      result.formatted_address ?? '',
    provinsi:    components.find(c => c.types.includes('administrative_area_level_1'))?.long_name ?? null,
    negara:      country?.long_name ?? null,
    countryCode: country?.short_name ?? null,
  }
}

function coordKey(lat: number, lng: number) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`
}

async function resolveReverse(lat: number, lng: number, key: string): Promise<ReverseResult> {
  try {
    const osm = await reverseNominatim(lat, lng)
    if (osm) {
      await safeCache('simpan reverse', async () => {
        await db.insert(geoReverseCache).values({ coordKey: key, ...osm, source: 'nominatim' }).onConflictDoNothing()
      }, undefined)
      return { alamat: osm.alamat, provinsi: osm.provinsi, negara: osm.negara, countryCode: osm.negaraKode }
    }
  } catch (err) {
    console.error('[geo] Reverse Nominatim gagal:', errMessage(err))
  }

  // Cadangan (tidak di-cache, supaya titik ini dicoba lagi ke Nominatim berikutnya).
  try {
    const bdc = await reverseBigDataCloud(lat, lng)
    if (bdc) return bdc
  } catch (err) {
    console.error('[geo] Reverse BigDataCloud gagal:', errMessage(err))
  }

  // Cadangan terakhir. Hasil Google sengaja tidak disimpan ke cache (ToS Google).
  if (config.googleMaps.apiKey) {
    try {
      const google = await reverseGoogle(lat, lng)
      if (google) return google
    } catch (err) {
      console.error('[geo] Reverse Google gagal:', errMessage(err))
    }
  }

  return { ...EMPTY_REVERSE }
}

/** Koordinat → alamat, provinsi, negara. Hasil OSM di-cache permanen per koordinat. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseResult> {
  if (!isValidLatLng(lat, lng)) return { ...EMPTY_REVERSE }

  const key = coordKey(lat, lng)
  const cached = await safeCache('baca reverse', async () => {
    const [row] = await db.select().from(geoReverseCache).where(eq(geoReverseCache.coordKey, key)).limit(1)
    return row ?? null
  }, null)
  if (cached) {
    return { alamat: cached.alamat, provinsi: cached.provinsi, negara: cached.negara, countryCode: cached.negaraKode }
  }

  const pending = inflightReverse.get(key)
  if (pending) return pending

  const task = resolveReverse(lat, lng, key).finally(() => inflightReverse.delete(key))
  inflightReverse.set(key, task)
  return task
}

// ═══ Link Google Maps ════════════════════════════════════════════════════════
// User bisa mencari tempat di aplikasi/situs Google Maps miliknya sendiri, lalu
// menempelkan link "Bagikan". Tidak ada Google Maps API yang dipanggil di sini.

const GOOGLE_MAPS_HOST = /(^|\.)google\.(com|co\.id|[a-z]{2,3}(\.[a-z]{2})?)$/i
const SHORT_LINK_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co)$/i

function parseLatLngPair(value: string | null): LatLng | null {
  const match = value?.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  return isValidLatLng(lat, lng) ? { lat, lng } : null
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseGoogleMapsUrl(url: URL): { point: LatLng | null; nama: string | null } {
  const decoded = safeDecode(url.pathname + url.search + url.hash)

  // Titik pin tempat (paling akurat): ...!3d3.1319965!4d99.3425704
  const pins = Array.from(decoded.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g))
  const lastPin = pins[pins.length - 1]
  let point: LatLng | null = lastPin ? parseLatLngPair(`${lastPin[1]},${lastPin[2]}`) : null

  if (!point) {
    for (const param of ['q', 'query', 'll', 'center', 'destination', 'daddr', 'sll']) {
      point = parseLatLngPair(url.searchParams.get(param))
      if (point) break
    }
  }
  // Tengah tampilan peta: /@3.1319965,99.3425704,17z
  if (!point) {
    const viewport = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    if (viewport) point = parseLatLngPair(`${viewport[1]},${viewport[2]}`)
  }

  // Nama tempat: /maps/place/<nama>/ atau ?q=<nama> (link bisnis tanpa koordinat)
  const placeSegment = url.pathname.match(/\/maps\/place\/([^/@]+)/)?.[1]
  const candidates = [
    placeSegment ? safeDecode(placeSegment.replace(/\+/g, ' ')) : null,
    url.searchParams.get('q'),
    url.searchParams.get('query'),
  ]
  const nama = candidates
    .map(text => text?.trim() ?? '')
    .find(text => text.length > 0 && !parseLatLngPair(text))
  return { point, nama: nama ? nama.slice(0, 200) : null }
}

function isAllowedMapsHost(host: string) {
  return GOOGLE_MAPS_HOST.test(host) || SHORT_LINK_HOST.test(host)
}

/**
 * Ambil koordinat dan/atau nama tempat dari link Google Maps. Bila link tidak
 * memuat koordinat (mis. link bisnis `?q=Nama&ftid=…`), hanya nama yang
 * dikembalikan supaya client bisa mencarinya lewat pencarian gratis.
 */
export async function resolveMapLink(raw: string): Promise<{ point: LatLng | null; nama: string | null } | null> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isAllowedMapsHost(url.hostname)) return null

  let nama: string | null = null
  for (let hop = 0; hop < 5; hop++) {
    const parsed = parseGoogleMapsUrl(url)
    nama = parsed.nama ?? nama
    if (parsed.point) return { point: parsed.point, nama }

    // Hanya link pendek (maps.app.goo.gl) yang diikuti redirect-nya; halaman
    // Google Maps sendiri tidak di-scrape. Setiap hop dibatasi ke domain Google
    // agar endpoint ini tidak bisa dipakai untuk SSRF.
    if (!SHORT_LINK_HOST.test(url.hostname)) break
    const res = await fetch(url.toString(), {
      redirect: 'manual',
      headers: { 'User-Agent': config.geo.userAgent },
      signal: AbortSignal.timeout(6000),
    })
    const location = res.headers.get('location')
    if (res.status < 300 || res.status >= 400 || !location) break

    const next = new URL(location, url)
    if (!['http:', 'https:'].includes(next.protocol) || !isAllowedMapsHost(next.hostname)) break
    url = next
  }
  return nama ? { point: null, nama } : null
}

// ═══ Jarak tempuh ════════════════════════════════════════════════════════════

/**
 * Jarak penempatan → tujuan. Memakai jarak jalan dari OSRM bila OSRM_URL diisi;
 * di luar cakupan peta OSRM, server down, atau OSRM_URL kosong → garis lurus.
 */
export async function travelDistance(from: LatLng, to: LatLng): Promise<{ km: number; metode: 'jalan' | 'garis_lurus' }> {
  const lurus = haversineKm(from.lat, from.lng, to.lat, to.lng)
  if (!config.geo.osrmUrl) return { km: lurus, metode: 'garis_lurus' }

  const key = `${coordKey(from.lat, from.lng)};${coordKey(to.lat, to.lng)}`
  const memo = routeMemo.get(key)
  if (memo) return memo

  try {
    const coords = `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}`
    const json = await fetchJson<{ code: string; routes?: Array<{ distance: number }> }>(
      `${config.geo.osrmUrl}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false`,
      6000,
    )
    const meter = json.code === 'Ok' ? json.routes?.[0]?.distance : undefined
    // Jarak jalan mustahil jauh lebih pendek dari garis lurus; kalau iya, titik
    // ter-snap ke jalan yang salah — pakai garis lurus saja.
    if (meter != null && Number.isFinite(meter) && meter / 1000 >= lurus * 0.9) {
      const result = { km: meter / 1000, metode: 'jalan' as const }
      routeMemo.set(key, result)
      return result
    }
  } catch (err) {
    console.error('[geo] OSRM gagal, memakai jarak garis lurus:', errMessage(err))
  }
  return { km: lurus, metode: 'garis_lurus' }
}
