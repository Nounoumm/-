# 讲义分享社区实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户主动发布讲义到公开社区，并支持搜索、预览、免账号管理、撤回、举报和管理员隐藏。

**Architecture:** 使用 SQLite 持久化已发布讲义和举报；私人草稿继续留在浏览器 IndexedDB。发布时返回一次性高熵管理令牌，数据库只存令牌摘要。公开接口永不返回令牌，写操作需验证令牌；管理员操作单独使用服务器密钥。

**Tech Stack:** Node.js 22.5+（内置 `node:sqlite`）、React、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-19-course-handout-website-design.md`

## 全局约束

- 社区持久保存用户主动发布的内容；未发布讲义和私人历史不入数据库。
- 不建立账号系统，发布者凭一次性显示的高熵管理令牌管理内容。
- SQLite 仅保存令牌摘要；令牌不出现在日志、搜索结果、公开页面和错误中。
- 生产部署需要持久化磁盘；数据库路径由 `DATABASE_PATH` 配置。
- 发布确认必须提醒用户内容会公开，并确认资料授权。
- 举报需限频；管理员隐藏路由需 `ADMIN_API_KEY`。
- 所有公开展示内容均按纯文本/受限 Markdown 渲染，禁止任意 HTML 和脚本。

---

## 文件职责

- `site/server/db/index.js`：SQLite 创建、迁移与事务入口。
- `site/server/db/migrations/001-community.sql`：社区表与索引。
- `site/server/services/community.js`：发布、分页搜索、读取、更新、撤回、举报和隐藏业务。
- `site/server/lib/tokens.js`：随机管理令牌生成与摘要校验。
- `site/server/routes/community.js`：用户社区 HTTP API。
- `site/server/routes/admin.js`：管理员举报审核/隐藏接口。
- `site/src/components/CommunityView.jsx`：社区搜索和列表。
- `site/src/components/PublicHandout.jsx`：讲义预览、分享与举报。
- `site/src/components/PublishDialog.jsx`：公开确认和一次性管理链接展示。
- `site/src/components/ManageShare.jsx`：在发布者持有管理链接时加载与管理分享。
- `site/src/lib/community-api.js`：客户端社区 API 封装。
- `site/test/community-service.test.js`：数据库和令牌业务测试。
- `site/test/community-api.test.js`：路由安全与错误测试。
- `site/src/test/community-view.test.jsx`：社区界面交互测试。
- `site/src/test/e2e/community.spec.js`：发布到撤回流程浏览器验收。
- `site/README.md`：社区数据库和管理员密钥部署说明。

## 任务 1：SQLite schema 与令牌工具

**文件：**
- 修改：`site/package.json`（加入 `better-sqlite3`）
- 新建：`site/server/db/index.js`
- 新建：`site/server/db/migrations/001-community.sql`
- 新建：`site/server/lib/tokens.js`
- 新建：`site/test/community-service.test.js`

**接口：**
- `createCommunityDb(path) -> { db, close() }`
- `createManageToken() -> { token, digest }`：token 使用 `crypto.randomBytes(32)` 的 base64url 编码；digest 使用 SHA-256。
- `matchesManageToken(token, digest) -> boolean`：用固定长度摘要比较并使用 `timingSafeEqual`。

- [ ] `community_handouts` 表字段：`id TEXT PRIMARY KEY`、`spec_json TEXT NOT NULL`、`title TEXT NOT NULL`、`topic TEXT NOT NULL`、`tags_json TEXT NOT NULL`、`display_name TEXT`、`manage_digest TEXT NOT NULL`、`status TEXT CHECK(status IN ('visible','hidden','withdrawn')) NOT NULL`、`created_at TEXT NOT NULL`、`updated_at TEXT NOT NULL`。
- [ ] `community_reports` 表字段：`id TEXT PRIMARY KEY`、`handout_id TEXT NOT NULL REFERENCES community_handouts(id)`、`reason TEXT NOT NULL`、`details TEXT`、`created_at TEXT NOT NULL`、`status TEXT CHECK(status IN ('open','resolved')) NOT NULL`。
- [ ] 为可见状态、创建时间、主题和举报外键建立索引；开启 `PRAGMA foreign_keys = ON`。
- [ ] DB 启动时运行顺序迁移；路径可配置，缺省为 `site/data/community.sqlite`。
- [ ] 测试 schema、迁移重跑、外键、令牌随机性、摘要匹配与错误令牌拒绝。
- [ ] 运行 `npm --prefix site test`。

## 任务 2：社区业务层

**文件：**
- 新建：`site/server/services/community.js`
- 修改：`site/test/community-service.test.js`

**接口：**
- `publishHandout(db, { spec, displayName }) -> { id, manageToken, createdAt }`
- `searchHandouts(db, { query, tag, cursor, limit }) -> { items, nextCursor }`
- `getPublicHandout(db, id) -> PublicHandout | null`
- `updateHandout(db, id, token, { spec, displayName }) -> PublicHandout`
- `withdrawHandout(db, id, token) -> void`
- `reportHandout(db, id, { reason, details }) -> reportId`
- `hideHandout(db, id) -> void`

- [ ] 发布前用现有 schema guard 校验 spec，标题/主题最多 160 字，tag 最多 10 个且每个最多 30 字，展示名可空且最多 60 字。
- [ ] 分享 token 只在 publish 返回一次；数据库只写 digest。更新与撤回用摘要匹配，所有公开对象只挑选安全字段。
- [ ] 搜索仅返回 `visible`，分页 limit 默认 20、最大 50；搜索匹配 title/topic/tags，cursor 使用 `(created_at,id)`。
- [ ] 举报 reason 从 `copyright|misinformation|personal_data|other` 选项中选，details 最多 1000 字；每 IP 每小时最多 10 次举报、每 IP 每日最多 5 次发布。
- [ ] 管理隐藏将 status 改为 `hidden`；撤回将 status 改为 `withdrawn`，公开详情和搜索都排除两类状态。
- [ ] 用临时 SQLite 测试发布、搜索、隐藏内容不可见、正确管理令牌更新/撤回、错误令牌、举报和 schema 错误。
- [ ] 运行 `npm --prefix site test`。

## 任务 3：HTTP 路由与密钥保护

**文件：**
- 新建：`site/server/routes/community.js`
- 新建：`site/server/routes/admin.js`
- 修改：`site/server/index.js`
- 新建：`site/test/community-api.test.js`

- [ ] 实现设计稿定义的社区 GET/POST/PATCH/DELETE/report 路由；公开 GET 永不序列化 `manage_digest` 或管理 token。
- [ ] 创建响应将原始管理 token 放在一次性 JSON 字段 `manageToken`，设置 `Cache-Control: no-store`；后续 GET/PATCH/DELETE 不返回 token。
- [ ] 管理操作用 header `Authorization: Bearer <token>` 验证；不把 URL query 中的 token 当认证凭据，避免进入访问日志。
- [ ] `POST /api/admin/community/handouts/:id/hide` 只接受服务器环境变量 `ADMIN_API_KEY`，常量时间比较；未配置则返回 503。
- [ ] 屏蔽请求体/认证 header 日志；返回通用 400/401/404/429，不回显 token、数据库路径或 SQL 错误。
- [ ] API 测试断言公开响应不包含 token/digest、错误 token 无法编辑/撤回、管理员密钥缺失/错误时拒绝。
- [ ] 运行 `npm --prefix site test`。

## 任务 4：发布、搜索和预览界面

**文件：**
- 新建：`site/src/lib/community-api.js`
- 新建：`site/src/components/CommunityView.jsx`
- 新建：`site/src/components/PublicHandout.jsx`
- 新建：`site/src/components/PublishDialog.jsx`
- 新建：`site/src/test/community-view.test.jsx`
- 修改：`site/src/App.jsx`
- 修改：`site/src/styles/base.css`

- [ ] 主导航加入“讲义社区”，支持主题搜索、标签筛选、分页、空状态和服务错误状态。
- [ ] 分享预览展示标题、对象、章节结构、作者展示名和发布时间；不显示未公开来源资料或私人历史。
- [ ] 发布弹窗明确“发布后任何人可查看和下载”，要求勾选已确认资料分享权限；成功后仅展示一次管理链接并提醒保存。
- [ ] 举报弹窗提供固定理由和可选详情；提交后显示确认状态。
- [ ] 测试发布确认未勾选时阻止发布、一次性令牌展示、搜索结果点击和举报结果。
- [ ] 运行 `npm --prefix site test` 和生产构建。

## 任务 5：持管理链接的编辑和撤回

**文件：**
- 新建：`site/src/components/ManageShare.jsx`
- 修改：`site/src/lib/community-api.js`
- 新建：`site/src/test/manage-share.test.jsx`

- [ ] 管理链接格式为 `/community/manage#<id>.<token>`，令牌仅放 URL fragment；页面初始化后读出令牌并立即用 `history.replaceState` 清除地址栏 fragment。
- [ ] 在当前页面内存中持有 token，关闭或刷新后需用户重新打开原始管理链接；不保存至 localStorage、IndexedDB、cookie 或服务端日志。
- [ ] 持令牌者可编辑公开 spec、更新展示名或撤回；所有变更需确认，成功后刷新公开内容。
- [ ] 不存在 id、无效 token 和已撤回分享显示相同的不可管理提示，避免枚举资源状态。
- [ ] 测试 fragment 清除、无持久化、错误令牌拒绝、编辑和撤回。
- [ ] 运行 `npm --prefix site test` 和生产构建。

