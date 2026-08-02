/**
 * ─── Seed data demo dashboard MeeTrip ────────────────────────────────────────
 *
 * Membuat transaksi dinas lengkap (BTO → DP → SPDK → absen → BTE → pembayaran)
 * yang melewati SEMUA status pada state machine, memakai karyawan & master data
 * yang benar-benar ada di database, supaya keempat cakupan dashboard
 * (company / employee / assigner / kabag) punya angka dan grafik.
 *
 * Semua baris ditandai:
 *   - bto.kepentingan     diawali `[DEMO]`
 *   - bto.catatan_admin   memuat DEMO_TAG
 *   - meeting.catatan     memuat DEMO_TAG
 * sehingga bisa dihapus total lewat `scripts/maintenance/remove-demo-dashboard.ts`
 * tanpa menyentuh data asli.
 *
 * Jalankan:  npx tsx scripts/maintenance/seed-demo-dashboard.ts
 */
import { db } from '../../src/db/connection'
import {
  bto, btoApprovalLog,
  dp, dpRincian, dpApprovalLog,
  spdk, spdkApprovalLog, attendStamp,
  bte, bteRincian, bteBiayaLain, bteApprovalLog,
  meeting, meetingPartisipan,
  localUserCache, refTransport, refRincianBiaya, refRuangMeeting,
  travelMonthlyBudget,
} from '../../src/db/schema'
import { generateNomor, nomorSpdkFromBto } from '../../src/utils/romanNumeral'
import { ensureApproverSpdkConfig, resolveSpdkApproverKabag } from '../../src/services/spdk.service'
import { and, eq, like, sql } from 'drizzle-orm'

export const DEMO_TAG = '[DEMO-DASHBOARD]'

// Bulan yang diisi: bulan berjalan (grafik default dashboard).
const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1 // 1-12
const DAYS_IN_MONTH = new Date(YEAR, MONTH, 0).getDate()

const at = (day: number, hour = 8, minute = 0) =>
  new Date(YEAR, MONTH - 1, Math.min(Math.max(day, 1), DAYS_IN_MONTH), hour, minute, 0)

const rupiah = (n: number) => n.toFixed(2)

type Actor = { id: string; nama: string; unitId: string | null; unitNama: string | null; gradeKode: string | null }

// ─── Tujuan dinas nyata (koordinat & jarak dari KEK Sei Mangkei) ──────────────
type Destinasi = {
  nama: string
  lat: string
  lng: string
  alamat: string
  provinsi: string
  negara: string
  wilayah: 'dalam_wilayah' | 'luar_wilayah' | 'luar_negeri'
  jarakKm: string
  menit: number
}

const DESTINASI: Destinasi[] = [
  { nama: 'Kantor Regional Medan', lat: '3.59511000', lng: '98.67265500', alamat: 'Jl. Putri Hijau No.1, Medan, Sumatera Utara', provinsi: 'Sumatera Utara', negara: 'Indonesia', wilayah: 'dalam_wilayah', jarakKm: '128.40', menit: 210 },
  { nama: 'Pelabuhan Kuala Tanjung', lat: '3.36972000', lng: '99.45361000', alamat: 'Kuala Tanjung, Batu Bara, Sumatera Utara', provinsi: 'Sumatera Utara', negara: 'Indonesia', wilayah: 'dalam_wilayah', jarakKm: '62.10', menit: 105 },
  { nama: 'Kebun Sei Mangkei — Perdagangan', lat: '3.16780000', lng: '99.28090000', alamat: 'Perdagangan, Simalungun, Sumatera Utara', provinsi: 'Sumatera Utara', negara: 'Indonesia', wilayah: 'dalam_wilayah', jarakKm: '24.80', menit: 45 },
  { nama: 'Kantor Pusat Holding Jakarta', lat: '-6.18692800', lng: '106.84967300', alamat: 'Jl. Kramat Sentiong, Senen, Jakarta Pusat', provinsi: 'DKI Jakarta', negara: 'Indonesia', wilayah: 'luar_wilayah', jarakKm: '1329.86', menit: 180 },
  { nama: 'Pabrik Oleokimia Surabaya', lat: '-7.25749800', lng: '112.75208100', alamat: 'Jl. Rungkut Industri, Surabaya, Jawa Timur', provinsi: 'Jawa Timur', negara: 'Indonesia', wilayah: 'luar_wilayah', jarakKm: '1848.20', menit: 225 },
  { nama: 'Kawasan Industri Batam', lat: '1.10730000', lng: '104.04150000', alamat: 'Batam Centre, Batam, Kepulauan Riau', provinsi: 'Kepulauan Riau', negara: 'Indonesia', wilayah: 'luar_wilayah', jarakKm: '624.70', menit: 150 },
  { nama: 'Kilang Dumai — Pekanbaru', lat: '0.50708000', lng: '101.44780000', alamat: 'Jl. Sudirman, Pekanbaru, Riau', provinsi: 'Riau', negara: 'Indonesia', wilayah: 'luar_wilayah', jarakKm: '521.30', menit: 195 },
  { nama: 'Palm Oil Conference Kuala Lumpur', lat: '3.15785000', lng: '101.71160000', alamat: 'Kuala Lumpur Convention Centre, Malaysia', provinsi: 'Kuala Lumpur', negara: 'Malaysia', wilayah: 'luar_negeri', jarakKm: '1042.50', menit: 240 },
]

