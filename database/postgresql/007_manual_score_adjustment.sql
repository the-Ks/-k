alter table quality_score
  add column if not exists manual_adjust_reason text;

create index if not exists idx_quality_score_reviewed_at on quality_score(reviewed_at desc);
