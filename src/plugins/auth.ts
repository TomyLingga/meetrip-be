// ─── Auth Plugin ──────────────────────────────────────────────────────────────
// Dekorasi fastify.authenticate untuk melindungi route
import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

// Tipe payload JWT MeeTrip
export interface JwtPayload {
  sub:        string  // portalUserId
  email:      string
  employeeId: string | null
  nama:       string | null
  gradeLevel: number | null
  role:       string | null
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    user: JwtPayload
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' })
    }
  })

  // Khusus untuk route yang butuh role admin / sdm
  fastify.decorate('authenticateAdmin', async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      await request.jwtVerify()
      const user = request.user as JwtPayload
      // 'super_admin' dan 'admin' dari portal dianggap admin di MeeTrip
      const adminRoles = ['super_admin', 'admin']
      if (!adminRoles.includes(user.role ?? '')) {
        return reply.status(403).send({ success: false, error: 'Forbidden: Admin only' })
      }
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' })
    }
  })
})
