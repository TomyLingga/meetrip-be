// ─── Routes: Dashboard & Excel Export ─────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/connection';
import { bto, bte, dp, spdk, meeting } from '../db/schema';
import { eq, and, gte, lte, lt, desc, sql, inArray } from 'drizzle-orm';
import { ok } from '../utils/response';
import { AppError } from '../utils/errorHandler';
import { exportBtoExcelService } from '../services/export.service';
import { listBtoApprovalsService } from '../services/bto.service';
import { getDashboardAnalytics, getDashboardOverview } from '../services/dashboard.service';

export default async function dashboardRoutes(fastify: FastifyInstance) {

  fastify.get('/overview', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const query = z.object({
      context: z.enum(['company', 'employee', 'assigner', 'kabag']).optional(),
    }).parse(req.query);
    const data = await getDashboardOverview({
      id: req.user.sub,
      employeeId: req.user.employeeId,
      role: req.user.role,
      nama: req.user.nama,
    }, query.context);
    return reply.send(ok(data));
  });

  fastify.get('/analytics-v2', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const now = new Date();
    const query = z.object({
      context: z.enum(['company', 'employee', 'assigner', 'kabag']).optional(),
      year: z.coerce.number().int().min(2020).max(2100).default(now.getFullYear()),
      month: z.coerce.number().int().min(1).max(12).default(now.getMonth() + 1),
    }).parse(req.query);
    const data = await getDashboardAnalytics({
      id: req.user.sub,
      employeeId: req.user.employeeId,
      role: req.user.role,
      nama: req.user.nama,
    }, query.context, query.year, query.month);
    return reply.send(ok(data));
  });

  /** GET /api/dashboard/summary — Dashboard summary widgets */
  /*
   * Endpoint agregat berikut mengembalikan angka lingkup PERUSAHAAN (total dinas,
   * proyeksi & realisasi biaya, sebaran status seluruh organisasi). Sebelumnya
   * hanya `authenticate`, sehingga setiap karyawan bisa membaca belanja dinas
   * perusahaan. Dashboard per-karyawan memakai /overview dan /analytics-v2 yang
   * sudah men-scope hasil sesuai cakupan (company/employee/assigner/kabag).
   */
  fastify.get('/summary', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const query = z.object({
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    }).parse(req.query);
    const now = new Date();
    const analyticsYear = query.year ?? now.getFullYear();
    const analyticsMonth = query.month ?? now.getMonth() + 1;
    const analyticsStart = new Date(analyticsYear, analyticsMonth - 1, 1);
    const analyticsEnd = new Date(analyticsYear, analyticsMonth, 1);
    const actorId = req.user.sub;
    const myDraftStatuses = ['DRAFT', 'REVISION_DP', 'REVISION_BTE'] as const;
    const myActiveStatuses = [
      'SUBMITTED', 'ADMIN_DP_REVIEW', 'PT_REVIEW', 'SDM_REVIEW', 'SPDK_DRAFT', 'KABAG_REVIEW',
      'ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT', 'ADMIN_BTE_REVIEW', 'BTE_PAYMENT',
    ] as const;

    const startOfTodayForTrip = new Date();
    startOfTodayForTrip.setHours(0, 0, 0, 0);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [
      [activeTripsRow],
      [pendingBtoRow],
      [pendingBteRow],
      [pendingPaymentRow],
      [totalBtoRow],
      [draftBtoRow],
      [activeBtoRow],
      [completedBtoRow],
      [totalMeetingsRow],
      [meetingsTodayRow],
      [myDraftRow],
      [myActiveRow],
      [myCompletedRow],
      [myRejectedRow],
      [myPemberiTugasRow],
      myUpcomingTrips,
      myApprovals,
      orgStatusRows,
      monthlyRows
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(bto).where(and(gte(bto.estKembali, new Date()), sql`status IN ('ACTIVE', 'ATTENDED')`)),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(sql`status IN ('ADMIN_DP_REVIEW', 'PT_REVIEW', 'SDM_REVIEW')`),
      db.select({ count: sql<number>`count(*)` }).from(bte).where(sql`status IN ('ADMIN_REVIEW', 'SUBMITTED')`),
      db.select({ count: sql<number>`count(*)` }).from(bte).where(eq(bte.status, 'PENDING_PAYMENT')),
      db.select({ count: sql<number>`count(*)` }).from(bto),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(sql`status IN ('DRAFT', 'REVISION_DP')`),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(sql`status IN ('ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT')`),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(eq(bto.status, 'COMPLETED')),
      db.select({ count: sql<number>`count(*)` }).from(meeting),
      db.select({ count: sql<number>`count(*)` }).from(meeting).where(and(lte(meeting.mulai, endOfToday), gte(meeting.selesai, startOfToday))),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(and(eq(bto.employeeId, actorId), inArray(bto.status, myDraftStatuses as any))),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(and(eq(bto.employeeId, actorId), inArray(bto.status, myActiveStatuses as any))),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(and(eq(bto.employeeId, actorId), eq(bto.status, 'COMPLETED'))),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(and(eq(bto.employeeId, actorId), eq(bto.status, 'REJECTED'))),
      db.select({ count: sql<number>`count(*)` }).from(bto).where(eq(bto.pemberiTugasId, actorId)),
      db.select({ id: bto.id, nomorBto: bto.nomorBto, tujuanNama: bto.tujuanNama, estBerangkat: bto.estBerangkat, estKembali: bto.estKembali, status: bto.status }).from(bto).where(and(eq(bto.employeeId, actorId), gte(bto.estKembali, startOfTodayForTrip), inArray(bto.status, ['SUBMITTED', 'ADMIN_DP_REVIEW', 'PT_REVIEW', 'SDM_REVIEW', 'SPDK_DRAFT', 'KABAG_REVIEW', 'ACTIVE', 'ATTENDED'] as any))).orderBy(bto.estBerangkat).limit(5),
      listBtoApprovalsService({ id: actorId, employeeId: req.user.employeeId, role: req.user.role ?? 'user', gradeLevel: req.user.gradeLevel }, false),
      db.select({ status: bto.status, count: sql<number>`count(*)` }).from(bto).groupBy(bto.status),
      db.execute(sql`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS month_key, COUNT(*) AS total
        FROM bto
        WHERE created_at >= ${sixMonthsAgo}
        GROUP BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM')
        ORDER BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') ASC
      `)
    ]);

    const myPendingApprovalsByStatus = myApprovals.reduce<Record<string, number>>((result, item) => {
      result[item.status] = (result[item.status] ?? 0) + 1;
      return result;
    }, {});
    const monthlyCount = new Map((monthlyRows.rows as Array<{ month_key: string; total: string | number }>).map((row) => [row.month_key, Number(row.total)]));
    const monthlyTripVolume = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: date.toLocaleDateString('id-ID', { month: 'short' }),
        total: monthlyCount.get(key) ?? 0,
      };
    });

    const [analyticsOrgStatusRows, analyticsPersonalStatusRows, analyticsOrgDailyRows, analyticsPersonalDailyRows] = await Promise.all([
      db.select({ status: bto.status, count: sql<number>`count(*)` }).from(bto)
        .where(and(gte(bto.createdAt, analyticsStart), lt(bto.createdAt, analyticsEnd)))
        .groupBy(bto.status),
      db.select({ status: bto.status, count: sql<number>`count(*)` }).from(bto)
        .where(and(eq(bto.employeeId, actorId), gte(bto.createdAt, analyticsStart), lt(bto.createdAt, analyticsEnd)))
        .groupBy(bto.status),
      db.execute(sql`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD') AS day, COUNT(*) AS total
        FROM bto
        WHERE created_at >= ${analyticsStart} AND created_at < ${analyticsEnd}
        GROUP BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD')
      `),
      db.execute(sql`
        SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD') AS day, COUNT(*) AS total
        FROM bto
        WHERE employee_id = ${actorId} AND created_at >= ${analyticsStart} AND created_at < ${analyticsEnd}
        GROUP BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD')
      `),
    ]);
    const monthDays = new Date(analyticsYear, analyticsMonth, 0).getDate();
    const buildDailyVolume = (rows: unknown[]) => {
      const counts = new Map((rows as Array<{ day: string; total: string | number }>).map((row) => [Number(row.day), Number(row.total)]));
      return Array.from({ length: monthDays }, (_, index) => ({ day: index + 1, total: counts.get(index + 1) ?? 0 }));
    };

    // ─── Biaya personal (proyeksi & realisasi milik sendiri) ───
    const [myProyeksiResult, myRealisasiResult] = await Promise.all([
      db.execute(
        sql`SELECT COALESCE(SUM(dp.total_idr), 0) AS total FROM dp
            INNER JOIN bto ON dp.bto_id = bto.id
            WHERE bto.employee_id = ${actorId} AND bto.status NOT IN ('COMPLETED', 'REJECTED')`
      ),
      db.execute(
        sql`SELECT COALESCE(SUM(bte.total_idr), 0) AS total FROM bte
            INNER JOIN bto ON bte.bto_id = bto.id
            WHERE bto.employee_id = ${actorId} AND bte.status IN ('PENDING_PAYMENT', 'PAID')`
      )
    ]);

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
      myBto: {
        draft: Number(myDraftRow.count),
        active: Number(myActiveRow.count),
        completed: Number(myCompletedRow.count),
        rejected: Number(myRejectedRow.count),
      },
      myRoleContext: {
        isPemberiTugas: Number(myPemberiTugasRow.count) > 0,
      },
      myUpcomingTrips,
      myPendingApprovals: myApprovals.length,
      myPendingApprovalsByStatus,
      myPendingApprovalsList: myApprovals.slice(0, 5).map((b) => ({
        id: b.id,
        nomorBto: b.nomorBto,
        tujuanNama: b.tujuanNama,
        employeeNama: b.employeeNama,
        status: b.status,
        estBerangkat: b.estBerangkat,
      })),
      myProyeksiBiayaIdr: Number((myProyeksiResult.rows[0] as any).total),
      myRealisasiBiayaIdr: Number((myRealisasiResult.rows[0] as any).total),
      orgStatusDistribution: orgStatusRows.map((row) => ({ status: row.status, total: Number(row.count) })),
      monthlyTripVolume,
      analytics: {
        year: analyticsYear,
        month: analyticsMonth,
        orgStatusDistribution: analyticsOrgStatusRows.map((row) => ({ status: row.status, total: Number(row.count) })),
        personalStatusDistribution: analyticsPersonalStatusRows.map((row) => ({ status: row.status, total: Number(row.count) })),
        orgDailyVolume: buildDailyVolume(analyticsOrgDailyRows.rows as unknown[]),
        personalDailyVolume: buildDailyVolume(analyticsPersonalDailyRows.rows as unknown[]),
      },
    }));
  });

  /** GET /api/dashboard/analytics - Statistik bulanan, terpisah dari ringkasan operasional real-time. */
  fastify.get('/analytics', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const query = z.object({
      year: z.coerce.number().int().min(2020).max(2100).optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
    }).parse(req.query);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    const actorId = req.user.sub;
    const roles = (req.user.role ?? '').split(',').map((role) => role.trim());
    const isOrganizationScope = roles.some((role) => ['admin', 'super_admin', 'sdm'].includes(role));
    const scope = isOrganizationScope ? 'organisasi' : 'pribadi';
    const scopeConditions = isOrganizationScope ? [] : [eq(bto.employeeId, actorId)];

    const [statusRows, dailyRows, financeRows] = await Promise.all([
      db.select({ status: bto.status, count: sql<number>`count(*)` })
        .from(bto)
        .where(and(...scopeConditions, gte(bto.createdAt, start), lt(bto.createdAt, end)))
        .groupBy(bto.status),
      isOrganizationScope
        ? db.execute(sql`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD') AS day, COUNT(*) AS total
            FROM bto
            WHERE created_at >= ${start} AND created_at < ${end}
            GROUP BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD')
          `)
        : db.execute(sql`
            SELECT to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD') AS day, COUNT(*) AS total
            FROM bto
            WHERE employee_id = ${actorId} AND created_at >= ${start} AND created_at < ${end}
            GROUP BY to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'DD')
          `),
      isOrganizationScope
        ? db.execute(sql`
            SELECT
              COALESCE(SUM(dp.total_idr), 0) AS projection,
              COALESCE(SUM(bte.total_idr), 0) AS actual
            FROM bto
            LEFT JOIN dp ON dp.bto_id = bto.id
            LEFT JOIN bte ON bte.bto_id = bto.id
            WHERE bto.created_at >= ${start} AND bto.created_at < ${end}
          `)
        : db.execute(sql`
            SELECT
              COALESCE(SUM(dp.total_idr), 0) AS projection,
              COALESCE(SUM(bte.total_idr), 0) AS actual
            FROM bto
            LEFT JOIN dp ON dp.bto_id = bto.id
            LEFT JOIN bte ON bte.bto_id = bto.id
            WHERE bto.employee_id = ${actorId} AND bto.created_at >= ${start} AND bto.created_at < ${end}
          `),
    ]);

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyCounts = new Map((dailyRows.rows as Array<{ day: string; total: string | number }>).map((row) => [Number(row.day), Number(row.total)]));
    const dailyVolume = Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, total: dailyCounts.get(index + 1) ?? 0 }));
    const statusDistribution = statusRows.map((row) => ({ status: row.status, total: Number(row.count) }));
    const finance = financeRows.rows[0] as { projection?: string | number; actual?: string | number } | undefined;

    return reply.send(ok({
      year,
      month,
      scope,
      totalSubmissions: statusDistribution.reduce((total, item) => total + item.total, 0),
      statusDistribution,
      dailyVolume,
      finance: {
        projection: Number(finance?.projection ?? 0),
        actual: Number(finance?.actual ?? 0),
      },
    }));
  });

  /** GET /api/dashboard/karyawan-dinas — List karyawan yang sedang/akan dinas pada range tanggal tertentu */
  fastify.get('/karyawan-dinas', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
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
        sql`status IN ('ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT', 'COMPLETED')`
      ))
      .orderBy(desc(bto.estBerangkat));

    return reply.send(ok(rows));
  });

  /** GET /api/dashboard/proyeksi-biaya — Total biaya perjalanan dinas yang direncanakan */
  fastify.get('/proyeksi-biaya', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
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
  fastify.get('/realisasi-biaya', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    // Sum total_idr dari BTE yang berstatus PAID atau APPROVED
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(total_idr), 0) AS total FROM bte 
          WHERE status IN ('APPROVED', 'PAID')`
    );
    const total = Number((result.rows[0] as any).total);
    return reply.send(ok({ realisasiBiayaIdr: total }));
  });

  /** GET /api/dashboard/export-excel — Download Excel */
  fastify.get('/export-excel', { preHandler: [fastify.authenticateSdm] }, async (req, reply) => {
    const q = req.query as any;
    // Guard against invalid date strings producing an Invalid Date passed to the query.
    const toValidDate = (v: unknown): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const dateFrom = toValidDate(q.dateFrom);
    let dateTo = toValidDate(q.dateTo);
    if (dateTo && typeof q.dateTo === 'string' && !q.dateTo.includes('T')) {
      dateTo.setHours(23, 59, 59, 999);
    }
    const status = q.status || undefined;

    const buffer = await exportBtoExcelService({ dateFrom, dateTo, status });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="Laporan_MeeTrip_' + Date.now() + '.xlsx"');
    return reply.send(buffer);
  });
}
