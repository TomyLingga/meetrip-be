// ─── SPDK Service ─────────────────────────────────────────────────────────────
import { db }          from '../db/connection'
import { spdk, spdkApprovalLog, bto, attendStamp, configApproverSpdk, localUserCache } from '../db/schema'
import { eq, sql }     from 'drizzle-orm'
import { AppError }    from '../utils/errorHandler'
import { generateNomor } from '../utils/romanNumeral'
import { haversineKm } from './geocoding.service'
import { config as appConfig } from '../config/env'

// ─── Terbitkan SPDK ───────────────────────────────────────────────────────────
export async function issueSpdkService(btoId: string, actor: { id: string; nama: string }, catatanAdmin?: string) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRow.status !== 'SPDK_DRAFT') throw new AppError('BTO belum di tahap SPDK Draft', 400)

  // Tentukan approver SPDK
  const [cfg] = await db.select().from(configApproverSpdk).where(eq(configApproverSpdk.isActive, true)).limit(1)
  let approverKabagId: string | null = null
  if (cfg?.mode === 'fixed_person') {
    approverKabagId = cfg.fixedEmployeeId ?? null
  }
  // mode='unit_head' → cari kepala unit user (bisa diimplementasi lebih lanjut)

  // Cek apakah pemberi tugas = approver Kabag → auto approve
  const autoApprove = btoRow.pemberiTugasId === approverKabagId

  // Generate nomor SPDK
  const now      = new Date()
  const tahun    = now.getFullYear()
  const seqRow   = await db.execute(
    sql`SELECT COALESCE(MAX(CAST(sequence AS INTEGER)), 0) + 1 AS next_seq FROM spdk WHERE tahun = ${String(tahun)}`
  )
  const sequence = Number((seqRow.rows[0] as any).next_seq)
  const nomorSpdk = generateNomor(sequence, 'SPDK', now)

  const spdkStatus = autoApprove ? 'APPROVED' : 'KABAG_REVIEW'

  const [inserted] = await db.insert(spdk).values({
    btoId,
    nomorBto:          btoRow.nomorBto ?? undefined,
    nomorSpdk,
    status:            spdkStatus,
    diterbitkanOleh:   actor.id,
    diterbitkanNama:   actor.nama,
    tanggalTerbit:     now,
    catatanAdmin,
    approverKabagId,
    tahun:             String(tahun),
    sequence:          String(sequence),
  }).returning()

  // Update status BTO
  const btoNextStatus = autoApprove ? 'ACTIVE' : 'KABAG_REVIEW'
  await db.update(bto).set({ status: btoNextStatus, updatedAt: now }).where(eq(bto.id, btoId))

  await db.insert(spdkApprovalLog).values({
    spdkId:    inserted.id,
    aksi:      'issued',
    actorId:   actor.id,
    actorNama: actor.nama,
    catatan:   catatanAdmin,
  })

  if (autoApprove) {
    await db.insert(spdkApprovalLog).values({
      spdkId:    inserted.id,
      aksi:      'approve',
      actorId:   actor.id,
      actorNama: actor.nama,
      catatan:   'Auto-approved: Pemberi tugas = Kabag SPDK approver',
    })
  }

  return { ...inserted, autoApproved: autoApprove }
}

// ─── Kabag Approve/Reject SPDK ───────────────────────────────────────────────
export async function kabagApproveSpdkService(
  spdkId: string,
  aksi: 'approve' | 'reject',
  actor: { id: string; nama: string },
  catatan?: string,
) {
  const [spdkRow] = await db.select().from(spdk).where(eq(spdk.id, spdkId)).limit(1)
  if (!spdkRow) throw new AppError('SPDK tidak ditemukan', 404)
  if (spdkRow.status !== 'KABAG_REVIEW') throw new AppError('Bukan tahap Kabag review', 400)

  const nextStatusSpdk = aksi === 'approve' ? 'APPROVED' : 'REJECTED'
  const nextStatusBto  = aksi === 'approve' ? 'ACTIVE'   : 'REJECTED'

  await db.update(spdk).set({ status: nextStatusSpdk, updatedAt: new Date() }).where(eq(spdk.id, spdkId))
  await db.update(bto).set({ status: nextStatusBto, updatedAt: new Date() }).where(eq(bto.id, spdkRow.btoId))

  await db.insert(spdkApprovalLog).values({
    spdkId, aksi, actorId: actor.id, actorNama: actor.nama, catatan,
  })

  return { status: nextStatusSpdk }
}

// ─── Attend Stamp ────────────────────────────────────────────────────────────
export async function attendStampService(
  btoId: string,
  actor: { id: string; nama: string },
  stampLat: number | null,
  stampLng: number | null,
  isAdminOverride: boolean,
) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRow.status !== 'ACTIVE') throw new AppError('BTO belum berstatus ACTIVE', 400)

  let finalLat = stampLat
  let finalLng = stampLng
  let jarakM   = 0
  let isValid  = false

  if (isAdminOverride) {
    // Admin override: koordinat diset ke tujuan BTO
    finalLat  = Number(btoRow.tujuanLat)
    finalLng  = Number(btoRow.tujuanLng)
    jarakM    = 0
    isValid   = true
  } else {
    if (finalLat === null || finalLng === null) throw new AppError('Koordinat stamp wajib diisi', 400)
    const jarakKm  = haversineKm(Number(btoRow.tujuanLat), Number(btoRow.tujuanLng), finalLat, finalLng)
    jarakM   = jarakKm * 1000
    // Baca radius dari config
    isValid  = jarakM <= appConfig.attend.radiusMeter
  }

  const [stamp] = await db.insert(attendStamp).values({
    btoId,
    employeeId:       actor.id,
    stampLat:         String(finalLat),
    stampLng:         String(finalLng),
    jarakDariTujuanM: String(jarakM.toFixed(2)),
    isValid,
    isAdminOverride,
    overrideOleh:     isAdminOverride ? actor.id   : undefined,
    overrideOlehNama: isAdminOverride ? actor.nama : undefined,
    stamped_at:       new Date(),
  }).returning()

  // Update status BTO → ATTENDED
  await db.update(bto).set({ status: 'ATTENDED', updatedAt: new Date() }).where(eq(bto.id, btoId))

  return { ...stamp, isValid, jarakMeter: jarakM }
}
