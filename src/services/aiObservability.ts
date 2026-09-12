import type { ContextSource, PromptRequest } from "./promptEngine";
import { estimateCost } from "./pricing";
import { sanitizeSensitiveText } from "./privacy";

export type AiCallType = "TEXT" | "VISION" | "OCR";
export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};
export type ContextSection = {
  name: string;
  content: string;
  sourceType: string;
  reason?: string;
  page?: number;
  section?: string;
  paragraphId?: string;
  score?: number;
};
export type RequestContextSnapshot = {
  requestId: string;
  callType: AiCallType;
  model: string;
  taskType: string;
  selection: string;
  userQuestion?: string;
  conversationState?: string;
  sections: ContextSection[];
  finalMessages: unknown[];
  image?: {
    attached: true;
    mime: string;
    width?: number;
    height?: number;
    page?: number;
  };
};
export type AiCallRecord = {
  requestId: string;
  callType: AiCallType;
  model: string;
  taskType: string;
  usage: AiUsage;
  latencyMs: number;
  ttftMs?: number;
  localCacheHit: boolean;
  providerCacheHit?: boolean;
  estimatedCost?: number;
  currency: "CNY";
  snapshot: RequestContextSnapshot;
};

export function normalizeUsage(raw: any): AiUsage {
  if (!raw) return {};
  const input = number(raw.prompt_tokens ?? raw.input_tokens),
    output = number(raw.completion_tokens ?? raw.output_tokens),
    total = number(raw.total_tokens);
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens:
      total ?? (input != null && output != null ? input + output : undefined),
  };
}
const number = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

export function sanitizeForInspection(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeForInspection);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            !/^(api.?key|authorization|cookie|password|secret|access.?token|refresh.?token|github.?token)$/i.test(
              k,
            ),
        )
        .map(([k, v]) => [k, sanitizeForInspection(v)]),
    );
  if (typeof value === "string") return sanitizeSensitiveText(value);
  return value;
}

function parsePacket(
  packet: string,
  sources: ContextSource[],
): ContextSection[] {
  const matches = [
    ...packet.matchAll(/^\[([A-Z]+)\]\n([\s\S]*?)(?=\n\n\[[A-Z]+\]\n|$)/gm),
  ];
  return matches.map((m) => {
    const src = sources.find((x) => x.name === m[1]);
    const loc = m[1] === "LOC" ? m[2].match(/p\.(\d+).*§(.+)/) : null;
    return {
      name: m[1],
      content: m[2],
      sourceType: sourceName(m[1]),
      reason: src?.reason,
      page: src?.page ?? (loc ? Number(loc[1]) : undefined),
      section: src?.section ?? loc?.[2],
      paragraphId: src?.paragraphId,
      score: src?.score,
    };
  });
}
const sourceName = (name: string) =>
  (
    ({
      CTX: "当前段落",
      PREV: "上一段",
      NEXT: "下一段",
      SECTION: "章节摘要",
      REF: "全文检索",
      STATE: "对话阅读状态",
      QUESTION: "本次用户问题",
      LOC: "当前位置",
      TASK: "任务类型",
      OUTPUT: "输出契约",
      LAST: "上轮回答提要",
    }) as Record<string, string>
  )[name] || name;

export function createSnapshot(args: {
  requestId: string;
  callType: AiCallType;
  model: string;
  selection: string;
  question?: string;
  state?: string;
  built: PromptRequest;
  messages: unknown[];
  image?: RequestContextSnapshot["image"];
}): RequestContextSnapshot {
  return {
    requestId: args.requestId,
    callType: args.callType,
    model: args.model,
    taskType: args.built.task,
    selection: args.selection,
    userQuestion: args.question || undefined,
    conversationState: args.state || undefined,
    sections: parsePacket(args.built.packet, args.built.sources),
    finalMessages: sanitizeForInspection(args.messages),
    image: args.image,
  };
}

export function createCallRecord(args: {
  snapshot: RequestContextSnapshot;
  usage?: any;
  latencyMs: number;
  ttftMs?: number;
  localCacheHit: boolean;
  providerCacheHit?: boolean;
}): AiCallRecord {
  const usage = normalizeUsage(args.usage),
    cost = estimateCost(
      args.snapshot.model,
      usage.inputTokens,
      usage.outputTokens,
    );
  return {
    requestId: args.snapshot.requestId,
    callType: args.snapshot.callType,
    model: args.snapshot.model,
    taskType: args.snapshot.taskType,
    usage,
    latencyMs: args.latencyMs,
    ttftMs: args.ttftMs,
    localCacheHit: args.localCacheHit,
    providerCacheHit: args.providerCacheHit,
    estimatedCost: cost,
    currency: "CNY",
    snapshot: args.snapshot,
  };
}

export function safeCopyText(value: unknown) {
  return JSON.stringify(sanitizeForInspection(value), null, 2);
}
