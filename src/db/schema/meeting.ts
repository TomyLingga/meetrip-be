// ─── Schema: Meeting ──────────────────────────────────────────────────────────
import crypto from 'crypto'
import {
  pgTable, uuid, varchar, integer, text,
  boolean, timestamp, pgEnum,
} from 'drizzle-orm/pg-core'
import { refRuangMeeting } from './master'

const genUUID = () => crypto.randomUUID()

export const meetingStatusEnum = pgEnum('meeting_status', [
  'SCHEDULED',
  'ONGOING',
  'DONE',
  'CANCELLED',
])

export const fasilitasTipeEnum = pgEnum('fasilitas_tipe', [
  'snack',
  'makan_siang',
  'makan_malam',
])

// ─── meeting ──────────────────────────────────────────────────────────────────
export const meeting = pgTable('meeting', {
  id:              uuid('id').primaryKey().$defaultFn(genUUID),
  createdBy:       varchar('created_by', { length: 100 }).notNull(), // portalUserId
  createdByNama:   varchar('created_by_nama', { length: 200 }),
  topik:           varchar('topik', { length: 500 }).notNull(),
  mulai:           timestamp('mulai',   { withTimezone: true }).notNull(),
  selesai:         timestamp('selesai', { withTimezone: true }).notNull(),
  // Ruang meeting (nullable = meeting virtual saja)
  ruangId:         uuid('ruang_id').references(() => refRuangMeeting.id),
  ruangNama:       varchar('ruang_nama', { length: 100 }),
  needSoundSystem: boolean('need_sound_system').notNull().default(false),
  needZoom:        boolean('need_zoom').notNull().default(false),
  zoomLink:        varchar('zoom_link', { length: 500 }),
  catatan:         text('catatan'),
  status:          meetingStatusEnum('status').notNull().default('SCHEDULED'),
  cancelledAt:     timestamp('cancelled_at',    { withTimezone: true }),
  cancelReason:    text('cancel_reason'),
  createdAt:       timestamp('created_at',       { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at',       { withTimezone: true }).defaultNow(),
})

// ─── meeting_partisipan ───────────────────────────────────────────────────────
// Peserta meeting. is_external = true untuk vendor/pihak luar
export const meetingPartisipan = pgTable('meeting_partisipan', {
  id:         uuid('id').primaryKey().$defaultFn(genUUID),
  meetingId:  uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
  nama:       varchar('nama',  { length: 200 }).notNull(),
  email:      varchar('email', { length: 200 }),
  jabatan:    varchar('jabatan', { length: 200 }),
  isExternal: boolean('is_external').notNull().default(false),
})

// ─── meeting_fasilitas ────────────────────────────────────────────────────────
// Kebutuhan snack/makan untuk meeting
export const meetingFasilitas = pgTable('meeting_fasilitas', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  meetingId: uuid('meeting_id').notNull().references(() => meeting.id, { onDelete: 'cascade' }),
  tipe:      fasilitasTipeEnum('tipe').notNull(), // snack|makan_siang|makan_malam
  qty:       integer('qty').notNull().default(0),
  catatan:   text('catatan'),
})
