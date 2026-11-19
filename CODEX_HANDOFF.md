# Codex 交接文档 · Course Handout Studio

> 快照：2026-11-19 · 仓库 `Nounoumm/course-handout-studio` · 最新提交 `054a185`
> 用途：把本项目交给 Codex（或任何新 Agent）继续开发。读完本文即可上手，不必回看原会话。

---

## 0. 直接可用的开场提示

把下面整段发给 Codex：

```text
你在仓库 https://github.com/Nounoumm/course-handout-studio 中工作。
这是 DeepSeek Harness 的插件 @local/course-handout（课程讲义工坊），
把学生的一个主题请求扩展成模块化讲义，导出 DOCX + PDF。

开始前请先读：
1) README.md
2) skills/course-handout.md（教学法与规格格式）
3) index.js（四个工具 + 技能注册）
4) builder/handout_builder.py（DOCX 渲染与校验）
5) CODEX_HANDOFF.md（本文件）

约束：
- 不要提交任何 token、cookie 或本机绝对路径。
- 改动插件行为后，至少跑通：
  node --check index.js
  python -m py_compile builder/handout_builder.py
  python builder/handout_builder.py build --spec examples/c-pointer-demo.json --out build/demo.docx
- 不要修改用户 profile 的 package.json / cordis.patch.yml，除非任务明确要求。
- 保持工具名、输出字段和规格 schema 向后兼容；破坏性改动要先说明。

先复述你对项目的理解、当前状态和你要做的第一步，再动手。
```

---

## 1. 项目是什么

面向学生的 DSH 插件：学生提出“帮我做一份××讲义”，Agent 加载技能 `course-handout`，按“模块—章—节”设计结构，写出知识点、例题、易错点与分层习题，最后调用工具生成：

- `handouts/<标题>.docx`
- `handouts/<标题>.pdf`

插件同时注册四个模型工具：

| 工具 | 作用 |
|---|---|
| `handout_templates` | 列出四种模板：标准教材型、考前复习型、项目驱动型、双语对照型 |
| `handout_scaffold` | 按主题生成规格骨架 JSON（模块/章/节/目标/习题框架） |
| `handout_check` | 校验结构、空小节、篇幅、目标/小结、题目与答案数量 |
| `handout_build` | 渲染 DOCX，并调用 Host 的 `officeToPdf` 转 PDF |

---

## 2. 当前状态

| 项 | 值 |
|---|---|
| 仓库 | https://github.com/Nounoumm/course-handout-studio |
| 默认分支 | `main` |
| 最新提交 | `054a185` — `docs: document plugin market install flow` |
| 发布标签 | `v1.0.0` → `7808c12`（注意：标签不在最新提交上） |
| GitHub Release | https://github.com/Nounoumm/course-handout-studio/releases/tag/v1.0.0 |
| CI | `.github/workflows/ci.yml`，首次运行成功：https://github.com/Nounoumm/course-handout-studio/actions/runs/42627429911 |
| 插件名/版本 | `@local/course-handout` · `1.0.0` |
| 市场索引 | https://raw.githubusercontent.com/Nounoumm/course-handout-studio/main/market/index.json |
| 示例规格 | `examples/c-pointer-demo.json`（4 章 / 8 节 / 15 题） |
| 示例成品 | Release 附件 `course-handout-demo.pdf`（14 页）与 `.docx` |

本机（开发机）已把插件以 **link** 方式装进 `desktop` profile，指向工作区目录 `course-handout-plugin`；修改源码后可通过 HMR 或禁用/启用插件行加载。

---

## 3. 架构与数据流

```text
学生提问
  │
  ▼
Agent + skill「course-handout」
  │  设计模块/章/节，写 JSON 规格 + Markdown 正文
  ▼
handout_scaffold / 手工编辑  ──►  handouts/<主题>.json
  │
  ├─ handout_check  ──► Python: 结构校验、统计
  │
  └─ handout_build
        │
        ├─ Python (python-docx) ──► DOCX 字节
        └─ Host ctx.officeToPdf.convert(...) ──► PDF 字节
              │
              ▼
        handouts/<标题>.docx / .pdf
```

关键点：

- **Node 侧**（`index.js`）只负责工具注册、参数处理、文件路径、调用 Python 与 `officeToPdf`。
- **Python 侧**（`builder/handout_builder.py`）负责规格解析、Markdown 解析、OOXML 排版、结构检查。
- **PDF 转换**由 Host 服务完成，不调用系统 LibreOffice，也不需要额外安装。
- 技能正文在 `skills/course-handout.md`，注册时读取文件内容，属于模型可见的教学规范。

---

## 4. 文件地图