const KEPENTINGAN = [
  'Koordinasi pasokan CPO dengan kebun inti',
  'Audit mutu produk refinery bersama surveyor',
  'Rapat evaluasi kontrak logistik pelabuhan',
  'Pendampingan uji laboratorium olein & stearin',
  'Negosiasi harga kontrak pengangkutan curah',
  'Survei vendor pemeliharaan boiler',
  'Sosialisasi SOP K3 ke unit produksi',
  'Pelatihan operator sistem SCADA',
  'Verifikasi dokumen ekspor bea cukai',
  'Kunjungan calon pembeli produk turunan',
  'Rekonsiliasi data stok tangki timbun',
  'Pembahasan rencana kerja anggaran unit',
]

/**
 * Distribusi status: setiap status yang dibaca dashboard diberi porsi supaya
 * kartu metrik, action queue, dan grafik status semuanya terisi.
 * peran = pemilik BTO (siapa yang lihat di cakupan "employee").
 */
type Skenario = {
  status: string
  jumlah: number
  /** offset hari keberangkatan relatif terhadap tanggal hari ini */
  hariOffset: number[]
}

const SKENARIO: Skenario[] = [
  { status: 'DRAFT',            jumlah: 2, hariOffset: [6, 11] },
  { status: 'REVISION_DP',      jumlah: 1, hariOffset: [8] },
  { status: 'PT_REVIEW',        jumlah: 4, hariOffset: [4, 7, 9, 13] },
  { status: 'ADMIN_DP_REVIEW',  jumlah: 3, hariOffset: [3, 6, 10] },
  { status: 'SDM_REVIEW',       jumlah: 3, hariOffset: [5, 8, 12] },
  { status: 'SPDK_DRAFT',       jumlah: 3, hariOffset: [2, 5, 9] },
  { status: 'KABAG_REVIEW',     jumlah: 3, hariOffset: [3, 6, 11] },
  { status: 'ACTIVE',           jumlah: 3, hariOffset: [1, 2, 4] },
  { status: 'ATTENDED',         jumlah: 2, hariOffset: [0, -1] },
  { status: 'REPORT_UPLOADED',  jumlah: 2, hariOffset: [-2, -3] },
  { status: 'BTE_DRAFT',        jumlah: 2, hariOffset: [-4, -5] },
  { status: 'REVISION_BTE',     jumlah: 1, hariOffset: [-6] },
  { status: 'ADMIN_BTE_REVIEW', jumlah: 3, hariOffset: [-7, -8, -9] },
  { status: 'BTE_PAYMENT',      jumlah: 2, hariOffset: [-10, -11] },
  { status: 'COMPLETED',        jumlah: 8, hariOffset: [-12, -13, -14, -15, -16, -18, -20, -22] },
  { status: 'REJECTED',         jumlah: 2, hariOffset: [-17, -19] },
]

/** Urutan tahap agar bisa ditentukan artefak apa yang wajar sudah ada. */
const STAGE: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  ADMIN_DP_REVIEW: 2,
  REVISION_DP: 2,
  PT_REVIEW: 3,
  SDM_REVIEW: 4,
  SPDK_DRAFT: 5,
  KABAG_REVIEW: 6,
  ACTIVE: 7,
  ATTENDED: 8,
  REPORT_UPLOADED: 9,
  BTE_DRAFT: 10,
  REVISION_BTE: 10,
  ADMIN_BTE_REVIEW: 11,
  BTE_PAYMENT: 12,
  COMPLETED: 13,
  REJECTED: 4, // ditolak saat review SDM
}

