import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  BookOpen,
  CloudCheck,
  GearSix,
  List,
  NotePencil,
  Export,
  DotsThreeOutline,
  Scan,
  SidebarSimple,
  Sparkle,
  UploadSimple,
} from "@phosphor-icons/react";
import { Settings } from "./Settings";
import { TutorPanel, type Turn } from "./TutorPanel";
import { OcrPanel } from "./OcrPanel";
import { PaperLibrary } from "./PaperLibrary";
import type { NoteEditorHandle, NoteInsertion } from "./NoteEditor";
import {
  ocrPagesFromProfile,
  upsertOcrPage,
  type OcrPageResult,
} from "./services/ocrWorkspace";
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
import {
  createIndexedPaper,
  mergePaperLibrary,
  toLibraryItem,
} from "./services/paperLibrary";
import {
  applyOverviewTranslation,
  parseOverviewResponse,
} from "./services/overviewTranslation";
import { LruCache } from "./services/lru";
import type {
  ApiSecrets,
  Bookmark,
  PaperLibraryItem,
  PaperFullData,
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
const NoteEditor = lazy(() =>
  import("./NoteEditor").then((module) => ({ default: module.NoteEditor })),
);
const PdfViewer = lazy(() =>
  import("./PdfViewer").then((module) => ({ default: module.PdfViewer })),
);
const ExportCenter = lazy(() =>
  import("./ExportCenter").then((module) => ({ default: module.ExportCenter })),
);
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
  const [papers, setPapers] = useState<PaperLibraryItem[]>([]);
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
  const [ocrOpen, setOcrOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [noteInsertion, setNoteInsertion] = useState<NoteInsertion | null>(
    null,
  );
  const [selectedPage, setSelectedPage] = useState(1);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPages, setOcrPages] = useState<OcrPageResult[]>([]);
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
  const profileCache = useRef(new LruCache<string, PaperFullData>(3));
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const noteEditorRef = useRef<NoteEditorHandle>(null);
  useEffect(() => {
    document.documentElement.dataset.shellReady = String(
      Math.round(performance.now()),
    );
    if (import.meta.env.DEV)
      console.info(
        `[Startup Performance] React Shell Mounted ${Math.round(performance.now())} ms`,
      );
  }, []);
  useEffect(
    () =>
      window.paperTutor.onBeforeClose(async () => {
        await noteEditorRef.current?.flush();
        await window.paperTutor.confirmNotesFlushed();
      }),
    [],
  );
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
        setKeys(k);
        const lib = (s.library || []) as PaperLibraryItem[];
        setPapers(lib);
        document.documentElement.dataset.libraryReady = String(
          Math.round(performance.now()),
        );
        if (import.meta.env.DEV)
          console.info(
            `[Startup Performance] Library Visible ${Math.round(performance.now())} ms`,
          );
        const active = lib.find((p) => p.id === s.activePaperId);
        setHydrated(true);
        if (active)
          setTimeout(() => openRecord(active, loadedSettings, k, lib), 0);
        else if (lib.length) setLibraryOpen(true);
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
  function cacheProfile(id: string, data: PaperFullData) {
    profileCache.current.set(id, data);
  }
  async function releasePdf() {
    const previous = pdfRef.current;
    pdfRef.current = null;
    setPdf(null);
    if (previous) {
      try {
        await previous.cleanup();
        await previous.destroy();
      } catch {}
    }
  }
  async function openRecord(
    rec: PaperLibraryItem,
    runtimeSettings = settings,
    runtimeKeys = keys,
    library = papers,
  ) {
    const restoreStarted = performance.now();
    if (import.meta.env.DEV)
      console.info("[Startup Performance] Active Paper Restore Start");
    await noteEditorRef.current?.flush();
    let data: PaperFullData | null | undefined = profileCache.current.get(
      rec.id,
    );
    if (!data) {
      data = await window.paperTutor.loadPaperData(rec.id);
      if (data) cacheProfile(rec.id, data);
    }
    if (!data || rec.profileStatus === "missing")
      return analyzePaper(rec, runtimeSettings, runtimeKeys, library);
    try {
      await releasePdf();
      const f = await window.paperTutor.readPdf(rec.path);
      const pdfjs = await import("pdfjs-dist");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(f.bytes) })
        .promise;
      pdfRef.current = doc;
      setPdf(doc);
      const restored = {
        ...rec,
        profile: data.profile,
        bookmarks: data.bookmarks || [],
        page: rec.page || 1,
        scrollTop: rec.scrollTop || 0,
      };
      paperRef.current = restored;
      setPaper(restored);
      setOcrPages(ocrPagesFromProfile(restored.profile));
      setView("reader");
      setLibraryOpen(false);
      document.documentElement.dataset.readerReady = String(
        Math.round(performance.now()),
      );
      if (import.meta.env.DEV)
        console.info(
          `[Startup Performance] Active Paper Ready ${Math.round(performance.now() - restoreStarted)} ms`,
        );
    } catch {
      setError("无法重新打开这篇论文，原文件可能已移动。");
    }
  }
  async function importPdf() {
    const path = await window.paperTutor.choosePdf();
    if (!path) return;
    const name = path.split(/[\\/]/).pop() || "论文";
    const id = await sha(path);
    await analyzePaper({
      id,
      name,
      path,
      size: 0,
      fingerprint: id,
      importedAt: new Date().toISOString(),
      page: 1,
      scale: 1.1,
      scrollTop: 0,
      status: "indexed",
      profileStatus: "missing",
      title: name.replace(/\.(pdf|docx?)$/i, ""),
      bookmarkCount: 0,
    });
  }
  async function importPaperFolder() {
    const files = await window.paperTutor.choosePaperFolder();
    if (!files.length) return;
    const discovered = await Promise.all(
      files.map(async (file) =>
        createIndexedPaper(file, await sha(`${file.path}:${file.size}`)),
      ),
    );
    const next = mergePaperLibrary(papers, discovered);
    setPapers(next);
    await window.paperTutor.saveState({ library: next, settings });
    setLibraryOpen(true);
  }
  async function analyzePaper(
    seed: PaperLibraryItem,
    runtimeSettings = settings,
    runtimeKeys = keys,
    library = papers,
  ) {
    setProgress({ n: 3, msg: "正在读取论文文件" });
    setError("");
    try {
      const f = await window.paperTutor.readPdf(seed.path);
      await releasePdf();
      const pdfjs = await import("pdfjs-dist");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(f.bytes) })
        .promise;
      pdfRef.current = doc;
      setPdf(doc);
      const profile = await parsePaper(doc, (n, msg) =>
        setProgress({ n, msg }),
      );
      const id = await sha(`${f.path}:${f.size}`);
      let rec: PaperRecord = {
        ...seed,
        id,
        name: f.name,
        path: f.path,
        size: f.size,
        fingerprint: id,
        profile,
        bookmarks: [],
        importedAt: seed.importedAt || new Date().toISOString(),
        status: "parsing",
      };
      if (!runtimeKeys.text) {
        const item = { ...toLibraryItem(rec), profileStatus: "ready" as const };
        const next = [item, ...library.filter((p) => p.id !== id)];
        setProgress(null);
        setError(
          "论文结构已解析，但模型预读尚未开始。请先在设置中配置文字模型 API。",
        );
        paperRef.current = rec;
        setPaper(rec);
        setOcrPages(ocrPagesFromProfile(rec.profile));
        setPapers(next);
        const full = {
          profile: rec.profile,
          bookmarks: rec.bookmarks || [],
          schemaVersion: 1 as const,
        };
        cacheProfile(id, full);
        await window.paperTutor.savePaperData(id, full);
        await window.paperTutor.saveState({
          library: next,
          activePaperId: id,
          settings: runtimeSettings,
        });
        setView("settings");
        return;
      }
      setProgress({ n: 84, msg: "大模型正在阅读论文结构与核心内容" });
      const rid = crypto.randomUUID();
      const r = await window.paperTutor.llmRequest({
        id: rid,
        baseUrl: runtimeSettings.textBaseUrl,
        route: "TEXT",
        model: runtimeSettings.textModel,
        apiKey: runtimeKeys.text,
        temperature: 0.1,
        maxTokens: 2600,
        stream: false,
        timeout: runtimeSettings.timeout,
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
      const data = parseOverviewResponse(r.text);
      rec.profile = applyOverviewTranslation(profile, data);
      rec = { ...rec, status: "ready", profile: rec.profile };
      const full = {
        profile: rec.profile,
        bookmarks: rec.bookmarks || [],
        schemaVersion: 1 as const,
      };
      cacheProfile(id, full);
      await window.paperTutor.savePaperData(id, full);
      const item = toLibraryItem(rec);
      const next = [item, ...library.filter((p) => p.id !== id)];
      paperRef.current = rec;
      setPaper(rec);
      setOcrPages(ocrPagesFromProfile(rec.profile));
      setPapers(next);
      await window.paperTutor.saveState({
        library: next,
        activePaperId: id,
        settings: runtimeSettings,
      });
      setProgress(null);
      setView("overview");
      setLibraryOpen(false);
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
    setOcrOpen(true);
    setOcrBusy(true);
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
      setOcrPages((pages) =>
        upsertOcrPage(pages, { page: image.page, text: cached }),
      );
      setOcrBusy(false);
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
    setOcrBusy(false);
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
    setOcrPages((pages) => upsertOcrPage(pages, { page: image.page, text }));
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
    recordMetric(call);
  }
  function onSelected(t: string, page = paper?.page || 1) {
    const completed = paper ? completeSelection(paper.profile, t) : t;
    setSelected(completed);
    setCapture(null);
    setOriginalSelected(completed);
    setSelectedPage(page);
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
    const full: PaperFullData = {
      profile: p.profile,
      bookmarks: p.bookmarks || [],
      schemaVersion: 1,
    };
    cacheProfile(p.id, full);
    window.paperTutor.savePaperData(p.id, full);
    setPapers((existing) => {
      const item = toLibraryItem(p);
      const next = existing.map((x) => (x.id === p.id ? item : x));
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
    const full: PaperFullData = {
      profile: p.profile,
      bookmarks,
      schemaVersion: 1,
    };
    cacheProfile(p.id, full);
    window.paperTutor.savePaperData(p.id, full);
    const item = toLibraryItem(p);
    const next = papers.map((x) => (x.id === p.id ? item : x));
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
    setOcrPages([]);
    if (paper) {
      const cleaned = cacheClearPatch([paper]).library[0];
      setPaper(cleaned);
      paperRef.current = cleaned;
      const full: PaperFullData = {
        profile: cleaned.profile,
        bookmarks: cleaned.bookmarks || [],
        schemaVersion: 1,
      };
      cacheProfile(cleaned.id, full);
      await window.paperTutor.savePaperData(cleaned.id, full);
    }
    await window.paperTutor.saveState({
      answerCache: {},
      ocrCache: {},
      library: papers,
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
          <button
            className="status"
            onClick={() => setExportOpen(true)}
            aria-label="导出笔记"
          >
            <Export />
            导出笔记
          </button>
          <button
            className="status"
            onClick={() => setOcrOpen(true)}
            aria-label="打开 OCR 文本页"
          >
            <Scan />
            OCR 文本
          </button>
          <button
            className="status"
            onClick={() => setLibraryOpen(true)}
            aria-label="打开论文目录"
          >
            <List />
            论文目录
          </button>
          {paper && (
            <button
              className="status"
              onClick={() => setNoteOpen(true)}
              aria-label="打开论文笔记"
            >
              <NotePencil />
              论文笔记
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
        <div
          className={`workspace ${ocrOpen ? "ocr-open" : ""} ${
            panel ? "tutor-open" : "panel-closed"
          }`}
        >
          {!hydrated && (
            <div className="reader-restoring">正在加载论文目录…</div>
          )}
          <Suspense
            fallback={<div className="reader-restoring">正在准备阅读器…</div>}
          >
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
          </Suspense>
          {ocrOpen && (
            <OcrPanel
              pages={ocrPages}
              busy={ocrBusy}
              onClose={() => setOcrOpen(false)}
              onSelect={onSelected}
            />
          )}
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
              onAddSelection={() => {
                if (!selected.trim()) return;
                setNoteOpen(true);
                setNoteInsertion({
                  id: crypto.randomUUID(),
                  kind: "quote",
                  text: selected,
                  page: selectedPage,
                  sectionId: current?.id,
                });
              }}
              onAddAnswer={() => {
                const text =
                  answer ||
                  turns.filter((t) => t.role === "assistant").at(-1)?.content ||
                  "";
                if (!text) return;
                setNoteOpen(true);
                setNoteInsertion({
                  id: crypto.randomUUID(),
                  kind: "ai",
                  text,
                  page: selectedPage,
                  sectionId: current?.id,
                });
              }}
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
      {libraryOpen && (
        <PaperLibrary
          papers={papers}
          activeId={paper?.id}
          onOpen={openRecord}
          onImportPaper={importPdf}
          onImportFolder={importPaperFolder}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      {noteOpen && paper && (
        <Suspense
          fallback={<div className="panel-loading">正在打开论文笔记…</div>}
        >
          <NoteEditor
            ref={noteEditorRef}
            paper={paper}
            pending={noteInsertion}
            onConsumed={() => setNoteInsertion(null)}
            onClose={() => setNoteOpen(false)}
            onAnchor={(page) => {
              updateRec({ page });
              setNoteOpen(false);
              setView("reader");
            }}
          />
        </Suspense>
      )}
      {exportOpen && (
        <Suspense
          fallback={<div className="panel-loading">正在打开导出中心…</div>}
        >
          <ExportCenter papers={papers} onClose={() => setExportOpen(false)} />
        </Suspense>
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
        <h1>{paper.profile.overviewTitle || paper.profile.title}</h1>
        <p>{paper.profile.overviewAbstract || paper.profile.abstract}</p>
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
              <span>
                {paper.profile.overviewSectionTitles?.[s.id] || s.title}
              </span>
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
