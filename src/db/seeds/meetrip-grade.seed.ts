import { db } from '../connection'
import { refGrade } from '../schema'
import { eq } from 'drizzle-orm'

const gradeData = [
  { id: '8384b160-711f-43f9-97b7-647beae89137', kode: 'BOM-4',   label: 'Senior Staff',         level: 6,  keterangan: 'Staff Senior' },
  { id: '28924a99-6921-4773-b34d-55de2d72cea3', kode: 'BOD',     label: 'Board of Director',     level: 20, keterangan: 'Direktur' },
  { id: 'ce2c1d4d-ff2e-49c5-8f72-3625fa7bb6b7', kode: 'BOM',     label: 'Board of Management',   level: 10, keterangan: 'SEVP' },
  { id: '944de528-71cc-4c40-a946-4256d37d16f0', kode: 'BOM-1',   label: 'Manager',               level: 9,  keterangan: 'Kepala Bagian' },
  { id: '711cbb4a-938d-4405-ad08-cd19d80e0cce', kode: 'BOM-2',   label: 'Asst. Manager',         level: 8,  keterangan: 'Kepala Sub Bagian' },
  { id: 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f', kode: 'BOM-3',   label: 'Supervisor',             level: 7,  keterangan: 'Supervisor / Kepala Seksi' },
  { id: '69ed633e-3a10-4806-b0bb-69012c2759c4', kode: 'PKL',     label: 'PKL',                   level: 5,  keterangan: 'Praktek Kerja Lapangan' },
  { id: '96129fd5-b09b-469f-a25c-aeda0b9ce10b', kode: '3A',      label: 'Staff III-A',           level: 7,  keterangan: 'Staff' },
  { id: '2cb911b1-9cba-4876-b042-9d35be7238cd', kode: '3B',      label: 'Staff III-B',           level: 8,  keterangan: 'Staff' },
  { id: 'cc6b7d39-8627-419c-9d99-067bd630c1c0', kode: '2A',      label: 'Staff II-A',           level: 9,  keterangan: 'Staff Junior' },
  { id: 'ca465724-dac2-4952-a512-a7fca5b3c7f7', kode: '2B',      label: 'Staff II-B',           level: 10, keterangan: 'Staff Junior' },
  { id: 'c80a4328-c985-4690-980b-2313b609a336', kode: '1A',      label: 'Staff I-A',             level: 11, keterangan: 'Staff Pemula' },
  { id: '2050d523-889f-4e9a-a85f-59194ff3176f', kode: '1B',      label: 'Staff I-B',             level: 12, keterangan: 'Staff Pemula' },
]

async function main() {
  console.log('🌱 Seeding ref_grade for MeeTrip...')
  for (const data of gradeData) {
    const existing = await db.query.refGrade.findFirst({
      where: eq(refGrade.id, data.id),
    })
    if (!existing) {
      await db.insert(refGrade).values(data)
      console.log(`  ✅ Inserted ${data.kode} - ${data.label}`)
    } else {
      console.log(`  ✏️ Already exists: ${data.kode}`)
    }
  }
  console.log('✅ Done.')
  process.exit(0)
}

main().catch(err => {
  console.error(err);
  process.exit(1);
})
