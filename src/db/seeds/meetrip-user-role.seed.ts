// ─── Seeder: MeeTrip User Role ────────────────────────────────────────────────
// Jalankan: npx tsx src/db/seeds/meetrip-user-role.seed.ts
import { db }            from '../connection'
import { meetripUserRole } from '../schema'
import { eq }            from 'drizzle-orm'

const SEED_DATA = [
  {
    portalUserId: 'e7016a86-7cc3-4b0b-a02f-7557373bdbac',
    role: 'admin',
  },
  // Tambah baris lain di sini jika diperlukan:
  // { portalUserId: 'uuid-sdm-1', role: 'sdm' },
]

async function main() {
  console.log('🌱  Seeding meetrip_user_role...')

  for (const entry of SEED_DATA) {
    const existing = await db.query.meetripUserRole.findFirst({
      where: eq(meetripUserRole.portalUserId, entry.portalUserId),
    })

    if (existing) {
      await db.update(meetripUserRole)
        .set({ role: entry.role })
        .where(eq(meetripUserRole.portalUserId, entry.portalUserId))
      console.log(`  ✏️  Updated  ${entry.portalUserId} → ${entry.role}`)
    } else {
      await db.insert(meetripUserRole).values(entry)
      console.log(`  ✅  Inserted ${entry.portalUserId} → ${entry.role}`)
    }
  }

  console.log('✅  Seeding selesai.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌  Seeding gagal:', err)
  process.exit(1)
})
