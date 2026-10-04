-- Accounts are Worker-issued UUIDs stored in KV, not auth.users.
-- Only the authenticated Worker may access this table with its service role.
create table if not exists public.user_story_reads (
  user_id uuid not null,
  story_id text not null check (story_id ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  completed_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

alter table public.user_story_reads enable row level security;
revoke all on table public.user_story_reads from public, anon, authenticated, service_role;
grant select, insert on table public.user_story_reads to service_role;

comment on table public.user_story_reads is
  'Completed story segments; Worker session owner only. No public or Supabase Auth access. Duplicate marks preserve the original completion timestamp.';
