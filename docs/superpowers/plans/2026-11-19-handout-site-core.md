# 讲义工作台与资料辅助生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一个面向教师、学生、自学者和其他学习者的独立网站，支持资料辅助生成、可编辑模块树、内容深度选择、讲义编辑与 DOCX/打印导出。

**Architecture:** 新增 `site/` React/Vite 客户端和 Node 服务端。服务端通过 DeepSeek API 生成符合 `course-handout/1` 的规格，复用仓库中的 Python 校验器与 DOCX 构建器；模板元数据迁移为插件和网站共享的 JSON 数据，原插件工具契约保持兼容。

**Tech Stack:** Node.js 22.5+、React、Vite、Node 原生 `fetch`/HTTP/子进程 API、DeepSeek OpenAI-compatible API、Python 3.12、python-docx、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-19-course-handout-website-design.md`

## 全局约束

- 私人讲义历史只存于浏览器，不上传服务端。
- API 密钥只存服务器环境变量，不得打包进浏览器或写入日志。
- 现有插件工具名称、参数、输出 schema 和行为向后兼容。
- 讲义数据使用 `course-handout/1`；无 checker error 时才允许导出 DOCX。
- 资料格式为 PDF、DOCX、PPTX、TXT 和 Markdown；首版不支持 OCR。
- 用户上传源文件只在隔离临时目录短暂保存，提取后删除；只有用户确认发送后，提取文本才送入模型。
- 后端 Python 调用使用固定 executable 和参数数组，不拼接 shell 命令。
- Node 网站支持桌面和手机布局、键盘操作及打印为 PDF。

---

## 文件职责

- `shared/templates.json`：插件和网站共用的四种模板描述与章节形状。
- `index.js`：读取共享模板，保持现有四工具行为与输出契约。
- `site/package.json`：网站依赖、开发、测试和生产脚本。
- `site/vite.config.js`：前端构建和本地 API 代理。
- `site/src/main.jsx`、`site/src/App.jsx`：客户端入口和页面状态路由。
- `site/src/components/`：表单、大纲树、阅读编辑器、章节导航、状态反馈。
- `site/src/styles/`：工作台与打印样式。
- `site/src/lib/handout-schema.js`：浏览器端规格守卫、默认值和深度规则。
- `site/server/index.js`：静态资源托管与 API 组合入口。
- `site/server/routes/`：模板、生成、资料提取、校验、DOCX 路由。
- `site/server/services/deepseek.js`：DeepSeek 请求、超时、取消和响应解析。
- `site/server/services/generation.js`：大纲生成、逐模块生成和规格组装。
- `site/server/services/materials.js`：上传限制与 PDF/DOCX/PPTX/TXT/Markdown 文本提取。
- `site/server/services/python-builder.js`：安全调用 Python CLI 和读取 JSON 结果。
- `site/test/`：API、解析、生成、资料提取测试。
- `site/README.md`：本地启动、环境配置和生产运行说明。

## 阶段 1：共享模板与兼容性

### 任务 1：把模板行为锁定在回归测试中

**文件：**
- 新建：`test/templates.test.js`
- 修改：`package.json`（添加测试脚本和仅开发依赖）
- 修改：`index.js`（只在后续任务迁移读取逻辑）

- [ ] 用 Node 内置 `node:test` 为当前 `TEMPLATES` 建立测试，断言四个 id、显示名、章节数和 scaffold 的模板选择行为。
- [ ] 运行 `node --test test/templates.test.js`，确认现状通过并保留输出作为迁移基线。

### 任务 2：抽取共享模板 JSON

**文件：**
- 新建：`shared/templates.json`
- 修改：`index.js`
- 修改：`test/templates.test.js`

- [ ] 从 `index.js` 原样迁移模板 id、描述、适用场景与章节骨架到 JSON。
- [ ] 在 `index.js` 使用 `readFileSync(new URL('./shared/templates.json', import.meta.url), 'utf8')` 载入模板，再保持 `templateInfo`、`scaffoldSpec` 和工具输出字段不变。
- [ ] 测试 scaffold 的模块分组、默认值和四种模板形状没有改变。
- [ ] 运行 `node --check index.js` 与 `node --test test/templates.test.js`。

## 阶段 2：网站骨架与核心 API

### 任务 3：建立 Vite/React 项目脚本与空白工作台

**文件：**
- 新建：`site/package.json`
- 新建：`site/vite.config.js`
- 新建：`site/index.html`
- 新建：`site/src/main.jsx`
- 新建：`site/src/App.jsx`
- 新建：`site/src/styles/base.css`
- 新建：`site/README.md`

- [ ] 配置 `dev`、`build`、`preview`、`test`、`test:e2e` 脚本，开发服务器将 `/api` 代理到本地 Node 服务。
- [ ] 建立实际工作台首屏：新建讲义表单和模板、对象、主题等字段，不创建营销首页。
- [ ] 添加桌面和窄屏布局、中文字体回退、可见键盘焦点与表单 label。
- [ ] 写 `site/README.md` 环境变量说明：`DEEPSEEK_API_KEY`、可选 `PYTHON_PATH`、`PORT`、`TRUST_PROXY`。
- [ ] 运行 `npm --prefix site run build`。

### 任务 4：定义 API 请求 schema 与 Python 调用器

**文件：**
- 新建：`site/server/config.js`
- 新建：`site/server/lib/validation.js`
- 新建：`site/server/services/python-builder.js`
- 新建：`site/test/validation.test.js`
- 新建：`site/test/python-builder.test.js`

- [ ] 用纯函数 `validateGenerateInput(value)` 返回 `{ ok, value, errors }`，限制 `topic` 2–160 字符、`audience` 0–160 字符、`chapters` 3–12、模板必须属于共享 JSON 的四个 id、`depth` 为 `concise|standard|detailed`、`exercises` 为 `none|basic|full`、`selectedModuleIds` 是非空唯一字符串数组。
- [ ] 配置 JSON 请求体最大 1 MiB，默认只监听 loopback 用于本地开发，生产端口由 `PORT` 指定。
- [ ] `runPython(args, { signal })` 使用 `spawn(PYTHON_PATH, [BUILDER_PATH, ...args], { shell: false })`，以唯一 `mkdtemp` 目录写 spec 和输出，收集受限 stdout/stderr，并在 `finally` 清除目录。
- [ ] 对 `check` 返回 JSON 解析 `{ ok, issues, stats }`；对 `build` 返回 DOCX buffer 与 stats。仅接受固定子命令和内部生成路径。
- [ ] 测试无效输入、超限输入、子进程非零退出、无效 JSON stdout、超时和取消时清理临时目录。
- [ ] 运行 `npm --prefix site test`。

### 任务 5：DeepSeek 响应和分模块生成

**文件：**
- 新建：`site/server/services/deepseek.js`
- 新建：`site/server/services/generation.js`
- 新建：`site/server/lib/spec.js`
- 新建：`site/test/deepseek.test.js`
- 新建：`site/test/generation.test.js`

- [ ] `requestJson({ messages, signal })` 调用 `https://api.deepseek.com/chat/completions`，传 `Authorization: Bearer ${DEEPSEEK_API_KEY}`、JSON response format、固定请求超时和取消 signal；错误响应仅映射为安全的状态码和通用消息。
- [ ] `parseModelJson(text)` 只接受单个 JSON 对象，拒绝围栏、前后散文和无效 JSON，并限制模型响应字节数。
- [ ] `createOutline(input, templateData, materialText)` 输出模块/章/节稳定 id、标题和简述；`generateModule(input, outline, moduleId, materialText, signal)` 只生成指定模块，并返回对应规格片段。
- [ ] 深度规则：`concise` 控制短正文和每章 0–3 题，`standard` 采用技能默认要求，`detailed` 增加解释、例题与题目；三档均不得改变 schema。
- [ ] 每次模型响应都通过 `validateHandoutSpec` 的局部形状检查；组装后用 Python checker 检查全规格；把资料外的补充知识标记在正文中。
- [ ] 注入模拟 fetch 测试，覆盖正确响应、缺密钥、超时、取消、HTTP 错误、畸形 JSON、未知 module id 和 schema 错误。
- [ ] 运行 `npm --prefix site test`。

