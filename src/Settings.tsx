import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeSlash,
  SpinnerGap,
  Trash,
} from "@phosphor-icons/react";
import type { ApiSecrets, Settings as SettingsType } from "./types";
import { createVisualProbe, visualProbePassed } from "./services/apiProbe";
const msg: Record<string, string> = {
  testing: "正在连接…",
  success: "连接成功",
  success_vision: "视觉能力测试通过",
  success_ocr: "OCR 测试通过",
  unverified_vision: "接口连接成功，但未能确认图片理解能力",
  unverified_ocr: "接口连接成功，但未能确认文字识别能力",
  image_generation: "无法生成视觉测试图片",
  auth: "认证失败",
  model: "模型不存在",
  timeout: "请求超时",
  rate: "额度或频率受限",
  server: "服务异常",
  vision_unsupported: "模型明确不支持图片输入",
  image_invalid: "测试图片无效或无法解析",
  image_size: "测试图片尺寸不符合接口要求",
  image_format: "测试图片格式不受支持",
  bad_request: "请求参数错误",
  empty: "接口未返回正文",
  network: "网络或接口异常",
  missing: "配置不完整",
};
type Route = "TEXT" | "VISION" | "OCR";
export function Settings({
  settings,
  apiKeys,
  onSave,
  onBack,
  onClearCaches,
}: {
  settings: SettingsType;
  apiKeys: ApiSecrets;
  onSave: (s: SettingsType, k: ApiSecrets) => Promise<void>;
  onBack: () => void;
  onClearCaches: (selected: string[]) => Promise<any>;
}) {
  const [form, setForm] = useState(settings),
    [keys, setKeys] = useState(apiKeys),
    [show, setShow] = useState<Record<string, boolean>>({}),
    [states, setStates] = useState<Record<string, string>>({}),
    [details, setDetails] = useState<Record<string, string>>({}),
    [cache, setCache] = useState<any>({}),
    [confirm, setConfirm] = useState(false),
    [result, setResult] = useState("");
  useEffect(() => {
    window.paperTutor.cacheInfo().then(setCache);
  }, []);
  const set = (x: Partial<SettingsType>) => setForm({ ...form, ...x });
  const test = async (route: Route) => {
    const baseUrl =
        route === "TEXT"
          ? form.textBaseUrl
          : route === "VISION"
            ? form.visionBaseUrl
            : form.ocrBaseUrl,
      model =
        route === "TEXT"
          ? form.textModel
          : route === "VISION"
            ? form.visionModel
            : form.ocrModel,
      key = keys[route.toLowerCase() as keyof ApiSecrets];
    if (!baseUrl || !model || !key) {
      setStates({ ...states, [route]: "missing" });
      return;
    }
    setStates((current) => ({ ...current, [route]: "testing" }));
    setDetails((current) => ({ ...current, [route]: "" }));
    let probe: ReturnType<typeof createVisualProbe> | undefined;
    try {
      probe = route === "TEXT" ? undefined : createVisualProbe(route);
    } catch {
      setStates((current) => ({ ...current, [route]: "image_generation" }));
      return;
    }
    const content = probe
      ? [
          { type: "text", text: probe.prompt },
          {
            type: "image_url",
            image_url: { url: probe.dataUrl, detail: "low" },
          },
        ]
      : "请只回复连接成功";
    const r = await window.paperTutor.llmRequest({
      id: crypto.randomUUID(),
      route,
      baseUrl,
      model,
      apiKey: key,
      messages: [{ role: "user", content }],
      temperature: 0,
      maxTokens: 20,
      stream: false,
      timeout: form.timeout,
    });
    const successCode =
      route === "TEXT"
        ? "success"
        : visualProbePassed(probe!, r.text)
          ? route === "VISION"
            ? "success_vision"
            : "success_ocr"
          : route === "VISION"
            ? "unverified_vision"
            : "unverified_ocr";
    setStates((current) => ({
      ...current,
      [route]: r.ok ? successCode : r.code || "network",
    }));
    if (!r.ok && r.message)
      setDetails((current) => ({ ...current, [route]: String(r.message) }));
  };
  return (
    <main className="settings-page">
      <header>
        <button className="back" onClick={onBack}>
          <ArrowLeft />
          返回阅读
        </button>
        <div>
          <p className="eyebrow">偏好设置</p>
          <h1>模型与存储</h1>
          <p>
            TEXT、VISION、OCR 使用三套完全独立的 URL、Key 和模型，不会互相回退。
          </p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="settings-form">
          <ApiCard
            title="文本模型"
            route="TEXT"
            url={form.textBaseUrl}
            model={form.textModel}
            secret={keys.text}
            show={show.TEXT}
            state={states.TEXT}
            detail={details.TEXT}
            onUrl={(v: string) => set({ textBaseUrl: v })}
            onModel={(v: string) => set({ textModel: v })}
            onKey={(v: string) => setKeys({ ...keys, text: v })}
            onShow={() => setShow({ ...show, TEXT: !show.TEXT })}
            onTest={() => test("TEXT")}
          />
          <ApiCard
            title="视觉模型"
            route="VISION"
            url={form.visionBaseUrl}
            model={form.visionModel}
            secret={keys.vision}
            show={show.VISION}
            state={states.VISION}
            detail={details.VISION}
            onUrl={(v: string) => set({ visionBaseUrl: v })}
            onModel={(v: string) => set({ visionModel: v })}
            onKey={(v: string) => setKeys({ ...keys, vision: v })}
            onShow={() => setShow({ ...show, VISION: !show.VISION })}
            onTest={() => test("VISION")}
          />
          <div className="api-config-card">
            <h2>OCR</h2>
            <label>
              模式
              <select
                aria-label="OCR 模式"
                value={form.ocrMode}
                onChange={(e) => set({ ocrMode: e.target.value as any })}
              >
                <option value="disabled">关闭</option>
                <option value="api">API</option>
              </select>
            </label>
            {form.ocrMode === "api" && (
              <ApiFields
                route="OCR"
                url={form.ocrBaseUrl}
                model={form.ocrModel}
                secret={keys.ocr}
                show={show.OCR}
                state={states.OCR}
                detail={details.OCR}
                onUrl={(v: string) => set({ ocrBaseUrl: v })}
                onModel={(v: string) => set({ ocrModel: v })}
                onKey={(v: string) => setKeys({ ...keys, ocr: v })}
                onShow={() => setShow({ ...show, OCR: !show.OCR })}
                onTest={() => test("OCR")}
              />
            )}
          </div>
          <div className="two">
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step=".1"
                value={form.temperature}
                onChange={(e) => set({ temperature: +e.target.value })}
              />
            </label>
            <label>
              Max Tokens
              <input
                type="number"
                min="256"
                max="16000"
                value={form.maxTokens}
                onChange={(e) => set({ maxTokens: +e.target.value })}
              />
            </label>
          </div>
          <div className="actions">
            <button className="primary" onClick={() => onSave(form, keys)}>
              保存设置
            </button>
          </div>
          <div className="cache-card">
            <h2>缓存管理</h2>
            <p>
              AI 回答：{fmt(cache.aiBytes || 0)}　OCR：
              {fmt(cache.ocrBytes || 0)}　文档转换：
              {fmt(cache.conversionBytes || 0)}
            </p>
            <p>
              只清理可重新生成的数据，不删除论文、笔记、笔记图片、书签、阅读进度、模型设置或密钥。
            </p>
            <button className="danger" onClick={() => setConfirm(true)}>
              <Trash />
              清除全部安全缓存
            </button>
            {result && <div className="connection success">{result}</div>}
          </div>
        </section>
        <aside>
          <h2>三路隔离</h2>
          <p>
            每个测试按钮和业务入口只读取自己的配置。OCR
            仅在用户主动对当前页执行时调用，不会自动整篇识别。
          </p>
        </aside>
      </div>
      {confirm && (
        <div className="confirm-modal">
          <section>
            <h2>确认清除缓存？</h2>
            <p>
              将删除 AI 回答、OCR 结果和未占用的 Word
              转换缓存。不会删除论文、笔记、笔记图片、阅读进度、书签、API 设置或安全密钥。
            </p>
            <div>
              <button onClick={() => setConfirm(false)}>取消</button>
              <button
                className="danger"
                onClick={async () => {
                  const r = await onClearCaches([
                    "ai",
                    "ocr",
                    "conversion",
                    "temp",
                  ]);
                  setResult(
                    `缓存已清除，释放 ${fmt(r.freedBytes || 0)}${r.failed?.length ? `；${r.failed.length} 项因占用未清理` : ""}`,
                  );
                  setConfirm(false);
                  setCache(await window.paperTutor.cacheInfo());
                }}
              >
                确认清除
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function ApiCard(p: any) {
  return (
    <div className="api-config-card">
      <h2>{p.title}</h2>
      <ApiFields {...p} />
    </div>
  );
}
function ApiFields(p: any) {
  return (
    <>
      <label>
        API URL
        <input
          aria-label={`${p.route} API URL`}
          value={p.url}
          onChange={(e) => p.onUrl(e.target.value)}
        />
      </label>
      <label>
        API Key
        <div className="secret">
          <input
            aria-label={`${p.route} API Key`}
            type={p.show ? "text" : "password"}
            value={p.secret}
            onChange={(e) => p.onKey(e.target.value)}
          />
          <button onClick={p.onShow} aria-label={`显示或隐藏 ${p.route} Key`}>
            {p.show ? <EyeSlash /> : <Eye />}
          </button>
        </div>
      </label>
      <label>
        模型名称
        <input
          aria-label={`${p.route} 模型`}
          value={p.model}
          onChange={(e) => p.onModel(e.target.value)}
        />
      </label>
      <button
        className="test-route"
        onClick={p.onTest}
        disabled={p.state === "testing"}
      >
        {p.state === "testing" ? (
          <SpinnerGap className="spin" />
        ) : (
          <CheckCircle />
        )}
        测试 {p.route}
      </button>
      {p.state && (
        <div className={`connection ${p.state}`}>
          <div>
            {p.model}：{msg[p.state] || msg.network}
          </div>
          {p.detail && <small>服务端返回：{p.detail}</small>}
        </div>
      )}
    </>
  );
}
const fmt = (n: number) =>
  n > 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : `${(n / 1024).toFixed(1)} KB`;
