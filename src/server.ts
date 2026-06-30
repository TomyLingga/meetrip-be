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

async function bootstrap() {
  // CORS & Multi-part upload setup
  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(multipart, {
    limits: { fileSize: config.upload.maxSizeMB * 1024 * 1024 },
  });

  // Serve static files (Uploaded documents)
  await fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
  });

  // JWT & Custom Auth Middlewares
  await fastify.register(jwtPlugin);
  await fastify.register(authPlugin);

  // ─── Route Declarations ─────────────────────────────────────────────────────
  await fastify.register(ssoRoutes, { prefix: '/api/auth' });
  await fastify.register(masterRoutes, { prefix: '/api/master' });
  await fastify.register(configRoutes, { prefix: '/api/config' });
  await fastify.register(btoRoutes, { prefix: '/api/bto' });
  await fastify.register(dpRoutes, { prefix: '/api/dp' });
  await fastify.register(spdkRoutes, { prefix: '/api/spdk' });
  await fastify.register(bteRoutes, { prefix: '/api/bte' });
  await fastify.register(meetingRoutes, { prefix: '/api/meeting' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await fastify.register(portalUserRoutes, { prefix: '/api/portal/users' });

  // ─── Health check ───────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    name: 'MeeTrip API',
    version: '1.0.0',
  }));

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
