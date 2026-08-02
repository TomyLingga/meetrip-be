// ─── MeeTrip Server Entry Point ───────────────────────────────────────────────
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { config } from './config/env';
import { errorHandler } from './utils/errorHandler';
import { expandDevelopmentLoopbackOrigins } from './utils/cors';
import { findAccessibleBto, actorIsAdminOrSdm } from './services/access.service';

import jwtPlugin from './plugins/jwt';
import authPlugin from './plugins/auth';

import ssoRoutes from './routes/sso.route';
import masterRoutes from './routes/master.route';
import configRoutes from './routes/config.route';
import btoRoutes from './routes/bto.route';
import dpRoutes from './routes/dp.route';
import spdkRoutes from './routes/spdk.route';
import bteRoutes from './routes/bte.route';
import meetingRoutes from './routes/meeting.route';
import dashboardRoutes from './routes/dashboard.route';
import portalUserRoutes from './routes/portal-users.route';
import documentRoutes from './routes/document.route';

// ─── Upload Folder Setup ──────────────────────────────────────────────────────
const uploadDir = path.resolve(config.upload.dir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Fastify Instance ─────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    transport: config.app.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  },
});

// ─── Error Handler ────────────────────────────────────────────────────────────
fastify.setErrorHandler(errorHandler);

/*
 * ─── Rate limiter in-memory ───────────────────────────────────────────────────
 * MeeTrip sebelumnya tidak punya pembatas sama sekali, sehingga endpoint publik
 * (kalender TV) dan endpoint auth bisa dibanjiri tanpa biaya. Bentuknya disamakan
 * dengan portal-app-be agar perilakunya konsisten dan tanpa dependensi baru.
 */
type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 5 * 60_000).unref();

const STRICT_PATHS = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
const PUBLIC_PATHS = ['/api/meeting/public'];

function rateLimitFor(ip: string, url: string) {
  const pathOnly = url.split('?')[0];
  if (STRICT_PATHS.includes(pathOnly)) return { key: `${ip}:${pathOnly}`, limit: 20, windowMs: 60_000 };
  if (PUBLIC_PATHS.includes(pathOnly)) return { key: `${ip}:${pathOnly}`, limit: 60, windowMs: 60_000 };
  return { key: `${ip}:global`, limit: 600, windowMs: 60_000 };
}

fastify.addHook('onRequest', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (config.app.nodeEnv === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const { key, limit, windowMs } = rateLimitFor(request.ip, request.url);
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return reply.code(429).send({ success: false, error: 'Terlalu banyak request. Silakan coba lagi nanti.' });
  }
});

async function bootstrap() {
  // CORS & Multi-part upload setup.
  // Restrict to configured browser origins (CORS_ORIGINS) since credentials are allowed.
  // Non-browser callers (no Origin header, e.g. server-to-server SSO, curl) are permitted.
  const allowedOrigins = expandDevelopmentLoopbackOrigins(
    config.cors.origins,
    config.app.nodeEnv,
  );
  await fastify.register(cors, {
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      console.error(`[CORS REJECTED] Origin tidak diizinkan: "${origin}". Allowed origins:`, Array.from(allowedOrigins));
      cb(new Error('Origin tidak diizinkan'), false);
    },
    credentials: true,
  });
  await fastify.register(multipart, {
    limits: { fileSize: config.upload.maxSizeMB * 1024 * 1024 },
  });

  // JWT & Custom Auth Middlewares
  await fastify.register(jwtPlugin);
  await fastify.register(authPlugin);

  /*
   * ─── File unggahan ────────────────────────────────────────────────────────
   * Dulu folder ini disajikan sebagai static publik, sehingga siapa pun yang
   * tahu path-nya bisa mengunduh kuitansi/laporan dinas tanpa login. Sekarang
   * @fastify/static hanya dipakai sebagai mesin `sendFile` (serve: false) dan
   * setiap permintaan wajib lewat autentikasi + cek hak baca atas BTO terkait.
   * Struktur path: <bto|bte>/<btoId>/<namaFile>
   */
  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
    serve: false,
  });

  fastify.get('/uploads/*', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const relativePath = (req.params as Record<string, string>)['*'] ?? '';
    const decoded = decodeURIComponent(relativePath);

    // Cegah path traversal: hasil resolve wajib tetap di dalam uploadDir.
    const absolute = path.resolve(uploadDir, decoded);
    const rootWithSep = uploadDir.endsWith(path.sep) ? uploadDir : uploadDir + path.sep;
    if (!absolute.startsWith(rootWithSep)) {
      return reply.status(400).send({ success: false, error: 'Path tidak valid' });
    }

    const segments = decoded.split('/').filter(Boolean);
    const scope = segments[0];
    const btoId = segments[1];
    if ((scope === 'bto' || scope === 'bte') && btoId) {
      const allowed = await findAccessibleBto(btoId, {
        id: req.user.sub,
        employeeId: req.user.employeeId,
        role: req.user.role,
      });
      if (!allowed) {
        return reply.status(404).send({ success: false, error: 'Berkas tidak ditemukan' });
      }
    } else if (!actorIsAdminOrSdm({ id: req.user.sub, role: req.user.role })) {
      // Berkas di luar struktur dinas (mis. aset lama) hanya untuk admin/SDM.
      return reply.status(403).send({ success: false, error: 'Tidak berhak mengakses berkas ini' });
    }

    return reply.sendFile(decoded);
  });

  // ─── Route Declarations ─────────────────────────────────────────────────────
  await fastify.register(ssoRoutes, { prefix: '/api/auth' });
  await fastify.register(masterRoutes, { prefix: '/api/master' });
  await fastify.register(configRoutes, { prefix: '/api/config' });
  await fastify.register(btoRoutes, { prefix: '/api/bto' });
  await fastify.register(dpRoutes, { prefix: '/api/dp' });
  await fastify.register(spdkRoutes, { prefix: '/api/spdk' });
  await fastify.register(bteRoutes, { prefix: '/api/bte' });
  await fastify.register(documentRoutes, { prefix: '/api/documents' });
  await fastify.register(documentRoutes, { prefix: '/api/document' });
  await fastify.register(meetingRoutes, { prefix: '/api/meeting' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await fastify.register(portalUserRoutes, { prefix: '/api/portal/users' });

  // ─── Health check ───────────────────────────────────────────────────────────
  const healthPayload = () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    name: 'MeeTrip API',
    version: '1.0.0',
  });

  fastify.get('/', async () => healthPayload());
  fastify.get('/health', async () => healthPayload());

  return fastify;
}

bootstrap()
  .then((app) => app.listen({ port: config.app.port, host: config.app.host }))
  .then(() => {
    console.log(`\n🚀 MeeTrip API running on http://${config.app.host}:${config.app.port}`);
    console.log(`📁 Uploaded files: ${config.upload.url}`);
    console.log(`🔑 Health check: http://localhost:${config.app.port}/health\n`);
  })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
