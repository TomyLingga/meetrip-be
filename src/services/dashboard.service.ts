import { SQL, sql } from 'drizzle-orm'
import { db } from '../db/connection'
import { configApproverSpdk, localUserCache } from '../db/schema'
import { eq } from 'drizzle-orm'
import { AppError } from '../utils/errorHandler'

export type DashboardContext = 'company' | 'employee' | 'assigner' | 'kabag'

type DashboardActor = {
  id: string
  employeeId?: string | null
  role?: string | null
  nama?: string | null
}

type ActorScope = {
  identifiers: string[]
  roles: string[]
  unitId: string | null
  unitNama: string | null
  isAdmin: boolean
  isSdm: boolean
  isKabag: boolean
  isPemberiTugas: boolean
  spdkApproverMode: 'unit_head' | 'fixed_person'
  availableContexts: DashboardContext[]
  defaultContext: DashboardContext
}

const FINAL_BTO_STATUSES = ['COMPLETED', 'REJECTED']
const FINAL_BTE_STATUSES = ['APPROVED', 'PENDING_PAYMENT', 'PAID']

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function identifierPredicate(column: SQL, identifiers: string[]) {
  if (identifiers.length === 0) return sql`FALSE`
  return sql`(${sql.join(identifiers.map((identifier) => sql`${column} = ${identifier}`), sql` OR `)})`
}

function textIn(column: SQL, values: string[]) {
  if (values.length === 0) return sql`FALSE`
  return sql`${column} IN (${sql.join(values.map((value) => sql`${value}`), sql`, `)})`
}

async function resolveActorScope(actor: DashboardActor): Promise<ActorScope> {
  const identifiers = Array.from(new Set([actor.id, actor.employeeId].filter((id): id is string => Boolean(id))))
  const roles = (actor.role ?? 'user').split(',').map((role) => role.trim()).filter(Boolean)
  const isAdmin = roles.some((role) => role === 'admin' || role === 'super_admin')
  const isSdm = roles.includes('sdm')
  const cache = await db.query.localUserCache.findFirst({
    where: eq(localUserCache.portalUserId, actor.id),
  })
  const approverConfig = await db.query.configApproverSpdk.findFirst({
    where: eq(configApproverSpdk.isActive, true),
  })
  const spdkApproverMode = approverConfig?.mode === 'fixed_person' ? 'fixed_person' : 'unit_head'

  const [roleRows] = await Promise.all([
    db.execute(sql`
      SELECT
        EXISTS(
          SELECT 1 FROM bto b
          WHERE ${identifierPredicate(sql`b.pemberi_tugas_id`, identifiers)}
        ) AS is_pemberi_tugas,
        EXISTS(
          SELECT 1 FROM spdk s
          WHERE ${identifierPredicate(sql`s.approver_kabag_id`, identifiers)}
        ) AS has_kabag_assignment
    `),
  ])
  const roleRow = roleRows.rows[0] as { is_pemberi_tugas?: boolean; has_kabag_assignment?: boolean } | undefined
  const isPemberiTugas = Boolean(roleRow?.is_pemberi_tugas)
  const hasBom1Grade = String(cache?.gradeKode ?? '').trim().toUpperCase() === 'BOM-1'
  const isFixedApprover = Boolean(approverConfig?.fixedEmployeeId && identifiers.includes(approverConfig.fixedEmployeeId))
  const isKabag = Boolean(roleRow?.has_kabag_assignment) || isFixedApprover || (spdkApproverMode === 'unit_head' && hasBom1Grade)

  const availableContexts: DashboardContext[] = ['employee']
  if (isAdmin || isSdm) availableContexts.unshift('company')
  if (isPemberiTugas) availableContexts.push('assigner')
  if (isKabag) availableContexts.push('kabag')

  const defaultContext: DashboardContext = isAdmin || isSdm
    ? 'company'
    : isPemberiTugas
      ? 'assigner'
      : isKabag
        ? 'kabag'
        : 'employee'

  return {
    identifiers,
    roles,
    unitId: cache?.unitId ?? null,
    unitNama: cache?.unitNama ?? null,
    isAdmin,
    isSdm,
    isKabag,
    isPemberiTugas,
    spdkApproverMode,
    availableContexts,
    defaultContext,
  }
}

