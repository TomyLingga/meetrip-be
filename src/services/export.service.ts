// ─── Export Service ───────────────────────────────────────────────────────────
// Export data perjalanan dinas ke Excel menggunakan ExcelJS
import ExcelJS from 'exceljs'
import { db }  from '../db/connection'
import { bto, bte, bteRincian, dp, dpRincian } from '../db/schema'
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

  // ─── Sheet 1: Ringkasan BTO ────────────────────────────────────────────────
  const sheet1 = workbook.addWorksheet('Perjalanan Dinas')
  sheet1.columns = [
    { header: 'No',              key: 'no',            width: 5  },
    { header: 'Nomor BTO',       key: 'nomorBto',      width: 22 },
    { header: 'Karyawan',        key: 'karyawan',      width: 30 },
    { header: 'Tujuan',          key: 'tujuan',        width: 30 },
    { header: 'Wilayah',         key: 'wilayah',       width: 18 },
    { header: 'Est. Berangkat',  key: 'estBerangkat',  width: 20 },
    { header: 'Est. Kembali',    key: 'estKembali',    width: 20 },
    { header: 'Status',          key: 'status',        width: 20 },
    { header: 'Butuh DP',        key: 'butuhDp',       width: 12 },
    { header: 'Dibuat',          key: 'createdAt',     width: 20 },
  ]

  // Style header
  sheet1.getRow(1).font = { bold: true }
  sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

  btoRows.forEach((row, i) => {
    sheet1.addRow({
      no:           i + 1,
      nomorBto:     row.nomorBto ?? '-',
      karyawan:     row.employeeNama ?? row.employeeId,
      tujuan:       row.tujuanNama,
      wilayah:      row.wilayahTipe ?? '-',
      estBerangkat: row.estBerangkat ? new Date(row.estBerangkat).toLocaleString('id-ID') : '-',
      estKembali:   row.estKembali   ? new Date(row.estKembali).toLocaleString('id-ID')   : '-',
      status:       row.status,
      butuhDp:      row.butuhDp ? 'Ya' : 'Tidak',
      createdAt:    row.createdAt ? new Date(row.createdAt).toLocaleString('id-ID') : '-',
    })
  })

  // ─── Sheet 2: Rincian BTE ─────────────────────────────────────────────────
  const sheet2 = workbook.addWorksheet('Rincian Biaya')
  sheet2.columns = [
    { header: 'Nomor BTO',      key: 'nomorBto',      width: 22 },
    { header: 'Karyawan',       key: 'karyawan',      width: 30 },
    { header: 'Rincian',        key: 'rincian',       width: 30 },
    { header: 'Jumlah Hari',    key: 'jumlahHari',    width: 14 },
    { header: 'Nilai/Hari',     key: 'nilaiPerHari',  width: 18 },
    { header: 'Total',          key: 'nilaiTotal',    width: 18 },
    { header: 'Mata Uang',      key: 'matauang',      width: 12 },
    { header: 'Status BTE',     key: 'statusBte',     width: 18 },
  ]
  sheet2.getRow(1).font = { bold: true }
  sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

  for (const btoRow of btoRows) {
    const bteRows = await db.select().from(bte).where(eq(bte.btoId, btoRow.id))
    for (const bteRow of bteRows) {
      const rincianRows = await db.select().from(bteRincian).where(eq(bteRincian.bteId, bteRow.id))
      for (const r of rincianRows) {
        sheet2.addRow({
          nomorBto:     btoRow.nomorBto ?? '-',
          karyawan:     btoRow.employeeNama ?? btoRow.employeeId,
          rincian:      r.rincianLabel ?? '-',
          jumlahHari:   r.jumlahHari,
          nilaiPerHari: Number(r.nilaiPerHari),
          nilaiTotal:   Number(r.nilaiTotal),
          matauang:     r.useDollar ? 'USD' : 'IDR',
          statusBte:    bteRow.status,
        })
      }
    }
  }

  // Format currency columns
  sheet2.getColumn('nilaiPerHari').numFmt = '#,##0.00'
  sheet2.getColumn('nilaiTotal').numFmt   = '#,##0.00'

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
