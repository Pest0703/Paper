export type Sentence = {
  id: string;
  text: string;
  page: number;
  paragraphId: string;
  sectionId: string;
  prev?: string;
  next?: string;
};
export type Paragraph = {
  id: string;
  text: string;
  page: number;
  sectionId: string;
  sentences: Sentence[];
  role?: string;
  source?: "pdf-native" | "ocr";
};
export type Section = {
  id: string;
  title: string;
  level: number;
  page: number;
  summary: string;
  paragraphs: Paragraph[];
};
export type PaperProfile = {
  title: string;
  overviewTitle?: string;
  authors: string;
  abstract: string;
  overviewAbstract?: string;
  overviewSectionTitles?: Record<string, string>;
  researchQuestion: string;
  contributions: string[];
  methods: string[];
  keywords: string[];
  sections: Section[];
  paperOneLine?: string;
  coreMethod?: string;
  terminologyMap?: Record<string, string>;
};
export type Bookmark = {
  id: string;
  name: string;
  page: number;
  scrollTop: number;
  createdAt: string;
};
export type PaperRecord = {
  id: string;
  name: string;
  path: string;
  size: number;
  fingerprint: string;
  profile: PaperProfile;
  importedAt: string;
  page: number;
  scale: number;
  scrollTop: number;
  bookmarks?: Bookmark[];
  status: "indexed" | "ready" | "parsing" | "error";
  folderName?: string;
};
export type PaperLibraryItem = Omit<PaperRecord, "profile" | "bookmarks"> & {
  title?: string;
  authors?: string;
  bookmarkCount?: number;
  profileStatus: "missing" | "ready" | "stale";
  lastOpenedAt?: string;
};
export type PaperFullData = {
  profile: PaperProfile;
  bookmarks: Bookmark[];
  schemaVersion: 1;
};
export type NoteDocument = {
  id: string;
  paperId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastScrollTop: number;
  lastCursor: number;
  schemaVersion: number;
  content: any;
};
export type NotePaperContext = {
  paperId: string;
  title: string;
  page: number;
  sectionId?: string;
};
export type NoteInsertion = {
  id: string;
  paperId: string;
  text: string;
  kind: "quote" | "ai" | "anchor";
  page: number;
  sectionId?: string;
};
export type NoteInsertRequest = {
  context: NotePaperContext;
  insertion: NoteInsertion;
};
export type OcrMode = "disabled" | "api";
export type Settings = {
  provider: string;
  textBaseUrl: string;
  textModel: string;
  visionBaseUrl: string;
  visionModel: string;
  ocrMode: OcrMode;
  ocrBaseUrl: string;
  ocrModel: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
  timeout: number;
};
export type ApiSecrets = { text: string; vision: string; ocr: string };
declare global {
  interface Window {
    paperTutor: {
      choosePdf(): Promise<string | null>;
      choosePaperFolder(): Promise<
        Array<{ path: string; name: string; size: number; folderName: string }>
      >;
      readPdf(path: string): Promise<{
        bytes: ArrayBuffer;
        name: string;
        path: string;
        size: number;
      }>;
      loadState(): Promise<any>;
      saveState(patch: any): Promise<boolean>;
      loadPaperData(id: string): Promise<PaperFullData | null>;
      savePaperData(id: string, data: PaperFullData): Promise<boolean>;
      deletePaper(id: string): Promise<{
        deleted: boolean;
        noteDeleted: boolean;
        conversionFilesDeleted: number;
      }>;
      noteList(): Promise<any[]>;
      noteOpen(paperId: string, title: string): Promise<NoteDocument>;
      noteSave(note: Partial<NoteDocument> & { id: string }): Promise<boolean>;
      openExternal(url: string): Promise<void>;
      noteChooseImage(noteId: string): Promise<string | null>;
      noteSaveImage(
        noteId: string,
        bytes: Uint8Array,
        mime: string,
      ): Promise<string>;
      exportNotes(
        payload: any,
      ): Promise<{ canceled: boolean; files?: string[] }>;
      onExportProgress(cb: (data: any) => void): () => void;
      openNoteWindow(context: NotePaperContext): Promise<boolean>;
      updateNoteContext(context: NotePaperContext): Promise<boolean>;
      insertIntoNote(request: NoteInsertRequest): Promise<boolean>;
      noteWindowReady(): Promise<boolean>;
      getNoteContext(): Promise<NotePaperContext | null>;
      onNoteContext(cb: (context: NotePaperContext) => void): () => void;
      onNoteInsertion(cb: (request: NoteInsertRequest) => void): () => void;
      onNoteFlushRequest(cb: (requestId: string) => void): () => void;
      confirmNoteFlush(requestId: string, ok: boolean): Promise<boolean>;
      jumpToPaper(target: { paperId: string; page: number }): Promise<boolean>;
      onJumpToPaper(cb: (target: { paperId: string; page: number }) => void): () => void;
      requestExportCenter(): Promise<boolean>;
      onOpenExportCenter(cb: () => void): () => void;
      loadSecret(): Promise<string>;
      saveSecret(key: string): Promise<boolean>;
      loadSecrets(): Promise<ApiSecrets>;
      saveSecrets(keys: ApiSecrets): Promise<boolean>;
      cacheInfo(): Promise<any>;
      clearFileCaches(): Promise<any>;
      llmRequest(payload: any): Promise<any>;
      cancelRequest(id: string): Promise<boolean>;
      onStream(cb: (d: any) => void): () => void;
    };
  }
}
