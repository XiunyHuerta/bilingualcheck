ALTER TABLE "submissions" ADD COLUMN "delivery_text" text;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "delivery_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "content_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "reviewed_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "review_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "review_error" text;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_delivery_asset_id_assets_id_fk" FOREIGN KEY ("delivery_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;