async function pickActors() {
  const rows = await db.select().from(localUserCache)
  const byRole = (needle: string) =>
    rows.filter((r) => (r.role ?? '').split(',').map((x) => x.trim()).includes(needle))

  const toActor = (r: typeof rows[number]): Actor => ({
    id: r.portalUserId,
    nama: r.nama ?? r.email,
    unitId: r.unitId ?? null,
    unitNama: r.unitNama ?? null,
    gradeKode: r.gradeKode ?? null,
  })

  const admin = byRole('admin').find((r) => r.employeeId) ?? byRole('admin')[0]
  const sdm = byRole('sdm').find((r) => r.portalUserId !== admin?.portalUserId) ?? byRole('sdm')[0]
  // Kabag: mode unit_head → pemegang grade BOM-1 otomatis jadi approver SPDK.
  const kabag = rows.find((r) => (r.gradeKode ?? '').toUpperCase() === 'BOM-1')
  // Pemberi tugas: grade tertinggi (BOD) supaya lolos aturan grade_based.
  const pemberiTugas = rows
    .filter((r) => (r.gradeLevel ?? 0) > 0)
    .sort((a, b) => (b.gradeLevel ?? 0) - (a.gradeLevel ?? 0))[0]
  // Pegawai pengaju: user biasa, bukan admin/sdm, dan bukan kabag/pemberi tugas.
  const pegawai = rows.filter(
    (r) =>
      !(r.role ?? '').includes('admin') &&
      !(r.role ?? '').includes('sdm') &&
      r.portalUserId !== kabag?.portalUserId &&
      r.portalUserId !== pemberiTugas?.portalUserId &&
      r.employeeId,
  )

  if (!admin || !sdm || !kabag || !pemberiTugas || pegawai.length === 0) {
    throw new Error(
      `Aktor tidak lengkap di local_user_cache (admin=${!!admin} sdm=${!!sdm} kabag=${!!kabag} pt=${!!pemberiTugas} pegawai=${pegawai.length}). ` +
        'Pastikan user sudah pernah login lewat SSO agar tercache.',
    )
  }

  return {
    admin: toActor(admin),
    sdm: toActor(sdm),
    kabag: toActor(kabag),
    pemberiTugas: toActor(pemberiTugas),
    pegawai: pegawai.map(toActor),
  }
}

