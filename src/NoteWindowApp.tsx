import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor, type NoteEditorHandle } from "./NoteEditor";
import type { NoteInsertRequest } from "./types";

export function NoteWindowApp() {
  const editorRef = useRef<NoteEditorHandle>(null);
  const work = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const enqueue = useCallback((action: () => Promise<unknown>) => {
    work.current = work.current.catch(() => undefined).then(async () => {
      try { await action(); setError(""); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "笔记操作失败"); }
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    const offContext = window.paperTutor.onNoteContext((context) => enqueue(async () => { await editorRef.current?.openContext(context); }));
    const offInsert = window.paperTutor.onNoteInsertion((request: NoteInsertRequest) => {
      document.documentElement.dataset.lastInsertion = request.insertion.id;
      enqueue(async () => {
      const editor=editorRef.current; if(!editor)return;
      await editor.openContext(request.context); await editor.insert(request.insertion); await editor.flush();
      const latest=await window.paperTutor.getNoteContext();
      if(latest&&latest.paperId!==request.context.paperId)await editor.openContext(latest);
      });
    });
    const offFlush = window.paperTutor.onNoteFlushRequest((requestId) => enqueue(async () => {
      try{await editorRef.current?.flush();await window.paperTutor.confirmNoteFlush(requestId,true);}
      catch{await window.paperTutor.confirmNoteFlush(requestId,false);}
    }));
    void window.paperTutor.noteWindowReady();
    return () => {offContext();offInsert();offFlush();};
  }, [ready,enqueue]);
  return <><NoteEditor ref={editorRef}
    onReady={() => {if(!ready){document.documentElement.dataset.tiptapReady=String(Math.round(performance.now()));if(import.meta.env.DEV)console.info(`[Note Performance] Tiptap Ready ${Math.round(performance.now())} ms`);setReady(true);}}}
    onLoaded={() => {document.documentElement.dataset.noteLoaded=String(Math.round(performance.now()));if(import.meta.env.DEV)console.info(`[Note Performance] Note Loaded ${Math.round(performance.now())} ms`);}}
    onContext={(value) => {document.title=`PaperTutor Notes — ${value.title}`;}}
    onAnchor={(target) => void window.paperTutor.jumpToPaper(target)}
    onExport={() => void window.paperTutor.requestExportCenter()} />
    {error && <div className="note-operation-error">{error}</div>}</>;
}
