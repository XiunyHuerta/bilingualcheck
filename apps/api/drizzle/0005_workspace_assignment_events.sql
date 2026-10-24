-- Custom SQL migration file, put your code below! --
-- Screened-out and abandoned submissions are not presented as assigned team members.
DROP TRIGGER submission_activity_v2 ON public.submissions;
CREATE TRIGGER submission_activity_v2 AFTER INSERT OR UPDATE ON public.submissions
FOR EACH ROW WHEN (NEW.status IN ('screen_passed','in_progress','awaiting_review','approved'))
EXECUTE FUNCTION public.record_submission_activity_v2();
