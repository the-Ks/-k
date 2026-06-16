insert into role (id, key, name, data_scope, priority, user_count) values
  ('role_super_admin', 'super_admin', '超级管理员', '全部数据', 100, 1),
  ('role_quality_manager', 'quality_manager', '质检主管', '部门数据', 80, 2),
  ('role_quality_user', 'quality_user', '质检员', '授权数据', 60, 8),
  ('role_service_user', 'service_user', '客服', '本人客户', 40, 36)
on conflict (key) do update set
  name = excluded.name,
  data_scope = excluded.data_scope,
  priority = excluded.priority,
  user_count = excluded.user_count;

insert into permission (id, key, name) values
  ('perm_message_view', 'message:view', '查看聊天记录'),
  ('perm_identity_review', 'identity:review', '身份复核'),
  ('perm_quality_review', 'quality:review', '查看质检'),
  ('perm_quality_edit', 'quality:edit', '编辑质检'),
  ('perm_customer_view', 'customer:view', '查看客户画像'),
  ('perm_account_create', 'account:create', '申请账号'),
  ('perm_permission_grant', 'permission:grant', '权限下放'),
  ('perm_rule_config', 'rule:config', '规则配置'),
  ('perm_bi_view', 'bi:view', '查看 BI'),
  ('perm_data_export', 'data:export', '导出数据')
on conflict (key) do update set name = excluded.name;

insert into role_permission (role_id, permission_id)
select r.id, p.id
from role r
cross join permission p
where r.key = 'super_admin'
on conflict do nothing;

insert into role_permission (role_id, permission_id)
select r.id, p.id
from role r
join permission p on p.key in ('message:view', 'identity:review', 'quality:review', 'quality:edit', 'customer:view', 'bi:view')
where r.key = 'quality_user'
on conflict do nothing;

insert into role_permission (role_id, permission_id)
select r.id, p.id
from role r
join permission p on p.key in ('message:view', 'quality:review', 'customer:view')
where r.key = 'service_user'
on conflict do nothing;

insert into app_user (id, username, password_hash, name, department, data_scope, status) values
  ('u_admin', 'admin', 'admin123', '超级管理员', '管理中心', 'all', 'active'),
  ('u_qc_01', 'qc', '123456', '质检员A', '质检组', 'department', 'active'),
  ('u_service_01', 'service', '123456', '客服小林', '客服一组', 'self', 'active')
on conflict (username) do update set
  password_hash = excluded.password_hash,
  name = excluded.name,
  department = excluded.department,
  data_scope = excluded.data_scope,
  status = excluded.status;

insert into user_role (user_id, role_id) values
  ('u_admin', 'role_super_admin'),
  ('u_qc_01', 'role_quality_user'),
  ('u_service_01', 'role_service_user')
on conflict do nothing;

insert into import_batch (id, source_system, mode, file_name, status, total_count, success_count, failed_count, started_at, finished_at) values
  ('batch_taobao_demo', 'taobao', 'full', 'demo-taobao.json', 'completed', 2, 2, 0, '2026-06-15 09:10:00+08', '2026-06-15 09:14:00+08'),
  ('batch_wechat_demo', 'wechat', 'full', 'demo-wechat.json', 'completed', 4, 4, 0, '2026-06-15 10:03:00+08', '2026-06-15 10:08:00+08')
on conflict (id) do nothing;

insert into person (id, person_type, display_name, status) values
  ('c_001', 'customer', '张先生', 'active'),
  ('c_002', 'customer', '王女士', 'active'),
  ('s_001', 'staff', '客服小林', 'active'),
  ('s_003', 'staff', '售后老师-周', 'active')
on conflict (id) do update set
  display_name = excluded.display_name,
  person_type = excluded.person_type,
  status = excluded.status;

