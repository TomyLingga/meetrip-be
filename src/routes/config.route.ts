// ─── Routes: Config Pemberi Tugas & Approver SPDK ───────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { configPemberiTugas, configApproverSpdk } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';

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
}
