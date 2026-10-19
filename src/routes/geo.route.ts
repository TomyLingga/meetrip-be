// ─── Routes: Geo ──────────────────────────────────────────────────────────────
// Pencarian tempat, reverse geocode, dan link Google Maps untuk map picker.
// Semua lewat backend supaya cache & batas pemakaian provider terkendali, dan
// tidak ada API key peta di browser.
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/connection'
import { localUserCache } from '../db/schema'
import { ok } from '../utils/response'
import { AppError } from '../utils/errorHandler'
import { searchPlaces, recordPlaceSelection, reverseGeocode, resolveMapLink, type LatLng } from '../services/geo.service'

// Query string kosong ("lat=") jangan sampai di-coerce menjadi 0.
const optionalCoord = (min: number, max: number) => z.preprocess(
  value => (value === '' || value == null ? undefined : Number(value)),
  z.number().min(min).max(max).optional(),
)

const searchQuery = z.object({
  q:   z.string().max(200).default(''),
  lat: optionalCoord(-90, 90),
  lng: optionalCoord(-180, 180),
})

const reverseQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

async function penempatanBias(portalUserId: string): Promise<LatLng | null> {
  const user = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, portalUserId),
  })
  const lat = Number(user?.penempatanLat)
  const lng = Number(user?.penempatanLng)
  return user?.penempatanLat && user?.penempatanLng && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null
}

export default async function geoRoutes(fastify: FastifyInstance) {

  /** GET /api/geo/search?q=&lat=&lng= — Autocomplete tempat (cache → OpenStreetMap) */
  fastify.get('/search', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = searchQuery.parse(req.query)
    // Bias hasil ke titik yang sedang dilihat user; kalau belum ada, ke lokasi penempatannya.
    const bias = q.lat != null && q.lng != null
      ? { lat: q.lat, lng: q.lng }
      : await penempatanBias(req.user.sub)
    return reply.send(ok(await searchPlaces(q.q, bias)))
  })

  /** POST /api/geo/select — Catat tempat yang dipilih agar masuk cache pencarian */
  fastify.post('/select', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(160) }).parse(req.body)
    return reply.send(ok({ saved: await recordPlaceSelection(id) }))
  })

  /** GET /api/geo/reverse?lat=&lng= — Koordinat → alamat, provinsi, negara */
  fastify.get('/reverse', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { lat, lng } = reverseQuery.parse(req.query)
    return reply.send(ok(await reverseGeocode(lat, lng)))
  })

  /** GET /api/geo/resolve-link?url= — Ambil koordinat / nama tempat dari link Google Maps */
  fastify.get('/resolve-link', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { url } = z.object({ url: z.string().min(1).max(2000) }).parse(req.query)
    const result = await resolveMapLink(url).catch(() => null)
    if (!result) {
      throw new AppError('Link tidak dikenali. Tempel link "Bagikan" dari Google Maps atau ketik koordinat, mis. 3.1319, 99.3425.', 422)
    }
    return reply.send(ok({
      lat:  result.point?.lat ?? null,
      lng:  result.point?.lng ?? null,
      nama: result.nama,
    }))
  })
}
