CREATE TABLE IF NOT EXISTS "ref_tipe_rincian" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kode" varchar(30) NOT NULL,
	"label" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ref_tipe_rincian_kode_unique" UNIQUE("kode")
);
