CREATE TABLE "project_collaboration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"author" text NOT NULL,
	"message" text NOT NULL,
	"starts_at" timestamp with time zone,
	"duration_minutes" integer,
	"meeting_url" text,
	"status" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"client_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_collaboration" ADD CONSTRAINT "project_collaboration_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaboration" ADD CONSTRAINT "project_collaboration_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collaboration_project_idx" ON "project_collaboration" USING btree ("project_id","submission_id","updated_at");
--> statement-breakpoint
ALTER TABLE "project_collaboration" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "project_collaboration" FROM anon, authenticated;
