// ─── Export Service ───────────────────────────────────────────────────────────
// Export data perjalanan dinas ke Excel menggunakan ExcelJS
import ExcelJS from 'exceljs'
import { db }  from '../db/connection'
import { bto, bte, bteRincian, dp, dpRincian, spdk, attendStamp } from '../db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'

export async function exportBtoExcelService(filters: {
  dateFrom?: Date
  dateTo?:   Date
  status?:   string
}): Promise<Buffer> {
  const conditions = []
  if (filters.dateFrom) conditions.push(gte(bto.createdAt, filters.dateFrom))
  if (filters.dateTo)   conditions.push(lte(bto.createdAt, filters.dateTo))
  if (filters.status)   conditions.push(eq(bto.status, filters.status as any))

  const btoRows = await db.select().from(bto)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bto.createdAt))

  const workbook  = new ExcelJS.Workbook()
  workbook.creator = 'MeeTrip System'
  workbook.created = new Date()

  // ─── Sheet 1: Rekap Perjalanan Dinas ────────────────────────────────────────
  const sheet1 = workbook.addWorksheet('Perjalanan Dinas')
  sheet1.columns = [
    { header: 'No',              key: 'no',            width: 5  },
    { header: 'Nomor BTO',       key: 'nomorBto',      width: 22 },
    { header: 'Nomor SPDK',      key: 'nomorSpdk',     width: 22 },
    { header: 'Karyawan',        key: 'karyawan',      width: 30 },
    { header: 'Tujuan',          key: 'tujuan',        width: 30 },
    { header: 'Wilayah',         key: 'wilayah',       width: 18 },
    { header: 'Est. Berangkat',  key: 'estBerangkat',  width: 20 },
    { header: 'Est. Kembali',    key: 'estKembali',    width: 20 },
    { header: 'Waktu Absen',     key: 'waktuAbsen',    width: 20 },
    { header: 'Status Akhir',    key: 'status',        width: 20 },
    { header: 'Total Panjar',    key: 'totalPanjar',   width: 18 },
    { header: 'Total Realisasi', key: 'totalRealisasi',width: 18 },
    { header: 'Dibuat',          key: 'createdAt',     width: 20 },
  ]

  // Style header
  sheet1.getRow(1).font = { bold: true }
  sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

  for (let i = 0; i < btoRows.length; i++) {
    const row = btoRows[i]
    
    // Ambil data SPDK
    const spdkData = await db.select().from(spdk).where(eq(spdk.btoId, row.id)).limit(1)
    const spdkNum = spdkData.length > 0 ? spdkData[0].nomorSpdk : '-'
    
    // Ambil data Absen
    const absenData = await db.select().from(attendStamp).where(eq(attendStamp.btoId, row.id)).limit(1)
    const absenTime = absenData.length > 0 && absenData[0].stamped_at 
      ? new Date(absenData[0].stamped_at).toLocaleString('id-ID') 
      : '-'

    // Ambil data Panjar (DP)
    const dpData = await db.select().from(dp).where(eq(dp.btoId, row.id)).limit(1)
    const totalPanjar = dpData.length > 0 ? Number(dpData[0].totalIdr) : 0

    // Ambil data Realisasi (BTE)
    const bteData = await db.select().from(bte).where(eq(bte.btoId, row.id))
    const totalRealisasi = bteData.reduce((sum, b) => sum + Number(b.totalIdr || 0), 0)

    sheet1.addRow({
      no:             i + 1,
      nomorBto:       row.nomorBto ?? '-',
      nomorSpdk:      spdkNum ?? '-',
      karyawan:       row.employeeNama ?? row.employeeId,
      tujuan:         row.tujuanNama,
      wilayah:        row.wilayahTipe ?? '-',
      estBerangkat:   row.estBerangkat ? new Date(row.estBerangkat).toLocaleString('id-ID') : '-',
      estKembali:     row.estKembali   ? new Date(row.estKembali).toLocaleString('id-ID')   : '-',
      waktuAbsen:     absenTime,
      status:         row.status,
      totalPanjar:    totalPanjar,
      totalRealisasi: totalRealisasi,
      createdAt:      row.createdAt ? new Date(row.createdAt).toLocaleString('id-ID') : '-',
    })
  }

  // Format currency Sheet 1
  sheet1.getColumn('totalPanjar').numFmt = '#,##0.00'
  sheet1.getColumn('totalRealisasi').numFmt = '#,##0.00'


  // ─── Sheet 2: Rincian Biaya (Itemized) ──────────────────────────────────────
  const sheet2 = workbook.addWorksheet('Rincian Biaya')
  sheet2.columns = [
    { header: 'Nomor BTO',          key: 'nomorBto',         width: 22 },
    { header: 'Karyawan',           key: 'karyawan',         width: 30 },
    { header: 'Rincian',            key: 'rincian',          width: 30 },
    { header: 'Jml Hari Rencana',   key: 'jmlHariRencana',   width: 16 },
    { header: 'Nilai/Hari Rencana', key: 'nilaiHariRencana', width: 20 },
    { header: 'Total Panjar (DP)',  key: 'nilaiPanjar',      width: 20 },
    { header: 'Jml Hari Realisasi', key: 'jmlHariRealisasi', width: 18 },
    { header: 'Nilai/Hari Realisasi',key: 'nilaiHariRealisasi',width: 20 },
    { header: 'Total Realisasi (BTE)',key: 'nilaiRealisasi',   width: 22 },
    { header: 'Mata Uang',          key: 'matauang',         width: 12 },
  ]
  sheet2.getRow(1).font = { bold: true }
  sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

  for (const btoRow of btoRows) {
    // Ambil seluruh rincian DP
    const dpData = await db.select().from(dp).where(eq(dp.btoId, btoRow.id)).limit(1)
    let dpRincianRows: any[] = []
    if (dpData.length > 0) {
      dpRincianRows = await db.select().from(dpRincian).where(eq(dpRincian.dpId, dpData[0].id))
    }

    // Ambil seluruh rincian BTE
    const bteDataList = await db.select().from(bte).where(eq(bte.btoId, btoRow.id))
    let bteRincianRows: any[] = []
    for (const bteData of bteDataList) {
      const r = await db.select().from(bteRincian).where(eq(bteRincian.bteId, bteData.id))
      bteRincianRows.push(...r)
    }

    // Gabungkan berdasarkan rincianId agar DP dan BTE bisa bersisian
    // Kita buat Map berdasarkan rincianId
    const mapRincian = new Map<string, any>()

    for (const dpR of dpRincianRows) {
      mapRincian.set(dpR.rincianId, {
        rincianLabel: dpR.rincianLabel,
        dpJmlHari: dpR.jumlahHari,
        dpNilaiPerHari: Number(dpR.nilaiPerHari),
        dpTotal: Number(dpR.nilaiTotal),
        bteJmlHari: 0,
        bteNilaiPerHari: 0,
        bteTotal: 0,
        matauang: dpR.useDollar ? 'USD' : 'IDR'
      })
    }

    for (const bteR of bteRincianRows) {
      if (mapRincian.has(bteR.rincianId)) {
        const exist = mapRincian.get(bteR.rincianId)
        exist.bteJmlHari = bteR.jumlahHari
        exist.bteNilaiPerHari = Number(bteR.nilaiPerHari)
        exist.bteTotal = Number(bteR.nilaiTotal)
        exist.matauang = bteR.useDollar ? 'USD' : 'IDR'
      } else {
        mapRincian.set(bteR.rincianId, {
          rincianLabel: bteR.rincianLabel,
          dpJmlHari: 0,
          dpNilaiPerHari: 0,
          dpTotal: 0,
          bteJmlHari: bteR.jumlahHari,
          bteNilaiPerHari: Number(bteR.nilaiPerHari),
          bteTotal: Number(bteR.nilaiTotal),
          matauang: bteR.useDollar ? 'USD' : 'IDR'
        })
      }
    }

    // Insert ke sheet
    for (const [_, val] of mapRincian) {
      sheet2.addRow({
        nomorBto:           btoRow.nomorBto ?? '-',
        karyawan:           btoRow.employeeNama ?? btoRow.employeeId,
        rincian:            val.rincianLabel ?? '-',
        jmlHariRencana:     val.dpJmlHari || '-',
        nilaiHariRencana:   val.dpNilaiPerHari || 0,
        nilaiPanjar:        val.dpTotal || 0,
        jmlHariRealisasi:   val.bteJmlHari || '-',
        nilaiHariRealisasi: val.bteNilaiPerHari || 0,
        nilaiRealisasi:     val.bteTotal || 0,
        matauang:           val.matauang,
      })
    }
  }

  // Format currency columns
  sheet2.getColumn('nilaiHariRencana').numFmt   = '#,##0.00'
  sheet2.getColumn('nilaiPanjar').numFmt        = '#,##0.00'
  sheet2.getColumn('nilaiHariRealisasi').numFmt = '#,##0.00'
  sheet2.getColumn('nilaiRealisasi').numFmt     = '#,##0.00'

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
