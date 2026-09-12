import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
import {
  ArrowCounterClockwise,
  ArrowLineDown,
  ArrowUDownLeft,
  ArrowUUpLeft,
  ImageSquare,
  Link as LinkIcon,
  Plus,
  X,
} from "@phosphor-icons/react";
import type { NoteDocument, PaperRecord } from "./types";
import { PaperAnchorNode } from "./noteExtensions";

export type NoteInsertion = {
  id: string;
  text: string;
  kind: "quote" | "ai" | "anchor";
  page: number;
  sectionId?: string;
};
export type NoteEditorHandle = { flush: () => Promise<void> };

export const NoteEditor = forwardRef<
  NoteEditorHandle,
  {
    paper: PaperRecord;
    pending?: NoteInsertion | null;
    onConsumed: () => void;
    onClose: () => void;
    onAnchor: (page: number) => void;
  }
>(function NoteEditor({ paper, pending, onConsumed, onClose, onAnchor }, ref) {
  const [note, setNote] = useState<NoteDocument | null>(null);
  const [saved, setSaved] = useState(true);
  const noteRef = useRef<NoteDocument | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      TableKit.configure({ table: { resizable: true } }),
      Image.configure({ allowBase64: false, inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      PaperAnchorNode,
      Mathematics.configure({ katexOptions: { throwOnError: false } }),
    ],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: () => {
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flush(), 850);
    },
    editorProps: {
      handleClick(view, _position, event) {
        const element = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-paper-anchor]",
        );
        if (element) {
          onAnchor(Number(element.dataset.page || 1));
          return true;
        }
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
          "a[href]",
        );
        if (link) {
          void window.paperTutor.openExternal(link.href);
          return true;
        }
        return false;
      },
      handlePaste(_view, event) {
        const file = [...(event.clipboardData?.files || [])].find((item) =>
          item.type.startsWith("image/"),
        );
        if (!file || !noteRef.current) return false;
        void file.arrayBuffer().then(async (buffer) => {
          const src = await window.paperTutor.noteSaveImage(
            noteRef.current!.id,
            new Uint8Array(buffer),
            file.type,
          );
          editor?.chain().focus().setImage({ src }).run();
        });
        return true;
      },
    },
  });
  async function flush() {
    if (!editor || !noteRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const current = noteRef.current;
    await window.paperTutor.noteSave({
      id: current.id,
      content: editor.getJSON(),
      lastCursor: editor.state.selection.anchor,
      lastScrollTop: scrollRef.current?.scrollTop || 0,
    });
    setSaved(true);
  }
  useImperativeHandle(ref, () => ({ flush }), [editor]);
  useEffect(() => {
    let cancelled = false;
    void window.paperTutor
      .noteOpen(paper.id, paper.profile.overviewTitle || paper.profile.title)
      .then((loaded) => {
        if (cancelled) return;
        noteRef.current = loaded;
        setNote(loaded);
        editor?.commands.setContent(loaded.content);
        requestAnimationFrame(() => {
          if (scrollRef.current)
            scrollRef.current.scrollTop = loaded.lastScrollTop || 0;
          editor?.commands.setTextSelection(
            Math.min(loaded.lastCursor || 1, editor.state.doc.content.size),
          );
        });
      });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [paper.id, editor]);
  useEffect(() => {
    if (!pending || !editor || !note) return;
    const anchor = {
      type: "paperAnchor",
      attrs: {
        paperId: paper.id,
        page: pending.page,
        sectionId: pending.sectionId || "",
        quote: pending.text.slice(0, 500),
      },
    };
    if (pending.kind === "anchor")
      editor.chain().focus().insertContent(anchor).run();
    else
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: pending.kind === "quote" ? "blockquote" : "heading",
            attrs: pending.kind === "ai" ? { level: 3 } : undefined,
            content:
              pending.kind === "ai"
                ? [{ type: "text", text: "AI 辅助解释" }]
                : [{ type: "text", text: pending.text }],
          },
          ...(pending.kind === "ai"
            ? [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: pending.text }],
                },
              ]
            : []),
          { type: "paragraph", content: [anchor] },
        ])
        .run();
    onConsumed();
  }, [pending?.id, editor, note]);
  const chain = () => editor?.chain().focus();
  const ask = (label: string, initial = "") =>
    window.prompt(label, initial)?.trim();
  return (
    <aside className="note-panel" aria-label="论文笔记">
      <header>
        <div>
          <p className="eyebrow">Paper Note</p>
          <h2>{note?.title || "正在加载笔记…"}</h2>
          <small>{saved ? "已自动保存" : "正在保存…"} · 当前论文专属笔记</small>
        </div>
        <button onClick={onClose} aria-label="关闭论文笔记">
          <X />
        </button>
      </header>
      <div className="note-toolbar" aria-label="富文本工具栏">
        <button onClick={() => editor?.commands.undo()} title="撤销">
          <ArrowUUpLeft />
        </button>
        <button onClick={() => editor?.commands.redo()} title="重做">
          <ArrowUDownLeft />
        </button>
        <select
          onChange={(e) => {
            const level = Number(e.target.value);
            if (level)
              chain()
                ?.setHeading({ level: level as 1 | 2 | 3 | 4 })
                .run();
            else chain()?.setParagraph().run();
            e.currentTarget.blur();
          }}
          aria-label="段落样式"
        >
          <option value="0">正文</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
        </select>
        <select
          onChange={(e) => chain()?.setFontFamily(e.target.value).run()}
          aria-label="字体"
        >
          <option value="Microsoft YaHei">微软雅黑</option>
          <option value="SimSun">宋体</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
        </select>
        <select
          onChange={(e) => chain()?.setFontSize(e.target.value).run()}
          aria-label="字号"
        >
          {[12, 14, 16, 18, 20, 24, 28, 32].map((n) => (
            <option key={n} value={`${n}px`}>
              {n}
            </option>
          ))}
        </select>
        <button onClick={() => chain()?.toggleBold().run()}>
          <b>B</b>
        </button>
        <button onClick={() => chain()?.toggleItalic().run()}>
          <i>I</i>
        </button>
        <button onClick={() => chain()?.toggleUnderline().run()}>
          <u>U</u>
        </button>
        <button onClick={() => chain()?.toggleStrike().run()}>
          <s>S</s>
        </button>
        <button onClick={() => chain()?.toggleSuperscript().run()}>x²</button>
        <button onClick={() => chain()?.toggleSubscript().run()}>x₂</button>
        <input
          type="color"
          aria-label="文字颜色"
          onChange={(e) => chain()?.setColor(e.target.value).run()}
        />
        <input
          type="color"
          aria-label="背景填充颜色"
          defaultValue="#e8f1ff"
          onChange={(e) => chain()?.setBackgroundColor(e.target.value).run()}
        />
        <input
          type="color"
          aria-label="高亮颜色"
          defaultValue="#fff59d"
          onChange={(e) =>
            chain()?.toggleHighlight({ color: e.target.value }).run()
          }
        />
        <button onClick={() => chain()?.toggleBulletList().run()}>
          • 列表
        </button>
        <button onClick={() => chain()?.toggleOrderedList().run()}>
          1. 列表
        </button>
        <button onClick={() => chain()?.toggleTaskList().run()}>☑</button>
        <button onClick={() => chain()?.toggleBlockquote().run()}>引用</button>
        <button onClick={() => chain()?.toggleCodeBlock().run()}>代码</button>
        <button onClick={() => chain()?.toggleCode().run()}>行内代码</button>
        <button onClick={() => chain()?.setHorizontalRule().run()}>—</button>
        <button onClick={() => chain()?.setTextAlign("left").run()}>左</button>
        <button onClick={() => chain()?.setTextAlign("center").run()}>
          中
        </button>
        <button onClick={() => chain()?.setTextAlign("right").run()}>右</button>
        <button onClick={() => chain()?.setTextAlign("justify").run()}>
          两端
        </button>
        <button
          onClick={() =>
            chain()
              ?.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          表格
        </button>
        <button onClick={() => chain()?.addRowAfter().run()}>
          <Plus />行
        </button>
        <button onClick={() => chain()?.addColumnAfter().run()}>
          <Plus />列
        </button>
        <button onClick={() => chain()?.deleteRow().run()}>删行</button>
        <button onClick={() => chain()?.deleteColumn().run()}>删列</button>
        <button onClick={() => chain()?.mergeCells().run()}>合并格</button>
        <button onClick={() => chain()?.splitCell().run()}>拆分格</button>
        <button onClick={() => chain()?.sinkListItem("listItem").run()}>
          增加缩进
        </button>
        <button onClick={() => chain()?.liftListItem("listItem").run()}>
          减少缩进
        </button>
        <button
          onClick={async () => {
            if (!note) return;
            const src = await window.paperTutor.noteChooseImage(note.id);
            if (src) chain()?.setImage({ src }).run();
          }}
        >
          <ImageSquare />
          图片
        </button>
        <button
          onClick={() => {
            const url = ask("输入链接地址", "https://");
            if (url) chain()?.setLink({ href: url }).run();
          }}
        >
          <LinkIcon />
          链接
        </button>
        <button
          onClick={() => {
            const latex = ask("输入 LaTeX 公式");
            if (latex)
              chain()
                ?.insertContent({ type: "blockMath", attrs: { latex } })
                .run();
          }}
        >
          块公式
        </button>
        <button
          onClick={() => {
            const latex = ask("输入行内 LaTeX 公式");
            if (latex)
              chain()
                ?.insertContent({ type: "inlineMath", attrs: { latex } })
                .run();
          }}
        >
          行内公式
        </button>
      </div>
      <div className="note-quick-actions">
        <button
          onClick={() =>
            chain()
              ?.insertContent({
                type: "paperAnchor",
                attrs: { paperId: paper.id, page: paper.page },
              })
              .run()
          }
        >
          插入当前位置
        </button>
        <button onClick={() => chain()?.focus("end").run()}>
          <ArrowLineDown />
          继续记录
        </button>
        <button
          onClick={() => {
            editor?.commands.clearContent();
            setSaved(false);
          }}
        >
          <ArrowCounterClockwise />
          清空编辑区
        </button>
      </div>
      <div className="note-scroll" ref={scrollRef}>
        <EditorContent editor={editor} />
      </div>
    </aside>
  );
});
