// ─── Routes: Config Pemberi Tugas & Approver SPDK ───────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { configPemberiTugas, configApproverSpdk, meetripUserRole, localUserCache } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { config } from '../config/env';

const ptConfigSchema = z.object({
  mode: z.enum(['grade_based', 'fixed_person']),
  fixedEmployeeId: z.string().nullable().optional(),
  minGradeLevel: z.number().int().nullable().optional(),
  keterangan: z.string().optional(),
});

const spdkConfigSchema = z.object({
  mode: z.enum(['fixed_person', 'unit_head']),
  fixedEmployeeId: z.string().nullable().optional(),
  keterangan: z.string().optional(),
});

const userRoleSchema = z.object({
  portalUserId: z.string().min(1),
  role: z.enum(['admin', 'sdm']),
});

export default async function configRoutes(fastify: FastifyInstance) {

  // ─── Pemberi Tugas Config ──────────────────────────────────────────────────
  fastify.get('/pemberi-tugas', { preHandler: [fastify.authenticate] }, async () => {
    const [row] = await db.select().from(configPemberiTugas).where(eq(configPemberiTugas.isActive, true)).limit(1);
    return ok(row || null);
  });

  fastify.put('/pemberi-tugas', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const data = ptConfigSchema.parse(req.body);
    const [row] = await db.select().from(configPemberiTugas).where(eq(configPemberiTugas.isActive, true)).limit(1);

    const values = {
      mode: data.mode,
      fixedEmployeeId: data.fixedEmployeeId ?? null,
      minGradeLevel: data.minGradeLevel ?? null,
      keterangan: data.keterangan,
      updatedAt: new Date(),
    };

    if (!row) {
      const [inserted] = await db.insert(configPemberiTugas).values({
        ...values,
        isActive: true,
      }).returning();
      return ok(inserted);
    }

    const [updated] = await db.update(configPemberiTugas).set(values).where(eq(configPemberiTugas.id, row.id)).returning();
    return ok(updated);
  });

  // ─── Approver SPDK Config ──────────────────────────────────────────────────
  fastify.get('/approver-spdk', { preHandler: [fastify.authenticate] }, async () => {
    const [row] = await db.select().from(configApproverSpdk).where(eq(configApproverSpdk.isActive, true)).limit(1);
    return ok(row || null);
  });

  fastify.put('/approver-spdk', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const data = spdkConfigSchema.parse(req.body);
    const [row] = await db.select().from(configApproverSpdk).where(eq(configApproverSpdk.isActive, true)).limit(1);

    const values = {
      mode: data.mode,
      fixedEmployeeId: data.fixedEmployeeId ?? null,
      keterangan: data.keterangan,
      updatedAt: new Date(),
    };

    if (!row) {
      const [inserted] = await db.insert(configApproverSpdk).values({
        ...values,
        isActive: true,
      }).returning();
      return ok(inserted);
    }

    const [updated] = await db.update(configApproverSpdk).set(values).where(eq(configApproverSpdk.id, row.id)).returning();
    return ok(updated);
  });

  // ─── MeeTrip User Role Management ──────────────────────────────────────────
  /** GET /api/config/users-role — List all custom roles */
  fastify.get('/users-role', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const rows = await db.select().from(meetripUserRole);

    // Fetch local user caches as fallback
    const caches = await db.select().from(localUserCache);
    const cacheMap = new Map(caches.map(c => [c.portalUserId, c]));

    // Fetch employee data from portal to get current names, emails, and positions (jabatans)
    const portalUrl = `${config.portal.apiUrl}/api/sso/employees?limit=500`;
    let employees: any[] = [];
    try {
      const res = await fetch(portalUrl, {
        headers: { 'x-internal': config.portal.internalToken },
      });
      if (res.ok) {
        const body = await res.json() as { data: any[] };
        employees = body.data ?? [];
      }
    } catch (err) {
      fastify.log.warn({ err }, 'Gagal mengambil data employee dari portal di users-role');
    }

    const employeeMap = new Map(employees.map(e => [e.id, e]));

    const result = rows.map(r => {
      const emp = employeeMap.get(r.portalUserId);
      const cache = cacheMap.get(r.portalUserId);
      return {
        id: r.id,
        portalUserId: r.portalUserId,
        role: r.role,
        createdAt: r.createdAt,
        nama: emp?.namaLengkap ?? cache?.nama ?? null,
        email: emp?.email ?? cache?.email ?? null,
        jabatan: emp?.jabatan ?? null,
      };
    });

    return ok(result);
  });

  /** POST /api/config/users-role — Upsert custom user role */
  fastify.post('/users-role', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { portalUserId, role } = userRoleSchema.parse(req.body);
    const [existing] = await db.select().from(meetripUserRole).where(eq(meetripUserRole.portalUserId, portalUserId)).limit(1);

    if (existing) {
      const [updated] = await db.update(meetripUserRole)
        .set({ role, updatedAt: new Date() })
        .where(eq(meetripUserRole.id, existing.id))
        .returning();
      return reply.send(ok(updated));
    }

    const [inserted] = await db.insert(meetripUserRole).values({ portalUserId, role }).returning();
    return reply.status(201).send(ok(inserted));
  });

  /** DELETE /api/config/users-role/:portalUserId — Remove custom user role */
  fastify.delete('/users-role/:portalUserId', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { portalUserId } = req.params as { portalUserId: string };
    const [deleted] = await db.delete(meetripUserRole).where(eq(meetripUserRole.portalUserId, portalUserId)).returning();
    if (!deleted) throw new AppError('Role tidak ditemukan untuk user ini', 404);
    return reply.send(ok({ message: 'Role berhasil dihapus, user kembali menjadi role default' }));
  });
}
