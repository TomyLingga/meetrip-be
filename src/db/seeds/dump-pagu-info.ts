import { db } from '../connection'
import { localUserCache } from '../schema'

async function main() {
  console.log('--- Fetching local_user_cache ---')
  const users = await db.select().from(localUserCache)
  users.forEach(u => {
    console.log(`- Nama: ${u.nama}, Email: ${u.email}, GradeKode: ${u.gradeKode}, GradeLevel: ${u.gradeLevel}`)
  })
  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
