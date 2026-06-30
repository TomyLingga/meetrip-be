// ─── Routes: BTO ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z }              from 'zod'
import {
  createBtoService, updateBtoService, submitBtoService,
  adminApproveDpService, ptApproveService, sdmApproveService,
  listBtoService,
} from '../services/bto.service'
import { kalkulasiPaguBto, getGradeIdByLevel } from '../services/pagu.service'
import { db } from '../db/connection'
import { bto, btoApprovalLog, configPemberiTugas, localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'
import { ok, paginated } from '../utils/response'
import { AppError } from '../utils/errorHandler'
import path from 'path'
import fs   from 'fs'
import { config } from '../config/env'

interface PortalEmployeeOption {
  id: string
  nama?: string
  namaLengkap?: string
  gradeLevel?: number
  gradeKode?: string
  grade?: { level?: number }
}

interface PortalListResponse<T> {
  data?: T[]
}

const btoCreateSchema = z.object({
  tujuanNama:         z.string().min(1),
  tujuanLat:          z.number(),
  tujuanLng:          z.number(),
  kepentingan:        z.string().min(1),
  transportId:        z.string().uuid().optional(),
  estBerangkat:       z.string().datetime(),
  estKembali:         z.string().datetime(),
  estimasiWaktuMenit: z.number().int().optional(),
  butuhDp:            z.boolean(),
  pemberiTugasId:     z.string().optional(),
  pemberiTugasNama:   z.string().optional(),
})

const approvalSchema = z.object({
  catatan: z.string().optional(),
})

export default async function btoRoutes(fastify: FastifyInstance) {

  /** POST /api/bto — Buat BTO baru (DRAFT) */
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const data = btoCreateSchema.parse(req.body)
    const user = req.user
    const result = await createBtoService(user.sub, {
      ...data,
      estBerangkat: new Date(data.estBerangkat),
      estKembali:   new Date(data.estKembali),
    })
    return reply.status(201).send(ok(result))
  })

  /** GET /api/bto — List BTO */
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as any
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role ?? '')
    const result = await listBtoService({
      employeeId: isAdmin ? q.employeeId : req.user.sub,
      status:     q.status,
      dateFrom:   q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo:     q.dateTo   ? new Date(q.dateTo)   : undefined,
      page:       Number(q.page  ?? 1),
      limit:      Number(q.limit ?? 20),
    })
    return reply.send(paginated(result.rows, Number(q.page ?? 1), Number(q.limit ?? 20), result.total))
  })

  /** GET /api/bto/:id — Detail BTO */
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row]  = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!row) throw new AppError('BTO tidak ditemukan', 404)

    const logs = await db.select().from(btoApprovalLog).where(eq(btoApprovalLog.btoId, id))
    return reply.send(ok({ ...row, approvalLogs: logs }))
  })

  /** PUT /api/bto/:id — Update BTO */
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role ?? '')
    const data = btoCreateSchema.partial().parse(req.body)
    const updateData: Partial<typeof bto.$inferInsert> = {
      ...data,
<<<<<<< HEAD
<<<<<<< HEAD
      tujuanLat: data.tujuanLat !== undefined ? String(data.tujuanLat) : undefined,
      tujuanLng: data.tujuanLng !== undefined ? String(data.tujuanLng) : undefined,
=======
      tujuanLat:    data.tujuanLat != null ? String(data.tujuanLat) : undefined,
      tujuanLng:    data.tujuanLng != null ? String(data.tujuanLng) : undefined,
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
=======
      tujuanLat:    data.tujuanLat != null ? String(data.tujuanLat) : undefined,
      tujuanLng:    data.tujuanLng != null ? String(data.tujuanLng) : undefined,
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
      estBerangkat: data.estBerangkat ? new Date(data.estBerangkat) : undefined,
      estKembali: data.estKembali ? new Date(data.estKembali) : undefined,
    }
    const result = await updateBtoService(id, req.user.sub, isAdmin, {
      ...updateData,
    })
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/lampiran — Upload lampiran (multipart) */
  fastify.post('/:id/lampiran', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data   = await req.file()
    if (!data) throw new AppError('File tidak ditemukan', 400)

    const uploadDir = path.resolve(config.upload.dir, 'bto', id)
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

    const ext      = path.extname(data.filename)
    const filename = `lampiran_${Date.now()}${ext}`
    const filepath = path.join(uploadDir, filename)

    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath)
      data.file.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    const filePath = `bto/${id}/${filename}`
    await db.update(bto).set({ lampiranPath: filePath, lampiranNama: data.filename, updatedAt: new Date() }).where(eq(bto.id, id))
    return reply.send(ok({ path: filePath, nama: data.filename }))
  })

  /** POST /api/bto/:id/laporan - Upload laporan perjalanan dinas PDF */
  fastify.post('/:id/laporan', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!row) throw new AppError('BTO tidak ditemukan', 404)

    const isAdmin = ['super_admin', 'admin'].includes(req.user.role ?? '')
    if (!isAdmin && row.employeeId !== req.user.sub) {
      throw new AppError('Tidak diizinkan mengupload laporan BTO ini', 403)
    }
    if (row.status !== 'ATTENDED' && row.status !== 'REPORT_UPLOADED') {
      throw new AppError('Laporan hanya bisa diupload setelah attend stamp berhasil', 400)
    }

    const data = await req.file()
    if (!data) throw new AppError('File laporan tidak ditemukan', 400)

    const ext = path.extname(data.filename).toLowerCase()
    if (ext !== '.pdf') throw new AppError('Laporan perjalanan dinas wajib berupa PDF', 400)

    const uploadDir = path.resolve(config.upload.dir, 'bto', id)
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

    const filename = `laporan_${Date.now()}${ext}`
    const filepath = path.join(uploadDir, filename)

    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath)
      data.file.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    const filePath = `bto/${id}/${filename}`
    await db.update(bto).set({
      laporanPath: filePath,
      laporanNama: data.filename,
      status: 'REPORT_UPLOADED',
      updatedAt: new Date(),
    }).where(eq(bto.id, id))

    return reply.send(ok({ path: filePath, nama: data.filename, status: 'REPORT_UPLOADED' }))
  })

  /** POST /api/bto/:id/submit */
  fastify.post('/:id/submit', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const result  = await submitBtoService(id, { id: req.user.sub, nama: req.user.nama ?? '' })
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-dp — Admin approve/reject/revision DP */
  fastify.post('/:id/approve-dp', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id }     = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject', 'revision']), catatan: z.string().optional() }).parse(req.body)
    const result = await adminApproveDpService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-pt — Pemberi Tugas approve/reject */
  fastify.post('/:id/approve-pt', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id }     = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject']), catatan: z.string().optional() }).parse(req.body)
    const result = await ptApproveService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-sdm — SDM approve/reject */
  fastify.post('/:id/approve-sdm', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const { id }     = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject']), catatan: z.string().optional() }).parse(req.body)
    const result = await sdmApproveService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** GET /api/bto/:id/pagu — Hitung pagu semua rincian untuk BTO ini */
  fastify.get('/:id/pagu', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [btoRow] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)

    const gradeId = await getGradeIdByLevel(req.user.gradeLevel ?? 0)
    if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400)

    const estBerangkat = new Date(btoRow.estBerangkat)
    const estKembali   = new Date(btoRow.estKembali)
    const diffMs       = estKembali.getTime() - estBerangkat.getTime()
    const jumlahHari   = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1
    const jumlahMalam  = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))

    const paguList = await kalkulasiPaguBto({
      gradeId,
      wilayahTipe: btoRow.wilayahTipe ?? 'dalam_wilayah',
      tanggal:     estBerangkat,
      jumlahHari,
      jumlahMalam,
    })

    return reply.send(ok({ paguList, jumlahHari, jumlahMalam }))
  })

  /** GET /api/bto/:id/pemberi-tugas-options — Dropdown pemberi tugas */
  fastify.get('/:id/pemberi-tugas-options', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const [cfg] = await db.select().from(configPemberiTugas).where(eq(configPemberiTugas.isActive, true)).limit(1)

    if (!cfg) return reply.send(ok({ mode: 'grade_based', options: [] }))

    if (cfg.mode === 'fixed_person' && cfg.fixedEmployeeId) {
      const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/employees?id=${cfg.fixedEmployeeId}`, {
        headers: { 'x-internal': '1' },
      })
<<<<<<< HEAD
<<<<<<< HEAD
      const data = await portalRes.json().catch(() => ({ data: [] })) as PortalListResponse<PortalEmployeeOption>
=======
      const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
=======
      const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
      return reply.send(ok({ mode: 'fixed_person', options: data.data ?? [] }))
    }

    // grade_based: ambil employee Portal dengan grade di atas grade pengaju.
    // Pada master Portal saat ini BOM-4=6, BOM-3=7, BOM-2=8, BOM-1=9, BOM=10, BOD=20.
    const gradeLevel = req.user.gradeLevel
    if (gradeLevel === null || gradeLevel === undefined) {
      return reply.send(ok({
        mode: 'grade_based',
        options: [],
        message: 'Grade user login belum tersedia dari Portal',
      }))
    }

    const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/employees?aboveGradeLevel=${gradeLevel}`, {
      headers: { 'x-internal': '1' },
    })
<<<<<<< HEAD
<<<<<<< HEAD
    const data = await portalRes.json().catch(() => ({ data: [] })) as PortalListResponse<PortalEmployeeOption>
=======
    const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
=======
    const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
>>>>>>> 5d5d434c55b7461215871bb68626e73dea59eb98
    return reply.send(ok({ mode: 'grade_based', options: data.data ?? [] }))
  })
}