insert into platform_account (id, person_id, platform, platform_account_id, display_name) values
  ('acct_tb_7788', 'c_001', 'taobao', '清风7788', '清风'),
  ('acct_wx_a19', 'c_001', 'wechat', 'wx_user_a19', '张先生'),
  ('acct_tb_staff_008', 's_001', 'taobao', 'tb_staff_008', '淘宝客服小林'),
  ('acct_wx_staff_009', 's_001', 'wechat', 'wx_staff_009', '服务老师-林'),
  ('acct_wx_staff_015', 's_003', 'wechat', 'wx_staff_015', '售后老师-周')
on conflict (platform, platform_account_id) do update set
  person_id = excluded.person_id,
  display_name = excluded.display_name;

insert into raw_message (
  id, source_system, source_message_id, source_chat_id, source_sender_id,
  sender_name, person_id, sent_at, role_raw, normalized_role, content, message_type, import_batch_id
) values
  ('msg_001', 'taobao', 'tb_msg_001', 'tb_chat_1001', 'tb_customer_7788', '清风', 'c_001', '2026-06-15 09:12:20+08', '客户', 'customer', '这个产品一般多久能看到效果？', 'text', 'batch_taobao_demo'),
  ('msg_002', 'taobao', 'tb_msg_002', 'tb_chat_1001', 'tb_staff_008', '淘宝客服小林', 's_001', '2026-06-15 09:13:02+08', '客服', 'service', '您好，一般需要结合使用周期看，我先了解一下您的具体情况。', 'text', 'batch_taobao_demo'),
  ('msg_003', 'wechat', 'wx_msg_003', 'wx_group_9001', 'wx_staff_009', '服务老师-林', 's_001', '2026-06-15 10:04:11+08', '服务人员', 'service', '麻烦您发一下淘宝ID，我们帮您做一下信息匹配。', 'text', 'batch_wechat_demo'),
  ('msg_004', 'wechat', 'wx_msg_004', 'wx_group_9001', 'wx_user_a19', '张先生', 'c_001', '2026-06-15 10:04:39+08', '客户', 'customer', '淘宝ID是 清风7788。', 'text', 'batch_wechat_demo'),
  ('msg_005', 'wechat', 'wx_msg_005', 'wx_group_9001', 'wx_user_a19', '张先生', 'c_001', '2026-06-15 10:06:02+08', '客户', 'customer', '我主要担心效果和售后，如果没效果怎么办？', 'text', 'batch_wechat_demo'),
  ('msg_006', 'wechat', 'wx_msg_006', 'wx_group_9001', 'wx_staff_015', '售后老师-周', 's_003', '2026-06-15 10:07:08+08', '售后', 'after_sales', '您这个问题我们可以按照使用阶段跟进，售后老师会定期回访并记录反馈。', 'text', 'batch_wechat_demo')
on conflict (source_system, source_message_id) do update set
  source_chat_id = excluded.source_chat_id,
  source_sender_id = excluded.source_sender_id,
  sender_name = excluded.sender_name,
  person_id = excluded.person_id,
  sent_at = excluded.sent_at,
  role_raw = excluded.role_raw,
  normalized_role = excluded.normalized_role,
  content = excluded.content,
  message_type = excluded.message_type,
  import_batch_id = excluded.import_batch_id;

insert into identity_match (
  id, person_id, taobao_account_id, wechat_account_id, match_method, confidence, status, evidence_message_id, evidence
) values (
  'ir_001', 'c_001', 'acct_tb_7788', 'acct_wx_a19', 'taobao_id_from_chat', 0.9200, 'pending', 'msg_004',
  '["客服在微信群要求客户发送淘宝ID", "客户回复：淘宝ID是 清风7788", "淘宝侧存在同名账号近期咨询记录"]'::jsonb
)
on conflict (id) do update set
  confidence = excluded.confidence,
  status = excluded.status,
  evidence = excluded.evidence;

