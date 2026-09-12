import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  shell,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import Store from "electron-store";
import { parseStreamData } from "./streamParser.js";
import { classifyApiError, sanitizeApiErrorDetail } from "./apiErrors.js";
import { NoteStore } from "./noteStore.js";
import { buildNotesDocx, sanitizeFilename } from "./docxExport.js";

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
const bootAt = performance.now();
const devTiming = (name: string, startedAt = bootAt) => {
  if (!app.isPackaged)
    console.info(
      `[Startup Performance] ${name} ${Math.round(performance.now() - startedAt)} ms`,
    );
};
const controllers = new Map<string, AbortController>();
let win: BrowserWindow | null = null;
let notes: NoteStore | null = null;
let closeConfirmed = false;
const execFileAsync = promisify(execFile);
const activeConverted = new Set<string>();
protocol.registerSchemesAsPrivileged([
  {
    scheme: "papertutor-note-asset",
    privileges: { secure: true, supportFetchAPI: true },
  },
]);
const safeId = (id: string) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");
const paperDataPath = (id: string) =>
  path.join(app.getPath("userData"), "papers", safeId(id), "profile.json");
const libraryMetadata = (record: any) => ({
  id: record.id,
  name: record.name,
  path: record.path,
  size: record.size || 0,
  fingerprint: record.fingerprint || record.id,
  importedAt: record.importedAt,
  lastOpenedAt: record.lastOpenedAt,
  page: record.page || 1,
  scale: record.scale || 1.1,
  scrollTop: record.scrollTop || 0,
  status: record.status || "indexed",
  folderName: record.folderName,
  title: record.title || record.profile?.title || record.name,
  authors: record.authors || record.profile?.authors || "",
  bookmarkCount: record.bookmarkCount ?? record.bookmarks?.length ?? 0,
  profileStatus:
    record.profileStatus || (record.profile?.sections ? "ready" : "missing"),
});

async function savePaperData(id: string, data: any) {
  const target = paperDataPath(id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  const backup = `${target}.bak`;
  await fs.writeFile(temporary, JSON.stringify(data), "utf8");
  try {
    await fs.rename(temporary, target);
  } catch (error: any) {
    if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
    await fs.rm(backup, { force: true });
    await fs.rename(target, backup);
    try {
      await fs.rename(temporary, target);
      await fs.rm(backup, { force: true });
    } catch (replaceError) {
      await fs.rename(backup, target).catch(() => {});
      throw replaceError;
    }
  }
}
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
  closeConfirmed = false;
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
  win.on("close", (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    win?.webContents.send("flush-notes-before-close");
    setTimeout(() => {
      closeConfirmed = true;
      win?.destroy();
    }, 2500);
  });
}

