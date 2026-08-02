// ─── SPDK Service ─────────────────────────────────────────────────────────────
// ─── SPDK Service ─────────────────────────────────────────────────────────────
import { db }          from '../db/connection'
import { spdk, spdkApprovalLog, bto, btoApprovalLog, attendStamp, configApproverSpdk, configSistem, localUserCache } from '../db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { AppError }    from '../utils/errorHandler'
import { generateNomor, nomorSpdkFromBto } from '../utils/romanNumeral'
import { haversineKm } from './geocoding.service'
import { config as appConfig } from '../config/env'
import { fetchWithTimeout } from '../utils/http'

type PortalEmployeeLike = {
  id?: string | null
  employeeId?: string | null
  namaLengkap?: string | null
  jabatan?: string | null
  gradeKode?: string | null
  gradeLevel?: number | null
  grade?: {
    kode?: string | null
    level?: number | null
  } | null
  atasanId?: string | null
}

function requireCatatanTindakan(aksi: string, catatan?: string) {
  if (!catatan?.trim()) {
    throw new AppError(`Catatan wajib diisi untuk aksi ${aksi}`, 400)
  }
}

function isBom1Approver(employee?: PortalEmployeeLike | null) {
  if (!employee) return false
  const gradeKode = String(employee.gradeKode ?? employee.grade?.kode ?? '').trim().toUpperCase()
  const gradeLevel = Number(employee.gradeLevel ?? employee.grade?.level)
  return gradeKode === 'BOM-1' || gradeLevel === 13
}

async function fetchPortalEmployee(employeeId: string) {
  const res = await fetchWithTimeout(
    `${appConfig.portal.apiUrl}/api/sso/employees?id=${employeeId}`,
    { headers: { 'x-internal': appConfig.portal.internalToken } }
  )
  if (!res.ok) return null
  const data = await res.json() as { data?: PortalEmployeeLike[] }
  return data.data?.[0] ?? null
}

async function resolvePortalUserId(employee: PortalEmployeeLike, fallbackEmployeeId?: string | null) {
  let resolvedId = employee.id ?? null
  const employeeId = employee.employeeId ?? fallbackEmployeeId ?? null

  if (employeeId) {
    const cache = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.employeeId, employeeId),
    })
    resolvedId = cache?.portalUserId ?? resolvedId
  }

  return resolvedId
}

export async function getAttendRadiusMeter() {
  const [row] = await db.select().from(configSistem).where(eq(configSistem.kunci, 'attend_radius_meter')).limit(1)
  const configuredRadius = Number(row?.nilai)
  if (Number.isFinite(configuredRadius) && configuredRadius > 0) {
    return configuredRadius
  }
  return appConfig.attend.radiusMeter
}

async function getUserIdentifierVariants(id?: string | null) {
  const identifiers = new Set<string>()
  if (id) identifiers.add(id)

  if (id) {
    const matches = await Promise.all([
      db.query.localUserCache.findFirst({ where: eq(localUserCache.id, id) }),
      db.query.localUserCache.findFirst({ where: eq(localUserCache.portalUserId, id) }),
      db.query.localUserCache.findFirst({ where: eq(localUserCache.employeeId, id) }),
    ])

    for (const match of matches) {
      if (!match) continue
      identifiers.add(match.id)
      identifiers.add(match.portalUserId)
      if (match.employeeId) identifiers.add(match.employeeId)
    }
  }

  return Array.from(identifiers)
}

async function isSameUser(firstId?: string | null, secondId?: string | null) {
  if (!firstId || !secondId) return false
  if (firstId === secondId) return true

  const [firstIdentifiers, secondIdentifiers] = await Promise.all([
    getUserIdentifierVariants(firstId),
    getUserIdentifierVariants(secondId),
  ])
  const secondSet = new Set(secondIdentifiers)
  return firstIdentifiers.some((identifier) => secondSet.has(identifier))
}

