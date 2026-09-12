import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import crypto from "node:crypto";
import { ensureVisibleNoteWindowState, type NoteWindowState } from "./noteWindowState.js";

export type NotePaperContext = {
  paperId: string;
  title: string;
  page: number;
  sectionId?: string;
};
export type NoteInsertRequest = {
  context: NotePaperContext;
  insertion: {
    id: string;
    paperId: string;
    text: string;
    kind: "quote" | "ai" | "anchor";
    page: number;
    sectionId?: string;
  };
};
export type { NoteWindowState } from "./noteWindowState.js";

type PendingMessage = { channel: string; payload: unknown };

export class NoteWindowManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private allowClose = false;
  private closing: Promise<boolean> | null = null;
  private pending: PendingMessage[] = [];
  private flushes = new Map<string, (ok: boolean) => void>();
  private context: NotePaperContext | null = null;
  private createdAt = 0;

  constructor(
    private readonly preloadPath: string,
    private readonly rendererPath: string,
    private readonly devUrl: string | undefined,
    private readonly loadState: () => NoteWindowState | undefined,
    private readonly saveState: (state: NoteWindowState) => void,
  ) {}

  get browserWindow() { return this.window; }
  get currentContext() { return this.context; }
  isSender(sender: Electron.WebContents) {
    return Boolean(this.window && !this.window.isDestroyed() && sender === this.window.webContents);
  }

  private visibleState(): NoteWindowState {
    return ensureVisibleNoteWindowState(
      this.loadState(),
      screen.getAllDisplays().map(({ workArea }) => workArea),
    );
  }

  private persistGeometry() {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getNormalBounds();
    this.saveState({ ...bounds, maximized: this.window.isMaximized() });
  }

  private create() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    this.createdAt = performance.now();
    const state = this.visibleState();
    this.ready = false;
    this.allowClose = false;
    this.window = new BrowserWindow({
      ...state,
      minWidth: 760,
      minHeight: 560,
      show: false,
      backgroundColor: "#eef0ec",
      title: "PaperTutor Notes",
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window.setMenuBarVisibility(false);
    if (state.maximized) this.window.maximize();
    if (this.devUrl) {
      const target = new URL(this.devUrl);
      target.searchParams.set("window", "notes");
      void this.window.loadURL(target.toString());
    } else {
      void this.window.loadFile(this.rendererPath, { query: { window: "notes" } });
    }
    this.window.on("close", (event) => {
      if (this.allowClose) return;
      event.preventDefault();
      void this.close(false);
    });
    this.window.on("closed", () => {
      this.window = null;
      this.ready = false;
      this.closing = null;
      this.pending = [];
    });
    if (!app.isPackaged)
      console.info(`[Note Performance] Window Create ${Math.round(performance.now() - this.createdAt)} ms`);
    return this.window;
  }

  private send(channel: string, payload: unknown) {
    if (!this.window || this.window.isDestroyed() || !this.ready) {
      this.pending.push({ channel, payload });
      return;
    }
    this.window.webContents.send(channel, payload);
  }

  open(context: NotePaperContext, focus = true) {
    this.context = context;
    const noteWindow = this.create();
    noteWindow.setTitle(`PaperTutor Notes — ${context.title}`);
    this.send("note-context-changed", context);
    if (focus) {
      noteWindow.show();
      noteWindow.focus();
    }
  }

  updateContext(context: NotePaperContext) {
    this.context = context;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.setTitle(`PaperTutor Notes — ${context.title}`);
    this.send("note-context-changed", context);
  }

  insert(request: NoteInsertRequest) {
    this.create();
    this.send("note-insert-request", request);
    this.window?.show();
    this.window?.focus();
  }

  rendererReady() {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.ready) return;
    this.ready = true;
    if (!app.isPackaged)
      console.info(`[Note Performance] Renderer Ready ${Math.round(performance.now() - this.createdAt)} ms`);
    if (this.context && !this.pending.some((item) => item.channel === "note-context-changed"))
      this.pending.unshift({ channel: "note-context-changed", payload: this.context });
    for (const message of this.pending)
      this.window.webContents.send(message.channel, message.payload);
    this.pending = [];
  }

  acknowledgeFlush(requestId: string, ok: boolean) {
    this.flushes.get(requestId)?.(ok);
    this.flushes.delete(requestId);
  }

  private async requestFlush(timeoutMs = 2500): Promise<boolean> {
    if (!this.window || this.window.isDestroyed()) return true;
    const startedAt = performance.now();
    while (!this.ready && this.window && !this.window.isDestroyed() && performance.now() - startedAt < timeoutMs)
      await new Promise((resolve) => setTimeout(resolve, 25));
    if (!this.window || this.window.isDestroyed()) return true;
    if (!this.ready) return false;
    const remaining = Math.max(100, timeoutMs - (performance.now() - startedAt));
    const requestId = crypto.randomUUID();
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.flushes.delete(requestId);
        resolve(false);
      }, remaining);
      this.flushes.set(requestId, (ok) => {
        clearTimeout(timer);
        resolve(ok);
      });
      this.window!.webContents.send("note-flush-request", requestId);
    });
  }

  close(appClosing: boolean) {
    if (!this.window || this.window.isDestroyed()) return Promise.resolve(true);
    if (this.closing) return this.closing;
    this.closing = (async () => {
      const saved = await this.requestFlush();
      if (!saved && !appClosing) {
        this.closing = null;
        this.window?.show();
        return false;
      }
      this.persistGeometry();
      this.allowClose = true;
      this.window?.destroy();
      return saved;
    })();
    return this.closing;
  }
}
