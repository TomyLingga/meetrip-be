// ─── Seeder: MeeTrip User Role & Local User Cache ────────────────────────────────
// Jalankan: npx tsx src/db/seeds/meetrip-user-role.seed.ts
import { db }                            from '../connection'
import { meetripUserRole, localUserCache } from '../schema'
import { eq }                            from 'drizzle-orm'

const ROLE_SEED_DATA = [
  {
    portalUserId: 'e7016a86-7cc3-4b0b-a02f-7557373bdbac',
    role: 'admin',
  },
  {
    portalUserId: '8670eacc-3420-47b3-a6e0-646c20506d89',
    role: 'admin',
  },
]

const CACHE_SEED_DATA = [
  {
    portalUserId: 'e7016a86-7cc3-4b0b-a02f-7557373bdbac',
    email: 'admin@inl.co.id',
    nama: 'Super Admin Portal',
    employeeId: null,
    gradeKode: null,
    gradeLevel: null,
    unitId: null,
    unitNama: null,
    role: 'admin',
  },
  {
    portalUserId: '8670eacc-3420-47b3-a6e0-646c20506d89',
    email: 'tomy@inl.co.id',
    nama: 'Tommy Inri',
    employeeId: '45d81ecb-5357-41dc-8bb4-7d1e7aa7a1a9',
    gradeKode: 'BOM-3',
    gradeLevel: 7,
    unitId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
    unitNama: 'IT',
    role: 'admin',
  },
]

async function main() {
  console.log('🌱  Seeding meetrip_user_role...')
  for (const entry of ROLE_SEED_DATA) {
    const existing = await db.query.meetripUserRole.findFirst({
      where: eq(meetripUserRole.portalUserId, entry.portalUserId),
    })

    if (existing) {
      await db.update(meetripUserRole)
        .set({ role: entry.role, updatedAt: new Date() })
        .where(eq(meetripUserRole.portalUserId, entry.portalUserId))
      console.log(`  ✏️  Updated role for ${entry.portalUserId} → ${entry.role}`)
    } else {
      await db.insert(meetripUserRole).values(entry)
      console.log(`  ✅  Inserted role for ${entry.portalUserId} → ${entry.role}`)
    }
  }

  console.log('🌱  Seeding local_user_cache...')
  for (const entry of CACHE_SEED_DATA) {
    const existing = await db.query.localUserCache.findFirst({
      where: eq(localUserCache.portalUserId, entry.portalUserId),
    })

    const cacheValues = {
      ...entry,
      lastSync: new Date(),
    }

    if (existing) {
      await db.update(localUserCache)
        .set(cacheValues)
        .where(eq(localUserCache.portalUserId, entry.portalUserId))
      console.log(`  ✏️  Updated cache for ${entry.email}`)
    } else {
      await db.insert(localUserCache).values(cacheValues)
      console.log(`  ✅  Inserted cache for ${entry.email}`)
    }
  }

  console.log('✅  Seeding selesai.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌  Seeding gagal:', err)
  process.exit(1)
})