async function main() {
  console.log(`${DEMO_TAG} seeding untuk periode ${MONTH}/${YEAR} ...`)

  const actors = await pickActors()

  /*
   * Approver SPDK TIDAK boleh ditebak: `getApprovals()` di bto.service.ts akan
   * menghitung ulang approver dari rantai atasan portal setiap kali antrian
   * dibuka, lalu menimpa isi kolomnya. Jadi kita pakai resolver sistem yang sama
   * supaya data seed identik dengan hasil perhitungan aplikasi.
   */
  const cfgApprover = await ensureApproverSpdkConfig()
  const kabagPerPemilik = new Map<string, { id: string | null; nama: string | null }>()
  for (const p of actors.pegawai) {
    try {
      const resolved = await resolveSpdkApproverKabag({ employeeId: p.id } as any, cfgApprover)
      kabagPerPemilik.set(p.id, resolved)
    } catch {
      kabagPerPemilik.set(p.id, { id: null, nama: null })
    }
  }

  // Pemilik yang approver-nya sudah punya cache MeeTrip → antrian KABAG bisa
  // benar-benar dibuka oleh orang tersebut setelah login.
  const cachedIds = new Set((await db.select({ id: localUserCache.portalUserId }).from(localUserCache)).map((r) => r.id))
  const pemilikDenganKabagAktif = actors.pegawai.filter((p) => {
    const k = kabagPerPemilik.get(p.id)
    return k?.id && cachedIds.has(k.id)
  })
  const kabagAktif = pemilikDenganKabagAktif[0] ? kabagPerPemilik.get(pemilikDenganKabagAktif[0].id) : null

  console.log('  admin        :', actors.admin.nama)
  console.log('  sdm          :', actors.sdm.nama)
  console.log('  pemberi tugas:', actors.pemberiTugas.nama, `(${actors.pemberiTugas.gradeKode})`)
  console.log('  approver SPDK:', kabagAktif?.nama ?? '(tidak ada yang ter-cache)', `— dari rantai atasan ${pemilikDenganKabagAktif.length} pegawai`)
  console.log('  pegawai      :', actors.pegawai.map((p) => p.nama).join(', '))


  const transports = await db.select().from(refTransport).where(eq(refTransport.isActive, true))
  const rincianRefs = await db.select().from(refRincianBiaya).where(eq(refRincianBiaya.isActive, true))
  const rooms = await db.select().from(refRuangMeeting).where(eq(refRuangMeeting.isActive, true))
  if (transports.length === 0 || rincianRefs.length === 0) {
    throw new Error('ref_transport / ref_rincian_biaya kosong — isi master data dulu.')
  }

  const refSaku = rincianRefs.find((r) => r.kode === 'UANG_SAKU') ?? rincianRefs[0]
  const refHotel = rincianRefs.find((r) => r.kode === 'HOTEL') ?? rincianRefs[0]
  const refLaundry = rincianRefs.find((r) => r.kode === 'LAUNDRY') ?? rincianRefs[0]

  // Lanjutkan nomor dokumen dari sequence tertinggi tahun ini agar tidak bentrok.
  const seqRow = await db
    .select({ max: sql<number>`COALESCE(MAX(${bto.sequence}), 0)` })
    .from(bto)
    .where(eq(bto.tahun, YEAR))
  let sequence = Number(seqRow[0]?.max ?? 0)

  let idxDest = 0
  let idxKepentingan = 0
  let idxPegawai = 0
  const summary: Record<string, number> = {}

  for (const skenario of SKENARIO) {
    for (let i = 0; i < skenario.jumlah; i += 1) {
      const stage = STAGE[skenario.status] ?? 0
      const dest = DESTINASI[idxDest++ % DESTINASI.length]
      const kepentingan = KEPENTINGAN[idxKepentingan++ % KEPENTINGAN.length]
      /*
       * Hanya tahap KABAG_REVIEW (yang benar-benar jadi antrian approver) yang
       * dipaksa dimiliki pegawai dengan rantai atasan bermuara ke approver
       * ter-cache. Tahap lain tetap dirotasi supaya sebaran unit realistis.
       */
      const butuhKabagAktif = skenario.status === 'KABAG_REVIEW' && pemilikDenganKabagAktif.length > 0
      const pemilik = butuhKabagAktif
        ? pemilikDenganKabagAktif[idxPegawai++ % pemilikDenganKabagAktif.length]
        : actors.pegawai[idxPegawai++ % actors.pegawai.length]
      const kabagPemilik = kabagPerPemilik.get(pemilik.id) ?? { id: null, nama: null }
      const offset = skenario.hariOffset[i % skenario.hariOffset.length]
      const hari = NOW.getDate() + offset
      const lamaHari = dest.wilayah === 'dalam_wilayah' ? 2 : dest.wilayah === 'luar_wilayah' ? 3 : 4

      const berangkat = at(hari, 7, 30)
      const kembali = at(hari + lamaHari, 17, 0)
      const isDraft = skenario.status === 'DRAFT'
      sequence += 1
      const submittedAt = isDraft ? null : at(Math.max(hari - 5, 1), 9, 15)
      const nomor = isDraft ? null : generateNomor(sequence, 'BTO', submittedAt as Date)
      const butuhDp = stage >= 2

      await seedSatuTransaksi({
        actors, pemilik, dest, kepentingan, status: skenario.status, stage,
        berangkat, kembali, lamaHari, sequence, nomor, submittedAt, butuhDp,
        kabagPemilik,
        transportId: transports[idxDest % transports.length].id,
        transportLabel: transports[idxDest % transports.length].label,
        refSaku, refHotel, refLaundry,
      })

      summary[skenario.status] = (summary[skenario.status] ?? 0) + 1
    }
  }

  await seedMeetings(actors, rooms)
  await seedBudget(actors.admin)

  console.log('\nBTO dibuat per status:')
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`))
  console.log(`\nTotal ${Object.values(summary).reduce((a, b) => a + b, 0)} transaksi dinas demo.`)
  console.log(`Hapus semua lewat: npx tsx scripts/maintenance/remove-demo-dashboard.ts`)
  process.exit(0)
}

type SeedArgs = {
  actors: Awaited<ReturnType<typeof pickActors>>
  pemilik: Actor
  dest: Destinasi
  kepentingan: string
  status: string
  stage: number
  berangkat: Date
  kembali: Date
  lamaHari: number
  sequence: number
  nomor: string | null
  submittedAt: Date | null
  butuhDp: boolean
  /** Approver SPDK hasil resolver sistem untuk pemilik BTO ini. */
  kabagPemilik: { id: string | null; nama: string | null }
  transportId: string
  transportLabel: string | null
  refSaku: { id: string; label: string | null; kategori: string | null }
  refHotel: { id: string; label: string | null; kategori: string | null }
  refLaundry: { id: string; label: string | null; kategori: string | null }
}

async function seedSatuTransaksi(a: SeedArgs) {
  const malam = Math.max(a.lamaHari - 1, 1)
  const luarNegeri = a.dest.wilayah === 'luar_negeri'
  const kurs = luarNegeri ? 16250 : 0
  const sakuPerHari = a.dest.wilayah === 'dalam_wilayah' ? 300000 : 450000
  const hotelPerMalam = a.dest.wilayah === 'dalam_wilayah' ? 900000 : 1_200_000
  const hotelUsdPerMalam = 120
  const sakuTotal = sakuPerHari * a.lamaHari
  const hotelTotal = luarNegeri ? hotelUsdPerMalam * malam * kurs : hotelPerMalam * malam
  const laundryTotal = 150000
  const dpTotal = sakuTotal + hotelTotal + laundryTotal

  const [row] = await db
    .insert(bto)
    .values({
      nomorBto: a.nomor,
      employeeId: a.pemilik.id,
      employeeNama: a.pemilik.nama,
      employeeUnitId: a.pemilik.unitId,
      employeeUnitNama: a.pemilik.unitNama,
      pemberiTugasId: a.actors.pemberiTugas.id,
      pemberiTugasNama: a.actors.pemberiTugas.nama,
      tujuanNama: a.dest.nama,
      tujuanLat: a.dest.lat,
      tujuanLng: a.dest.lng,
      tujuanAlamat: a.dest.alamat,
      tujuanProvinsi: a.dest.provinsi,
      tujuanNegara: a.dest.negara,
      wilayahTipe: a.dest.wilayah,
      jarakKm: a.dest.jarakKm,
      kepentingan: `[DEMO] ${a.kepentingan}`,
      barang: 'Laptop kerja, dokumen kontrak',
      transportId: a.transportId,
      transportLabel: a.transportLabel,
      estBerangkat: a.berangkat,
      estKembali: a.kembali,
      estimasiWaktuMenit: a.dest.menit,
      butuhDp: a.butuhDp,
      status: a.status as any,
      catatanAdmin: `${DEMO_TAG} data contoh untuk pengujian dashboard`,
      tahun: YEAR,
      sequence: a.sequence,
      submittedAt: a.submittedAt,
      laporanPath: a.stage >= 9 ? `bto/demo/laporan-${a.sequence}.pdf` : null,
      laporanNama: a.stage >= 9 ? `Laporan Dinas ${a.dest.nama}.pdf` : null,
      createdAt: a.submittedAt ?? a.berangkat,
      updatedAt: a.submittedAt ?? a.berangkat,
    })
    .returning({ id: bto.id })

  await seedDownstream(a, row.id, { dpTotal, sakuPerHari, sakuTotal, hotelTotal, hotelPerMalam, hotelUsdPerMalam, laundryTotal, malam, kurs, luarNegeri })
}

type Uang = {
  dpTotal: number; sakuPerHari: number; sakuTotal: number; hotelTotal: number
  hotelPerMalam: number; hotelUsdPerMalam: number; laundryTotal: number
  malam: number; kurs: number; luarNegeri: boolean
}

async function seedDownstream(a: SeedArgs, btoId: string, u: Uang) {
  const logAt = (offsetHari: number) => {
    const d = new Date(a.submittedAt ?? a.berangkat)
    d.setDate(d.getDate() + offsetHari)
    return d
  }

  // ── Jejak audit BTO ──
  const logs: Array<typeof btoApprovalLog.$inferInsert> = []
  if (a.stage >= 1) {
    logs.push({ btoId, tahap: 'pengaju', aksi: 'submit', actorId: a.pemilik.id, actorNama: a.pemilik.nama, statusDari: 'DRAFT', statusKe: a.butuhDp ? 'ADMIN_DP_REVIEW' : 'PT_REVIEW', catatan: `${DEMO_TAG} pengajuan dinas`, createdAt: logAt(0) })
  }
  if (a.stage >= 3 && a.butuhDp) {
    logs.push({ btoId, tahap: 'admin_dp', aksi: 'approve', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, statusDari: 'ADMIN_DP_REVIEW', statusKe: 'PT_REVIEW', catatan: `${DEMO_TAG} panjar sesuai pagu`, createdAt: logAt(1) })
  }
  if (a.stage >= 4) {
    logs.push({ btoId, tahap: 'pemberi_tugas', aksi: 'approve', actorId: a.actors.pemberiTugas.id, actorNama: a.actors.pemberiTugas.nama, statusDari: 'PT_REVIEW', statusKe: 'SDM_REVIEW', catatan: `${DEMO_TAG} tugas disetujui`, createdAt: logAt(2) })
  }
  if (a.status === 'REJECTED') {
    logs.push({ btoId, tahap: 'sdm', aksi: 'reject', actorId: a.actors.sdm.id, actorNama: a.actors.sdm.nama, statusDari: 'SDM_REVIEW', statusKe: 'REJECTED', catatan: `${DEMO_TAG} jadwal bentrok dengan agenda unit`, createdAt: logAt(3) })
  } else if (a.stage >= 5) {
    logs.push({ btoId, tahap: 'sdm', aksi: 'approve', actorId: a.actors.sdm.id, actorNama: a.actors.sdm.nama, statusDari: 'SDM_REVIEW', statusKe: 'SPDK_DRAFT', catatan: `${DEMO_TAG} administrasi lengkap`, createdAt: logAt(3) })
  }
  if (a.stage >= 7) {
    const kabagId = a.kabagPemilik.id ?? a.actors.kabag.id
    const kabagNama = a.kabagPemilik.nama ?? a.actors.kabag.nama
    logs.push({ btoId, tahap: 'kabag', aksi: 'approve', actorId: kabagId, actorNama: kabagNama, statusDari: 'KABAG_REVIEW', statusKe: 'ACTIVE', catatan: `${DEMO_TAG} SPDK disetujui`, createdAt: logAt(4) })
  }
  if (logs.length > 0) await db.insert(btoApprovalLog).values(logs)

  // ── DP / panjar ──
  if (a.butuhDp) {
    const dpStatus = a.status === 'REVISION_DP' ? 'REVISION' : a.status === 'ADMIN_DP_REVIEW' ? 'ADMIN_REVIEW' : 'APPROVED'
    const [dpRow] = await db
      .insert(dp)
      .values({
        btoId,
        status: dpStatus as any,
        exchangeRateUsd: u.luarNegeri ? String(u.kurs) : '0',
        totalIdr: rupiah(u.dpTotal),
        totalUsd: u.luarNegeri ? rupiah(u.hotelUsdPerMalam * u.malam) : '0',
        submittedAt: a.submittedAt,
        updatedAt: logAt(1),
      })
      .returning({ id: dp.id })

    await db.insert(dpRincian).values([
      { dpId: dpRow.id, rincianId: a.refSaku.id, rincianLabel: a.refSaku.label, kategori: a.refSaku.kategori ?? 'lain_lain', jumlahHari: a.lamaHari, nilaiPerHari: rupiah(u.sakuPerHari), nilaiTotal: rupiah(u.sakuTotal), paguSaatInput: rupiah(u.sakuPerHari) },
      { dpId: dpRow.id, rincianId: a.refHotel.id, rincianLabel: a.refHotel.label, kategori: a.refHotel.kategori ?? 'lain_lain', jumlahHari: u.malam, nilaiPerHari: rupiah(u.luarNegeri ? u.hotelUsdPerMalam * u.kurs : u.hotelPerMalam), nilaiTotal: rupiah(u.hotelTotal), useDollar: u.luarNegeri, nilaiUsd: u.luarNegeri ? rupiah(u.hotelUsdPerMalam * u.malam) : '0', paguSaatInput: rupiah(u.hotelPerMalam) },
      { dpId: dpRow.id, rincianId: a.refLaundry.id, rincianLabel: a.refLaundry.label, kategori: a.refLaundry.kategori ?? 'lain_lain', jumlahHari: 1, nilaiPerHari: rupiah(u.laundryTotal), nilaiTotal: rupiah(u.laundryTotal), paguSaatInput: rupiah(u.laundryTotal) },
    ])

    if (dpStatus === 'APPROVED') {
      await db.insert(dpApprovalLog).values({ dpId: dpRow.id, aksi: 'approve', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} panjar disetujui`, createdAt: logAt(1) })
    } else if (dpStatus === 'REVISION') {
      await db.insert(dpApprovalLog).values({ dpId: dpRow.id, aksi: 'revision', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} rincian hotel melebihi pagu`, createdAt: logAt(1) })
    }
  }

  // ── SPDK (terbit mulai tahap KABAG_REVIEW) ──
  if (a.stage >= 6) {
    const spdkStatus = a.status === 'KABAG_REVIEW' ? 'KABAG_REVIEW' : 'APPROVED'
    const kabagId = a.kabagPemilik.id ?? a.actors.kabag.id
    const kabagNama = a.kabagPemilik.nama ?? a.actors.kabag.nama
    const [spdkRow] = await db
      .insert(spdk)
      .values({
        nomorSpdk: nomorSpdkFromBto(a.nomor),
        btoId,
        nomorBto: a.nomor,
        status: spdkStatus as any,
        diterbitkanOleh: a.actors.admin.id,
        diterbitkanNama: a.actors.admin.nama,
        tanggalTerbit: logAt(3),
        catatanAdmin: `${DEMO_TAG} SPDK diterbitkan otomatis oleh seeder`,
        approverKabagId: kabagId,
        approverKabagNama: kabagNama,
        tahun: String(YEAR),
        sequence: String(a.sequence),
        createdAt: logAt(3),
        updatedAt: logAt(4),
      })
      .returning({ id: spdk.id })

    await db.insert(spdkApprovalLog).values({ spdkId: spdkRow.id, aksi: 'issued', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} penerbitan SPDK`, createdAt: logAt(3) })
    if (spdkStatus === 'APPROVED') {
      await db.insert(spdkApprovalLog).values({ spdkId: spdkRow.id, aksi: 'approve', actorId: kabagId, actorNama: kabagNama, catatan: `${DEMO_TAG} disetujui kabag`, createdAt: logAt(4) })
    }
  }

  // ── Absen kedatangan GPS ──
  if (a.stage >= 8) {
    const jarak = a.stage === 8 ? 180.5 : 65.25
    await db.insert(attendStamp).values({
      btoId,
      employeeId: a.pemilik.id,
      stampLat: a.dest.lat,
      stampLng: a.dest.lng,
      jarakDariTujuanM: String(jarak),
      isValid: true,
      stamped_at: new Date(a.berangkat.getTime() + 6 * 60 * 60 * 1000),
    })
  }

  // ── BTE / realisasi ──
  if (a.stage >= 10) {
    const bteStatus =
      a.status === 'REVISION_BTE' ? 'REVISION'
      : a.status === 'BTE_DRAFT' ? 'DRAFT'
      : a.status === 'ADMIN_BTE_REVIEW' ? 'ADMIN_REVIEW'
      : a.status === 'BTE_PAYMENT' ? 'PENDING_PAYMENT'
      : 'PAID'
    // Realisasi sengaja berbeda dari panjar agar grafik selisih penyelesaian terisi.
    const faktor = a.sequence % 2 === 0 ? 1.08 : 0.93
    const sakuTotal = Math.round(u.sakuTotal * faktor)
    const hotelTotal = Math.round(u.hotelTotal * (a.sequence % 3 === 0 ? 1.05 : 0.97))
    const biayaLainNilai = 185000 + (a.sequence % 4) * 75000
    const bteTotal = sakuTotal + hotelTotal + u.laundryTotal + biayaLainNilai

    const [bteRow] = await db
      .insert(bte)
      .values({
        btoId,
        status: bteStatus as any,
        tglBerangkat: a.berangkat,
        jamBerangkat: '07:30',
        tglKembali: a.kembali,
        jamKembali: '17:00',
        laporanPath: `bte/demo/laporan-${a.sequence}.pdf`,
        laporanNama: `Laporan Realisasi ${a.dest.nama}.pdf`,
        kuitansiPath: bteStatus === 'DRAFT' ? null : `bte/demo/kuitansi-${a.sequence}.pdf`,
        kuitansiNama: bteStatus === 'DRAFT' ? null : `Kuitansi ${a.dest.nama}.pdf`,
        exchangeRateUsd: u.luarNegeri ? String(u.kurs) : '0',
        totalIdr: rupiah(bteTotal),
        totalUsd: u.luarNegeri ? rupiah(Math.round(hotelTotal / u.kurs)) : '0',
        submittedAt: bteStatus === 'DRAFT' ? null : logAt(6),
        paidAt: bteStatus === 'PAID' ? logAt(8) : null,
        paidBy: bteStatus === 'PAID' ? a.actors.admin.id : null,
        paidByNama: bteStatus === 'PAID' ? a.actors.admin.nama : null,
        updatedAt: logAt(6),
      })
      .returning({ id: bte.id })

    await db.insert(bteRincian).values([
      { bteId: bteRow.id, rincianId: a.refSaku.id, rincianLabel: a.refSaku.label, kategori: a.refSaku.kategori ?? 'lain_lain', jumlahHari: a.lamaHari, nilaiPerHari: rupiah(Math.round(sakuTotal / a.lamaHari)), nilaiTotal: rupiah(sakuTotal), paguSaatInput: rupiah(u.sakuPerHari) },
      { bteId: bteRow.id, rincianId: a.refHotel.id, rincianLabel: a.refHotel.label, kategori: a.refHotel.kategori ?? 'lain_lain', jumlahHari: u.malam, nilaiPerHari: rupiah(Math.round(hotelTotal / u.malam)), nilaiTotal: rupiah(hotelTotal), useDollar: u.luarNegeri, nilaiUsd: u.luarNegeri ? rupiah(Math.round(hotelTotal / u.kurs)) : '0', paguSaatInput: rupiah(u.hotelPerMalam) },
      { bteId: bteRow.id, rincianId: a.refLaundry.id, rincianLabel: a.refLaundry.label, kategori: a.refLaundry.kategori ?? 'lain_lain', jumlahHari: 1, nilaiPerHari: rupiah(u.laundryTotal), nilaiTotal: rupiah(u.laundryTotal), paguSaatInput: rupiah(u.laundryTotal) },
    ])

    await db.insert(bteBiayaLain).values({
      bteId: bteRow.id,
      keterangan: a.sequence % 2 === 0 ? 'Tol, parkir, dan bahan bakar' : 'Ongkos kirim sampel produk',
      nilai: rupiah(biayaLainNilai),
    })

    const bteLogs: Array<typeof bteApprovalLog.$inferInsert> = []
    if (bteStatus !== 'DRAFT') {
      bteLogs.push({ bteId: bteRow.id, aksi: 'submit', actorId: a.pemilik.id, actorNama: a.pemilik.nama, catatan: `${DEMO_TAG} realisasi diajukan`, createdAt: logAt(6) })
    }
    if (bteStatus === 'REVISION') {
      bteLogs.push({ bteId: bteRow.id, aksi: 'revision', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} kuitansi hotel belum terbaca`, createdAt: logAt(7) })
    }
    if (bteStatus === 'PENDING_PAYMENT' || bteStatus === 'PAID') {
      bteLogs.push({ bteId: bteRow.id, aksi: 'approve', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} realisasi sesuai bukti`, createdAt: logAt(7) })
    }
    if (bteStatus === 'PAID') {
      bteLogs.push({ bteId: bteRow.id, aksi: 'mark_paid', actorId: a.actors.admin.id, actorNama: a.actors.admin.nama, catatan: `${DEMO_TAG} dibayarkan via transfer`, createdAt: logAt(8) })
    }
    if (bteLogs.length > 0) await db.insert(bteApprovalLog).values(bteLogs)
  }
}