## 任务 6：管理员审核、文档与端到端验收

**文件：**
- 新建：`site/server/routes/admin.js` 测试补充
- 新建：`site/test/e2e/community.spec.js`
- 修改：`site/README.md`
- 修改：`site/package.json`

- [ ] 为管理方提供受 ADMIN_API_KEY 保护的待处理举报列表和隐藏内容操作；管理页面不向公众开放，也不建立管理账号。
- [ ] 文档说明 SQLite 持久卷、`DATABASE_PATH`、`ADMIN_API_KEY` 轮换、备份与恢复和管理 token 丢失无法找回。
- [ ] Playwright 覆盖发布、社区搜索、公开预览、举报、管理链接编辑、撤回和撤回后不可见。
- [ ] 断言管理令牌不出现在公开 API、页面源代码和服务端日志；社区响应无 XSS 执行。
- [ ] 执行网站单测、端到端测试、生产构建以及现有插件/示例回归检查。

## 覆盖检查

- 主动公开和社区搜索浏览：任务 2–4。
- 一次性管理链接、编辑、撤回：任务 1–3、任务 5。
- 举报和管理员隐藏：任务 1–3、任务 6。
- 公开内容持久存储、私人内容不入库：任务 1–2；与本机历史计划共同验证。
- 免账号、令牌隐私、频率限制和 XSS 防护：任务 1–6。
