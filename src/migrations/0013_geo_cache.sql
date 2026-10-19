CREATE TABLE IF NOT EXISTS "geo_place_cache" (
	"place_key" varchar(120) PRIMARY KEY NOT NULL,
	"source" varchar(20) NOT NULL,
	"nama" varchar(255) NOT NULL,
	"alamat" text DEFAULT '' NOT NULL,
	"kategori" varchar(60),
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"search_text" text NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_reverse_cache" (
	"coord_key" varchar(40) PRIMARY KEY NOT NULL,
	"alamat" text DEFAULT '' NOT NULL,
	"provinsi" varchar(120),
	"provinsi_kode" varchar(10),
	"negara" varchar(120),
	"negara_kode" varchar(2),
	"source" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- grade_label sudah ada di schema (config.ts) tanpa file migrasi; di DB yang
-- dibuat lewat db:push kolom ini sudah ada, jadi IF NOT EXISTS agar aman di keduanya.
ALTER TABLE "local_user_cache" ADD COLUMN IF NOT EXISTS "grade_label" varchar(150);