```text
.
├── index.js                     Host 插件：4 个工具 + 技能注册
├── package.json                 包清单；dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml             插入 course-handout 插件行
├── builder/
│   └── handout_builder.py       DOCX 渲染、Markdown 解析、校验、CLI
├── skills/
│   └── course-handout.md        教学法、章节规范、规格 schema、工作流
├── examples/
│   └── c-pointer-demo.json      完整示例规格
├── market/
│   ├── index.json               DSH plugin market index（format 1）
│   └── README.md                索引说明与发版流程
├── docs/
│   ├── preview-cover.png
│   └── preview-chapter.png
├── locale/{zh,en}.json          插件标题/描述
├── icon.svg                     插件图标
├── README.md / README.en.md     安装、使用、实现说明
└── .github/workflows/ci.yml     JS 语法 + Python 编译 + 示例构建
```

---

## 5. 本地开发与安装

### 5.1 依赖

- Node.js（DSH 自带运行时即可）
- Python 3.12+，需要 `python-docx`；可选 `Pillow`（图片尺寸探测）
- DSH 桌面版（Host 提供 `tools` / `skills` / `subprocess` / `officeToPdf` / `workingDirectory`）

本机 Python 示例路径：

```text
C:\Users\Xihui\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe
```

插件会自动按以下顺序发现 Python，无需配置：

1. `DSH_PYTHON`
2. `$DSH_HOME/dsh-runtimes/*/dependencies/python/python.exe`
3. `<安装目录>/resources/runtime/*/dependencies/python/python.exe`
4. PATH 上的 `python3` / `python`

### 5.2 安装插件

```text
plugin_manager install_bundle
target: <本仓库的绝对路径>
```

安装是 **link** 方式：改 `index.js` 后可通过 HMR 生效；若未生效，对 `include:course-handout` 执行 `set_plugin` 关闭再开启。

### 5.3 验证工具与技能

在会话中应能看到：

- 工具：`handout_templates` / `handout_scaffold` / `handout_check` / `handout_build`
- 技能：`course-handout`

也可以直接调用：

```text
handout_templates()
handout_check(spec_path="examples/c-pointer-demo.json")
```

示例规格应返回：`4 章 / 8 节 / 15 题 / 约 12 页`，且无 error。

---

## 6. 测试与验收

### 6.1 CI 等价检查（任何平台）

```bash
node --check index.js
python -m py_compile builder/handout_builder.py
python -m json.tool examples/c-pointer-demo.json > /dev/null
python builder/handout_builder.py build --spec examples/c-pointer-demo.json --out build/demo.docx
```

最后一条只生成 DOCX；PDF 需要 DSH 的 `officeToPdf`，由 `handout_build` 工具完成。

### 6.2 通过插件工具做端到端

```text
handout_build(spec_path="examples/c-pointer-demo.json", output_dir="build", file_stem="demo")
```

验收：

- 返回 `docx_path` 与 `pdf_path`
- `stats` 为 4 章、8 节、15 题
- PDF 可打开，约 14 页
- 抽查封面、目录、章节页、习题页、附录

### 6.3 校验器的边界

`handout_builder.py` 的 `check_spec` 会报：

- error：无模块、无章节、章节无小节、缺标题
- warning：单章模块、小节过短、目标/小结不足、习题不足、答案数量不匹配、全文过短

`handout_build` 默认在存在 error 时拒绝生成；`force: true` 可跳过。

---

## 7. 规格格式（摘要）

完整版在 `skills/course-handout.md`。最小结构：

```json
{
  "schema": "course-handout/1",
  "meta": {
    "title": "讲义标题",
    "subtitle": "副标题",
    "series": "系列名",
    "author": "作者",
    "date": "2026 年 11 月",
    "audience": "适用对象",
    "template": "standard",
    "include_toc": true,
    "include_answers": true
  },
  "preface": "可选 Markdown",
  "modules": [
    {
      "title": "第一部分　基础",
      "description": "本模块解决什么问题",
      "chapters": [
        {
          "title": "第 1 章　标题",
          "objectives": ["目标 1", "目标 2"],
          "prerequisites": ["先修"],
          "lead": "可选引入 Markdown",
          "sections": [{ "title": "1.1　小节", "body": "Markdown 正文" }],
          "summary": ["小结 1", "小结 2"],
          "key_points": ["可选的跨章要点"],
          "exercises": {
            "basic": ["题", { "q": "题", "hint": "提示" }],
            "intermediate": ["题"],
            "challenge": ["题"]
          },
          "answers": ["答案 1", "答案 2"]
        }
      ]
    }
  ],
  "appendix": {
    "glossary": [["术语", "解释"]],
    "references": [{ "title": "公开课", "url": "https://...", "note": "对应第 2 章" }],
    "notes": "可选 Markdown"
  }
}
```

正文 Markdown 支持：段落、`**粗体**`、`` `行内代码` ``、`- 列表`、`1. 列表`、围栏代码、表格、`> 提示/易错/结论`、`### 小标题`、`![图注](本地路径)`。

**公式不渲染 LaTeX**，用 Unicode 符号或代码块排版。

---

## 8. 已知限制与环境坑

