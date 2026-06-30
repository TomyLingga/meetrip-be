// ─── Routes: Portal Users (proxy dari local_user_cache) ───────────────────────
// Digunakan admin MeeTrip untuk mencari user saat assign role
import { FastifyInstance } from 'fastify'
import { db }              from '../db/connection'
import { localUserCache, meetripUserRole } from '../db/schema'
import { eq, ilike, or }  from 'drizzle-orm'
import { ok }              from '../utils/response'

export default async function portalUserRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/portal/users?search=&limit=20
   * Cari user dari local_user_cache (user yang pernah login ke MeeTrip).
   * Juga sertakan role MeeTrip mereka saat ini jika ada.
   * Hanya Admin MeeTrip yang bisa akses.
   */
  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { search = '', limit = '30' } = req.query as { search?: string; limit?: string }
    const limitN = Math.min(parseInt(limit) || 30, 100)

    // Query local_user_cache dengan filter search
    const users = await db.select({
      portalUserId: localUserCache.portalUserId,
      email:        localUserCache.email,
      nama:         localUserCache.nama,
      unitNama:     localUserCache.unitNama,
      gradeKode:    localUserCache.gradeKode,
      gradeLevel:   localUserCache.gradeLevel,
    })
    .from(localUserCache)
    .where(
      search.trim()
        ? or(
            ilike(localUserCache.nama,  `%${search}%`),
            ilike(localUserCache.email, `%${search}%`),
          )
        : undefined
    )
    .limit(limitN)
    .orderBy(localUserCache.nama)

    // Ambil semua role yang sudah di-assign untuk di-overlay
    const roles = await db.select({
      portalUserId: meetripUserRole.portalUserId,
      role:         meetripUserRole.role,
    }).from(meetripUserRole)

    const roleMap = new Map(roles.map(r => [r.portalUserId, r.role]))

    const result = users.map(u => ({
      ...u,
      meetripRole: roleMap.get(u.portalUserId) ?? null,
    }))

    return reply.send(ok(result))
  })
}
