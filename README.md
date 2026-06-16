# 客服质检系统

前后端分离的客服质检项目骨架。

## 目录

- `backend/`：Node 原生 HTTP 占位 API
- `frontend/`：原生 HTML/CSS/JS 的管理台原型
- `docs/`：项目流程和接口占位说明

## 运行

第一次启动建议在项目根目录按这个顺序：

```bash
npm run db:status
npm run backend
npm run frontend
```

如果数据库没有运行：

```bash
npm run db:start
```

如果要重新初始化本地数据库结构和演示数据：

```bash
npm run db:init
```

后端默认地址：

```text
http://localhost:8787/api/health
```

前端默认地址：

```text
http://localhost:5173
```

停止本地 PostgreSQL：

```bash
npm run db:stop
```

页面会优先请求后端接口，失败则自动回退到 mock 数据。

如果只想分别启动前后端：

```bash
npm run backend
npm run frontend
```

默认情况下，脚本会优先使用项目目录下的 PostgreSQL 二进制、数据目录和日志：

```text
tools/postgresql/
data/postgres/
data/postgres-runtime.log
```

这些目录已加入 `.gitignore`，不会进入代码仓库。把项目发给别人时，不要求对方电脑也有同样的磁盘路径；对方可以任选一种方式运行数据库：

- 把 PostgreSQL 二进制放到 `tools/postgresql/pgsql/bin/`
- 安装 PostgreSQL，并让 `psql`、`pg_ctl`、`pg_isready` 等命令在 PATH 中可用
- 设置 `POSTGRES_BIN_DIR` 指向本机 PostgreSQL 的 `bin` 目录
- 使用 `docker-compose.postgres.yml` 启动数据库

## 演示账号

- 超级管理员：`admin / admin123`
- 质检员：`qc / 123456`
- 客服：`service / 123456`

## 后续接入点

- `backend/src/services/dataSource.js`：替换成真实数据库/API 适配层
- `frontend/src/api.js`：替换成真实认证与后端地址
- `frontend/src/mock.js`：保留本地演示与离线预览能力

## 数据库

推荐使用 PostgreSQL。淘宝和微信原始消息先进入 `raw_message`，再通过身份匹配、会话链路、质检评分表形成业务数据。

数据库脚本：

```text
database/postgresql/001_init.sql
database/postgresql/002_seed_demo.sql
```

当前可采用项目内 PostgreSQL，数据默认放在当前项目目录下。可用脚本：

```bash
npm run db:init
npm run db:start
npm run db:status
npm run db:tables
npm run db:stop
```

`db:start` 会优先检测数据库端口是否可连接；如果上次异常退出留下过期 `postmaster.pid`，脚本会在确认旧进程不存在后自动清理，再启动数据库。

数据库脚本支持用环境变量覆盖默认值，避免绑定到某一台电脑：

```text
POSTGRES_BIN_DIR=你的 PostgreSQL bin 目录
POSTGRES_DATA_DIR=自定义数据目录
PGHOST 或 POSTGRES_HOST=127.0.0.1
PGPORT 或 POSTGRES_PORT=5432
PGUSER 或 POSTGRES_USER=postgres
PGPASSWORD 或 POSTGRES_PASSWORD=postgres
PGDATABASE 或 POSTGRES_DB=quality_inspection
```

快速查看数据库表和行数：

```bash
npm run db:tables
```

可视化工具连接参数：

```text
Host: 127.0.0.1
Port: 5432
Database: quality_inspection
User: postgres
Password: postgres
```

后端启用 PostgreSQL：

```text
DATA_SOURCE=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/quality_inspection
DATABASE_SSL=false
AUTH_TOKEN_SECRET=请替换成长随机字符串
```

如果未来改用云数据库，只需要替换 `DATABASE_URL`。

前端默认请求 `http://localhost:8787/api`。如果后端部署在另一台机器或其他端口，可以在浏览器控制台设置：

```js
localStorage.setItem("qi_api_base", "http://你的后端地址/api")
```

## 模拟数据

当前还没有真实淘宝/微信数据时，先用花香园艺场景模拟数据跑通流程：

```text
fixtures/huaxiang-gardening-chat-import.txt
```

导入到 PostgreSQL：

```bash
npm run data:import-demo
```

这份文本数据包含淘宝咨询和微信养护群两类来源，覆盖客户自报淘宝 ID、客服接待、园艺顾问答疑、售后说明、购买犹豫和套餐咨询。后续真实数据接入时，保持同样字段结构替换即可。

## DeepSeek AI 质检

后端已预留并接入 DeepSeek Chat Completions。复制 `backend/.env.example` 为 `backend/.env.local`，填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek 密钥
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

然后重启后端，在“质检评分”页点击“运行 AI 质检”。

AI 质检会按登录角色分流：

- 超级管理员：AI 质检分析，包含客服语义评分、客户意向、合规风险和证据扣分。
- 质检员：复核版分析，只看需要人工确认的质检项和简化客户信号。
- 客服：复盘版分析，只看本人改进建议、跟进动作和风险提醒。

## 商业化推进状态

当前已完成第一步商业化地基：后端会在登录后签发 bearer token，业务接口会校验 token 并按角色限制访问。前端会保存 token 并随请求发送，后端以 token 中的角色为准，不再信任前端传入的角色。

生产环境必须设置 `AUTH_TOKEN_SECRET`，并使用足够长的随机字符串。当前仍需继续补齐密码哈希、后端数据范围过滤、审计日志、AI 结果落库、身份复核持久化和自动化测试。
