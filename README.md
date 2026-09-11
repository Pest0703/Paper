# PaperTutor

PaperTutor 是一个面向研究生的 Windows 桌面论文精读工具。它支持 PDF、DOC 和 DOCX；Word 文档在本机生成可缓存的阅读视图，原文不修改。阅读时直接选中文字，Prompt Engine 会按任务只携带必要的句段、章节、指代证据和压缩对话状态请求 DeepSeek 等 OpenAI 兼容模型。

当前版本：`0.2.0` · 当前状态：Beta

技术栈：Electron、React、TypeScript。

## 已实现

- Electron 桌面应用，React + TypeScript 界面
- PDF canvas 与可选文本层，支持连续滚动、缩放、搜索、复制及蓝色选区
- 支持在 PDF 页面直接框选公式、图表或图片生成高清 PNG，并携带页码、附近正文和自定义问题交给视觉模型分析
- 自动保存每篇论文的当前页码与精确滚动位置，关闭重启后回到上次阅读处
- 左侧支持添加多个可命名书签，书签随论文保存，可跳回对应页和页内位置
- DOC/DOCX 本地转换缓存（Windows 需安装 Microsoft Word）
- PDF 拖选句子末端漏字时，依据已解析段落补全完整句；短术语不扩展
- 选区进入导师面板后可直接补字、删字或重写；可一键恢复原始选区，确认后才按修改内容重新调用模型
- 新的文字选区只进入右侧编辑框，不会自动请求模型；确认识别内容无误后才开始分析
- Paper → Section → Paragraph → Sentence 本地结构索引与页码追溯
- Context Builder：当前位置、邻接段落、章节摘要、论文档案、全文检索、对话历史
- DeepSeek/OpenAI-compatible Provider 调用，流式回答、取消旧请求、超时和中文错误分类
- 模型设置支持 DeepSeek、OpenAI 预设及任意自定义 OpenAI-compatible Base URL，并分别配置文字模型与图片理解模型
- 文字任务与图片任务强制独立路由；共享 Provider、Base URL 和 API Key，但图片模型为空或失败时绝不回退到文字模型
- 自定义提示词位于右侧导师面板；每次选区可选内置提示词或“自定义提问”，确认后合并为一次模型请求
- API Key 使用 Electron `safeStorage` 加密保存，也支持 `DEEPSEEK_API_KEY`
- 首次导入模型预读，论文档案、阅读页码与缩放状态持久化，重启不重复解析
- Overview、模型设置、连接测试、长回答独立滚动、小窗口导师抽屉
- 导师回答与追问内容更新时自动跟随到最新回答，无需手动滚动到底部

## 架构

```text
electron/              主进程、文件访问、安全密钥、模型网络请求
src/PdfViewer.tsx      PDF 渲染与文本选择
src/services/parser.ts PDF 层级解析
src/services/context.ts 检索与上下文预算入口
src/TutorPanel.tsx     流式导师对话
src/Settings.tsx       Provider 配置与连接测试
tests/                 Electron UI 测试
```

网络请求只发生在 Electron 主进程。渲染层不直接持有文件系统能力。论文解析与定位在本机完成，发送给模型的是经过筛选的结构化上下文，不会在每次选择后重复发送整篇 PDF。

## 安装与运行

需要 Node.js 20+，Windows 10/11。

```powershell
npm install
npm run dev
```

生产构建与启动：

```powershell
npm run build
npm start
```

生成 Windows 可运行目录：

```powershell
npm run pack
```

## 模型配置

打开“设置 → AI 模型”，输入共享的 API Key、Base URL，以及独立的“文字模型”和“图片理解模型”。两条路由各有自己的真实连接测试按钮。当前百炼配置使用文字模型 `qwen3.7-plus` 和图片理解模型 `qwen3.8-max`。

应用不会把 Key 写入 Git、日志或截图。没有 Key 时可以完成论文结构解析，但不会生成任何本地替代回答；模型预读与解释必须由配置的 Provider 完成。

旧版本单一 `model` 字段升级时只迁移到文字模型；图片理解模型不会从文字模型推断或自动补齐。纯文字请求统一标记为 `TEXT`，截图请求统一标记为 `VISION`，记录中只保存路由和实际模型名称，不保存正文、图片或 Key。

## 数据与缓存

配置、论文档案、阅读位置位于 Electron 的 `userData` 目录内，数据文件名为 `papertutor-data.json`。原始 PDF 不复制，应用保存其本机路径。移动原文件后需重新导入。

缓存身份由文件路径和文件大小指纹、模型设置及结构化档案共同管理。当前版本重新导入同一路径文件会更新记录。

## 测试

```powershell
npm test
npm run test:ui
```

UI 测试覆盖启动、800×600 至 2560×1440 的七种尺寸、设置页、真实 PDF 导入与应用重启恢复。模型连接使用设置页的真实连接测试；项目不把 Mock 回答视为模型验收。

## 当前限制

- 扫描型 PDF 尚无 OCR，需可提取文字的论文。
- 双栏论文的阅读顺序依赖坐标排序，复杂浮动图注可能需要人工核对。
- 图片理解效果取决于所配置视觉模型对公式、图表和小字号截图的能力。
- 第一版采用关键词相关性检索，Provider 接口已与检索实现解耦，可后续加入 embedding。
- API 返回 token usage 时的统计面板尚未完成。

## 后续方向

加入 OCR、embedding 混合检索、引用跳转、用量统计和安装包签名。
