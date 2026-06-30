// ─── Schema: BTO (Business Trip Order) ───────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, numeric, timestamp, pgEnum,
} from 'drizzle-orm/pg-core'
import { refTransport } from './master'

const genUUID = () => crypto.randomUUID()

// ─── Status enum BTO ─────────────────────────────────────────────────────────
export const btoStatusEnum = pgEnum('bto_status', [
  'DRAFT',
  'SUBMITTED',
  'ADMIN_DP_REVIEW',   // admin cek DP
  'REVISION_DP',       // user diminta revisi DP
  'PT_REVIEW',         // pemberi tugas review
  'SDM_REVIEW',        // SDM review
  'SPDK_DRAFT',        // admin sedang proses SPDK
  'KABAG_REVIEW',      // Kabag SDM approve SPDK
  'ACTIVE',            // SPDK approved, user siap berangkat
  'ATTENDED',          // user sudah attend stamp
  'REPORT_UPLOADED',   // laporan dinas sudah diupload
  'COMPLETED',         // BTE sudah disubmit
  'REJECTED',          // ditolak di tahap mana pun
])

export const wilayahTipeEnum = pgEnum('wilayah_tipe', [
  'dalam_wilayah',
  'luar_wilayah',
  'luar_negeri',
])

// ─── bto ──────────────────────────────────────────────────────────────────────
export const bto = pgTable('bto', {
  id:                uuid('id').primaryKey().$defaultFn(genUUID),
  nomorBto:          varchar('nomor_bto',   { length: 50 }).unique(),
  // User yang mengajukan (portalUserId)
  employeeId:        varchar('employee_id', { length: 100 }).notNull(),
  employeeNama:      varchar('employee_nama', { length: 200 }),
  // Pemberi tugas (portalUserId / employeeId dari portal)
  pemberiTugasId:    varchar('pemberi_tugas_id',   { length: 100 }),
  pemberiTugasNama:  varchar('pemberi_tugas_nama',  { length: 200 }),
  // Tujuan
  tujuanNama:        varchar('tujuan_nama',  { length: 300 }).notNull(),
  tujuanLat:         numeric('tujuan_lat',   { precision: 12, scale: 8 }).notNull(),
  tujuanLng:         numeric('tujuan_lng',   { precision: 12, scale: 8 }).notNull(),
  tujuanAlamat:      text('tujuan_alamat'),   // hasil reverse geocode
  tujuanProvinsi:    varchar('tujuan_provinsi',  { length: 100 }),
  tujuanNegara:      varchar('tujuan_negara',    { length: 100 }),
  // Wilayah dihitung saat submit, disimpan permanen
  wilayahTipe:       wilayahTipeEnum('wilayah_tipe'),
  // Jarak
  jarakKm:           numeric('jarak_km', { precision: 10, scale: 2 }),
  // Detail dinas
  kepentingan:       text('kepentingan').notNull(),
  transportId:       uuid('transport_id').references(() => refTransport.id),
  transportLabel:    varchar('transport_label', { length: 100 }),
  // Waktu
  estBerangkat:      timestamp('est_berangkat', { withTimezone: true }).notNull(),
  estKembali:        timestamp('est_kembali',   { withTimezone: true }).notNull(),
  estimasiWaktuMenit: integer('estimasi_waktu_menit'),
  // DP
  butuhDp:           boolean('butuh_dp').notNull().default(false),
  // Lampiran (memo, WA, disposisi, dll)
  lampiranPath:      varchar('lampiran_path', { length: 500 }),
  lampiranNama:      varchar('lampiran_nama', { length: 300 }),
  laporanPath:       varchar('laporan_path', { length: 500 }),
  laporanNama:       varchar('laporan_nama', { length: 300 }),
  // Status & nomor
  status:            btoStatusEnum('status').notNull().default('DRAFT'),
  catatanAdmin:      text('catatan_admin'),
  tahun:             integer('tahun'),
  sequence:          integer('sequence'),
  submittedAt:       timestamp('submitted_at',   { withTimezone: true }),
  createdAt:         timestamp('created_at',     { withTimezone: true }).defaultNow(),
  updatedAt:         timestamp('updated_at',     { withTimezone: true }).defaultNow(),
})

// ─── bto_approval_log ────────────────────────────────────────────────────────
// Audit trail setiap perubahan status BTO
export const btoApprovalLog = pgTable('bto_approval_log', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  btoId:     uuid('bto_id').notNull().references(() => bto.id, { onDelete: 'cascade' }),
  tahap:     varchar('tahap',  { length: 50  }).notNull(), // 'admin_dp'|'pemberi_tugas'|'sdm'|'kabag'
  aksi:      varchar('aksi',   { length: 50  }).notNull(), // 'approve'|'reject'|'revision'|'submit'
  actorId:   varchar('actor_id', { length: 100 }).notNull(),
  actorNama: varchar('actor_nama', { length: 200 }),
  statusDari: varchar('status_dari', { length: 50 }),
  statusKe:  varchar('status_ke',   { length: 50 }),
  catatan:   text('catatan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
