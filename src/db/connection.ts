// ─── DB Connection ────────────────────────────────────────────────────────────
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool }    from 'pg'
import { config }  from '../config/env'
import * as schema from './schema'

export const pool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  database: config.db.name,
  user:     config.db.user,
  password: config.db.password,
})

export const db = drizzle(pool, { schema })
