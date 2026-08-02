// ─── Routes: BTO ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createBtoService, updateBtoService, submitBtoService, deleteBtoService, cancelBtoService,
  adminApproveDpService, ptApproveService, sdmApproveService,
  listBtoService, listBtoApprovalsService, listBtoApprovalsHistoryService,
} from '../services/bto.service'
import { kalkulasiPaguBto, getGradeIdByLevel, hitungDurasiHariMalam } from '../services/pagu.service'
import { reverseGeocode, getWilayahTipe, haversineKm, resolveEmployeePenempatan } from '../services/geocoding.service'
import { db } from '../db/connection'
import { attendStamp, bte, bteApprovalLog, bto, btoApprovalLog, configPemberiTugas, localUserCache, spdk, spdkApprovalLog } from '../db/schema'
import { eq, and, or, inArray, desc } from 'drizzle-orm'
import { ok, paginated, parsePagination } from '../utils/response'
import { AppError } from '../utils/errorHandler'
import path from 'path'
import fs from 'fs'
import { config } from '../config/env'
import { assertBtoAccess } from '../services/access.service'
import { fetchWithTimeout } from '../utils/http'

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

async function buildBtoApprovalTimeline(id: string) {
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

  if (!logs.some((log) => log.tahap === 'absen')) {
    const attendRows = await db.select().from(attendStamp).where(eq(attendStamp.btoId, id))
    approvalLogs = [
      ...approvalLogs,
      ...attendRows.map((stamp) => ({
        id: `attend-${stamp.id}`,
        btoId: id,
        tahap: 'absen',
        aksi: stamp.isAdminOverride ? 'override_absen' : 'absen',
        actorId: stamp.overrideOleh || stamp.employeeId,
        actorNama: stamp.overrideOlehNama || 'Karyawan',
        statusDari: 'ACTIVE',
        statusKe: 'ATTENDED',
        catatan: stamp.isAdminOverride
          ? 'Absensi dinas dioverride oleh admin.'
          : `Absen diterima. Jarak dari tujuan: ${Number(stamp.jarakDariTujuanM || 0).toFixed(0)} meter.`,
        createdAt: stamp.stamped_at,
        stampLat: stamp.stampLat,
        stampLng: stamp.stampLng,
      })),
    ]
  }

  const bteRow = await db.query.bte.findFirst({ where: eq(bte.btoId, id) })
  if (bteRow && !logs.some((log) => log.tahap === 'bte' || log.tahap === 'bte_payment')) {
    const bteLogs = await db.select().from(bteApprovalLog).where(eq(bteApprovalLog.bteId, bteRow.id))
    const statusByAction: Record<string, { dari: string; ke: string; tahap: string }> = {
      submit: { dari: 'BTE_DRAFT', ke: 'ADMIN_BTE_REVIEW', tahap: 'bte' },
      approve: { dari: 'ADMIN_BTE_REVIEW', ke: 'BTE_PAYMENT', tahap: 'bte' },
      revision: { dari: 'ADMIN_BTE_REVIEW', ke: 'REVISION_BTE', tahap: 'bte' },
      reject: { dari: 'ADMIN_BTE_REVIEW', ke: 'REJECTED', tahap: 'bte' },
      mark_paid: { dari: 'BTE_PAYMENT', ke: 'COMPLETED', tahap: 'bte_payment' },
    }
    approvalLogs = [
      ...approvalLogs,
      ...bteLogs.map((log) => {
        const mapped = statusByAction[log.aksi] || { dari: 'REPORT_UPLOADED', ke: 'ADMIN_BTE_REVIEW', tahap: 'bte' }
        return {
          id: `bte-${log.id}`,
          btoId: id,
          tahap: mapped.tahap,
          aksi: log.aksi,
          actorId: log.actorId,
          actorNama: log.actorNama,
          statusDari: mapped.dari,
          statusKe: mapped.ke,
          catatan: log.catatan,
          createdAt: log.createdAt,
        }
      }),
    ]
  }

  approvalLogs.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
  return approvalLogs
}

