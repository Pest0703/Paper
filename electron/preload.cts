const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("paperTutor", {
  choosePdf: () => ipcRenderer.invoke("choose-pdf"),
  choosePaperFolder: () => ipcRenderer.invoke("choose-paper-folder"),
  readPdf: (path: string) => ipcRenderer.invoke("read-pdf", path),
  loadState: () => ipcRenderer.invoke("load-state"),
  saveState: (patch: unknown) => ipcRenderer.invoke("save-state", patch),
  loadPaperData: (id: string) => ipcRenderer.invoke("load-paper-data", id),
  savePaperData: (id: string, data: unknown) =>
    ipcRenderer.invoke("save-paper-data", id, data),
  deletePaper: (id: string) => ipcRenderer.invoke("delete-paper", id),
  noteList: () => ipcRenderer.invoke("note-list"),
  noteOpen: (paperId: string, title: string) =>
    ipcRenderer.invoke("note-open", paperId, title),
  noteSave: (note: unknown) => ipcRenderer.invoke("note-save", note),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  noteChooseImage: (noteId: string) =>
    ipcRenderer.invoke("note-choose-image", noteId),
  noteSaveImage: (noteId: string, bytes: Uint8Array, mime: string) =>
    ipcRenderer.invoke("note-save-image", noteId, bytes, mime),
  exportNotes: (payload: unknown) =>
    ipcRenderer.invoke("export-notes", payload),
  onExportProgress: (cb: (data: unknown) => void) => {
    const fn = (_event: unknown, data: unknown) => cb(data);
    ipcRenderer.on("export-progress", fn);
    return () => ipcRenderer.removeListener("export-progress", fn);
  },
  openNoteWindow: (context: unknown) =>
    ipcRenderer.invoke("note-window-open", context),
  updateNoteContext: (context: unknown) =>
    ipcRenderer.invoke("note-context-update", context),
  insertIntoNote: (request: unknown) =>
    ipcRenderer.invoke("note-insert", request),
  noteWindowReady: () => ipcRenderer.invoke("note-window-ready"),
  getNoteContext: () => ipcRenderer.invoke("note-context-get"),
  onNoteContext: (cb: (context: unknown) => void) => {
    const fn = (_event: unknown, context: unknown) => cb(context);
    ipcRenderer.on("note-context-changed", fn);
    return () => ipcRenderer.removeListener("note-context-changed", fn);
  },
  onNoteInsertion: (cb: (request: unknown) => void) => {
    const fn = (_event: unknown, request: unknown) => cb(request);
    ipcRenderer.on("note-insert-request", fn);
    return () => ipcRenderer.removeListener("note-insert-request", fn);
  },
  onNoteFlushRequest: (cb: (requestId: string) => void) => {
    const fn = (_event: unknown, requestId: string) => cb(requestId);
    ipcRenderer.on("note-flush-request", fn);
    return () => ipcRenderer.removeListener("note-flush-request", fn);
  },
  confirmNoteFlush: (requestId: string, ok: boolean) =>
    ipcRenderer.invoke("note-flush-complete", requestId, ok),
  jumpToPaper: (target: unknown) => ipcRenderer.invoke("note-jump", target),
  onJumpToPaper: (cb: (target: unknown) => void) => {
    const fn = (_event: unknown, target: unknown) => cb(target);
    ipcRenderer.on("jump-to-paper", fn);
    return () => ipcRenderer.removeListener("jump-to-paper", fn);
  },
  requestExportCenter: () => ipcRenderer.invoke("open-export-center"),
  onOpenExportCenter: (cb: () => void) => {
    const fn = () => cb();
    ipcRenderer.on("show-export-center", fn);
    return () => ipcRenderer.removeListener("show-export-center", fn);
  },
  loadSecret: () => ipcRenderer.invoke("load-secret"),
  saveSecret: (key: string) => ipcRenderer.invoke("save-secret", key),
  loadSecrets: () => ipcRenderer.invoke("load-secrets"),
  saveSecrets: (keys: unknown) => ipcRenderer.invoke("save-secrets", keys),
  cacheInfo: () => ipcRenderer.invoke("cache-info"),
  clearFileCaches: () => ipcRenderer.invoke("clear-file-caches"),
  llmRequest: (payload: unknown) => ipcRenderer.invoke("llm-request", payload),
  onStream: (cb: (data: unknown) => void) => {
    const h = (_: unknown, d: unknown) => cb(d);
    ipcRenderer.on("llm-stream", h);
    return () => ipcRenderer.removeListener("llm-stream", h);
  },
  cancelRequest: (id: string) => ipcRenderer.invoke("cancel-request", id),
});
