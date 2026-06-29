// ─── Routes: BTE (Business Trip Expense) ────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getBteByBtoIdService, createOrUpdateBteService, submitBteService, adminApproveBteService, markBtePaidService } from '../services/bte.service';
import { db } from '../db/connection';
import { bte, bteApprovalLog, bto } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';

const bteUpsertSchema = z.object({
  tglBerangkat: z.string().optional(),
  jamBerangkat: z.string().optional(),
  tglKembali: z.string().optional(),
  jamKembali: z.string().optional(),
  exchangeRateUsd: z.number().optional(),
  rincian: z.array(
    z.object({
      rincianId: z.string().uuid(),
      rincianLabel: z.string().optional(),
      jumlahHari: z.number().int().min(1),
      nilaiPerHari: z.number().min(0),
      nilaiTotal: z.number().min(0),
      useDollar: z.boolean(),
      nilaiUsd: z.number().optional(),
      paguSaatInput: z.number().optional(),
      isUnlimited: z.boolean().optional(),
      catatan: z.string().optional(),
    })
  ),
  biayaLain: z.array(
    z.object({
      keterangan: z.string().min(1),
      nilai: z.number().min(0),
      useDollar: z.boolean(),
      nilaiUsd: z.number().optional(),
    })
  ).optional(),
});

export default async function bteRoutes(fastify: FastifyInstance) {

  /** GET /api/bte/bto/:btoId — Dapatkan BTE */
  fastify.get('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const result = await getBteByBtoIdService(btoId);
    return reply.send(ok(result));
  });

  /** POST /api/bte/bto/:btoId — Create/Update BTE */
  fastify.post('/bto/:btoId', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const data = bteUpsertSchema.parse(req.body);
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    const result = await createOrUpdateBteService(btoId, actor, {
      ...data,
      tglBerangkat: data.tglBerangkat ? new Date(data.tglBerangkat) : undefined,
      tglKembali: data.tglKembali ? new Date(data.tglKembali) : undefined,
    });
    return reply.send(ok(result));
  });

  /** POST /api/bte/bto/:btoId/upload-laporan — Upload PDF Laporan Perjalanan Dinas */
  fastify.post('/bto/:btoId/upload-laporan', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const data = await req.file();
    if (!data) throw new AppError('File laporan tidak ditemukan', 400);

    const uploadDir = path.resolve(config.upload.dir, 'bte', btoId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(data.filename);
    if (ext.toLowerCase() !== '.pdf') {
      throw new AppError('Laporan harus berupa file PDF', 400);
    }
    const filename = `laporan_${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath);
      data.file.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    const fileRelativePath = `bte/${btoId}/${filename}`;
    
    // Find or create BTE first
    let bteRow = await db.query.bte.findFirst({ where: eq(bte.btoId, btoId) });
    if (!bteRow) {
      const [inserted] = await db.insert(bte).values({
        btoId,
        status: 'DRAFT',
        laporanPath: fileRelativePath,
        laporanNama: data.filename,
      }).returning();
      bteRow = inserted;
    } else {
      await db.update(bte).set({
        laporanPath: fileRelativePath,
        laporanNama: data.filename,
        updatedAt: new Date(),
      }).where(eq(bte.id, bteRow.id));
    }

    // Update BTO status to REPORT_UPLOADED if BTO is currently ATTENDED
    const [btoRow] = await db.select().from(bto).where(eq(bto.id, btoId)).limit(1);
    if (btoRow && btoRow.status === 'ATTENDED') {
      await db.update(bto).set({ status: 'REPORT_UPLOADED', updatedAt: new Date() }).where(eq(bto.id, btoId));
    }

    return reply.send(ok({ path: fileRelativePath, nama: data.filename }));
  });

  /** POST /api/bte/bto/:btoId/upload-kuitansi — Upload Scan Kuitansi (1 PDF/image) */
  fastify.post('/bto/:btoId/upload-kuitansi', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { btoId } = req.params as { btoId: string };
    const data = await req.file();
    if (!data) throw new AppError('File kuitansi tidak ditemukan', 400);

    const uploadDir = path.resolve(config.upload.dir, 'bte', btoId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(data.filename);
    const filename = `kuitansi_${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(filepath);
      data.file.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    const fileRelativePath = `bte/${btoId}/${filename}`;
    
    let bteRow = await db.query.bte.findFirst({ where: eq(bte.btoId, btoId) });
    if (!bteRow) {
      const [inserted] = await db.insert(bte).values({
        btoId,
        status: 'DRAFT',
        kuitansiPath: fileRelativePath,
        kuitansiNama: data.filename,
      }).returning();
      bteRow = inserted;
    } else {
      await db.update(bte).set({
        kuitansiPath: fileRelativePath,
        kuitansiNama: data.filename,
        updatedAt: new Date(),
      }).where(eq(bte.id, bteRow.id));
    }

    return reply.send(ok({ path: fileRelativePath, nama: data.filename }));
  });

  /** POST /api/bte/:id/submit — Submit BTE */
  fastify.post('/:id/submit', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    await submitBteService(id, actor);
    return reply.send(ok({ message: 'BTE diajukan' }));
  });

  /** POST /api/bte/:id/approve — Admin Approve/Reject/Revision BTE */
  fastify.post('/:id/approve', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { aksi, catatan } = z.object({
      aksi: z.enum(['approve', 'reject', 'revision']),
      catatan: z.string().optional(),
    }).parse(req.body);
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    const result = await adminApproveBteService(id, aksi, actor, catatan);
    return reply.send(ok(result));
  });

  /** POST /api/bte/:id/mark-paid — Admin mark paid */
  fastify.post('/:id/mark-paid', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = { id: req.user.sub, nama: req.user.nama || '' };
    await markBtePaidService(id, actor);
    return reply.send(ok({ message: 'Pembayaran terkonfirmasi' }));
  });

  /** GET /api/bte/:id/logs — Get BTE logs */
  fastify.get('/:id/logs', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db.select().from(bteApprovalLog).where(eq(bteApprovalLog.bteId, id));
    return reply.send(ok(rows));
  });
}