insert into raw_message (
  id, source_system, source_message_id, source_chat_id, source_sender_id,
  sender_name, person_id, sent_at, role_raw, normalized_role, content, message_type,
  media_path, media_mime_type, image_description, attachments, media_metadata, import_batch_id
) values (
  'msg_007', 'wechat', 'wx_msg_007', 'wx_group_9001', 'wx_user_a19',
  '张先生', 'c_001', '2026-06-15 10:07:40+08', '客户', 'customer', null, 'image',
  'wechat://wx_group_9001/wx_msg_007.jpg', 'image/jpeg',
  '客户上传植物叶片照片：叶片边缘轻微发黄，盆土表面偏湿。该描述为模拟图片解析结果，真实接入时应来自OCR或图片理解服务。',
  '[{"type":"image","media_path":"wechat://wx_group_9001/wx_msg_007.jpg","mime_type":"image/jpeg","purpose":"售后状态判断"}]'::jsonb,
  '{"business_scene":"after_sales_image","parse_status":"mock_description_only"}'::jsonb,
  'batch_wechat_demo'
)
on conflict (source_system, source_message_id) do update set
  sender_name = excluded.sender_name,
  person_id = excluded.person_id,
  sent_at = excluded.sent_at,
  role_raw = excluded.role_raw,
  normalized_role = excluded.normalized_role,
  content = excluded.content,
  message_type = excluded.message_type,
  media_path = excluded.media_path,
  media_mime_type = excluded.media_mime_type,
  image_description = excluded.image_description,
  attachments = excluded.attachments,
  media_metadata = excluded.media_metadata,
  import_batch_id = excluded.import_batch_id;

insert into raw_message (
  id, source_system, source_message_id, source_chat_id, source_sender_id,
  sender_name, person_id, sent_at, role_raw, normalized_role, content, message_type,
  media_path, media_mime_type, duration_seconds, transcript_text, media_description, attachments, media_metadata, import_batch_id
) values
  (
    'msg_008', 'wechat', 'wx_msg_008', 'wx_group_9001', 'wx_gardener_alan',
    '园艺顾问阿岚', 's_003', '2026-06-15 10:09:12+08', '服务人员', 'service', null, 'video',
    'wechat://wx_group_9001/wx_msg_008.mp4', 'video/mp4', 36,
    '这段视频里我给您看一下怎么判断盆土干湿。先摸表层两厘米，如果还是湿的，今天不要再浇水；黄叶先剪掉老叶，放到通风散射光位置缓两天。',
    '服务老师发送养护讲解视频，内容包含盆土干湿判断、黄叶处理和缓苗位置建议。',
    '[{"type":"video","media_path":"wechat://wx_group_9001/wx_msg_008.mp4","duration_seconds":36,"purpose":"养护讲解"}]'::jsonb,
    '{"business_scene":"care_instruction_video","parse_status":"mock_transcript"}'::jsonb,
    'batch_wechat_demo'
  ),
  (
    'msg_009', 'wechat', 'wx_msg_009', 'wx_group_9001', 'wx_user_a19',
    '张先生', 'c_001', '2026-06-15 10:10:04+08', '客户', 'customer', null, 'voice',
    'wechat://wx_group_9001/wx_msg_009.amr', 'audio/amr', 8,
    '那我今天先不浇水，放阳台里面通风的位置可以吗？',
    null,
    '[{"type":"voice","media_path":"wechat://wx_group_9001/wx_msg_009.amr","duration_seconds":8,"purpose":"客户追问"}]'::jsonb,
    '{"business_scene":"care_followup_voice","parse_status":"mock_transcript"}'::jsonb,
    'batch_wechat_demo'
  )
on conflict (source_system, source_message_id) do update set
  sender_name = excluded.sender_name,
  person_id = excluded.person_id,
  sent_at = excluded.sent_at,
  role_raw = excluded.role_raw,
  normalized_role = excluded.normalized_role,
  content = excluded.content,
  message_type = excluded.message_type,
  media_path = excluded.media_path,
  media_mime_type = excluded.media_mime_type,
  duration_seconds = excluded.duration_seconds,
  transcript_text = excluded.transcript_text,
  media_description = excluded.media_description,
  attachments = excluded.attachments,
  media_metadata = excluded.media_metadata,
  import_batch_id = excluded.import_batch_id;