async function isActorBom1Approver(actor: { id: string; employeeId?: string | null; gradeLevel?: number | null }) {
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
    const portalRes = await fetchWithTimeout(`${appConfig.portal.apiUrl}/api/sso/grades`, {
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

export async function checkIfUserIsSpdkApprover(portalUserId: string, employeeId?: string | null): Promise<boolean> {
  const cfg = await ensureApproverSpdkConfig()
  const identifiers = [portalUserId, employeeId].filter((id): id is string => Boolean(id))

  if (cfg.mode === 'fixed_person' && cfg.fixedEmployeeId) {
    if (identifiers.includes(cfg.fixedEmployeeId)) return true
  } else {
    // Jika tidak ada fixedEmployeeId, KABAG SPDK dihandle oleh BOM-1
    const actor = { id: portalUserId, employeeId }
    const isBom1 = await isActorBom1Approver(actor)
    if (isBom1) return true
  }

  // Cek apakah user pernah/sedang menjadi approver di SPDK manapun (untuk historikal)
  const spdkRows = await db.select({ id: spdk.id })
    .from(spdk)
    .where(inArray(spdk.approverKabagId, identifiers))
    .limit(1)

  return spdkRows.length > 0
}

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
    if (!ownerEmployeeId) return { id: null, nama: null }

    let currentEmployeeId: string | null | undefined = ownerEmployeeId
    let iterations = 0
    let firstAtasan: any = null
    let firstAtasanId: string | null = null

    while (currentEmployeeId && iterations < 5) {
      iterations++
      const currentEmp = await fetchPortalEmployee(currentEmployeeId)
      if (!currentEmp) break

      const atasanId = currentEmp.atasanId
      if (!atasanId) break

      const atasan = await fetchPortalEmployee(atasanId)
      if (!atasan) break

      if (iterations === 1) {
        firstAtasan = atasan
        firstAtasanId = atasanId
      }

      if (isBom1Approver(atasan)) {
        const resolvedId = await resolvePortalUserId(atasan, atasanId)
        return {
          id: resolvedId ?? null,
          nama: atasan.namaLengkap ?? null,
        }
      }

      currentEmployeeId = atasanId
    }

    if (firstAtasan && firstAtasanId) {
      const resolvedId = await resolvePortalUserId(firstAtasan, firstAtasanId)
      return {
        id: resolvedId ?? null,
        nama: firstAtasan.namaLengkap ?? null,
      }
    }

    return { id: null, nama: null }
  } catch (err) {
    console.error('Failed to resolve Kabag (unit_head) from Portal SSO:', err)
    return { id: null, nama: null }
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
  requireCatatanTindakan('issued', catatanAdmin)

  /*
   * Validasi dulu, tulis kemudian. Sebelumnya UPDATE bto dijalankan di atas
   * pemeriksaan status, sehingga request yang berakhir 400 ("BTO belum di tahap
   * SPDK Draft") tetap meninggalkan perubahan permanen pada baris BTO.
   */
  const [btoRowBefore] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRowBefore) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRowBefore.status !== 'SPDK_DRAFT') throw new AppError('BTO belum di tahap SPDK Draft', 400)
  const existingSpdk = await db.query.spdk.findFirst({ where: eq(spdk.btoId, btoId) })
  if (existingSpdk) throw new AppError('SPDK untuk BTO ini sudah pernah diterbitkan', 400)

  if (btoUpdateData && Object.keys(btoUpdateData).length > 0) {
    const cleanUpdate: any = { ...btoUpdateData, updatedAt: new Date() }
    if (cleanUpdate.estBerangkat) cleanUpdate.estBerangkat = new Date(cleanUpdate.estBerangkat)
    if (cleanUpdate.estKembali) cleanUpdate.estKembali = new Date(cleanUpdate.estKembali)

    await db.update(bto).set(cleanUpdate).where(eq(bto.id, btoId))
  }

  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)

  // Tentukan approver SPDK
  const cfg = await ensureApproverSpdkConfig()
  const approverKabag = await resolveSpdkApproverKabag(btoRow, cfg)
  const approverKabagId = approverKabag.id

  // Cek apakah pemberi tugas = approver Kabag → auto approve
  const autoApprove = await isSameUser(btoRow.pemberiTugasId, approverKabagId)

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
    statusKe:   btoNextStatus,
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
    const autoApproverId = approverKabagId ?? btoRow.pemberiTugasId ?? actor.id
    const autoApproverNama = approverKabag.nama ?? btoRow.pemberiTugasNama ?? actor.nama
    await db.insert(spdkApprovalLog).values({
      spdkId:    inserted.id,
      aksi:      'approve',
      actorId:   autoApproverId,
      actorNama: autoApproverNama,
      catatan:   'Auto-approved: Pemberi tugas = Kabag SPDK approver',
    })
    await db.insert(btoApprovalLog).values({
      btoId,
      tahap:      'persetujuan_spdk',
      aksi:       'auto_approve',
      actorId:    autoApproverId,
      actorNama:  autoApproverNama,
      statusDari: 'KABAG_REVIEW',
      statusKe:   'ACTIVE',
      catatan:    'Persetujuan SPDK dilewati otomatis karena pemberi tugas sama dengan approver SPDK',
    })
  }

  return { ...inserted, autoApproved: autoApprove }
}

