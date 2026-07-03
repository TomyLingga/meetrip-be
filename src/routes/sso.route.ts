// ─── Routes: SSO Auth ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z }              from 'zod'
import { loginSsoService, refreshSsoTokenService, logoutSsoService } from '../services/sso.service'
import { ok } from '../utils/response'
import { db } from '../db/connection'
import { localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'
import { reverseGeocode } from '../services/geocoding.service'

const loginSchema = z.object({
  ssoToken: z.string().min(1, 'ssoToken wajib diisi'),
  appId:    z.string().uuid('appId tidak valid'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export default async function ssoRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/auth/login
   * User dari portal klik MeeTrip → dapat sso_token → POST ke sini
   */
  fastify.post('/login', async (req, reply) => {
    const { ssoToken, appId } = loginSchema.parse(req.body)
    const result = await loginSsoService(ssoToken, appId, fastify)
    return reply.send(ok(result))
  })

  /**
   * POST /api/auth/refresh
   * Perbarui access token menggunakan refresh token
   */
  fastify.post('/refresh', async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    const result = await refreshSsoTokenService(refreshToken, fastify)
    return reply.send(ok(result))
  })

  /**
   * POST /api/auth/logout
   */
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { refreshToken } = refreshSchema.parse(req.body)
    await logoutSsoService(refreshToken)
    return reply.send(ok({ message: 'Logout berhasil' }))
  })

  /**
   * GET /api/auth/me
   * Informasi user yang sedang login (dari cache lokal)
   */
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send(ok(req.user))
  })

  /**
   * POST /api/auth/update-location
   * Update lokasi penempatan koordinat user secara real-time
   */
  fastify.post('/update-location', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { lat, lng } = z.object({
      lat: z.number(),
      lng: z.number(),
    }).parse(req.body)

    const portalUserId = req.user.sub

    const geo = await reverseGeocode(Number(lat), Number(lng)).catch(() => ({ provinsi: null, negara: 'Indonesia', alamat: '' }))

    await db.update(localUserCache)
      .set({
        penempatanLat: String(lat),
        penempatanLng: String(lng),
        penempatanProvinsi: geo.provinsi,
        lastSync: new Date(),
      })
      .where(eq(localUserCache.portalUserId, portalUserId))

    return reply.send(ok({ success: true, provinsi: geo.provinsi }))
  })
}
