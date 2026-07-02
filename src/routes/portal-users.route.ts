// ─── Routes: Portal Users ─────────────────────────────────────────────────────
// Proxy ke endpoint internal Portal untuk mendapatkan list employee yang
// sudah terhubung ke user Portal. Digunakan admin MeeTrip saat assign role.
import { FastifyInstance } from 'fastify'
import { db }              from '../db/connection'
import { meetripUserRole } from '../db/schema'
import { ok }              from '../utils/response'
import { config }          from '../config/env'

interface PortalEmployee {
  id:             string        // portal user ID
  employeeId:     string | null
  namaLengkap:    string | null
  jabatan:        string | null
  gradeLevel:     number | null
  gradeKode:      string | null
  unitNama:       string | null
  penempatanNama: string | null
}

export default async function portalUserRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/portal/users?search=&limit=30
   * Load semua employee yang sudah link ke user Portal.
   * Dipanggil dari frontend saat admin MeeTrip assign role.
   * Menggunakan endpoint internal portal: GET /api/sso/employees (x-internal: 1)
   */
  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { search = '', limit = '50' } = req.query as { search?: string; limit?: string }

    // Ambil semua role yang sudah di-assign
    const roles = await db.select({
      portalUserId: meetripUserRole.portalUserId,
      role:         meetripUserRole.role,
    }).from(meetripUserRole)
    const roleMap = new Map(roles.map(r => [r.portalUserId, r.role]))

    // Panggil portal internal endpoint — kembalikan seluruh employee yang sudah punya user
    const portalUrl = `${config.portal.apiUrl}/api/sso/employees?limit=${limit}`
    let employees: PortalEmployee[] = []

    try {
      const res = await fetch(portalUrl, {
        headers: { 'x-internal': config.portal.internalToken },
      })
      if (res.ok) {
        const body = await res.json() as { data: PortalEmployee[] }
        employees = body.data ?? []
      }
    } catch (err) {
      // Jika portal tidak bisa diakses, kembalikan array kosong
      fastify.log.warn({ err }, 'Gagal mengambil data employee dari portal')
    }

    // Filter berdasarkan search (nama / jabatan / unit)
    const q = search.trim().toLowerCase()
    if (q) {
      employees = employees.filter(e =>
        e.namaLengkap?.toLowerCase().includes(q) ||
        e.jabatan?.toLowerCase().includes(q) ||
        e.unitNama?.toLowerCase().includes(q)
      )
    }

    const result = employees.map(e => ({
      portalUserId:   e.id,
      employeeId:     e.employeeId,
      nama:           e.namaLengkap,
      jabatan:        e.jabatan,
      gradeLevel:     e.gradeLevel,
      gradeKode:      e.gradeKode,
      unitNama:       e.unitNama,
      penempatanNama: e.penempatanNama,
      meetripRole:    roleMap.get(e.id) ?? null,
    }))

    return reply.send(ok(result))
  })
}
