# AI Provider 接入说明

后端已经接入 OpenAI-compatible 的 Chat Completions 调用层。DeepSeek 只是当前测试 provider，用于验证质检链路、JSON 输出和证据链；商业版可以通过环境变量切换到更强模型。

## 模型

当前测试默认模型：

```text
deepseek-v4-flash
```

商业版优先使用通用 AI 配置：

```text
AI_PROVIDER=deepseek
AI_API_KEY=你的测试或商业 AI 密钥
AI_MODEL=deepseek-v4-flash
AI_BASE_URL=https://api.deepseek.com
AI_TIMEOUT_MS=120000
AI_THINKING=disabled
```

兼容旧测试配置：

```text
DEEPSEEK_API_KEY=你的 DeepSeek 测试密钥
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## 接口

```text
POST /api/quality/ai-evaluate
```

请求示例：

```json
{
  "conversation_id": "conv_001",
  "viewer_role": "super_admin"
}
```

`viewer_role` 决定 AI 使用哪套 prompt：

| `viewer_role` | `analysisProfile` | 用途 |
| --- | --- | --- |
| `super_admin` | `executive_full` | 超级管理员版本 Prompt：完整 AI 质检分析、客户语义分析与紧凑证据链 |
| `quality_user` | `review_limited` | 质检员复核版 |
| `service_user` | `service_coaching` | 客服本人复盘版 |

返回结果：

```json
{
  "ok": true,
  "aiConnected": true,
  "status": "completed",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "conversationId": "conv_001",
  "viewerRole": "super_admin",
  "analysisProfile": "executive_full",
  "analysisProfileLabel": "超级管理员版本 Prompt",
  "promptDocument": "backend/src/prompts/executiveFullPrompt.js",
  "validation": {
    "ok": true,
    "status": "valid",
    "errors": []
  },
  "persistence": {
    "ok": true,
    "id": "ai_xxx",
    "status": "completed",
    "validation_status": "valid"
  },
  "result": {}
}
```

## 多媒体证据链

AI 不直接读取图片、语音或视频二进制内容。系统应先把媒体证据解析并入库，再让 AI 基于文本证据质检：

- 图片：`ocr_text`、`image_description`、`media_description`
- 语音/视频：`transcript_text`、`media_description`
- 文件/链接：`structured_content`、`media_description`
- 审计字段：`media_metadata.parse_status`、`analysis_text_source`、`processor`、`evidence_updated_by`、`evidence_updated_at`

媒体证据写入接口：

```text
POST /api/messages/media-evidence
```

AI prompt 会读取 `parsed_content` 和 `evidence_audit`，没有解析文本的媒体消息必须标记为“证据不足”，不能猜测图片、语音或视频内容。

## Prompt

Prompt 文件：

```text
backend/src/prompts/
```

AI 必须返回结构化 JSON，并且每个判断都要带证据消息 ID，方便人工复核。管理端 prompt 使用紧凑证据字段 `compliance_risks`、`deductions`、`positive_points` 和 `insufficient_evidence`，避免测试模型输出过长导致 JSON 截断。

## Schema 校验与落库

后端会按 `analysisProfile` 做基础 schema 校验：

- `executive_full`：要求 `ai_semantic_score`、`customer_analysis`、`compliance_risks`、`deductions`、`positive_points`、`insufficient_evidence`、`summary`
- `review_limited`：要求 `review_score`、`customer_signal`、`risk_reminders`、`review_items`、`positive_points`、`insufficient_evidence`、`summary`
- `service_coaching`：要求 `self_improvement`、`customer_followup`、`risk_reminders`、`improvement_items`、`positive_points`、`insufficient_evidence`、`summary`

校验通过时，数据库上下文的 AI 调用会写入 `ai_quality_result`，保存输入快照、prompt 文档、prompt 版本、provider、model、输出、usage、校验状态和错误信息。请求中直接携带 `conversation_json` 的合成测试输入不会写入正式结果表。