function assertContext(scope: ActorScope, requested?: string | null): DashboardContext {
  const context = (requested || scope.defaultContext) as DashboardContext
  if (!scope.availableContexts.includes(context)) {
    throw new AppError('Cakupan dashboard tidak diizinkan untuk akun ini', 403)
  }
  return context
}

function buildScopePredicate(context: DashboardContext, scope: ActorScope) {
  if (context === 'company') return sql`TRUE`
  if (context === 'employee') return identifierPredicate(sql`b.employee_id`, scope.identifiers)
  if (context === 'assigner') return identifierPredicate(sql`b.pemberi_tugas_id`, scope.identifiers)

  const assignedSpdk = sql`EXISTS (
    SELECT 1 FROM spdk scope_spdk
    WHERE scope_spdk.bto_id = b.id
      AND ${identifierPredicate(sql`scope_spdk.approver_kabag_id`, scope.identifiers)}
  )`
  if (scope.spdkApproverMode === 'fixed_person' || !scope.unitId) return assignedSpdk
  return sql`(
    ${assignedSpdk}
    OR COALESCE(b.employee_unit_id, owner.unit_id) = ${scope.unitId}
  )`
}

function buildActionPredicate(context: DashboardContext, scope: ActorScope) {
  if (context === 'employee') {
    return textIn(sql`b.status::text`, ['DRAFT', 'REVISION_DP', 'ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT', 'REVISION_BTE'])
  }
  if (context === 'assigner') return sql`b.status::text = 'PT_REVIEW'`
  if (context === 'kabag') return sql`b.status::text = 'KABAG_REVIEW'`

  const statuses: string[] = []
  if (scope.isAdmin) statuses.push('ADMIN_DP_REVIEW', 'SPDK_DRAFT', 'ADMIN_BTE_REVIEW', 'BTE_PAYMENT')
  if (scope.isSdm) statuses.push('SDM_REVIEW')
  return textIn(sql`b.status::text`, Array.from(new Set(statuses)))
}

function contextLabel(context: DashboardContext, unitNama: string | null) {
  if (context === 'company') return 'Seluruh perusahaan'
  if (context === 'assigner') return 'Sebagai Pemberi Tugas'
  if (context === 'kabag') return unitNama ? `Unit ${unitNama}` : 'Tanggung jawab KABAG'
  return 'Dinas saya'
}

