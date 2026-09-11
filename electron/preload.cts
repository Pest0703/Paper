const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("paperTutor", {
  choosePdf: () => ipcRenderer.invoke("choose-pdf"),
  readPdf: (path: string) => ipcRenderer.invoke("read-pdf", path),
  loadState: () => ipcRenderer.invoke("load-state"),
  saveState: (patch: unknown) => ipcRenderer.invoke("save-state", patch),
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