### 任务 6：安全资料提取

**文件：**
- 修改：`site/package.json`（加入 PDF/DOCX 解析依赖）
- 新建：`site/server/services/materials.js`
- 新建：`site/server/routes/materials.js`
- 新建：`site/test/materials.test.js`

- [ ] 使用 multipart 表单接收最多 5 个文件，每个最多 10 MiB，总计最多 25 MiB；仅按扩展名和签名允许 PDF、DOCX、PPTX、TXT、MD。
- [ ] 在唯一临时目录提取文本：PDF 用 `pdf-parse`，DOCX 用 `mammoth`，PPTX 用 `fflate` 读取 `ppt/slides/slide*.xml` 并解析 XML 文本，TXT/MD 使用 UTF-8。
- [ ] PDF 限制 100 页，所有文件提取文本合计最多 100,000 字符；拒绝空文本、加密 PDF、坏压缩包、超限归档展开大小和不受支持格式。
- [ ] 只响应 `{ files: [{ name, chars, text }] }`，原始 buffer 和临时目录在响应前删除；不将上传流直接发给 DeepSeek。
- [ ] 测试扩展名欺骗、损坏文件、空文档、数量/大小/页数/字符数限制和成功提取。
- [ ] 运行 `npm --prefix site test`。

### 任务 7：HTTP API 和流式生成

**文件：**
- 新建：`site/server/routes/templates.js`
- 新建：`site/server/routes/handouts.js`
- 新建：`site/server/index.js`
- 新建：`site/test/api.test.js`
- 修改：`site/vite.config.js`