insert into conversation (
  id, customer_person_id, owner_user_id, status, stage, started_at, last_message_at, timeline
) values (
  'conv_001', 'c_001', 'u_service_01', 'quality_ready', '群内答疑',
  '2026-06-15 09:12:20+08', '2026-06-15 10:07:08+08',
  '["淘宝咨询产品效果", "客服引导加入微信群", "微信群内发送淘宝ID完成匹配", "售后老师回答效果与售后问题"]'::jsonb
)
on conflict (id) do update set
  customer_person_id = excluded.customer_person_id,
  owner_user_id = excluded.owner_user_id,
  status = excluded.status,
  stage = excluded.stage,
  started_at = excluded.started_at,
  last_message_at = excluded.last_message_at,
  timeline = excluded.timeline;

insert into conversation_message (conversation_id, message_id, sequence_no) values
  ('conv_001', 'msg_001', 1),
  ('conv_001', 'msg_002', 2),
  ('conv_001', 'msg_003', 3),
  ('conv_001', 'msg_004', 4),
  ('conv_001', 'msg_005', 5),
  ('conv_001', 'msg_006', 6),
  ('conv_001', 'msg_007', 7),
  ('conv_001', 'msg_008', 8),
  ('conv_001', 'msg_009', 9)
on conflict do nothing;

insert into conversation_participant (conversation_id, person_id, role_in_conversation) values
  ('conv_001', 'c_001', 'customer'),
  ('conv_001', 's_001', 'service'),
  ('conv_001', 's_003', 'after_sales')
on conflict do nothing;

insert into quality_score (
  id, conversation_id, objective_score, ai_score, final_score, status, objective_metrics, dimensions, risks, scorer_user_id
) values (
  'qa_001', 'conv_001', 37, 51, 88, '待人工复核',
  '{"first_response_seconds": 42, "longest_wait_seconds": 66, "response_score": 19, "timeout_count": 0}'::jsonb,
  '[
    {"name":"响应速度","score":19,"max":20,"reason":"客户首次提问后 42 秒内回复"},
    {"name":"回答专业度","score":25,"max":30,"reason":"回答方向正确，但缺少更完整的效果说明"},
    {"name":"服务态度","score":18,"max":20,"reason":"语气礼貌，能继续追问需求"},
    {"name":"流程合规","score":18,"max":20,"reason":"完成淘宝ID确认与群内承接"},
    {"name":"风险扣分","score":8,"max":10,"reason":"未发现明显过度承诺"}
  ]'::jsonb,
  '["售后保障说明略泛，需要补充标准话术"]'::jsonb,
  'u_qc_01'
)
on conflict (id) do update set
  objective_score = excluded.objective_score,
  ai_score = excluded.ai_score,
  final_score = excluded.final_score,
  status = excluded.status,
  objective_metrics = excluded.objective_metrics,
  dimensions = excluded.dimensions,
  risks = excluded.risks;

insert into customer_profile (
  person_id, taobao_id, wechat_id, intent_level, satisfaction, owner_user_id, tags, needs, last_active_at
) values (
  'c_001', '清风7788', 'wx_user_a19', '高意向', '一般偏满意', 'u_service_01',
  '["效果关注", "售后关注", "高意向", "待跟进"]'::jsonb,
  '["产品效果", "售后保障", "使用周期"]'::jsonb,
  '2026-06-15 10:07:08+08'
)
on conflict (person_id) do update set
  taobao_id = excluded.taobao_id,
  wechat_id = excluded.wechat_id,
  intent_level = excluded.intent_level,
  satisfaction = excluded.satisfaction,
  owner_user_id = excluded.owner_user_id,
  tags = excluded.tags,
  needs = excluded.needs,
  last_active_at = excluded.last_active_at;
