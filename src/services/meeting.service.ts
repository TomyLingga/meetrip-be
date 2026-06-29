// ─── Meeting Service ──────────────────────────────────────────────────────────
import { db }         from '../db/connection'
import { meeting, meetingPartisipan, meetingFasilitas } from '../db/schema'
import { eq, and, or, lt, gt, not, desc, gte, lte, sql } from 'drizzle-orm'
import { AppError }   from '../utils/errorHandler'

// ─── Conflict check ruang meeting ────────────────────────────────────────────
// Return true jika ada konflik booking
export async function checkRuangConflict(
  ruangId: string,
  mulai: Date,
  selesai: Date,
  excludeMeetingId?: string,
): Promise<boolean> {
  const conditions: any[] = [
    eq(meeting.ruangId, ruangId),
    not(eq(meeting.status, 'CANCELLED')),
    // Overlap: NOT (selesai <= mulai_baru OR mulai >= selesai_baru)
    not(or(
      lte(meeting.selesai, mulai),
      gte(meeting.mulai,   selesai),
    )!),
  ]
  if (excludeMeetingId) {
    conditions.push(not(eq(meeting.id, excludeMeetingId)))
  }

  const [row] = await db.select({ count: sql<number>`count(*)` })
    .from(meeting)
    .where(and(...conditions))

  return Number(row.count) > 0
}

// ─── Buat Meeting ─────────────────────────────────────────────────────────────
export async function createMeetingService(createdBy: string, createdByNama: string, data: {
  topik:           string
  mulai:           Date
  selesai:         Date
  ruangId?:        string
  ruangNama?:      string
  needSoundSystem?: boolean
  needZoom?:       boolean
  zoomLink?:       string
  catatan?:        string
  partisipan: Array<{ nama: string; email?: string; jabatan?: string; isExternal?: boolean }>
  fasilitas?: Array<{ tipe: 'snack' | 'makan_siang' | 'makan_malam'; qty: number; catatan?: string }>
}) {
  // Cek konflik ruang
  if (data.ruangId) {
    const conflict = await checkRuangConflict(data.ruangId, data.mulai, data.selesai)
    if (conflict) throw new AppError('Ruang meeting sudah dibooking pada jam yang sama', 409)
  }

  const [mt] = await db.insert(meeting).values({
    createdBy,
    createdByNama,
    topik:           data.topik,
    mulai:           data.mulai,
    selesai:         data.selesai,
    ruangId:         data.ruangId,
    ruangNama:       data.ruangNama,
    needSoundSystem: data.needSoundSystem ?? false,
    needZoom:        data.needZoom ?? false,
    zoomLink:        data.zoomLink,
    catatan:         data.catatan,
    status:          'SCHEDULED',
  }).returning()

  // Insert partisipan
  if (data.partisipan.length > 0) {
    await db.insert(meetingPartisipan).values(
      data.partisipan.map(p => ({
        meetingId:  mt.id,
        nama:       p.nama,
        email:      p.email,
        jabatan:    p.jabatan,
        isExternal: p.isExternal ?? false,
      }))
    )
  }

  // Insert fasilitas
  if (data.fasilitas && data.fasilitas.length > 0) {
    await db.insert(meetingFasilitas).values(
      data.fasilitas.map(f => ({
        meetingId: mt.id,
        tipe:      f.tipe,
        qty:       f.qty,
        catatan:   f.catatan,
      }))
    )
  }

  return mt
}

// ─── Update Meeting ───────────────────────────────────────────────────────────
export async function updateMeetingService(
  id: string,
  userId: string,
  data: Partial<{
    topik: string; mulai: Date; selesai: Date; ruangId: string
    ruangNama: string; needSoundSystem: boolean; needZoom: boolean
    zoomLink: string; catatan: string
    partisipan: Array<{ nama: string; email?: string; jabatan?: string; isExternal?: boolean }>
    fasilitas: Array<{ tipe: 'snack' | 'makan_siang' | 'makan_malam'; qty: number; catatan?: string }>
  }>,
  isAdmin = false,
) {
  const [mt] = await db.select().from(meeting).where(eq(meeting.id, id)).limit(1)
  if (!mt) throw new AppError('Meeting tidak ditemukan', 404)
  if (!isAdmin && mt.createdBy !== userId) throw new AppError('Bukan meeting Anda', 403)
  if (mt.status === 'CANCELLED') throw new AppError('Meeting sudah dibatalkan', 400)

  // Cek konflik ruang jika waktu / ruang berubah
  const checkMulai   = data.mulai   ?? mt.mulai
  const checkSelesai = data.selesai ?? mt.selesai
  const checkRuang   = data.ruangId ?? mt.ruangId
  if (checkRuang) {
    const conflict = await checkRuangConflict(checkRuang, checkMulai, checkSelesai, id)
    if (conflict) throw new AppError('Ruang meeting sudah dibooking pada jam yang sama', 409)
  }

  const [updated] = await db.update(meeting)
    .set({ ...data, mulai: data.mulai, selesai: data.selesai, updatedAt: new Date() })
    .where(eq(meeting.id, id))
    .returning()

  // Replace partisipan & fasilitas jika dikirim
  if (data.partisipan) {
    await db.delete(meetingPartisipan).where(eq(meetingPartisipan.meetingId, id))
    if (data.partisipan.length > 0) {
      await db.insert(meetingPartisipan).values(data.partisipan.map(p => ({ meetingId: id, ...p, isExternal: p.isExternal ?? false })))
    }
  }
  if (data.fasilitas) {
    await db.delete(meetingFasilitas).where(eq(meetingFasilitas.meetingId, id))
    if (data.fasilitas.length > 0) {
      await db.insert(meetingFasilitas).values(data.fasilitas.map(f => ({ meetingId: id, ...f })))
    }
  }

  return updated
}

// ─── Cancel Meeting ───────────────────────────────────────────────────────────
export async function cancelMeetingService(id: string, userId: string, cancelReason: string, isAdmin = false) {
  const [mt] = await db.select().from(meeting).where(eq(meeting.id, id)).limit(1)
  if (!mt) throw new AppError('Meeting tidak ditemukan', 404)
  if (!isAdmin && mt.createdBy !== userId) throw new AppError('Bukan meeting Anda', 403)
  if (mt.status === 'CANCELLED') throw new AppError('Sudah dibatalkan', 400)

  await db.update(meeting).set({
    status:       'CANCELLED',
    cancelledAt:  new Date(),
    cancelReason,
    updatedAt:    new Date(),
  }).where(eq(meeting.id, id))
}

// ─── List Meeting (range tanggal) ────────────────────────────────────────────
export async function listMeetingService(filters: { dateFrom?: Date; dateTo?: Date; ruangId?: string }) {
  const conditions: ReturnType<typeof gte>[] = []
  if (filters.dateFrom) conditions.push(gte(meeting.mulai, filters.dateFrom))
  if (filters.dateTo)   conditions.push(lte(meeting.mulai, filters.dateTo))
  if (filters.ruangId)  conditions.push(eq(meeting.ruangId, filters.ruangId) as any)

  return db.select().from(meeting)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(meeting.mulai)
}
