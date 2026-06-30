// ─── Schema: Master & Referensi ───────────────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, numeric, date, timestamp,
} from 'drizzle-orm/pg-core'

const genUUID = () => crypto.randomUUID()


// ─── ref_transport ────────────────────────────────────────────────────────────
// Moda transportasi: perusahaan | publik | pesawat
export const refTransport = pgTable('ref_transport', {
  id:       uuid('id').primaryKey().$defaultFn(genUUID),
  kode:     varchar('kode',  { length: 30  }).notNull().unique(),
  label:    varchar('label', { length: 100 }).notNull(),
  tipe:     varchar('tipe',  { length: 30  }).notNull(), // 'perusahaan'|'publik'|'pesawat'
  isActive: boolean('is_active').notNull().default(true),
})

// ─── ref_rincian_biaya ────────────────────────────────────────────────────────
// Jenis biaya perjalanan dinas (sarapan, hotel, tiket pesawat, dll)
export const refRincianBiaya = pgTable('ref_rincian_biaya', {
  id:                uuid('id').primaryKey().$defaultFn(genUUID),
  kode:              varchar('kode',  { length: 30  }).notNull().unique(),
  label:             varchar('label', { length: 150 }).notNull(),
  hasPagu:           boolean('has_pagu').notNull().default(true),
  perMalam:          boolean('per_malam').notNull().default(false), // Hotel: per malam bukan per hari
  useDollarOverride: boolean('use_dollar_override').notNull().default(false),
  isActive:          boolean('is_active').notNull().default(true),
})

// ─── ref_pagu ─────────────────────────────────────────────────────────────────
// Pagu per rincian + grade + wilayah_tipe.
// Versioning: berlaku_dari / berlaku_sampai (null = berlaku selamanya)
export const refPagu = pgTable('ref_pagu', {
  id:           uuid('id').primaryKey().$defaultFn(genUUID),
  rincianId:    uuid('rincian_id').notNull().references(() => refRincianBiaya.id),
  gradeId:      uuid('grade_id').notNull(),
  wilayahTipe:  varchar('wilayah_tipe', { length: 30 }).notNull(), // 'dalam_wilayah'|'luar_wilayah'|'luar_negeri'
  nilai:        numeric('nilai', { precision: 15, scale: 2 }).notNull().default('0'),
  useDollar:    boolean('use_dollar').notNull().default(false),
  isUnlimited:  boolean('is_unlimited').notNull().default(false), // tiket pesawat: tanpa pagu
  berlakuDari:  date('berlaku_dari'),
  berlakuSampai: date('berlaku_sampai'),
})

// ─── ref_ruang_meeting ────────────────────────────────────────────────────────
export const refRuangMeeting = pgTable('ref_ruang_meeting', {
  id:             uuid('id').primaryKey().$defaultFn(genUUID),
  nama:           varchar('nama',    { length: 100 }).notNull(),
  lokasi:         varchar('lokasi',  { length: 200 }),
  kapasitas:      integer('kapasitas').notNull().default(0),
  hasSoundSystem: boolean('has_sound_system').notNull().default(false),
  isActive:       boolean('is_active').notNull().default(true),
})

// ─── config_sistem ────────────────────────────────────────────────────────────
// Config global aplikasi (attend radius, dsb)
export const configSistem = pgTable('config_sistem', {
  id:    uuid('id').primaryKey().$defaultFn(genUUID),
  kunci: varchar('kunci', { length: 100 }).notNull().unique(),
  nilai: text('nilai').notNull(),
  label: varchar('label', { length: 200 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})
