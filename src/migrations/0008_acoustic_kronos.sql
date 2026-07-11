ALTER TABLE "ref_rincian_biaya" ADD COLUMN "kategori" varchar(50) DEFAULT 'lain_lain' NOT NULL;--> statement-breakpoint
ALTER TABLE "dp_rincian" ADD COLUMN "kategori" varchar(50) DEFAULT 'lain_lain' NOT NULL;--> statement-breakpoint
ALTER TABLE "bte_rincian" ADD COLUMN "kategori" varchar(50) DEFAULT 'lain_lain' NOT NULL;