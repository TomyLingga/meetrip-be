// ─── Pagu Service ─────────────────────────────────────────────────────────────
// Kalkulasi pagu berdasarkan rincian + grade + wilayah_tipe + tanggal + jumlah hari
import { db }   from '../db/connection'
import { refPagu, refRincianBiaya } from '../db/schema'
import { eq, and, or, isNull, lte, gte } from 'drizzle-orm'
import { config as appConfig } from '../config/env'

export interface PaguResult {
  rincianId:   string
  rincianLabel: string
  isUnlimited: boolean
  hasPagu:     boolean
  perMalam:    boolean
  useDollar:   boolean
  nilaiPerHari: number   // 0 jika unlimited
  nilaiTotal:   number   // nilaiPerHari × jumlahHari
  paguMax:      number   // batas maksimal
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
    if (!rincian.hasPagu) {
      results.push({
        rincianId:    rincian.id,
        rincianLabel: rincian.label,
        isUnlimited:  true,
        hasPagu:      false,
        perMalam:     rincian.perMalam,
        useDollar:    rincian.useDollarOverride,
        nilaiPerHari: 0,
        nilaiTotal:   0,
        paguMax:      0,
      })
      continue
    }

    const pagu = await getPaguAktif(rincian.id, params.gradeId, params.wilayahTipe, params.tanggal)

    if (!pagu) continue // tidak ada pagu untuk kombinasi ini, skip

    const hari   = rincian.perMalam ? params.jumlahMalam : params.jumlahHari
    const total  = pagu.isUnlimited ? 0 : pagu.nilai * hari

    results.push({
      rincianId:    rincian.id,
      rincianLabel: rincian.label,
      isUnlimited:  pagu.isUnlimited,
      hasPagu:      true,
      perMalam:     rincian.perMalam,
      useDollar:    pagu.useDollar,
      nilaiPerHari: pagu.nilai,
      nilaiTotal:   total,
      paguMax:      total,
    })
  }

  return results
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
