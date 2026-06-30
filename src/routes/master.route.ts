// ─── Routes: Master Data CRUD ─────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { refTransport, refRincianBiaya, refPagu, refRuangMeeting, configSistem } from '../db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { config } from '../config/env';

// ─── Zod Schemas for validation ──────────────────────────────────────────────
const gradeSchema = z.object({
  kode: z.string().min(1),
  label: z.string().min(1),
  level: z.number().int().min(0),
  keterangan: z.string().optional(),
});

const transportSchema = z.object({
  kode: z.string().min(1),
  label: z.string().min(1),
  tipe: z.string().min(1),
  isActive: z.boolean().default(true),
});

const rincianBiayaSchema = z.object({
  kode: z.string().min(1),
  label: z.string().min(1),
  hasPagu: z.boolean().default(true),
  perMalam: z.boolean().default(false),
  useDollarOverride: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const paguSchema = z.object({
  rincianId: z.string().uuid(),
  gradeId: z.string().uuid(),
  wilayahTipe: z.enum(['dalam_wilayah', 'luar_wilayah', 'luar_negeri']),
  nilai: z.number().min(0),
  useDollar: z.boolean().default(false),
  isUnlimited: z.boolean().default(false),
  berlakuDari: z.string().optional().nullable(),
  berlakuSampai: z.string().optional().nullable(),
});

const ruangMeetingSchema = z.object({
  nama: z.string().min(1),
  lokasi: z.string().optional(),
  kapasitas: z.number().int().min(0),
  hasSoundSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const listQuerySchema = z.object({
  includeInactive: z.enum(['1', 'true']).optional(),
});

export default async function masterRoutes(fastify: FastifyInstance) {

  // ─── ref_grade CRUD (Dikelola oleh Portal SSO) ──────────────────────────────
  fastify.get('/ref-grade', { preHandler: [fastify.authenticate] }, async () => {
    try {
      const res = await fetch(`${config.portal.apiUrl}/api/sso/grades`, {
        headers: { 'x-internal': '1' },
      });
      if (res.ok) {
        const body = await res.json() as { data: any[] };
        const rows = body.data ?? [];
        return ok(rows);
      }
    } catch (err) {
      fastify.log.error(err, 'Gagal mengambil grade dari Portal SSO');
    }
    return ok([]);
  });

  fastify.post('/ref-grade', { preHandler: [fastify.authenticateAdmin] }, async () => {
    throw new AppError('Master Data Grade dikelola secara terpusat oleh Portal SSO', 403);
  });

  fastify.put('/ref-grade/:id', { preHandler: [fastify.authenticateAdmin] }, async () => {
    throw new AppError('Master Data Grade dikelola secara terpusat oleh Portal SSO', 403);
  });

  fastify.delete('/ref-grade/:id', { preHandler: [fastify.authenticateAdmin] }, async () => {
    throw new AppError('Master Data Grade dikelola secara terpusat oleh Portal SSO', 403);
  });

  // ─── ref_transport CRUD ────────────────────────────────────────────────────
  fastify.get('/ref-transport', { preHandler: [fastify.authenticate] }, async (req) => {
    const query = listQuerySchema.parse(req.query);
    const rows = query.includeInactive
      ? await db.select().from(refTransport).orderBy(asc(refTransport.label))
      : await db.select().from(refTransport).where(eq(refTransport.isActive, true)).orderBy(asc(refTransport.label));
    return ok(rows);
  });

  fastify.post('/ref-transport', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const data = transportSchema.parse(req.body);
    const [inserted] = await db.insert(refTransport).values(data).returning();
    return reply.status(201).send(ok(inserted));
  });

  fastify.put('/ref-transport/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const data = transportSchema.parse(req.body);
    const [updated] = await db.update(refTransport).set(data).where(eq(refTransport.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  fastify.delete('/ref-transport/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const [updated] = await db.update(refTransport).set({ isActive: false }).where(eq(refTransport.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  // ─── ref_rincian_biaya CRUD ───────────────────────────────────────────────
  fastify.get('/ref-rincian-biaya', { preHandler: [fastify.authenticate] }, async () => {
    const rows = await db.select().from(refRincianBiaya);
    return ok(rows);
  });

  fastify.post('/ref-rincian-biaya', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const data = rincianBiayaSchema.parse(req.body);
    const [inserted] = await db.insert(refRincianBiaya).values(data).returning();
    return reply.status(201).send(ok(inserted));
  });

  fastify.put('/ref-rincian-biaya/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const data = rincianBiayaSchema.parse(req.body);
    const [updated] = await db.update(refRincianBiaya).set(data).where(eq(refRincianBiaya.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  // ─── ref_pagu CRUD ─────────────────────────────────────────────────────────
  fastify.get('/ref-pagu', { preHandler: [fastify.authenticate] }, async () => {
    const rows = await db.select().from(refPagu);
    return ok(rows);
  });

  fastify.post('/ref-pagu', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const data = paguSchema.parse(req.body);
    const [inserted] = await db.insert(refPagu).values({
      ...data,
      nilai: String(data.nilai),
    }).returning();
    return reply.status(201).send(ok(inserted));
  });

  fastify.put('/ref-pagu/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const data = paguSchema.parse(req.body);
    const [updated] = await db.update(refPagu).set({
      ...data,
      nilai: String(data.nilai),
    }).where(eq(refPagu.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  fastify.delete('/ref-pagu/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const [deleted] = await db.delete(refPagu).where(eq(refPagu.id, id)).returning();
    if (!deleted) throw new AppError('Data tidak ditemukan', 404);
    return ok(deleted);
  });

  // ─── ref_ruang_meeting CRUD ───────────────────────────────────────────────
  fastify.get('/ref-ruang-meeting', { preHandler: [fastify.authenticate] }, async (req) => {
    const query = listQuerySchema.parse(req.query);
    const rows = query.includeInactive
      ? await db.select().from(refRuangMeeting).orderBy(asc(refRuangMeeting.nama))
      : await db.select().from(refRuangMeeting).where(eq(refRuangMeeting.isActive, true)).orderBy(asc(refRuangMeeting.nama));
    return ok(rows);
  });

  fastify.post('/ref-ruang-meeting', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const data = ruangMeetingSchema.parse(req.body);
    const [inserted] = await db.insert(refRuangMeeting).values(data).returning();
    return reply.status(201).send(ok(inserted));
  });

  fastify.put('/ref-ruang-meeting/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const data = ruangMeetingSchema.parse(req.body);
    const [updated] = await db.update(refRuangMeeting).set(data).where(eq(refRuangMeeting.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  fastify.delete('/ref-ruang-meeting/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const [updated] = await db.update(refRuangMeeting).set({ isActive: false }).where(eq(refRuangMeeting.id, id)).returning();
    if (!updated) throw new AppError('Data tidak ditemukan', 404);
    return ok(updated);
  });

  // ─── config_sistem (radius, dll) ──────────────────────────────────────────
  fastify.get('/config-sistem', { preHandler: [fastify.authenticate] }, async () => {
    const rows = await db.select().from(configSistem);
    return ok(rows);
  });

  fastify.put('/config-sistem', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { key, value } = z.object({ key: z.string(), value: z.string() }).parse(req.body);
    const [updated] = await db.update(configSistem).set({ nilai: value, updatedAt: new Date() }).where(eq(configSistem.kunci, key)).returning();
    if (!updated) {
      const [inserted] = await db.insert(configSistem).values({ kunci: key, nilai: value }).returning();
      return ok(inserted);
    }
    return ok(updated);
  });
}
