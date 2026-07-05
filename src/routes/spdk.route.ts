// ─── Routes: SPDK & Attend Stamp ─────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { issueSpdkService, kabagApproveSpdkService, attendStampService, updateSpdkService } from '../services/spdk.service';

import { db } from '../db/connection';
import { spdk, spdkApprovalLog } from '../db/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { ok, paginated } from '../utils/response';
import { AppError } from '../utils/errorHandler';

const attendSchema = z.object({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  isAdminOverride: z.boolean().default(false),
});

export default async function spdkRoutes(fastify: FastifyInstance) {
  
  /** POST /api/spdk/bto/:btoId — Issue SPDK (Admin only) */
  fastify.post('/bto/:btoId', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const { catatanAdmin, nomorSpdk, btoUpdateData } = z.object({
      catatanAdmin: z.string().optional(),
      nomorSpdk: z.string().optional(),
      btoUpdateData: z.any().optional(),
    }).parse(req.body);
    const actor = { id: req.user.sub, employeeId: req.user.employeeId, nama: req.user.nama || '' };
    const result = await issueSpdkService(btoId, actor, catatanAdmin, nomorSpdk, btoUpdateData);
    return reply.status(201).send(ok(result));
  });

  /** GET /api/spdk — List SPDK (Admin/SDM) */
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as any;
    const page = Number(q.page || 1);
    const limit = Number(q.limit || 20);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (q.status) conditions.push(eq(spdk.status, q.status));
    if (q.dateFrom) conditions.push(gte(spdk.createdAt, new Date(q.dateFrom)));
    if (q.dateTo) conditions.push(lte(spdk.createdAt, new Date(q.dateTo)));

    const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(spdk)
      .where(conditions.length ? and(...conditions) : undefined);

    const rows = await db.select().from(spdk)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(spdk.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send(paginated(rows, page, limit, Number(totalRow.count)));
  });

  /** GET /api/spdk/bto/:btoId — Get SPDK by BTO ID */
  fastify.get('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const [row] = await db.select().from(spdk).where(eq(spdk.btoId, btoId)).limit(1);
    if (!row) throw new AppError('SPDK tidak ditemukan', 404);
    return reply.send(ok(row));
  });

  /** GET /api/spdk/:id — Detail SPDK */
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(spdk).where(eq(spdk.id, id)).limit(1);
    if (!row) throw new AppError('SPDK tidak ditemukan', 404);

    const logs = await db.select().from(spdkApprovalLog).where(eq(spdkApprovalLog.spdkId, id));
    return reply.send(ok({ ...row, approvalLogs: logs }));
  });

  /** PUT /api/spdk/:id — Update SPDK (Admin only) */
  fastify.put('/:id', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { nomorSpdk, catatanAdmin } = z.object({
      nomorSpdk: z.string().optional(),
      catatanAdmin: z.string().optional(),
    }).parse(req.body);
    
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role || '');
    const result = await updateSpdkService(id, isAdmin, { nomorSpdk, catatanAdmin });
    return reply.send(ok(result));
  });

  /** POST /api/spdk/:id/approve-kabag — Approve Kabag */
  fastify.post('/:id/approve-kabag', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { aksi, catatan } = z.object({
      aksi: z.enum(['approve', 'reject']),
      catatan: z.string().optional()
    }).parse(req.body);
    
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    const isAdmin = ['super_admin', 'admin'].includes(req.user.role || '');
    const result = await kabagApproveSpdkService(id, aksi, actor, isAdmin, catatan);
    return reply.send(ok(result));
  });

  /** POST /api/spdk/bto/:btoId/attend — Attend stamp */
  fastify.post('/bto/:btoId/attend', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const { latitude, longitude, isAdminOverride } = attendSchema.parse(req.body);
    const userRole = req.user.role || '';
    
    if (isAdminOverride && !['super_admin', 'admin'].includes(userRole)) {
      throw new AppError('Hanya admin yang bisa melakukan override stamp', 403);
    }

    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    const isAdmin = ['super_admin', 'admin'].includes(userRole);
    const result = await attendStampService(btoId, actor, latitude, longitude, isAdminOverride, isAdmin);
    return reply.send(ok(result));
  });
}
