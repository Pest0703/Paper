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
  onBeforeClose: (cb: () => void) => {
    ipcRenderer.on("flush-notes-before-close", cb);
    return () => ipcRenderer.removeListener("flush-notes-before-close", cb);
  },
  confirmNotesFlushed: () => ipcRenderer.invoke("notes-flushed"),
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
