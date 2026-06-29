// ─── Routes: Dashboard & Excel Export ─────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { bto, bte, spdk } from '../db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { exportBtoExcelService } from '../services/export.service';

export default async function dashboardRoutes(fastify: FastifyInstance) {

  /** GET /api/dashboard/summary — Dashboard summary widgets */
  fastify.get('/summary', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    // 1. Karyawan yang sedang dinas (BTO status = ACTIVE atau ATTENDED)
    const [activeTripsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bto)
      .where(and(
        gte(bto.estKembali, new Date()),
        sql`status IN ('ACTIVE', 'ATTENDED')`
      ));

    // 2. Pending BTO approvals (BTO status = ADMIN_DP_REVIEW atau PT_REVIEW atau SDM_REVIEW)
    const [pendingBtoRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bto)
      .where(sql`status IN ('ADMIN_DP_REVIEW', 'PT_REVIEW', 'SDM_REVIEW')`);

    // 3. Pending BTE approvals (BTE status = SUBMITTED)
    const [pendingBteRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bte)
      .where(eq(bte.status, 'SUBMITTED'));

    // 4. Menunggu pencairan BTE (BTE status = PENDING_PAYMENT)
    const [pendingPaymentRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bte)
      .where(eq(bte.status, 'PENDING_PAYMENT'));

    return reply.send(ok({
      currentlyOnTrip: Number(activeTripsRow.count),
      pendingBtoApproval: Number(pendingBtoRow.count),
      pendingBteApproval: Number(pendingBteRow.count),
      pendingBtePayment: Number(pendingPaymentRow.count),
    }));
  });

  /** GET /api/dashboard/proyeksi-biaya — Total biaya perjalanan dinas yang direncanakan */
  fastify.get('/proyeksi-biaya', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    // Sum total_idr dari BTO yang berstatus DP APPROVED atau diajukan (rencana awal)
    // Kita bisa ambil sum total_idr dari table dp di mana BTO belum selesai
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(total_idr), 0) AS total FROM dp 
          INNER JOIN bto ON dp.bto_id = bto.id 
          WHERE bto.status NOT IN ('COMPLETED', 'REJECTED')`
    );
    const total = Number((result.rows[0] as any).total);
    return reply.send(ok({ proyeksiBiayaIdr: total }));
  });

  /** GET /api/dashboard/realisasi-biaya — Total biaya perjalanan dinas terealisasi */
  fastify.get('/realisasi-biaya', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    // Sum total_idr dari BTE yang berstatus PAID atau APPROVED
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(total_idr), 0) AS total FROM bte 
          WHERE status IN ('APPROVED', 'PAID')`
    );
    const total = Number((result.rows[0] as any).total);
    return reply.send(ok({ realisasiBiayaIdr: total }));
  });

  /** GET /api/dashboard/export-excel — Download Excel */
  fastify.get('/export-excel', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const q = req.query as any;
    const dateFrom = q.dateFrom ? new Date(q.dateFrom) : undefined;
    const dateTo = q.dateTo ? new Date(q.dateTo) : undefined;
    const status = q.status || undefined;

    const buffer = await exportBtoExcelService({ dateFrom, dateTo, status });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="Laporan_MeeTrip_' + Date.now() + '.xlsx"');
    return reply.send(buffer);
  });
}
