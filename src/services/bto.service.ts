// ─── BTO Service ──────────────────────────────────────────────────────────────
// State machine BTO: Create, Submit, Approval flow
import { db }        from '../db/connection'
import { bto, btoApprovalLog, dp, localUserCache, configPemberiTugas, configApproverSpdk } from '../db/schema'
import { eq, desc, and, gte, lte, like, or, sql } from 'drizzle-orm'
import { AppError }  from '../utils/errorHandler'
import { generateNomor } from '../utils/romanNumeral'
import { reverseGeocode, getWilayahTipe, haversineKm } from './geocoding.service'
import { config as appConfig } from '../config/env'
import { getGradeIdByLevel, hitungDurasiHariMalam, validateRincianAgainstPagu } from './pagu.service'

// ─── Buat BTO baru (DRAFT) ───────────────────────────────────────────────────
export async function createBtoService(employeeId: string, data: {
  tujuanNama:   string
  tujuanLat:    number
  tujuanLng:    number
  kepentingan:  string
  transportId?: string
  estBerangkat: Date
  estKembali:   Date
  estimasiWaktuMenit?: number
  butuhDp:      boolean
  pemberiTugasId?: string
  pemberiTugasNama?: string
}) {
  const [inserted] = await db.insert(bto).values({
    employeeId,
    ...data,
    tujuanLat:    String(data.tujuanLat),
    tujuanLng:    String(data.tujuanLng),
    status:       'DRAFT',
  }).returning()
  return inserted
}

// ─── Update BTO (DRAFT saja) ──────────────────────────────────────────────────
export async function updateBtoService(
  id: string,
  employeeId: string,
  isAdmin: boolean,
  data: Partial<typeof bto.$inferInsert>,
) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)

  if (!isAdmin && existing.employeeId !== employeeId) {
    throw new AppError('Tidak diizinkan mengubah BTO ini', 403)
  }
  if (!isAdmin && existing.status !== 'DRAFT' && existing.status !== 'REVISION_DP') {
    throw new AppError(`BTO dengan status ${existing.status} tidak bisa diubah`, 400)
  }

  const [updated] = await db.update(bto).set({ ...data, updatedAt: new Date() })
    .where(eq(bto.id, id)).returning()
  return updated
}

// ─── Submit BTO ───────────────────────────────────────────────────────────────
export async function submitBtoService(id: string, actor: { id: string; nama: string; gradeLevel?: number | null }) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.employeeId !== actor.id) throw new AppError('Bukan milik Anda', 403)
  if (existing.status !== 'DRAFT' && existing.status !== 'REVISION_DP') {
    throw new AppError(`Tidak bisa submit dari status ${existing.status}`, 400)
  }
  if (!existing.pemberiTugasId) {
    throw new AppError('Pemberi tugas wajib dipilih sebelum BTO diajukan', 400)
  }

  // Geocode tujuan → wilayah_tipe
  const geo = await reverseGeocode(Number(existing.tujuanLat), Number(existing.tujuanLng))

  // Dapatkan penempatan area user
  const userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, actor.id),
  })
  
  let userProvinsi = userCache?.penempatanProvinsi ?? null
  if (!userProvinsi && userCache?.penempatanLat && userCache?.penempatanLng) {
    try {
      const userGeo = await reverseGeocode(Number(userCache.penempatanLat), Number(userCache.penempatanLng))
      userProvinsi = userGeo.provinsi
      await db.update(localUserCache).set({ penempatanProvinsi: userGeo.provinsi }).where(eq(localUserCache.id, userCache.id))
    } catch (err) {
      console.error('Failed to reverse geocode user penempatan area:', err)
    }
  }

  const wilayah = getWilayahTipe(
    userProvinsi,
    geo.provinsi,
    geo.negara,
  )

  // Hitung jarak dari penempatan ke tujuan
  let jarakKm: number | undefined
  if (userCache?.penempatanLat && userCache?.penempatanLng) {
    jarakKm = haversineKm(
      Number(userCache.penempatanLat), Number(userCache.penempatanLng),
      Number(existing.tujuanLat),      Number(existing.tujuanLng),
    )
  }

  if (existing.butuhDp) {
    const dpRow = await db.query.dp.findFirst({
      where: eq(dp.btoId, id),
      with: { dpRincian: true },
    })
    if (!dpRow || dpRow.dpRincian.length === 0) {
      throw new AppError('Rincian DP wajib diisi sebelum BTO diajukan', 400)
    }

    const gradeLevel = userCache?.gradeLevel ?? actor.gradeLevel
    const gradeId = gradeLevel != null ? await getGradeIdByLevel(gradeLevel) : null
    if (!gradeId) throw new AppError('Grade karyawan tidak ditemukan di master', 400)

    const { jumlahHari, jumlahMalam } = hitungDurasiHariMalam(
      new Date(existing.estBerangkat),
      new Date(existing.estKembali),
    )

    await validateRincianAgainstPagu({
      gradeId,
      wilayahTipe: wilayah,
      tanggal: new Date(existing.estBerangkat),
      jumlahHari,
      jumlahMalam,
      rincian: dpRow.dpRincian.map((item) => ({
        rincianId: item.rincianId,
        rincianLabel: item.rincianLabel,
        nilaiTotal: Number(item.nilaiTotal),
        nilaiUsd: Number(item.nilaiUsd ?? 0),
        useDollar: item.useDollar,
      })),
    })
  }

  // Generate nomor BTO
  const now      = new Date()
  const tahun    = now.getFullYear()
  const seqRow   = await db.execute(
    sql`SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM bto WHERE tahun = ${tahun}`
  )
  const sequence = Number((seqRow.rows[0] as any).next_seq)
  const nomorBto = generateNomor(sequence, 'BTO', now)

  // Tentukan status berikutnya
  const nextStatus = existing.butuhDp ? 'ADMIN_DP_REVIEW' : 'PT_REVIEW'

  await db.update(bto).set({
    status:        nextStatus,
    nomorBto,
    tahun,
    sequence,
    submittedAt:   now,
    wilayahTipe:   wilayah,
    tujuanAlamat:  geo.alamat,
    tujuanProvinsi: geo.provinsi ?? undefined,
    tujuanNegara:  geo.negara   ?? undefined,
    jarakKm:       jarakKm ? String(jarakKm.toFixed(2)) : undefined,
    updatedAt:     now,
  }).where(eq(bto.id, id))

  if (existing.butuhDp) {
    await db.update(dp).set({
      status: 'ADMIN_REVIEW',
      submittedAt: now,
      updatedAt: now,
    }).where(eq(dp.btoId, id))
  }

  await logApproval({ btoId: id, tahap: 'user', aksi: 'submit', actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus })

  return { nomorBto, status: nextStatus, wilayahTipe: wilayah }
}

