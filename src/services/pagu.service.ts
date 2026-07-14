// ─── Pagu Service ─────────────────────────────────────────────────────────────
// Kalkulasi pagu berdasarkan rincian + grade + wilayah_tipe + tanggal + jumlah hari
import { db }   from '../db/connection'
import { refPagu, refRincianBiaya } from '../db/schema'
import { eq, and, or, isNull, lte, gte, sql } from 'drizzle-orm'
import { config as appConfig } from '../config/env'
import { AppError } from '../utils/errorHandler'

export interface PaguResult {
  rincianId:   string
  rincianLabel: string
  kategori:     string
  isUnlimited: boolean
  hasPagu:     boolean
  perMalam:    boolean
  useDollar:   boolean
  nilaiPerHari: number   // 0 jika unlimited
  nilaiTotal:   number   // nilaiPerHari × jumlahHari
  paguMax:      number   // batas maksimal
}

export interface RincianPaguInput {
  rincianId: string
  rincianLabel?: string | null
  nilaiTotal: number
  nilaiUsd?: number | null
  useDollar: boolean
}

// Extract the calendar Y/M/D of a Date as seen in Asia/Jakarta (WIB), independent
// of the server's local timezone. Render/production containers run in UTC, so using
// getFullYear/getMonth/getDate directly would shift trip dates by a day and corrupt
// the per-diem (pagu) day/night counts. The PDF layer already standardizes on WIB.
function jakartaYmd(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  return { y: get('year'), m: get('month'), d: get('day') }
}

export function hitungDurasiHariMalam(berangkat: Date, kembali: Date) {
  const s = jakartaYmd(berangkat)
  const e = jakartaYmd(kembali)
  // Compare pure calendar days via UTC epoch so no DST/offset skew leaks in.
  const startD = Date.UTC(s.y, s.m - 1, s.d)
  const endD   = Date.UTC(e.y, e.m - 1, e.d)
  const diffDays = Math.floor((endD - startD) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    throw new AppError('Tanggal kembali tidak boleh sebelum tanggal berangkat', 400)
  }

  return {
    jumlahHari: diffDays + 1,
    jumlahMalam: Math.max(0, diffDays),
  }
}

// ─── Lookup pagu aktif pada tanggal tertentu ─────────────────────────────────
export async function getPaguAktif(
  rincianId:   string,
  gradeId:     string,
  wilayahTipe: string,
  tanggal:     Date,
): Promise<{ nilai: number; useDollar: boolean; isUnlimited: boolean } | null> {
  const tanggalStr = tanggal.toISOString().slice(0, 10)

  const rows = await db.select()
    .from(refPagu)
    .where(
      and(
        eq(refPagu.rincianId, rincianId),
        eq(refPagu.gradeId,   gradeId),
        eq(refPagu.wilayahTipe, wilayahTipe),
        or(isNull(refPagu.berlakuDari),  lte(refPagu.berlakuDari,  tanggalStr)),
        or(isNull(refPagu.berlakuSampai), gte(refPagu.berlakuSampai, tanggalStr)),
      ),
    )
    // Deterministically pick the most recently effective pagu when versions overlap.
    .orderBy(sql`${refPagu.berlakuDari} DESC NULLS LAST`)
    .limit(1)

  if (!rows.length) return null

  const row = rows[0]
  return {
    nilai:       Number(row.nilai),
    useDollar:   row.useDollar,
    isUnlimited: row.isUnlimited,
  }
}