- [ ] `GET /api/templates` 读取 `shared/templates.json` 并返回四模板信息。
- [ ] `POST /api/handouts/outline` 校验输入，返回模块大纲；`POST /api/handouts/generate` 使用 SSE 发送 `event: progress` 模块状态及 `event: result` 最终 spec。
- [ ] `POST /api/handouts/check` 调用 Python `check`；`POST /api/handouts/docx` 必须先校验无 error，再调用 Python `build` 并以 attachment 返回 DOCX。
- [ ] 实现同源校验、CORS 默认关闭、每 IP 每 15 分钟最多 10 次 outline/generate、最多 3 个并发生成；只有 `TRUST_PROXY=true` 才读取代理 IP 头。
- [ ] API 不记录请求体、资料文本、模型 prompt、密钥或生成结果。响应关闭时向 DeepSeek fetch 和生成任务传入 AbortSignal。
- [ ] 使用注入的假模型和临时目录 API 测试，覆盖端到端成功、缺 API key、SSE 取消、Python 校验拒绝 DOCX 和错误清理。
- [ ] 运行 `npm --prefix site test`。

## 阶段 3：工作台与内容编辑

### 任务 8：创建表单、大纲树和选课/深度选择

**文件：**
- 新建：`site/src/components/HandoutForm.jsx`
- 新建：`site/src/components/OutlineEditor.jsx`
- 新建：`site/src/components/ModuleTree.jsx`
- 新建：`site/src/lib/api.js`
- 新建：`site/src/lib/handout-schema.js`
- 新建：`site/src/test/outline-editor.test.jsx`

- [ ] 表单提供主题、适用对象、模板、章节数量、习题需求和资料上传；资料提取后先预览文本并明确确认后才可开始生成。
- [ ] 大纲树允许添加、删除、改名和排序模块、章、小节；每个模块可选择纳入本次生成，至少选择一个。
- [ ] 提供 `精简 / 标准 / 详细` segmented control，并提供 `无 / 基础 / 完整` 习题选择。
- [ ] 仅调用 `outline` API 创建大纲；确认后对选中模块逐个调用 SSE 生成 API，展示完成数、当前模块、错误与取消操作。
- [ ] 测试键盘操作、模块选择、排序持久状态及取消生成时保留已完成模块。
- [ ] 运行 `npm --prefix site test`。

### 任务 9：文档阅读、编辑、校验与导出

**文件：**
- 新建：`site/src/components/HandoutReader.jsx`
- 新建：`site/src/components/ChapterEditor.jsx`
- 新建：`site/src/components/ExportToolbar.jsx`
- 修改：`site/src/App.jsx`
- 修改：`site/src/styles/base.css`
- 新建：`site/src/styles/print.css`
- 新建：`site/src/test/handout-editing.test.jsx`

- [ ] 阅读器显示模块、章、小节导航；编辑章节正文与小结，重新生成仅替换所选模块/章节。
- [ ] 校验按钮展示 issues 与 stats；任何 error 时禁用 DOCX 下载并保留当前编辑内容。
- [ ] DOCX 下载使用 blob URL 且完成后释放 URL；打印样式隐藏按钮和表单，保留标题层级、列表、表格及代码块。
- [ ] 窄屏章节导航变为 select；键盘可操作全部导航和操作控件。
- [ ] 测试编辑—校验—错误阻止导出—修复—可下载状态流转。
- [ ] 运行 `npm --prefix site test`、`npm --prefix site run build` 和现有 Python example check/build。

## 阶段 4：集成验收

### 任务 10：开发/生产入口与浏览器验收

**文件：**
- 修改：`site/server/index.js`
- 修改：`site/package.json`
- 新建：`site/test/e2e/handout-flow.spec.js`
- 修改：`.gitignore`
- 修改：`site/README.md`

- [ ] 生产时由 Node 提供 Vite build 资源和 `/api`，缺少 API key 不影响页面启动，但生成端点返回清晰配置错误。
- [ ] 用 Playwright mock DeepSeek，覆盖表单—大纲—模块选择—生成—编辑—校验—DOCX 下载—打印媒体布局。
- [ ] 用 `@playwright/test` 检查 1365x900 和 390x844 无横向溢出、按钮无重叠、导航和正文可用。
- [ ] 最终执行 `node --check index.js`、`python -m py_compile builder/handout_builder.py`、示例 JSON 校验、示例 Python DOCX build、Node 插件测试、网站单测、网站构建和浏览器测试。

## 覆盖检查

- 面向教师、学生和自学者：任务 8 的通用表单与提示词。
- 模块增删改排和选择：任务 8。
- 精简/标准/详细、题量：任务 5 和任务 8。
- PDF/DOCX/PPTX/TXT/Markdown 资料提取，且不做 OCR：任务 6。
- DeepSeek 凭据和内容安全：任务 5、任务 7。
- 浏览器阅读编辑、checker 与 DOCX/PDF：任务 9。
- 保持现有插件接口兼容：阶段 1 与最终回归。
- 本机历史和社区功能不在本计划内，分别由后续计划实现。
