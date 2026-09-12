import { useMemo, useState } from "react";
import {
  FileArrowUp,
  FolderOpen,
  MagnifyingGlass,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { PaperLibraryItem } from "./types";
import { paperStatusLabel } from "./services/paperLibrary";

export function PaperLibrary({
  papers,
  activeId,
  onOpen,
  onImportPaper,
  onImportFolder,
  onDelete,
  onClose,
}: {
  papers: PaperLibraryItem[];
  activeId?: string;
  onOpen: (paper: PaperLibraryItem) => void;
  onImportPaper: () => void;
  onImportFolder: () => void;
  onDelete: (paper: PaperLibraryItem) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PaperLibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword
      ? papers.filter((paper) =>
          `${paper.name} ${paper.folderName || ""}`
            .toLowerCase()
            .includes(keyword),
        )
      : papers;
  }, [papers, query]);
  return (
    <div className="library-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="paper-library"
        aria-label="论文目录"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="eyebrow">Paper Library</p>
            <h2>论文目录</h2>
          </div>
          <button onClick={onClose} aria-label="关闭论文目录">
            <X />
          </button>
        </header>
        <div className="library-actions">
          <button onClick={onImportPaper}>
            <FileArrowUp /> 导入论文
          </button>
          <button onClick={onImportFolder}>
            <FolderOpen /> 导入文件夹
          </button>
        </div>
        <label className="library-search">
          <MagnifyingGlass />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索论文或文件夹"
            aria-label="搜索论文目录"
          />
        </label>
        <div className="library-list">
          {visible.length ? (
            visible.map((paper) => (
              <div key={paper.id} className={`library-paper-row ${paper.id === activeId ? "active" : ""}`}>
                <button className="library-paper-open" onClick={() => onOpen(paper)}>
                  <strong>{paper.name}</strong>
                  <span><small>{paper.folderName || "单独导入"}</small><i className={paper.status}>{paperStatusLabel(paper.status)}</i></span>
                </button>
                <button className="library-paper-delete" aria-label="从目录删除论文" title="从 PaperTutor 删除" onClick={() => { setDeleteError(""); setPendingDelete(paper); }}><Trash /></button>
              </div>
            ))
          ) : (
            <div className="library-empty">
              <FolderOpen />
              <strong>{query ? "没有匹配的论文" : "论文目录为空"}</strong>
              <span>可导入单篇论文，也可一次登记整个文件夹。</span>
            </div>
          )}
        </div>
        {pendingDelete && (
          <div className="library-delete-backdrop" onMouseDown={(event) => event.stopPropagation()}>
            <section role="dialog" aria-label="确认删除论文">
              <p className="eyebrow">Permanent removal</p>
              <h3>从 PaperTutor 删除这篇论文？</h3>
              <strong>{pendingDelete.name}</strong>
              <p>原始论文文件不会被删除。论文目录记录、解析结果、OCR、书签、AI 缓存、转换中间文件、笔记和笔记图片将永久删除，不保留备份。</p>
              <p>以后再次导入时，将按一篇全新的论文处理。</p>
              {deleteError && <div className="library-delete-error">{deleteError}</div>}
              <div>
                <button disabled={deleting} onClick={() => setPendingDelete(null)}>取消</button>
                <button className="danger" disabled={deleting} onClick={async () => {
                  setDeleting(true); setDeleteError("");
                  try { await onDelete(pendingDelete); setPendingDelete(null); }
                  catch (error) { setDeleteError(error instanceof Error ? error.message : "删除失败"); }
                  finally { setDeleting(false); }
                }}>{deleting ? "正在删除…" : "确认永久删除"}</button>
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
