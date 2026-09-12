import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Mathematics from "@tiptap/extension-mathematics";
import "katex/dist/katex.min.css";
import { ArrowCounterClockwise, ArrowLineDown, ArrowUDownLeft, ArrowUUpLeft, Export, ImageSquare, Link as LinkIcon, Plus } from "@phosphor-icons/react";
import type { NoteDocument, NoteInsertion, NotePaperContext } from "./types";
import { PaperAnchorNode } from "./noteExtensions";

export type SaveStatus = "saved" | "saving" | "error";
export type NoteEditorHandle = {
  flush: () => Promise<void>;
  openContext: (context: NotePaperContext) => Promise<boolean>;
  insert: (insertion: NoteInsertion) => Promise<boolean>;
};

export const NoteEditor = forwardRef<NoteEditorHandle, {
  onReady: () => void;
  onLoaded: () => void;
  onContext: (context: NotePaperContext) => void;
  onAnchor: (target: { paperId: string; page: number }) => void;
  onExport: () => void;
}>(function NoteEditor({ onReady, onLoaded, onContext, onAnchor, onExport }, ref) {
  const [context, setContext] = useState<NotePaperContext | null>(null);
  const [note, setNote] = useState<NoteDocument | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const noteRef = useRef<NoteDocument | null>(null);
  const contextRef = useRef<NotePaperContext | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }), Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }), TextStyleKit,
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: false, inline: false }), TaskList,
      TaskItem.configure({ nested: true }), Subscript, Superscript,
      PaperAnchorNode, Mathematics.configure({ katexOptions: { throwOnError: false } }),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: () => {
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush().catch(() => {}), 850);
    },
    editorProps: {
      handleClick(_view, _position, event) {
        const element = (event.target as HTMLElement).closest<HTMLElement>("[data-paper-anchor]");
        if (element) {
          onAnchor({ paperId: element.dataset.paperId || contextRef.current?.paperId || "", page: Number(element.dataset.page || 1) });
          return true;
        }
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        if (link) { void window.paperTutor.openExternal(link.href); return true; }
        return false;
      },
      handlePaste(_view, event) {
        const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
        if (!file || !noteRef.current) return false;
        void file.arrayBuffer().then(async (buffer) => {
          const src = await window.paperTutor.noteSaveImage(noteRef.current!.id, new Uint8Array(buffer), file.type);
          editor?.chain().focus().setImage({ src }).run();
        });
        return true;
      },
    },
  });

  async function flush() {
    if (!editor || !noteRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    try {
      await window.paperTutor.noteSave({ id: noteRef.current.id, content: editor.getJSON(), lastCursor: editor.state.selection.anchor, lastScrollTop: scrollRef.current?.scrollTop || 0 });
      setSaveStatus("saved"); setSaveError("");
    } catch (error) {
      setSaveStatus("error"); setSaveError(error instanceof Error ? error.message : "SQLite 保存失败"); throw error;
    }
  }
  function serialized<T>(action: () => Promise<T>) {
    const next = queue.current.catch(() => undefined).then(action);
    queue.current = next;
    return next;
  }
  function openContext(next: NotePaperContext) {
    return serialized(async () => {
      if (!editor) return false;
      if (contextRef.current?.paperId === next.paperId) { contextRef.current = next; setContext(next); onContext(next); return true; }
      if (noteRef.current) await flush();
      const token = ++generation.current;
      contextRef.current = next; setContext(next); setNote(null); onContext(next);
      const loaded = await window.paperTutor.noteOpen(next.paperId, next.title);
      if (token !== generation.current) return false;
      noteRef.current = loaded; setNote(loaded); editor.commands.setContent(loaded.content);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = loaded.lastScrollTop || 0;
        const cursor = loaded.lastCursor > 0 ? loaded.lastCursor : editor.state.doc.content.size;
        editor.commands.setTextSelection(Math.min(cursor, editor.state.doc.content.size));
      });
      setSaveStatus("saved"); onLoaded(); return true;
    });
  }
  function insert(insertion: NoteInsertion) {
    return serialized(async () => {
      if (!editor || !noteRef.current || contextRef.current?.paperId !== insertion.paperId) throw new Error("笔记尚未切换到插入内容所属论文");
      const anchor = { type: "paperAnchor", attrs: { paperId: insertion.paperId, page: insertion.page, sectionId: insertion.sectionId || "", quote: insertion.text.slice(0, 500) } };
      if (insertion.kind === "anchor") editor.chain().focus().insertContent(anchor).run();
      else editor.chain().focus().insertContent([
        insertion.kind === "quote" ? { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: insertion.text }] }] } : { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "AI 辅助解释" }] },
        ...(insertion.kind === "ai" ? [{ type: "paragraph", content: [{ type: "text", text: insertion.text }] }] : []),
        { type: "paragraph", content: [anchor] },
      ]).run();
      return true;
    });
  }
  useImperativeHandle(ref, () => ({ flush, openContext, insert }), [editor]);
  useEffect(() => { if (editor) onReady(); }, [editor, onReady]);
  const chain = () => editor?.chain().focus();
  const ask = (label: string, initial = "") => window.prompt(label, initial)?.trim();
  const active = (name: string, attrs?: Record<string, unknown>) => editor?.isActive(name, attrs) ? "active" : "";
  const heading = [1, 2, 3, 4].find((level) => editor?.isActive("heading", { level })) || 0;
  if (!context) return <main className="note-window-empty"><div><p className="eyebrow">PaperTutor Notes</p><h1>请先在主窗口打开一篇论文</h1><p>打开论文后，点击“论文笔记”或“加入笔记”。</p></div></main>;
  return <main className="note-window-editor" aria-label="论文笔记">
    <header className="note-window-header"><div><p className="eyebrow">PaperTutor Notes</p><h1>{note?.title || context.title}</h1><small>主窗口当前阅读位置：P{context.page}{context.sectionId ? ` · §${context.sectionId}` : ""}</small></div><div className={`note-save-status ${saveStatus}`}>{saveStatus === "saved" ? "已保存" : saveStatus === "saving" ? "正在保存…" : "保存失败"}{saveStatus === "error" && <button onClick={() => void flush().catch(() => {})}>重新保存</button>}</div></header>
    {saveError && <div className="note-save-error">保存失败，内容仍保留在编辑器中。{saveError}</div>}
    <div className="note-toolbar" aria-label="富文本工具栏">
      <div className="note-tool-group"><span>历史</span><button onClick={() => editor?.commands.undo()} title="撤销"><ArrowUUpLeft /></button><button onClick={() => editor?.commands.redo()} title="重做"><ArrowUDownLeft /></button></div>
      <details open className="note-tool-group"><summary>样式</summary><div><select value={heading} onChange={(e) => { const level=Number(e.target.value); level ? chain()?.setHeading({level:level as 1|2|3|4}).run() : chain()?.setParagraph().run(); }} aria-label="段落样式"><option value="0">正文</option>{[1,2,3,4].map(n=><option key={n} value={n}>Heading {n}</option>)}</select><button className={active("bold")} onClick={() => chain()?.toggleBold().run()}><b>B</b></button><button className={active("italic")} onClick={() => chain()?.toggleItalic().run()}><i>I</i></button><button className={active("underline")} onClick={() => chain()?.toggleUnderline().run()}><u>U</u></button><button className={active("strike")} onClick={() => chain()?.toggleStrike().run()}><s>S</s></button><button className={active("superscript")} onClick={() => chain()?.toggleSuperscript().run()}>x²</button><button className={active("subscript")} onClick={() => chain()?.toggleSubscript().run()}>x₂</button></div></details>
      <details className="note-tool-group"><summary>字体</summary><div><select onChange={(e) => chain()?.setFontFamily(e.target.value).run()} aria-label="字体"><option value="Microsoft YaHei">微软雅黑</option><option value="SimSun">宋体</option><option value="Times New Roman">Times New Roman</option><option value="Arial">Arial</option></select><select onChange={(e) => chain()?.setFontSize(e.target.value).run()} aria-label="字号">{[12,14,16,18,20,24,28,32].map(n=><option key={n} value={`${n}px`}>{n}</option>)}</select><label>字<input type="color" aria-label="文字颜色" onChange={(e) => chain()?.setColor(e.target.value).run()} /></label><label>底<input type="color" aria-label="背景填充颜色" defaultValue="#e8f1ff" onChange={(e) => chain()?.setBackgroundColor(e.target.value).run()} /></label><label>亮<input type="color" aria-label="高亮颜色" defaultValue="#fff59d" onChange={(e) => chain()?.toggleHighlight({color:e.target.value}).run()} /></label></div></details>
      <details className="note-tool-group"><summary>段落</summary><div><button className={active("bulletList")} onClick={() => chain()?.toggleBulletList().run()}>• 列表</button><button className={active("orderedList")} onClick={() => chain()?.toggleOrderedList().run()}>1. 列表</button><button className={active("taskList")} onClick={() => chain()?.toggleTaskList().run()}>☑</button><button className={active("blockquote")} onClick={() => chain()?.toggleBlockquote().run()}>引用</button><button onClick={() => chain()?.setTextAlign("left").run()}>左</button><button onClick={() => chain()?.setTextAlign("center").run()}>中</button><button onClick={() => chain()?.setTextAlign("right").run()}>右</button><button onClick={() => chain()?.setTextAlign("justify").run()}>两端</button><button onClick={() => chain()?.sinkListItem("listItem").run()}>缩进+</button><button onClick={() => chain()?.liftListItem("listItem").run()}>缩进−</button></div></details>
      <details className="note-tool-group"><summary>插入</summary><div><button onClick={() => chain()?.insertTable({rows:3,cols:3,withHeaderRow:true}).run()}>表格</button><button onClick={() => chain()?.addRowAfter().run()}><Plus />行</button><button onClick={() => chain()?.addColumnAfter().run()}><Plus />列</button><button onClick={() => chain()?.deleteRow().run()}>删行</button><button onClick={() => chain()?.deleteColumn().run()}>删列</button><button onClick={() => chain()?.mergeCells().run()}>合并格</button><button onClick={() => chain()?.splitCell().run()}>拆分格</button><button onClick={async()=>{if(!note)return;const src=await window.paperTutor.noteChooseImage(note.id);if(src)chain()?.setImage({src}).run();}}><ImageSquare />图片</button><button onClick={()=>{const url=ask("输入链接地址","https://");if(url)chain()?.setLink({href:url}).run();}}><LinkIcon />链接</button><button onClick={()=>{const latex=ask("输入 LaTeX 公式");if(latex)chain()?.insertContent({type:"blockMath",attrs:{latex}}).run();}}>块公式</button><button onClick={()=>{const latex=ask("输入行内 LaTeX 公式");if(latex)chain()?.insertContent({type:"inlineMath",attrs:{latex}}).run();}}>行内公式</button><button onClick={() => chain()?.toggleCodeBlock().run()}>代码块</button><button onClick={() => chain()?.toggleCode().run()}>行内代码</button><button onClick={() => chain()?.setHorizontalRule().run()}>分隔线</button></div></details>
    </div>
    <div className="note-quick-actions"><button onClick={() => chain()?.insertContent({type:"paperAnchor",attrs:{paperId:context.paperId,page:context.page,sectionId:context.sectionId||""}}).run()}>插入当前页</button><button onClick={() => {chain()?.focus("end").run();if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;}}><ArrowLineDown />继续记录</button><button onClick={onExport}><Export />导出</button><button className="danger" onClick={() => setConfirmClear(true)}><ArrowCounterClockwise />清空编辑区</button></div>
    <div className="note-scroll" ref={scrollRef}><EditorContent editor={editor} /></div>
    {confirmClear && <div className="note-confirm"><section role="dialog" aria-label="确认清空当前论文笔记"><h2>确认清空当前论文笔记？</h2><p>该操作会删除当前笔记全部正文。</p><div><button onClick={() => setConfirmClear(false)}>取消</button><button className="danger" onClick={() => {editor?.commands.clearContent();setSaveStatus("saving");setConfirmClear(false);}}>确认清空</button></div></section></div>}
  </main>;
});
