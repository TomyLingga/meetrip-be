// ─── DB Connection ────────────────────────────────────────────────────────────
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool }    from 'pg'
import { config }  from '../config/env'
import * as schema from './schema'

/*
 * Batas eksplisit, bukan default pg:
 *  - max                   : cegah satu ledakan request menghabiskan koneksi DB
 *  - connectionTimeoutMillis: gagal cepat saat DB tidak responsif (bukan menggantung)
 *  - idleTimeoutMillis     : lepas koneksi menganggur
 *  - statement_timeout     : bunuh query liar (mis. list tanpa filter) di sisi server
 */
export const pool = new Pool({
  host:     config.db.host,
  port:     config.db.port,
  database: config.db.name,
  user:     config.db.user,
  password: config.db.password,
  // Aktifkan enkripsi dengan DB_SSL=require pada deployment non-lokal.
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
  max: 15,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 20_000,
  query_timeout: 20_000,
})

pool.on('error', (err) => {
  console.error('[db] koneksi pool error:', err.message)
})

export const db = drizzle(pool, { schema })
