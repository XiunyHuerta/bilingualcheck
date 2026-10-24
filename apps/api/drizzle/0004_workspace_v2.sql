CREATE TABLE "project_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"task_id" uuid,
	"submission_id" uuid,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"origin_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"assigned_submission_id" uuid,
	"due_at" timestamp with time zone,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deliverables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_submission_id_submissions_id_fk" FOREIGN KEY ("assigned_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_activity_recent_idx" ON "project_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_tasks_origin_idx" ON "project_tasks" USING btree ("project_id","origin_key");
--> statement-breakpoint
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON project_tasks, project_activity FROM anon, authenticated;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check CHECK (status IN ('todo','in_progress','blocked','in_review','completed'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bilingualcheck_api') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON project_tasks TO bilingualcheck_api;
    GRANT SELECT,INSERT ON project_activity TO bilingualcheck_api;
    GRANT SELECT,INSERT,UPDATE ON project_collaboration TO bilingualcheck_api;
    CREATE POLICY workspace_tasks_api ON project_tasks TO bilingualcheck_api USING(true) WITH CHECK(true);
    CREATE POLICY workspace_activity_api ON project_activity TO bilingualcheck_api USING(true) WITH CHECK(true);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_collaboration' AND policyname='collaboration_api') THEN
      CREATE POLICY collaboration_api ON project_collaboration TO bilingualcheck_api USING(true) WITH CHECK(true);
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_project_activity_v2() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO project_activity(project_id,actor,action,new_status) VALUES(NEW.id,'owner','goal_received',NEW.status);
  ELSE
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO project_activity(project_id,actor,action,previous_status,new_status)
      VALUES(NEW.id,'system','project_status',OLD.status,NEW.status);
    END IF;
    IF OLD.brief_confirmed = false AND NEW.brief_confirmed = true THEN
      INSERT INTO project_activity(project_id,actor,action) VALUES(NEW.id,'owner','plan_approved');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_activity_v2 AFTER INSERT OR UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION public.record_project_activity_v2();
--> statement-breakpoint
CREATE FUNCTION public.record_submission_activity_v2() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE project_uuid uuid; next_task_status text;
BEGIN
  SELECT project_id INTO project_uuid FROM terac_opportunities WHERE id = NEW.opportunity_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO project_activity(project_id,actor,action,submission_id,new_status)
    VALUES(project_uuid,'professional','professional_assigned',NEW.id,NEW.status);
  ELSE
    IF NEW.content_version IS DISTINCT FROM OLD.content_version THEN
      INSERT INTO project_activity(project_id,actor,action,submission_id) VALUES(project_uuid,'professional','delivery_received',NEW.id);
    END IF;
    IF NEW.reviewed_version IS DISTINCT FROM OLD.reviewed_version THEN
      INSERT INTO project_activity(project_id,actor,action,submission_id) VALUES(project_uuid,'agent','review_completed',NEW.id);
    END IF;
    IF NEW.client_decision IS NOT NULL AND NEW.client_decision IS DISTINCT FROM OLD.client_decision THEN
      INSERT INTO project_activity(project_id,actor,action,submission_id,detail)
      VALUES(project_uuid,'owner',CASE WHEN NEW.client_decision='approved' THEN 'delivery_approved' ELSE 'changes_requested' END,NEW.id,NEW.client_feedback);
    END IF;
  END IF;
  next_task_status := CASE WHEN NEW.client_decision='approved' THEN 'completed'
    WHEN NEW.client_decision='changes_requested' THEN 'in_progress'
    WHEN NEW.status='awaiting_review' AND NEW.content_version > 0 THEN 'in_review'
    WHEN NEW.status='in_progress' THEN 'in_progress' ELSE NULL END;
  IF next_task_status IS NOT NULL THEN
    UPDATE project_tasks SET status=next_task_status, assigned_submission_id=NEW.id, updated_at=now(), version=version+1
    WHERE project_id=project_uuid AND (assigned_submission_id=NEW.id OR assigned_submission_id IS NULL)
      AND (status <> next_task_status OR assigned_submission_id IS NULL)
      AND (status NOT IN ('blocked','completed') OR next_task_status='completed');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER submission_activity_v2 AFTER INSERT OR UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION public.record_submission_activity_v2();
--> statement-breakpoint
-- Bring existing approved scopes into the board without creating fictional activity events.
INSERT INTO project_tasks(project_id,origin_key,title,description,status,assigned_submission_id,deliverables)
SELECT p.id,'brief:' || (d.position - 1)::text,left(d.title,500),
  COALESCE((SELECT string_agg(c.value,E'\n') FROM jsonb_array_elements_text(COALESCE(p.brief->'acceptance_criteria','[]'::jsonb)) AS c(value)),''),
  CASE WHEN p.status='delivered' OR member.client_decision='approved' THEN 'completed'
    WHEN member.status='awaiting_review' AND member.content_version > 0 THEN 'in_review'
    WHEN member.status='in_progress' THEN 'in_progress' ELSE 'todo' END,
  member.id,jsonb_build_array(d.title)
FROM projects p CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.brief->'deliverables','[]'::jsonb)) WITH ORDINALITY AS d(title,position)
LEFT JOIN LATERAL (
  SELECT s.id,s.status,s.client_decision,s.content_version FROM submissions s
  JOIN terac_opportunities o ON o.id=s.opportunity_id WHERE o.project_id=p.id
    AND s.status IN ('in_progress','awaiting_review','approved') ORDER BY s.created_at LIMIT 1
) member ON true
WHERE p.brief_confirmed=true
ON CONFLICT(project_id,origin_key) DO NOTHING;
