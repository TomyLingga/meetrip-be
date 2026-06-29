DO $$ BEGIN
 CREATE TYPE "public"."bto_status" AS ENUM('DRAFT', 'SUBMITTED', 'ADMIN_DP_REVIEW', 'REVISION_DP', 'PT_REVIEW', 'SDM_REVIEW', 'SPDK_DRAFT', 'KABAG_REVIEW', 'ACTIVE', 'ATTENDED', 'REPORT_UPLOADED', 'COMPLETED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."wilayah_tipe" AS ENUM('dalam_wilayah', 'luar_wilayah', 'luar_negeri');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."dp_status" AS ENUM('DRAFT', 'SUBMITTED', 'ADMIN_REVIEW', 'REVISION', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."spdk_status" AS ENUM('DRAFT', 'KABAG_REVIEW', 'APPROVED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."bte_status" AS ENUM('DRAFT', 'SUBMITTED', 'ADMIN_REVIEW', 'REVISION', 'APPROVED', 'REJECTED', 'PENDING_PAYMENT', 'PAID');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."fasilitas_tipe" AS ENUM('snack', 'makan_siang', 'makan_malam');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."meeting_status" AS ENUM('SCHEDULED', 'ONGOING', 'DONE', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config_sistem" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kunci" varchar(100) NOT NULL,
	"nilai" text NOT NULL,
	"label" varchar(200),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "config_sistem_kunci_unique" UNIQUE("kunci")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_grade" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"keterangan" text,
	CONSTRAINT "ref_grade_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_pagu" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rincian_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"wilayah_tipe" varchar(30) NOT NULL,
	"nilai" numeric(15, 2) DEFAULT '0' NOT NULL,
	"use_dollar" boolean DEFAULT false NOT NULL,
	"is_unlimited" boolean DEFAULT false NOT NULL,
	"berlaku_dari" date,
	"berlaku_sampai" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_rincian_biaya" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(30) NOT NULL,
	"label" varchar(150) NOT NULL,
	"has_pagu" boolean DEFAULT true NOT NULL,
	"per_malam" boolean DEFAULT false NOT NULL,
	"use_dollar_override" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ref_rincian_biaya_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_ruang_meeting" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nama" varchar(100) NOT NULL,
	"lokasi" varchar(200),
	"kapasitas" integer DEFAULT 0 NOT NULL,
	"has_sound_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ref_transport" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(30) NOT NULL,
	"label" varchar(100) NOT NULL,
	"tipe" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ref_transport_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config_approver_spdk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(20) DEFAULT 'unit_head' NOT NULL,
	"fixed_employee_id" varchar(100),
	"keterangan" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config_pemberi_tugas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" varchar(20) DEFAULT 'grade_based' NOT NULL,
	"fixed_employee_id" varchar(100),
	"min_grade_level" integer,
	"keterangan" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "local_user_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portal_user_id" varchar(100) NOT NULL,
	"employee_id" varchar(100),
	"email" varchar(200) NOT NULL,
	"nama" varchar(200),
	"grade_kode" varchar(20),
	"grade_level" integer,
	"unit_id" varchar(100),
	"unit_nama" varchar(200),
	"penempatan_area_id" varchar(100),
	"penempatan_nama" varchar(200),
	"penempatan_lat" varchar(50),
	"penempatan_lng" varchar(50),
	"penempatan_provinsi" varchar(100),
	"role" varchar(50),
	"last_sync" timestamp with time zone DEFAULT now(),
	CONSTRAINT "local_user_cache_portal_user_id_unique" UNIQUE("portal_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"token" varchar(200) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bto" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nomor_bto" varchar(50),
	"employee_id" varchar(100) NOT NULL,
	"employee_nama" varchar(200),
	"pemberi_tugas_id" varchar(100),
	"pemberi_tugas_nama" varchar(200),
	"tujuan_nama" varchar(300) NOT NULL,
	"tujuan_lat" numeric(12, 8) NOT NULL,
	"tujuan_lng" numeric(12, 8) NOT NULL,
	"tujuan_alamat" text,
	"tujuan_provinsi" varchar(100),
	"tujuan_negara" varchar(100),
	"wilayah_tipe" "wilayah_tipe",
	"jarak_km" numeric(10, 2),
	"kepentingan" text NOT NULL,
	"transport_id" uuid,
	"transport_label" varchar(100),
	"est_berangkat" timestamp with time zone NOT NULL,
	"est_kembali" timestamp with time zone NOT NULL,
	"estimasi_waktu_menit" integer,
	"butuh_dp" boolean DEFAULT false NOT NULL,
	"lampiran_path" varchar(500),
	"lampiran_nama" varchar(300),
	"status" "bto_status" DEFAULT 'DRAFT' NOT NULL,
	"catatan_admin" text,
	"tahun" integer,
	"sequence" integer,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bto_nomor_bto_unique" UNIQUE("nomor_bto")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bto_approval_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bto_id" uuid NOT NULL,
	"tahap" varchar(50) NOT NULL,
	"aksi" varchar(50) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"actor_nama" varchar(200),
	"status_dari" varchar(50),
	"status_ke" varchar(50),
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dp" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bto_id" uuid NOT NULL,
	"status" "dp_status" DEFAULT 'DRAFT' NOT NULL,
	"exchange_rate_usd" numeric(15, 4) DEFAULT '0',
	"total_idr" numeric(18, 2) DEFAULT '0',
	"total_usd" numeric(15, 2) DEFAULT '0',
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "dp_bto_id_unique" UNIQUE("bto_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dp_approval_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dp_id" uuid NOT NULL,
	"aksi" varchar(50) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"actor_nama" varchar(200),
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dp_rincian" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dp_id" uuid NOT NULL,
	"rincian_id" uuid NOT NULL,
	"rincian_label" varchar(150),
	"jumlah_hari" integer DEFAULT 1 NOT NULL,
	"nilai_per_hari" numeric(15, 2) DEFAULT '0' NOT NULL,
	"nilai_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"use_dollar" boolean DEFAULT false NOT NULL,
	"nilai_usd" numeric(15, 2) DEFAULT '0',
	"pagu_saat_input" numeric(15, 2),
	"is_unlimited" boolean DEFAULT false NOT NULL,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attend_stamp" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bto_id" uuid NOT NULL,
	"employee_id" varchar(100) NOT NULL,
	"stamp_lat" numeric(12, 8),
	"stamp_lng" numeric(12, 8),
	"jarak_dari_tujuan_m" numeric(10, 2),
	"is_valid" boolean DEFAULT false NOT NULL,
	"is_admin_override" boolean DEFAULT false NOT NULL,
	"override_oleh" varchar(100),
	"override_oleh_nama" varchar(200),
	"stamped_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spdk" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nomor_spdk" varchar(50),
	"bto_id" uuid NOT NULL,
	"nomor_bto" varchar(50),
	"status" "spdk_status" DEFAULT 'DRAFT' NOT NULL,
	"diterbitkan_oleh" varchar(100),
	"diterbitkan_nama" varchar(200),
	"tanggal_terbit" timestamp with time zone,
	"catatan_admin" text,
	"approver_kabag_id" varchar(100),
	"approver_kabag_nama" varchar(200),
	"tahun" varchar(4),
	"sequence" varchar(10),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "spdk_nomor_spdk_unique" UNIQUE("nomor_spdk"),
	CONSTRAINT "spdk_bto_id_unique" UNIQUE("bto_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spdk_approval_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"spdk_id" uuid NOT NULL,
	"aksi" varchar(50) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"actor_nama" varchar(200),
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bte" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bto_id" uuid NOT NULL,
	"status" "bte_status" DEFAULT 'DRAFT' NOT NULL,
	"tgl_berangkat" timestamp with time zone,
	"jam_berangkat" varchar(10),
	"tgl_kembali" timestamp with time zone,
	"jam_kembali" varchar(10),
	"laporan_path" varchar(500),
	"laporan_nama" varchar(300),
	"kuitansi_path" varchar(500),
	"kuitansi_nama" varchar(300),
	"exchange_rate_usd" numeric(15, 4) DEFAULT '0',
	"total_idr" numeric(18, 2) DEFAULT '0',
	"total_usd" numeric(15, 2) DEFAULT '0',
	"submitted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_by" varchar(100),
	"paid_by_nama" varchar(200),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "bte_bto_id_unique" UNIQUE("bto_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bte_approval_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bte_id" uuid NOT NULL,
	"aksi" varchar(50) NOT NULL,
	"actor_id" varchar(100) NOT NULL,
	"actor_nama" varchar(200),
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bte_biaya_lain" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bte_id" uuid NOT NULL,
	"keterangan" varchar(300) NOT NULL,
	"nilai" numeric(15, 2) DEFAULT '0' NOT NULL,
	"use_dollar" boolean DEFAULT false NOT NULL,
	"nilai_usd" numeric(15, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bte_rincian" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bte_id" uuid NOT NULL,
	"rincian_id" uuid NOT NULL,
	"rincian_label" varchar(150),
	"jumlah_hari" integer DEFAULT 1 NOT NULL,
	"nilai_per_hari" numeric(15, 2) DEFAULT '0' NOT NULL,
	"nilai_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"use_dollar" boolean DEFAULT false NOT NULL,
	"nilai_usd" numeric(15, 2) DEFAULT '0',
	"pagu_saat_input" numeric(15, 2),
	"is_unlimited" boolean DEFAULT false NOT NULL,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"created_by_nama" varchar(200),
	"topik" varchar(500) NOT NULL,
	"mulai" timestamp with time zone NOT NULL,
	"selesai" timestamp with time zone NOT NULL,
	"ruang_id" uuid,
	"ruang_nama" varchar(100),
	"need_sound_system" boolean DEFAULT false NOT NULL,
	"need_zoom" boolean DEFAULT false NOT NULL,
	"zoom_link" varchar(500),
	"catatan" text,
	"status" "meeting_status" DEFAULT 'SCHEDULED' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_fasilitas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"tipe" "fasilitas_tipe" NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_partisipan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"nama" varchar(200) NOT NULL,
	"email" varchar(200),
	"jabatan" varchar(200),
	"is_external" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ref_pagu" ADD CONSTRAINT "ref_pagu_rincian_id_ref_rincian_biaya_id_fk" FOREIGN KEY ("rincian_id") REFERENCES "public"."ref_rincian_biaya"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ref_pagu" ADD CONSTRAINT "ref_pagu_grade_id_ref_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."ref_grade"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bto" ADD CONSTRAINT "bto_transport_id_ref_transport_id_fk" FOREIGN KEY ("transport_id") REFERENCES "public"."ref_transport"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bto_approval_log" ADD CONSTRAINT "bto_approval_log_bto_id_bto_id_fk" FOREIGN KEY ("bto_id") REFERENCES "public"."bto"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dp" ADD CONSTRAINT "dp_bto_id_bto_id_fk" FOREIGN KEY ("bto_id") REFERENCES "public"."bto"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dp_approval_log" ADD CONSTRAINT "dp_approval_log_dp_id_dp_id_fk" FOREIGN KEY ("dp_id") REFERENCES "public"."dp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dp_rincian" ADD CONSTRAINT "dp_rincian_dp_id_dp_id_fk" FOREIGN KEY ("dp_id") REFERENCES "public"."dp"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dp_rincian" ADD CONSTRAINT "dp_rincian_rincian_id_ref_rincian_biaya_id_fk" FOREIGN KEY ("rincian_id") REFERENCES "public"."ref_rincian_biaya"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attend_stamp" ADD CONSTRAINT "attend_stamp_bto_id_bto_id_fk" FOREIGN KEY ("bto_id") REFERENCES "public"."bto"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spdk" ADD CONSTRAINT "spdk_bto_id_bto_id_fk" FOREIGN KEY ("bto_id") REFERENCES "public"."bto"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spdk_approval_log" ADD CONSTRAINT "spdk_approval_log_spdk_id_spdk_id_fk" FOREIGN KEY ("spdk_id") REFERENCES "public"."spdk"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bte" ADD CONSTRAINT "bte_bto_id_bto_id_fk" FOREIGN KEY ("bto_id") REFERENCES "public"."bto"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bte_approval_log" ADD CONSTRAINT "bte_approval_log_bte_id_bte_id_fk" FOREIGN KEY ("bte_id") REFERENCES "public"."bte"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bte_biaya_lain" ADD CONSTRAINT "bte_biaya_lain_bte_id_bte_id_fk" FOREIGN KEY ("bte_id") REFERENCES "public"."bte"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bte_rincian" ADD CONSTRAINT "bte_rincian_bte_id_bte_id_fk" FOREIGN KEY ("bte_id") REFERENCES "public"."bte"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bte_rincian" ADD CONSTRAINT "bte_rincian_rincian_id_ref_rincian_biaya_id_fk" FOREIGN KEY ("rincian_id") REFERENCES "public"."ref_rincian_biaya"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting" ADD CONSTRAINT "meeting_ruang_id_ref_ruang_meeting_id_fk" FOREIGN KEY ("ruang_id") REFERENCES "public"."ref_ruang_meeting"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_fasilitas" ADD CONSTRAINT "meeting_fasilitas_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meeting_partisipan" ADD CONSTRAINT "meeting_partisipan_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
