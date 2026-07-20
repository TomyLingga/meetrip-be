CREATE TABLE IF NOT EXISTS "travel_monthly_budget" (
	"id" uuid PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount_idr" numeric(20, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"updated_by" varchar(100),
	"updated_by_nama" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "bto" ADD COLUMN "employee_unit_id" varchar(100);--> statement-breakpoint
ALTER TABLE "bto" ADD COLUMN "employee_unit_nama" varchar(200);--> statement-breakpoint
UPDATE "bto" AS b
SET
	"employee_unit_id" = cache."unit_id",
	"employee_unit_nama" = cache."unit_nama"
FROM "local_user_cache" AS cache
WHERE cache."portal_user_id" = b."employee_id"
	AND (b."employee_unit_id" IS NULL OR b."employee_unit_nama" IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "travel_monthly_budget_year_month_unique" ON "travel_monthly_budget" ("year","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bto_employee_id_idx" ON "bto" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bto_pemberi_tugas_id_idx" ON "bto" ("pemberi_tugas_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bto_employee_unit_id_idx" ON "bto" ("employee_unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bto_est_berangkat_idx" ON "bto" ("est_berangkat");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bto_status_idx" ON "bto" ("status");