// ─── Approval: Admin DP ───────────────────────────────────────────────────────
export async function adminApproveDpService(id: string, aksi: 'approve' | 'reject' | 'revision', actor: { id: string; nama: string }, catatan?: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.status !== 'ADMIN_DP_REVIEW') throw new AppError('Bukan tahap admin DP review', 400)

  const statusMap = { approve: 'PT_REVIEW', reject: 'REJECTED', revision: 'REVISION_DP' } as const
  const nextStatus = statusMap[aksi]
  const dpStatusMap = { approve: 'APPROVED', reject: 'REJECTED', revision: 'REVISION' } as const

  await db.update(bto).set({ status: nextStatus, catatanAdmin: catatan, updatedAt: new Date() }).where(eq(bto.id, id))
  await db.update(dp).set({ status: dpStatusMap[aksi], updatedAt: new Date() }).where(eq(dp.btoId, id))
  await logApproval({ btoId: id, tahap: 'admin_dp', aksi, actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus, catatan })
  return { status: nextStatus }
}

// ─── Approval: Pemberi Tugas ─────────────────────────────────────────────────
export async function ptApproveService(id: string, aksi: 'approve' | 'reject', actor: { id: string; nama: string }, catatan?: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.status !== 'PT_REVIEW') throw new AppError('Bukan tahap Pemberi Tugas review', 400)
  if (existing.pemberiTugasId !== actor.id) throw new AppError('Anda bukan pemberi tugas BTO ini', 403)

  const nextStatus = aksi === 'approve' ? 'SDM_REVIEW' : 'REJECTED'

  await db.update(bto).set({ status: nextStatus, updatedAt: new Date() }).where(eq(bto.id, id))
  await logApproval({ btoId: id, tahap: 'pemberi_tugas', aksi, actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus, catatan })
  return { status: nextStatus }
}

// ─── Approval: SDM ────────────────────────────────────────────────────────────
export async function sdmApproveService(id: string, aksi: 'approve' | 'reject', actor: { id: string; nama: string }, catatan?: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.status !== 'SDM_REVIEW') throw new AppError('Bukan tahap SDM review', 400)
  
  // SDM tidak boleh menyetujui pengajuannya sendiri
  if (existing.employeeId === actor.id) {
    throw new AppError('Anda tidak dapat menyetujui pengajuan perjalanan dinas Anda sendiri', 400)
  }

  const nextStatus = aksi === 'approve' ? 'SPDK_DRAFT' : 'REJECTED'

  await db.update(bto).set({ status: nextStatus, updatedAt: new Date() }).where(eq(bto.id, id))
  await logApproval({ btoId: id, tahap: 'sdm', aksi, actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus, catatan })
  return { status: nextStatus }
}

// ─── List BTO ─────────────────────────────────────────────────────────────────
export async function listBtoService(filters: {
  employeeId?: string
  viewerRole?: string
  isAdmin?: boolean
  status?: string
  dateFrom?: Date
  dateTo?: Date
  page: number
  limit: number
}) {
  const conditions = []

  if (filters.isAdmin) {
    if (filters.employeeId) {
      conditions.push(eq(bto.employeeId, filters.employeeId))
    }
  } else if (filters.employeeId) {
    const userOrApproverConditions = [
      eq(bto.employeeId, filters.employeeId),
      eq(bto.pemberiTugasId, filters.employeeId)
    ]
    if (filters.viewerRole === 'sdm') {
      userOrApproverConditions.push(eq(bto.status, 'SDM_REVIEW'))
    }
    conditions.push(or(...userOrApproverConditions))
  }

  if (filters.status)     conditions.push(eq(bto.status, filters.status as any))
  if (filters.dateFrom)   conditions.push(gte(bto.createdAt, filters.dateFrom))
  if (filters.dateTo)     conditions.push(lte(bto.createdAt, filters.dateTo))

  const offset = (filters.page - 1) * filters.limit
  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(bto)
    .where(conditions.length ? and(...conditions) : undefined)

  const rows = await db.select().from(bto)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bto.createdAt))
    .limit(filters.limit)
    .offset(offset)

  return { rows, total: Number(totalRow.count) }
}

// ─── Helper: log approval ─────────────────────────────────────────────────────
async function logApproval(data: {
  btoId: string; tahap: string; aksi: string
  actorId: string; actorNama?: string
  statusDari?: string; statusKe?: string; catatan?: string
}) {
  await db.insert(btoApprovalLog).values({
    btoId:      data.btoId,
    tahap:      data.tahap,
    aksi:       data.aksi,
    actorId:    data.actorId,
    actorNama:  data.actorNama,
    statusDari: data.statusDari,
    statusKe:   data.statusKe,
    catatan:    data.catatan,
  })
}
