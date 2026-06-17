create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists role (
  id text primary key default 'role_' || replace(gen_random_uuid()::text, '-', ''),
  key text not null unique,
  name text not null,
  data_scope text not null default '授权数据',
  priority integer not null default 0,
  user_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists permission (
  id text primary key default 'perm_' || replace(gen_random_uuid()::text, '-', ''),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists role_permission (
  role_id text not null references role(id) on delete cascade,
  permission_id text not null references permission(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists app_user (
  id text primary key default 'user_' || replace(gen_random_uuid()::text, '-', ''),
  username text not null unique,
  password_hash text not null,
  name text not null,
  department text not null default '',
  data_scope text not null default 'self',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_role (
  user_id text not null references app_user(id) on delete cascade,
  role_id text not null references role(id) on delete cascade,
  primary key (user_id, role_id)
);

create table if not exists import_batch (
  id text primary key default 'batch_' || replace(gen_random_uuid()::text, '-', ''),
  source_system text not null check (source_system in ('taobao', 'wechat', 'manual', 'system')),
  mode text not null default 'incremental',
  file_name text,
  status text not null default 'pending',
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists person (
  id text primary key default 'person_' || replace(gen_random_uuid()::text, '-', ''),
  person_type text not null default 'customer' check (person_type in ('customer', 'staff', 'unknown')),
  display_name text not null,
  mobile text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists platform_account (
  id text primary key default 'acct_' || replace(gen_random_uuid()::text, '-', ''),
  person_id text references person(id) on delete set null,
  platform text not null check (platform in ('taobao', 'wechat')),
  platform_account_id text not null,
  display_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, platform_account_id)
);

create table if not exists raw_message (
  id text primary key default 'msg_' || replace(gen_random_uuid()::text, '-', ''),
  source_system text not null check (source_system in ('taobao', 'wechat')),
  source_message_id text not null,
  source_chat_id text not null,
  source_sender_id text not null,
  sender_name text,
  person_id text references person(id) on delete set null,
  sent_at timestamptz not null,
  role_raw text,
  normalized_role text not null default 'unknown' check (normalized_role in ('customer', 'service', 'sales', 'after_sales', 'bot', 'system', 'unknown')),
  content text,
  message_type text not null default 'text',
  media_url text,
  media_path text,
  media_mime_type text,
  media_size_bytes bigint,
  media_width integer,
  media_height integer,
  duration_seconds numeric(10,2),
  file_name text,
  thumbnail_url text,
  ocr_text text,
  transcript_text text,
  media_description text,
  image_description text,
  link_url text,
  link_title text,
  attachments jsonb not null default '[]'::jsonb,
  structured_content jsonb not null default '{}'::jsonb,
  media_metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  import_batch_id text references import_batch(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_system, source_message_id)
);

create index if not exists idx_raw_message_source_chat_time on raw_message(source_system, source_chat_id, sent_at);
create index if not exists idx_raw_message_person_time on raw_message(person_id, sent_at);
create index if not exists idx_raw_message_role on raw_message(normalized_role);
create index if not exists idx_raw_message_type on raw_message(message_type);
create index if not exists idx_raw_message_content_trgm on raw_message using gin (content gin_trgm_ops);
create index if not exists idx_raw_message_ocr_trgm on raw_message using gin (ocr_text gin_trgm_ops);
create index if not exists idx_raw_message_transcript_trgm on raw_message using gin (transcript_text gin_trgm_ops);
create index if not exists idx_raw_message_media_desc_trgm on raw_message using gin (media_description gin_trgm_ops);
create index if not exists idx_raw_message_image_desc_trgm on raw_message using gin (image_description gin_trgm_ops);
create index if not exists idx_raw_message_attachments_gin on raw_message using gin (attachments);
create index if not exists idx_raw_message_structured_content_gin on raw_message using gin (structured_content);
create index if not exists idx_raw_message_payload_gin on raw_message using gin (raw_payload);

create table if not exists identity_match (
  id text primary key default 'match_' || replace(gen_random_uuid()::text, '-', ''),
  person_id text references person(id) on delete set null,
  taobao_account_id text references platform_account(id) on delete set null,
  wechat_account_id text references platform_account(id) on delete set null,
  match_method text not null,
  confidence numeric(5,4) not null default 0,
  status text not null default 'pending',
  evidence_message_id text references raw_message(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb,
  reviewer_user_id text references app_user(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_identity_match_status on identity_match(status, confidence desc);

create table if not exists conversation (
  id text primary key default 'conv_' || replace(gen_random_uuid()::text, '-', ''),
  customer_person_id text references person(id) on delete set null,
  owner_user_id text references app_user(id) on delete set null,
  status text not null default 'pending',
  stage text,
  started_at timestamptz,
  last_message_at timestamptz,
  timeline jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_customer on conversation(customer_person_id);
create index if not exists idx_conversation_owner_status on conversation(owner_user_id, status);
create index if not exists idx_conversation_last_message on conversation(last_message_at desc);

create table if not exists conversation_message (
  conversation_id text not null references conversation(id) on delete cascade,
  message_id text not null references raw_message(id) on delete cascade,
  sequence_no integer not null,
  primary key (conversation_id, message_id),
  unique (conversation_id, sequence_no)
);

create table if not exists conversation_participant (
  conversation_id text not null references conversation(id) on delete cascade,
  person_id text not null references person(id) on delete cascade,
  role_in_conversation text not null default 'unknown',
  primary key (conversation_id, person_id)
);

create table if not exists ai_quality_result (
  id text primary key default 'ai_' || replace(gen_random_uuid()::text, '-', ''),
  conversation_id text not null references conversation(id) on delete cascade,
  provider text not null default 'deepseek',
  model text not null,
  prompt_profile text not null,
  prompt_document text,
  prompt_version text not null default 'v1',
  status text not null default 'completed',
  input_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null,
  usage_json jsonb not null default '{}'::jsonb,
  validation_status text not null default 'not_checked',
  validation_errors jsonb not null default '[]'::jsonb,
  error_message text,
  created_by text references app_user(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_quality_result_conversation on ai_quality_result(conversation_id, created_at desc);
create index if not exists idx_ai_quality_result_json on ai_quality_result using gin (result_json);

create table if not exists quality_score (
  id text primary key default 'qs_' || replace(gen_random_uuid()::text, '-', ''),
  conversation_id text not null references conversation(id) on delete cascade,
  objective_score numeric(5,2) not null default 0,
  ai_score numeric(5,2) not null default 0,
  final_score numeric(5,2) not null default 0,
  status text not null default 'pending_review',
  objective_metrics jsonb not null default '{}'::jsonb,
  dimensions jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  ai_result_id text references ai_quality_result(id) on delete set null,
  scorer_user_id text references app_user(id) on delete set null,
  manual_adjust_reason text,
  reviewed_by text references app_user(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quality_score_conversation on quality_score(conversation_id, created_at desc);
create index if not exists idx_quality_score_final on quality_score(final_score desc);
create index if not exists idx_quality_score_status on quality_score(status);

create table if not exists customer_profile (
  person_id text primary key references person(id) on delete cascade,
  taobao_id text,
  wechat_id text,
  intent_level text,
  satisfaction text,
  owner_user_id text references app_user(id) on delete set null,
  tags jsonb not null default '[]'::jsonb,
  needs jsonb not null default '[]'::jsonb,
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists account_request (
  id text primary key default 'account_request_' || replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  username text not null,
  department text not null,
  role_key text not null,
  data_scope text not null default 'self',
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  handled_by text references app_user(id) on delete set null,
  handled_at timestamptz
);

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
