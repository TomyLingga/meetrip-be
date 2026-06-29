// ─── Schema: BTE (Business Trip Expense) ────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, numeric, timestamp, pgEnum,
} from 'drizzle-orm/pg-core'
import { bto } from './bto'
import { refRincianBiaya } from './master'

const genUUID = () => crypto.randomUUID()

export const bteStatusEnum = pgEnum('bte_status', [
  'DRAFT',
  'SUBMITTED',
  'ADMIN_REVIEW',
  'REVISION',
  'APPROVED',
  'REJECTED',
  'PENDING_PAYMENT',
  'PAID',
])

// ─── bte ──────────────────────────────────────────────────────────────────────
export const bte = pgTable('bte', {
  id:              uuid('id').primaryKey().$defaultFn(genUUID),
  btoId:           uuid('bto_id').notNull().unique().references(() => bto.id, { onDelete: 'cascade' }),
  status:          bteStatusEnum('status').notNull().default('DRAFT'),
  // Tanggal aktual (diambil dari BTO, bisa diupdate user)
  tglBerangkat:    timestamp('tgl_berangkat', { withTimezone: true }),
  jamBerangkat:    varchar('jam_berangkat', { length: 10 }), // 'HH:MM'
  tglKembali:      timestamp('tgl_kembali',  { withTimezone: true }),
  jamKembali:      varchar('jam_kembali', { length: 10 }),
  // Upload
  laporanPath:     varchar('laporan_path',  { length: 500 }), // PDF laporan
  laporanNama:     varchar('laporan_nama',  { length: 300 }),
  kuitansiPath:    varchar('kuitansi_path', { length: 500 }), // scan kuitansi (1 file)
  kuitansiNama:    varchar('kuitansi_nama', { length: 300 }),
  // Total
  exchangeRateUsd: numeric('exchange_rate_usd', { precision: 15, scale: 4 }).default('0'),
  totalIdr:        numeric('total_idr', { precision: 18, scale: 2 }).default('0'),
  totalUsd:        numeric('total_usd', { precision: 15, scale: 2 }).default('0'),
  // Timestamps
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  paidAt:      timestamp('paid_at',      { withTimezone: true }),
  paidBy:      varchar('paid_by',  { length: 100 }),
  paidByNama:  varchar('paid_by_nama', { length: 200 }),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── bte_rincian ──────────────────────────────────────────────────────────────
export const bteRincian = pgTable('bte_rincian', {
  id:            uuid('id').primaryKey().$defaultFn(genUUID),
  bteId:         uuid('bte_id').notNull().references(() => bte.id, { onDelete: 'cascade' }),
  rincianId:     uuid('rincian_id').notNull().references(() => refRincianBiaya.id),
  rincianLabel:  varchar('rincian_label', { length: 150 }),
  jumlahHari:    integer('jumlah_hari').notNull().default(1),
  nilaiPerHari:  numeric('nilai_per_hari', { precision: 15, scale: 2 }).notNull().default('0'),
  nilaiTotal:    numeric('nilai_total',    { precision: 18, scale: 2 }).notNull().default('0'),
  useDollar:     boolean('use_dollar').notNull().default(false),
  nilaiUsd:      numeric('nilai_usd', { precision: 15, scale: 2 }).default('0'),
  paguSaatInput: numeric('pagu_saat_input', { precision: 15, scale: 2 }), // snapshot pagu
  isUnlimited:   boolean('is_unlimited').notNull().default(false),
  catatan:       text('catatan'),
})

// ─── bte_biaya_lain ───────────────────────────────────────────────────────────
// Biaya tambahan di luar rincian standar
export const bteBiayaLain = pgTable('bte_biaya_lain', {
  id:          uuid('id').primaryKey().$defaultFn(genUUID),
  bteId:       uuid('bte_id').notNull().references(() => bte.id, { onDelete: 'cascade' }),
  keterangan:  varchar('keterangan', { length: 300 }).notNull(),
  nilai:       numeric('nilai',     { precision: 15, scale: 2 }).notNull().default('0'),
  useDollar:   boolean('use_dollar').notNull().default(false),
  nilaiUsd:    numeric('nilai_usd', { precision: 15, scale: 2 }).default('0'),
})

// ─── bte_approval_log ─────────────────────────────────────────────────────────
export const bteApprovalLog = pgTable('bte_approval_log', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  bteId:     uuid('bte_id').notNull().references(() => bte.id, { onDelete: 'cascade' }),
  aksi:      varchar('aksi',     { length: 50  }).notNull(), // 'submit'|'approve'|'revision'|'reject'|'mark_paid'
  actorId:   varchar('actor_id', { length: 100 }).notNull(),
  actorNama: varchar('actor_nama', { length: 200 }),
  catatan:   text('catatan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
