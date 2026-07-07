// ─── BTO Service ──────────────────────────────────────────────────────────────
// State machine BTO: Create, Submit, Approval flow
import { db }        from '../db/connection'
import { bto, btoApprovalLog, dp, dpApprovalLog, localUserCache, configPemberiTugas, refTransport, spdk, spdkApprovalLog } from '../db/schema'
import { eq, desc, and, gte, lte, like, or, sql, inArray } from 'drizzle-orm'
import { AppError }  from '../utils/errorHandler'
import { generateNomor } from '../utils/romanNumeral'
import { reverseGeocode, getWilayahTipe, haversineKm } from './geocoding.service'
import { config as appConfig } from '../config/env'
import { getGradeIdByLevel, hitungDurasiHariMalam, validateRincianAgainstPagu } from './pagu.service'
import { ensureApproverSpdkConfig, resolveSpdkApproverKabag } from './spdk.service'

function fallbackNegaraFromWilayah(wilayahTipe?: 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' | null) {
  if (!wilayahTipe || wilayahTipe === 'luar_negeri') return null
  return 'Indonesia'
}

function requireCatatanTindakan(aksi: string, catatan?: string) {
  if (!catatan?.trim()) {
    throw new AppError(`Catatan wajib diisi untuk aksi ${aksi}`, 400)
  }
}

async function resolveTujuanGeo(
  lat: number,
  lng: number,
  wilayahTipe?: 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' | null,
  fallback?: {
    alamat?: string | null
    provinsi?: string | null
    negara?: string | null
    tujuanNama?: string | null
  },
) {
  try {
    const geo = await reverseGeocode(lat, lng)
    return {
      alamat: geo.alamat || fallback?.alamat || fallback?.tujuanNama || '',
      provinsi: geo.provinsi ?? fallback?.provinsi ?? null,
      negara: geo.negara ?? fallback?.negara ?? fallbackNegaraFromWilayah(wilayahTipe),
    }
  } catch (err) {
    console.error('Gagal reverse geocode tujuan BTO:', err)
    return {
      alamat: fallback?.alamat || fallback?.tujuanNama || '',
      provinsi: fallback?.provinsi ?? null,
      negara: fallback?.negara ?? fallbackNegaraFromWilayah(wilayahTipe),
    }
  }
}

// ─── Buat BTO baru (DRAFT) ───────────────────────────────────────────────────
export async function createBtoService(
  employeeId: string,
  employeeNama: string | null,
  data: {
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
    barang?: string | null
    jarakKm?: number | null
    wilayahTipe?: 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' | null
    tujuanAlamat?: string | null
    tujuanProvinsi?: string | null
    tujuanNegara?: string | null
  }
) {
  const geo = await resolveTujuanGeo(data.tujuanLat, data.tujuanLng, data.wilayahTipe, {
    alamat: data.tujuanAlamat,
    provinsi: data.tujuanProvinsi,
    negara: data.tujuanNegara,
    tujuanNama: data.tujuanNama,
  })
  const [inserted] = await db.insert(bto).values({
    employeeId,
    employeeNama,
    ...data,
    tujuanLat:    String(data.tujuanLat),
    tujuanLng:    String(data.tujuanLng),
    tujuanAlamat: geo.alamat || data.tujuanNama,
    tujuanProvinsi: geo.provinsi ?? undefined,
    tujuanNegara: geo.negara ?? undefined,
    jarakKm:      data.jarakKm ? String(data.jarakKm) : null,
    wilayahTipe:  data.wilayahTipe ?? null,
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

  const coordsChanged = data.tujuanLat !== undefined || data.tujuanLng !== undefined
  if (coordsChanged || data.wilayahTipe !== undefined) {
    const lat = Number(data.tujuanLat ?? existing.tujuanLat)
    const lng = Number(data.tujuanLng ?? existing.tujuanLng)
    const wilayahTipe = (data.wilayahTipe ?? existing.wilayahTipe) as 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri' | null
    const geo = await resolveTujuanGeo(lat, lng, wilayahTipe, {
      alamat: data.tujuanAlamat ?? existing.tujuanAlamat,
      provinsi: data.tujuanProvinsi ?? existing.tujuanProvinsi,
      negara: data.tujuanNegara ?? existing.tujuanNegara,
      tujuanNama: data.tujuanNama ?? existing.tujuanNama,
    })
    data.tujuanAlamat = geo.alamat || data.tujuanNama || existing.tujuanNama
    data.tujuanProvinsi = geo.provinsi ?? (coordsChanged ? null : existing.tujuanProvinsi)
    data.tujuanNegara = geo.negara ?? (coordsChanged ? null : existing.tujuanNegara)
  }

  const [updated] = await db.update(bto).set({ ...data, updatedAt: new Date() })
    .where(eq(bto.id, id)).returning()
  return updated
}

// ─── Hapus BTO (DRAFT saja) ──────────────────────────────────────────────────
export async function deleteBtoService(id: string, employeeId: string, isAdmin: boolean) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)

  if (!isAdmin && existing.employeeId !== employeeId) {
    throw new AppError('Tidak diizinkan menghapus BTO ini', 403)
  }
  if (!isAdmin && existing.status !== 'DRAFT' && existing.status !== 'REVISION_DP') {
    throw new AppError(`BTO dengan status ${existing.status} tidak bisa dihapus`, 400)
  }

  await db.delete(bto).where(eq(bto.id, id))
  return { id, success: true }
}

