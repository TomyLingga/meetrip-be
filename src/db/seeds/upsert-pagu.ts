import { db } from '../connection'
import { refPagu, refRincianBiaya } from '../schema'
import { eq, and } from 'drizzle-orm'

async function main() {
  console.log('--- Upserting ref_pagu limits for BOM-4 and BOM-3 ---')

  const bom4GradeId = '8384b160-711f-43f9-97b7-647beae89137'
  const bom3GradeId = 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f'

  const laundryId = 'b99c30d6-4569-4f3c-af88-3fca2273a505'
  const hotelId = '96db19c6-35b5-4695-8f34-609bd82cbee1'
  const uangSakuId = '6557d937-2736-469d-9864-f6214de69f6d'

  const pagusToUpsert = [
    // --- BOM-4 (dalam_wilayah) ---
    { rincianId: laundryId, gradeId: bom4GradeId, wilayahTipe: 'dalam_wilayah', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: hotelId, gradeId: bom4GradeId, wilayahTipe: 'dalam_wilayah', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: uangSakuId, gradeId: bom4GradeId, wilayahTipe: 'dalam_wilayah', nilai: '900000.00', useDollar: false, isUnlimited: false },

    // --- BOM-4 (luar_wilayah) ---
    { rincianId: laundryId, gradeId: bom4GradeId, wilayahTipe: 'luar_wilayah', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: hotelId, gradeId: bom4GradeId, wilayahTipe: 'luar_wilayah', nilai: '1200000.00', useDollar: false, isUnlimited: false }, // Fixed typo from 12000 to 1200000
    { rincianId: uangSakuId, gradeId: bom4GradeId, wilayahTipe: 'luar_wilayah', nilai: '900000.00', useDollar: false, isUnlimited: false },

    // --- BOM-4 (luar_negeri) ---
    { rincianId: laundryId, gradeId: bom4GradeId, wilayahTipe: 'luar_negeri', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: hotelId, gradeId: bom4GradeId, wilayahTipe: 'luar_negeri', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: uangSakuId, gradeId: bom4GradeId, wilayahTipe: 'luar_negeri', nilai: '0.00', useDollar: false, isUnlimited: true },

    // --- BOM-3 (dalam_wilayah) ---
    { rincianId: laundryId, gradeId: bom3GradeId, wilayahTipe: 'dalam_wilayah', nilai: '0.00', useDollar: false, isUnlimited: true },
    { rincianId: hotelId, gradeId: bom3GradeId, wilayahTipe: 'dalam_wilayah', nilai: '1200000.00', useDollar: false, isUnlimited: false },
    { rincianId: uangSakuId, gradeId: bom3GradeId, wilayahTipe: 'dalam_wilayah', nilai: '900000.00', useDollar: false, isUnlimited: false },

    // --- BOM-3 (luar_wilayah) ---
    { rincianId: laundryId, gradeId: bom3GradeId, wilayahTipe: 'luar_wilayah', nilai: '1200000.00', useDollar: false, isUnlimited: false },
    { rincianId: hotelId, gradeId: bom3GradeId, wilayahTipe: 'luar_wilayah', nilai: '1200000.00', useDollar: false, isUnlimited: false },
    { rincianId: uangSakuId, gradeId: bom3GradeId, wilayahTipe: 'luar_wilayah', nilai: '900000.00', useDollar: false, isUnlimited: false }
  ]

  for (const item of pagusToUpsert) {
    const existing = await db.select().from(refPagu).where(
      and(
        eq(refPagu.rincianId, item.rincianId),
        eq(refPagu.gradeId, item.gradeId),
        eq(refPagu.wilayahTipe, item.wilayahTipe)
      )
    ).limit(1)

    if (existing.length > 0) {
      await db.update(refPagu).set({
        nilai: item.nilai,
        useDollar: item.useDollar,
        isUnlimited: item.isUnlimited
      }).where(eq(refPagu.id, existing[0].id))
      console.log(`Updated pagu for ${item.rincianId} / ${item.gradeId} / ${item.wilayahTipe}`)
    } else {
      await db.insert(refPagu).values(item)
      console.log(`Inserted pagu for ${item.rincianId} / ${item.gradeId} / ${item.wilayahTipe}`)
    }
  }

  console.log('--- Upsert complete ---')
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