export default async function btoRoutes(fastify: FastifyInstance) {

  /** GET /api/bto/my-penempatan — Mengecek lokasi penempatan user saat ini */
  fastify.get('/my-penempatan', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    try {
      const penempatan = await resolveEmployeePenempatan(req.user.sub)
      return reply.send(ok({
        hasPenempatan: penempatan.lat != null && penempatan.lng != null,
        penempatanNama: penempatan.nama || null,
        lat: penempatan.lat || null,
        lng: penempatan.lng || null
      }))
    } catch (err) {
      req.log.error(err)
      return reply.send(ok({
        hasPenempatan: false,
        penempatanNama: null,
        lat: null,
        lng: null
      }))
    }
  })

  /** POST /api/bto — Buat BTO baru (DRAFT) */
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const data = btoCreateSchema.extend({ targetEmployeeId: z.string().optional() }).parse(req.body)
    const user = req.user
    const isAdmin = (user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    
    let targetId = user.sub;
    let targetNama = user.nama;

    if (isAdmin && data.targetEmployeeId) {
      targetId = data.targetEmployeeId;
      const targetUser = await db.query.localUserCache.findFirst({
        where: eq(localUserCache.portalUserId, targetId)
      });
      targetNama = targetUser?.nama ?? "Karyawan Override";
    }

    const result = await createBtoService(targetId, targetNama, {
      ...data,
      estBerangkat: new Date(data.estBerangkat),
      estKembali: new Date(data.estKembali),
    })
    return reply.status(201).send(ok(result))
  })

  /** GET /api/bto — List BTO */
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as any
    const { page, limit } = parsePagination(q)
    const roles = (req.user.role ?? '').split(',')
    const userCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, req.user.sub),
    })
    const isBom1 = userCache?.gradeKode === 'BOM-1'
    const isAdmin = roles.some(r => ['super_admin', 'admin', 'sdm'].includes(r)) || isBom1

    const result = await listBtoService({
      employeeId: isAdmin ? q.employeeId : req.user.sub,
      viewerRole: req.user.role,
      isAdmin,
      status: q.status,
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
      page,
      limit,
    })
    return reply.send(paginated(result.rows, page, limit, result.total))
  })

  /** GET /api/bto/approvals — List BTO waiting for actor's approval */
  fastify.get('/approvals', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as { all?: string }
    const isAll = q.all !== 'false'

    const result = await listBtoApprovalsService({
      id: req.user.sub,
      employeeId: req.user.employeeId,
      role: req.user.role ?? 'user',
      gradeLevel: req.user.gradeLevel,
    }, isAll)
    return reply.send(ok(result))
  })

  /** GET /api/bto/approvals/history — List Approval History */
  fastify.get('/approvals/history', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const result = await listBtoApprovalsHistoryService({
      id: req.user.sub,
      role: req.user.role ?? 'user'
    })
    return reply.send(ok(result))
  })

  /** GET /api/bto/calculate-geo — Calculate distance & region type based on target coordinates and user's OFFICIAL penempatan (bukan lokasi real-time) */
  fastify.get('/calculate-geo', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as { lat: string; lng: string }
    const lat = Number(q.lat)
    const lng = Number(q.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new AppError('Koordinat tidak valid', 400)
    }

    // Ambil lokasi penempatan RESMI user (selalu di-refresh dari Portal), acuan utama perhitungan wilayah
    const { lat: pLat, lng: pLng, provinsi: pProv, nama: penempatanNama } = await resolveEmployeePenempatan(req.user.sub)

    // Reverse geocode target coordinate
    const geo = await reverseGeocode(lat, lng)

    let jarakKm = 0
    if (pLat != null && pLng != null) {
      jarakKm = haversineKm(pLat, pLng, lat, lng)
    }

    const wilayahTipe = getWilayahTipe(pProv, geo.provinsi, geo.negara)

    return reply.send(ok({
      jarakKm: Number(jarakKm.toFixed(2)),
      wilayahTipe,
      alamat: geo.alamat || '',
      provinsi: geo.provinsi || '',
      negara: geo.negara || '',
      penempatanNama: penempatanNama || '',
    }))
  })

  /** GET /api/bto/:id — Detail BTO */
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    // Cek hak baca: pemilik / pemberi tugas / approver SPDK / kepala unit / admin-SDM.
    const row = await assertBtoAccess(id, { id: req.user.sub, employeeId: req.user.employeeId, role: req.user.role })

    const approvalLogs = await buildBtoApprovalTimeline(id)
    return reply.send(ok({ ...row, approvalLogs }))
  })

  /** GET /api/bto/:id/logs — List BTO Approval Logs */
  fastify.get('/:id/logs', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await assertBtoAccess(id, { id: req.user.sub, employeeId: req.user.employeeId, role: req.user.role })
    const approvalLogs = await buildBtoApprovalTimeline(id)
    return reply.send(ok(approvalLogs))
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

  /** POST /api/bto/:id/cancel — Batalkan BTO oleh user/admin */
  fastify.post('/:id/cancel', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { catatan } = z.object({ catatan: z.string() }).parse(req.body)
    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin', 'sdm'].includes(r))
    const result = await cancelBtoService(id, { id: req.user.sub, nama: req.user.nama ?? '', isAdmin }, catatan)
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

    const ext = path.extname(data.filename).toLowerCase()
    const allowedExt = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp'])
    if (!allowedExt.has(ext)) {
      throw new AppError('Lampiran wajib berupa PDF atau gambar (PNG/JPG/WEBP)', 400)
    }

    const uploadDir = path.resolve(config.upload.dir, 'bto', id)
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

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

  /** POST /api/bto/:id/laporan - Upload laporan perjalanan dinas PDF/image */
  fastify.post('/:id/laporan', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [row] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
    if (!row) throw new AppError('BTO tidak ditemukan', 404)

    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin'].includes(r))
    if (!isAdmin && row.employeeId !== req.user.sub) {
      throw new AppError('Tidak diizinkan mengupload laporan BTO ini', 403)
    }
    if (row.status !== 'ATTENDED' && row.status !== 'REPORT_UPLOADED' && row.status !== 'BTE_DRAFT') {
      throw new AppError('Laporan hanya bisa diupload setelah attend stamp berhasil', 400)
    }

    const data = await req.file()
    if (!data) throw new AppError('File laporan tidak ditemukan', 400)

    const ext = path.extname(data.filename).toLowerCase()
    const allowedExt = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp'])
    if (!allowedExt.has(ext)) {
      throw new AppError('Laporan perjalanan dinas wajib berupa PDF atau gambar (PNG/JPG/WEBP)', 400)
    }

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
    // Jika sebelumnya sudah masuk tahap BTE_DRAFT, jangan mundurkan statusnya ke REPORT_UPLOADED
    const nextStatus = row.status === 'BTE_DRAFT' ? 'BTE_DRAFT' : 'REPORT_UPLOADED'
    await db.update(bto).set({
      laporanPath: filePath,
      laporanNama: data.filename,
      status: nextStatus,
      updatedAt: new Date(),
    }).where(eq(bto.id, id))

    await db.insert(btoApprovalLog).values({
      btoId: id,
      tahap: 'laporan',
      aksi: 'upload',
      actorId: req.user.sub,
      actorNama: req.user.nama ?? row.employeeNama ?? 'Karyawan',
      statusDari: row.status,
      statusKe: nextStatus,
      catatan: `Laporan perjalanan diupload: ${data.filename}`,
    })

    return reply.send(ok({ path: filePath, nama: data.filename, status: nextStatus }))
  })

  /** POST /api/bto/:id/submit */
  fastify.post('/:id/submit', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const isAdmin = (req.user.role ?? '').split(',').some(r => ['super_admin', 'admin', 'sdm'].includes(r))
    const result = await submitBtoService(id, { id: req.user.sub, nama: req.user.nama ?? '', gradeLevel: req.user.gradeLevel, isAdmin })
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
    const result = await ptApproveService(id, aksi, {
      id: req.user.sub,
      employeeId: req.user.employeeId,
      nama: req.user.nama ?? '',
    }, catatan)
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
    const btoRow = await assertBtoAccess(id, { id: req.user.sub, employeeId: req.user.employeeId, role: req.user.role })

    const userCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, btoRow.employeeId),
    })
    const gradeLevel = userCache?.gradeLevel ?? (btoRow.employeeId === req.user.sub ? req.user.gradeLevel : 0)
    const gradeId = await getGradeIdByLevel(gradeLevel ?? 0)
    if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400)

    const estBerangkat = new Date(btoRow.estBerangkat)
    const estKembali = new Date(btoRow.estKembali)
    const { jumlahHari, jumlahMalam } = hitungDurasiHariMalam(estBerangkat, estKembali)

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
      const portalRes = await fetchWithTimeout(`${config.portal.apiUrl}/api/sso/employees?id=${cfg.fixedEmployeeId}`, {
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

    const portalRes = await fetchWithTimeout(`${config.portal.apiUrl}/api/sso/employees?aboveGradeLevel=${gradeLevel}`, {
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
        const portalRes = await fetchWithTimeout(`${config.portal.apiUrl}/api/sso/grades`, {
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

    // Ambil lokasi penempatan RESMI user (selalu di-refresh dari Portal), acuan utama perhitungan wilayah & jarak
    const { lat: penempatanLat, lng: penempatanLng, provinsi: userProvinsi } = await resolveEmployeePenempatan(req.user.sub)

    if (tujuanLat != null && tujuanLng != null && Number.isFinite(Number(tujuanLat)) && Number.isFinite(Number(tujuanLng))) {
      // Lokasi tujuan adalah sumber kebenaran. Jangan gunakan nilai wilayah dari
      // form karena nilai preview lama bisa berasal dari geocoding yang gagal.
      const geo = await reverseGeocode(Number(tujuanLat || 0), Number(tujuanLng || 0)).catch(() => ({ provinsi: null, negara: 'Indonesia', alamat: '' }))

      wilayah = getWilayahTipe(
        userProvinsi,
        geo.provinsi,
        geo.negara,
      )
    }

    if (penempatanLat != null && penempatanLng != null && tujuanLat && tujuanLng) {
      jarakKm = haversineKm(
        penempatanLat, penempatanLng,
        Number(tujuanLat), Number(tujuanLng),
      )
    }

    const start = new Date(estBerangkat)
    const end = new Date(estKembali)
    const { jumlahHari, jumlahMalam } = hitungDurasiHariMalam(start, end)

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
