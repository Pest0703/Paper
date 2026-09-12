import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  BookOpen,
  CloudCheck,
  GearSix,
  List,
  DotsThreeOutline,
  SidebarSimple,
  Sparkle,
  UploadSimple,
} from "@phosphor-icons/react";
import { PdfViewer } from "./PdfViewer";
import { Settings } from "./Settings";
import { TutorPanel, type Turn } from "./TutorPanel";
import {
  buildPromptRequest,
  summarizeConversation,
  type ReadingState,
  type PromptRequest,
} from "./services/promptEngine";
import { formatTutorAnswer } from "./services/answerFormatter";
import { completeSelection } from "./services/context";
import { parsePaper } from "./services/parser";
import {
  attachVisionImage,
  migrateModelSettings,
  routeErrorMessage,
  withRouteModel,
  type ModelRoute,
} from "./services/modelRouting";
import {
  createCallRecord,
  createSnapshot,
  type AiCallRecord,
} from "./services/aiObservability";
import { credentialsFor } from "./services/apiClients";
import { cacheClearPatch } from "./services/cachePolicy";
import { OVERVIEW_SYSTEM_PROMPT } from "./prompts/overviewPrompt";
import type {
  ApiSecrets,
  Bookmark,
  PaperRecord,
  Settings as SettingsType,
} from "./types";
const defaults: SettingsType = {
  provider: "Custom OpenAI Compatible",
  textBaseUrl: "",
  textModel: "qwen3.7-plus",
  visionBaseUrl: "",
  visionModel: "qwen3.8-max",
  ocrMode: "disabled",
  ocrBaseUrl: "",
  ocrModel: "",
  temperature: 0.25,
  maxTokens: 1200,
  streaming: true,
  timeout: 180000,
};
const errText: Record<string, string> = {
  auth: "API 认证失败，请到设置检查密钥。",
  model: "模型名称不可用，请到设置修改。",
  timeout: "模型响应超时，请稍后重试。",
  rate: "请求频率或额度受限，请稍后重试。",
  server: "模型服务暂时异常，请稍后重试。",
  network: "无法连接模型服务，请检查网络与地址。",
  empty:
    "模型请求已完成，但接口没有返回可显示的正文。请更换模型或关闭流式输出后重试。",
  vision: "当前图片理解模型拒绝了图片输入，请核对模型能力和接口格式。",
  missing_model: "尚未配置对应模型。",
};
export function App() {
  const [hydrated, setHydrated] = useState(false);
  const [papers, setPapers] = useState<PaperRecord[]>([]);
  const [paper, setPaper] = useState<PaperRecord | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [settings, setSettings] = useState(defaults);
  const [keys, setKeys] = useState<ApiSecrets>({
    text: "",
    vision: "",
    ocr: "",
  });
  const [view, setView] = useState<"reader" | "settings" | "overview">(
    "reader",
  );
  const [panel, setPanel] = useState(true);
  const [selected, setSelected] = useState("");
  const [originalSelected, setOriginalSelected] = useState("");
  const [capture, setCapture] = useState<{
    dataUrl: string;
    page: number;
    width?: number;
    height?: number;
  } | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerCall, setAnswerCall] = useState<AiCallRecord | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ n: number; msg: string } | null>(
    null,
  );
  const [requestId, setRequestId] = useState("");
  const [readingState, setReadingState] = useState<ReadingState>({
    summary: "",
  });
  const [promptDebug, setPromptDebug] = useState<PromptRequest | null>(null);
  const answerCache = useRef(new Map<string, string>());
  const ocrCache = useRef(new Map<string, string>());
  const tokenMetrics = useRef<any[]>([]);
  const paperRef = useRef<PaperRecord | null>(null);
  useEffect(() => {
    Promise.all([
      window.paperTutor.loadState(),
      window.paperTutor.loadSecrets(),
    ])
      .then(async ([s, k]) => {
        const loadedSettings = migrateModelSettings(s.settings, defaults);
        if (loadedSettings.provider === "OpenAI Compatible")
          loadedSettings.provider = "Custom OpenAI Compatible";
        setSettings(loadedSettings);
        tokenMetrics.current = Array.isArray(s.tokenMetrics)
          ? s.tokenMetrics
          : [];
        answerCache.current = new Map(Object.entries(s.answerCache || {}));
        ocrCache.current = new Map(Object.entries(s.ocrCache || {}));
        setKeys(k);
        const lib = (s.library || []) as PaperRecord[];
        setPapers(lib);
        const active = lib.find((p) => p.id === s.activePaperId) || lib[0];
        if (active) await openRecord(active);
        setHydrated(true);
      })
      .catch(() => {
        setError("本地应用状态读取失败，已使用默认设置启动。");
        setHydrated(true);
      });
  }, []);
  useEffect(
    () =>
      window.paperTutor.onStream((d) => {
        if (d.id === requestId && d.token) setAnswer((a) => a + d.token);
      }),
    [requestId],
  );
  const persist = (next: PaperRecord[]) =>
    window.paperTutor.saveState({
      library: next,
      activePaperId: paper?.id,
      settings,
    });
  async function openRecord(rec: PaperRecord) {
    try {
      const f = await window.paperTutor.readPdf(rec.path);
      const doc = await pdfjs.getDocument({ data: new Uint8Array(f.bytes) })
        .promise;
      setPdf(doc);
      const restored = {
        ...rec,
        page: rec.page || 1,
        scrollTop: rec.scrollTop || 0,
        bookmarks: rec.bookmarks || [],
      };
      paperRef.current = restored;
      setPaper(restored);
      setView("reader");
    } catch {
      setError("无法重新打开这篇论文，原文件可能已移动。");
    }
  }
  async function importPdf() {
    const path = await window.paperTutor.choosePdf();
    if (!path) return;
    setProgress({ n: 3, msg: "正在读取论文文件" });
    setError("");
    try {
      const f = await window.paperTutor.readPdf(path);
      const doc = await pdfjs.getDocument({ data: new Uint8Array(f.bytes) })
        .promise;
      setPdf(doc);
      const profile = await parsePaper(doc, (n, msg) =>
        setProgress({ n, msg }),
      );
      const id = await sha(`${f.path}:${f.size}`);
      let rec: PaperRecord = {
        id,
        name: f.name,
        path: f.path,
        size: f.size,
        fingerprint: id,
        profile,
        importedAt: new Date().toISOString(),
        page: 1,
        scale: 1.1,
        scrollTop: 0,
        bookmarks: [],
        status: "parsing",
      };
      if (!keys.text) {
        const next = [rec, ...papers.filter((p) => p.id !== id)];
        setProgress(null);
        setError(
          "论文结构已解析，但模型预读尚未开始。请先在设置中配置 DeepSeek API Key。",
        );
        paperRef.current = rec;
        setPaper(rec);
        setPapers(next);
        await window.paperTutor.saveState({
          library: next,
          activePaperId: id,
          settings,
        });
        setView("settings");
        return;
      }
      setProgress({ n: 84, msg: "DeepSeek 正在阅读论文结构与核心内容" });
      const rid = crypto.randomUUID();
      const r = await window.paperTutor.llmRequest({
        id: rid,
        baseUrl: settings.textBaseUrl,
        route: "TEXT",
        model: settings.textModel,
        apiKey: keys.text,
        temperature: 0.1,
        maxTokens: 2600,
        stream: false,
        timeout: settings.timeout,
        messages: [
          {
            role: "system",
            content: OVERVIEW_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify({
              title: profile.title,
              abstract: profile.abstract,
              sections: profile.sections.map((s) => ({
                id: s.id,
                title: s.title,
                page: s.page,
                text: s.summary.slice(0, 600),
              })),
            }).slice(0, 45000),
          },
        ],
      });
      if (!r.ok) throw Object.assign(new Error(r.message), { code: r.code });
      try {
        const data = JSON.parse(r.text.replace(/^```json|```$/g, "").trim());
        profile.researchQuestion =
          data.researchQuestion || profile.researchQuestion;
        profile.contributions = data.contributions || profile.contributions;
        profile.methods = data.methods || profile.methods;
        (data.sections || []).forEach((x: any) => {
          const s = profile.sections.find((y) => y.id === x.id);
          if (s && x.summary) s.summary = x.summary;
        });
      } catch {}
      rec = { ...rec, status: "ready", profile };
      const next = [rec, ...papers.filter((p) => p.id !== id)];
      paperRef.current = rec;
      setPaper(rec);
      setPapers(next);
      await window.paperTutor.saveState({
        library: next,
        activePaperId: id,
        settings,
      });
      setProgress(null);
      setView("overview");
    } catch (e: any) {
      setProgress(null);
      setError(errText[e.code] || `论文导入失败：${e.message || "未知错误"}`);
    }
  }
  async function executeExplanation(
    text: string,
    followup: string | undefined,
    route: ModelRoute,
    imageDataUrl?: string,
  ) {
    if (!paper || !text) return;
    const routeConfig = credentialsFor(route, settings, keys),
      routeKey = routeConfig.apiKey,
      routeUrl = routeConfig.baseUrl;
    if (!routeKey) {
      setError("需要先配置 API Key 才能调用模型。");
      setView("settings");
      return;
    }
    if (requestId) await window.paperTutor.cancelRequest(requestId);
    const id = crypto.randomUUID();
    setRequestId(id);
    const previousVisibleAnswer = answer;
    const previousAnswerCall = answerCall;
    setAnswer("");
    setAnswerCall(null);
    setError("");
    setBusy(true);
    setPanel(true);
    const nextState = followup
      ? summarizeConversation(followup, readingState, answer)
      : { summary: "" };
    const built = buildPromptRequest(
      paper.profile,
      text,
      followup || "",
      nextState,
    );
    setPromptDebug(built);
    let routed: { model: string; route: ModelRoute };
    try {
      routed = withRouteModel(settings, route, {});
    } catch (e: any) {
      setBusy(false);
      setError(routeErrorMessage(route, "", e.message));
      return;
    }
    const requestModel = routed.model;
    const imageHash = imageDataUrl ? await sha(imageDataUrl) : "";
    const cacheKey = [
      paper.id,
      route,
      await sha(text),
      imageHash,
      built.task,
      built.promptVersion,
      requestModel,
      built.contextHash,
    ].join(":");
    let messages: any[] = built.messages.map((m) => ({ ...m }));
    if (imageDataUrl) messages = attachVisionImage(messages, imageDataUrl);
    const snapshot = createSnapshot({
      requestId: id,
      callType: route,
      model: requestModel,
      selection: text,
      question: followup,
      state: nextState.summary,
      built,
      messages,
      image: imageDataUrl
        ? {
            attached: true,
            mime: "image/png",
            width: capture?.width,
            height: capture?.height,
            page: capture?.page,
          }
        : undefined,
    });
    const cached = answerCache.current.get(cacheKey);
    if (cached) {
      const formatted = formatTutorAnswer(cached);
      const call = createCallRecord({
        snapshot,
        latencyMs: 1,
        localCacheHit: true,
      });
      setAnswer(formatted);
      setAnswerCall(call);
      setBusy(false);
      if (followup)
        setReadingState(summarizeConversation(followup, nextState, formatted));
      recordMetric(call);
      return;
    }
    const r = await window.paperTutor.llmRequest({
      id,
      route,
      baseUrl: routeUrl,
      model: requestModel,
      apiKey: routeKey,
      messages,
      temperature: settings.temperature,
      maxTokens: Math.min(settings.maxTokens, built.maxTokens),
      stream: settings.streaming,
      timeout: settings.timeout,
    });
    setBusy(false);
    if (!r.ok) {
      setError(
        routeErrorMessage(
          route,
          requestModel,
          errText[r.code] || "模型请求失败。",
        ),
      );
      return;
    }
    const final = formatTutorAnswer(r.text || answer || "");
    if (!final) {
      setError(
        "模型请求已经结束，但没有返回正文。请关闭流式输出或更换模型后重试。",
      );
      return;
    }
    if (followup)
      setTurns((t) =>
        [
          ...t,
          ...(previousVisibleAnswer
            ? [
                {
                  role: "assistant" as const,
                  content: previousVisibleAnswer,
                  call: previousAnswerCall || undefined,
                },
              ]
            : []),
          { role: "user" as const, content: followup },
        ].slice(-6),
      );
    else setTurns([]);
    setAnswer(final);
    const cacheDetails =
      r.usage?.prompt_tokens_details || r.usage?.input_tokens_details;
    const providerCacheHit = cacheDetails
      ? Number(cacheDetails.cached_tokens || 0) > 0
      : undefined;
    const call = createCallRecord({
      snapshot,
      usage: r.usage,
      latencyMs: r.latency,
      ttftMs: r.ttft,
      localCacheHit: false,
      providerCacheHit,
    });
    setAnswerCall(call);
    answerCache.current.set(cacheKey, final);
    const cacheEntries = [...answerCache.current.entries()].slice(-100);
    answerCache.current = new Map(cacheEntries);
    window.paperTutor.saveState({
      answerCache: Object.fromEntries(cacheEntries),
    });
    setReadingState(
      followup
        ? summarizeConversation(followup, nextState, final)
        : summarizeConversation("", { summary: "" }, final),
    );
    recordMetric(call);
  }
  function explainText(text: string, followup?: string) {
    return executeExplanation(text, followup, "TEXT");
  }
  function explainVision(
    text: string,
    followup: string | undefined,
    imageDataUrl: string,
  ) {
    return executeExplanation(text, followup, "VISION", imageDataUrl);
  }
  async function executeOcr(image: {
    dataUrl: string;
    page: number;
    width: number;
    height: number;
  }) {
    if (!paper) return;
    if (
      settings.ocrMode !== "api" ||
      !settings.ocrBaseUrl ||
      !settings.ocrModel ||
      !keys.ocr
    ) {
      setError("尚未配置 OCR API，请前往设置。");
      setView("settings");
      return;
    }
    const id = crypto.randomUUID(),
      imageHash = await sha(image.dataUrl),
      cacheKey = [
        paper.id,
        image.page,
        imageHash,
        settings.ocrModel,
        "ocr_v1",
      ].join(":");
    const messages: any[] = [
      {
        role: "system",
        content:
          "你是学术论文 OCR 引擎。忠实识别页面文字，保留段落、公式符号和阅读顺序；只输出识别文本，不解释、不翻译。",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `识别第 ${image.page} 页。` },
          {
            type: "image_url",
            image_url: { url: image.dataUrl, detail: "high" },
          },
        ],
      },
    ];
    const built: any = {
      task: "OCR",
      packet: `[TASK]\nOCR\n\n[LOC]\np.${image.page}\n\n[OCR_PROMPT]\n忠实识别页面文字`,
      sources: [
        {
          name: "LOC",
          reason: "用户主动对此页执行 OCR",
          priority: 0,
          chars: 10,
          page: image.page,
        },
      ],
      messages,
      promptVersion: "ocr_v1",
      contextLevel: 0,
      retrieval: false,
      contextHash: imageHash,
      tokenEstimate: 0,
      maxTokens: settings.maxTokens,
    };
    const snapshot = createSnapshot({
      requestId: id,
      callType: "OCR",
      model: settings.ocrModel,
      selection: `第 ${image.page} 页 OCR`,
      question: "识别页面文字",
      built,
      messages,
      image: {
        attached: true,
        mime: "image/png",
        width: image.width,
        height: image.height,
        page: image.page,
      },
    });
    setBusy(true);
    setPanel(true);
    setAnswer("");
    setAnswerCall(null);
    const cached = ocrCache.current.get(cacheKey);
    if (cached) {
      snapshot.sections.push({
        name: "OCR_OUTPUT",
        content: cached,
        sourceType: "OCR 识别结果（本地缓存）",
        page: image.page,
      });
      const call = createCallRecord({
        snapshot,
        latencyMs: 1,
        localCacheHit: true,
      });
      setAnswer(cached);
      setAnswerCall(call);
      setBusy(false);
      recordMetric(call);
      return;
    }
    const r = await window.paperTutor.llmRequest({
      id,
      route: "OCR",
      baseUrl: settings.ocrBaseUrl,
      model: settings.ocrModel,
      apiKey: keys.ocr,
      messages,
      temperature: 0,
      maxTokens: settings.maxTokens,
      stream: false,
      timeout: settings.timeout,
    });
    setBusy(false);
    if (!r.ok) {
      setError(
        routeErrorMessage(
          "OCR",
          settings.ocrModel,
          errText[r.code] || "OCR 请求失败。",
        ),
      );
      return;
    }
    const text = String(r.text || "").trim();
    if (!text) {
      setError("OCR 完成但没有返回可用文字。");
      return;
    }
    snapshot.sections.push({
      name: "OCR_OUTPUT",
      content: text,
      sourceType: "OCR 识别结果",
      page: image.page,
    });
    ocrCache.current.set(cacheKey, text);
    window.paperTutor.saveState({
      ocrCache: Object.fromEntries(ocrCache.current),
    });
    const sec =
      paper.profile.sections.find((s) => s.page <= image.page) ||
      paper.profile.sections[0];
    if (
      sec &&
      !sec.paragraphs.some((p) => p.source === "ocr" && p.page === image.page)
    ) {
      const p = {
        id: `ocr-${image.page}-${imageHash.slice(0, 8)}`,
        text,
        page: image.page,
        sectionId: sec.id,
        sentences: [],
        source: "ocr" as const,
      };
      const profile = {
        ...paper.profile,
        sections: paper.profile.sections.map((s) =>
          s.id === sec.id ? { ...s, paragraphs: [...s.paragraphs, p] } : s,
        ),
      };
      updateRec({ profile });
    }
    const call = createCallRecord({
      snapshot,
      usage: r.usage,
      latencyMs: r.latency,
      localCacheHit: false,
    });
    setAnswer(text);
    setAnswerCall(call);
    setSelected(`第 ${image.page} 页 OCR 结果`);
    setOriginalSelected(`第 ${image.page} 页 OCR 结果`);
    recordMetric(call);
  }
  function onSelected(t: string) {
    const completed = paper ? completeSelection(paper.profile, t) : t;
    setSelected(completed);
    setCapture(null);
    setOriginalSelected(completed);
    setAnswer("");
    setAnswerCall(null);
    setTurns([]);
    setReadingState({ summary: "" });
    setError("");
    setPanel(true);
  }
  function onCaptured(next: {
    dataUrl: string;
    page: number;
    width: number;
    height: number;
  }) {
    setCapture(next);
    setSelected(`第 ${next.page} 页截图`);
    setOriginalSelected(`第 ${next.page} 页截图`);
    setAnswer("");
    setAnswerCall(null);
    setTurns([]);
    setReadingState({ summary: "" });
    setError("");
    setPanel(true);
  }
  function analyzeCapture(question: string) {
    if (!capture) return;
    const nearby =
      paper?.profile.sections
        .flatMap((s) => s.paragraphs)
        .filter((p) => p.page === capture.page)
        .slice(0, 3)
        .map((p) => p.text)
        .join(" ")
        .slice(0, 1800) || "";
    explainVision(
      `第 ${capture.page} 页截图。${nearby}`,
      question,
      capture.dataUrl,
    );
  }
  function recordMetric(call: AiCallRecord) {
    const row = {
      at: new Date().toISOString(),
      requestId: call.requestId,
      route: call.callType,
      model: call.model,
      task: call.taskType,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      totalTokens: call.usage.totalTokens,
      latency: call.latencyMs,
      ttft: call.ttftMs,
      localCacheHit: call.localCacheHit,
      providerCacheHit: call.providerCacheHit,
      estimatedCost: call.estimatedCost,
    };
    tokenMetrics.current = [...tokenMetrics.current.slice(-99), row];
    window.paperTutor.saveState({
      tokenMetrics: tokenMetrics.current,
      lastPromptMetric: row,
    });
  }
  function updateRec(ch: Partial<PaperRecord>) {
    const current = paperRef.current || paper;
    if (!current) return;
    const p = { ...current, ...ch };
    paperRef.current = p;
    setPaper(p);
    setPapers((existing) => {
      const next = existing.map((x) => (x.id === p.id ? p : x));
      window.paperTutor.saveState({
        library: next,
        activePaperId: p.id,
        settings,
      });
      return next;
    });
  }
  function replaceBookmarks(bookmarks: Bookmark[]) {
    const current = paperRef.current || paper;
    if (!current) return;
    const p = { ...current, bookmarks };
    paperRef.current = p;
    setPaper(p);
    const next = papers.map((x) => (x.id === p.id ? p : x));
    setPapers(next);
    window.paperTutor.saveState({
      library: next,
      activePaperId: p.id,
      settings,
    });
  }
  function addBookmark(name: string, page: number, scrollTop: number) {
    const current = paperRef.current || paper;
    if (!current) return;
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name,
      page,
      scrollTop,
      createdAt: new Date().toISOString(),
    };
    replaceBookmarks([...(current.bookmarks || []), bookmark]);
  }
  function removeBookmark(id: string) {
    replaceBookmarks(
      ((paperRef.current || paper)?.bookmarks || []).filter((b) => b.id !== id),
    );
  }
  async function saveSettings(s: SettingsType, k: ApiSecrets) {
    setSettings(s);
    setKeys(k);
    await window.paperTutor.saveSecrets(k);
    await window.paperTutor.saveState({
      settings: s,
      library: papers,
      activePaperId: paper?.id,
    });
    setView(paper ? "reader" : "settings");
  }
  async function clearCaches(_selected: string[]) {
    answerCache.current.clear();
    ocrCache.current.clear();
    const patch = cacheClearPatch(papers),
      cleaned = patch.library;
    setPapers(cleaned);
    if (paper) {
      const current = cleaned.find((p) => p.id === paper.id) || paper;
      setPaper(current);
      paperRef.current = current;
    }
    await window.paperTutor.saveState({
      ...patch,
      ...(paper ? { activePaperId: paper.id } : {}),
      settings,
    });
    return window.paperTutor.clearFileCaches();
  }
  const current = useMemo(
    () =>
      paper
        ? paper.profile.sections.find((s) =>
            s.paragraphs.some((p) => p.page === paper.page),
          ) || paper.profile.sections.find((s) => s.page <= paper.page)
        : null,
    [paper],
  );
  if (!hydrated)
    return <div className="startup">PaperTutor 正在准备阅读环境…</div>;
  return (
    <div className="app-shell">
      <nav className="topbar">
        <button className="brand" onClick={() => setView("reader")}>
          <span>PT</span>
          <b>PaperTutor</b>
        </button>
        <div className="paper-title">
          <BookOpen />
          <div>
            <strong>{paper?.profile.title || "还没有打开论文"}</strong>
            <small>
              {paper
                ? `${current?.title || "论文"} · 第 ${paper.page} 页`
                : "导入后开始结构化预读"}
            </small>
          </div>
        </div>
        <div className="top-actions">
          {paper && (
            <button className="status" onClick={() => setView("overview")}>
              <CloudCheck />
              已缓存
            </button>
          )}
          <button className="import" onClick={importPdf}>
            <UploadSimple />
            导入论文
          </button>
          <button
            className="icon"
            onClick={() => setPanel(!panel)}
            aria-label="切换导师面板"
          >
            <SidebarSimple />
          </button>
          <button
            className="icon"
            onClick={() => setView("settings")}
            aria-label="设置"
          >
            <GearSix />
          </button>
        </div>
      </nav>
      {view === "settings" ? (
        <Settings
          settings={settings}
          apiKeys={keys}
          onSave={saveSettings}
          onClearCaches={clearCaches}
          onBack={() => setView("reader")}
        />
      ) : view === "overview" && paper ? (
        <Overview paper={paper} onBack={() => setView("reader")} />
      ) : (
        <div className={`workspace ${panel ? "" : "panel-closed"}`}>
          <PdfViewer
            pdf={pdf}
            page={paper?.page || 1}
            scale={paper?.scale || 1.1}
            initialScrollTop={paper?.scrollTop || 0}
            bookmarks={paper?.bookmarks || []}
            onPage={(n) => updateRec({ page: n })}
            onScale={(n) => updateRec({ scale: n })}
            onScroll={(n) => updateRec({ scrollTop: n })}
            onAddBookmark={addBookmark}
            onRemoveBookmark={removeBookmark}
            onCapture={onCaptured}
            onOcr={executeOcr}
            onSelect={onSelected}
          />
          {panel && (
            <TutorPanel
              selected={selected}
              originalSelected={originalSelected}
              capture={capture}
              answer={answer}
              answerCall={answerCall}
              turns={turns}
              busy={busy}
              error={error}
              onAsk={(q) =>
                capture ? analyzeCapture(q) : explainText(selected, q)
              }
              onAction={(q) =>
                capture ? analyzeCapture(q) : explainText(selected, q)
              }
              onEditSelection={setSelected}
              onResetSelection={() => setSelected(originalSelected)}
              onReanalyze={(question) => {
                setTurns([]);
                setReadingState({ summary: "" });
                explainText(selected, question.trim() || undefined);
              }}
              onAnalyzeCapture={analyzeCapture}
              onClearCapture={() => {
                setCapture(null);
                setSelected("");
                setOriginalSelected("");
                setAnswer("");
                setAnswerCall(null);
                setTurns([]);
              }}
              onCancel={() => {
                window.paperTutor.cancelRequest(requestId);
                setBusy(false);
              }}
              onClose={() => setPanel(false)}
              onJump={(p) => updateRec({ page: p })}
              promptDebug={promptDebug}
            />
          )}
        </div>
      )}
      {error && view === "reader" && !selected && (
        <div className="global-error">
          <span>{error}</span>
          <button onClick={() => setError("")}>关闭</button>
        </div>
      )}
      {!panel && view === "reader" && (
        <button className="floating-tutor" onClick={() => setPanel(true)}>
          <Sparkle />
          打开论文导师
        </button>
      )}
      {progress && (
        <div className="modal">
          <div className="progress-card">
            <div className="paper-pulse">
              <span />
              <span />
              <span />
            </div>
            <p className="eyebrow">Paper Pre-reading</p>
            <h2>AI 正在提前阅读这篇论文</h2>
            <p>{progress.msg}</p>
            <div className="bar">
              <i style={{ width: `${progress.n}%` }} />
            </div>
            <small>{progress.n}% · 已完成部分会自动保存</small>
          </div>
        </div>
      )}
    </div>
  );
}
function Overview({
  paper,
  onBack,
}: {
  paper: PaperRecord;
  onBack: () => void;
}) {
  return (
    <main className="overview">
      <header>
        <button className="back" onClick={onBack}>
          返回阅读
        </button>
        <p className="eyebrow">Paper Overview</p>
        <h1>{paper.profile.title}</h1>
        <p>{paper.profile.abstract}</p>
      </header>
      <div className="overview-grid">
        <section>
          <h2>这篇论文要解决什么</h2>
          <p>{paper.profile.researchQuestion}</p>
          <h2>核心贡献</h2>
          <ol>
            {paper.profile.contributions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
          <h2>方法路线</h2>
          <ul>
            {paper.profile.methods.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>
        <aside>
          <h2>阅读地图</h2>
          {paper.profile.sections.slice(0, 14).map((s) => (
            <button key={s.id} onClick={onBack}>
              <span>{s.title}</span>
              <small>第 {s.page} 页</small>
            </button>
          ))}
        </aside>
      </div>
    </main>
  );
}
async function sha(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
