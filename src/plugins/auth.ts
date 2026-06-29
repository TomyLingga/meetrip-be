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
    authenticateSdm: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
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

  // Admin MeeTrip
  fastify.decorate('authenticateAdmin', async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      await request.jwtVerify()
      const user = request.user as JwtPayload
      if (user.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Forbidden: Admin only' })
      }
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' })
    }
  })

  // SDM / Admin
  fastify.decorate('authenticateSdm', async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      await request.jwtVerify()
      const user = request.user as JwtPayload
      if (user.role !== 'sdm' && user.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Forbidden: SDM or Admin only' })
      }
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' })
    }
  })
})