app.whenReady().then(() => {
  devTiming("mainReady");
  notes = new NoteStore(app.getPath("userData"));
  protocol.handle("papertutor-note-asset", (request) => {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return new Response("Not found", { status: 404 });
    const noteId = safeId(parts[0]);
    const filename = /^[a-f0-9]{64}\.(png|jpe?g|gif|webp)$/i.test(parts[1])
      ? parts[1]
      : "";
    if (!noteId || !filename) return new Response("Not found", { status: 404 });
    const target = path.join(
      app.getPath("userData"),
      "note-assets",
      noteId,
      filename,
    );
    return net.fetch(pathToFileURL(target).toString());
  });
  createWindow();
  app.on(
    "activate",
    () => BrowserWindow.getAllWindows().length === 0 && createWindow(),
  );
});
app.on("window-all-closed", () => {
  notes?.close();
  notes = null;
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("note-list", () => notes?.list() || []);
ipcMain.handle("note-open", (_e, paperId: string, title: string) =>
  notes!.getOrCreate(paperId, title),
);
ipcMain.handle("note-save", (_e, note: any) => {
  notes!.save(note);
  return true;
});
ipcMain.handle("open-external", (_e, target: string) => {
  const url = new URL(target);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("不允许的链接协议");
  return shell.openExternal(url.toString());
});
ipcMain.handle("notes-flushed", () => {
  closeConfirmed = true;
  win?.destroy();
  return true;
});
async function persistNoteImage(
  noteId: string,
  bytes: Uint8Array,
  extension: string,
) {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const ext = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const dir = path.join(app.getPath("userData"), "note-assets", safeId(noteId));
  const filename = `${hash}.${ext}`;
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(path.join(dir, filename));
  } catch {
    await fs.writeFile(path.join(dir, filename), bytes);
  }
  notes?.registerAsset(noteId, {
    id: hash,
    relativePath: path.join(safeId(noteId), filename),
    mime: `image/${ext}`,
    hash,
  });
  return `papertutor-note-asset://asset/${safeId(noteId)}/${filename}`;
}
ipcMain.handle("note-choose-image", async (_e, noteId: string) => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ["openFile"],
    filters: [
      { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
    ],
  });
  if (result.canceled) return null;
  const source = result.filePaths[0];
  return persistNoteImage(
    noteId,
    await fs.readFile(source),
    path.extname(source).slice(1),
  );
});
ipcMain.handle(
  "note-save-image",
  (_e, noteId: string, bytes: Uint8Array, mime: string) =>
    persistNoteImage(noteId, bytes, mime.split("/")[1] || "png"),
);
ipcMain.handle("export-notes", async (_e, payload: any) => {
  const library = (store.get("library") || []) as any[];
  const selected = (payload.paperIds || [])
    .map((paperId: string) => {
      const metadata = library.find((paper) => paper.id === paperId);
      const note = notes?.loadByPaper(paperId);
      return note && metadata
        ? { title: metadata.title || metadata.name, content: note.content }
        : null;
    })
    .filter(Boolean) as Array<{ title: string; content: any }>;
  if (!selected.length) throw new Error("没有可导出的笔记");
  if (payload.mode === "separate") {
    const result = await dialog.showOpenDialog(win!, {
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return { canceled: true };
    const directory = result.filePaths[0];
    const files: string[] = [];
    for (let index = 0; index < selected.length; index++) {
      win?.webContents.send("export-progress", {
        current: index + 1,
        total: selected.length,
      });
      const base = sanitizeFilename(selected[index].title);
      let target = path.join(directory, `${base}.docx`),
        suffix = 2;
      while (
        await fs
          .access(target)
          .then(() => true)
          .catch(() => false)
      )
        target = path.join(directory, `${base} (${suffix++}).docx`);
      await fs.writeFile(
        target,
        await buildNotesDocx([selected[index]], app.getPath("userData"), {
          toc: false,
          pageBreak: false,
        }),
      );
      files.push(target);
    }
    return { canceled: false, files };
  }
  const result = await dialog.showSaveDialog(win!, {
    defaultPath: "PaperTutor-Notes.docx",
    filters: [{ name: "Word 文档", extensions: ["docx"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  win?.webContents.send("export-progress", {
    current: 1,
    total: selected.length,
  });
  await fs.writeFile(
    result.filePath,
    await buildNotesDocx(
      selected,
      app.getPath("userData"),
      payload.options || {},
    ),
  );
  return { canceled: false, files: [result.filePath] };
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
ipcMain.handle("load-state", async () => {
  const startedAt = performance.now();
  const raw = store.store;
  const legacy = Array.isArray(raw.library) ? (raw.library as any[]) : [];
  const library = legacy.map(libraryMetadata);
  await Promise.all(
    legacy
      .filter((record) => record?.profile)
      .map((record) =>
        savePaperData(record.id, {
          profile: record.profile,
          bookmarks: record.bookmarks || [],
          schemaVersion: 1,
        }).catch(() => {}),
      ),
  );
  if (legacy.some((record) => record?.profile)) store.set("library", library);
  const result = {
    settings: raw.settings || {},
    activePaperId: raw.activePaperId,
    library,
  };
  devTiming("loadState", startedAt);
  return result;
});
ipcMain.handle("save-state", (_e, patch: Partial<AppState>) => {
  Object.entries(patch).forEach(([k, v]) => {
    if (k === "library" && Array.isArray(v))
      store.set("library", v.map(libraryMetadata) as never);
    else store.set(k as keyof AppState, v as never);
  });
  return true;
});
ipcMain.handle("load-paper-data", async (_e, id: string) => {
  try {
    return JSON.parse(await fs.readFile(paperDataPath(id), "utf8"));
  } catch {
    return null;
  }
});
ipcMain.handle("save-paper-data", async (_e, id: string, data: any) => {
  await savePaperData(id, data);
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
  const startedAt = performance.now();
  const saved = store.get("encryptedSecrets") || {},
    legacy =
      decrypt(store.get("encryptedSecret") || "") ||
      process.env.DEEPSEEK_API_KEY ||
      "";
  const result = {
    text: decrypt(saved.text) || legacy,
    vision: decrypt(saved.vision) || legacy,
    ocr: decrypt(saved.ocr),
  };
  devTiming("loadSecrets", startedAt);
  return result;
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
