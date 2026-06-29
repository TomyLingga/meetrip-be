// ─── DB Migrate ───────────────────────────────────────────────────────────────
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate }  from 'drizzle-orm/node-postgres/migrator'
import { Pool }     from 'pg'
import { config }   from '../config/env'

async function runMigrations() {
  const pool = new Pool({
    host:     config.db.host,
    port:     config.db.port,
    database: config.db.name,
    user:     config.db.user,
    password: config.db.password,
  })

  const db = drizzle(pool)

  console.log('🔄  Running migrations on', config.db.name, '...')
  await migrate(db, { migrationsFolder: './src/migrations' })
  console.log('✅  Migrations completed!')

  await pool.end()
}

runMigrations().catch(err => {
  console.error('❌  Migration failed:', err)
  process.exit(1)
})
