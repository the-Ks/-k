# DeepSeek V4 接入说明

后端已经接入 DeepSeek Chat Completions。

## 模型

默认模型：

```text
deepseek-v4-pro
```

可通过环境变量切换：

```text
DEEPSEEK_MODEL=deepseek-v4-pro
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
| `super_admin` | `executive_full` | 超级管理员版本 Prompt：完整 AI 质检分析、客户语义分析与证据链 |
| `quality_user` | `review_limited` | 质检员复核版 |
| `service_user` | `service_coaching` | 客服本人复盘版 |

返回结果：

```json
{
  "ok": true,
  "aiConnected": true,
  "status": "completed",
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "conversationId": "conv_001",
  "viewerRole": "super_admin",
  "analysisProfile": "executive_full",
  "analysisProfileLabel": "超级管理员版本 Prompt",
  "promptDocument": "docs/ai-quality-prompt.md#super-admin-executive-full",
  "result": {}
}
```

## 环境变量

复制示例文件：

```text
backend/.env.example
```

创建本地文件：

```text
backend/.env.local
```

内容格式：

```text
DEEPSEEK_API_KEY=你的 DeepSeek 密钥
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

注意：

- `.env.local` 已加入忽略规则，不会进入代码仓库。
- 前端不会保存密钥。
- 后端会读取 `.env.local` 或系统环境变量。

## Prompt

Prompt 文档：

```text
docs/ai-quality-prompt.md
```

AI 必须返回结构化 JSON，并且每个判断都要带证据消息 ID，方便人工复核。
