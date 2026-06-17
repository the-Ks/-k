# API 说明

当前项目已经具备 PostgreSQL 数据库接口，并保留 mock 数据用于本地演示和离线预览。后端数据入口仍集中在：

```text
backend/src/services/dataSource.js
```

当未配置 PostgreSQL 时，接口走 mock 数据；当 `DATA_SOURCE=postgres` 或配置了数据库连接时，接口走 PostgreSQL。数据库异常默认返回失败，不再静默回退 mock；演示环境可显式设置 `ALLOW_MOCK_FALLBACK=true`。

## 当前接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/auth/demo-users` | 演示账号 |
| POST | `/api/auth/login` | 登录 |
| GET/POST | `/api/overview` | 角色工作台概览 |
| GET | `/api/sync/status` | 数据接入状态 |
| GET | `/api/messages` | 标准化聊天记录 |
| POST | `/api/messages/import` | 批量导入淘宝/微信标准化聊天记录到 PostgreSQL |
| GET | `/api/identity/review` | 身份复核任务 |
| GET | `/api/conversations` | 会话链路 |
| GET | `/api/quality/results` | 质检结果 |
| POST | `/api/quality/ai-evaluate` | AI 质检评估，按 `viewer_role` 选择完整质检/质检复核/客服复盘 prompt，后端调用可替换 AI Provider；DeepSeek 仅作为当前测试 provider |
| POST | `/api/messages/media-evidence` | 写入图片 OCR、语音/视频转写、媒体描述和解析审计信息，供 AI 基于文本证据质检 |
| GET | `/api/customers` | 客户画像 |
| GET | `/api/permissions` | 权限模型 |
| POST | `/api/accounts/request` | 新建账号申请，占位等待写入云数据库 |
| GET | `/api/rules` | 质检规则配置 |
| GET | `/api/bi` | BI 看板数据 |

## 数据接入预期字段

## AI 质检请求

```json
{
  "conversation_id": "conv_001",
  "viewer_role": "super_admin"
}
```

`viewer_role` 取值：

- `super_admin`：AI 质检分析。
- `quality_user`：质检员复核分析。
- `service_user`：客服本人复盘。

### 原始聊天记录

```json
{
  "message_id": "msg_001",
  "source_system": "taobao",
  "source_chat_id": "tb_chat_1001",
  "source_sender_id": "tb_customer_7788",
  "sender_name": "清风",
  "send_time": "2026-06-15 09:12:20",
  "role": "customer",
  "content": "这个产品一般多久能看到效果？"
}
```

### 身份线索

```json
{
  "message_id": "msg_004",
  "clue_type": "taobao_id",
  "clue_value": "清风7788",
  "source_context": "客户回复客服要求发送淘宝ID",
  "confidence": 0.92
}
```

### 统一身份映射

```json
{
  "person_id": "c_001",
  "platform": "wechat",
  "platform_account_id": "wx_user_a19",
  "matched_platform": "taobao",
  "matched_account_id": "清风7788",
  "match_method": "taobao_id_from_chat",
  "confidence": 0.92,
  "status": "pending_review"
}
```

## 后续替换方式

1. 在 `dataSource.js` 中把 mock 数据替换成数据库查询。
2. 保持 API 返回结构不变，前端无需大改。
3. 如果数据库字段与当前标准字段不一致，在后端做适配。
4. 把同步日志、失败重试和去重逻辑放在数据接入层。
