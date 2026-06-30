// ─── Routes: Dashboard & Excel Export ─────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { bto, bte, spdk, meeting } from '../db/schema';
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

    const [totalBtoRow] = await db.select({ count: sql<number>`count(*)` }).from(bto);
    const [draftBtoRow] = await db.select({ count: sql<number>`count(*)` }).from(bto).where(sql`status IN ('DRAFT', 'REVISION_DP')`);
    const [activeBtoRow] = await db.select({ count: sql<number>`count(*)` }).from(bto).where(sql`status IN ('ACTIVE', 'ATTENDED', 'REPORT_UPLOADED')`);
    const [completedBtoRow] = await db.select({ count: sql<number>`count(*)` }).from(bto).where(eq(bto.status, 'COMPLETED'));

    const [totalMeetingsRow] = await db.select({ count: sql<number>`count(*)` }).from(meeting);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const [meetingsTodayRow] = await db.select({ count: sql<number>`count(*)` }).from(meeting).where(and(
      lte(meeting.mulai, endOfToday),
      gte(meeting.selesai, startOfToday)
    ));

    return reply.send(ok({
      currentlyOnTrip: Number(activeTripsRow.count),
      pendingBtoApproval: Number(pendingBtoRow.count),
      pendingBteApproval: Number(pendingBteRow.count),
      pendingBtePayment: Number(pendingPaymentRow.count),
      totalBto: Number(totalBtoRow.count),
      draftBto: Number(draftBtoRow.count),
      activeBto: Number(activeBtoRow.count),
      completedBto: Number(completedBtoRow.count),
      totalMeetings: Number(totalMeetingsRow.count),
      meetingsToday: Number(meetingsTodayRow.count),
    }));
  });

  /** GET /api/dashboard/karyawan-dinas — List karyawan yang sedang/akan dinas pada range tanggal tertentu */
  fastify.get('/karyawan-dinas', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const q = req.query as { dateFrom?: string; dateTo?: string };
    const dateFrom = q.dateFrom ? new Date(q.dateFrom) : new Date();
    dateFrom.setHours(0,0,0,0);
    const dateTo = q.dateTo ? new Date(q.dateTo) : new Date();
    dateTo.setHours(23,59,59,999);

    const rows = await db
      .select({
        id: bto.id,
        nomorBto: bto.nomorBto,
        employeeNama: bto.employeeNama,
        tujuanNama: bto.tujuanNama,
        estBerangkat: bto.estBerangkat,
        estKembali: bto.estKembali,
        status: bto.status,
        wilayahTipe: bto.wilayahTipe,
      })
      .from(bto)
      .where(and(
        lte(bto.estBerangkat, dateTo),
        gte(bto.estKembali, dateFrom),
        sql`status IN ('ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'COMPLETED')`
      ))
      .orderBy(desc(bto.estBerangkat));

    return reply.send(ok(rows));
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
