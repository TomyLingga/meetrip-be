// ─── Routes: BTO ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createBtoService, updateBtoService, submitBtoService, deleteBtoService,
  adminApproveDpService, ptApproveService, sdmApproveService,
  listBtoService, listBtoApprovalsService,
} from '../services/bto.service'
import { kalkulasiPaguBto, getGradeIdByLevel } from '../services/pagu.service'
import { reverseGeocode, getWilayahTipe, haversineKm } from '../services/geocoding.service'
import { db } from '../db/connection'
import { bto, btoApprovalLog, configPemberiTugas, localUserCache, spdk, spdkApprovalLog } from '../db/schema'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { ok, paginated } from '../utils/response'
import { AppError } from '../utils/errorHandler'
import path from 'path'
import fs from 'fs'
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
  tujuanNama: z.string().min(1),
  tujuanLat: z.number(),
  tujuanLng: z.number(),
  kepentingan: z.string().min(1),
  transportId: z.string().uuid().optional(),
  estBerangkat: z.string().datetime(),
  estKembali: z.string().datetime(),
  estimasiWaktuMenit: z.number().int().optional(),
  butuhDp: z.boolean(),
  pemberiTugasId: z.string().optional(),
  pemberiTugasNama: z.string().optional(),
  barang: z.string().nullable().optional(),
  jarakKm: z.number().nullable().optional(),
  wilayahTipe: z.enum(['dalam_wilayah', 'luar_wilayah', 'luar_negeri']).nullable().optional(),
  lampiranPath: z.string().nullable().optional(),
  lampiranNama: z.string().nullable().optional(),
  tujuanAlamat: z.string().nullable().optional(),
  tujuanProvinsi: z.string().nullable().optional(),
  tujuanNegara: z.string().nullable().optional(),
})

const approvalSchema = z.object({
  catatan: z.string().optional(),
})

