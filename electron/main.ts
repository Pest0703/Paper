import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Store from "electron-store";
import { parseStreamData } from "./streamParser.js";
import { classifyApiError, sanitizeApiErrorDetail } from "./apiErrors.js";

type AppState = {
  library?: unknown[];
  settings?: Record<string, unknown>;
  activePaperId?: string;
  encryptedSecret?: string;
  encryptedSecrets?: { text?: string; vision?: string; ocr?: string };
  answerCache?: Record<string, string>;
  ocrCache?: Record<string, string>;
};
const store = new Store<AppState>({
  name: "papertutor-data",
  defaults: { library: [], settings: {} },
});
const controllers = new Map<string, AbortController>();
let win: BrowserWindow | null = null;
const execFileAsync = promisify(execFile);
const activeConverted = new Set<string>();
const encrypt = (value = "") =>
  value ? safeStorage.encryptString(value).toString("base64") : "";
const decrypt = (value = "") => {
  try {
    return value ? safeStorage.decryptString(Buffer.from(value, "base64")) : "";
  } catch {
    return "";
  }
};

async function prepareReadableDocument(sourcePath: string) {
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".pdf") return sourcePath;
  if (![".doc", ".docx"].includes(ext))
    throw new Error("仅支持 PDF、DOC 和 DOCX 论文。");
  if (process.platform !== "win32")
    throw new Error("DOC/DOCX 导入当前需要 Windows 与 Microsoft Word。");
  const stat = await fs.stat(sourcePath),
    fingerprint = crypto
      .createHash("sha256")
      .update(`${path.resolve(sourcePath)}:${stat.size}:${stat.mtimeMs}`)
      .digest("hex")
      .slice(0, 24);
  const dir = path.join(app.getPath("userData"), "converted-documents"),
    target = path.join(dir, `${fingerprint}.pdf`),
    staging = path.join(dir, `${fingerprint}${ext}`),
    converter = path.join(dir, "word-to-pdf.vbs");
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(target);
    return target;
  } catch {}
  const vbs = `Option Explicit\nDim s,t,w,d\ns=WScript.Arguments(0)\nt=WScript.Arguments(1)\nOn Error Resume Next\nSet w=CreateObject("Word.Application")\nIf Err.Number<>0 Then WScript.Echo Err.Description:WScript.Quit 2\nw.Visible=False\nw.DisplayAlerts=0\nSet d=w.Documents.Open(s,False,True,False)\nIf Err.Number<>0 Then WScript.Echo Err.Description:w.Quit:WScript.Quit 3\nd.ExportAsFixedFormat t,17\nIf Err.Number<>0 Then WScript.Echo Err.Description:d.Close False:w.Quit:WScript.Quit 4\nd.Close False\nw.Quit\nWScript.Quit 0`;
  try {
    await fs.copyFile(sourcePath, staging);
    await fs.writeFile(converter, vbs, "utf8");
    await execFileAsync(
      "cscript.exe",
      ["//Nologo", "//B", converter, staging, target],
      { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    await fs.access(target);
    await fs.rm(staging, { force: true });
    return target;
  } catch (e: any) {
    await Promise.all([
      fs.rm(target, { force: true }).catch(() => {}),
      fs.rm(staging, { force: true }).catch(() => {}),
    ]);
    throw new Error(
      `Word 文档转换失败：${String(e?.stderr || e?.message || "Microsoft Word 不可用").slice(0, 300)}`,
    );
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 540,
    backgroundColor: "#f4f5f2",
    title: "PaperTutor",
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(import.meta.dirname, "../dist/index.html"));
  win.once("ready-to-show", () => win?.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on(
    "activate",
    () => BrowserWindow.getAllWindows().length === 0 && createWindow(),
  );
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("choose-pdf", async () => {
  const testPdf = app.commandLine.getSwitchValue("test-pdf");
  if (testPdf) return testPdf;
  const result = await dialog.showOpenDialog(win!, {
    properties: ["openFile"],
    filters: [
      { name: "论文文档", extensions: ["pdf", "doc", "docx"] },
      { name: "PDF", extensions: ["pdf"] },
      { name: "Word", extensions: ["doc", "docx"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});
async function scanPaperFolder(root: string) {
  const found: Array<{
    path: string;
    name: string;
    size: number;
    folderName: string;
  }> = [];
  async function visit(directory: string) {
    if (found.length >= 2000) return;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= 2000) break;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && /\.(pdf|doc|docx)$/i.test(entry.name)) {
        try {
          const stat = await fs.stat(target);
          found.push({
            path: target,
            name: entry.name,
            size: stat.size,
            folderName: path.basename(path.dirname(target)),
          });
        } catch {}
      }
    }
  }
  await visit(root);
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
ipcMain.handle("choose-paper-folder", async () => {
  const testFolder = app.commandLine.getSwitchValue("test-paper-folder");
  const folder = testFolder
    ? testFolder
    : (
        await dialog.showOpenDialog(win!, {
          properties: ["openDirectory"],
          title: "选择论文文件夹",
        })
      ).filePaths[0];
  return folder ? scanPaperFolder(folder) : [];
});
ipcMain.handle("read-pdf", async (_e, filePath: string) => {
  const readablePath = await prepareReadableDocument(filePath),
    bytes = await fs.readFile(readablePath),
    source = await fs.stat(filePath);
  if (readablePath !== filePath)
    activeConverted.add(path.resolve(readablePath));
  return {
    bytes: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    name: path.basename(filePath),
    path: filePath,
    renderPath: readablePath,
    sourceType: path.extname(filePath).slice(1).toLowerCase(),
    size: source.size,
  };
});
ipcMain.handle("load-state", () => store.store);
ipcMain.handle("save-state", (_e, patch: Partial<AppState>) => {
  Object.entries(patch).forEach(([k, v]) =>
    store.set(k as keyof AppState, v as never),
  );
  return true;
});
ipcMain.handle("save-secret", (_e, key: string) => {
  store.set(
    "encryptedSecret",
    key ? safeStorage.encryptString(key).toString("base64") : "",
  );
  return true;
});
ipcMain.handle("load-secret", () => {
  const env = process.env.DEEPSEEK_API_KEY;
  if (env) return env;
  const encrypted = store.get("encryptedSecret") as string | undefined;
  try {
    return encrypted
      ? safeStorage.decryptString(Buffer.from(encrypted, "base64"))
      : "";
  } catch {
    return "";
  }
});
ipcMain.handle("load-secrets", () => {
  const saved = store.get("encryptedSecrets") || {},
    legacy =
      decrypt(store.get("encryptedSecret") || "") ||
      process.env.DEEPSEEK_API_KEY ||
      "";
  return {
    text: decrypt(saved.text) || legacy,
    vision: decrypt(saved.vision) || legacy,
    ocr: decrypt(saved.ocr),
  };
});
ipcMain.handle(
  "save-secrets",
  (_e, keys: { text?: string; vision?: string; ocr?: string }) => {
    store.set("encryptedSecrets", {
      text: encrypt(keys.text),
      vision: encrypt(keys.vision),
      ocr: encrypt(keys.ocr),
    });
    return true;
  },
);
async function dirSize(dir: string) {
  let total = 0;
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else total += (await fs.stat(p)).size;
    }
  } catch {}
  return total;
}
ipcMain.handle("cache-info", async () => {
  const conversion = path.join(app.getPath("userData"), "converted-documents");
  return {
    conversionBytes: await dirSize(conversion),
    aiBytes: Buffer.byteLength(JSON.stringify(store.get("answerCache") || {})),
    ocrBytes: Buffer.byteLength(JSON.stringify(store.get("ocrCache") || {})),
  };
});
ipcMain.handle("clear-file-caches", async () => {
  const dir = path.join(app.getPath("userData"), "converted-documents");
  let freed = 0,
    failed: string[] = [];
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const p = path.resolve(dir, e.name);
      if (activeConverted.has(p)) continue;
      try {
        const n = (await fs.stat(p)).size;
        await fs.rm(p, { force: true });
        freed += n;
      } catch (error: any) {
        failed.push(`${e.name}: ${String(error?.code || "in use")}`);
      }
    }
  } catch {}
  return { freedBytes: freed, failed, skippedActive: activeConverted.size };
});
ipcMain.handle("cancel-request", (_e, id: string) => {
  controllers.get(id)?.abort();
  controllers.delete(id);
  return true;
});
ipcMain.handle("llm-request", async (_e, payload: any) => {
  const {
    id,
    route = "TEXT",
    baseUrl,
    model,
    apiKey,
    messages,
    temperature,
    maxTokens,
    stream,
    timeout,
  } = payload;
  const controller = new AbortController();
  controllers.set(id, controller);
  const startedAt = Date.now();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(3000, timeout || 60000),
  );
  const providerOptions = /(^|\.)deepseek\.com(?=\/|$)/i.test(
    String(baseUrl).replace(/^https?:\/\//, ""),
  )
    ? { thinking: { type: "disabled" } }
    : {};
  try {
    const response = await fetch(
      `${String(baseUrl).replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream,
          ...(stream ? { stream_options: { include_usage: true } } : {}),
          ...providerOptions,
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw Object.assign(new Error(detail), { status: response.status });
    }
    const contentType = response.headers.get("content-type") || "";
    if (!stream || !contentType.includes("text/event-stream")) {
      const json = (await response.json()) as any;
      return {
        text: json.choices?.[0]?.message?.content || "",
        ok: true,
        route,
        model,
        usage: json.usage,
        latency: Date.now() - startedAt,
      };
    }
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "",
      full = "",
      reasoning = "",
      streamDone = false,
      chunks = 0,
      finishReason = "",
      usage: any,
      firstTokenAt: number | undefined;
    while (reader && !streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines)
        if (line.trimStart().startsWith("data:")) {
          const data = line.trimStart().slice(5).trim();
          if (data === "[DONE]") {
            streamDone = true;
            break;
          }
          const parsed = parseStreamData(data);
          if (parsed) {
            usage = parsed.usage || usage;
            chunks += 1;
            full += parsed.token;
            reasoning += parsed.thought;
            finishReason = parsed.finishReason || finishReason;
            if (parsed.token) {
              firstTokenAt ??= Date.now();
              win?.webContents.send("llm-stream", {
                id,
                token: parsed.token,
                phase: "answer",
              });
            } else if (parsed.thought)
              win?.webContents.send("llm-stream", {
                id,
                phase: "reasoning",
                reasoningChars: reasoning.length,
              });
          }
        }
    }
    if (!full.trim() && reasoning.trim())
      return {
        ok: false,
        code: "empty",
        message: "The model returned reasoning but no final answer.",
        chunks,
        finishReason,
      };
    if (!full.trim())
      return {
        ok: false,
        code: "empty",
        message: "The model stream ended without answer content.",
        chunks,
        finishReason,
      };
    return {
      text: full,
      ok: true,
      route,
      model,
      chunks,
      finishReason,
      usage,
      ttft: firstTokenAt ? firstTokenAt - startedAt : undefined,
      latency: Date.now() - startedAt,
    };
  } catch (error: any) {
    const status = error.status;
    const code =
      error.name === "AbortError"
        ? "timeout"
        : classifyApiError(status, error.message);
    return {
      ok: false,
      route,
      model,
      code,
      message: sanitizeApiErrorDetail(error.message),
    };
  } finally {
    clearTimeout(timer);
    controllers.delete(id);
  }
});
