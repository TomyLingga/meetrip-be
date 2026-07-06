// ─── SPDK Service ─────────────────────────────────────────────────────────────
// ─── SPDK Service ─────────────────────────────────────────────────────────────
import { db }          from '../db/connection'
import { spdk, spdkApprovalLog, bto, btoApprovalLog, attendStamp, configApproverSpdk, localUserCache } from '../db/schema'
import { eq, sql }     from 'drizzle-orm'
import { AppError }    from '../utils/errorHandler'
import { generateNomor, nomorSpdkFromBto } from '../utils/romanNumeral'
import { haversineKm } from './geocoding.service'
import { config as appConfig } from '../config/env'

export async function ensureApproverSpdkConfig() {
  const [row] = await db.select().from(configApproverSpdk).where(eq(configApproverSpdk.isActive, true)).limit(1)
  if (row) return row

  try {
    const [inserted] = await db.insert(configApproverSpdk).values({
      mode: 'unit_head',
      isActive: true,
      keterangan: 'Default otomatis: approver SPDK mengikuti Kepala Bagian/Manager Unit dari Portal SSO',
    }).returning()
    return inserted
  } catch {
    const [fallback] = await db.select().from(configApproverSpdk).where(eq(configApproverSpdk.isActive, true)).limit(1)
    return fallback ?? null
  }
}

export async function resolveSpdkApproverKabag(
  btoRow: typeof bto.$inferSelect,
  cfg?: typeof configApproverSpdk.$inferSelect | null,
) {
  if (cfg?.mode === 'fixed_person' && cfg.fixedEmployeeId) {
    return { id: cfg.fixedEmployeeId, nama: null }
  }

  const mode = cfg?.mode ?? 'unit_head'
  if (mode !== 'unit_head') {
    return { id: cfg?.fixedEmployeeId ?? null, nama: null }
  }

  try {
    const ownerCache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, btoRow.employeeId),
    })

    const ownerEmployeeId = ownerCache?.employeeId
    if (!ownerEmployeeId) return { id: cfg?.fixedEmployeeId ?? null, nama: null }

    const ownerRes = await fetch(
      `${appConfig.portal.apiUrl}/api/sso/employees?id=${ownerEmployeeId}`,
      { headers: { 'x-internal': appConfig.portal.internalToken } }
    )
    if (!ownerRes.ok) return { id: cfg?.fixedEmployeeId ?? null, nama: null }

    const ownerData = await ownerRes.json() as { data: any[] }
    const atasanEmployeeId = ownerData.data?.[0]?.atasanId
    if (!atasanEmployeeId) return { id: cfg?.fixedEmployeeId ?? null, nama: null }

    const atasanRes = await fetch(
      `${appConfig.portal.apiUrl}/api/sso/employees?id=${atasanEmployeeId}`,
      { headers: { 'x-internal': appConfig.portal.internalToken } }
    )
    if (!atasanRes.ok) return { id: cfg?.fixedEmployeeId ?? null, nama: null }

    const atasanData = await atasanRes.json() as { data: any[] }
    const kabag = atasanData.data?.[0]
    const kabagPortalUserId = kabag?.id ?? null
    const kabagEmployeeId = kabag?.employeeId ?? atasanEmployeeId ?? null
    let resolvedId = kabagPortalUserId

    if (kabagEmployeeId) {
      const kabagCache = await db.query.localUserCache.findFirst({
        where: eq(localUserCache.employeeId, kabagEmployeeId),
      })
      resolvedId = kabagCache?.portalUserId ?? resolvedId
    }

    return {
      id: resolvedId ?? cfg?.fixedEmployeeId ?? null,
      nama: kabag?.namaLengkap ?? null,
    }
  } catch (err) {
    console.error('Failed to resolve Kabag (unit_head) from Portal SSO:', err)
    return { id: cfg?.fixedEmployeeId ?? null, nama: null }
  }
}

