# 数据库设计草案

## 原始与标准消息

### raw_message

| 字段 | 说明 |
| --- | --- |
| id | 系统消息ID |
| source_system | 来源：taobao / wechat |
| source_message_id | 来源系统消息ID |
| source_chat_id | 来源会话ID或群ID |
| source_sender_id | 来源发送人ID |
| sender_name | 原始昵称 |
| send_time | 发送时间 |
| role_raw | 原始角色 |
| content | 原始内容 |
| payload_json | 原始扩展字段 |
| created_at | 入库时间 |

### standard_message

| 字段 | 说明 |
| --- | --- |
| id | 标准消息ID |
| raw_message_id | 原始消息ID |
| conversation_id | 系统会话ID |
| person_id | 统一人员ID |
| platform_account_id | 平台账号ID |
| normalized_role | customer / service / sales / after_sales / bot / unknown |
| message_type | text / image / voice / file / system / auto_reply |
| send_time | 标准时间 |
| content | 标准内容 |

## 身份归一

### person

| 字段 | 说明 |
| --- | --- |
| id | 统一人员ID |
| person_type | customer / staff |
| display_name | 展示名称 |
| status | active / merged / disabled |
| created_at | 创建时间 |

### platform_account

| 字段 | 说明 |
| --- | --- |
| id | 平台账号ID |
| platform | taobao / wechat / system |
| platform_account_id | 平台原始账号ID |
| nickname | 平台昵称 |
| external_key | open_id / union_id / taobao_id 等 |

### person_account_map

| 字段 | 说明 |
| --- | --- |
| id | 映射ID |
| person_id | 统一人员ID |
| platform_account_id | 平台账号ID |
| match_method | 匹配方式 |
| confidence | 置信度 |
| evidence_message_id | 证据消息ID |
| status | confirmed / pending_review / rejected |

### identity_clue

| 字段 | 说明 |
| --- | --- |
| id | 线索ID |
| message_id | 来源消息ID |
| clue_type | taobao_id / order_no / phone / wechat_id / name |
| clue_value | 线索值 |
| source_context | 上下文说明 |
| confidence | 线索置信度 |

## 会话与质检

### conversation

| 字段 | 说明 |
| --- | --- |
| id | 会话ID |
| customer_id | 客户ID |
| owner_staff_id | 主要负责人 |
| stage | 淘宝咨询 / 微信进群 / 群内答疑 / 持续跟进 |
| status | pending / identity_review / quality_ready / completed / abnormal |
| started_at | 开始时间 |
| ended_at | 结束时间 |

### conversation_member

| 字段 | 说明 |
| --- | --- |
| id | 成员ID |
| conversation_id | 会话ID |
| person_id | 统一人员ID |
| role_in_conversation | customer / service / sales / after_sales |
| is_owner | 是否主要负责人 |

### quality_score

| 字段 | 说明 |
| --- | --- |
| id | 评分ID |
| conversation_id | 会话ID |
| owner_staff_id | 被质检人员 |
| total_score | 总分 |
| response_score | 响应速度 |
| professional_score | 专业度 |
| attitude_score | 服务态度 |
| process_score | 流程合规 |
| risk_deduction | 风险扣分 |
| evidence_json | 评分依据 |
| status | auto_scored / pending_review / confirmed |

## 客户画像

### customer_profile

| 字段 | 说明 |
| --- | --- |
| customer_id | 客户ID |
| intent_level | 高 / 中 / 低 / 无 |
| satisfaction | 满意 / 一般 / 不满 / 投诉 |
| demand_summary | 需求摘要 |
| follow_status | 待跟进 / 已成交 / 已流失 |
| owner_staff_id | 负责人 |
| last_active_at | 最近活跃时间 |

### customer_tag

| 字段 | 说明 |
| --- | --- |
| id | 标签ID |
| customer_id | 客户ID |
| tag_name | 标签名称 |
| source | rule / ai / manual |
| confidence | 置信度 |

## 权限与审计

### system_user

| 字段 | 说明 |
| --- | --- |
| id | 系统用户ID |
| username | 登录账号 |
| password_hash | 密码哈希 |
| staff_person_id | 对应员工 person_id |
| status | active / disabled |

### role / permission / user_role / role_permission

用于 RBAC 权限控制。

### operation_log

| 字段 | 说明 |
| --- | --- |
| id | 日志ID |
| user_id | 操作人 |
| action | 操作类型 |
| target_type | 目标类型 |
| target_id | 目标ID |
| detail_json | 操作详情 |
| created_at | 操作时间 |

### sync_log

| 字段 | 说明 |
| --- | --- |
| id | 同步ID |
| source_system | 来源 |
| sync_type | full / incremental |
| started_at | 开始时间 |
| finished_at | 结束时间 |
| success_count | 成功数量 |
| failed_count | 失败数量 |
| error_message | 错误信息 |
