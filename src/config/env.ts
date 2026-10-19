// ─── Env Config ────────────────────────────────────────────────────────────────
import 'dotenv/config'
// Trigger restart for env reload
import { z } from 'zod'

// Nilai kosong ("PHOTON_URL=") diperlakukan sama dengan tidak diisi → pakai default.
const urlOrDefault = (fallback: string) =>
  z.preprocess(value => (value === '' ? undefined : value), z.string().url().default(fallback))

const envSchema = z.object({
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),

  PORT: z.preprocess((value) => {
    const port = Number(value)
    return Number.isFinite(port) && port > 0 ? port : undefined
  }, z.number().int().min(1).max(65535).default(3003)),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  JWT_SECRET: z.string().min(32),
  // Access token: umur pendek, di-refresh diam-diam oleh frontend (lihat apiFetch).
  JWT_EXPIRES_IN: z.string().default('30m'),
  // Refresh token = batas idle sebelum user wajib login ulang. Berotasi tiap dipakai,
  // jadi selama user aktif sesi diperpanjang otomatis; 12 jam menutup satu hari kerja penuh.
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('12h'),

  PORTAL_API_URL: z.string().url(),
  SSO_INTERNAL_TOKEN: z.string().default('secret_development_token'),

  // Peta & lokasi (services/geo.service.ts). Default memakai layanan publik
  // berbasis OpenStreetMap yang gratis; ganti URL-nya bila sudah self-host.
  PHOTON_URL:    urlOrDefault('https://photon.komoot.io'),
  NOMINATIM_URL: urlOrDefault('https://nominatim.openstreetmap.org'),
  // Kosong = jarak garis lurus (haversine). Isi dengan OSRM self-host untuk jarak jalan.
  OSRM_URL:      z.union([z.literal(''), z.string().url()]).default(''),
  // Nominatim & Photon mewajibkan User-Agent yang mengidentifikasi aplikasi.
  GEO_USER_AGENT: z.string().default('MeeTrip/1.0 (PT Industri Nabati Lestari)'),
  // Opsional. Hanya dipakai sebagai cadangan terakhir reverse geocode bila
  // Nominatim & BigDataCloud gagal, supaya deteksi wilayah (acuan pagu) tetap jalan.
  GOOGLE_MAPS_API_KEY: z.string().default(''),

  // Comma-separated list of allowed browser origins for CORS.
  CORS_ORIGINS: z.string().default('http://localhost:3004,http://localhost:3002'),

  ATTEND_RADIUS_METER: z.coerce.number().default(500),

  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_URL: z.string(),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().default(10),
}).superRefine((env, ctx) => {
  // In production the internal SSO token MUST be overridden — falling back to the
  // well-known default would let anyone forge internal Portal calls.
  if (env.NODE_ENV === 'production' && env.SSO_INTERNAL_TOKEN === 'secret_development_token') {
    ctx.addIssue({
      code: 'custom',
      path: ['SSO_INTERNAL_TOKEN'],
      message: 'SSO_INTERNAL_TOKEN wajib diganti untuk production',
    })
  }
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌  Invalid environment variables:', parsed.error.format())
  process.exit(1)
}

const d = parsed.data

export const config = {
  app: {
    port: d.PORT,
    host: d.HOST,
    nodeEnv: d.NODE_ENV,
  },
  db: {
    host: d.DB_HOST,
    port: d.DB_PORT,
    name: d.DB_NAME,
    user: d.DB_USER,
    password: d.DB_PASSWORD,
  },
  jwt: {
    secret: d.JWT_SECRET,
    expiresIn: d.JWT_EXPIRES_IN,
    refreshExpiresIn: d.REFRESH_TOKEN_EXPIRES_IN,
  },
  portal: {
    apiUrl: d.PORTAL_API_URL,
    internalToken: d.SSO_INTERNAL_TOKEN,
  },
  cors: {
    origins: d.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  },
  geo: {
    photonUrl:    d.PHOTON_URL.replace(/\/+$/, ''),
    nominatimUrl: d.NOMINATIM_URL.replace(/\/+$/, ''),
    osrmUrl:      d.OSRM_URL.replace(/\/+$/, ''),
    userAgent:    d.GEO_USER_AGENT,
  },
  googleMaps: {
    apiKey: d.GOOGLE_MAPS_API_KEY,
  },
  attend: {
    radiusMeter: d.ATTEND_RADIUS_METER,
  },
  upload: {
    dir: d.UPLOAD_DIR,
    url: d.UPLOAD_URL,
    maxSizeMB: d.UPLOAD_MAX_SIZE_MB,
  },
}
