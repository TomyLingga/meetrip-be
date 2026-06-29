// ─── Schema: Config & User Cache ──────────────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, timestamp,
} from 'drizzle-orm/pg-core'

const genUUID = () => crypto.randomUUID()

// ─── config_pemberi_tugas ─────────────────────────────────────────────────────
// Aturan siapa yang bisa jadi pemberi tugas.
// mode='grade_based': dropdown employee dengan grade.level > user.grade.level
// mode='fixed_person': hanya 1 orang tertentu (fixed_employee_id)
export const configPemberiTugas = pgTable('config_pemberi_tugas', {
  id:               uuid('id').primaryKey().$defaultFn(genUUID),
  mode:             varchar('mode', { length: 20 }).notNull().default('grade_based'), // 'grade_based'|'fixed_person'
  fixedEmployeeId:  varchar('fixed_employee_id', { length: 100 }), // portal employee id
  minGradeLevel:    integer('min_grade_level'),                     // untuk grade_based
  keterangan:       text('keterangan'),
  isActive:         boolean('is_active').notNull().default(true),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── config_approver_spdk ────────────────────────────────────────────────────
// Siapa yang approve SPDK (Kabag SDM & Sistem)
// mode='fixed_person': orang tertentu
// mode='unit_head': Kepala Bagian/Manager unit user
export const configApproverSpdk = pgTable('config_approver_spdk', {
  id:              uuid('id').primaryKey().$defaultFn(genUUID),
  mode:            varchar('mode', { length: 20 }).notNull().default('unit_head'), // 'fixed_person'|'unit_head'
  fixedEmployeeId: varchar('fixed_employee_id', { length: 100 }),
  keterangan:      text('keterangan'),
  isActive:        boolean('is_active').notNull().default(true),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ─── local_user_cache ────────────────────────────────────────────────────────
// Cache data user dari portal SSO (diperbarui setiap login/verif SSO)
// portalUserId = UUID user dari tabel users portal
export const localUserCache = pgTable('local_user_cache', {
  id:               uuid('id').primaryKey().$defaultFn(genUUID),
  portalUserId:     varchar('portal_user_id',  { length: 100 }).notNull().unique(),
  employeeId:       varchar('employee_id',      { length: 100 }), // ID karyawan di portal
  email:            varchar('email',            { length: 200 }).notNull(),
  nama:             varchar('nama',             { length: 200 }),
  gradeKode:        varchar('grade_kode',       { length: 20  }),
  gradeLevel:       integer('grade_level'),
  unitId:           varchar('unit_id',          { length: 100 }),
  unitNama:         varchar('unit_nama',        { length: 200 }),
  penempatanAreaId: varchar('penempatan_area_id', { length: 100 }),
  penempatanNama:   varchar('penempatan_nama',    { length: 200 }),
  penempatanLat:    varchar('penempatan_lat',     { length: 50  }),
  penempatanLng:    varchar('penempatan_lng',     { length: 50  }),
  penempatanProvinsi: varchar('penempatan_provinsi', { length: 100 }),
  role:             varchar('role', { length: 50 }), // role di portal
  lastSync:         timestamp('last_sync', { withTimezone: true }).defaultNow(),
})

// ─── refresh_token ────────────────────────────────────────────────────────────
// Refresh token untuk session MeeTrip
export const refreshToken = pgTable('refresh_token', {
  id:          uuid('id').primaryKey().$defaultFn(genUUID),
  userId:      varchar('user_id', { length: 100 }).notNull(), // portalUserId
  token:       varchar('token',   { length: 200 }).notNull().unique(),
  expiresAt:   timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
})
