/**
 * ─── Hapus data demo dashboard MeeTrip ───────────────────────────────────────
 *
 * Membuang seluruh baris yang dibuat `seed-demo-dashboard.ts`. Aman dijalankan
 * kapan pun: hanya menyentuh baris bertanda DEMO_TAG / prefix `[DEMO]`.
 * DP, SPDK, absen, BTE, dan seluruh log ikut terhapus lewat ON DELETE CASCADE.
 *
 * Jalankan:  npx tsx scripts/maintenance/remove-demo-dashboard.ts
 */
import { db } from '../../src/db/connection'
import { bto, meeting, travelMonthlyBudget } from '../../src/db/schema'
import { like, or, sql } from 'drizzle-orm'

const DEMO_TAG = '[DEMO-DASHBOARD]'

async function main() {
  const btoRows = await db
    .delete(bto)
    .where(or(like(bto.kepentingan, '[DEMO]%'), like(bto.catatanAdmin, `%${DEMO_TAG}%`)))
    .returning({ id: bto.id })

  const meetingRows = await db
    .delete(meeting)
    .where(or(like(meeting.topik, '[DEMO]%'), like(meeting.catatan, `%${DEMO_TAG}%`)))
    .returning({ id: meeting.id })

  const budgetRows = await db
    .delete(travelMonthlyBudget)
    .where(like(travelMonthlyBudget.notes, `%${DEMO_TAG}%`))
    .returning({ id: travelMonthlyBudget.id })

  console.log(`Dihapus: ${btoRows.length} BTO (beserta DP/SPDK/BTE/log via cascade)`)
  console.log(`         ${meetingRows.length} meeting`)
  console.log(`         ${budgetRows.length} baris anggaran bulanan`)

  const sisa = await db.select({ n: sql<number>`COUNT(*)` }).from(bto)
  console.log(`BTO tersisa di database: ${sisa[0]?.n ?? 0}`)
  process.exit(0)
}

main().catch((error) => {
  console.error('GAGAL:', error)
  process.exit(1)
})
