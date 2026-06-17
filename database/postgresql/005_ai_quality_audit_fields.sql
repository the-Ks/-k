alter table ai_quality_result
  add column if not exists prompt_document text,
  add column if not exists prompt_version text not null default 'v1',
  add column if not exists input_json jsonb not null default '{}'::jsonb,
  add column if not exists validation_status text not null default 'not_checked',
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists error_message text,
  add column if not exists completed_at timestamptz;

