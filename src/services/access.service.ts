// ─── Access Control Service ───────────────────────────────────────────────────
// Satu sumber kebenaran untuk pertanyaan "boleh tidak aktor ini membaca dinas X?".
//
// Sengaja HANYA memakai query database (tanpa panggilan HTTP ke Portal) supaya
// murah dipanggil di jalur baca yang sering diakses — termasuk streaming file.
// Urutan pemeriksaan disusun dari yang paling murah:
//   1. role admin/sdm  → lihat semua
//   2. pemilik BTO      → dinasnya sendiri
//   3. pemberi tugas    → dinas yang dia tugaskan
//   4. approver SPDK    → dinas yang SPDK-nya dia setujui
//   5. kepala unit BOM-1 → dinas karyawan di unitnya
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/connection'
import { bto, spdk, localUserCache } from '../db/schema'
import { AppError } from '../utils/errorHandler'

export type AccessActor = {
  id: string
  employeeId?: string | null
  role?: string | null
}

const ADMIN_ROLES = ['admin', 'super_admin', 'sdm']

function actorIdentifiers(actor: AccessActor) {
  return Array.from(new Set([actor.id, actor.employeeId].filter((v): v is string => Boolean(v))))
}

export function actorIsAdminOrSdm(actor: AccessActor) {
  return (actor.role ?? '')
    .split(',')
    .map((r) => r.trim())
    .some((r) => ADMIN_ROLES.includes(r))
}

/**
 * Mengembalikan baris BTO bila aktor berhak membacanya, atau null bila tidak.
 * `null` juga dikembalikan ketika BTO tidak ada, supaya pemanggil bisa membalas
 * 404 dan tidak membocorkan keberadaan data milik orang lain.
 */
export async function findAccessibleBto(btoId: string, actor: AccessActor) {
  if (!btoId) return null

  const [row] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1)
  if (!row) return null

  if (actorIsAdminOrSdm(actor)) return row

  const identifiers = actorIdentifiers(actor)
  if (identifiers.length === 0) return null

  if (row.employeeId && identifiers.includes(row.employeeId)) return row
  if (row.pemberiTugasId && identifiers.includes(row.pemberiTugasId)) return row

  const [spdkRow] = await db
    .select({ approverKabagId: spdk.approverKabagId })
    .from(spdk)
    .where(eq(spdk.btoId, btoId))
    .limit(1)
  if (spdkRow?.approverKabagId && identifiers.includes(spdkRow.approverKabagId)) return row

  // Kepala bagian (BOM-1) berhak atas dinas karyawan di unitnya.
  const cache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, actor.id),
  })
  const isBom1 = (cache?.gradeKode ?? '').trim().toUpperCase() === 'BOM-1'
  if (isBom1 && cache?.unitId) {
    if (row.employeeUnitId && row.employeeUnitId === cache.unitId) return row
    const owner = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, row.employeeId),
    })
    if (owner?.unitId && owner.unitId === cache.unitId) return row
  }

  return null
}

/** Versi yang melempar 404 — dipakai route detail agar responsnya seragam. */
export async function assertBtoAccess(btoId: string, actor: AccessActor) {
  const row = await findAccessibleBto(btoId, actor)
  if (!row) throw new AppError('BTO tidak ditemukan', 404)
  return row
}

/** Daftar BTO id yang boleh dibaca aktor, untuk memfilter list SPDK/BTE. */
export async function accessibleBtoIds(actor: AccessActor, candidateIds: string[]) {
  if (candidateIds.length === 0) return new Set<string>()
  if (actorIsAdminOrSdm(actor)) return new Set(candidateIds)

  const identifiers = actorIdentifiers(actor)
  if (identifiers.length === 0) return new Set<string>()

  const allowed = new Set<string>()
  const rows = await db
    .select({ id: bto.id, employeeId: bto.employeeId, pemberiTugasId: bto.pemberiTugasId })
    .from(bto)
    .where(inArray(bto.id, candidateIds))
  for (const row of rows) {
    if (identifiers.includes(row.employeeId)) allowed.add(row.id)
    else if (row.pemberiTugasId && identifiers.includes(row.pemberiTugasId)) allowed.add(row.id)
  }

  const spdkRows = await db
    .select({ btoId: spdk.btoId, approverKabagId: spdk.approverKabagId })
    .from(spdk)
    .where(and(inArray(spdk.btoId, candidateIds)))
  for (const row of spdkRows) {
    if (row.approverKabagId && identifiers.includes(row.approverKabagId)) allowed.add(row.btoId)
  }

  return allowed
}