export async function getDashboardOverview(actor: DashboardActor, requestedContext?: string | null) {
  const scope = await resolveActorScope(actor)
  const context = assertContext(scope, requestedContext)
  const scopePredicate = buildScopePredicate(context, scope)
  const actionPredicate = buildActionPredicate(context, scope)

  const [metricsResult, actionResult, upcomingResult, stageResult, meetingResult, meetingAgendaResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE ${actionPredicate}) AS pending_action,
        COUNT(*) FILTER (WHERE b.status::text = 'ADMIN_DP_REVIEW') AS pending_dp_review,
        COUNT(*) FILTER (WHERE b.status::text = 'SDM_REVIEW') AS pending_sdm_review,
        COUNT(*) FILTER (WHERE b.status::text = 'SPDK_DRAFT') AS pending_spdk_issue,
        COUNT(*) FILTER (WHERE b.status::text = 'KABAG_REVIEW') AS pending_kabag_review,
        COUNT(*) FILTER (WHERE b.status::text = 'ADMIN_BTE_REVIEW') AS pending_bte_review,
        COUNT(*) FILTER (WHERE b.status::text = 'BTE_PAYMENT') AS pending_payment,
        COUNT(*) FILTER (
          WHERE b.status::text IN ('ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'BTE_DRAFT')
            AND b.est_berangkat <= CURRENT_TIMESTAMP
            AND b.est_kembali >= CURRENT_TIMESTAMP
        ) AS active_trips,
        COUNT(*) FILTER (
          WHERE b.est_berangkat >= CURRENT_TIMESTAMP
            AND b.est_berangkat < CURRENT_TIMESTAMP + INTERVAL '7 days'
            AND NOT (${textIn(sql`b.status::text`, FINAL_BTO_STATUSES)})
        ) AS upcoming_seven_days,
        COUNT(*) FILTER (WHERE b.status::text IN ('DRAFT', 'REVISION_DP', 'REVISION_BTE')) AS needs_revision,
        COUNT(*) FILTER (
          WHERE ${actionPredicate}
            AND COALESCE(b.updated_at, b.created_at) < CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ) AS overdue_actions,
        COUNT(*) FILTER (
          WHERE b.status::text = 'COMPLETED'
            AND b.est_berangkat >= date_trunc('month', CURRENT_TIMESTAMP)
            AND b.est_berangkat < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'
        ) AS completed_this_month,
        COALESCE(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(COALESCE(b.updated_at, b.created_at)) FILTER (WHERE ${actionPredicate}))) / 3600, 0) AS oldest_pending_hours
      FROM bto b
      LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
      WHERE ${scopePredicate}
    `),
    db.execute(sql`
      SELECT
        b.id,
        b.nomor_bto,
        b.employee_nama,
        b.tujuan_nama,
        b.status::text AS status,
        b.est_berangkat,
        b.est_kembali,
        COALESCE(b.employee_unit_nama, owner.unit_nama) AS unit_nama,
        ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(b.updated_at, b.created_at))) / 3600)::int AS waiting_hours
      FROM bto b
      LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
      WHERE ${scopePredicate} AND ${actionPredicate}
      ORDER BY
        CASE WHEN b.est_berangkat < CURRENT_TIMESTAMP + INTERVAL '3 days' THEN 0 ELSE 1 END,
        COALESCE(b.updated_at, b.created_at) ASC
      LIMIT 6
    `),
    db.execute(sql`
      SELECT
        b.id,
        b.nomor_bto,
        b.employee_nama,
        b.tujuan_nama,
        b.status::text AS status,
        b.est_berangkat,
        b.est_kembali,
        COALESCE(b.employee_unit_nama, owner.unit_nama) AS unit_nama
      FROM bto b
      LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
      WHERE ${scopePredicate}
        AND b.est_kembali >= CURRENT_TIMESTAMP
        AND NOT (${textIn(sql`b.status::text`, FINAL_BTO_STATUSES)})
      ORDER BY b.est_berangkat ASC
      LIMIT 6
    `),
    db.execute(sql`
      SELECT b.status::text AS status, COUNT(*) AS total
      FROM bto b
      LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
      WHERE ${scopePredicate} AND ${actionPredicate}
      GROUP BY b.status
      ORDER BY total DESC
    `),
    /*
     * Ringkasan meeting bersifat organisasi-wide (kalender ruang rapat memang
     * dipakai bersama — endpoint TV pun publik), ditambah hitungan "milik saya"
     * agar tetap relevan pada cakupan employee.
     */
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE mulai <= date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day' - INTERVAL '1 millisecond'
            AND selesai >= date_trunc('day', CURRENT_TIMESTAMP)
        ) AS today,
        COUNT(*) FILTER (
          WHERE status::text <> 'CANCELLED'
            AND mulai <= CURRENT_TIMESTAMP AND selesai >= CURRENT_TIMESTAMP
        ) AS ongoing,
        COUNT(*) FILTER (
          WHERE status::text <> 'CANCELLED'
            AND mulai >= CURRENT_TIMESTAMP
            AND mulai < CURRENT_TIMESTAMP + INTERVAL '7 days'
        ) AS upcoming_seven_days,
        COUNT(*) FILTER (
          WHERE mulai >= date_trunc('month', CURRENT_TIMESTAMP)
            AND mulai < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'
        ) AS this_month,
        COUNT(*) FILTER (
          WHERE status::text = 'CANCELLED'
            AND mulai >= date_trunc('month', CURRENT_TIMESTAMP)
            AND mulai < date_trunc('month', CURRENT_TIMESTAMP) + INTERVAL '1 month'
        ) AS cancelled_this_month,
        COUNT(*) FILTER (
          WHERE status::text <> 'CANCELLED'
            AND selesai >= CURRENT_TIMESTAMP
            AND ${identifierPredicate(sql`created_by`, scope.identifiers)}
        ) AS mine_upcoming
      FROM meeting
    `),
    db.execute(sql`
      SELECT id, topik, mulai, selesai, ruang_nama, created_by, created_by_nama,
             need_zoom, need_sound_system, status::text AS status,
             ${identifierPredicate(sql`created_by`, scope.identifiers)} AS is_mine
      FROM meeting
      WHERE status::text <> 'CANCELLED' AND selesai >= CURRENT_TIMESTAMP
      ORDER BY mulai ASC
      LIMIT 6
    `),
  ])

  const metrics = metricsResult.rows[0] as Record<string, unknown> | undefined
  const meetingRow = meetingResult.rows[0] as Record<string, unknown> | undefined
  const meetingAgenda = meetingAgendaResult.rows.map(normalizeMeetingRow)
  return {
    context,
    contextLabel: contextLabel(context, scope.unitNama),
    availableContexts: scope.availableContexts,
    roleContext: {
      isAdmin: scope.isAdmin,
      isSdm: scope.isSdm,
      isKabag: scope.isKabag,
      isPemberiTugas: scope.isPemberiTugas,
      unitNama: scope.unitNama,
    },
    metrics: {
      pendingAction: numberValue(metrics?.pending_action),
      pendingDpReview: numberValue(metrics?.pending_dp_review),
      pendingSdmReview: numberValue(metrics?.pending_sdm_review),
      pendingSpdkIssue: numberValue(metrics?.pending_spdk_issue),
      pendingKabagReview: numberValue(metrics?.pending_kabag_review),
      pendingBteReview: numberValue(metrics?.pending_bte_review),
      pendingPayment: numberValue(metrics?.pending_payment),
      activeTrips: numberValue(metrics?.active_trips),
      upcomingSevenDays: numberValue(metrics?.upcoming_seven_days),
      needsRevision: numberValue(metrics?.needs_revision),
      overdueActions: numberValue(metrics?.overdue_actions),
      completedThisMonth: numberValue(metrics?.completed_this_month),
      oldestPendingHours: numberValue(metrics?.oldest_pending_hours),
      meetingsToday: numberValue(meetingRow?.today),
    },
    // ── Blok meeting (real-time, tidak mengikuti filter bulan) ──
    meetings: {
      today: numberValue(meetingRow?.today),
      ongoing: numberValue(meetingRow?.ongoing),
      upcomingSevenDays: numberValue(meetingRow?.upcoming_seven_days),
      thisMonth: numberValue(meetingRow?.this_month),
      cancelledThisMonth: numberValue(meetingRow?.cancelled_this_month),
      mineUpcoming: numberValue(meetingRow?.mine_upcoming),
      next: meetingAgenda[0] ?? null,
      agenda: meetingAgenda,
    },
    actionQueue: actionResult.rows.map(normalizeTripRow),
    upcomingTrips: upcomingResult.rows.map(normalizeTripRow),
    actionStages: stageResult.rows.map((row) => ({
      status: String((row as Record<string, unknown>).status ?? ''),
      total: numberValue((row as Record<string, unknown>).total),
    })),
  }
}

