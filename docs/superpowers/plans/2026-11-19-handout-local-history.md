# 本机讲义历史实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不增加账号或云端草稿的前提下，让用户在同一浏览器中自动保留、恢复、整理和导出私人讲义历史。

**Architecture:** 使用 IndexedDB 保存 `course-handout/1` 规格和轻量元数据。历史仓库是独立客户端模块，工作台通过明确的保存/恢复接口使用；不新增任何读取或写入私人历史的服务器 API。

**Tech Stack:** React、IndexedDB、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-19-course-handout-website-design.md`

## 全局约束

- 私人历史只保存在浏览器，不发送至网站服务器。
- 页面刷新后可恢复；清除浏览器数据或更换设备后无法恢复。
- 存储 `course-handout/1` 完整规格和仅用于列表的元数据。
- 浏览器存储配额失败时不得丢弃当前编辑内容，必须提示用户导出或清理。
- 用户可以恢复、重命名、删除和导出单份历史。

---

## 文件职责

- `site/src/lib/history-db.js`：IndexedDB 打开、升级、保存、列举、读取、改名和删除操作。
- `site/src/lib/history-controller.js`：自动保存节流、当前草稿 id 与存储错误处理。
- `site/src/components/HistoryView.jsx`：历史列表、恢复、重命名、删除与导出入口。
- `site/src/components/HistoryRow.jsx`：标题、主题、更新时间、校验状态和操作。
- `site/src/test/history-db.test.js`：IndexedDB 仓库测试。
- `site/src/test/history-controller.test.js`：保存、恢复及配额错误测试。
- `site/src/test/history-view.test.jsx`：用户交互测试。
- `site/src/test/e2e/history.spec.js`：真实浏览器刷新恢复测试。

## 任务 1：IndexedDB 仓库

**文件：**
- 新建：`site/src/lib/history-db.js`
- 新建：`site/src/test/history-db.test.js`
- 修改：`site/package.json`（增加 fake-indexeddb 测试依赖）

**接口：**
- `saveHandout({ id, title, topic, updatedAt, checkStatus, spec }) -> Promise<void>`：新增或覆盖一条记录。
- `listHandouts() -> Promise<Array<{ id, title, topic, updatedAt, checkStatus }>>`：按更新时间倒序，只返回列表元数据。
- `getHandout(id) -> Promise<HandoutRecord | null>`：取完整记录。
- `renameHandout(id, title) -> Promise<void>`：仅更新显示标题与时间。
- `deleteHandout(id) -> Promise<void>`：永久删除本机记录。

- [ ] 使用数据库 `course-handout-history`，版本 1，object store `handouts`，主键 `id`，为 `updatedAt` 建索引。
- [ ] 数据库不可用、用户禁用存储或配额已满时，将原始异常转换成可显示的 `HistoryStorageError`，不得吞错。
- [ ] 使用 fake-indexeddb 测试 CRUD、倒序、未知 id 和序列化完整规格。
- [ ] 运行 `npm --prefix site test`。

## 任务 2：自动保存与恢复

**文件：**
- 新建：`site/src/lib/history-controller.js`
- 新建：`site/src/test/history-controller.test.js`
- 修改：`site/src/App.jsx`
- 修改：`site/src/components/HandoutReader.jsx`

**接口：**
- `createHistoryController({ save, delayMs = 800 })` 返回 `{ schedule(record), flush(), cancel() }`。

- [ ] 使用 800ms 防抖保存编辑后的规格；切换讲义或卸载页面前 `flush()`。
- [ ] 新生成的规格先创建 UUID id，之后更新同一记录；每次保存更新 `updatedAt` 与 checker 状态。
- [ ] 存储失败时在工作台显示“本机保存失败”及“下载备份”入口，当前 React state 保留不变。
- [ ] 刷新后若 IndexedDB 有最近打开记录的指针，询问恢复或新建；不在未确认时覆盖现有记录。
- [ ] 用 fake timers 验证防抖、flush、cancel 和配额失败保留当前 spec。
- [ ] 运行 `npm --prefix site test`。

## 任务 3：历史列表与管理

**文件：**
- 新建：`site/src/components/HistoryView.jsx`
- 新建：`site/src/components/HistoryRow.jsx`
- 新建：`site/src/test/history-view.test.jsx`
- 修改：`site/src/App.jsx`
- 修改：`site/src/styles/base.css`

- [ ] 在工作台主导航加入“本机历史”。列表展示标题、主题、更新时间、校验状态，并提供恢复、重命名、删除和导出。
- [ ] 删除前要求明确确认；重命名空标题或超 120 字符时显示字段错误。
- [ ] 导出调用现有 DOCX API；导出只读取当前记录，不将历史列表提交到服务器。
- [ ] 空历史、加载错误、存储容量异常和无效记录都有清晰状态。
- [ ] 测试用户操作及列表更新。
- [ ] 运行 `npm --prefix site test` 和生产构建。

## 任务 4：浏览器持久化验收

**文件：**
- 新建：`site/src/test/e2e/history.spec.js`
- 修改：`site/package.json`

- [ ] Playwright 测试生成一个 mock 讲义、修改正文、等待自动保存、刷新后恢复修改内容。
- [ ] 测试重命名和删除后列表状态正确。
- [ ] 监控 `/api` 请求，断言历史元数据与完整私人 spec 不被传输；下载操作的 spec 请求除外且只发生在用户点击导出时。
- [ ] 执行 `npm --prefix site run test:e2e`。

## 覆盖检查

- 本机保存、恢复、重命名、删除和导出：任务 1–4。
- 不向服务端上传私人历史：任务 1、任务 4 网络断言。
- 存储额度错误不丢数据：任务 1、任务 2。
- 不包含登录、账号、云同步：全计划。
