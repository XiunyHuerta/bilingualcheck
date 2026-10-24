-- Configuración de Supabase que Drizzle no gestiona. Idempotente: se puede
-- ejecutar varias veces (lo hace `pnpm db:migrate` después de las migraciones).

-- 1. RLS. El backend usa la service role (salta RLS). La app solo lee por
--    Realtime con el JWT de sesión, cuyo `sub` es users.id.
alter table users enable row level security;
alter table projects enable row level security;
alter table messages enable row level security;
alter table assets enable row level security;
alter table quotes enable row level security;
alter table payments enable row level security;
alter table terac_opportunities enable row level security;
alter table submissions enable row level security;
alter table project_collaboration enable row level security;
alter table project_tasks enable row level security;
alter table project_activity enable row level security;
-- Workspace data is served through owner-checked API routes only.
revoke all on table project_tasks, project_activity from anon, authenticated;
-- Contact is accessible only through authenticated API routes, including read receipts.
revoke all on table project_collaboration from anon, authenticated;
alter table agent_runs enable row level security;
alter table webhook_events enable row level security;
alter table tool_invocations enable row level security;

drop policy if exists "own projects" on projects;
create policy "own projects" on projects
  for select to authenticated
  using (user_id::text = auth.jwt() ->> 'sub');

drop policy if exists "own messages" on messages;
create policy "own messages" on messages
  for select to authenticated
  using (user_id::text = auth.jwt() ->> 'sub');

-- 2. Realtime en messages y projects.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'projects') then
    alter publication supabase_realtime add table projects;
  end if;
end $$;

-- 3. Buckets privados (subida y descarga solo con URLs firmadas).
insert into storage.buckets (id, name, public)
values ('client-uploads', 'client-uploads', false), ('deliverables', 'deliverables', false)
on conflict (id) do nothing;