export default async function btoRoutes(fastify: FastifyInstance) {

  /** POST /api/bto — Buat BTO baru (DRAFT) */
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const data = btoCreateSchema.parse(req.body)
    const user = req.user
    const result = await createBtoService(user.sub, user.nama, {
      ...data,
      estBerangkat: new Date(data.estBerangkat),
      estKembali: new Date(data.estKembali),
    })
    return reply.status(201).send(ok(result))
  })

  /** GET /api/bto — List BTO */
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as any
    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    const result = await listBtoService({
      employeeId: isAdmin ? q.employeeId : req.user.sub,
      viewerRole: req.user.role,
      isAdmin,
      status: q.status,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      page: Number(q.page ?? 1),
      limit: Number(q.limit ?? 20),
    })
    return reply.send(paginated(result.rows, Number(q.page ?? 1), Number(q.limit ?? 20), result.total))
  })

  /** GET /api/bto/approvals — List BTO waiting for actor's approval */
  fastify.get('/approvals', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as { all?: string }
    const isAll = q.all !== 'false'

    const result = await listBtoApprovalsService({
      id: req.user.sub,
      employeeId: req.user.employeeId,
      role: req.user.role ?? 'user'
    }, isAll)
    return reply.send(ok(result))
  })

  /** GET /api/bto/:id — Detail BTO */
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!row) throw new AppError('BTO tidak ditemukan', 404)

    const logs = await db.select().from(btoApprovalLog).where(eq(btoApprovalLog.btoId, id))
    const spdkRow = await db.query.spdk.findFirst({ where: eq(spdk.btoId, id) })
    let approvalLogs: any[] = [...logs]

    if (spdkRow) {
      const spdkLogs = await db.select().from(spdkApprovalLog).where(eq(spdkApprovalLog.spdkId, spdkRow.id))
      const hasAdminSpdkLog = logs.some((log) => log.tahap === 'admin_spdk')
      const hasSpdkApprovalLog = logs.some((log) => log.tahap === 'persetujuan_spdk')

      const mappedSpdkLogs = spdkLogs
        .filter((log) => {
          if (log.aksi === 'issued') return !hasAdminSpdkLog
          if (log.aksi === 'approve' || log.aksi === 'reject') return !hasSpdkApprovalLog
          return true
        })
        .map((log) => ({
          id: `spdk-${log.id}`,
          btoId: id,
          tahap: log.aksi === 'issued' ? 'admin_spdk' : 'persetujuan_spdk',
          aksi: log.aksi,
          actorId: log.actorId,
          actorNama: log.actorNama,
          statusDari: log.aksi === 'issued' ? 'SPDK_DRAFT' : 'KABAG_REVIEW',
          statusKe: log.aksi === 'issued' ? 'KABAG_REVIEW' : log.aksi === 'approve' ? 'ACTIVE' : 'REJECTED',
          catatan: log.catatan,
          createdAt: log.createdAt,
        }))

      approvalLogs = [...approvalLogs, ...mappedSpdkLogs]
    }

    approvalLogs.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
    return reply.send(ok({ ...row, approvalLogs }))
  })

  /** PUT /api/bto/:id — Update BTO */
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    const data = btoCreateSchema.partial().parse(req.body)
    const updateData: Partial<typeof bto.$inferInsert> = {
      ...data,
      tujuanLat: data.tujuanLat != null ? String(data.tujuanLat) : undefined,
      tujuanLng: data.tujuanLng != null ? String(data.tujuanLng) : undefined,
      jarakKm: data.jarakKm !== undefined ? (data.jarakKm != null ? String(data.jarakKm) : null) : undefined,
      estBerangkat: data.estBerangkat ? new Date(data.estBerangkat) : undefined,
      estKembali: data.estKembali ? new Date(data.estKembali) : undefined,
    }
    const result = await updateBtoService(id, req.user.sub, isAdmin, {
      ...updateData,
    })
    return reply.send(ok(result))
  })

  /** DELETE /api/bto/:id — Hapus BTO (DRAFT saja) */
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    const result = await deleteBtoService(id, req.user.sub, isAdmin)
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/lampiran — Upload lampiran (multipart) */
  fastify.post('/:id/lampiran', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!row) throw new AppError('BTO tidak ditemukan', 404)

    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    if (!isAdmin && row.employeeId !== req.user.sub) {
      throw new AppError('Tidak diizinkan mengupload lampiran BTO ini', 403)
    }
    if (!isAdmin && row.status !== 'DRAFT' && row.status !== 'REVISION_DP') {
      throw new AppError('Lampiran hanya bisa diupload saat BTO draft atau revisi DP', 400)
    }

    const data = await req.file()
    if (!data) throw new AppError('File tidak ditemukan', 400)

    const uploadDir = path.resolve(config.upload.dir, 'bto', id)
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

    const ext = path.extname(data.filename)
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

    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
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
    const result = await submitBtoService(id, { id: req.user.sub, nama: req.user.nama ?? '', gradeLevel: req.user.gradeLevel })
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-dp — Admin approve/reject/revision DP */
  fastify.post('/:id/approve-dp', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject', 'revision']), catatan: z.string().optional() }).parse(req.body)
    const result = await adminApproveDpService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-pt — Pemberi Tugas approve/reject */
  fastify.post('/:id/approve-pt', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject']), catatan: z.string().optional() }).parse(req.body)
    const result = await ptApproveService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** POST /api/bto/:id/approve-sdm — SDM approve/reject */
  fastify.post('/:id/approve-sdm', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { aksi, catatan } = z.object({ aksi: z.enum(['approve', 'reject']), catatan: z.string().optional() }).parse(req.body)
    const result = await sdmApproveService(id, aksi, { id: req.user.sub, nama: req.user.nama ?? '' }, catatan)
    return reply.send(ok(result))
  })

  /** GET /api/bto/sdm-review — Get BTOs pending SDM review and BTOs reviewed by current SDM */
  fastify.get('/sdm-review', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const actorId = req.user.sub

    // 1. Fetch pending BTOs (status = 'SDM_REVIEW')
    const pendingRows = await db.select().from(bto)
      .where(eq(bto.status, 'SDM_REVIEW'))
      .orderBy(desc(bto.createdAt))

    // 2. Fetch history BTOs (where there's a log in btoApprovalLog with actorId = actorId and tahap = 'sdm')
    const historyLogs = await db.select({ btoId: btoApprovalLog.btoId })
      .from(btoApprovalLog)
      .where(
        and(
          eq(btoApprovalLog.actorId, actorId),
          eq(btoApprovalLog.tahap, 'sdm')
        )
      )
    
    const historyBtoIds = Array.from(new Set(historyLogs.map(l => l.btoId)))

    let historyRows: any[] = []
    if (historyBtoIds.length > 0) {
      historyRows = await db.select().from(bto)
        .where(inArray(bto.id, historyBtoIds))
        .orderBy(desc(bto.createdAt))
    }

    return reply.send(ok({ pending: pendingRows, history: historyRows }))
  })

  /** GET /api/bto/:id/pagu — Hitung pagu semua rincian untuk BTO ini */
  fastify.get('/:id/pagu', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [btoRow] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)

    const userCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, btoRow.employeeId),
    })
    const gradeLevel = userCache?.gradeLevel ?? (btoRow.employeeId === req.user.sub ? req.user.gradeLevel : 0)
    const gradeId = await getGradeIdByLevel(gradeLevel ?? 0)
    if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400)

    const estBerangkat = new Date(btoRow.estBerangkat)
    const estKembali = new Date(btoRow.estKembali)
    const startD = new Date(estBerangkat.getFullYear(), estBerangkat.getMonth(), estBerangkat.getDate())
    const endD = new Date(estKembali.getFullYear(), estKembali.getMonth(), estKembali.getDate())
    const diffDays = Math.floor((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))
    const jumlahHari = diffDays + 1
    const jumlahMalam = Math.max(0, diffDays)

    const paguList = await kalkulasiPaguBto({
      gradeId,
      wilayahTipe: btoRow.wilayahTipe ?? 'dalam_wilayah',
      tanggal: estBerangkat,
      jumlahHari,
      jumlahMalam,
    })

    const mappedPaguList = paguList.map(p => ({
      ...p,
      nilaiLimit: p.isUnlimited ? null : p.nilaiTotal,
      jumlahHari: p.perMalam ? jumlahMalam : jumlahHari
    }))

    return reply.send(ok({ paguList: mappedPaguList, jumlahHari, jumlahMalam }))
  })

  /** GET /api/bto/:id/pemberi-tugas-options — Dropdown pemberi tugas */
  fastify.get('/:id/pemberi-tugas-options', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const [cfg] = await db.select().from(configPemberiTugas).where(eq(configPemberiTugas.isActive, true)).limit(1)

    if (!cfg) return reply.send(ok({ mode: 'grade_based', options: [] }))

    if (cfg.mode === 'fixed_person' && cfg.fixedEmployeeId) {
      const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/employees?id=${cfg.fixedEmployeeId}`, {
        headers: { 'x-internal': config.portal.internalToken },
      })
      const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
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
      headers: { 'x-internal': config.portal.internalToken },
    })
    const data = await portalRes.json().catch(() => ({ data: [] })) as { data: any[] }
    const options = (data.data ?? []).filter((emp: any) => emp.id !== req.user.sub && emp.employeeId !== req.user.employeeId);
    return reply.send(ok({ mode: 'grade_based', options }))
  })

  /** POST /api/bto/hitung-pagu — Hitung pagu estimasi sebelum buat BTO */
  fastify.post('/hitung-pagu', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { estBerangkat, estKembali, tujuanLat, tujuanLng, wilayahTipe } = z.object({
      estBerangkat: z.string(),
      estKembali: z.string(),
      tujuanLat: z.number().optional().nullable(),
      tujuanLng: z.number().optional().nullable(),
      wilayahTipe: z.string().optional().nullable(),
    }).parse(req.body)

    // Lookup grade level from local cache first, fallback to req.user
    const userCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, req.user.sub),
    })
    const gradeLevel = userCache?.gradeLevel ?? req.user.gradeLevel

    let gradeId = gradeLevel != null ? await getGradeIdByLevel(gradeLevel) : null

    if (!gradeId) {
      try {
        const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/grades`, {
          headers: { 'x-internal': config.portal.internalToken },
        })
        if (portalRes.ok) {
          const body = await portalRes.json() as { data: any[] }
          const rows = body.data ?? []
          if (rows.length > 0) {
            gradeId = rows[0].id
          }
        }
      } catch (err) {
        console.error('Gagal mengambil fallback grade dari Portal:', err)
      }
    }
    if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400)

    let wilayah = wilayahTipe
    let jarakKm: number | null = null

    if (!wilayah) {
      // Geocode tujuan → wilayah_tipe
      const geo = await reverseGeocode(Number(tujuanLat || 0), Number(tujuanLng || 0)).catch(() => ({ provinsi: null, negara: 'Indonesia', alamat: '' }))

      let penempatanLat = userCache?.penempatanLat ?? null
      let penempatanLng = userCache?.penempatanLng ?? null

      if (userCache?.employeeId) {
        try {
          const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/employees?id=${userCache.employeeId}`, {
            headers: { 'x-internal': config.portal.internalToken },
          })
          if (portalRes.ok) {
            const body = await portalRes.json() as { data: any[] }
            const rows = body.data ?? []
            if (rows.length > 0) {
              const empData = rows[0]
              if (empData.penempatanLat && empData.penempatanLng) {
                penempatanLat = empData.penempatanLat
                penempatanLng = empData.penempatanLng
              }
            }
          }
        } catch (err) {
          console.error('Gagal mengambil data koordinat penempatan dari Portal:', err)
        }
      }

      let userProvinsi: string | null = null
      if (penempatanLat && penempatanLng) {
        try {
          const userGeo = await reverseGeocode(Number(penempatanLat), Number(penempatanLng))
          userProvinsi = userGeo.provinsi
        } catch (err) {
          console.error('Failed to geocode user penempatan:', err)
        }
      }

      wilayah = getWilayahTipe(
        userProvinsi,
        geo.provinsi,
        geo.negara,
      )

      if (penempatanLat && penempatanLng && tujuanLat && tujuanLng) {
        jarakKm = haversineKm(
          Number(penempatanLat), Number(penempatanLng),
          Number(tujuanLat), Number(tujuanLng),
        )
      }
    } else {
      // compute distance only if coordinates are supplied
      let penempatanLat = userCache?.penempatanLat ?? null
      let penempatanLng = userCache?.penempatanLng ?? null
      if (penempatanLat && penempatanLng && tujuanLat && tujuanLng) {
        jarakKm = haversineKm(
          Number(penempatanLat), Number(penempatanLng),
          Number(tujuanLat), Number(tujuanLng),
        )
      }
    }

    const start = new Date(estBerangkat)
    const end = new Date(estKembali)
    const startD = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate())
    const diffDays = Math.floor((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24))
    const jumlahHari = diffDays + 1
    const jumlahMalam = Math.max(0, diffDays)

    const paguList = await kalkulasiPaguBto({
      gradeId,
      wilayahTipe: wilayah || 'dalam_wilayah',
      tanggal: start,
      jumlahHari,
      jumlahMalam,
    })

    const mappedPaguList = paguList.map(p => ({
      ...p,
      nilaiLimit: p.isUnlimited ? null : p.nilaiTotal,
      jumlahHari: p.perMalam ? jumlahMalam : jumlahHari
    }))

    return reply.send(ok({
      paguList: mappedPaguList,
      wilayahTipe: wilayah || 'dalam_wilayah',
      jumlahHari,
      jumlahMalam,
      jarakKm: jarakKm ? Number(jarakKm.toFixed(2)) : null,
    }))
  })
}
