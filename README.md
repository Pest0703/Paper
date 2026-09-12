# PaperTutor

PaperTutor 是一个面向研究生的 Windows 桌面论文精读工具。它支持 PDF、DOC 和 DOCX；Word 文档在本机生成可缓存的阅读视图，原文不修改。阅读时直接选中文字，Prompt Engine 会按任务只携带必要的句段、章节、指代证据和压缩对话状态请求 DeepSeek 等 OpenAI 兼容模型。

当前版本：`0.2.1` · 当前状态：Beta

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
- 模型设置支持任意 OpenAI-compatible 服务，并为 TEXT、VISION、OCR 分别配置 URL、API Key 与 Model
- 三条业务路径强制独立取用凭据；任一路由未配置时明确提示，绝不回退到其他模型
- 支持用户主动对当前 PDF 页面执行 OCR；原生文字保留优先，OCR 结果带来源标记并单独缓存
- 自定义提示词位于右侧导师面板；每次选区可选内置提示词或“自定义提问”，确认后合并为一次模型请求
- API Key 使用 Electron `safeStorage` 加密保存，也支持 `DEEPSEEK_API_KEY`
- 首次导入模型预读，论文档案、阅读页码与缩放状态持久化，重启不重复解析
- Overview 和导师回答默认使用简体中文，专业名词、数据集、公式、指标与缩写可保留原文
- Overview、三路独立连接测试、长回答独立滚动、小窗口导师抽屉
- 导师回答与追问内容更新时自动跟随到最新回答，无需手动滚动到底部
- 设置页可分别查看 AI 回答、OCR、Word 转换缓存占用，并在确认后安全清理；论文、进度、书签和凭据不受影响
- 每个 AI 回答可展开查看实际模型、TEXT/VISION/OCR、Token、总耗时、首字延迟、本地缓存、服务商缓存与估算费用
- 每个回答绑定自己的请求上下文快照，可核查选区、相邻段落、章节摘要、检索结果、阅读状态、问题和实际 messages
- 视觉上下文只保存图片 MIME、尺寸和页码；Base64、API Key 与认证信息不会进入查看器或复制内容

## 架构

```text
electron/              主进程、文件访问、安全密钥、模型网络请求
src/PdfViewer.tsx      PDF 渲染与文本选择
src/services/parser.ts PDF 层级解析
src/services/context.ts 检索与上下文预算入口
src/TutorPanel.tsx     流式导师对话
src/AiCallDetails.tsx  单次调用详情与上下文查看器
src/services/aiObservability.ts 请求元数据、快照与安全清洗
src/services/pricing.ts 模型基础公开单价与费用估算
src/Settings.tsx       三路 Provider 配置、连接测试与缓存管理
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

打开设置页，分别填写 TEXT、VISION、OCR 的 API URL、API Key 和 Model。三套配置拥有独立的安全存储槽和真实连接测试按钮，即使值相同也不会在内部共享或隐式继承。当前百炼配置使用文字模型 `qwen3.7-plus`，图片理解模型与 OCR 模型使用 `qwen3.8-max`。

应用不会把 Key 写入 Git、日志或截图。没有 Key 时可以完成论文结构解析，但不会生成任何本地替代回答；模型预读与解释必须由配置的 Provider 完成。

旧版本单一 `model` 字段升级时只迁移到文字模型；OCR 默认关闭且配置为空。旧共享密钥仅在迁移时复制进 TEXT 和 VISION 两个独立安全槽，OCR 不会自动继承。纯文字、截图与页面识别分别标记为 `TEXT`、`VISION`、`OCR`，记录中不保存 Key 或图片 Base64。

## 数据与缓存

配置、论文档案、阅读位置位于 Electron 的 `userData` 目录内，数据文件名为 `papertutor-data.json`。原始 PDF 不复制，应用保存其本机路径。移动原文件后需重新导入。

AI 回答缓存和 OCR 缓存分别存储。OCR 缓存身份包含论文、页码、页面图像哈希、OCR 模型和 Prompt 版本；重复识别同页可直接命中。设置页的清理操作只删除可重新生成的数据，占用中的 Word 转换缓存会跳过并报告，不会导致应用崩溃。

## 测试

```powershell
npm test
npm run test:ui
```

UI 测试覆盖启动、800×600 至 2560×1440 的七种尺寸、设置页、真实 PDF 导入与应用重启恢复。模型连接使用设置页的真实连接测试；项目不把 Mock 回答视为模型验收。

## 隐私与安全开发规则

- 真实 API Key、授权头和用户专属 Workspace 地址不得进入 Git。
- 真实论文、私人论文名称、本机用户路径、运行状态、截图、日志和缓存不得提交。
- 私人测试资源、API 地址和凭据只能通过环境变量或命令行参数传入；缺失时测试应跳过或明确退出。
- `.env.example` 只保留空值；PDF、DOC、DOCX、截图和 Electron profile 默认被忽略。
- 提交前运行 `npm run privacy:check`；历史发布前运行 `npm run privacy:history`。本地 hook 可通过 `npm run hooks:install` 安装。

费用始终标为“估算费用”。当前价格表包含 `qwen3.7-plus` 和 `qwen3.8-max` 的基础公开 CNY 单价，不模拟免费额度、限时优惠、Token Plan、缓存折扣或节省计划；未知模型显示“未配置”。

## 当前限制

- OCR 为用户主动触发的整页补充识别，不会自动批量处理整篇扫描 PDF。
- 双栏论文的阅读顺序依赖坐标排序，复杂浮动图注可能需要人工核对。
- 图片理解效果取决于所配置视觉模型对公式、图表和小字号截图的能力。
- 第一版采用关键词相关性检索，Provider 接口已与检索实现解耦，可后续加入 embedding。
- 费用仅在已配置公开单价的模型上估算，服务商未返回 usage 时相应 Token 字段显示不可用。

## 后续方向

加入 OCR 区域裁剪、embedding 混合检索、引用跳转和安装包签名。