export async function rejectSpdkDraftService(
  btoId: string,
  actor: { id: string; nama: string },
  catatan?: string,
) {
  requireCatatanTindakan('reject', catatan)

  const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
  if (btoRow.status !== 'SPDK_DRAFT') throw new AppError('BTO belum di tahap penerbitan SPDK', 400)

  await db.update(bto).set({
    status: 'REJECTED',
    updatedAt: new Date(),
  }).where(eq(bto.id, btoId))

  await db.insert(btoApprovalLog).values({
    btoId,
    tahap: 'admin_spdk',
    aksi: 'reject',
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: btoRow.status,
    statusKe: 'REJECTED',
    catatan,
  })

  return { status: 'REJECTED' }
}

// ─── Kabag Approve/Reject SPDK ───────────────────────────────────────────────
export async function kabagApproveSpdkService(
  spdkId: string,
  aksi: 'approve' | 'reject',
  actor: { id: string; employeeId?: string | null; gradeLevel?: number | null; nama: string },
  isAdmin: boolean,
  catatan?: string,
) {
  const [spdkRow] = await db.select().from(spdk).where(eq(spdk.id, spdkId)).limit(1)
  if (!spdkRow) throw new AppError('SPDK tidak ditemukan', 404)
  if (spdkRow.status !== 'KABAG_REVIEW') throw new AppError('Bukan tahap Kabag review', 400)
  const actorIdentifiers = [actor.id, actor.employeeId].filter((id): id is string => Boolean(id))
  if (!isAdmin && spdkRow.approverKabagId && !actorIdentifiers.includes(spdkRow.approverKabagId)) {
    throw new AppError('Anda bukan approver SPDK ini', 403)
  }
  /*
   * Fail-closed: dulu SPDK tanpa approver boleh disetujui oleh SIAPA PUN pemegang
   * grade BOM-1. Karena kolom approver bisa kosong akibat resolve yang gagal,
   * celah itu setara "approval bebas". Sekarang approver dihitung ulang lebih
   * dulu; hanya orang hasil perhitungan (atau admin) yang boleh menyetujui, dan
   * bila approver tidak dapat ditentukan, permintaan ditolak dengan pesan jelas.
   */
  if (!isAdmin && !spdkRow.approverKabagId) {
    const [btoRow] = await db.select().from(bto).where(eq(bto.id, spdkRow.btoId)).limit(1)
    if (!btoRow) throw new AppError('BTO tidak ditemukan', 404)
    const cfg = await ensureApproverSpdkConfig()
    const resolved = await resolveSpdkApproverKabag(btoRow, cfg)
    if (!resolved.id) {
      throw new AppError(
        'Approver SPDK belum dapat ditentukan dari struktur organisasi. Minta admin menetapkan approver terlebih dahulu.',
        409,
      )
    }
    if (!actorIdentifiers.includes(resolved.id)) {
      throw new AppError('Anda bukan approver SPDK ini', 403)
    }
    await db.update(spdk).set({
      approverKabagId: resolved.id,
      approverKabagNama: resolved.nama,
    }).where(eq(spdk.id, spdkId))
    spdkRow.approverKabagId = resolved.id
    spdkRow.approverKabagNama = resolved.nama
  }
  requireCatatanTindakan(aksi, catatan)

  const nextStatusSpdk = aksi === 'approve' ? 'APPROVED' : 'REJECTED'
  const nextStatusBto  = aksi === 'approve' ? 'ACTIVE'   : 'REJECTED'
  const now = new Date()

  await db.update(spdk).set({
    status: nextStatusSpdk,
    approverKabagId: spdkRow.approverKabagId || actor.id,
    approverKabagNama: spdkRow.approverKabagNama || actor.nama,
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
  const radiusMeter = await getAttendRadiusMeter()

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
    isValid  = jarakM <= radiusMeter
    if (!isValid) {
      throw new AppError(
        `Lokasi absen terlalu jauh: ${jarakM.toFixed(0)}m dari tujuan, radius maksimum ${radiusMeter}m. Tujuan: ${Number(btoRow.tujuanLat).toFixed(6)}, ${Number(btoRow.tujuanLng).toFixed(6)}. GPS terbaca: ${Number(finalLat).toFixed(6)}, ${Number(finalLng).toFixed(6)}.`,
        400,
      )
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

  await db.insert(btoApprovalLog).values({
    btoId,
    tahap: 'absen',
    aksi: isAdminOverride ? 'override_absen' : 'absen',
    actorId: actor.id,
    actorNama: actor.nama,
    statusDari: 'ACTIVE',
    statusKe: 'ATTENDED',
    catatan: isAdminOverride
      ? 'Absen dioverride oleh admin'
      : `Absen berhasil. Jarak ${jarakM.toFixed(0)} meter dari tujuan, radius ${radiusMeter} meter.`,
  })

  return { ...stamp, isValid, jarakMeter: jarakM, radiusMeter }
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