// ─── Meeting: 2 hari ini (kartu "rapat hari ini") + beberapa di bulan ini ─────
async function seedMeetings(
  actors: Awaited<ReturnType<typeof pickActors>>,
  rooms: Array<{ id: string; nama: string }>,
) {
  const hariIni = NOW.getDate()
  const jadwal = [
    { topik: 'Rapat evaluasi produksi refinery harian', hari: hariIni, jam: 9, durasi: 2, zoom: false },
    { topik: 'Koordinasi pengiriman CPO ke Kuala Tanjung', hari: hariIni, jam: 14, durasi: 1, zoom: true },
    { topik: 'Review anggaran perjalanan dinas bulanan', hari: hariIni + 2, jam: 10, durasi: 2, zoom: false },
    { topik: 'Sosialisasi kebijakan K3 lintas unit', hari: hariIni + 5, jam: 13, durasi: 3, zoom: true },
    { topik: 'Rapat vendor pemeliharaan boiler', hari: Math.max(hariIni - 3, 1), jam: 9, durasi: 2, zoom: false },
  ]

  for (const [index, j] of jadwal.entries()) {
    const room = rooms[index % Math.max(rooms.length, 1)]
    const mulai = at(j.hari, j.jam, 0)
    const selesai = at(j.hari, j.jam + j.durasi, 0)
    const pembuat = index % 2 === 0 ? actors.admin : actors.sdm
    const [row] = await db
      .insert(meeting)
      .values({
        createdBy: pembuat.id,
        createdByNama: pembuat.nama,
        topik: `[DEMO] ${j.topik}`,
        mulai,
        selesai,
        ruangId: room?.id ?? null,
        ruangNama: room?.nama ?? null,
        needSoundSystem: index % 2 === 0,
        needZoom: j.zoom,
        zoomLink: j.zoom ? 'https://zoom.us/j/demo-inl-meetrip' : null,
        catatan: `${DEMO_TAG} agenda contoh untuk pengujian dashboard`,
        status: selesai < NOW ? 'DONE' : 'SCHEDULED',
        createdAt: mulai,
        updatedAt: mulai,
      })
      .returning({ id: meeting.id })

    await db.insert(meetingPartisipan).values([
      { meetingId: row.id, nama: actors.kabag.nama, jabatan: 'Kepala Bagian', isExternal: false },
      { meetingId: row.id, nama: actors.pegawai[index % actors.pegawai.length].nama, jabatan: 'Staf', isExternal: false },
      { meetingId: row.id, nama: 'Perwakilan Vendor', email: 'vendor@example.com', jabatan: 'Account Manager', isExternal: true },
    ])
  }
  console.log(`  ${jadwal.length} agenda meeting dibuat (2 di antaranya hari ini).`)
}

// ─── Anggaran perjalanan bulan ini (dipakai kartu utilisasi cakupan company) ──
async function seedBudget(admin: Actor) {
  const amount = 750_000_000
  const existing = await db
    .select({ id: travelMonthlyBudget.id })
    .from(travelMonthlyBudget)
    .where(and(eq(travelMonthlyBudget.year, YEAR), eq(travelMonthlyBudget.month, MONTH)))

  if (existing.length > 0) {
    console.log(`  anggaran ${MONTH}/${YEAR} sudah ada — dibiarkan apa adanya.`)
    return
  }

  await db.insert(travelMonthlyBudget).values({
    year: YEAR,
    month: MONTH,
    amountIdr: rupiah(amount),
    notes: `${DEMO_TAG} plafon anggaran perjalanan dinas contoh`,
    updatedBy: admin.id,
    updatedByNama: admin.nama,
  })
  console.log(`  anggaran ${MONTH}/${YEAR} diisi Rp ${amount.toLocaleString('id-ID')}.`)
}

main().catch((error) => {
  console.error('GAGAL:', error)
  process.exit(1)
})
