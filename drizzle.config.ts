import { defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
  schema:    './src/db/schema/index.ts',
  out:       './src/migrations',
  dialect:   'postgresql',
  dbCredentials: {
    host:     process.env.DB_HOST!,
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME!,
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    ssl:      false,
  },
  verbose: true,
  strict:  true,
})
