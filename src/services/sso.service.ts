// ─── SSO Service ──────────────────────────────────────────────────────────────
// Verifikasi sso_token ke portal, buat session JWT lokal MeeTrip
import { db }      from '../db/connection'
import { localUserCache, refreshToken, meetripUserRole } from '../db/schema'
import { eq }      from 'drizzle-orm'
import { config }  from '../config/env'
import { AppError } from '../utils/errorHandler'
import crypto      from 'crypto'
import type { FastifyInstance } from 'fastify'
import type { JwtPayload }      from '../plugins/auth'

// ─── Tipe data user dari portal (response /api/sso/verify) ───────────────────
interface PortalUser {
  id:         string
  email:      string
  role:       string
  employee?: {
    id:          string
    namaLengkap: string
    jabatan?:    string
    grade?: { kode: string; level: number }
    unit?:  { id: string; nama: string }
    penempatanArea?: {
      id:        string
      nama:      string
      latitude:  string
      longitude: string
    }
  }
}

interface PortalVerifyResponse {
  data: PortalUser
}

// Helper: Tentukan role spesifik MeeTrip
// HANYA dari tabel meetrip_user_role. Jika tidak ada record → default 'user'.
async function getMeeTripRole(portalUserId: string): Promise<string> {
  const customRole = await db.query.meetripUserRole.findFirst({
    where: eq(meetripUserRole.portalUserId, portalUserId),
  })
  return customRole ? customRole.role : 'user'
}

// ─── Verifikasi SSO Token ke portal ──────────────────────────────────────────
export async function loginSsoService(
  ssoToken: string,
  appId: string,
  fastify: FastifyInstance,
) {
  // 1. Verifikasi token ke portal
  const portalRes = await fetch(`${config.portal.apiUrl}/api/sso/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ssoToken, app_id: appId }),
  })

  if (!portalRes.ok) {
    const body = await portalRes.json().catch(() => ({}))
    throw new AppError((body as any).error ?? 'SSO token tidak valid', 401)
  }

  const resBody = await portalRes.json() as { data: PortalUser }
  const portalUser = resBody.data

  // Ambil MeeTrip role
  const meeTripRole = await getMeeTripRole(portalUser.id)

  // 2. Upsert local_user_cache
  const emp = portalUser.employee
  const cacheData = {
    portalUserId:       portalUser.id,
    email:              portalUser.email,
    role:               meeTripRole, // simpan role MeeTrip di local cache
    nama:               emp?.namaLengkap ?? null,
    employeeId:         emp?.id          ?? null,
    gradeKode:          emp?.grade?.kode ?? null,
    gradeLevel:         emp?.grade?.level ?? null,
    unitId:             emp?.unit?.id   ?? null,
    unitNama:           emp?.unit?.nama ?? null,
    penempatanAreaId:   emp?.penempatanArea?.id ?? null,
    penempatanNama:     emp?.penempatanArea?.nama ?? null,
    penempatanLat:      emp?.penempatanArea?.latitude ?? null,
    penempatanLng:      emp?.penempatanArea?.longitude ?? null,
    penempatanProvinsi: null as string | null, // diisi saat geocode (lazy)
    lastSync:           new Date(),
  }

  const existing = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, portalUser.id),
  })

  let userCache: typeof cacheData & { id: string }

  if (existing) {
    await db.update(localUserCache)
      .set(cacheData)
      .where(eq(localUserCache.portalUserId, portalUser.id))
    userCache = { ...existing, ...cacheData }
  } else {
    const [inserted] = await db.insert(localUserCache).values(cacheData).returning()
    userCache = inserted as any
  }

  // 3. Buat JWT MeeTrip
  const payload: JwtPayload = {
    sub:        portalUser.id,
    email:      portalUser.email,
    employeeId: emp?.id          ?? null,
    nama:       emp?.namaLengkap ?? null,
    gradeLevel: emp?.grade?.level ?? null,
    role:       meeTripRole,
  }

  const accessToken  = fastify.jwt.sign(payload, { expiresIn: config.jwt.expiresIn })
  const rawRefresh   = crypto.randomBytes(40).toString('hex')
  const refreshExpMs = parseDuration(config.jwt.refreshExpiresIn)

  await db.insert(refreshToken).values({
    userId:    portalUser.id,
    token:     rawRefresh,
    expiresAt: new Date(Date.now() + refreshExpMs),
  })

  return {
    accessToken,
    refreshToken: rawRefresh,
    expiresIn:    config.jwt.expiresIn,
    user: {
      id:         portalUser.id,
      email:      portalUser.email,
      role:       meeTripRole,
      nama:       emp?.namaLengkap ?? null,
      jabatan:    portalUser.employee?.jabatan ?? null,
      gradeLevel: emp?.grade?.level ?? null,
      gradeKode:  emp?.grade?.kode  ?? null,
      unitNama:   emp?.unit?.nama   ?? null,
    },
  }
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
export async function refreshSsoTokenService(
  token: string,
  fastify: FastifyInstance,
) {
  const [rt] = await db.select()
    .from(refreshToken)
    .where(eq(refreshToken.token, token))
    .limit(1)

  if (!rt || rt.expiresAt < new Date()) {
    throw new AppError('Refresh token tidak valid atau sudah kadaluarsa', 401)
  }

  const userCache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, rt.userId),
  })
  if (!userCache) throw new AppError('User tidak ditemukan', 401)

  // Ambil MeeTrip role ter-update
  const meeTripRole = await getMeeTripRole(userCache.portalUserId)

  const payload: JwtPayload = {
    sub:        userCache.portalUserId,
    email:      userCache.email,
    employeeId: userCache.employeeId,
    nama:       userCache.nama,
    gradeLevel: userCache.gradeLevel,
    role:       meeTripRole,
  }

  const newAccessToken = fastify.jwt.sign(payload, { expiresIn: config.jwt.expiresIn })

  // Rotate refresh token
  const rawRefresh   = crypto.randomBytes(40).toString('hex')
  const refreshExpMs = parseDuration(config.jwt.refreshExpiresIn)
  await db.delete(refreshToken).where(eq(refreshToken.token, token))
  await db.insert(refreshToken).values({
    userId:    rt.userId,
    token:     rawRefresh,
    expiresAt: new Date(Date.now() + refreshExpMs),
  })

  return {
    accessToken:  newAccessToken,
    refreshToken: rawRefresh,
    expiresIn:    config.jwt.expiresIn,
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logoutSsoService(token: string) {
  await db.delete(refreshToken).where(eq(refreshToken.token, token))
}

// ─── Helper: parse "30d" / "15m" ke ms ───────────────────────────────────────
function parseDuration(s: string): number {
  const match = s.match(/^(\d+)([smhd])$/)
  if (!match) return 7 * 24 * 60 * 60 * 1000
  const n = parseInt(match[1])
  switch (match[2]) {
    case 's': return n * 1000
    case 'm': return n * 60 * 1000
    case 'h': return n * 3600 * 1000
    case 'd': return n * 86400 * 1000
    default:  return 86400 * 1000
  }
}
