import { useEffect, useMemo, useState } from "react";
import { ArrowsDownUp, FileDoc, X } from "@phosphor-icons/react";
import type { PaperLibraryItem } from "./types";

export function ExportCenter({
  papers,
  onClose,
}: {
  papers: PaperLibraryItem[];
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"merge" | "separate">("merge");
  const [toc, setToc] = useState(true);
  const [pageBreak, setPageBreak] = useState(true);
  const [progress, setProgress] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    void window.paperTutor.noteList().then(setNotes);
    return window.paperTutor.onExportProgress((value) =>
      setProgress(`正在导出 ${value.current} / ${value.total}`),
    );
  }, []);
  const rows = useMemo(
    () =>
      papers.map((paper) => ({
        ...paper,
        note: notes.find((note) => note.paperId === paper.id),
      })),
    [papers, notes],
  );
  const ordered = selected
    .map((id) => rows.find((row) => row.id === id)!)
    .filter(Boolean);
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const moveBefore = (source: string, target: string) =>
    setSelected((current) => {
      const next = current.filter((id) => id !== source),
        index = next.indexOf(target);
      next.splice(index < 0 ? next.length : index, 0, source);
      return next;
    });
  return (
    <div className="export-backdrop" onMouseDown={onClose}>
      <section
        className="export-center"
        aria-label="导出笔记"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Export Center</p>
            <h2>导出笔记</h2>
          </div>
          <button onClick={onClose} aria-label="关闭导出中心">
            <X />
          </button>
        </header>
        <div className="export-select-actions">
          <button
            onClick={() =>
              setSelected(rows.filter((row) => row.note).map((row) => row.id))
            }
          >
            全选有笔记论文
          </button>
          <button onClick={() => setSelected([])}>全不选</button>
        </div>
        <div className="export-paper-list">
          {rows.map((row) => (
            <label key={row.id} className={!row.note ? "disabled" : ""}>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                disabled={!row.note}
                onChange={() => toggle(row.id)}
              />
              <span>
                <strong>{row.title || row.name}</strong>
                <small>
                  {row.note
                    ? `最近编辑：${new Date(row.note.updatedAt).toLocaleString()}`
                    : "无笔记"}
                </small>
              </span>
            </label>
          ))}
        </div>
        {ordered.length > 0 && (
          <div className="export-order">
            <h3>导出顺序</h3>
            {ordered.map((row, index) => (
              <div
                key={row.id}
                draggable
                onDragStart={() => setDragging(row.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragging) moveBefore(dragging, row.id);
                  setDragging(null);
                }}
              >
                <ArrowsDownUp />
                <b>{index + 1}</b>
                <span>{row.title || row.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="export-options">
          <label>
            <input
              type="radio"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
            />
            合并成一个 DOCX
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "separate"}
              onChange={() => setMode("separate")}
            />
            每篇分别导出 DOCX
          </label>
          {mode === "merge" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={pageBreak}
                  onChange={(e) => setPageBreak(e.target.checked)}
                />
                每篇论文从新页开始
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={toc}
                  onChange={(e) => setToc(e.target.checked)}
                />
                生成 Word 目录域
              </label>
            </>
          )}
        </div>
        <div className="export-preview">
          <strong>将导出：{ordered.length} 篇论文</strong>
          <span>模式：{mode === "merge" ? "合并 DOCX" : "分别导出 DOCX"}</span>
          {progress && <em>{progress}</em>}
        </div>
        <button
          className="export-submit"
          disabled={!selected.length}
          onClick={async () => {
            setProgress("正在准备导出…");
            const result = await window.paperTutor.exportNotes({
              paperIds: selected,
              mode,
              options: { toc, pageBreak },
            });
            setProgress(
              result.canceled
                ? "已取消"
                : `导出完成：${result.files?.length || 0} 个文件`,
            );
          }}
        >
          <FileDoc />
          开始导出
        </button>
      </section>
    </div>
  );
}
