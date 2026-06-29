// ─── Schema: SPDK & Attend Stamp ─────────────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, text,
  boolean, numeric, timestamp, pgEnum,
} from 'drizzle-orm/pg-core'
import { bto } from './bto'

const genUUID = () => crypto.randomUUID()

export const spdkStatusEnum = pgEnum('spdk_status', [
  'DRAFT',
  'KABAG_REVIEW',
  'APPROVED',
  'REJECTED',
])

// ─── spdk ─────────────────────────────────────────────────────────────────────
export const spdk = pgTable('spdk', {
  id:               uuid('id').primaryKey().$defaultFn(genUUID),
  nomorSpdk:        varchar('nomor_spdk', { length: 50 }).unique(),
  btoId:            uuid('bto_id').notNull().unique().references(() => bto.id, { onDelete: 'cascade' }),
  nomorBto:         varchar('nomor_bto', { length: 50 }), // disimpan otomatis dari BTO
  status:           spdkStatusEnum('status').notNull().default('DRAFT'),
  diterbitkanOleh:  varchar('diterbitkan_oleh',   { length: 100 }), // portalUserId admin
  diterbitkanNama:  varchar('diterbitkan_nama',    { length: 200 }),
  tanggalTerbit:    timestamp('tanggal_terbit',    { withTimezone: true }),
  catatanAdmin:     text('catatan_admin'),
  // Kabag approver (dihitung dari config_approver_spdk)
  approverKabagId:  varchar('approver_kabag_id',   { length: 100 }),
  approverKabagNama: varchar('approver_kabag_nama', { length: 200 }),
  tahun:            varchar('tahun', { length: 4 }),
  sequence:         varchar('sequence', { length: 10 }),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── spdk_approval_log ────────────────────────────────────────────────────────
export const spdkApprovalLog = pgTable('spdk_approval_log', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  spdkId:    uuid('spdk_id').notNull().references(() => spdk.id, { onDelete: 'cascade' }),
  aksi:      varchar('aksi',     { length: 50  }).notNull(), // 'issued'|'approve'|'reject'
  actorId:   varchar('actor_id', { length: 100 }).notNull(),
  actorNama: varchar('actor_nama', { length: 200 }),
  catatan:   text('catatan'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ─── attend_stamp ────────────────────────────────────────────────────────────
// Bukti kehadiran di lokasi tujuan dinas (pengganti stempel instansi)
export const attendStamp = pgTable('attend_stamp', {
  id:                 uuid('id').primaryKey().$defaultFn(genUUID),
  btoId:              uuid('bto_id').notNull().references(() => bto.id, { onDelete: 'cascade' }),
  employeeId:         varchar('employee_id', { length: 100 }).notNull(),
  stampLat:           numeric('stamp_lat', { precision: 12, scale: 8 }),
  stampLng:           numeric('stamp_lng', { precision: 12, scale: 8 }),
  jarakDariTujuanM:   numeric('jarak_dari_tujuan_m', { precision: 10, scale: 2 }),
  isValid:            boolean('is_valid').notNull().default(false), // dalam radius atau tidak
  isAdminOverride:    boolean('is_admin_override').notNull().default(false),
  overrideOleh:       varchar('override_oleh', { length: 100 }), // admin yang override
  overrideOlehNama:   varchar('override_oleh_nama', { length: 200 }),
  stamped_at:         timestamp('stamped_at', { withTimezone: true }).defaultNow(),
})