function normalizeMeetingRow(row: unknown) {
  const item = row as Record<string, unknown>
  return {
    id: String(item.id),
    topik: String(item.topik ?? ''),
    mulai: item.mulai,
    selesai: item.selesai,
    ruangNama: item.ruang_nama ? String(item.ruang_nama) : null,
    createdByNama: item.created_by_nama ? String(item.created_by_nama) : null,
    needZoom: Boolean(item.need_zoom),
    needSoundSystem: Boolean(item.need_sound_system),
    status: String(item.status ?? 'SCHEDULED'),
    isMine: Boolean(item.is_mine),
  }
}

function normalizeTripRow(row: unknown) {
  const item = row as Record<string, unknown>
  return {
    id: String(item.id),
    nomorBto: item.nomor_bto ? String(item.nomor_bto) : null,
    employeeNama: item.employee_nama ? String(item.employee_nama) : null,
    tujuanNama: String(item.tujuan_nama ?? ''),
    status: String(item.status ?? ''),
    estBerangkat: item.est_berangkat,
    estKembali: item.est_kembali,
    unitNama: item.unit_nama ? String(item.unit_nama) : null,
    waitingHours: item.waiting_hours == null ? undefined : numberValue(item.waiting_hours),
  }
}

export async function getDashboardAnalytics(
  actor: DashboardActor,
  requestedContext: string | null | undefined,
  year: number,
  month: number,
) {
  const scope = await resolveActorScope(actor)
  const context = assertContext(scope, requestedContext)
  const scopePredicate = buildScopePredicate(context, scope)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  const scopedBto = sql`
    SELECT b.*,
      COALESCE(b.employee_unit_id, owner.unit_id) AS report_unit_id,
      COALESCE(b.employee_unit_nama, owner.unit_nama, 'Tanpa unit') AS report_unit_nama
    FROM bto b
    LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
    WHERE ${scopePredicate}
      AND b.est_berangkat >= ${start}
      AND b.est_berangkat < ${end}
  `

  const [financeResult, dailyResult, statusResult, weeklyResult, categoryResult, unitResult, decisionResult, cashResult, budgetResult,
         meetingSummaryResult, meetingDailyResult, meetingRoomResult, meetingStatusResult, meetingHostResult, meetingParticipantResult] = await Promise.all([
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto})
      SELECT
        COUNT(*) AS total_trips,
        COALESCE(SUM(CASE WHEN d.status::text = 'APPROVED' THEN d.total_idr ELSE 0 END), 0) AS approved_dp,
        COALESCE(SUM(CASE WHEN ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)} THEN bt.total_idr ELSE 0 END), 0) AS actual_bte,
        COALESCE(SUM(CASE
          WHEN ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)} THEN bt.total_idr
          WHEN d.status::text = 'APPROVED' THEN d.total_idr
          ELSE 0 END), 0) AS exposure,
        COALESCE(SUM(CASE WHEN bt.status::text = 'PENDING_PAYMENT' THEN bt.total_idr ELSE 0 END), 0) AS pending_payment,
        COALESCE(SUM(CASE
          WHEN ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)}
          THEN bt.total_idr - CASE WHEN d.status::text = 'APPROVED' THEN d.total_idr ELSE 0 END
          ELSE 0 END), 0) AS settlement_delta
      FROM scoped_bto sb
      LEFT JOIN dp d ON d.bto_id = sb.id
      LEFT JOIN bte bt ON bt.bto_id = sb.id
    `),
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto})
      SELECT EXTRACT(DAY FROM est_berangkat)::int AS day, COUNT(*) AS total
      FROM scoped_bto GROUP BY day ORDER BY day
    `),
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto})
      SELECT status::text AS status, COUNT(*) AS total
      FROM scoped_bto GROUP BY status ORDER BY total DESC
    `),
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto})
      SELECT
        CEIL(EXTRACT(DAY FROM sb.est_berangkat) / 7.0)::int AS week,
        COUNT(*) AS trips,
        COALESCE(SUM(CASE WHEN d.status::text = 'APPROVED' THEN d.total_idr ELSE 0 END), 0) AS dp,
        COALESCE(SUM(CASE WHEN ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)} THEN bt.total_idr ELSE 0 END), 0) AS bte
      FROM scoped_bto sb
      LEFT JOIN dp d ON d.bto_id = sb.id
      LEFT JOIN bte bt ON bt.bto_id = sb.id
      GROUP BY week ORDER BY week
    `),
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto}), category_cost AS (
        SELECT
          COALESCE(NULLIF(br.kategori, ''), 'lain_lain') AS category,
          CASE WHEN br.use_dollar
            THEN COALESCE(NULLIF(br.nilai_usd, 0), br.nilai_total) * COALESCE(NULLIF(bt.exchange_rate_usd, 0), 1)
            ELSE br.nilai_total END AS amount
        FROM scoped_bto sb
        JOIN bte bt ON bt.bto_id = sb.id AND ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)}
        JOIN bte_rincian br ON br.bte_id = bt.id
        UNION ALL
        SELECT
          'biaya_lain' AS category,
          CASE WHEN bl.use_dollar
            THEN COALESCE(NULLIF(bl.nilai_usd, 0), bl.nilai) * COALESCE(NULLIF(bt.exchange_rate_usd, 0), 1)
            ELSE bl.nilai END AS amount
        FROM scoped_bto sb
        JOIN bte bt ON bt.bto_id = sb.id AND ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)}
        JOIN bte_biaya_lain bl ON bl.bte_id = bt.id
      )
      SELECT category, COALESCE(SUM(amount), 0) AS total
      FROM category_cost GROUP BY category ORDER BY total DESC LIMIT 8
    `),
    db.execute(sql`
      WITH scoped_bto AS (${scopedBto}), exposure AS (
        SELECT sb.id, sb.report_unit_nama,
          CASE
            WHEN ${textIn(sql`bt.status::text`, FINAL_BTE_STATUSES)} THEN bt.total_idr
            WHEN d.status::text = 'APPROVED' THEN d.total_idr
            ELSE 0 END AS amount
        FROM scoped_bto sb
        LEFT JOIN dp d ON d.bto_id = sb.id
        LEFT JOIN bte bt ON bt.bto_id = sb.id
      )
      SELECT report_unit_nama AS unit, COUNT(*) AS trips, COALESCE(SUM(amount), 0) AS total
      FROM exposure GROUP BY report_unit_nama ORDER BY total DESC LIMIT 7
    `),
    db.execute(sql`
      SELECT action, COUNT(*) AS total FROM (
        SELECT LOWER(l.aksi) AS action
        FROM bto_approval_log l
        WHERE ${identifierPredicate(sql`l.actor_id`, scope.identifiers)}
          AND l.created_at >= ${start} AND l.created_at < ${end}
        UNION ALL
        SELECT LOWER(sl.aksi) AS action
        FROM spdk_approval_log sl
        WHERE ${identifierPredicate(sql`sl.actor_id`, scope.identifiers)}
          AND sl.created_at >= ${start} AND sl.created_at < ${end}
        UNION ALL
        SELECT LOWER(dl.aksi) AS action
        FROM dp_approval_log dl
        WHERE ${identifierPredicate(sql`dl.actor_id`, scope.identifiers)}
          AND dl.created_at >= ${start} AND dl.created_at < ${end}
        UNION ALL
        SELECT LOWER(bl.aksi) AS action
        FROM bte_approval_log bl
        WHERE ${identifierPredicate(sql`bl.actor_id`, scope.identifiers)}
          AND bl.created_at >= ${start} AND bl.created_at < ${end}
      ) decisions
      GROUP BY action ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(bt.total_idr), 0) AS paid_cash
      FROM bto b
      LEFT JOIN local_user_cache owner ON owner.portal_user_id = b.employee_id
      JOIN bte bt ON bt.bto_id = b.id
      WHERE ${scopePredicate}
        AND bt.status::text = 'PAID'
        AND bt.paid_at >= ${start} AND bt.paid_at < ${end}
    `),
    context === 'company'
      ? db.execute(sql`SELECT amount_idr, notes, updated_at, updated_by_nama FROM travel_monthly_budget WHERE year = ${year} AND month = ${month} LIMIT 1`)
      : Promise.resolve({ rows: [] } as { rows: unknown[] }),
    /*
     * ── Statistik meeting bulan terpilih ──
     * Ikut month-year picker yang sama dengan statistik dinas. Status dihitung
     * dari waktu (bukan hanya kolom status) supaya bulan lampau terbaca "selesai"
     * meski baris lama tidak pernah di-update.
     */
    db.execute(sql`
      WITH scoped_meeting AS (
        SELECT m.*, EXTRACT(EPOCH FROM (m.selesai - m.mulai)) / 60 AS durasi_menit
        FROM meeting m
        WHERE m.mulai >= ${start} AND m.mulai < ${end}
      )
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status::text = 'CANCELLED') AS cancelled,
        COUNT(*) FILTER (WHERE need_zoom) AS with_zoom,
        COUNT(*) FILTER (WHERE ruang_id IS NOT NULL) AS with_room,
        COUNT(*) FILTER (WHERE need_sound_system) AS with_sound,
        COALESCE(SUM(durasi_menit) FILTER (WHERE status::text <> 'CANCELLED'), 0) AS total_menit,
        COALESCE(AVG(durasi_menit) FILTER (WHERE status::text <> 'CANCELLED'), 0) AS avg_menit,
        COUNT(DISTINCT created_by) AS penyelenggara,
        COUNT(*) FILTER (WHERE ${identifierPredicate(sql`created_by`, scope.identifiers)}) AS mine
      FROM scoped_meeting
    `),
    db.execute(sql`
      SELECT EXTRACT(DAY FROM mulai)::int AS day, COUNT(*) AS total
      FROM meeting WHERE mulai >= ${start} AND mulai < ${end} AND status::text <> 'CANCELLED'
      GROUP BY day ORDER BY day
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(ruang_nama, ''), 'Tanpa ruang (virtual)') AS ruang,
             COUNT(*) AS total,
             COALESCE(SUM(EXTRACT(EPOCH FROM (selesai - mulai)) / 3600), 0) AS jam
      FROM meeting WHERE mulai >= ${start} AND mulai < ${end} AND status::text <> 'CANCELLED'
      GROUP BY ruang ORDER BY total DESC LIMIT 7
    `),
    db.execute(sql`
      SELECT
        CASE
          WHEN status::text = 'CANCELLED' THEN 'CANCELLED'
          WHEN selesai < CURRENT_TIMESTAMP THEN 'DONE'
          WHEN mulai <= CURRENT_TIMESTAMP AND selesai >= CURRENT_TIMESTAMP THEN 'ONGOING'
          ELSE 'SCHEDULED'
        END AS status,
        COUNT(*) AS total
      FROM meeting WHERE mulai >= ${start} AND mulai < ${end}
      GROUP BY 1 ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(m.created_by_nama, ''), 'Tanpa nama') AS nama, COUNT(*) AS total
      FROM meeting m WHERE m.mulai >= ${start} AND m.mulai < ${end} AND m.status::text <> 'CANCELLED'
      GROUP BY nama ORDER BY total DESC LIMIT 5
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE p.is_external) AS eksternal
      FROM meeting_partisipan p
      JOIN meeting m ON m.id = p.meeting_id
      WHERE m.mulai >= ${start} AND m.mulai < ${end} AND m.status::text <> 'CANCELLED'
    `),
  ])

  const financeRow = financeResult.rows[0] as Record<string, unknown> | undefined
  const budgetRow = budgetResult.rows[0] as Record<string, unknown> | undefined
  const allocation = context === 'company' && budgetRow ? numberValue(budgetRow.amount_idr) : null
  const exposure = numberValue(financeRow?.exposure)
  const daysInMonth = new Date(year, month, 0).getDate()
  const dailyMap = new Map(dailyResult.rows.map((row) => [numberValue((row as Record<string, unknown>).day), numberValue((row as Record<string, unknown>).total)]))
  const meetingSummary = meetingSummaryResult.rows[0] as Record<string, unknown> | undefined
  const meetingParticipant = meetingParticipantResult.rows[0] as Record<string, unknown> | undefined
  const meetingDailyMap = new Map(meetingDailyResult.rows.map((row) => [numberValue((row as Record<string, unknown>).day), numberValue((row as Record<string, unknown>).total)]))
  const weekMap = new Map(weeklyResult.rows.map((row) => [numberValue((row as Record<string, unknown>).week), row as Record<string, unknown>]))

  return {
    year,
    month,
    context,
    contextLabel: contextLabel(context, scope.unitNama),
    totalTrips: numberValue(financeRow?.total_trips),
    dailyVolume: Array.from({ length: daysInMonth }, (_, index) => ({ day: index + 1, total: dailyMap.get(index + 1) ?? 0 })),
    statusDistribution: statusResult.rows.map((row) => ({
      status: String((row as Record<string, unknown>).status ?? ''),
      total: numberValue((row as Record<string, unknown>).total),
    })),
    weeklyFinance: Array.from({ length: 5 }, (_, index) => {
      const row = weekMap.get(index + 1)
      return {
        week: index + 1,
        trips: numberValue(row?.trips),
        dp: numberValue(row?.dp),
        bte: numberValue(row?.bte),
      }
    }),
    finance: {
      allocation,
      approvedDp: numberValue(financeRow?.approved_dp),
      actualBte: numberValue(financeRow?.actual_bte),
      exposure,
      pendingPayment: numberValue(financeRow?.pending_payment),
      paidCash: numberValue((cashResult.rows[0] as Record<string, unknown> | undefined)?.paid_cash),
      settlementDelta: numberValue(financeRow?.settlement_delta),
      remaining: allocation == null ? null : allocation - exposure,
      utilizationPercent: allocation && allocation > 0 ? (exposure / allocation) * 100 : null,
      budgetNotes: budgetRow?.notes ? String(budgetRow.notes) : null,
      budgetUpdatedAt: budgetRow?.updated_at ?? null,
      budgetUpdatedByNama: budgetRow?.updated_by_nama ? String(budgetRow.updated_by_nama) : null,
    },
    categoryBreakdown: categoryResult.rows.map((row) => ({
      category: String((row as Record<string, unknown>).category ?? 'lain_lain'),
      total: numberValue((row as Record<string, unknown>).total),
    })),
    unitBreakdown: unitResult.rows.map((row) => ({
      unit: String((row as Record<string, unknown>).unit ?? 'Tanpa unit'),
      trips: numberValue((row as Record<string, unknown>).trips),
      total: numberValue((row as Record<string, unknown>).total),
    })),
    decisionOutcomes: decisionResult.rows.map((row) => ({
      action: String((row as Record<string, unknown>).action ?? ''),
      total: numberValue((row as Record<string, unknown>).total),
    })),
    // ── Statistik meeting untuk bulan yang sama ──
    meetings: {
      total: numberValue(meetingSummary?.total),
      cancelled: numberValue(meetingSummary?.cancelled),
      withZoom: numberValue(meetingSummary?.with_zoom),
      withRoom: numberValue(meetingSummary?.with_room),
      withSoundSystem: numberValue(meetingSummary?.with_sound),
      totalMinutes: Math.round(numberValue(meetingSummary?.total_menit)),
      avgMinutes: Math.round(numberValue(meetingSummary?.avg_menit)),
      hostCount: numberValue(meetingSummary?.penyelenggara),
      mine: numberValue(meetingSummary?.mine),
      participants: numberValue(meetingParticipant?.total),
      externalParticipants: numberValue(meetingParticipant?.eksternal),
      dailyVolume: Array.from({ length: daysInMonth }, (_, index) => ({
        day: index + 1,
        total: meetingDailyMap.get(index + 1) ?? 0,
      })),
      roomBreakdown: meetingRoomResult.rows.map((row) => ({
        room: String((row as Record<string, unknown>).ruang ?? 'Tanpa ruang'),
        total: numberValue((row as Record<string, unknown>).total),
        hours: Math.round(numberValue((row as Record<string, unknown>).jam) * 10) / 10,
      })),
      statusDistribution: meetingStatusResult.rows.map((row) => ({
        status: String((row as Record<string, unknown>).status ?? ''),
        total: numberValue((row as Record<string, unknown>).total),
      })),
      topHosts: meetingHostResult.rows.map((row) => ({
        nama: String((row as Record<string, unknown>).nama ?? '-'),
        total: numberValue((row as Record<string, unknown>).total),
      })),
    },
  }
}
