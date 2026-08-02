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
  role:       string
  fotoPath:   string | null
}

// Augment @fastify/jwt — cara resmi agar request.user bertipe JwtPayload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload     // type untuk sign()
    user:    JwtPayload     // type untuk request.user setelah jwtVerify()
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate:      (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
    authenticateSdm:   (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(async function authPlugin(fastify: FastifyInstance) {
  /*
   * Token via query string hanya diterima untuk route render dokumen (PDF/HTML)
   * dan hanya untuk GET. Dulu ini berlaku di SEMUA endpoint, sehingga
   * `?token=<JWT>` bisa dipakai untuk aksi tulis seperti DELETE master data —
   * padahal URL lengkap tercatat di log server, riwayat browser, dan Referer.
   * Frontend sekarang memakai header Authorization + blob URL.
   */
  const QUERY_TOKEN_PREFIXES = ['/api/documents', '/api/document']

  function extractQueryToken(request: FastifyRequest) {
    if (request.headers.authorization) return
    const token = (request.query as any)?.token
    if (!token) return
    const url = request.url.split('?')[0]
    const isDocumentRead =
      request.method === 'GET' && QUERY_TOKEN_PREFIXES.some((prefix) => url.startsWith(prefix))
    if (!isDocumentRead) return
    request.headers.authorization = `Bearer ${token}`
  }

  fastify.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    try {
      extractQueryToken(request)
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
      extractQueryToken(request)
      await request.jwtVerify()
      const user = request.user as JwtPayload
      const roles = (user.role ?? '').split(',')
      if (!roles.includes('admin') && !roles.includes('super_admin')) {
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
      extractQueryToken(request)
      await request.jwtVerify()
      const user = request.user as JwtPayload
      const roles = (user.role ?? '').split(',')
      if (!roles.includes('sdm') && !roles.includes('admin') && !roles.includes('super_admin')) {
        return reply.status(403).send({ success: false, error: 'Forbidden: SDM or Admin only' })
      }
    } catch {
      return reply.status(401).send({ success: false, error: 'Unauthorized' })
    }
  })
})
