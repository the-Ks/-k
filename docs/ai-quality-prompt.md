# AI 质检 Prompt 与角色视图

## 当前结论

AI 质检不能只有一套 prompt。

同一份聊天记录进入 AI 后，要根据登录账号角色选择不同分析口径：

| 角色 | Prompt 配置 | 页面展示 |
| --- | --- | --- |
| 超级管理员 | `executive_full` | 超级管理员版本 Prompt：完整质检评分、客户语义分析、购买意向、合规风险、证据链 |
| 质检员 | `review_limited` | 复核评分、客户信号、风险提醒、人工复核项 |
| 客服本人 | `service_coaching` | 本次复盘、下一步跟进、改进建议、风险提醒 |

后端入口：

```text
POST /api/quality/ai-evaluate
```

前端调用时必须带上当前登录角色：

```json
{
  "conversation_id": "conv_001",
  "viewer_role": "super_admin"
}
```

后端根据 `viewer_role` 选择 prompt，不允许前端直接拼接 AI 密钥或直接调用任何外部 AI Provider。DeepSeek 仅作为当前测试 provider。

## AI 输入

后端传给 AI 的数据只包含质检需要字段。聊天消息不是只有文字，`content` 只代表文本层；图片、语音、视频、文件、链接等消息还需要携带 `message_type`、`media` 和 `parsed_content`：

```json
{
  "conversation_id": "conv_001",
  "customer_profile": {
    "customer_id": "c_001",
    "customer_name": "张先生",
    "source": "taobao_to_wechat",
    "identity_status": "confirmed"
  },
  "messages": [
    {
      "message_id": "msg_001",
      "time": "2026-06-15 09:12:20",
      "role": "customer",
      "speaker": "清风",
      "source": "taobao",
      "message_type": "text",
      "content": "这个产品一般多久能看到效果？",
      "analysis_text": "这个产品一般多久能看到效果？",
      "media": {},
      "parsed_content": {}
    },
    {
      "message_id": "msg_008",
      "time": "2026-06-15 10:09:12",
      "role": "service",
      "speaker": "园艺顾问阿岚",
      "source": "wechat",
      "message_type": "video",
      "content": "",
      "analysis_text": "视频转写或视频摘要",
      "media": {
        "media_path": "wechat://wx_group_9001/wx_msg_008.mp4",
        "mime_type": "video/mp4",
        "duration_seconds": 36
      },
      "parsed_content": {
        "transcript_text": "语音/视频转写",
        "ocr_text": "",
        "media_description": "视频/图片/文件摘要",
        "structured_content": {}
      }
    }
  ],
  "objective_metrics": {
    "first_response_seconds": 42,
    "longest_wait_seconds": 66,
    "timeout_count": 0,
    "reply_coverage_rate": null,
    "effective_reply_rate": null,
    "customer_question_count": null,
    "proactive_followup_count": null
  }
}
```

`objective_metrics` 由系统计算，AI 只能引用，不能重新计算或改写。

## 超级管理员版本 Prompt

超级管理员版本 Prompt 使用完整 AI 质检分析口径，覆盖客服语义评分、客户语义分析、合规风险、扣分项、亮点和评分证据链。

核心约束：

- 只使用输入中明确提供的信息。
- `message_id`、`time`、`role`、`speaker`、`content`、消息顺序和客观指标必须以输入为准。
- `objective_metrics` 只能引用，不能重新计算。
- 不能把客户沉默判断为满意。
- 不能把“考虑一下”“再看看”直接判断为强购买意向。
- 如果证据不足，必须返回“证据不足”。
- 所有评分必须引用原始 `message_id` 或原文证据。
- 只输出 JSON，不输出 Markdown，不输出推理过程。

超级管理员版本 Prompt 输出结构：

```json
{
  "ai_semantic_score": {
    "total_score": 0,
    "question_understanding": 0,
    "answer_relevance": 0,
    "answer_completeness": 0,
    "professional_accuracy": 0,
    "problem_solving": 0,
    "service_attitude": 0,
    "objection_handling": 0,
    "sales_conversion": 0,
    "script_standardization": 0
  },
  "customer_analysis": {
    "semantic_score": 0,
    "purchase_intent_score": 0,
    "trust_score": 0,
    "price_acceptance_score": 0,
    "satisfaction_score": 0,
    "hesitation_score": 0,
    "churn_risk_score": 0,
    "intention_level": "A/B/C/D",
    "customer_tags": []
  },
  "compliance_risks": [
    {
      "risk_type": "",
      "risk_level": "low/medium/high/serious",
      "deduct_score": 0,
      "message_id": "",
      "evidence": "",
      "reason": ""
    }
  ],
  "deductions": [
    {
      "dimension": "",
      "deduct_score": 0,
      "message_id": "",
      "evidence": "",
      "reason": ""
    }
  ],
  "positive_points": [
    {
      "dimension": "",
      "message_id": "",
      "evidence": "",
      "reason": ""
    }
  ],
  "insufficient_evidence": [],
  "summary": ""
}
```

## Quality User Review Limited

质检员不是管理层视角，不能看到完整经营拆解。质检员需要的是“这条会话该怎么复核”。

质检员可见维度：

- 问题识别
- 回答相关性
- 回答完整度
- 专业准确性
- 服务态度
- 流程执行
- 需要人工复核的问题
- 简化客户信号：满意度信号、意向等级、需求点
- 简化合规提醒

质检员不可见内容：

- 客户 50 分完整拆解
- 客户信任、价格接受度、流失风险的精细经营评分
- 管理层综合扣分总账

输出结构：

```json
{
  "review_score": {
    "total_score": 0,
    "question_understanding": 0,
    "answer_relevance": 0,
    "answer_completeness": 0,
    "professional_accuracy": 0,
    "service_attitude": 0,
    "process_execution": 0
  },
  "customer_signal": {
    "satisfaction_signal": "satisfied/neutral/dissatisfied/complaint/unknown/证据不足",
    "intent_level": "A/B/C/D/unknown/证据不足",
    "demand_points": []
  },
  "risk_reminders": [],
  "review_items": [],
  "positive_points": [],
  "insufficient_evidence": [],
  "summary": ""
}
```

## Service User Coaching

客服本人看到的是复盘，不是管理层质检报告。

客服可见维度：

- 本次回复质量
- 服务态度
- 问题是否被接住
- 下一步跟进动作
- 简化客户信号
- 合规风险提醒

客服不可见内容：

- 客户 50 分完整拆解
- 合规扣分总账
- 客服排行、处罚、经营级判断

输出结构：

```json
{
  "self_improvement": {
    "service_quality_score": 0,
    "answer_relevance": 0,
    "answer_completeness": 0,
    "service_attitude": 0,
    "followup_action": 0
  },
  "customer_followup": {
    "satisfaction_signal": "satisfied/neutral/dissatisfied/complaint/unknown/证据不足",
    "intent_signal": "high/medium/low/none/unknown/证据不足",
    "followup_priority": "high/medium/low/unknown/证据不足",
    "demand_points": [],
    "next_action": ""
  },
  "risk_reminders": [],
  "improvement_items": [],
  "positive_points": [],
  "insufficient_evidence": [],
  "summary": ""
}
```

## 保存流程

AI 返回结果不能直接成为最终结论。

建议状态：

```text
auto_scored -> pending_review -> confirmed
```

质检员人工确认后，再进入最终质检报表和 BI 看板。
