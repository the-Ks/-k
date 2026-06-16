alter table raw_message
  alter column content drop not null;

alter table raw_message
  add column if not exists media_url text,
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint,
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists duration_seconds numeric(10,2),
  add column if not exists file_name text,
  add column if not exists thumbnail_url text,
  add column if not exists ocr_text text,
  add column if not exists transcript_text text,
  add column if not exists media_description text,
  add column if not exists image_description text,
  add column if not exists link_url text,
  add column if not exists link_title text,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists structured_content jsonb not null default '{}'::jsonb,
  add column if not exists media_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_raw_message_type on raw_message(message_type);
create index if not exists idx_raw_message_ocr_trgm on raw_message using gin (ocr_text gin_trgm_ops);
create index if not exists idx_raw_message_transcript_trgm on raw_message using gin (transcript_text gin_trgm_ops);
create index if not exists idx_raw_message_media_desc_trgm on raw_message using gin (media_description gin_trgm_ops);
create index if not exists idx_raw_message_image_desc_trgm on raw_message using gin (image_description gin_trgm_ops);
create index if not exists idx_raw_message_attachments_gin on raw_message using gin (attachments);
create index if not exists idx_raw_message_structured_content_gin on raw_message using gin (structured_content);