1. **不要恢复 `@deepseek-ai/dsh-tools` 的 `defineTool` 导入。**
   工作区里 link 安装的插件无法解析 `@deepseek-ai/schemastery`；`index.js` 自带一个最小的 `defineTool`/`fieldSchema` 转换器。换成正式包前，需要确认插件被复制进 profile 的 `node_modules`，而不是 link。

2. **输出 schema 是标准 JSON Schema。**
   工具定义里 `output.schema` 使用对象级 `required: [...]` 数组；不要再写 `required: true`（会被 `JsonSchemaError` 拒绝）。

3. **Python 输出统一 `ensure_ascii=True`。**
   Windows 控制台默认 cp936，中文 JSON 会乱码；Node 侧按 UTF-8 解析。改打印逻辑时保持 ASCII 转义。

4. **排版依赖两个启发式。**
   代码块按空行每 ≤26 行切块；表格 ≤8 行时设置 `keep_with_next` 防止跨页拆散。改这些常量要重新检查分页。

5. **PDF 依赖 Host 服务。**
   `officeToPdf` 缺失时插件无法激活（`inject` 是硬依赖）。若要做通用版，可改为可选依赖并在缺失时只产出 DOCX。

6. **市场索引固定到提交。**
   `market/index.json` 当前指向 `7808c12`（`v1.0.0`）。发新版时：改 `package.json` 版本 → 提交/打标签 → 在索引里**追加**版本对象（不要改写已发布版本），再推送。

7. **本机网络有代理/TLS 抖动。**
   某些 `git push`/`fetch` 会报 schannel 握手失败；可用 `git -c http.sslVerify=false ...` 临时绕过（仅限本机排障）。GitHub API 上传大文件时 `curl -k` 曾成功；不要把这些参数写进脚本或文档给他人默认使用。

8. **包名是 `@local/...` 且 `private: true`。**
   目前通过 Git 安装，不发布 npm。若要 npm 发布，需要改成公开 scope、去掉 `private`、补 `engines.dsh` 与发布流程。

9. **标签与最新提交不一致。**
   `v1.0.0` 指向 `7808c12`，之后 `main` 又加了索引与文档。发新版本时请打新标签，不要移动旧标签。

10. **DSH 没有官方中心商店。**
    “商店”是用户配置的 market index；`market/index.json` 就是本项目的上架清单。本机 Host 外网 fetch 受限时，Discover 会显示 timeout，但索引本身已发布。

---

## 9. 建议的后续任务

按价值排序：

1. **客户端 UI 页面**：在 Plugins 侧栏加“讲义”表单（主题、模板、章节数、习题量），提交后触发同一套工具；需要读 `cordis-plugin-development` 的 Client Slots 文档。
2. **公式支持**：把 `$...$`/`$$...$$` 转成 OMML 或图片；目前只有纯文本公式。
3. **模板扩展**：实验报告型、习题册型、双语术语表型；模板定义在 `TEMPLATES` 与 `scaffoldSpec`。
4. **测试**：为 `parse_markdown`、`check_spec`、分页启发式加单元测试；CI 增加 PDF 页数断言（需要可用的转换环境）。
5. **国际化**：技能正文目前中文；可提供 `skills/course-handout.en.md` 并在注册时按语言选择。
6. **npm 发布**：公开包名 + `engines.dsh`，让 `install_bundle` 支持 `name@version`，减少 Git 安装成本。

---

## 10. 命令速查

| 目的 | 命令 |
|---|---|
| JS 语法 | `node --check index.js` |
| Python 编译 | `python -m py_compile builder/handout_builder.py` |
| 校验示例 | `python builder/handout_builder.py check --spec examples/c-pointer-demo.json` |
| 只构建 DOCX | `python builder/handout_builder.py build --spec examples/c-pointer-demo.json --out build/demo.docx` |
| 插件内构建（含 PDF） | `handout_build(spec_path="examples/c-pointer-demo.json")` |
| 查看插件状态 | `plugin_manager list_plugins` |
| 重载插件 | `plugin_manager set_plugin target="include:course-handout" enabled=false`，再 `true` |
| 市场索引 | `https://raw.githubusercontent.com/Nounoumm/course-handout-studio/main/market/index.json` |
| Release | `https://github.com/Nounoumm/course-handout-studio/releases/tag/v1.0.0` |

---

## 11. 交接检查清单

- [ ] 已克隆仓库，`main` 与 `origin/main` 一致
- [ ] Node 可执行 `node --check index.js`
- [ ] Python 已安装 `python-docx`，`py_compile` 通过
- [ ] 示例 DOCX 能生成（CI 等价命令）
- [ ] 插件已安装，四个工具与 `course-handout` 技能可见
- [ ] `handout_check` 对示例返回 4 章 / 8 节 / 15 题且无 error
- [ ] `handout_build` 能同时产出 DOCX 与 PDF
- [ ] 没有把 token、绝对路径、`profile-backups` 提交进仓库

---

> 同工作区还有一份数组讲义交接包 `handoff/array-lecture/`，与本插件无关；本文件只覆盖 Course Handout Studio。
