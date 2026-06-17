create table if not exists operation_log (
  id text primary key default 'op_' || replace(gen_random_uuid()::text, '-', ''),
  actor_user_id text references app_user(id) on delete set null,
  actor_name text,
  action text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_operation_log_created_at on operation_log(created_at desc);
create index if not exists idx_operation_log_actor on operation_log(actor_user_id, created_at desc);
create index if not exists idx_operation_log_target on operation_log(target_type, target_id);
