# 商业化推进路线

目标：把当前本地 POC 推进到可试点、可交付、可审计的商业系统。每一步都要有可验证结果。

## 当前阶段

状态：Step 3-A 已完成（客服本人数据范围）；质检员部门/授权会话范围待继续。

已落地：
- 后端登录后签发 bearer token。
- 业务接口校验 token。
- 后端按角色限制接口访问。
- 后端以 token 中的角色为准，不再信任前端传入的 `role` 或 `viewer_role`。
- 前端保存 token，并随 API 请求发送。
- 前端按角色加载可访问数据，避免客服账号请求管理员接口。
- 修复客服账号 overview 返回质检员工作台的问题。
- 客服访问消息、会话、客户画像、质检结果时，后端按 token 中的用户身份过滤本人数据。
- PostgreSQL 查询与 mock 回退路径都已实现客服本人范围，避免数据库异常回退时绕过权限。
- 前端增加客服“客服复盘”入口，只读取后端返回的本人质检/复盘结果。
- 新增 `POST /api/messages/media-evidence`，支持先把图片 OCR、语音/视频转写、媒体描述和解析审计信息写入 `raw_message`，再让 AI 基于文本证据质检。
- AI 调用层改为可替换 Provider 配置，商业版优先使用 `AI_PROVIDER`、`AI_API_KEY`、`AI_MODEL`、`AI_BASE_URL`；DeepSeek 仅作为当前测试 provider。
- 管理端 AI prompt 改为紧凑证据输出，避免测试模型生成完整逐项 `evidence_chain` 导致 JSON 截断。

验收结果：
- 未登录访问 `/api/messages` 返回 401。
- 超级管理员登录后返回 token。
- 质检员不能访问 `/api/rules`。
- 客服伪造 `viewer_role=super_admin` 调 AI 质检时，后端仍应按 `service_user` 视角处理。
- 客服 token 查询 `/api/messages`、`/api/conversations`、`/api/customers`、`/api/quality/results` 时，只能拿到本人负责的记录。

## Step 2：密码与账号安全

目标：从 demo 登录推进到可试点账号体系。

已完成：
- 使用 PBKDF2-SHA256 存储密码哈希。
- Seed 数据改成哈希密码。
- PostgreSQL 登录和后端 mock 登录都走统一哈希校验。
- 新增 `004_password_hashes.sql`，用于把已有演示账号从明文迁移到哈希。
- 登录失败使用统一错误，不泄露账号是否存在。

待继续：
- 增加账号禁用、密码重置或初始密码变更流程。
- 区分 demo 环境与生产环境。

验收：
- 数据库不再保存演示账号明文密码。
- 旧的明文比较路径已移除，只保留一次性 SQL 迁移逻辑。
- 登录接口已手动验证成功/失败；禁用账号流程尚未实现。

## Step 3：数据范围控制

目标：不只控制“角色能不能访问接口”，还要控制“能看到哪些数据”。

已完成（Step 3-A）：
- 超级管理员仍可读取全量消息、会话、客户画像和质检结果。
- 客服读取消息时通过 `conversation_message -> conversation.owner_user_id` 限定本人负责会话。
- 客服读取会话、客户画像、质检结果时，分别按 `conversation.owner_user_id`、`customer_profile.owner_user_id`、`quality_score -> conversation.owner_user_id` 限定本人。
- 前端给客服开放“客服复盘”页，但最终数据范围仍由后端决定。

待继续：
- 质检员：授权部门或授权会话。
- 更细的授权模型：按部门、指定会话、指定客户或临时授权控制数据范围。
- 前端只做展示层限制，不能承担权限判断。

验收：
- 客服 token 不能通过改参数看到其他客服客户。
- 质检员 token 不能看到未授权部门数据。
- 每个受控查询都有 deny case。

## Step 4：操作闭环落库

目标：关键动作不只改前端状态，必须写数据库。

要做：
- 身份复核确认、驳回、完成 API。
- AI 质检结果写入 `ai_quality_result`。
- 质检确认流程写入 `quality_score` 状态。
- 账号申请审批、启用、拒绝、禁用 API。
- 规则配置保存并影响评分逻辑。

验收：
- 刷新页面后状态不丢。
- 每个写操作都有操作人、时间和结果。

## Step 5：审计日志

目标：商业客户能追责、能复盘、能查异常。

要做：
- 新增操作审计表。
- 记录登录、身份复核、质检改分、AI 质检、账号权限变更、规则变更。
- 审计日志只允许管理员查看。

验收：
- 每个关键写操作都有审计记录。
- 审计记录包含 actor、action、target、before/after 或摘要、created_at。

## Step 6：真实数据接入

目标：从 fixture 走向客户真实数据。

要做：
- 淘宝消息导入适配器。
- 微信或企微消息导入适配器。
- 增量同步、去重、失败重试。
- 大批量导入改为后台任务或批处理。
- 字段映射配置化。

验收：
- 一份真实样本可导入、可复跑、可去重。
- 导入失败不会中断整个批次。

## Step 7：AI 质检工程化

目标：AI 输出可控、可追踪、可回放。

已完成：
- 媒体证据先入库：`ocr_text`、`transcript_text`、`media_description`、`image_description` 和解析审计字段先落到 `raw_message`。
- AI 质检输入已读取 `parsed_content` 与 `evidence_audit`，图片、语音、视频无解析文本时必须按证据不足处理。
- AI 调用层已支持通用 `AI_*` Provider 配置，并保留 `DEEPSEEK_*` 作为当前测试兼容配置。
- 管理端 prompt 已改为紧凑证据输出，避免测试模型输出过长导致 JSON 截断。
- AI 输出已按角色进行基础 schema 校验，结构不合格时返回 `invalid_ai_result` 并按失败审计记录。
- AI 结果已可写入 `ai_quality_result`，并记录输入快照、prompt 版本、模型版本、验证状态和错误信息。

要做：
- 超时、失败、格式错误兜底。
- 人工复核反馈回流。
- 调用成本和频率限制。

验收：
- 任意 AI 结论能追到输入、Prompt 版本和原始消息证据。
- AI 输出异常不会污染最终质检结果。

## Step 8：测试、部署与运维

目标：从“能跑”走向“可维护上线”。

要做：
- 单元测试：导入归一化、身份匹配、客观指标。
- 集成测试：登录、授权、导入、质检、身份复核。
- Dockerfile / docker-compose 或部署脚本。
- 生产环境变量清单。
- 日志、监控、备份恢复。

验收：
- 核心测试能一键运行。
- 新环境按文档可部署。
- 数据库可备份和恢复。