// ─── Terbitkan SPDK ───────────────────────────────────────────────────────────
export async function issueSpdkService(
  btoId: string,
  actor: { id: string; nama: string },
  catatanAdmin?: string,
  customNomorSpdk?: string,
  btoUpdateData?: any
) {
  if (btoUpdateData && Object.keys(btoUpdateData).length > 0) {
    const cleanUpdate: any = { ...btoUpdateData, updatedAt: new Date() }
    if (cleanUpdate.estBerangkat) cleanUpdate.estBerangkat = new Date(cleanUpdate.estBerangkat)
    if (cleanUpdate.estKembali) cleanUpdate.estKembali = new Date(cleanUpdate.estKembali)
    
    await db.update(bto).set(cleanUpdate).where(eq(bto.id, btoId))
  }

  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRow.status !== 'SPDK_DRAFT') throw new AppError('BTO belum di tahap SPDK Draft', 400)
  const existingSpdk = await db.query.spdk.findFirst({ where: eq(spdk.btoId, btoId) })
  if (existingSpdk) throw new AppError('SPDK untuk BTO ini sudah pernah diterbitkan', 400)

  // Tentukan approver SPDK
  const cfg = await ensureApproverSpdkConfig()
  const approverKabag = await resolveSpdkApproverKabag(btoRow, cfg)
  const approverKabagId = approverKabag.id

  // Cek apakah pemberi tugas = approver Kabag → auto approve
  const autoApprove = btoRow.pemberiTugasId === approverKabagId

  // Generate nomor SPDK
  const now      = new Date()
  const tahun    = now.getFullYear()
  const seqRow   = await db.execute(
    sql`SELECT COALESCE(MAX(CAST(sequence AS INTEGER)), 0) + 1 AS next_seq FROM spdk WHERE tahun = ${String(tahun)}`
  )
  const sequence = Number((seqRow.rows[0] as any).next_seq)
  const nomorSpdk = customNomorSpdk || nomorSpdkFromBto(btoRow.nomorBto) || generateNomor(sequence, 'SPDK', now)

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
    approverKabagNama: approverKabag.nama ?? undefined,
    tahun:             String(tahun),
    sequence:          String(sequence),
  }).returning()

  // Update status BTO
  const btoNextStatus = autoApprove ? 'ACTIVE' : 'KABAG_REVIEW'
  await db.update(bto).set({ status: btoNextStatus, updatedAt: now }).where(eq(bto.id, btoId))

  await db.insert(btoApprovalLog).values({
    btoId,
    tahap:      'admin_spdk',
    aksi:       'issued',
    actorId:    actor.id,
    actorNama:  actor.nama,
    statusDari: btoRow.status,
    statusKe:   'KABAG_REVIEW',
    catatan:    catatanAdmin || `SPDK diterbitkan dengan nomor ${nomorSpdk}`,
  })

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
    await db.insert(btoApprovalLog).values({
      btoId,
      tahap:      'persetujuan_spdk',
      aksi:       'auto_approve',
      actorId:    actor.id,
      actorNama:  actor.nama,
      statusDari: 'KABAG_REVIEW',
      statusKe:   'ACTIVE',
      catatan:    'Persetujuan SPDK dilewati otomatis karena pemberi tugas sama dengan approver SPDK',
    })
  }

  return { ...inserted, autoApproved: autoApprove }
}

// ─── Kabag Approve/Reject SPDK ───────────────────────────────────────────────
export async function kabagApproveSpdkService(
  spdkId: string,
  aksi: 'approve' | 'reject',
  actor: { id: string; employeeId?: string | null; nama: string },
  isAdmin: boolean,
  catatan?: string,
) {
  const [spdkRow] = await db.select().from(spdk).where(eq(spdk.id, spdkId)).limit(1)
  if (!spdkRow) throw new AppError('SPDK tidak ditemukan', 404)
  if (spdkRow.status !== 'KABAG_REVIEW') throw new AppError('Bukan tahap Kabag review', 400)
  const actorIdentifiers = [actor.id, actor.employeeId].filter((id): id is string => Boolean(id))
  if (!isAdmin && (!spdkRow.approverKabagId || !actorIdentifiers.includes(spdkRow.approverKabagId))) {
    throw new AppError('Anda bukan approver SPDK ini', 403)
  }

  const nextStatusSpdk = aksi === 'approve' ? 'APPROVED' : 'REJECTED'
  const nextStatusBto  = aksi === 'approve' ? 'ACTIVE'   : 'REJECTED'
  const now = new Date()

  await db.update(spdk).set({
    status: nextStatusSpdk,
    approverKabagId: spdkRow.approverKabagId === actor.employeeId ? actor.id : spdkRow.approverKabagId,
    updatedAt: now,
  }).where(eq(spdk.id, spdkId))
  await db.update(bto).set({ status: nextStatusBto, updatedAt: now }).where(eq(bto.id, spdkRow.btoId))

  await db.insert(spdkApprovalLog).values({
    spdkId, aksi, actorId: actor.id, actorNama: actor.nama, catatan,
  })

  await db.insert(btoApprovalLog).values({
    btoId:      spdkRow.btoId,
    tahap:      'persetujuan_spdk',
    aksi,
    actorId:    actor.id,
    actorNama:  actor.nama,
    statusDari: 'KABAG_REVIEW',
    statusKe:   nextStatusBto,
    catatan,
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
  isAdmin: boolean,
) {
  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRow.status !== 'ACTIVE') throw new AppError('BTO belum berstatus ACTIVE', 400)
  if (isAdminOverride && !isAdmin) {
    throw new AppError('Hanya admin yang bisa melakukan override stamp', 403)
  }
  if (!isAdminOverride && btoRow.employeeId !== actor.id) {
    throw new AppError('Attend stamp hanya bisa dilakukan oleh pemilik BTO', 403)
  }

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
    if (!isValid) {
      throw new AppError(`Geofence validation failed. Anda berada ${jarakM.toFixed(0)}m dari lokasi tujuan, sedangkan batas maksimum adalah ${appConfig.attend.radiusMeter}m.`, 400)
    }
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

// ─── Update SPDK (Admin Only) ────────────────────────────────────────────────
export async function updateSpdkService(
  spdkId: string,
  isAdmin: boolean,
  data: {
    nomorSpdk?: string;
    catatanAdmin?: string;
  }
) {
  if (!isAdmin) throw new AppError('Hanya admin yang dapat mengedit SPDK', 403)

  const [existing] = await db.select().from(spdk).where(eq(spdk.id, spdkId)).limit(1)
  if (!existing) throw new AppError('SPDK tidak ditemukan', 404)

  const updateData: any = { updatedAt: new Date() }
  if (data.nomorSpdk !== undefined) updateData.nomorSpdk = data.nomorSpdk
  if (data.catatanAdmin !== undefined) updateData.catatanAdmin = data.catatanAdmin

  const [updated] = await db.update(spdk).set(updateData).where(eq(spdk.id, spdkId)).returning()
  return updated
}
