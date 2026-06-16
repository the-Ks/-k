# 聊天记录导入规范

本项目先统一接入淘宝和微信聊天记录。真实数据接入前，先用 `fixtures/huaxiang-gardening-chat-import.txt` 跑通流程。

## 导入命令

```bash
npm run data:import-demo
```

## HTTP 接口

```text
POST /api/messages/import
```

## 批次结构

```json
{
  "source_system": "taobao",
  "mode": "incremental",
  "file_name": "taobao-2026-06-15.json",
  "company_domain": "flower_gardening",
  "source_name": "淘宝历史聊天",
  "messages": []
}
```

`source_system` 只能是：

- `taobao`
- `wechat`

## 单条消息字段

必填字段：

| 字段 | 说明 |
| --- | --- |
| `source_message_id` | 来源平台消息 ID，同一平台内必须唯一 |
| `source_chat_id` | 来源会话 ID，淘宝会话 ID 或微信群 ID |
| `source_sender_id` | 来源发送人 ID，淘宝买家/客服 ID 或微信群成员 ID |
| `time` | 消息发送时间 |
| `role` | 原始角色，系统会归一化 |
| `content` | 文本内容 |

可选字段：

| 字段 | 说明 |
| --- | --- |
| `sender_name` | 来源昵称 |
| `message_type` | `text` / `image` / `voice` / `file` / `system` / `auto_reply` |
| `raw_payload` | 来源原始 JSON |

## 角色归一化

导入后统一为：

- `customer`
- `service`
- `sales`
- `after_sales`
- `bot`
- `system`
- `unknown`

## 校验规则

导入层不会再把缺失字段悄悄写成 `unknown_chat` 或 `unknown_sender`。

单条消息缺少以下任一项，会进入当前导入批次错误，不写入 `raw_message`：

- `source_message_id`
- `source_chat_id`
- `source_sender_id`
- `time`
- `content`

时间支持：

- `2026-06-15 09:02:18+08`
- `2026-06-15 09:02:18+0800`
- `2026-06-15 09:02:18+08:00`
- `2026-06-15T09:02:18+08:00`

## 当前花香园艺场景

模拟数据覆盖：

- 淘宝售前咨询
- 微信进群后自报淘宝 ID
- 多服务人员协作：客服、销售、园艺顾问、售后老师
- 园艺高频问题：光照、缓苗、黄叶、复花、售后、套餐价格
- 质检风险：绝对化承诺、售后边界、证据不足时的判断风险
