// ─── Schema: DP (Down Payment) ────────────────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, numeric, timestamp, pgEnum,
} from 'drizzle-orm/pg-core'
import { bto } from './bto'
import { refRincianBiaya } from './master'

const genUUID = () => crypto.randomUUID()

export const dpStatusEnum = pgEnum('dp_status', [
  'DRAFT',
  'SUBMITTED',
  'ADMIN_REVIEW',
  'REVISION',
  'APPROVED',
  'REJECTED',
])

// ─── dp ───────────────────────────────────────────────────────────────────────
export const dp = pgTable('dp', {
  id:              uuid('id').primaryKey().$defaultFn(genUUID),
  btoId:           uuid('bto_id').notNull().unique().references(() => bto.id, { onDelete: 'cascade' }),
  status:          dpStatusEnum('status').notNull().default('DRAFT'),
  exchangeRateUsd: numeric('exchange_rate_usd', { precision: 15, scale: 4 }).default('0'),
  totalIdr:        numeric('total_idr', { precision: 18, scale: 2 }).default('0'),
  totalUsd:        numeric('total_usd', { precision: 15, scale: 2 }).default('0'),
  submittedAt:     timestamp('submitted_at', { withTimezone: true }),
  updatedAt:       timestamp('updated_at',   { withTimezone: true }).defaultNow(),
})

// ─── dp_rincian ───────────────────────────────────────────────────────────────
// Rincian biaya per item. pagu_saat_input disimpan sebagai snapshot.
export const dpRincian = pgTable('dp_rincian', {
  id:           uuid('id').primaryKey().$defaultFn(genUUID),
  dpId:         uuid('dp_id').notNull().references(() => dp.id, { onDelete: 'cascade' }),
  rincianId:    uuid('rincian_id').notNull().references(() => refRincianBiaya.id),
  rincianLabel: varchar('rincian_label', { length: 150 }),
  jumlahHari:   integer('jumlah_hari').notNull().default(1),   // hari atau malam
  nilaiPerHari: numeric('nilai_per_hari', { precision: 15, scale: 2 }).notNull().default('0'),
  nilaiTotal:   numeric('nilai_total',    { precision: 18, scale: 2 }).notNull().default('0'),
  useDollar:    boolean('use_dollar').notNull().default(false),
  nilaiUsd:     numeric('nilai_usd', { precision: 15, scale: 2 }).default('0'),
  paguSaatInput: numeric('pagu_saat_input', { precision: 15, scale: 2 }), // snapshot pagu
  isUnlimited:  boolean('is_unlimited').notNull().default(false),
  catatan:      text('catatan'),
})

// ─── dp_approval_log ─────────────────────────────────────────────────────────
export const dpApprovalLog = pgTable('dp_approval_log', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  dpId:      uuid('dp_id').notNull().references(() => dp.id, { onDelete: 'cascade' }),
  aksi:      varchar('aksi',     { length: 50  }).notNull(),
  actorId:   varchar('actor_id', { length: 100 }).notNull(),
  actorNama: varchar('actor_nama', { length: 200 }),
  catatan:   text('catatan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