// ─── Batalkan BTO oleh Pembuat (Cancel) ───────────────────────────────────────
export async function cancelBtoService(id: string, actor: { id: string; nama: string }, catatan: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.employeeId !== actor.id) throw new AppError('Tidak diizinkan membatalkan BTO ini', 403)

  const allowedStatuses = ['DRAFT', 'SUBMITTED', 'ADMIN_DP_REVIEW', 'REVISION_DP', 'PT_REVIEW', 'SDM_REVIEW'];
  if (!allowedStatuses.includes(existing.status)) {
    throw new AppError(`BTO dengan status ${existing.status} tidak bisa dibatalkan sendiri, harap hubungi Admin`, 400)
  }

  if (!catatan?.trim()) {
    throw new AppError('Catatan atau alasan pembatalan wajib diisi', 400)
  }

  await db.update(bto).set({
    status: 'REJECTED',
    updatedAt: new Date(),
  }).where(eq(bto.id, id))

  await db.insert(btoApprovalLog).values({
    btoId: id,
    tahap: 'pemohon',
    aksi: 'cancel',
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: existing.status,
    statusKe: 'REJECTED',
    catatan: catatan,
  })

  // Jika butuh DP, dan DP ada, reject juga DP-nya (agar tidak menggantung)
  if (existing.butuhDp) {
    const dpRow = await db.query.dp.findFirst({ where: eq(dp.btoId, id) })
    if (dpRow) {
      await db.update(dp).set({
        status: 'REJECTED',
        updatedAt: new Date(),
      }).where(eq(dp.id, dpRow.id))

      await db.insert(dpApprovalLog).values({
        dpId: dpRow.id,
        aksi: 'cancel',
        actorId: actor.id,
        actorNama: actor.nama,
        catatan: catatan,
      })
    }
  }

  return { id, success: true, status: 'REJECTED' }
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
  const geo = await resolveTujuanGeo(Number(existing.tujuanLat), Number(existing.tujuanLng), existing.wilayahTipe, {
    alamat: existing.tujuanAlamat,
    provinsi: existing.tujuanProvinsi,
    negara: existing.tujuanNegara,
    tujuanNama: existing.tujuanNama,
  })

  // Dapatkan penempatan area user
  const userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, actor.id),
  })

  let penempatanLat = userCache?.penempatanLat ?? null
  let penempatanLng = userCache?.penempatanLng ?? null

  if (userCache?.employeeId) {
    try {
      const portalRes = await fetch(`${appConfig.portal.apiUrl}/api/sso/employees?id=${userCache.employeeId}`, {
        headers: { 'x-internal': appConfig.portal.internalToken },
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
      console.error('Failed to reverse geocode user penempatan area:', err)
    }
  }

  const tujuanNegara = geo.negara ?? fallbackNegaraFromWilayah(existing.wilayahTipe)
  const wilayah = existing.wilayahTipe || getWilayahTipe(
    userProvinsi,
    geo.provinsi,
    tujuanNegara,
  )

  // Hitung jarak dari penempatan ke tujuan
  let jarakKm: number | undefined
  if (existing.jarakKm) {
    jarakKm = Number(existing.jarakKm)
  } else if (penempatanLat && penempatanLng) {
    jarakKm = haversineKm(
      Number(penempatanLat), Number(penempatanLng),
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

  let transportLabel: string | null = null
  if (existing.transportId) {
    const [tRow] = await db.select().from(refTransport).where(eq(refTransport.id, existing.transportId)).limit(1)
    if (tRow) transportLabel = tRow.label
  }

  await db.update(bto).set({
    status:        nextStatus,
    nomorBto,
    tahun,
    sequence,
    submittedAt:   now,
    wilayahTipe:   wilayah,
    tujuanAlamat:  geo.alamat || existing.tujuanNama,
    tujuanProvinsi: geo.provinsi ?? undefined,
    tujuanNegara:  tujuanNegara ?? undefined,
    jarakKm:       jarakKm ? String(jarakKm.toFixed(2)) : undefined,
    transportLabel,
    updatedAt:     now,
  }).where(eq(bto.id, id))

  if (existing.butuhDp) {
    const dpRow = await db.query.dp.findFirst({ where: eq(dp.btoId, id) })
    await db.update(dp).set({
      status: 'ADMIN_REVIEW',
      submittedAt: now,
      updatedAt: now,
    }).where(eq(dp.btoId, id))

    // Log DP submit ke dp_approval_log
    if (dpRow) {
      await db.insert(dpApprovalLog).values({
        dpId: dpRow.id,
        aksi: 'submit',
        actorId: actor.id,
        actorNama: actor.nama,
        catatan: 'DP diajukan bersamaan dengan pengajuan BTO',
      })
    }
  }

  await logApproval({ btoId: id, tahap: 'user', aksi: 'submit', actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus })

  return { nomorBto, status: nextStatus, wilayahTipe: wilayah }
}

// ─── Approval: Admin DP ───────────────────────────────────────────────────────
export async function adminApproveDpService(id: string, aksi: 'approve' | 'reject' | 'revision', actor: { id: string; nama: string }, catatan?: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.status !== 'ADMIN_DP_REVIEW') throw new AppError('Bukan tahap admin DP review', 400)
  requireCatatanTindakan(aksi, catatan)

  const statusMap = { approve: 'PT_REVIEW', reject: 'REJECTED', revision: 'REVISION_DP' } as const
  const nextStatus = statusMap[aksi]
  const dpStatusMap = { approve: 'APPROVED', reject: 'REJECTED', revision: 'REVISION' } as const

  await db.update(bto).set({ status: nextStatus, catatanAdmin: catatan, updatedAt: new Date() }).where(eq(bto.id, id))
  await db.update(dp).set({ status: dpStatusMap[aksi], updatedAt: new Date() }).where(eq(dp.btoId, id))

  // Log DP approval ke dp_approval_log
  const dpRow = await db.query.dp.findFirst({ where: eq(dp.btoId, id) })
  if (dpRow) {
    await db.insert(dpApprovalLog).values({
      dpId: dpRow.id,
      aksi,
      actorId: actor.id,
      actorNama: actor.nama,
      catatan,
    })
  }

  await logApproval({ btoId: id, tahap: 'admin_dp', aksi, actorId: actor.id, actorNama: actor.nama, statusDari: existing.status, statusKe: nextStatus, catatan })
  return { status: nextStatus }
}

// ─── Approval: Pemberi Tugas ─────────────────────────────────────────────────
export async function ptApproveService(id: string, aksi: 'approve' | 'reject', actor: { id: string; employeeId?: string | null; nama: string }, catatan?: string) {
  const [existing] = await db.select().from(bto).where(eq(bto.id, id)).limit(1)
  if (!existing) throw new AppError('BTO tidak ditemukan', 404)
  if (existing.status !== 'PT_REVIEW') throw new AppError('Bukan tahap Pemberi Tugas review', 400)
  const actorIdentifiers = [actor.id, actor.employeeId].filter((id): id is string => Boolean(id))
  if (!existing.pemberiTugasId || !actorIdentifiers.includes(existing.pemberiTugasId)) {
    throw new AppError('Anda bukan pemberi tugas BTO ini', 403)
  }
  requireCatatanTindakan(aksi, catatan)

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
  requireCatatanTindakan(aksi, catatan)

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
    if (filters.viewerRole?.split(',').includes('sdm')) {
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

// ─── List BTO Approvals ───────────────────────────────────────────────────────
async function isBom1Actor(actor: { id: string; employeeId?: string | null; gradeLevel?: number | null }) {
  const identifiers = [actor.id, actor.employeeId].filter((id): id is string => Boolean(id))
  const cached = await Promise.all([
    ...identifiers.map((id) => db.query.localUserCache.findFirst({ where: eq(localUserCache.portalUserId, id) })),
    ...identifiers.map((id) => db.query.localUserCache.findFirst({ where: eq(localUserCache.employeeId, id) })),
  ])

  const hasBom1Kode = cached.some((row) => {
    const gradeKode = String(row?.gradeKode ?? '').trim().toUpperCase()
    return gradeKode === 'BOM-1'
  })
  if (hasBom1Kode) return true

  try {
    const portalRes = await fetch(`${appConfig.portal.apiUrl}/api/sso/grades`, {
      headers: { 'x-internal': appConfig.portal.internalToken },
    })
    if (portalRes.ok) {
      const body = await portalRes.json() as { data?: Array<{ kode?: string | null; level?: number | null }> }
      const bom1Levels = new Set(
        (body.data ?? [])
          .filter((grade) => String(grade.kode ?? '').trim().toUpperCase() === 'BOM-1')
          .map((grade) => Number(grade.level))
          .filter((level) => Number.isFinite(level))
      )
      if (bom1Levels.size > 0) {
        if (bom1Levels.has(Number(actor.gradeLevel))) return true
        if (cached.some((row) => bom1Levels.has(Number(row?.gradeLevel)))) return true
      }
    }
  } catch (err) {
    console.error('Gagal mengambil mapping grade BOM-1 dari Portal:', err)
  }

  return false
}

export async function listBtoApprovalsService(actor: { id: string; employeeId?: string | null; role: string; gradeLevel?: number | null }, all: boolean = true) {
  const roleConditions: any[] = []
  const actorIdentifiers = [actor.id, actor.employeeId].filter((id): id is string => Boolean(id))

  const roles = (actor.role || 'user').split(',')
  const actorIsBom1 = await isBom1Actor(actor)

  if (all && roles.some(r => ['super_admin', 'admin'].includes(r))) {
    roleConditions.push(
      eq(bto.status, 'ADMIN_DP_REVIEW'),
      eq(bto.status, 'SPDK_DRAFT'),
      eq(bto.status, 'KABAG_REVIEW')
    )
  }

  // SDM_REVIEW hanya muncul di halaman sdm-review (all=true), tidak di my-approvals (all=false)
  if (all && roles.includes('sdm')) {
    roleConditions.push(
      eq(bto.status, 'SDM_REVIEW')
    )
  }

  // Find BTOs where actor is the assigned Kabag in active SPDKs with status KABAG_REVIEW
  const kabagSpdks = await db.select({ btoId: spdk.btoId, spdkId: spdk.id, approverKabagId: spdk.approverKabagId })
    .from(spdk)
    .where(eq(spdk.status, 'KABAG_REVIEW'))

  // Self-heal: SPDKs with null approverKabagId (created before the bug was fixed)
  // Try to resolve and patch them now
  const cfg = await ensureApproverSpdkConfig()
  for (const s of kabagSpdks) {
    if (s.approverKabagId) continue
    // SPDK with no assigned kabag — try resolving now
    try {
      const [btoRow] = await db.select().from(bto).where(eq(bto.id, s.btoId)).limit(1)
      if (!btoRow) continue

      const resolvedKabag = await resolveSpdkApproverKabag(btoRow, cfg)
      const resolvedKabagId = resolvedKabag.id

      if (resolvedKabagId) {
        // Patch the SPDK row with the resolved kabag id
        await db.update(spdk).set({
          approverKabagId: resolvedKabagId,
          approverKabagNama: resolvedKabag.nama ?? undefined,
        }).where(eq(spdk.id, s.spdkId))
        s.approverKabagId = resolvedKabagId
      } else if (cfg?.fixedEmployeeId) {
        // Last resort: use fixed person from config
        await db.update(spdk).set({ approverKabagId: cfg.fixedEmployeeId }).where(eq(spdk.id, s.spdkId))
        s.approverKabagId = cfg.fixedEmployeeId
      }
    } catch (err) {
      console.error('Self-heal approverKabagId failed for SPDK', s.spdkId, err)
    }
  }

  for (const s of kabagSpdks.filter((row) => Boolean(row.approverKabagId))) {
    try {
      const [btoRow] = await db.select().from(bto).where(eq(bto.id, s.btoId)).limit(1)
      if (!btoRow) continue

      const resolvedKabag = await resolveSpdkApproverKabag(btoRow, cfg)
      if (resolvedKabag.id && resolvedKabag.id !== s.approverKabagId) {
        await db.update(spdk).set({
          approverKabagId: resolvedKabag.id,
          approverKabagNama: resolvedKabag.nama ?? undefined,
        }).where(eq(spdk.id, s.spdkId))
        s.approverKabagId = resolvedKabag.id
      }
    } catch (err) {
      console.error('Refresh approverKabagId failed for SPDK', s.spdkId, err)
    }
  }

  // Now collect BTO IDs where actor is the Kabag
  const kabagBtoIds = kabagSpdks
    .filter(s => s.approverKabagId != null && actorIdentifiers.includes(s.approverKabagId))
    .map(s => s.btoId)

  if (kabagBtoIds.length > 0) {
    roleConditions.push(
      and(
        eq(bto.status, 'KABAG_REVIEW'),
        inArray(bto.id, kabagBtoIds)
      )
    )
  }

  const unassignedKabagBtoIds = actorIsBom1
    ? kabagSpdks
        .filter(s => !s.approverKabagId)
        .map(s => s.btoId)
    : []

  if (unassignedKabagBtoIds.length > 0) {
    roleConditions.push(
      and(
        eq(bto.status, 'KABAG_REVIEW'),
        inArray(bto.id, unassignedKabagBtoIds)
      )
    )
  }

  if (cfg?.fixedEmployeeId && actorIdentifiers.includes(cfg.fixedEmployeeId)) {
    roleConditions.push(
      eq(bto.status, 'KABAG_REVIEW')
    )
  }

  const pemberiTugasConditions = actorIdentifiers.map((id) => eq(bto.pemberiTugasId, id))
  if (pemberiTugasConditions.length > 0) {
    roleConditions.push(
      and(
        eq(bto.status, 'PT_REVIEW'),
        or(...pemberiTugasConditions)
      )
    )
  }

  if (roleConditions.length === 0) return []

  if (roleConditions.length === 0) return []

  const rows = await db.select().from(bto)
    .where(or(...roleConditions))
    .orderBy(desc(bto.createdAt))

  return rows
}

// ─── List BTO Approvals History ──────────────────────────────────────────────
export async function listBtoApprovalsHistoryService(actor: { id: string; role: string }) {
  const isAdmin = (actor.role || '').split(',').some(r => ['super_admin', 'admin', 'sdm'].includes(r))

  // Base BTO logs
  let btoLogsQuery = db.select({
    logId: btoApprovalLog.id,
    btoId: bto.id,
    nomorBto: bto.nomorBto,
    employeeNama: bto.employeeNama,
    pemberiTugasNama: bto.pemberiTugasNama,
    tujuanNama: bto.tujuanNama,
    kepentingan: bto.kepentingan,
    estBerangkat: bto.estBerangkat,
    estKembali: bto.estKembali,
    status: bto.status,
    approvalRole: btoApprovalLog.tahap,
    approvalAction: btoApprovalLog.aksi,
    approvalCatatan: btoApprovalLog.catatan,
    approvedAt: btoApprovalLog.createdAt,
    approvalActorNama: btoApprovalLog.actorNama,
  })
  .from(btoApprovalLog)
  .leftJoin(bto, eq(btoApprovalLog.btoId, bto.id))
  .$dynamic()

  if (!isAdmin) {
    btoLogsQuery = btoLogsQuery.where(eq(btoApprovalLog.actorId, actor.id))
  }

  const btoLogsResult = await btoLogsQuery

  // SPDK logs
  let spdkLogsQuery = db.select({
    logId: spdkApprovalLog.id,
    spdkId: spdk.id,
    btoId: bto.id,
    nomorBto: bto.nomorBto,
    employeeNama: bto.employeeNama,
    pemberiTugasNama: bto.pemberiTugasNama,
    tujuanNama: bto.tujuanNama,
    kepentingan: bto.kepentingan,
    estBerangkat: bto.estBerangkat,
    estKembali: bto.estKembali,
    status: bto.status,
    approvalRole: sql<string>`'kabag_spdk'`,
    approvalAction: spdkApprovalLog.aksi,
    approvalCatatan: spdkApprovalLog.catatan,
    approvedAt: spdkApprovalLog.createdAt,
    approvalActorNama: spdkApprovalLog.actorNama,
  })
  .from(spdkApprovalLog)
  .leftJoin(spdk, eq(spdkApprovalLog.spdkId, spdk.id))
  .leftJoin(bto, eq(spdk.btoId, bto.id))
  .$dynamic()

  if (!isAdmin) {
    spdkLogsQuery = spdkLogsQuery.where(eq(spdkApprovalLog.actorId, actor.id))
  }

  const spdkLogsResult = await spdkLogsQuery

  const allLogs = [
    ...btoLogsResult.map(row => ({
      id: `bto-${row.logId}`,
      nomorBto: row.nomorBto,
      employeeNama: row.employeeNama,
      pemberiTugasNama: row.pemberiTugasNama,
      tujuanNama: row.tujuanNama || '',
      kepentingan: row.kepentingan,
      estBerangkat: row.estBerangkat?.toISOString(),
      estKembali: row.estKembali?.toISOString(),
      status: row.status || '',
      approvalRole: row.approvalRole || '',
      approvalAction: row.approvalAction || '',
      approvalCatatan: row.approvalCatatan,
      approvedAt: row.approvedAt?.toISOString(),
      approvalActorNama: row.approvalActorNama,
    })),
    ...spdkLogsResult.map(row => ({
      id: `spdk-${row.logId}`,
      nomorBto: row.nomorBto,
      employeeNama: row.employeeNama,
      pemberiTugasNama: row.pemberiTugasNama,
      tujuanNama: row.tujuanNama || '',
      kepentingan: row.kepentingan,
      estBerangkat: row.estBerangkat?.toISOString(),
      estKembali: row.estKembali?.toISOString(),
      status: row.status || '',
      approvalRole: row.approvalRole,
      approvalAction: row.approvalAction || '',
      approvalCatatan: row.approvalCatatan,
      approvedAt: row.approvedAt?.toISOString(),
      approvalActorNama: row.approvalActorNama,
    }))
  ]

  allLogs.sort((a, b) => new Date(b.approvedAt || 0).getTime() - new Date(a.approvedAt || 0).getTime())

  return allLogs
}
