# PostgreSQL 数据库

推荐使用 PostgreSQL 作为质检项目主库。

原因：

- 淘宝和微信原始消息字段不完全一致，`jsonb` 可以保留原始 payload，结构化字段用于查询。
- 身份统一、会话、质检、权限都是强关系数据，适合关系型数据库。
- 后续 BI、时间范围查询、客服排行、会话检索都能通过索引解决。
- 云厂商普遍支持 PostgreSQL，后续从本地迁移到云数据库成本低。

## 项目内本地 PostgreSQL

当前项目可以采用项目内 PostgreSQL，不需要安装到系统盘：

```bash
npm run db:init
npm run db:start
npm run db:status
npm run db:stop
```

默认连接地址：

```text
postgres://postgres:postgres@localhost:5432/quality_inspection
```

这不是硬绑定。脚本会优先查找 `tools/postgresql/pgsql/bin/`，找不到时会尝试使用 PATH 中的 PostgreSQL 工具。也可以通过环境变量覆盖：

```text
POSTGRES_BIN_DIR=你的 PostgreSQL bin 目录
POSTGRES_DATA_DIR=自定义数据目录
PGHOST 或 POSTGRES_HOST=127.0.0.1
PGPORT 或 POSTGRES_PORT=5432
PGUSER 或 POSTGRES_USER=postgres
PGPASSWORD 或 POSTGRES_PASSWORD=postgres
PGDATABASE 或 POSTGRES_DB=quality_inspection
```

如果使用 Docker，可直接使用项目根目录下的 `docker-compose.postgres.yml`。

## 手动初始化

如果本机已经有 PostgreSQL：

```bash
createdb quality_inspection
psql -d quality_inspection -f database/postgresql/001_init.sql
psql -d quality_inspection -f database/postgresql/002_seed_demo.sql
```

## 后端配置

复制 `backend/.env.example` 为 `backend/.env.local`，补充：

```text
DATA_SOURCE=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/quality_inspection
DATABASE_SSL=false
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=你的 DeepSeek 密钥
```

然后安装驱动并重启后端：

```bash
npm install
npm run backend
```

检查连接：

```text
http://localhost:8787/api/database/status
```

## 数据导入原则

淘宝和微信数据最终都先进入 `raw_message`：

- `source_system` 区分 `taobao` / `wechat`
- `source_message_id` 保存来源消息 ID，用于去重
- `source_chat_id` 保存淘宝会话 ID 或微信群 ID
- `source_sender_id` 保存来源发送者 ID
- `sent_at` 保存消息发送时间
- `normalized_role` 统一成 customer / service / after_sales 等
- `content` 保存文本内容
- `raw_payload` 保存来源原始 JSON

然后再进入：

- `platform_account`：淘宝账号、微信账号
- `identity_match`：淘宝和微信身份匹配结果
- `conversation` / `conversation_message`：完整客户会话链路
- `quality_score` / `ai_quality_result`：客观评分和 AI 质检结果

## 后端导入接口

启用 PostgreSQL 后，可以把淘宝或微信消息批量写入：

```text
POST /api/messages/import
```

请求示例：

```json
{
  "source_system": "taobao",
  "messages": [
    {
      "source_message_id": "tb_msg_001",
      "source_chat_id": "tb_chat_1001",
      "source_sender_id": "tb_customer_7788",
      "sender_name": "清风",
      "time": "2026-06-15 09:12:20",
      "role": "customer",
      "content": "这个产品一般多久能看到效果？",
      "raw_payload": {}
    }
  ]
}
```
