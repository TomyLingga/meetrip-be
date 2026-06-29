CREATE TABLE IF NOT EXISTS "meetrip_user_role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portal_user_id" varchar(100) NOT NULL,
	"role" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "meetrip_user_role_portal_user_id_unique" UNIQUE("portal_user_id")
);