// ─── Kalkulasi semua rincian biaya untuk suatu BTO ───────────────────────────
// Mengembalikan list pagu per rincian beserta nilai totalnya
export async function kalkulasiPaguBto(params: {
  gradeId:     string
  wilayahTipe: string
  tanggal:     Date          // tanggal berangkat (untuk lookup pagu berlaku)
  jumlahHari:  number        // total hari
  jumlahMalam: number        // total malam (tanggal kembali - tanggal berangkat)
}): Promise<PaguResult[]> {
  const rincianList = await db.select()
    .from(refRincianBiaya)
    .where(eq(refRincianBiaya.isActive, true))

  const results: PaguResult[] = []

  for (const rincian of rincianList) {
    const pagu = await getPaguAktif(rincian.id, params.gradeId, params.wilayahTipe, params.tanggal)

    if (!pagu) {
      results.push({
        rincianId:    rincian.id,
        rincianLabel: rincian.label,
        kategori:     rincian.kategori || 'lain_lain',
        isUnlimited:  false,
        hasPagu:      false,
        perMalam:     rincian.perMalam,
        useDollar:    false,
        nilaiPerHari: 0,
        nilaiTotal:   0,
        paguMax:      0,
      })
      continue
    }

    const hari   = rincian.perMalam ? params.jumlahMalam : params.jumlahHari
    const total  = pagu.isUnlimited ? 0 : pagu.nilai * hari

    results.push({
      rincianId:    rincian.id,
      rincianLabel: rincian.label,
      kategori:     rincian.kategori || 'lain_lain',
      isUnlimited:  pagu.isUnlimited,
      hasPagu:      !pagu.isUnlimited,
      perMalam:     rincian.perMalam,
      useDollar:    pagu.useDollar,
      nilaiPerHari: pagu.nilai,
      nilaiTotal:   total,
      paguMax:      total,
    })
  }

  return results
}

export async function validateRincianAgainstPagu(params: {
  gradeId: string
  wilayahTipe: string
  tanggal: Date
  jumlahHari: number
  jumlahMalam: number
  rincian: RincianPaguInput[]
}) {
  const paguList = await kalkulasiPaguBto({
    gradeId: params.gradeId,
    wilayahTipe: params.wilayahTipe,
    tanggal: params.tanggal,
    jumlahHari: params.jumlahHari,
    jumlahMalam: params.jumlahMalam,
  })
  const paguByRincianId = new Map(paguList.map((p) => [p.rincianId, p]))

  for (const item of params.rincian) {
    const pagu = paguByRincianId.get(item.rincianId)
    const label = item.rincianLabel || 'Rincian biaya'

    if (!pagu) {
      throw new AppError(`Pagu untuk '${label}' belum dikonfigurasi`, 400)
    }
    if (pagu.isUnlimited) continue
    // Rincian aktif tanpa baris pagu untuk grade+wilayah+tanggal ini datang dengan
    // hasPagu=false & paguMax=0. Jangan bandingkan ke plafon 0 (menolak semua nilai
    // dengan pesan "melebihi pagu 0" yang membingungkan) — beri pesan konfigurasi
    // yang jelas agar admin melengkapi master pagu.
    if (!pagu.hasPagu) {
      throw new AppError(`Pagu untuk '${label}' belum dikonfigurasi untuk grade/wilayah ini`, 400)
    }

    // The pagu ceiling (paguMax) is denominated in the pagu row's currency. Comparing a
    // USD submission against an IDR ceiling (or vice-versa) is meaningless and would let
    // over-budget requests through or wrongly reject valid ones. Reject the mismatch.
    if (item.useDollar !== pagu.useDollar) {
      const paguCur = pagu.useDollar ? 'USD' : 'IDR'
      const itemCur = item.useDollar ? 'USD' : 'IDR'
      throw new AppError(
        `Mata uang '${label}' (${itemCur}) tidak sesuai dengan pagu (${paguCur}). Perbaiki mata uang rincian.`,
        400,
      )
    }

    const nilaiDiajukan = item.useDollar
      ? Number(item.nilaiUsd ?? item.nilaiTotal)
      : Number(item.nilaiTotal)

    if (nilaiDiajukan > pagu.paguMax) {
      throw new AppError(
        `Pengajuan biaya '${label}' sebesar ${nilaiDiajukan} melebihi pagu sebesar ${pagu.paguMax}`,
        400,
      )
    }
  }
}

// ─── Lookup gradeId dari gradeLevel ──────────────────────────────────────────
export async function getGradeIdByLevel(gradeLevel: number): Promise<string | null> {
  try {
    const res = await fetch(`${appConfig.portal.apiUrl}/api/sso/grades`, {
      headers: { 'x-internal': appConfig.portal.internalToken },
    })
    if (res.ok) {
      const body = await res.json() as { data: any[] }
      const rows = body.data ?? []
      const found = rows.find(r => r.level === gradeLevel)
      return found?.id ?? null
    }
  } catch (err) {
    console.error('Gagal mengambil grade level dari Portal SSO:', err)
  }
  return null
}
